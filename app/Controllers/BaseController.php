<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\View;
use App\Models\Floor;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\Project;

abstract class BaseController
{
    protected function user(): array
    {
        $user = Auth::user();
        if ($user === null) {
            throw new \RuntimeException('Autenticación requerida.');
        }
        return $user;
    }

    protected function project(int $projectId): array
    {
        $user = $this->user();
        $project = Project::findForUser($projectId, (int) $user['id']);
        if ($project === null) {
            throw new \DomainException('El proyecto no existe o no tienes acceso.');
        }
        return $project;
    }

    protected function floor(int $floorId, ?int $projectId = null): array
    {
        $user = $this->user();
        $floor = $projectId === null
            ? Floor::findForUser($floorId, (int) $user['id'])
            : Floor::findForProjectUser($floorId, $projectId, (int) $user['id']);
        if ($floor === null) {
            throw new \DomainException('El piso no existe o no tienes acceso.');
        }
        return $floor;
    }

    /** Empresa visible para la persona, con su rol. */
    protected function organization(int $organizationId): array
    {
        $user = $this->user();
        $organization = Organization::findForUser($organizationId, (int) $user['id']);
        if ($organization === null) {
            throw new \DomainException('La empresa no existe o no tienes acceso.');
        }
        return $organization;
    }

    /**
     * La cuenta que instaló la aplicación. Los respaldos completos incluyen los
     * datos de **todas** las empresas, así que no pueden quedar al alcance de un
     * propietario de empresa: solo de la administración de la instalación.
     */
    protected function requireInstanceAdmin(string $message): array
    {
        $user = $this->user();
        if ((int) ($user['is_admin'] ?? 0) !== 1) {
            throw new \DomainException($message);
        }
        return $user;
    }

    /** Detiene la acción cuando el rol de la empresa no alcanza. */
    protected function requireCapability(array $row, string $capability, string $message): void
    {
        if (!Membership::can($row['role'] ?? null, $capability)) {
            throw new \DomainException($message);
        }
    }

    /** @param array<string,mixed> $data */
    protected function render(string $view, array $data = [], ?string $layout = 'layout'): void
    {
        View::render($view, $data + ['user' => $this->user()], $layout);
    }

    protected function request(): Request
    {
        return new Request();
    }
}
