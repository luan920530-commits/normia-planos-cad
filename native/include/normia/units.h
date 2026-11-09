/*
 * Normia nativo · unidades y conversiones.
 *
 * Espejo exacto de `App\Core\Units` (PHP). La regla de oro del proyecto es que
 * la geometría se guarda siempre en centímetros y que cambiar la unidad
 * declarada no altera ninguna dimensión; este archivo es el único lugar del
 * núcleo nativo donde se define el factor.
 *
 * Reglas (las mismas del original):
 *   1. No se redondea al convertir; el redondeo es de presentación.
 *   2. Una unidad desconocida o nula se interpreta como `cm`.
 *   3. La escala de impresión (1:N) no interviene en ninguna longitud.
 */
#ifndef NORMA_UNITS_H
#define NORMA_UNITS_H

#ifdef __cplusplus
extern "C" {
#endif

/** Unidad de trabajo del formato del plano. */
typedef enum {
    NORMA_UNIT_MM = 0,
    NORMA_UNIT_CM = 1,
    NORMA_UNIT_M = 2
} norma_unit;

/** Unidad normalizada: la misma si es válida; `NORMA_UNIT_CM` en cualquier otro caso. */
norma_unit norma_unit_from_name(const char *name);

/** Nombre canónico de la unidad (`"mm"`, `"cm"`, `"m"`). */
const char *norma_unit_name(norma_unit unit);

/** ¿El nombre corresponde a una unidad admitida? */
int norma_unit_is_supported(const char *name);

/** Centímetros que mide una unidad del lienzo. */
double norma_cm_per_unit(norma_unit unit);

/** Metros que mide una unidad del lienzo. */
double norma_meters_per_unit(norma_unit unit);

/** Longitud en unidades del lienzo → metros. */
double norma_to_meters(double value, norma_unit unit);

/**
 * Metros → unidades del lienzo.
 *
 * Se multiplica por 100 y se divide por los centímetros por unidad, igual que
 * el PHP, para que el último bit coincida con las cifras ya publicadas.
 */
double norma_from_meters(double meters, norma_unit unit);

/** Longitud en unidades del lienzo → centímetros. */
double norma_to_cm(double value, norma_unit unit);

/** Centímetros → unidades del lienzo. */
double norma_from_cm(double cm, norma_unit unit);

/** Superficie en unidades del lienzo → metros cuadrados. */
double norma_square_meters(double area_units, norma_unit unit);

/** Tolerancia de aplanado de arcos, en unidades del lienzo. */
double norma_tolerance(norma_unit unit);

/** Denominador de una escala `1:N`; 0 si no es válida. */
double norma_scale_denominator(const char *scale);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_UNITS_H */
