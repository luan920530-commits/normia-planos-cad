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
        $colors = LibraryRepository::SIGN_COLORS;
        foreach ($categories as $key => $category) {
            // Las familias de los complementos traen su propio color: se respeta
            // en vez de caer al gris de «sin familia».
            $color = LibraryRepository::colorForCategory((string) $key) ?? '#334155';
            $categories[$key]['color'] = $color;
            $colors[$key] = $color;
        }
        $aliases = LibraryRepository::aliases();
        $signs = LibraryRepository::signs();
        $serviceCount = 0;
        $pluginCount = 0;
        $isoCount = 0;
        $search = $aliases['search'] ?? [];
        foreach ($signs as $code => $sign) {
            $code = (string) $code;
            $own = str_starts_with($code, LibraryRepository::SERVICE_PREFIX)
                || str_starts_with($code, LibraryRepository::PLUGIN_PREFIX);
            if (str_starts_with($code, LibraryRepository::SERVICE_PREFIX)) {
                $serviceCount++;
            } elseif (str_starts_with($code, LibraryRepository::PLUGIN_PREFIX)) {
                $pluginCount++;
            } else {
                $isoCount++;
            }
            // Los sinónimos propios de las señales de servicio y de los
            // complementos también alimentan la búsqueda de la biblioteca.
            if ($own && ($sign['aliases'] ?? []) !== []) {
                $search[$code] = array_values(array_unique(array_merge($search[$code] ?? [], $sign['aliases'])));
            }
        }
        Response::json([
            'ok' => true,
            'standard' => 'ISO 7010',
            'count' => count($signs),
            'isoCount' => $isoCount,
            'serviceCount' => $serviceCount,
            'pluginCount' => $pluginCount,
            'categories' => $categories,
            'colors' => $colors,
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

    /**
     * Catálogo técnico de redes. Son valores de referencia configurables:
     * la interfaz y la documentación lo repiten para no sugerir certificación.
     */
    public function mep(): void
    {
        $mep = LibraryRepository::mep();
        Response::json([
            'ok' => true,
            'hydraulic' => LibraryRepository::networks(),
            'diameters' => LibraryRepository::diameters(),
            'materials' => LibraryRepository::materials(),
            'slopes' => $mep['slopes'] ?? [],
            'electrical' => LibraryRepository::electrical(),
            'notice' => (string) ($mep['notice'] ?? ''),
        ]);
    }
}
