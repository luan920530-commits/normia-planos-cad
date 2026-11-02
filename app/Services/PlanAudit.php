<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Units;
use JsonException;

/**
 * Auditor de planos de emergencia.
 *
 * Revisa la geometría real del plano (muros, puertas, rutas y señalización) y
 * devuelve métricas de evacuación y hallazgos con severidad. El recorrido se
 * calcula sobre una rejilla libre que respeta los muros y sus vanos, de modo
 * que el valor corresponde al camino más corto desde cada punto hasta una
 * salida marcada.
 *
 * Los umbrales son referencias configurables en `resources/audit-criteria.json`.
 * El resultado es un apoyo de revisión: no es un dictamen, no certifica
 * cumplimiento normativo y no sustituye la verificación en sitio.
 */
final class PlanAudit
{
    public const SEVERITIES = ['high', 'medium', 'low', 'info'];

    public const SEVERITY_LABELS = [
        'high' => 'Crítico',
        'medium' => 'Importante',
        'low' => 'Menor',
        'info' => 'Informativo',
    ];

    private const METERS_ROUND = 2;

    private static ?array $criteria = null;

    /* ------------------------------- criterios ------------------------------- */

    public static function criteria(): array
    {
        if (self::$criteria !== null) {
            return self::$criteria;
        }
        $path = dirname(__DIR__, 2) . '/resources/audit-criteria.json';
        $defaults = [
            'version' => 1,
            'notice' => 'Umbrales de referencia configurables.',
            'grid' => ['cellCm' => 20, 'wallClearanceCm' => 4, 'maxCells' => 120000],
            'egress' => [
                'maxTravelM' => 30,
                'minExitCount' => 2,
                'minExitWidthCm' => 80,
                'doorClearanceFactor' => 0.9,
                'widthMmPerPerson' => 5,
                'travelSpeedMps' => 1,
                'flowPersonsPerSecondPerMeter' => 1.3,
                'routeExitToleranceCm' => 80,
                'minRoomAreaM2' => 2,
            ],
            'occupancy' => ['densityPersonsPerM2' => 0.2, 'maxPersons' => 10000],
            'signs' => [
                'exitSignCodes' => ['E001', 'E002'],
                'exitSignRadiusCm' => 150,
                'fireSignCodes' => ['F001', 'F002', 'F005'],
                'youAreHereCode' => 'SVC_AQUI',
            ],
            'firstAid' => [
                'notice' => 'Recursos de primeros auxilios con umbrales de referencia configurables.',
                'reference' => 'Decreto 1072 de 2015 · Resolución 0312 de 2019 · Ley 1831 de 2017 y Resolución 3316 de 2019 (DEA)',
                'kitTravelM' => 30,
                'stretcherPerFloor' => true,
                'aedMinPersons' => 500,
                'aedTravelM' => 100,
            ],
        ];
        if (!is_file($path)) {
            return self::$criteria = $defaults;
        }
        try {
            $raw = json_decode((string) file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return self::$criteria = $defaults;
        }
        if (!is_array($raw)) {
            return self::$criteria = $defaults;
        }
        $merged = $defaults;
        foreach (['grid', 'egress', 'occupancy', 'signs', 'firstAid'] as $block) {
            if (isset($raw[$block]) && is_array($raw[$block])) {
                $merged[$block] = array_merge($defaults[$block], $raw[$block]);
            }
        }
        if (isset($raw['notice']) && is_string($raw['notice']) && $raw['notice'] !== '') {
            $merged['notice'] = $raw['notice'];
        }
        $merged['version'] = (int) ($raw['version'] ?? 1);
        return self::$criteria = $merged;
    }

    /* -------------------------------- aforo -------------------------------- */

    /**
     * Aforo del piso: cuánta gente cabe según la superficie libre, cuánta hay
     * declarada y con cuántas se calcula la salida.
     *
     * Es una sola fórmula, usada por el informe, el pie del plano exportado y el
     * cajón de revisión del editor:
     *
     *   aforo máximo = superficie libre (m²) × densidad de referencia
     *
     * | Clave | Qué es |
     * | --- | --- |
     * | `maxPersons` | capacidad calculada con la superficie libre y la densidad, limitada por `occupancy.maxPersons` |
     * | `declared` | lo que se escribió en *Ajustes del piso*; `0` = sin declarar |
     * | `permitted` | el aforo que rige: el declarado si no supera el máximo; si no, el máximo |
     * | `used` | personas con las que se calculan ancho y tiempo de salida |
     * | `excess` | personas declaradas por encima del máximo (0 si no hay exceso) |
     * | `source` | `declared` o `estimated` |
     *
     * `used` es la declarada cuando existe: si el plano declara más gente de la
     * que cabe, el tiempo de salida tiene que reflejar esa gente, no la capacidad.
     * Reducirla en silencio daría un tiempo optimista. Lo que sí se dice, con un
     * hallazgo propio, es que el aforo declarado supera el máximo.
     *
     * @return array{maxPersons:int,declared:int,permitted:int,used:int,excess:int,source:string,freeAreaM2:float,density:float,cap:int}
     */
    public static function aforo(array $design, int $occupancy = 0): array
    {
        $criteria = self::criteria();
        $free = self::freeArea($design, $criteria);
        return self::aforoFromArea($free['freeAreaM2'], $occupancy, $design, $criteria);
    }

    /**
     * La misma cuenta cuando la superficie libre ya se conoce (el recorrido usa
     * la rejilla y no vamos a construirla dos veces).
     *
     * @return array{maxPersons:int,declared:int,permitted:int,used:int,excess:int,source:string,freeAreaM2:float,density:float,cap:int}
     */
    private static function aforoFromArea(float $freeAreaM2, int $occupancy, array $design, array $criteria): array
    {
        $canvas = is_array($design['canvas'] ?? null) ? $design['canvas'] : [];
        $declared = max(0, $occupancy);
        if ($declared === 0) {
            $declared = max(0, (int) ($canvas['occupancy'] ?? 0));
        }
        $density = max(0.0, (float) $criteria['occupancy']['densityPersonsPerM2']);
        $cap = max(1, (int) $criteria['occupancy']['maxPersons']);
        $freeAreaM2 = max(0.0, $freeAreaM2);
        // Sin densidad no hay capacidad calculable: si el criterio se pone en 0,
        // el máximo es el techo declarado y no se inventa una cifra.
        $maxPersons = $density > 0.0
            ? (int) min($cap, max(1, (int) round($freeAreaM2 * $density)))
            : $cap;
        $permitted = $declared > 0 ? min($declared, $maxPersons) : $maxPersons;
        return [
            'maxPersons' => $maxPersons,
            'declared' => $declared,
            'permitted' => $permitted,
            'used' => $declared > 0 ? $declared : $maxPersons,
            'excess' => max(0, $declared - $maxPersons),
            'source' => $declared > 0 ? 'declared' : 'estimated',
            'freeAreaM2' => self::round($freeAreaM2),
            'density' => $density,
            'cap' => $cap,
        ];
    }

    /**
     * Superficie libre del piso y su exterior, sin calcular recorridos. Es la
     * base del aforo y de la ficha del pie de página, donde no hace falta el
     * camino más largo hasta cada salida.
     *
     * @return array{freeAreaM2:float,exteriorAreaM2:float,cellM:float}
     */
    public static function freeArea(array $design, ?array $criteria = null): array
    {
        $criteria ??= self::criteria();
        $walls = [];
        $doors = [];
        foreach ($design['elements'] as $element) {
            if (!self::layerVisible($design, (string) ($element['layerId'] ?? ''))) {
                continue;
            }
            $type = (string) ($element['type'] ?? '');
            if ($type === 'wall') {
                $walls[] = [
                    'id' => (string) $element['id'],
                    'points' => PlanGrid::visualPoints($element, Units::GEOMETRY_UNIT),
                    'stroke' => max(1.0, (float) ($element['stroke'] ?? 2)),
                ];
            } elseif (in_array($type, DesignValidator::DOOR_TYPES, true)) {
                $doors[] = ['id' => (string) $element['id'], 'opening' => PlanGrid::doorOpening($element)];
            }
        }
        $grid = PlanGrid::build($design, $walls, $doors, $criteria);
        return [
            'freeAreaM2' => self::round((float) $grid['freeAreaM2']),
            'exteriorAreaM2' => self::round((float) ($grid['exteriorAreaM2'] ?? 0.0)),
            'cellM' => self::round((float) $grid['cellM'], 2),
        ];
    }

    /* ------------------------------ análisis ------------------------------ */

    /**
     * @param array $design  Diseño ya normalizado por DesignValidator.
     * @param int   $occupancy Ocupación declarada (personas). 0 = no declarada.
     */
    public static function analyze(array $design, int $occupancy = 0): array
    {
        $criteria = self::criteria();
        $canvas = $design['canvas'];
        $elements = array_values(array_filter(
            $design['elements'],
            static fn (array $element): bool => self::layerVisible($design, (string) $element['layerId'])
        ));
        /* La geometría del documento está siempre en centímetros (NORMIA-006
           §3): `canvas.unit` es solo cómo se leen las cifras. El auditor no
           pregunta por la unidad del plano, la da por centímetros. */
        $geometry = Units::GEOMETRY_UNIT;
        $cmPerUnit = Units::cmPerUnit($geometry);
        $metersPerUnit = Units::metersPerUnit($geometry);
        $toUnits = static fn (float $cm): float => Units::fromCm($cm, $geometry);

        $exits = [];
        $doors = [];
        $walls = [];
        $routes = [];
        $signCodes = [];
        foreach ($elements as $element) {
            $type = (string) $element['type'];
            if (in_array($type, DesignValidator::DOOR_TYPES, true)) {
                // El ancho del vano manda desde la medida declarada si la hay
                // (NORMIA-006 §6.1); si no, la geometría en centímetros.
                [$doorWidthCm, $doorSource] = ElementMeasure::lengthCm($element);
                $door = [
                    'id' => (string) $element['id'],
                    'type' => $type,
                    'widthM' => self::round($doorWidthCm * $metersPerUnit),
                    'widthSource' => $doorSource,
                    'opening' => PlanGrid::doorOpening($element),
                    'center' => [
                        'x' => (float) $element['x'] + (float) $element['w'] / 2,
                        'y' => (float) $element['y'] + (float) $element['h'] / 2,
                    ],
                    'isExit' => (bool) ($element['isExit'] ?? false),
                ];
                $doors[] = $door;
                if ($door['isExit']) {
                    $exits[] = $door;
                }
                continue;
            }
            if ($type === 'wall') {
                $walls[] = [
                    'id' => (string) $element['id'],
                    'points' => PlanGrid::visualPoints($element, Units::GEOMETRY_UNIT),
                    'stroke' => max(1.0, (float) ($element['stroke'] ?? 2)),
                ];
                continue;
            }
            if ($type === 'route') {
                $routes[] = ['id' => (string) $element['id'], 'element' => $element, 'points' => PlanGrid::visualPoints($element, Units::GEOMETRY_UNIT)];
                continue;
            }
            $code = LibraryRepository::codeForType($type);
            if ($code !== null) {
                $signCodes[] = $code;
            }
        }

        $findings = [];
        $add = static function (
            array &$list,
            string $code,
            string $severity,
            string $title,
            string $detail,
            array $elementIds = [],
            ?array $position = null,
            ?string $value = null
        ): void {
            $list[] = [
                'code' => $code,
                'severity' => $severity,
                'title' => $title,
                'detail' => $detail,
                'elements' => array_values(array_unique($elementIds)),
                'position' => $position === null ? null : ['x' => self::round($position['x']), 'y' => self::round($position['y'])],
                'value' => $value,
            ];
        };

        /* --------------------------- salidas --------------------------- */
        $clearFactor = (float) $criteria['egress']['doorClearanceFactor'];
        $exitWidthM = array_sum(array_map(static fn (array $exit): float => $exit['widthM'], $exits));
        $availableWidthM = self::round($exitWidthM * $clearFactor);
        $minExitWidthM = ((float) $criteria['egress']['minExitWidthCm']) / 100;

        if ($exits === []) {
            $add(
                $findings,
                'no_exit',
                'high',
                'Sin salidas de emergencia marcadas',
                'Ninguna puerta está marcada como salida de emergencia. Selecciona una puerta exterior y activa «Salida de emergencia» en Apariencia para que el auditor pueda medir el recorrido.',
                array_map(static fn (array $door): string => $door['id'], $doors)
            );
        } else {
            if (count($exits) < (int) $criteria['egress']['minExitCount']) {
                $add(
                    $findings,
                    'too_few_exits',
                    'medium',
                    'Pocas salidas de emergencia',
                    sprintf(
                        'El plano declara %d salida%s y el criterio de referencia pide al menos %d. Revisa si el uso y la ocupación del piso exigen una segunda vía de evacuación.',
                        count($exits),
                        count($exits) === 1 ? '' : 's',
                        (int) $criteria['egress']['minExitCount']
                    ),
                    array_map(static fn (array $exit): string => $exit['id'], $exits)
                );
            }
            foreach ($exits as $exit) {
                if ($exit['widthM'] + 0.001 < $minExitWidthM) {
                    $add(
                        $findings,
                        'narrow_exit',
                        'medium',
                        'Salida más angosta que el mínimo de referencia',
                        sprintf(
                            'La salida mide %s m de vano y el criterio de referencia pide %s m como mínimo. Verifica el ancho libre real, descartando marcos y hojas abiertas.',
                            self::number($exit['widthM']),
                            self::number($minExitWidthM)
                        ),
                        [$exit['id']],
                        $exit['center'],
                        self::number($exit['widthM']) . ' m'
                    );
                }
            }
        }

        /* ---------------------- rejilla de recorrido ---------------------- */
        $field = self::travelField($design, $walls, $doors, $exits, $criteria, $cmPerUnit);
        $travel = [
            'longestM' => null,
            'farthest' => null,
            'limitM' => self::round((float) $criteria['egress']['maxTravelM']),
            'freeAreaM2' => $field['freeAreaM2'],
            'exteriorAreaM2' => $field['exteriorAreaM2'] ?? 0.0,
            'reachableAreaM2' => $field['reachableAreaM2'],
            'unreachableAreaM2' => $field['unreachableAreaM2'],
            'cellM' => $field['cellM'],
            'computed' => $field['computed'],
        ];
        if ($field['computed']) {
            $travel['longestM'] = $field['longestM'];
            $travel['farthest'] = $field['farthest'];
            if ($field['longestM'] !== null && $field['longestM'] > $travel['limitM']) {
                $add(
                    $findings,
                    'travel_too_long',
                    'high',
                    'Recorrido de evacuación demasiado largo',
                    sprintf(
                        'El punto más alejado queda a %s m de una salida por el camino libre y el criterio de referencia admite %s m. Revisa la ubicación de las salidas o los obstáculos del recorrido.',
                        self::number((float) $field['longestM']),
                        self::number($travel['limitM'])
                    ),
                    array_map(static fn (array $exit): string => $exit['id'], $exits),
                    $field['farthest'],
                    self::number((float) $field['longestM']) . ' m'
                );
            }
            foreach ($field['rooms'] as $room) {
                $add(
                    $findings,
                    'unreachable_area',
                    'high',
                    'Recinto sin salida alcanzable',
                    sprintf(
                        'Hay una zona de %s m² a la que no llega ningún recorrido desde las salidas marcadas: puede faltar una puerta, un vano está tapado o el muro cierra el paso.',
                        self::number($room['areaM2'])
                    ),
                    [],
                    $room['center'],
                    self::number($room['areaM2']) . ' m²'
                );
            }
        }

        /* --------------------------- rutas --------------------------- */
        $routesReport = [];
        if ($routes === []) {
            $add(
                $findings,
                'no_route',
                'medium',
                'Sin ruta de evacuación dibujada',
                'El plano no tiene ninguna ruta de evacuación. Dibújala con la herramienta Ruta para que el plano indique cómo salir y para poder revisar su trazado.'
            );
        }
        $exitTolerance = $toUnits((float) $criteria['egress']['routeExitToleranceCm']);
        foreach ($routes as $route) {
            $points = $route['points'];
            $lengthU = 0.0;
            for ($index = 0; $index < count($points) - 1; $index += 1) {
                $lengthU += self::distance($points[$index], $points[$index + 1]);
            }
            [$measuredCm, $lengthSource] = ElementMeasure::lengthCm($route['element']);
            // Con medida declarada manda ella; sin ella, el recorrido dibujado.
            $lengthM = self::round(($lengthSource === ElementMeasure::SOURCE_MEASURED ? $measuredCm : $lengthU) * $metersPerUnit);
            $end = $points[count($points) - 1];
            $nearest = null;
            foreach ($exits as $exit) {
                $gap = self::distance($end, $exit['center']);
                if ($nearest === null || $gap < $nearest) {
                    $nearest = $gap;
                }
            }
            $endsAtExit = $nearest !== null && $nearest <= $exitTolerance;
            $crossings = self::wallCrossings($points, $walls, $doors, $cmPerUnit);
            $routesReport[] = [
                'id' => $route['id'],
                'label' => trim((string) ($route['element']['label'] ?? '')),
                'lengthM' => $lengthM,
                'lengthSource' => $lengthSource,
                'endsAtExit' => $endsAtExit,
                'distanceToExitM' => $nearest === null ? null : self::round($nearest * $metersPerUnit),
                'wallCrossings' => $crossings,
            ];
            if ($exits !== [] && !$endsAtExit) {
                $add(
                    $findings,
                    'route_no_exit',
                    'medium',
                    'Ruta que no termina en una salida',
                    sprintf(
                        'El final de la ruta queda a %s m de la salida marcada más cercana. Ajusta el trazado o marca la puerta correcta como salida de emergencia.',
                        $nearest === null ? '—' : self::number((float) round($nearest * $metersPerUnit, 1))
                    ),
                    [$route['id']],
                    $end,
                    $nearest === null ? null : self::number((float) round($nearest * $metersPerUnit, 1)) . ' m'
                );
            }
            if ($crossings > 0) {
                $add(
                    $findings,
                    'route_through_wall',
                    'high',
                    'Ruta que atraviesa un muro',
                    sprintf(
                        'El trazado cruza %d vez%s un muro fuera de un vano. Una ruta de evacuación no puede pasar por una pared: corrige el trazo o abre el paso correspondiente.',
                        $crossings,
                        $crossings === 1 ? '' : 'ces'
                    ),
                    [$route['id']],
                    $points[0],
                    (string) $crossings
                );
            }
        }

        /* ------------------------ ocupación y ancho ------------------------ */
        /* Aforo: capacidad por superficie libre, aforo declarado y aforo que
           rige. Una sola fórmula para el informe, el pie y el editor. */
        $aforo = self::aforoFromArea(max(0.0, $field['freeAreaM2']), $occupancy, $design, $criteria);
        $declared = $aforo['used'];
        $occupancySource = $aforo['source'];
        $freeAreaM2 = max(0.0, $field['freeAreaM2']);
        if ($aforo['excess'] > 0) {
            $add(
                $findings,
                'occupancy_over_capacity',
                'medium',
                'Aforo declarado por encima de la capacidad del piso',
                sprintf(
                    'El piso declara %d personas y su superficie libre de %s m² admite %d con la densidad de referencia (%s pers./m²). El aforo permitido queda en %d: reduce la ocupación, amplía la superficie útil o ajusta la densidad documentada.',
                    $aforo['declared'],
                    self::number($aforo['freeAreaM2']),
                    $aforo['maxPersons'],
                    self::number($aforo['density'], 2),
                    $aforo['permitted']
                ),
                [],
                null,
                $aforo['declared'] . ' de ' . $aforo['maxPersons']
            );
        }
        if ($occupancySource === 'estimated') {
            $add(
                $findings,
                'occupancy_missing',
                'info',
                'Ocupación no declarada',
                sprintf(
                    'No hay ocupación declarada para el piso, así que el ancho y el tiempo se estiman con %d personas a partir de %s m² de superficie libre y una densidad de referencia. Declara la ocupación real en Ajustes del piso.',
                    $declared,
                    self::number($freeAreaM2)
                ),
                [],
                null,
                (string) $declared
            );
        }
        $requiredWidthM = self::round($declared * ((float) $criteria['egress']['widthMmPerPerson']) / 1000);
        if ($requiredWidthM > 0 && $availableWidthM > 0 && $requiredWidthM > $availableWidthM + 0.001) {
            $add(
                $findings,
                'width_short',
                'medium',
                'Ancho de salida insuficiente para la ocupación',
                sprintf(
                    'Con %d personas el criterio de referencia pide %s m de ancho útil y las salidas marcadas suman %s m. Revisa el número de salidas o su ancho libre.',
                    $declared,
                    self::number($requiredWidthM),
                    self::number($availableWidthM)
                ),
                array_map(static fn (array $exit): string => $exit['id'], $exits),
                null,
                self::number($requiredWidthM) . ' m'
            );
        }

        /* ------------------------ señalización ------------------------ */
        $exitSignCodes = array_map('strtoupper', array_map('strval', (array) $criteria['signs']['exitSignCodes']));
        $exitSignRadius = $toUnits((float) $criteria['signs']['exitSignRadiusCm']);
        $exitSigns = [];
        foreach ($elements as $element) {
            $code = LibraryRepository::codeForType((string) $element['type']);
            if ($code === null) {
                continue;
            }
            if (in_array($code, $exitSignCodes, true)) {
                $exitSigns[] = [
                    'id' => (string) $element['id'],
                    'center' => [
                        'x' => (float) $element['x'] + (float) $element['w'] / 2,
                        'y' => (float) $element['y'] + (float) $element['h'] / 2,
                    ],
                ];
            }
        }
        foreach ($exits as $exit) {
            $covered = false;
            foreach ($exitSigns as $sign) {
                if (self::distance($sign['center'], $exit['center']) <= $exitSignRadius) {
                    $covered = true;
                    break;
                }
            }
            if (!$covered) {
                $add(
                    $findings,
                    'exit_without_sign',
                    'low',
                    'Salida sin señal de emergencia cercana',
                    sprintf(
                        'No hay una señal de salida de emergencia a menos de %s m de esta salida. Coloca el pictograma junto al vano y en el sentido de evacuación.',
                        self::number((float) $criteria['signs']['exitSignRadiusCm'] / 100)
                    ),
                    [$exit['id']],
                    $exit['center']
                );
            }
        }
        $youAreHereCode = (string) $criteria['signs']['youAreHereCode'];
        $hasYouAreHere = in_array($youAreHereCode, $signCodes, true);
        if (!$hasYouAreHere) {
            $add(
                $findings,
                'no_you_are_here',
                'low',
                'Falta el marcador «Usted está aquí»',
                'Un plano de evacuación sin el punto de partida del lector obliga a adivinar dónde está. Añade la señal SVC_AQUI de la familia Ubicación.'
            );
        }
        $fireCodes = array_map('strtoupper', array_map('strval', (array) $criteria['signs']['fireSignCodes']));
        if (array_intersect($fireCodes, $signCodes) === []) {
            $add(
                $findings,
                'no_fire_sign',
                'info',
                'Sin señalización de protección contra incendios',
                'El plano no incluye pictogramas de extintor, manguera o medios de extinción. Si el piso cuenta con ellos, ubícalos para que el recorrido hasta el equipo sea visible.'
            );
        }

        /* ---------------------------- extintores ---------------------------- */
        $extinguishers = ExtinguisherCoverage::analyze($design);
        foreach ($extinguishers['findings'] as $finding) {
            $findings[] = $finding;
        }

        /* --------------------- primeros auxilios (1.23.0) ---------------------
         * Botiquín, camilla y DEA. La ocupación que se pasa es la declarada; si
         * no hay, el propio inventario usa la capacidad calculada. */
        $firstAid = FirstAidInventory::analyze($design, $declared);
        foreach ($firstAid['findings'] as $finding) {
            $findings[] = $finding;
        }

        /* ------------------ escenarios de ocupación temporal ------------------
         * A-04 (NORMIA-006 §31): un evento con más gente que el uso habitual se
         * calcula con las mismas fórmulas del piso y aparte, para que el aforo
         * del uso habitual no cambie en silencio. */
        $speed = max(0.1, (float) $criteria['egress']['travelSpeedMps']);
        $walkTimeS = $travel['longestM'] === null ? null : self::round((float) $travel['longestM'] / $speed, 1);
        $scenarios = OccupancyScenarios::analyze($design, $aforo, $availableWidthM, $walkTimeS);
        foreach ($scenarios['findings'] as $finding) {
            $findings[] = $finding;
        }

        /* ------------------------------ orden ------------------------------ */
        usort($findings, static function (array $a, array $b): int {
            $order = array_flip(self::SEVERITIES);
            return [$order[$a['severity']] ?? 9, $a['title']] <=> [$order[$b['severity']] ?? 9, $b['title']];
        });
        $counts = ['high' => 0, 'medium' => 0, 'low' => 0, 'info' => 0];
        foreach ($findings as $finding) {
            $counts[$finding['severity']] += 1;
        }

        $flow = max(0.0, (float) $criteria['egress']['flowPersonsPerSecondPerMeter']);
        $queueTimeS = ($availableWidthM > 0 && $flow > 0)
            ? self::round($declared / ($flow * $availableWidthM), 1)
            : null;
        $estimatedTimeS = ($walkTimeS === null || $queueTimeS === null) ? null : self::round($walkTimeS + $queueTimeS, 1);

        return [
            'criteria' => $criteria,
            'findings' => $findings,
            'counts' => $counts,
            'exits' => [
                'count' => count($exits),
                'widthM' => self::round($exitWidthM),
                'clearWidthM' => $availableWidthM,
                'items' => array_map(static fn (array $exit): array => [
                    'id' => $exit['id'],
                    'type' => $exit['type'],
                    'widthM' => $exit['widthM'],
                ], $exits),
            ],
            'doors' => [
                'count' => count($doors),
                'exits' => count($exits),
            ],
            'travel' => $travel,
            'occupancy' => [
                // `people` es con quién se calcula; el aforo va aparte para que
                // el informe pueda decir «caben 23, declaras 30, rigen 23».
                'people' => $declared,
                'source' => $occupancySource,
                'density' => (float) $criteria['occupancy']['densityPersonsPerM2'],
                'maxPersons' => $aforo['maxPersons'],
                'declared' => $aforo['declared'],
                'permitted' => $aforo['permitted'],
                'excess' => $aforo['excess'],
                'freeAreaM2' => $aforo['freeAreaM2'],
                'cap' => $aforo['cap'],
                'formula' => 'superficie libre × densidad de referencia',
            ],
            'egress' => [
                'requiredWidthM' => $requiredWidthM,
                'availableWidthM' => $availableWidthM,
                'walkTimeS' => $walkTimeS,
                'queueTimeS' => $queueTimeS,
                'estimatedTimeS' => $estimatedTimeS,
                'speedMps' => $speed,
            ],
            'extinguishers' => $extinguishers,
            'firstAid' => $firstAid,
            'scenarios' => $scenarios,
            'routes' => $routesReport,
            'signs' => [
                'youAreHere' => $hasYouAreHere,
                'exitSigns' => count($exitSigns),
                'fireSigns' => array_values(array_intersect($fireCodes, $signCodes)),
            ],
            'elements' => count($elements),
        ];
    }

    /* ------------------------------ rejilla ------------------------------ */

    /**
     * Campo de distancias hasta la salida más cercana sobre el espacio libre.
     * Los muros se bloquean y los vanos de las puertas se abren, de modo que
     * cada recinto queda alcanzable solo si tiene un paso real.
     */
    private static function travelField(
        array $design,
        array $walls,
        array $doors,
        array $exits,
        array $criteria,
        float $cmPerUnit
    ): array {
        $grid = PlanGrid::build($design, $walls, $doors, $criteria);
        $width = $grid['width'];
        $height = $grid['height'];
        $cell = $grid['cell'];
        $nx = $grid['nx'];
        $ny = $grid['ny'];
        $clearance = $grid['clearance'];
        $cellM = $grid['cellM'];
        $cellAreaM2 = $grid['cellAreaM2'];
        $blocked = $grid['blocked'];
        $exterior = $grid['exterior'];
        $freeAreaM2 = $grid['freeAreaM2'];
        $exteriorAreaM2 = $grid['exteriorAreaM2'];
        $index = static fn (int $ix, int $iy): int => $iy * $nx + $ix;

        if ($exits === []) {
            return [
                'computed' => false,
                'cellM' => self::round($cellM, 2),
                'freeAreaM2' => self::round($freeAreaM2),
                'exteriorAreaM2' => self::round($exteriorAreaM2),
                'reachableAreaM2' => 0.0,
                'unreachableAreaM2' => self::round($freeAreaM2),
                'longestM' => null,
                'farthest' => null,
                'rooms' => [],
            ];
        }

        // Origen: celdas del vano de cada salida.
        $dist = array_fill(0, $nx * $ny, INF);
        $queue = new \SplPriorityQueue();
        $queue->setExtractFlags(\SplPriorityQueue::EXTR_BOTH);
        $seed = max(1, (int) ceil(($clearance + $cell) / $cell));
        foreach ($exits as $exit) {
            $mid = [
                'x' => ($exit['opening'][0]['x'] + $exit['opening'][1]['x']) / 2,
                'y' => ($exit['opening'][0]['y'] + $exit['opening'][1]['y']) / 2,
            ];
            $cx = (int) floor($mid['x'] / $cell);
            $cy = (int) floor($mid['y'] / $cell);
            for ($iy = max(0, $cy - $seed); $iy <= min($ny - 1, $cy + $seed); $iy += 1) {
                for ($ix = max(0, $cx - $seed); $ix <= min($nx - 1, $cx + $seed); $ix += 1) {
                    $cellIndex = $index($ix, $iy);
                    if ($blocked[$cellIndex] || $exterior[$cellIndex] || $dist[$cellIndex] === 0.0) {
                        continue;
                    }
                    $dist[$cellIndex] = 0.0;
                    $queue->insert($cellIndex, 0);
                }
            }
        }

        $neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        while (!$queue->isEmpty()) {
            /** @var array{data:int,priority:float|int} $item */
            $item = $queue->extract();
            $current = (int) $item['data'];
            $currentCost = -((float) $item['priority']);
            if ($currentCost > $dist[$current] + 0.0001) {
                continue;
            }
            $ix = $current % $nx;
            $iy = intdiv($current, $nx);
            foreach ($neighbours as [$dx, $dy]) {
                $jx = $ix + $dx;
                $jy = $iy + $dy;
                if ($jx < 0 || $jy < 0 || $jx >= $nx || $jy >= $ny) {
                    continue;
                }
                $next = $index($jx, $jy);
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

        $longest = null;
        $farthest = null;
        $reachable = 0;
        $reachableAreaM2 = 0.0;
        for ($iy = 0; $iy < $ny; $iy += 1) {
            for ($ix = 0; $ix < $nx; $ix += 1) {
                $cellIndex = $index($ix, $iy);
                if ($blocked[$cellIndex] || $exterior[$cellIndex]) {
                    continue;
                }
                if (is_finite($dist[$cellIndex])) {
                    $reachable += 1;
                    $reachableAreaM2 += $cellAreaM2;
                    if ($longest === null || $dist[$cellIndex] > $longest) {
                        $longest = $dist[$cellIndex];
                        $farthest = self::cellCenter($ix, $iy, $cell, $width, $height);
                    }
                }
            }
        }

        // Zonas libres sin salida: se agrupan para no repetir un aviso por celda.
        $rooms = [];
        $seen = array_fill(0, $nx * $ny, false);
        $minRoomArea = max(0.0, (float) $criteria['egress']['minRoomAreaM2']);
        for ($iy = 0; $iy < $ny; $iy += 1) {
            for ($ix = 0; $ix < $nx; $ix += 1) {
                $start = $index($ix, $iy);
                if ($blocked[$start] || $exterior[$start] || is_finite($dist[$start]) || $seen[$start]) {
                    continue;
                }
                $stack = [[$ix, $iy]];
                $seen[$start] = true;
                $count = 0;
                $sumX = 0.0;
                $sumY = 0.0;
                while ($stack !== []) {
                    [$cx, $cy] = array_pop($stack);
                    $count += 1;
                    $center = self::cellCenter($cx, $cy, $cell, $width, $height);
                    $sumX += $center['x'];
                    $sumY += $center['y'];
                    foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                        $jx = $cx + $dx;
                        $jy = $cy + $dy;
                        if ($jx < 0 || $jy < 0 || $jx >= $nx || $jy >= $ny) {
                            continue;
                        }
                        $next = $index($jx, $jy);
                        if ($blocked[$next] || $exterior[$next] || is_finite($dist[$next]) || $seen[$next]) {
                            continue;
                        }
                        $seen[$next] = true;
                        $stack[] = [$jx, $jy];
                    }
                }
                $area = $count * $cellAreaM2;
                if ($area + 0.0001 >= $minRoomArea) {
                    $rooms[] = [
                        'areaM2' => self::round($area),
                        'cells' => $count,
                        'center' => ['x' => $sumX / $count, 'y' => $sumY / $count],
                    ];
                }
            }
        }
        usort($rooms, static fn (array $a, array $b): int => $b['areaM2'] <=> $a['areaM2']);

        return [
            'computed' => true,
            'cellM' => self::round($cellM, 2),
            'freeAreaM2' => self::round($freeAreaM2),
            'exteriorAreaM2' => self::round($exteriorAreaM2),
            'reachableAreaM2' => self::round($reachableAreaM2),
            'unreachableAreaM2' => self::round($freeAreaM2 - $reachableAreaM2),
            'longestM' => $longest === null ? null : self::round($longest),
            'farthest' => $farthest,
            'rooms' => array_slice($rooms, 0, 5),
        ];
    }

    /* ------------------------------ geometría ------------------------------ */

    private static function wallCrossings(array $points, array $walls, array $doors, float $cmPerUnit): int
    {
        $openings = array_map(static fn (array $door): array => $door['opening'], $doors);
        $tolerance = max(6.0, 12.0 / max(0.0001, $cmPerUnit));
        $count = 0;
        for ($index = 0; $index < count($points) - 1; $index += 1) {
            $a = $points[$index];
            $b = $points[$index + 1];
            foreach ($walls as $wall) {
                for ($w = 0; $w < count($wall['points']) - 1; $w += 1) {
                    $hit = self::segmentIntersection($a, $b, $wall['points'][$w], $wall['points'][$w + 1]);
                    if ($hit === null) {
                        continue;
                    }
                    $inOpening = false;
                    foreach ($openings as $opening) {
                        if (self::distanceToSegment($hit, $opening[0], $opening[1]) <= $tolerance) {
                            $inOpening = true;
                            break;
                        }
                    }
                    if (!$inOpening) {
                        $count += 1;
                    }
                }
            }
        }
        return $count;
    }

    private static function segmentIntersection(array $a, array $b, array $c, array $d): ?array
    {
        $r = ['x' => $b['x'] - $a['x'], 'y' => $b['y'] - $a['y']];
        $s = ['x' => $d['x'] - $c['x'], 'y' => $d['y'] - $c['y']];
        $denominator = $r['x'] * $s['y'] - $r['y'] * $s['x'];
        if (abs($denominator) < 1e-9) {
            return null;
        }
        $diff = ['x' => $c['x'] - $a['x'], 'y' => $c['y'] - $a['y']];
        $t = ($diff['x'] * $s['y'] - $diff['y'] * $s['x']) / $denominator;
        $u = ($diff['x'] * $r['y'] - $diff['y'] * $r['x']) / $denominator;
        if ($t < -0.0001 || $t > 1.0001 || $u < -0.0001 || $u > 1.0001) {
            return null;
        }
        return ['x' => $a['x'] + $t * $r['x'], 'y' => $a['y'] + $t * $r['y']];
    }

    private static function distance(array $a, array $b): float
    {
        return hypot($b['x'] - $a['x'], $b['y'] - $a['y']);
    }

    private static function distanceToSegment(array $point, array $a, array $b): float
    {
        $dx = $b['x'] - $a['x'];
        $dy = $b['y'] - $a['y'];
        $length = $dx * $dx + $dy * $dy;
        if ($length < 1e-9) {
            return self::distance($point, $a);
        }
        $t = (($point['x'] - $a['x']) * $dx + ($point['y'] - $a['y']) * $dy) / $length;
        $t = max(0.0, min(1.0, $t));
        return self::distance($point, ['x' => $a['x'] + $t * $dx, 'y' => $a['y'] + $t * $dy]);
    }

    private static function cellCenter(int $ix, int $iy, float $cell, float $width, float $height): array
    {
        return [
            'x' => min($width, ($ix + 0.5) * $cell),
            'y' => min($height, ($iy + 0.5) * $cell),
        ];
    }

    private static function layerVisible(array $design, string $layerId): bool
    {
        foreach ($design['layers'] as $layer) {
            if ((string) $layer['id'] === $layerId) {
                return (bool) $layer['visible'];
            }
        }
        return false;
    }

    private static function round(float $value, int $decimals = self::METERS_ROUND): float
    {
        return round($value, $decimals);
    }

    private static function number(float $value): string
    {
        return number_format($value, 2, ',', '.');
    }
}
