<?php
declare(strict_types=1);

use App\Core\Config;
use App\Core\Csrf;
use App\Core\Session;
use App\Core\Url;

/** Escapa cualquier valor para HTML. */
function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** URL interna con enrutado por query string (compatible con cualquier hosting). */
function url(string $route = '', array $params = []): string
{
    return Url::to($route, $params);
}

function asset(string $path): string
{
    return Url::asset($path);
}

function csrf_field(): string
{
    return '<input type="hidden" name="_token" value="' . e(Csrf::token()) . '">';
}

/** Recorta texto UTF-8 sin depender de mbstring. */
function text_limit(string $text, int $limit): string
{
    $text = trim($text);
    if ($limit < 1 || $text === '') {
        return '';
    }
    if (preg_match_all('/./us', $text, $matches) === false) {
        return '';
    }
    $characters = $matches[0];
    if (count($characters) <= $limit) {
        return $text;
    }
    return rtrim(implode('', array_slice($characters, 0, $limit - 1))) . '…';
}

/** Fecha SQLite UTC → hora local de la aplicación. */
function format_date(?string $value, string $format = 'd/m/Y H:i'): string
{
    if ($value === null || $value === '') {
        return '—';
    }
    try {
        $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
        return $date->setTimezone(new DateTimeZone(Config::get('timezone', 'America/Bogota')))->format($format);
    } catch (Throwable) {
        return '—';
    }
}

function slug_filename(string $value, string $fallback = 'plano'): string
{
    $value = trim($value);
    if ($value === '') {
        return $fallback;
    }
    $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if ($converted !== false) {
        $value = $converted;
    }
    $value = strtolower($value);
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
    $value = trim($value, '-');
    $value = substr($value, 0, 60);
    return $value !== '' ? $value : $fallback;
}

function client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

/** Presets de lienzo usados por el instalador y la vista de proyectos. */
function canvas_presets(): array
{
    return [
        'a4h' => ['label' => 'A4 horizontal', 'width' => 1123, 'height' => 794, 'grid' => 20, 'unit' => 'cm', 'scale' => '1:100'],
        'a4v' => ['label' => 'A4 vertical', 'width' => 794, 'height' => 1123, 'grid' => 20, 'unit' => 'cm', 'scale' => '1:100'],
        'a3h' => ['label' => 'A3 horizontal', 'width' => 1587, 'height' => 1123, 'grid' => 20, 'unit' => 'cm', 'scale' => '1:100'],
        'planta' => ['label' => 'Planta amplia', 'width' => 1400, 'height' => 900, 'grid' => 25, 'unit' => 'cm', 'scale' => '1:100'],
        'libre' => ['label' => 'Lienzo libre', 'width' => 1200, 'height' => 800, 'grid' => 20, 'unit' => 'cm', 'scale' => '1:100'],
    ];
}

function selected_canvas_preset(string $key): array
{
    $presets = canvas_presets();
    return $presets[$key] ?? $presets['libre'];
}

function version_label(int $version): string
{
    return 'v' . max(1, $version);
}

function flash_success(string $message): void
{
    Session::flash('success', $message);
}

function flash_error(string $message): void
{
    Session::flash('error', $message);
}
