<?php
declare(strict_types=1);

namespace App\Core;

use App\Controllers\AccountController;
use App\Controllers\AuthController;
use App\Controllers\DashboardController;
use App\Controllers\EditorController;
use App\Controllers\ExportController;
use App\Controllers\FloorApiController;
use App\Controllers\InstallController;
use App\Controllers\LibraryController;
use App\Controllers\ProjectController;
use Throwable;

final class Application
{
    public static function run(): void
    {
        self::securityHeaders();
        Session::start();
        $request = new Request();
        $route = $request->route();
        $installed = Config::isInstalled();
        $isApi = str_starts_with($route, 'api/');

        try {
            if (!$installed) {
                if ($route !== 'install') {
                    Response::redirect(url('install'));
                }
                self::dispatchInstaller($request);
                return;
            }

            if ($route === 'install') {
                Response::redirect(Auth::check() ? url('') : url('login'));
            }

            if ($request->isPost() && !Csrf::check($request->csrfToken())) {
                if ($isApi || $request->wantsJson()) {
                    Response::json(['ok' => false, 'message' => 'La sesión o el token de seguridad expiraron. Recarga la página e inténtalo de nuevo.', 'code' => 'csrf'], 419);
                }
                self::renderError(419, 'La sesión o el token de seguridad expiraron. Recarga la página e inténtalo de nuevo.');
                return;
            }

            $public = in_array($route, ['login'], true);
            if (!$public && !Auth::check()) {
                if ($isApi || $request->wantsJson()) {
                    Response::json(['ok' => false, 'message' => 'La sesión expiró. Inicia sesión nuevamente.', 'code' => 'unauthenticated'], 401);
                }
                Response::redirect(url('login'));
            }

            if ($route === 'login' && Auth::check()) {
                Response::redirect(url(''));
            }

            self::dispatch($request, $route);
        } catch (ValidationException $exception) {
            if ($isApi || $request->wantsJson()) {
                Response::json(['ok' => false, 'message' => $exception->getMessage(), 'errors' => $exception->errors(), 'code' => 'validation'], 422);
            }
            self::renderError(422, $exception->getMessage());
        } catch (\DomainException $exception) {
            if ($isApi || $request->wantsJson()) {
                Response::json(['ok' => false, 'message' => $exception->getMessage(), 'code' => 'invalid'], 422);
            }
            self::renderError(422, $exception->getMessage());
        } catch (Throwable $exception) {
            error_log('Normia: ' . $exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine());
            @file_put_contents(BASE_PATH . '/storage/last-error.log', $exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine() . "\n" . $exception->getTraceAsString());
            if ($isApi || $request->wantsJson()) {
                Response::json(['ok' => false, 'message' => 'No se pudo completar la operación. Inténtalo de nuevo.', 'code' => 'server'], 500);
            }
            self::renderError(500, 'No se pudo completar la operación. Revisa la configuración del servidor e inténtalo de nuevo.');
        }
    }

    private static function dispatch(Request $request, string $route): void
    {
        $router = self::router();
        if (!$router->dispatch($request)) {
            self::renderError(404, 'La página que buscas no existe.');
        }
    }

