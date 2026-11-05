/*
 * Normia nativo · documento del plano.
 *
 * El modelo que editará la ventana nativa. Las reglas vienen del editor web y
 * no se negocian aquí: geometría en centímetros, unidad solo para leer cifras,
 * deshacer por edición y guardado en el sobre oficial.
 */
#include "normia/document.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/json.h"
#include "normia/jsonw.h"

#define NORMA_DEFAULT_LAYER "capa_planta"

/* ------------------------------- utilidades -------------------------------- */

static void snapshot_free(norma_snapshot *snapshot)
{
    free(snapshot->items);
    snapshot->items = NULL;
    snapshot->count = 0;
}

static norma_snapshot snapshot_take(const norma_document *document)
{
    norma_snapshot snapshot;
    snapshot.count = document->count;
    snapshot.items = NULL;
    if (document->count > 0) {
        snapshot.items = (norma_element *) calloc(document->count, sizeof(norma_element));
        if (snapshot.items != NULL) {
            memcpy(snapshot.items, document->elements, document->count * sizeof(norma_element));
        } else {
            snapshot.count = 0;
        }
    }
    return snapshot;
}

static void snapshot_restore(norma_document *document, const norma_snapshot *snapshot)
{
    free(document->elements);
    document->elements = NULL;
    document->count = 0;
    document->capacity = 0;
    if (snapshot->count > 0 && snapshot->items != NULL) {
        document->elements = (norma_element *) calloc(snapshot->count, sizeof(norma_element));
        if (document->elements != NULL) {
            memcpy(document->elements, snapshot->items, snapshot->count * sizeof(norma_element));
            document->count = snapshot->count;
            document->capacity = snapshot->count;
        }
    }
}

static void history_clear(norma_document *document)
{
    for (size_t index = 0; index < document->undo_count; index += 1) {
        snapshot_free(&document->undo[index]);
    }
    for (size_t index = 0; index < document->redo_count; index += 1) {
        snapshot_free(&document->redo[index]);
    }
    document->undo_count = 0;
    document->redo_count = 0;
}

static int reserve_element(norma_document *document)
{
    if (document->count < document->capacity) {
        return 1;
    }
    const size_t capacity = document->capacity == 0 ? 16 : document->capacity * 2;
    norma_element *items = (norma_element *) realloc(document->elements, capacity * sizeof(norma_element));
    if (items == NULL) {
        return 0;
    }
    document->elements = items;
    document->capacity = capacity;
    return 1;
}

static void set_text(char *target, size_t size, const char *value, const char *fallback)
{
    const char *text = value != NULL && value[0] != '\0' ? value : fallback;
    snprintf(target, size, "%s", text != NULL ? text : "");
}

/** Longitud de un elemento en centímetros, con arcos. */
static double element_length_cm(const norma_element *element)
{
    if (element->node_count < 2) {
        return 0.0;
    }
    return norma_polyline_length(element->nodes, element->node_count, element->arcs);
}

/* --------------------------------- público --------------------------------- */

void norma_document_init_with(norma_document *document, double width, double height, norma_unit unit, const char *scale)
{
    if (document == NULL) {
        return;
    }
    memset(document, 0, sizeof(*document));
    document->width = width > 0.0 ? width : 1123.0;
    document->height = height > 0.0 ? height : 794.0;
    document->unit = unit;
    set_text(document->scale, sizeof(document->scale), scale, "1:100");
    set_text(document->layer, sizeof(document->layer), NORMA_DEFAULT_LAYER, NORMA_DEFAULT_LAYER);
    document->identifier = 0;
    document->dirty = 0;
}

void norma_document_init(norma_document *document)
{
    norma_document_init_with(document, 1123.0, 794.0, NORMA_UNIT_CM, "1:100");
}

void norma_document_free(norma_document *document)
{
    if (document == NULL) {
        return;
    }
    free(document->elements);
    document->elements = NULL;
    document->count = 0;
    document->capacity = 0;
    history_clear(document);
}

