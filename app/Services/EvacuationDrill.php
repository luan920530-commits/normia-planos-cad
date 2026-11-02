<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Units;

/**
 * Simulacro de evacuación: el tiempo objetivo del piso, ruta por ruta.
 *
 * Un simulacro real se mide con cronómetro y se anota quién participó. Lo que
 * un plano puede hacer antes de ese día es decir **cuánto debería tardar** con
 * las rutas que están dibujadas, la distancia real del trazo y la velocidad de
 * referencia del criterio, más el tiempo de reacción que se declare.
 *
 * ```text
 * tiempo objetivo = reacción + camino hasta la salida + tramo al punto de encuentro
 * ```
 *
 * El tiempo de reacción (pre-movimiento) es lo que pasa entre la alarma y la
 * primera persona que camina: se declara en Ajustes del piso y por defecto son
 * 30 s. La velocidad es la del criterio (`egress.travelSpeedMps`, 1 m/s), no una
 * medición de esta brigada.
 *
 * Si el piso declara además un **tiempo medido** en un simulacro, el informe
 * compara objetivo y real y avisa cuando lo medido se pasa. Los dos números
 * quedan a la vista del lector: uno es cálculo, el otro es cronómetro, y no se
 * presentan como lo mismo.
 *
 * Lo que **no** hace, y el informe lo dice: no sustituye el simulacro, no cuenta
 * participantes, no valida la ejecución de la brigada ni la evacuación de personas
 * con movilidad reducida, y no convierte el tiempo calculado en una promesa.
 */
final class EvacuationDrill
{
    /** Objetos del catálogo que marcan el punto de encuentro. */
    public const MEETING_TYPES = ['cad_emg_meeting'];

    /** Señal ISO 7010 de punto de encuentro. */
    public const MEETING_SIGN = 'E007';

    /**
     * @param array $design Documento normalizado.
     * @param array $routes Rutas del análisis (`id`, `element`, `points`).
     * @param array $routesReport Longitudes y salida de cada ruta.
     * @param array $exits Salidas marcadas, con su centro.
     * @param array $aforo Resultado de `PlanAudit::aforo()`.
     * @param array $criteria Criterios del auditor.
     *
     * @return array{
     *   routes:list<array<string,mixed>>,
     *   meeting:array{found:bool,position:array{x:float,y:float}|null,source:string},
     *   reactionS:int,
     *   speedMps:float,
     *   targetS:float|null,
 *   targetSource:string,
     *   people:int,
     *   measuredS:int|null,
     *   differenceS:float|null,
     *   findings:list<array<string,mixed>>,
     *   notice:string
     * }
     */
    public static function analyze(
        array $design,
        array $routes,
        array $routesReport,
        array $exits,
        array $aforo,
        array $criteria
    ): array {
        $speed = max(0.1, (float) $criteria['egress']['travelSpeedMps']);
        $metersPerUnit = Units::metersPerUnit(Units::GEOMETRY_UNIT);
        $drill = is_array($design['canvas']['drill'] ?? null) ? $design['canvas']['drill'] : [];
        $reactionS = max(0, (int) ($drill['reactionS'] ?? 30));
        $measuredS = isset($drill['measuredS']) ? max(0, (int) $drill['measuredS']) : null;
        if ($measuredS === 0) {
            $measuredS = null;
        }
        $people = (int) ($aforo['used'] ?? 0);

        $meeting = self::meeting($design);
        $byId = [];
        foreach ($routesReport as $item) {
            $byId[(string) $item['id']] = $item;
        }

        $items = [];
        $targetS = null;
        foreach ($routes as $route) {
            $id = (string) $route['id'];
            $report = $byId[$id] ?? null;
            if ($report === null) {
                continue;
            }
            $points = $route['points'];
            $start = $points[0] ?? null;
            $end = $points[count($points) - 1] ?? null;
            $walkS = self::round((float) $report['lengthM'] / $speed, 1);
            $exit = ($end === null) ? null : self::nearestExit($end, $exits);
            $transferS = null;
            $meetingM = null;
            if ($exit !== null && $meeting['found'] && $meeting['position'] !== null) {
                $dx = $meeting['position']['x'] - $exit['center']['x'];
                $dy = $meeting['position']['y'] - $exit['center']['y'];
                $meetingM = self::round(hypot($dx, $dy) * $metersPerUnit);
                $transferS = self::round($meetingM / $speed, 1);
            }
            /* Sin punto de encuentro el recorrido termina en la salida y el
               objetivo sigue existiendo: es la llegada a la salida. El informe
               dice cuál de los dos tramos está incluido. */
            $arrivalS = self::round($reactionS + $walkS + ($transferS ?? 0), 1);
            if ($targetS === null || $arrivalS > $targetS) {
                $targetS = $arrivalS;
            }
            $items[] = [
                'id' => $id,
                'label' => trim((string) ($report['label'] ?? '')),
                'lengthM' => self::round((float) $report['lengthM']),
                'start' => $start === null ? null : ['x' => self::round((float) $start['x']), 'y' => self::round((float) $start['y'])],
                'exitId' => $exit === null ? null : (string) $exit['id'],
                'endsAtExit' => (bool) $report['endsAtExit'],
                'walkS' => $walkS,
                'meetingM' => $meetingM,
                'transferS' => $transferS,
                'reactionS' => $reactionS,
                'arrivalS' => $arrivalS,
                'targetSource' => $transferS === null ? 'exit' : 'meeting',
            ];
        }

        $findings = [];
        if ($items !== [] && !$meeting['found']) {
            $findings[] = self::finding(
                'no_meeting_point',
                'low',
                'Sin punto de encuentro declarado',
                'El piso tiene rutas de evacuación pero no un punto de encuentro. Ubica el objeto «Punto de encuentro de evacuación» (o la señal E007) donde el plan indica que se reúne la gente: sin él, el simulacro termina en la salida y el tramo hasta el punto de reunión no se puede medir.'
            );
        }
        if ($items === [] && $routes === []) {
            /* Sin rutas ya lo dice el auditor con `no_route`: aquí no se repite. */
        }
        if ($targetS !== null && $measuredS !== null && $measuredS > $targetS + 1.0) {
            $findings[] = self::finding(
                'drill_slower_than_target',
                'low',
                'El simulacro medido supera el tiempo objetivo',
                sprintf(
                    'El tiempo medido fue %s y el objetivo calculado con las rutas del plano es %s. Revisa la ruta, los obstáculos del recorrido y el tiempo de reacción; si la diferencia se repite, el plan necesita ajustes.',
                    self::clock((float) $measuredS),
                    self::clock($targetS)
                ),
                self::clock($targetS)
            );
        }

        return [
            'routes' => $items,
            'meeting' => $meeting,
            'reactionS' => $reactionS,
            'speedMps' => self::round($speed, 2),
            'targetS' => $targetS,
            'targetSource' => $meeting['found'] ? 'meeting' : 'exit',
            'people' => $people,
            'measuredS' => $measuredS,
            'differenceS' => ($targetS === null || $measuredS === null) ? null : self::round((float) $measuredS - $targetS, 1),
            'findings' => $findings,
            'notice' => 'Tiempo objetivo calculado con las rutas dibujadas, la velocidad de referencia del criterio y el tiempo de reacción declarado. No mide un simulacro real, no cuenta participantes ni evalúa la ejecución de la brigada: eso se cronometra en sitio.',
        ];
    }

