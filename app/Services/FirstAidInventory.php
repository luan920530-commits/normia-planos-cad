<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Units;

/**
 * Recursos de atención de primeros auxilios del piso.
 *
 * Responde tres preguntas concretas sobre el plano guardado, sin pedir nada
 * más al usuario:
 *
 * 1. **¿Hay botiquín?** Cuántos hay y si el punto más lejano del espacio libre
 *    queda dentro de un recorrido de referencia.
 * 2. **¿Hay camilla?** Una por piso, que es lo que se puede verificar en un
 *    plano: dónde está, no si está en buen estado.
 * 3. **¿Hay desfibrilador (DEA)?** No se exige en todos los establecimientos,
 *    así que el auditor no lo declara obligatorio: lo cuenta, mide su alcance y
 *    avisa cuando la afluencia calculada pasa del umbral de referencia.
 *
 * Lo que **no** hace, y el informe dice: no comprueba el contenido del botiquín,
 * su vigencia, la carga del DEA ni la fecha de los parches. Eso se verifica en
 * sitio, y el plano solo deja de ser ciego cuando el recurso está dibujado.
 *
 * Las distancias se miden sobre la rejilla del auditor —la misma que usan la
 * evacuación y la cobertura de extintores—, en línea recta y sin recorridos:
 * sirven para saber si un recurso está al alcance, no para simular una carrera.
 */
final class FirstAidInventory
{
    /** Objetos del catálogo que cuentan como botiquín. */
    public const KIT_TYPES = ['cad_emg_firstaid'];

    /** Camillas: la de emergencia y la hospitalaria. */
    public const STRETCHER_TYPES = ['cad_emg_stretcher', 'cad_hosp_stretcher'];

    /** Desfibrilador externo automático. */
    public const AED_TYPES = ['cad_emg_aed'];

