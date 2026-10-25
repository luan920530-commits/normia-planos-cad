<?php
declare(strict_types=1);

/**
 * Normia Planos CAD · ejemplo de configuración.
 *
 * El instalador web genera automáticamente config/config.php con una clave
 * aleatoria y un nombre de base de datos único. NO copies este archivo como
 * config/config.php en producción sin cambiar la ruta y la clave.
 *
 * Este archivo es solo una referencia para despliegues automatizados.
 */
return [
    // Ruta absoluta o relativa al archivo SQLite de la instalación.
    'database' => __DIR__ . '/../storage/normia.sqlite',
    // Nombre de la cookie de sesión (solo letras, números y guiones bajos).
    'session_name' => 'normia_sid',
    // Clave secreta de 64 caracteres hexadecimales. Genera una nueva con:
    // php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
    'app_key' => 'cambia-esta-clave-por-una-aleatoria-de-64-hexadecimales',
    // Zona horaria usada para mostrar fechas y versiones.
    'timezone' => 'America/Bogota',
    // true solo en paquetes de demostración.
    'demo' => false,
    // Fecha ISO 8601 de la instalación.
    'installed_at' => null,
];
