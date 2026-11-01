<?php
declare(strict_types=1);

/**
 * Normia Planos CAD · punto de arranque.
 * Compatible con PHP 8.1 y 8.3. Sin dependencias externas.
 */

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>PHP no compatible</title>'
        . '<p style="font-family:system-ui;padding:2rem">Normia Planos CAD requiere PHP 8.1 o superior. '
        . 'La versión disponible es ' . htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8') . '.</p>';
    exit;
}

define('BASE_PATH', __DIR__);
define('NORMA_VERSION', '1.15.5');

require BASE_PATH . '/app/Core/Autoloader.php';
App\Core\Autoloader::register(BASE_PATH . '/app');

require BASE_PATH . '/app/Support/helpers.php';

App\Core\Config::boot(BASE_PATH);
date_default_timezone_set((string) App\Core\Config::get('timezone', 'America/Bogota'));
App\Core\Application::run();
