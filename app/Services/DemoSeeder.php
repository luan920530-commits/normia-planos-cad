<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use RuntimeException;

final class DemoSeeder
{
    private string $basePath;

    public function __construct(string $basePath)
    {
        $this->basePath = rtrim($basePath, '/');
    }

    public function seed(int $userId): void
    {
        $file = $this->basePath . '/resources/demo/demo-project.json';
        if (!is_file($file)) {
            return;
        }
        $raw = file_get_contents($file);
        $data = $raw !== false ? json_decode($raw, true, 32) : null;
        if (!is_array($data) || !isset($data['project'], $data['floors']) || !is_array($data['floors']) || $data['floors'] === []) {
            throw new RuntimeException('El proyecto de demostración no es válido.');
        }
        $project = $data['project'];
        Database::transaction(function () use ($project, $data, $userId): void {
            Database::execute(
                'INSERT INTO projects (user_id, name, site, workplace, responsible, notes) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    $userId,
                    text_limit((string) ($project['name'] ?? 'Proyecto de demostración'), 120),
                    text_limit((string) ($project['site'] ?? ''), 120),
                    text_limit((string) ($project['workplace'] ?? ''), 120),
                    text_limit((string) ($project['responsible'] ?? ''), 120),
                    text_limit((string) ($project['notes'] ?? ''), 1000),
                ]
            );
            $projectId = Database::lastId();
            $order = 0;
            foreach ($data['floors'] as $floor) {
                if (!is_array($floor) || !isset($floor['design']) || !is_array($floor['design'])) {
                    throw new RuntimeException('Un piso de demostración no es válido.');
                }
                $order++;
                $design = DesignValidator::normalizeArray($floor['design']);
                $json = json_encode($design, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                Database::execute(
                    'INSERT INTO floors (project_id, name, level, sort_order, design_json, version) VALUES (?, ?, ?, ?, ?, 1)',
                    [
                        $projectId,
                        text_limit((string) ($floor['name'] ?? 'Piso ' . $order), 80),
                        text_limit((string) ($floor['level'] ?? (string) $order), 40),
                        $order,
                        $json,
                    ]
                );
                $floorId = Database::lastId();
                Database::execute(
                    'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by) VALUES (?, 1, ?, ?, ?)',
                    [$floorId, $json, 'Piso de demostración', $userId]
                );
            }
        });
    }
}
