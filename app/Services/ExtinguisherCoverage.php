<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Cálculo de cobertura de extintores.
 *
 * Mide, sobre la misma rejilla libre que usa el auditor de evacuación, qué
 * superficie del piso alcanza cada extintor siguiendo el recorrido real (no la
 * línea recta) y con dos criterios a la vez:
 *
 *  1. recorrido máximo según la clase de fuego y el riesgo (NTC 2885/NFPA 10);
 *  2. área máxima que puede asignarse a la clasificación del equipo.
 *
 * El resultado es un apoyo de diseño: no certifica cumplimiento, no reemplaza
 * la revisión en sitio ni el rótulo real del extintor.
 */
final class ExtinguisherCoverage
{
    private const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

    /**
     * Analiza la cobertura del plano.
     *
     * @param array $design Documento normalizado del plano.
     * @param bool  $simulate Si conviene simular las acciones sugeridas
     *                        (reubicar, subir capacidad, añadir) y medir su
     *                        ganancia sobre el mismo cálculo.
     */
    public static function analyze(array $design, bool $simulate = true): array
    {
        $settings = (array) ($design['extinguishers'] ?? []);
        $profileKey = ExtinguisherNorms::normalizeProfile($settings['profile'] ?? null);
        $hazard = in_array($settings['hazard'] ?? '', ExtinguisherNorms::HAZARDS, true)
            ? (string) $settings['hazard']
            : 'ordinary';
        $profile = ExtinguisherNorms::profile($profileKey);
        $criteria = PlanAudit::criteria();

        [$walls, $doors, $units, $signs, $layerVisible] = self::collect($design);
        $grid = PlanGrid::build($design, $walls, $doors, $criteria);
        $result = self::measure($grid, $units, $signs, $profileKey, $hazard, $signs['radiusCm']);

        $findings = self::findings($result, $profileKey, $hazard, $profile);
        $recommendations = $simulate
            ? self::recommend($design, $grid, $units, $result, $profileKey, $hazard)
            : [];

        return [
            'profile' => $profileKey,
            'profileLabel' => (string) ($profile['label'] ?? $profileKey),
            'reference' => (string) ($profile['reference'] ?? ''),
            'hazard' => $hazard,
            'hazardLabel' => (string) ($result['summary']['hazardLabel'] ?? $hazard),
            'summary' => $result['summary'],
            'units' => $result['units'],
            'zones' => $result['zones'],
            'findings' => $findings,
            'recommendations' => $recommendations,
            'signs' => ['count' => count($signs['items']), 'radiusM' => round($signs['radiusCm'] / 100, 2)],
            'agents' => ExtinguisherNorms::agents(),
            'capacities' => ExtinguisherNorms::capacities(),
            'examples' => (array) (ExtinguisherNorms::criteria()['examples'] ?? []),
            'defaultsNotice' => (string) (ExtinguisherNorms::criteria()['defaultsNotice'] ?? ''),
            'notice' => 'Cobertura calculada sobre el plano guardado con recorridos por la rejilla de circulación. Es un apoyo de diseño: no certifica cumplimiento normativo ni reemplaza la revisión en sitio.',
        ];
    }

    /* ------------------------------ recolección ------------------------------ */

    private static function collect(array $design): array
    {
        $walls = [];
        $doors = [];
        $units = [];
        $signItems = [];
        $visible = [];
        foreach ((array) $design['layers'] as $layer) {
            $visible[(string) $layer['id']] = (bool) $layer['visible'];
        }
        $signCodes = array_map('strtoupper', (array) (ExtinguisherNorms::criteria()['profiles'][ExtinguisherNorms::normalizeProfile($design['extinguishers']['profile'] ?? null)]['signage']['codes'] ?? ['F001']));
        foreach ((array) $design['elements'] as $element) {
            $type = (string) $element['type'];
            $layerId = (string) $element['layerId'];
            if (!($visible[$layerId] ?? false)) {
                continue;
            }
            if ($type === 'wall') {
                $walls[] = [
                    'points' => PlanGrid::visualPoints($element),
                    'stroke' => max(1.0, (float) ($element['stroke'] ?? 2)),
                ];
                continue;
            }
            if (in_array($type, DesignValidator::DOOR_TYPES, true)) {
                $doors[] = ['opening' => PlanGrid::doorOpening($element)];
                continue;
            }
            $code = LibraryRepository::codeForType($type);
            if ($code !== null && in_array(strtoupper($code), $signCodes, true)) {
                $signItems[] = [
                    'id' => (string) $element['id'],
                    'center' => [
                        'x' => (float) $element['x'] + (float) $element['w'] / 2,
                        'y' => (float) $element['y'] + (float) $element['h'] / 2,
                    ],
                ];
                continue;
            }
            if (ExtinguisherNorms::isExtinguisher($element)) {
                $units[] = $element;
            }
        }
        $radiusCm = (float) (ExtinguisherNorms::criteria()['profiles'][ExtinguisherNorms::normalizeProfile($design['extinguishers']['profile'] ?? null)]['signage']['radiusCm'] ?? 150);
        return [$walls, $doors, $units, ['items' => $signItems, 'radiusCm' => $radiusCm], $visible];
    }

