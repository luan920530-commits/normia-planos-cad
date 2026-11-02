<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/**
 * Fallo de esquema que no se puede silenciar.
 *
 * `Database::migrate()` tolera los pasos que solo añaden tablas o columnas
 * (la aplicación puede seguir funcionando sin ellos hasta el siguiente
 * arranque), pero **no** puede seguir cuando una migración que reescribe datos
 * se queda a medias: continuar dejaría la instalación mintiendo sobre su
 * esquema. Este error detiene la petición con una página de error.
 */
final class SchemaException extends RuntimeException
{
}
