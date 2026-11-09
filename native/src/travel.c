/*
 * Normia nativo · recorridos de evacuación (espejo de `PlanAudit::travelField`).
 *
 * Desde el vano de cada salida de emergencia se propaga la distancia caminable
 * por la rejilla con un Dijkstra de ocho vecinos. Lo que no se alcanza es una
 * zona sin salida, y eso se informa agrupado por vecindad: un aviso por zona,
 * no uno por celda.
 */
#include "normia/travel.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/** Peso de la diagonal, el mismo que usa el auditor web. */
#define NORMA_DIAGONAL 1.41421356

/** Número de habitaciones que se conservan, de mayor a menor. */
#define NORMA_MAX_TRAVEL_ROOMS 40

static const char *const kDoorTypes[3] = {"door", "door_double", "door_garage"};

/** Redondeo de la app a dos decimales. */
static double round_meters(double value)
{
    return round(value * 100.0) / 100.0;
}

static int is_door_type(const char *type)
{
    for (int index = 0; index < 3; index += 1) {
        if (strcmp(type, kDoorTypes[index]) == 0) {
            return 1;
        }
    }
    return 0;
}

/** Centro de la celda recortado al lienzo, como `PlanGrid::cellCenter`. */
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

/* ------------------------------ cola de costo ------------------------------ */

/** Montículo mínimo de (costo, celda) para el Dijkstra. */
typedef struct {
    double *cost;
    size_t *cell;
    size_t count;
    size_t capacity;
    int failed;
} norma_heap;

static void heap_init(norma_heap *heap, size_t capacity)
{
    heap->count = 0;
    heap->capacity = capacity < 64 ? 64 : capacity;
    heap->failed = 0;
    heap->cost = (double *) malloc(heap->capacity * sizeof(double));
    heap->cell = (size_t *) malloc(heap->capacity * sizeof(size_t));
    if (heap->cost == NULL || heap->cell == NULL) {
        heap->failed = 1;
    }
}

static void heap_free(norma_heap *heap)
{
    free(heap->cost);
    free(heap->cell);
    heap->cost = NULL;
    heap->cell = NULL;
}

static void heap_swap(norma_heap *heap, size_t a, size_t b)
{
    const double cost = heap->cost[a];
    heap->cost[a] = heap->cost[b];
    heap->cost[b] = cost;
    const size_t cell = heap->cell[a];
    heap->cell[a] = heap->cell[b];
    heap->cell[b] = cell;
}

static void heap_push(norma_heap *heap, double cost, size_t cell)
{
    if (heap->failed) {
        return;
    }
    if (heap->count == heap->capacity) {
        const size_t capacity = heap->capacity * 2;
        double *grown_cost = (double *) realloc(heap->cost, capacity * sizeof(double));
        if (grown_cost == NULL) {
            heap->failed = 1;
            return;
        }
        heap->cost = grown_cost;
        size_t *grown_cell = (size_t *) realloc(heap->cell, capacity * sizeof(size_t));
        if (grown_cell == NULL) {
            heap->failed = 1;
            return;
        }
        heap->cell = grown_cell;
        heap->capacity = capacity;
    }
    size_t position = heap->count;
    heap->count += 1;
    heap->cost[position] = cost;
    heap->cell[position] = cell;
    while (position > 0) {
        const size_t parent = (position - 1) / 2;
        if (heap->cost[parent] <= heap->cost[position]) {
            break;
        }
        heap_swap(heap, parent, position);
        position = parent;
    }
}

static int heap_pop(norma_heap *heap, double *cost, size_t *cell)
{
    if (heap->count == 0) {
        return 0;
    }
    *cost = heap->cost[0];
    *cell = heap->cell[0];
    heap->count -= 1;
    if (heap->count > 0) {
        heap->cost[0] = heap->cost[heap->count];
        heap->cell[0] = heap->cell[heap->count];
        size_t position = 0;
        for (;;) {
            const size_t left = position * 2 + 1;
            const size_t right = left + 1;
            size_t smallest = position;
            if (left < heap->count && heap->cost[left] < heap->cost[smallest]) {
                smallest = left;
            }
            if (right < heap->count && heap->cost[right] < heap->cost[smallest]) {
                smallest = right;
            }
            if (smallest == position) {
                break;
            }
            heap_swap(heap, position, smallest);
            position = smallest;
        }
    }
    return 1;
}

/* -------------------------------- recorrido -------------------------------- */

