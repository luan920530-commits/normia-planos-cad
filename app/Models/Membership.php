<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\ValidationException;

/**
 * Roles y permisos por empresa.
 *
 * El rol vive en `memberships` y es la única fuente de autorización dentro de
 * una empresa. `owner` no se puede quitar al último propietario: una empresa
 * sin propietario quedaría sin nadie que pueda administrarla.
 */
final class Membership
{
    public const ROLES = ['owner', 'admin', 'editor', 'viewer'];

    public const LABELS = [
        'owner' => 'Propietario',
        'admin' => 'Administrador',
        'editor' => 'Editor',
        'viewer' => 'Lector',
    ];

    public const DESCRIPTIONS = [
        'owner' => 'Administra la empresa, las personas y todos los planos. No se puede quedar sin propietario.',
        'admin' => 'Crea y elimina proyectos, administra personas y edita planos.',
        'editor' => 'Crea proyectos y edita planos. No elimina proyectos ni administra personas.',
        'viewer' => 'Consulta planos, auditorías y verificaciones. No edita.',
    ];

    /** Capacidades por rol, de menor a mayor alcance. */
    private const CAPABILITIES = [
        'viewer' => ['view'],
        'editor' => ['view', 'write'],
        'admin' => ['view', 'write', 'manage'],
        'owner' => ['view', 'write', 'manage', 'own'],
    ];

    public static function can(?string $role, string $capability): bool
    {
        if ($role === null || !isset(self::CAPABILITIES[$role])) {
            return false;
        }
        return in_array($capability, self::CAPABILITIES[$role], true);
    }

    public static function label(?string $role): string
    {
        return self::LABELS[$role ?? ''] ?? 'Sin acceso';
    }

    public static function roleFor(int $organizationId, int $userId): ?string
    {
        $role = Database::value(
            'SELECT role FROM memberships WHERE organization_id = ? AND user_id = ?',
            [$organizationId, $userId]
        );
        $role = is_string($role) ? $role : null;
        return $role !== null && isset(self::CAPABILITIES[$role]) ? $role : null;
    }

    public static function add(int $organizationId, int $userId, string $role): void
    {
        $role = self::normalizeRole($role);
        $exists = (int) Database::value(
            'SELECT COUNT(*) FROM memberships WHERE organization_id = ? AND user_id = ?',
            [$organizationId, $userId]
        );
        if ($exists > 0) {
            Database::execute(
                'UPDATE memberships SET role = ? WHERE organization_id = ? AND user_id = ?',
                [$role, $organizationId, $userId]
            );
            return;
        }
        Database::execute(
            'INSERT INTO memberships (organization_id, user_id, role) VALUES (?, ?, ?)',
            [$organizationId, $userId, $role]
        );
    }

    public static function setRole(int $organizationId, int $userId, string $role): void
    {
        $role = self::normalizeRole($role);
        $current = self::roleFor($organizationId, $userId);
        if ($current === null) {
            throw new \DomainException('Esa persona no pertenece a la empresa.');
        }
        if ($current === 'owner' && $role !== 'owner' && self::ownerCount($organizationId) <= 1) {
            throw new \DomainException('La empresa necesita al menos un propietario. Asigna ese rol a otra persona antes de cambiarlo.');
        }
        Database::execute(
            'UPDATE memberships SET role = ? WHERE organization_id = ? AND user_id = ?',
            [$role, $organizationId, $userId]
        );
    }

    public static function remove(int $organizationId, int $userId): void
    {
        $role = self::roleFor($organizationId, $userId);
        if ($role === null) {
            throw new \DomainException('Esa persona no pertenece a la empresa.');
        }
        if ($role === 'owner' && self::ownerCount($organizationId) <= 1) {
            throw new \DomainException('No puedes sacar al único propietario de la empresa.');
        }
        Database::execute(
            'DELETE FROM memberships WHERE organization_id = ? AND user_id = ?',
            [$organizationId, $userId]
        );
    }

    public static function ownerCount(int $organizationId): int
    {
        return (int) Database::value(
            'SELECT COUNT(*) FROM memberships WHERE organization_id = ? AND role = "owner"',
            [$organizationId]
        );
    }

    public static function normalizeRole(string $role): string
    {
        return in_array($role, self::ROLES, true) ? $role : 'viewer';
    }
}
