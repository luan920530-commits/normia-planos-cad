/*
 * Normia nativo · rejilla de cálculo (espejo de `PlanGrid::build`).
 *
 * Se recorre el plano por celdas de 20 cm: los muros se bloquean con su
 * holgura, las puertas abren su vano y el exterior se inunda desde el borde
 * con los vanos cerrados. Lo que queda libre y dentro del recinto es la
 * superficie útil, que es la que usan el aforo y el auditor.
 */
#include "normia/grid.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define NORMA_DOOR_COUNT 3
#define NORMA_OUTDOOR_COUNT 5

static const char *const kDoorTypes[NORMA_DOOR_COUNT] = {"door", "door_double", "door_garage"};
static const char *const kOutdoorTypes[NORMA_OUTDOOR_COUNT] = {"road", "sidewalk", "crosswalk",
                                                              "parking", "property"};

/** Los pasos máximos del aplanado, igual que `PathGeometry::MAX_STEPS`. */
#define NORMA_MAX_FLAT_STEPS 720

/** π, para no depender de `M_PI` con `-std=c11 -Wpedantic`. */
#define NORMA_PI 3.14159265358979323846

static int text_is(const char *value, const char *expected)
{
    return strcmp(value, expected) == 0;
}

static int is_door(const char *type)
{
    for (int index = 0; index < NORMA_DOOR_COUNT; index += 1) {
        if (text_is(type, kDoorTypes[index])) {
            return 1;
        }
    }
    return 0;
}

static int is_outdoor(const char *type)
{
    for (int index = 0; index < NORMA_OUTDOOR_COUNT; index += 1) {
        if (text_is(type, kOutdoorTypes[index])) {
            return 1;
        }
    }
    return 0;
}

void norma_grid_criteria_default(norma_grid_criteria *criteria)
{
    if (criteria == NULL) {
        return;
    }
    criteria->cell_cm = 20.0;
    criteria->clearance_cm = 4.0;
    criteria->max_cells = 120000;
}

/* ------------------------------- geometría -------------------------------- */

static double distance_between(norma_point a, norma_point b)
{
    return hypot(a.x - b.x, a.y - b.y);
}

static double distance_to_segment(norma_point p, norma_point a, norma_point b)
{
    const double dx = b.x - a.x;
    const double dy = b.y - a.y;
    if (dx == 0.0 && dy == 0.0) {
        return distance_between(p, a);
    }
    double t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    if (t < 0.0) {
        t = 0.0;
    } else if (t > 1.0) {
        t = 1.0;
    }
    const norma_point closest = {a.x + t * dx, a.y + t * dy};
    return distance_between(p, closest);
}

static double distance_to_path(norma_point p, const norma_point *points, size_t count)
{
    if (count < 2) {
        return INFINITY;
    }
    double best = INFINITY;
    for (size_t index = 1; index < count; index += 1) {
        const double distance = distance_to_segment(p, points[index - 1], points[index]);
        if (distance < best) {
            best = distance;
        }
    }
    return best;
}

/** Centro de la celda, recortado al lienzo, como en `PlanGrid::cellCenter`. */
static norma_point cell_center(size_t ix, size_t iy, double cell, double width, double height)
{
    norma_point point = {((double) ix + 0.5) * cell, ((double) iy + 0.5) * cell};
    if (point.x > width) {
        point.x = width;
    }
    if (point.y > height) {
        point.y = height;
    }
    return point;
}

int norma_grid_visual_points(const norma_element *element, norma_point **points, size_t *count);

/**
 * Puntos del trazo con los arcos resueltos y el giro aplicado.
 *
 * Los nodos del documento nativo ya están en coordenadas del plano; el giro se
 * aplica alrededor del centro de la caja, igual que en el renderizador.
 */
