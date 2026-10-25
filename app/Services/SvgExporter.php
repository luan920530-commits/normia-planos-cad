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
    /** Propiedades de presentación que se heredan desde la etiqueta raíz del catálogo. */
    private const SVG_PRESENTATION = [
        'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
        'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'opacity',
    ];

    private static int $assetSequence = 0;

    public static function render(array $design, array $meta = [], bool $withFrame = true): string
    {
        $canvas = $design['canvas'];
        $width = (float) $canvas['width'];
        $height = (float) $canvas['height'];
        /* La leyenda de redes se dibuja sólo en la exportación con marco (no en la vista previa). */
        $mepRows = $withFrame ? self::mepLegend($design) : [];
        $frameHeight = $withFrame ? 64.0 + 15.0 * count($mepRows) : 0.0;
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
            foreach ($mepRows as $rowIndex => $row) {
                $rowY = $height + 62 + 15 * $rowIndex;
                foreach ($row as $columnIndex => $item) {
                    $itemX = 18 + 168 * $columnIndex;
                    $svg .= '<g data-mep-legend="' . self::x($item['key']) . '">';
                    $svg .= '<line x1="' . self::n($itemX) . '" y1="' . self::n($rowY - 3) . '" x2="' . self::n($itemX + 20) . '" y2="' . self::n($rowY - 3) . '" stroke="' . self::x($item['color']) . '" stroke-width="2.4" stroke-linecap="round"'
                        . ($item['dash'] !== '' ? ' stroke-dasharray="' . self::x($item['dash']) . '"' : '') . '/>';
                    $svg .= '<text x="' . self::n($itemX + 26) . '" y="' . self::n($rowY) . '" font-size="9" fill="#475569">' . self::x($item['text']) . '</text>';
                    $svg .= '</g>' . "\n";
                }
            }
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
            case 'door_double':
            case 'door_garage':
                $out .= self::doorMarkup($element, $x, $y, $w, $h, $color, $stroke);
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
            case 'pipe':
            case 'conduit':
                $points = self::pointList($element);
                $isPipe = $type === 'pipe';
                $definition = $isPipe ? (LibraryRepository::networks()[$element['network'] ?? ''] ?? null) : null;
                $width = max(1.5, $stroke);
                $dash = $isPipe && is_array($definition['dash'] ?? null) && $definition['dash'] !== []
                    ? ' stroke-dasharray="' . implode(' ', array_map(static fn ($value): string => self::n((float) $value), $definition['dash'])) . '"'
                    : '';
                $out .= '<polyline fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n($width) . '" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"' . $dash . ' points="'
                    . self::points($element, $x, $y) . '"/>' . "\n";
                $joint = max(2.0, min(5.0, $width * 0.95));
                foreach ($points as $point) {
                    $out .= '<circle cx="' . self::n($x + (float) $point['x']) . '" cy="' . self::n($y + (float) $point['y']) . '" r="' . self::n($joint) . '" fill="#ffffff" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $width * 0.45)) . '"/>' . "\n";
                }
                $caption = self::mepCaption($element, $canvas);
                if ($caption !== '') {
                    $middle = $points[(int) floor((count($points) - 1) / 2)];
                    $next = $points[(int) floor((count($points) - 1) / 2) + 1] ?? $middle;
                    $out .= '<text x="' . self::n($x + ((float) $middle['x'] + (float) $next['x']) / 2 + 6) . '" y="' . self::n($y + ((float) $middle['y'] + (float) $next['y']) / 2 - 6)
                        . '" font-size="10" font-family="Helvetica, Arial, sans-serif" fill="' . self::x($color) . '" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">' . self::x($caption) . '</text>' . "\n";
                }
                break;
            case 'line':
                $points = self::pointList($element);
                $start = $points[0];
                $end = $points[count($points) - 1];
                $out .= '<line x1="' . self::n($x + (float) $start['x']) . '" y1="' . self::n($y + (float) $start['y'])
                    . '" x2="' . self::n($x + (float) $end['x']) . '" y2="' . self::n($y + (float) $end['y'])
                    . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $stroke)) . '" stroke-linecap="round"/>' . "\n";
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

    /**
     * Rótulo de un tramo de red. Es informativo y esquemático: no sustituye
     * la memoria de cálculo ni la revisión de un profesional competente.
     */
    private static function mepCaption(array $element, array $canvas): string
    {
        if ((string) ($element['label'] ?? '') !== '') {
            return self::firstLine((string) $element['label']);
        }
        if ($element['type'] === 'conduit') {
            $circuit = (string) ($element['circuit'] ?? 'C1');
            $gauge = (string) ($element['gauge'] ?? '');
            $voltage = (string) ($element['voltage'] ?? '');
            return trim($circuit . ' · ' . ($gauge !== '' ? $gauge . ' AWG' : '') . ' · ' . ($voltage !== '' ? $voltage . ' V' : ''), ' ·');
        }
        $networks = LibraryRepository::networks();
        $network = $networks[(string) ($element['network'] ?? '')] ?? null;
        if ($network === null) {
            return '';
        }
        $parts = [$network['short'] . ' Ø ' . (string) ($element['diameter'] ?? $network['diameter'])];
        $points = self::pointList($element);
        if (count($points) >= 2) {
            $length = 0.0;
            for ($index = 1; $index < count($points); $index++) {
                $length += hypot((float) $points[$index]['x'] - (float) $points[$index - 1]['x'], (float) $points[$index]['y'] - (float) $points[$index - 1]['y']);
            }
            $factor = MepCalculator::unitsToMeters((string) $canvas['unit'], (string) $canvas['scale']);
            $parts[] = self::meters($length * $factor);
        }
        if (!empty($network['gravity'])) {
            $parts[] = 'i=' . self::n((float) ($element['slope'] ?? 0)) . ' %';
        }
        return implode(' · ', $parts);
    }

    private static function meters(float $value): string
    {
        $digits = $value >= 100 ? 0 : 1;
        return number_format($value, $digits, ',', '.') . ' m';
    }

    private static function nestedSvg(string $asset, float $x, float $y, float $w, float $h, string $color): string
    {
        // `$asset` puede ser un tipo del editor (iso_e002, sig_wc_men) o un
        // código del catálogo (E002, SVC_WC_MEN); ambos deben resolverse igual.
        $signCode = DesignValidator::signCodeForType($asset);
        if ($signCode === null
            && preg_match('/^(?:[EFMPW][0-9]{3}|SVC_[A-Z][A-Z0-9_]{1,40})$/D', $asset) === 1
            && LibraryRepository::sign($asset) !== null) {
            $signCode = $asset;
        }
        if ($signCode !== null) {
            $definition = LibraryRepository::sign($signCode);
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
        // Los SVG del catálogo declaran fill/stroke en la etiqueta raíz. Si no
        // se copian, el equipo se exporta como una caja gris sin trazo.
        $rootAttributes = '';
        if (preg_match('/<svg\b([^>]*)>/i', $raw, $rootMatch) === 1
            && preg_match_all('/([a-z-]+)\s*=\s*"([^"]*)"/i', $rootMatch[1], $pairs, PREG_SET_ORDER)) {
            foreach ($pairs as $pair) {
                $name = strtolower($pair[1]);
                if (in_array($name, self::SVG_PRESENTATION, true)) {
                    $rootAttributes .= ' ' . $name . '="' . self::x($pair[2]) . '"';
                }
            }
        }
        return '<svg x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h)
            . '" viewBox="' . self::x($viewBox) . '" preserveAspectRatio="xMidYMid meet" color="' . self::x($color) . '"'
            . $rootAttributes . '>'
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
    /** Símbolo de puerta en planta; mismas geometría que el editor. */
    private static function doorMarkup(array $element, float $x, float $y, float $w, float $h, string $color, float $stroke): string
    {
        $type = (string) ($element['type'] ?? 'door');
        $edge = $y + $h;
        $flipX = !empty($element['flipX']);
        $flipY = !empty($element['flipY']);
        $out = '';
        if ($flipX || $flipY) {
            $px = $x + $w / 2;
            $out .= '<g transform="translate(' . self::n($px) . ' ' . self::n($edge) . ') scale(' . ($flipX ? '-1' : '1') . ' ' . ($flipY ? '-1' : '1') . ') translate(' . self::n(-$px) . ' ' . self::n(-$edge) . ')">' . "\n";
        } else {
            $out .= '<g class="door">' . "\n";
        }
        $jamb = min(14.0, max(5.0, $h * 0.16));
        $frame = max(1.8, $stroke * 1.15);
        $thin = max(1.0, $stroke * 0.65);
        $out .= '<line x1="' . self::n($x) . '" y1="' . self::n($edge) . '" x2="' . self::n($x) . '" y2="' . self::n($edge - $jamb) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n($frame) . '" stroke-linecap="round"/>' . "\n";
        $out .= '<line x1="' . self::n($x + $w) . '" y1="' . self::n($edge) . '" x2="' . self::n($x + $w) . '" y2="' . self::n($edge - $jamb) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n($frame) . '" stroke-linecap="round"/>' . "\n";
        $out .= '<line x1="' . self::n($x) . '" y1="' . self::n($edge) . '" x2="' . self::n($x + $w) . '" y2="' . self::n($edge) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n($thin) . '" stroke-dasharray="4 4" opacity=".5"/>' . "\n";
        if ($type === 'door_garage') {
            $panel = min(30.0, max(10.0, $h * 0.55));
            $panelTop = $edge - $panel;
            $out .= '<rect x="' . self::n($x + 3) . '" y="' . self::n($panelTop) . '" width="' . self::n(max(6, $w - 6)) . '" height="' . self::n($panel) . '" rx="' . self::n(min(3, $panel / 3)) . '" fill="' . self::x($color) . '" fill-opacity=".1" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.2, $stroke * 0.75)) . '"/>' . "\n";
            $bars = (int) max(3, min(14, round($w / 16)));
            for ($index = 1; $index < $bars; $index++) {
                $barX = $x + 3 + (($w - 6) * $index) / $bars;
                $out .= '<line x1="' . self::n($barX) . '" y1="' . self::n($panelTop + 1.5) . '" x2="' . self::n($barX) . '" y2="' . self::n($edge - 1.5) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.9, $stroke * 0.55)) . '" opacity=".75"/>' . "\n";
            }
            $railY = $panelTop + $panel / 2;
            $out .= '<line x1="' . self::n($x + 3) . '" y1="' . self::n($railY) . '" x2="' . self::n($x + $w - 3) . '" y2="' . self::n($railY) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.9, $stroke * 0.5)) . '" opacity=".65"/>' . "\n";
            $out .= '<line x1="' . self::n($x + 3) . '" y1="' . self::n($edge) . '" x2="' . self::n($x + 3) . '" y2="' . self::n($panelTop + $panel + 2) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n($thin) . '" opacity=".75"/>' . "\n";
            $out .= '<line x1="' . self::n($x + $w - 3) . '" y1="' . self::n($edge) . '" x2="' . self::n($x + $w - 3) . '" y2="' . self::n($panelTop + $panel + 2) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n($thin) . '" opacity=".75"/>' . "\n";
            $out .= '</g>' . "\n";
            return $out;
        }
        $leaf = max(8.0, min($type === 'door_double' ? $w / 2 : $w, $h));
        $leafWidth = max(2.2, $stroke * 1.2);
        $leaves = $type === 'door_double' ? [[$x, $x + $leaf], [$x + $w, $x + $w - $leaf]] : [[$x, $x + $leaf]];
        foreach ($leaves as [$hingeX, $reachX]) {
            $out .= '<line x1="' . self::n($hingeX) . '" y1="' . self::n($edge) . '" x2="' . self::n($hingeX) . '" y2="' . self::n($edge - $leaf) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n($leafWidth) . '" stroke-linecap="round"/>' . "\n";
            $out .= '<circle cx="' . self::n($hingeX) . '" cy="' . self::n($edge) . '" r="' . self::n(max(2, $stroke * 1.1)) . '" fill="' . self::x($color) . '"/>' . "\n";
            $sweep = $reachX >= $hingeX ? 1 : 0;
            $out .= '<path d="M ' . self::n($hingeX) . ' ' . self::n($edge - $leaf) . ' A ' . self::n($leaf) . ' ' . self::n($leaf) . ' 0 0 ' . $sweep . ' ' . self::n($reachX) . ' ' . self::n($edge) . '" fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1, $stroke * 0.6)) . '" opacity=".55"/>' . "\n";
        }
        $out .= '</g>' . "\n";
        return $out;
    }

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

    /**
     * Filas de leyenda (máximo 6 por fila) con los sistemas de tubería y los
     * circuitos presentes en el plano. El resultado es visual: los detalles
     * numéricos se muestran en la vista de impresión y en el panel de redes.
     *
     * @return list<list<array{key:string,color:string,dash:string,text:string}>>
     */
    private static function mepLegend(array $design): array
    {
        $items = [];
        $seen = [];
        foreach ($design['elements'] ?? [] as $element) {
            $type = $element['type'] ?? '';
            if ($type === 'pipe') {
                $key = (string) ($element['network'] ?? '');
                $network = LibraryRepository::networks()[$key] ?? null;
                if ($network === null || isset($seen['pipe:' . $key])) {
                    continue;
                }
                $seen['pipe:' . $key] = true;
                $items[] = [
                    'key' => 'pipe:' . $key,
                    'color' => (string) $network['color'],
                    'dash' => implode(' ', array_map(static fn ($value): string => self::n((float) $value), is_array($network['dash'] ?? null) ? $network['dash'] : [])),
                    'text' => $network['short'] . ' · ' . $network['label'],
                ];
            } elseif ($type === 'conduit') {
                $key = (string) ($element['circuit'] ?? '');
                if ($key === '' || isset($seen['conduit:' . $key])) {
                    continue;
                }
                $seen['conduit:' . $key] = true;
                $items[] = [
                    'key' => 'conduit:' . $key,
                    'color' => (string) $element['color'],
                    'dash' => '',
                    'text' => 'Circuito ' . $key . ' · ' . (int) ($element['voltage'] ?? 0) . ' V',
                ];
            }
        }
        return array_chunk($items, 6);
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
