<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\ValidationException;
use App\Core\VersionConflictException;
use App\Services\DesignValidator;

final class Floor
{
    public static function findForUser(int $floorId, int $userId): ?array
    {
        return Database::first(
            'SELECT f.*, p.name AS project_name, p.site AS project_site, p.workplace AS project_workplace,
                    p.responsible AS project_responsible, p.notes AS project_notes, p.user_id
             FROM floors f JOIN projects p ON p.id = f.project_id
             WHERE f.id = ? AND p.user_id = ?',
            [$floorId, $userId]
        );
    }

    public static function findForProjectUser(int $floorId, int $projectId, int $userId): ?array
    {
        return Database::first(
            'SELECT f.*, p.name AS project_name, p.site AS project_site, p.workplace AS project_workplace,
                    p.responsible AS project_responsible, p.notes AS project_notes, p.user_id
             FROM floors f JOIN projects p ON p.id = f.project_id
             WHERE f.id = ? AND f.project_id = ? AND p.user_id = ?',
            [$floorId, $projectId, $userId]
        );
    }

    public static function siblings(int $projectId): array
    {
        return Database::query('SELECT id, name, level, sort_order, version FROM floors WHERE project_id = ? ORDER BY sort_order, id', [$projectId]);
    }

    public static function preview(int $floorId, int $userId): ?array
    {
        $floor = self::findForUser($floorId, $userId);
        if ($floor === null) {
            return null;
        }
        $designJson = $floor['design_json'];
        $draft = null;
        if (is_string($floor['draft_json']) && $floor['draft_json'] !== ''
            && (int) $floor['draft_base_version'] === (int) $floor['version']) {
            $draft = [
                'design_json' => $floor['draft_json'],
                'updated_at' => $floor['draft_updated_at'],
            ];
            $designJson = $floor['draft_json'];
        }
        $floor['design'] = DesignValidator::normalizeJson((string) $designJson);
        $floor['draft'] = $draft;
        unset($floor['design_json'], $floor['draft_json']);
        return $floor;
    }

    public static function saveDesign(int $floorId, int $userId, array $design, int $expectedVersion, string $note = 'Guardado manual'): array
    {
        $normalized = DesignValidator::normalizeArray($design);
        $json = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        return Database::transaction(static function () use ($floorId, $userId, $json, $normalized, $expectedVersion, $note): array {
            $floor = Database::first(
                'SELECT f.id, f.version FROM floors f JOIN projects p ON p.id = f.project_id WHERE f.id = ? AND p.user_id = ?',
                [$floorId, $userId]
            );
            if ($floor === null) {
                throw new \DomainException('El piso no existe o no tienes acceso.');
            }
            if ((int) $floor['version'] !== $expectedVersion) {
                throw new VersionConflictException((int) $floor['version']);
            }
            $newVersion = $expectedVersion + 1;
            $updated = Database::execute(
                'UPDATE floors SET design_json = ?, version = ?, draft_json = NULL, draft_base_version = NULL,
                        draft_updated_at = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND version = ?',
                [$json, $newVersion, $floorId, $expectedVersion]
            );
            if ($updated !== 1) {
                $current = (int) Database::value('SELECT version FROM floors WHERE id = ?', [$floorId]);
                throw new VersionConflictException($current);
            }
            Database::execute(
                'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, ?, ?, ?, ?)',
                [$floorId, $newVersion, $json, text_limit($note, 120), $userId]
            );
            Database::execute(
                'UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT project_id FROM floors WHERE id = ?)',
                [$floorId]
            );
            return [
                'version' => $newVersion,
                'saved_at' => date('Y-m-d H:i:s'),
                'design' => $normalized,
            ];
        });
    }

