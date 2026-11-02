<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use DateTimeImmutable;
use DateTimeZone;
use Throwable;

/**
 * Conservación del historial de un piso.
 *
 * Cada guardado guarda el plano completo en `floor_versions`, así que el
 * historial crece sin freno. Esta política decide qué se puede borrar **sin
 * perder nada que importe**:
 *
 * - todo lo de los últimos 30 días;
 * - de 30 a 180 días, una versión por día (la última de cada día);
 * - de 180 días en adelante, una por mes (la última de cada mes);
 * - y nunca la versión vigente, la inicial, la última, ni las fijadas a mano.
 *
 * El cálculo es puro: `plan()` no borra nada y `prune()` solo elimina los ids
 * que, recalculados en ese instante, siguen siendo candidatos. Nunca se ejecuta
 * sola: la llama una persona desde la interfaz, después de ver la simulación y
 * con un respaldo previo.
 */
final class VersionRetention
{
    /** Días completos que se conservan íntegros. */
    public const KEEP_DAYS = 30;

    /** Desde aquí, una versión por mes en lugar de una por día. */
    public const KEEP_DAILY_DAYS = 180;

    /**
     * Qué se conservaría y qué se podría borrar en este piso.
     *
     * @return array{
     *   total:int, kept:int, candidates:list<array<string,mixed>>,
     *   protected:list<array{version:int,reason:string}>, bytes:int, freed:int
     * }
     */
    public static function plan(int $floorId, ?DateTimeImmutable $now = null): array
    {
        $now ??= new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $floor = Database::first('SELECT version FROM floors WHERE id = ?', [$floorId]);
        $current = $floor === null ? 0 : (int) $floor['version'];

        $rows = Database::query(
            'SELECT id, version, note, created_at, pinned, LENGTH(design_json) AS bytes
             FROM floor_versions WHERE floor_id = ? ORDER BY version ASC',
            [$floorId]
        );
        if ($rows === []) {
            return ['total' => 0, 'kept' => 0, 'candidates' => [], 'protected' => [], 'bytes' => 0, 'freed' => 0];
        }

        $versions = array_map(static fn (array $row): int => (int) $row['version'], $rows);
        $first = min($versions);
        $last = max($versions);

        $keep = [];
        $protected = [];
        foreach ($rows as $row) {
            $version = (int) $row['version'];
            $reason = '';
            if ($version === $current) {
                $reason = 'vigente';
            } elseif ($version === $first) {
                $reason = 'inicial';
            } elseif ($version === $last) {
                $reason = 'última';
            } elseif ((int) $row['pinned'] === 1) {
                $reason = 'fijada';
            }
            if ($reason !== '') {
                $keep[$version] = true;
                $protected[] = ['version' => $version, 'reason' => $reason];
            }
        }

        $days = [];
        $months = [];
        foreach ($rows as $row) {
            $version = (int) $row['version'];
            if (isset($keep[$version])) {
                continue;
            }
            $created = self::parse((string) $row['created_at']);
            if ($created === null) {
                // Sin fecha legible no se borra: ante la duda, se conserva.
                $keep[$version] = true;
                $protected[] = ['version' => $version, 'reason' => 'sin fecha'];
                continue;
            }
            $age = $now->getTimestamp() - $created->getTimestamp();
            if ($age <= self::KEEP_DAYS * 86400) {
                $keep[$version] = true;
                continue;
            }
            if ($age <= self::KEEP_DAILY_DAYS * 86400) {
                $key = $created->format('Y-m-d');
                $days[$key] = max($days[$key] ?? 0, $version);
            } else {
                $key = $created->format('Y-m');
                $months[$key] = max($months[$key] ?? 0, $version);
            }
        }
        foreach ([$days, $months] as $buckets) {
            foreach ($buckets as $version) {
                $keep[$version] = true;
            }
        }

        $candidates = [];
        $freed = 0;
        $totalBytes = 0;
        foreach ($rows as $row) {
            $totalBytes += (int) $row['bytes'];
            if (isset($keep[(int) $row['version']])) {
                continue;
            }
            $freed += (int) $row['bytes'];
            $candidates[] = [
                'id' => (int) $row['id'],
                'version' => (int) $row['version'],
                'note' => (string) $row['note'],
                'created_at' => (string) $row['created_at'],
                'bytes' => (int) $row['bytes'],
            ];
        }
        usort($candidates, static fn (array $a, array $b): int => $a['version'] <=> $b['version']);

        return [
            'total' => count($rows),
            'kept' => count($keep),
            'candidates' => $candidates,
            'protected' => $protected,
            'bytes' => $totalBytes,
            'freed' => $freed,
        ];
    }

    /**
     * Borra las versiones indicadas **si siguen siendo candidatas**.
     *
     * Vuelve a calcular el plan en el momento del borrado, de modo que un id
     * que dejó de ser candidato (porque alguien la fijó o se volvió la vigente)
     * se queda donde está.
     *
     * @param list<int> $ids
     * @return array{deleted:int,skipped:int}
     */
    public static function prune(int $floorId, array $ids): array
    {
        $plan = self::plan($floorId);
        $allowed = [];
        foreach ($plan['candidates'] as $candidate) {
            $allowed[(int) $candidate['id']] = true;
        }
        $targets = [];
        foreach ($ids as $id) {
            $id = (int) $id;
            if (isset($allowed[$id])) {
                $targets[$id] = true;
            }
        }
        if ($targets === []) {
            return ['deleted' => 0, 'skipped' => count($ids)];
        }
        $deleted = 0;
        foreach (array_chunk(array_keys($targets), 200) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '?'));
            $deleted += Database::execute(
                'DELETE FROM floor_versions WHERE floor_id = ? AND id IN (' . $placeholders . ') AND pinned = 0',
                array_merge([$floorId], $chunk)
            );
        }
        self::log($floorId, $deleted, count($ids) - $deleted);
        return ['deleted' => $deleted, 'skipped' => count($ids) - $deleted];
    }

    /** Fija o suelta una versión para que la política nunca la toque. */
    public static function pin(int $floorId, int $versionId, bool $pinned): bool
    {
        return Database::execute(
            'UPDATE floor_versions SET pinned = ? WHERE id = ? AND floor_id = ?',
            [$pinned ? 1 : 0, $versionId, $floorId]
        ) === 1;
    }

    private static function parse(string $value): ?DateTimeImmutable
    {
        $utc = new DateTimeZone('UTC');
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        try {
            $date = new DateTimeImmutable($value, $utc);
            return $date->setTimezone($utc);
        } catch (Throwable) {
            return null;
        }
    }

    private static function log(int $floorId, int $deleted, int $skipped): void
    {
        $line = gmdate('c') . ' poda piso ' . $floorId . ': ' . $deleted . ' versiones eliminadas, '
            . $skipped . ' omitidas' . PHP_EOL;
        @file_put_contents(\App\Core\Paths::logs() . '/retencion.log', $line, FILE_APPEND | LOCK_EX);
    }
}
