/*
 * Normia nativo · cobertura de extintores (espejo de ExtinguisherCoverage).
 *
 * Tres cosas que se copian tal cual de la edición web, porque si cambian el
 * resultado cambia:
 *   1. el **recorrido** se propaga por la rejilla con ocho vecinos —nunca en
 *      línea recta— y el equipo "ve" desde la celda donde está dibujado;
 *   2. el **área** se asigna primero al equipo más cercano que llegue dentro de
 *      su distancia máxima y, si esa área supera lo que admite su clasificación,
 *      se conservan las celdas más cercanas y el resto queda descubierto;
 *   3. las zonas descubiertas se agrupan por vecindad de cuatro lados y se
 *      publican con su motivo dominante y su punto más desfavorable.
 *
 * Las cifras se escriben con el formato del auditor (`number_format(…, 1, ',',
 * '.')`): un decimal, coma decimal y punto de miles.
 */
#include "normia/extinguisher.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/format.h"

/* ------------------------------ utilidades JSON ---------------------------- */

static void set_text(char *target, size_t size, const char *value)
{
    snprintf(target, size, "%s", value != NULL ? value : "");
}

static const char *text_at(const norma_json *object, const char *key, const char *fallback)
{
    const char *value = norma_json_string(norma_json_get(object, key));
    return value != NULL ? value : fallback;
}

static double number_at(const norma_json *object, const char *key, double fallback)
{
    return norma_json_number(norma_json_get(object, key), fallback);
}

/** Valor de una lista de texto, o `NULL` si no está. */
static int has_value(const norma_json *list, const char *value)
{
    const size_t total = norma_json_size(list);
    for (size_t index = 0; index < total; index += 1) {
        const char *item = norma_json_string(norma_json_at(list, index));
        if (item != NULL && strcmp(item, value) == 0) {
            return 1;
        }
    }
    return 0;
}

/* --------------------------------- tablas --------------------------------- */

static int load_file(const char *path, char **text, size_t *length)
{
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        return 0;
    }
    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return 0;
    }
    const long size = ftell(file);
    if (size < 0) {
        fclose(file);
        return 0;
    }
    rewind(file);
    char *buffer = (char *) malloc((size_t) size + 1);
    if (buffer == NULL) {
        fclose(file);
        return 0;
    }
    const size_t read = fread(buffer, 1, (size_t) size, file);
    fclose(file);
    buffer[read] = '\0';
    *text = buffer;
    *length = read;
    return 1;
}

int norma_ext_norms_load(const char *resources, const char *profile, const char *hazard,
                         norma_ext_norms *norms, char *error, size_t error_size)
{
    if (norms == NULL) {
        return 0;
    }
    memset(norms, 0, sizeof(*norms));
    const char *folder = resources != NULL && resources[0] != '\0' ? resources : "resources";
    char path[512];
    snprintf(path, sizeof(path), "%s/extinguisher-criteria.json", folder);
    char *text = NULL;
    size_t length = 0;
    if (!load_file(path, &text, &length)) {
        snprintf(error, error_size, "No se pudo abrir «%s».", path);
        return 0;
    }
    char parse_error[160];
    norms->root = norma_json_parse(text, length, parse_error, sizeof(parse_error));
    free(text);
    if (norms->root == NULL) {
        snprintf(error, error_size, "Las tablas de extintores no son JSON válido: %s", parse_error);
        return 0;
    }
    const norma_json *profiles = norma_json_get(norms->root, "profiles");
    if (norma_json_size(profiles) == 0) {
        norma_ext_norms_free(norms);
        snprintf(error, error_size, "Las tablas de extintores no traen perfiles.");
        return 0;
    }
    const char *fallback = text_at(norms->root, "defaultProfile", "colombia");
    const char *key = profile != NULL && profile[0] != '\0' ? profile : fallback;
    if (norma_json_get(profiles, key) == NULL) {
        key = fallback;
    }
    set_text(norms->profile, sizeof(norms->profile), key);
    const char *selected = hazard != NULL && hazard[0] != '\0' ? hazard : "ordinary";
    if (strcmp(selected, "light") != 0 && strcmp(selected, "ordinary") != 0
        && strcmp(selected, "extra") != 0) {
        selected = "ordinary";
    }
    set_text(norms->hazard, sizeof(norms->hazard), selected);
    return 1;
}

void norma_ext_norms_free(norma_ext_norms *norms)
{
    if (norms == NULL) {
        return;
    }
    norma_json_free(norms->root);
    norms->root = NULL;
}

const char *norma_ext_profile_key(const norma_ext_norms *norms)
{
    return norms != NULL && norms->profile[0] != '\0' ? norms->profile : "colombia";
}

static const norma_json *profile_object(const norma_ext_norms *norms)
{
    if (norms == NULL || norms->root == NULL) {
        return NULL;
    }
    return norma_json_get(norma_json_get(norms->root, "profiles"), norma_ext_profile_key(norms));
}

const char *norma_ext_hazard_label(const norma_ext_norms *norms, const char *hazard)
{
    const norma_json *class_a = norma_json_get(profile_object(norms), "classA");
    const norma_json *row = norma_json_get(norma_json_get(class_a, "hazards"),
                                          hazard != NULL ? hazard : "ordinary");
    return text_at(row, "label", hazard != NULL ? hazard : "Ordinario");
}

/* ------------------------------ clasificaciones ---------------------------- */

