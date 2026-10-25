<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Config;
use App\Core\Response;
use App\Core\View;
use App\Models\Floor;
use App\Services\DesignValidator;
use App\Services\MepCalculator;
use App\Services\SvgExporter;

final class ExportController extends BaseController
{
    public function svg(int $projectId, int $floorId): void
    {
        $floor = $this->floor($floorId, $projectId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $meta = $this->meta($floor);
        $svg = SvgExporter::render($design, $meta, true);
        $name = 'normia-' . slug_filename($floor['project_name']) . '-' . slug_filename($floor['name']) . '-v' . (int) $floor['version'] . '.svg';
        Response::download($name, $svg, 'image/svg+xml; charset=UTF-8');
    }

    public function preview(int $projectId, int $floorId): void
    {
        $floor = $this->floor($floorId, $projectId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $meta = $this->meta($floor);
        $svg = SvgExporter::render($design, $meta, false);
        header('Content-Type: image/svg+xml; charset=UTF-8');
        header('Cache-Control: private, max-age=60');
        echo $svg;
        exit;
    }

    public function json(int $projectId, int $floorId): void
    {
        $floor = $this->floor($floorId, $projectId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $envelope = [
            'application' => 'normia-planos-cad',
            'format' => 'normia-plan',
            'schema_version' => 2,
            'exported_at' => gmdate('c'),
            'project' => [
                'name' => $floor['project_name'],
                'site' => $floor['project_site'],
                'workplace' => $floor['project_workplace'],
                'responsible' => $floor['project_responsible'],
                'notes' => $floor['project_notes'],
            ],
            'floor' => [
                'name' => $floor['name'],
                'level' => $floor['level'],
            ],
            'design' => $design,
            'attribution' => 'Pictogramas ISO 7010: @iso-safety-signs/core 1.1.0 (MIT © Karl Norling) y dibujos de Wikimedia Commons; consulta resources/licenses/iso-safety-signs.NOTICE.txt. Normia Planos CAD ' . NORMA_VERSION . '.',
        ];
        $json = json_encode($envelope, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $name = 'normia-' . slug_filename($floor['project_name']) . '-' . slug_filename($floor['name']) . '-v' . (int) $floor['version'] . '.json';
        Response::download($name, $json, 'application/json; charset=UTF-8');
    }

    public function print(int $projectId, int $floorId): void
    {
        $floor = $this->floor($floorId, $projectId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $meta = $this->meta($floor);
        $svg = SvgExporter::render($design, $meta, true);
        $svg = preg_replace('/<\?xml[^>]*\?>\s*/i', '', $svg) ?? $svg;
        $mep = MepCalculator::summary($design);
        View::render('editor/print', [
            'title' => 'Imprimir · ' . $floor['name'],
            'project' => $floor,
            'floor' => $floor,
            'svg' => $svg,
            'meta' => $meta,
            'mep' => $mep,
            'version' => (int) $floor['version'],
            'backUrl' => url('projects/' . $projectId . '/floors/' . $floorId . '/editor'),
            'user' => $this->user(),
        ], null);
    }

    private function meta(array $floor): array
    {
        return [
            'project_name' => $floor['project_name'],
            'floor_name' => $floor['name'],
            'level' => $floor['level'],
            'responsible' => $floor['project_responsible'] ?? '',
            'site' => $floor['project_site'] ?? '',
            'workplace' => $floor['project_workplace'] ?? '',
            'exported_by' => $this->user()['name'] ?? '',
            'version' => (int) $floor['version'],
            'saved_at' => $floor['updated_at'] ?? '',
        ];
    }
}