static int visual_points(const norma_element *element, norma_point **out, size_t *out_count)
{
    size_t count = element->node_count;
    if (count < 2) {
        return 0;
    }
    /* Un aplanado puede multiplicar los puntos: se reserva por tramos. */
    size_t capacity = count * 2 + 16;
    norma_point *points = (norma_point *) malloc(capacity * sizeof(norma_point));
    if (points == NULL) {
        return 0;
    }
    size_t total = 0;
    points[total] = element->nodes[0];
    total += 1;
    const double tolerance = norma_tolerance(NORMA_UNIT_CM);
    for (size_t index = 0; index + 1 < count; index += 1) {
        const norma_arc *arc = &element->arcs[index];
        if (!arc->valid) {
            points[total] = element->nodes[index + 1];
            total += 1;
            continue;
        }
        const double radius = arc->r > 1e-6 ? arc->r : 1e-6;
        double ratio = 1.0 - tolerance / radius;
        if (ratio < -1.0) {
            ratio = -1.0;
        } else if (ratio > 1.0) {
            ratio = 1.0;
        }
        const double max_angle = 2.0 * acos(ratio);
        const double safe_angle = max_angle > 1e-3 ? max_angle : 1e-3;
        int steps = (int) ceil(arc->sweep / safe_angle);
        if (steps < 1) {
            steps = 1;
        } else if (steps > NORMA_MAX_FLAT_STEPS) {
            steps = NORMA_MAX_FLAT_STEPS;
        }
        for (int step = 1; step <= steps; step += 1) {
            if (total >= capacity) {
                capacity *= 2;
                norma_point *grown = (norma_point *) realloc(points, capacity * sizeof(norma_point));
                if (grown == NULL) {
                    free(points);
                    return 0;
                }
                points = grown;
            }
            points[total] = norma_arc_point_at(arc, (double) step / (double) steps);
            total += 1;
        }
    }

    if (element->rotation != 0.0 && fabs(element->rotation) >= 0.0001) {
        const double cx = element->x + element->w / 2.0;
        const double cy = element->y + element->h / 2.0;
        const double angle = element->rotation * NORMA_PI / 180.0;
        const double cos_angle = cos(angle);
        const double sin_angle = sin(angle);
        for (size_t index = 0; index < total; index += 1) {
            const double dx = points[index].x - cx;
            const double dy = points[index].y - cy;
            points[index].x = cx + dx * cos_angle - dy * sin_angle;
            points[index].y = cy + dx * sin_angle + dy * cos_angle;
        }
    }
    *out = points;
    *out_count = total;
    return 1;
}

/* --------------------------------- rejilla -------------------------------- */

static void mark_segment(unsigned char *blocked, size_t nx, size_t ny, double width, double height,
                         double cell, norma_point a, norma_point b, double reach)
{
    const double margin = reach + cell;
    const double min_x = a.x < b.x ? a.x : b.x;
    const double max_x = a.x < b.x ? b.x : a.x;
    const double min_y = a.y < b.y ? a.y : b.y;
    const double max_y = a.y < b.y ? b.y : a.y;
    double raw_x0 = floor((min_x - margin) / cell);
    double raw_x1 = ceil((max_x + margin) / cell);
    double raw_y0 = floor((min_y - margin) / cell);
    double raw_y1 = ceil((max_y + margin) / cell);
    if (raw_x0 < 0.0) {
        raw_x0 = 0.0;
    }
    if (raw_y0 < 0.0) {
        raw_y0 = 0.0;
    }
    if (raw_x1 > (double) (nx - 1)) {
        raw_x1 = (double) (nx - 1);
    }
    if (raw_y1 > (double) (ny - 1)) {
        raw_y1 = (double) (ny - 1);
    }
    const size_t x0 = (size_t) raw_x0;
    const size_t x1 = (size_t) raw_x1;
    const size_t y0 = (size_t) raw_y0;
    const size_t y1 = (size_t) raw_y1;
    for (size_t iy = y0; iy <= y1; iy += 1) {
        for (size_t ix = x0; ix <= x1; ix += 1) {
            const norma_point center = cell_center(ix, iy, cell, width, height);
            if (distance_to_segment(center, a, b) <= reach) {
                blocked[iy * nx + ix] = 1;
            }
        }
    }
}

