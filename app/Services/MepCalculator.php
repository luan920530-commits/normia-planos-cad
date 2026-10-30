<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Cálculos de redes hidrosanitarias y eléctricas.
 *
 * Los valores de referencia vienen de resources/mep-networks.json y son
 * configurables. Los resultados son estimaciones de diseño esquemático: no
 * sustituyen memoria de cálculo, estudio de cargas ni revisión profesional.
 */
final class MepCalculator
{
    /**
     * Una unidad del lienzo equivale a la unidad declarada (igual que la cota
     * del editor). La escala es una referencia de impresión: no altera las
     * longitudes del plano.
     */
    public static function unitsToMeters(string $unit, string $scale = '1:100'): float
    {
        return match ($unit) {
            'm' => 1.0,
            'mm' => 0.001,
            default => 0.01,
        };
    }

    /** Longitud de un trazo en unidades del lienzo. */
    public static function length(array $element): float
    {
        $points = self::points($element);
        $total = 0.0;
        for ($index = 1; $index < count($points); $index++) {
            $total += hypot($points[$index]['x'] - $points[$index - 1]['x'], $points[$index]['y'] - $points[$index - 1]['y']);
        }
        return $total;
    }

    public static function lengthMeters(array $element, array $canvas): float
    {
        return self::length($element) * self::unitsToMeters((string) ($canvas['unit'] ?? 'cm'), (string) ($canvas['scale'] ?? '1:100'));
    }

    /** Factor √3 solo en circuitos trifásicos; 220 V monofásico es 1. */
    public static function phaseFactor(int $phases): float
    {
        return $phases === 3 ? sqrt(3) : 1.0;
    }

    public static function current(float $va, int $voltage, int $phases = 1): float
    {
        if ($va <= 0 || $voltage <= 0) {
            return 0.0;
        }
        return $va / ($voltage * self::phaseFactor($phases));
    }

    public static function breaker(float $current, array $electrical): int
    {
        $series = array_map('intval', $electrical['breakers'] ?? [15, 20, 30]);
        sort($series);
        $reserve = (float) ($electrical['reserve'] ?? 1.25);
        $target = $current * $reserve;
        foreach ($series as $value) {
            if ($value >= $target) {
                return $value;
            }
        }
        return end($series) ?: 0;
    }

    public static function gauge(float $current, array $electrical): string
    {
        $gauges = array_map('strval', $electrical['gauges'] ?? ['12']);
        $ampacity = $electrical['ampacity'] ?? [];
        foreach ($gauges as $gauge) {
            if ((float) ($ampacity[$gauge] ?? 0) >= $current) {
                return $gauge;
            }
        }
        return $gauges === [] ? '' : (string) end($gauges);
    }

    public static function voltageDrop(float $current, float $lengthM, string $gauge, int $voltage, array $electrical, int $phases = 1): float
    {
        $section = (float) ($electrical['section'][$gauge] ?? 0);
        $rho = (float) ($electrical['resistivity'] ?? 0.0217);
        if ($section <= 0 || $voltage <= 0 || $current <= 0 || $lengthM <= 0) {
            return 0.0;
        }
        $factor = self::phaseFactor($phases) === 1.0 ? 2 : sqrt(3);
        return (($factor * $rho * $lengthM * $current) / $section) / $voltage * 100;
    }

