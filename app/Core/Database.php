<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOException;
use RuntimeException;
use Throwable;

final class Database
{
    private static ?PDO $connection = null;
    private static ?string $path = null;

    public static function connect(?string $path = null): PDO
    {
        $path = $path ?? Config::databasePath();
        if ($path === null || $path === '') {
            throw new RuntimeException('No hay una base de datos configurada.');
        }
        if (self::$connection instanceof PDO && self::$path === $path) {
            return self::$connection;
        }
        $directory = dirname($path);
        if (!is_dir($directory) && !@mkdir($directory, 0770, true) && !is_dir($directory)) {
            throw new RuntimeException('No se pudo crear la carpeta de datos.');
        }
        try {
            $pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA busy_timeout = 5000');
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA synchronous = NORMAL');
        } catch (PDOException $exception) {
            throw new RuntimeException('No se pudo abrir la base de datos SQLite.', 0, $exception);
        }
        self::$connection = $pdo;
        self::$path = $path;
        return $pdo;
    }

    /**
     * Migración mínima y repetible, paso a paso.
     *
     * Cada paso sube `PRAGMA user_version`. Las instalaciones nuevas ya traen
     * todo en `resources/schema.sql`; las anteriores reciben aquí las tablas y
     * columnas que falten sin perder datos.
     */
    public static function migrate(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        try {
            $version = (int) self::value('PRAGMA user_version');
            if ($version < 2) {
                self::pdo()->exec(
                    'CREATE TABLE IF NOT EXISTS brigade_links (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        floor_id INTEGER NOT NULL UNIQUE REFERENCES floors(id) ON DELETE CASCADE,
                        token TEXT NOT NULL UNIQUE,
                        enabled INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_brigade_token ON brigade_links(token);
                    PRAGMA user_version = 2;'
                );
                $version = 2;
            }
            if ($version < 3) {
                self::pdo()->exec(
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
                    CREATE INDEX IF NOT EXISTS idx_rounds_floor ON verification_rounds(floor_id, id);
                    PRAGMA user_version = 3;'
                );
                $version = 3;
            }
            if ($version < 4) {
                $columns = array_map(
                    static fn (array $row): string => (string) $row['name'],
                    self::query('PRAGMA table_info(floors)')
                );
                if (!in_array('check_days', $columns, true)) {
                    self::execute('ALTER TABLE floors ADD COLUMN check_days INTEGER NOT NULL DEFAULT 30');
                }
                self::pdo()->exec('PRAGMA user_version = 4');
            }
            if ($version < 5) {
                // Complementos (plugins) instalados: el manifiesto vive en
                // storage/plugins/<id>/plugin.json y aquí solo va el estado.
                self::pdo()->exec(
                    'CREATE TABLE IF NOT EXISTS plugins (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT "",
                        version TEXT NOT NULL DEFAULT "",
                        author TEXT NOT NULL DEFAULT "",
                        enabled INTEGER NOT NULL DEFAULT 1,
                        installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );
                    PRAGMA user_version = 5;'
                );
                $version = 5;
            }
            if ($version < 6) {
                // Fase 2 · empresas. `projects` pasa de "un dueño" a "una
                // organización", y la pertenencia se resuelve con membresías.
                // SQLite no permite añadir una columna NOT NULL con referencia
                // a otra tabla, así que se reconstruye `projects`: es DDL
                // transaccional y la copia se hace con las claves foráneas
                // desactivadas, verificando el resultado con foreign_key_check.
                self::migrateToOrganizations();
                $version = 6;
            }
        } catch (SchemaException $exception) {
            error_log('Normia: migración de esquema detenida: ' . $exception->getMessage());
            throw $exception;
        } catch (Throwable $exception) {
            error_log('Normia: no se pudo migrar el esquema: ' . $exception->getMessage());
        }
    }

    /**
     * Migración a empresas (Fase 2).
     *
     * Reconstruye `projects` para que apunte a `organizations` en lugar de a
     * `users`. SQLite no admite añadir una columna `NOT NULL` con clave foránea,
     * así que se copia a una tabla nueva y se renombra, con `foreign_keys`
     * desactivadas para que `DROP TABLE` no arrastre los pisos en cascada.
     *
     * Todo ocurre en una transacción: si algo falla se revierte y se lanza
     * `SchemaException` (no se continúa con un esquema a medias). Después del
     * commit se verifica con `PRAGMA foreign_key_check`.
     */
    private static function migrateToOrganizations(): void
    {
        $pdo = self::pdo();
        $columns = array_map(
            static fn (array $row): string => (string) $row['name'],
            self::query('PRAGMA table_info(projects)')
        );
        if (in_array('organization_id', $columns, true)) {
            // Una ejecución anterior alcanzó a reconstruir la tabla pero no a
            // subir la versión: se completa el marcador y se sigue.
            $pdo->exec('PRAGMA user_version = 6');
            return;
        }

        $foreignKeysOn = (int) self::value('PRAGMA foreign_keys') === 1;
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

            foreach (self::query('SELECT id, name FROM users ORDER BY id') as $user) {
                $existing = (int) self::value('SELECT organization_id FROM memberships WHERE user_id = ? ORDER BY id LIMIT 1', [(int) $user['id']]);
                if ($existing > 0) {
                    continue;
                }
                $pdo->prepare('INSERT INTO organizations (name, created_by) VALUES (?, ?)')
                    ->execute([text_limit('Espacio de ' . (string) $user['name'], 120), (int) $user['id']]);
                $orgId = (int) $pdo->lastInsertId();
                $pdo->prepare('INSERT INTO memberships (organization_id, user_id, role) VALUES (?, ?, "owner")')
                    ->execute([$orgId, (int) $user['id']]);
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
            $huerfanos = (int) self::value('SELECT COUNT(*) FROM projects_migracion WHERE organization_id IS NULL');
            if ($huerfanos > 0) {
                throw new SchemaException(
                    'Hay ' . $huerfanos . ' proyecto(s) sin empresa de destino: la migración se revirtió sin cambios.'
                );
            }
            $pdo->exec('DROP TABLE projects');
            $pdo->exec('ALTER TABLE projects_migracion RENAME TO projects');
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id, updated_at DESC)');
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_projects_creator ON projects(created_by)');
            $pdo->exec('PRAGMA user_version = 6');
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

        $violations = self::query('PRAGMA foreign_key_check');
        if ($violations !== []) {
            throw new SchemaException('La migración a empresas dejó ' . count($violations) . ' referencia(s) sin destino.');
        }
    }

    public static function pdo(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }
        return self::connect();
    }

    /** @param array<int|string,mixed> $params */
    public static function query(string $sql, array $params = []): array
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        $rows = $statement->fetchAll();
        return is_array($rows) ? $rows : [];
    }

    /** @param array<int|string,mixed> $params */
    public static function first(string $sql, array $params = []): ?array
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();
        return is_array($row) ? $row : null;
    }

    /** @param array<int|string,mixed> $params */
    public static function value(string $sql, array $params = []): mixed
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        return $statement->fetchColumn();
    }

    /** @param array<int|string,mixed> $params */
    public static function execute(string $sql, array $params = []): int
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        return $statement->rowCount();
    }

    public static function lastId(): int
    {
        return (int) self::pdo()->lastInsertId();
    }

    public static function transaction(callable $callback): mixed
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) {
            return $callback();
        }
        $pdo->beginTransaction();
        try {
            $result = $callback();
            $pdo->commit();
            return $result;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function reset(): void
    {
        self::$connection = null;
        self::$path = null;
    }
}
