<?php
declare(strict_types=1);

namespace App\Services;

use JsonException;
use RuntimeException;

final class LibraryRepository
{
    public const SIGN_COLORS = [
        'emergency' => '#237f52',
        'fire' => '#b71f2e',
        'mandatory' => '#005387',
        'prohibition' => '#b71f2e',
        'warning' => '#f9a800',
        'services' => '#0f766e',
        'location' => '#1d4ed8',
        'traffic' => '#b45309',
        'brigade' => '#b91c1c',
    ];

    /** Señales de orientación propias (no ISO 7010): prefijo de código. */
    public const SERVICE_PREFIX = 'SVC_';

    /** Versión y mínimos de los catálogos locales. */
    private const ISO_SIGNS = 332;
    private const ISO_CATEGORIES = 5;
    private const SERVICE_SIGNS = 63;
    private const CAD_OBJECTS = 350;
    private const CAD_CATEGORIES = 28;

    private static ?array $signs = null;
    private static ?array $signCategories = null;
    private static ?array $cad = null;
    private static ?array $cadCategories = null;
    private static ?array $aliases = null;
    private static ?array $mep = null;

    public static function signs(): array
    {
        self::loadSigns();
        return self::$signs;
    }

    public static function signCategories(): array
    {
        self::loadSigns();
        return self::$signCategories;
    }

    public static function cad(): array
    {
        self::loadCad();
        return self::$cad;
    }

    public static function cadCategories(): array
    {
        self::loadCad();
        return self::$cadCategories;
    }

