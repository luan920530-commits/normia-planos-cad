<?php
declare(strict_types=1);

namespace App\Services;

final class DesignFactory
{
    public static function blank(array $canvas = []): array
    {
        $width = (int) ($canvas['width'] ?? 1200);
        $height = (int) ($canvas['height'] ?? 800);
        $grid = (int) ($canvas['grid'] ?? 20);
        $unit = (string) ($canvas['unit'] ?? 'cm');
        $scale = (string) ($canvas['scale'] ?? '1:100');
        return [
            'format' => 2,
            'canvas' => [
                'width' => max(400, min(4000, $width)),
                'height' => max(300, min(3000, $height)),
                'grid' => max(5, min(100, $grid)),
                'unit' => in_array($unit, ['cm', 'm', 'mm'], true) ? $unit : 'cm',
                'scale' => preg_match('/^1:\d{1,5}$/D', $scale) === 1 ? $scale : '1:100',
                'background' => '#ffffff',
            ],
            'layers' => [[
                'id' => 'capa_planta',
                'name' => 'Planta',
                'visible' => true,
                'locked' => false,
            ]],
            'elements' => [],
            'groups' => [],
        ];
    }
}
