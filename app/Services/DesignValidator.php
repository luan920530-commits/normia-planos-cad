<?php
declare(strict_types=1);

namespace App\Services;

use DomainException;
use JsonException;

final class DesignValidator
{
    public const MAX_ELEMENTS = 1200;
    public const MAX_LAYERS = 24;
    public const MAX_GROUPS = 80;

    public const COLORS = [
        '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8',
        '#ffffff', '#f8fafc', '#2563eb', '#1d4ed8', '#005387', '#0f766e',
        '#15803d', '#16a34a', '#237f52', '#65a30d', '#b71f2e', '#dc2626',
        '#991b1b', '#ea580c', '#f97316', '#f59e0b', '#f9a800', '#eab308',
        '#facc15', '#7c3aed', '#be185d', '#0891b2',
    ];

    private const BASE_TYPES = ['wall', 'door', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse'];
    private const UNITS = ['cm', 'm', 'mm'];

    public static function normalizeJson(string $json): array
    {
        if ($json === '' || strlen($json) > 2_500_000) {
            throw new DomainException('El diseño está vacío o supera el tamaño permitido.');
        }
        try {
            $design = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new DomainException('El diseño no contiene un JSON válido.');
        }
        if (!is_array($design)) {
            throw new DomainException('La estructura del plano no es válida.');
        }
        return self::normalizeArray($design);
    }

    public static function normalizeArray(array $design): array
    {
        $allowedTop = ['format', 'canvas', 'layers', 'elements', 'groups'];
        foreach (array_keys($design) as $key) {
            if (!in_array($key, $allowedTop, true)) {
                throw new DomainException('El diseño contiene una propiedad no permitida: ' . (string) $key . '.');
            }
        }
        if (($design['format'] ?? null) !== 2) {
            throw new DomainException('La versión del formato del diseño no es compatible.');
        }
        $canvas = self::normalizeCanvas($design['canvas'] ?? null);
        $layers = self::normalizeLayers($design['layers'] ?? null);
        $layerIds = array_column($layers, 'id');
        $elements = self::normalizeElements($design['elements'] ?? null, $canvas, $layerIds);
        $groups = self::normalizeGroups($design['groups'] ?? null, $elements);

        return [
            'format' => 2,
            'canvas' => $canvas,
            'layers' => $layers,
            'elements' => $elements,
            'groups' => $groups,
        ];
    }

    public static function defaultCanvas(): array
    {
        return [
            'width' => 1200,
            'height' => 800,
            'grid' => 20,
            'unit' => 'cm',
            'scale' => '1:100',
            'background' => '#ffffff',
        ];
    }

    public static function label(string $value, bool $required = false, int $max = 240): string
    {
        $value = trim(str_replace(["\r\n", "\r"], "\n", $value));
        if ($required && $value === '') {
            throw new DomainException('El texto del elemento no puede quedar vacío.');
        }
        if (preg_match('/[<>]/u', $value) === 1) {
            throw new DomainException('Las etiquetas no pueden contener etiquetas HTML ni SVG.');
        }
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', $value) === 1) {
            throw new DomainException('La etiqueta contiene caracteres de control no permitidos.');
        }
        if (preg_match('/(?:javascript|vbscript|data)\s*:/iu', $value) === 1) {
            throw new DomainException('La etiqueta contiene una URL o protocolo no permitido.');
        }
        $lines = explode("\n", $value);
        if (count($lines) > 6) {
            throw new DomainException('Las etiquetas admiten como máximo 6 líneas.');
        }
        $value = implode("\n", array_map(static fn (string $line): string => trim($line), $lines));
        if (preg_match_all('/./us', $value, $matches) > $max) {
            throw new DomainException('Una etiqueta supera el máximo de ' . $max . ' caracteres.');
        }
        return $value;
    }

    public static function signCodeForType(string $type): ?string
    {
        if (preg_match('/^iso_([efmpw][0-9]{3})$/D', $type, $matches) !== 1) {
            return null;
        }
        $code = strtoupper($matches[1]);
        return LibraryRepository::sign($code) !== null ? $code : null;
    }

    public static function isKnownType(string $type): bool
    {
        if (in_array($type, self::BASE_TYPES, true)) {
            return true;
        }
        return self::signCodeForType($type) !== null || LibraryRepository::cadObject($type) !== null;
    }