int norma_grid_build(const norma_document *document, const norma_grid_criteria *criteria,
                     norma_grid *grid, char *error, size_t error_size)
{
    if (document == NULL || grid == NULL) {
        return 0;
    }
    memset(grid, 0, sizeof(*grid));
    norma_grid_criteria defaults;
    if (criteria == NULL) {
        norma_grid_criteria_default(&defaults);
        criteria = &defaults;
    }
    if (document->width <= 0.0 || document->height <= 0.0) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "El plano no tiene un lienzo con medidas.");
        }
        return 0;
    }

    grid->width = document->width;
    grid->height = document->height;
    double cell_cm = criteria->cell_cm > 5.0 ? criteria->cell_cm : 5.0;
    const double cm_per_unit = norma_cm_per_unit(NORMA_UNIT_CM);
    double cell = cell_cm / cm_per_unit;
    if (cell < 1.0) {
        cell = 1.0;
    }
    double nx = ceil(grid->width / cell);
    double ny = ceil(grid->height / cell);
    if (nx < 1.0) {
        nx = 1.0;
    }
    if (ny < 1.0) {
        ny = 1.0;
    }
    long max_cells = criteria->max_cells > 4000 ? criteria->max_cells : 4000;
    while ((double) ((long) nx * (long) ny) > (double) max_cells) {
        cell *= 1.5;
        nx = ceil(grid->width / cell);
        ny = ceil(grid->height / cell);
        if (nx < 1.0 || ny < 1.0) {
            break;
        }
    }

    grid->cell = cell;
    grid->cell_m = cell * norma_meters_per_unit(NORMA_UNIT_CM);
    grid->cell_area_m2 = grid->cell_m * grid->cell_m;
    grid->nx = (size_t) nx;
    grid->ny = (size_t) ny;
    grid->clearance = criteria->clearance_cm > 0.0 ? criteria->clearance_cm / cm_per_unit : 0.0;

    const size_t cells = grid->nx * grid->ny;
    grid->blocked = (unsigned char *) calloc(cells, sizeof(unsigned char));
    grid->exterior = (unsigned char *) calloc(cells, sizeof(unsigned char));
    unsigned char *door_cells = (unsigned char *) calloc(cells, sizeof(unsigned char));
    size_t *stack = (size_t *) malloc(cells * sizeof(size_t));
    if (grid->blocked == NULL || grid->exterior == NULL || door_cells == NULL || stack == NULL) {
        free(door_cells);
        free(stack);
        norma_grid_free(grid);
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "No hay memoria para la rejilla de cálculo.");
        }
        return 0;
    }

    /* Muros. */
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!text_is(element->type, "wall")) {
            continue;
        }
        norma_point *points = NULL;
        size_t total = 0;
        if (!visual_points(element, &points, &total)) {
            continue;
        }
        const double stroke = element->stroke > 1.0 ? element->stroke : 1.0;
        const double reach = stroke / 2.0 + grid->clearance + cell * 0.5;
        for (size_t node = 1; node < total; node += 1) {
            mark_segment(grid->blocked, grid->nx, grid->ny, grid->width, grid->height, cell,
                         points[node - 1], points[node], reach);
        }
        free(points);
    }

    /* Vanos: cada puerta libera el tramo que ocupa sobre su muro. */
    const double opening_band = fmax(grid->clearance * 2.0 + cell, cell * 0.75);
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!is_door(element->type)) {
            continue;
        }
        const norma_point a = {element->x, element->y + element->h};
        const norma_point b = {element->x + element->w, element->y + element->h};
        const double margin = opening_band + cell;
        double raw_x0 = floor(((a.x < b.x ? a.x : b.x) - margin) / cell);
        double raw_x1 = ceil(((a.x < b.x ? b.x : a.x) + margin) / cell);
        double raw_y0 = floor(((a.y < b.y ? a.y : b.y) - margin) / cell);
        double raw_y1 = ceil(((a.y < b.y ? b.y : a.y) + margin) / cell);
        if (raw_x0 < 0.0) {
            raw_x0 = 0.0;
        }
        if (raw_y0 < 0.0) {
            raw_y0 = 0.0;
        }
        if (raw_x1 > (double) (grid->nx - 1)) {
            raw_x1 = (double) (grid->nx - 1);
        }
        if (raw_y1 > (double) (grid->ny - 1)) {
            raw_y1 = (double) (grid->ny - 1);
        }
        for (size_t iy = (size_t) raw_y0; iy <= (size_t) raw_y1; iy += 1) {
            for (size_t ix = (size_t) raw_x0; ix <= (size_t) raw_x1; ix += 1) {
                const norma_point center = cell_center(ix, iy, cell, grid->width, grid->height);
                if (distance_to_segment(center, a, b) <= opening_band) {
                    grid->blocked[iy * grid->nx + ix] = 0;
                    door_cells[iy * grid->nx + ix] = 1;
                }
            }
        }
    }

    size_t free_cells = 0;
    for (size_t index = 0; index < cells; index += 1) {
        if (!grid->blocked[index]) {
            free_cells += 1;
        }
    }

    /* Exterior: se inunda desde el borde con los vanos cerrados. */
    size_t top = 0;
    for (size_t ix = 0; ix < grid->nx; ix += 1) {
        const size_t borders[2] = {ix, (grid->ny - 1) * grid->nx + ix};
        for (int side = 0; side < 2; side += 1) {
            const size_t border = borders[side];
            if (!door_cells[border] && !grid->blocked[border] && !grid->exterior[border]) {
                grid->exterior[border] = 1;
                stack[top] = border;
                top += 1;
            }
        }
    }
    for (size_t iy = 1; iy + 1 < grid->ny; iy += 1) {
        const size_t borders[2] = {iy * grid->nx, iy * grid->nx + (grid->nx - 1)};
        for (int side = 0; side < 2; side += 1) {
            const size_t border = borders[side];
            if (!door_cells[border] && !grid->blocked[border] && !grid->exterior[border]) {
                grid->exterior[border] = 1;
                stack[top] = border;
                top += 1;
            }
        }
    }
    while (top > 0) {
        top -= 1;
        const size_t current = stack[top];
        const size_t ix = current % grid->nx;
        const size_t iy = current / grid->nx;
        const int offsets[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        for (int side = 0; side < 4; side += 1) {
            const long jx = (long) ix + offsets[side][0];
            const long jy = (long) iy + offsets[side][1];
            if (jx < 0 || jy < 0 || (size_t) jx >= grid->nx || (size_t) jy >= grid->ny) {
                continue;
            }
            const size_t next = (size_t) jy * grid->nx + (size_t) jx;
            /* Los vanos están abiertos para caminar, pero se cierran para
               inundar: si no, el exterior entraría por la puerta. */
            if (door_cells[next] || grid->blocked[next] || grid->exterior[next]) {
                continue;
            }
            grid->exterior[next] = 1;
            stack[top] = next;
            top += 1;
        }
    }
    size_t exterior_cells = 0;
    for (size_t index = 0; index < cells; index += 1) {
        if (grid->exterior[index]) {
            exterior_cells += 1;
        }
    }
    size_t minimum_interior = (size_t) ceil((double) free_cells * 0.2);
    if (minimum_interior < 1) {
        minimum_interior = 1;
    }
    if (exterior_cells == 0 || free_cells < exterior_cells + minimum_interior) {
        memset(grid->exterior, 0, cells * sizeof(unsigned char));
    }

    /* Vías, andenes, cebras, parqueaderos y linderos: entorno, no piso útil. */
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!is_outdoor(element->type)) {
            continue;
        }
        const int is_area = text_is(element->type, "crosswalk") || text_is(element->type, "parking");
        const int is_property = text_is(element->type, "property");
        double band = 0.0;
        if (!is_area && !is_property) {
            band = norma_from_meters(element->width_m > 0.8 ? element->width_m : 0.8, NORMA_UNIT_CM);
        }
        double reach = 0.0;
        if (!is_area) {
            reach = (band > 0.0 ? band / 2.0 : fmax(2.0, cell * 0.5)) + cell * 0.25;
        }
        norma_point *points = NULL;
        size_t total = 0;
        if (!is_area) {
            if (!visual_points(element, &points, &total)) {
                /* Un elemento del entorno sin nodos ocupa su caja: el mismo
                   tramo por omisión que arma `visualPoints` en PHP. */
                points = (norma_point *) malloc(2 * sizeof(norma_point));
                if (points != NULL) {
                    points[0].x = element->x;
                    points[0].y = element->y;
                    points[1].x = element->x + element->w;
                    points[1].y = element->y;
                    total = 2;
                }
            }
        }
        const double margin = is_area ? 0.0 : reach + cell;
        double raw_x0 = floor((element->x - margin) / cell);
        double raw_x1 = ceil((element->x + element->w + margin) / cell);
        double raw_y0 = floor((element->y - margin) / cell);
        double raw_y1 = ceil((element->y + element->h + margin) / cell);
        if (raw_x0 < 0.0) {
            raw_x0 = 0.0;
        }
        if (raw_y0 < 0.0) {
            raw_y0 = 0.0;
        }
        if (raw_x1 > (double) (grid->nx - 1)) {
            raw_x1 = (double) (grid->nx - 1);
        }
        if (raw_y1 > (double) (grid->ny - 1)) {
            raw_y1 = (double) (grid->ny - 1);
        }
        const double cx = element->x + element->w / 2.0;
        const double cy = element->y + element->h / 2.0;
        const double angle = -element->rotation * NORMA_PI / 180.0;
        const double cos_angle = cos(angle);
        const double sin_angle = sin(angle);
        for (size_t iy = (size_t) raw_y0; iy <= (size_t) raw_y1; iy += 1) {
            for (size_t ix = (size_t) raw_x0; ix <= (size_t) raw_x1; ix += 1) {
                const size_t cell_index = iy * grid->nx + ix;
                if (grid->blocked[cell_index]) {
                    continue;
                }
                const norma_point center = cell_center(ix, iy, cell, grid->width, grid->height);
                int inside = 0;
                if (is_area) {
                    const double dx = center.x - cx;
                    const double dy = center.y - cy;
                    const double local_x = cx + dx * cos_angle - dy * sin_angle;
                    const double local_y = cy + dx * sin_angle + dy * cos_angle;
                    inside = local_x >= element->x && local_x <= element->x + element->w
                             && local_y >= element->y && local_y <= element->y + element->h;
                } else if (total >= 2) {
                    inside = distance_to_path(center, points, total) <= reach;
                }
                if (inside) {
                    grid->exterior[cell_index] = 1;
                }
            }
        }
        free(points);
    }

    size_t exterior_free = 0;
    for (size_t index = 0; index < cells; index += 1) {
        if (grid->exterior[index] && !grid->blocked[index]) {
            exterior_free += 1;
        }
    }
    grid->exterior_area_m2 = (double) exterior_free * grid->cell_area_m2;
    const double interior_free = (double) free_cells - (double) exterior_free;
    grid->free_area_m2 = (interior_free > 0.0 ? interior_free : 0.0) * grid->cell_area_m2;

    free(door_cells);
    free(stack);
    return 1;
}

