<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\ValidationException;
use App\Services\DesignFactory;
use App\Services\DesignValidator;

final class Project
{
    /** Planos de todas las empresas a las que pertenece la persona. */
    public static function allForUser(int $userId): array
    {
        return Database::query(
            'SELECT p.*, o.name AS organization_name, m.role,
                    (SELECT COUNT(*) FROM floors f WHERE f.project_id = p.id) AS floor_count,
                    (SELECT f.id FROM floors f WHERE f.project_id = p.id ORDER BY f.sort_order, f.id LIMIT 1) AS first_floor_id,
                    (SELECT f.name FROM floors f WHERE f.project_id = p.id ORDER BY f.sort_order, f.id LIMIT 1) AS first_floor_name,
                    (SELECT MAX(f.updated_at) FROM floors f WHERE f.project_id = p.id) AS floor_updated_at,
                    (SELECT COUNT(*) FROM floor_versions v JOIN floors f2 ON f2.id = v.floor_id WHERE f2.project_id = p.id) AS version_count
             FROM projects p
             JOIN organizations o ON o.id = p.organization_id
             JOIN memberships m ON m.organization_id = p.organization_id AND m.user_id = ?
             ORDER BY COALESCE(floor_updated_at, p.updated_at) DESC, p.id DESC',
            [$userId]
        );
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        return Database::first(
            'SELECT p.*, o.name AS organization_name, m.role,
                    (SELECT COUNT(*) FROM floors f WHERE f.project_id = p.id) AS floor_count
             FROM projects p
             JOIN organizations o ON o.id = p.organization_id
             JOIN memberships m ON m.organization_id = p.organization_id AND m.user_id = ?
             WHERE p.id = ?',
            [$userId, $id]
        );
    }

    /**
     * Comprueba que el rol de la persona en esa empresa alcance para la acción.
     *
     * @param array<string,mixed> $row fila con la columna `role`
     */
    public static function requireCapability(array $row, string $capability, string $message): void
    {
        if (!Membership::can($row['role'] ?? null, $capability)) {
            throw new \DomainException($message);
        }
    }

    public static function stats(int $userId): array
    {
        return [
            'projects' => (int) Database::value(
                'SELECT COUNT(*) FROM projects p JOIN memberships m ON m.organization_id = p.organization_id WHERE m.user_id = ?',
                [$userId]
            ),
            'floors' => (int) Database::value(
                'SELECT COUNT(*) FROM floors f JOIN projects p ON p.id = f.project_id
                 JOIN memberships m ON m.organization_id = p.organization_id WHERE m.user_id = ?',
                [$userId]
            ),
            'versions' => (int) Database::value(
                'SELECT COUNT(*) FROM floor_versions v JOIN floors f ON f.id = v.floor_id
                 JOIN projects p ON p.id = f.project_id
                 JOIN memberships m ON m.organization_id = p.organization_id WHERE m.user_id = ?',
                [$userId]
            ),
            'organizations' => (int) Database::value('SELECT COUNT(*) FROM memberships WHERE user_id = ?', [$userId]),
        ];
    }

