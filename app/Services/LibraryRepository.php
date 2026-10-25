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
    ];

    private static ?array $signs = null;
    private static ?array $signCategories = null;
    private static ?array $cad = null;
    private static ?array $cadCategories = null;
    private static ?array $aliases = null;

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
        $types = ['wall', 'door', 'door_double', 'door_garage', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse'];
        foreach (array_keys(self::signs()) as $code) {
            $types[] = 'iso_' . strtolower($code);
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
            || count($catalog['signs']) !== 332 || count($catalog['categories']) !== 5) {
            throw new RuntimeException('El catálogo local debe contener las 332 señales y sus 5 familias.');
        }
        foreach ($catalog['signs'] as $code => $sign) {
            if (preg_match('/^[EFMPW][0-9]{3}$/D', (string) $code) !== 1 || !is_array($sign)
                || !isset($sign['name'], $sign['category'], $sign['description'], $sign['svg'])
                || !is_string($sign['name']) || !is_string($sign['category']) || !is_string($sign['svg'])
                || !isset(self::SIGN_COLORS[$sign['category']]) || !self::safeSvg($sign['svg'])) {
                throw new RuntimeException('El catálogo local contiene una señal inválida: ' . (string) $code);
            }
        }
        self::$signs = $catalog['signs'];
        self::$signCategories = $catalog['categories'];
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
            || count($catalog['objects']) < 90 || count($catalog['categories']) < 15) {
            throw new RuntimeException('El catálogo local debe contener al menos 90 objetos CAD y 15 familias.');
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
