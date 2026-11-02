<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Database;
use App\Core\Paths;
use PDO;
use RuntimeException;
use Throwable;

/**
 * Respaldos consistentes de la instalación.
 *
 * Todo lo que importa vive en un SQLite con WAL: proyectos, pisos, empresas,
 * membresías, versiones y fotografías. Copiar el archivo «a mano» mientras la
 * aplicación escribe deja fuera las últimas transacciones (o el contenido del
 * `-wal`), así que aquí se usa `VACUUM INTO`, que produce una copia completa y
 * consistente sin detener el servicio, con alternativa por punto de control
 * seguido de copia de archivo.
 *
 * Cada respaldo se guarda en `storage/backups/` como ZIP sin compresión
 * (ver `ZipWriter`) con la base, la configuración, los complementos instalados
 * —que viven fuera de la base— y un manifiesto con el resultado de la
 * verificación. Al lado queda un `.json` con el mismo manifiesto para poder
 * listar, fijar y rotar sin abrir el ZIP.
 */
final class Backup
{
    /** Copias que se conservan antes de rotar la más antigua. */
    public const KEEP = 10;

    /** Aviso en el panel cuando la última copia supera estos días. */
    public const MAX_AGE_DAYS = 30;

    private const NAME_PATTERN = '/^normia-\d{8}-\d{6}$/';

    private const TABLES = [
        'users',
        'organizations',
        'memberships',
        'projects',
        'floors',
        'floor_versions',
        'brigade_links',
        'verification_rounds',
        'element_checks',
        'plugins',
    ];

    public static function directory(): string
    {
        return Paths::storage() . '/backups';
    }

    public static function ensureDirectory(): string
    {
        $directory = self::directory();
        if (!is_dir($directory) && !@mkdir($directory, 0770, true) && !is_dir($directory)) {
            throw new RuntimeException('No se pudo crear la carpeta de respaldos.');
        }
        return $directory;
    }

    /**
     * Crea un respaldo completo y aplica la retención.
     *
     * @return array<string,mixed> manifiesto guardado
     */
    public static function create(string $kind = 'manual'): array
    {
        $directory = self::ensureDirectory();
        $name = self::uniqueName();
        $staging = $directory . '/.' . $name . '.sqlite';

        try {
            $method = self::snapshot($staging);
            $report = self::verify($staging);
            if (!$report['ok']) {
                throw new RuntimeException(
                    'La copia no pasó la verificación: ' . implode(' ', $report['errors'])
                );
            }

            $zip = new ZipWriter();
            $zip->addFile($staging, 'storage/' . basename(self::databaseFile()));
            $configFile = Paths::configFile();
            if (is_file($configFile)) {
                $zip->addFile($configFile, 'config/config.php');
            }
            $plugins = 0;
            foreach (self::pluginFiles() as $relative => $absolute) {
                $zip->addFile($absolute, 'storage/plugins/' . $relative);
                $plugins++;
            }
            if ($plugins === 0) {
                $zip->addFromString('storage/plugins/.gitkeep', '');
            }

            $manifest = [
                'name' => $name,
                'created_at' => gmdate('c'),
                'kind' => $kind,
                'app_version' => NORMA_VERSION,
                'schema_version' => (int) Database::value('PRAGMA user_version'),
                'method' => $method,
                'database' => basename(self::databaseFile()),
                'plugins' => $plugins,
                'has_config' => is_file($configFile),
                'report' => $report,
                'pinned' => false,
            ];
            $zip->addFromString('respaldo.json', self::prettyJson($manifest));
            $zip->addFromString('LEEME-RESTAURACION.txt', self::restoreReadme($manifest));

            $target = $directory . '/' . $name . '.zip';
            $bytes = $zip->writeTo($target);
            $manifest['bytes'] = $bytes;
            $manifest['sha256'] = self::sha256($target);
            self::writeManifest($manifest);
            return $manifest;
        } finally {
            if (is_file($staging)) {
                @unlink($staging);
            }
        }
    }

