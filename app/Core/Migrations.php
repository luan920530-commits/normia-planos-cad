<?php
declare(strict_types=1);

namespace App\Core;

use Throwable;

/**
 * Migraciones del esquema, versionadas y con bitácora.
 *
 * Cada paso sube `PRAGMA user_version` **dentro de la misma transacción** que
 * hace el cambio y, si todo va bien, se anota en `schema_migrations`. Si un paso
 * falla, la transacción se revierte, la versión no cambia y se lanza
 * `SchemaException`: la aplicación muestra un error accionable en lugar de
 * seguir trabajando sobre un esquema a medias.
 *
 * `user_version` sigue siendo la fuente rápida de verdad (una sola lectura por
 * petición); la tabla es la bitácora auditable de qué se aplicó y cuándo.
 *
 * Las instalaciones nuevas no ejecutan ningún paso: `resources/schema.sql` crea
 * el esquema completo con `user_version = 7` y la bitácora se rellena sola.
 */
final class Migrations
{
    /** Versión de esquema que espera este código. */
    public const VERSION = 7;

    /**
     * Pasos en orden. `ownTransaction` se usa cuando el paso necesita manejar
     * `PRAGMA foreign_keys`, que SQLite ignora dentro de una transacción.
     *
     * @return array<int,array{name:string,run:callable,ownTransaction?:bool}>
     */
    private static function steps(): array
    {
        return [
            2 => [
                'name' => 'Enlace público del modo brigadista',
                'run' => static function (): void {
                    Database::pdo()->exec(
                        'CREATE TABLE IF NOT EXISTS brigade_links (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            floor_id INTEGER NOT NULL UNIQUE REFERENCES floors(id) ON DELETE CASCADE,
                            token TEXT NOT NULL UNIQUE,
                            enabled INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE INDEX IF NOT EXISTS idx_brigade_token ON brigade_links(token);'
                    );
                },
            ],
            3 => [
                'name' => 'Verificación física en campo',
                'run' => static function (): void {
                    Database::pdo()->exec(
                        'CREATE TABLE IF NOT EXISTS verification_rounds (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
                            status TEXT NOT NULL DEFAULT "open",
                            note TEXT NOT NULL DEFAULT "",
                            started_by INTEGER REFERENCES users(id),
                            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            closed_by INTEGER REFERENCES users(id),
                            closed_at TEXT
                        );
                        CREATE TABLE IF NOT EXISTS element_checks (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
                            round_id INTEGER REFERENCES verification_rounds(id) ON DELETE SET NULL,
                            element_id TEXT NOT NULL,
                            element_type TEXT NOT NULL DEFAULT "",
                            sector TEXT NOT NULL DEFAULT "",
                            status TEXT NOT NULL DEFAULT "ok",
                            note TEXT NOT NULL DEFAULT "",
                            photo BLOB,
                            photo_type TEXT NOT NULL DEFAULT "",
                            photo_name TEXT NOT NULL DEFAULT "",
                            checked_by INTEGER REFERENCES users(id),
                            checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE INDEX IF NOT EXISTS idx_checks_floor ON element_checks(floor_id, element_id);
                        CREATE INDEX IF NOT EXISTS idx_checks_round ON element_checks(round_id);
                        CREATE INDEX IF NOT EXISTS idx_rounds_floor ON verification_rounds(floor_id, id);'
                    );
                },
            ],
            4 => [
                'name' => 'Días entre verificaciones por piso',
                'run' => static function (): void {
                    if (!in_array('check_days', self::columns('floors'), true)) {
                        Database::execute('ALTER TABLE floors ADD COLUMN check_days INTEGER NOT NULL DEFAULT 30');
                    }
                },
            ],
            5 => [
                'name' => 'Complementos instalados',
                'run' => static function (): void {
                    Database::pdo()->exec(
                        'CREATE TABLE IF NOT EXISTS plugins (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL DEFAULT "",
                            version TEXT NOT NULL DEFAULT "",
                            author TEXT NOT NULL DEFAULT "",
                            enabled INTEGER NOT NULL DEFAULT 1,
                            installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )'
                    );
                },
            ],
            6 => [
                'name' => 'Empresas, membresías y proyectos por empresa',
                'run' => static function (): void {
                    self::toOrganizations();
                },
                'ownTransaction' => true,
            ],
            7 => [
                'name' => 'Versiones fijadas',
                'run' => static function (): void {
                    // Una base sin `floor_versions` ya venía incompleta: se deja
                    // como está y se anota, en vez de impedir el arranque.
                    if (!self::hasTable('floor_versions')) {
                        self::log('La migración 7 no encontró floor_versions; se omite la columna pinned.');
                        return;
                    }
                    if (!in_array('pinned', self::columns('floor_versions'), true)) {
                        Database::execute('ALTER TABLE floor_versions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
                    }
                    Database::pdo()->exec('CREATE INDEX IF NOT EXISTS idx_versions_pinned ON floor_versions(floor_id, pinned)');
                },
            ],
        ];
    }