    public static function autosave(int $floorId, int $userId, array $design, int $baseVersion): array
    {
        $normalized = DesignValidator::normalizeArray($design);
        $json = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $floor = Database::first(
            'SELECT f.id, f.version FROM floors f JOIN projects p ON p.id = f.project_id WHERE f.id = ? AND p.user_id = ?',
            [$floorId, $userId]
        );
        if ($floor === null) {
            throw new \DomainException('El piso no existe o no tienes acceso.');
        }
        if ((int) $floor['version'] !== $baseVersion) {
            throw new VersionConflictException((int) $floor['version']);
        }
        $updated = Database::execute(
            'UPDATE floors SET draft_json = ?, draft_base_version = ?, draft_updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND version = ?',
            [$json, $baseVersion, $floorId, $baseVersion]
        );
        if ($updated !== 1) {
            $current = (int) Database::value('SELECT version FROM floors WHERE id = ?', [$floorId]);
            throw new VersionConflictException($current);
        }
        return ['draft_saved_at' => gmdate('Y-m-d H:i:s'), 'base_version' => $baseVersion];
    }

    public static function discardDraft(int $floorId, int $userId): void
    {
        $updated = Database::execute(
            'UPDATE floors SET draft_json = NULL, draft_base_version = NULL, draft_updated_at = NULL
             WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)',
            [$floorId, $userId]
        );
        if ($updated !== 1) {
            throw new \DomainException('El piso no existe o no tienes acceso.');
        }
    }

    public static function versions(int $floorId, int $userId): array
    {
        if (self::findForUser($floorId, $userId) === null) {
            throw new \DomainException('El piso no existe o no tienes acceso.');
        }
        return Database::query(
            'SELECT v.id, v.version, v.note, v.created_at, v.design_json, u.name AS created_by_name
             FROM floor_versions v LEFT JOIN users u ON u.id = v.created_by
             WHERE v.floor_id = ? ORDER BY v.version DESC',
            [$floorId]
        );
    }

    public static function restoreVersion(int $floorId, int $versionId, int $userId): array
    {
        return Database::transaction(static function () use ($floorId, $versionId, $userId): array {
            $floor = Database::first(
                'SELECT f.id, f.version FROM floors f JOIN projects p ON p.id = f.project_id WHERE f.id = ? AND p.user_id = ?',
                [$floorId, $userId]
            );
            if ($floor === null) {
                throw new \DomainException('El piso no existe o no tienes acceso.');
            }
            $version = Database::first(
                'SELECT v.* FROM floor_versions v JOIN floors f ON f.id = v.floor_id JOIN projects p ON p.id = f.project_id
                 WHERE v.id = ? AND v.floor_id = ? AND p.user_id = ?',
                [$versionId, $floorId, $userId]
            );
            if ($version === null) {
                throw new \DomainException('La versión solicitada no existe.');
            }
            $design = DesignValidator::normalizeJson((string) $version['design_json']);
            $json = json_encode($design, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $newVersion = (int) $floor['version'] + 1;
            Database::execute(
                'UPDATE floors SET design_json = ?, version = ?, draft_json = NULL, draft_base_version = NULL,
                        draft_updated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?',
                [$json, $newVersion, $floorId, (int) $floor['version']]
            );
            Database::execute(
                'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, ?, ?, ?, ?)',
                [$floorId, $newVersion, $json, 'Restauración de ' . version_label((int) $version['version']), $userId]
            );
            return ['version' => $newVersion, 'design' => $design];
        });
    }

    public static function updateMeta(int $floorId, int $userId, string $name, string $level): void
    {
        $name = trim($name);
        $level = trim($level);
        $errors = [];
        if ($name === '' || preg_match_all('/./us', $name, $m) > 80 || preg_match('/[<>]/u', $name) === 1) {
            $errors['name'] = 'Escribe un nombre de piso válido de hasta 80 caracteres.';
        }
        if (preg_match_all('/./us', $level, $m) > 40 || preg_match('/[<>]/u', $level) === 1) {
            $errors['level'] = 'El nivel del piso no es válido.';
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
        $updated = Database::execute(
            'UPDATE floors SET name = ?, level = ? WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)',
            [$name, $level, $floorId, $userId]
        );
        if ($updated !== 1) {
            throw new \DomainException('El piso no existe o no tienes acceso.');
        }
    }

    public static function decodeDesign(array $floor): array
    {
        return DesignValidator::normalizeJson((string) $floor['design_json']);
    }
}