static int is_letter(char value)
{
    return (value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z');
}

static int same_letter(char value, char letter)
{
    const char upper = (value >= 'a' && value <= 'z') ? (char) (value - 'a' + 'A') : value;
    return upper == letter;
}

/**
 * Lee una clasificación como «2-A:10-B:C»: los números de A y de B (el mayor de
 * cada uno) y las clases que declara.
 */
void norma_ext_parse_rating(const char *raw, int *rating_a, int *rating_b, int *classes)
{
    *rating_a = 0;
    *rating_b = 0;
    *classes = 0;
    if (raw == NULL) {
        return;
    }
    const size_t length = strlen(raw);
    for (size_t index = 0; index < length; index += 1) {
        if (!(raw[index] >= '0' && raw[index] <= '9')) {
            continue;
        }
        size_t cursor = index;
        int value = 0;
        while (cursor < length && raw[cursor] >= '0' && raw[cursor] <= '9') {
            value = value * 10 + (raw[cursor] - '0');
            cursor += 1;
        }
        while (cursor < length && (raw[cursor] == ' ' || raw[cursor] == '\t')) {
            cursor += 1;
        }
        if (cursor >= length || raw[cursor] != '-') {
            index = cursor;
            continue;
        }
        cursor += 1;
        while (cursor < length && (raw[cursor] == ' ' || raw[cursor] == '\t')) {
            cursor += 1;
        }
        if (cursor < length && same_letter(raw[cursor], 'A')) {
            *rating_a = value > *rating_a ? value : *rating_a;
            *classes |= NORMA_FIRE_A;
        } else if (cursor < length && same_letter(raw[cursor], 'B')) {
            *rating_b = value > *rating_b ? value : *rating_b;
            *classes |= NORMA_FIRE_B;
        }
        index = cursor;
    }
    /* C, D y K se declaran como letra suelta. */
    const struct {
        char letter;
        int bit;
    } singles[] = {{'C', NORMA_FIRE_C}, {'D', NORMA_FIRE_D}, {'K', NORMA_FIRE_K}};
    for (size_t single = 0; single < sizeof(singles) / sizeof(singles[0]); single += 1) {
        for (size_t index = 0; index < length; index += 1) {
            if (!same_letter(raw[index], singles[single].letter)) {
                continue;
            }
            const int before = index == 0 || !is_letter(raw[index - 1]);
            const int after = index + 1 >= length || !is_letter(raw[index + 1]);
            if (before && after) {
                *classes |= singles[single].bit;
                break;
            }
        }
    }
}

/** Clases que cubre el agente declarado. */
static int agent_classes(const norma_ext_norms *norms, const char *agent)
{
    const norma_json *row = norma_json_get(norma_json_get(norms->root, "agents"), agent);
    const norma_json *list = norma_json_get(row, "classes");
    int mask = 0;
    if (has_value(list, "A")) {
        mask |= NORMA_FIRE_A;
    }
    if (has_value(list, "B")) {
        mask |= NORMA_FIRE_B;
    }
    if (has_value(list, "C")) {
        mask |= NORMA_FIRE_C;
    }
    if (has_value(list, "D")) {
        mask |= NORMA_FIRE_D;
    }
    if (has_value(list, "K")) {
        mask |= NORMA_FIRE_K;
    }
    return mask;
}

/** Clases efectivas: la intersección entre el agente y el rótulo. */
static int effective_classes(const norma_ext_norms *norms, const char *agent, int declared)
{
    const int from_agent = agent_classes(norms, agent);
    if (from_agent == 0) {
        return declared;
    }
    return declared == 0 ? from_agent : (from_agent & declared);
}

/** Distancia máxima de recorrido para un número de clasificación B. */
static double travel_for_b(const norma_ext_norms *norms, const char *hazard, int rating_b,
                           int *found)
{
    *found = 0;
    const norma_json *profile = profile_object(norms);
    const norma_json *class_b = norma_json_get(profile, "classB");
    const norma_json *rows = norma_json_get(norma_json_get(class_b, "hazards"), hazard);
    const size_t total = norma_json_size(rows);
    if (total == 0 || rating_b <= 0) {
        return 0.0;
    }
    double travel = -1.0;
    for (size_t index = 0; index < total; index += 1) {
        const norma_json *row = norma_json_at(rows, index);
        if (rating_b >= (int) number_at(row, "minRatingB", 0.0)) {
            travel = number_at(row, "travelM", 0.0);
        }
    }
    if (travel < 0.0) {
        travel = number_at(norma_json_at(rows, 0), "travelM", 0.0);
    }
    const double cap = number_at(class_b, "maxTravelM", 0.0);
    if (cap > 0.0 && travel > cap) {
        travel = cap;
    }
    *found = 1;
    return travel;
}

typedef struct {
    int has_travel;
    double travel_m;
    int has_area_limit;
    double area_limit_m2;
    int classes;
    int rating_a;
    int rating_b;
    char hazard[16];
    char hazard_label[32];
} ext_limits;

static void limits_for(const norma_ext_norms *norms, int rating_a, int rating_b, int declared,
                       const char *agent, const char *hazard, ext_limits *limits)
{
    memset(limits, 0, sizeof(*limits));
    set_text(limits->hazard, sizeof(limits->hazard), hazard);
    set_text(limits->hazard_label, sizeof(limits->hazard_label),
             norma_ext_hazard_label(norms, hazard));
    limits->rating_a = rating_a;
    limits->rating_b = rating_b;
    limits->classes = effective_classes(norms, agent, declared);

    const norma_json *profile = profile_object(norms);
    const norma_json *class_a = norma_json_get(profile, "classA");
    const norma_json *hazard_a = norma_json_get(norma_json_get(class_a, "hazards"), hazard);

    if ((limits->classes & NORMA_FIRE_A) != 0 && rating_a > 0) {
        const double travel_a = number_at(class_a, "travelM", 22.9);
        limits->has_travel = 1;
        limits->travel_m = travel_a;
        const double per_rating = number_at(hazard_a, "areaPerRatingM2", 0.0);
        const double cap = number_at(class_a, "maxAreaPerExtinguisherM2", 1045.0);
        if (per_rating > 0.0) {
            const double area = per_rating * (double) rating_a;
            limits->has_area_limit = 1;
            limits->area_limit_m2 = area < cap ? area : cap;
        }
    }
    if ((limits->classes & NORMA_FIRE_B) != 0 && rating_b > 0) {
        int found = 0;
        const double travel_b = travel_for_b(norms, hazard, rating_b, &found);
        if (found) {
            limits->has_travel = 1;
            if (travel_b < limits->travel_m || limits->travel_m <= 0.0) {
                limits->travel_m = travel_b;
            }
        }
    }
    const struct {
        const char *key;
        int bit;
    } extra[] = {{"classD", NORMA_FIRE_D}, {"classK", NORMA_FIRE_K}};
    for (size_t index = 0; index < sizeof(extra) / sizeof(extra[0]); index += 1) {
        if ((limits->classes & extra[index].bit) == 0) {
            continue;
        }
        const double travel = number_at(norma_json_get(profile, extra[index].key), "travelM", 0.0);
        if (travel > 0.0) {
            limits->has_travel = 1;
            if (travel < limits->travel_m || limits->travel_m <= 0.0) {
                limits->travel_m = travel;
            }
        }
    }
    if (limits->has_travel) {
        limits->travel_m = round(limits->travel_m * 100.0) / 100.0;
    }
    if (limits->has_area_limit) {
        limits->area_limit_m2 = round(limits->area_limit_m2 * 10.0) / 10.0;
    }
}

/** Cantidad mínima de extintores por superficie (Resolución 2400, art. 221). */
static long required_by_area(const norma_ext_norms *norms, double area_m2)
{
    const norma_json *rule = norma_json_get(profile_object(norms), "areaRule");
    if (rule == NULL || area_m2 <= 0.0) {
        return 0;
    }
    const double per = number_at(rule, "onePerM2", 0.0);
    return per > 0.0 ? (long) ceil(area_m2 / per) : 0;
}

/** Altura máxima de la parte superior del extintor, según el peso bruto. */
static double max_mount_cm(const norma_ext_norms *norms, double capacity_lb)
{
    const norma_json *mounting = norma_json_get(profile_object(norms), "mounting");
    const double small_max_kg = number_at(mounting, "smallMaxGrossKg", 18.14);
    const double gross_kg = capacity_lb * 0.4536 * 1.35;
    return gross_kg <= small_max_kg ? number_at(mounting, "maxTopCmSmall", 153.0)
                                    : number_at(mounting, "maxTopCmLarge", 107.0);
}

/** 1 si el tipo del elemento es un extintor del catálogo. */
static const norma_json *catalog_default(const norma_ext_norms *norms, const char *type)
{
    return norma_json_get(norma_json_get(norms->root, "catalogDefaults"), type);
}

/* ------------------------------- cola mínima ------------------------------- */

typedef struct {
    double cost;
    size_t index;
} ext_node;

typedef struct {
    ext_node *items;
    size_t count;
    size_t capacity;
    int failed;
} ext_heap;

static int heap_reserve(ext_heap *heap)
{
    if (heap->failed) {
        return 0;
    }
    if (heap->count < heap->capacity) {
        return 1;
    }
    const size_t capacity = heap->capacity == 0 ? 256 : heap->capacity * 2;
    ext_node *grown = (ext_node *) realloc(heap->items, capacity * sizeof(ext_node));
    if (grown == NULL) {
        heap->failed = 1;
        return 0;
    }
    heap->items = grown;
    heap->capacity = capacity;
    return 1;
}

static void heap_push(ext_heap *heap, double cost, size_t index)
{
    if (!heap_reserve(heap)) {
        return;
    }
    size_t position = heap->count;
    heap->count += 1;
    while (position > 0) {
        const size_t parent = (position - 1) / 2;
        if (heap->items[parent].cost <= cost) {
            break;
        }
        heap->items[position] = heap->items[parent];
        position = parent;
    }
    heap->items[position].cost = cost;
    heap->items[position].index = index;
}

static int heap_pop(ext_heap *heap, ext_node *out)
{
    if (heap->count == 0) {
        return 0;
    }
    *out = heap->items[0];
    heap->count -= 1;
    if (heap->count == 0) {
        return 1;
    }
    const ext_node last = heap->items[heap->count];
    size_t position = 0;
    while (1) {
        size_t child = position * 2 + 1;
        if (child >= heap->count) {
            break;
        }
        if (child + 1 < heap->count && heap->items[child + 1].cost < heap->items[child].cost) {
            child += 1;
        }
        if (heap->items[child].cost >= last.cost) {
            break;
        }
        heap->items[position] = heap->items[child];
        position = child;
    }
    heap->items[position] = last;
    return 1;
}

/** Radio inicial, en celdas, alrededor del equipo (mismo cálculo que la web). */
static long start_radius(const norma_grid *grid)
{
    const double cells = ceil((grid->clearance + grid->cell * 1.5) / grid->cell);
    return cells < 1.0 ? 1 : (long) cells;
}

/**
 * Campo de distancias en metros desde el equipo hasta cada celda libre, con
 * ocho vecinos y respetando muros y vanos.
 */
static void distance_field(const norma_grid *grid, const norma_point *center, long radius,
                           double *dist)
{
    const size_t total = grid->nx * grid->ny;
    for (size_t index = 0; index < total; index += 1) {
        dist[index] = INFINITY;
    }
    ext_heap heap = {NULL, 0, 0, 0};
    const long cx = (long) floor(center->x / grid->cell);
    const long cy = (long) floor(center->y / grid->cell);
    const long y_from = cy - radius > 0 ? cy - radius : 0;
    const long y_to = cy + radius < (long) grid->ny - 1 ? cy + radius : (long) grid->ny - 1;
    const long x_from = cx - radius > 0 ? cx - radius : 0;
    const long x_to = cx + radius < (long) grid->nx - 1 ? cx + radius : (long) grid->nx - 1;
    for (long iy = y_from; iy <= y_to; iy += 1) {
        for (long ix = x_from; ix <= x_to; ix += 1) {
            const size_t index = (size_t) iy * grid->nx + (size_t) ix;
            if (grid->blocked[index] || grid->exterior[index]) {
                continue;
            }
            dist[index] = 0.0;
            heap_push(&heap, 0.0, index);
        }
    }
    static const int neighbours[8][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1},
                                         {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};
    ext_node node;
    while (heap_pop(&heap, &node)) {
        if (node.cost > dist[node.index] + 0.0001) {
            continue;
        }
        const long ix = (long) (node.index % grid->nx);
        const long iy = (long) (node.index / grid->nx);
        for (size_t step = 0; step < 8; step += 1) {
            const long jx = ix + neighbours[step][0];
            const long jy = iy + neighbours[step][1];
            if (jx < 0 || jy < 0 || jx >= (long) grid->nx || jy >= (long) grid->ny) {
                continue;
            }
            const size_t next = (size_t) jy * grid->nx + (size_t) jx;
            if (grid->blocked[next] || grid->exterior[next]) {
                continue;
            }
            const double step_m = grid->cell_m
                                  * ((neighbours[step][0] != 0 && neighbours[step][1] != 0)
                                         ? 1.41421356
                                         : 1.0);
            const double candidate = dist[node.index] + step_m;
            if (candidate + 0.0001 < dist[next]) {
                dist[next] = candidate;
                heap_push(&heap, candidate, next);
            }
        }
    }
    free(heap.items);
}

/* --------------------------- orden estable de celdas ----------------------- */

typedef struct {
    double distance;
    size_t cell;
    size_t order;
} ext_cell;

static int compare_cell(const void *a, const void *b)
{
    const ext_cell *first = (const ext_cell *) a;
    const ext_cell *second = (const ext_cell *) b;
    if (first->distance < second->distance) {
        return -1;
    }
    if (first->distance > second->distance) {
        return 1;
    }
    return first->order < second->order ? -1 : (first->order > second->order ? 1 : 0);
}

typedef struct {
    double area;
    size_t order;
    norma_ext_zone zone;
} ext_zone_slot;

static int compare_zone(const void *a, const void *b)
{
    const ext_zone_slot *first = (const ext_zone_slot *) a;
    const ext_zone_slot *second = (const ext_zone_slot *) b;
    if (first->area > second->area) {
        return -1;
    }
    if (first->area < second->area) {
        return 1;
    }
    return first->order < second->order ? -1 : (first->order > second->order ? 1 : 0);
}

/* --------------------------------- motivos -------------------------------- */

enum {
    REASON_TRAVEL = 0,
    REASON_AREA = 1,
    REASON_UNREACHABLE = 2,
    REASON_NO_CLASS = 3,
    REASON_COUNT = 4,
};

static const char *const kReasonNames[REASON_COUNT] = {"travel", "area", "unreachable", "no_class"};

static double round_to(double value, double factor)
{
    return round(value * factor) / factor;
}

/* ------------------------------- extracción ------------------------------- */

static int extract_units(const norma_document *document, const norma_ext_norms *norms,
                         norma_ext_unit *units, size_t *count)
{
    *count = 0;
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        const norma_json *defaults = catalog_default(norms, element->type);
        if (defaults == NULL && element->ext_agent[0] == '\0') {
            continue;
        }
        if (*count >= NORMA_EXT_MAX_UNITS) {
            break;
        }
        norma_ext_unit unit;
        memset(&unit, 0, sizeof(unit));
        set_text(unit.id, sizeof(unit.id), element->id);
        set_text(unit.type, sizeof(unit.type), element->type);
        /* Se usan los datos que trae el plano, no los del catálogo: si el plano
           viene de la web ya están completados por el validador, y si no, se
           dice «sin clase» en vez de suponer un equipo que nadie declaró. */
        set_text(unit.agent, sizeof(unit.agent), element->ext_agent);
        set_text(unit.rating, sizeof(unit.rating), element->ext_rating);
        set_text(unit.hazard, sizeof(unit.hazard),
                 element->ext_hazard[0] != '\0' ? element->ext_hazard : norms->hazard);
        unit.capacity_lb = round_to((double) element->ext_capacity_lb, 10.0);
        unit.mount_cm = round_to((double) element->ext_mount_cm, 10.0);
        unit.cx = round_to(element->x + element->w / 2.0, 100.0);
        unit.cy = round_to(element->y + element->h / 2.0, 100.0);
        unit.wheeled = strstr(element->type, "wheeled") != NULL;
        unit.mount_max_cm = max_mount_cm(norms, unit.capacity_lb);
        set_text(unit.agent_label, sizeof(unit.agent_label),
                 text_at(norma_json_get(norma_json_get(norms->root, "agents"), unit.agent),
                         "label", "Sin agente"));
        unit.status = "ok";
        units[*count] = unit;
        *count += 1;
    }
    return (int) *count;
}

