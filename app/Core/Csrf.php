<?php
declare(strict_types=1);

namespace App\Core;

final class Csrf
{
    public static function token(): string
    {
        Session::start();
        $token = $_SESSION['_csrf'] ?? '';
        if (!is_string($token) || strlen($token) < 32) {
            $token = bin2hex(random_bytes(32));
            $_SESSION['_csrf'] = $token;
        }
        return $token;
    }

    public static function check(string $token): bool
    {
        $expected = self::token();
        return $token !== '' && hash_equals($expected, $token);
    }
}
