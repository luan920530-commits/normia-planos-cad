/*
 * Normia nativo · simulacro de evacuación: el tiempo objetivo del piso.
 *
 * Espejo de `App\Services\EvacuationDrill` (PHP). Un simulacro real se mide con
 * cronómetro; lo que un plano puede decir antes de ese día es **cuánto debería
 * tardar** con las rutas dibujadas:
 *
 *   tiempo objetivo = reacción + camino hasta la salida + tramo al punto de encuentro
 *
 * El camino no es una línea recta: se calcula sobre la rejilla del auditor
 * (`norma_grid_path`), con los muros bloqueados y los vanos abiertos, y el tramo
 * de la salida al punto de encuentro va **por fuera** de la edificación.
 *
 * Lo que no hace, y el informe lo dice: no sustituye el simulacro, no cuenta
 * participantes ni evalúa la brigada, y no convierte un tiempo calculado en una
 * promesa. El tiempo de reacción (30 s por omisión) y la velocidad (1 m/s) son
 * criterios de la app, no mediciones de esta brigada.
 */
#ifndef NORMA_DRILL_H
#define NORMA_DRILL_H

#include <stddef.h>

#include "normia/audit.h"
#include "normia/document.h"
#include "normia/findings.h"
#include "normia/grid.h"
#include "normia/library.h"
#include "normia/routes.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Puntos de camino que se guardan por ruta, para poder dibujarlos. */
#define NORMA_DRILL_PATH_POINTS 96

typedef struct {
    char id[32];
    char label[64];
    double length_m;
    int ends_at_exit;
    char exit_id[32];
    /** Camino caminable dentro del piso, desde el inicio del trazo. */
    int has_path;
    double path_m;
    double walk_s;
    int has_meeting_track;
    double meeting_m;
    double transfer_s;
    int has_arrival;
    double arrival_s;
    /** `exit` o `meeting`: hasta dónde llega el tiempo objetivo de esta ruta. */
    const char *target_source;
    size_t point_count;
    norma_point points[NORMA_DRILL_PATH_POINTS];
} norma_drill_route;

typedef struct {
    int meeting_found;
    char meeting_source[12]; /* `object`, `sign` o `none` */
    int has_meeting;
    norma_point meeting;
    long reaction_s;
    double speed_mps;
    int has_target;
    double target_s;
    /** `meeting` si el recorrido incluye el punto de encuentro. */
    const char *target_source;
    long measured_s; /* 0 = no se midió */
    int has_difference;
    double difference_s;
    size_t route_count;
    norma_drill_route routes[NORMA_MAX_ROUTES];
} norma_drill;

/**
 * Calcula el simulacro. `library` puede ser `NULL`: entonces el punto de
 * encuentro solo se reconoce por su objeto del plano (`cad_emg_meeting`), no por
 * la señal E007.
 */
void norma_drill_analyze(const norma_document *document, const norma_grid *grid,
                         const norma_library *library, const norma_route *routes, size_t route_count,
                         const norma_aforo *aforo, const norma_egress_criteria *criteria,
                         norma_drill *drill);

/** Hallazgos del simulacro, con los textos del informe web. */
void norma_drill_findings(const norma_drill *drill, int has_routes, norma_findings *findings);

/** «1 min 42 s» o «43 s», para no hablar en segundos sueltos. */
void norma_drill_clock(double seconds, char *out, size_t size);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_DRILL_H */
