<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Autoridad única de unidades y conversiones físicas del plano.
 *
 * Una unidad del lienzo equivale a la unidad declarada del plano (`canvas.unit`):
 * `mm`, `cm` o `m`. Esta clase es el **único** lugar donde ese factor se define;
 * el resto del código delega aquí. Nace para la etapa 0 de NORMIA-004, donde
 * había siete definiciones del mismo factor repartidas entre PHP y JavaScript.
 *
 * Reglas que el resto del código puede dar por ciertas:
 *
 * 1. **No se redondea al convertir.** El redondeo es de presentación y ocurre en
 *    el consumidor. Aquí solo se multiplica o se divide.
 * 2. **Una unidad desconocida, `null` o vacía se interpreta como `cm`**, igual
 *    que hacían los conversores anteriores. No se lanza excepción: hay planos
 *    antiguos y JSON editados a mano que hoy se abren así.
 * 3. **La escala de impresión (`1:N`) no interviene en ninguna longitud.** Solo
 *    se expone su denominador para la etapa 1; aquí no se aplica a nada.
 * 4. **`stroke` y `fontSize` no se convierten**: son unidades de dibujo, no
 *    medidas físicas.
 *
 * Sin dependencias: no usa base de datos, configuración ni servicios, de modo
 * que se puede probar en aislamiento.
 */
final class Units
{
    /** Unidades admitidas por el formato del plano. */
    public const SUPPORTED = ['mm', 'cm', 'm'];

    /** Unidad con la que se interpreta un plano que no declara ninguna. */
    public const DEFAULT_UNIT = 'cm';

    /** Tolerancia de aplanado de arcos, en centímetros. */
    public const TOLERANCE_CM = 0.5;

    /**
     * Centímetros por unidad. Es la tabla fuente: los metros y los «unidades por
     * metro» se **derivan** de aquí, nunca se escriben otra vez.
     *
     * Está en centímetros y no en metros a propósito: con `cm` como unidad
     * dominante, `cmPerUnit('cm')` devuelve el literal exacto `1.0` y
     * `unitsPerMeter('cm')` devuelve `100.0` sin error de coma flotante, que es
     * justo lo que hacía el código anterior (`100 / $cmPerUnit`). Así la
     * consolidación no mueve un solo dígito en los planos actuales.
     */
    private const CM_PER_UNIT = [
        'mm' => 0.1,
        'cm' => 1.0,
        'm' => 100.0,
    ];

    /** ¿La unidad declarada está admitida? */
    public static function isSupported(mixed $unit): bool
    {
        return is_string($unit) && isset(self::CM_PER_UNIT[$unit]);
    }

    /** Unidad normalizada: la misma si es válida; `cm` en cualquier otro caso. */
    public static function normalize(mixed $unit): string
    {
        return self::isSupported($unit) ? (string) $unit : self::DEFAULT_UNIT;
    }

    /** Centímetros que mide una unidad del lienzo. */
    public static function cmPerUnit(string $unit): float
    {
        return self::CM_PER_UNIT[self::normalize($unit)];
    }

    /** Metros que mide una unidad del lienzo. */
    public static function metersPerUnit(string $unit): float
    {
        return self::cmPerUnit($unit) / 100;
    }

    /** Unidades del lienzo que caben en un metro. */
    public static function unitsPerMeter(string $unit): float
    {
        return 100 / self::cmPerUnit($unit);
    }

    /** Longitud en unidades del lienzo → metros. */
    public static function toMeters(float|int $value, string $unit): float
    {
        return (float) $value * self::metersPerUnit($unit);
    }

    /** Metros → unidades del lienzo. */
    public static function fromMeters(float|int $meters, string $unit): float
    {
        return (float) $meters / self::metersPerUnit($unit);
    }

    /** Longitud en unidades del lienzo → centímetros. */
    public static function toCm(float|int $value, string $unit): float
    {
        return (float) $value * self::cmPerUnit($unit);
    }

    /** Centímetros → unidades del lienzo. */
    public static function fromCm(float|int $cm, string $unit): float
    {
        return (float) $cm / self::cmPerUnit($unit);
    }

    /**
     * Superficie en unidades del lienzo → metros cuadrados.
     *
     * Existe ya porque las áreas de la etapa 2 calculan superficies con la misma
     * autoridad: `m² = u² × (metros por unidad)²`. Sin esto, el factor cuadrado
     * acabaría escrito a mano en cada consumidor.
     */
    public static function squareMeters(float|int $areaUnits, string $unit): float
    {
        $factor = self::metersPerUnit($unit);

        return (float) $areaUnits * $factor * $factor;
    }

    /** Tolerancia de aplanado de arcos, en unidades del lienzo. */
    public static function tolerance(string $unit): float
    {
        return self::TOLERANCE_CM / self::cmPerUnit($unit);
    }

    /**
     * Denominador de una escala de impresión `1:N`. `null` si no es válida.
     *
     * No se usa en la etapa 0: queda listo para que la etapa 1 calcule el tamaño
     * físico del SVG. No debe utilizarse para medir longitudes del plano.
     */
    public static function scaleDenominator(mixed $scale): ?float
    {
        if (!is_string($scale) || preg_match('/^1:([1-9][0-9]{0,4})$/D', $scale) !== 1) {
            return null;
        }

        return (float) substr($scale, 2);
    }
}
