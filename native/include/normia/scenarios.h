/*
 * Normia nativo · escenarios de ocupación temporal.
 *
 * Espejo de `OccupancyScenarios::analyze()` (PHP). Un piso tiene un aforo y un
 * ancho de salida; un evento —una capacitación en la bodega, el montaje de una
 * feria, la hora pico de una cafetería— mete más gente en el mismo plano y ahí
 * el cálculo del uso habitual deja de servir.
 *
 * El escenario **no cambia el aforo del piso**: la ocupación declarada, el aforo
 * permitido y el tiempo del uso habitual siguen igual. Se revisa aparte porque
 * son dos preguntas distintas.
 *
 *   capacidad del escenario = superficie libre × densidad de referencia
 *   ancho exigido          = personas × milímetros por persona del criterio
 *   tiempo estimado        = marcha del piso + cola con el ancho útil
 *
 * Lo que **no** hace: no aprueba el evento, no verifica el permiso, la sillería,
 * las tarimas ni la ocupación real en la puerta. Eso se resuelve en sitio y con
 * la autoridad competente.
 */
#ifndef NORMA_SCENARIOS_H
#define NORMA_SCENARIOS_H

#include <stddef.h>

#include "normia/audit.h"
#include "normia/document.h"
#include "normia/findings.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Escenarios que se detallan en el informe cuando varios se pasan. */
#define NORMA_SCENARIO_MAX_REPORTED 4

typedef struct {
    char name[64];
    long persons;
    long capacity;
    long excess;
    int fits;
    /** Ancho exigido por el criterio, en metros. */
    double required_width_m;
    double available_width_m;
    /** `width_ok` vale -1 cuando no hay ancho declarado (sin dato). */
    int width_ok;
    int has_queue;
    double queue_s;
    int has_time;
    double time_s;
    int has_extra;
    double extra_s;
} norma_scenario_item;

/**
 * Calcula los escenarios declarados en el lienzo. Devuelve cuántos escribió
 * (como mucho `room`).
 */
size_t norma_scenarios_analyze(const norma_document *document, const norma_aforo *aforo,
                               const norma_egress *egress, const norma_egress_criteria *criteria,
                               norma_scenario_item *out, size_t room);

/**
 * Hallazgos de los escenarios: por encima de la capacidad, salidas cortas y el
 * aviso de los que quedan fuera del informe corto. No los ordena.
 */
void norma_scenarios_findings(const norma_scenario_item *items, size_t count,
                              const norma_aforo *aforo, norma_findings *findings);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_SCENARIOS_H */
