<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Inventario verificable de un plano.
 *
 * Separa los elementos que se pueden revisar en sitio (equipos, señalización,
 * puertas, extintores) de los trazos del dibujo (muros, rutas, textos). El
 * sector es la capa del plano; si el dibujo no usa capas se agrupa en «General».
 */
final class VerificationInventory
{
    /** Trazos y anotaciones que no se verifican en sitio. */
    private const SKIP = [
        'wall', 'curve', 'room', 'text', 'dimension', 'route', 'sidewalk', 'parking',
        'crosswalk', 'road', 'roadside', 'zone', 'hatch', 'line', 'rect', 'ellipse',
        'polyline', 'arrow', 'group',
    ];

    /**
     * @return list<array{id:string,type:string,name:string,sector:string,x:float,y:float}>
     */
    public static function items(array $design): array
    {
        $layers = [];
        foreach ($design['layers'] ?? [] as $layer) {
            $layers[(string) $layer['id']] = trim((string) ($layer['name'] ?? '')) ?: 'General';
        }
        $items = [];
        foreach ($design['elements'] ?? [] as $element) {
            $type = (string) ($element['type'] ?? '');
            if ($type === '' || in_array($type, self::SKIP, true)) {
                continue;
            }
            $id = (string) ($element['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $label = trim((string) ($element['label'] ?? ''));
            $items[] = [
                'id' => $id,
                'type' => $type,
                'name' => $label !== '' ? $label : self::nameFor($type),
                'sector' => $layers[(string) ($element['layerId'] ?? '')] ?? 'General',
                'x' => (float) ($element['x'] ?? 0) + (float) ($element['w'] ?? 0) / 2,
                'y' => (float) ($element['y'] ?? 0) + (float) ($element['h'] ?? 0) / 2,
            ];
        }
        return $items;
    }

    /** Nombre legible del tipo: catálogo CAD, señalización o trazo. */
    public static function nameFor(string $type): string
    {
        $cad = LibraryRepository::cadObject($type);
        if ($cad !== null) {
            return (string) ($cad['name'] ?? $type);
        }
        $code = LibraryRepository::codeForType($type);
        if ($code !== null) {
            $sign = LibraryRepository::sign($code);
            if ($sign !== null) {
                return (string) ($sign['name'] ?? $code);
            }
            return 'Señal ' . $code;
        }
        return match ($type) {
            'door' => 'Puerta',
            'door_double' => 'Puerta doble',
            'door_garage' => 'Puerta de garaje',
            'extinguisher' => 'Extintor',
            default => ucfirst(str_replace('_', ' ', $type)),
        };
    }

    /** Etiqueta corta de la familia de un tipo para agrupar la cobertura. */
    public static function family(string $type): string
    {
        $cad = LibraryRepository::cadObject($type);
        if ($cad !== null) {
            $category = (string) ($cad['category'] ?? '');
            return LibraryRepository::cadCategories()[$category]['name'] ?? 'Equipamiento';
        }
        if (LibraryRepository::codeForType($type) !== null) {
            return 'Señalización';
        }
        return match ($type) {
            'door', 'door_double', 'door_garage' => 'Puertas',
            default => 'Otros elementos',
        };
    }

    /**
     * Cobertura y alertas para la página de verificación.
     *
     * @param list<array<string,mixed>> $items
     * @param array<string,array<string,mixed>> $latest
     * @return array{total:int,verified:int,issues:int,pending:int,stale:int,percent:int,byFamily:list<array<string,mixed>>,bySector:list<array<string,mixed>>,staleDays:int}
     */
    public static function coverage(array $items, array $latest, int $staleDays): array
    {
        $limit = time() - max(1, $staleDays) * 86400;
        $total = count($items);
        $verified = 0;
        $issues = 0;
        $pending = 0;
        $stale = 0;
        $byFamily = [];
        $bySector = [];
        foreach ($items as $item) {
            $check = $latest[$item['id']] ?? null;
            $ok = $check !== null && (string) $check['status'] !== 'pending';
            $hasIssue = $check !== null && (string) $check['status'] === 'issue';
            $when = $check !== null ? strtotime((string) $check['checked_at'] . ' UTC') : false;
            $isStale = $when === false || $when < $limit;
            if ($ok) {
                $verified++;
            } else {
                $pending++;
            }
            if ($hasIssue) {
                $issues++;
            }
            if ($isStale) {
                $stale++;
            }
            $family = self::family($item['type']);
            $byFamily[$family] ??= ['name' => $family, 'total' => 0, 'verified' => 0, 'issues' => 0];
            $byFamily[$family]['total']++;
            $byFamily[$family]['verified'] += $ok ? 1 : 0;
            $byFamily[$family]['issues'] += $hasIssue ? 1 : 0;
            $sector = $item['sector'];
            $bySector[$sector] ??= ['name' => $sector, 'total' => 0, 'verified' => 0, 'issues' => 0];
            $bySector[$sector]['total']++;
            $bySector[$sector]['verified'] += $ok ? 1 : 0;
            $bySector[$sector]['issues'] += $hasIssue ? 1 : 0;
        }
        $percent = static function (array $row): array {
            $row['percent'] = $row['total'] > 0 ? (int) round($row['verified'] * 100 / $row['total']) : 0;
            return $row;
        };
        return [
            'total' => $total,
            'verified' => $verified,
            'issues' => $issues,
            'pending' => $pending,
            'stale' => $stale,
            'percent' => $total > 0 ? (int) round($verified * 100 / $total) : 0,
            'byFamily' => array_values(array_map($percent, $byFamily)),
            'bySector' => array_values(array_map($percent, $bySector)),
            'staleDays' => $staleDays,
        ];
    }
}
