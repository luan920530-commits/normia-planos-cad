<?php
declare(strict_types=1);

namespace App\Core;

use App\Controllers\AccountController;
use App\Controllers\AuthController;
use App\Controllers\BackupController;
use App\Controllers\BrigadeController;
use App\Controllers\VerificationController;
use App\Controllers\DashboardController;
use App\Controllers\HomeController;
use App\Controllers\EditorController;
use App\Controllers\ExportController;
use App\Controllers\FloorApiController;
use App\Controllers\InstallController;
use App\Controllers\LibraryController;
use App\Controllers\OrganizationController;
use App\Controllers\PluginController;
use App\Controllers\ProjectController;
use App\Controllers\RetentionController;
use App\Controllers\StudyController;
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
            // Modo estudio y catálogos: no necesitan instalación, ni cuenta, ni
            // base de datos. Es la edición de escritorio «solo editor», donde el
            // plano es un archivo y PHP solo calcula el auditor y los documentos.
            if (self::runsWithoutDatabase($route)) {
                if ($request->isPost() && !Csrf::check($request->csrfToken())) {
                    Response::json(['ok' => false, 'message' => 'La sesión o el token de seguridad expiraron. Recarga la página e inténtalo de nuevo.', 'code' => 'csrf'], 419);
                    return;
                }
                self::dispatch($request, $route);
                return;
            }

            if (!$installed) {
                if ($route !== 'install') {
                    Response::redirect(url('install'));
                }
                self::dispatchInstaller($request);
                return;
            }

            // Esquema al día (tabla del modo brigadista en instalaciones previas).
            Database::migrate();

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

            $public = in_array($route, ['login', 'inicio'], true)
                || preg_match('#^b/[^/]+(/plan\.json|/brigade-sw\.js)?$#D', $route) === 1;
            if (!$public && !Auth::check()) {
                if ($isApi || $request->wantsJson()) {
                    Response::json(['ok' => false, 'message' => 'La sesión expiró. Inicia sesión nuevamente.', 'code' => 'unauthenticated'], 401);
                }
                // La raíz sin sesión es la presentación pública. Cualquier otra
                // dirección sigue llevando al formulario de acceso.
                if ($route === '') {
                    (new HomeController())->index();
                    return;
                }
                Response::redirect(url('login'));
            }

            if ($route === 'login' && Auth::check()) {
                Response::redirect(url(''));
            }

            self::dispatch($request, $route);
        } catch (HttpException $exception) {
            // Cuerpo vacío, JSON ilegible o demasiado grande: cada uno con su
            // estado, para que el editor pueda decir qué pasó de verdad.
            if ($isApi || $request->wantsJson()) {
                Response::json([
                    'ok' => false,
                    'message' => $exception->getMessage(),
                    'code' => $exception->errorCode(),
                ], $exception->status());
            }
            self::renderError($exception->status(), $exception->getMessage());
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
        } catch (SchemaException $exception) {
            // Migración de esquema detenida: la aplicación no puede seguir
            // fingiendo que sus tablas son las que espera.
            error_log('Normia: esquema detenido: ' . $exception->getMessage());
            @file_put_contents(Paths::storage() . '/last-error.log', 'ESQUEMA: ' . $exception->getMessage() . "\n");
            if ($isApi || $request->wantsJson()) {
                Response::json(['ok' => false, 'message' => 'La base de datos no pudo actualizarse. No se modificó nada.', 'code' => 'schema'], 503);
            }
            self::renderError(500, 'La base de datos no pudo actualizarse a la versión que esta aplicación necesita. '
                . 'No se modificó ningún dato. Haz una copia de storage/ y revisa el archivo storage/last-error.log '
                . 'antes de volver a intentarlo. Detalle: ' . $exception->getMessage());
        } catch (Throwable $exception) {
            error_log('Normia: ' . $exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine());
            @file_put_contents(Paths::storage() . '/last-error.log', $exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine() . "\n" . $exception->getTraceAsString());
            if ($isApi || $request->wantsJson()) {
                Response::json(['ok' => false, 'message' => 'No se pudo completar la operación. Inténtalo de nuevo.', 'code' => 'server'], 500);
            }
            self::renderError(500, 'No se pudo completar la operación. Revisa la configuración del servidor e inténtalo de nuevo.');
        }
    }

    /**
     * Rutas que funcionan sin instalación ni sesión: el modo estudio y los
     * catálogos de solo lectura. Sin esto, la edición de escritorio pediría
     * instalar una base de datos antes de abrir el lienzo.
     */
    private static function runsWithoutDatabase(string $route): bool
    {
        return $route === 'estudio'
            || str_starts_with($route, 'estudio/')
            || in_array($route, ['catalogs/signs', 'catalogs/cad', 'catalogs/mep'], true);
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

        // Modo estudio: el editor suelto, sin cuentas ni base de datos. El plano
        // es un archivo del equipo; estas rutas solo calculan y sirven documentos.
        $router->get('estudio', static fn () => (new StudyController())->show());
        $router->get('estudio/plano', static fn () => (new StudyController())->plano());
        $router->post('estudio/plano', static fn () => (new StudyController())->plano());
        $router->post('estudio/nombre', static fn () => (new StudyController())->nombre());
        $router->get('estudio/auditoria', static fn () => (new StudyController())->auditoria());
        $router->post('estudio/auditoria', static fn () => (new StudyController())->auditoria());
        $router->get('estudio/informe', static fn () => (new StudyController())->informe());
        $router->get('estudio/imprimir', static fn () => (new StudyController())->imprimir());
        $router->get('estudio/export/svg', static fn () => (new StudyController())->svg());
        $router->get('estudio/export/json', static fn () => (new StudyController())->json());

        // Instalación
        $router->get('install', static fn () => (new InstallController())->show());
        $router->post('install', static fn () => (new InstallController())->install());

        // Autenticación
        $router->get('login', static fn () => (new AuthController())->showLogin());
        $router->post('login', static fn () => (new AuthController())->login());
        $router->post('logout', static fn () => (new AuthController())->logout());

        // Presentación pública (portada para quien no ha entrado)
        $router->get('inicio', static fn () => (new HomeController())->index());

        // Empresas (organizaciones) y personas con rol.
        $router->get('empresas', static fn () => (new OrganizationController())->index());
        $router->get('empresas/nueva', static fn () => (new OrganizationController())->create());
        $router->post('empresas', static fn () => (new OrganizationController())->store());
        $router->get('empresas/{id}', static fn (array $p) => (new OrganizationController())->show($p['id']));
        $router->post('empresas/{id}', static fn (array $p) => (new OrganizationController())->update($p['id']));
        $router->post('empresas/{id}/personas', static fn (array $p) => (new OrganizationController())->addMember($p['id']));
        $router->post('empresas/{id}/personas/{memberId}/rol', static fn (array $p) => (new OrganizationController())->updateRole($p['id'], $p['memberId']));
        $router->post('empresas/{id}/personas/{memberId}/quitar', static fn (array $p) => (new OrganizationController())->removeMember($p['id'], $p['memberId']));
        $router->post('empresas/{id}/eliminar', static fn (array $p) => (new OrganizationController())->destroy($p['id']));

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

        // Verificación física: estado por elemento, rondas y cobertura.
        $router->get('projects/{id}/floors/{floorId}/verifications', static fn (array $p) => (new VerificationController())->show($p['id'], $p['floorId']));
        $router->post('projects/{id}/floors/{floorId}/verifications', static fn (array $p) => (new VerificationController())->store($p['id'], $p['floorId']));
        $router->post('projects/{id}/floors/{floorId}/verifications/rounds', static fn (array $p) => (new VerificationController())->round($p['id'], $p['floorId']));
        $router->post('projects/{id}/floors/{floorId}/verifications/settings', static fn (array $p) => (new VerificationController())->settings($p['id'], $p['floorId']));
        $router->get('projects/{id}/floors/{floorId}/verifications/{checkId}/photo', static fn (array $p) => (new VerificationController())->photo($p['id'], $p['floorId'], $p['checkId']));

        // Historial y conservación de versiones (borrado manual, con respaldo).
        $router->get('projects/{id}/floors/{floorId}/versiones', static fn (array $p) => (new RetentionController())->show($p['id'], $p['floorId']));
        $router->post('projects/{id}/floors/{floorId}/versiones/podar', static fn (array $p) => (new RetentionController())->prune($p['id'], $p['floorId']));
        $router->post('projects/{id}/floors/{floorId}/versiones/{versionId}/fijar', static fn (array $p) => (new RetentionController())->pin($p['id'], $p['floorId'], $p['versionId']));

        // Modo brigadista: enlace público de solo lectura (sin sesión).
        $router->get('b/{token}', static fn (array $p) => (new BrigadeController())->publicPage($p['token']));
        $router->get('b/{token}/plan.json', static fn (array $p) => (new BrigadeController())->publicData($p['token']));
        $router->get('b/{token}/brigade-sw.js', static fn () => (new BrigadeController())->serviceWorker());
        $router->get('projects/{id}/floors/{floorId}/brigade', static fn (array $p) => (new BrigadeController())->manage($p['id'], $p['floorId']));
        $router->post('projects/{id}/floors/{floorId}/brigade', static fn (array $p) => (new BrigadeController())->update($p['id'], $p['floorId']));

        // Complementos (plugins): señales y equipos que aporta el usuario.
        $router->get('plugins', static fn () => (new PluginController())->index());
        $router->post('plugins', static fn () => (new PluginController())->install());
        $router->post('plugins/{id:slug}/toggle', static fn (array $p) => (new PluginController())->toggle((string) $p['id']));
        $router->post('plugins/{id:slug}/delete', static fn (array $p) => (new PluginController())->destroy((string) $p['id']));
        $router->get('plugins/manual', static fn () => (new PluginController())->manual());
        $router->get('plugins/plantilla/{tipo:word}', static fn (array $p) => (new PluginController())->template((string) $p['tipo']));

        // Respaldos: solo la cuenta que instaló la aplicación.
        $router->get('respaldo', static fn () => (new BackupController())->index());
        $router->post('respaldo', static fn () => (new BackupController())->create());
        $router->get('respaldo/base', static fn () => (new BackupController())->snapshot());
        $router->get('respaldo/{archivo:slug}', static fn (array $p) => (new BackupController())->download((string) $p['archivo']));
        $router->get('respaldo/{archivo:slug}/verificar', static fn (array $p) => (new BackupController())->verify((string) $p['archivo']));
        $router->post('respaldo/{archivo:slug}/fijar', static fn (array $p) => (new BackupController())->pin((string) $p['archivo']));

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
