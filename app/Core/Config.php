<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;
use Throwable;

final class Config
{
    private static string $basePath = '';
    private static array $data = [];
    private static bool $loaded = false;

    public static function boot(string $basePath): void
    {
        self::$basePath = rtrim($basePath, '/');
        $defaults = [
            'database' => null,
            'session_name' => 'normia_sid',
            'app_key' => null,
            'timezone' => 'America/Bogota',
            'demo' => false,
            'installed_at' => null,
        ];
        $file = self::$basePath . '/config/config.php';
        $data = [];
        if (is_file($file)) {
            try {
                $loaded = require $file;
                if (is_array($loaded)) {
                    $data = $loaded;
                }
            } catch (Throwable $exception) {
                error_log('Normia: no se pudo leer config/config.php: ' . $exception->getMessage());
            }
        }
        self::$data = array_merge($defaults, $data);
        self::$loaded = is_file($file);
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::$data[$key] ?? $default;
    }

    public static function basePath(): string
    {
        return self::$basePath;
    }

    public static function hasConfigFile(): bool
    {
        return self::$loaded;
    }

    public static function isInstalled(): bool
    {
        if (!self::$loaded) {
            return false;
        }
        $database = self::databasePath();
        return $database !== null && is_file($database);
    }

    public static function databasePath(): ?string
    {
        $path = self::$data['database'] ?? null;
        return is_string($path) && $path !== '' ? $path : null;
    }

    public static function configFile(): string
    {
        return self::$basePath . '/config/config.php';
    }

    public static function isDemoBuild(): bool
    {
        return is_file(self::$basePath . '/resources/demo/.demo-build');
    }

    public static function requireInstalled(): void
    {
        if (!self::isInstalled()) {
            throw new RuntimeException('La aplicación todavía no está instalada.');
        }
    }
}
