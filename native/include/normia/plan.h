/*
 * Normia nativo · lectura del plano.
 *
 * Entiende el sobre oficial (`format: "normia-plan"`, `schema_version: 3`) y
 * también un diseño suelto, igual que el importador PHP y que el puente del
 * estudio. De ahí saca las cifras que el núcleo tiene que dar **idénticas** a
 * las del motor PHP:
 *
 *   · cantidad de elementos y de muros;
 *   · longitud total de muros, con los tramos curvos medidos como arco;
 *   · superficie del lienzo en metros cuadrados, según la unidad declarada.
 */
#ifndef NORMA_PLAN_H
#define NORMA_PLAN_H

#include <stddef.h>

#include "normia/json.h"
#include "normia/units.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    double width;
    double height;
    norma_unit unit;
    char scale[16];
    size_t elements;
    size_t walls;
    size_t curved_walls;
    double wall_length_cm;
    double wall_length_m;
    double canvas_area_m2;
} norma_plan_stats;

/**
 * Cifras del plano. Devuelve 0 y explica el motivo si el documento no tiene
 * forma de plano.
 */
int norma_plan_analyze(const norma_json *document, norma_plan_stats *out, char *error, size_t error_size);

/** Igual que `norma_plan_analyze` pero leyendo el texto del archivo. */
int norma_plan_analyze_text(const char *text, size_t length, norma_plan_stats *out, char *error, size_t error_size);

/** Longitud de un elemento con `points` y `curves` opcionales, en centímetros. */
double norma_plan_element_length_cm(const norma_json *element);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_PLAN_H */