    /**
     * @param array $design Documento normalizado del plano.
     * @param int   $occupancy Ocupación declarada del piso (0 = sin declarar).
     *
     * @return array{
     *   criteria: array<string,mixed>,
     *   people: int, source: string,
     *   kits: array{count:int,items:list<array<string,mixed>>},
     *   stretchers: array{count:int,items:list<array<string,mixed>>},
     *   aeds: array{count:int,items:list<array<string,mixed>>},
     *   coverage: array{kitMaxM:float|null,aedMaxM:float|null,cells:int},
     *   findings: list<array<string,mixed>>,
     *   notice: string
     * }
     */
    public static function analyze(array $design, int $occupancy = 0): array
    {
        $criteria = (array) (PlanAudit::criteria()['firstAid'] ?? []);
        $kitTravelM = max(1.0, (float) ($criteria['kitTravelM'] ?? 30));
        $aedTravelM = max(1.0, (float) ($criteria['aedTravelM'] ?? 100));
        $aedMinPersons = max(1, (int) ($criteria['aedMinPersons'] ?? 500));
        $stretcherRequired = (bool) ($criteria['stretcherPerFloor'] ?? true);

        $aforo = PlanAudit::aforo($design, $occupancy);
        $people = max(0, (int) $aforo['used']);

        $kits = [];
        $stretchers = [];
        $aeds = [];
        $walls = [];
        $doors = [];
        $visible = [];
        foreach ((array) $design['layers'] as $layer) {
            $visible[(string) $layer['id']] = (bool) $layer['visible'];
        }
        foreach ((array) $design['elements'] as $element) {
            $layerId = (string) ($element['layerId'] ?? '');
            /* Un recurso en una capa oculta no está a la vista del plano: no
               cuenta, igual que en el resto del auditor. */
            if (!($visible[$layerId] ?? false)) {
                continue;
            }
            $type = (string) ($element['type'] ?? '');
            if ($type === 'wall') {
                $walls[] = [
                    'points' => PlanGrid::visualPoints($element, Units::GEOMETRY_UNIT),
                    'stroke' => max(1.0, (float) ($element['stroke'] ?? 2)),
                ];
                continue;
            }
            if (in_array($type, DesignValidator::DOOR_TYPES, true)) {
                $doors[] = ['opening' => PlanGrid::doorOpening($element)];
                continue;
            }
            if (!in_array($type, array_merge(self::KIT_TYPES, self::STRETCHER_TYPES, self::AED_TYPES), true)) {
                continue;
            }
            $item = [
                'id' => (string) $element['id'],
                'type' => $type,
                'label' => trim((string) ($element['label'] ?? '')),
                'position' => [
                    'x' => self::round((float) $element['x'] + (float) $element['w'] / 2),
                    'y' => self::round((float) $element['y'] + (float) $element['h'] / 2),
                ],
                'center' => [
                    'x' => (float) $element['x'] + (float) $element['w'] / 2,
                    'y' => (float) $element['y'] + (float) $element['h'] / 2,
                ],
            ];
            if (in_array($type, self::KIT_TYPES, true)) {
                $kits[] = $item;
            } elseif (in_array($type, self::STRETCHER_TYPES, true)) {
                $stretchers[] = $item;
            } else {
                $aeds[] = $item;
            }
        }

        [$kitMaxM, $aedMaxM, $cells] = self::coverage($design, $walls, $doors, $kits, $aeds);

        $findings = [];
        $add = static function (string $code, string $severity, string $title, string $detail, array $elements = [], ?string $value = null) use (&$findings): void {
            $findings[] = [
                'code' => $code,
                'severity' => $severity,
                'title' => $title,
                'detail' => $detail,
                'elements' => array_values(array_unique($elements)),
                'position' => null,
                'value' => $value,
            ];
        };

        if ($kits === []) {
            $add(
                'no_first_aid_kit',
                'medium',
                'Sin botiquín de primeros auxilios en el plano',
                'El piso no tiene ningún botiquín ubicado. Si el piso cuenta con uno, ubícalo con el objeto «Botiquín de primeros auxilios» para que el alcance sea visible; el plano no puede comprobar su contenido ni su vigencia.',
            );
        } elseif ($kitMaxM !== null && $kitMaxM > $kitTravelM) {
            $add(
                'first_aid_kit_far',
                'medium',
                'Botiquín fuera del alcance de referencia',
                sprintf(
                    'El punto más lejano del espacio libre queda a %s m del botiquín más cercano y el criterio de referencia es %s m. Ubica otro botiquín o revisa si el recorrido real permite llegar antes.',
                    self::number($kitMaxM),
                    self::number($kitTravelM)
                ),
                array_map(static fn (array $kit): string => $kit['id'], $kits),
                self::number($kitMaxM) . ' m'
            );
        }

        if ($stretcherRequired && $stretchers === []) {
            $add(
                'no_stretcher',
                'medium',
                'Sin camilla en el plano',
                'No hay camilla ubicada en el piso. Si la atención de primeros auxilios del piso dispone de una, ubícala para que la brigada sepa dónde está; si se comparte entre pisos, indícalo en el nombre del objeto para no contarla dos veces.',
            );
        }

        if ($aeds === []) {
            $required = $people >= $aedMinPersons;
            $add(
                'no_aed',
                $required ? 'medium' : 'low',
                $required ? 'Sin DEA con la afluencia calculada' : 'Sin desfibrilador externo automático (DEA)',
                $required
                    ? sprintf(
                        'El piso calcula %d personas y el umbral de referencia para contar con DEA es %d. La Ley 1831 de 2017 y la Resolución 3316 de 2019 regulan su uso: confirma con la autoridad si tu establecimiento está obligado y, si lo tienes, ubícalo en el plano.',
                        $people,
                        $aedMinPersons
                    )
                    : sprintf(
                        'No hay DEA ubicado y el piso calcula %d personas, por debajo del umbral de referencia (%d). No se declara obligatorio: si tu análisis de riesgo o la afluencia real lo justifican, ubícalo para que su alcance quede a la vista.',
                        $people,
                        $aedMinPersons
                    ),
                [],
                $aedMinPersons . ' pers.'
            );
        } elseif ($aedMaxM !== null && $aedMaxM > $aedTravelM) {
            $add(
                'aed_far',
                'low',
                'DEA fuera del alcance de referencia',
                sprintf(
                    'El punto más lejano del espacio libre queda a %s m del DEA y el criterio de referencia es %s m. Un desfibrilador sirve si llega a tiempo: revisa si el recorrido real permite usarlo.',
                    self::number($aedMaxM),
                    self::number($aedTravelM)
                ),
                array_map(static fn (array $aed): string => $aed['id'], $aeds),
                self::number($aedMaxM) . ' m'
            );
        }

        return [
            'criteria' => [
                'kitTravelM' => $kitTravelM,
                'aedTravelM' => $aedTravelM,
                'aedMinPersons' => $aedMinPersons,
                'stretcherPerFloor' => $stretcherRequired,
                'notice' => (string) ($criteria['notice'] ?? ''),
                'reference' => (string) ($criteria['reference'] ?? ''),
            ],
            'people' => $people,
            'source' => (string) $aforo['source'],
            'kits' => ['count' => count($kits), 'items' => self::clean($kits)],
            'stretchers' => ['count' => count($stretchers), 'items' => self::clean($stretchers)],
            'aeds' => ['count' => count($aeds), 'items' => self::clean($aeds)],
            'coverage' => [
                'kitMaxM' => $kitMaxM,
                'aedMaxM' => $aedMaxM,
                'cells' => $cells,
            ],
            'findings' => $findings,
            'notice' => 'El auditor cuenta los recursos dibujados y mide su alcance sobre el plano. No comprueba contenido, dotación, vigencia, carga ni mantenimiento: eso se verifica en sitio.',
        ];
    }

