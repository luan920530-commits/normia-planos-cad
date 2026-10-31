<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Database;
use App\Core\Paths;
use App\Core\ValidationException;
use App\Models\User;
use PDOException;
use Throwable;

final class Installer
{
    private string $basePath;

    public function __construct(?string $basePath = null)
    {
        $this->basePath = rtrim($basePath ?? BASE_PATH, '/');
    }

    /** @return array<int,array{key:string,label:string,ok:bool,detail:string}> */
    public function requirements(): array
    {
        Paths::ensure();
        $storage = Paths::storage();
        $configDir = Paths::configDir();
        $sessions = Paths::sessions();
        return [
            ['key' => 'php', 'label' => 'PHP 8.1 o superior', 'ok' => PHP_VERSION_ID >= 80100, 'detail' => 'Versión detectada: ' . PHP_VERSION],
            ['key' => 'pdo', 'label' => 'Extensión PDO', 'ok' => extension_loaded('pdo'), 'detail' => extension_loaded('pdo') ? 'Disponible' : 'Activa PDO en el hosting'],
            ['key' => 'sqlite', 'label' => 'PDO SQLite', 'ok' => extension_loaded('pdo_sqlite') && in_array('sqlite', \PDO::getAvailableDrivers(), true), 'detail' => extension_loaded('pdo_sqlite') ? 'SQLite disponible' : 'Activa pdo_sqlite'],
            ['key' => 'session', 'label' => 'Sesiones PHP', 'ok' => function_exists('session_start'), 'detail' => function_exists('session_start') ? 'Disponible' : 'Activa session'],
            ['key' => 'json', 'label' => 'JSON nativo', 'ok' => function_exists('json_encode'), 'detail' => function_exists('json_encode') ? 'Disponible' : 'Activa json'],
            ['key' => 'catalogs', 'label' => 'Catálogos locales ISO 7010 y CAD', 'ok' => is_file($this->basePath . '/resources/iso7010-catalog.json') && is_file($this->basePath . '/resources/cad-objects.json'), 'detail' => 'Recursos incluidos en el paquete'],
            ['key' => 'storage', 'label' => 'Carpeta storage con escritura', 'ok' => is_dir($storage) && is_writable($storage), 'detail' => is_dir($storage) ? (is_writable($storage) ? 'Escritura disponible' : 'Asigna permisos 755/775') : 'Crea la carpeta storage'],
            ['key' => 'sessions', 'label' => 'Carpeta de sesiones con escritura', 'ok' => is_dir($sessions) && is_writable($sessions), 'detail' => is_dir($sessions) ? (is_writable($sessions) ? 'Escritura disponible' : 'Asigna permisos 755/775') : 'Crea storage/sessions'],
            ['key' => 'config', 'label' => 'Carpeta config con escritura', 'ok' => is_dir($configDir) && is_writable($configDir), 'detail' => is_dir($configDir) ? (is_writable($configDir) ? 'Escritura disponible' : 'Asigna permisos 755/775') : 'Crea la carpeta config'],
        ];
    }

    public function canInstall(): bool
    {
        foreach ($this->requirements() as $requirement) {
            if (!$requirement['ok']) {
                return false;
            }
        }
        return !$this->alreadyInstalled();
    }

    public function alreadyInstalled(): bool
    {
        if (Config::hasConfigFile() && Config::isInstalled()) {
            return true;
        }
        return is_file(Paths::configFile()) && is_file(Paths::database('normia.sqlite'));
    }

    /**
     * Instala la aplicación y escribe la configuración al final.
     *
     * @param array<string,mixed> $data
     * @return array{email:string,demo:bool}
     */
    public function install(array $data): array
    {
        if ($this->alreadyInstalled()) {
            throw new ValidationException(['install' => 'La aplicación ya está instalada.']);
        }
        foreach ($this->requirements() as $requirement) {
            if (!$requirement['ok']) {
                throw new ValidationException(['install' => 'Falta un requisito: ' . $requirement['label'] . '. ' . $requirement['detail']]);
            }
        }

        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $password = (string) ($data['password'] ?? '');
        $confirm = (string) ($data['password_confirm'] ?? '');
        $demo = !empty($data['demo']);
        $errors = [];
        if ($name === '' || preg_match_all('/./us', $name, $m) > 80) {
            $errors['name'] = 'Escribe tu nombre (máximo 80 caracteres).';
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $errors['email'] = 'Escribe un correo válido.';
        }
        if (strlen($password) < 10 || !preg_match('/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/u', $password) || !preg_match('/[0-9]/', $password)) {
            $errors['password'] = 'La contraseña debe tener al menos 10 caracteres y combinar letras y números.';
        }
        if ($password !== $confirm) {
            $errors['password_confirm'] = 'La confirmación de la contraseña no coincide.';
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }

        $databaseFile = 'normia-' . bin2hex(random_bytes(8)) . '.sqlite';
        $databasePath = Paths::database($databaseFile);
        if (is_file($databasePath)) {
            throw new ValidationException(['install' => 'No se pudo reservar un archivo de datos. Inténtalo de nuevo.']);
        }
        try {
            Database::connect($databasePath);
            $schema = (string) file_get_contents($this->basePath . '/resources/schema.sql');
            Database::pdo()->exec($schema);
            $userId = User::create($name, $email, $password, true);
            if ($demo) {
                $seeder = new DemoSeeder($this->basePath);
                $seeder->seed($userId);
            }
            $saved = $this->writeConfig($databaseFile, $demo);
            if (!$saved) {
                throw new ValidationException(['install' => 'No se pudo escribir config/config.php. Revisa los permisos de la carpeta config.']);
            }
            @chmod($databasePath, 0660);
            @chmod(Paths::configFile(), 0640);
            return ['email' => $email, 'demo' => $demo];
        } catch (ValidationException $exception) {
            @unlink($databasePath);
            Database::reset();
            throw $exception;
        } catch (PDOException $exception) {
            @unlink($databasePath);
            Database::reset();
            throw new ValidationException(['install' => 'No se pudo crear la base de datos SQLite. Revisa los permisos y la versión de PHP.']);
        } catch (Throwable $exception) {
            error_log('Normia: la instalación falló: ' . $exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine());
            @unlink($databasePath);
            Database::reset();
            throw new ValidationException(['install' => 'La instalación no pudo completarse. Revisa los permisos de storage y config.']);
        }
    }

    private function writeConfig(string $databaseFile, bool $demo): bool
    {
        $configFile = Paths::configFile();
        $appKey = bin2hex(random_bytes(32));
        $content = "<?php\n"
            . "declare(strict_types=1);\n\n"
            . "// Generado por el instalador de Normia Planos CAD.\n"
            . "return [\n"
            . "    'database' => __DIR__ . '/../storage/" . $databaseFile . "',\n"
            . "    'session_name' => 'normia_sid',\n"
            . "    'app_key' => " . var_export($appKey, true) . ",\n"
            . "    'timezone' => 'America/Bogota',\n"
            . "    'demo' => " . ($demo ? 'true' : 'false') . ",\n"
            . "    'installed_at' => " . var_export(gmdate('c'), true) . ",\n"
            . "];\n";
        $temporary = $configFile . '.tmp-' . bin2hex(random_bytes(4));
        if (file_put_contents($temporary, $content, LOCK_EX) === false) {
            return false;
        }
        if (!@rename($temporary, $configFile)) {
            @unlink($temporary);
            return false;
        }
        return true;
    }
}
