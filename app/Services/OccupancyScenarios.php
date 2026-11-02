<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Escenarios de ocupación temporal del piso.
 *
 * Un piso tiene un aforo y un ancho de salida. Un evento —una capacitación en
 * la bodega, el montaje de una feria, la hora pico de una cafetería— mete más
 * gente en el mismo plano, y ahí el cálculo del uso habitual deja de servir.
 * Esta clase responde **con las mismas fórmulas**, sin inventar criterios
 * nuevos:
 *
 * | Cifra del escenario | Fórmula |
 * | --- | --- |
 * | capacidad | superficie libre × densidad de referencia (la del piso) |
 * | exceso | personas del escenario − capacidad |
 * | ancho exigido | personas × milímetros por persona del criterio |
 * | tiempo estimado | marcha del piso + cola con el ancho útil disponible |
 *
 * El escenario **no cambia el aforo del piso**: la ocupación declarada, el
 * aforo permitido y el tiempo del uso habitual siguen siendo los mismos. Se
 * revisa aparte porque son dos preguntas distintas («¿cuánta gente cabe aquí
 * todos los días?» y «¿qué pasa el día del evento?») y mezclarlas cambiaría en
 * silencio el resultado del plano que ya estaba aprobado.
 *
 * Lo que **no** hace, y el informe lo dice: no aprueba el evento, no verifica
 * los requisitos del permiso, ni la resistencia de tarimas, silletería o
 * estructuras, ni la ocupación real en la puerta. Eso se resuelve con la
 * autoridad competente y en sitio.
 */
final class OccupancyScenarios
{
    /** Escenarios que se detallan en el informe cuando varios se pasan. */
    public const MAX_REPORTED = 4;

