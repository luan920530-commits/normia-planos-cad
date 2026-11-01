<?php
declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

/**
 * Verificación física de los elementos de un plano.
 *
 * Cada verificación es una fila nueva (historial completo). El estado vigente
 * de un elemento es la última verificación registrada. Las rondas agrupan las
 * verificaciones de una jornada para poder revisar después quién, cuándo y qué
 * encontró.
 */
final class Check
{
    public const STATUSES = ['pending', 'ok', 'issue'];
    public const LABELS = ['pending' => 'Pendiente', 'ok' => 'Verificado', 'issue' => 'Con novedad'];
    public const MAX_NOTE = 600;
    public const MAX_PHOTO = 524288; // 512 KB
    public const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    /** Última verificación por elemento. @return array<string,array<string,mixed>> */
    public static function latest(int $floorId): array
    {
        $rows = Database::query(
            'SELECT c.*, u.name AS author
             FROM element_checks c
             LEFT JOIN users u ON u.id = c.checked_by
             WHERE c.floor_id = ?
             ORDER BY c.checked_at ASC, c.id ASC',
            [$floorId]
        );
        $latest = [];
        foreach ($rows as $row) {
            $latest[(string) $row['element_id']] = $row;
        }
        return $latest;
    }

    /** Historial de verificaciones de un elemento (más reciente primero). @return list<array<string,mixed>> */
    public static function historyFor(int $floorId, string $elementId, int $limit = 20): array
    {
        return Database::query(
            'SELECT c.*, u.name AS author FROM element_checks c
             LEFT JOIN users u ON u.id = c.checked_by
             WHERE c.floor_id = ? AND c.element_id = ?
             ORDER BY c.checked_at DESC, c.id DESC LIMIT ' . max(1, $limit),
            [$floorId, $elementId]
        );
    }

    /** Rondas del piso con el conteo de verificaciones. @return list<array<string,mixed>> */
    public static function rounds(int $floorId): array
    {
        return Database::query(
            'SELECT r.*, started.name AS started_name, closed.name AS closed_name,
                    (SELECT COUNT(*) FROM element_checks c WHERE c.round_id = r.id) AS checks,
                    (SELECT COUNT(*) FROM element_checks c WHERE c.round_id = r.id AND c.status = "issue") AS issues
             FROM verification_rounds r
             LEFT JOIN users started ON started.id = r.started_by
             LEFT JOIN users closed ON closed.id = r.closed_by
             WHERE r.floor_id = ?
             ORDER BY r.id DESC LIMIT 24',
            [$floorId]
        );
    }

    public static function openRound(int $floorId): ?array
    {
        return Database::first(
            'SELECT r.*, u.name AS author FROM verification_rounds r
             LEFT JOIN users u ON u.id = r.started_by
             WHERE r.floor_id = ? AND r.status = "open" ORDER BY r.id DESC LIMIT 1',
            [$floorId]
        );
    }

    public static function startRound(int $floorId, int $userId, string $note = ''): int
    {
        $open = self::openRound($floorId);
        if ($open !== null) {
            return (int) $open['id'];
        }
        Database::execute(
            'INSERT INTO verification_rounds (floor_id, status, note, started_by) VALUES (?, "open", ?, ?)',
            [$floorId, text_limit(trim($note), 200), $userId]
        );
        return Database::lastId();
    }

    public static function closeRound(int $floorId, int $userId, int $roundId): bool
    {
        $round = Database::first(
            'SELECT id FROM verification_rounds WHERE id = ? AND floor_id = ? AND status = "open"',
            [$roundId, $floorId]
        );
        if ($round === null) {
            return false;
        }
        Database::execute(
            'UPDATE verification_rounds SET status = "closed", closed_by = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$userId, $roundId]
        );
        return true;
    }

