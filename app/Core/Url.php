<?php
declare(strict_types=1);

namespace App\Core;

final class Url
{
    private static ?string $base = null;

    public static function basePath(): string
    {
        if (self::$base !== null) {
            return self::$base;
        }
        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
        $directory = rtrim(str_replace('\\', '/', dirname($script)), '/');
        if ($directory === '.' || $directory === '/') {
            $directory = '';
        }
        // Si el servidor expone /index.php, la base es la carpeta contenedora.
        self::$base = $directory;
        return self::$base;
    }

    /**
     * URL interna. La ruta puede llevar un ancla al final (`plugins#instalar`):
     * se separa antes de codificar para que el navegador salte al bloque.
     */
    public static function to(string $route = '', array $params = []): string
    {
        $base = self::basePath();
        $fragment = '';
        $anchor = strpos($route, '#');
        if ($anchor !== false) {
            $fragment = substr($route, $anchor);
            $route = substr($route, 0, $anchor);
        }
        $query = $params;
        if ($route !== '') {
            $query = ['r' => trim($route, '/')] + $query;
        }
        $encoded = http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        return $base . '/index.php' . ($encoded !== '' ? '?' . $encoded : '') . $fragment;
    }

    public static function asset(string $path): string
    {
        $path = ltrim($path, '/');
        $file = BASE_PATH . '/assets/' . $path;
        $version = is_file($file) ? (string) filemtime($file) : '1';
        return self::basePath() . '/assets/' . $path . '?v=' . $version;
    }
}
