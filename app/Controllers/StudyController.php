<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Core\View;
use App\Services\DesignValidator;
use App\Services\LibraryRepository;
use App\Services\MepCalculator;
use App\Services\PlanAudit;
use App\Services\PlanFooter;
use App\Services\StudyPlan;
use App\Services\SvgExporter;

/**
 * **Modo estudio**: el editor suelto, sin cuentas, proyectos ni base de datos.
 *
 * Es la edición de escritorio «solo editor». El plano vive en un archivo que
 * elige la persona; aquí solo se resuelven las cuatro cosas que el navegador no
 * puede hacer solo —auditor, informe, impresión y exportación con escala
 * física— y se sirve la página del editor. No toca `storage/`, no crea tablas y
 * no lee ni escribe ninguna base de datos.
 */
final class StudyController
{
    /** Hojas de impresión admitidas, igual que en la exportación completa. */
    private const PAPERS = ExportController::PAPERS;
    private const PRINT_MARGIN_MM = ExportController::PRINT_MARGIN_MM;

    /* --------------------------------- páginas -------------------------------- */

    /** Página del editor en modo estudio. */
    public function show(): void
    {
        $plan = StudyPlan::current();
        $design = $plan['design'];
        $name = $plan['name'] !== '' ? $plan['name'] : StudyPlan::DEFAULT_NAME;
        $designJson = json_encode($design, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        View::render('editor/index', [
            'title' => $name,
            'study' => true,
            'project' => ['id' => 0, 'name' => $name],
            'floor' => [
                'id' => 0,
                'name' => $name,
                'level' => '',
                'version' => 1,
                'design' => $design,
                'updated_at' => gmdate('c'),
                'draft' => null,
            ],
            'designJson' => $designJson,
            'siblings' => [],
            'networks' => LibraryRepository::networks(),
            'catalog' => LibraryRepository::counts(),
            'boot' => $this->boot($design, $name),
        ], null);
    }

    /* ---------------------------------- datos --------------------------------- */

    /**
     * Espejo del plano en la sesión: `GET` lo devuelve, `POST` lo reemplaza.
     * El archivo del equipo manda; esto es solo lo que leen el auditor y la
     * impresión.
     */
    public function plano(): void
    {
        $request = $this->request();
        if (!$request->isPost()) {
            $plan = StudyPlan::current();
            Response::json(['ok' => true, 'name' => $plan['name'], 'design' => $plan['design']]);
            return;
        }
        $payload = $request->json();
        $design = $payload['design'] ?? null;
        if (!is_array($design)) {
            Response::json(['ok' => false, 'message' => 'El plano no llegó con formato válido.', 'code' => 'invalid'], 422);
            return;
        }
        try {
            $name = StudyPlan::sanitizeName((string) ($payload['name'] ?? ''));
            $normalized = StudyPlan::store($design, $name !== '' ? $name : null);
        } catch (\DomainException $exception) {
            Response::json(['ok' => false, 'message' => $exception->getMessage(), 'code' => 'invalid'], 422);
            return;
        }
        Response::json(['ok' => true, 'name' => StudyPlan::name(), 'design' => $normalized, 'savedAt' => gmdate('c')]);
    }

    /** Renombrar el plano desde el cajón de ajustes. */
    public function nombre(): void
    {
        $payload = $this->request()->json();
        $name = StudyPlan::sanitizeName((string) ($payload['name'] ?? ''));
        if ($name === '') {
            Response::json(['ok' => false, 'message' => 'El plano necesita un nombre.', 'code' => 'invalid'], 422);
            return;
        }
        $plan = StudyPlan::current();
        StudyPlan::store($plan['design'], $name);
        Response::json(['ok' => true, 'name' => $name, 'level' => '']);
    }

    /**
     * Auditoría del plano en curso. Si llega el diseño en el cuerpo, se audita
     * ese y se refresca el espejo: así el informe puede abrirse sin haber
     * guardado el archivo.
     */
    public function auditoria(): void
    {
        $request = $this->request();
        $occupancy = 0;
        $design = null;
        if ($request->query('occupancy') !== null) {
            $occupancy = max(0, min(10000, (int) $request->query('occupancy')));
        }
        if ($request->isPost()) {
            $payload = $request->json();
            if (is_array($payload['design'] ?? null)) {
                try {
                    $design = StudyPlan::store($payload['design'], null);
                } catch (\DomainException $exception) {
                    Response::json(['ok' => false, 'message' => $exception->getMessage(), 'code' => 'invalid'], 422);
                    return;
                }
            }
            if (is_numeric($payload['occupancy'] ?? null)) {
                $occupancy = max(0, min(10000, (int) $payload['occupancy']));
            }
        }
        $design ??= StudyPlan::design();
        Response::json([
            'ok' => true,
            'floor' => ['id' => 0, 'name' => StudyPlan::name(), 'version' => 1],
            'report' => PlanAudit::analyze($design, $occupancy),
            'notice' => 'Revisión de referencia sobre el plano en curso. No es un dictamen ni certifica cumplimiento normativo.',
        ]);
    }

    /* -------------------------- documentos y archivos ------------------------- */

    /** Informe de revisión imprimible. */
    public function informe(): void
    {
        $design = StudyPlan::design();
        $name = $this->displayName();
        $meta = $this->meta($name);
        $report = PlanAudit::analyze($design);
        View::render('editor/audit-report', [
            'title' => 'Revisión del plano · ' . $name,
            'project' => $this->project($name),
            'floor' => $this->floor($name, $design),
            'meta' => $meta,
            'report' => $report,
            'criteria' => $report['criteria'],
            'design' => $design,
            'version' => 1,
            'generatedAt' => gmdate('Y-m-d H:i'),
            'backUrl' => url('estudio'),
            'study' => true,
            'user' => ['name' => ''],
        ], null);
    }

    /** Impresión con escala física, hoja y pie del plano. */
    public function imprimir(): void
    {
        $design = StudyPlan::design();
        $name = $this->displayName();
        $meta = $this->meta($name);
        $paperKey = $this->requestedPaper();
        $paper = self::PAPERS[$paperKey];
        $scale = $this->requestedScale((string) ($design['canvas']['scale'] ?? '1:100'));
        $sheet = SvgExporter::sheet($design, $scale);
        $availableWidth = $paper['width'] - self::PRINT_MARGIN_MM * 2;
        $availableHeight = $paper['height'] - self::PRINT_MARGIN_MM * 2;
        $svg = SvgExporter::render($design, $meta, true, ['scale' => $scale]);
        $svg = preg_replace('/<\?xml[^>]*\?>\s*/i', '', $svg) ?? $svg;
        View::render('editor/print', [
            'title' => 'Imprimir · ' . $name,
            'project' => $this->floor($name, $design),
            'floor' => $this->floor($name, $design),
            'svg' => $svg,
            'meta' => $meta,
            'mep' => MepCalculator::summary($design),
            'version' => 1,
            'scale' => $scale,
            'scales' => SvgExporter::SCALES,
            'paperKey' => $paperKey,
            'papers' => self::PAPERS,
            'paper' => $paper,
            'sheet' => $sheet,
            'suggested' => $this->fitScale($design, $paperKey),
            'fits' => $sheet['widthMm'] <= $availableWidth && $sheet['heightMm'] <= $availableHeight,
            'availableWidth' => $availableWidth,
            'availableHeight' => $availableHeight,
            'printUrl' => url('estudio/imprimir'),
            'backUrl' => url('estudio'),
            'study' => true,
            'user' => ['name' => ''],
        ], null);
    }

    /** SVG con escala física y pie del plano. */
    public function svg(): void
    {
        $design = StudyPlan::design();
        $name = $this->displayName();
        $meta = $this->meta($name);
        $scale = $this->requestedScale((string) ($design['canvas']['scale'] ?? '1:100'));
        $svg = SvgExporter::render($design, $meta, true, ['scale' => $scale]);
        Response::download($this->fileName($name) . '.svg', $svg, 'image/svg+xml');
    }

    /** Plano en JSON: el mismo documento que importa la edición completa. */
    public function json(): void
    {
        $design = StudyPlan::design();
        $name = $this->displayName();
        /* El mismo sobre que exporta la edición completa: un plano guardado en
           el estudio se puede importar tal cual en un proyecto, sin conversiones
           ni campos que el importador tenga que adivinar. */
        $payload = [
            'application' => 'normia-planos-cad',
            'format' => 'normia-plan',
            'schema_version' => 3,
            'exported_at' => gmdate('c'),
            'project' => ['name' => $name, 'site' => '', 'workplace' => '', 'responsible' => '', 'notes' => ''],
            'floor' => ['name' => $name, 'level' => ''],
            'design' => $design,
            'attribution' => 'Pictogramas ISO 7010: @iso-safety-signs/core 1.1.0 (MIT © Karl Norling). Normia Planos CAD '
                . (defined('NORMA_VERSION') ? (string) \NORMA_VERSION : '') . '.',
        ];
        Response::download(
            $this->fileName($name) . '.json',
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR),
            'application/json'
        );
    }

