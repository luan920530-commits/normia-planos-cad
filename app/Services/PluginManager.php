<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Paths;
use JsonException;
use RuntimeException;
use ZipArchive;

/**
 * Complementos (plugins) de Normia Planos CAD.
 *
 * Un complemento es un **paquete de datos**, no de código: un archivo
 * `plugin.json` —solo, o dentro de un `.zip` con sus SVG— que declara señales de
 * señalización y/o objetos de equipamiento CAD. La plataforma lo valida, lo
 * guarda en `storage/plugins/`, lo activa o desactiva cuando el usuario quiere y
 * lo suma a los catálogos que ya usan el editor, el auditor y las exportaciones.
 *
 * Nunca se ejecuta código del complemento: ni PHP, ni JavaScript, ni plantillas.
 * Los SVG se filtran con `LibraryRepository::safeSvg()` (sin `<script>`, sin
 * manejadores `on*`, sin referencias externas), y todo lo demás son cadenas
 * acotadas. Esa decisión es deliberada: un catálogo ampliable no debe poder leer
 * la base de datos, la sesión ni los planos del usuario.
 *
 * La especificación completa, con ejemplos, está en `docs/PLUGINS.md` y en la
 * propia aplicación (`plugins/manual`).
 */
final class PluginManager
{
    /** Versión del formato de complemento que entiende esta aplicación. */
    public const API_VERSION = 1;

    /** Tamaño máximo del archivo que se sube (4 MB). */
    public const MAX_BYTES = 4_000_000;

    /** Máximo de elementos que puede declarar un complemento. */
    public const MAX_ITEMS = 400;

    /** Prefijo de los códigos de señal de los complementos. */
    public const SIGN_PREFIX = 'PLG_';

    /** Una carpeta por complemento, dentro de los datos del usuario. */
    public static function directory(): string
    {
        return Paths::storage() . '/plugins';
    }

    /** Ruta del manifiesto de un complemento instalado. */
    public static function manifestPath(string $id): string
    {
        return self::directory() . '/' . $id . '/plugin.json';
    }

    /* ------------------------------ consultas ------------------------------ */

    /**
     * Complementos instalados con su estado.
     *
     * @return list<array<string,mixed>>
     */
    public static function all(): array
    {
        $rows = [];
        foreach (Database::query('SELECT id, enabled, installed_at FROM plugins ORDER BY installed_at, id') as $row) {
            $manifest = self::read((string) $row['id']);
            if ($manifest === null) {
                // Carpeta borrada a mano: se limpia el registro para no mostrar fantasmas.
                Database::execute('DELETE FROM plugins WHERE id = ?', [(string) $row['id']]);
                continue;
            }
            $manifest['enabled'] = (int) $row['enabled'] === 1;
            $manifest['installed_at'] = (string) $row['installed_at'];
            $rows[] = $manifest;
        }
        return $rows;
    }

    /** Un complemento instalado (o null). */
    public static function find(string $id): ?array
    {
        if (preg_match('/^[a-z][a-z0-9-]{2,31}$/D', $id) !== 1) {
            return null;
        }
        foreach (self::all() as $plugin) {
            if ($plugin['id'] === $id) {
                return $plugin;
            }
        }
        return null;
    }

    /**
     * Manifiestos activos, ya normalizados.
     *
     * @return list<array<string,mixed>>
     */
    public static function enabled(): array
    {
        return array_values(array_filter(self::all(), static fn (array $plugin): bool => $plugin['enabled'] === true));
    }

    /**
     * Señales que aportan los complementos activos, con la forma del catálogo.
     *
     * @return array<string,array<string,mixed>>
     */
    public static function signs(): array
    {
        $signs = [];
        foreach (self::enabled() as $plugin) {
            foreach ($plugin['signs'] as $sign) {
                $code = (string) $sign['code'];
                // Los códigos de complemento son exclusivos (`PLG_…`), así que
                // aquí solo hay que no repetir entre complementos.
                if (isset($signs[$code])) {
                    continue;
                }
                $signs[$code] = [
                    'name' => $sign['name'],
                    'category' => $sign['category'],
                    'description' => $sign['description'],
                    'aliases' => $sign['aliases'],
                    'svg' => $sign['svg'],
                    'plugin' => $plugin['id'],
                ];
            }
        }
        return $signs;
    }