void norma_grid_free(norma_grid *grid)
{
    if (grid == NULL) {
        return;
    }
    free(grid->blocked);
    free(grid->exterior);
    grid->blocked = NULL;
    grid->exterior = NULL;
    grid->nx = 0;
    grid->ny = 0;
}

int norma_grid_visual_points(const norma_element *element, norma_point **points, size_t *count)
{
    if (element == NULL || points == NULL || count == NULL) {
        return 0;
    }
    return visual_points(element, points, count);
}

/* ------------------------------- caminos --------------------------------- */

/** Centro de una celda, recortado al lienzo, como `PlanGrid::cellCenter`. */
static norma_point path_cell_center(const norma_grid *grid, int ix, int iy)
{
    norma_point center;
    center.x = (double) (ix + 0.5) * grid->cell;
    center.y = (double) (iy + 0.5) * grid->cell;
    if (center.x > grid->width) {
        center.x = grid->width;
    }
    if (center.y > grid->height) {
        center.y = grid->height;
    }
    return center;
}

/** ¿Se puede pisar esta celda? Fuera del piso solo cuando se permite el exterior. */
static int path_allowed(const norma_grid *grid, size_t index, int allow_exterior)
{
    if (index >= grid->nx * grid->ny) {
        return 0;
    }
    if (grid->blocked[index] != 0) {
        return 0;
    }
    return allow_exterior != 0 ? 1 : grid->exterior[index] == 0;
}