void norma_document_clear(norma_document *document)
{
    if (document == NULL) {
        return;
    }
    free(document->elements);
    document->elements = NULL;
    document->count = 0;
    document->capacity = 0;
    history_clear(document);
    document->dirty = 0;
}

void norma_document_begin_edit(norma_document *document)
{
    if (document == NULL) {
        return;
    }
    /* Lo que se deshace es siempre una edición terminada: al editar de nuevo,
       la pila de rehacer deja de tener sentido y se descarta. */
    for (size_t index = 0; index < document->redo_count; index += 1) {
        snapshot_free(&document->redo[index]);
    }
    document->redo_count = 0;

    if (document->undo_count == NORMA_MAX_UNDO) {
        snapshot_free(&document->undo[0]);
        memmove(&document->undo[0], &document->undo[1], (NORMA_MAX_UNDO - 1) * sizeof(norma_snapshot));
        document->undo_count -= 1;
    }
    document->undo[document->undo_count] = snapshot_take(document);
    document->undo_count += 1;
    document->dirty = 1;
}

long norma_document_add_wall(norma_document *document, const norma_point *nodes, size_t count,
                             const norma_arc *through, const char *layer)
{
    if (document == NULL || nodes == NULL || count < 2 || count > NORMA_MAX_NODES) {
        return -1;
    }
    if (!reserve_element(document)) {
        return -1;
    }
    norma_element element;
    memset(&element, 0, sizeof(element));
    document->identifier += 1;
    snprintf(element.id, sizeof(element.id), "muro_%d", document->identifier);
    set_text(element.type, sizeof(element.type), "wall", "wall");
    set_text(element.layer, sizeof(element.layer), layer, document->layer);
    memcpy(element.nodes, nodes, count * sizeof(norma_point));
    element.node_count = count;
    if (through != NULL) {
        for (size_t index = 0; index + 1 < count; index += 1) {
            element.arcs[index] = through[index];
        }
    }
    document->elements[document->count] = element;
    document->count += 1;
    document->dirty = 1;
    return (long) (document->count - 1);
}

long norma_document_add_route(norma_document *document, const norma_point *nodes, size_t count,
                              const norma_arc *through, const char *layer)
{
    const long index = norma_document_add_wall(document, nodes, count, through, layer);
    if (index < 0) {
        return -1;
    }
    norma_element *element = &document->elements[index];
    snprintf(element->id, sizeof(element->id), "ruta_%d", document->identifier);
    set_text(element->type, sizeof(element->type), "route", "route");
    element->stroke = 3.0;
    return index;
}

long norma_document_add_dimension(norma_document *document, norma_point a, norma_point b, const char *layer)
{
    if (document == NULL) {
        return -1;
    }
    const norma_point nodes[2] = {a, b};
    const long index = norma_document_add_wall(document, nodes, 2, NULL, layer);
    if (index < 0) {
        return -1;
    }
    norma_element *element = &document->elements[index];
    snprintf(element->id, sizeof(element->id), "cota_%d", document->identifier);
    set_text(element->type, sizeof(element->type), "dimension", "dimension");
    return index;
}

long norma_document_add_marker(norma_document *document, const char *type, double x, double y, const char *layer)
{
    if (document == NULL || type == NULL || type[0] == '\0') {
        return -1;
    }
    if (!reserve_element(document)) {
        return -1;
    }
    norma_element element;
    memset(&element, 0, sizeof(element));
    document->identifier += 1;
    snprintf(element.id, sizeof(element.id), "objeto_%d", document->identifier);
    set_text(element.type, sizeof(element.type), type, "sign");
    set_text(element.layer, sizeof(element.layer), layer, document->layer);
    element.x = x;
    element.y = y;
    element.node_count = 0;
    document->elements[document->count] = element;
    document->count += 1;
    document->dirty = 1;
    return (long) (document->count - 1);
}

