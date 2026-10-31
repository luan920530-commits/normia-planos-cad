<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Rejilla de cálculo del plano.
 *
 * Convierte el lienzo en celdas cuadradas, bloquea los muros con su holgura,
 * libera los vanos de las puertas y separa el exterior del piso útil. La usan
 * el auditor de evacuación y el cálculo de cobertura de extintores para que
 * ambos midan sobre el mismo espacio libre.
 */
final class PlanGrid
{
    /**
     * @param array $design   Documento del plano (canvas, elementos, capas).
     * @param array $walls    Muros con `points` absolutos y `stroke`.
     * @param array $doors    Puertas con `opening` (dos puntos del vano).
     * @param array $criteria Criterios con `grid.cellCm`, `grid.wallClearanceCm` y `grid.maxCells`.
     *
     * @return array{
     *   width: float, height: float, cell: float, nx: int, ny: int,
     *   clearance: float, cellM: float, cellAreaM2: float,
     *   blocked: array<int,bool>, exterior: array<int,bool>,
     *   freeAreaM2: float, exteriorAreaM2: float
     * }
     */
    public static function build(array $design, array $walls, array $doors, array $criteria): array
    {
        $canvas = $design['canvas'];
        $width = (float) $canvas['width'];
        $height = (float) $canvas['height'];
        $cmPerUnit = self::cmPerUnit((string) $canvas['unit']);
        $cellCm = max(5.0, (float) $criteria['grid']['cellCm']);
        $cell = max(1.0, $cellCm / $cmPerUnit);
        $nx = max(1, (int) ceil($width / $cell));
        $ny = max(1, (int) ceil($height / $cell));
        $maxCells = max(4000, (int) $criteria['grid']['maxCells']);
        while ($nx * $ny > $maxCells) {
            $cell *= 1.5;
            $nx = max(1, (int) ceil($width / $cell));
            $ny = max(1, (int) ceil($height / $cell));
        }
        $metersPerUnit = $cmPerUnit / 100;
        $cellM = $cell * $metersPerUnit;
        $cellAreaM2 = $cellM * $cellM;

        $blocked = array_fill(0, $nx * $ny, false);
        $clearance = max(0.0, (float) $criteria['grid']['wallClearanceCm'] / $cmPerUnit);
        $index = static fn (int $ix, int $iy): int => $iy * $nx + $ix;

        // Muros: se bloquean las celdas cuyo centro cae dentro de medio trazo
        // más la holgura y medio lado de celda. El medio lado evita que un muro
        // fino caiga justo entre dos centros de celda y desaparezca del cálculo.
        foreach ($walls as $wall) {
            $reach = $wall['stroke'] / 2 + $clearance + $cell * 0.5;
            foreach ($wall['points'] as $i => $point) {
                if ($i === 0) {
                    continue;
                }
                $a = $wall['points'][$i - 1];
                $b = $point;
                $margin = $reach + $cell;
                $x0 = max(0, (int) floor((min($a['x'], $b['x']) - $margin) / $cell));
                $x1 = min($nx - 1, (int) ceil((max($a['x'], $b['x']) + $margin) / $cell));
                $y0 = max(0, (int) floor((min($a['y'], $b['y']) - $margin) / $cell));
                $y1 = min($ny - 1, (int) ceil((max($a['y'], $b['y']) + $margin) / $cell));
                for ($iy = $y0; $iy <= $y1; $iy += 1) {
                    for ($ix = $x0; $ix <= $x1; $ix += 1) {
                        $center = self::cellCenter($ix, $iy, $cell, $width, $height);
                        if (self::distanceToSegment($center, $a, $b) <= $reach) {
                            $blocked[$index($ix, $iy)] = true;
                        }
                    }
                }
            }
        }

        // Vanos: cada puerta libera el tramo que ocupa sobre su muro. Así el
        // análisis no confunde una puerta con una pared cerrada.
        $openingBand = max($clearance * 2 + $cell, $cell * 0.75);
        $doorCells = [];
        foreach ($doors as $door) {
            $a = $door['opening'][0];
            $b = $door['opening'][1];
            $margin = $openingBand + $cell;
            $x0 = max(0, (int) floor((min($a['x'], $b['x']) - $margin) / $cell));
            $x1 = min($nx - 1, (int) ceil((max($a['x'], $b['x']) + $margin) / $cell));
            $y0 = max(0, (int) floor((min($a['y'], $b['y']) - $margin) / $cell));
            $y1 = min($ny - 1, (int) ceil((max($a['y'], $b['y']) + $margin) / $cell));
            for ($iy = $y0; $iy <= $y1; $iy += 1) {
                for ($ix = $x0; $ix <= $x1; $ix += 1) {
                    $center = self::cellCenter($ix, $iy, $cell, $width, $height);
                    if (self::distanceToSegment($center, $a, $b) <= $openingBand) {
                        $blocked[$index($ix, $iy)] = false;
                        $doorCells[$index($ix, $iy)] = true;
                    }
                }
            }
        }

        $freeCells = 0;
        $freeAreaM2 = 0.0;
        foreach ($blocked as $isBlocked) {
            if (!$isBlocked) {
                $freeCells += 1;
                $freeAreaM2 += $cellAreaM2;
            }
        }

        // Exterior: se inunda el espacio libre desde el borde del lienzo con los
        // vanos cerrados. Esa superficie no forma parte del piso, así que no
        // cuenta como área útil. Solo se descuenta cuando el recinto está
        // cerrado y queda interior suficiente; en un plano sin cerramiento se
        // analiza el lienzo completo.
        $sealed = $blocked;
        foreach ($doorCells as $doorIndex => $opened) {
            $sealed[$doorIndex] = true;
        }
        $exterior = array_fill(0, $nx * $ny, false);
        $stack = [];
        for ($ix = 0; $ix < $nx; $ix += 1) {
            foreach ([[$ix, 0], [$ix, $ny - 1]] as [$bx, $by]) {
                $border = $index($bx, $by);
                if (!$sealed[$border] && !$exterior[$border]) {
                    $exterior[$border] = true;
                    $stack[] = $border;
                }
            }
        }
        for ($iy = 1; $iy < $ny - 1; $iy += 1) {
            foreach ([0, $nx - 1] as $bx) {
                $border = $index($bx, $iy);
                if (!$sealed[$border] && !$exterior[$border]) {
                    $exterior[$border] = true;
                    $stack[] = $border;
                }
            }
        }
        while ($stack !== []) {
            $current = array_pop($stack);
            $ix = $current % $nx;
            $iy = intdiv($current, $nx);
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $jx = $ix + $dx;
                $jy = $iy + $dy;
                if ($jx < 0 || $jy < 0 || $jx >= $nx || $jy >= $ny) {
                    continue;
                }
                $next = $index($jx, $jy);
                if ($sealed[$next] || $exterior[$next]) {
                    continue;
                }
                $exterior[$next] = true;
                $stack[] = $next;
            }
        }
        unset($sealed, $stack);
        $exteriorCells = 0;
        foreach ($exterior as $isOutside) {
            if ($isOutside) {
                $exteriorCells += 1;
            }
        }
        $interiorCells = $freeCells - $exteriorCells;
        if ($exteriorCells === 0 || $interiorCells < max(1, (int) ceil($freeCells * 0.2))) {
            $exterior = array_fill(0, $nx * $ny, false);
            $exteriorCells = 0;
        }
        $exteriorAreaM2 = $exteriorCells * $cellAreaM2;
        $freeAreaM2 = ($freeCells - $exteriorCells) * $cellAreaM2;