    /**
     * Resumen de la red eléctrica por circuito. Une tramos (conduit) y equipos
     * de la familia eléctrica del catálogo CAD.
     *
     * @return list<array<string,mixed>>
     */
    public static function circuits(array $design): array
    {
        $electrical = LibraryRepository::electrical();
        $palette = array_values(array_map('strval', $electrical['colors'] ?? ['#2563eb']));
        $canvas = $design['canvas'] ?? ['unit' => 'cm', 'scale' => '1:100'];
        $map = [];
        $order = [];

        $ensure = static function (string $code, int $voltage = 0, int $phases = 1) use (&$map, &$order, $palette): string {
            $key = $code !== '' ? $code : 'Sin circuito';
            if (!isset($map[$key])) {
                $order[] = $key;
                $map[$key] = [
                    'code' => $key,
                    'voltage' => $voltage,
                    'phases' => $phases === 3 ? 3 : 1,
                    'conduits' => 0,
                    'devices' => 0,
                    'lengthM' => 0.0,
                    'load' => 0.0,
                    'color' => $palette[count($order) - 1 % max(1, count($palette))] ?? ($palette[0] ?? '#2563eb'),
                ];
            }
            if ($voltage > 0 && $map[$key]['voltage'] === 0) {
                $map[$key]['voltage'] = $voltage;
            }
            if ($phases === 3) {
                $map[$key]['phases'] = 3;
            }
            return $key;
        };

        foreach ($design['elements'] ?? [] as $element) {
            $type = (string) ($element['type'] ?? '');
            if (!is_array($element)) {
                continue;
            }
            if ($type === 'conduit') {
                $key = $ensure((string) ($element['circuit'] ?? ''), (int) ($element['voltage'] ?? 0), (int) ($element['phases'] ?? 1));
                $map[$key]['conduits']++;
                $map[$key]['lengthM'] += self::lengthMeters($element, $canvas);
            } elseif (LibraryRepository::isElectricalObject($type)) {
                $key = $ensure((string) ($element['circuit'] ?? ''));
                $map[$key]['devices']++;
                $map[$key]['load'] += max(0.0, (float) ($element['load'] ?? 0));
            }
        }

        $defaultVoltage = (int) ($electrical['voltages'][0] ?? 110);
        $maxBranch = (float) ($electrical['maxDropBranch'] ?? 3);
        $result = [];
        foreach ($order as $key) {
            $entry = $map[$key];
            $voltage = $entry['voltage'] > 0 ? $entry['voltage'] : $defaultVoltage;
            $current = self::current((float) $entry['load'], $voltage, (int) $entry['phases']);
            $breaker = $entry['load'] > 0 ? self::breaker($current, $electrical) : 0;
            $gauge = $entry['load'] > 0 ? self::gauge(max($current, (float) $breaker), $electrical) : '';
            $drop = ($entry['load'] > 0 && $gauge !== '') ? self::voltageDrop($current, (float) $entry['lengthM'], $gauge, $voltage, $electrical, (int) $entry['phases']) : 0.0;
            $warnings = [];
            if ($entry['devices'] === 0) {
                $warnings[] = 'Sin equipos asignados: no hay carga que calcular.';
            }
            if ($entry['devices'] > 0 && $entry['load'] <= 0) {
                $warnings[] = 'Los equipos no tienen carga (VA) declarada.';
            }
            if ($entry['conduits'] === 0) {
                $warnings[] = 'Sin tramos de tubería eléctrica dibujados.';
            }
            if ($entry['lengthM'] > 0 && $drop > $maxBranch) {
                $warnings[] = 'Caída de tensión estimada ' . number_format($drop, 1, ',', '.') . ' % mayor que ' . number_format($maxBranch, 0, ',', '.') . ' %; revisa calibre o longitud.';
            }
            $result[] = [
                'code' => $key,
                'voltage' => $voltage,
                'phases' => (int) $entry['phases'],
                'color' => $entry['color'],
                'conduitCount' => $entry['conduits'],
                'deviceCount' => $entry['devices'],
                'lengthM' => round((float) $entry['lengthM'], 2),
                'loadVA' => round((float) $entry['load'], 1),
                'current' => round($current, 2),
                'breaker' => $breaker,
                'gauge' => $gauge,
                'drop' => round($drop, 2),
                'warnings' => $warnings,
            ];
        }
        usort($result, static fn (array $a, array $b): int => strcmp($a['code'], $b['code']));
        return $result;
    }