int norma_document_move_node(norma_document *document, size_t element, size_t node, double x, double y)
{
    if (document == NULL || element >= document->count) {
        return 0;
    }
    norma_element *item = &document->elements[element];
    if (node >= item->node_count) {
        return 0;
    }
    item->nodes[node].x = x;
    item->nodes[node].y = y;
    /* Mover un nodo cambia los arcos que lo tocan: se recalculan del punto de
       paso que quedó guardado, de modo que la curva sigue pasando por él. */
    for (size_t index = 0; index + 1 < item->node_count; index += 1) {
        norma_arc *arc = &item->arcs[index];
        if (!arc->valid) {
            continue;
        }
        const norma_arc fresh = norma_arc_from_points(
            item->nodes[index],
            (norma_point) {arc->cx + arc->r * cos(arc->start + (double) arc->direction * arc->sweep * 0.5),
                           arc->cy + arc->r * sin(arc->start + (double) arc->direction * arc->sweep * 0.5)},
            item->nodes[index + 1]);
        item->arcs[index] = fresh;
    }
    document->dirty = 1;
    return 1;
}

int norma_document_remove(norma_document *document, size_t element)
{
    if (document == NULL || element >= document->count) {
        return 0;
    }
    for (size_t index = element; index + 1 < document->count; index += 1) {
        document->elements[index] = document->elements[index + 1];
    }
    document->count -= 1;
    document->dirty = 1;
    return 1;
}

int norma_document_undo(norma_document *document)
{
    if (document == NULL || document->undo_count == 0) {
        return 0;
    }
    const norma_snapshot previous = document->undo[document->undo_count - 1];
    document->undo_count -= 1;
    if (document->redo_count == NORMA_MAX_UNDO) {
        snapshot_free(&document->redo[0]);
        memmove(&document->redo[0], &document->redo[1], (NORMA_MAX_UNDO - 1) * sizeof(norma_snapshot));
        document->redo_count -= 1;
    }
    document->redo[document->redo_count] = snapshot_take(document);
    document->redo_count += 1;
    snapshot_restore(document, &previous);
    snapshot_free((norma_snapshot *) &previous);
    document->dirty = 1;
    return 1;
}

int norma_document_redo(norma_document *document)
{
    if (document == NULL || document->redo_count == 0) {
        return 0;
    }
    const norma_snapshot next = document->redo[document->redo_count - 1];
    document->redo_count -= 1;
    if (document->undo_count == NORMA_MAX_UNDO) {
        snapshot_free(&document->undo[0]);
        memmove(&document->undo[0], &document->undo[1], (NORMA_MAX_UNDO - 1) * sizeof(norma_snapshot));
        document->undo_count -= 1;
    }
    document->undo[document->undo_count] = snapshot_take(document);
    document->undo_count += 1;
    snapshot_restore(document, &next);
    snapshot_free((norma_snapshot *) &next);
    document->dirty = 1;
    return 1;
}

long norma_document_hit_test(const norma_document *document, norma_point point, double tolerance)
{
    if (document == NULL || tolerance < 0.0) {
        return -1;
    }
    long best = -1;
    double best_distance = tolerance;
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *item = &document->elements[index];
        double distance;
        if (item->node_count < 2) {
            distance = hypot(point.x - item->x, point.y - item->y);
        } else {
            distance = tolerance + 1.0; /* el peor caso: solo cuenta si hay tramos */
            for (size_t node = 0; node + 1 < item->node_count; node += 1) {
                const norma_point a = item->nodes[node];
                const norma_point b = item->nodes[node + 1];
                const double candidate = norma_point_segment_distance(point, a, b);
                if (candidate < distance) {
                    distance = candidate;
                }
            }
        }
        if (distance <= best_distance) {
            best_distance = distance;
            best = (long) index;
        }
    }
    return best;
}

double norma_document_length_cm(const norma_document *document)
{
    if (document == NULL) {
        return 0.0;
    }
    double total = 0.0;
    for (size_t index = 0; index < document->count; index += 1) {
        total += element_length_cm(&document->elements[index]);
    }
    return total;
}

double norma_document_length_m(const norma_document *document)
{
    return norma_to_meters(norma_document_length_cm(document), NORMA_UNIT_CM);
}

/* ------------------------------- guardar ---------------------------------- */

