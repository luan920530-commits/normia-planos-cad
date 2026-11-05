/*
 * Normia nativo · formato de cifras.
 *
 * Mismo criterio que la edición web (`formatMeasurement` en
 * `assets/js/lib/geometry.js`): como mucho **un decimal**, sin decimales cuando
 * el número es entero, separador de miles con punto y coma decimal, y la unidad
 * detrás. Es el formato de es-CO, que es el que se lee en los planos.
 */
#include "normia/format.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

/** Redondeo a un decimal, alejándose del cero en el medio (como el navegador). */
static long long round_tenths(double value)
{
    const double scaled = fabs(value) * 10.0;
    return (long long) floor(scaled + 0.5);
}

/** Escribe `digits` con separador de miles y coma decimal. */
static void write_number(long long tenths, int negative, char *out, size_t size)
{
    char buffer[64];
    long long whole = tenths / 10;
    const int fraction = (int) (tenths % 10);

    /* Enteros con puntos de mil: se calcula de derecha a izquierda. */
    char digits[32];
    int count = 0;
    if (whole == 0) {
        digits[count++] = '0';
    }
    while (whole > 0 && count < (int) sizeof(digits) - 1) {
        digits[count++] = (char) ('0' + (int) (whole % 10));
        whole /= 10;
    }
    int written = 0;
    buffer[0] = '\0';
    size_t position = 0;
    if (negative) {
        buffer[position++] = '-';
    }
    for (int index = count - 1; index >= 0; index -= 1) {
        buffer[position++] = digits[index];
        /* Punto cada tres cifras, pero nunca delante del número. */
        if (index > 0 && index % 3 == 0 && position + 2 < sizeof(buffer)) {
            buffer[position++] = '.';
        }
    }
    if (position + 2 < sizeof(buffer)) {
        if (fraction != 0) {
            buffer[position++] = ',';
            buffer[position++] = (char) ('0' + fraction);
        }
    }
    buffer[position] = '\0';
    written = (int) position;
    (void) written;
    snprintf(out, size, "%s", buffer);
}

void norma_format_measure(double value, norma_unit unit, char *out, size_t size)
{
    if (out == NULL || size == 0) {
        return;
    }
    out[0] = '\0';
    if (!isfinite(value)) {
        snprintf(out, size, "0 %s", norma_unit_name(unit));
        return;
    }
    const long long tenths = round_tenths(value);
    char number[64];
    write_number(tenths, value < 0.0 && tenths != 0, number, sizeof(number));
    snprintf(out, size, "%s %s", number, norma_unit_name(unit));
}

void norma_format_measure_cm(double value_cm, norma_unit unit, char *out, size_t size)
{
    norma_format_measure(norma_from_cm(value_cm, unit), unit, out, size);
}
