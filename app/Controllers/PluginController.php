<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Services\LibraryRepository;
use App\Services\PluginManager;

/**
 * Pantalla de complementos: instalar, activar, desactivar, eliminar y leer el
 * manual. Cualquier cuenta con sesión puede hacerlo; el complemento es del
 * equipo, no de un proyecto.
 */
final class PluginController extends BaseController
{
    public function index(): void
    {
        $this->render('plugins/index', [
            'title' => 'Complementos',
            'bodyClass' => 'page-plugins',
            'plugins' => PluginManager::all(),
            'apiVersion' => PluginManager::API_VERSION,
            'maxBytes' => PluginManager::MAX_BYTES,
            'baseCounts' => LibraryRepository::counts(),
        ]);
    }

    public function install(): void
    {
        $request = new Request();
        $file = $request->file('plugin_file');
        if ($file === null) {
            flash_error('Selecciona el archivo del complemento (plugin.json o un .zip con plugin.json).');
            Response::redirect(url('plugins#instalar'));
        }
        try {
            $result = PluginManager::install($file);
            $resumen = [];
            if ($result['signs'] > 0) {
                $resumen[] = $result['signs'] . ($result['signs'] === 1 ? ' señal' : ' señales');
            }
            if ($result['cad'] > 0) {
                $resumen[] = $result['cad'] . ($result['cad'] === 1 ? ' objeto CAD' : ' objetos CAD');
            }
            flash_success(
                ($result['updated'] ? 'Complemento actualizado: ' : 'Complemento instalado: ')
                . $result['name'] . ' · ' . implode(' y ', $resumen) . '. Ya está activo en el editor.'
            );
        } catch (\DomainException $exception) {
            flash_error('No se instaló el complemento. ' . $exception->getMessage());
        } catch (\Throwable $exception) {
            error_log('Normia: complemento rechazado: ' . $exception->getMessage());
            flash_error('No se instaló el complemento. Revisa el archivo y vuelve a intentarlo.');
        }
        Response::redirect(url('plugins'));
    }

    public function toggle(string $id): void
    {
        $enable = (new Request())->string('estado') === 'activar';
        try {
            PluginManager::toggle($id, $enable);
            flash_success($enable ? 'Complemento activado. Sus señales y equipos vuelven al editor.' : 'Complemento desactivado. Sus elementos dejan de ofrecerse, pero los planos que ya los usan se conservan.');
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
        }
        Response::redirect(url('plugins'));
    }

    public function destroy(string $id): void
    {
        try {
            $plugin = PluginManager::find($id);
            PluginManager::remove($id);
            flash_success('Complemento eliminado' . ($plugin !== null ? ': ' . $plugin['name'] : '') . '. Los planos guardados no se modifican.');
        } catch (\DomainException $exception) {
            flash_error($exception->getMessage());
        }
        Response::redirect(url('plugins'));
    }

    /** Manual para quien quiera crear un complemento. */
    public function manual(): void
    {
        $this->render('plugins/manual', [
            'title' => 'Crear un complemento',
            'bodyClass' => 'page-plugins-manual',
            'apiVersion' => PluginManager::API_VERSION,
            'maxBytes' => PluginManager::MAX_BYTES,
            'maxItems' => PluginManager::MAX_ITEMS,
            'signCategories' => LibraryRepository::signCategories(),
            'baseCounts' => LibraryRepository::counts(),
        ], 'layout');
    }

    /** Descarga del manifiesto de ejemplo (se abre como archivo). */
    public function template(string $kind = 'senalizacion'): void
    {
        $kind = $kind === 'cad' ? 'cad' : 'senalizacion';
        $name = $kind === 'cad' ? 'equipamiento.plugin.json' : 'senalizacion.plugin.json';
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('X-Content-Type-Options: nosniff');
        echo PluginManager::example($kind);
        exit;
    }
}