static void write_nodes(norma_buffer *buffer, const norma_element *element)
{
    norma_buffer_raw(buffer, "[");
    for (size_t node = 0; node < element->node_count; node += 1) {
        if (node > 0) {
            norma_buffer_raw(buffer, ",");
        }
        norma_buffer_raw(buffer, "{\"x\":");
        norma_buffer_number(buffer, element->nodes[node].x);
        norma_buffer_raw(buffer, ",\"y\":");
        norma_buffer_number(buffer, element->nodes[node].y);
        norma_buffer_raw(buffer, "}");
    }
    norma_buffer_raw(buffer, "]");
}

static int has_arcs(const norma_element *element)
{
    for (size_t index = 0; index + 1 < element->node_count; index += 1) {
        if (element->arcs[index].valid) {
            return 1;
        }
    }
    return 0;
}

static void write_box(norma_buffer *buffer, const norma_element *element)
{
    if (element->x != 0.0) {
        norma_buffer_raw(buffer, ",\"x\":");
        norma_buffer_number(buffer, element->x);
    }
    if (element->y != 0.0) {
        norma_buffer_raw(buffer, ",\"y\":");
        norma_buffer_number(buffer, element->y);
    }
    if (element->w != 0.0) {
        norma_buffer_raw(buffer, ",\"w\":");
        norma_buffer_number(buffer, element->w);
    }
    if (element->h != 0.0) {
        norma_buffer_raw(buffer, ",\"h\":");
        norma_buffer_number(buffer, element->h);
    }
    if (element->rotation != 0.0) {
        norma_buffer_raw(buffer, ",\"rotation\":");
        norma_buffer_number(buffer, element->rotation);
    }
    if (element->stroke != 2.0) {
        norma_buffer_raw(buffer, ",\"stroke\":");
        norma_buffer_number(buffer, element->stroke);
    }
    if (element->width_m != 2.0) {
        norma_buffer_raw(buffer, ",\"widthM\":");
        norma_buffer_number(buffer, element->width_m);
    }
    if (element->measured_m > 0.0) {
        norma_buffer_raw(buffer, ",\"measuredM\":");
        norma_buffer_number(buffer, element->measured_m);
    }
    if (element->is_exit) {
        norma_buffer_raw(buffer, ",\"isExit\":true");
    }
    if (element->label[0] != '\0') {
        norma_buffer_raw(buffer, ",\"label\":");
        norma_buffer_string(buffer, element->label);
    }
    if (element->ext_agent[0] != '\0') {
        norma_buffer_raw(buffer, ",\"extAgent\":");
        norma_buffer_string(buffer, element->ext_agent);
    }
    if (element->ext_rating[0] != '\0') {
        norma_buffer_raw(buffer, ",\"extRating\":");
        norma_buffer_string(buffer, element->ext_rating);
    }
    if (element->ext_hazard[0] != '\0') {
        norma_buffer_raw(buffer, ",\"extHazard\":");
        norma_buffer_string(buffer, element->ext_hazard);
    }
    if (element->ext_capacity_lb > 0.0) {
        norma_buffer_raw(buffer, ",\"extCapacityLb\":");
        norma_buffer_number(buffer, element->ext_capacity_lb);
    }
    if (element->has_ext_mount) {
        norma_buffer_raw(buffer, ",\"extMountCm\":");
        norma_buffer_number(buffer, element->ext_mount_cm);
    }
}