    /**
     * Distancia al recurso más cercano desde el punto más lejano del espacio
     * libre. Se mide con la rejilla del auditor (celdas de 20 cm), en línea
     * recta y solo desde el interior del piso.
     *
     * @param list<array<string,mixed>> $kits
     * @param list<array<string,mixed>> $aeds
     * @return array{0: float|null, 1: float|null, 2: int}
     */
    private static function coverage(array $design, array $walls, array $doors, array $kits, array $aeds): array
    {
        if (($kits === [] && $aeds === []) || $walls === []) {
            /* Sin muros no hay espacio libre que medir: se devuelve null y la
               sección del informe dice «sin medición» en vez de inventar cero. */
            if ($kits === [] && $aeds === []) {
                return [null, null, 0];
            }
        }
        $grid = PlanGrid::build($design, $walls, $doors, PlanAudit::criteria());
        $cell = (float) $grid['cell'];
        $nx = (int) $grid['nx'];
        $ny = (int) $grid['ny'];
        $metersPerUnit = Units::metersPerUnit(Units::GEOMETRY_UNIT);
        $kitMax = null;
        $aedMax = null;
        $cells = 0;
        for ($iy = 0; $iy < $ny; $iy++) {
            for ($ix = 0; $ix < $nx; $ix++) {
                $index = $iy * $nx + $ix;
                if (($grid['blocked'][$index] ?? true) || ($grid['exterior'][$index] ?? false)) {
                    continue;
                }
                $center = PlanGrid::cellCenter($ix, $iy, $cell, (float) $grid['width'], (float) $grid['height']);
                $cells += 1;
                if ($kits !== []) {
                    $nearest = self::nearestM($center, $kits, $metersPerUnit);
                    $kitMax = $kitMax === null ? $nearest : max($kitMax, $nearest);
                }
                if ($aeds !== []) {
                    $nearest = self::nearestM($center, $aeds, $metersPerUnit);
                    $aedMax = $aedMax === null ? $nearest : max($aedMax, $nearest);
                }
            }
        }
        return [
            $kitMax === null ? null : self::round($kitMax),
            $aedMax === null ? null : self::round($aedMax),
            $cells,
        ];
    }

    /** @param list<array<string,mixed>> $items */
    private static function nearestM(array $point, array $items, float $metersPerUnit): float
    {
        $best = null;
        foreach ($items as $item) {
            $dx = (float) $item['center']['x'] - (float) $point['x'];
            $dy = (float) $item['center']['y'] - (float) $point['y'];
            $distance = sqrt($dx * $dx + $dy * $dy) * $metersPerUnit;
            $best = $best === null ? $distance : min($best, $distance);
        }
        return (float) $best;
    }

    /** @param list<array<string,mixed>> $items */
    private static function clean(array $items): array
    {
        return array_map(static fn (array $item): array => [
            'id' => $item['id'],
            'type' => $item['type'],
            'label' => $item['label'],
            'position' => $item['position'],
        ], $items);
    }

    private static function round(float $value, int $decimals = 2): float
    {
        return round($value, $decimals);
    }

    private static function number(float $value): string
    {
        return str_replace('.', ',', number_format($value, 1, '.', ''));
    }
}