    public static function create(int $userId, array $data): int
    {
        $clean = self::validate($data);
        $organizationId = self::resolveOrganization($userId, $data['organization_id'] ?? null);
        $preset = (string) ($data['preset'] ?? 'libre');
        $presets = canvas_presets();
        $canvas = $presets[$preset] ?? $presets['libre'];
        $floorName = trim((string) ($data['floor_name'] ?? 'Piso 1'));
        $level = trim((string) ($data['floor_level'] ?? '1'));
        if (preg_match('/[<>]/u', $floorName . $level) === 1) {
            throw new ValidationException(['floor_name' => 'El nombre y el nivel del piso no admiten etiquetas HTML.']);
        }
        $design = DesignFactory::blank($canvas);
        $design = DesignValidator::normalizeArray($design);
        $designJson = json_encode($design, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

        return Database::transaction(static function () use ($userId, $organizationId, $clean, $floorName, $level, $designJson): int {
            Database::execute(
                'INSERT INTO projects (organization_id, created_by, name, site, workplace, responsible, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$organizationId, $userId, $clean['name'], $clean['site'], $clean['workplace'], $clean['responsible'], $clean['notes']]
            );
            $projectId = Database::lastId();
            Database::execute(
                'INSERT INTO floors (project_id, name, level, sort_order, design_json, version) VALUES (?, ?, ?, 1, ?, 1)',
                [$projectId, $floorName !== '' ? text_limit($floorName, 80) : 'Piso 1', text_limit($level, 40), $designJson]
            );
            $floorId = Database::lastId();
            Database::execute(
                'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, 1, ?, ?, ?)',
                [$floorId, $designJson, 'Versión inicial', $userId]
            );
            return $projectId;
        });
    }

    public static function update(int $id, int $userId, array $data): void
    {
        $clean = self::validate($data);
        $project = self::findForUser($id, $userId);
        if ($project === null) {
            throw new \DomainException('El proyecto no existe o no tienes acceso.');
        }
        self::requireCapability($project, 'write', 'Tu rol en esta empresa permite consultar, pero no editar el proyecto.');
        Database::execute(
            'UPDATE projects SET name = ?, site = ?, workplace = ?, responsible = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?',
            [$clean['name'], $clean['site'], $clean['workplace'], $clean['responsible'], $clean['notes'], $id]
        );
    }

    public static function duplicate(int $id, int $userId): int
    {
        $project = self::findForUser($id, $userId);
        if ($project === null) {
            throw new \DomainException('El proyecto no existe o no tienes acceso.');
        }
        self::requireCapability($project, 'write', 'Tu rol en esta empresa permite consultar, pero no duplicar el proyecto.');
        return Database::transaction(static function () use ($id, $userId, $project): int {
            Database::execute(
                'INSERT INTO projects (organization_id, created_by, name, site, workplace, responsible, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    (int) $project['organization_id'], $userId,
                    text_limit($project['name'] . ' · copia', 120),
                    $project['site'], $project['workplace'], $project['responsible'], $project['notes'],
                ]
            );
            $newId = Database::lastId();
            $floors = Database::query('SELECT * FROM floors WHERE project_id = ? ORDER BY sort_order, id', [$id]);
            foreach ($floors as $floor) {
                Database::execute(
                    'INSERT INTO floors (project_id, name, level, sort_order, design_json, version) VALUES (?, ?, ?, ?, ?, 1)',
                    [$newId, $floor['name'], $floor['level'], $floor['sort_order'], $floor['design_json']]
                );
                $newFloorId = Database::lastId();
                Database::execute(
                    'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, 1, ?, ?, ?)',
                    [$newFloorId, $floor['design_json'], 'Copia de ' . version_label((int) $floor['version']), $userId]
                );
            }
            return $newId;
        });
    }

    public static function delete(int $id, int $userId): void
    {
        $project = self::findForUser($id, $userId);
        if ($project === null) {
            throw new \DomainException('El proyecto no existe o no tienes acceso.');
        }
        self::requireCapability($project, 'manage', 'Solo un administrador o el propietario de la empresa puede eliminar un proyecto.');
        Database::execute('DELETE FROM projects WHERE id = ?', [$id]);
    }

    public static function floors(int $projectId, int $userId): array
    {
        if (self::findForUser($projectId, $userId) === null) {
            throw new \DomainException('El proyecto no existe o no tienes acceso.');
        }
        return Database::query(
            'SELECT f.*, u.name AS updated_by_name,
                    (SELECT COUNT(*) FROM floor_versions v WHERE v.floor_id = f.id) AS version_count
             FROM floors f LEFT JOIN users u ON u.id = (SELECT created_by FROM floor_versions v2 WHERE v2.floor_id = f.id ORDER BY v2.version DESC LIMIT 1)
             WHERE f.project_id = ? ORDER BY f.sort_order, f.id',
            [$projectId]
        );
    }

