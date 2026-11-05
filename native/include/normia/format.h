/*
 * Normia nativo · formato de cifras.
 *
 * Las medidas se leen como en la edición web: una cifra con separador de miles
 * y coma decimal (`1.121,2 cm`), en la unidad declarada del plano. La conversión
 * desde centímetros la hace el núcleo; aquí solo se compone el texto.
 */
#ifndef NORMA_FORMAT_H
#define NORMA_FORMAT_H

#include <stddef.h>

#include "normia/units.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Cifra de una longitud dada en **centímetros**, en la unidad del plano.
 * Ejemplo: 47123.89 cm en `cm` → `"47.123,9 cm"`.
 */
void norma_format_measure_cm(double value_cm, norma_unit unit, char *out, size_t size);

/** Cifra de una longitud ya expresada en la unidad del plano. */
void norma_format_measure(double value, norma_unit unit, char *out, size_t size);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_FORMAT_H */