    /**
     * Registra una verificación. La foto es opcional y se guarda en la base
     * como respaldo pequeño (512 KB como máximo).
     *
     * @param array{status:string,note?:string,element_type?:string,sector?:string,photo?:array<string,mixed>|null,round_id?:int|null} $data
     */
    public static function record(int $floorId, int $userId, string $elementId, array $data): int
    {
        $status = in_array($data['status'] ?? '', self::STATUSES, true) ? (string) $data['status'] : 'pending';
        $note = text_limit(trim((string) ($data['note'] ?? '')), self::MAX_NOTE);
        $photo = $data['photo'] ?? null;
        $blob = null;
        $photoType = '';
        $photoName = '';
        if (is_array($photo) && isset($photo['tmp_name'], $photo['size']) && (int) $photo['size'] > 0) {
            $stored = self::photoBlob($photo);
            if ($stored !== null) {
                // Se guarda en base64: el binario crudo se corta en algunos
                // controladores SQLite empaquetados (PHP de escritorio).
                $blob = base64_encode($stored['bytes']);
                $photoType = $stored['type'];
                $photoName = text_limit(basename((string) ($photo['name'] ?? 'evidencia')), 80);
            }
        }
        $roundId = isset($data['round_id']) && (int) $data['round_id'] > 0 ? (int) $data['round_id'] : null;
        if ($roundId === null) {
            $open = self::openRound($floorId);
            $roundId = $open !== null ? (int) $open['id'] : null;
        }
        Database::pdo()->prepare(
            'INSERT INTO element_checks
                (floor_id, round_id, element_id, element_type, sector, status, note, photo, photo_type, photo_name, checked_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $floorId,
            $roundId,
            text_limit($elementId, 120),
            text_limit((string) ($data['element_type'] ?? ''), 80),
            text_limit((string) ($data['sector'] ?? ''), 80),
            $status,
            $note,
            $blob,
            $photoType,
            $photoName,
            $userId,
        ]);
        return Database::lastId();
    }

    public static function photo(int $floorId, int $checkId, int $userId): ?array
    {
        $row = Database::first(
            'SELECT c.photo, c.photo_type, c.photo_name FROM element_checks c
             JOIN floors f ON f.id = c.floor_id JOIN projects p ON p.id = f.project_id
             WHERE c.id = ? AND c.floor_id = ? AND p.user_id = ? AND c.photo IS NOT NULL',
            [$checkId, $floorId, $userId]
        );
        if ($row === null || !is_string($row['photo']) || $row['photo'] === '') {
            return null;
        }
        $bytes = base64_decode((string) $row['photo'], true);
        if ($bytes === false) {
            return null;
        }
        $row['bytes'] = $bytes;
        return $row;
    }

    public static function setStaleDays(int $floorId, int $days): int
    {
        $days = max(1, min(365, $days));
        Database::execute('UPDATE floors SET check_days = ? WHERE id = ?', [$days, $floorId]);
        return $days;
    }

    /**
     * Lee la foto y detecta su tipo por los primeros bytes. No se usa
     * `getimagesize` para no depender de la extensión GD, que no está en todas
     * las instalaciones (ni en el PHP del escritorio).
     *
     * @param array<string,mixed> $file
     * @return array{bytes:string,type:string}|null
     */
    private static function photoBlob(array $file): ?array
    {
        if ((int) ($file['size'] ?? 0) > self::MAX_PHOTO) {
            return null;
        }
        $path = (string) ($file['tmp_name'] ?? '');
        if ($path === '' || !is_readable($path)) {
            return null;
        }
        $bytes = (string) file_get_contents($path);
        if ($bytes === '' || strlen($bytes) > self::MAX_PHOTO) {
            return null;
        }
        $type = self::detectType($bytes);
        return $type === null ? null : ['bytes' => $bytes, 'type' => $type];
    }

    private static function detectType(string $bytes): ?string
    {
        if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return 'image/png';
        }
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
            return 'image/jpeg';
        }
        if (str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP') {
            return 'image/webp';
        }
        if (str_starts_with($bytes, 'GIF87a') || str_starts_with($bytes, 'GIF89a')) {
            return 'image/gif';
        }
        return null;
    }
}
