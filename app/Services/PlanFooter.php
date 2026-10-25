<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Pie de página de los planos de emergencia.
 *
 * Dibuja, debajo del plano, una franja de orientación con cinco celdas
 * (posición actual, rutas, salidas, protección contra incendios y punto de
 * reunión) y un bloque de datos del plano con la nota de la aplicación que lo
 * generó.
 *
 * El contenido vive aquí una sola vez: el editor recibe el mismo `payload` en
 * su arranque para poder dibujar el pie en la exportación PNG del navegador.
 */
final class PlanFooter
{
    /** Celdas de orientación, en el orden en que se dibujan. */
    public const CELLS = [
        [
            'key' => 'position',
            'title' => 'Su posición actual',
            'text' => 'Indica dónde se encuentra usted actualmente.',
            'icon' => 'pin',
            'accent' => '#1d4ed8',
            'title_color' => '#0f172a',
        ],
        [
            'key' => 'route',
            'title' => 'Rutas de evacuación',
            'text' => 'Siga las flechas verdes para dirigirse a la salida de emergencia más cercana.',
            'icon' => 'route',
            'accent' => '#15803d',
            'title_color' => '#166534',
        ],
        [
            'key' => 'exit',
            'title' => 'Salidas de emergencia',
            'text' => 'Salidas habilitadas para evacuar el edificio de forma segura.',
            'icon' => 'sign:E002',
            'accent' => '#15803d',
            'title_color' => '#166534',
        ],
        [
            'key' => 'fire',
            'title' => 'Equipos de protección contra incendios',
            'text' => 'Extintores, bocas de incendio y pulsadores de alarma distribuidos por el edificio.',
            'icon' => 'sign:F001',
            'accent' => '#b91c1c',
            'title_color' => '#991b1b',
        ],
        [
            'key' => 'meeting',
            'title' => 'Punto de reunión',
            'text' => 'Diríjase al punto de reunión exterior en caso de evacuación del edificio.',
            'icon' => 'sign:E007',
            'accent' => '#15803d',
            'title_color' => '#166534',
        ],
    ];

    /**
     * Líneas del bloque de datos. Los textos llevan marcadores `{clave}` que se
     * resuelven con `payload()['fields']`; así el navegador puede reutilizar la
     * misma redacción en la exportación PNG.
     */
    public const LINES = [
        ['text' => '{project} · {floor} · Nivel {level}', 'tone' => 'strong'],
        ['text' => 'Sitio: {site} · Área: {workplace} · Responsable: {responsible}', 'tone' => 'body'],
        ['text' => 'Escala {scale} · Unidad {unit} · Versión v{version} · Guardado {saved} · {count} elementos', 'tone' => 'body'],
        ['text' => '© {year} {app} · Licencia GPL-3.0 · Generado con la versión {app_version} · {attribution}', 'tone' => 'meta'],
        ['text' => '{note}', 'tone' => 'meta'],
    ];

    /** Relleno interior del pie, en unidades del lienzo. */
    public const PAD = 14.0;

    /** @return list<array{key:string,title:string,text:string,icon:string,accent:string}> */
    public static function cells(): array
    {
        return self::CELLS;
    }

    /**
     * Datos que el editor necesita para dibujar el mismo pie en el navegador.
     *
     * @param array<string,mixed> $design
     * @param array<string,mixed> $meta
     * @return array{cells:list<array<string,string>>,lines:list<array{text:string,tone:string}>,fields:array<string,string>}
     */
    public static function payload(array $design, array $meta = []): array
    {
        $canvas = is_array($design['canvas'] ?? null) ? $design['canvas'] : [];
        $orDash = static function (mixed $value): string {
            $text = trim((string) $value);
            return $text === '' ? '—' : $text;
        };
        $fields = [
            'project' => $orDash($meta['project_name'] ?? ''),
            'floor' => $orDash($meta['floor_name'] ?? ''),
            'level' => $orDash($meta['level'] ?? ''),
            'site' => $orDash($meta['site'] ?? ''),
            'workplace' => $orDash($meta['workplace'] ?? ''),
            'responsible' => $orDash($meta['responsible'] ?? ''),
            'saved' => self::date($meta['saved_at'] ?? ''),
            'scale' => $orDash($canvas['scale'] ?? ''),
            'unit' => $orDash($canvas['unit'] ?? ''),
            'version' => (string) max(1, (int) ($meta['version'] ?? 1)),
            'count' => (string) count(is_array($design['elements'] ?? null) ? $design['elements'] : []),
            'year' => date('Y'),
            'app' => 'Normia Planos CAD',
            'app_version' => defined('NORMA_VERSION') ? (string) \NORMA_VERSION : '1.0',
            'attribution' => 'Pictogramas ISO 7010 (MIT © Karl Norling)',
            'note' => 'Los planos son esquemáticos: verifica dimensiones y escala en sitio.',
        ];
        return ['cells' => self::CELLS, 'lines' => self::LINES, 'fields' => $fields];
    }

    /** Columnas de la franja según el ancho disponible. */
    public static function columns(float $width): int
    {
        if ($width >= 1000.0) {
            return 5;
        }
        return $width >= 620.0 ? 3 : 1;
    }

