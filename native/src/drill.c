/*
 * Normia nativo · simulacro de evacuación.
 *
 * Se apoya en tres piezas ya medidas: las rutas dibujadas (`routes.c`), la
 * rejilla de cálculo (`grid.c`) y los criterios de salida (`audit.h`). Aquí solo
 * se suman los tramos y se dicen los dos tiempos que no son lo mismo: el
 * **objetivo** (cálculo) y el **medido** (cronómetro), si el plano lo declara.
 */
#include "normia/drill.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

/** Redondeo del informe PHP: dos decimales salvo que se pida otra cosa. */
static double redondear(double value, int decimals)
{
    const double factor = pow(10.0, (double) decimals);
    return round(value * factor) / factor;
}

void norma_drill_clock(double seconds, char *out, size_t size)
{
    if (out == NULL || size == 0) {
        return;
    }
    const long total = (long) round(seconds > 0.0 ? seconds : 0.0);
    const long minutes = total / 60;
    const long rest = total % 60;
    if (minutes > 0) {
        snprintf(out, size, "%ld min %ld s", minutes, rest);
    } else {
        snprintf(out, size, "%ld s", rest);
    }
}

/** ¿La capa del elemento se ve? Sin capas ocultas en el documento nativo. */
static int elemento_visible(const norma_document *document, const norma_element *element)
{
    (void) document;
    (void) element;
    return 1;
}

/** Centro de la caja de un elemento, como el informe. */
static norma_point centro(const norma_element *element)
{
    norma_point point;
    point.x = element->x + element->w / 2.0;
    point.y = element->y + element->h / 2.0;
    return point;
}

/** Punto por el que se sale: el centro del hueco del vano, no el de la caja. */
static norma_point punto_salida(const norma_element *element)
{
    norma_point point;
    point.x = element->x + element->w / 2.0;
    point.y = element->y + element->h;
    return point;
}

/** Punto de encuentro: manda el objeto del plano; si no, la señal E007. */
static void buscar_encuentro(const norma_document *document, const norma_library *library,
                             norma_drill *drill)
{
    drill->meeting_found = 0;
    drill->has_meeting = 0;
    snprintf(drill->meeting_source, sizeof(drill->meeting_source), "none");
    const norma_point *sign = NULL;
    norma_point signPoint = {0.0, 0.0};
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!elemento_visible(document, element)) {
            continue;
        }
        if (strcmp(element->type, "cad_emg_meeting") == 0) {
            drill->meeting_found = 1;
            drill->has_meeting = 1;
            drill->meeting = centro(element);
            snprintf(drill->meeting_source, sizeof(drill->meeting_source), "object");
            return;
        }
        if (sign == NULL && library != NULL) {
            char code[32];
            if (norma_library_code_for_type(library, element->type, code, sizeof(code)) != NULL
                && strcmp(code, "E007") == 0) {
                signPoint = centro(element);
                sign = &signPoint;
            }
        }
    }
    if (sign != NULL) {
        drill->meeting_found = 1;
        drill->has_meeting = 1;
        drill->meeting = signPoint;
        snprintf(drill->meeting_source, sizeof(drill->meeting_source), "sign");
    }
}

/** Salida marcada más cercana al final de la ruta, por el centro del vano. */
static const norma_element *salida_cercana(const norma_document *document, norma_point end)
{
    const norma_element *best = NULL;
    double bestGap = 0.0;
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (element->is_exit == 0 || !elemento_visible(document, element)) {
            continue;
        }
        const norma_point center = centro(element);
        const double gap = hypot(center.x - end.x, center.y - end.y);
        if (best == NULL || gap < bestGap) {
            bestGap = gap;
            best = element;
        }
    }
    return best;
}