    public static function router(): Router
    {
        $router = new Router();

        // Instalación
        $router->get('install', static fn () => (new InstallController())->show());
        $router->post('install', static fn () => (new InstallController())->install());

        // Autenticación
        $router->get('login', static fn () => (new AuthController())->showLogin());
        $router->post('login', static fn () => (new AuthController())->login());
        $router->post('logout', static fn () => (new AuthController())->logout());

        // Panel y proyectos
        $router->get('', static fn () => (new DashboardController())->index());
        $router->get('projects/new', static fn () => (new ProjectController())->create());
        $router->post('projects', static fn () => (new ProjectController())->store());
        $router->get('projects/{id}', static fn (array $p) => (new ProjectController())->show($p['id']));
        $router->get('projects/{id}/edit', static fn (array $p) => (new ProjectController())->edit($p['id']));
        $router->post('projects/{id}', static fn (array $p) => (new ProjectController())->update($p['id']));
        $router->post('projects/{id}/duplicate', static fn (array $p) => (new ProjectController())->duplicate($p['id']));
        $router->post('projects/{id}/delete', static fn (array $p) => (new ProjectController())->delete($p['id']));
        $router->post('projects/{id}/floors', static fn (array $p) => (new ProjectController())->storeFloor($p['id']));
        $router->post('projects/{id}/floors/{floorId}/duplicate', static fn (array $p) => (new ProjectController())->duplicateFloor($p['id'], $p['floorId']));
        $router->post('projects/{id}/floors/{floorId}/delete', static fn (array $p) => (new ProjectController())->deleteFloor($p['id'], $p['floorId']));
        $router->post('projects/{id}/import', static fn (array $p) => (new ProjectController())->import($p['id']));

        // Editor y API
        $router->get('projects/{id}/floors/{floorId}/editor', static fn (array $p) => (new EditorController())->show($p['id'], $p['floorId']));
        $router->get('api/floors/{id}', static fn (array $p) => (new FloorApiController())->show($p['id']));
        $router->post('api/floors/{id}/save', static fn (array $p) => (new FloorApiController())->save($p['id']));
        $router->post('api/floors/{id}/autosave', static fn (array $p) => (new FloorApiController())->autosave($p['id']));
        $router->post('api/floors/{id}/discard-draft', static fn (array $p) => (new FloorApiController())->discardDraft($p['id']));
        $router->get('api/floors/{id}/versions', static fn (array $p) => (new FloorApiController())->versions($p['id']));
        $router->post('api/floors/{id}/versions/{versionId}/restore', static fn (array $p) => (new FloorApiController())->restore($p['id'], $p['versionId']));
        $router->post('api/floors/{id}/settings', static fn (array $p) => (new FloorApiController())->settings($p['id']));

        // Exportación, impresión y catálogos
        $router->get('projects/{id}/floors/{floorId}/export/svg', static fn (array $p) => (new ExportController())->svg($p['id'], $p['floorId']));
        $router->get('projects/{id}/floors/{floorId}/export/json', static fn (array $p) => (new ExportController())->json($p['id'], $p['floorId']));
        $router->get('projects/{id}/floors/{floorId}/print', static fn (array $p) => (new ExportController())->print($p['id'], $p['floorId']));
        $router->get('projects/{id}/floors/{floorId}/preview.svg', static fn (array $p) => (new ExportController())->preview($p['id'], $p['floorId']));
        $router->get('catalogs/signs', static fn () => (new LibraryController())->signs());
        $router->get('catalogs/cad', static fn () => (new LibraryController())->cad());
        $router->get('catalogs/mep', static fn () => (new LibraryController())->mep());
        $router->get('api/floors/{id}/mep', static fn (array $p) => (new FloorApiController())->mep($p['id']));
        $router->get('api/floors/{id}/audit', static fn (array $p) => (new FloorApiController())->audit($p['id']));
        $router->get('projects/{id}/floors/{floorId}/audit', static fn (array $p) => (new ExportController())->audit($p['id'], $p['floorId']));

        // Cuenta
        $router->get('account/password', static fn () => (new AccountController())->show());
        $router->post('account/password', static fn () => (new AccountController())->update());

        return $router;
    }

    private static function dispatchInstaller(Request $request): void
    {
        // CSRF también en instalación.
        if ($request->isPost() && !Csrf::check($request->csrfToken())) {
            self::renderError(419, 'La sesión expiró. Recarga el instalador e inténtalo de nuevo.');
            return;
        }
        $router = self::router();
        if (!$router->dispatch($request)) {
            self::renderError(404, 'La página que buscas no existe.');
        }
    }

    private static function renderError(int $status, string $message): void
    {
        http_response_code($status);
        try {
            View::render('errors/error', ['title' => 'Ocurrió un problema', 'status' => $status, 'message' => $message]);
        } catch (Throwable) {
            header('Content-Type: text/html; charset=UTF-8');
            echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Error</title><p>' . e($message) . '</p>';
        }
        exit;
    }

    private static function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header("Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'");
    }
}
