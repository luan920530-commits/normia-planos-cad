/*
 * Normia nativo · primeros auxilios del piso.
 *
 * Espejo de `FirstAidInventory::analyze()`: cuenta botiquines, camillas y
 * desfibriladores dibujados en el plano y mide, sobre la misma rejilla del
 * auditor, qué tan lejos queda el punto más alejado del espacio libre del
 * recurso más cercano. Son tres preguntas concretas:
 *
 *   1. ¿Hay botiquín y alcanza a todo el piso?
 *   2. ¿Hay camilla? (una por piso; el plano no sabe si está en buen estado)
 *   3. ¿Hay DEA?, ¿lo pide la afluencia calculada?, ¿alcanza?
 *
 * La distancia se mide en **línea recta** desde el centro de cada celda libre
 * hasta el centro del recurso, igual que la edición web: sirve para saber si un
 * recurso está al alcance, no para simular una carrera.
 *
 * Lo que el plano **no** puede comprobar —contenido del botiquín, vigencia,
 * carga del DEA, mantenimiento— no se afirma: el texto del hallazgo lo dice.
 * Los umbrales son criterios de la aplicación tomados de
 * `resources/audit-criteria.json` y se rotulan como tales, nunca como norma.
 */
#ifndef NORMA_FIRSTAID_H
#define NORMA_FIRSTAID_H

#include <stddef.h>

#include "normia/document.h"
#include "normia/findings.h"
#include "normia/grid.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    /** Recorrido de referencia hasta el botiquín, en metros. */
    double kit_travel_m;
    /** Recorrido de referencia hasta el DEA, en metros. */
    double aed_travel_m;
    /** Afluencia desde la que la app avisa que conviene un DEA. */
    long aed_min_persons;
    /** 1 si se espera una camilla por piso. */
    int stretcher_per_floor;
} norma_firstaid_criteria;

void norma_firstaid_criteria_default(norma_firstaid_criteria *criteria);

typedef struct {
    size_t kit_count;
    size_t stretcher_count;
    size_t aed_count;
    long people;
    char source[16];
    /** Punto más lejano al botiquín más cercano; `has_kit_max` a 0 si no hay. */
    int has_kit_max;
    double kit_max_m;
    int has_aed_max;
    double aed_max_m;
    /** Celdas libres medidas. */
    size_t cells;
} norma_firstaid;

/**
 * Mide los recursos del piso. `people` y `source` vienen del aforo ya
 * calculado; la rejilla tiene que ser la del auditor. Añade sus hallazgos a
 * `findings` sin ordenar (el llamador ordena al final).
 */
void norma_firstaid_analyze(const norma_document *document, const norma_grid *grid, long people,
                            const char *source, const norma_firstaid_criteria *criteria,
                            norma_firstaid *first_aid, norma_findings *findings);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_FIRSTAID_H */
