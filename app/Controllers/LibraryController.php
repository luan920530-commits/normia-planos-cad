<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Services\LibraryRepository;

final class LibraryController extends BaseController
{
    public function signs(): void
    {
        $categories = LibraryRepository::signCategories();
        foreach ($categories as $key => $category) {
            $categories[$key]['color'] = LibraryRepository::SIGN_COLORS[$key] ?? '#334155';
        }
        $aliases = LibraryRepository::aliases();
        $signs = LibraryRepository::signs();
        $serviceCount = 0;
        $search = $aliases['search'] ?? [];
        foreach ($signs as $code => $sign) {
            if (str_starts_with((string) $code, LibraryRepository::SERVICE_PREFIX)) {
                $serviceCount++;
                // Los alias propios de cada señal de servicio también alimentan la búsqueda.
                $search[$code] = array_values(array_unique(array_merge($search[$code] ?? [], $sign['aliases'] ?? [])));
            }
        }
        Response::json([
            'ok' => true,
            'standard' => 'ISO 7010',
            'count' => count($signs),
            'isoCount' => count($signs) - $serviceCount,
            'serviceCount' => $serviceCount,
            'categories' => $categories,
            'colors' => LibraryRepository::SIGN_COLORS,
            'signs' => $signs,
            'aliases' => $search,
            'legacyTools' => $aliases['legacyTools'] ?? [],
            'attribution' => 'Pictogramas ISO 7010 locales (licencia MIT de @iso-safety-signs/core © Karl Norling; atribución de Wikimedia Commons en NOTICE) y señales de orientación propias de Normia (GPL-3.0).',
        ]);
    }

    public function cad(): void
    {
        Response::json([
            'ok' => true,
            'count' => count(LibraryRepository::cad()),
            'categories' => LibraryRepository::cadCategories(),
            'objects' => LibraryRepository::cad(),
            'attribution' => 'Objetos CAD esquemáticos de Normia. Verifica dimensiones y escala en sitio.',
        ]);
    }
}
