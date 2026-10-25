<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Core\ValidationException;
use App\Models\Project;
use App\Services\DesignImporter;

final class ProjectController extends BaseController
{
    public function create(): void
    {
        $this->render('projects/form', [
            'title' => 'Nuevo proyecto',
            'project' => null,
            'errors' => [],
            'old' => [],
            'presets' => canvas_presets(),
        ]);
    }

    public function store(): void
    {
        $request = new Request();
        $user = $this->user();
        try {
            $projectId = Project::create((int) $user['id'], $request->all());
            flash_success('Proyecto creado. Ya puedes editar el plano.');
            Response::redirect(url('projects/' . $projectId));
        } catch (ValidationException $exception) {
            $this->render('projects/form', [
                'title' => 'Nuevo proyecto',
                'project' => null,
                'errors' => $exception->errors(),
                'old' => $request->all(),
                'presets' => canvas_presets(),
            ]);
        }
    }

    public function show(int $projectId): void
    {
        $project = $this->project($projectId);
        $floors = Project::floors($projectId, (int) $this->user()['id']);
        $this->render('projects/show', [
            'title' => $project['name'],
            'project' => $project,
            'floors' => $floors,
            'presets' => canvas_presets(),
        ]);
    }

    public function edit(int $projectId): void
    {
        $project = $this->project($projectId);
        $this->render('projects/form', [
            'title' => 'Editar proyecto',
            'project' => $project,
            'errors' => [],
            'old' => $project,
            'presets' => canvas_presets(),
        ]);
    }

    public function update(int $projectId): void
    {
        $request = new Request();
        $user = $this->user();
        $project = $this->project($projectId);
        try {
            Project::update($projectId, (int) $user['id'], $request->all());
            flash_success('Datos del proyecto actualizados.');
            Response::redirect(url('projects/' . $projectId));
        } catch (ValidationException $exception) {
            $this->render('projects/form', [
                'title' => 'Editar proyecto',
                'project' => $project,
                'errors' => $exception->errors(),
                'old' => array_merge($project, $request->all()),
                'presets' => canvas_presets(),
            ]);
        }
    }

    public function duplicate(int $projectId): void
    {
        $user = $this->user();
        try {
            $newId = Project::duplicate($projectId, (int) $user['id']);
            flash_success('Proyecto duplicado con sus pisos y el diseño actual.');
            Response::redirect(url('projects/' . $newId));
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
            Response::redirect(url(''));
        }
    }

    public function delete(int $projectId): void
    {
        $user = $this->user();
        try {
            Project::delete($projectId, (int) $user['id']);
            flash_success('Proyecto eliminado.');
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
        }
        Response::redirect(url(''));
    }

    public function storeFloor(int $projectId): void
    {
        $request = new Request();
        $user = $this->user();
        try {
            $floorId = Project::createFloor($projectId, (int) $user['id'], $request->all());
            flash_success('Piso añadido al proyecto.');
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/editor'));
        } catch (ValidationException $exception) {
            Session::flash('error', implode(' ', $exception->errors()));
            Session::flashInput($request->all());
            Response::redirect(url('projects/' . $projectId . '#pisos'));
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
            Response::redirect(url('projects/' . $projectId . '#pisos'));
        }
    }

    public function duplicateFloor(int $projectId, int $floorId): void
    {
        $user = $this->user();
        try {
            Project::duplicateFloor($projectId, $floorId, (int) $user['id']);
            flash_success('Piso duplicado.');
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
        }
        Response::redirect(url('projects/' . $projectId . '#pisos'));
    }

    public function deleteFloor(int $projectId, int $floorId): void
    {
        $user = $this->user();
        try {
            Project::deleteFloor($projectId, $floorId, (int) $user['id']);
            flash_success('Piso eliminado. Las versiones asociadas también se eliminaron.');
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
        }
        Response::redirect(url('projects/' . $projectId . '#pisos'));
    }

    public function import(int $projectId): void
    {
        $request = new Request();
        $user = $this->user();
        $project = $this->project($projectId);
        $file = $request->file('design_file');
        if ($file === null || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            flash_error('Selecciona un archivo JSON válido para importar.');
            Response::redirect(url('projects/' . $projectId . '#importar'));
        }
        if ((int) ($file['size'] ?? 0) > 2_500_000) {
            flash_error('El archivo supera el límite de 2,5 MB.');
            Response::redirect(url('projects/' . $projectId . '#importar'));
        }
        $contents = is_uploaded_file((string) $file['tmp_name']) ? file_get_contents((string) $file['tmp_name']) : false;
        if ($contents === false) {
            flash_error('No se pudo leer el archivo cargado.');
            Response::redirect(url('projects/' . $projectId . '#importar'));
        }
        try {
            $imported = DesignImporter::parse($contents);
            $floorName = trim((string) ($imported['floor']['name'] ?? ''));
            if ($floorName === '') {
                $floorName = 'Plano importado';
            }
            $level = (string) ($imported['floor']['level'] ?? '');
            $floorId = Project::createFloorFromDesign($projectId, (int) $user['id'], $imported['design'], $floorName, $level);
            $message = $imported['legacy']
                ? 'Diseño heredado importado y convertido al formato actual. Revisa colores, escalas y pictogramas antes de usarlo.'
                : 'Plano importado como un nuevo piso.';
            flash_success($message);
            Response::redirect(url('projects/' . $projectId . '/floors/' . $floorId . '/editor'));
        } catch (\DomainException $exception) {
            flash_error('La importación fue rechazada: ' . $exception->getMessage());
            Response::redirect(url('projects/' . $projectId . '#importar'));
        }
    }
}
