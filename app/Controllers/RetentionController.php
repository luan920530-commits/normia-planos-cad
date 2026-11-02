<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Models\Floor;
use App\Models\Membership;
use App\Services\Backup;
use App\Services\VersionRetention;

/**
 * Historial de un piso y conservación de versiones.
 *
 * Borrar historial es irreversible, así que aquí nada ocurre solo: se muestra
 * qué se conservaría y qué se borraría, se exige confirmación explícita, y antes
 * de tocar nada se crea un respaldo. Si el respaldo no se puede crear, no se
 * borra nada.
 */
final class RetentionController extends BaseController
{
    public function show(int $projectId, int $floorId): void
    {
        $project = $this->project($projectId);
        $floor = $this->floor($floorId, $projectId);
        $this->requireCapability($project, 'manage', 'Solo un administrador o el propietario de la empresa puede gestionar el historial.');
        $this->render('projects/versions', [
            'title' => 'Historial · ' . $floor['name'],
            'project' => $project,
            'floor' => $floor,
            'plan' => VersionRetention::plan($floorId),
            'versions' => Floor::versions($floorId, (int) $this->user()['id']),
            'keepDays' => VersionRetention::KEEP_DAYS,
            'keepDailyDays' => VersionRetention::KEEP_DAILY_DAYS,
        ]);
    }

    public function prune(int $projectId, int $floorId): void
    {
        $project = $this->project($projectId);
        $floor = $this->floor($floorId, $projectId);
        if (!Membership::can($project['role'] ?? null, 'manage')) {
            flash_error('Solo un administrador o el propietario de la empresa puede borrar versiones.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/versiones'));
        }
        $request = new Request();
        $raw = $request->input('versions', []);
        $ids = [];
        if (is_array($raw)) {
            foreach ($raw as $id) {
                $ids[] = (int) $id;
            }
        } elseif (is_string($raw)) {
            foreach (explode(',', $raw) as $id) {
                if (trim($id) !== '') {
                    $ids[] = (int) $id;
                }
            }
        }
        if ($ids === []) {
            flash_error('No seleccionaste ninguna versión. No se borró nada.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/versiones'));
        }

        // Respaldo obligatorio antes de tocar el historial.
        try {
            Backup::create('antes-de-podar');
            Backup::prune();
        } catch (\Throwable $exception) {
            flash_error('No se pudo crear el respaldo previo, así que no se borró ninguna versión: ' . $exception->getMessage());
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/versiones'));
        }

        $result = VersionRetention::prune($floorId, $ids);
        if ($result['deleted'] === 0) {
            flash_error('No se borró ninguna versión: las seleccionadas dejaron de ser candidatas (quizá se fijaron o una es la vigente).');
        } else {
            $message = 'Se eliminaron ' . $result['deleted'] . ' versiones del historial. El respaldo previo queda en Datos y respaldo.';
            if ($result['skipped'] > 0) {
                $message .= ' ' . $result['skipped'] . ' se conservaron porque ya no eran candidatas.';
            }
            flash_success($message);
        }
        Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/versiones'));
    }

    public function pin(int $projectId, int $floorId, int $versionId): void
    {
        $project = $this->project($projectId);
        $this->floor($floorId, $projectId);
        if (!Membership::can($project['role'] ?? null, 'manage')) {
            flash_error('Tu rol no permite fijar versiones.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/versiones'));
        }
        $current = null;
        foreach (Floor::versions($floorId, (int) $this->user()['id']) as $version) {
            if ((int) $version['id'] === $versionId) {
                $current = (int) $version['pinned'] === 1;
            }
        }
        if ($current === null) {
            flash_error('La versión no existe.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/versiones'));
        }
        VersionRetention::pin($floorId, $versionId, !$current);
        flash_success($current
            ? 'Versión liberada: la conservación puede retirarla cuando deje de ser reciente.'
            : 'Versión fijada: la conservación no la tocará.');
        Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/versiones'));
    }
}
