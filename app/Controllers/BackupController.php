<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Services\Backup;

/**
 * Respaldos de la instalación.
 *
 * Solo para la cuenta que instaló la aplicación: una copia completa incluye los
 * planos, las fotografías y las personas de **todas** las empresas, así que no
 * puede ofrecerse desde una empresa concreta.
 */
final class BackupController extends BaseController
{
    private const MESSAGE = 'Solo la cuenta que instaló la aplicación puede gestionar los respaldos: '
        . 'una copia completa incluye los datos de todas las empresas.';

    public function index(): void
    {
        $this->requireInstanceAdmin(self::MESSAGE);
        $this->render('backup/index', [
            'title' => 'Datos y respaldo',
            'backups' => Backup::list(),
            'health' => Backup::health(),
            'last' => Backup::last(),
            'age' => Backup::daysSinceLast(),
            'keep' => Backup::KEEP,
            'maxAge' => Backup::MAX_AGE_DAYS,
            'schema' => (int) \App\Core\Database::value('PRAGMA user_version'),
        ]);
    }

    public function create(): void
    {
        $this->requireInstanceAdmin(self::MESSAGE);
        try {
            $manifest = Backup::create('manual');
            $deleted = Backup::prune();
            $message = 'Respaldo creado: ' . $manifest['name'] . ' · ' . self::size((int) $manifest['bytes']) . '.';
            if ($deleted !== []) {
                $message .= ' Rotación: se conservan las ' . Backup::KEEP . ' copias más recientes y se retiraron '
                    . count($deleted) . '.';
            }
            flash_success($message);
        } catch (\Throwable $exception) {
            flash_error('No se pudo crear el respaldo: ' . $exception->getMessage());
        }
        Response::redirect(url('respaldo'));
    }

    /** Descarga del respaldo completo. */
    public function download(string $name): void
    {
        $this->requireInstanceAdmin(self::MESSAGE);
        $path = Backup::downloadPath($name);
        if ($path === null) {
            flash_error('Ese respaldo no existe o el nombre no es válido.');
            Response::redirect(url('respaldo'));
        }
        Response::file($path, $name . '.zip', 'application/zip');
    }

    /** Copia rápida de la base, generada al momento y verificada. */
    public function snapshot(): void
    {
        $this->requireInstanceAdmin(self::MESSAGE);
        try {
            $path = Backup::snapshotFile();
            $name = 'normia-base-' . gmdate('Ymd-His') . '.sqlite';
            Response::file($path, $name, 'application/vnd.sqlite3');
        } catch (\Throwable $exception) {
            flash_error('No se pudo generar la copia de la base: ' . $exception->getMessage());
            Response::redirect(url('respaldo'));
        }
    }

    /** Fija o suelta una copia para que la rotación no la retire. */
    public function pin(string $name): void
    {
        $this->requireInstanceAdmin(self::MESSAGE);
        $manifest = null;
        foreach (Backup::list() as $item) {
            if ((string) $item['name'] === $name) {
                $manifest = $item;
            }
        }
        if ($manifest === null) {
            flash_error('Ese respaldo no existe.');
            Response::redirect(url('respaldo'));
        }
        $pinned = empty($manifest['pinned']);
        Backup::pin($name, $pinned);
        flash_success($pinned
            ? 'Copia fijada: la rotación no la eliminará.'
            : 'Copia liberada: la rotación puede eliminarla cuando haya más de ' . Backup::KEEP . '.');
        Response::redirect(url('respaldo'));
    }

    /** Verifica un respaldo en aislado, sin tocar la base en uso. */
    public function verify(string $name): void
    {
        $this->requireInstanceAdmin(self::MESSAGE);
        $path = Backup::downloadPath($name);
        if ($path === null) {
            flash_error('Ese respaldo no existe.');
            Response::redirect(url('respaldo'));
        }
        $result = Backup::inspectArchive($path);
        if (is_file($result['database'])) {
            @unlink($result['database']);
        }
        if ($result['ok']) {
            $counts = $result['report']['counts'] ?? [];
            flash_success('Respaldo verificado: integridad correcta, sin referencias rotas · '
                . (int) ($counts['projects'] ?? 0) . ' proyectos, '
                . (int) ($counts['floors'] ?? 0) . ' pisos, '
                . (int) ($counts['floor_versions'] ?? 0) . ' versiones, '
                . (int) ($counts['element_checks'] ?? 0) . ' verificaciones.');
        } else {
            flash_error('El respaldo no pasó la verificación: ' . implode(' ', (array) ($result['report']['errors'] ?? [])));
        }
        Response::redirect(url('respaldo'));
    }

    private static function size(int $bytes): string
    {
        if ($bytes >= 1048576) {
            return round($bytes / 1048576, 1) . ' MB';
        }
        if ($bytes >= 1024) {
            return round($bytes / 1024) . ' KB';
        }
        return $bytes . ' B';
    }
}