    /**
     * Deja la bitácora lista en una instalación recién creada (el esquema ya
     * viene al día desde `resources/schema.sql`, pero conviene que quede el
     * rastro de qué versión se creó y cuándo).
     */
    public static function bootstrap(): void
    {
        self::ensureLedger((int) Database::value('PRAGMA user_version'));
    }

    /** ¿La base necesita trabajo? Una sola lectura barata por petición. */
    public static function pending(): bool
    {
        return (int) Database::value('PRAGMA user_version') < self::VERSION;
    }

    /**
     * Aplica los pasos que falten. Idempotente: si la base ya está al día solo
     * comprueba la bitácora.
     */
    public static function run(): void
    {
        $current = (int) Database::value('PRAGMA user_version');
        self::ensureLedger($current);
        if ($current >= self::VERSION) {
            return;
        }

        foreach (self::steps() as $version => $step) {
            if ($version <= $current) {
                continue;
            }
            $started = microtime(true);
            $own = ($step['ownTransaction'] ?? false) === true;
            $pdo = Database::pdo();
            try {
                if (!$own) {
                    $pdo->beginTransaction();
                }
                ($step['run'])();
                $pdo->exec('PRAGMA user_version = ' . $version);
                if (!$own && $pdo->inTransaction()) {
                    $pdo->commit();
                }
                self::record($version, (string) $step['name'], round((microtime(true) - $started) * 1000, 1));
            } catch (Throwable $exception) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                $message = 'No se pudo aplicar la migración ' . $version . ' («' . $step['name'] . '»): '
                    . $exception->getMessage();
                self::log($message);
                throw $exception instanceof SchemaException
                    ? $exception
                    : new SchemaException($message, 0, $exception);
            }
        }
    }

    /**
     * Bitácora de migraciones aplicadas, de la más reciente a la más antigua.
     *
     * @return list<array<string,mixed>>
     */
    public static function ledger(): array
    {
        try {
            return Database::query('SELECT version, name, checksum, duration_ms, applied_at FROM schema_migrations ORDER BY version DESC');
        } catch (Throwable) {
            return [];
        }
    }

    /** Crea la tabla de bitácora y la rellena si la base ya venía migrada. */
    private static function ensureLedger(int $current): void
    {
        Database::pdo()->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT "",
                checksum TEXT NOT NULL DEFAULT "",
                duration_ms REAL NOT NULL DEFAULT 0,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )'
        );
        $rows = (int) Database::value('SELECT COUNT(*) FROM schema_migrations');
        if ($rows > 0) {
            return;
        }
        // Base que ya estaba al día (instalación nueva o migrada antes de que
        // existiera la bitácora): se anotan los pasos ya cubiertos por su
        // `user_version`, sin volver a ejecutarlos.
        foreach (self::steps() as $version => $step) {
            if ($version <= $current) {
                Database::execute(
                    'INSERT OR IGNORE INTO schema_migrations (version, name, checksum, duration_ms, applied_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
                    [$version, (string) $step['name'], self::checksum($version, (string) $step['name'])]
                );
            }
        }
    }

    private static function record(int $version, string $name, float $milliseconds): void
    {
        Database::execute(
            'INSERT OR REPLACE INTO schema_migrations (version, name, checksum, duration_ms, applied_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [$version, $name, self::checksum($version, $name), $milliseconds]
        );
    }

    /** Huella estable del paso definido en este código (para auditar la bitácora). */
    private static function checksum(int $version, string $name): string
    {
        return substr(hash('sha256', $version . '|' . $name . '|' . self::VERSION), 0, 16);
    }

    private static function hasTable(string $table): bool
    {
        $count = Database::value(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
            [$table]
        );
        return (int) $count > 0;
    }

    /** @return list<string> */
    private static function columns(string $table): array
    {
        return array_map(
            static fn (array $row): string => (string) $row['name'],
            Database::query('PRAGMA table_info(' . $table . ')')
        );
    }

    private static function log(string $message): void
    {
        $line = gmdate('c') . ' ' . $message . PHP_EOL;
        error_log('Normia: ' . $message);
        $directory = Paths::logs();
        if (!is_dir($directory)) {
            @mkdir($directory, 0770, true);
        }
        @file_put_contents($directory . '/migraciones.log', $line, FILE_APPEND | LOCK_EX);
        @file_put_contents(Paths::storage() . '/last-error.log', 'ESQUEMA: ' . $message . PHP_EOL);
    }

    /**
     * Migración a empresas (paso 6).
     *
     * Reconstruye `projects` para que apunte a `organizations` en lugar de a
     * `users`. SQLite no admite añadir una columna `NOT NULL` con clave foránea,
     * así que se copia a una tabla nueva y se renombra, con `foreign_keys`
     * desactivadas para que `DROP TABLE` no arrastre los pisos en cascada.
     *
     * Todo ocurre en una transacción: si algo falla se revierte y se lanza
     * `SchemaException`. Después del commit se verifica con `foreign_key_check`.
     */
    private static function toOrganizations(): void
    {
        $pdo = Database::pdo();
        if (in_array('organization_id', self::columns('projects'), true)) {
            return;
        }

        $foreignKeysOn = (int) Database::value('PRAGMA foreign_keys') === 1;
        $pdo->exec('PRAGMA foreign_keys = OFF');
        try {
            $pdo->beginTransaction();
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS organizations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    tax_id TEXT NOT NULL DEFAULT "",
                    city TEXT NOT NULL DEFAULT "",
                    created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS memberships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role TEXT NOT NULL DEFAULT "editor",
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (organization_id, user_id)
                );
                CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, organization_id);
                CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id, role);'
            );

            foreach (Database::query('SELECT id, name FROM users ORDER BY id') as $user) {
                $existing = (int) Database::value(
                    'SELECT organization_id FROM memberships WHERE user_id = ? ORDER BY id LIMIT 1',
                    [(int) $user['id']]
                );
                if ($existing > 0) {
                    continue;
                }
                $pdo->prepare('INSERT INTO organizations (name, created_by) VALUES (?, ?)')
                    ->execute([text_limit('Espacio de ' . (string) $user['name'], 120), (int) $user['id']]);
                $organizationId = (int) $pdo->lastInsertId();
                $pdo->prepare('INSERT INTO memberships (organization_id, user_id, role) VALUES (?, ?, "owner")')
                    ->execute([$organizationId, (int) $user['id']]);
            }

            $pdo->exec(
                'CREATE TABLE projects_migracion (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                    name TEXT NOT NULL,
                    site TEXT NOT NULL DEFAULT "",
                    workplace TEXT NOT NULL DEFAULT "",
                    responsible TEXT NOT NULL DEFAULT "",
                    notes TEXT NOT NULL DEFAULT "",
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )'
            );
            $pdo->exec(
                'INSERT INTO projects_migracion (id, organization_id, created_by, name, site, workplace, responsible, notes, created_at, updated_at)
                 SELECT p.id,
                        (SELECT m.organization_id FROM memberships m WHERE m.user_id = p.user_id ORDER BY m.id LIMIT 1),
                        p.user_id, p.name, p.site, p.workplace, p.responsible, p.notes, p.created_at, p.updated_at
                 FROM projects p'
            );
            $orphans = (int) Database::value('SELECT COUNT(*) FROM projects_migracion WHERE organization_id IS NULL');
            if ($orphans > 0) {
                throw new SchemaException(
                    'Hay ' . $orphans . ' proyecto(s) sin empresa de destino: la migración se revirtió sin cambios.'
                );
            }
            $pdo->exec('DROP TABLE projects');
            $pdo->exec('ALTER TABLE projects_migracion RENAME TO projects');
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id, updated_at DESC)');
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_projects_creator ON projects(created_by)');
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception instanceof SchemaException
                ? $exception
                : new SchemaException('No se pudo migrar a empresas: ' . $exception->getMessage(), 0, $exception);
        } finally {
            $pdo->exec('PRAGMA foreign_keys = ' . ($foreignKeysOn ? 'ON' : 'OFF'));
        }

        $violations = Database::query('PRAGMA foreign_key_check');
        if ($violations !== []) {
            throw new SchemaException('La migración a empresas dejó ' . count($violations) . ' referencia(s) sin destino.');
        }
    }
}
