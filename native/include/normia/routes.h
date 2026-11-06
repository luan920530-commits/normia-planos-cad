/*
 * Normia nativo · rutas de evacuación dibujadas.
 *
 * Espejo de la parte de rutas de `PlanAudit::analyze()` (PHP). Una ruta es un
 * trazo del plano con la herramienta Ruta; el auditor calcula su longitud —la
 * medida declarada manda, si no el trazo—, si termina en una salida marcada y
 * cuántas veces cruza un muro fuera de un vano.
 *
 * Una ruta que atraviesa una pared no enseña nada: la gente no pasa por ahí.
 */
#ifndef NORMA_ROUTES_H
#define NORMA_ROUTES_H

#include <stddef.h>

#include "normia/document.h"
#include "normia/findings.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Tope de rutas que se informan. */
#define NORMA_MAX_ROUTES 16

/** Tolerancia de la app para dar por terminada una ruta en la salida, en cm. */
#define NORMA_ROUTE_EXIT_TOLERANCE_CM 80.0

typedef struct {
    char id[32];
    char label[64];
    /** Longitud en metros: la medida declarada o el trazo, nunca las dos. */
    double length_m;
    /** `measured` o `geometry`, para que el informe pueda explicar la cifra. */
    const char *length_source;
    int ends_at_exit;
    int has_distance_to_exit;
    double distance_to_exit_m;
    int wall_crossings;
    int has_start;
    norma_point start;
    int has_end;
    norma_point end;
} norma_route;

/** Lee las rutas del documento. Devuelve cuántas escribió (como mucho `room`). */
size_t norma_routes_analyze(const norma_document *document, int has_exits, norma_route *out,
                            size_t room);

/**
 * Hallazgos de rutas: sin ruta dibujada, ruta que no llega a una salida y ruta
 * que atraviesa un muro. No los ordena: el llamador ordena la lista completa.
 */
void norma_routes_findings(const norma_route *routes, size_t count, int has_exits,
                           norma_findings *findings);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_ROUTES_H */
