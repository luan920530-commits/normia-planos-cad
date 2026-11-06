/*
 * Normia nativo · rutas de evacuación dibujadas.
 *
 * Las cuentas son las de `PlanAudit::analyze()` en la web: la medida declarada
 * manda sobre el trazo (NORMIA-006 §6.1), la ruta termina en una salida si su
 * último punto queda dentro de la tolerancia del criterio (80 cm) y los cruces
 * de muro se cuentan sólo fuera de los vanos.
 */
#include "normia/routes.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/format.h"
#include "normia/geometry.h"
#include "normia/grid.h"

static double round_to(double value, double factor)
{
    return round(value * factor) / factor;
}

static int is_door_type(const char *type)
{
    return strcmp(type, "door") == 0 || strcmp(type, "door_double") == 0
           || strcmp(type, "door_garage") == 0;
}

/** Punto donde el trazo termina en el vano de la puerta, como en la web. */
static void door_opening(const norma_element *element, norma_point *a, norma_point *b)
{
    a->x = element->x;
    a->y = element->y + element->h;
    b->x = element->x + element->w;
    b->y = element->y + element->h;
}

static double distance_to_segment(const norma_point *p, const norma_point *a, const norma_point *b)
{
    const double dx = b->x - a->x;
    const double dy = b->y - a->y;
    const double length = dx * dx + dy * dy;
    double t = 0.0;
    if (length > 1e-12) {
        t = ((p->x - a->x) * dx + (p->y - a->y) * dy) / length;
        if (t < 0.0) {
            t = 0.0;
        } else if (t > 1.0) {
            t = 1.0;
        }
    }
    const double x = a->x + t * dx;
    const double y = a->y + t * dy;
    return hypot(p->x - x, p->y - y);
}

/** Intersección de dos segmentos, o 0 si son paralelos o no se cortan. */
static int segment_hit(const norma_point *a, const norma_point *b, const norma_point *c,
                       const norma_point *d, norma_point *hit)
{
    const double rx = b->x - a->x;
    const double ry = b->y - a->y;
    const double sx = d->x - c->x;
    const double sy = d->y - c->y;
    const double denominator = rx * sy - ry * sx;
    if (fabs(denominator) < 1e-9) {
        return 0;
    }
    const double dx = c->x - a->x;
    const double dy = c->y - a->y;
    const double t = (dx * sy - dy * sx) / denominator;
    const double u = (dx * ry - dy * rx) / denominator;
    if (t < -0.0001 || t > 1.0001 || u < -0.0001 || u > 1.0001) {
        return 0;
    }
    hit->x = a->x + t * rx;
    hit->y = a->y + t * ry;
    return 1;
}

/** Cruces del trazo con los muros, descontando los vanos de las puertas. */
static int wall_crossings(const norma_point *points, size_t count, const norma_document *document,
                          double tolerance)
{
    int crossings = 0;
    for (size_t index = 0; index + 1 < count; index += 1) {
        for (size_t wall = 0; wall < document->count; wall += 1) {
            const norma_element *element = &document->elements[wall];
            if (strcmp(element->type, "wall") != 0 || element->node_count < 2) {
                continue;
            }
            norma_point *wall_points = NULL;
            size_t wall_count = 0;
            if (!norma_grid_visual_points(element, &wall_points, &wall_count)) {
                continue;
            }
            for (size_t step = 0; step + 1 < wall_count; step += 1) {
                norma_point hit;
                if (!segment_hit(&points[index], &points[index + 1], &wall_points[step],
                                 &wall_points[step + 1], &hit)) {
                    continue;
                }
                int in_opening = 0;
                for (size_t door = 0; door < document->count && !in_opening; door += 1) {
                    const norma_element *opening = &document->elements[door];
                    if (!is_door_type(opening->type)) {
                        continue;
                    }
                    norma_point a;
                    norma_point b;
                    door_opening(opening, &a, &b);
                    if (distance_to_segment(&hit, &a, &b) <= tolerance) {
                        in_opening = 1;
                    }
                }
                if (!in_opening) {
                    crossings += 1;
                }
            }
            free(wall_points);
        }
    }
    return crossings;
}

/** Salidas marcadas: su centro, igual que el auditor web. */
static size_t collect_exits(const norma_document *document, norma_point *centers, size_t room)
{
    size_t total = 0;
    for (size_t index = 0; index < document->count && total < room; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!is_door_type(element->type) || !element->is_exit) {
            continue;
        }
        centers[total].x = element->x + element->w / 2.0;
        centers[total].y = element->y + element->h / 2.0;
        total += 1;
    }
    return total;
}

