<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Models\Project;
use App\Services\LibraryRepository;

final class DashboardController extends BaseController
{
    public function index(): void
    {
        $user = $this->user();
        $projects = Project::allForUser((int) $user['id']);
        $this->render('dashboard', [
            'title' => 'Mis planos',
            'projects' => $projects,
            'stats' => Project::stats((int) $user['id']),
            'catalog' => LibraryRepository::counts(),
        ]);
    }
}
