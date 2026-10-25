<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

final class View
{
    /** @param array<string,mixed> $data */
    public static function render(string $view, array $data = [], ?string $layout = 'layout'): void
    {
        $file = BASE_PATH . '/app/Views/' . $view . '.php';
        if (!is_file($file)) {
            throw new RuntimeException('Vista no encontrada: ' . $view);
        }
        $data['user'] = $data['user'] ?? Auth::user();
        $data['flashes'] = $data['flashes'] ?? Session::flashes();
        $data['csrfToken'] = Csrf::token();
        extract($data, EXTR_SKIP);
        ob_start();
        require $file;
        $content = (string) ob_get_clean();

        if ($layout === null) {
            echo $content;
            return;
        }
        $layoutFile = BASE_PATH . '/app/Views/' . $layout . '.php';
        if (!is_file($layoutFile)) {
            throw new RuntimeException('Layout no encontrado: ' . $layout);
        }
        require $layoutFile;
    }

    /** @param array<string,mixed> $data */
    public static function partial(string $view, array $data = []): void
    {
        $file = BASE_PATH . '/app/Views/' . $view . '.php';
        if (!is_file($file)) {
            return;
        }
        extract($data, EXTR_SKIP);
        require $file;
    }
}