    /**
     * Copia legible de la base, para descargar sin empaquetar.
     * Se genera en un archivo temporal y se borra al terminar la descarga.
     */
    public static function snapshotFile(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'normia-snapshot-');
        if ($path === false) {
            throw new RuntimeException('No se pudo preparar la copia de la base.');
        }
        @unlink($path);
        self::snapshot($path);
        $report = self::verify($path);
        if (!$report['ok']) {
            @unlink($path);
            throw new RuntimeException('La copia no pasó la verificación: ' . implode(' ', $report['errors']));
        }
        // `Response::file()` termina con `exit`, así que el archivo se borra al
        // cerrar la petición, ya enviado.
        register_shutdown_function(static function () use ($path): void {
            if (is_file($path)) {
                @unlink($path);
            }
        });
        return $path;
    }

    /**
     * Copia consistente a `$target`.
     *
     * `VACUUM INTO` es la forma recomendada por SQLite: no necesita bloquear a
     * los lectores y produce una base ya compactada y sin WAL pendiente. Si el
     * motor no la admite, se hace punto de control del WAL y copia del archivo.
     *
     * @return string método usado
     */
    private static function snapshot(string $target): string
    {
        if (is_file($target)) {
            @unlink($target);
        }
        $pdo = Database::pdo();
        try {
            $pdo->exec('VACUUM INTO ' . $pdo->quote($target));
            if (is_file($target) && filesize($target) > 0) {
                return 'vacuum';
            }
        } catch (Throwable $exception) {
            error_log('Normia: VACUUM INTO no disponible (' . $exception->getMessage() . '); se usa copia con punto de control.');
        }

        try {
            $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');
        } catch (Throwable) {
            // Sin WAL o con lectores activos: la copia sigue siendo válida si el
            // archivo no cambia entre el punto de control y la lectura.
        }
        $source = self::databaseFile();
        if (!is_file($source) || !@copy($source, $target)) {
            throw new RuntimeException('No se pudo copiar la base de datos.');
        }
        return 'copy';
    }

    /**
     * Verificación aislada: abre la copia en **solo lectura**, en su propia
     * conexión, sin tocar la base viva, y comprueba integridad, claves foráneas,
     * tablas esperadas y los invariantes que no deben romperse.
     *
     * @return array{ok:bool,integrity:string,foreign_keys:int,counts:array<string,int>,errors:list<string>}
     */
    public static function verify(string $sqlitePath): array
    {
        $errors = [];
        $counts = [];
        $integrity = '';
        $foreignKeys = 0;
        if (!is_file($sqlitePath)) {
            return ['ok' => false, 'integrity' => '', 'foreign_keys' => 0, 'counts' => [], 'errors' => ['El archivo no existe.']];
        }
        try {
            $pdo = new PDO('sqlite:' . $sqlitePath, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $pdo->exec('PRAGMA query_only = ON');
            $integrity = (string) $pdo->query('PRAGMA integrity_check')->fetchColumn();
            if ($integrity !== 'ok') {
                $errors[] = 'integrity_check: ' . $integrity;
            }
            $foreignKeys = count($pdo->query('PRAGMA foreign_key_check')->fetchAll());
            if ($foreignKeys > 0) {
                $errors[] = $foreignKeys . ' referencia(s) sin destino.';
            }
            foreach (self::TABLES as $table) {
                $exists = (int) $pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = " . $pdo->quote($table))->fetchColumn();
                if ($exists === 0) {
                    $errors[] = 'Falta la tabla ' . $table . '.';
                    continue;
                }
                $counts[$table] = (int) $pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
            }
            $ledger = (int) $pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")->fetchColumn();
            if ($ledger > 0) {
                $counts['schema_migrations'] = (int) $pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
            }
            if (!isset($errors[0])) {
                if (isset($counts['organizations']) && $counts['organizations'] > 0) {
                    $sinPropietario = (int) $pdo->query(
                        'SELECT COUNT(*) FROM organizations o WHERE NOT EXISTS (
                            SELECT 1 FROM memberships m WHERE m.organization_id = o.id AND m.role = "owner"
                        )'
                    )->fetchColumn();
                    if ($sinPropietario > 0) {
                        $errors[] = $sinPropietario . ' empresa(s) sin propietario.';
                    }
                }
                if (isset($counts['projects'])) {
                    $huerfanos = (int) $pdo->query(
                        'SELECT COUNT(*) FROM projects p WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id)'
                    )->fetchColumn();
                    if ($huerfanos > 0) {
                        $errors[] = $huerfanos . ' proyecto(s) sin empresa.';
                    }
                }
                if (isset($counts['floors'])) {
                    $sinProyecto = (int) $pdo->query(
                        'SELECT COUNT(*) FROM floors f WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = f.project_id)'
                    )->fetchColumn();
                    if ($sinProyecto > 0) {
                        $errors[] = $sinProyecto . ' piso(s) sin proyecto.';
                    }
                }
            }
        } catch (Throwable $exception) {
            $errors[] = 'No se pudo abrir la copia: ' . $exception->getMessage();
        }
        return [
            'ok' => $errors === [],
            'integrity' => $integrity,
            'foreign_keys' => $foreignKeys,
            'counts' => $counts,
            'errors' => $errors,
        ];
    }

    /**
     * Extrae la base de un respaldo `.zip` propio a un archivo temporal y la
     * verifica en aislado. Sirve para comprobar una copia antes de restaurarla.
     *
     * @return array{ok:bool,database:string,report:array<string,mixed>}
     */
    public static function inspectArchive(string $zipPath): array
    {
        $bytes = file_get_contents($zipPath);
        if ($bytes === false || strlen($bytes) < 22) {
            return ['ok' => false, 'database' => '', 'report' => self::verify('/nonexistent')];
        }
        $offset = 0;
        $limit = strlen($bytes);
        $target = '';
        while ($offset + 30 <= $limit) {
            if (substr($bytes, $offset, 4) !== "PK\x03\x04") {
                break;
            }
            $header = unpack('vversion/vflag/vmethod/vtime/vdate/Vcrc/Vcompressed/Vsize/vnameLength/vextraLength', substr($bytes, $offset + 4, 26));
            $name = substr($bytes, $offset + 30, $header['nameLength']);
            $dataStart = $offset + 30 + $header['nameLength'] + $header['extraLength'];
            $data = substr($bytes, $dataStart, $header['size']);
            if (str_ends_with($name, '.sqlite') && str_starts_with($name, 'storage/')) {
                $target = tempnam(sys_get_temp_dir(), 'normia-inspect-') . '.sqlite';
                file_put_contents($target, $data);
                break;
            }
            $offset = $dataStart + $header['size'];
        }
        if ($target === '') {
            return ['ok' => false, 'database' => '', 'report' => self::verify('/nonexistent')];
        }
        try {
            $report = self::verify($target);
            return ['ok' => $report['ok'], 'database' => $target, 'report' => $report];
        } catch (Throwable) {
            return ['ok' => false, 'database' => $target, 'report' => self::verify($target)];
        }
    }

    /** Copias en disco, de la más reciente a la más antigua. */
    public static function list(): array
    {
        $directory = self::directory();
        if (!is_dir($directory)) {
            return [];
        }
        $items = [];
        foreach (glob($directory . '/normia-*.zip') ?: [] as $file) {
            $name = basename($file, '.zip');
            $manifest = self::readManifest($name) ?? [
                'name' => $name,
                'created_at' => gmdate('c', (int) filemtime($file)),
                'bytes' => (int) filesize($file),
                'kind' => 'desconocido',
                'pinned' => false,
            ];
            $manifest['bytes'] = (int) ($manifest['bytes'] ?? filesize($file));
            $manifest['exists'] = true;
            $items[] = $manifest;
        }
        usort($items, static fn (array $a, array $b): int => strcmp((string) $b['created_at'], (string) $a['created_at']));
        return $items;
    }

    public static function last(): ?array
    {
        $items = self::list();
        return $items[0] ?? null;
    }

    public static function daysSinceLast(): ?int
    {
        $last = self::last();
        if ($last === null) {
            return null;
        }
        $time = strtotime((string) $last['created_at']);
        if ($time === false) {
            return null;
        }
        return (int) floor((time() - $time) / 86400);
    }

    /**
     * Rotación: conserva las `$keep` más recientes y nunca toca las fijadas.
     *
     * @return list<string> nombres eliminados
     */
    public static function prune(int $keep = self::KEEP): array
    {
        $keep = max(1, $keep);
        $items = self::list();
        if (count($items) <= $keep) {
            return [];
        }
        $deleted = [];
        foreach (array_slice($items, $keep) as $item) {
            if (!empty($item['pinned'])) {
                continue;
            }
            $name = (string) $item['name'];
            if (self::delete($name)) {
                $deleted[] = $name;
            }
        }
        return $deleted;
    }

    public static function delete(string $name): bool
    {
        if (preg_match(self::NAME_PATTERN, $name) !== 1) {
            return false;
        }
        $removed = false;
        foreach ([self::directory() . '/' . $name . '.zip', self::directory() . '/' . $name . '.json'] as $file) {
            if (is_file($file) && @unlink($file)) {
                $removed = true;
            }
        }
        return $removed;
    }

    public static function pin(string $name, bool $pinned): bool
    {
        $manifest = self::readManifest($name);
        if ($manifest === null) {
            return false;
        }
        $manifest['pinned'] = $pinned;
        self::writeManifest($manifest);
        return true;
    }

    /** Ruta de descarga segura: solo nombres propios dentro de la carpeta. */
    public static function downloadPath(string $name): ?string
    {
        if (preg_match(self::NAME_PATTERN, $name) !== 1) {
            return null;
        }
        $path = self::directory() . '/' . $name . '.zip';
        return is_file($path) ? $path : null;
    }

    /**
     * Salud de la base viva, una vez al día.
     *
     * `quick_check` es barato y suficiente para detectar corrupción; el
     * `integrity_check` completo se hace sobre cada copia y queda en su
     * manifiesto.
     *
     * @return array{ok:bool,checked_at:string,result:string,fresh:bool}
     */
    public static function health(bool $force = false): array
    {
        $file = Paths::cache() . '/salud-base.json';
        $cached = null;
        if (is_file($file)) {
            $raw = file_get_contents($file);
            $decoded = $raw === false ? null : json_decode($raw, true);
            if (is_array($decoded)) {
                $cached = $decoded;
            }
        }
        $stale = $cached === null
            || (time() - (int) strtotime((string) ($cached['checked_at'] ?? '@0'))) > 86400;
        if (!$force && !$stale) {
            $cached['fresh'] = false;
            return $cached;
        }
        $result = 'error';
        try {
            $result = (string) Database::value('PRAGMA quick_check');
        } catch (Throwable) {
            $result = 'error';
        }
        $report = [
            'ok' => $result === 'ok',
            'checked_at' => gmdate('c'),
            'result' => $result,
            'fresh' => true,
        ];
        if (!is_dir(Paths::cache())) {
            @mkdir(Paths::cache(), 0770, true);
        }
        @file_put_contents($file, self::prettyJson($report), LOCK_EX);
        return $report;
    }

    /* ------------------------------- ayudas ------------------------------- */

    public static function databaseFile(): string
    {
        $path = (string) Config::databasePath();
        if ($path === '') {
            throw new RuntimeException('No hay una base de datos configurada.');
        }
        return $path;
    }

    public static function sha256(string $file): string
    {
        $hash = @hash_file('sha256', $file);
        return is_string($hash) ? $hash : '';
    }

    /** @return array<string,string> ruta relativa => absoluta */
    private static function pluginFiles(): array
    {
        $root = Paths::storage() . '/plugins';
        if (!is_dir($root)) {
            return [];
        }
        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $file) {
            if (!$file instanceof \SplFileInfo || !$file->isFile()) {
                continue;
            }
            $absolute = $file->getPathname();
            $relative = str_replace('\\', '/', substr($absolute, strlen($root) + 1));
            if ($relative === '' || count($files) >= 2000) {
                continue;
            }
            $files[$relative] = $absolute;
        }
        ksort($files);
        return $files;
    }

    private static function uniqueName(): string
    {
        $base = 'normia-' . gmdate('Ymd-His');
        $name = $base;
        $suffix = 1;
        while (is_file(self::directory() . '/' . $name . '.zip')) {
            $name = $base . '-' . $suffix;
            $suffix++;
        }
        return $name;
    }

    private static function manifestFile(string $name): string
    {
        return self::directory() . '/' . $name . '.json';
    }

    private static function writeManifest(array $manifest): void
    {
        self::ensureDirectory();
        @file_put_contents(self::manifestFile((string) $manifest['name']), self::prettyJson($manifest), LOCK_EX);
    }

    private static function readManifest(string $name): ?array
    {
        if (preg_match(self::NAME_PATTERN, $name) !== 1) {
            return null;
        }
        $file = self::manifestFile($name);
        if (!is_file($file)) {
            return null;
        }
        $raw = file_get_contents($file);
        $decoded = $raw === false ? null : json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    private static function prettyJson(array $data): string
    {
        return (string) json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private static function restoreReadme(array $manifest): string
    {
        return implode(PHP_EOL, [
            'Normia Planos CAD · respaldo',
            'Generado: ' . $manifest['created_at'] . ' (' . $manifest['kind'] . ')',
            'Versión de la aplicación: ' . $manifest['app_version'] . ' · esquema ' . $manifest['schema_version'],
            '',
            'COMPROBACIÓN (sin tocar la instalación en uso)',
            '  1. Descomprime este ZIP en una carpeta aparte.',
            '  2. Abre la base en modo solo lectura y verifica:',
            '       sqlite3 storage/' . $manifest['database'] . ' "PRAGMA integrity_check; PRAGMA foreign_key_check;"',
            '     Debe responder «ok» y no devolver filas.',
            '',
            'RESTAURACIÓN (en una instalación detenida, nunca con la aplicación abierta)',
            '  1. Detén el servidor o cierra la aplicación.',
            '  2. Mueve la carpeta storage actual a storage-anterior-<fecha> (no la borres).',
            '  3. Copia config/config.php y storage/' . $manifest['database'] . ' del respaldo',
            '     a su sitio, y storage/plugins/ si el respaldo los incluye.',
            '  4. Abre la aplicación: la migración pondrá el esquema al día si hace falta.',
            '  5. Si algo no cuadra, vuelve a poner storage-anterior-<fecha> en su sitio.',
            '',
            'Este respaldo contiene datos de las empresas de esta instalación.',
            'Trátalo como información confidencial.',
        ]) . PHP_EOL;
    }
}