    /**
     * Punto de encuentro: el objeto del catálogo manda; si no está dibujado, se
     * acepta la señal E007, que es lo que la gente ve en el plano.
     *
     * @return array{found:bool,position:array{x:float,y:float}|null,source:string}
     */
    private static function meeting(array $design): array
    {
        $visible = [];
        foreach ((array) $design['layers'] as $layer) {
            $visible[(string) $layer['id']] = (bool) $layer['visible'];
        }
        $sign = null;
        foreach ((array) $design['elements'] as $element) {
            if (!($visible[(string) ($element['layerId'] ?? '')] ?? false)) {
                continue;
            }
            $type = (string) ($element['type'] ?? '');
            $center = [
                'x' => (float) $element['x'] + (float) $element['w'] / 2,
                'y' => (float) $element['y'] + (float) $element['h'] / 2,
            ];
            if (in_array($type, self::MEETING_TYPES, true)) {
                return [
                    'found' => true,
                    'position' => ['x' => self::round($center['x']), 'y' => self::round($center['y'])],
                    'source' => 'object',
                ];
            }
            if ($sign === null && LibraryRepository::codeForType($type) === self::MEETING_SIGN) {
                $sign = $center;
            }
        }
        if ($sign !== null) {
            return [
                'found' => true,
                'position' => ['x' => self::round($sign['x']), 'y' => self::round($sign['y'])],
                'source' => 'sign',
            ];
        }
        return ['found' => false, 'position' => null, 'source' => 'none'];
    }

    /** Salida más cercana al final del trazo. */
    private static function nearestExit(array $end, array $exits): ?array
    {
        $best = null;
        $bestGap = null;
        foreach ($exits as $exit) {
            $gap = hypot((float) $exit['center']['x'] - (float) $end['x'], (float) $exit['center']['y'] - (float) $end['y']);
            if ($bestGap === null || $gap < $bestGap) {
                $bestGap = $gap;
                $best = $exit;
            }
        }
        return $best;
    }

    private static function finding(string $code, string $severity, string $title, string $detail, ?string $value = null): array
    {
        return [
            'code' => $code,
            'severity' => $severity,
            'title' => $title,
            'detail' => $detail,
            'elements' => [],
            'position' => null,
            'value' => $value,
        ];
    }

    /** «1 min 42 s» o «43 s», para que el informe no hable en segundos sueltos. */
    public static function clock(float $seconds): string
    {
        $total = max(0, (int) round($seconds));
        $minutes = intdiv($total, 60);
        $rest = $total % 60;
        return $minutes > 0 ? $minutes . ' min ' . $rest . ' s' : $rest . ' s';
    }

    private static function round(float $value, int $decimals = 2): float
    {
        return round($value, $decimals);
    }
}