void norma_drill_analyze(const norma_document *document, const norma_grid *grid,
                         const norma_library *library, const norma_route *routes, size_t route_count,
                         const norma_aforo *aforo, const norma_egress_criteria *criteria,
                         norma_drill *drill)
{
    (void) aforo;
    if (document == NULL || drill == NULL) {
        return;
    }
    memset(drill, 0, sizeof(*drill));
    norma_egress_criteria defaults;
    if (criteria == NULL) {
        norma_egress_criteria_default(&defaults);
        criteria = &defaults;
    }
    double speed = criteria->travel_speed_mps;
    if (speed < 0.1) {
        speed = 0.1;
    }
    drill->speed_mps = redondear(speed, 2);
    drill->reaction_s = document->drill_reaction_s > 0 ? document->drill_reaction_s : 30;
    drill->measured_s = document->drill_measured_s > 0 ? document->drill_measured_s : 0;
    buscar_encuentro(document, library, drill);

    for (size_t index = 0; index < route_count && index < NORMA_MAX_ROUTES; index += 1) {
        const norma_route *route = &routes[index];
        norma_drill_route *item = &drill->routes[drill->route_count];
        memset(item, 0, sizeof(*item));
        snprintf(item->id, sizeof(item->id), "%s", route->id);
        snprintf(item->label, sizeof(item->label), "%s", route->label);
        item->length_m = redondear(route->length_m, 2);
        item->ends_at_exit = route->ends_at_exit;

        const norma_element *exit = route->has_end ? salida_cercana(document, route->end) : NULL;
        if (exit != NULL) {
            snprintf(item->exit_id, sizeof(item->exit_id), "%s", exit->id);
        }

        /* Camino caminable: del inicio del trazo a la salida por el espacio
           libre, y de la salida al punto de encuentro por fuera. */
        norma_point inner[NORMA_DRILL_PATH_POINTS];
        size_t inner_count = 0;
        double inner_m = 0.0;
        int inner_found = 0;
        if (route->has_start && exit != NULL && grid != NULL) {
            inner_found = norma_grid_path(grid, route->start, punto_salida(exit), 0, inner,
                                          NORMA_DRILL_PATH_POINTS, &inner_count, &inner_m);
        }
        norma_point outer[NORMA_DRILL_PATH_POINTS];
        size_t outer_count = 0;
        double outer_m = 0.0;
        int outer_found = 0;
        if (exit != NULL && drill->meeting_found && grid != NULL) {
            outer_found = norma_grid_path(grid, punto_salida(exit), drill->meeting, 1, outer,
                                          NORMA_DRILL_PATH_POINTS, &outer_count, &outer_m);
        }

        double path_m = 0.0;
        int has_path = 0;
        if (inner_found) {
            has_path = 1;
            path_m = inner_m;
            item->point_count = 0;
            for (size_t point = 0; point < inner_count && item->point_count < NORMA_DRILL_PATH_POINTS;
                 point += 1) {
                item->points[item->point_count++] = inner[point];
            }
            if (outer_found) {
                path_m += outer_m;
                for (size_t point = 1; point < outer_count && item->point_count < NORMA_DRILL_PATH_POINTS;
                     point += 1) {
                    item->points[item->point_count++] = outer[point];
                }
            }
        }
        item->has_path = has_path;
        if (has_path) {
            item->path_m = redondear(path_m, 2);
            item->walk_s = redondear(path_m / speed, 1);
        }
        if (outer_found) {
            item->has_meeting_track = 1;
            item->meeting_m = redondear(outer_m, 2);
            item->transfer_s = redondear(outer_m / speed, 1);
        }
        if (has_path) {
            item->has_arrival = 1;
            item->arrival_s = redondear((double) drill->reaction_s + item->walk_s, 1);
            if (!drill->has_target || item->arrival_s > drill->target_s) {
                drill->has_target = 1;
                drill->target_s = item->arrival_s;
            }
        }
        item->target_source = item->has_meeting_track ? "meeting" : "exit";
        drill->route_count += 1;
    }

    if (drill->has_target) {
        drill->target_source = drill->meeting_found ? "meeting" : "exit";
        if (drill->measured_s > 0) {
            drill->has_difference = 1;
            drill->difference_s = redondear((double) drill->measured_s - drill->target_s, 1);
        }
    }
}

void norma_drill_findings(const norma_drill *drill, int has_routes, norma_findings *findings)
{
    if (drill == NULL || findings == NULL) {
        return;
    }
    for (size_t index = 0; index < drill->route_count; index += 1) {
        const norma_drill_route *item = &drill->routes[index];
        /* Sin salidas marcadas ya lo dice el auditor con `no_exit`: aquí solo se
           avisa cuando hay salida y aun así no se puede llegar a ella. */
        if (item->exit_id[0] != '\0' && !item->has_path) {
            const char *label = item->label[0] != '\0' ? item->label : "la ruta";
            char detail[640];
            snprintf(detail, sizeof(detail),
                     "El inicio del trazo de «%s» no se puede conectar con la salida marcada sin "
                     "cruzar un muro. Revisa si falta un vano, si la puerta está marcada como "
                     "salida o si el trazo empieza fuera del espacio libre: el simulacro no puede "
                     "mover a nadie por ahí.",
                     label);
            const char *elements[1] = {item->id};
            norma_findings_add(findings, "drill_route_blocked", "medium",
                               "La ruta no tiene camino libre hasta su salida", detail, elements, 1,
                               NULL, NULL);
        }
    }
    if (drill->route_count > 0 && !drill->meeting_found) {
        norma_findings_add(
            findings, "no_meeting_point", "low", "Sin punto de encuentro declarado",
            "El piso tiene rutas de evacuación pero no un punto de encuentro. Ubica el objeto "
            "«Punto de encuentro de evacuación» (o la señal E007) donde el plan indica que se "
            "reúne la gente: sin él, el simulacro termina en la salida y el tramo hasta el punto "
            "de reunión no se puede medir.",
            NULL, 0, NULL, NULL);
    }
    (void) has_routes;
    if (drill->has_target && drill->measured_s > 0
        && (double) drill->measured_s > drill->target_s + 1.0) {
        char measured[48];
        char target[48];
        norma_drill_clock((double) drill->measured_s, measured, sizeof(measured));
        norma_drill_clock(drill->target_s, target, sizeof(target));
        char detail[640];
        snprintf(detail, sizeof(detail),
                 "El tiempo medido fue %s y el objetivo calculado con las rutas del plano es %s. "
                 "Revisa la ruta, los obstáculos del recorrido y el tiempo de reacción; si la "
                 "diferencia se repite, el plan necesita ajustes.",
                 measured, target);
        norma_findings_add(findings, "drill_slower_than_target", "low",
                           "El simulacro medido supera el tiempo objetivo", detail, NULL, 0, NULL,
                           target);
    }
}