    /**
     * Catálogo técnico de redes (hidrosanitarias, gas, incendio y eléctricas).
     * Son valores de referencia configurables, no una certificación normativa.
     */
    public static function mep(): array
    {
        if (self::$mep !== null) {
            return self::$mep;
        }
        $path = BASE_PATH . '/resources/mep-networks.json';
        if (!is_file($path)) {
            throw new RuntimeException('Falta el catálogo local de redes.');
        }
        try {
            $catalog = json_decode((string) file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('El catálogo de redes no es válido.', 0, $exception);
        }
        if (!is_array($catalog) || !isset($catalog['hydraulic'], $catalog['diameters'], $catalog['materials'], $catalog['electrical'])
            || !is_array($catalog['hydraulic']) || !is_array($catalog['diameters']) || !is_array($catalog['materials']) || !is_array($catalog['electrical'])
            || count($catalog['hydraulic']) < 4 || count($catalog['diameters']) < 6) {
            throw new RuntimeException('El catálogo de redes debe declarar al menos 4 redes y 6 diámetros.');
        }
        foreach ($catalog['hydraulic'] as $key => $network) {
            if (preg_match('/^[a-z][a-z0-9_]{2,30}$/D', (string) $key) !== 1 || !is_array($network)
                || !isset($network['label'], $network['short'], $network['color'], $network['diameter'], $network['material'])
                || !is_string($network['label']) || !is_string($network['short'])
                || !in_array($network['color'], DesignValidator::COLORS, true)
                || !in_array($network['diameter'], $catalog['diameters'], true)
                || !isset($catalog['materials'][$network['material']])) {
                throw new RuntimeException('El catálogo de redes contiene una red inválida: ' . (string) $key);
            }
        }
        $electrical = $catalog['electrical'];
        foreach (['voltages', 'gauges', 'colors', 'ampacity', 'section', 'breakers'] as $field) {
            if (!isset($electrical[$field]) || !is_array($electrical[$field])) {
                throw new RuntimeException('La configuración eléctrica está incompleta: ' . $field . '.');
            }
        }
        foreach ($electrical['colors'] as $color) {
            if (!in_array($color, DesignValidator::COLORS, true)) {
                throw new RuntimeException('La paleta de circuitos usa un color fuera de la paleta permitida.');
            }
        }
        self::$mep = $catalog;
        return $catalog;
    }

    /** @return array<string,array<string,mixed>> */
    public static function networks(): array
    {
        return self::mep()['hydraulic'];
    }

    /** @return list<string> */
    public static function diameters(): array
    {
        return array_values(self::mep()['diameters']);
    }

    /** @return array<string,string> */
    public static function materials(): array
    {
        return self::mep()['materials'];
    }

    /** @return array<string,mixed> */
    public static function electrical(): array
    {
        return self::mep()['electrical'];
    }

    public static function isElectricalObject(string $type): bool
    {
        $cad = self::cadObject($type);
        if ($cad === null) {
            return false;
        }
        $category = self::cadCategories()[$cad['category']] ?? null;
        return $category !== null && preg_match('/el[eé]ctric/iu', (string) ($category['label'] ?? '')) === 1;
    }

    public static function aliases(): array
    {
        if (self::$aliases !== null) {
            return self::$aliases;
        }
        $path = BASE_PATH . '/resources/sign-aliases.json';
        if (!is_file($path)) {
            throw new RuntimeException('Falta el archivo local de aliases.');
        }
        try {
            $aliases = json_decode((string) file_get_contents($path), true, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('El archivo de aliases no es válido.', 0, $exception);
        }
        self::$aliases = is_array($aliases) ? $aliases : ['legacyTools' => [], 'search' => []];
        return self::$aliases;
    }

    /** Tipo del editor para un código de señal (`iso_e002`, `sig_wc_men`). */
    public static function typeForCode(string $code): string
    {
        if (str_starts_with($code, self::SERVICE_PREFIX)) {
            return 'sig_' . strtolower(substr($code, strlen(self::SERVICE_PREFIX)));
        }
        return 'iso_' . strtolower($code);
    }

    /** Código del catálogo para un tipo del editor, o null si no es una señal. */
    public static function codeForType(string $type): ?string
    {
        if (preg_match('/^iso_([efmpw][0-9]{3})$/iD', $type, $matches) === 1) {
            $code = strtoupper($matches[1]);
            return self::sign($code) !== null ? $code : null;
        }
        if (preg_match('/^sig_([a-z][a-z0-9_]{1,40})$/iD', $type, $matches) === 1) {
            $code = self::SERVICE_PREFIX . strtoupper($matches[1]);
            return self::sign($code) !== null ? $code : null;
        }
        return null;
    }

    /**
     * Recuentos del catálogo local, para que las vistas no repitan cifras a mano.
     *
     * @return array{signs:int,iso:int,services:int,cad:int}
     */
    public static function counts(): array
    {
        $signs = self::signs();
        $services = 0;
        foreach (array_keys($signs) as $code) {
            if (str_starts_with((string) $code, self::SERVICE_PREFIX)) {
                $services++;
            }
        }
        return [
            'signs' => count($signs),
            'iso' => count($signs) - $services,
            'services' => $services,
            'cad' => count(self::cad()),
        ];
    }

    public static function sign(string $code): ?array
    {
        $signs = self::signs();
        return $signs[$code] ?? null;
    }

    public static function cadObject(string $key): ?array
    {
        $cad = self::cad();
        return $cad[$key] ?? null;
    }

    public static function signColor(string $code): ?string
    {
        $sign = self::sign($code);
        if ($sign === null) {
            return null;
        }
        return self::SIGN_COLORS[$sign['category']] ?? null;
    }

    public static function allowedTypes(): array
    {
        $types = ['wall', 'door', 'door_double', 'door_garage', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse', 'pipe', 'conduit'];
        foreach (array_keys(self::signs()) as $code) {
            $types[] = self::typeForCode($code);
        }
        foreach (array_keys(self::cad()) as $key) {
            $types[] = $key;
        }
        return $types;
    }

    public static function safeSvg(string $svg): bool
    {
        if (strlen($svg) < 40 || strlen($svg) > 400_000) {
            return false;
        }
        if (preg_match('/^\s*<svg\b[^>]*>/i', $svg) !== 1) {
            return false;
        }
        $forbidden = [
            '/<\s*(script|foreignObject|iframe|object|embed|audio|video|image|style)\b/i',
            '/\son[a-z]+\s*=/i',
            '/\s(?:xlink:)?href\s*=\s*(?!["\']?#)/i',
            '/\b(?:javascript|vbscript|data)\s*:/i',
            '/url\s*\(\s*[\'"]?\s*(?:https?:|\/\/|data:)/i',
            '/<!ENTITY|<!DOCTYPE|<\?xml-stylesheet/i',
        ];
        foreach ($forbidden as $pattern) {
            if (preg_match($pattern, $svg) === 1) {
                return false;
            }
        }
        return true;
    }

    private static function loadSigns(): void
    {
        if (self::$signs !== null) {
            return;
        }
        $path = BASE_PATH . '/resources/iso7010-catalog.json';
        if (!is_file($path)) {
            throw new RuntimeException('Falta el catálogo local de señalización ISO 7010.');
        }
        try {
            $catalog = json_decode((string) file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('El catálogo local de señalización no es válido.', 0, $exception);
        }
        if (!is_array($catalog) || !isset($catalog['signs'], $catalog['categories'])
            || !is_array($catalog['signs']) || !is_array($catalog['categories'])
            || count($catalog['signs']) !== self::ISO_SIGNS || count($catalog['categories']) !== self::ISO_CATEGORIES) {
            throw new RuntimeException('El catálogo local debe contener las 332 señales ISO 7010 y sus 5 familias.');
        }
        foreach ($catalog['signs'] as $code => $sign) {
            if (preg_match('/^[EFMPW][0-9]{3}$/D', (string) $code) !== 1 || !is_array($sign)
                || !isset($sign['name'], $sign['category'], $sign['description'], $sign['svg'])
                || !is_string($sign['name']) || !is_string($sign['category']) || !is_string($sign['svg'])
                || !isset(self::SIGN_COLORS[$sign['category']]) || !self::safeSvg($sign['svg'])) {
                throw new RuntimeException('El catálogo local contiene una señal inválida: ' . (string) $code);
            }
        }
        $signs = $catalog['signs'];
        $categories = $catalog['categories'];
        // Señales de orientación propias: se suman al mismo catálogo para que
        // compartan búsqueda, inserción, validación y exportación.
        $servicePath = BASE_PATH . '/resources/service-signs.json';
        if (!is_file($servicePath)) {
            throw new RuntimeException('Falta el catálogo local de señalización de servicios.');
        }
        try {
            $service = json_decode((string) file_get_contents($servicePath), true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('El catálogo de señalización de servicios no es válido.', 0, $exception);
        }
        if (!is_array($service) || !isset($service['signs'], $service['categories'])
            || !is_array($service['signs']) || !is_array($service['categories'])
            || count($service['signs']) < self::SERVICE_SIGNS) {
            throw new RuntimeException('El catálogo de servicios debe contener al menos ' . self::SERVICE_SIGNS . ' señales.');
        }
        foreach ($service['categories'] as $key => $category) {
            if (!is_array($category) || !isset($category['label'])) {
                throw new RuntimeException('El catálogo de servicios contiene una familia inválida: ' . (string) $key);
            }
            if (isset($categories[$key])) {
                throw new RuntimeException('La familia de servicios no puede repetir una familia ISO: ' . (string) $key);
            }
            $categories[$key] = $category;
        }
        foreach ($service['signs'] as $code => $sign) {
            if (preg_match('/^SVC_[A-Z][A-Z0-9_]{1,40}$/D', (string) $code) !== 1 || !is_array($sign)
                || !isset($sign['name'], $sign['category'], $sign['description'], $sign['svg'])
                || !is_string($sign['name']) || !is_string($sign['description']) || !is_string($sign['svg'])
                || !isset($categories[$sign['category']]) || !self::safeSvg($sign['svg'])) {
                throw new RuntimeException('El catálogo de servicios contiene una señal inválida: ' . (string) $code);
            }
            if (isset($signs[$code])) {
                throw new RuntimeException('Código de señal duplicado: ' . (string) $code);
            }
            $signs[$code] = $sign;
        }
        ksort($signs);
        self::$signs = $signs;
        self::$signCategories = $categories;
    }

    private static function loadCad(): void
    {
        if (self::$cad !== null) {
            return;
        }
        $path = BASE_PATH . '/resources/cad-objects.json';
        if (!is_file($path)) {
            throw new RuntimeException('Falta el catálogo local de objetos CAD.');
        }
        try {
            $catalog = json_decode((string) file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('El catálogo local de objetos CAD no es válido.', 0, $exception);
        }
        if (!is_array($catalog) || !isset($catalog['objects'], $catalog['categories'])
            || !is_array($catalog['objects']) || !is_array($catalog['categories'])
            || count($catalog['objects']) < self::CAD_OBJECTS || count($catalog['categories']) < self::CAD_CATEGORIES) {
            throw new RuntimeException('El catálogo local debe contener al menos 350 objetos CAD y 28 familias.');
        }
        foreach ($catalog['objects'] as $key => $object) {
            if (preg_match('/^cad_[a-z][a-z0-9_]{2,40}$/D', (string) $key) !== 1 || !is_array($object)
                || !isset($object['name'], $object['category'], $object['description'], $object['color'], $object['svg'])
                || !is_string($object['name']) || !is_string($object['category']) || !is_string($object['color'])
                || !isset($catalog['categories'][$object['category']]) || !self::safeSvg($object['svg'])) {
                throw new RuntimeException('El catálogo CAD contiene un objeto inválido: ' . (string) $key);
            }
        }
        self::$cad = $catalog['objects'];
        self::$cadCategories = $catalog['categories'];
    }
}