static void write_element(norma_buffer *buffer, const norma_element *element)
{
    norma_buffer_raw(buffer, "{\"id\":");
    norma_buffer_string(buffer, element->id);
    norma_buffer_raw(buffer, ",\"type\":");
    norma_buffer_string(buffer, element->type);
    norma_buffer_raw(buffer, ",\"layerId\":");
    norma_buffer_string(buffer, element->layer);
    if (element->node_count >= 2) {
        norma_buffer_raw(buffer, ",\"points\":");
        write_nodes(buffer, element);
        if (has_arcs(element)) {
            norma_buffer_raw(buffer, ",\"curves\":[");
            for (size_t index = 0; index + 1 < element->node_count; index += 1) {
                if (index > 0) {
                    norma_buffer_raw(buffer, ",");
                }
                const norma_arc *arc = &element->arcs[index];
                if (!arc->valid) {
                    norma_buffer_raw(buffer, "null");
                    continue;
                }
                /* El punto de paso se reconstruye del arco: es el que la web
                   espera en `curves[i].through`. */
                const norma_point through = norma_arc_point_at(arc, 0.5);
                norma_buffer_raw(buffer, "{\"kind\":\"arc\",\"through\":{\"x\":");
                norma_buffer_number(buffer, through.x);
                norma_buffer_raw(buffer, ",\"y\":");
                norma_buffer_number(buffer, through.y);
                norma_buffer_raw(buffer, "}}");
            }
            norma_buffer_raw(buffer, "]");
        }
    } else {
        norma_buffer_raw(buffer, ",\"x\":");
        norma_buffer_number(buffer, element->x);
        norma_buffer_raw(buffer, ",\"y\":");
        norma_buffer_number(buffer, element->y);
    }
    write_box(buffer, element);
    norma_buffer_raw(buffer, "}");
}

char *norma_document_to_json(const norma_document *document, const char *name)
{
    if (document == NULL) {
        return NULL;
    }
    const char *plan_name = name != NULL && name[0] != '\0' ? name : "Plano sin título";
    norma_buffer buffer;
    norma_buffer_init(&buffer);
    if (buffer.failed) {
        return NULL;
    }
    norma_buffer_raw(&buffer, "{\"application\":\"normia-planos-cad\",\"format\":\"normia-plan\",\"schema_version\":3,");
    norma_buffer_raw(&buffer, "\"project\":{\"name\":");
    norma_buffer_string(&buffer, plan_name);
    norma_buffer_raw(&buffer, ",\"site\":\"\",\"workplace\":\"\",\"responsible\":\"\",\"notes\":\"\"},");
    norma_buffer_raw(&buffer, "\"floor\":{\"name\":");
    norma_buffer_string(&buffer, plan_name);
    norma_buffer_raw(&buffer, ",\"level\":\"\"},\"design\":{\"format\":5,\"canvas\":{\"width\":");
    norma_buffer_number(&buffer, document->width);
    norma_buffer_raw(&buffer, ",\"height\":");
    norma_buffer_number(&buffer, document->height);
    norma_buffer_raw(&buffer, ",\"grid\":20,\"unit\":");
    norma_buffer_string(&buffer, norma_unit_name(document->unit));
    if (document->occupancy > 0) {
        norma_buffer_raw(&buffer, ",\"occupancy\":");
        norma_buffer_number(&buffer, (double) document->occupancy);
    }
    if (document->scenario_count > 0) {
        norma_buffer_raw(&buffer, ",\"scenarios\":[");
        for (size_t index = 0; index < document->scenario_count; index += 1) {
            if (index > 0) {
                norma_buffer_raw(&buffer, ",");
            }
            norma_buffer_raw(&buffer, "{\"name\":");
            norma_buffer_string(&buffer, document->scenarios[index].name);
            norma_buffer_raw(&buffer, ",\"persons\":");
            norma_buffer_number(&buffer, (double) document->scenarios[index].persons);
            norma_buffer_raw(&buffer, "}");
        }
        norma_buffer_raw(&buffer, "]");
    }
    norma_buffer_raw(&buffer, ",\"scale\":");
    norma_buffer_string(&buffer, document->scale);
    norma_buffer_raw(&buffer, ",\"background\":\"#ffffff\"},\"layers\":[{\"id\":");
    norma_buffer_string(&buffer, document->layer);
    norma_buffer_raw(&buffer, ",\"name\":\"Planta\",\"visible\":true,\"locked\":false}],\"elements\":[");
    for (size_t index = 0; index < document->count; index += 1) {
        if (index > 0) {
            norma_buffer_raw(&buffer, ",");
        }
        write_element(&buffer, &document->elements[index]);
    }
    norma_buffer_raw(&buffer, "],\"groups\":[]},\"attribution\":");
    norma_buffer_string(&buffer, "Normia nativo 0.1.0. Pictogramas ISO 7010 (MIT).");
    norma_buffer_raw(&buffer, "}\n");
    if (buffer.failed) {
        norma_buffer_free(&buffer);
        return NULL;
    }
    return buffer.text; /* el llamador lo libera con free() */
}

