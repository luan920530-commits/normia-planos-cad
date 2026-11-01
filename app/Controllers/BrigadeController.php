<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Core\Session;
use App\Core\View;
use App\Models\Brigade;
use App\Services\DesignValidator;
use App\Services\SvgExporter;

/**
 * Modo brigadista: enlace público de solo lectura para el celular, sin sesión.
 *
 * La página no expone la cuenta ni el editor: solo el plano guardado, el nombre
 * del proyecto y la fecha de actualización. El enlace se puede desactivar y
 * regenerar desde el panel del piso.
 */
final class BrigadeController extends BaseController
{
    /** Equipos del catálogo que cuentan como extintor. */
    private const EXTINGUISHERS = [
        'cad_fire_ext_co2', 'cad_fire_ext_wheeled', 'cad_eds_extinguisher', 'cad_drg_extinguisher',
    ];

    public function manage(int $projectId, int $floorId): void
    {
        $project = $this->project($projectId);
        $floor = $this->floor($floorId, $projectId);
        $link = Brigade::forFloor($floorId, (int) $this->user()['id']);
        $this->render('brigade/manage', [
            'title' => 'Modo brigadista · ' . $floor['name'],
            'project' => $project,
            'floor' => $floor,
            'link' => $link,
            'publicUrl' => $link !== null && (int) $link['enabled'] === 1
                ? absolute_url('b/' . $link['token'])
                : '',
        ]);
    }

    public function update(int $projectId, int $floorId): void
    {
        $this->project($projectId);
        $floor = $this->floor($floorId, $projectId);
        $action = (string) ($this->request()->input('action') ?? '');
        $userId = (int) $this->user()['id'];
        if ($action === 'disable') {
            Brigade::disable($floorId, $userId);
            Session::flash('success', 'El enlace del modo brigadista quedó desactivado. El plano no se puede abrir con ese enlace.');
        } elseif ($action === 'regenerate') {
            Brigade::enable($floorId, $userId, true);
            Session::flash('success', 'Enlace regenerado. El enlace anterior dejó de funcionar; comparte el nuevo.');
        } else {
            Brigade::enable($floorId, $userId, false);
            Session::flash('success', 'Enlace del modo brigadista activo. Compártelo con la brigada de emergencias.');
        }
        Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/brigade'));
    }

    /** Página pública (sin sesión) con el plano del piso. */
    public function publicPage(string $token): void
    {
        $link = $this->activeLink($token);
        $design = DesignValidator::normalizeJson((string) $link['design_json']);
        $meta = $this->meta($link);
        $svg = SvgExporter::render($design, $meta, false);
        $groups = self::groups($design);
        $boot = [
            'token' => $link['token'],
            'updatedAt' => (string) $link['floor_updated_at'],
            'updatedLabel' => short_date((string) $link['floor_updated_at']),
            'groups' => $groups,
            'counts' => array_map(static fn (array $ids): int => count($ids), $groups),
            'dataUrl' => url('b/' . $link['token'] . '/plan.json'),
            'swUrl' => url('b/' . $link['token'] . '/brigade-sw.js'),
        ];
        header('Cache-Control: no-store, max-age=0');
        header('X-Robots-Tag: noindex, nofollow');
        View::render('brigade/public', [
            'title' => $link['project_name'] . ' · ' . $link['floor_name'],
            'link' => $link,
            'svg' => $svg,
            'boot' => $boot,
            'updatedLabel' => short_date((string) $link['floor_updated_at']),
        ], null);
    }

    /** Datos del plan para sincronizar la copia guardada en el celular. */
    public function publicData(string $token): void
    {
        $link = $this->activeLink($token);
        $design = DesignValidator::normalizeJson((string) $link['design_json']);
        header('Cache-Control: no-store, max-age=0');
        header('X-Robots-Tag: noindex, nofollow');
        Response::json([
            'ok' => true,
            'application' => 'normia-planos-cad',
            'version' => NORMA_VERSION,
            'project' => [
                'name' => $link['project_name'],
                'site' => $link['project_site'],
                'workplace' => $link['project_workplace'],
            ],
            'floor' => [
                'name' => $link['floor_name'],
                'level' => $link['floor_level'],
            ],
            'updated_at' => $link['floor_updated_at'],
            'updated_label' => short_date((string) $link['floor_updated_at']),
            'groups' => self::groups($design),
            'scale' => $design['canvas']['scale'],
            'unit' => $design['canvas']['unit'],
        ]);
    }

    /**
     * Service worker del modo brigadista. Se sirve por PHP para que viva en la
     * raíz del sitio y pueda cachear la página pública completa (sin CDN ni
     * dependencias externas).
     */
    public function serviceWorker(): void
    {
        $file = BASE_PATH . '/assets/js/brigade-sw.js';
        header('Content-Type: application/javascript; charset=UTF-8');
        header('Cache-Control: no-store, max-age=0');
        header('Service-Worker-Allowed: /');
        echo is_file($file) ? (string) file_get_contents($file) : '/* sin service worker */';
    }

    /** @return array<string,string> */
    private function meta(array $link): array
    {
        return [
            'project_name' => (string) $link['project_name'],
            'project_site' => (string) $link['project_site'],
            'project_workplace' => (string) $link['project_workplace'],
            'project_responsible' => (string) $link['project_responsible'],
            'floor_name' => (string) $link['floor_name'],
            'floor_level' => (string) $link['floor_level'],
            'version' => (int) $link['floor_version'],
        ];
    }

    private function activeLink(string $token): array
    {
        $link = Brigade::findByToken($token);
        if ($link === null || (int) $link['enabled'] !== 1) {
            http_response_code(404);
            View::render('brigade/not-found', ['title' => 'Enlace no disponible'], null);
            exit;
        }
        return $link;
    }

    /**
     * Ids de los elementos por acción rápida. La página los usa para atenuar el
     * resto del plano sin tocar el SVG exportado.
     *
     * @return array{ruta:list<string>,reunion:list<string>,extintores:list<string>}
     */
    private static function groups(array $design): array
    {
        $groups = ['ruta' => [], 'reunion' => [], 'extintores' => []];
        foreach ($design['elements'] as $element) {
            $type = (string) ($element['type'] ?? '');
            $id = (string) ($element['id'] ?? '');
            if ($id === '') {
                continue;
            }
            if ($type === 'route' || ($type === 'door' || $type === 'door_double' || $type === 'door_garage')) {
                if ($type === 'route' || !empty($element['isExit'])) {
                    $groups['ruta'][] = $id;
                }
                continue;
            }
            if ($type === 'cad_emg_muster') {
                $groups['reunion'][] = $id;
                continue;
            }
            if (in_array($type, self::EXTINGUISHERS, true)) {
                $groups['extintores'][] = $id;
            }
        }
        return $groups;
    }
}
