<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Core\Session;
use App\Models\Check;
use App\Services\DesignValidator;
use App\Services\VerificationInventory;

/**
 * Verificación física del plano: estado por elemento, rondas y cobertura.
 *
 * Todo queda en el servidor: la lista se puede recorrer desde el celular en
 * una ronda y cada verificación guarda fecha, responsable, nota y, si hace
 * falta, una foto pequeña como evidencia.
 */
final class VerificationController extends BaseController
{
    public function show(int $projectId, int $floorId): void
    {
        $project = $this->project($projectId);
        $floor = $this->floor($floorId, $projectId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $items = VerificationInventory::items($design);
        $latest = Check::latest($floorId);
        $staleDays = (int) ($floor['check_days'] ?? 30);
        $coverage = VerificationInventory::coverage($items, $latest, $staleDays);
        $filter = (string) ($this->request()->query('filtro') ?? 'todos');
        $allowed = ['todos', 'pendientes', 'novedad', 'vencidos'];
        if (!in_array($filter, $allowed, true)) {
            $filter = 'todos';
        }
        $limit = time() - max(1, $staleDays) * 86400;
        $rows = [];
        foreach ($items as $item) {
            $check = $latest[$item['id']] ?? null;
            $when = $check !== null ? strtotime((string) $check['checked_at'] . ' UTC') : false;
            $isStale = $when === false || $when < $limit;
            $status = $check !== null ? (string) $check['status'] : 'pending';
            $keep = match ($filter) {
                'pendientes' => $status === 'pending',
                'novedad' => $status === 'issue',
                'vencidos' => $isStale,
                default => true,
            };
            if (!$keep) {
                continue;
            }
            $rows[] = $item + [
                'status' => $status,
                'check' => $check,
                'stale' => $isStale,
            ];
        }
        usort($rows, static function (array $a, array $b): int {
            $order = ['issue' => 0, 'pending' => 1, 'ok' => 2];
            $compare = ($order[$a['status']] ?? 3) <=> ($order[$b['status']] ?? 3);
            return $compare !== 0 ? $compare : strcmp($a['name'], $b['name']);
        });
        $this->render('verifications/index', [
            'title' => 'Verificación física · ' . $floor['name'],
            'project' => $project,
            'floor' => $floor,
            'rows' => $rows,
            'coverage' => $coverage,
            'filter' => $filter,
            'openRound' => Check::openRound($floorId),
            'rounds' => Check::rounds($floorId),
            'latest' => $latest,
            'checksHistory' => $rows,
            'extraStyles' => ['css/verifications.css'],
            'extraScripts' => ['js/verifications.js'],
        ]);
    }

    /** Registro de una verificación (formulario normal o JSON desde el celular). */
    public function store(int $projectId, int $floorId): void
    {
        $this->project($projectId);
        $floor = $this->floor($floorId, $projectId);
        $request = $this->request();
        $userId = (int) $this->user()['id'];
        // El celular envía JSON y el formulario envía campos normales.
        $json = $request->json();
        $elementId = (string) ($json['element_id'] ?? $request->string('element_id'));
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        $item = null;
        foreach (VerificationInventory::items($design) as $candidate) {
            if ($candidate['id'] === $elementId) {
                $item = $candidate;
                break;
            }
        }
        if ($item === null) {
            if ($request->wantsJson()) {
                Response::json(['ok' => false, 'error' => 'El elemento no pertenece a este plano.'], 422);
            }
            Session::flash('error', 'Ese elemento no pertenece al plano del piso.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/verifications'));
        }
        $status = (string) ($json['status'] ?? $request->string('status'));
        if (!in_array($status, Check::STATUSES, true)) {
            if ($request->wantsJson()) {
                Response::json(['ok' => false, 'error' => 'Estado no válido.'], 422);
            }
            Session::flash('error', 'Elige un estado válido: Pendiente, Verificado o Con novedad.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/verifications'));
        }
        $note = (string) ($json['note'] ?? $request->string('note'));
        if ($status === 'issue' && trim($note) === '') {
            if ($request->wantsJson()) {
                Response::json(['ok' => false, 'error' => 'Describe la novedad encontrada.'], 422);
            }
            Session::flash('error', 'Para marcar «Con novedad» describe qué encontraste.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/verifications'));
        }
        $photo = $request->file('photo');
        $checkId = Check::record($floorId, $userId, $elementId, [
            'status' => $status,
            'note' => $note,
            'element_type' => $item['type'],
            'sector' => $item['sector'],
            'photo' => $photo,
        ]);
        $label = Check::LABELS[$status];
        if ($request->wantsJson()) {
            Response::json([
                'ok' => true,
                'check' => [
                    'id' => $checkId,
                    'element_id' => $elementId,
                    'status' => $status,
                    'label' => $label,
                    'note' => trim($note),
                    'author' => (string) $this->user()['name'],
                    'checked_at' => date('Y-m-d H:i:s'),
                    'has_photo' => $photo !== null && (int) ($photo['size'] ?? 0) > 0,
                ],
            ]);
        }
        Session::flash('success', $item['name'] . ': ' . $label . '.');
        Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/verifications'));
    }

    public function round(int $projectId, int $floorId): void
    {
        $this->project($projectId);
        $this->floor($floorId, $projectId);
        $userId = (int) $this->user()['id'];
        $action = $this->request()->string('action');
        if ($action === 'close') {
            $roundId = (int) $this->request()->integer('round_id');
            if (Check::closeRound($floorId, $userId, $roundId)) {
                Session::flash('success', 'Ronda cerrada. Quedó en el historial con quién la hizo y qué encontró.');
            } else {
                Session::flash('error', 'La ronda ya estaba cerrada o no existe.');
            }
        } else {
            Check::startRound($floorId, $userId, $this->request()->string('note'));
            Session::flash('success', 'Ronda abierta. Cada verificación que registres quedará en esta ronda.');
        }
        Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/verifications'));
    }

    public function settings(int $projectId, int $floorId): void
    {
        $this->project($projectId);
        $this->floor($floorId, $projectId);
        $days = Check::setStaleDays($floorId, $this->request()->integer('check_days', 30));
        Session::flash('success', 'Se avisará cuando un elemento lleve más de ' . $days . ' días sin verificación.');
        Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/verifications'));
    }

    /** Foto de evidencia: solo para la cuenta dueña del plano. */
    public function photo(int $projectId, int $floorId, int $checkId): void
    {
        $this->project($projectId);
        $this->floor($floorId, $projectId);
        $photo = Check::photo($floorId, $checkId, (int) $this->user()['id']);
        if ($photo === null) {
            http_response_code(404);
            echo 'Sin foto de evidencia.';
            return;
        }
        $type = (string) ($photo['photo_type'] ?: 'image/jpeg');
        header('Content-Type: ' . $type);
        header('Content-Length: ' . (string) strlen((string) $photo['bytes']));
        header('Content-Disposition: inline; filename="' . rawurlencode((string) ($photo['photo_name'] ?: 'evidencia.jpg')) . '"');
        header('Cache-Control: private, max-age=60');
        echo (string) $photo['bytes'];
    }
}
