<?php
declare(strict_types=1);

namespace App\Core;

final class Autoloader
{
    public static function register(string $appPath): void
    {
        spl_autoload_register(static function (string $class) use ($appPath): void {
            $prefix = 'App\\';
            if (!str_starts_with($class, $prefix)) {
                return;
            }
            $relative = substr($class, strlen($prefix));
            if ($relative === '' || preg_match('/^[A-Za-z0-9_\\\\]+$/D', $relative) !== 1) {
                return;
            }
            $file = $appPath . '/' . str_replace('\\', '/', $relative) . '.php';
            if (is_file($file)) {
                require $file;
            }
        });
    }
}