/* -------------------------------- cargar ---------------------------------- */

static int load_points(const norma_json *element, norma_element *target)
{
    const norma_json *points = norma_json_get(element, "points");
    const size_t count = norma_json_size(points);
    if (count < 2 || count > NORMA_MAX_NODES) {
        return 0;
    }
    for (size_t index = 0; index < count; index += 1) {
        const norma_json *point = norma_json_at(points, index);
        target->nodes[index].x = norma_json_number(norma_json_get(point, "x"), 0.0);
        target->nodes[index].y = norma_json_number(norma_json_get(point, "y"), 0.0);
    }
    target->node_count = count;

    const norma_json *curves = norma_json_get(element, "curves");
    for (size_t index = 0; index + 1 < count; index += 1) {
        const norma_json *curve = norma_json_at(curves, index);
        if (curve == NULL || strcmp(norma_json_string_at(curve, "kind", ""), "arc") != 0) {
            continue;
        }
        const norma_json *through = norma_json_get(curve, "through");
        if (through == NULL) {
            continue;
        }
        const norma_point middle = {
            norma_json_number(norma_json_get(through, "x"), 0.0),
            norma_json_number(norma_json_get(through, "y"), 0.0),
        };
        target->arcs[index] = norma_arc_from_points(target->nodes[index], middle, target->nodes[index + 1]);
    }
    return 1;
}

