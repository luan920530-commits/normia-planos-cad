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
        Response::json([
            'ok' => true,
            'standard' => 'ISO 7010',
            'count' => count(LibraryRepository::signs()),
            'categories' => $categories,
            'colors' => LibraryRepository::SIGN_COLORS,
            'signs' => LibraryRepository::signs(),
            'aliases' => $aliases['search'] ?? [],
            'legacyTools' => $aliases['legacyTools'] ?? [],
            'attribution' => 'Pictogramas ISO 7010 locales. Licencia MIT de @iso-safety-signs/core © Karl Norling; consulta el NOTICE de Wikimedia Commons.',
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