    /**
     * @param array $design          Documento normalizado (de ahí salen los escenarios).
     * @param array $aforo           Aforo base del piso (`PlanAudit::aforo()`).
     * @param float $availableWidthM Ancho útil disponible en las salidas marcadas.
     * @param float|null $walkTimeS  Tiempo de marcha del piso hasta la salida más lejana.
     *
     * @return array{
     *   count:int,
     *   items:list<array<string,mixed>>,
     *   peak:array<string,mixed>|null,
     *   base:array<string,mixed>,
     *   criteria:array<string,mixed>,
     *   findings:list<array<string,mixed>>,
     *   notice:string
     * }
     */
    public static function analyze(array $design, array $aforo, float $availableWidthM, ?float $walkTimeS): array
    {
        $criteria = PlanAudit::criteria();
        $mmPerPerson = max(0.0, (float) $criteria['egress']['widthMmPerPerson']);
        $flow = max(0.0, (float) $criteria['egress']['flowPersonsPerSecondPerMeter']);
        $capacity = max(1, (int) ($aforo['maxPersons'] ?? 1));
        $declared = (int) ($aforo['declared'] ?? 0);
        $people = (int) ($aforo['used'] ?? $capacity);
        $baseQueueS = self::queue($people, $flow, $availableWidthM);
        $baseTimeS = self::total($walkTimeS, $baseQueueS);

        $raw = $design['canvas']['scenarios'] ?? [];
        $items = [];
        foreach (is_array($raw) ? $raw : [] as $scenario) {
            if (!is_array($scenario)) {
                continue;
            }
            $persons = max(0, (int) ($scenario['persons'] ?? 0));
            $name = trim((string) ($scenario['name'] ?? ''));
            if ($persons === 0) {
                continue;
            }
            $queueS = self::queue($persons, $flow, $availableWidthM);
            $timeS = self::total($walkTimeS, $queueS);
            $requiredWidthM = self::round($persons * $mmPerPerson / 1000);
            $items[] = [
                'name' => $name !== '' ? $name : 'Escenario sin nombre',
                'persons' => $persons,
                'capacity' => $capacity,
                'excess' => max(0, $persons - $capacity),
                'fits' => $persons <= $capacity,
                'requiredWidthM' => $requiredWidthM,
                'availableWidthM' => self::round($availableWidthM),
                'widthOk' => $availableWidthM <= 0.0 ? null : $requiredWidthM <= $availableWidthM + 0.001,
                'queueTimeS' => $queueS,
                'estimatedTimeS' => $timeS,
                'extraTimeS' => ($timeS === null || $baseTimeS === null) ? null : self::round($timeS - $baseTimeS, 1),
            ];
        }

        $findings = [];
        $failing = array_values(array_filter($items, static fn (array $item): bool => !$item['fits'] || $item['widthOk'] === false));
        /* Los más exigentes primero: son los que hay que resolver. */
        usort($failing, static fn (array $a, array $b): int => [$b['persons'], $a['name']] <=> [$a['persons'], $b['name']]);
        foreach (array_slice($failing, 0, self::MAX_REPORTED) as $item) {
            if (!$item['fits']) {
                $findings[] = self::finding(
                    'scenario_over_capacity',
                    'medium',
                    'Escenario «' . $item['name'] . '» por encima de la capacidad del piso',
                    sprintf(
                        'El escenario declara %d personas y la superficie libre del piso admite %d con la densidad de referencia (%s pers./m²), así que sobran %d. Un evento temporal no amplía la capacidad del recinto: reduce el aforo del evento, amplía la superficie útil o tramita el cupo con la autoridad competente.',
                        $item['persons'],
                        $item['capacity'],
                        self::number((float) ($aforo['density'] ?? 0.0), 2),
                        $item['excess']
                    ),
                    $item['persons'] . ' de ' . $item['capacity']
                );
            }
            if ($item['widthOk'] === false) {
                $findings[] = self::finding(
                    'scenario_width_short',
                    'medium',
                    'Salidas insuficientes para el escenario «' . $item['name'] . '»',
                    sprintf(
                        'Con %d personas el escenario pide %s m de ancho útil y las salidas marcadas suman %s m. Revisa el número de salidas, su ancho libre o el aforo del evento antes de montarlo.',
                        $item['persons'],
                        self::number((float) $item['requiredWidthM']),
                        self::number((float) $item['availableWidthM'])
                    ),
                    self::number((float) $item['requiredWidthM']) . ' m'
                );
            }
        }
        if (count($failing) > self::MAX_REPORTED) {
            $findings[] = self::finding(
                'scenario_more',
                'info',
                'Otros escenarios revisados',
                sprintf(
                    'Se revisaron %d escenarios y %d se pasan de la capacidad o del ancho útil. Arriba están los %d más exigentes; el informe completo los lista todos.',
                    count($items),
                    count($failing),
                    self::MAX_REPORTED
                ),
                count($failing) . ' de ' . count($items)
            );
        }

        $peak = null;
        foreach ($items as $item) {
            if ($peak === null || $item['persons'] > $peak['persons']) {
                $peak = $item;
            }
        }

        return [
            'count' => count($items),
            'items' => $items,
            'peak' => $peak,
            'base' => [
                'people' => $people,
                'declared' => $declared,
                'capacity' => $capacity,
                'source' => (string) ($aforo['source'] ?? 'estimated'),
                'queueTimeS' => $baseQueueS,
                'walkTimeS' => $walkTimeS,
                'estimatedTimeS' => $baseTimeS,
            ],
            'criteria' => [
                'maxScenarios' => DesignValidator::MAX_SCENARIOS,
                'widthMmPerPerson' => $mmPerPerson,
                'flowPersonsPerSecondPerMeter' => $flow,
                'density' => (float) ($aforo['density'] ?? 0.0),
            ],
            'findings' => $findings,
            'notice' => 'El escenario se calcula con la misma superficie libre, densidad y ancho útil del piso. No aprueba el evento ni verifica el permiso, la silletería, las tarimas ni la ocupación real en la puerta: eso se confirma en sitio y con la autoridad competente.',
        ];
    }

    /** Cola en las salidas con el ancho útil disponible (null si no hay datos). */
    private static function queue(int $persons, float $flow, float $availableWidthM): ?float
    {
        if ($persons <= 0 || $flow <= 0.0 || $availableWidthM <= 0.0) {
            return null;
        }
        return self::round($persons / ($flow * $availableWidthM), 1);
    }

    private static function total(?float $walkS, ?float $queueS): ?float
    {
        if ($walkS === null || $queueS === null) {
            return null;
        }
        return self::round($walkS + $queueS, 1);
    }

    private static function finding(string $code, string $severity, string $title, string $detail, ?string $value): array
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

    private static function round(float $value, int $decimals = 2): float
    {
        return round($value, $decimals);
    }

    private static function number(float $value, int $decimals = 2): string
    {
        return number_format($value, $decimals, ',', '.');
    }
}