    public static function defaultElement(string $type): array
    {
        $base = [
            'type' => $type,
            'x' => 0, 'y' => 0, 'w' => 80, 'h' => 60,
            'rotation' => 0, 'color' => '#334155', 'stroke' => 2,
            'opacity' => 1, 'label' => '', 'locked' => false,
        ];
        $code = self::signCodeForType($type);
        if ($code !== null) {
            $base['w'] = 64;
            $base['h'] = 64;
            $base['color'] = LibraryRepository::signColor($code) ?? '#334155';
            $base['stroke'] = 0;
            return $base;
        }
        $cad = LibraryRepository::cadObject($type);
        if ($cad !== null) {
            $base['w'] = 90;
            $base['h'] = 90;
            $base['color'] = in_array($cad['color'], self::COLORS, true) ? $cad['color'] : '#334155';
            $base['stroke'] = 1.5;
            return $base;
        }
        return match ($type) {
            'wall' => array_merge($base, ['w' => 200, 'h' => 16, 'stroke' => 8, 'color' => '#0f172a']),
            'door' => array_merge($base, ['w' => 80, 'h' => 16, 'stroke' => 2, 'color' => '#475569']),
            'route' => array_merge($base, ['w' => 220, 'h' => 80, 'stroke' => 3, 'color' => '#237f52']),
            'text' => array_merge($base, ['w' => 180, 'h' => 32, 'stroke' => 0, 'color' => '#0f172a', 'fontSize' => 18]),
            'dimension' => array_merge($base, ['w' => 200, 'h' => 20, 'stroke' => 1.5, 'color' => '#475569', 'fontSize' => 12]),
            'line' => array_merge($base, ['w' => 160, 'h' => 2, 'stroke' => 3, 'color' => '#334155']),
            'rect' => array_merge($base, ['w' => 160, 'h' => 100, 'stroke' => 2, 'color' => '#334155']),
            'ellipse' => array_merge($base, ['w' => 140, 'h' => 100, 'stroke' => 2, 'color' => '#334155']),
            default => $base,
        };
    }

    private static function normalizeCanvas(mixed $canvas): array
    {
        if (!is_array($canvas)) {
            throw new DomainException('Falta la configuración del lienzo.');
        }
        $allowed = ['width', 'height', 'grid', 'unit', 'scale', 'background'];
        foreach (array_keys($canvas) as $key) {
            if (!in_array($key, $allowed, true)) {
                throw new DomainException('El lienzo contiene una propiedad no permitida.');
            }
        }
        $width = self::integer($canvas['width'] ?? null, 400, 4000, 'ancho del lienzo');
        $height = self::integer($canvas['height'] ?? null, 300, 3000, 'alto del lienzo');
        $grid = self::integer($canvas['grid'] ?? 20, 5, 100, 'cuadrícula');
        $unit = $canvas['unit'] ?? 'cm';
        $scale = $canvas['scale'] ?? '1:100';
        $background = $canvas['background'] ?? '#ffffff';
        if (!is_string($unit) || !in_array($unit, self::UNITS, true)) {
            throw new DomainException('La unidad del plano no es válida.');
        }
        if (!is_string($scale) || preg_match('/^1:[1-9][0-9]{0,4}$/D', $scale) !== 1) {
            throw new DomainException('La escala de referencia debe tener el formato 1:100.');
        }
        if (!is_string($background) || !in_array($background, ['#ffffff', '#f8fafc'], true)) {
            throw new DomainException('El fondo del lienzo no es válido.');
        }
        return [
            'width' => $width,
            'height' => $height,
            'grid' => $grid,
            'unit' => $unit,
            'scale' => $scale,
            'background' => $background,
        ];
    }

