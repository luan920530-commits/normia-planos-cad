<?php
declare(strict_types=1);

namespace App\Services;

use RuntimeException;

/**
 * Genera una representación SVG limpia del diseño guardado.
 * No incluye cuadrícula, guías, selección ni controles del editor.
 */
final class SvgExporter
{
    private static int $assetSequence = 0;

    public static function render(array $design, array $meta = [], bool $withFrame = true): string
    {
        $canvas = $design['canvas'];
        $width = (float) $canvas['width'];
        $height = (float) $canvas['height'];
        $frameHeight = $withFrame ? 64.0 : 0.0;
        $totalHeight = $height + $frameHeight;
        $title = trim((string) ($meta['floor_name'] ?? 'Plano de emergencia'));
        $project = trim((string) ($meta['project_name'] ?? ''));
        $scale = (string) $canvas['scale'];
        $unit = (string) $canvas['unit'];

        $svg = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $svg .= '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="' . self::n($width) . '" height="' . self::n($totalHeight) . '" '
            . 'viewBox="0 0 ' . self::n($width) . ' ' . self::n($totalHeight) . '" role="img" aria-label="' . self::x($title) . '">' . "\n";
        $svg .= '<title>' . self::x($title . ($project !== '' ? ' · ' . $project : '')) . '</title>' . "\n";
        $svg .= '<desc>Representación esquemática de un plano de emergencia. Las dimensiones y la escala deben verificarse en sitio.</desc>' . "\n";
        $svg .= '<rect width="100%" height="100%" fill="#ffffff"/>' . "\n";
        $svg .= '<g id="plano">' . "\n";

        $visibleLayers = [];
        foreach ($design['layers'] as $layer) {
            if (($layer['visible'] ?? true) === true) {
                $visibleLayers[$layer['id']] = true;
            }
        }
        $byLayer = [];
        foreach ($design['elements'] as $element) {
            if (!isset($visibleLayers[$element['layerId']])) {
                continue;
            }
            $byLayer[$element['layerId']][] = $element;
        }
        foreach ($design['layers'] as $layer) {
            if (!isset($byLayer[$layer['id']])) {
                continue;
            }
            $svg .= '<g data-layer="' . self::x($layer['name']) . '">' . "\n";
            foreach ($byLayer[$layer['id']] as $element) {
                $svg .= self::element($element, $canvas);
            }
            $svg .= '</g>' . "\n";
        }
        $svg .= '</g>' . "\n";

        if ($withFrame) {
            $svg .= '<g id="leyenda" font-family="Helvetica, Arial, sans-serif">' . "\n";
            $svg .= '<line x1="0" y1="' . self::n($height + 0.5) . '" x2="' . self::n($width) . '" y2="' . self::n($height + 0.5) . '" stroke="#e2e8f0" stroke-width="1"/>' . "\n";
            $svg .= '<text x="18" y="' . self::n($height + 26) . '" font-size="13" font-weight="600" fill="#0f172a">' . self::x($title) . '</text>' . "\n";
            $svg .= '<text x="18" y="' . self::n($height + 44) . '" font-size="10" fill="#64748b">' . self::x($project !== '' ? $project : 'Normia Planos CAD') . ' · Escala de referencia ' . self::x($scale) . ' · Unidad ' . self::x($unit) . '</text>' . "\n";
            $svg .= '<text x="' . self::n($width - 18) . '" y="' . self::n($height + 26) . '" text-anchor="end" font-size="9" fill="#64748b">Representación esquemática · verifica dimensiones y escala en sitio</text>' . "\n";
            $svg .= '<text x="' . self::n($width - 18) . '" y="' . self::n($height + 44) . '" text-anchor="end" font-size="9" fill="#94a3b8">Pictogramas ISO 7010 · Normia Planos CAD</text>' . "\n";
            $svg .= '</g>' . "\n";
        }

        $svg .= '</svg>' . "\n";
        return $svg;
    }

