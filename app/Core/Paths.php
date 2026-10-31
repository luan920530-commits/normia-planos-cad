<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Rutas de la aplicación.
 *
 * Distingue el **código** (solo lectura, dentro del programa instalado) de los
 * **datos** (`config/` y `storage/`: base, sesiones y registros). En un hosting
 * clásico ambos coinciden, como siempre. En la distribución de escritorio la
 * variable de entorno `NORMA_DATA_PATH` apunta a la carpeta del usuario, de modo
 * que actualizar el programa nunca borra los planos y el instalador no necesita
 * escribir dentro de `Aplicaciones` ni de `Archivos de programa`.
 *
 * Solo se acepta una ruta absoluta y existente (o creable); cualquier otro valor
 * se ignora y se vuelve a la carpeta del código.
 */
final class Paths
{
    private static string $base = '';

    private static string $data = '';

    /** Fija las rutas. Se llama desde `Config::boot()` una vez por petición. */
    public static function init(string $base, ?string $data = null): void
    {
        self::$base = rtrim($base, '/\\');
        $override = $data === null ? self::fromEnvironment() : trim($data);
        self::$data = $override !== '' ? rtrim($override, '/\\') : self::$base;
    }

    /** Carpeta del código (aplicación instalada o paquete descomprimido). */
    public static function base(): string
    {
        return self::$base !== '' ? self::$base : rtrim((string) BASE_PATH, '/\\');
    }

    /** Carpeta de datos: config, base SQLite, sesiones y registros. */
    public static function data(): string
    {
        if (self::$data !== '') {
            return self::$data;
        }
        self::$data = self::base();
        return self::$data;
    }

    /** ¿Los datos viven fuera del código? (distribución de escritorio) */
    public static function isPortable(): bool
    {
        return self::data() !== self::base();
    }

    public static function configFile(): string
    {
        return self::data() . '/config/config.php';
    }

    public static function configDir(): string
    {
        return self::data() . '/config';
    }

    public static function storage(): string
    {
        return self::data() . '/storage';
    }

    public static function sessions(): string
    {
        return self::storage() . '/sessions';
    }

    public static function logs(): string
    {
        return self::storage() . '/logs';
    }

    public static function cache(): string
    {
        return self::storage() . '/cache';
    }

    /** Ruta de una base dentro de `storage`. Solo acepta nombres simples. */
    public static function database(string $file): string
    {
        $name = basename($file);
        return self::storage() . '/' . $name;
    }

    /**
     * Crea las carpetas de datos que falten. Devuelve la lista de las que no
     * se pudieron preparar para que el instalador las muestre.
     *
     * @return list<string>
     */
    public static function ensure(): array
    {
        $failed = [];
        foreach ([self::configDir(), self::storage(), self::sessions(), self::logs(), self::cache()] as $directory) {
            if (is_dir($directory)) {
                continue;
            }
            if (!@mkdir($directory, 0770, true) && !is_dir($directory)) {
                $failed[] = $directory;
            }
        }
        return $failed;
    }

    /** Valor saneado de `NORMA_DATA_PATH`; cadena vacía si no sirve. */
    public static function fromEnvironment(): string
    {
        $value = getenv('NORMA_DATA_PATH');
        if (!is_string($value)) {
            return '';
        }
        $value = trim($value);
        if ($value === '' || str_contains($value, "\0")) {
            return '';
        }
        $absolute = preg_match('#^([A-Za-z]:[\\\\/]|/|\\\\\\\\)#', $value) === 1;
        if (!$absolute) {
            return '';
        }
        return $value;
    }
}
