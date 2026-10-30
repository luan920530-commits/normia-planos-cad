<?php
declare(strict_types=1);

namespace App\Services;

use RuntimeException;

/**
 * Inserta recursos del catálogo local (señales ISO 7010, señales de servicio y
 * equipos CAD) dentro de un SVG generado en el servidor.
 *
 * Se usa tanto para los elementos del plano como para los pictogramas del pie
 * de página, de modo que exista una única implementación de la validación y de
 * la copia de atributos de presentación.
 */
final class SvgAsset
{
    /** Propiedades de presentación que se heredan desde la etiqueta raíz del catálogo. */
    private const PRESENTATION = [
        'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
        'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'opacity',
    ];

    /**
     * Devuelve un `<svg>` anidado con el recurso indicado.
     *
     * `$asset` acepta un tipo del editor (`iso_e002`, `sig_wc_men`) o un código
     * del catálogo (`E002`, `SVC_WC_MEN`); ambos se resuelven igual.
     */
    public static function nested(string $asset, float $x, float $y, float $w, float $h, string $color): string
    {
        $definition = self::definition($asset);
        $raw = (string) $definition['svg'];
        if (!LibraryRepository::safeSvg($raw)) {
            throw new RuntimeException('El recurso local no supera la validación de seguridad.');
        }
        if (preg_match('/<svg\b[^>]*\bviewBox="([^"]+)"/i', $raw, $match) === 1) {
            $viewBox = $match[1];
        } else {
            $viewBox = '0 0 100 100';
        }
        $inner = '';
        if (preg_match('/<svg\b[^>]*>(.*)<\/svg>\s*$/is', $raw, $match) === 1) {
            $inner = $match[1];
        }
        // Los SVG del catálogo declaran fill/stroke en la etiqueta raíz. Si no
        // se copian, el equipo se exporta como una caja gris sin trazo.
        $rootAttributes = '';
        if (preg_match('/<svg\b([^>]*)>/i', $raw, $rootMatch) === 1
            && preg_match_all('/([a-z-]+)\s*=\s*"([^"]*)"/i', $rootMatch[1], $pairs, PREG_SET_ORDER)) {
            foreach ($pairs as $pair) {
                $name = strtolower($pair[1]);
                if (in_array($name, self::PRESENTATION, true)) {
                    $rootAttributes .= ' ' . $name . '="' . self::esc($pair[2]) . '"';
                }
            }
        }
        return '<svg x="' . self::num($x) . '" y="' . self::num($y) . '" width="' . self::num($w) . '" height="' . self::num($h)
            . '" viewBox="' . self::esc($viewBox) . '" preserveAspectRatio="xMidYMid meet" color="' . self::esc($color) . '"'
            . $rootAttributes . '>'
            . $inner . '</svg>' . "\n";
    }

    /** @return array<string,mixed> */
    private static function definition(string $asset): array
    {
        $signCode = DesignValidator::signCodeForType($asset);
        if ($signCode === null
            && preg_match('/^(?:[EFMPW][0-9]{3}|SVC_[A-Z][A-Z0-9_]{1,40})$/D', $asset) === 1
            && LibraryRepository::sign($asset) !== null) {
            $signCode = $asset;
        }
        $definition = $signCode !== null
            ? LibraryRepository::sign($signCode)
            : LibraryRepository::cadObject($asset);
        if ($definition === null) {
            throw new RuntimeException('El recurso no pertenece al catálogo local.');
        }
        return $definition;
    }

    /** Número SVG: sin ceros sobrantes y sin notación científica. */
    public static function num(float|int $value): string
    {
        $text = rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.');
        return $text === '' || $text === '-0' ? '0' : $text;
    }

    /** Texto seguro para XML. */
    public static function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1 | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Parte un texto en líneas por palabras para dibujarlo en SVG (que no
     * ajusta texto automáticamente). `$maxChars` se calcula con el ancho
     * disponible y el tamaño de letra.
     *
     * @return list<string>
     */
    public static function wrap(string $text, int $maxChars): array
    {
        $maxChars = max(8, $maxChars);
        $words = preg_split('/\s+/u', trim($text)) ?: [];
        $lines = [];
        $current = '';
        foreach ($words as $word) {
            if ($word === '') {
                continue;
            }
            $candidate = $current === '' ? $word : $current . ' ' . $word;
            if (mb_strlen($candidate, 'UTF-8') <= $maxChars) {
                $current = $candidate;
                continue;
            }
            if ($current !== '') {
                $lines[] = $current;
            }
            if (mb_strlen($word, 'UTF-8') > $maxChars) {
                // Palabra más larga que la línea: se corta para no salirse.
                $chunks = mb_str_split($word, $maxChars, 'UTF-8');
                $word = (string) array_pop($chunks);
                foreach ($chunks as $chunk) {
                    $lines[] = $chunk;
                }
            }
            $current = $word;
        }
        if ($current !== '') {
            $lines[] = $current;
        }
        return $lines === [] ? [''] : $lines;
    }
}
