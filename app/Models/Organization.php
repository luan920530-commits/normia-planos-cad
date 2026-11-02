<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\ValidationException;

/**
 * Empresas (organizaciones).
 *
 * Es la frontera de los datos: un proyecto pertenece a una empresa y una
 * persona entra por una membresía con rol. Un usuario puede pertenecer a
 * varias empresas (la suya propia y las que lo inviten) y no necesita cambiar
 * de contexto: ve los planos de todas, cada uno con la empresa a la que
 * pertenece.
 */
final class Organization
{
    public const MAX_NAME = 120;
    public const MAX_TAX_ID = 40;
    public const MAX_CITY = 80;

    /** Empresas de una persona, con su rol y los conteos de cada una. */
    public static function forUser(int $userId): array
    {
        return Database::query(
            'SELECT o.*, m.role,
                    (SELECT COUNT(*) FROM projects p WHERE p.organization_id = o.id) AS project_count,
                    (SELECT COUNT(*) FROM memberships m2 WHERE m2.organization_id = o.id) AS member_count
             FROM organizations o
             JOIN memberships m ON m.organization_id = o.id AND m.user_id = ?
             ORDER BY o.name COLLATE NOCASE, o.id',
            [$userId]
        );
    }

    /** Empresas donde la persona puede crear o editar planos. */
    public static function writableForUser(int $userId): array
    {
        return array_values(array_filter(
            self::forUser($userId),
            static fn (array $row): bool => Membership::can($row['role'] ?? null, 'write')
        ));
    }

    public static function find(int $id): ?array
    {
        return Database::first('SELECT * FROM organizations WHERE id = ?', [$id]);
    }

    /** Empresa visible para la persona, con su rol. */
    public static function findForUser(int $id, int $userId): ?array
    {
        return Database::first(
            'SELECT o.*, m.role FROM organizations o
             JOIN memberships m ON m.organization_id = o.id
             WHERE o.id = ? AND m.user_id = ?',
            [$id, $userId]
        );
    }

    /**
     * Empresa por defecto para crear un proyecto: la primera donde la persona
     * puede escribir. Devuelve null si no pertenece a ninguna con ese permiso.
     */
    public static function defaultForUser(int $userId): ?array
    {
        $rows = Database::query(
            'SELECT o.*, m.role FROM organizations o
             JOIN memberships m ON m.organization_id = o.id
             WHERE m.user_id = ? AND m.role IN ("owner", "admin", "editor")
             ORDER BY o.id',
            [$userId]
        );
        return $rows[0] ?? null;
    }

    public static function create(int $userId, array $data): int
    {
        $clean = self::validate($data);
        return Database::transaction(static function () use ($userId, $clean): int {
            Database::execute(
                'INSERT INTO organizations (name, tax_id, city, created_by) VALUES (?, ?, ?, ?)',
                [$clean['name'], $clean['tax_id'], $clean['city'], $userId]
            );
            $organizationId = Database::lastId();
            Membership::add($organizationId, $userId, 'owner');
            return $organizationId;
        });
    }

    /** Empresa personal de una cuenta nueva (instalador y migraciones). */
    public static function ensurePersonal(int $userId, string $name): int
    {
        $existing = Database::value(
            'SELECT organization_id FROM memberships WHERE user_id = ? ORDER BY id LIMIT 1',
            [$userId]
        );
        if ($existing !== null && (int) $existing > 0) {
            return (int) $existing;
        }
        $clean = self::validate(['name' => $name !== '' ? $name : 'Mi empresa']);
        return Database::transaction(static function () use ($userId, $clean): int {
            Database::execute(
                'INSERT INTO organizations (name, tax_id, city, created_by) VALUES (?, "", "", ?)',
                [$clean['name'], $userId]
            );
            $organizationId = Database::lastId();
            Membership::add($organizationId, $userId, 'owner');
            return $organizationId;
        });
    }

    public static function update(int $id, array $data): void
    {
        $clean = self::validate($data);
        $updated = Database::execute(
            'UPDATE organizations SET name = ?, tax_id = ?, city = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$clean['name'], $clean['tax_id'], $clean['city'], $id]
        );
        if ($updated !== 1) {
            throw new \DomainException('La empresa no existe.');
        }
    }

    public static function delete(int $id): void
    {
        $deleted = Database::execute('DELETE FROM organizations WHERE id = ?', [$id]);
        if ($deleted !== 1) {
            throw new \DomainException('La empresa no existe.');
        }
    }

    /** Personas de la empresa con su rol, ordenadas por alcance. */
    public static function members(int $id): array
    {
        return Database::query(
            'SELECT m.user_id, m.role, m.created_at AS joined_at, u.name, u.email,
                    (SELECT COUNT(*) FROM floor_versions v WHERE v.created_by = u.id) AS version_count
             FROM memberships m
             JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = ?
             ORDER BY CASE m.role WHEN "owner" THEN 0 WHEN "admin" THEN 1 WHEN "editor" THEN 2 ELSE 3 END, u.name COLLATE NOCASE',
            [$id]
        );
    }

    public static function stats(int $id): array
    {
        return [
            'projects' => (int) Database::value('SELECT COUNT(*) FROM projects WHERE organization_id = ?', [$id]),
            'floors' => (int) Database::value(
                'SELECT COUNT(*) FROM floors f JOIN projects p ON p.id = f.project_id WHERE p.organization_id = ?',
                [$id]
            ),
            'members' => (int) Database::value('SELECT COUNT(*) FROM memberships WHERE organization_id = ?', [$id]),
        ];
    }

    /** @return array{name:string,tax_id:string,city:string} */
    private static function validate(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        $taxId = trim((string) ($data['tax_id'] ?? ''));
        $city = trim((string) ($data['city'] ?? ''));
        $errors = [];
        if ($name === '' || self::length($name) > self::MAX_NAME) {
            $errors['name'] = 'Escribe el nombre de la empresa (máximo ' . self::MAX_NAME . ' caracteres).';
        }
        if (self::length($taxId) > self::MAX_TAX_ID) {
            $errors['tax_id'] = 'El identificador tributario admite hasta ' . self::MAX_TAX_ID . ' caracteres.';
        }
        if (self::length($city) > self::MAX_CITY) {
            $errors['city'] = 'La ciudad admite hasta ' . self::MAX_CITY . ' caracteres.';
        }
        foreach (['name' => $name, 'tax_id' => $taxId, 'city' => $city] as $key => $value) {
            if (preg_match('/[<>]/u', $value) === 1) {
                $errors[$key] = 'El campo no admite etiquetas HTML.';
            }
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
        return ['name' => $name, 'tax_id' => $taxId, 'city' => $city];
    }

    private static function length(string $value): int
    {
        $count = preg_match_all('/./us', $value, $matches);
        return $count === false ? strlen($value) : $count;
    }
}
