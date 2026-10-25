<?php
declare(strict_types=1);

namespace App\Core;

use App\Models\User;

final class Auth
{
    private static ?array $cachedUser = null;
    private static bool $loaded = false;

    public static function check(): bool
    {
        return self::user() !== null;
    }

    public static function user(): ?array
    {
        if (self::$loaded) {
            return self::$cachedUser;
        }
        self::$loaded = true;
        $id = Session::get('user_id');
        if (!is_int($id) && !(is_string($id) && ctype_digit($id))) {
            return null;
        }
        $user = User::find((int) $id);
        if ($user === null) {
            Session::remove('user_id');
            return null;
        }
        self::$cachedUser = $user;
        return $user;
    }

    public static function attempt(string $email, string $password): bool
    {
        $attempts = Session::get('login_attempts', []);
        $now = time();
        $recent = [];
        if (is_array($attempts)) {
            foreach ($attempts as $attempt) {
                if (is_int($attempt) && $attempt > $now - 600) {
                    $recent[] = $attempt;
                }
            }
        }
        if (count($recent) >= 6) {
            return false;
        }
        $user = User::findByEmail($email);
        $hash = $user['password_hash'] ?? '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        $valid = password_verify($password, $hash) && $user !== null;
        if (!$valid) {
            $recent[] = $now;
            Session::set('login_attempts', $recent);
            return false;
        }
        Session::remove('login_attempts');
        Session::regenerate();
        Session::set('user_id', (int) $user['id']);
        self::$loaded = true;
        self::$cachedUser = $user;
        return true;
    }

    public static function tooManyAttempts(): bool
    {
        $attempts = Session::get('login_attempts', []);
        if (!is_array($attempts)) {
            return false;
        }
        $recent = array_filter($attempts, static fn ($value): bool => is_int($value) && $value > time() - 600);
        return count($recent) >= 6;
    }

    public static function logout(): void
    {
        Session::destroy();
        self::$loaded = true;
        self::$cachedUser = null;
    }

    public static function requireUser(): array
    {
        $user = self::user();
        if ($user === null) {
            throw new \RuntimeException('Autenticación requerida.');
        }
        return $user;
    }
}
