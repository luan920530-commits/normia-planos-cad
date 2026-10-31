<?php
declare(strict_types=1);

/**
 * Enrutador del servidor local de la distribución de escritorio.
 *
 * El servidor integrado de PHP sirve cualquier archivo que esté bajo la carpeta
 * pública. La aplicación guarda el plano en `storage/` y la configuración en
 * `config/`, así que aquí se replican las reglas del `.htaccess` de un hosting:
 * solo `assets/` se entrega como archivo; el resto pasa por `index.php`.
 *
 * Se prueba en `tests/php/desktop.mjs` sin levantar el servidor.
 */

/** Archivos públicos que se entregan tal cual. */
function normaDesktopIsStatic(string $path): bool
{
    if (str_starts_with($path, '/assets/')) {
        return true;
    }
    return in_array($path, ['/favicon.ico', '/robots.txt'], true);
}

/** Prefijos internos que nunca deben servirse, aunque existan en disco. */
function normaDesktopIsProtected(string $path): bool
{
    $protected = ['/app', '/config', '/resources', '/storage', '/tests', '/tools', '/docs', '/paquetes'];
    foreach ($protected as $prefix) {
        if ($path === $prefix || str_starts_with($path, $prefix . '/')) {
            return true;
        }
    }
    return str_starts_with($path, '/.') && !str_starts_with($path, '/.well-known');
}

/**
 * Decide qué hacer con una ruta.
 *
 * @return string `deny`, `static` o `app`.
 */
function normaDesktopRoute(string $requestUri): string
{
    // Antes de descifrar la URL: un byte nulo puede cortar el análisis y dejar
    // pasar una ruta que en realidad era otra.
    if (str_contains($requestUri, "\0")) {
        return 'deny';
    }
    $path = parse_url($requestUri, PHP_URL_PATH);
    if (!is_string($path) || $path === '') {
        $path = '/';
    }
    $path = rawurldecode($path);
    if (str_contains($path, "\0")) {
        return 'deny';
    }
    $path = '/' . ltrim(str_replace('\\', '/', $path), '/');
    if (str_contains($path, '/../') || str_ends_with($path, '/..')) {
        return 'deny';
    }
    if (normaDesktopIsProtected($path)) {
        return 'deny';
    }
    if (normaDesktopIsStatic($path)) {
        return 'static';
    }
    return 'app';
}

if (PHP_SAPI === 'cli-server') {
    $route = normaDesktopRoute((string) ($_SERVER['REQUEST_URI'] ?? '/'));
    if ($route === 'deny') {
        http_response_code(404);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'No encontrado.';
        return true;
    }
    if ($route === 'static') {
        // `false` deja que el servidor integrado entregue el archivo.
        return false;
    }
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    require dirname(__DIR__, 2) . '/index.php';
    return true;
}
