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
     * Migración mínima y repetible: instalaciones anteriores a la 1.14.0 no
     * tienen la tabla del modo brigadista. Se crea al arrancar y se marca la
     * versión del esquema para no repetir el trabajo en cada petición.
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
            if ($version >= 2) {
                return;
            }
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
        } catch (Throwable $exception) {
            error_log('Normia: no se pudo migrar el esquema: ' . $exception->getMessage());
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
