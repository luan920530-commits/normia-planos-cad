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

    public static function to(string $route = '', array $params = []): string
    {
        $base = self::basePath();
        $query = $params;
        if ($route !== '') {
            $query = ['r' => trim($route, '/')] + $query;
        }
        $encoded = http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        return $base . '/index.php' . ($encoded !== '' ? '?' . $encoded : '');
    }

    public static function asset(string $path): string
    {
        $path = ltrim($path, '/');
        $file = BASE_PATH . '/assets/' . $path;
        $version = is_file($file) ? (string) filemtime($file) : '1';
        return self::basePath() . '/assets/' . $path . '?v=' . $version;
    }
}
