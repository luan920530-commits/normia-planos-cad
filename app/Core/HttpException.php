<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/**
 * Error de la petición con su código HTTP y un código de máquina.
 *
 * Existe para no confundir tres cosas que antes se veían iguales: un cuerpo
 * vacío, un cuerpo que no es JSON y un cuerpo demasiado grande. El cliente
 * recibe el estado correcto y un código estable (`empty_body`, `invalid_json`,
 * `payload_too_large`) para poder explicar qué pasó.
 */
final class HttpException extends RuntimeException
{
    public function __construct(
        private readonly int $status,
        private readonly string $errorCode,
        string $message
    ) {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }
}
