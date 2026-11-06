/*
 * Normia nativo · recorridos de evacuación.
 *
 * Espejo de `PlanAudit::travelField()` (PHP). Sobre la rejilla del plano se
 * propaga, desde el vano de cada salida de emergencia, la distancia caminable a
 * cada celda libre (Dijkstra de ocho vecinos, con la diagonal a 1,41421356).
 * De ahí salen tres cosas que el auditor necesita:
 *
 *   · el **recorrido más largo** hasta una salida y dónde queda el punto más
 *     lejano: es lo que se compara con el criterio de 30 m;
 *   · la **superficie alcanzable** y la que **no tiene salida**;
 *   · las **zonas libres sin salida**, agrupadas por vecindad para no repetir un
 *     aviso por celda.
 *
 * El recorrido se cuenta en metros y empieza en la boca de la salida, no en el
 * centro del vano: es la misma convención del auditor web, para que las dos
 * ediciones no den cifras distintas del mismo plano.
 */
#ifndef NORMA_TRAVEL_H
#define NORMA_TRAVEL_H

#include <stddef.h>

#include "normia/audit.h"
#include "normia/document.h"
#include "normia/grid.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Zonas sin salida que se conservan, de mayor a menor. */
#define NORMA_TRAVEL_ROOMS 5

typedef struct {
    /** Superficie de la zona sin salida, en metros cuadrados. */
    double area_m2;
    size_t cells;
    norma_point center;
} norma_travel_room;

typedef struct {
    /** 0 si no hay salidas de emergencia: no se puede calcular nada. */
    int computed;
    double cell_m;
    double free_area_m2;
    double exterior_area_m2;
    double reachable_area_m2;
    double unreachable_area_m2;
    /** 1 si hay recorrido medido; si no, `longest_m` no vale. */
    int has_longest;
    double longest_m;
    int has_farthest;
    norma_point farthest;
    size_t room_count;
    norma_travel_room rooms[NORMA_TRAVEL_ROOMS];
} norma_travel;

/**
 * Calcula el campo de recorridos sobre una rejilla ya armada.
 * `criteria` puede ser NULL: se usan los criterios de la app.
 */
void norma_travel_field(const norma_document *document, const norma_grid *grid,
                        const norma_egress_criteria *criteria, norma_travel *travel);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_TRAVEL_H */
