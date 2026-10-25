<?php
declare(strict_types=1);

namespace App\Services;

use DomainException;
use JsonException;

final class DesignImporter
{
    /**
     * Acepta el sobre de exportación propio, un diseño v2 o un diseño heredado v1
     * (formato del editor anterior) y devuelve siempre un diseño normalizado.
     *
     * @return array{design:array,project:array,floor:array,legacy:bool}
     */
    public static function parse(string $json): array
    {
        if ($json === '' || strlen($json) > 2_500_000) {
            throw new DomainException('El archivo está vacío o supera el tamaño permitido.');
        }
        try {
            $payload = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new DomainException('El archivo no contiene un JSON válido.');
        }
        if (!is_array($payload)) {
            throw new DomainException('La estructura del archivo no es válida.');
        }

        if (($payload['format'] ?? null) === 'normia-plan') {
            $allowed = ['application', 'format', 'schema_version', 'exported_at', 'project', 'floor', 'design', 'attribution'];
            foreach (array_keys($payload) as $key) {
                if (!in_array($key, $allowed, true)) {
                    throw new DomainException('El archivo contiene campos de nivel superior no permitidos.');
                }
            }
            if (($payload['application'] ?? '') !== 'normia-planos-cad' || ($payload['schema_version'] ?? null) !== 2) {
                throw new DomainException('El archivo no corresponde a un plano compatible de Normia Planos CAD.');
            }
            if (!isset($payload['design']) || !is_array($payload['design'])) {
                throw new DomainException('El archivo no incluye un diseño válido.');
            }
            $project = self::metadata($payload['project'] ?? [], ['name', 'site', 'workplace', 'responsible', 'notes']);
            $floor = self::metadata($payload['floor'] ?? [], ['name', 'level']);
            $design = DesignValidator::normalizeArray($payload['design']);
            return ['design' => $design, 'project' => $project, 'floor' => $floor, 'legacy' => false];
        }

        if (($payload['format'] ?? null) === 2) {
            $design = DesignValidator::normalizeArray($payload);
            return ['design' => $design, 'project' => [], 'floor' => [], 'legacy' => false];
        }

        if (($payload['format'] ?? null) === 1 && isset($payload['elements']) && is_array($payload['elements'])) {
            $design = self::fromLegacy($payload);
            return ['design' => $design, 'project' => [], 'floor' => [], 'legacy' => true];
        }

        throw new DomainException('El formato del archivo no es compatible. Usa un JSON exportado por Normia Planos CAD.');
    }

    private static function metadata(mixed $value, array $keys): array
    {
        if ($value === [] || $value === null) {
            return [];
        }
        if (!is_array($value)) {
            throw new DomainException('Los metadatos del plano no son válidos.');
        }
        foreach (array_keys($value) as $key) {
            if (!in_array($key, $keys, true)) {
                throw new DomainException('Los metadatos contienen una propiedad no permitida.');
            }
        }
        $result = [];
        $limits = ['name' => 120, 'site' => 120, 'workplace' => 120, 'responsible' => 120, 'notes' => 1000, 'level' => 40];
        foreach ($keys as $key) {
            $item = $value[$key] ?? '';
            if (!is_string($item)) {
                throw new DomainException('Los metadatos deben ser texto.');
            }
            $item = trim($item);
            if (preg_match('/[<>]/u', $item) === 1) {
                throw new DomainException('Los metadatos no admiten etiquetas HTML.');
            }
            if (preg_match_all('/./us', $item, $m) > ($limits[$key] ?? 120)) {
                throw new DomainException('Un metadato supera la longitud permitida.');
            }
            $result[$key] = $item;
        }
        return $result;
    }

