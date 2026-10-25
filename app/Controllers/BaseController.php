<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\View;
use App\Models\Floor;
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