/**
 * Celda libre más cercana a un punto, buscando en anillos de radio creciente,
 * igual que `PlanGrid::nearestAllowedCell`.
 */
static int path_nearest_cell(const norma_grid *grid, norma_point point, int allow_exterior, int *out_x,
                             int *out_y)
{
    const int nx = (int) grid->nx;
    const int ny = (int) grid->ny;
    int cx = (int) floor(point.x / grid->cell);
    int cy = (int) floor(point.y / grid->cell);
    if (cx < 0) {
        cx = 0;
    }
    if (cy < 0) {
        cy = 0;
    }
    if (cx > nx - 1) {
        cx = nx - 1;
    }
    if (cy > ny - 1) {
        cy = ny - 1;
    }
    const size_t start_index = (size_t) cy * grid->nx + (size_t) cx;
    if (path_allowed(grid, start_index, allow_exterior)) {
        *out_x = cx;
        *out_y = cy;
        return 1;
    }
    for (int radius = 1; radius <= 12; radius += 1) {
        int best_x = -1;
        int best_y = -1;
        double best_gap = 0.0;
        const int from_y = cy - radius < 0 ? 0 : cy - radius;
        const int to_y = cy + radius > ny - 1 ? ny - 1 : cy + radius;
        const int from_x = cx - radius < 0 ? 0 : cx - radius;
        const int to_x = cx + radius > nx - 1 ? nx - 1 : cx + radius;
        for (int iy = from_y; iy <= to_y; iy += 1) {
            for (int ix = from_x; ix <= to_x; ix += 1) {
                const int ring = abs(ix - cx) > abs(iy - cy) ? abs(ix - cx) : abs(iy - cy);
                if (ring != radius) {
                    continue;
                }
                if (!path_allowed(grid, (size_t) iy * grid->nx + (size_t) ix, allow_exterior)) {
                    continue;
                }
                const norma_point center = path_cell_center(grid, ix, iy);
                const double gap = hypot(center.x - point.x, center.y - point.y);
                if (best_x < 0 || gap < best_gap) {
                    best_gap = gap;
                    best_x = ix;
                    best_y = iy;
                }
            }
        }
        if (best_x >= 0) {
            *out_x = best_x;
            *out_y = best_y;
            return 1;
        }
    }
    return 0;
}