    /**
     * Objetos CAD que aportan los complementos activos.
     *
     * @return array<string,array<string,mixed>>
     */
    public static function cad(): array
    {
        $objects = [];
        foreach (self::enabled() as $plugin) {
            foreach ($plugin['cad'] as $object) {
                $key = (string) $object['code'];
                if (isset($objects[$key])) {
                    continue;
                }
                $objects[$key] = [
                    'name' => $object['name'],
                    'category' => $object['category'],
                    'description' => $object['description'],
                    'color' => $object['color'],
                    'svg' => $object['svg'],
                    'plugin' => $plugin['id'],
                ];
            }
        }
        return $objects;
    }

    /**
     * Familias nuevas que declaran los complementos activos.
     *
     * @return array<string,array<string,string>>
     */
    public static function categories(): array
    {
        $base = LibraryRepository::signCategories();
        return array_filter(
            self::rawCategories(),
            static fn (string $key): bool => !isset($base[$key]),
            ARRAY_FILTER_USE_KEY
        );
    }

    /**
     * Familias declaradas por los complementos, sin comparar con las del
     * catálogo base. La usa `LibraryRepository` mientras carga los catálogos
     * (comparar allí volvería a entrar en esta clase).
     *
     * @return array<string,array<string,string>>
     */
    public static function rawCategories(): array
    {
        $categories = [];
        foreach (self::enabled() as $plugin) {
            foreach ($plugin['categories'] as $key => $category) {
                if (isset($categories[$key])) {
                    continue;
                }
                $categories[$key] = [
                    'label' => $category['label'],
                    'short' => $category['short'],
                    'description' => $category['description'],
                    'color' => $category['color'],
                    'plugin' => $plugin['id'],
                ];
            }
        }
        return $categories;
    }

    /**
     * Alias de búsqueda que aportan los complementos activos.
     *
     * @return array<string,list<string>>
     */
    public static function aliases(): array
    {
        $aliases = [];
        foreach (self::enabled() as $plugin) {
            foreach ($plugin['signs'] as $sign) {
                if ($sign['aliases'] !== []) {
                    $aliases[(string) $sign['code']] = $sign['aliases'];
                }
            }
        }
        return $aliases;
    }

    /** ¿El color viene de una familia de complemento? */
    public static function categoryColor(string $category): ?string
    {
        foreach (self::categories() as $key => $definition) {
            if ($key === $category) {
                return (string) $definition['color'];
            }
        }
        return null;
    }

    /* ------------------------------ escritura ------------------------------ */

    /**
     * Instala (o actualiza) un complemento desde el archivo subido.
     *
     * Acepta `plugin.json` suelto o un `.zip` con `plugin.json` en la raíz y,
     * opcionalmente, archivos `.svg` que el manifiesto nombre en `svg_file`.
     *
     * @param array<string,mixed> $file  entrada de `$_FILES`
     * @return array{id:string,name:string,signs:int,cad:int,version:string,updated:bool}
     */
    public static function install(array $file): array
    {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            throw new \DomainException(self::uploadError($error));
        }
        if ((int) ($file['size'] ?? 0) > self::MAX_BYTES) {
            throw new \DomainException('El complemento supera el límite de 4 MB.');
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        $contents = $tmp !== '' && is_uploaded_file($tmp) ? file_get_contents($tmp) : false;
        if ($contents === false || $contents === '') {
            throw new \DomainException('No se pudo leer el archivo del complemento.');
        }

        $origin = (string) ($file['name'] ?? 'plugin.json');
        [$json, $assets] = self::unpack($contents, $origin);
        $manifest = self::parse($json, $assets, $origin);

        // Se escribe primero en una carpeta temporal y solo se reemplaza si todo
        // salió bien: un complemento a medias no puede dejar la app sin catálogo.
        $destination = self::directory() . '/' . $manifest['id'];
        $staging = self::directory() . '/.instalando-' . $manifest['id'];
        self::removeTree($staging);
        if (!mkdir($staging, 0o755, true) && !is_dir($staging)) {
            throw new RuntimeException('No se pudo crear la carpeta del complemento.');
        }
        $payload = json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        if (file_put_contents($staging . '/plugin.json', $payload) === false) {
            throw new RuntimeException('No se pudo escribir el complemento.');
        }
        $updated = is_dir($destination);
        self::removeTree($destination);
        if (!rename($staging, $destination)) {
            throw new RuntimeException('No se pudo guardar el complemento.');
        }

        Database::execute(
            'INSERT INTO plugins (id, name, version, author, enabled, installed_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version, author = excluded.author',
            [$manifest['id'], $manifest['name'], $manifest['version'], $manifest['author']]
        );
        // Los catálogos se leen una vez por proceso: se olvidan para que el
        // editor vea el complemento en la misma sesión (también en el APK, donde
        // el intérprete vive mientras la aplicación está abierta).
        LibraryRepository::forget();

        return [
            'id' => $manifest['id'],
            'name' => $manifest['name'],
            'version' => $manifest['version'],
            'signs' => count($manifest['signs']),
            'cad' => count($manifest['cad']),
            'updated' => $updated,
        ];
    }