    private static function normalizeLayers(mixed $layers): array
    {
        if (!is_array($layers) || !array_is_list($layers) || count($layers) < 1 || count($layers) > self::MAX_LAYERS) {
            throw new DomainException('El plano debe tener entre 1 y ' . self::MAX_LAYERS . ' capas.');
        }
        $result = [];
        $ids = [];
        foreach ($layers as $layer) {
            if (!is_array($layer)) {
                throw new DomainException('Una capa del plano no es válida.');
            }
            $allowed = ['id', 'name', 'visible', 'locked'];
            foreach (array_keys($layer) as $key) {
                if (!in_array($key, $allowed, true)) {
                    throw new DomainException('Una capa contiene una propiedad no permitida.');
                }
            }
            $id = $layer['id'] ?? '';
            $name = $layer['name'] ?? '';
            if (!is_string($id) || preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,47}$/D', $id) !== 1 || isset($ids[$id])) {
                throw new DomainException('El identificador de una capa no es válido o está repetido.');
            }
            if (!is_string($name) || trim($name) === '' || preg_match('/[<>]/u', $name) === 1 || preg_match_all('/./us', trim($name), $m) > 60) {
                throw new DomainException('El nombre de una capa no es válido.');
            }
            $visible = $layer['visible'] ?? true;
            $locked = $layer['locked'] ?? false;
            if (!is_bool($visible) || !is_bool($locked)) {
                throw new DomainException('La visibilidad o el bloqueo de una capa no es válido.');
            }
            $ids[$id] = true;
            $result[] = ['id' => $id, 'name' => trim($name), 'visible' => $visible, 'locked' => $locked];
        }
        return $result;
    }

    /** @param array<int,string> $layerIds */
    private static function normalizeElements(mixed $elements, array $canvas, array $layerIds): array
    {
        if (!is_array($elements) || !array_is_list($elements) || count($elements) > self::MAX_ELEMENTS) {
            throw new DomainException('La lista de elementos no es válida o supera ' . self::MAX_ELEMENTS . ' elementos.');
        }
        $result = [];
        $ids = [];
        $allowedKeys = [
            'id', 'type', 'layerId', 'x', 'y', 'w', 'h', 'rotation', 'color', 'stroke', 'opacity',
            'label', 'fontSize', 'points', 'flipX', 'locked',
        ];
        foreach ($elements as $element) {
            if (!is_array($element)) {
                throw new DomainException('Uno de los elementos del plano no es válido.');
            }
            foreach (array_keys($element) as $key) {
                if (!in_array($key, $allowedKeys, true)) {
                    throw new DomainException('Un elemento contiene una propiedad no permitida: ' . (string) $key . '.');
                }
            }
            $id = $element['id'] ?? '';
            $type = $element['type'] ?? '';
            $layerId = $element['layerId'] ?? '';
            if (!is_string($id) || preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/D', $id) !== 1 || isset($ids[$id])) {
                throw new DomainException('El identificador de un elemento no es válido o está repetido.');
            }
            if (!is_string($type) || !self::isKnownType($type)) {
                throw new DomainException('El tipo de un elemento no pertenece a las bibliotecas permitidas.');
            }
            if (!is_string($layerId) || !in_array($layerId, $layerIds, true)) {
                throw new DomainException('Un elemento apunta a una capa inexistente.');
            }
            $x = self::number($element['x'] ?? null, 0, 10_000, 'coordenada X');
            $y = self::number($element['y'] ?? null, 0, 10_000, 'coordenada Y');
            $w = self::number($element['w'] ?? null, 2, 10_000, 'ancho');
            $h = self::number($element['h'] ?? null, 2, 10_000, 'alto');
            if ($x + $w > $canvas['width'] + 0.5 || $y + $h > $canvas['height'] + 0.5) {
                throw new DomainException('Un elemento queda fuera de los límites del lienzo.');
            }
            $rotation = self::number($element['rotation'] ?? 0, -3600, 3600, 'rotación');
            $rotation = round(fmod(fmod($rotation, 360) + 360, 360), 2);
            $opacity = self::number($element['opacity'] ?? 1, 0.1, 1, 'opacidad');
            $stroke = self::number($element['stroke'] ?? 2, 0, 40, 'grosor');
            $color = $element['color'] ?? '#334155';
            if (!is_string($color) || !in_array($color, self::COLORS, true)) {
                throw new DomainException('Uno de los colores no pertenece a la paleta permitida.');
            }
            $label = $element['label'] ?? '';
            if (!is_string($label)) {
                throw new DomainException('La etiqueta de un elemento no es válida.');
            }
            $label = self::label($label, $type === 'text', 240);
            $fontSize = $element['fontSize'] ?? 14;
            if ($type === 'text' || $type === 'dimension') {
                $fontSize = self::number($fontSize, 8, 160, 'tamaño de fuente');
            } else {
                $fontSize = 14;
            }
            $locked = $element['locked'] ?? false;
            if (!is_bool($locked)) {
                throw new DomainException('El bloqueo de un elemento no es válido.');
            }
            $flipX = $element['flipX'] ?? false;
            if (!is_bool($flipX)) {
                throw new DomainException('El sentido de apertura no es válido.');
            }
            $points = null;
            if (in_array($type, ['wall', 'route', 'dimension', 'line'], true)) {
                $points = self::normalizePoints($element['points'] ?? null, $w, $h, $type);
            }
            $code = self::signCodeForType($type);
            if ($code !== null) {
                $color = LibraryRepository::signColor($code) ?? '#334155';
                $stroke = min($stroke, 6);
            }
            $cad = LibraryRepository::cadObject($type);
            if ($cad !== null && !in_array($color, self::COLORS, true)) {
                $color = '#334155';
            }
            $normalized = [
                'id' => $id,
                'type' => $type,
                'layerId' => $layerId,
                'x' => round($x, 2),
                'y' => round($y, 2),
                'w' => round($w, 2),
                'h' => round($h, 2),
                'rotation' => $rotation,
                'color' => $color,
                'stroke' => round($stroke, 2),
                'opacity' => round($opacity, 2),
                'label' => $label,
                'locked' => $locked,
            ];
            if ($type === 'text' || $type === 'dimension') {
                $normalized['fontSize'] = round($fontSize, 2);
            }
            if ($points !== null) {
                $normalized['points'] = $points;
            }
            if ($type === 'door') {
                $normalized['flipX'] = $flipX;
            }
            $ids[$id] = true;
            $result[] = $normalized;
        }
        return $result;
    }

    private static function normalizePoints(mixed $points, float $w, float $h, string $type): array
    {
        if (!is_array($points) || !array_is_list($points)) {
            throw new DomainException('La geometría de un trazo no es válida.');
        }
        $count = count($points);
        if ($count < 2 || $count > 40 || $type === 'line' && $count !== 2 || $type === 'dimension' && $count !== 2) {
            throw new DomainException('La cantidad de puntos de un trazo no es válida.');
        }
        $result = [];
        foreach ($points as $point) {
            if (!is_array($point)) {
                throw new DomainException('Un punto del trazo no es válido.');
            }
            foreach (array_keys($point) as $key) {
                if (!in_array($key, ['x', 'y'], true)) {
                    throw new DomainException('Un punto contiene propiedades no permitidas.');
                }
            }
            $px = self::number($point['x'] ?? null, 0, 10_000, 'punto X');
            $py = self::number($point['y'] ?? null, 0, 10_000, 'punto Y');
            if ($px > $w + 0.5 || $py > $h + 0.5) {
                throw new DomainException('Un punto del trazo queda fuera de su caja.');
            }
            $result[] = ['x' => round($px, 2), 'y' => round($py, 2)];
        }
        return $result;
    }

    private static function normalizeGroups(mixed $groups, array $elements): array
    {
        if ($groups === null) {
            return [];
        }
        if (!is_array($groups) || !array_is_list($groups) || count($groups) > self::MAX_GROUPS) {
            throw new DomainException('La lista de grupos no es válida.');
        }
        $elementIds = array_column($elements, 'id');
        $elementMap = array_flip($elementIds);
        $groupIds = [];
        $memberMap = [];
        $result = [];
        foreach ($groups as $group) {
            if (!is_array($group)) {
                throw new DomainException('Un grupo no es válido.');
            }
            foreach (array_keys($group) as $key) {
                if (!in_array($key, ['id', 'name', 'members'], true)) {
                    throw new DomainException('Un grupo contiene propiedades no permitidas.');
                }
            }
            $id = $group['id'] ?? '';
            $name = $group['name'] ?? '';
            $members = $group['members'] ?? null;
            if (!is_string($id) || preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,47}$/D', $id) !== 1 || isset($groupIds[$id])) {
                throw new DomainException('El identificador de un grupo no es válido o está repetido.');
            }
            if (!is_string($name) || trim($name) === '' || preg_match('/[<>]/u', $name) === 1 || preg_match_all('/./us', trim($name), $m) > 60) {
                throw new DomainException('El nombre de un grupo no es válido.');
            }
            if (!is_array($members) || !array_is_list($members) || count($members) < 2 || count($members) > 80) {
                throw new DomainException('Un grupo debe tener entre 2 y 80 elementos.');
            }
            $cleanMembers = [];
            foreach ($members as $member) {
                if (!is_string($member) || !isset($elementMap[$member]) || isset($memberMap[$member])) {
                    throw new DomainException('Un grupo contiene elementos inexistentes o repetidos.');
                }
                $memberMap[$member] = true;
                $cleanMembers[] = $member;
            }
            $groupIds[$id] = true;
            $result[] = ['id' => $id, 'name' => trim($name), 'members' => $cleanMembers];
        }
        return $result;
    }

    private static function integer(mixed $value, int $min, int $max, string $label): int
    {
        if (!is_int($value) || $value < $min || $value > $max) {
            throw new DomainException('El ' . $label . ' debe estar entre ' . $min . ' y ' . $max . '.');
        }
        return $value;
    }

    private static function number(mixed $value, float $min, float $max, string $label): float
    {
        if (!is_int($value) && !is_float($value)) {
            throw new DomainException('La ' . $label . ' no es un número válido.');
        }
        $number = (float) $value;
        if (!is_finite($number) || $number < $min || $number > $max) {
            throw new DomainException('La ' . $label . ' está fuera del rango permitido.');
        }
        return $number;
    }
}