/** ¿Se puede ir en línea recta entre dos puntos sin salir del espacio libre? */
static int path_line_of_sight(const norma_grid *grid, norma_point a, norma_point b, int allow_exterior)
{
    const double length = hypot(b.x - a.x, b.y - a.y);
    const double step = grid->cell * 0.4 > 1.0 ? grid->cell * 0.4 : 1.0;
    int samples = (int) ceil(length / step);
    if (samples < 1) {
        samples = 1;
    }
    for (int index = 0; index <= samples; index += 1) {
        const double ratio = (double) index / (double) samples;
        const double x = a.x + (b.x - a.x) * ratio;
        const double y = a.y + (b.y - a.y) * ratio;
        int ix = (int) floor(x / grid->cell);
        int iy = (int) floor(y / grid->cell);
        if (ix < 0) {
            ix = 0;
        }
        if (iy < 0) {
            iy = 0;
        }
        if (ix > (int) grid->nx - 1) {
            ix = (int) grid->nx - 1;
        }
        if (iy > (int) grid->ny - 1) {
            iy = (int) grid->ny - 1;
        }
        if (!path_allowed(grid, (size_t) iy * grid->nx + (size_t) ix, allow_exterior)) {
            return 0;
        }
    }
    return 1;
}

/* Montículo mínimo de (coste, índice), con borrado perezoso como en PHP. */
typedef struct {
    double cost;
    size_t index;
} path_node;