/** Señales de extintor del perfil (F001 por omisión) que están en el plano. */
static size_t collect_signs(const norma_document *document, const norma_library *library,
                           const norma_ext_norms *norms, norma_point *centers, size_t capacity)
{
    if (library == NULL) {
        return 0;
    }
    const norma_json *signage = norma_json_get(profile_object(norms), "signage");
    const norma_json *codes = norma_json_get(signage, "codes");
    size_t count = 0;
    for (size_t index = 0; index < document->count && count < capacity; index += 1) {
        const norma_element *element = &document->elements[index];
        char code[64];
        const char *resolved = norma_library_code_for_type(library, element->type, code, sizeof(code));
        if (resolved == NULL || !has_value(codes, resolved)) {
            continue;
        }
        centers[count].x = element->x + element->w / 2.0;
        centers[count].y = element->y + element->h / 2.0;
        count += 1;
    }
    return count;
}

/* --------------------------------- medidas -------------------------------- */

void norma_ext_analyze(const norma_document *document, const norma_grid *grid,
                       const norma_library *library, const norma_ext_norms *norms,
                       norma_ext_result *result)
{
    if (document == NULL || grid == NULL || norms == NULL || result == NULL) {
        return;
    }
    memset(result, 0, sizeof(*result));
    const size_t total = grid->nx * grid->ny;
    if (total == 0) {
        return;
    }
    size_t floor_cells = 0;
    for (size_t index = 0; index < total; index += 1) {
        if (!grid->blocked[index] && !grid->exterior[index]) {
            floor_cells += 1;
        }
    }
    const double cell_area = grid->cell_area_m2;
    const double floor_area = (double) floor_cells * cell_area;

    size_t unit_count = 0;
    extract_units(document, norms, result->units, &unit_count);
    result->unit_count = unit_count;
    result->summary.floor_area_m2 = round_to(floor_area, 10.0);
    result->summary.cell_m = round_to(grid->cell_m, 100.0);
    set_text(result->summary.hazard_label, sizeof(result->summary.hazard_label),
             norma_ext_hazard_label(norms, norms->hazard));

    if (unit_count == 0) {
        result->summary.required_by_area = required_by_area(norms, floor_area);
        return;
    }

    int *best_unit = (int *) malloc(total * sizeof(int));
    int *raw_unit = (int *) malloc(total * sizeof(int));
    int *area_reason = (int *) malloc(total * sizeof(int));
    double *best_dist = (double *) malloc(total * sizeof(double));
    double *raw_dist = (double *) malloc(total * sizeof(double));
    double *dist = (double *) malloc(total * sizeof(double));
    if (best_unit == NULL || raw_unit == NULL || area_reason == NULL || best_dist == NULL
        || raw_dist == NULL || dist == NULL) {
        free(best_unit);
        free(raw_unit);
        free(area_reason);
        free(best_dist);
        free(raw_dist);
        free(dist);
        return;
    }
    for (size_t index = 0; index < total; index += 1) {
        best_unit[index] = -1;
        raw_unit[index] = -1;
        area_reason[index] = -1;
        best_dist[index] = INFINITY;
        raw_dist[index] = INFINITY;
    }
    const long radius = start_radius(grid);

    for (size_t unit = 0; unit < unit_count; unit += 1) {
        norma_ext_unit *report = &result->units[unit];
        int rating_a = 0;
        int rating_b = 0;
        int declared = 0;
        norma_ext_parse_rating(report->rating, &rating_a, &rating_b, &declared);
        ext_limits limits;
        limits_for(norms, rating_a, rating_b, declared, report->agent, report->hazard, &limits);
        report->classes = limits.classes;
        report->rating_a = limits.rating_a;
        report->rating_b = limits.rating_b;
        report->has_travel = limits.has_travel;
        report->travel_m = limits.travel_m;
        report->has_area_limit = limits.has_area_limit;
        report->area_limit_m2 = limits.area_limit_m2;
        set_text(report->hazard_label, sizeof(report->hazard_label), limits.hazard_label);

        const norma_point center = {report->cx, report->cy};
        distance_field(grid, &center, radius, dist);
        size_t assigned = 0;
        int has_farthest = 0;
        double farthest = 0.0;
        for (size_t index = 0; index < total; index += 1) {
            if (!isfinite(dist[index])) {
                continue;
            }
            const double distance = dist[index];
            if (distance < raw_dist[index]) {
                raw_dist[index] = distance;
                raw_unit[index] = (int) unit;
            }
            if (!limits.has_travel || distance > limits.travel_m + 0.0001) {
                continue;
            }
            if (distance < best_dist[index]) {
                best_dist[index] = distance;
                best_unit[index] = (int) unit;
            }
            assigned += 1;
            if (!has_farthest || distance > farthest) {
                farthest = distance;
                has_farthest = 1;
            }
        }
        report->travel_area_m2 = round_to((double) assigned * cell_area, 10.0);
        report->has_max_travel = has_farthest;
        report->max_travel_m = has_farthest ? round_to(farthest, 100.0) : 0.0;
    }

    /* Segundo criterio: el área asignada no puede superar la del rótulo. */
    double *over_area = (double *) calloc(unit_count, sizeof(double));
    ext_cell *cells = NULL;
    size_t cells_capacity = 0;
    for (size_t unit = 0; unit < unit_count; unit += 1) {
        if (!result->units[unit].has_area_limit) {
            continue;
        }
        const double cap = result->units[unit].area_limit_m2;
        size_t count = 0;
        for (size_t index = 0; index < total; index += 1) {
            if (best_unit[index] != (int) unit) {
                continue;
            }
            if (count == cells_capacity) {
                const size_t capacity = cells_capacity == 0 ? 1024 : cells_capacity * 2;
                ext_cell *grown = (ext_cell *) realloc(cells, capacity * sizeof(ext_cell));
                if (grown == NULL) {
                    count = 0;
                    break;
                }
                cells = grown;
                cells_capacity = capacity;
            }
            cells[count].distance = best_dist[index];
            cells[count].cell = index;
            cells[count].order = count;
            count += 1;
        }
        if (over_area != NULL) {
            const double assigned_area = (double) count * cell_area;
            over_area[unit] = assigned_area - cap > 0.0 ? assigned_area - cap : 0.0;
        }
        if ((double) count * cell_area > cap + 0.0001) {
            qsort(cells, count, sizeof(ext_cell), compare_cell);
            const size_t keep = (size_t) floor(cap / cell_area + 0.0001);
            for (size_t position = keep; position < count; position += 1) {
                const size_t cell = cells[position].cell;
                best_unit[cell] = -1;
                best_dist[cell] = INFINITY;
                area_reason[cell] = (int) unit;
            }
        }
    }
    free(cells);

    size_t covered_cells = 0;
    for (size_t index = 0; index < total; index += 1) {
        if (best_unit[index] >= 0) {
            result->units[best_unit[index]].coverage_area_m2 += cell_area;
            covered_cells += 1;
        }
    }
    const double covered_area = (double) covered_cells * cell_area;
    const double uncovered_area = floor_area - covered_area > 0.0 ? floor_area - covered_area : 0.0;

    const norma_json *signage = norma_json_get(profile_object(norms), "signage");
    const double sign_radius = number_at(signage, "radiusCm", 150.0);
    norma_point sign_centers[NORMA_EXT_MAX_UNITS * 8];
    const size_t sign_count = collect_signs(document, library, norms, sign_centers,
                                             sizeof(sign_centers) / sizeof(sign_centers[0]));
    size_t units_with_gap = 0;
    for (size_t unit = 0; unit < unit_count; unit += 1) {
        norma_ext_unit *report = &result->units[unit];
        report->coverage_area_m2 = round_to(report->coverage_area_m2, 10.0);
        report->coverage_pct = floor_area > 0.0
                                   ? round_to(report->coverage_area_m2 / floor_area * 100.0, 10.0)
                                   : 0.0;
        report->over_area_m2 = over_area != NULL ? round_to(over_area[unit], 10.0) : 0.0;
        int has_sign = 0;
        double sign_distance = 0.0;
        for (size_t sign = 0; sign < sign_count; sign += 1) {
            const double dx = sign_centers[sign].x - report->cx;
            const double dy = sign_centers[sign].y - report->cy;
            const double distance = sqrt(dx * dx + dy * dy);
            if (!has_sign || distance < sign_distance) {
                sign_distance = distance;
                has_sign = 1;
            }
        }
        report->has_sign_distance = has_sign;
        report->sign_distance_m = has_sign ? round_to(sign_distance / 100.0, 100.0) : 0.0;
        report->sign_covered = has_sign && sign_distance <= sign_radius;
        if (report->coverage_area_m2 <= 0.0 && (!report->has_travel || report->classes == 0)) {
            report->status = "no_class";
        } else if (report->over_area_m2 > 0.5) {
            report->status = "area";
        } else if (!report->has_travel) {
            report->status = "no_class";
        } else {
            report->status = "ok";
        }
        if (report->coverage_area_m2 <= 0.0) {
            units_with_gap += 1;
        }
    }

    /* Zonas descubiertas, agrupadas por vecindad de cuatro lados. */
    unsigned char *uncovered = (unsigned char *) calloc(total, 1);
    unsigned char *visited = (unsigned char *) calloc(total, 1);
    size_t *stack = (size_t *) malloc(total * sizeof(size_t));
    size_t *zone_cells = (size_t *) malloc(total * sizeof(size_t));
    ext_zone_slot *slots = (ext_zone_slot *) calloc(NORMA_EXT_MAX_ZONES * 8 + 8, sizeof(ext_zone_slot));
    size_t slot_count = 0;
    size_t slot_capacity = NORMA_EXT_MAX_ZONES * 8 + 8;
    if (uncovered == NULL || visited == NULL || stack == NULL || zone_cells == NULL || slots == NULL) {
        free(uncovered);
        free(visited);
        free(stack);
        free(zone_cells);
        free(slots);
        goto summary;
    }
    for (size_t index = 0; index < total; index += 1) {
        if (!grid->blocked[index] && !grid->exterior[index] && best_unit[index] < 0) {
            uncovered[index] = 1;
        }
    }
    for (size_t start = 0; start < total; start += 1) {
        if (!uncovered[start] || visited[start]) {
            continue;
        }
        size_t stack_size = 0;
        size_t cell_count = 0;
        stack[stack_size] = start;
        stack_size += 1;
        visited[start] = 1;
        while (stack_size > 0) {
            stack_size -= 1;
            const size_t current = stack[stack_size];
            zone_cells[cell_count] = current;
            cell_count += 1;
            const long ix = (long) (current % grid->nx);
            const long iy = (long) (current / grid->nx);
            static const int sides[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
            for (size_t side = 0; side < 4; side += 1) {
                const long jx = ix + sides[side][0];
                const long jy = iy + sides[side][1];
                if (jx < 0 || jy < 0 || jx >= (long) grid->nx || jy >= (long) grid->ny) {
                    continue;
                }
                const size_t next = (size_t) jy * grid->nx + (size_t) jx;
                if (!uncovered[next] || visited[next]) {
                    continue;
                }
                visited[next] = 1;
                stack[stack_size] = next;
                stack_size += 1;
            }
        }
        if (cell_count < 2)
            continue;
        ext_zone_slot slot;
        memset(&slot, 0, sizeof(slot));
        slot.order = slot_count;
        double sum_x = 0.0;
        double sum_y = 0.0;
        int has_worst = 0;
        double worst_x = 0.0;
        double worst_y = 0.0;
        double worst_distance = -1.0;
        size_t reason_counts[REASON_COUNT] = {0, 0, 0, 0};
        size_t reason_order[REASON_COUNT] = {0, 0, 0, 0};
        size_t reason_seen = 0;
        for (size_t position = 0; position < cell_count; position += 1) {
            const size_t cell = zone_cells[position];
            const double x = fmin(grid->width, ((double) (cell % grid->nx) + 0.5) * grid->cell);
            const double y = fmin(grid->height, ((double) (cell / grid->nx) + 0.5) * grid->cell);
            sum_x += x;
            sum_y += y;
            int reason;
            if (area_reason[cell] >= 0) {
                reason = REASON_AREA;
            } else if (raw_unit[cell] < 0) {
                reason = REASON_UNREACHABLE;
            } else if (!result->units[raw_unit[cell]].has_travel) {
                reason = REASON_NO_CLASS;
            } else if (raw_dist[cell] > result->units[raw_unit[cell]].travel_m + 0.0001) {
                reason = REASON_TRAVEL;
            } else {
                reason = REASON_AREA;
            }
            if (reason_counts[reason] == 0) {
                reason_order[reason_seen] = (size_t) reason;
                reason_seen += 1;
            }
            reason_counts[reason] += 1;
            if (raw_unit[cell] >= 0) {
                const char *owner = result->units[raw_unit[cell]].id;
                int known = 0;
                for (size_t existing = 0; existing < slot.zone.nearest_count; existing += 1) {
                    if (strcmp(slot.zone.nearest_ids[existing], owner) == 0) {
                        known = 1;
                        break;
                    }
                }
                if (!known && slot.zone.nearest_count < 8) {
                    set_text(slot.zone.nearest_ids[slot.zone.nearest_count],
                             sizeof(slot.zone.nearest_ids[0]), owner);
                    slot.zone.nearest_count += 1;
                }
            }
            if (raw_dist[cell] > worst_distance) {
                worst_distance = raw_dist[cell];
                worst_x = x;
                worst_y = y;
                has_worst = 1;
            }
        }
        /* Motivo dominante; a igualdad de cuentas, el primero que apareció. */
        int dominant = REASON_COUNT;
        size_t best_count = 0;
        for (size_t position = 0; position < reason_seen; position += 1) {
            const int reason = (int) reason_order[position];
            if (reason_counts[reason] > best_count) {
                best_count = reason_counts[reason];
                dominant = reason;
            }
        }
        if (dominant == REASON_COUNT) {
            dominant = REASON_AREA;
        }
        slot.zone.reason = kReasonNames[dominant];
        slot.zone.cells = cell_count;
        slot.zone.area_m2 = round_to((double) cell_count * cell_area, 10.0);
        slot.zone.cx = round_to(sum_x / (double) cell_count, 10.0);
        slot.zone.cy = round_to(sum_y / (double) cell_count, 10.0);
        slot.zone.has_worst = has_worst;
        slot.zone.worst_x = round_to(worst_x, 10.0);
        slot.zone.worst_y = round_to(worst_y, 10.0);
        slot.zone.has_worst_distance = isfinite(worst_distance);
        slot.zone.worst_distance_m = isfinite(worst_distance) ? round_to(worst_distance, 100.0) : 0.0;
        if (slot_count == slot_capacity) {
            const size_t capacity = slot_capacity * 2;
            ext_zone_slot *grown = (ext_zone_slot *) realloc(slots, capacity * sizeof(ext_zone_slot));
            if (grown == NULL) {
                break;
            }
            slots = grown;
            slot_capacity = capacity;
        }
        slots[slot_count] = slot;
        slot_count += 1;
    }
    qsort(slots, slot_count, sizeof(ext_zone_slot), compare_zone);
    const size_t zone_kept = slot_count < NORMA_EXT_MAX_ZONES ? slot_count : NORMA_EXT_MAX_ZONES;
    for (size_t index = 0; index < zone_kept; index += 1) {
        result->zones[index] = slots[index].zone;
    }
    result->zone_count = zone_kept;
    free(uncovered);
    free(visited);
    free(stack);
    free(zone_cells);
    free(slots);

summary:
    {
        int classes = 0;
        for (size_t unit = 0; unit < unit_count; unit += 1) {
            classes |= result->units[unit].classes;
        }
        result->summary.count = unit_count;
        result->summary.covered_area_m2 = round_to(covered_area, 10.0);
        result->summary.uncovered_area_m2 = round_to(uncovered_area, 10.0);
        result->summary.covered_pct = floor_area > 0.0
                                          ? round_to(covered_area / floor_area * 100.0, 10.0)
                                          : 0.0;
        result->summary.required_by_area = required_by_area(norms, floor_area);
        result->summary.classes = classes;
        const int abc = NORMA_FIRE_A | NORMA_FIRE_B | NORMA_FIRE_C;
        result->summary.missing_classes = abc & ~classes;
        result->summary.signs = sign_count;
        result->summary.units_with_gap = units_with_gap;
    }
    free(best_unit);
    free(raw_unit);
    free(area_reason);
    free(best_dist);
    free(raw_dist);
    free(dist);
    free(over_area);
}

/* ------------------------------- hallazgos -------------------------------- */

/** Minúsculas solo para ASCII: en UTF-8 un byte de continuación no cambia. */
static void lower_ascii(const char *source, char *target, size_t size)
{
    size_t written = 0;
    for (const char *cursor = source; *cursor != '\0' && written + 1 < size; cursor += 1) {
        const char value = *cursor;
        target[written] = (value >= 'A' && value <= 'Z') ? (char) (value - 'A' + 'a') : value;
        written += 1;
    }
    target[written] = '\0';
}

/** Número del auditor: un decimal, coma decimal y punto de miles. */
static void ext_number(double value, char *out, size_t size)
{
    norma_format_fixed(value, 1, out, size);
}

/** Número entero del auditor, con punto de miles. */
static void ext_number0(double value, char *out, size_t size)
{
    norma_format_fixed(value, 0, out, size);
}

static void rounded_position(const norma_ext_unit *unit, norma_point *position)
{
    position->x = round(unit->cx);
    position->y = round(unit->cy);
}

/** Ids de las unidades indicadas, sin repetir. */
static size_t collect_ids(const norma_ext_result *result, const int *indices, size_t count,
                          const char *ids[], size_t capacity)
{
    size_t written = 0;
    for (size_t index = 0; index < count; index += 1) {
        const int unit = indices[index];
        if (unit < 0 || unit >= (int) result->unit_count) {
            continue;
        }
        int known = 0;
        for (size_t existing = 0; existing < written; existing += 1) {
            if (strcmp(ids[existing], result->units[unit].id) == 0) {
                known = 1;
                break;
            }
        }
        if (!known && written < capacity) {
            ids[written] = result->units[unit].id;
            written += 1;
        }
    }
    return written;
}

/** ¿El rótulo contiene esa letra de clase? (búsqueda literal, como la web). */
static int rating_has(const char *rating, char letter)
{
    for (const char *cursor = rating; *cursor != '\0'; cursor += 1) {
        if (same_letter(*cursor, letter)) {
            return 1;
        }
    }
    return 0;
}

/** Clasificación B retirada por la NFPA 10:2007 (4, 6, 8, 12 o 16-B). */
static int obsolete_rating(const char *rating)
{
    static const char *const sizes[] = {"4", "6", "8", "12", "16"};
    const size_t length = strlen(rating);
    for (size_t index = 0; index < length; index += 1) {
        /* Solo interesa el arranque del rótulo o lo que va después de ':'. */
        const int at_start = index == 0 || rating[index - 1] == ':';
        if (!at_start) {
            continue;
        }
        for (size_t size = 0; size < sizeof(sizes) / sizeof(sizes[0]); size += 1) {
            const size_t size_length = strlen(sizes[size]);
            if (strncmp(rating + index, sizes[size], size_length) != 0) {
                continue;
            }
            const char *next = rating + index + size_length;
            if (next[0] == '-' && same_letter(next[1], 'B')) {
                return 1;
            }
        }
    }
    return 0;
}

void norma_ext_findings(const norma_ext_result *result, const norma_ext_norms *norms,
                        norma_findings *findings)
{
    if (result == NULL || norms == NULL || findings == NULL) {
        return;
    }
    const norma_ext_summary *summary = &result->summary;
    const char *all_ids[NORMA_EXT_MAX_UNITS];
    int all_indices[NORMA_EXT_MAX_UNITS];
    for (size_t unit = 0; unit < result->unit_count; unit += 1) {
        all_indices[unit] = (int) unit;
    }
    const size_t all_count = collect_ids(result, all_indices, result->unit_count, all_ids,
                                         NORMA_EXT_MAX_UNITS);

    char text[640];
    char first[48];
    char second[48];
    char third[48];

    if (result->unit_count == 0) {
        norma_findings_add(findings, "ext_missing", "info", "Sin extintores en el plano",
                           "El plano no incluye extintores, así que no hay cobertura que verificar. "
                           "Coloca los equipos con la herramienta Extintor para que el cálculo de "
                           "recorrido y área sea posible.",
                           NULL, 0, NULL, NULL);
        return;
    }

    if ((long) result->unit_count < summary->required_by_area) {
        ext_number(summary->floor_area_m2, first, sizeof(first));
        snprintf(text, sizeof(text),
                 "La Resolución 2400 de 1979 (art. 221) pide no menos de un extintor por cada 200 m² "
                 "de local o fracción. Con %s m² de piso corresponden %ld y el plano tiene %lu.",
                 first, summary->required_by_area, (unsigned long) result->unit_count);
        char value[32];
        snprintf(value, sizeof(value), "%ld", summary->required_by_area);
        norma_findings_add(findings, "ext_ratio_short", "medium", "Cantidad mínima por superficie",
                           text, all_ids, all_count, NULL, value);
    }

    int travel_zones[NORMA_EXT_MAX_ZONES];
    size_t travel_count = 0;
    int area_zones[NORMA_EXT_MAX_ZONES];
    size_t area_count = 0;
    int unreachable_zones[NORMA_EXT_MAX_ZONES];
    size_t unreachable_count = 0;
    size_t no_class_count = 0;
    for (size_t zone = 0; zone < result->zone_count; zone += 1) {
        const char *reason = result->zones[zone].reason;
        if (strcmp(reason, "travel") == 0) {
            travel_zones[travel_count++] = (int) zone;
        } else if (strcmp(reason, "area") == 0) {
            area_zones[area_count++] = (int) zone;
        } else if (strcmp(reason, "unreachable") == 0) {
            unreachable_zones[unreachable_count++] = (int) zone;
        } else {
            no_class_count += 1;
        }
    }

    if (summary->covered_pct < 95.0 && result->zone_count > 0) {
        const norma_ext_zone *largest = &result->zones[0];
        if (travel_count > 0 || unreachable_count > 0) {
            double travel_area = 0.0;
            int merged[NORMA_EXT_MAX_ZONES * 2];
            size_t merged_count = 0;
            for (size_t index = 0; index < travel_count; index += 1) {
                travel_area += result->zones[travel_zones[index]].area_m2;
                merged[merged_count++] = travel_zones[index];
            }
            for (size_t index = 0; index < unreachable_count; index += 1) {
                travel_area += result->zones[unreachable_zones[index]].area_m2;
                merged[merged_count++] = unreachable_zones[index];
            }
            const char *worst_ids[NORMA_FINDING_ELEMENTS];
            size_t worst_count = 0;
            for (size_t index = 0; index < merged_count; index += 1) {
                const norma_ext_zone *zone = &result->zones[merged[index]];
                for (size_t owner = 0; owner < zone->nearest_count; owner += 1) {
                    int known = 0;
                    for (size_t existing = 0; existing < worst_count; existing += 1) {
                        if (strcmp(worst_ids[existing], zone->nearest_ids[owner]) == 0) {
                            known = 1;
                            break;
                        }
                    }
                    if (!known && worst_count < NORMA_FINDING_ELEMENTS) {
                        worst_ids[worst_count] = zone->nearest_ids[owner];
                        worst_count += 1;
                    }
                }
            }
            ext_number(travel_area, first, sizeof(first));
            ext_number(largest->area_m2, second, sizeof(second));
            if (largest->has_worst_distance) {
                ext_number(largest->worst_distance_m, third, sizeof(third));
            } else {
                snprintf(third, sizeof(third), "—");
            }
            snprintf(text, sizeof(text),
                     "Hay %s m² a los que el extintor más cercano no llega dentro de su distancia "
                     "máxima. La zona más amplia mide %s m² y su punto más desfavorable queda a %s m "
                     "del equipo más próximo. Revisa la ubicación o instala otra unidad.",
                     first, second, third);
            char value[64];
            snprintf(value, sizeof(value), "%s m²", first);
            norma_point position;
            position.x = largest->worst_x;
            position.y = largest->worst_y;
            norma_findings_add(findings, "ext_travel_too_long",
                               summary->covered_pct < 80.0 ? "high" : "medium",
                               "Superficie fuera del recorrido de los extintores", text, worst_ids,
                               worst_count, largest->has_worst ? &position : NULL, value);
        }
        if (area_count > 0) {
            double area = 0.0;
            const char *area_ids[NORMA_FINDING_ELEMENTS];
            size_t area_ids_count = 0;
            for (size_t index = 0; index < area_count; index += 1) {
                const norma_ext_zone *zone = &result->zones[area_zones[index]];
                area += zone->area_m2;
                for (size_t owner = 0; owner < zone->nearest_count; owner += 1) {
                    int known = 0;
                    for (size_t existing = 0; existing < area_ids_count; existing += 1) {
                        if (strcmp(area_ids[existing], zone->nearest_ids[owner]) == 0) {
                            known = 1;
                            break;
                        }
                    }
                    if (!known && area_ids_count < NORMA_FINDING_ELEMENTS) {
                        area_ids[area_ids_count] = zone->nearest_ids[owner];
                        area_ids_count += 1;
                    }
                }
            }
            ext_number(area, first, sizeof(first));
            snprintf(text, sizeof(text),
                     "La cobertura por recorrido alcanza más superficie de la que admite la "
                     "clasificación de los equipos: quedan %s m² sin asignar. Sube la clasificación "
                     "(más unidades A) o añade otro extintor en la zona descubierta.",
                     first);
            char value[64];
            snprintf(value, sizeof(value), "%s m²", first);
            const norma_ext_zone *zone = &result->zones[area_zones[0]];
            norma_point position;
            position.x = zone->worst_x;
            position.y = zone->worst_y;
            norma_findings_add(findings, "ext_coverage_gap",
                               summary->covered_pct < 80.0 ? "high" : "medium",
                               "Área por encima de la capacidad del extintor", text, area_ids,
                               area_ids_count, zone->has_worst ? &position : NULL, value);
        }
        if (no_class_count > 0 && travel_count == 0 && area_count == 0) {
            norma_findings_add(findings, "ext_class_gap", "medium",
                               "Extintor sin clase de fuego aplicable",
                               "El equipo más cercano no declara una clasificación que permita "
                               "asignarle superficie. Revisa el agente y la clasificación del "
                               "extintor antes de dar por cubierta la zona.",
                               all_ids, all_count, NULL, NULL);
        }
    }

    if ((summary->missing_classes & NORMA_FIRE_A) != 0 && summary->floor_area_m2 >= 20.0) {
        norma_findings_add(findings, "ext_no_class_a", "medium",
                           "Ningún extintor con clasificación Clase A",
                           "La superficie del piso no tiene un equipo con clasificación 2-A o "
                           "superior. Los fuegos de materiales sólidos comunes (papel, madera, "
                           "textiles) requieren Clase A: un extintor solo BC o CO₂ no cubre ese "
                           "riesgo.",
                           all_ids, all_count, NULL, NULL);
    }

    for (size_t unit = 0; unit < result->unit_count; unit += 1) {
        const norma_ext_unit *report = &result->units[unit];
        const char *ids[1] = {report->id};
        norma_point position;
        rounded_position(report, &position);

        if ((report->classes & NORMA_FIRE_A) != 0 && report->rating_a <= 0) {
            char agent[64];
            lower_ascii(report->agent_label, agent, sizeof(agent));
            snprintf(text, sizeof(text),
                     "El extintor %s declara %s, pero el agente %s no cubre las clases que ese "
                     "rótulo implica. Corrige el rótulo o cambia el agente.",
                     report->id, report->rating[0] != '\0' ? report->rating : "sin clasificación",
                     agent);
            norma_findings_add(findings, "ext_wrong_class", "medium",
                               "Clasificación incoherente con el agente", text, ids, 1, &position,
                               NULL);
        }
        int unsupported = 0;
        static const char letters[3] = {'A', 'B', 'C'};
        for (size_t letter = 0; letter < sizeof(letters); letter += 1) {
            const int bit = letters[letter] == 'A' ? NORMA_FIRE_A
                                                   : (letters[letter] == 'B' ? NORMA_FIRE_B
                                                                             : NORMA_FIRE_C);
            if (rating_has(report->rating, letters[letter]) && (report->classes & bit) == 0) {
                unsupported |= bit;
            }
        }
        if (unsupported != 0) {
            char classes[16];
            size_t written = 0;
            for (size_t letter = 0; letter < sizeof(letters); letter += 1) {
                const int bit = letters[letter] == 'A' ? NORMA_FIRE_A
                                                       : (letters[letter] == 'B' ? NORMA_FIRE_B
                                                                                 : NORMA_FIRE_C);
                if ((unsupported & bit) == 0) {
                    continue;
                }
                if (written > 0 && written + 1 < sizeof(classes)) {
                    classes[written] = '/';
                    written += 1;
                }
                if (written + 1 < sizeof(classes)) {
                    classes[written] = letters[letter];
                    written += 1;
                }
            }
            classes[written] = '\0';
            char agent[64];
            lower_ascii(report->agent_label, agent, sizeof(agent));
            snprintf(text, sizeof(text),
                     "El extintor %s declara la clase %s en su rótulo, pero el agente %s no la "
                     "cubre. Ajusta el rótulo a la placa real o cambia el agente.",
                     report->id, classes, agent);
            norma_findings_add(findings, "ext_wrong_class", "medium",
                               "Clasificación incoherente con el agente", text, ids, 1, &position,
                               NULL);
        }

        if (!report->sign_covered) {
            if (!report->has_sign_distance) {
                snprintf(text, sizeof(text),
                         "El extintor %s no tiene una señal F001 en el plano. La Resolución 2400 "
                         "(art. 224) pide señalizarlo en rojo para que se encuentre rápido.",
                         report->id);
            } else {
                const norma_json *signage = norma_json_get(profile_object(norms), "signage");
                ext_number(report->sign_distance_m, first, sizeof(first));
                ext_number(number_at(signage, "radiusCm", 150.0), second, sizeof(second));
                snprintf(text, sizeof(text),
                         "La señal de extintor más próxima a %s está a %s m y el criterio de "
                         "referencia pide tenerla a %s m o menos.",
                         report->id, first, second);
            }
            norma_findings_add(findings, "ext_without_sign", "low", "Extintor sin señal cercana",
                               text, ids, 1, &position, NULL);
        }

        if (!report->wheeled && report->mount_cm > 0.0
            && report->mount_cm > report->mount_max_cm + 0.5) {
            ext_number0(report->mount_cm, first, sizeof(first));
            ext_number0(report->mount_max_cm, second, sizeof(second));
            snprintf(text, sizeof(text),
                     "La parte superior del extintor %s está a %s cm y para su peso el criterio de "
                     "referencia pide %s cm como máximo. Bajarlo mantiene el acceso libre.",
                     report->id, first, second);
            char value[64];
            snprintf(value, sizeof(value), "%s cm", first);
            norma_findings_add(findings, "ext_height", "low", "Altura de montaje fuera de rango",
                               text, ids, 1, &position, value);
        }

        if (obsolete_rating(report->rating)) {
            snprintf(text, sizeof(text),
                     "La clasificación %s del extintor %s corresponde a tamaños que la NFPA "
                     "10:2007 (4.4) ya no reconoce. Verifica que el equipo esté vigente y rotulado "
                     "con una clasificación actual.",
                     report->rating, report->id);
            norma_findings_add(findings, "ext_obsolete_rating", "info",
                               "Clasificación B retirada de la norma", text, ids, 1, &position,
                               report->rating);
        }
    }
}