    /** Activa o desactiva un complemento sin borrarlo. */
    public static function toggle(string $id, bool $enabled): void
    {
        if (self::read($id) === null) {
            throw new \DomainException('Ese complemento no está instalado.');
        }
        Database::execute('UPDATE plugins SET enabled = ? WHERE id = ?', [$enabled ? 1 : 0, $id]);
        LibraryRepository::forget();
    }

    /** Desinstala un complemento y borra su carpeta. */
    public static function remove(string $id): void
    {
        if (preg_match('/^[a-z][a-z0-9-]{2,31}$/D', $id) !== 1) {
            throw new \DomainException('Identificador de complemento no válido.');
        }
        Database::execute('DELETE FROM plugins WHERE id = ?', [$id]);
        self::removeTree(self::directory() . '/' . $id);
        LibraryRepository::forget();
    }

    /** Manifiesto de ejemplo, el que se descarga desde la pantalla de complementos. */
    public static function example(string $kind = 'senalizacion'): string
    {
        $path = BASE_PATH . '/resources/plugins-ejemplo/' . ($kind === 'cad' ? 'equipamiento' : 'senalizacion') . '.plugin.json';
        if (!is_file($path)) {
            throw new RuntimeException('Falta el complemento de ejemplo.');
        }
        return (string) file_get_contents($path);
    }

    /* ------------------------------ internos ------------------------------- */

    /**
     * Familias del catálogo base, sin cargar los catálogos.
     *
     * `LibraryRepository::signCategories()` fusiona los complementos activos y
     * volvería a entrar aquí al instalar o al listar (bucle infinito). La paleta
     * base de `SIGN_COLORS` es la lista completa de familias: el cargador de
     * catálogos rechaza cualquier señal cuya familia no esté en ella.
     *
     * @return array<string,string>
     */
    private static function baseCategories(): array
    {
        $categories = [];
        foreach (array_keys(LibraryRepository::SIGN_COLORS) as $key) {
            $categories[(string) $key] = (string) $key;
        }
        return $categories;
    }


    /** Lee y normaliza un manifiesto instalado. */
    private static function read(string $id): ?array
    {
        if (preg_match('/^[a-z][a-z0-9-]{2,31}$/D', $id) !== 1) {
            return null;
        }
        $path = self::manifestPath($id);
        if (!is_file($path)) {
            return null;
        }
        $raw = (string) file_get_contents($path);
        try {
            $manifest = self::parse($raw, [], $id, false);
        } catch (\Throwable) {
            return null;
        }
        return $manifest;
    }