    public static function rowHeight(float $width): float
    {
        return round(max(84.0, min(150.0, $width * 0.082)), 2);
    }

    public static function bandHeight(float $width): float
    {
        $rows = (int) ceil(count(self::CELLS) / self::columns($width));
        return round($rows * self::rowHeight($width), 2);
    }

    /** Altura del bloque de datos y nota legal. */
    public static function dataHeight(float $width, array $payload): float
    {
        $height = 0.0;
        foreach (self::wrappedLines($width, $payload) as $line) {
            $height += self::lineStep($line['size']);
        }
        return round($height + 16.0, 2);
    }

    /**
     * Dibuja la franja y el bloque de datos. `$top` es la coordenada Y donde
     * empieza la franja (justo debajo del plano).
     */
    public static function render(float $width, float $top, array $payload): string
    {
        $band = self::bandHeight($width);
        $svg = '<g id="pie-plano" data-plan-footer="guia" font-family="Helvetica, Arial, sans-serif">' . "\n";
        $svg .= self::band($width, $top, $payload);
        $svg .= self::dataBlock($width, $top + $band, $payload);
        $svg .= '</g>' . "\n";
        return $svg;
    }

    /** @return list<array{text:string,tone:string,size:float}> */
    private static function wrappedLines(float $width, array $payload): array
    {
        $fields = $payload['fields'] ?? [];
        $lines = [];
        foreach ($payload['lines'] ?? self::LINES as $template) {
            $tone = (string) ($template['tone'] ?? 'body');
            $size = self::sizeForTone($tone);
            $text = self::substitute((string) $template['text'], $fields);
            $maxChars = max(24, (int) floor(($width - self::PAD * 2) / ($size * 0.52)));
            foreach (SvgAsset::wrap($text, $maxChars) as $part) {
                $lines[] = ['text' => $part, 'tone' => $tone, 'size' => $size];
            }
        }
        return $lines;
    }

    /** @param array<string,string> $fields */
    private static function substitute(string $template, array $fields): string
    {
        return (string) preg_replace_callback(
            '/\{([a-z_]+)\}/',
            static fn (array $match): string => (string) ($fields[$match[1]] ?? $match[0]),
            $template
        );
    }

    private static function sizeForTone(string $tone): float
    {
        return match ($tone) {
            'strong' => 10.5,
            'body' => 9.2,
            default => 8.4,
        };
    }

    private static function lineStep(float $size): float
    {
        return round($size * 1.34, 2);
    }

    private static function fillForTone(string $tone): string
    {
        return match ($tone) {
            'strong' => '#0f172a',
            'body' => '#475569',
            default => '#7c8798',
        };
    }

    private static function weightForTone(string $tone): int
    {
        return $tone === 'strong' ? 600 : 400;
    }

    private static function band(float $width, float $top, array $payload): string
    {
        $cells = $payload['cells'] ?? self::CELLS;
        $columns = self::columns($width);
        $rows = (int) ceil(count($cells) / $columns);
        $rowHeight = self::rowHeight($width);
        $cellWidth = $width / $columns;
        $band = $rows * $rowHeight;

        $svg = '<g id="guia-evacuacion" data-footer-band="1">' . "\n";
        $svg .= '<rect x="0" y="' . SvgAsset::num($top) . '" width="' . SvgAsset::num($width) . '" height="' . SvgAsset::num($band)
            . '" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>' . "\n";
        // Separadores verticales entre columnas y horizontales entre filas.
        for ($row = 0; $row <= $rows; $row++) {
            $y = $top + $row * $rowHeight;
            $svg .= '<line x1="0" y1="' . SvgAsset::num($y) . '" x2="' . SvgAsset::num($width) . '" y2="' . SvgAsset::num($y)
                . '" stroke="#e2e8f0" stroke-width="1"/>' . "\n";
        }
        for ($column = 1; $column < $columns; $column++) {
            $svg .= '<line x1="' . SvgAsset::num($column * $cellWidth) . '" y1="' . SvgAsset::num($top)
                . '" x2="' . SvgAsset::num($column * $cellWidth) . '" y2="' . SvgAsset::num($top + $band)
                . '" stroke="#e2e8f0" stroke-width="1"/>' . "\n";
        }

        foreach ($cells as $index => $cell) {
            $column = $index % $columns;
            $row = (int) floor($index / $columns);
            $cellX = $column * $cellWidth;
            $cellY = $top + $row * $rowHeight;
            $svg .= self::cell($cell, $cellX, $cellY, $cellWidth, $rowHeight);
        }
        $svg .= '</g>' . "\n";
        return $svg;
    }

