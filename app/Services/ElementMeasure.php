<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Units;

/**
 * Longitud de un elemento del plano, y de dónde sale esa longitud.
 *
 * NORMIA-006 §6.1 fija una jerarquía con dos fuentes y ninguna más:
 *
 * 1. **la medida declarada por el usuario** (`measuredM`), y
 * 2. **la geometría dibujada**, que está en centímetros.
 *
 * Esta clase es el único sitio donde esa elección se toma, para que el auditor,
 * el informe de redes, el rótulo de la cota y el SVG no puedan discrepar. Por
 * dentro no define ningún factor: usa `Units` y `PathGeometry`, que ya están
 * probados con igualdad estricta entre PHP y JavaScript.
 *
 * Devuelve siempre un par `[valor, fuente]` y no un número suelto: una cifra sin
 * su fuente es una cifra que el informe no puede explicar, y el usuario tiene
 * derecho a saber si un recorrido de 17,38 m se midió o se dibujó.
 *
 * Sin dependencias de base de datos: se puede probar en aislamiento.
 */
final class ElementMeasure
{
    /** La cifra viene de una medida que escribió el usuario. */
    public const SOURCE_MEASURED = 'measured';

    /** La cifra viene del dibujo, en centímetros. */
    public const SOURCE_GEOMETRY = 'geometry';

    /**
     * Longitud del elemento en centímetros y su fuente.
     *
     * @param array<string,mixed> $element
     * @return array{0:float,1:string}
     */
    public static function lengthCm(array $element): array
    {
        $measured = self::measuredCm($element);
        if ($measured !== null) {
            return [$measured, self::SOURCE_MEASURED];
        }
        return [self::geometryCm($element), self::SOURCE_GEOMETRY];
    }

    /**
     * Longitud del elemento en metros y su fuente.
     *
     * Multiplica por el factor de `cm` —no divide por la unidad del plano— para
     * que la cifra sea la misma con la etiqueta en milímetros, centímetros o
     * metros.
     *
     * @param array<string,mixed> $element
     * @return array{0:float,1:string}
     */
    public static function lengthMeters(array $element): array
    {
        [$cm, $source] = self::lengthCm($element);
        return [$cm * Units::metersPerUnit(Units::GEOMETRY_UNIT), $source];
    }

    /**
     * La medida declarada, en centímetros, o `null` si el elemento no la tiene.
     *
     * Se redondea a la micra: `4,2 m × 100` en coma flotante da 420,00000000000006
     * y ese ruido no debe llegar a un informe.
     *
     * @param array<string,mixed> $element
     */
    public static function measuredCm(array $element): ?float
    {
        $value = $element['measuredM'] ?? null;
        if (!is_int($value) && !is_float($value)) {
            return null;
        }
        $meters = (float) $value;
        if (!is_finite($meters) || $meters <= 0) {
            return null;
        }
        return round($meters * 100, 6);
    }

    /**
     * La longitud que da el dibujo, en centímetros.
     *
     * Un trazo se mide **por su arco**, no por la cuerda entre extremos: es la
     * corrección de la 1.18.0 y la misma regla que usa el editor. Los vanos se
     * miden por su ancho de hueco, que es lo que significa su `w`.
     *
     * @param array<string,mixed> $element
     */
    public static function geometryCm(array $element): float
    {
        $points = self::points($element);
        if (count($points) >= 2) {
            $curves = is_array($element['curves'] ?? null) ? $element['curves'] : null;
            return PathGeometry::length($points, $curves);
        }
        $width = $element['w'] ?? null;
        return is_int($width) || is_float($width) ? (float) $width : 0.0;
    }

    /**
     * Puntos del trazo del elemento.
     *
     * @param array<string,mixed> $element
     * @return array<int,array{x:float,y:float}>
     */
    private static function points(array $element): array
    {
        $points = $element['points'] ?? null;
        if (is_array($points) && count($points) >= 2) {
            $result = [];
            foreach ($points as $point) {
                if (is_array($point) && (isset($point['x']) || isset($point['y']))) {
                    $result[] = ['x' => (float) ($point['x'] ?? 0), 'y' => (float) ($point['y'] ?? 0)];
                }
            }
            return $result;
        }
        return [];
    }

    /** ¿El elemento admite una medida declarada de longitud? */
    public static function acceptsMeasure(string $type): bool
    {
        return in_array($type, [
            'wall', 'route', 'line', 'pipe', 'conduit', 'road', 'sidewalk', 'property',
            'crosswalk', 'parking', 'door', 'door_double', 'door_garage', 'dimension',
        ], true);
    }

    /** Nombre legible de la fuente, para el informe. */
    public static function sourceLabel(string $source, ?string $quality = null): string
    {
        if ($source === self::SOURCE_GEOMETRY) {
            return 'del dibujo';
        }
        return match ($quality) {
            'exacta' => 'medida en sitio',
            'aproximada' => 'medida aproximada',
            'estimada' => 'medida estimada',
            default => 'medida declarada',
        };
    }
}