    /**
     * Resumen de la red hidrosanitaria por tipo de red.
     *
     * @return list<array<string,mixed>>
     */
    public static function hydraulic(array $design): array
    {
        $networks = LibraryRepository::networks();
        $electricalCatalog = LibraryRepository::mep();
        $slopes = $electricalCatalog['slopes'] ?? [];
        $canvas = $design['canvas'] ?? ['unit' => 'cm', 'scale' => '1:100'];
        $map = [];
        foreach ($design['elements'] ?? [] as $element) {
            if (!is_array($element) || ($element['type'] ?? '') !== 'pipe') {
                continue;
            }
            $key = (string) ($element['network'] ?? '');
            if (!isset($networks[$key])) {
                continue;
            }
            $definition = $networks[$key];
            if (!isset($map[$key])) {
                $map[$key] = [
                    'key' => $key,
                    'label' => $definition['label'],
                    'short' => $definition['short'],
                    'color' => $definition['color'],
                    'gravity' => !empty($definition['gravity']),
                    'count' => 0,
                    'lengthM' => 0.0,
                    'diameters' => [],
                    'materials' => [],
                    'warnings' => [],
                ];
            }
            $entry =& $map[$key];
            $entry['count']++;
            $length = self::lengthMeters($element, $canvas);
            $entry['lengthM'] += $length;
            $diameter = (string) ($element['diameter'] ?? $definition['diameter']);
            $entry['diameters'][$diameter] = ($entry['diameters'][$diameter] ?? 0) + $length;
            $material = (string) ($element['material'] ?? $definition['material']);
            $entry['materials'][$material] = true;

            if (!empty($definition['gravity'])) {
                $points = self::points($element);
                $first = $points[0];
                $last = $points[count($points) - 1];
                $run = abs($last['x'] - $first['x']);
                if ($run >= 0.5) {
                    $slope = (($last['y'] - $first['y']) / $run) * 100;
                    $minimum = (float) ($slopes[$diameter] ?? 0);
                    $label = (string) ($element['label'] ?? $element['id'] ?? '');
                    if ($minimum > 0 && $slope + 0.001 < $minimum) {
                        $entry['warnings'][] = 'Tramo ' . $label . ': pendiente ' . number_format($slope, 1, ',', '.') . ' % menor que la referencia de ' . number_format($minimum, 1, ',', '.') . ' % para Ø ' . $diameter . '.';
                    }
                    if ($slope < -0.001) {
                        $entry['warnings'][] = 'Tramo ' . $label . ': pendiente negativa (asciende); revisa el sentido del desagüe.';
                    }
                }
            }
            unset($entry);
        }

        $result = [];
        foreach (array_keys($networks) as $key) {
            if (!isset($map[$key])) {
                continue;
            }
            $entry = $map[$key];
            $diameters = [];
            foreach ($entry['diameters'] as $diameter => $length) {
                $diameters[] = ['diameter' => $diameter, 'lengthM' => round((float) $length, 2)];
            }
            usort($diameters, static fn (array $a, array $b): int => (float) $a['diameter'] <=> (float) $b['diameter']);
            $result[] = [
                'key' => $entry['key'],
                'label' => $entry['label'],
                'short' => $entry['short'],
                'color' => $entry['color'],
                'gravity' => $entry['gravity'],
                'count' => $entry['count'],
                'lengthM' => round((float) $entry['lengthM'], 2),
                'diameters' => $diameters,
                'materials' => array_keys($entry['materials']),
                'warnings' => $entry['warnings'],
            ];
        }
        return $result;
    }

    /** Resumen completo que consume la API y el panel de redes. */
    public static function summary(array $design): array
    {
        $hydraulic = self::hydraulic($design);
        $circuits = self::circuits($design);
        $warnings = [];
        foreach ($hydraulic as $entry) {
            foreach ($entry['warnings'] as $message) {
                $warnings[] = $message;
            }
        }
        foreach ($circuits as $entry) {
            foreach ($entry['warnings'] as $message) {
                $warnings[] = $entry['code'] . ': ' . $message;
            }
        }
        return [
            'hydraulic' => $hydraulic,
            'electrical' => $circuits,
            'pipes' => count(array_filter($design['elements'] ?? [], static fn ($e): bool => is_array($e) && ($e['type'] ?? '') === 'pipe')),
            'conduits' => count(array_filter($design['elements'] ?? [], static fn ($e): bool => is_array($e) && ($e['type'] ?? '') === 'conduit')),
            'totalPipeLength' => round(array_sum(array_map(static fn (array $e): float => (float) $e['lengthM'], $hydraulic)), 2),
            'totalConduitLength' => round(array_sum(array_map(static fn (array $e): float => (float) $e['lengthM'], $circuits)), 2),
            'totalLoadVA' => round(array_sum(array_map(static fn (array $e): float => (float) $e['loadVA'], $circuits)), 1),
            'warnings' => $warnings,
        ];
    }

    /** @return list<array{x:float,y:float}> */
    private static function points(array $element): array
    {
        $points = $element['points'] ?? null;
        if (is_array($points) && count($points) >= 2) {
            return array_map(static fn (array $point): array => [
                'x' => (float) ($point['x'] ?? 0),
                'y' => (float) ($point['y'] ?? 0),
            ], array_values($points));
        }
        return [
            ['x' => 0.0, 'y' => 0.0],
            ['x' => (float) ($element['w'] ?? 0), 'y' => (float) ($element['h'] ?? 0)],
        ];
    }
}
