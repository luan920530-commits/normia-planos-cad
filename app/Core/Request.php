<?php
declare(strict_types=1);

namespace App\Core;

use JsonException;

final class Request
{
    private string $method;
    private string $route;
    private array $query;
    private array $body;
    private array $files;
    public const MAX_JSON_BYTES = 2_500_000;

    private ?array $json = null;
    private bool $jsonParsed = false;

    public function __construct()
    {
        $this->method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        $this->query = $_GET;
        $this->body = $_POST;
        $this->files = $_FILES;
        $this->route = self::normalizeRoute((string) ($_GET['r'] ?? $_SERVER['PATH_INFO'] ?? ''));
    }

    public static function normalizeRoute(string $route): string
    {
        $route = trim(str_replace('\\', '/', $route));
        $route = trim($route, '/');
        $route = preg_replace('#/+#', '/', $route) ?? '';
        if ($route !== '' && preg_match('#^[A-Za-z0-9_\-/.]+$#D', $route) !== 1) {
            return '';
        }
        return $route;
    }

    public function method(): string
    {
        return $this->method;
    }

    public function isPost(): bool
    {
        return $this->method === 'POST';
    }

    public function route(): string
    {
        return $this->route;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        return $this->query[$key] ?? $default;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    public function string(string $key, string $default = ''): string
    {
        $value = $this->input($key, $default);
        return is_string($value) ? trim($value) : $default;
    }

    public function integer(string $key, int $default = 0): int
    {
        $value = $this->input($key, $default);
        return is_numeric($value) ? (int) $value : $default;
    }

    public function boolean(string $key): bool
    {
        $value = $this->input($key, null);
        return in_array($value, ['1', 1, true, 'true', 'on'], true);
    }

    public function all(): array
    {
        return array_merge($this->query, $this->body);
    }

    /** @return array<string,mixed> */
    /**
     * Cuerpo JSON de la petición.
     *
     * Distingue los tres casos que antes devolvían `[]` por igual y acababan en
     * un 422 engañoso («no contiene un diseño válido»), aunque el problema fuera
     * otro:
     *
     * - cuerpo vacío → **400** `empty_body`
     * - JSON mal formado o que no es un objeto → **400** `invalid_json`
     * - más de 2,5 MB → **413** `payload_too_large`
     *
     * Un JSON válido al que le falten campos lo valida el controlador y responde
     * **422**, como antes.
     *
     * @return array<string,mixed>
     * @throws HttpException
     */
    public function json(): array
    {
        if ($this->jsonParsed) {
            return $this->json ?? [];
        }
        $this->jsonParsed = true;
        // Un formulario normal (multipart o urlencoded) no trae cuerpo JSON:
        // eso no es un error, simplemente no hay JSON que leer.
        if (!$this->isJsonRequest()) {
            return $this->json = [];
        }
        $raw = $this->rawBody();
        if (trim($raw) === '') {
            throw new HttpException(400, 'empty_body', 'La solicitud llegó sin contenido. Recarga la página e inténtalo de nuevo.');
        }
        if (strlen($raw) > self::MAX_JSON_BYTES) {
            throw new HttpException(
                413,
                'payload_too_large',
                'El contenido supera el límite de ' . self::limitLabel() . '. Reduce el plano (menos objetos o imágenes más ligeras) y vuelve a guardar.'
            );
        }
        try {
            $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new HttpException(400, 'invalid_json', 'El contenido no es un JSON válido. Recarga la página e inténtalo de nuevo.');
        }
        if (!is_array($decoded)) {
            throw new HttpException(400, 'invalid_json', 'El contenido no es un objeto JSON válido.');
        }
        $this->json = $decoded;
        return $this->json;
    }

    /** ¿La petición declara que envía JSON? */
    public function isJsonRequest(): bool
    {
        $type = (string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
        return stripos($type, 'application/json') !== false
            || stripos($type, 'text/json') !== false;
    }

    /** Límite de tamaño del cuerpo JSON, en un solo sitio. */
    public static function limitLabel(): string
    {
        return round(self::MAX_JSON_BYTES / 1_000_000, 1) . ' MB';
    }

    public function rawBody(): string
    {
        $raw = file_get_contents('php://input');
        return $raw === false ? '' : $raw;
    }

    public function file(string $key): ?array
    {
        $file = $this->files[$key] ?? null;
        return is_array($file) ? $file : null;
    }

    public function header(string $name): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? $_SERVER[strtoupper(str_replace('-', '_', $name))] ?? '';
        return is_string($value) ? trim($value) : '';
    }

    public function csrfToken(): string
    {
        $header = $this->header('X-CSRF-Token');
        if ($header !== '') {
            return $header;
        }
        $token = $this->input('_token', '');
        return is_string($token) ? $token : '';
    }

    public function wantsJson(): bool
    {
        $accept = strtolower($this->header('Accept'));
        $contentType = strtolower($this->header('Content-Type'));
        return str_contains($accept, 'application/json') || str_contains($contentType, 'application/json')
            || str_starts_with($this->route, 'api/');
    }

    public function ip(): string
    {
        return client_ip();
    }
}
