<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\ValidationException;

final class User
{
    public static function find(int $id): ?array
    {
        return Database::first('SELECT id, name, email, is_admin, created_at, updated_at FROM users WHERE id = ?', [$id]);
    }

    public static function findByEmail(string $email): ?array
    {
        return Database::first('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [trim($email)]);
    }

    public static function create(string $name, string $email, string $password, bool $isAdmin = false): int
    {
        $errors = [];
        $name = trim($name);
        $email = trim($email);
        $nameLength = self::length($name);
        if ($nameLength < 2 || $nameLength > 80) {
            $errors['name'] = 'El nombre debe tener entre 2 y 80 caracteres.';
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 160) {
            $errors['email'] = 'Escribe un correo electrónico válido.';
        }
        if (self::length($password) < 10) {
            $errors['password'] = 'La contraseña debe tener al menos 10 caracteres.';
        }
        if (!preg_match('/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/u', $password) || !preg_match('/[0-9]/', $password)) {
            $errors['password'] = 'La contraseña debe combinar letras y números.';
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
        if (self::findByEmail($email) !== null) {
            throw new ValidationException(['email' => 'Ya existe una cuenta con este correo.']);
        }
        Database::execute(
            'INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)',
            [$name, $email, password_hash($password, PASSWORD_DEFAULT), $isAdmin ? 1 : 0]
        );
        return Database::lastId();
    }

    public static function updatePassword(int $id, string $password): void
    {
        if (self::length($password) < 10 || !preg_match('/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/u', $password) || !preg_match('/[0-9]/', $password)) {
            throw new ValidationException(['password' => 'La contraseña debe tener al menos 10 caracteres y combinar letras y números.']);
        }
        Database::execute(
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [password_hash($password, PASSWORD_DEFAULT), $id]
        );
    }

    public static function verifyPassword(int $id, string $password): bool
    {
        $user = Database::first('SELECT password_hash FROM users WHERE id = ?', [$id]);
        return $user !== null && password_verify($password, (string) $user['password_hash']);
    }

    public static function count(): int
    {
        return (int) Database::value('SELECT COUNT(*) FROM users');
    }

    private static function length(string $value): int
    {
        $count = preg_match_all('/./us', $value, $matches);
        return $count === false ? strlen($value) : $count;
    }
}