static void add_room(norma_travel_room *rooms, size_t *count, double area, size_t cells, norma_point center)
{
    if (*count < NORMA_MAX_TRAVEL_ROOMS) {
        rooms[*count].area_m2 = area;
        rooms[*count].cells = cells;
        rooms[*count].center = center;
        *count += 1;
        return;
    }
    /* Con el cupo lleno se sustituye la zona más pequeña si esta es mayor. */
    size_t smallest = 0;
    for (size_t index = 1; index < *count; index += 1) {
        if (rooms[index].area_m2 < rooms[smallest].area_m2) {
            smallest = index;
        }
    }
    if (area > rooms[smallest].area_m2) {
        rooms[smallest].area_m2 = area;
        rooms[smallest].cells = cells;
        rooms[smallest].center = center;
    }
}

void norma_travel_field(const norma_document *document, const norma_grid *grid,
                        const norma_egress_criteria *criteria, norma_travel *travel)
{
    if (travel == NULL) {
        return;
    }
    memset(travel, 0, sizeof(*travel));
    if (document == NULL || grid == NULL || grid->nx == 0 || grid->ny == 0) {
        return;
    }
    norma_egress_criteria defaults;
    if (criteria == NULL) {
        norma_egress_criteria_default(&defaults);
        criteria = &defaults;
    }
    const size_t nx = grid->nx;
    const size_t ny = grid->ny;
    const size_t cells = nx * ny;
    const double cell = grid->cell;
    const double cell_m = grid->cell_m;
    const double cell_area_m2 = grid->cell_area_m2;

    travel->cell_m = round_meters(cell_m);
    travel->free_area_m2 = round_meters(grid->free_area_m2);
    travel->exterior_area_m2 = round_meters(grid->exterior_area_m2);
    travel->unreachable_area_m2 = round_meters(grid->free_area_m2);

    double *dist = (double *) malloc(cells * sizeof(double));
    unsigned char *seen = (unsigned char *) calloc(cells, sizeof(unsigned char));
    size_t *stack = (size_t *) malloc(cells * sizeof(size_t));
    norma_heap heap;
    heap_init(&heap, 1024);
    if (dist == NULL || seen == NULL || stack == NULL || heap.failed) {
        free(dist);
        free(seen);
        free(stack);
        heap_free(&heap);
        return;
    }
    for (size_t index = 0; index < cells; index += 1) {
        dist[index] = INFINITY;
    }

    /* Semilla: las celdas del vano de cada salida, con el mismo radio que la web. */
    double seed_radius = ceil((grid->clearance + cell) / cell);
    if (seed_radius < 1.0) {
        seed_radius = 1.0;
    }
    const long seed = (long) seed_radius;
    size_t exits = 0;
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!is_door_type(element->type) || !element->is_exit) {
            continue;
        }
        exits += 1;
        const double mid_x = (element->x + (element->x + element->w)) / 2.0;
        const double mid_y = element->y + element->h;
        const long cx = (long) floor(mid_x / cell);
        const long cy = (long) floor(mid_y / cell);
        long y0 = cy - seed;
        long y1 = cy + seed;
        long x0 = cx - seed;
        long x1 = cx + seed;
        if (y0 < 0) {
            y0 = 0;
        }
        if (x0 < 0) {
            x0 = 0;
        }
        if (y1 > (long) ny - 1) {
            y1 = (long) ny - 1;
        }
        if (x1 > (long) nx - 1) {
            x1 = (long) nx - 1;
        }
        for (long iy = y0; iy <= y1; iy += 1) {
            for (long ix = x0; ix <= x1; ix += 1) {
                const size_t cell_index = (size_t) iy * nx + (size_t) ix;
                if (grid->blocked[cell_index] || grid->exterior[cell_index] || dist[cell_index] == 0.0) {
                    continue;
                }
                dist[cell_index] = 0.0;
                heap_push(&heap, 0.0, cell_index);
            }
        }
    }

    if (exits == 0) {
        free(dist);
        free(seen);
        free(stack);
        heap_free(&heap);
        return; /* sin salidas no se puede medir el recorrido */
    }
    travel->computed = 1;

    const int offsets[8][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};
    while (heap.count > 0) {
        double cost = 0.0;
        size_t current = 0;
        if (!heap_pop(&heap, &cost, &current)) {
            break;
        }
        if (cost > dist[current] + 0.0001) {
            continue;
        }
        const long ix = (long) (current % nx);
        const long iy = (long) (current / nx);
        for (int side = 0; side < 8; side += 1) {
            const long jx = ix + offsets[side][0];
            const long jy = iy + offsets[side][1];
            if (jx < 0 || jy < 0 || jx >= (long) nx || jy >= (long) ny) {
                continue;
            }
            const size_t next = (size_t) jy * nx + (size_t) jx;
            if (grid->blocked[next] || grid->exterior[next]) {
                continue;
            }
            const int diagonal = offsets[side][0] != 0 && offsets[side][1] != 0;
            const double step = cell_m * (diagonal ? NORMA_DIAGONAL : 1.0);
            const double candidate = dist[current] + step;
            if (candidate + 0.0001 < dist[next]) {
                dist[next] = candidate;
                heap_push(&heap, candidate, next);
            }
        }
    }

    double longest = -1.0;
    norma_point farthest = {0.0, 0.0};
    double reachable_area = 0.0;
    for (size_t iy = 0; iy < ny; iy += 1) {
        for (size_t ix = 0; ix < nx; ix += 1) {
            const size_t index = iy * nx + ix;
            if (grid->blocked[index] || grid->exterior[index]) {
                continue;
            }
            if (isinf(dist[index])) {
                continue;
            }
            reachable_area += cell_area_m2;
            if (dist[index] > longest) {
                longest = dist[index];
                farthest = cell_center(ix, iy, cell, grid->width, grid->height);
            }
        }
    }
    if (longest >= 0.0) {
        travel->has_longest = 1;
        travel->longest_m = round_meters(longest);
        travel->has_farthest = 1;
        travel->farthest = farthest;
    }
    travel->reachable_area_m2 = round_meters(reachable_area);
    travel->unreachable_area_m2 = round_meters(grid->free_area_m2 - reachable_area);

    /* Zonas sin salida: se agrupan por vecindad de cuatro lados. */
    norma_travel_room found[NORMA_MAX_TRAVEL_ROOMS];
    size_t found_count = 0;
    const double min_room_area = criteria->min_room_area_m2 > 0.0 ? criteria->min_room_area_m2 : 0.0;
    for (size_t iy = 0; iy < ny; iy += 1) {
        for (size_t ix = 0; ix < nx; ix += 1) {
            const size_t start = iy * nx + ix;
            if (grid->blocked[start] || grid->exterior[start] || !isinf(dist[start]) || seen[start]) {
                continue;
            }
            size_t top = 0;
            stack[top] = start;
            top += 1;
            seen[start] = 1;
            size_t count = 0;
            double sum_x = 0.0;
            double sum_y = 0.0;
            while (top > 0) {
                top -= 1;
                const size_t current = stack[top];
                const long cx = (long) (current % nx);
                const long cy = (long) (current / nx);
                count += 1;
                const norma_point center = cell_center((size_t) cx, (size_t) cy, cell, grid->width, grid->height);
                sum_x += center.x;
                sum_y += center.y;
                const int steps[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
                for (int side = 0; side < 4; side += 1) {
                    const long jx = cx + steps[side][0];
                    const long jy = cy + steps[side][1];
                    if (jx < 0 || jy < 0 || jx >= (long) nx || jy >= (long) ny) {
                        continue;
                    }
                    const size_t next = (size_t) jy * nx + (size_t) jx;
                    if (grid->blocked[next] || grid->exterior[next] || !isinf(dist[next]) || seen[next]) {
                        continue;
                    }
                    seen[next] = 1;
                    stack[top] = next;
                    top += 1;
                }
            }
            const double area = (double) count * cell_area_m2;
            if (area + 0.0001 >= min_room_area) {
                const norma_point center = {sum_x / (double) count, sum_y / (double) count};
                add_room(found, &found_count, round_meters(area), count, center);
            }
        }
    }

    /* Orden: de mayor a menor superficie; se conservan las cinco primeras. */
    for (size_t index = 1; index < found_count; index += 1) {
        norma_travel_room current = found[index];
        size_t position = index;
        while (position > 0 && found[position - 1].area_m2 < current.area_m2) {
            found[position] = found[position - 1];
            position -= 1;
        }
        found[position] = current;
    }
    travel->room_count = found_count < NORMA_TRAVEL_ROOMS ? found_count : NORMA_TRAVEL_ROOMS;
    for (size_t index = 0; index < travel->room_count; index += 1) {
        travel->rooms[index] = found[index];
    }

    free(dist);
    free(seen);
    free(stack);
    heap_free(&heap);
}
