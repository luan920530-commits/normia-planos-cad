<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Reglas de extintores: norma, clases de fuego y límites de ubicación.
 *
 * Las tablas viven en `resources/extinguisher-criteria.json` para que el
 * criterio sea auditable y ajustable sin tocar código. Reproducen la NTC 2885
 * (idéntica a NFPA 10:2007) y la Resolución 2400 de 1979; el resultado es un
 * apoyo de revisión y no un dictamen de cumplimiento.
 */
final class ExtinguisherNorms
{
    /** Claves de riesgo admitidas. */
    public const HAZARDS = ['light', 'ordinary', 'extra'];

    private static ?array $criteria = null;

    /* ------------------------------- criterios ------------------------------- */

    public static function criteria(): array
    {
        if (self::$criteria !== null) {
            return self::$criteria;
        }
        $path = dirname(__DIR__, 2) . '/resources/extinguisher-criteria.json';
        $raw = is_file($path) ? (string) file_get_contents($path) : '';
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = ['version' => 1, 'defaultProfile' => 'colombia', 'profiles' => [], 'agents' => [], 'catalogDefaults' => []];
        }
        return self::$criteria = $data;
    }

    /** Perfiles normativos disponibles (`colombia`, `nfpa10`). */
    public static function profiles(): array
    {
        $criteria = self::criteria();
        $out = [];
        foreach ((array) ($criteria['profiles'] ?? []) as $key => $profile) {
            $out[$key] = [
                'key' => (string) $key,
                'label' => (string) ($profile['label'] ?? $key),
                'reference' => (string) ($profile['reference'] ?? ''),
            ];
        }
        return $out;
    }

    public static function defaultProfile(): string
    {
        $criteria = self::criteria();
        $key = (string) ($criteria['defaultProfile'] ?? 'colombia');
        return isset($criteria['profiles'][$key]) ? $key : 'colombia';
    }

    public static function normalizeProfile(?string $key): string
    {
        $criteria = self::criteria();
        $key = (string) $key;
        return isset($criteria['profiles'][$key]) ? $key : self::defaultProfile();
    }

    public static function profile(string $key): array
    {
        $criteria = self::criteria();
        return (array) ($criteria['profiles'][self::normalizeProfile($key)] ?? []);
    }

    /** Catálogo de agentes extintores con las clases de fuego que cubren. */
    public static function agents(): array
    {
        return (array) (self::criteria()['agents'] ?? []);
    }

    public static function agent(?string $key): ?array
    {
        $agents = self::agents();
        return isset($agents[(string) $key]) ? (array) $agents[(string) $key] : null;
    }

    /** Valores por defecto de un objeto del catálogo CAD, si está registrado. */
    public static function defaultsFor(string $type): ?array
    {
        $defaults = (array) (self::criteria()['catalogDefaults'] ?? []);
        return isset($defaults[$type]) ? (array) $defaults[$type] : null;
    }

    /** Tipos del catálogo que representan un extintor. */
    public static function catalogTypes(): array
    {
        return array_keys((array) (self::criteria()['catalogDefaults'] ?? []));
    }

    public static function capacities(): array
    {
        $list = (array) (self::criteria()['capacitiesLb'] ?? []);
        $out = [];
        foreach ($list as $value) {
            $number = (float) $value;
            if ($number > 0) {
                $out[] = $number;
            }
        }
        return $out === [] ? [5.0, 10.0, 20.0] : $out;
    }

    /* ------------------------------ clasificación ------------------------------ */

    /**
     * Lee una clasificación tipo «2-A:10-B:C» o «10-B:C» y devuelve sus números
     * y las clases de fuego que declara.
     *
     * @return array{A:int,B:int,classes:list<string>,raw:string}
     */
    public static function parseRating(?string $rating): array
    {
        $raw = trim((string) $rating);
        $a = 0;
        $b = 0;
        if (preg_match_all('/(\d+)\s*-\s*([AB])/i', $raw, $matches, PREG_SET_ORDER) > 0) {
            foreach ($matches as $match) {
                $letter = strtoupper($match[2]);
                if ($letter === 'A') {
                    $a = max($a, (int) $match[1]);
                } else {
                    $b = max($b, (int) $match[1]);
                }
            }
        }
        $classes = [];
        if ($a > 0) {
            $classes[] = 'A';
        }
        if ($b > 0) {
            $classes[] = 'B';
        }
        foreach (['C', 'D', 'K'] as $letter) {
            if (preg_match('/(^|[^A-Z])' . $letter . '($|[^A-Z])/i', $raw) === 1) {
                $classes[] = $letter;
            }
        }
        return ['A' => $a, 'B' => $b, 'classes' => array_values(array_unique($classes)), 'raw' => $raw];
    }

    /**
     * Normaliza una clasificación escrita a mano. Devuelve null si no se
     * reconoce, para que el guardado no acepte valores inventados.
     */
    public static function sanitizeRating(?string $rating): ?string
    {
        $raw = strtoupper(trim((string) $rating));
        $raw = (string) preg_replace('/\s+/', '', $raw);
        if ($raw === '' || strlen($raw) > 24 || preg_match('/^[0-9A-K:\-]+$/', $raw) !== 1) {
            return null;
        }
        if (preg_match('/^(?:[0-9]{1,3}-[AB]:)?[0-9]{1,3}-[AB](?::[CDK])*$/', $raw) === 1) {
            return $raw;
        }
        return preg_match('/^[CDK]$/', $raw) === 1 ? $raw : null;
    }

    /** Clases efectivas: la intersección entre el agente y la clasificación. */
    public static function effectiveClasses(array $ext): array
    {
        $agent = self::agent((string) ($ext['extAgent'] ?? ''));
        $agentClasses = array_map('strtoupper', (array) ($agent['classes'] ?? []));
        $rating = self::parseRating((string) ($ext['extRating'] ?? ''));
        $declared = $rating['classes'];
        if ($agentClasses === []) {
            return $declared;
        }
        return array_values(array_intersect($agentClasses, $declared === [] ? $agentClasses : $declared));
    }

    /** Un elemento es extintor si su tipo está en el catálogo o si trae agente. */
    public static function isExtinguisher(array $element): bool
    {
        $type = (string) ($element['type'] ?? '');
        if (in_array($type, self::catalogTypes(), true)) {
            return true;
        }
        return trim((string) ($element['extAgent'] ?? '')) !== '';
    }

    /* --------------------------------- límites -------------------------------- */

    /**
     * Límites de ubicación de un extintor para un perfil y un riesgo.
     *
     * Devuelve la distancia máxima de recorrido efectiva (la más restrictiva de
     * las clases que cubre), el área máxima que puede asignarse según su
     * clasificación Clase A y las observaciones que el inspector muestra.
     *
     * @return array{
     *   travelM: float|null, areaLimitM2: float|null, ratingA: int, ratingB: int,
     *   classes: list<string>, hazard: string, hazardLabel: string,
     *   travelByClass: array<string,float>, issues: list<string>, minRatingA: int|null
     * }
     */
    public static function limits(array $ext, string $profileKey, string $hazard = 'ordinary'): array
    {
        $profile = self::profile($profileKey);
        $hazard = in_array($hazard, self::HAZARDS, true) ? $hazard : 'ordinary';
        $rating = self::parseRating((string) ($ext['extRating'] ?? ''));
        $classes = self::effectiveClasses($ext);
        $classA = (array) ($profile['classA'] ?? []);
        $classB = (array) ($profile['classB'] ?? []);
        $hazardA = (array) ($classA['hazards'][$hazard] ?? []);
        $issues = [];
        $travelByClass = [];

        $travelM = null;
        $areaLimit = null;
        $minRatingA = null;

        // Clase A: recorrido fijo y área proporcional al número de A.
        if (in_array('A', $classes, true) && $rating['A'] > 0) {
            $travelA = (float) ($classA['travelM'] ?? 22.9);
            $travelByClass['A'] = $travelA;
            $travelM = $travelM === null ? $travelA : min($travelM, $travelA);
            $perRating = (float) ($hazardA['areaPerRatingM2'] ?? 0);
            $cap = (float) ($classA['maxAreaPerExtinguisherM2'] ?? 1045);
            if ($perRating > 0) {
                $areaLimit = min($cap, $perRating * $rating['A']);
            }
            $minRatingA = isset($hazardA['minRatingA']) ? (int) $hazardA['minRatingA'] : null;
            if ($minRatingA !== null && $rating['A'] < $minRatingA) {
                $issues[] = sprintf(
                    'Clasificación %d-A por debajo del mínimo %d-A para riesgo %s.',
                    $rating['A'],
                    $minRatingA,
                    mb_strtolower((string) ($hazardA['label'] ?? $hazard))
                );
            }
        } elseif (in_array('A', $classes, true) && $rating['A'] === 0) {
            $issues[] = 'No declara clasificación Clase A, así que no puede cubrir área de piso.';
        }

        // Clase B: la distancia depende del número de B y del riesgo.
        if (in_array('B', $classes, true) && $rating['B'] > 0) {
            $travelB = self::travelForB($profileKey, $hazard, $rating['B']);
            if ($travelB !== null) {
                $travelByClass['B'] = $travelB;
                $travelM = $travelM === null ? $travelB : min($travelM, $travelB);
            }
            $thresholds = (array) ($classB['hazards'][$hazard] ?? []);
            $minimum = $thresholds === [] ? 0 : (int) ($thresholds[0]['minRatingB'] ?? 0);
            if ($minimum > 0 && $rating['B'] < $minimum) {
                $issues[] = sprintf('Clasificación %d-B por debajo del mínimo %d-B para este riesgo.', $rating['B'], $minimum);
            }
        }

        foreach (['D', 'K'] as $letter) {
            if (in_array($letter, $classes, true)) {
                $travel = (float) ($profile['class' . $letter]['travelM'] ?? 0);
                if ($travel > 0) {
                    $travelByClass[$letter] = $travel;
                    $travelM = $travelM === null ? $travel : min($travelM, $travel);
                }
            }
        }

        $agent = self::agent((string) ($ext['extAgent'] ?? ''));
        if (in_array('C', $classes, true)) {
            $issues[] = 'Clase C: se ubica con los requisitos de Clase A o B, no tiene distancia propia.';
        }
        if ($agent === null) {
            $issues[] = 'Falta el agente extintor: sin él no se pueden validar las clases de fuego.';
        }

        return [
            'travelM' => $travelM === null ? null : round($travelM, 2),
            'areaLimitM2' => $areaLimit === null ? null : round($areaLimit, 1),
            'ratingA' => $rating['A'],
            'ratingB' => $rating['B'],
            'classes' => $classes,
            'hazard' => $hazard,
            'hazardLabel' => (string) ($hazardA['label'] ?? $hazard),
            'travelByClass' => array_map(static fn (float $v): float => round($v, 2), $travelByClass),
            'issues' => $issues,
            'minRatingA' => $minRatingA,
        ];
    }

    /** Distancia máxima de recorrido para un número de clasificación B. */
    public static function travelForB(string $profileKey, string $hazard, int $ratingB): ?float
    {
        $profile = self::profile($profileKey);
        $thresholds = (array) ($profile['classB']['hazards'][$hazard] ?? []);
        if ($thresholds === [] || $ratingB <= 0) {
            return null;
        }
        $travel = null;
        foreach ($thresholds as $row) {
            if ($ratingB >= (int) ($row['minRatingB'] ?? 0)) {
                $travel = (float) ($row['travelM'] ?? 0);
            }
        }
        if ($travel === null) {
            $travel = (float) ($thresholds[0]['travelM'] ?? 0);
        }
        $cap = (float) ($profile['classB']['maxTravelM'] ?? 0);
        return $cap > 0 ? min($travel, $cap) : $travel;
    }

    /**
     * Cantidad mínima de extintores por superficie (Resolución 2400, art. 221).
     * Devuelve 0 cuando el perfil no fija esa regla.
     */
    public static function requiredByArea(string $profileKey, float $areaM2): int
    {
        $rule = self::profile($profileKey)['areaRule'] ?? null;
        if (!is_array($rule) || $areaM2 <= 0) {
            return 0;
        }
        $per = (float) ($rule['onePerM2'] ?? 0);
        return $per > 0 ? (int) ceil($areaM2 / $per) : 0;
    }

    /** Altura máxima de la parte superior del extintor, según peso bruto. */
    public static function maxMountCm(string $profileKey, float $capacityLb): float
    {
        $mounting = (array) (self::profile($profileKey)['mounting'] ?? []);
        $smallMaxKg = (float) ($mounting['smallMaxGrossKg'] ?? 18.14);
        $grossKg = $capacityLb * 0.4536 * 1.35; // agente + recipiente, aproximado
        return $grossKg <= $smallMaxKg
            ? (float) ($mounting['maxTopCmSmall'] ?? 153)
            : (float) ($mounting['maxTopCmLarge'] ?? 107);
    }

    public static function notice(): string
    {
        return (string) (self::criteria()['notice'] ?? '');
    }
}
