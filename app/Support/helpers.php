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

/**
 * Ruta interna que se está viendo (`projects/12/...`), sin barras en los
 * extremos. La usa la cabecera para marcar el apartado actual; no es una
 * fuente de autorización: cada controlador vuelve a comprobar los permisos.
 */
function current_route(): string
{
    $route = $_GET['r'] ?? '';
    return is_string($route) ? trim($route, '/') : '';
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
    /*
     * Los acentos se resuelven aquí y no con `iconv`: según la biblioteca del
     * sistema, `TRANSLIT` convierte «í» en «?» o directamente la descarta, y el
     * archivo acababa llamándose «plano-sin-t-tulo». Con la tabla explícita,
     * «Plano sin título» es `plano-sin-titulo` en todos los sistemas.
     */
    $value = strtr($value, [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
        'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'â' => 'a', 'ê' => 'e',
        'î' => 'i', 'ô' => 'o', 'û' => 'u', 'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ö' => 'o',
        'ã' => 'a', 'õ' => 'o', 'å' => 'a', 'ø' => 'o', 'ç' => 'c', 'æ' => 'ae', 'œ' => 'oe',
    ]);
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

/**
 * URL absoluta de una ruta de la aplicación. Sirve para compartir el enlace
 * del modo brigadista, que se abre desde otro teléfono.
 */
function absolute_url(string $route = '', array $params = []): string
{
    $path = url($route, $params);
    if (preg_match('#^https?://#i', $path) === 1) {
        return $path;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    return ($https ? 'https://' : 'http://') . $host . '/' . ltrim($path, '/');
}

/** Fecha corta y legible en español para los avisos de actualización. */
function short_date(?string $value): string
{
    $value = trim((string) $value);
    if ($value === '') {
        return '';
    }
    $timestamp = strtotime($value . (preg_match('/[zZ]|[+-]\d\d:?\d\d$/', $value) === 1 ? '' : ' UTC'));
    if ($timestamp === false) {
        return $value;
    }
    $months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return date('j', $timestamp) . ' ' . $months[(int) date('n', $timestamp) - 1] . ' ' . date('Y', $timestamp)
        . ' · ' . date('H:i', $timestamp);
}