    /** @param array<string,string> $cell */
    private static function cell(array $cell, float $x, float $y, float $width, float $height): string
    {
        $pad = min(self::PAD, $height * 0.16);
        $icon = round($height * 0.50, 2);
        $gap = round($height * 0.08, 2);
        $iconX = $x + $pad;
        $iconY = $y + ($height - $icon) / 2;
        $textX = $iconX + $icon + $gap;
        $textWidth = max(40.0, $x + $width - $pad - $textX);

        $titleSize = round(max(7.5, min(13.5, $height * 0.098)), 2);
        $bodySize = round(max(6.6, min(11.0, $height * 0.082)), 2);
        $titleChars = max(8, (int) floor($textWidth / ($titleSize * 0.56)));
        $bodyChars = max(10, (int) floor($textWidth / ($bodySize * 0.52)));
        $titleLines = array_slice(SvgAsset::wrap((string) $cell['title'], $titleChars), 0, 2);
        $bodyLines = SvgAsset::wrap((string) $cell['text'], $bodyChars);

        $titleStep = $titleSize * 1.18;
        $lineStep = self::lineStep($bodySize);
        $titleBlock = count($titleLines) * $titleStep;
        $available = $height - $pad * 2 - $titleBlock - 4.0;
        $maxBody = max(1, (int) floor($available / $lineStep));
        $bodyLines = array_slice($bodyLines, 0, $maxBody);
        $blockHeight = $titleBlock + 4.0 + count($bodyLines) * $lineStep;
        $cursor = $y + max($pad, ($height - $blockHeight) / 2);

        $svg = '<g data-footer-cell="' . SvgAsset::esc((string) $cell['key']) . '">';
        $svg .= self::icon((string) $cell['icon'], $iconX, $iconY, $icon, (string) $cell['accent']);
        foreach ($titleLines as $index => $line) {
            $baseline = $cursor + $titleSize * 0.92 + $index * $titleStep;
            $svg .= '<text x="' . SvgAsset::num($textX) . '" y="' . SvgAsset::num($baseline) . '" font-size="' . SvgAsset::num($titleSize)
                . '" font-weight="700" fill="' . SvgAsset::esc((string) ($cell['title_color'] ?? '#0f172a')) . '" letter-spacing="0.3">'
                . SvgAsset::esc($line) . '</text>';
        }
        $cursor += $titleBlock + 4.0;
        foreach ($bodyLines as $index => $line) {
            $baseline = $cursor + $bodySize * 0.86 + $index * $lineStep;
            $svg .= '<text x="' . SvgAsset::num($textX) . '" y="' . SvgAsset::num($baseline) . '" font-size="' . SvgAsset::num($bodySize)
                . '" fill="#475569">' . SvgAsset::esc($line) . '</text>';
        }
        $svg .= '</g>' . "\n";
        return $svg;
    }

    private static function icon(string $icon, float $x, float $y, float $size, string $accent): string
    {
        if (str_starts_with($icon, 'sign:')) {
            return SvgAsset::nested(substr($icon, 5), $x, $y, $size, $size, '#0f172a');
        }
        $scale = $size / 24.0;
        $svg = '<g transform="translate(' . SvgAsset::num($x) . ' ' . SvgAsset::num($y) . ') scale(' . SvgAsset::num($scale) . ')" fill="'
            . SvgAsset::esc($accent) . '">';
        if ($icon === 'pin') {
            $svg .= '<path d="M12 2.2c-4.2 0-7.6 3.4-7.6 7.6 0 5.6 7.6 12 7.6 12s7.6-6.4 7.6-12c0-4.2-3.4-7.6-7.6-7.6z" fill="'
                . SvgAsset::esc($accent) . '"/><circle cx="12" cy="9.8" r="2.9" fill="#ffffff"/>';
        } else {
            // Flecha de evacuación: trazo grueso con punta, como en la señalética.
            $svg .= '<path d="M2.5 9.4h9.9V5.2L21.9 12l-9.5 6.8v-4.2H2.5z" fill="' . SvgAsset::esc($accent) . '"/>';
        }
        $svg .= '</g>';
        return $svg;
    }

    private static function dataBlock(float $width, float $top, array $payload): string
    {
        $svg = '<g id="datos-plano" data-plan-data="1">' . "\n";
        $svg .= '<line x1="0" y1="' . SvgAsset::num($top) . '" x2="' . SvgAsset::num($width) . '" y2="' . SvgAsset::num($top)
            . '" stroke="#e2e8f0" stroke-width="1"/>' . "\n";
        $cursor = $top + 6.0;
        foreach (self::wrappedLines($width, $payload) as $line) {
            $step = self::lineStep($line['size']);
            $baseline = $cursor + $line['size'] * 0.94;
            $svg .= '<text x="' . SvgAsset::num(self::PAD) . '" y="' . SvgAsset::num($baseline) . '" font-size="'
                . SvgAsset::num($line['size']) . '" font-weight="' . self::weightForTone($line['tone']) . '" fill="'
                . self::fillForTone($line['tone']) . '" data-footer-line="' . SvgAsset::esc($line['tone']) . '">'
                . SvgAsset::esc($line['text']) . '</text>' . "\n";
            $cursor += $step;
        }
        $svg .= '</g>' . "\n";
        return $svg;
    }

    private static function date(mixed $value): string
    {
        $text = trim((string) $value);
        if ($text === '') {
            return date('d/m/Y');
        }
        $timestamp = strtotime($text);
        return $timestamp === false ? date('d/m/Y') : date('d/m/Y', $timestamp);
    }
}