    public static function createFloor(int $projectId, int $userId, array $data): int
    {
        self::requireWrite($projectId, $userId, 'Tu rol en esta empresa permite consultar, pero no añadir pisos.');
        $count = (int) Database::value('SELECT COUNT(*) FROM floors WHERE project_id = ?', [$projectId]);
        if ($count >= 30) {
            throw new \DomainException('Cada proyecto admite hasta 30 pisos.');
        }
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || preg_match_all('/./us', $name, $m) > 80 || preg_match('/[<>]/u', $name) === 1) {
            throw new ValidationException(['name' => 'Escribe un nombre de piso de hasta 80 caracteres, sin etiquetas HTML.']);
        }
        $level = trim((string) ($data['level'] ?? ''));
        if (preg_match('/[<>]/u', $level) === 1) {
            throw new ValidationException(['level' => 'El nivel del piso no admite etiquetas HTML.']);
        }
        $presetKey = (string) ($data['preset'] ?? 'libre');
        $presets = canvas_presets();
        $canvas = $presets[$presetKey] ?? $presets['libre'];
        $design = DesignValidator::normalizeArray(DesignFactory::blank($canvas));
        $designJson = json_encode($design, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $order = (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM floors WHERE project_id = ?', [$projectId]);
        return Database::transaction(static function () use ($projectId, $name, $level, $designJson, $userId, $order): int {
            Database::execute(
                'INSERT INTO floors (project_id, name, level, sort_order, design_json, version) VALUES (?, ?, ?, ?, ?, 1)',
                [$projectId, text_limit($name, 80), text_limit($level, 40), $order, $designJson]
            );
            $floorId = Database::lastId();
            Database::execute(
                'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, 1, ?, ?, ?)',
                [$floorId, $designJson, 'Versión inicial', $userId]
            );
            Database::execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$projectId]);
            return $floorId;
        });
    }

    public static function createFloorFromDesign(int $projectId, int $userId, array $design, string $name, string $level = ''): int
    {
        self::requireWrite($projectId, $userId, 'Tu rol en esta empresa permite consultar, pero no importar pisos.');
        $count = (int) Database::value('SELECT COUNT(*) FROM floors WHERE project_id = ?', [$projectId]);
        if ($count >= 30) {
            throw new \DomainException('Cada proyecto admite hasta 30 pisos.');
        }
        $normalized = DesignValidator::normalizeArray($design);
        $designJson = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $name = trim($name) !== '' ? text_limit(trim($name), 80) : 'Plano importado';
        $level = text_limit(trim($level), 40);
        $order = (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM floors WHERE project_id = ?', [$projectId]);
        return Database::transaction(static function () use ($projectId, $name, $level, $designJson, $userId, $order): int {
            Database::execute(
                'INSERT INTO floors (project_id, name, level, sort_order, design_json, version) VALUES (?, ?, ?, ?, ?, 1)',
                [$projectId, $name, $level, $order, $designJson]
            );
            $floorId = Database::lastId();
            Database::execute(
                'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, 1, ?, ?, ?)',
                [$floorId, $designJson, 'Importación de diseño', $userId]
            );
            Database::execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$projectId]);
            return $floorId;
        });
    }

    public static function duplicateFloor(int $projectId, int $floorId, int $userId): int
    {
        self::requireWrite($projectId, $userId, 'Tu rol en esta empresa permite consultar, pero no duplicar pisos.');
        $floor = Database::first('SELECT * FROM floors WHERE id = ? AND project_id = ?', [$floorId, $projectId]);
        if ($floor === null) {
            throw new \DomainException('El piso no existe.');
        }
        $count = (int) Database::value('SELECT COUNT(*) FROM floors WHERE project_id = ?', [$projectId]);
        if ($count >= 30) {
            throw new \DomainException('Cada proyecto admite hasta 30 pisos.');
        }
        $order = (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM floors WHERE project_id = ?', [$projectId]);
        return Database::transaction(static function () use ($projectId, $floor, $userId, $order): int {
            Database::execute(
                'INSERT INTO floors (project_id, name, level, sort_order, design_json, version) VALUES (?, ?, ?, ?, ?, 1)',
                [$projectId, text_limit($floor['name'] . ' · copia', 80), $floor['level'], $order, $floor['design_json']]
            );
            $newId = Database::lastId();
            Database::execute(
                'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, 1, ?, ?, ?)',
                [$newId, $floor['design_json'], 'Copia de ' . version_label((int) $floor['version']), $userId]
            );
            return $newId;
        });
    }

    public static function deleteFloor(int $projectId, int $floorId, int $userId): void
    {
        self::requireWrite($projectId, $userId, 'Tu rol en esta empresa permite consultar, pero no eliminar pisos.');
        $count = (int) Database::value('SELECT COUNT(*) FROM floors WHERE project_id = ?', [$projectId]);
        if ($count <= 1) {
            throw new \DomainException('Un proyecto debe conservar al menos un piso.');
        }
        $deleted = Database::execute('DELETE FROM floors WHERE id = ? AND project_id = ?', [$floorId, $projectId]);
        if ($deleted !== 1) {
            throw new \DomainException('El piso no existe.');
        }
    }

    /** Exige permiso de edición en el proyecto (o lanza un error con mensaje). */
    private static function requireWrite(int $projectId, int $userId, string $message): void
    {
        $project = self::findForUser($projectId, $userId);
        if ($project === null) {
            throw new \DomainException('El proyecto no existe o no tienes acceso.');
        }
        self::requireCapability($project, 'write', $message);
    }

    /**
     * Empresa donde se crea el proyecto.
     *
     * Si el formulario envía una empresa, se comprueba que la persona pueda
     * escribir en ella; si no, se usa la primera donde tenga permiso.
     */
    private static function resolveOrganization(int $userId, mixed $requested): int
    {
        if ($requested !== null && $requested !== '' && (int) $requested > 0) {
            $organizationId = (int) $requested;
            $role = Membership::roleFor($organizationId, $userId);
            if ($role === null) {
                throw new \DomainException('No perteneces a esa empresa.');
            }
            if (!Membership::can($role, 'write')) {
                throw new \DomainException('Tu rol en esa empresa permite consultar, pero no crear proyectos.');
            }
            return $organizationId;
        }
        $default = Organization::defaultForUser($userId);
        if ($default === null) {
            throw new \DomainException('Necesitas pertenecer a una empresa para crear proyectos. Pide acceso a un administrador.');
        }
        return (int) $default['id'];
    }

    private static function validate(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        $site = trim((string) ($data['site'] ?? ''));
        $workplace = trim((string) ($data['workplace'] ?? ''));
        $responsible = trim((string) ($data['responsible'] ?? ''));
        $notes = trim((string) ($data['notes'] ?? ''));
        $errors = [];
        if ($name === '' || preg_match_all('/./us', $name, $m) > 120 || preg_match('/[<>]/u', $name) === 1) {
            $errors['name'] = 'El nombre del proyecto es obligatorio (máximo 120 caracteres, sin etiquetas HTML).';
        }
        foreach (['site' => 120, 'workplace' => 120, 'responsible' => 120, 'notes' => 1000] as $key => $max) {
            $value = $$key;
            if (preg_match_all('/./us', $value, $m) > $max) {
                $errors[$key] = 'El campo supera el máximo de ' . $max . ' caracteres.';
            }
            if (preg_match('/[<>]/u', $value)) {
                $errors[$key] = 'El campo no admite etiquetas HTML.';
            }
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }
        return ['name' => $name, 'site' => $site, 'workplace' => $workplace, 'responsible' => $responsible, 'notes' => $notes];
    }
}