    /* -------------------------------- medición -------------------------------- */

    private static function measure(array $grid, array $units, array $signs, string $profileKey, string $hazard, float $signRadiusCm): array
    {
        $nx = $grid['nx'];
        $ny = $grid['ny'];
        $cell = $grid['cell'];
        $width = $grid['width'];
        $height = $grid['height'];
        $cellM = $grid['cellM'];
        $cellAreaM2 = $grid['cellAreaM2'];
        $blocked = $grid['blocked'];
        $exterior = $grid['exterior'];
        $total = $nx * $ny;
        $floorCells = 0;
        for ($cellIndex = 0; $cellIndex < $total; $cellIndex += 1) {
            if (!$blocked[$cellIndex] && !$exterior[$cellIndex]) {
                $floorCells += 1;
            }
        }
        $floorAreaM2 = $floorCells * $cellAreaM2;

        $unitReports = [];
        $bestUnit = array_fill(0, $total, -1);
        $bestDist = array_fill(0, $total, INF);
        $rawUnit = array_fill(0, $total, -1);
        $rawDist = array_fill(0, $total, INF);
        $radius = max(1, (int) ceil(($grid['clearance'] + $cell * 1.5) / $cell));

        foreach ($units as $index => $element) {
            $center = [
                'x' => (float) $element['x'] + (float) $element['w'] / 2,
                'y' => (float) $element['y'] + (float) $element['h'] / 2,
            ];
            $limits = ExtinguisherNorms::limits($element, $profileKey, (string) ($element['extHazard'] ?? $hazard));
            $travelLimit = $limits['travelM'];
            $dist = self::field($grid, $center, $radius);
            $assigned = 0;
            $farthest = null;
            for ($cellIndex = 0; $cellIndex < $total; $cellIndex += 1) {
                if (!is_finite($dist[$cellIndex])) {
                    continue;
                }
                $distance = $dist[$cellIndex];
                if ($distance < $rawDist[$cellIndex]) {
                    $rawDist[$cellIndex] = $distance;
                    $rawUnit[$cellIndex] = $index;
                }
                if ($travelLimit === null || $distance > $travelLimit + 0.0001) {
                    continue;
                }
                if ($distance < $bestDist[$cellIndex]) {
                    $bestDist[$cellIndex] = $distance;
                    $bestUnit[$cellIndex] = $index;
                }
                $assigned += 1;
                $farthest = $farthest === null ? $distance : max($farthest, $distance);
            }
            $unitReports[$index] = [
                'id' => (string) $element['id'],
                'type' => (string) $element['type'],
                'label' => trim((string) ($element['label'] ?? '')),
                'center' => ['x' => round($center['x'], 2), 'y' => round($center['y'], 2)],
                'agent' => (string) ($element['extAgent'] ?? ''),
                'agentLabel' => (string) (ExtinguisherNorms::agent((string) ($element['extAgent'] ?? ''))['label'] ?? 'Sin agente'),
                'capacityLb' => round((float) ($element['extCapacityLb'] ?? 0), 1),
                'rating' => (string) ($element['extRating'] ?? ''),
                'hazard' => $limits['hazard'],
                'hazardLabel' => $limits['hazardLabel'],
                'mountCm' => round((float) ($element['extMountCm'] ?? 0), 1),
                'classes' => $limits['classes'],
                'ratingA' => $limits['ratingA'],
                'ratingB' => $limits['ratingB'],
                'travelLimitM' => $limits['travelM'],
                'travelByClass' => $limits['travelByClass'],
                'areaLimitM2' => $limits['areaLimitM2'],
                'travelAreaM2' => round($assigned * $cellAreaM2, 1),
                'maxTravelM' => $farthest === null ? null : round($farthest, 2),
                'coverageAreaM2' => 0.0,
                'overAreaM2' => 0.0,
                'issues' => $limits['issues'],
                'mountMaxCm' => ExtinguisherNorms::maxMountCm($profileKey, (float) ($element['extCapacityLb'] ?? 0)),
                'wheeled' => str_contains((string) $element['type'], 'wheeled'),
            ];
        }

        // Segundo criterio: el área asignada no puede superar la que admite la
        // clasificación. Se conservan las celdas más cercanas y el resto queda
        // descubierto, igual que haría la revisión con la tabla en la mano.
        $areaReasons = [];
        $overArea = [];
        foreach ($unitReports as $index => $report) {
            $cells = [];
            for ($cellIndex = 0; $cellIndex < $total; $cellIndex += 1) {
                if ($bestUnit[$cellIndex] === $index) {
                    $cells[$cellIndex] = $bestDist[$cellIndex];
                }
            }
            $cap = $report['areaLimitM2'];
            if ($cap !== null) {
                $overArea[$index] = max(0.0, count($cells) * $cellAreaM2 - $cap);
            }
            if ($cap !== null && count($cells) * $cellAreaM2 > $cap + 0.0001) {
                asort($cells);
                $keep = (int) floor($cap / $cellAreaM2 + 0.0001);
                $seen = 0;
                foreach ($cells as $cellIndex => $distance) {
                    if ($seen >= $keep) {
                        $bestUnit[$cellIndex] = -1;
                        $bestDist[$cellIndex] = INF;
                        $areaReasons[$cellIndex] = $index;
                    }
                    $seen += 1;
                }
            }
        }

        $coveredCells = 0;
        $coveredAreaM2 = 0.0;
        for ($cellIndex = 0; $cellIndex < $total; $cellIndex += 1) {
            if ($bestUnit[$cellIndex] >= 0) {
                $unitReports[$bestUnit[$cellIndex]]['coverageAreaM2'] += $cellAreaM2;
            }
        }
        foreach ($unitReports as $index => $report) {
            $unitReports[$index]['coverageAreaM2'] = round($report['coverageAreaM2'], 1);
            $unitReports[$index]['coveragePct'] = $floorAreaM2 > 0
                ? round($report['coverageAreaM2'] / $floorAreaM2 * 100, 1)
                : 0.0;
            $unitReports[$index]['travelAreaM2'] = round($report['travelAreaM2'], 1);
            $unitReports[$index]['overAreaM2'] = round($overArea[$index] ?? 0.0, 1);
            $signDistance = null;
            foreach ($signs['items'] as $sign) {
                $d = PlanGrid::distance($report['center'], $sign['center']);
                if ($signDistance === null || $d < $signDistance) {
                    $signDistance = $d;
                }
            }
            $unitReports[$index]['signDistanceM'] = $signDistance === null ? null : round($signDistance / 100, 2);
            $unitReports[$index]['signCovered'] = $signDistance !== null && $signDistance <= $signRadiusCm;
            $unitReports[$index]['status'] = self::unitStatus($unitReports[$index]);
        }
        for ($cellIndex = 0; $cellIndex < $total; $cellIndex += 1) {
            if ($bestUnit[$cellIndex] >= 0) {
                $coveredCells += 1;
                $coveredAreaM2 += $cellAreaM2;
            }
        }

        // Zonas descubiertas agrupadas por contigüidad (cuatro vecinos), con el
        // motivo dominante y el punto más desfavorable de cada una.
        $uncovered = [];
        for ($cellIndex = 0; $cellIndex < $total; $cellIndex += 1) {
            if (!$blocked[$cellIndex] && !$exterior[$cellIndex] && $bestUnit[$cellIndex] < 0) {
                $uncovered[$cellIndex] = true;
            }
        }
        $zones = [];
        $visited = [];
        foreach (array_keys($uncovered) as $start) {
            if (isset($visited[$start])) {
                continue;
            }
            $stack = [$start];
            $visited[$start] = true;
            $cells = [];
            while ($stack !== []) {
                $current = array_pop($stack);
                $cells[] = $current;
                $ix = $current % $nx;
                $iy = intdiv($current, $nx);
                foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                    $jx = $ix + $dx;
                    $jy = $iy + $dy;
                    if ($jx < 0 || $jy < 0 || $jx >= $nx || $jy >= $ny) {
                        continue;
                    }
                    $next = $jy * $nx + $jx;
                    if (!isset($uncovered[$next]) || isset($visited[$next])) {
                        continue;
                    }
                    $visited[$next] = true;
                    $stack[] = $next;
                }
            }
            if (count($cells) < 2) {
                continue;
            }
            $sumX = 0.0;
            $sumY = 0.0;
            $worst = null;
            $worstDistance = -1.0;
            $reasons = [];
            $owners = [];
            foreach ($cells as $cellIndex) {
                $center = PlanGrid::cellCenter($cellIndex % $nx, intdiv($cellIndex, $nx), $cell, $width, $height);
                $sumX += $center['x'];
                $sumY += $center['y'];
                $reason = self::reasonFor($cellIndex, $bestUnit, $rawUnit, $rawDist, $areaReasons, $unitReports, $profileKey);
                $reasons[$reason] = ($reasons[$reason] ?? 0) + 1;
                if ($rawUnit[$cellIndex] >= 0) {
                    $owners[$rawUnit[$cellIndex]] = true;
                }
                if ($rawDist[$cellIndex] > $worstDistance) {
                    $worstDistance = $rawDist[$cellIndex];
                    $worst = $center;
                }
            }
            arsort($reasons);
            $zones[] = [
                'areaM2' => round(count($cells) * $cellAreaM2, 1),
                'cells' => count($cells),
                'center' => ['x' => round($sumX / count($cells), 1), 'y' => round($sumY / count($cells), 1)],
                'worst' => $worst === null ? null : ['x' => round($worst['x'], 1), 'y' => round($worst['y'], 1)],
                'worstDistanceM' => is_finite($worstDistance) ? round($worstDistance, 2) : null,
                'reason' => (string) array_key_first($reasons),
                'nearestUnits' => array_map(static fn (int $i): string => $unitReports[$i]['id'], array_keys($owners)),
                'runs' => count($visited) <= 6000 ? self::runs($cells, $nx, $ny) : [],
            ];
        }
        usort($zones, static fn (array $a, array $b): int => $b['areaM2'] <=> $a['areaM2']);
        $zones = array_slice($zones, 0, 24);
        $uncoveredAreaM2 = max(0.0, $floorAreaM2 - $coveredAreaM2);