        return [
            'width' => $width,
            'height' => $height,
            'cell' => $cell,
            'nx' => $nx,
            'ny' => $ny,
            'clearance' => $clearance,
            'cellM' => $cellM,
            'cellAreaM2' => $cellAreaM2,
            'blocked' => $blocked,
            'exterior' => $exterior,
            'freeAreaM2' => $freeAreaM2,
            'exteriorAreaM2' => $exteriorAreaM2,
        ];
    }

    /**
     * Vano de una puerta: el borde inferior de su caja, que es donde el
     * renderizador dibuja la hoja y donde debe abrirse el muro.
     */
    public static function doorOpening(array $element): array
    {
        $x = (float) $element['x'];
        $y = (float) $element['y'];
        $w = (float) $element['w'];
        $h = (float) $element['h'];
        $edge = $y + $h;
        return [
            ['x' => $x, 'y' => $edge],
            ['x' => $x + $w, 'y' => $edge],
        ];
    }

    /** Puntos absolutos de un trazo, aplicando su rotación como el renderizador. */
    public static function visualPoints(array $element): array
    {
        $points = $element['points'] ?? null;
        if (!is_array($points) || count($points) < 2) {
            $points = [
                ['x' => 0, 'y' => 0],
                ['x' => (float) $element['w'], 'y' => 0],
            ];
        }
        $x = (float) $element['x'];
        $y = (float) $element['y'];
        $cx = $x + (float) $element['w'] / 2;
        $cy = $y + (float) $element['h'] / 2;
        $degrees = (float) ($element['rotation'] ?? 0);
        $absolute = [];
        foreach ($points as $point) {
            $absolute[] = ['x' => $x + (float) $point['x'], 'y' => $y + (float) $point['y']];
        }
        if (abs($degrees) < 0.0001) {
            return $absolute;
        }
        $angle = deg2rad($degrees);
        $cos = cos($angle);
        $sin = sin($angle);
        return array_map(static function (array $point) use ($cx, $cy, $cos, $sin): array {
            $dx = $point['x'] - $cx;
            $dy = $point['y'] - $cy;
            return ['x' => $cx + $dx * $cos - $dy * $sin, 'y' => $cy + $dx * $sin + $dy * $cos];
        }, $absolute);
    }

    /** Centro de la celda en unidades del lienzo. */
    public static function cellCenter(int $ix, int $iy, float $cell, float $width, float $height): array
    {
        return [
            'x' => min($width, ($ix + 0.5) * $cell),
            'y' => min($height, ($iy + 0.5) * $cell),
        ];
    }

    /** Distancia de un punto a un segmento, en unidades del lienzo. */
    public static function distanceToSegment(array $p, array $a, array $b): float
    {
        $dx = (float) $b['x'] - (float) $a['x'];
        $dy = (float) $b['y'] - (float) $a['y'];
        if ($dx === 0.0 && $dy === 0.0) {
            return self::distance($p, $a);
        }
        $t = (((float) $p['x'] - (float) $a['x']) * $dx + ((float) $p['y'] - (float) $a['y']) * $dy) / ($dx * $dx + $dy * $dy);
        $t = max(0.0, min(1.0, $t));
        return self::distance($p, ['x' => $a['x'] + $t * $dx, 'y' => $a['y'] + $t * $dy]);
    }

    public static function distance(array $a, array $b): float
    {
        return hypot((float) $a['x'] - (float) $b['x'], (float) $a['y'] - (float) $b['y']);
    }

    public static function cmPerUnit(string $unit): float
    {
        return match ($unit) {
            'm' => 100.0,
            'mm' => 0.1,
            default => 1.0,
        };
    }
}