    private static function fromLegacy(array $legacy): array
    {
        $aliases = LibraryRepository::aliases();
        $legacyTools = is_array($aliases['legacyTools'] ?? null) ? $aliases['legacyTools'] : [];
        $width = self::legacyInt($legacy['width'] ?? 1000, 400, 4000, 1000);
        $height = self::legacyInt($legacy['height'] ?? 650, 300, 3000, 650);
        $grid = self::legacyInt($legacy['grid'] ?? 20, 5, 100, 20);
        $layerId = 'capa_planta';
        $elements = [];
        $used = [];
        $sequence = 0;

        foreach ($legacy['elements'] as $raw) {
            if (!is_array($raw)) {
                throw new DomainException('El diseño heredado contiene un elemento inválido.');
            }
            $sequence++;
            $tool = isset($raw['tool']) && is_string($raw['tool']) ? trim($raw['tool']) : '';
            $type = null;
            if (isset($legacyTools[$tool]) && is_string($legacyTools[$tool]) && LibraryRepository::sign($legacyTools[$tool]) !== null) {
                $type = LibraryRepository::typeForCode($legacyTools[$tool]);
            } elseif (LibraryRepository::codeForType($tool) !== null) {
                $type = $tool;
            } elseif (in_array($tool, ['wall', 'door', 'door_double', 'door_garage', 'route', 'text', 'line', 'rect', 'ellipse', 'dimension'], true)) {
                $type = $tool;
            } elseif (LibraryRepository::cadObject($tool) !== null) {
                $type = $tool;
            }
            if ($type === null) {
                throw new DomainException('El diseño heredado usa una herramienta desconocida: ' . text_limit($tool, 40) . '.');
            }

            $x = self::legacyNumber($raw['x'] ?? 0, -10_000, 10_000, 'X');
            $y = self::legacyNumber($raw['y'] ?? 0, -10_000, 10_000, 'Y');
            $rotation = self::legacyNumber($raw['rotation'] ?? 0, -3600, 3600, 'rotación');
            $stroke = self::legacyNumber($raw['stroke'] ?? 4, 0, 40, 'grosor');
            $label = isset($raw['label']) && is_string($raw['label']) ? $raw['label'] : '';
            $base = DesignValidator::defaultElement($type);
            $color = isset($raw['color']) && is_string($raw['color']) && in_array($raw['color'], DesignValidator::COLORS, true)
                ? $raw['color'] : $base['color'];

            $element = [
                'id' => '',
                'type' => $type,
                'layerId' => $layerId,
                'x' => 0, 'y' => 0, 'w' => $base['w'], 'h' => $base['h'],
                'rotation' => $rotation,
                'color' => $color,
                'stroke' => $stroke,
                'opacity' => 1,
                'label' => $label,
                'locked' => false,
            ];

            $code = DesignValidator::signCodeForType($type);
            if ($code !== null) {
                $size = max(40, $stroke * 5);
                $size = min($size, min($width, $height));
                $element['w'] = $size;
                $element['h'] = $size;
                $element['x'] = max(0, min($width - $size, $x - $size / 2));
                $element['y'] = max(0, min($height - $size, $y - $size / 2));
                $element['color'] = LibraryRepository::signColor($code) ?? $base['color'];
                $element['stroke'] = 0;
            } elseif (LibraryRepository::cadObject($type) !== null) {
                $size = min(max(40, $stroke * 12.5), min($width, $height));
                $element['w'] = $size;
                $element['h'] = $size;
                $element['x'] = max(0, min($width - $size, $x - $size / 2));
                $element['y'] = max(0, min($height - $size, $y - $size / 2));
            } elseif ($type === 'text') {
                $element['w'] = min(240, max(80, ($label !== '' ? strlen($label) : 12) * max(7, $stroke * 2.2)));
                $element['h'] = max(24, $stroke * 3);
                $element['fontSize'] = min(160, max(8, $stroke * 2.2));
                $element['x'] = max(0, min($width - $element['w'], $x));
                $element['y'] = max(0, min($height - $element['h'], $y));
            } elseif (in_array($type, ['door', 'door_double', 'door_garage'], true)) {
                $element['w'] = match ($type) {
                    'door_double' => max(120, min(260, $stroke * 20)),
                    'door_garage' => max(140, min(300, $stroke * 24)),
                    default => max(60, min(160, $stroke * 16)),
                };
                $element['h'] = match ($type) {
                    'door_double' => $element['w'] / 2,
                    'door_garage' => min(60, max(36, $element['w'] / 4)),
                    default => $element['w'],
                };
                $element['x'] = max(0, min($width - $element['w'], $x - $element['w'] / 2));
                $element['y'] = max(0, min($height - $element['h'], $y - $element['h'] / 2));
            } elseif (in_array($type, ['wall', 'route', 'line', 'dimension'], true)) {
                $x2 = isset($raw['x2']) && is_numeric($raw['x2']) ? (float) $raw['x2'] : null;
                $y2 = isset($raw['y2']) && is_numeric($raw['y2']) ? (float) $raw['y2'] : null;
                if ($x2 === null || $y2 === null) {
                    throw new DomainException('Un trazo heredado no tiene punto final.');
                }
                $x1 = max(0, min($width, $x));
                $y1 = max(0, min($height, $y));
                $x2 = max(0, min($width, $x2));
                $y2 = max(0, min($height, $y2));
                $minX = min($x1, $x2);
                $minY = min($y1, $y2);
                $boxW = max(2, abs($x2 - $x1));
                $boxH = max(2, abs($y2 - $y1));
                if ($minX + $boxW > $width) {
                    $minX = max(0, $width - $boxW);
                }
                if ($minY + $boxH > $height) {
                    $minY = max(0, $height - $boxH);
                }
                $element['x'] = $minX;
                $element['y'] = $minY;
                $element['w'] = $boxW;
                $element['h'] = $boxH;
                $element['points'] = [
                    ['x' => round($x1 - $minX, 2), 'y' => round($y1 - $minY, 2)],
                    ['x' => round($x2 - $minX, 2), 'y' => round($y2 - $minY, 2)],
                ];
                if ($type === 'wall') {
                    $element['stroke'] = min(40, max(2, $stroke));
                    $element['color'] = '#0f172a';
                } elseif ($type === 'route') {
                    $element['color'] = '#237f52';
                }
            } else {
                $element['w'] = min(240, max(40, $stroke * 20));
                $element['h'] = min(180, max(40, $stroke * 12));
                $element['x'] = max(0, min($width - $element['w'], $x));
                $element['y'] = max(0, min($height - $element['h'], $y));
            }

            $rawId = isset($raw['id']) && is_string($raw['id']) ? preg_replace('/[^A-Za-z0-9_-]/', '', $raw['id']) : '';
            $id = $rawId !== '' ? 'el_' . substr($rawId, 0, 40) : 'el_legacy_' . $sequence;
            $baseId = $id;
            $suffix = 1;
            while (isset($used[$id])) {
                $suffix++;
                $id = substr($baseId, 0, 50) . '_' . $suffix;
            }
            $used[$id] = true;
            $element['id'] = $id;
            $elements[] = $element;
        }

        $design = [
            'format' => 2,
            'canvas' => [
                'width' => $width,
                'height' => $height,
                'grid' => $grid,
                'unit' => 'cm',
                'scale' => '1:100',
                'background' => '#ffffff',
            ],
            'layers' => [['id' => $layerId, 'name' => 'Plano heredado', 'visible' => true, 'locked' => false]],
            'elements' => $elements,
            'groups' => [],
        ];
        return DesignValidator::normalizeArray($design);
    }

    private static function legacyInt(mixed $value, int $min, int $max, int $default): int
    {
        if (!is_numeric($value)) {
            return $default;
        }
        return (int) max($min, min($max, (int) $value));
    }

    private static function legacyNumber(mixed $value, float $min, float $max, string $label): float
    {
        if (!is_numeric($value) || !is_finite((float) $value)) {
            throw new DomainException('El diseño heredado contiene una ' . $label . ' inválida.');
        }
        return max($min, min($max, (float) $value));
    }
}