        $classes = [];
        foreach ($unitReports as $report) {
            foreach ($report['classes'] as $class) {
                $classes[$class] = true;
            }
        }
        $classOrder = ['A', 'B', 'C', 'D', 'K'];
        $present = array_values(array_filter($classOrder, static fn (string $c): bool => isset($classes[$c])));

        return [
            'summary' => [
                'count' => count($unitReports),
                'floorAreaM2' => round($floorAreaM2, 1),
                'coveredAreaM2' => round($coveredAreaM2, 1),
                'uncoveredAreaM2' => round($uncoveredAreaM2, 1),
                'coveredPct' => $floorAreaM2 > 0 ? round($coveredAreaM2 / $floorAreaM2 * 100, 1) : 0.0,
                'requiredByArea' => ExtinguisherNorms::requiredByArea($profileKey, $floorAreaM2),
                'hazardLabel' => (string) (ExtinguisherNorms::profile($profileKey)['classA']['hazards'][$hazard]['label'] ?? $hazard),
                'classes' => $present,
                'missingClasses' => array_values(array_diff(['A', 'B', 'C'], $present)),
                'signs' => count($signs['items']),
                'cellM' => round($grid['cellM'], 2),
                'unitsWithGap' => count(array_filter($unitReports, static fn (array $u): bool => $u['coverageAreaM2'] <= 0)),
            ],
            'units' => $unitReports,
            'zones' => $zones,
        ];
    }

    private static function unitStatus(array $unit): string
    {
        if ($unit['coverageAreaM2'] <= 0 && ($unit['travelLimitM'] === null || $unit['classes'] === [])) {
            return 'no_class';
        }
        if ($unit['overAreaM2'] > 0.5) {
            return 'area';
        }
        if ($unit['travelLimitM'] === null) {
            return 'no_class';
        }
        return 'ok';
    }

    private static function reasonFor(int $cellIndex, array $bestUnit, array $rawUnit, array $rawDist, array $areaReasons, array $units, string $profileKey): string
    {
        if (isset($areaReasons[$cellIndex])) {
            return 'area';
        }
        $owner = $rawUnit[$cellIndex];
        if ($owner < 0) {
            return 'unreachable';
        }
        $limit = $units[$owner]['travelLimitM'];
        if ($limit === null) {
            return 'no_class';
        }
        return $rawDist[$cellIndex] > $limit + 0.0001 ? 'travel' : 'area';
    }

    /** Tramos horizontales de celdas, para dibujar el mapa sin miles de nodos. */
    private static function runs(array $cells, int $nx, int $ny): array
    {
        $rows = [];
        foreach ($cells as $cellIndex) {
            $rows[intdiv($cellIndex, $nx)][] = $cellIndex % $nx;
        }
        ksort($rows);
        $out = [];
        foreach ($rows as $y => $xs) {
            sort($xs);
            $start = $xs[0];
            $prev = $start;
            foreach (array_slice($xs, 1) as $x) {
                if ($x === $prev + 1) {
                    $prev = $x;
                    continue;
                }
                $out[] = [$start, $y, $prev - $start + 1];
                $start = $x;
                $prev = $x;
            }
            $out[] = [$start, $y, $prev - $start + 1];
        }
        return $out;
    }

    /* ------------------------------- recorrido ------------------------------- */

    /**
     * Campo de distancias en metros desde un extintor hasta cada celda libre,
     * con ocho vecinos y respetando muros y vanos.
     *
     * @return array<int,float>
     */
    private static function field(array $grid, array $center, int $radius): array
    {
        $nx = $grid['nx'];
        $ny = $grid['ny'];
        $cell = $grid['cell'];
        $cellM = $grid['cellM'];
        $blocked = $grid['blocked'];
        $exterior = $grid['exterior'];
        $total = $nx * $ny;
        $dist = array_fill(0, $total, INF);
        $queue = new \SplPriorityQueue();
        $queue->setExtractFlags(\SplPriorityQueue::EXTR_BOTH);
        $cx = (int) floor($center['x'] / $cell);
        $cy = (int) floor($center['y'] / $cell);
        for ($iy = max(0, $cy - $radius); $iy <= min($ny - 1, $cy + $radius); $iy += 1) {
            for ($ix = max(0, $cx - $radius); $ix <= min($nx - 1, $cx + $radius); $ix += 1) {
                $index = $iy * $nx + $ix;
                if ($blocked[$index] || $exterior[$index]) {
                    continue;
                }
                $dist[$index] = 0.0;
                $queue->insert($index, 0);
            }
        }
        while (!$queue->isEmpty()) {
            $item = $queue->extract();
            $current = (int) $item['data'];
            $currentCost = -((float) $item['priority']);
            if ($currentCost > $dist[$current] + 0.0001) {
                continue;
            }
            $ix = $current % $nx;
            $iy = intdiv($current, $nx);
            foreach (self::NEIGHBOURS as [$dx, $dy]) {
                $jx = $ix + $dx;
                $jy = $iy + $dy;
                if ($jx < 0 || $jy < 0 || $jx >= $nx || $jy >= $ny) {
                    continue;
                }
                $next = $jy * $nx + $jx;
                if ($blocked[$next] || $exterior[$next]) {
                    continue;
                }
                $step = $cellM * (($dx !== 0 && $dy !== 0) ? 1.41421356 : 1.0);
                $candidate = $dist[$current] + $step;
                if ($candidate + 0.0001 < $dist[$next]) {
                    $dist[$next] = $candidate;
                    $queue->insert($next, -$candidate);
                }
            }
        }
        return $dist;
    }

    /* ------------------------------- hallazgos ------------------------------- */

    private static function findings(array $result, string $profileKey, string $hazard, array $profile): array
    {
        $findings = [];
        $summary = $result['summary'];
        $add = static function (string $code, string $severity, string $title, string $detail, array $elements = [], ?array $position = null, ?string $value = null) use (&$findings): void {
            $findings[] = [
                'code' => $code,
                'severity' => $severity,
                'title' => $title,
                'detail' => $detail,
                'elements' => array_values(array_unique($elements)),
                'position' => $position === null ? null : ['x' => round($position['x']), 'y' => round($position['y'])],
                'value' => $value,
            ];
        };
        $units = $result['units'];

        if ($units === []) {
            $add(
                'ext_missing',
                'info',
                'Sin extintores en el plano',
                'El plano no incluye extintores, así que no hay cobertura que verificar. Coloca los equipos con la herramienta Extintor para que el cálculo de recorrido y área sea posible.'
            );
            return $findings;
        }

        $required = (int) $summary['requiredByArea'];
        if ($required > count($units)) {
            $add(
                'ext_ratio_short',
                'medium',
                'Cantidad mínima por superficie',
                sprintf(
                    'La Resolución 2400 de 1979 (art. 221) pide no menos de un extintor por cada 200 m² de local o fracción. Con %s m² de piso corresponden %d y el plano tiene %d.',
                    self::number($summary['floorAreaM2']),
                    $required,
                    count($units)
                ),
                array_map(static fn (array $u): string => $u['id'], $units),
                null,
                (string) $required
            );
        }

        $byReason = ['travel' => [], 'area' => [], 'unreachable' => [], 'no_class' => []];
        foreach ($result['zones'] as $zone) {
            $byReason[$zone['reason']][] = $zone;
        }
        $largest = $result['zones'][0] ?? null;
        if (($summary['coveredPct'] < 95.0) && ($largest !== null)) {
            $travelZones = $byReason['travel'];
            $areaZones = $byReason['area'];
            $unreachable = $byReason['unreachable'];
            if ($travelZones !== [] || $unreachable !== []) {
                $travelArea = array_sum(array_map(static fn (array $z): float => $z['areaM2'], array_merge($travelZones, $unreachable)));
                $severity = $summary['coveredPct'] < 80.0 ? 'high' : 'medium';
                $add(
                    'ext_travel_too_long',
                    $severity,
                    'Superficie fuera del recorrido de los extintores',
                    sprintf(
                        'Hay %s m² a los que el extintor más cercano no llega dentro de su distancia máxima. La zona más amplia mide %s m² y su punto más desfavorable queda a %s m del equipo más próximo. Revisa la ubicación o instala otra unidad.',
                        self::number($travelArea),
                        self::number($largest['areaM2']),
                        $largest['worstDistanceM'] === null ? '—' : self::number((float) $largest['worstDistanceM'])
                    ),
                    array_merge(...array_map(static fn (array $z): array => $z['nearestUnits'], array_merge($travelZones, $unreachable))),
                    $largest['worst'],
                    self::number($travelArea) . ' m²'
                );
            }
            if ($areaZones !== []) {
                $area = array_sum(array_map(static fn (array $z): float => $z['areaM2'], $areaZones));
                $add(
                    'ext_coverage_gap',
                    $summary['coveredPct'] < 80.0 ? 'high' : 'medium',
                    'Área por encima de la capacidad del extintor',
                    sprintf(
                        'La cobertura por recorrido alcanza más superficie de la que admite la clasificación de los equipos: quedan %s m² sin asignar. Sube la clasificación (más unidades A) o añade otro extintor en la zona descubierta.',
                        self::number($area)
                    ),
                    array_merge(...array_map(static fn (array $z): array => $z['nearestUnits'], $areaZones)),
                    $areaZones[0]['worst'] ?? null,
                    self::number($area) . ' m²'
                );
            }
            if ($byReason['no_class'] !== [] && $travelZones === [] && $areaZones === []) {
                $add(
                    'ext_class_gap',
                    'medium',
                    'Extintor sin clase de fuego aplicable',
                    'El equipo más cercano no declara una clasificación que permita asignarle superficie. Revisa el agente y la clasificación del extintor antes de dar por cubierta la zona.',
                    array_map(static fn (array $u): string => $u['id'], $units)
                );
            }
        }

        foreach ($units as $unit) {
            if (in_array('A', $summary['missingClasses'], true) && $summary['floorAreaM2'] >= 20) {
                $add(
                    'ext_no_class_a',
                    'medium',
                    'Ningún extintor con clasificación Clase A',
                    'La superficie del piso no tiene un equipo con clasificación 2-A o superior. Los fuegos de materiales sólidos comunes (papel, madera, textiles) requieren Clase A: un extintor solo BC o CO₂ no cubre ese riesgo.',
                    array_map(static fn (array $u): string => $u['id'], $units)
                );
                break;
            }
        }
        foreach ($units as $unit) {
            if (in_array('A', $unit['classes'], true) ? $unit['ratingA'] <= 0 : false) {
                $add(
                    'ext_wrong_class',
                    'medium',
                    'Clasificación incoherente con el agente',
                    sprintf(
                        'El extintor %s declara %s, pero el agente %s no cubre las clases que ese rótulo implica. Corrige el rótulo o cambia el agente.',
                        $unit['id'],
                        $unit['rating'] === '' ? 'sin clasificación' : $unit['rating'],
                        mb_strtolower($unit['agentLabel'])
                    ),
                    [$unit['id']],
                    $unit['center']
                );
            }
            $declared = array_values(array_filter(['A', 'B', 'C'], static fn (string $c): bool => str_contains(strtoupper($unit['rating']), $c)));
            $unsupported = array_values(array_diff($declared, $unit['classes']));
            if ($unsupported !== []) {
                $add(
                    'ext_wrong_class',
                    'medium',
                    'Clasificación incoherente con el agente',
                    sprintf(
                        'El extintor %s declara la clase %s en su rótulo, pero el agente %s no la cubre. Ajusta el rótulo a la placa real o cambia el agente.',
                        $unit['id'],
                        implode('/', $unsupported),
                        mb_strtolower($unit['agentLabel'])
                    ),
                    [$unit['id']],
                    $unit['center']
                );
            }
            if (!$unit['signCovered']) {
                $add(
                    'ext_without_sign',
                    'low',
                    'Extintor sin señal cercana',
                    $unit['signDistanceM'] === null
                        ? sprintf('El extintor %s no tiene una señal F001 en el plano. La Resolución 2400 (art. 224) pide señalizarlo en rojo para que se encuentre rápido.', $unit['id'])
                        : sprintf('La señal de extintor más próxima a %s está a %s m y el criterio de referencia pide tenerla a %s m o menos.', $unit['id'], self::number((float) $unit['signDistanceM']), self::number($profile['signage']['radiusCm'] ?? 150)),
                    [$unit['id']],
                    $unit['center']
                );
            }
            if (!$unit['wheeled'] && $unit['mountCm'] > 0 && $unit['mountCm'] > $unit['mountMaxCm'] + 0.5) {
                $add(
                    'ext_height',
                    'low',
                    'Altura de montaje fuera de rango',
                    sprintf(
                        'La parte superior del extintor %s está a %s cm y para su peso el criterio de referencia pide %s cm como máximo. Bajarlo mantiene el acceso libre.',
                        $unit['id'],
                        self::number($unit['mountCm'], 0),
                        self::number($unit['mountMaxCm'], 0)
                    ),
                    [$unit['id']],
                    $unit['center'],
                    self::number($unit['mountCm'], 0) . ' cm'
                );
            }
            if (preg_match('/(?:^|:)(4|6|8|12|16)-B/i', $unit['rating']) === 1) {
                $add(
                    'ext_obsolete_rating',
                    'info',
                    'Clasificación B retirada de la norma',
                    sprintf('La clasificación %s del extintor %s corresponde a tamaños que la NFPA 10:2007 (4.4) ya no reconoce. Verifica que el equipo esté vigente y rotulado con una clasificación actual.', $unit['rating'], $unit['id']),
                    [$unit['id']],
                    $unit['center'],
                    $unit['rating']
                );
            }
        }
        return $findings;
    }

    /* ------------------------------ sugerencias ------------------------------ */

    private static function recommend(array $design, array $grid, array $units, array $result, string $profileKey, string $hazard): array
    {
        $zones = $result['zones'];
        $summary = $result['summary'];
        if ($zones === [] || $units === []) {
            return [];
        }
        $cellTotal = $grid['nx'] * $grid['ny'];
        $budget = $cellTotal * max(1, count($units));
        if ($budget > 900_000) {
            return [];
        }
        $recommendations = [];
        $target = $zones[0]['worst'] ?? $zones[0]['center'];
        $baseCovered = (float) $summary['coveredAreaM2'];

        // Añadir: se prueba con una unidad estándar del agente que cubra Clase A.
        $candidate = self::newUnit($design, $units, $target, $profileKey, $hazard);
        if ($candidate !== null) {
            $after = self::measure($grid, array_merge($units, [$candidate['element']]), ['items' => [], 'radiusCm' => 0.0], $profileKey, $hazard, 0.0);
            $gain = (float) $after['summary']['coveredAreaM2'] - $baseCovered;
            if ($gain > 0.5) {
                $recommendations[] = [
                    'action' => 'add',
                    'elementId' => null,
                    'title' => 'Instalar otro extintor',
                    'detail' => sprintf(
                        'Un %s de %s lb en el punto más desfavorable de la zona descubierta sumaría unos %s m² de cobertura.',
                        mb_strtolower(self::agentLabel((string) $candidate['element']['extAgent'])),
                        self::number($candidate['element']['extCapacityLb'], 0),
                        self::number($gain)
                    ),
                    'target' => $target,
                    'type' => (string) $candidate['element']['type'],
                    'agent' => (string) $candidate['element']['extAgent'],
                    'capacityLb' => (float) $candidate['element']['extCapacityLb'],
                    'rating' => (string) $candidate['element']['extRating'],
                    'element' => $candidate['element'],
                    'gainAreaM2' => round($gain, 1),
                    'gainPct' => $summary['uncoveredAreaM2'] > 0 ? round(min(100, $gain / $summary['uncoveredAreaM2'] * 100), 1) : null,
                ];
            }
        }

        // Reubicar: se prueba mover la unidad más cercana a la zona descubierta
        // hacia su punto más desfavorable y se mide la ganancia real.
        $nearestUnits = $zones[0]['nearestUnits'];
        foreach (array_slice($nearestUnits, 0, 2) as $unitId) {
            foreach ($units as $index => $unit) {
                if ((string) $unit['id'] !== $unitId) {
                    continue;
                }
                $moved = $unit;
                $moved['x'] = round(max(0.0, $target['x'] - (float) $unit['w'] / 2), 1);
                $moved['y'] = round(max(0.0, $target['y'] - (float) $unit['h'] / 2), 1);
                $others = $units;
                array_splice($others, $index, 1);
                $after = self::measure($grid, array_merge($others, [$moved]), ['items' => [], 'radiusCm' => 0.0], $profileKey, $hazard, 0.0);
                $gain = (float) $after['summary']['coveredAreaM2'] - $baseCovered;
                if ($gain > 0.5) {
                    $recommendations[] = [
                        'action' => 'move',
                        'elementId' => (string) $unit['id'],
                        'title' => 'Reubicar el extintor',
                        'detail' => sprintf(
                            'Llevar %s al punto más desfavorable de la zona descubierta (x %s, y %s) sumaría unos %s m² sin comprar equipo nuevo.',
                            $unit['id'],
                            self::number((float) $target['x'], 0),
                            self::number((float) $target['y'], 0),
                            self::number($gain)
                        ),
                        'target' => $target,
                        'type' => (string) $unit['type'],
                        'agent' => (string) $unit['extAgent'],
                        'capacityLb' => (float) $unit['extCapacityLb'],
                        'rating' => (string) $unit['extRating'],
                        'element' => $moved,
                        'gainAreaM2' => round($gain, 1),
                        'gainPct' => $summary['uncoveredAreaM2'] > 0 ? round(min(100, $gain / $summary['uncoveredAreaM2'] * 100), 1) : null,
                    ];
                }
                break;
            }
        }

        // Subir capacidad: solo cuando el límite que se incumple es el de área.
        foreach ($result['units'] as $index => $report) {
            if ($report['overAreaM2'] <= 0.5) {
                continue;
            }
            foreach ($units as $unitIndex => $unit) {
                if ((string) $unit['id'] !== $report['id']) {
                    continue;
                }
                $upgrade = self::upgradeCandidate($design, $unit, $report, $profileKey, $hazard);
                if ($upgrade === null) {
                    break;
                }
                $changed = array_merge($unit, [
                    'extRating' => $upgrade['rating'],
                    'extCapacityLb' => $upgrade['capacityLb'],
                ]);
                $others = $units;
                $others[$unitIndex] = $changed;
                $after = self::measure($grid, $others, ['items' => [], 'radiusCm' => 0.0], $profileKey, $hazard, 0.0);
                $gain = (float) $after['summary']['coveredAreaM2'] - $baseCovered;
                if ($gain > 0.5) {
                    $recommendations[] = [
                        'action' => 'upgrade',
                        'elementId' => (string) $unit['id'],
                        'title' => 'Subir la capacidad del extintor',
                        'detail' => sprintf(
                            'Cambiar %s de %s a %s (%s lb) ampliaría el área asignable y sumaría unos %s m². Confirma que la placa real del equipo corresponde a esa clasificación.',
                            $unit['id'],
                            $report['rating'],
                            $upgrade['rating'],
                            self::number($upgrade['capacityLb'], 0),
                            self::number($gain)
                        ),
                        'target' => null,
                        'type' => (string) $unit['type'],
                        'agent' => (string) $unit['extAgent'],
                        'capacityLb' => (float) $upgrade['capacityLb'],
                        'rating' => (string) $upgrade['rating'],
                        'element' => $changed,
                        'gainAreaM2' => round($gain, 1),
                        'gainPct' => $summary['uncoveredAreaM2'] > 0 ? round(min(100, $gain / $summary['uncoveredAreaM2'] * 100), 1) : null,
                    ];
                }
                break;
            }
        }

        usort($recommendations, static fn (array $a, array $b): int => ($b['gainAreaM2'] ?? 0) <=> ($a['gainAreaM2'] ?? 0));
        return array_slice($recommendations, 0, 4);
    }

    /** Unidad nueva de referencia para la simulación de «instalar otro». */
    private static function newUnit(array $design, array $units, array $target, string $profileKey, string $hazard): ?array
    {
        $preferred = null;
        foreach ($units as $unit) {
            if (in_array('A', ExtinguisherNorms::effectiveClasses($unit), true)) {
                $preferred = $unit;
                break;
            }
        }
        $defaults = ExtinguisherNorms::defaultsFor((string) ($preferred['type'] ?? 'cad_eds_extinguisher'))
            ?? ['agent' => 'pqs_abc', 'capacityLb' => 10, 'rating' => '2-A:10-B:C', 'hazard' => $hazard, 'mountCm' => 120];
        $agent = ExtinguisherNorms::agent((string) $defaults['agent']);
        if (!in_array('A', (array) ($agent['classes'] ?? []), true)) {
            $defaults = ExtinguisherNorms::defaultsFor('cad_eds_extinguisher') ?? $defaults;
        }
        $rating = self::minimumRating($profileKey, $hazard);
        $example = self::exampleFor($defaults['agent'], $rating);
        $type = (string) ($preferred['type'] ?? 'cad_eds_extinguisher');
        $layerId = (string) ($preferred['layerId'] ?? ($design['layers'][0]['id'] ?? 'layer'));
        $w = (float) ($preferred['w'] ?? 40);
        $h = (float) ($preferred['h'] ?? 40);
        $suffix = substr(hash('sha1', microtime(true) . random_int(1, 100000)), 0, 6);
        return [
            'suggested' => true,
            'element' => [
                'id' => 'ext_new_' . $suffix,
                'type' => $type,
                'layerId' => $layerId,
                'x' => round(min((float) $design['canvas']['width'] - $w, max(0.0, $target['x'] - $w / 2)), 1),
                'y' => round(min((float) $design['canvas']['height'] - $h, max(0.0, $target['y'] - $h / 2)), 1),
                'w' => $w,
                'h' => $h,
                'rotation' => 0,
                'color' => (string) ($preferred['color'] ?? '#b71f2e'),
                'stroke' => 2,
                'opacity' => 1,
                'label' => '',
                'locked' => false,
                'extAgent' => (string) $defaults['agent'],
                'extCapacityLb' => (float) $example['capacityLb'],
                'extRating' => (string) $example['rating'],
                'extHazard' => $hazard,
                'extMountCm' => (float) ($defaults['mountCm'] ?? 120),
            ],
        ];
    }

    /** Clasificación mínima que pide la norma para el riesgo declarado. */
    private static function minimumRating(string $profileKey, string $hazard): string
    {
        $profile = ExtinguisherNorms::profile($profileKey);
        $a = (int) ($profile['classA']['hazards'][$hazard]['minRatingA'] ?? 2);
        $bRows = (array) ($profile['classB']['hazards'][$hazard] ?? []);
        $b = (int) ($bRows[0]['minRatingB'] ?? 10);
        return sprintf('%d-A:%d-B:C', $a, $b);
    }

    /** Ejemplo de clasificación/capacidad del agente que cumple un mínimo. */
    private static function exampleFor(string $agent, string $minimum): array
    {
        $parsed = ExtinguisherNorms::parseRating($minimum);
        $examples = self::examples($agent);
        $best = null;
        foreach ($examples as $example) {
            $rating = ExtinguisherNorms::parseRating((string) $example['rating']);
            if ($rating['A'] >= $parsed['A'] && $rating['B'] >= $parsed['B']) {
                $best = $example;
                break;
            }
        }
        if ($best !== null) {
            return $best;
        }
        return $examples[0] ?? ['agent' => $agent, 'rating' => $minimum, 'capacityLb' => 10.0];
    }

    private static function upgradeCandidate(array $design, array $unit, array $report, string $profileKey, string $hazard): ?array
    {
        $examples = self::examples((string) ($unit['extAgent'] ?? ''));
        $current = ExtinguisherNorms::parseRating((string) ($unit['extRating'] ?? ''));
        foreach ($examples as $example) {
            $rating = ExtinguisherNorms::parseRating((string) $example['rating']);
            if ($rating['A'] > $current['A'] || ($current['A'] === 0 && $rating['A'] > 0) || $rating['B'] > $current['B']) {
                $capacity = (float) $example['capacityLb'];
                if ($capacity > (float) ($unit['extCapacityLb'] ?? 0) + 0.1) {
                    return ['rating' => (string) $example['rating'], 'capacityLb' => $capacity];
                }
            }
        }
        return null;
    }

    /** Combinaciones de referencia por agente (verificar contra el rótulo). */
    private static function examples(string $agent): array
    {
        $all = (array) (ExtinguisherNorms::criteria()['examples'] ?? []);
        $list = (array) ($all[$agent] ?? []);
        $out = [];
        foreach ($list as $row) {
            $out[] = [
                'rating' => (string) ($row['rating'] ?? ''),
                'capacityLb' => (float) ($row['capacityLb'] ?? 0),
            ];
        }
        return $out;
    }

    private static function agentLabel(string $agent): string
    {
        $row = ExtinguisherNorms::agent($agent);
        return is_array($row) && isset($row['label']) ? (string) $row['label'] : 'extintor';
    }

    private static function number(float $value, int $decimals = 1): string
    {
        return number_format($value, $decimals, ',', '.');
    }
}