    /* --------------------------------- apoyo --------------------------------- */

    /** Arranque del editor: todo lo que necesita la página para pintarse. */
    private function boot(array $design, string $name): array
    {
        return [
            'study' => true,
            'floorId' => 0,
            'projectId' => 0,
            'version' => 1,
            'csrf' => \App\Core\Csrf::token(),
            'floorUrl' => url('estudio/plano'),
            'saveUrl' => url('estudio/plano'),
            'autosaveUrl' => url('estudio/plano'),
            'discardDraftUrl' => url('estudio/plano'),
            'versionsUrl' => url('estudio/plano'),
            'restoreUrlTemplate' => url('estudio/plano'),
            'settingsUrl' => url('estudio/nombre'),
            'exportSvgUrl' => url('estudio/export/svg'),
            'exportJsonUrl' => url('estudio/export/json'),
            'printUrl' => url('estudio/imprimir'),
            'reportUrl' => url('estudio/informe'),
            'signsUrl' => url('catalogs/signs'),
            'cadUrl' => url('catalogs/cad'),
            'mepUrl' => url('catalogs/mep'),
            'mepSummaryUrl' => url('catalogs/mep'),
            'auditUrl' => url('estudio/auditoria'),
            'projectUrl' => url('estudio'),
            'autosaveInterval' => 0,
            'draftAt' => null,
            'fileBase' => $this->fileName($name),
            'footer' => PlanFooter::payload($design, StudyPlan::footerMeta($name)),
            'project' => ['name' => $name, 'site' => '', 'workplace' => '', 'responsible' => '', 'notes' => ''],
            'floorMeta' => ['name' => $name, 'level' => ''],
            'demo' => false,
        ];
    }

