/*
 * Normia nativo · aforo y criterios de la app.
 *
 * Espejo de `PlanAudit::aforo()` (PHP). Una sola fórmula, la misma del
 * informe, del pie del plano exportado y del cajón de revisión del editor:
 *
 *   aforo máximo = superficie libre (m²) × densidad de referencia
 *
 * Lo que se distingue siempre, porque no es lo mismo:
 *   · `max_persons`  → lo que cabe según la superficie libre (cálculo);
 *   · `declared`     → lo que se escribió en «Ajustes del plano» (dato);
 *   · `permitted`    → el aforo que rige: el declarado si no supera el máximo;
 *   · `used`         → las personas con las que se calculan ancho y tiempo de
 *                      salida: la declarada si existe, aunque supere el máximo,
 *                      para no dar un tiempo optimista;
 *   · `excess`       → personas declaradas por encima del máximo;
 *   · `source`       → `declared` o `estimated`, para que nunca se confunda una
 *                      estimación con un dato.
 *
 * Los umbrales son **criterios de la app** (20 cm de rejilla, 4 cm de holgura,
 * 0,2 personas por m², tope de 10 000). No son una certificación ni sustituyen
 * la norma que aplique a cada edificio.
 */
#ifndef NORMA_AUDIT_H
#define NORMA_AUDIT_H

#include <stddef.h>

#include "normia/document.h"
#include "normia/grid.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    /** Densidad de referencia, personas por metro cuadrado. */
    double density_persons_per_m2;
    /** Tope absoluto de personas. */
    long max_persons;
} norma_occupancy_criteria;

typedef struct {
    long max_persons;
    long declared;
    long permitted;
    long used;
    long excess;
    const char *source;
    double free_area_m2;
    double density;
    long cap;
} norma_aforo;

/** Criterios de referencia de la aplicación (0,2 pers./m² · tope 10 000). */
void norma_occupancy_criteria_default(norma_occupancy_criteria *criteria);

/**
 * Calcula el aforo a partir de la superficie libre ya medida.
 * `declared` en 0 significa «no declarado»: se usa el del documento.
 */
void norma_audit_aforo_from_area(double free_area_m2, const norma_document *document, long declared,
                                 const norma_occupancy_criteria *criteria, norma_aforo *aforo);

/* ------------------------------ salidas ---------------------------------- */

/** Criterios de salida de la app (los mismos del auditor web). */
typedef struct {
    double max_travel_m;                       /* 30 */
    long min_exit_count;                       /* 2 */
    double min_exit_width_cm;                  /* 80 */
    double door_clearance_factor;              /* 0,9 */
    double width_mm_per_person;                /* 5 */
    double travel_speed_mps;                   /* 1 */
    double flow_persons_per_second_per_meter;  /* 1,3 */
} norma_egress_criteria;

typedef struct {
    long exit_count;
    long door_count;
    /** Suma de los vanos marcados como salida, en metros. */
    double exit_width_m;
    /** Ancho útil: la suma por el factor de despeje, redondeado. */
    double available_width_m;
    /** Ancho que pide el criterio para la gente con la que se calcula. */
    double required_width_m;
    /** Tiempo de marcha en segundos, o -1 si no se conoce el recorrido. */
    double walk_time_s;
    /** Tiempo de cola en la salida, o -1 si no aplica. */
    double queue_time_s;
    /** Tiempo de salida estimado, o -1 si falta alguna parte. */
    double estimated_time_s;
    double speed_mps;
} norma_egress;

/** Criterios de salida de referencia. */
void norma_egress_criteria_default(norma_egress_criteria *criteria);

/**
 * Calcula ancho y tiempos de salida. `longest_m` es el recorrido más largo
 * medido hasta una salida; si es negativo, solo se calcula la cola.
 */
void norma_audit_egress(const norma_document *document, long people, double longest_m,
                        const norma_egress_criteria *criteria, norma_egress *egress);

/** Calcula el aforo midiendo la rejilla. Devuelve 1 si pudo. */
int norma_audit_aforo(const norma_document *document, long declared,
                      const norma_occupancy_criteria *criteria, const norma_grid_criteria *grid_criteria,
                      norma_aforo *aforo, norma_grid *grid, char *error, size_t error_size);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_AUDIT_H */
