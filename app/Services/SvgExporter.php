<?php
declare(strict_types=1);

namespace App\Services;

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
        /* La leyenda de redes se dibuja sólo en la exportación con marco (no en la vista previa). */
        $mepItems = $withFrame ? self::mepLegend($design) : [];
        $mepColumns = $mepItems === [] ? 1 : self::legendColumns($width);
        $mepRows = $mepItems === [] ? [] : array_chunk($mepItems, $mepColumns);
        $footer = $withFrame ? PlanFooter::payload($design, $meta) : null;
        $bandHeight = $withFrame ? PlanFooter::bandHeight($width) : 0.0;
        $dataHeight = $withFrame ? PlanFooter::dataHeight($width, (array) $footer) : 0.0;
        $mepHeight = $withFrame && $mepRows !== [] ? 10.0 + 15.0 * count($mepRows) : 0.0;
        $profileRoads = $withFrame ? self::profileRoads($design) : [];
        $profileHeight = $profileRoads === [] ? 0.0 : 8.0 + 42.0 * count($profileRoads);
        $frameHeight = $withFrame ? 2.0 + $bandHeight + $dataHeight + $mepHeight + $profileHeight + 8.0 : 0.0;
        $totalHeight = $height + $frameHeight;
        $title = trim((string) ($meta['floor_name'] ?? 'Plano de emergencia'));
        $project = trim((string) ($meta['project_name'] ?? ''));
        $scale = (string) $canvas['scale'];
        $unit = (string) $canvas['unit'];

        $svg = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $svg .= '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="' . self::n($width) . '" height="' . self::n($totalHeight) . '" '
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
            $svg .= PlanFooter::render($width, $height + 2, (array) $footer);
            $mepTop = $height + 2 + $bandHeight + $dataHeight;
            foreach ($mepRows as $rowIndex => $row) {
                $rowY = $mepTop + 12 + 15 * $rowIndex;
                foreach ($row as $columnIndex => $item) {
                    $itemX = PlanFooter::PAD + self::legendColumnWidth($width) * $columnIndex;
                    $svg .= '<g data-mep-legend="' . self::x($item['key']) . '">';
                    $svg .= '<line x1="' . self::n($itemX) . '" y1="' . self::n($rowY - 3) . '" x2="' . self::n($itemX + 20) . '" y2="' . self::n($rowY - 3) . '" stroke="' . self::x($item['color']) . '" stroke-width="2.4" stroke-linecap="round"'
                        . ($item['dash'] !== '' ? ' stroke-dasharray="' . self::x($item['dash']) . '"' : '') . '/>';
                    $svg .= '<text x="' . self::n($itemX + 26) . '" y="' . self::n($rowY) . '" font-size="9" fill="#475569">' . self::x($item['text']) . '</text>';
                    $svg .= '</g>' . "\n";
                }
            }
            $svg .= '</g>' . "\n";
            if ($profileRoads !== []) {
                $svg .= self::roadProfiles($profileRoads, $width, $mepTop + $mepHeight + 4);
            }
        }

        $svg .= '</svg>' . "\n";
        return $svg;
    }

    /**
     * Vías con sección tipo que llevan perfil transversal en la exportación
     * (como máximo tres, para no comerse el plano).
     *
     * @return list<array<string,mixed>>
     */
    private static function profileRoads(array $design): array
    {
        $roads = [];
        foreach ($design['elements'] as $element) {
            if (($element['type'] ?? '') === 'road' && is_array($element['section'] ?? null)) {
                $roads[] = $element;
                if (count($roads) >= 3) {
                    break;
                }
            }
        }
        return $roads;
    }

    /**
     * Perfil transversal acotado de cada vía con sección: el mismo reparto del
     * inspector (andén, ciclorruta, berma, carriles, separador), a escala del
     * ancho del papel y con el total en metros. Es esquemático.
     *
     * @param list<array<string,mixed>> $roads
     */
    private static function roadProfiles(array $roads, float $width, float $top): string
    {
        $pad = PlanFooter::PAD;
        $available = max(80.0, $width - $pad * 2);
        $out = '<g data-road-profile="1" font-family="Helvetica, Arial, sans-serif">' . "\n";
        foreach ($roads as $index => $road) {
            $section = $road['section'];
            $lanes = max(1, (int) ($section['lanes'] ?? 2));
            $laneM = (float) ($section['laneM'] ?? 3);
            $median = (float) ($section['medianM'] ?? 0);
            $shoulder = (float) ($section['shoulderM'] ?? 0);
            $bike = (float) ($section['bikeM'] ?? 0);
            $walk = (float) ($section['sidewalkM'] ?? 0);
            $total = $lanes * $laneM + $median + 2 * $shoulder + 2 * $bike + 2 * $walk;
            $scale = $total > 0 ? $available / $total : 0.0;
            $rowTop = $top + 42.0 * $index;
            $bandTop = $rowTop + 12;
            $bandHeight = 14.0;
            $label = trim((string) ($road['label'] ?? ''));
            $caption = ($label !== '' ? $label . ' · ' : '')
                . $lanes . ' ' . ($lanes === 1 ? 'carril' : 'carriles')
                . ' · ' . str_replace('.', ',', self::n($total, 2)) . ' m';
            $out .= '<text x="' . self::n($pad) . '" y="' . self::n($rowTop + 8) . '" font-size="8.5" fill="#334155">'
                . self::x('Perfil transversal · ' . $caption) . '</text>' . "\n";
            $x = $pad;
            $drawn = 0.0;
            $band = static function (float $meters, string $fill, string $stroke) use (&$x, &$out, $bandTop, $bandHeight, $scale): void {
                if ($meters <= 0) {
                    return;
                }
                $bandWidth = $meters * $scale;
                $out .= '<rect x="' . self::n($x) . '" y="' . self::n($bandTop) . '" width="' . self::n($bandWidth) . '" height="' . self::n($bandHeight)
                    . '" fill="' . $fill . '" stroke="' . $stroke . '" stroke-width="0.6"/>' . "\n";
                $x += $bandWidth;
            };
            $band($walk, '#e6eaf1', '#94a3b8');
            $band($bike, '#e7f5ea', '#15803d');
            $band($shoulder, '#f1f5f9', '#94a3b8');
            $rightLanes = (int) ceil($lanes / 2);
            $leftLanes = $lanes - $rightLanes;
            $carriageway = static function (int $count) use (&$x, &$out, $bandTop, $bandHeight, $scale, $laneM): void {
                if ($count <= 0) {
                    return;
                }
                $bandWidth = $count * $laneM * $scale;
                $out .= '<rect x="' . self::n($x) . '" y="' . self::n($bandTop) . '" width="' . self::n($bandWidth) . '" height="' . self::n($bandHeight)
                    . '" fill="#ffffff" stroke="#334155" stroke-width="0.8"/>' . "\n";
                for ($index = 1; $index < $count; $index += 1) {
                    $lineX = $x + $index * $laneM * $scale;
                    $out .= '<line x1="' . self::n($lineX) . '" y1="' . self::n($bandTop) . '" x2="' . self::n($lineX) . '" y2="' . self::n($bandTop + $bandHeight)
                        . '" stroke="#64748b" stroke-width="0.6" stroke-dasharray="4 3"/>' . "\n";
                }
                $x += $bandWidth;
            };
            $carriageway($leftLanes);
            $band($median, '#eef2f7', '#334155');
            $carriageway($rightLanes);
            $band($shoulder, '#f1f5f9', '#94a3b8');
            $band($bike, '#e7f5ea', '#15803d');
            $band($walk, '#e6eaf1', '#94a3b8');
            // Cota del ancho total.
            $dimY = $bandTop + $bandHeight + 7;
            $out .= '<line x1="' . self::n($pad) . '" y1="' . self::n($dimY) . '" x2="' . self::n($pad + $available) . '" y2="' . self::n($dimY) . '" stroke="#94a3b8" stroke-width="0.6"/>' . "\n";
            foreach ([$pad, $pad + $available] as $tick) {
                $out .= '<line x1="' . self::n($tick) . '" y1="' . self::n($dimY - 3) . '" x2="' . self::n($tick) . '" y2="' . self::n($dimY + 3) . '" stroke="#94a3b8" stroke-width="0.6"/>' . "\n";
            }
            $out .= '<text x="' . self::n($pad + $available / 2) . '" y="' . self::n($dimY + 9) . '" text-anchor="middle" font-size="7.5" fill="#64748b">'
                . self::x('Ancho total ' . str_replace('.', ',', self::n($total, 2)) . ' m · perfil esquemático, no sustituye el diseño geométrico vial') . '</text>' . "\n";
        }
        return $out . '</g>' . "\n";
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
                $out .= self::strokeMarkup($element, $x, $y, 'fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n($stroke) . '" stroke-linecap="round" stroke-linejoin="round"');
                break;
            case 'route':
                // La flecha sigue la tangente final: en un tramo curvo se apoya
                // en el último par de puntos aplanados.
                $points = self::flatPointList($element, $canvas);
                $out .= self::strokeMarkup($element, $x, $y, 'fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.5, $stroke)) . '" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="' . self::n(max(4, $stroke * 2)) . ' ' . self::n(max(3, $stroke * 1.5)) . '"');
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
                $out .= self::strokeMarkup($element, $x, $y, 'fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n($width) . '" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"' . $dash);
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
            case 'road':
            case 'sidewalk':
            case 'property':
                $out .= self::outdoorBand($element, $x, $y, $w, $h, $color, $stroke, $canvas);
                break;
            case 'crosswalk':
            case 'parking':
                $out .= self::outdoorArea($element, $x, $y, $w, $h, $color, $stroke, $canvas);
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
        return SvgAsset::nested($asset, $x, $y, $w, $h, $color);
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

    /**
     * Trazo con o sin curvas. Sin curvas devuelve exactamente la polilínea de
     * la versión 2 (mismo orden de atributos y de puntos); con curvas usa un
     * `path` con arcos `A`, que es lo que imprime la curva real.
     */
    /**
     * Vía con sección tipo: calzada a escala con carriles marcados, separador,
     * berma, ciclorruta y andenes. Réplica del dibujo del editor
     * (`Renderer.roadNode`) para que el SVG y la pantalla coincidan.
     */
    private static function roadSectionMarkup(array $element, float $x, float $y, string $color, float $stroke, float $cmPerUnit, array $canvas): string
    {
        $section = $element['section'];
        $perMeter = 100 / $cmPerUnit;
        $lanes = max(1, (int) ($section['lanes'] ?? 2));
        $laneM = (float) ($section['laneM'] ?? 3);
        $median = (float) ($section['medianM'] ?? 0);
        $shoulder = (float) ($section['shoulderM'] ?? 0);
        $bike = (float) ($section['bikeM'] ?? 0);
        $walk = (float) ($section['sidewalkM'] ?? 0);
        $halfPavement = ($median / 2 + ($lanes / 2) * $laneM + $shoulder) * $perMeter;
        // El trazo se exporta en coordenadas absolutas del lienzo (el grupo solo
        // lleva la rotación), así que aquí se suman el origen del elemento.
        $points = [];
        foreach (self::flatPointList($element, $canvas) as $point) {
            $points[] = ['x' => $x + (float) $point['x'], 'y' => $y + (float) $point['y']];
        }
        if (count($points) < 2) {
            return '';
        }
        $out = '';
        $line = static function (array $pts, string $attributes) use ($color): string {
            return $pts === [] ? '' : '<polyline points="' . self::polylinePoints($pts) . '" fill="none" stroke-linecap="butt" stroke-linejoin="round" ' . $attributes . '/>' . "\n";
        };
        $offset = static function (float $distance) use ($points): array {
            return self::offsetPoints($points, $distance);
        };

        // 1. Andenes fuera de la calzada.
        if ($walk > 0) {
            foreach ([-1, 1] as $side) {
                $out .= $line($offset($side * ($halfPavement + ($bike + $walk / 2) * $perMeter)), 'stroke="#e6eaf1" stroke-width="' . self::n($walk * $perMeter) . '"');
                $out .= $line($offset($side * ($halfPavement + $bike * $perMeter)), 'stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.8, $stroke * 0.9)) . '" opacity="0.85"');
            }
        }
        // 2. Ciclorrutas adosadas al bordillo.
        if ($bike > 0) {
            foreach ([-1, 1] as $side) {
                $out .= $line($offset($side * ($halfPavement + ($bike / 2) * $perMeter)), 'stroke="#e7f5ea" stroke-width="' . self::n($bike * $perMeter) . '"');
                $out .= $line($offset($side * ($halfPavement + $bike * $perMeter)), 'stroke="#15803d" stroke-width="' . self::n(max(0.7, $stroke * 0.6)) . '" stroke-dasharray="' . self::n(max(6.0, 120 / $cmPerUnit)) . ' ' . self::n(max(4.0, 80 / $cmPerUnit)) . '" opacity="0.8"');
            }
        }
        // 3. Calzada y sus bordes.
        $out .= $line($points, 'stroke="#ffffff" stroke-width="' . self::n(max(2.0, $halfPavement * 2)) . '"');
        foreach ([-1, 1] as $side) {
            $out .= $line($offset($side * $halfPavement), 'stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.0, $stroke)) . '"');
            if ($shoulder > 0) {
                $out .= $line($offset($side * ($halfPavement - $shoulder * $perMeter)), 'stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.6, $stroke * 0.5)) . '" opacity="0.6"');
            }
        }
        // 4. Separador central o eje discontinuo.
        if ($median > 0) {
            $out .= $line($points, 'stroke="#eef2f7" stroke-width="' . self::n($median * $perMeter) . '"');
            foreach ([-1, 1] as $side) {
                $out .= $line($offset($side * ($median / 2) * $perMeter), 'stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.0, $stroke * 0.9)) . '"');
            }
        } else {
            $out .= $line($offset(0), 'stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.8, $stroke * 0.8)) . '" stroke-dasharray="' . self::n(max(8.0, 300 / $cmPerUnit)) . ' ' . self::n(max(6.0, 200 / $cmPerUnit)) . '" opacity="0.85"');
        }
        // 5. Separación entre carriles.
        $dash = self::n(max(7.0, 250 / $cmPerUnit)) . ' ' . self::n(max(5.0, 150 / $cmPerUnit));
        $rightLanes = (int) ceil($lanes / 2);
        $leftLanes = $lanes - $rightLanes;
        for ($index = 1; $index < $rightLanes; $index += 1) {
            $out .= $line($offset(($median / 2 + $index * $laneM) * $perMeter), 'stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.6, $stroke * 0.6)) . '" stroke-dasharray="' . $dash . '" opacity="0.75"');
        }
        for ($index = 1; $index < $leftLanes; $index += 1) {
            $out .= $line($offset(-($median / 2 + $index * $laneM) * $perMeter), 'stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.6, $stroke * 0.6)) . '" stroke-dasharray="' . $dash . '" opacity="0.75"');
        }
        // 6. Flechas de sentido.
        $arrowLength = 2.8 * $perMeter;
        $arrowWidth = 1.1 * $perMeter;
        $arrow = static function (float $distance, int $direction) use ($points, $arrowLength, $arrowWidth, $color, $stroke): string {
            $out = '';
            $shifted = self::offsetPoints($points, $distance);
            foreach ([0.32, 0.68] as $ratio) {
                $at = self::sampleAlong($shifted, $ratio);
                if ($at === null) {
                    continue;
                }
                $tx = $at['tx'] * $direction;
                $ty = $at['ty'] * $direction;
                $tipX = $at['x'] + $tx * $arrowLength * 0.5;
                $tipY = $at['y'] + $ty * $arrowLength * 0.5;
                $tailX = $at['x'] - $tx * $arrowLength * 0.5;
                $tailY = $at['y'] - $ty * $arrowLength * 0.5;
                $nx = -$ty * $arrowWidth * 0.5;
                $ny = $tx * $arrowWidth * 0.5;
                $out .= '<polygon points="' . self::n($tipX) . ' ' . self::n($tipY) . ' ' . self::n($tailX + $nx) . ' ' . self::n($tailY + $ny) . ' ' . self::n($tailX - $nx) . ' ' . self::n($tailY - $ny) . '" fill="' . self::x($color) . '" fill-opacity="0.45" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.4, $stroke * 0.4)) . '"/>' . "\n";
            }
            return $out;
        };
        for ($index = 0; $index < $rightLanes; $index += 1) {
            $out .= $arrow(($median / 2 + ($index + 0.5) * $laneM) * $perMeter, 1);
        }
        for ($index = 0; $index < $leftLanes; $index += 1) {
            $out .= $arrow(-($median / 2 + ($index + 0.5) * $laneM) * $perMeter, -1);
        }
        // 7. Zona sensible (selección) y rótulo con la sección.
        $out .= '<polyline points="' . self::polylinePoints($points) . '" fill="none" stroke="transparent" stroke-width="' . self::n(max(18.0, $halfPavement * 2 + 14)) . '" stroke-linecap="round" class="hit-area"/>' . "\n";
        $label = trim((string) ($element['label'] ?? ''));
        $meters = self::n((float) ($element['widthM'] ?? 0), 1);
        $caption = $lanes . ' ' . ($lanes === 1 ? 'carril' : 'carriles') . ' · ' . str_replace('.', ',', $meters) . ' m';
        $middle = self::sampleAlong($points, 0.5) ?? ['x' => 0.0, 'y' => 0.0];
        $out .= '<text x="' . self::n($middle['x'] + 6) . '" y="' . self::n($middle['y'] - 8) . '" font-size="9.5" fill="#334155" font-family="system-ui, -apple-system, Segoe UI, sans-serif" class="element-label" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">'
            . self::x($label !== '' ? $label . ' · ' . $caption : $caption) . '</text>' . "\n";
        return $out;
    }

    /**
     * Glorieta o intersección de la vía, igual que en el editor: el anillo y los
     * brazos toman el ancho de la sección tipo y la caja del elemento fija el
     * tamaño del cruce. Se dibuja en coordenadas absolutas del lienzo.
     */
    private static function roadJunctionMarkup(array $element, float $x, float $y, string $color, float $stroke, float $cmPerUnit, array $canvas): string
    {
        $section = $element['section'];
        $junction = $element['junction'];
        $perMeter = 100 / $cmPerUnit;
        $lanes = max(1, (int) ($section['lanes'] ?? 2));
        $laneM = (float) ($section['laneM'] ?? 3);
        $median = (float) ($section['medianM'] ?? 0);
        $shoulder = (float) ($section['shoulderM'] ?? 0);
        $bike = (float) ($section['bikeM'] ?? 0);
        $walk = (float) ($section['sidewalkM'] ?? 0);
        $pavement = $lanes * $laneM + 2 * $shoulder;
        $band = $pavement * $perMeter;
        $w = (float) $element['w'];
        $h = (float) $element['h'];
        $cx = $x + $w / 2;
        $cy = $y + $h / 2;
        $edge = max(1.0, $stroke);
        $dash = self::n(max(6.0, 250 / $cmPerUnit)) . ' ' . self::n(max(4.0, 150 / $cmPerUnit));
        $out = '';
        $circle = static function (float $radius, string $attributes) use ($cx, $cy): string {
            return '<circle cx="' . self::n($cx) . '" cy="' . self::n($cy) . '" r="' . self::n($radius) . '" ' . $attributes . '/>' . "\n";
        };
        $label = trim((string) ($element['label'] ?? ''));
        $caption = '';
        $labelAt = ['x' => $cx, 'y' => $cy];

        if ((string) $junction['kind'] === 'roundabout') {
            $outerWalk = ($bike + $walk) * $perMeter;
            $radius = max($band * 0.8, min($w, $h) / 2 - $outerWalk);
            $islandR = max(2.0, $radius - $band);
            if ($walk > 0) {
                $out .= $circle($radius + $outerWalk, 'fill="#e6eaf1" stroke="#94a3b8" stroke-width="' . self::n(max(0.5, $edge * 0.5)) . '"');
            }
            if ($bike > 0) {
                $out .= $circle($radius + $bike * $perMeter, 'fill="#e7f5ea" stroke="#15803d" stroke-width="' . self::n(max(0.5, $edge * 0.6)) . '"');
            }
            $out .= $circle($radius, 'fill="#ffffff" stroke="' . self::x($color) . '" stroke-width="' . self::n($edge) . '"');
            $out .= $circle($islandR, 'fill="#eef2f7" stroke="' . self::x($color) . '" stroke-width="' . self::n($edge) . '"');
            for ($index = 1; $index < $lanes; $index += 1) {
                $out .= $circle($islandR + $index * $laneM * $perMeter, 'fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.6, $stroke * 0.6)) . '" stroke-dasharray="' . $dash . '" opacity="0.75"');
            }
            $legs = max(3, min(5, (int) ($junction['legs'] ?? 4)));
            for ($index = 0; $index < $legs; $index += 1) {
                $angle = -M_PI / 2 + ($index * M_PI * 2) / $legs;
                $dx = cos($angle);
                $dy = sin($angle);
                $limits = [];
                if ($dx > 0.001) {
                    $limits[] = ($x + $w - $cx) / $dx;
                }
                if ($dx < -0.001) {
                    $limits[] = ($x - $cx) / $dx;
                }
                if ($dy > 0.001) {
                    $limits[] = ($y + $h - $cy) / $dy;
                }
                if ($dy < -0.001) {
                    $limits[] = ($y - $cy) / $dy;
                }
                $positive = array_values(array_filter($limits, static fn (float $value): bool => $value > 0));
                $end = max($islandR, $positive === [] ? $islandR : min($positive));
                $start = ['x' => $cx + $dx * $islandR, 'y' => $cy + $dy * $islandR];
                $stop = ['x' => $cx + $dx * $end, 'y' => $cy + $dy * $end];
                $out .= '<line x1="' . self::n($start['x']) . '" y1="' . self::n($start['y']) . '" x2="' . self::n($stop['x']) . '" y2="' . self::n($stop['y']) . '" stroke="#ffffff" stroke-width="' . self::n($band) . '" stroke-linecap="butt"/>' . "\n";
                $nx = -$dy * ($band / 2);
                $ny = $dx * ($band / 2);
                foreach ([-1, 1] as $side) {
                    $out .= '<line x1="' . self::n($start['x'] + $nx * $side) . '" y1="' . self::n($start['y'] + $ny * $side) . '" x2="' . self::n($stop['x'] + $nx * $side) . '" y2="' . self::n($stop['y'] + $ny * $side) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.6, $stroke * 0.7)) . '"/>' . "\n";
                }
                if ($lanes > 1) {
                    $inner = $islandR + $band / 2;
                    $out .= '<line x1="' . self::n($cx + $dx * $inner) . '" y1="' . self::n($cy + $dy * $inner) . '" x2="' . self::n($stop['x']) . '" y2="' . self::n($stop['y']) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.5, $stroke * 0.5)) . '" stroke-dasharray="' . $dash . '" opacity="0.7"/>' . "\n";
                }
            }
            $out .= $circle($radius, 'fill="transparent" stroke="transparent" stroke-width="' . self::n(max(18.0, $band)) . '" class="hit-area"');
            $island = str_replace('.', ',', self::n((float) ($junction['islandM'] ?? 0), 1));
            $caption = $legs . ' accesos · isla ' . $island . ' m';
            $labelAt = ['x' => $cx, 'y' => $cy - $islandR - $band / 2 - 6];
        } else {
            $half = $band / 2;
            $points = (string) $junction['kind'] === 'tee'
                ? [
                    ['x' => $cx - $half, 'y' => $y], ['x' => $cx + $half, 'y' => $y], ['x' => $cx + $half, 'y' => $cy - $half],
                    ['x' => $x + $w, 'y' => $cy - $half], ['x' => $x + $w, 'y' => $cy + $half],
                    ['x' => $x, 'y' => $cy + $half], ['x' => $x, 'y' => $cy - $half], ['x' => $cx - $half, 'y' => $cy - $half],
                ]
                : [
                    ['x' => $cx - $half, 'y' => $y], ['x' => $cx + $half, 'y' => $y], ['x' => $cx + $half, 'y' => $cy - $half],
                    ['x' => $x + $w, 'y' => $cy - $half], ['x' => $x + $w, 'y' => $cy + $half],
                    ['x' => $cx + $half, 'y' => $cy + $half], ['x' => $cx + $half, 'y' => $y + $h],
                    ['x' => $cx - $half, 'y' => $y + $h], ['x' => $cx - $half, 'y' => $cy + $half],
                    ['x' => $x, 'y' => $cy + $half], ['x' => $x, 'y' => $cy - $half], ['x' => $cx - $half, 'y' => $cy - $half],
                ];
            $polygon = self::polylinePoints($points);
            $out .= '<polygon points="' . $polygon . '" fill="#ffffff" stroke="' . self::x($color) . '" stroke-width="' . self::n($edge) . '"/>' . "\n";
            if ($median > 0) {
                $out .= '<line x1="' . self::n($x) . '" y1="' . self::n($cy) . '" x2="' . self::n($x + $w) . '" y2="' . self::n($cy) . '" stroke="#eef2f7" stroke-width="' . self::n($median * $perMeter) . '"/>' . "\n";
            }
            $laneLine = ' stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.6, $stroke * 0.6)) . '" stroke-dasharray="' . $dash . '" opacity="0.75"';
            for ($index = 1; $index < $lanes; $index += 1) {
                $offset = ($median / 2 + ($index - ($lanes - 1) / 2) * $laneM) * $perMeter;
                $out .= '<line x1="' . self::n($x) . '" y1="' . self::n($cy + $offset) . '" x2="' . self::n($x + $w) . '" y2="' . self::n($cy + $offset) . '"' . $laneLine . '/>' . "\n";
                $vEnd = (string) $junction['kind'] === 'cross' ? $y + $h : $cy - $half;
                $out .= '<line x1="' . self::n($cx + $offset) . '" y1="' . self::n($y) . '" x2="' . self::n($cx + $offset) . '" y2="' . self::n($vEnd) . '"' . $laneLine . '/>' . "\n";
            }
            $stripe = max(2.0, 50 * $perMeter);
            $bars = 6;
            $zebra = 'fill="' . self::x($color) . '" fill-opacity="0.5" stroke="none"';
            for ($index = 0; $index < $bars; $index += 1) {
                $offset = -$half + ($index + 0.5) * ($band / $bars);
                $depth = $stripe * 1.6;
                $out .= '<rect x="' . self::n($cx + $offset - $stripe * 0.35) . '" y="' . self::n($y + $depth * 0.35) . '" width="' . self::n($stripe * 0.7) . '" height="' . self::n($depth) . '" ' . $zebra . '/>' . "\n";
                $out .= '<rect x="' . self::n($cx + $offset - $stripe * 0.35) . '" y="' . self::n($y + $h - $depth * 1.35) . '" width="' . self::n($stripe * 0.7) . '" height="' . self::n($depth) . '" ' . $zebra . '/>' . "\n";
                if ((string) $junction['kind'] === 'cross') {
                    $out .= '<rect x="' . self::n($x + $depth * 0.35) . '" y="' . self::n($cy + $offset - $stripe * 0.35) . '" width="' . self::n($depth) . '" height="' . self::n($stripe * 0.7) . '" ' . $zebra . '/>' . "\n";
                }
                $out .= '<rect x="' . self::n($x + $w - $depth * 1.35) . '" y="' . self::n($cy + $offset - $stripe * 0.35) . '" width="' . self::n($depth) . '" height="' . self::n($stripe * 0.7) . '" ' . $zebra . '/>' . "\n";
            }
            $out .= '<polygon points="' . $polygon . '" fill="transparent" stroke="transparent" class="hit-area"/>' . "\n";
            $caption = (string) $junction['kind'] === 'tee' ? 'Intersección en T · 3 accesos' : 'Intersección en cruz · 4 accesos';
            $labelAt = ['x' => $cx, 'y' => $cy - $half - 6];
        }
        $text = $label !== '' ? $label . ' · ' . $caption : $caption;
        $out .= '<text x="' . self::n($labelAt['x']) . '" y="' . self::n($labelAt['y']) . '" text-anchor="middle" font-size="9.5" fill="#334155" font-family="system-ui, -apple-system, Segoe UI, sans-serif" class="element-label" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">'
            . self::x($text) . '</text>' . "\n";
        return $out;
    }

    /** Punto y tangente a una fracción del recorrido de una polilínea. */
    private static function sampleAlong(array $points, float $ratio): ?array
    {
        $spans = [];
        $total = 0.0;
        for ($index = 1, $count = count($points); $index < $count; $index += 1) {
            $length = hypot((float) $points[$index]['x'] - (float) $points[$index - 1]['x'], (float) $points[$index]['y'] - (float) $points[$index - 1]['y']);
            $spans[] = $length;
            $total += $length;
        }
        if ($total <= 0) {
            return null;
        }
        $target = $total * max(0.0, min(1.0, $ratio));
        for ($index = 1, $count = count($points); $index < $count; $index += 1) {
            $length = $spans[$index - 1];
            $last = $index === $count - 1;
            if ($target <= $length || $last) {
                $r = $length > 0 ? $target / $length : 0.0;
                $a = $points[$index - 1];
                $b = $points[$index];
                return [
                    'x' => (float) $a['x'] + ((float) $b['x'] - (float) $a['x']) * $r,
                    'y' => (float) $a['y'] + ((float) $b['y'] - (float) $a['y']) * $r,
                    'tx' => $length > 0 ? ((float) $b['x'] - (float) $a['x']) / $length : 1.0,
                    'ty' => $length > 0 ? ((float) $b['y'] - (float) $a['y']) / $length : 0.0,
                ];
            }
            $target -= $length;
        }
        return null;
    }

    /**
     * Polilínea desplazada a un lado con la normal media de cada vértice.
     *
     * @param list<array{x:float,y:float}> $points
     * @return list<array{x:float,y:float}>
     */
    private static function offsetPoints(array $points, float $distance): array
    {
        if (abs($distance) < 0.0001) {
            return $points;
        }
        $count = count($points);
        $out = [];
        for ($index = 0; $index < $count; $index += 1) {
            $nx = 0.0;
            $ny = 0.0;
            foreach ([[$index - 1, $index], [$index, $index + 1]] as [$from, $to]) {
                if ($from < 0 || $to >= $count) {
                    continue;
                }
                $dx = (float) $points[$to]['x'] - (float) $points[$from]['x'];
                $dy = (float) $points[$to]['y'] - (float) $points[$from]['y'];
                $length = hypot($dx, $dy);
                if ($length <= 0) {
                    continue;
                }
                $nx += -$dy / $length;
                $ny += $dx / $length;
            }
            $length = hypot($nx, $ny);
            $length = $length > 0 ? $length : 1.0;
            $out[] = [
                'x' => (float) $points[$index]['x'] + ($nx / $length) * $distance,
                'y' => (float) $points[$index]['y'] + ($ny / $length) * $distance,
            ];
        }
        return $out;
    }

    /** Puntos de una polilínea como atributo `points`. */
    private static function polylinePoints(array $points): string
    {
        $parts = [];
        foreach ($points as $point) {
            $parts[] = self::n((float) $point['x']) . ' ' . self::n((float) $point['y']);
        }
        return implode(' ', $parts);
    }

    private static function strokeMarkup(array $element, float $x, float $y, string $attributes): string
    {
        $d = self::pathD($element, $x, $y);
        if ($d !== null) {
            return '<path ' . $attributes . ' d="' . $d . '"/>' . "\n";
        }
        return '<polyline ' . $attributes . ' points="' . self::points($element, $x, $y) . '"/>' . "\n";
    }

    private static function pathD(array $element, float $x, float $y): ?string
    {
        $curves = is_array($element['curves'] ?? null) ? $element['curves'] : null;
        if (!PathGeometry::hasCurves($curves)) {
            return null;
        }
        $points = [];
        foreach (self::pointList($element) as $point) {
            $points[] = ['x' => $x + (float) $point['x'], 'y' => $y + (float) $point['y']];
        }
        return PathGeometry::pathData($points, $curves);
    }

    /**
     * Puntos absolutos del trazo con las curvas resueltas.
     *
     * @return list<array{x:float,y:float}>
     */
    private static function flatPointList(array $element, array $canvas): array
    {
        $unit = (string) ($canvas['unit'] ?? 'cm');
        $x = (float) $element['x'];
        $y = (float) $element['y'];
        $points = [];
        foreach (PlanGrid::visualPoints($element, $unit) as $point) {
            $points[] = ['x' => (float) $point['x'] - $x, 'y' => (float) $point['y'] - $y];
        }
        return $points;
    }

    /**
     * Vía, andén o lindero: banda que sigue el trazo. En un trazo curvo la
     * banda se dibuja con arcos exactos; sin curvas, con la polilínea de
     * siempre. Es esquemático: no reproduce perfiles viales.
     */
    private static function outdoorBand(array $element, float $x, float $y, float $w, float $h, string $color, float $stroke, array $canvas): string
    {
        $type = (string) $element['type'];
        $cmPerUnit = PlanGrid::cmPerUnit((string) ($canvas['unit'] ?? 'cm'));
        $band = $type === 'property'
            ? 0.0
            : max(2.0, (float) ($element['widthM'] ?? 2) * 100 / $cmPerUnit);
        $out = '';
        if ($type === 'road' && is_array($element['section'] ?? null)) {
            // Glorieta o intersección: anillo o cruce de calzadas.
            if (is_array($element['junction'] ?? null)) {
                return $out . self::roadJunctionMarkup($element, $x, $y, $color, $stroke, $cmPerUnit, $canvas);
            }
            // Vía con sección tipo: calzada con carriles, separador, berma,
            // ciclorruta y andenes. Mismo dibujo que el editor; esquemático.
            return $out . self::roadSectionMarkup($element, $x, $y, $color, $stroke, $cmPerUnit, $canvas);
        }
        if ($band > 0) {
            $out .= self::strokeMarkup($element, $x, $y, 'fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n($band + $stroke * 2) . '" stroke-opacity="0.55" stroke-linecap="butt" stroke-linejoin="round"');
            $out .= self::strokeMarkup($element, $x, $y, 'fill="none" stroke="#f8fafc" stroke-width="' . self::n(max(1.0, $band)) . '" stroke-linecap="butt" stroke-linejoin="round"');
            if ($type === 'road') {
                $out .= self::strokeMarkup($element, $x, $y, 'fill="none" stroke="#ffffff" stroke-width="' . self::n(max(0.9, $stroke * 0.8)) . '" stroke-dasharray="' . self::n(max(8.0, 300 / $cmPerUnit)) . ' ' . self::n(max(6.0, 200 / $cmPerUnit)) . '" stroke-linecap="butt" opacity="0.9"');
            }
            if ($type === 'sidewalk') {
                $out .= self::sidewalkHatch($element, $x, $y, $color, $stroke, $band, $cmPerUnit, $canvas, $w, $h);
            }
        } else {
            $out .= self::strokeMarkup($element, $x, $y, 'fill="none" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(1.0, $stroke)) . '" stroke-dasharray="' . self::n(18 / $cmPerUnit) . ' ' . self::n(6 / $cmPerUnit) . ' ' . self::n(3 / $cmPerUnit) . ' ' . self::n(6 / $cmPerUnit) . '" stroke-linejoin="round"');
        }
        $label = (string) ($element['label'] ?? '');
        if ($label !== '') {
            $points = PlanGrid::visualPoints($element, (string) ($canvas['unit'] ?? 'cm'));
            $middle = $points[(int) floor(count($points) / 2)] ?? ['x' => $x + $w / 2, 'y' => $y + $h / 2];
            $out .= '<text x="' . self::n((float) $middle['x'] + 6) . '" y="' . self::n((float) $middle['y'] - 8) . '" font-size="9.5" font-family="Helvetica, Arial, sans-serif" fill="#334155" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">' . self::x(self::firstLine($label)) . '</text>' . "\n";
        }
        return $out;
    }

    /** Trama de losas del andén: marcas perpendiculares cada 60 cm. */
    private static function sidewalkHatch(array $element, float $x, float $y, string $color, float $stroke, float $band, float $cmPerUnit, array $canvas, float $w, float $h): string
    {
        $points = PlanGrid::visualPoints($element, (string) ($canvas['unit'] ?? 'cm'));
        if (count($points) < 2) {
            return '';
        }
        $step = max(6.0, 60 / $cmPerUnit);
        $out = '';
        $travelled = 0.0;
        for ($index = 1; $index < count($points); $index += 1) {
            $a = $points[$index - 1];
            $b = $points[$index];
            $span = hypot((float) $b['x'] - (float) $a['x'], (float) $b['y'] - (float) $a['y']);
            if ($span <= 0) {
                continue;
            }
            $cursor = $step - fmod($travelled, $step);
            while ($cursor <= $span) {
                $t = $cursor / $span;
                $px = (float) $a['x'] + ((float) $b['x'] - (float) $a['x']) * $t;
                $py = (float) $a['y'] + ((float) $b['y'] - (float) $a['y']) * $t;
                $nx = -((float) $b['y'] - (float) $a['y']) / $span;
                $ny = ((float) $b['x'] - (float) $a['x']) / $span;
                $out .= '<line x1="' . self::n($px - $nx * $band * 0.5) . '" y1="' . self::n($py - $ny * $band * 0.5)
                    . '" x2="' . self::n($px + $nx * $band * 0.5) . '" y2="' . self::n($py + $ny * $band * 0.5)
                    . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.5, $stroke * 0.5)) . '" opacity="0.5"/>' . "\n";
                $cursor += $step;
            }
            $travelled += $span;
        }
        return $out;
    }

    /** Paso cebra y parqueadero: cajas con trama propia. */
    private static function outdoorArea(array $element, float $x, float $y, float $w, float $h, string $color, float $stroke, array $canvas): string
    {
        $type = (string) $element['type'];
        $cmPerUnit = PlanGrid::cmPerUnit((string) ($canvas['unit'] ?? 'cm'));
        $out = '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="2" fill="#f8fafc" stroke="' . self::x($color) . '" stroke-width="' . self::n($stroke) . '"/>' . "\n";
        if ($type === 'crosswalk') {
            $step = max(6.0, 100 / $cmPerUnit);
            $bar = $step / 2;
            $horizontal = $w >= $h;
            $span = $horizontal ? $w : $h;
            $count = max(2, min(40, (int) floor($span / $step)));
            $gap = $span / $count;
            for ($index = 0; $index < $count; $index += 1) {
                if ($horizontal) {
                    $out .= '<rect x="' . self::n($x + $index * $gap + ($gap - $bar) / 2) . '" y="' . self::n($y + 1.5) . '" width="' . self::n(max(1.0, $bar)) . '" height="' . self::n(max(1.0, $h - 3)) . '" fill="' . self::x($color) . '" fill-opacity="0.55"/>' . "\n";
                } else {
                    $out .= '<rect x="' . self::n($x + 1.5) . '" y="' . self::n($y + $index * $gap + ($gap - $bar) / 2) . '" width="' . self::n(max(1.0, $w - 3)) . '" height="' . self::n(max(1.0, $bar)) . '" fill="' . self::x($color) . '" fill-opacity="0.55"/>' . "\n";
                }
            }
            return $out;
        }
        $bayWidth = max(4.0, 250 / $cmPerUnit);
        $bayDepth = max(4.0, 500 / $cmPerUnit);
        $columns = max(1, (int) round($w / $bayWidth));
        $rows = max(1, (int) round($h / $bayDepth));
        for ($column = 1; $column < $columns; $column += 1) {
            $lineX = $x + ($w * $column) / $columns;
            $out .= '<line x1="' . self::n($lineX) . '" y1="' . self::n($y + 1.5) . '" x2="' . self::n($lineX) . '" y2="' . self::n($y + $h - 1.5) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.7, $stroke * 0.6)) . '" opacity="0.75"/>' . "\n";
        }
        for ($row = 1; $row < $rows; $row += 1) {
            $lineY = $y + ($h * $row) / $rows;
            $out .= '<line x1="' . self::n($x + 1.5) . '" y1="' . self::n($lineY) . '" x2="' . self::n($x + $w - 1.5) . '" y2="' . self::n($lineY) . '" stroke="' . self::x($color) . '" stroke-width="' . self::n(max(0.9, $stroke * 0.8)) . '" opacity="0.8"/>' . "\n";
        }
        $label = (string) ($element['label'] ?? '');
        $caption = $label !== '' ? self::firstLine($label) . ' · ' : 'P · ';
        $out .= '<text x="' . self::n($x + $w / 2) . '" y="' . self::n($y + $h / 2 + 4) . '" text-anchor="middle" font-size="12" font-weight="600" font-family="Helvetica, Arial, sans-serif" fill="' . self::x($color) . '">' . self::x($caption . ($columns * $rows) . ' puestos') . '</text>' . "\n";
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
     * Entradas de leyenda con los sistemas de tubería y los circuitos
     * presentes en el plano. El resultado es visual: los detalles numéricos se
     * muestran en la vista de impresión y en el panel de redes.
     *
     * @return list<array{key:string,color:string,dash:string,text:string}>
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
        return $items;
    }

    /** Columnas de la leyenda de redes que caben en el ancho del plano. */
    private static function legendColumns(float $width): int
    {
        return max(1, min(6, (int) floor(($width - PlanFooter::PAD * 2) / self::legendColumnWidth($width))));
    }

    private static function legendColumnWidth(float $width): float
    {
        $columns = max(1, min(6, (int) floor(($width - PlanFooter::PAD * 2) / 168.0)));
        return round(($width - PlanFooter::PAD * 2) / $columns, 2);
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
