<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\VersionConflictException;
use App\Models\Floor;
use App\Services\DesignValidator;
use App\Services\LibraryRepository;
use App\Services\MepCalculator;

final class FloorApiController extends BaseController
{
    public function show(int $floorId): void
    {
        $floor = $this->floor($floorId);
        $preview = Floor::preview($floorId, (int) $this->user()['id']);
        if ($preview === null) {
            throw new \DomainException('El piso no existe o no tienes acceso.');
        }
        Response::json([
            'ok' => true,
            'floor' => [
                'id' => (int) $floor['id'],
                'name' => $floor['name'],
                'level' => $floor['level'],
                'version' => (int) $floor['version'],
                'draft' => $preview['draft'],
            ],
            'design' => $preview['design'],
        ]);
    }

    /**
     * Resumen de redes del último diseño guardado: longitudes, diámetros,
     * circuitos, cargas y caídas de tensión estimadas.
     */
    public function mep(int $floorId): void
    {
        $floor = $this->floor($floorId);
        $design = DesignValidator::normalizeJson((string) $floor['design_json']);
        Response::json([
            'ok' => true,
            'floor' => [
                'id' => (int) $floor['id'],
                'name' => $floor['name'],
                'version' => (int) $floor['version'],
            ],
            'summary' => MepCalculator::summary($design),
            'references' => [
                'hydraulic' => LibraryRepository::networks(),
                'diameters' => LibraryRepository::diameters(),
                'materials' => LibraryRepository::materials(),
                'electrical' => LibraryRepository::electrical(),
            ],
            'notice' => 'Resumen esquemático de referencia. No sustituye memoria de cálculo ni revisión profesional.',
        ]);
    }

    public function save(int $floorId): void
    {
        $request = new Request();
        $payload = $request->json();
        $design = $payload['design'] ?? null;
        $expected = $payload['expected_version'] ?? null;
        if (!is_array($design) || !is_int($expected) || $expected < 1) {
            throw new \DomainException('La solicitud de guardado no contiene un diseño o una versión válidos.');
        }
        $note = isset($payload['note']) && is_string($payload['note']) ? $payload['note'] : 'Guardado manual';
        try {
            $result = Floor::saveDesign($floorId, (int) $this->user()['id'], $design, $expected, $note);
            $result['ok'] = true;
            $result['message'] = 'Plano guardado como ' . version_label((int) $result['version']) . '.';
            unset($result['design']);
            Response::json($result);
        } catch (VersionConflictException $exception) {
            Response::json([
                'ok' => false,
                'code' => 'version_conflict',
                'message' => $exception->getMessage(),
                'current_version' => $exception->currentVersion(),
            ], 409);
        }
    }

    public function autosave(int $floorId): void
    {
        $request = new Request();
        $payload = $request->json();
        $design = $payload['design'] ?? null;
        $base = $payload['base_version'] ?? null;
        if (!is_array($design) || !is_int($base) || $base < 1) {
            throw new \DomainException('El borrador automático no es válido.');
        }
        try {
            $result = Floor::autosave($floorId, (int) $this->user()['id'], $design, $base);
            $result['ok'] = true;
            $result['message'] = 'Borrador guardado.';
            Response::json($result);
        } catch (VersionConflictException $exception) {
            Response::json([
                'ok' => false,
                'code' => 'version_conflict',
                'message' => $exception->getMessage(),
                'current_version' => $exception->currentVersion(),
            ], 409);
        }
    }

    public function discardDraft(int $floorId): void
    {
        Floor::discardDraft($floorId, (int) $this->user()['id']);
        Response::json(['ok' => true, 'message' => 'Borrador descartado.']);
    }

    public function versions(int $floorId): void
    {
        $floor = $this->floor($floorId);
        $versions = Floor::versions($floorId, (int) $this->user()['id']);
        $items = [];
        foreach ($versions as $version) {
            $items[] = [
                'id' => (int) $version['id'],
                'version' => (int) $version['version'],
                'note' => $version['note'],
                'created_at' => format_date($version['created_at'], 'd/m/Y H:i'),
                'created_by' => $version['created_by_name'] ?? 'Cuenta eliminada',
                'is_current' => (int) $version['version'] === (int) $floor['version'],
                'size' => strlen((string) $version['design_json']),
            ];
        }
        Response::json(['ok' => true, 'current_version' => (int) $floor['version'], 'versions' => $items]);
    }

    public function restore(int $floorId, int $versionId): void
    {
        $result = Floor::restoreVersion($floorId, $versionId, (int) $this->user()['id']);
        Response::json([
            'ok' => true,
            'message' => 'Versión restaurada como ' . version_label((int) $result['version']) . '.',
            'version' => (int) $result['version'],
        ]);
    }

    public function settings(int $floorId): void
    {
        $request = new Request();
        $payload = $request->json();
        $name = isset($payload['name']) && is_string($payload['name']) ? $payload['name'] : '';
        $level = isset($payload['level']) && is_string($payload['level']) ? $payload['level'] : '';
        Floor::updateMeta($floorId, (int) $this->user()['id'], $name, $level);
        Response::json(['ok' => true, 'message' => 'Datos del piso actualizados.', 'name' => trim($name), 'level' => trim($level)]);
    }
}
