<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Geometría de trazos con curvas.
 *
 * Un tramo curvo se guarda como un arco de tres puntos: inicio, punto de paso
 * y fin. Aquí vive el aplanado que comparten el auditor, la cobertura de
 * extintores, la medición y la exportación: la misma tolerancia que usa el
 * lienzo en JavaScript, de modo que un muro curvo separa los mismos recintos
 * en pantalla y en el servidor.
 *
 * La desviación de cada cuerda no supera la tolerancia declarada (0,5 cm del
 * plano), por debajo del umbral de 2 cm que exige la revisión del plano.
 */
final class PathGeometry
{
    public const TOLERANCE_CM = 0.5;

    private const MAX_STEPS = 720;

    /** Tolerancia en unidades del lienzo para la unidad declarada. */
    public static function tolerance(string $unit): float
    {
        return self::TOLERANCE_CM / PlanGrid::cmPerUnit($unit);
    }

    public static function hasCurves(?array $curves): bool
    {
        if (!is_array($curves)) {
            return false;
        }
        foreach ($curves as $curve) {
            if (is_array($curve) && ($curve['kind'] ?? null) === 'arc' && is_array($curve['through'] ?? null)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Círculo que pasa por tres puntos y arco dirigido de A a B pasando por el
     * punto de paso. Devuelve `null` si el tramo es recto o degenerado.
     *
     * @param array{x:float|int,y:float|int}|null $curve
     * @param array{x:float|int,y:float|int} $a
     * @param array{x:float|int,y:float|int} $b
     *
     * @return array{cx:float,cy:float,r:float,start:float,sweep:float,direction:int,large:bool,length:float,sagitta:float}|null
     */
    public static function arc(?array $curve, array $a, array $b): ?array
    {
        if ($curve === null || ($curve['kind'] ?? null) !== 'arc' || !is_array($curve['through'] ?? null)) {
            return null;
        }
        $through = $curve['through'];
        $ax = (float) $a['x'];
        $ay = (float) $a['y'];
        $tx = (float) $through['x'];
        $ty = (float) $through['y'];
        $bx = (float) $b['x'];
        $by = (float) $b['y'];
        if (hypot($bx - $ax, $by - $ay) < 1e-6) {
            return null;
        }
        $d = 2 * ($ax * ($ty - $by) + $tx * ($by - $ay) + $bx * ($ay - $ty));
        if (abs($d) < 1e-7) {
            return null;
        }
        $a2 = $ax * $ax + $ay * $ay;
        $t2 = $tx * $tx + $ty * $ty;
        $b2 = $bx * $bx + $by * $by;
        $cx = ($a2 * ($ty - $by) + $t2 * ($by - $ay) + $b2 * ($ay - $ty)) / $d;
        $cy = ($a2 * ($bx - $tx) + $t2 * ($ax - $bx) + $b2 * ($tx - $ax)) / $d;
        $r = hypot($ax - $cx, $ay - $cy);
        if (!is_finite($cx) || !is_finite($cy) || !is_finite($r) || $r > 5e6) {
            return null;
        }
        $start = atan2($ay - $cy, $ax - $cx);
        $end = atan2($by - $cy, $bx - $cx);
        $middle = atan2($ty - $cy, $tx - $cx);
        $tau = M_PI * 2;
        $mod = static fn (float $value): float => fmod(fmod($value, $tau) + $tau, $tau);
        $forwardSpan = $mod($end - $start);
        $toMiddle = $mod($middle - $start);
        if ($forwardSpan < 1e-7) {
            return null;
        }
        $forward = $toMiddle > 1e-7 && $toMiddle < $forwardSpan - 1e-7;
        $sweep = $forward ? $forwardSpan : $tau - $forwardSpan;
        $sagitta = $r * (1 - cos($sweep / 2));
        if (!is_finite($sagitta) || $sagitta < 1e-4) {
            return null;
        }
        return [
            'cx' => $cx,
            'cy' => $cy,
            'r' => $r,
            'start' => $start,
            'sweep' => $sweep,
            'direction' => $forward ? 1 : -1,
            'large' => $sweep > M_PI,
            'length' => $r * $sweep,
            'sagitta' => $sagitta,
        ];
    }

    /** @return array{x:float,y:float} */
    public static function pointAt(array $arc, float $t): array
    {
        $value = max(0.0, min(1.0, $t));
        $angle = $arc['start'] + $arc['direction'] * $arc['sweep'] * $value;
        return [
            'x' => $arc['cx'] + $arc['r'] * cos($angle),
            'y' => $arc['cy'] + $arc['r'] * sin($angle),
        ];
    }

    /**
     * Polilínea equivalente al trazo. Es el aplanado único del servidor.
     *
     * @param list<array{x:float|int,y:float|int}> $points
     * @param array<int,array|null>|null $curves
     *
     * @return list<array{x:float,y:float}>
     */
    public static function flatten(array $points, ?array $curves, string $unit = 'cm'): array
    {
        $total = count($points);
        if ($total === 0) {
            return [];
        }
        $tolerance = self::tolerance($unit);
        $result = [['x' => (float) $points[0]['x'], 'y' => (float) $points[0]['y']]];
        for ($index = 0; $index < $total - 1; $index += 1) {
            $a = $points[$index];
            $b = $points[$index + 1];
            $curve = is_array($curves) ? ($curves[$index] ?? null) : null;
            $arc = is_array($curve) ? self::arc($curve, $a, $b) : null;
            if ($arc === null) {
                $result[] = ['x' => (float) $b['x'], 'y' => (float) $b['y']];
                continue;
            }
            $steps = self::steps($arc, $tolerance);
            for ($step = 1; $step <= $steps; $step += 1) {
                $result[] = self::pointAt($arc, $step / $steps);
            }
        }
        return $result;
    }

    private static function steps(array $arc, float $tolerance): int
    {
        $r = max(1e-6, (float) $arc['r']);
        $ratio = max(-1.0, min(1.0, 1 - $tolerance / $r));
        $maxAngle = 2 * acos($ratio);
        $steps = (int) ceil($arc['sweep'] / max(1e-3, $maxAngle));
        return max(1, min(self::MAX_STEPS, $steps));
    }

    /** Longitud del trazo (arcos incluidos). */
    public static function length(array $points, ?array $curves): float
    {
        $total = count($points);
        $length = 0.0;
        for ($index = 0; $index < $total - 1; $index += 1) {
            $a = $points[$index];
            $b = $points[$index + 1];
            $curve = is_array($curves) ? ($curves[$index] ?? null) : null;
            $arc = is_array($curve) ? self::arc($curve, $a, $b) : null;
            $length += $arc !== null
                ? (float) $arc['length']
                : hypot((float) $b['x'] - (float) $a['x'], (float) $b['y'] - (float) $a['y']);
        }
        return $length;
    }

    /**
     * Atributo `d` para SVG con arcos. Devuelve `null` cuando el trazo no
     * tiene curvas: en ese caso la exportación usa la polilínea de siempre y
     * el archivo sale idéntico al de la versión 2.
     */
    public static function pathData(array $points, ?array $curves): ?string
    {
        if (count($points) < 2 || !self::hasCurves($curves)) {
            return null;
        }
        $n = static function (float $value): string {
            $text = rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
            return $text === '' || $text === '-0' ? '0' : $text;
        };
        $d = 'M ' . $n((float) $points[0]['x']) . ' ' . $n((float) $points[0]['y']);
        $total = count($points);
        for ($index = 0; $index < $total - 1; $index += 1) {
            $a = $points[$index];
            $b = $points[$index + 1];
            $curve = is_array($curves) ? ($curves[$index] ?? null) : null;
            $arc = is_array($curve) ? self::arc($curve, $a, $b) : null;
            if ($arc === null) {
                $d .= ' L ' . $n((float) $b['x']) . ' ' . $n((float) $b['y']);
                continue;
            }
            $d .= ' A ' . $n((float) $arc['r']) . ' ' . $n((float) $arc['r']) . ' 0 '
                . ($arc['large'] ? '1' : '0') . ' ' . ($arc['direction'] > 0 ? '1' : '0') . ' '
                . $n((float) $b['x']) . ' ' . $n((float) $b['y']);
        }
        return $d;
    }
}
