<?php
declare(strict_types=1);

namespace App\Core;

final class Response
{
    public static function status(int $code): void
    {
        http_response_code($code);
    }

    public static function header(string $name, string $value): void
    {
        header($name . ': ' . $value);
    }

    public static function html(string $html, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=UTF-8');
        echo $html;
        exit;
    }

    /** @param array<string,mixed> $data */
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function redirect(string $url, int $status = 303): never
    {
        http_response_code($status);
        header('Location: ' . $url, true, $status);
        exit;
    }

    public static function download(string $filename, string $contents, string $contentType): never
    {
        $filename = preg_replace('/[^A-Za-z0-9._-]+/', '-', $filename) ?: 'plano';
        header('Content-Type: ' . $contentType);
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($contents));
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo $contents;
        exit;
    }
}