    private static function element(array $element, array $canvas): string
    {
        $type = $element['type'];
        $x = (float) $element['x'];
        $y = (float) $element['y'];
        $w = (float) $element['w'];
        $h = (float) $element['h'];
        $cx = $x + $w / 2;
        $cy = $y + $h / 2;
        $rotation = (float) $element['rotation'];
        $opacity = (float) $element['opacity'];
        $color = (string) $element['color'];
        $stroke = (float) $element['stroke'];
        $label = (string) $element['label'];

        $transform = 'translate(' . self::n($cx) . ' ' . self::n($cy) . ')';
        if ($rotation !== 0.0) {
            $transform .= ' rotate(' . self::n($rotation) . ')';
        }
        $transform .= ' translate(' . self::n(-$cx) . ' ' . self::n(-$cy) . ')';
        $out = '<g data-element="' . self::x($element['id']) . '" transform="' . $transform . '"'
            . ($opacity < 1 ? ' opacity="' . self::n($opacity) . '"' : '') . '>' . "\n";

        $code = DesignValidator::signCodeForType($type);
        if ($code !== null) {
            $out .= self::nestedSvg($code, $x, $y, $w, $h, $color);
            if ($label !== '') {
                $out .= '<text x="' . self::n($x + $w / 2) . '" y="' . self::n($y + $h + 12) . '" text-anchor="middle" font-size="10" fill="#334155" font-family="Helvetica, Arial, sans-serif">' . self::x(self::firstLine($label)) . '</text>' . "\n";
            }
            return $out . '</g>' . "\n";
        }
        $cad = LibraryRepository::cadObject($type);
        if ($cad !== null) {
            $out .= self::nestedSvg($type, $x, $y, $w, $h, $color);
            if ($label !== '') {
                $out .= '<text x="' . self::n($x + $w / 2) . '" y="' . self::n($y + $h + 12) . '" text-anchor="middle" font-size="10" fill="#334155" font-family="Helvetica, Arial, sans-serif">' . self::x(self::firstLine($label)) . '</text>' . "\n";
            }
            return $out . '</g>' . "\n";
        }

        switch ($type) {
            case 'wall':
                $out .= '<polyline fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n($stroke) . '" stroke-linecap="round" stroke-linejoin="round" points="'
                    . self::points($element, $x, $y) . '"/>' . "\n";
                break;
            case 'route':
                $points = self::pointList($element);
                $out .= '<polyline fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.5, $stroke)) . '" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="' . self::n(max(4, $stroke * 2)) . ' ' . self::n(max(3, $stroke * 1.5)) . '" points="'
                    . self::points($element, $x, $y) . '"/>' . "\n";
                $out .= self::arrow($points, $x, $y, $color, max(8, $stroke * 3));
                if ($label !== '') {
                    $mid = $points[(int) floor((count($points) - 1) / 2)];
                    $out .= '<text x="' . self::n($x + $mid['x'] + 8) . '" y="' . self::n($y + $mid['y'] - 8) . '" font-size="10" fill="#0f766e" font-family="Helvetica, Arial, sans-serif">' . self::x(self::firstLine($label)) . '</text>' . "\n";
                }
                break;
            case 'door':
                $flip = !empty($element['flipX']) ? ' transform="translate(' . self::n($w) . ' 0) scale(-1 1)"' : '';
                $out .= '<g' . $flip . '>' . "\n";
                $out .= '<line x1="' . self::n($x) . '" y1="' . self::n($y + $h) . '" x2="' . self::n($x + $w) . '" y2="' . self::n($y + $h) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.5, $stroke)) . '" stroke-linecap="round"/>' . "\n";
                $out .= '<line x1="' . self::n($x) . '" y1="' . self::n($y + $h) . '" x2="' . self::n($x) . '" y2="' . self::n($y) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.5, $stroke)) . '" stroke-linecap="round"/>' . "\n";
                $out .= '<path d="M ' . self::n($x) . ' ' . self::n($y) . ' A ' . self::n($w) . ' ' . self::n(max(4, $h)) . ' 0 0 1 ' . self::n($x + $w) . ' ' . self::n($y + $h) . '" fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $stroke * 0.7)) . '" stroke-dasharray="3 4" opacity=".7"/>' . "\n";
                $out .= '</g>' . "\n";
                break;
            case 'text':
                $fontSize = (float) ($element['fontSize'] ?? 14);
                $lines = explode("\n", $label !== '' ? $label : 'Texto');
                $out .= '<text x="' . self::n($x) . '" y="' . self::n($y + $fontSize) . '" font-family="Helvetica, Arial, sans-serif" font-size="' . self::n($fontSize) . '" font-weight="600" fill="' . self::x($color) . '">';
                foreach ($lines as $index => $line) {
                    $out .= '<tspan x="' . self::n($x) . '" dy="' . ($index === 0 ? '0' : self::n($fontSize * 1.25)) . '">' . self::x($line) . '</tspan>';
                }
                $out .= '</text>' . "\n";
                break;
            case 'dimension':
                $points = self::pointList($element);
                if (count($points) >= 2) {
                    $p1 = $points[0];
                    $p2 = $points[count($points) - 1];
                    $ax = $x + $p1['x'];
                    $ay = $y + $p1['y'];
                    $bx = $x + $p2['x'];
                    $by = $y + $p2['y'];
                    $out .= '<line x1="' . self::n($ax) . '" y1="' . self::n($ay) . '" x2="' . self::n($bx) . '" y2="' . self::n($by) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $stroke)) . '"/>' . "\n";
                    $out .= '<line x1="' . self::n($ax) . '" y1="' . self::n($ay - 6) . '" x2="' . self::n($ax) . '" y2="' . self::n($ay + 6) . '" stroke="' . self::x($color) . '" stroke-width="1"/>' . "\n";
                    $out .= '<line x1="' . self::n($bx) . '" y1="' . self::n($by - 6) . '" x2="' . self::n($bx) . '" y2="' . self::n($by + 6) . '" stroke="' . self::x($color) . '" stroke-width="1"/>' . "\n";
                    $caption = $label !== '' ? $label : self::measurement($element, $canvas);
                    $out .= '<text x="' . self::n(($ax + $bx) / 2) . '" y="' . self::n(($ay + $by) / 2 - 7) . '" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="' . self::n((float) ($element['fontSize'] ?? 12)) . '" fill="' . self::x($color) . '">' . self::x($caption) . '</text>' . "\n";
                }
                break;
            case 'line':
                $out .= '<line x1="' . self::n($x) . '" y1="' . self::n($y) . '" x2="' . self::n($x + $w) . '" y2="' . self::n($y + $h) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $stroke)) . '" stroke-linecap="round"/>' . "\n";
                break;
            case 'rect':
                $out .= '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="2" fill="' . self::x($color) . '" fill-opacity=".08" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $stroke)) . '"/>' . "\n";
                break;
            case 'ellipse':
                $out .= '<ellipse cx="' . self::n($x + $w / 2) . '" cy="' . self::n($y + $h / 2) . '" rx="' . self::n($w / 2) . '" ry="' . self::n($h / 2) . '" fill="' . self::x($color) . '" fill-opacity=".08" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $stroke)) . '"/>' . "\n";
                break;
        }
        return $out . '</g>' . "\n";
    }

    private static function nestedSvg(string $asset, float $x, float $y, float $w, float $h, string $color): string
    {
        if (DesignValidator::signCodeForType($asset) !== null) {
            $definition = LibraryRepository::sign(strtoupper(substr($asset, 4)));
        } elseif (preg_match('/^[EFMPW][0-9]{3}$/D', $asset) === 1) {
            $definition = LibraryRepository::sign($asset);
        } else {
            $definition = LibraryRepository::cadObject($asset);
        }
        if ($definition === null) {
            throw new RuntimeException('El recurso no pertenece al catálogo local.');
        }
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
        return '<svg x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h)
            . '" viewBox="' . self::x($viewBox) . '" preserveAspectRatio="xMidYMid meet" color="' . self::x($color) . '">'
            . $inner . '</svg>' . "\n";
    }

    /** @param array<int,array{x:float|int,y:float|int}> $points */
    private static function points(array $element, float $x, float $y): string
    {
        $parts = [];
        foreach (self::pointList($element) as $point) {
            $parts[] = self::n($x + (float) $point['x']) . ',' . self::n($y + (float) $point['y']);
        }
        return implode(' ', $parts);
    }

    /** @return array<int,array{x:float,y:float}> */
    private static function pointList(array $element): array
    {
        $points = $element['points'] ?? [['x' => 0, 'y' => 0], ['x' => $element['w'], 'y' => $element['h']]];
        $result = [];
        foreach ($points as $point) {
            $result[] = ['x' => (float) $point['x'], 'y' => (float) $point['y']];
        }
        return $result;
    }

    private static function arrow(array $points, float $x, float $y, string $color, float $size): string
    {
        if (count($points) < 2) {
            return '';
        }
        $last = $points[count($points) - 1];
        $previous = $points[count($points) - 2];
        $angle = atan2((float) $last['y'] - (float) $previous['y'], (float) $last['x'] - (float) $previous['x']);
        $tipX = $x + (float) $last['x'];
        $tipY = $y + (float) $last['y'];
        $baseX = $tipX - cos($angle) * $size;
        $baseY = $tipY - sin($angle) * $size;
        $leftX = $baseX + cos($angle + M_PI / 2) * $size * 0.45;
        $leftY = $baseY + sin($angle + M_PI / 2) * $size * 0.45;
        $rightX = $baseX + cos($angle - M_PI / 2) * $size * 0.45;
        $rightY = $baseY + sin($angle - M_PI / 2) * $size * 0.45;
        return '<polygon points="' . self::n($tipX) . ',' . self::n($tipY) . ' ' . self::n($leftX) . ',' . self::n($leftY)
            . ' ' . self::n($rightX) . ',' . self::n($rightY) . '" fill="' . self::x($color) . '"/>' . "\n";
    }

    private static function measurement(array $element, array $canvas): string
    {
        $points = self::pointList($element);
        if (count($points) < 2) {
            return '';
        }
        $a = $points[0];
        $b = $points[count($points) - 1];
        $distance = hypot((float) $b['x'] - (float) $a['x'], (float) $b['y'] - (float) $a['y']);
        $unit = (string) ($canvas['unit'] ?? 'cm');
        return number_format($distance, 1, ',', '.') . ' ' . $unit;
    }

    private static function firstLine(string $value): string
    {
        $parts = explode("\n", $value);
        return text_limit($parts[0] ?? '', 60);
    }

    private static function n(float|int $value): string
    {
        $text = rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.');
        return $text === '' || $text === '-0' ? '0' : $text;
    }

    private static function x(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1 | ENT_SUBSTITUTE, 'UTF-8');
    }
}
