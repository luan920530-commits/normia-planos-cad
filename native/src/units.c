/*
 * Normia nativo · unidades.
 *
 * Espejo de `App\Core\Units` (PHP). Cualquier cambio aquí tiene que hacerse
 * también allí, y la prueba de paridad `native/tests/parity.mjs` lo detecta.
 */
#include "normia/units.h"

#include <ctype.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

/** Tolerancia de aplanado de arcos, en centímetros. */
#define NORMA_TOLERANCE_CM 0.5

int norma_unit_is_supported(const char *name)
{
    return name != NULL && (strcmp(name, "mm") == 0 || strcmp(name, "cm") == 0 || strcmp(name, "m") == 0);
}

norma_unit norma_unit_from_name(const char *name)
{
    if (name == NULL) {
        return NORMA_UNIT_CM;
    }
    if (strcmp(name, "mm") == 0) {
        return NORMA_UNIT_MM;
    }
    if (strcmp(name, "m") == 0) {
        return NORMA_UNIT_M;
    }
    return NORMA_UNIT_CM;
}

const char *norma_unit_name(norma_unit unit)
{
    switch (unit) {
    case NORMA_UNIT_MM:
        return "mm";
    case NORMA_UNIT_M:
        return "m";
    case NORMA_UNIT_CM:
    default:
        return "cm";
    }
}

double norma_cm_per_unit(norma_unit unit)
{
    switch (unit) {
    case NORMA_UNIT_MM:
        return 0.1;
    case NORMA_UNIT_M:
        return 100.0;
    case NORMA_UNIT_CM:
    default:
        return 1.0;
    }
}

double norma_meters_per_unit(norma_unit unit)
{
    return norma_cm_per_unit(unit) / 100.0;
}

double norma_to_meters(double value, norma_unit unit)
{
    return value * norma_meters_per_unit(unit);
}

double norma_from_meters(double meters, norma_unit unit)
{
    return meters * 100.0 / norma_cm_per_unit(unit);
}

double norma_to_cm(double value, norma_unit unit)
{
    return value * norma_cm_per_unit(unit);
}

double norma_from_cm(double cm, norma_unit unit)
{
    return cm / norma_cm_per_unit(unit);
}

double norma_square_meters(double area_units, norma_unit unit)
{
    const double factor = norma_meters_per_unit(unit);
    return area_units * factor * factor;
}

double norma_tolerance(norma_unit unit)
{
    return NORMA_TOLERANCE_CM / norma_cm_per_unit(unit);
}

double norma_scale_denominator(const char *scale)
{
    if (scale == NULL || scale[0] != '1' || scale[1] != ':') {
        return 0.0;
    }
    const char *digits = scale + 2;
    const size_t length = strlen(digits);
    if (length < 1 || length > 5) {
        return 0.0;
    }
    if (digits[0] == '0') {
        return 0.0;
    }
    for (size_t index = 0; index < length; index += 1) {
        if (!isdigit((unsigned char) digits[index])) {
            return 0.0;
        }
    }
    return (double) strtod(digits, NULL);
}