    /**
     * Separa el manifiesto de sus SVG cuando llegan en un ZIP.
     *
     * @return array{0:string,1:array<string,string>} JSON y archivos por nombre
     */
    private static function unpack(string $contents, string $origin): array
    {
        $isZip = str_ends_with(strtolower($origin), '.zip') || str_starts_with($contents, "PK\x03\x04");
        if (!$isZip) {
            return [$contents, []];
        }
        if (!class_exists(ZipArchive::class)) {
            throw new \DomainException('Este servidor no puede abrir archivos .zip: sube el complemento como plugin.json.');
        }
        $temporal = tempnam(sys_get_temp_dir(), 'normia-plugin-');
        if ($temporal === false) {
            throw new RuntimeException('No se pudo preparar el archivo del complemento.');
        }
        try {
            file_put_contents($temporal, $contents);
            $zip = new ZipArchive();
            if ($zip->open($temporal) !== true) {
                throw new \DomainException('El archivo .zip no se pudo abrir.');
            }
            $json = '';
            $assets = [];
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $name = (string) $zip->getNameIndex($index);
                $base = basename(str_replace('\\', '/', $name));
                if ($name === '' || str_contains($name, '..') || str_starts_with($name, '__MACOSX')) {
                    continue;
                }
                $data = (string) $zip->getFromIndex($index);
                if (strtolower($base) === 'plugin.json' && strpos(str_replace('\\', '/', $name), '/') === false) {
                    $json = $data;
                } elseif (str_ends_with(strtolower($base), '.svg')) {
                    $assets[$base] = $data;
                }
            }
            $zip->close();
            if ($json === '') {
                throw new \DomainException('El .zip debe llevar un plugin.json en la raíz.');
            }
            return [$json, $assets];
        } finally {
            @unlink($temporal);
        }
    }

    /**
     * Valida el manifiesto y lo devuelve normalizado.
     *
     * @param array<string,string> $assets  SVG del ZIP, por nombre de archivo
     */
    private static function parse(string $json, array $assets, string $origin, bool $strict = true): array
    {
        if (strlen($json) > 2_000_000) {
            throw new \DomainException('El manifiesto es demasiado grande (máximo 2 MB).');
        }
        try {
            $data = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new \DomainException('El plugin.json no es un JSON válido: ' . $exception->getMessage());
        }
        if (!is_array($data)) {
            throw new \DomainException('El plugin.json debe ser un objeto JSON.');
        }
        $fail = static function (string $message) use ($strict): void {
            if ($strict) {
                throw new \DomainException($message);
            }
            throw new RuntimeException($message);
        };

        if (($data['api'] ?? self::API_VERSION) !== self::API_VERSION) {
            $fail('Este complemento pide la versión de API ' . (string) ($data['api'] ?? '?') . '; esta aplicación entiende la ' . self::API_VERSION . '.');
        }
        $id = strtolower(trim((string) ($data['id'] ?? '')));
        if (preg_match('/^[a-z][a-z0-9-]{2,31}$/D', $id) !== 1) {
            $fail('El campo "id" debe tener entre 3 y 32 caracteres: minúsculas, números y guiones (por ejemplo "acme-senalizacion").');
        }
        $name = self::text($data['name'] ?? '', 80, 'El campo "name" es obligatorio (máximo 80 caracteres).', $fail);
        $version = self::text($data['version'] ?? '1.0.0', 20, 'La "version" no es válida.', $fail);
        if (preg_match('/^[0-9]+(\.[0-9]+){1,3}(-[a-z0-9.]+)?$/iD', $version) !== 1) {
            $fail('La "version" debe parecerse a 1.0.0.');
        }
        $author = self::text($data['author'] ?? '', 80, 'El campo "author" es obligatorio (máximo 80 caracteres).', $fail);
        $description = self::text($data['description'] ?? '', 600, 'La "description" no puede pasar de 600 caracteres.', $fail, true);
        $license = self::text($data['license'] ?? '', 80, 'La "license" no puede pasar de 80 caracteres.', $fail, true);

        $key = strtoupper(str_replace('-', '_', $id));

        // Familias nuevas: color de la paleta permitida y textos cortos.
        $categories = [];
        foreach (($data['categories'] ?? []) as $code => $category) {
            $code = strtolower(trim((string) $code));
            if (preg_match('/^[a-z][a-z0-9_]{1,24}$/D', $code) !== 1) {
                $fail('Nombre de familia no válido: ' . $code . ' (minúsculas, números y guiones bajos).');
            }
            if (!is_array($category)) {
                $fail('La familia ' . $code . ' debe ser un objeto con "label" y "color".');
            }
            $color = strtolower(trim((string) ($category['color'] ?? '')));
            if (preg_match('/^#[0-9a-f]{6}$/D', $color) !== 1) {
                $fail('La familia ' . $code . ' necesita un color en formato #rrggbb.');
            }
            $categories[$code] = [
                'label' => self::text($category['label'] ?? '', 60, 'La familia ' . $code . ' necesita "label".', $fail),
                'short' => self::text($category['short'] ?? ($category['label'] ?? ''), 40, 'La familia ' . $code . ' necesita "short".', $fail),
                'description' => self::text($category['description'] ?? '', 300, 'La descripción de ' . $code . ' es demasiado larga.', $fail, true),
                'color' => $color,
            ];
        }

        $knownCategories = array_keys(self::baseCategories() + $categories);

        $signs = [];
        $seen = [];
        $items = 0;
        foreach (($data['signs'] ?? []) as $index => $sign) {
            $items++;
            if ($items > self::MAX_ITEMS) {
                $fail('El complemento declara más de ' . self::MAX_ITEMS . ' elementos.');
            }
            if (!is_array($sign)) {
                $fail('Cada señal debe ser un objeto.');
            }
            $itemId = strtolower(trim((string) ($sign['id'] ?? '')));
            if (preg_match('/^[a-z][a-z0-9_]{1,40}$/D', $itemId) !== 1) {
                $fail('Identificador de señal no válido en la señal ' . ($index + 1) . ': usa minúsculas, números y guiones bajos.');
            }
            $code = self::SIGN_PREFIX . $key . '_' . strtoupper($itemId);
            if (strlen($code) > 60) {
                $fail('El código ' . $code . ' es demasiado largo; acorta el "id" del complemento o de la señal.');
            }
            if (isset($seen[$code])) {
                $fail('La señal ' . $code . ' está repetida.');
            }
            $seen[$code] = true;
            $category = strtolower(trim((string) ($sign['category'] ?? 'services')));
            if (!in_array($category, $knownCategories, true)) {
                $fail('La señal ' . $itemId . ' usa la familia "' . $category . '", que no existe. Declárala en "categories" o usa: ' . implode(', ', $knownCategories) . '.');
            }
            $aliases = [];
            foreach ((array) ($sign['aliases'] ?? []) as $alias) {
                $alias = trim((string) $alias);
                if ($alias !== '' && mb_strlen($alias) <= 40 && count($aliases) < 12) {
                    $aliases[] = $alias;
                }
            }
            $signs[] = [
                // `id` viaja en el manifiesto guardado: al releerlo se vuelve a
                // validar igual que el original (el `code` se recalcula).
                'id' => $itemId,
                'code' => $code,
                'type' => 'plg_' . strtolower(substr($code, strlen(self::SIGN_PREFIX))),
                'name' => self::text($sign['name'] ?? '', 80, 'La señal ' . $itemId . ' necesita "name".', $fail),
                'category' => $category,
                'description' => self::text($sign['description'] ?? '', 300, 'La señal ' . $itemId . ' necesita "description".', $fail),
                'aliases' => $aliases,
                'svg' => self::svg($sign, $assets, 'señal ' . $itemId, $fail),
            ];
        }

        $cad = [];
        foreach (($data['cad'] ?? []) as $index => $object) {
            $items++;
            if ($items > self::MAX_ITEMS) {
                $fail('El complemento declara más de ' . self::MAX_ITEMS . ' elementos.');
            }
            if (!is_array($object)) {
                $fail('Cada objeto CAD debe ser un objeto.');
            }
            $itemId = strtolower(trim((string) ($object['id'] ?? '')));
            if (preg_match('/^[a-z0-9][a-z0-9_]{1,32}$/D', $itemId) !== 1) {
                $fail('Identificador de objeto CAD no válido en el elemento ' . ($index + 1) . '.');
            }
            $code = 'cad_' . strtolower($key) . '_' . $itemId;
            if (strlen($code) > 48) {
                $fail('El código ' . $code . ' es demasiado largo; acorta los identificadores.');
            }
            if (isset($seen[$code])) {
                $fail('El objeto ' . $code . ' está repetido.');
            }
            $seen[$code] = true;
            $category = strtolower(trim((string) ($object['category'] ?? 'equipamiento')));
            if (preg_match('/^[a-z][a-z0-9_]{1,30}$/D', $category) !== 1) {
                $fail('La familia del objeto ' . $itemId . ' no es válida.');
            }
            $color = strtolower(trim((string) ($object['color'] ?? '#334155')));
            if (preg_match('/^#[0-9a-f]{6}$/D', $color) !== 1) {
                $fail('El color del objeto ' . $itemId . ' debe ser #rrggbb.');
            }
            $cad[] = [
                'id' => $itemId,
                'code' => $code,
                'name' => self::text($object['name'] ?? '', 80, 'El objeto ' . $itemId . ' necesita "name".', $fail),
                'category' => $category,
                'description' => self::text($object['description'] ?? '', 300, 'El objeto ' . $itemId . ' necesita "description".', $fail),
                'color' => $color,
                'svg' => self::svg($object, $assets, 'objeto ' . $itemId, $fail),
            ];
        }

        if ($signs === [] && $cad === []) {
            $fail('El complemento no declara nada: añade al menos una señal en "signs" o un objeto en "cad".');
        }

        return [
            'api' => self::API_VERSION,
            'id' => $id,
            'name' => $name,
            'version' => $version,
            'author' => $author,
            'description' => $description,
            'license' => $license,
            'categories' => $categories,
            'signs' => $signs,
            'cad' => $cad,
        ];
    }

    /**
     * SVG del elemento: incrustado (`svg`) o de un archivo del ZIP (`svg_file`).
     *
     * @param array<string,mixed> $item
     * @param array<string,string> $assets
     */
    private static function svg(array $item, array $assets, string $label, callable $fail): string
    {
        $svg = trim((string) ($item['svg'] ?? ''));
        $file = trim((string) ($item['svg_file'] ?? ''));
        if ($svg === '' && $file !== '') {
            $name = basename($file);
            if (!isset($assets[$name])) {
                $fail('El archivo ' . $name . ' no está dentro del .zip.');
            }
            $svg = trim($assets[$name]);
        }
        if ($svg === '') {
            $fail('Falta el SVG del ' . $label . ' ("svg" o "svg_file").');
        }
        if (!LibraryRepository::safeSvg($svg)) {
            $fail('El SVG del ' . $label . ' no es seguro: no admite <script>, manejadores on*, enlaces externos ni datos embebidos.');
        }
        return $svg;
    }

    /**
     * Texto acotado y sin etiquetas HTML. Con `$optional` admite el vacío (los
     * campos que el formato no exige, como `description` o `license`).
     */
    private static function text(mixed $value, int $max, string $message, callable $fail, bool $optional = false): string
    {
        $text = trim((string) $value);
        if ($text === '' && $optional) {
            return '';
        }
        if ($text === '' || mb_strlen($text) > $max || preg_match('/[<>]/u', $text) === 1) {
            $fail($message);
        }
        return $text;
    }

    private static function uploadError(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'El archivo supera el límite permitido por el servidor.',
            UPLOAD_ERR_PARTIAL => 'La carga se interrumpió; vuelve a intentarlo.',
            UPLOAD_ERR_NO_FILE => 'Selecciona el archivo del complemento (plugin.json o .zip).',
            UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE => 'El servidor no puede guardar archivos temporales.',
            default => 'No se pudo recibir el archivo del complemento.',
        };
    }

    private static function removeTree(string $path): void
    {
        if (!is_dir($path)) {
            return;
        }
        foreach (scandir($path) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $child = $path . '/' . $entry;
            if (is_dir($child)) {
                self::removeTree($child);
            } else {
                @unlink($child);
            }
        }
        @rmdir($path);
    }
}