    private function displayName(): string
    {
        $name = StudyPlan::name();
        return $name !== '' ? $name : StudyPlan::DEFAULT_NAME;
    }

    /** @return array<string,mixed> */
    private function project(string $name): array
    {
        return ['id' => 0, 'name' => $name, 'site' => '', 'workplace' => '', 'responsible' => '', 'notes' => ''];
    }

    /**
     * Fila de piso equivalente para las vistas de informe e impresión, que
     * esperan los datos de un piso guardado.
     *
     * @param array<string,mixed> $design
     * @return array<string,mixed>
     */
    private function floor(string $name, array $design): array
    {
        return [
            'id' => 0,
            'name' => $name,
            'level' => '',
            'version' => 1,
            'design' => $design,
            'design_json' => json_encode($design, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'project_name' => $name,
            'project_site' => '',
            'project_workplace' => '',
            'project_responsible' => '',
            'updated_at' => gmdate('c'),
        ];
    }

    /** @return array<string,mixed> */
    private function meta(string $name): array
    {
        return [
            'project_name' => $name,
            'floor_name' => '',
            'level' => '',
            'responsible' => '',
            'site' => '',
            'workplace' => '',
            'exported_by' => '',
            'version' => 1,
            'saved_at' => gmdate('c'),
            'export_scale' => $this->requestedScale((string) (StudyPlan::design()['canvas']['scale'] ?? '1:100')),
        ];
    }

    private function fileName(string $name): string
    {
        $base = function_exists('slug_filename') ? slug_filename($name) : preg_replace('/[^A-Za-z0-9._-]+/', '-', $name);
        return $base !== '' ? $base : 'normia-plano';
    }

    private function requestedScale(string $fallback): string
    {
        $value = $_GET['escala'] ?? null;
        if (is_string($value)) {
            $denominator = \App\Core\Units::scaleDenominator(trim($value));
            if ($denominator !== null) {
                return '1:' . (int) $denominator;
            }
        }
        return \App\Core\Units::scaleDenominator($fallback) !== null ? $fallback : '1:100';
    }

    private function requestedPaper(): string
    {
        $value = $_GET['hoja'] ?? null;
        return is_string($value) && isset(self::PAPERS[$value]) ? $value : 'a4h';
    }

    /** Escala estándar mayor que cabe en la hoja sin recortarse. */
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

    private function request(): \App\Core\Request
    {
        return new \App\Core\Request();
    }
}
