<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

/**
 * Enlace público de solo lectura del modo brigadista.
 *
 * Cada piso puede tener un enlace con un token aleatorio de 32 caracteres
 * hexadecimales. El token se puede regenerar (el anterior deja de funcionar) y
 * el enlace se puede desactivar sin borrarlo. Nada de esto expone la sesión ni
 * datos de la cuenta: la página pública solo sabe el nombre del proyecto, el
 * sitio, el piso y el plano guardado.
 */
final class Brigade
{
    public const TOKEN_PATTERN = '/^[a-f0-9]{32}$/D';

    /** Enlace del piso, si existe, con los datos del piso y del proyecto. */
    public static function forFloor(int $floorId, int $userId): ?array
    {
        return Database::first(
            'SELECT b.*, f.name AS floor_name, f.level AS floor_level, f.updated_at AS floor_updated_at,
                    f.version AS floor_version, p.id AS project_id, p.name AS project_name, p.site AS project_site,
                    p.workplace AS project_workplace, p.responsible AS project_responsible
             FROM brigade_links b
             JOIN floors f ON f.id = b.floor_id
             JOIN projects p ON p.id = f.project_id
             WHERE b.floor_id = ? AND p.user_id = ?',
            [$floorId, $userId]
        );
    }

    /** Enlace activo a partir del token, sin sesión. */
    public static function findByToken(string $token): ?array
    {
        if (preg_match(self::TOKEN_PATTERN, $token) !== 1) {
            return null;
        }
        return Database::first(
            'SELECT b.id AS brigade_id, b.token, b.enabled, b.updated_at AS brigade_updated_at,
                    f.id AS floor_id, f.name AS floor_name, f.level AS floor_level, f.design_json,
                    f.version AS floor_version, f.updated_at AS floor_updated_at,
                    p.id AS project_id, p.name AS project_name, p.site AS project_site,
                    p.workplace AS project_workplace, p.responsible AS project_responsible
             FROM brigade_links b
             JOIN floors f ON f.id = b.floor_id
             JOIN projects p ON p.id = f.project_id
             WHERE b.token = ?',
            [$token]
        );
    }

    /**
     * Crea o reutiliza el enlace del piso. Con `$regenerate` cambia el token y
     * deja el anterior sin efecto de inmediato.
     */
    public static function enable(int $floorId, int $userId, bool $regenerate = false): ?array
    {
        $floor = self::floorForUser($floorId, $userId);
        if ($floor === null) {
            return null;
        }
        $existing = Database::first('SELECT * FROM brigade_links WHERE floor_id = ?', [$floorId]);
        if ($existing !== null && !$regenerate) {
            if ((int) $existing['enabled'] !== 1) {
                Database::execute('UPDATE brigade_links SET enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [(int) $existing['id']]);
            }
            self::touchFloor($floorId);
            return self::forFloor($floorId, $userId);
        }
        $token = self::newToken();
        if ($existing === null) {
            Database::execute(
                'INSERT INTO brigade_links (floor_id, token, enabled) VALUES (?, ?, 1)',
                [$floorId, $token]
            );
        } else {
            Database::execute(
                'UPDATE brigade_links SET token = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [$token, (int) $existing['id']]
            );
        }
        self::touchFloor($floorId);
        return self::forFloor($floorId, $userId);
    }

    /** Desactiva el enlace conservando el token (deja de responder). */
    public static function disable(int $floorId, int $userId): bool
    {
        if (self::floorForUser($floorId, $userId) === null) {
            return false;
        }
        Database::execute(
            'UPDATE brigade_links SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE floor_id = ?',
            [$floorId]
        );
        self::touchFloor($floorId);
        return true;
    }

    /**
     * El plano cambió: se marca la fecha del enlace para que la página pública
     * muestre cuándo se actualizó por última vez.
     */
    public static function notePlanChange(int $floorId): void
    {
        Database::execute(
            'UPDATE brigade_links SET updated_at = CURRENT_TIMESTAMP WHERE floor_id = ?',
            [$floorId]
        );
    }

    private static function newToken(): string
    {
        return bin2hex(random_bytes(16));
    }

    private static function floorForUser(int $floorId, int $userId): ?array
    {
        return Database::first(
            'SELECT f.id FROM floors f JOIN projects p ON p.id = f.project_id WHERE f.id = ? AND p.user_id = ?',
            [$floorId, $userId]
        );
    }

    private static function touchFloor(int $floorId): void
    {
        Database::execute('UPDATE floors SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$floorId]);
    }
}
