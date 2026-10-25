<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Models\Floor;
use App\Models\Project;

final class EditorController extends BaseController
{
    public function show(int $projectId, int $floorId): void
    {
        $floorRow = $this->floor($floorId, $projectId);
        $floor = Floor::preview($floorId, (int) $this->user()['id']);
        if ($floor === null) {
            throw new \DomainException('El piso no existe o no tienes acceso.');
        }
        $project = $this->project($projectId);
        $siblings = Project::floors($projectId, (int) $this->user()['id']);
        $design = $floor['design'];
        $designJson = json_encode($design, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $this->render('editor/index', [
            'title' => $project['name'] . ' · ' . $floor['name'],
            'project' => $project,
            'floor' => $floor,
            'designJson' => $designJson,
            'siblings' => $siblings,
            'boot' => [
                'floorId' => (int) $floorId,
                'projectId' => (int) $projectId,
                'version' => (int) $floor['version'],
                'csrf' => \App\Core\Csrf::token(),
                'floorUrl' => url('api/floors/' . $floorId),
                'saveUrl' => url('api/floors/' . $floorId . '/save'),
                'autosaveUrl' => url('api/floors/' . $floorId . '/autosave'),
                'discardDraftUrl' => url('api/floors/' . $floorId . '/discard-draft'),
                'versionsUrl' => url('api/floors/' . $floorId . '/versions'),
                'restoreUrlTemplate' => url('api/floors/' . $floorId . '/versions/__ID__/restore'),
                'settingsUrl' => url('api/floors/' . $floorId . '/settings'),
                'exportSvgUrl' => url('projects/' . $projectId . '/floors/' . $floorId . '/export/svg'),
                'exportJsonUrl' => url('projects/' . $projectId . '/floors/' . $floorId . '/export/json'),
                'printUrl' => url('projects/' . $projectId . '/floors/' . $floorId . '/print'),
                'signsUrl' => url('catalogs/signs'),
                'cadUrl' => url('catalogs/cad'),
                'projectUrl' => url('projects/' . $projectId),
                'autosaveInterval' => 30,
                'draftAt' => $floor['draft']['updated_at'] ?? null,
                'fileBase' => slug_filename($project['name'] . '-' . $floor['name']) . '-v' . (int) $floor['version'],
                'project' => [
                    'name' => $project['name'],
                    'site' => $project['site'],
                    'workplace' => $project['workplace'],
                    'responsible' => $project['responsible'],
                    'notes' => $project['notes'],
                ],
                'floorMeta' => [
                    'name' => $floor['name'],
                    'level' => $floor['level'],
                ],
                'demo' => (bool) \App\Core\Config::get('demo', false),
            ],
        ], null);
    }
}
