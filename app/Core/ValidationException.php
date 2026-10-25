<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

final class ValidationException extends RuntimeException
{
    /** @var array<string,string> */
    private array $errors;

    /** @param array<string,string> $errors */
    public function __construct(array $errors, string $message = 'Revisa los datos ingresados.')
    {
        parent::__construct($message);
        $this->errors = $errors;
    }

    /** @return array<string,string> */
    public function errors(): array
    {
        return $this->errors;
    }
}
