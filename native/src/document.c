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
#include "normia/object.h"

#define NORMA_DEFAULT_LAYER "capa_planta"

/* Se define más abajo; `norma_document_move_object` la usa antes. */
static norma_element *editable(norma_document *document, size_t element);

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
    /* Reacción del simulacro: 30 s por omisión, como en Ajustes del piso. */
    document->drill_reaction_s = 30;
}

void norma_document_init(norma_document *document)
{
    norma_document_init_with(document, 1123.0, 794.0, NORMA_UNIT_CM, "1:100");
}

/** Suelta la imagen de la guía (el resto de sus datos es plano, sin punteros). */
static void guide_free(norma_guide *guide)
{
    if (guide == NULL) {
        return;
    }
    free(guide->data);
    guide->data = NULL;
    guide->data_size = 0;
    guide->present = 0;
    guide->name[0] = '\0';
}

void norma_document_free(norma_document *document)
{
    if (document == NULL) {
        return;
    }
    guide_free(&document->guide);
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
    guide_free(&document->guide);
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

long norma_document_add_object(norma_document *document, const char *type, norma_point point,
                               const char *layer)
{
    const norma_object_spec *spec = norma_object_find(type);
    if (document == NULL || spec == NULL || !reserve_element(document)) {
        return -1;
    }
    norma_element element;
    memset(&element, 0, sizeof(element));
    document->identifier += 1;
    snprintf(element.id, sizeof(element.id), "objeto_%d", document->identifier);
    set_text(element.type, sizeof(element.type), spec->type, "sign");
    set_text(element.layer, sizeof(element.layer), layer, document->layer);
    norma_object_place(spec, point, &element.x, &element.y);
    element.w = spec->width;
    element.h = spec->height;
    element.stroke = spec->stroke;
    element.node_count = 0;
    document->elements[document->count] = element;
    document->count += 1;
    document->dirty = 1;
    return (long) (document->count - 1);
}

int norma_document_set_exit(norma_document *document, size_t element, int is_exit)
{
    if (document == NULL || element >= document->count) {
        return 0;
    }
    norma_element *item = &document->elements[element];
    /* Solo una puerta puede ser salida: marcarlo en un extintor sería una
       promesa que el auditor no puede cumplir. */
    if (!norma_object_is_door(item->type)) {
        return 0;
    }
    const int wanted = is_exit ? 1 : 0;
    if (item->is_exit == wanted) {
        return 0;
    }
    item->is_exit = wanted;
    document->dirty = 1;
    return 1;
}

int norma_document_move_object(norma_document *document, size_t element, double x, double y)
{
    norma_element *item = editable(document, element);
    if (item == NULL) {
        return 0;
    }
    /* Los trazos se mueven nodo a nodo: aquí solo cajas. */
    if (item->node_count >= 2) {
        return 0;
    }
    if (item->x == x && item->y == y) {
        return 0;
    }
    item->x = x;
    item->y = y;
    document->dirty = 1;
    return 1;
}

/** `#rrggbb`, en minúsculas o mayúsculas; lo demás no se acepta. */
static int valid_colour(const char *colour)
{
    if (colour == NULL || colour[0] != '#' || strlen(colour) != 7) {
        return 0;
    }
    for (size_t index = 1; index < 7; index += 1) {
        const char letter = colour[index];
        const int digit = (letter >= '0' && letter <= '9') || (letter >= 'a' && letter <= 'f')
                          || (letter >= 'A' && letter <= 'F');
        if (!digit) {
            return 0;
        }
    }
    return 1;
}

/** Elemento listo para editar: comprueba el documento y el índice una sola vez. */
/**
 * Elemento que se puede editar: existe y no está bloqueado.
 *
 * El bloqueo del inspector web («Evita mover o modificar el elemento») se
 * respeta aquí y no en la ventana: así ningún camino —el lienzo, el inspector,
 * la línea de comando o un importador— se salta la regla.
 */
static norma_element *editable(norma_document *document, size_t element)
{
    if (document == NULL || element >= document->count || document->elements[element].locked) {
        return NULL;
    }
    return &document->elements[element];
}

int norma_document_set_box(norma_document *document, size_t element, double x, double y, double w, double h)
{
    norma_element *item = editable(document, element);
    if (item == NULL || item->node_count >= 2 || w <= 0.0 || h <= 0.0) {
        return 0;
    }
    if (item->x == x && item->y == y && item->w == w && item->h == h) {
        return 0;
    }
    item->x = x;
    item->y = y;
    item->w = w;
    item->h = h;
    document->dirty = 1;
    return 1;
}

int norma_document_set_rotation(norma_document *document, size_t element, double degrees)
{
    norma_element *item = editable(document, element);
    if (item == NULL) {
        return 0;
    }
    /* Se guarda en el rango de un giro completo: 370° y 10° son lo mismo y así
       el inspector no enseña cifras raras. */
    double value = fmod(degrees, 360.0);
    if (value < 0.0) {
        value += 360.0;
    }
    if (item->rotation == value) {
        return 0;
    }
    item->rotation = value;
    document->dirty = 1;
    return 1;
}

int norma_document_set_stroke(norma_document *document, size_t element, double stroke)
{
    norma_element *item = editable(document, element);
    if (item == NULL || stroke < 0.0) {
        return 0;
    }
    if (item->stroke == stroke) {
        return 0;
    }
    item->stroke = stroke;
    document->dirty = 1;
    return 1;
}

int norma_document_set_colour(norma_document *document, size_t element, const char *colour)
{
    norma_element *item = editable(document, element);
    if (item == NULL) {
        return 0;
    }
    if (colour == NULL || colour[0] == '\0') {
        if (item->colour[0] == '\0') {
            return 0;
        }
        item->colour[0] = '\0';
        document->dirty = 1;
        return 1;
    }
    if (!valid_colour(colour) || strcmp(item->colour, colour) == 0) {
        return 0;
    }
    set_text(item->colour, sizeof(item->colour), colour, "");
    document->dirty = 1;
    return 1;
}

int norma_document_set_label(norma_document *document, size_t element, const char *label)
{
    norma_element *item = editable(document, element);
    if (item == NULL) {
        return 0;
    }
    const char *text = label != NULL ? label : "";
    if (strcmp(item->label, text) == 0) {
        return 0;
    }
    set_text(item->label, sizeof(item->label), text, "");
    document->dirty = 1;
    return 1;
}

int norma_document_set_layer(norma_document *document, size_t element, const char *layer)
{
    norma_element *item = editable(document, element);
    if (item == NULL || layer == NULL || layer[0] == '\0') {
        return 0;
    }
    if (strcmp(item->layer, layer) == 0) {
        return 0;
    }
    set_text(item->layer, sizeof(item->layer), layer, NORMA_DEFAULT_LAYER);
    document->dirty = 1;
    return 1;
}

int norma_document_set_current_layer(norma_document *document, const char *layer)
{
    if (document == NULL || layer == NULL || layer[0] == '\0' || strcmp(document->layer, layer) == 0) {
        return 0;
    }
    set_text(document->layer, sizeof(document->layer), layer, NORMA_DEFAULT_LAYER);
    return 1;
}

/* ------------------------- figuras y texto (N4) --------------------------- */

/** ¿Es una de las figuras que se dibujan de dos esquinas? */
static int is_shape(const char *type)
{
    return type != NULL
           && (strcmp(type, "line") == 0 || strcmp(type, "rect") == 0 || strcmp(type, "ellipse") == 0);
}

long norma_document_add_shape(norma_document *document, const char *type, norma_point a, norma_point b,
                              const char *layer)
{
    if (document == NULL || !is_shape(type) || !reserve_element(document)) {
        return -1;
    }
    norma_element element;
    memset(&element, 0, sizeof(element));
    document->identifier += 1;
    snprintf(element.id, sizeof(element.id), "objeto_%d", document->identifier);
    set_text(element.type, sizeof(element.type), type, "rect");
    set_text(element.layer, sizeof(element.layer), layer, document->layer);
    element.x = fmin(a.x, b.x);
    element.y = fmin(a.y, b.y);
    element.w = fabs(b.x - a.x);
    element.h = fabs(b.y - a.y);
    element.stroke = 2.0;
    if (strcmp(type, "line") == 0) {
        /* La línea se guarda por sus nodos, como los muros: así se puede partir
           y medir con las mismas funciones. */
        element.nodes[0] = a;
        element.nodes[1] = b;
        element.node_count = 2;
    } else if (element.w <= 0.0 || element.h <= 0.0) {
        /* Un rectángulo o una elipse sin área no se dibuja. */
        return -1;
    }
    document->elements[document->count] = element;
    document->count += 1;
    document->dirty = 1;
    return (long) (document->count - 1);
}

/* Dimensiones con las que nace cada elemento del entorno, en centímetros y
   con el mismo criterio que la paleta web: una vía de seis metros, un andén de
   metro veinte, un parqueadero de dos metros y medio por cinco. */
typedef struct {
    const char *type;
    double width;
    double height;
    double stroke;
    int box;
} norma_environment_spec;

static const norma_environment_spec kEnvironments[] = {
    {"road", 600.0, 300.0, 0.0, 1},
    {"sidewalk", 300.0, 120.0, 0.0, 1},
    {"crosswalk", 300.0, 120.0, 0.0, 1},
    {"parking", 250.0, 500.0, 1.5, 1},
    {"property", 0.0, 0.0, 2.0, 0},
    {"pipe", 0.0, 0.0, 4.0, 0},
    {"conduit", 0.0, 0.0, 3.0, 0},
};

static const norma_environment_spec *environment_spec(const char *type)
{
    if (type == NULL) {
        return NULL;
    }
    for (size_t index = 0; index < sizeof(kEnvironments) / sizeof(kEnvironments[0]); index += 1) {
        if (strcmp(kEnvironments[index].type, type) == 0) {
            return &kEnvironments[index];
        }
    }
    return NULL;
}

int norma_environment_is(const char *type)
{
    return environment_spec(type) != NULL;
}

long norma_document_add_environment(norma_document *document, const char *type, norma_point a,
                                    norma_point b, const char *layer)
{
    const norma_environment_spec *spec = environment_spec(type);
    if (document == NULL || spec == NULL || !reserve_element(document)) {
        return -1;
    }
    if (spec->box) {
        /* Dos esquinas: el mismo gesto que un rectángulo en el editor web. */
        if (fabs(b.x - a.x) <= 0.0 || fabs(b.y - a.y) <= 0.0) {
            return -1;
        }
    } else if (fabs(b.x - a.x) <= 0.0 && fabs(b.y - a.y) <= 0.0) {
        return -1;
    }

    norma_element element;
    memset(&element, 0, sizeof(element));
    document->identifier += 1;
    snprintf(element.id, sizeof(element.id), "objeto_%d", document->identifier);
    set_text(element.type, sizeof(element.type), spec->type, "road");
    set_text(element.layer, sizeof(element.layer), layer, document->layer);
    element.stroke = spec->stroke;
    if (spec->box) {
        element.x = fmin(a.x, b.x);
        element.y = fmin(a.y, b.y);
        element.w = fabs(b.x - a.x);
        element.h = fabs(b.y - a.y);
    } else {
        element.nodes[0] = a;
        element.nodes[1] = b;
        element.node_count = 2;
    }
    document->elements[document->count] = element;
    document->count += 1;
    document->dirty = 1;
    return (long) (document->count - 1);
}

long norma_document_add_text(norma_document *document, norma_point origin, double width, double height,
                             const char *text, const char *layer)
{
    if (document == NULL || text == NULL || text[0] == '\0' || !reserve_element(document)) {
        return -1;
    }
    norma_element element;
    memset(&element, 0, sizeof(element));
    document->identifier += 1;
    snprintf(element.id, sizeof(element.id), "objeto_%d", document->identifier);
    set_text(element.type, sizeof(element.type), "text", "text");
    set_text(element.layer, sizeof(element.layer), layer, document->layer);
    set_text(element.label, sizeof(element.label), text, "");
    element.x = origin.x;
    element.y = origin.y;
    element.w = width > 0.0 ? width : 180.0;
    element.h = height > 0.0 ? height : 32.0;
    element.stroke = 0.0;
    document->elements[document->count] = element;
    document->count += 1;
    document->dirty = 1;
    return (long) (document->count - 1);
}

long norma_document_duplicate(norma_document *document, size_t element)
{
    if (document == NULL || element >= document->count || !reserve_element(document)) {
        return -1;
    }
    norma_element copy = document->elements[element];
    document->identifier += 1;
    snprintf(copy.id, sizeof(copy.id), "objeto_%d", document->identifier);
    copy.x += 20.0;
    copy.y += 20.0;
    for (size_t node = 0; node < copy.node_count; node += 1) {
        copy.nodes[node].x += 20.0;
        copy.nodes[node].y += 20.0;
    }
    document->elements[document->count] = copy;
    document->count += 1;
    document->dirty = 1;
    return (long) (document->count - 1);
}

int norma_document_set_opacity(norma_document *document, size_t element, double opacity)
{
    norma_element *item = editable(document, element);
    if (item == NULL) {
        return 0;
    }
    /* El inspector web mueve la opacidad entre 10 % y 100 %. */
    const double wanted = opacity < 0.1 ? 0.1 : (opacity > 1.0 ? 1.0 : opacity);
    if (item->opacity > 0.0 && fabs(item->opacity - wanted) < 1e-6) {
        return 0;
    }
    item->opacity = wanted;
    document->dirty = 1;
    return 1;
}

int norma_document_set_font_size(norma_document *document, size_t element, double size)
{
    norma_element *item = editable(document, element);
    if (item == NULL || size < 2.0 || size > 400.0) {
        return 0;
    }
    const double current = item->font_size > 0.0 ? item->font_size : 14.0;
    if (fabs(current - size) < 1e-6) {
        return 0;
    }
    item->font_size = size;
    document->dirty = 1;
    return 1;
}

int norma_document_set_door_flips(norma_document *document, size_t element, int flip_x, int flip_y)
{
    norma_element *item = editable(document, element);
    if (item == NULL || !norma_object_is_door(item->type)) {
        return 0;
    }
    const int x = flip_x ? 1 : 0;
    const int y = flip_y ? 1 : 0;
    if (item->flip_x == x && item->flip_y == y) {
        return 0;
    }
    item->flip_x = x;
    item->flip_y = y;
    document->dirty = 1;
    return 1;
}

int norma_document_set_locked(norma_document *document, size_t element, int locked)
{
    if (document == NULL || element >= document->count) {
        return 0;
    }
    norma_element *item = &document->elements[element];
    const int wanted = locked ? 1 : 0;
    if (item->locked == wanted) {
        return 0;
    }
    item->locked = wanted;
    document->dirty = 1;
    return 1;
}

/** Tipos a los que se puede convertir un elemento sin perder su dibujo. */
static int convertible(const char *type)
{
    static const char *const kTypes[] = {"wall", "line", "rect", "ellipse", "text", "route", "dimension"};
    if (type == NULL) {
        return 0;
    }
    for (size_t index = 0; index < sizeof(kTypes) / sizeof(kTypes[0]); index += 1) {
        if (strcmp(kTypes[index], type) == 0) {
            return 1;
        }
    }
    return 0;
}

int norma_document_set_type(norma_document *document, size_t element, const char *type)
{
    norma_element *item = editable(document, element);
    if (item == NULL || !convertible(type) || !convertible(item->type)) {
        return 0;
    }
    if (strcmp(item->type, type) == 0) {
        return 0;
    }
    /* Un trazo no se convierte en caja ni al revés: se perderían sus nodos o su
       área. El inspector web hace la misma comprobación. */
    const int from_path = item->node_count >= 2;
    const int to_path = strcmp(type, "wall") == 0 || strcmp(type, "line") == 0
                        || strcmp(type, "route") == 0 || strcmp(type, "dimension") == 0;
    if (from_path != to_path) {
        return 0;
    }
    set_text(item->type, sizeof(item->type), type, "wall");
    document->dirty = 1;
    return 1;
}

int norma_document_set_width_m(norma_document *document, size_t element, double width_m)
{
    norma_element *item = editable(document, element);
    if (item == NULL || width_m < 0.0) {
        return 0;
    }
    if (fabs(item->width_m - width_m) < 1e-6) {
        return 0;
    }
    item->width_m = width_m;
    document->dirty = 1;
    return 1;
}

int norma_document_set_extinguisher(norma_document *document, size_t element, const char *agent,
                                    const char *rating, const char *hazard, double capacity_lb,
                                    double mount_cm)
{
    norma_element *item = editable(document, element);
    if (item == NULL || strstr(item->type, "extinguisher") == NULL) {
        return 0;
    }
    int changed = 0;
    if (agent != NULL && agent[0] != '\0' && strcmp(item->ext_agent, agent) != 0) {
        set_text(item->ext_agent, sizeof(item->ext_agent), agent, "");
        changed = 1;
    }
    if (rating != NULL && rating[0] != '\0' && strcmp(item->ext_rating, rating) != 0) {
        set_text(item->ext_rating, sizeof(item->ext_rating), rating, "");
        changed = 1;
    }
    if (hazard != NULL && hazard[0] != '\0' && strcmp(item->ext_hazard, hazard) != 0) {
        set_text(item->ext_hazard, sizeof(item->ext_hazard), hazard, "");
        changed = 1;
    }
    if (capacity_lb > 0.0 && fabs(item->ext_capacity_lb - capacity_lb) > 1e-6) {
        item->ext_capacity_lb = capacity_lb;
        changed = 1;
    }
    if (mount_cm >= 0.0 && (!item->has_ext_mount || fabs(item->ext_mount_cm - mount_cm) > 1e-6)) {
        item->ext_mount_cm = mount_cm;
        item->has_ext_mount = 1;
        changed = 1;
    }
    if (changed) {
        document->dirty = 1;
    }
    return changed;
}

int norma_document_set_mep(norma_document *document, size_t element, const char *network,
                           const char *diameter, const char *material, double slope, double pressure)
{
    norma_element *item = editable(document, element);
    if (item == NULL || strcmp(item->type, "pipe") != 0) {
        return 0;
    }
    int changed = 0;
    if (network != NULL && network[0] != '\0' && strcmp(item->mep_network, network) != 0) {
        set_text(item->mep_network, sizeof(item->mep_network), network, "");
        changed = 1;
    }
    if (diameter != NULL && diameter[0] != '\0' && strcmp(item->mep_diameter, diameter) != 0) {
        set_text(item->mep_diameter, sizeof(item->mep_diameter), diameter, "");
        changed = 1;
    }
    if (material != NULL && material[0] != '\0' && strcmp(item->mep_material, material) != 0) {
        set_text(item->mep_material, sizeof(item->mep_material), material, "");
        changed = 1;
    }
    /* La pendiente va de 0 a 15 % y la presión de 0 a 5000 kPa: los mismos topes
       del inspector web, que no son cifras de cálculo sino de referencia. Un
       negativo significa «no lo toques», para poder cambiar solo la red. */
    if (slope >= 0.0) {
        const double wanted_slope = slope > 15.0 ? 15.0 : slope;
        if (fabs(item->mep_slope - wanted_slope) > 1e-6) {
            item->mep_slope = wanted_slope;
            changed = 1;
        }
    }
    if (pressure >= 0.0) {
        const double wanted_pressure = pressure > 5000.0 ? 5000.0 : pressure;
        if (fabs(item->mep_pressure - wanted_pressure) > 1e-6) {
            item->mep_pressure = wanted_pressure;
            changed = 1;
        }
    }
    if (changed) {
        document->dirty = 1;
    }
    return changed;
}

int norma_document_set_circuit(norma_document *document, size_t element, const char *code,
                               int voltage, const char *gauge, int phases, double load_va)
{
    norma_element *item = editable(document, element);
    if (item == NULL || strcmp(item->type, "conduit") != 0) {
        return 0;
    }
    int changed = 0;
    if (code != NULL && code[0] != '\0' && strcmp(item->circuit, code) != 0) {
        set_text(item->circuit, sizeof(item->circuit), code, "");
        changed = 1;
    }
    const int wanted_voltage = voltage < 0 ? 0 : (voltage > 1000 ? 1000 : voltage);
    if (item->circuit_voltage != wanted_voltage) {
        item->circuit_voltage = wanted_voltage;
        changed = 1;
    }
    if (gauge != NULL && gauge[0] != '\0' && strcmp(item->circuit_gauge, gauge) != 0) {
        set_text(item->circuit_gauge, sizeof(item->circuit_gauge), gauge, "");
        changed = 1;
    }
    /* Una instalación es monofásica o trifásica: no hay dos fases. */
    const int wanted_phases = phases >= 3 ? 3 : 1;
    if (item->circuit_phases != wanted_phases) {
        item->circuit_phases = wanted_phases;
        changed = 1;
    }
    /* Un negativo deja la carga como estaba: la canaleta no la edita, el
       equipo eléctrico sí. */
    const double wanted_load = load_va < 0.0 ? item->circuit_load_va
                                             : (load_va > 100000.0 ? 100000.0 : load_va);
    if (fabs(item->circuit_load_va - wanted_load) > 1e-6) {
        item->circuit_load_va = wanted_load;
        changed = 1;
    }
    if (changed) {
        document->dirty = 1;
    }
    return changed;
}

int norma_document_set_lanes(norma_document *document, size_t element, int lanes)
{
    norma_element *item = editable(document, element);
    if (item == NULL || strcmp(item->type, "road") != 0) {
        return 0;
    }
    const int wanted = lanes < 1 ? 1 : (lanes > 6 ? 6 : lanes);
    if (item->lanes == wanted) {
        return 0;
    }
    item->lanes = wanted;
    document->dirty = 1;
    return 1;
}

int norma_document_move_node(norma_document *document, size_t element, size_t node, double x, double y)
{
    norma_element *item = editable(document, element);
    if (item == NULL) {
        return 0;
    }
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
            /* Una caja (puerta, extintor, señal) se elige por dentro, no solo
               por su centro: si no, en un plano a 1:100 habría que acertarle a
               un punto de 8 píxeles. */
            if (item->w > 0.0 && item->h > 0.0) {
                const double dx = fmax(fmax(item->x - point.x, point.x - (item->x + item->w)), 0.0);
                const double dy = fmax(fmax(item->y - point.y, point.y - (item->y + item->h)), 0.0);
                distance = hypot(dx, dy);
            } else {
                distance = hypot(point.x - item->x, point.y - item->y);
            }
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
    /* El color propio viaja con el plano: sin esto, abrir un plano de la web y
       volver a guardarlo cambiaba los colores que la persona había elegido. */
    if (element->colour[0] != '\0') {
        norma_buffer_raw(buffer, ",\"color\":");
        norma_buffer_string(buffer, element->colour);
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
    if (element->flip_x) {
        norma_buffer_raw(buffer, ",\"flipX\":true");
    }
    if (element->flip_y) {
        norma_buffer_raw(buffer, ",\"flipY\":true");
    }
    /* La opacidad solo viaja si se apartó del todo: el plano no se llena de
       cifras que no dicen nada. */
    if (element->opacity > 0.0 && element->opacity < 0.999) {
        norma_buffer_raw(buffer, ",\"opacity\":");
        norma_buffer_number(buffer, element->opacity);
    }
    if (element->font_size > 0.0) {
        norma_buffer_raw(buffer, ",\"fontSize\":");
        norma_buffer_number(buffer, element->font_size);
    }
    if (element->locked) {
        norma_buffer_raw(buffer, ",\"locked\":true");
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
    /* Red de tubería y circuito eléctrico: las claves son las del editor web, así
       que el plano se puede llevar de una ventana a la otra sin traducir nada. */
    if (element->mep_network[0] != '\0') {
        norma_buffer_raw(buffer, ",\"network\":");
        norma_buffer_string(buffer, element->mep_network);
    }
    if (element->mep_diameter[0] != '\0') {
        norma_buffer_raw(buffer, ",\"diameter\":");
        norma_buffer_string(buffer, element->mep_diameter);
    }
    if (element->mep_material[0] != '\0') {
        norma_buffer_raw(buffer, ",\"material\":");
        norma_buffer_string(buffer, element->mep_material);
    }
    if (element->mep_slope > 0.0) {
        norma_buffer_raw(buffer, ",\"slope\":");
        norma_buffer_number(buffer, element->mep_slope);
    }
    if (element->mep_pressure > 0.0) {
        norma_buffer_raw(buffer, ",\"pressure\":");
        norma_buffer_number(buffer, element->mep_pressure);
    }
    if (element->circuit[0] != '\0') {
        norma_buffer_raw(buffer, ",\"circuit\":");
        norma_buffer_string(buffer, element->circuit);
    }
    if (element->circuit_voltage > 0) {
        norma_buffer_raw(buffer, ",\"voltage\":");
        norma_buffer_number(buffer, (double) element->circuit_voltage);
    }
    if (element->circuit_gauge[0] != '\0') {
        norma_buffer_raw(buffer, ",\"gauge\":");
        norma_buffer_string(buffer, element->circuit_gauge);
    }
    if (element->circuit_phases > 0) {
        norma_buffer_raw(buffer, ",\"phases\":");
        norma_buffer_number(buffer, (double) element->circuit_phases);
    }
    if (element->circuit_load_va > 0.0) {
        norma_buffer_raw(buffer, ",\"load\":");
        norma_buffer_number(buffer, element->circuit_load_va);
    }
    if (element->lanes > 0) {
        norma_buffer_raw(buffer, ",\"lanes\":");
        norma_buffer_number(buffer, (double) element->lanes);
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

/* ----------------------------- imagen de guía ---------------------------- */

int norma_document_set_guide(norma_document *document, const char *name, const char *data,
                             double x, double y, double w, double h)
{
    if (document == NULL || data == NULL || data[0] == '\0') {
        return 0;
    }
    const size_t length = strlen(data);
    /* Tope de la imagen: un PNG de 32 MB ocupa 43 MB en base64 y ya es un plano
       enorme; más que eso es un archivo que conviene reducir antes de calcar. */
    if (length > NORMA_GUIDE_MAX_DATA) {
        return 0;
    }
    char *copy = (char *) malloc(length + 1);
    if (copy == NULL) {
        return 0;
    }
    memcpy(copy, data, length + 1);
    guide_free(&document->guide);
    document->guide.data = copy;
    document->guide.data_size = length;
    set_text(document->guide.name, sizeof(document->guide.name), name, "maqueta");
    document->guide.opacity = 0.45;
    document->guide.x = x;
    document->guide.y = y;
    document->guide.w = w > 0.0 ? w : document->width;
    document->guide.h = h > 0.0 ? h : document->height;
    document->guide.visible = 1;
    document->guide.locked = 0;
    document->guide.present = 1;
    document->dirty = 1;
    return 1;
}

int norma_document_set_guide_opacity(norma_document *document, double opacity)
{
    if (document == NULL || !document->guide.present) {
        return 0;
    }
    const double wanted = opacity < 0.05 ? 0.05 : (opacity > 1.0 ? 1.0 : opacity);
    if (fabs(document->guide.opacity - wanted) < 1e-6) {
        return 0;
    }
    document->guide.opacity = wanted;
    document->dirty = 1;
    return 1;
}

int norma_document_set_guide_box(norma_document *document, double x, double y, double w, double h)
{
    if (document == NULL || !document->guide.present || w <= 0.0 || h <= 0.0) {
        return 0;
    }
    if (fabs(document->guide.x - x) < 1e-6 && fabs(document->guide.y - y) < 1e-6
        && fabs(document->guide.w - w) < 1e-6 && fabs(document->guide.h - h) < 1e-6) {
        return 0;
    }
    document->guide.x = x;
    document->guide.y = y;
    document->guide.w = w;
    document->guide.h = h;
    document->dirty = 1;
    return 1;
}

int norma_document_set_guide_visible(norma_document *document, int visible)
{
    if (document == NULL || !document->guide.present) {
        return 0;
    }
    const int wanted = visible ? 1 : 0;
    if (document->guide.visible == wanted) {
        return 0;
    }
    document->guide.visible = wanted;
    document->dirty = 1;
    return 1;
}

int norma_document_set_guide_locked(norma_document *document, int locked)
{
    if (document == NULL || !document->guide.present) {
        return 0;
    }
    const int wanted = locked ? 1 : 0;
    if (document->guide.locked == wanted) {
        return 0;
    }
    document->guide.locked = wanted;
    document->dirty = 1;
    return 1;
}

int norma_document_clear_guide(norma_document *document)
{
    if (document == NULL || !document->guide.present) {
        return 0;
    }
    guide_free(&document->guide);
    document->dirty = 1;
    return 1;
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
    if (document->drill_reaction_s != 30 || document->drill_measured_s > 0) {
        norma_buffer_raw(&buffer, ",\"drill\":{\"reactionS\":");
        norma_buffer_number(&buffer, (double) document->drill_reaction_s);
        if (document->drill_measured_s > 0) {
            norma_buffer_raw(&buffer, ",\"measuredS\":");
            norma_buffer_number(&buffer, (double) document->drill_measured_s);
        }
        norma_buffer_raw(&buffer, "}");
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
    norma_buffer_raw(&buffer, "],\"groups\":[]},");
    /* La maqueta de trazo va en la raíz del sobre, fuera de `design`: el editor
       web ignora lo que no conoce y el plano sigue siendo válido allí. */
    if (document->guide.present && document->guide.data != NULL) {
        norma_buffer_raw(&buffer, "\"guide\":{\"name\":");
        norma_buffer_string(&buffer, document->guide.name);
        norma_buffer_raw(&buffer, ",\"opacity\":");
        norma_buffer_number(&buffer, document->guide.opacity);
        norma_buffer_raw(&buffer, ",\"x\":");
        norma_buffer_number(&buffer, document->guide.x);
        norma_buffer_raw(&buffer, ",\"y\":");
        norma_buffer_number(&buffer, document->guide.y);
        norma_buffer_raw(&buffer, ",\"w\":");
        norma_buffer_number(&buffer, document->guide.w);
        norma_buffer_raw(&buffer, ",\"h\":");
        norma_buffer_number(&buffer, document->guide.h);
        norma_buffer_raw(&buffer, ",\"visible\":");
        norma_buffer_raw(&buffer, document->guide.visible ? "true" : "false");
        norma_buffer_raw(&buffer, ",\"locked\":");
        norma_buffer_raw(&buffer, document->guide.locked ? "true" : "false");
        norma_buffer_raw(&buffer, ",\"data\":");
        norma_buffer_string(&buffer, document->guide.data);
        norma_buffer_raw(&buffer, "},");
    }
    norma_buffer_raw(&buffer, "\"attribution\":");
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
    /* Simulacro: reacción declarada y tiempo medido (0 = sin medir). */
    const norma_json *drill = norma_json_get(canvas, "drill");
    const double reaction = norma_json_number(norma_json_get(drill, "reactionS"), 30.0);
    document->drill_reaction_s = reaction > 0.0 ? (long) reaction : 0;
    const double measured = norma_json_number(norma_json_get(drill, "measuredS"), 0.0);
    document->drill_measured_s = measured > 0.0 ? (long) measured : 0;
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

    /* Maqueta de trazo: imagen en base64 y su caja. */
    const norma_json *guide = norma_json_get(root, "guide");
    const char *guide_data = norma_json_string(norma_json_get(guide, "data"));
    if (guide_data != NULL && guide_data[0] != '\0') {
        if (norma_document_set_guide(document, norma_json_string(norma_json_get(guide, "name")), guide_data,
                                     norma_json_number(norma_json_get(guide, "x"), 0.0),
                                     norma_json_number(norma_json_get(guide, "y"), 0.0),
                                     norma_json_number(norma_json_get(guide, "w"), document->width),
                                     norma_json_number(norma_json_get(guide, "h"), document->height))) {
            document->guide.opacity = norma_json_number(norma_json_get(guide, "opacity"), 0.45);
            document->guide.visible = norma_json_bool_at(guide, "visible", 1);
            document->guide.locked = norma_json_bool_at(guide, "locked", 0);
        }
    }

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
        const char *colour = norma_json_string(norma_json_get(source, "color"));
        if (valid_colour(colour)) {
            set_text(element.colour, sizeof(element.colour), colour, "");
        }
        element.width_m = norma_json_number(norma_json_get(source, "widthM"), 2.0);
        element.measured_m = norma_json_number(norma_json_get(source, "measuredM"), 0.0);
        element.is_exit = norma_json_bool_at(source, "isExit", 0);
        element.flip_x = norma_json_bool_at(source, "flipX", 0);
        element.flip_y = norma_json_bool_at(source, "flipY", 0);
        element.opacity = norma_json_number(norma_json_get(source, "opacity"), 1.0);
        element.font_size = norma_json_number(norma_json_get(source, "fontSize"), 0.0);
        element.locked = norma_json_bool_at(source, "locked", 0);
        set_text(element.ext_agent, sizeof(element.ext_agent),
                 norma_json_string(norma_json_get(source, "extAgent")), "");
        set_text(element.ext_rating, sizeof(element.ext_rating),
                 norma_json_string(norma_json_get(source, "extRating")), "");
        set_text(element.ext_hazard, sizeof(element.ext_hazard),
                 norma_json_string(norma_json_get(source, "extHazard")), "");
        element.ext_capacity_lb = norma_json_number(norma_json_get(source, "extCapacityLb"), 0.0);
        element.ext_mount_cm = norma_json_number(norma_json_get(source, "extMountCm"), 0.0);
        element.has_ext_mount = norma_json_get(source, "extMountCm") != NULL;
        set_text(element.mep_network, sizeof(element.mep_network),
                 norma_json_string(norma_json_get(source, "network")), "");
        set_text(element.mep_diameter, sizeof(element.mep_diameter),
                 norma_json_string(norma_json_get(source, "diameter")), "");
        set_text(element.mep_material, sizeof(element.mep_material),
                 norma_json_string(norma_json_get(source, "material")), "");
        element.mep_slope = norma_json_number(norma_json_get(source, "slope"), 0.0);
        element.mep_pressure = norma_json_number(norma_json_get(source, "pressure"), 0.0);
        set_text(element.circuit, sizeof(element.circuit),
                 norma_json_string(norma_json_get(source, "circuit")), "");
        element.circuit_voltage = (int) norma_json_number(norma_json_get(source, "voltage"), 0.0);
        set_text(element.circuit_gauge, sizeof(element.circuit_gauge),
                 norma_json_string(norma_json_get(source, "gauge")), "");
        element.circuit_phases = (int) norma_json_number(norma_json_get(source, "phases"), 0.0);
        element.circuit_load_va = norma_json_number(norma_json_get(source, "load"), 0.0);
        element.lanes = (int) norma_json_number(norma_json_get(source, "lanes"), 0.0);
        document->elements[document->count] = element;
        document->count += 1;
        document->identifier += 1;
    }
    document->dirty = 0;
    norma_json_free(root);
    return 1;
}