int norma_document_from_json(norma_document *document, const char *text, size_t length, char *error, size_t error_size)
{
    if (document == NULL || text == NULL) {
        return 0;
    }
    char parse_error[128];
    norma_json *root = norma_json_parse(text, length, parse_error, sizeof(parse_error));
    if (root == NULL) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "El archivo no es JSON válido: %s", parse_error);
        }
        return 0;
    }
    const norma_json *design = norma_json_get(root, "design");
    if (design == NULL || design->type != NORMA_JSON_OBJECT) {
        design = norma_json_get(root, "canvas") != NULL ? root : NULL;
    }
    if (design == NULL) {
        norma_json_free(root);
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "El archivo no tiene un plano de Normia.");
        }
        return 0;
    }
    norma_document_clear(document);
    const norma_json *canvas = norma_json_get(design, "canvas");
    document->width = norma_json_number(norma_json_get(canvas, "width"), 1123.0);
    document->height = norma_json_number(norma_json_get(canvas, "height"), 794.0);
    document->unit = norma_unit_from_name(norma_json_string(norma_json_get(canvas, "unit")));
    const double occupancy = norma_json_number(norma_json_get(canvas, "occupancy"), 0.0);
    document->occupancy = occupancy > 0.0 ? (long) occupancy : 0;
    /* Escenarios de ocupación temporal: se guardan los que tienen personas. */
    const norma_json *scenarios = norma_json_get(canvas, "scenarios");
    const size_t scenario_total = norma_json_size(scenarios);
    for (size_t index = 0; index < scenario_total; index += 1) {
        const norma_json *entry = norma_json_at(scenarios, index);
        const double persons = norma_json_number(norma_json_get(entry, "persons"), 0.0);
        if (persons < 1.0 || document->scenario_count >= NORMA_MAX_SCENARIOS) {
            continue;
        }
        norma_scenario *scenario = &document->scenarios[document->scenario_count];
        memset(scenario, 0, sizeof(*scenario));
        set_text(scenario->name, sizeof(scenario->name),
                 norma_json_string(norma_json_get(entry, "name")), "");
        size_t start = 0;
        while (scenario->name[start] == ' ' || scenario->name[start] == '\t'
               || scenario->name[start] == '\n' || scenario->name[start] == '\r') {
            start += 1;
        }
        if (start > 0) {
            memmove(scenario->name, scenario->name + start, strlen(scenario->name + start) + 1);
        }
        size_t name_length = strlen(scenario->name);
        while (name_length > 0
               && (scenario->name[name_length - 1] == ' ' || scenario->name[name_length - 1] == '\t'
                   || scenario->name[name_length - 1] == '\n'
                   || scenario->name[name_length - 1] == '\r')) {
            scenario->name[name_length - 1] = '\0';
            name_length -= 1;
        }
        scenario->persons = (long) persons;
        document->scenario_count += 1;
    }
    set_text(document->scale, sizeof(document->scale), norma_json_string(norma_json_get(canvas, "scale")), "1:100");

    const norma_json *extinguishers = norma_json_get(design, "extinguishers");
    set_text(document->ext_profile, sizeof(document->ext_profile),
             norma_json_string(norma_json_get(extinguishers, "profile")), "");
    set_text(document->ext_hazard, sizeof(document->ext_hazard),
             norma_json_string(norma_json_get(extinguishers, "hazard")), "");

    const norma_json *layers = norma_json_get(design, "layers");
    const norma_json *first_layer = norma_json_at(layers, 0);
    set_text(document->layer, sizeof(document->layer), norma_json_string(norma_json_get(first_layer, "id")), NORMA_DEFAULT_LAYER);

    const norma_json *elements = norma_json_get(design, "elements");
    const size_t total = norma_json_size(elements);
    const char *name = norma_json_string_at(norma_json_get(root, "project"), "name", "");
    (void) name;
    for (size_t index = 0; index < total; index += 1) {
        const norma_json *source = norma_json_at(elements, index);
        if (source == NULL || source->type != NORMA_JSON_OBJECT) {
            continue;
        }
        if (!reserve_element(document)) {
            break;
        }
        norma_element element;
        memset(&element, 0, sizeof(element));
        set_text(element.id, sizeof(element.id), norma_json_string(norma_json_get(source, "id")), "objeto");
        set_text(element.type, sizeof(element.type), norma_json_string(norma_json_get(source, "type")), "sign");
        set_text(element.layer, sizeof(element.layer), norma_json_string(norma_json_get(source, "layerId")), document->layer);
        set_text(element.label, sizeof(element.label), norma_json_string(norma_json_get(source, "label")), "");
        if (!load_points(source, &element)) {
            element.node_count = 0;
        }
        element.x = norma_json_number(norma_json_get(source, "x"), 0.0);
        element.y = norma_json_number(norma_json_get(source, "y"), 0.0);
        element.w = norma_json_number(norma_json_get(source, "w"), 0.0);
        element.h = norma_json_number(norma_json_get(source, "h"), 0.0);
        element.rotation = norma_json_number(norma_json_get(source, "rotation"), 0.0);
        element.stroke = norma_json_number(norma_json_get(source, "stroke"), 2.0);
        element.width_m = norma_json_number(norma_json_get(source, "widthM"), 2.0);
        element.measured_m = norma_json_number(norma_json_get(source, "measuredM"), 0.0);
        element.is_exit = norma_json_bool_at(source, "isExit", 0);
        set_text(element.ext_agent, sizeof(element.ext_agent),
                 norma_json_string(norma_json_get(source, "extAgent")), "");
        set_text(element.ext_rating, sizeof(element.ext_rating),
                 norma_json_string(norma_json_get(source, "extRating")), "");
        set_text(element.ext_hazard, sizeof(element.ext_hazard),
                 norma_json_string(norma_json_get(source, "extHazard")), "");
        element.ext_capacity_lb = norma_json_number(norma_json_get(source, "extCapacityLb"), 0.0);
        element.ext_mount_cm = norma_json_number(norma_json_get(source, "extMountCm"), 0.0);
        element.has_ext_mount = norma_json_get(source, "extMountCm") != NULL;
        document->elements[document->count] = element;
        document->count += 1;
        document->identifier += 1;
    }
    document->dirty = 0;
    norma_json_free(root);
    return 1;
}
