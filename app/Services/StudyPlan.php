<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Session;

/**
 * Plano del **modo estudio**.
 *
 * La edición de escritorio «solo editor» no tiene cuentas, ni proyectos, ni base
 * de datos: el plano vive en un archivo del equipo y el servidor PHP solo hace
 * falta para lo que no se puede hacer en el navegador (auditor, informe,
 * impresión y exportación con escala física). Esas cuatro cosas leen el diseño
 * del servidor, no del navegador, así que el editor deja aquí una copia del
 * plano en curso: la sesión es el espejo, el archivo sigue siendo la verdad.
 *
 * Nada de esto toca `storage/`, ni crea tablas, ni migra nada.
 */
final class StudyPlan
{
    /** Clave de la sesión donde vive el espejo del plano. */
    private const KEY = 'estudio_plano';

    /** Nombre con el que se estrena un plano nuevo. */
    public const DEFAULT_NAME = 'Plano sin título';

    /**
     * Plano en curso: nombre y diseño ya normalizado.
     *
     * @return array{name: string, design: array<string,mixed>}
     */
    public static function current(): array
    {
        $raw = Session::get(self::KEY);
        if (!is_array($raw) || !is_array($raw['design'] ?? null)) {
            return ['name' => '', 'design' => self::blank()];
        }
        try {
            $design = DesignValidator::normalizeArray($raw['design']);
        } catch (\DomainException) {
            // Un espejo ilegible no puede impedir abrir el editor: se empieza
            // de cero en vez de mostrar un error que el usuario no provocó.
            $design = self::blank();
        }
        return [
            'name' => self::sanitizeName((string) ($raw['name'] ?? '')),
            'design' => $design,
        ];
    }

    /** @return array<string,mixed> */
    public static function design(): array
    {
        return self::current()['design'];
    }

    public static function name(): string
    {
        return self::current()['name'];
    }

    /**
     * Guarda el espejo de la sesión. Devuelve el diseño normalizado, que es el
     * que de verdad quedará en el archivo al guardarlo.
     *
     * @param array<string,mixed> $design
     * @return array<string,mixed>
     */
    public static function store(array $design, ?string $name = null): array
    {
        $normalized = DesignValidator::normalizeArray($design);
        Session::set(self::KEY, [
            'name' => self::sanitizeName($name ?? self::name()),
            'design' => $normalized,
        ]);
        return $normalized;
    }

    /** Plano nuevo: A4 horizontal a 1:100, cuadrícula de 20 cm, en centímetros. */
    public static function blank(): array
    {
        $blank = DesignFactory::blank(['width' => 1123, 'height' => 794]);
        return DesignValidator::normalizeArray($blank);
    }

    /** Nombre de plano: sin etiquetas ni saltos de línea, y con un tope razonable. */
    public static function sanitizeName(string $value): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', strip_tags($value)) ?? '');
        if ($text === '') {
            return '';
        }
        return mb_substr($text, 0, 120, 'UTF-8');
    }

    /**
     * Datos del pie del plano. En modo estudio no hay empresa ni responsable
     * declarados: se dicen vacíos en vez de inventarlos.
     *
     * @return array<string,mixed>
     */
    public static function footerMeta(string $name): array
    {
        return [
            'project_name' => $name !== '' ? $name : self::DEFAULT_NAME,
            'floor_name' => '',
            'level' => '',
            'site' => '',
            'workplace' => '',
            'responsible' => '',
            'version' => 1,
            'saved_at' => gmdate('c'),
        ];
    }
}
