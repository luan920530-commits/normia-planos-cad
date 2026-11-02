<?php
declare(strict_types=1);

namespace App\Services;

use RuntimeException;

/**
 * Escritor de archivos ZIP sin compresión, sin extensiones.
 *
 * El PHP empaquetado para escritorio y Android no siempre incluye `ZipArchive`,
 * así que el respaldo no puede depender de ella. Esto escribe ZIP «store»
 * (método 0): cualquier descompresor de macOS, Windows o Linux lo abre, y el
 * contenido ya viene comprimido en buena parte (SQLite y SVG).
 *
 * Limitaciones declaradas: sin ZIP64 (máximo 4 GB por archivo y en total) y sin
 * cifrado. Si se supera el límite, se lanza una excepción en vez de generar un
 * archivo que no se pueda abrir.
 */
final class ZipWriter
{
    private const MAX_BYTES = 4_000_000_000;

    /** @var list<string> */
    private array $names = [];

    /** @var list<array{name:string,crc:int,size:int,offset:int,time:int,date:int}> */
    private array $entries = [];

    private string $data = '';

    /**
     * Añade un archivo desde disco. El nombre interno usa `/` y no admite
     * rutas absolutas ni `..`.
     */
    public function addFile(string $path, string $name): void
    {
        if (!is_file($path) || !is_readable($path)) {
            throw new RuntimeException('No se pudo leer el archivo para el respaldo: ' . basename($path));
        }
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException('No se pudo leer el archivo para el respaldo: ' . basename($path));
        }
        $this->addFromString($name, $contents, (int) filemtime($path));
    }

    public function addFromString(string $name, string $contents, ?int $modifiedAt = null): void
    {
        $name = $this->sanitize($name);
        if (strlen($contents) > self::MAX_BYTES || strlen($this->data) + strlen($contents) > self::MAX_BYTES) {
            throw new RuntimeException('El respaldo supera el límite de 4 GB de este formato.');
        }
        if (isset($this->names[$name])) {
            throw new RuntimeException('El respaldo tendría dos entradas con el mismo nombre: ' . $name);
        }
        $this->names[$name] = $name;
        [$time, $date] = $this->dosTime($modifiedAt ?? time());
        $offset = strlen($this->data);
        $crc = crc32($contents);
        $size = strlen($contents);

        $this->data .= pack('V', 0x04034b50)
            . pack('v', 20)              // versión necesaria
            . pack('v', 0x0800)          // nombres en UTF-8
            . pack('v', 0)               // método: sin compresión
            . pack('v', $time)
            . pack('v', $date)
            . pack('V', $crc)
            . pack('V', $size)           // comprimido
            . pack('V', $size)           // sin comprimir
            . pack('v', strlen($name))
            . pack('v', 0)               // extra
            . $name
            . $contents;

        $this->entries[] = ['name' => $name, 'crc' => $crc, 'size' => $size, 'offset' => $offset, 'time' => $time, 'date' => $date];
    }

    /** Devuelve el ZIP completo. */
    public function bytes(): string
    {
        $central = '';
        foreach ($this->entries as $entry) {
            $name = $entry['name'];
            $central .= pack('V', 0x02014b50)
                . pack('v', 20)          // versión que lo creó
                . pack('v', 20)          // versión necesaria
                . pack('v', 0x0800)
                . pack('v', 0)
                . pack('v', $entry['time'])
                . pack('v', $entry['date'])
                . pack('V', $entry['crc'])
                . pack('V', $entry['size'])
                . pack('V', $entry['size'])
                . pack('v', strlen($name))
                . pack('v', 0)           // extra
                . pack('v', 0)           // comentario
                . pack('v', 0)           // disco
                . pack('v', 0)           // atributos internos
                . pack('V', 0)           // atributos externos
                . pack('V', $entry['offset'])
                . $name;
        }

        $offset = strlen($this->data);
        $end = $this->data . $central . pack('V', 0x06054b50)
            . pack('v', 0)
            . pack('v', 0)
            . pack('v', count($this->entries))
            . pack('v', count($this->entries))
            . pack('V', strlen($central))
            . pack('V', $offset)
            . pack('v', 0);

        return $end;
    }

    public function writeTo(string $path): int
    {
        $bytes = $this->bytes();
        if (file_put_contents($path, $bytes, LOCK_EX) === false) {
            throw new RuntimeException('No se pudo escribir el respaldo en disco.');
        }
        return strlen($bytes);
    }

    public function count(): int
    {
        return count($this->entries);
    }

    private function sanitize(string $name): string
    {
        $name = str_replace('\\', '/', trim($name));
        $name = ltrim($name, '/');
        $parts = array_values(array_filter(
            explode('/', $name),
            static fn (string $part): bool => $part !== '' && $part !== '.' && $part !== '..'
        ));
        if ($parts === []) {
            throw new RuntimeException('Nombre de archivo inválido dentro del respaldo.');
        }
        if (strlen(implode('/', $parts)) > 200) {
            throw new RuntimeException('El nombre de un archivo del respaldo es demasiado largo.');
        }
        return implode('/', $parts);
    }

    /** @return array{0:int,1:int} hora y fecha en formato MS-DOS. */
    private function dosTime(int $timestamp): array
    {
        $year = max(1980, (int) date('Y', $timestamp));
        $time = ((int) date('H', $timestamp) << 11) | ((int) date('i', $timestamp) << 5) | (int) ((int) date('s', $timestamp) / 2);
        $date = (($year - 1980) << 9) | ((int) date('n', $timestamp) << 5) | (int) date('j', $timestamp);
        return [$time, $date];
    }
}