static void path_push(path_node *heap, size_t *size, double cost, size_t index)
{
    size_t position = *size;
    heap[position].cost = cost;
    heap[position].index = index;
    *size += 1;
    while (position > 0) {
        const size_t parent = (position - 1) / 2;
        if (heap[parent].cost <= heap[position].cost) {
            break;
        }
        const path_node swap = heap[parent];
        heap[parent] = heap[position];
        heap[position] = swap;
        position = parent;
    }
}

static path_node path_pop(path_node *heap, size_t *size)
{
    const path_node top = heap[0];
    *size -= 1;
    heap[0] = heap[*size];
    size_t position = 0;
    for (;;) {
        const size_t left = position * 2 + 1;
        const size_t right = left + 1;
        size_t smallest = position;
        if (left < *size && heap[left].cost < heap[smallest].cost) {
            smallest = left;
        }
        if (right < *size && heap[right].cost < heap[smallest].cost) {
            smallest = right;
        }
        if (smallest == position) {
            break;
        }
        const path_node swap = heap[position];
        heap[position] = heap[smallest];
        heap[smallest] = swap;
        position = smallest;
    }
    return top;
}

int norma_grid_path(const norma_grid *grid, norma_point from, norma_point to, int allow_exterior,
                    norma_point *points, size_t room, size_t *count, double *meters)
{
    if (count != NULL) {
        *count = 0;
    }
    if (meters != NULL) {
        *meters = 0.0;
    }
    if (grid == NULL || grid->blocked == NULL || grid->exterior == NULL || grid->nx == 0 || grid->ny == 0) {
        return 0;
    }
    int start_x = 0;
    int start_y = 0;
    int goal_x = 0;
    int goal_y = 0;
    if (!path_nearest_cell(grid, from, allow_exterior, &start_x, &start_y)
        || !path_nearest_cell(grid, to, allow_exterior, &goal_x, &goal_y)) {
        return 0;
    }
    const size_t total = grid->nx * grid->ny;
    const size_t start_index = (size_t) start_y * grid->nx + (size_t) start_x;
    const size_t goal_index = (size_t) goal_y * grid->nx + (size_t) goal_x;

    double *dist = (double *) malloc(total * sizeof(double));
    long *parent = (long *) malloc(total * sizeof(long));
    path_node *heap = (path_node *) malloc(total * 2 * sizeof(path_node));
    if (dist == NULL || parent == NULL || heap == NULL) {
        free(dist);
        free(parent);
        free(heap);
        return 0;
    }
    for (size_t index = 0; index < total; index += 1) {
        dist[index] = INFINITY;
        parent[index] = -1;
    }
    dist[start_index] = 0.0;
    size_t heap_size = 0;
    path_push(heap, &heap_size, 0.0, start_index);
    static const int steps[8][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};
    while (heap_size > 0) {
        const path_node node = path_pop(heap, &heap_size);
        const size_t current = node.index;
        if (node.cost > dist[current] + 0.0001) {
            continue;
        }
        if (current == goal_index) {
            break;
        }
        const int ix = (int) (current % grid->nx);
        const int iy = (int) (current / grid->nx);
        for (size_t step = 0; step < 8; step += 1) {
            const int dx = steps[step][0];
            const int dy = steps[step][1];
            const int jx = ix + dx;
            const int jy = iy + dy;
            if (jx < 0 || jy < 0 || jx > (int) grid->nx - 1 || jy > (int) grid->ny - 1) {
                continue;
            }
            const size_t next = (size_t) jy * grid->nx + (size_t) jx;
            if (!path_allowed(grid, next, allow_exterior)) {
                continue;
            }
            /* La diagonal no puede cortar la esquina de un muro. */
            if (dx != 0 && dy != 0) {
                if (!path_allowed(grid, (size_t) iy * grid->nx + (size_t) (ix + dx), allow_exterior)
                    || !path_allowed(grid, (size_t) (iy + dy) * grid->nx + (size_t) ix, allow_exterior)) {
                    continue;
                }
            }
            const double weight = (dx != 0 && dy != 0) ? 1.41421356 : 1.0;
            const double candidate = dist[current] + weight * grid->cell;
            if (candidate + 0.0001 < dist[next]) {
                dist[next] = candidate;
                parent[next] = (long) current;
                path_push(heap, &heap_size, candidate, next);
            }
        }
    }
    const int found = isfinite(dist[goal_index]);
    if (found) {
        /* La cadena de padres se recorre del final al principio. */
        size_t cells = 0;
        for (long cursor = (long) goal_index; cursor >= 0; cursor = parent[cursor]) {
            cells += 1;
            if ((size_t) cursor == start_index) {
                break;
            }
        }
        const size_t raw_count = cells + 2;
        norma_point *raw = (norma_point *) malloc(raw_count * sizeof(norma_point));
        if (raw == NULL) {
            free(dist);
            free(parent);
            free(heap);
            return 0;
        }
        raw[0] = from;
        size_t slot = cells;
        for (long cursor = (long) goal_index; cursor >= 0 && slot > 0; cursor = parent[cursor]) {
            slot -= 1;
            raw[1 + slot] = path_cell_center(grid, (int) ((size_t) cursor % grid->nx),
                                             (int) ((size_t) cursor / grid->nx));
            if ((size_t) cursor == start_index) {
                break;
            }
        }
        raw[raw_count - 1] = to;

        /* Simplificación con línea de vista: se conservan las esquinas. */
        norma_point *simple = (norma_point *) malloc(raw_count * sizeof(norma_point));
        if (simple == NULL) {
            free(raw);
            free(dist);
            free(parent);
            free(heap);
            return 0;
        }
        size_t simple_count = 0;
        simple[simple_count++] = raw[0];
        size_t index = 0;
        while (index + 1 < raw_count) {
            size_t jump = index + 1;
            for (size_t candidate = raw_count - 1; candidate > index + 1; candidate -= 1) {
                if (path_line_of_sight(grid, raw[index], raw[candidate], allow_exterior)) {
                    jump = candidate;
                    break;
                }
            }
            simple[simple_count++] = raw[jump];
            index = jump;
        }
        double length_cm = 0.0;
        for (size_t step = 1; step < simple_count; step += 1) {
            length_cm += hypot(simple[step].x - simple[step - 1].x, simple[step].y - simple[step - 1].y);
        }
        size_t written = 0;
        for (size_t step = 0; step < simple_count && points != NULL && step < room; step += 1) {
            points[step].x = round(simple[step].x * 100.0) / 100.0;
            points[step].y = round(simple[step].y * 100.0) / 100.0;
            written += 1;
        }
        if (count != NULL) {
            *count = points != NULL ? written : simple_count;
        }
        if (meters != NULL) {
            *meters = round(length_cm) / 100.0;
        }
        free(simple);
        free(raw);
    }
    free(dist);
    free(parent);
    free(heap);
    return found;
}