size_t norma_routes_analyze(const norma_document *document, int has_exits, norma_route *out,
                            size_t room)
{
    if (document == NULL || out == NULL || room == 0) {
        return 0;
    }
    norma_point exits[64];
    const size_t exit_count = collect_exits(document, exits, 64);
    (void) has_exits;
    size_t written = 0;
    for (size_t index = 0; index < document->count && written < room; index += 1) {
        const norma_element *element = &document->elements[index];
        if (strcmp(element->type, "route") != 0 || element->node_count < 2) {
            continue;
        }
        norma_route *route = &out[written];
        memset(route, 0, sizeof(*route));
        snprintf(route->id, sizeof(route->id), "%s", element->id);
        snprintf(route->label, sizeof(route->label), "%s", element->label);
        size_t length = strlen(route->label);
        while (length > 0 && (route->label[length - 1] == ' ' || route->label[length - 1] == '\t'
                              || route->label[length - 1] == '\n' || route->label[length - 1] == '\r')) {
            route->label[length - 1] = '\0';
            length -= 1;
        }
        /* NORMIA-006 §6.1: la medida declarada manda; si no hay, el trazo. */
        if (element->measured_m > 0.0) {
            route->length_m = round_to(round_to(element->measured_m * 100.0, 1e6) * 0.01, 100.0);
            route->length_source = "measured";
        } else {
            const double drawn = norma_polyline_length(element->nodes, element->node_count,
                                                       element->arcs);
            route->length_m = round_to(drawn * 0.01, 100.0);
            route->length_source = "geometry";
        }

        norma_point *points = NULL;
        size_t point_count = 0;
        if (norma_grid_visual_points(element, &points, &point_count)) {
            route->has_start = 1;
            route->start = points[0];
            route->has_end = 1;
            const norma_point end = points[point_count - 1];
            route->end = end;
            double nearest = -1.0;
            for (size_t exit = 0; exit < exit_count; exit += 1) {
                const double gap = hypot(end.x - exits[exit].x, end.y - exits[exit].y);
                if (nearest < 0.0 || gap < nearest) {
                    nearest = gap;
                }
            }
            if (nearest >= 0.0) {
                route->has_distance_to_exit = 1;
                route->distance_to_exit_m = round_to(nearest * 0.01, 100.0);
                route->ends_at_exit = nearest <= NORMA_ROUTE_EXIT_TOLERANCE_CM + 1e-9 ? 1 : 0;
            }
            /* La tolerancia de los vanos usa la misma regla que la web. */
            route->wall_crossings = wall_crossings(points, point_count, document, 12.0);
            free(points);
        }
        written += 1;
    }
    return written;
}

void norma_routes_findings(const norma_route *routes, size_t count, int has_exits,
                           norma_findings *findings)
{
    if (findings == NULL) {
        return;
    }
    if (count == 0) {
        norma_findings_add(findings, "no_route", "medium", "Sin ruta de evacuación dibujada",
                           "El plano no tiene ninguna ruta de evacuación. Dibújala con la "
                           "herramienta Ruta para que el plano indique cómo salir y para poder "
                           "revisar su trazado.",
                           NULL, 0, NULL, NULL);
        return;
    }
    char detail[640];
    char value[64];
    char meters[32];
    for (size_t index = 0; index < count; index += 1) {
        const norma_route *route = &routes[index];
        const char *ids[1] = {route->id};
        if (has_exits && !route->ends_at_exit) {
            if (route->has_distance_to_exit) {
                norma_format_fixed(round_to(route->distance_to_exit_m, 10.0), 2, meters,
                                   sizeof(meters));
                snprintf(detail, sizeof(detail),
                         "El final de la ruta queda a %s m de la salida marcada más cercana. "
                         "Ajusta el trazado o marca la puerta correcta como salida de emergencia.",
                         meters);
                snprintf(value, sizeof(value), "%s m", meters);
            } else {
                snprintf(detail, sizeof(detail),
                         "El final de la ruta queda a — m de la salida marcada más cercana. "
                         "Ajusta el trazado o marca la puerta correcta como salida de emergencia.");
                value[0] = '\0';
            }
            norma_findings_add(findings, "route_no_exit", "medium",
                               "Ruta que no termina en una salida", detail, ids, 1,
                               route->has_end ? &routes[index].end : NULL, value);
        }
        if (route->wall_crossings > 0) {
            snprintf(detail, sizeof(detail),
                     "El trazado cruza %d %s un muro fuera de un vano. Una ruta de evacuación no "
                     "puede pasar por una pared: corrige el trazo o abre el paso correspondiente.",
                     route->wall_crossings, route->wall_crossings == 1 ? "vez" : "veces");
            snprintf(value, sizeof(value), "%d", route->wall_crossings);
            norma_findings_add(findings, "route_through_wall", "high", "Ruta que atraviesa un muro",
                               detail, ids, 1, route->has_start ? &routes[index].start : NULL,
                               value);
        }
    }
}
