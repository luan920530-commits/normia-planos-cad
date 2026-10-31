<?php
declare(strict_types=1);

namespace App\Core;

final class Session
{
    private static bool $started = false;

    public static function start(): void
    {
        if (self::$started || session_status() === PHP_SESSION_ACTIVE) {
            self::$started = true;
            return;
        }
        $savePath = Paths::sessions();
        if (!is_dir($savePath)) {
            @mkdir($savePath, 0770, true);
        }
        if (is_dir($savePath) && is_writable($savePath)) {
            session_save_path($savePath);
        }
        $name = (string) Config::get('session_name', 'normia_sid');
        if (preg_match('/^[A-Za-z0-9_]{3,40}$/D', $name) !== 1) {
            $name = 'normia_sid';
        }
        session_name($name);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'domain' => '',
            'secure' => is_https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        session_start();
        self::$started = true;
        if (!isset($_SESSION['_csrf']) || !is_string($_SESSION['_csrf']) || strlen($_SESSION['_csrf']) < 32) {
            $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        }
    }

    public static function id(): string
    {
        return session_id() ?: '';
    }

    public static function regenerate(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return $_SESSION[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        $_SESSION[$key] = $value;
    }

    public static function remove(string $key): void
    {
        unset($_SESSION[$key]);
    }

    public static function flash(string $type, string $message): void
    {
        $_SESSION['_flash'][] = ['type' => $type, 'message' => $message];
    }

    /** @return array<int,array{type:string,message:string}> */
    public static function flashes(): array
    {
        $messages = $_SESSION['_flash'] ?? [];
        unset($_SESSION['_flash']);
        return is_array($messages) ? $messages : [];
    }

    /** @param array<string,mixed> $values */
    public static function flashInput(array $values): void
    {
        $safe = [];
        foreach ($values as $key => $value) {
            if (is_scalar($value)) {
                $safe[(string) $key] = (string) $value;
            }
        }
        $_SESSION['_old'] = $safe;
    }

    public static function old(string $key, string $default = ''): string
    {
        $value = $_SESSION['_old'][$key] ?? $default;
        return is_string($value) ? $value : $default;
    }

    public static function clearOld(): void
    {
        unset($_SESSION['_old']);
    }

    public static function destroy(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'] ?? '/',
                'domain' => $params['domain'] ?? '',
                'secure' => (bool) ($params['secure'] ?? false),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            session_destroy();
        }
        self::$started = false;
    }
}
