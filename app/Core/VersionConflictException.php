<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

final class VersionConflictException extends RuntimeException
{
    private int $currentVersion;

    public function __construct(int $currentVersion, string $message = 'Otra sesión guardó una versión más reciente. Tu trabajo permanece en pantalla.')
    {
        parent::__construct($message);
        $this->currentVersion = $currentVersion;
    }

    public function currentVersion(): int
    {
        return $this->currentVersion;
    }
}
