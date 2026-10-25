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
    public function json(): array
    {
        if ($this->jsonParsed) {
            return $this->json ?? [];
        }
        $this->jsonParsed = true;
        $raw = $this->rawBody();
        if ($raw === '' || strlen($raw) > 2_500_000) {
            $this->json = [];
            return $this->json;
        }
        try {
            $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
            $this->json = is_array($decoded) ? $decoded : [];
        } catch (JsonException) {
            $this->json = [];
        }
        return $this->json;
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
