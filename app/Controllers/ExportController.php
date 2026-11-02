<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Config;
use App\Core\Response;
use App\Core\Units;
use App\Core\View;
use App\Models\Floor;
use App\Services\DesignValidator;
use App\Services\MepCalculator;
use App\Services\PlanAudit;
use App\Services\SvgExporter;

final class ExportController extends BaseController
{
    /** Hojas admitidas en la impresión: tamaño, orientación y margen de 12 mm. */
    public const PAPERS = [
        'a4h' => ['label' => 'A4 horizontal', 'css' => 'A4 landscape', 'width' => 297.0, 'height' => 210.0],
        'a4v' => ['label' => 'A4 vertical', 'css' => 'A4 portrait', 'width' => 210.0, 'height' => 297.0],
        'a3h' => ['label' => 'A3 horizontal', 'css' => 'A3 landscape', 'width' => 420.0, 'height' => 297.0],
        'a3v' => ['label' => 'A3 vertical', 'css' => 'A3 portrait', 'width' => 297.0, 'height' => 420.0],
    ];

    /** Margen de la hoja, en milímetros. El mismo que declara `print.css`. */
    public const PRINT_MARGIN_MM = 12.0;

    /**
     * La escala se elige al exportar y **no se guarda**: el documento no cambia.
     * Se acepta `?escala=1:50`; lo que no se entiende vuelve a la escala del
     * plano, que es solo la sugerencia.
     */
    private function requestedScale(string $fallback): string
    {
        $value = $_GET['escala'] ?? null;
        if (is_string($value)) {
            $denominator = Units::scaleDenominator(trim($value));
            if ($denominator !== null) {
                return '1:' . (int) $denominator;
            }
        }
        return Units::scaleDenominator($fallback) !== null ? $fallback : '1:100';
    }

    private function requestedPaper(): string
    {
        $value = $_GET['hoja'] ?? null;
        return is_string($value) && isset(self::PAPERS[$value]) ? $value : 'a4h';
    }

    /**
     * Escala estándar mayor que cabe en la hoja (la que ocupa más papel sin
     * recortarse). Devuelve `null` si ninguna cabe.
     *
     * @param array<string,mixed> $design
     */
    private function fitScale(array $design, string $paper): ?string
    {
        $sheet = self::PAPERS[$paper];
        $availableWidth = $sheet['width'] - self::PRINT_MARGIN_MM * 2;
        $availableHeight = $sheet['height'] - self::PRINT_MARGIN_MM * 2;
        $scales = SvgExporter::SCALES;
        usort($scales, static fn (string $a, string $b): int => (int) substr($a, 2) <=> (int) substr($b, 2));
        foreach ($scales as $scale) {
            $size = SvgExporter::sheet($design, $scale);
            if ($size['widthMm'] <= $availableWidth && $size['heightMm'] <= $availableHeight) {
                return $scale;
            }
        }
        return null;
    }

    public function svg(int $projectId, int $floorId): void
    {
        $floor = $this->floor($floorId, $projectId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $meta = $this->meta($floor);
        $scale = $this->requestedScale((string) ($design['canvas']['scale'] ?? '1:100'));
        $svg = SvgExporter::render($design, $meta, true, ['scale' => $scale]);
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
            // 3 desde NORMIA-006: la geometría va en centímetros y los elementos
            // pueden llevar `measuredM` y `quality`. El importador acepta 2 y 3.
            'schema_version' => 3,
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
        $paperKey = $this->requestedPaper();
        $paper = self::PAPERS[$paperKey];
        $scale = $this->requestedScale((string) ($design['canvas']['scale'] ?? '1:100'));
        $suggested = $this->fitScale($design, $paperKey);
        $sheet = SvgExporter::sheet($design, $scale);
        $availableWidth = $paper['width'] - self::PRINT_MARGIN_MM * 2;
        $availableHeight = $paper['height'] - self::PRINT_MARGIN_MM * 2;
        $fits = $sheet['widthMm'] <= $availableWidth && $sheet['heightMm'] <= $availableHeight;
        $svg = SvgExporter::render($design, $meta, true, ['scale' => $scale]);
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
            'scale' => $scale,
            'scales' => SvgExporter::SCALES,
            'paperKey' => $paperKey,
            'papers' => self::PAPERS,
            'paper' => $paper,
            'sheet' => $sheet,
            'suggested' => $suggested,
            'fits' => $fits,
            'availableWidth' => $availableWidth,
            'availableHeight' => $availableHeight,
            'printUrl' => url('projects/' . $projectId . '/floors/' . $floorId . '/print'),
            'backUrl' => url('projects/' . $projectId . '/floors/' . $floorId . '/editor'),
            'user' => $this->user(),
        ], null);
    }

    /** Informe de revisión imprimible (auditor de planos + métricas de evacuación). */
    public function audit(int $projectId, int $floorId): void
    {
        $floor = $this->floor($floorId, $projectId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $meta = $this->meta($floor);
        $report = PlanAudit::analyze($design);
        View::render('editor/audit-report', [
            'title' => 'Revisión del plano · ' . $floor['name'],
            'project' => $floor,
            'floor' => $floor,
            'meta' => $meta,
            'report' => $report,
            'criteria' => $report['criteria'],
            'design' => $design,
            'version' => (int) $floor['version'],
            'generatedAt' => gmdate('Y-m-d H:i'),
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
