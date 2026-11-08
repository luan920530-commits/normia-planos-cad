/*
 * Normia nativo · catálogo de objetos insertables.
 *
 * Solo dice **qué** se puede insertar y **cómo nace**. Lo que el objeto mide de
 * verdad lo decide el auditor cuando mide el plano: aquí no hay ni un umbral.
 *
 * El catálogo completo se lee en tiempo de ejecución de los tres catálogos
 * locales, con el mismo lector de JSON que el plano. No hay una copia de los
 * 820 objetos en C: si mañana entra una señal al catálogo de la web, aparece en
 * el menú de la ventana sin recompilar nada.
 */
#include "normia/object.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/json.h"
#include "normia/library.h"

/* ------------------------------- respaldo -------------------------------- */

/**
 * Las once piezas que la ventana ofrece aunque no encuentre los catálogos.
 * El orden es el del menú: primero lo que cierra el recinto (puertas), después
 * lo que se revisa (equipos) y al final la señalización.
 *
 * `cad_eds_extinguisher` nace sin datos de norma a propósito: el análisis los
 * completa con `catalogDefaults` de `resources/extinguisher-criteria.json`, así
 * que un extintor insertado aquí y uno insertado en la web se miden igual.
 */
static const norma_object_spec kFallback[NORMA_OBJECT_FALLBACK_COUNT] = {
    {"door", "Puerta sencilla", "door", "Puertas", "#475569", NULL, 90.0, 90.0, 2.0, 1, 1},
    {"door_double", "Puerta doble", "door", "Puertas", "#475569", NULL, 120.0, 60.0, 2.0, 1, 1},
    {"door_garage", "Portón o reja", "door", "Puertas", "#475569", NULL, 160.0, 50.0, 2.0, 1, 1},
    {"cad_eds_extinguisher", "Extintor", "cad:emergency", "Atención de emergencias", "#b91c1c", NULL,
     90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_firstaid", "Botiquín", "cad:emergency", "Atención de emergencias", "#b91c1c", NULL,
     90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_stretcher", "Camilla", "cad:emergency", "Atención de emergencias", "#b91c1c", NULL,
     90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_aed", "DEA", "cad:emergency", "Atención de emergencias", "#b91c1c", NULL, 90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_meeting", "Punto de encuentro", "cad:emergency", "Atención de emergencias", "#b91c1c", NULL,
     90.0, 90.0, 1.5, 0, 0},
    {"iso_e001", "Señal de salida (E001)", "sign:emergency", "Emergencia y condición segura", "#237f52", NULL,
     64.0, 64.0, 0.0, 0, 0},
    {"iso_e007", "Señal de punto de encuentro (E007)", "sign:emergency", "Emergencia y condición segura",
     "#237f52", NULL, 64.0, 64.0, 0.0, 0, 0},
    {"sig_aqui", "Usted está aquí", "sign:location", "Ubicación en el plano", "#1d4ed8", NULL, 64.0, 64.0, 0.0, 0, 0},
};

/** El catálogo que se consulta desde el documento y el SVG (NULL = respaldo). */
static const norma_object_catalog *g_active = NULL;

/* ------------------------------- auxiliares ------------------------------- */

static void copy_text(char *target, size_t size, const char *value)
{
    snprintf(target, size, "%s", value != NULL ? value : "");
}

/** Copia un pictograma; `NULL` si no hay memoria. */
static char *copy_svg(const char *svg)
{
    if (svg == NULL) {
        return NULL;
    }
    const size_t length = strlen(svg);
    char *copy = (char *) malloc(length + 1);
    if (copy != NULL) {
        memcpy(copy, svg, length + 1);
    }
    return copy;
}

/** `#rrggbb` en minúsculas, que es lo que escriben los catálogos. */
static int valid_colour(const char *colour)
{
    if (colour == NULL || colour[0] != '#' || strlen(colour) != 7) {
        return 0;
    }
    for (size_t index = 1; index < 7; index += 1) {
        if (!isxdigit((unsigned char) colour[index])) {
            return 0;
        }
    }
    return 1;
}

static norma_object_spec *reserve(norma_object_catalog *catalog)
{
    if (catalog->count == catalog->capacity) {
        const size_t capacity = catalog->capacity == 0 ? 128 : catalog->capacity * 2;
        norma_object_spec *grown = (norma_object_spec *) realloc(catalog->items,
                                                                  capacity * sizeof(norma_object_spec));
        if (grown == NULL) {
            return NULL;
        }
        catalog->items = grown;
        catalog->capacity = capacity;
    }
    return &catalog->items[catalog->count];
}

static norma_object_spec *push(norma_object_catalog *catalog, const char *type, const char *name,
                               const char *family, const char *family_label, const char *colour,
                               double width, double height, double stroke, int on_wall, int is_door)
{
    norma_object_spec *spec = reserve(catalog);
    if (spec == NULL) {
        return NULL;
    }
    memset(spec, 0, sizeof(*spec));
    copy_text(spec->type, sizeof(spec->type), type);
    copy_text(spec->name, sizeof(spec->name), name);
    copy_text(spec->family, sizeof(spec->family), family);
    copy_text(spec->family_label, sizeof(spec->family_label), family_label);
    copy_text(spec->colour, sizeof(spec->colour), valid_colour(colour) ? colour : "#334155");
    spec->width = width;
    spec->height = height;
    spec->stroke = stroke;
    spec->on_wall = on_wall;
    spec->is_door = is_door;
    catalog->count += 1;
    return spec;
}

static void clear(norma_object_catalog *catalog)
{
    for (size_t index = 0; index < catalog->count; index += 1) {
        free(catalog->items[index].svg);
    }
    free(catalog->items);
    memset(catalog, 0, sizeof(*catalog));
}

/* ------------------------------ respaldo API ------------------------------ */

size_t norma_object_count(void)
{
    return g_active != NULL ? g_active->count : NORMA_OBJECT_FALLBACK_COUNT;
}

const norma_object_spec *norma_object_at(size_t index)
{
    if (g_active != NULL) {
        return index < g_active->count ? &g_active->items[index] : NULL;
    }
    return index < NORMA_OBJECT_FALLBACK_COUNT ? &kFallback[index] : NULL;
}

int norma_object_is_door(const char *type)
{
    if (type == NULL) {
        return 0;
    }
    for (size_t index = 0; index < norma_object_count(); index += 1) {
        const norma_object_spec *spec = norma_object_at(index);
        if (spec != NULL && spec->is_door && strcmp(spec->type, type) == 0) {
            return 1;
        }
    }
    /* Las puertas están en los dos catálogos, pero un plano puede traer una
       puerta aunque el catálogo no se haya cargado. */
    return strcmp(type, "door") == 0 || strcmp(type, "door_double") == 0
           || strcmp(type, "door_garage") == 0;
}

const norma_object_spec *norma_object_find(const char *type)
{
    if (type == NULL) {
        return NULL;
    }
    for (size_t index = 0; index < norma_object_count(); index += 1) {
        const norma_object_spec *spec = norma_object_at(index);
        if (spec != NULL && strcmp(spec->type, type) == 0) {
            return spec;
        }
    }
    return NULL;
}

void norma_object_place(const norma_object_spec *spec, norma_point point, double *x, double *y)
{
    if (spec == NULL || x == NULL || y == NULL) {
        return;
    }
    *x = point.x - spec->width / 2.0;
    /* La puerta apoya su borde inferior en el muro: la caja queda hacia arriba,
       que es hacia donde abre la hoja y donde el auditor busca el vano. */
    *y = spec->on_wall ? point.y - spec->height : point.y - spec->height / 2.0;
}

/* --------------------------- catálogo completo --------------------------- */

/** Lee un archivo completo; `NULL` si no se puede abrir. */
static char *read_file(const char *path, size_t *length)
{
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        return NULL;
    }
    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return NULL;
    }
    const long size = ftell(file);
    if (size < 0) {
        fclose(file);
        return NULL;
    }
    rewind(file);
    char *text = (char *) malloc((size_t) size + 1);
    if (text == NULL) {
        fclose(file);
        return NULL;
    }
    const size_t read = fread(text, 1, (size_t) size, file);
    fclose(file);
    text[read] = '\0';
    if (length != NULL) {
        *length = read;
    }
    return text;
}

/**
 * Las tres puertas. No están en ningún catálogo porque no son un pictograma:
 * su dibujo lo pone a mano `write_door()` en el SVG y `drawDoor:` en el lienzo.
 */
static int load_doors(norma_object_catalog *catalog)
{
    for (size_t index = 0; index < 3; index += 1) {
        const norma_object_spec *source = &kFallback[index];
        if (push(catalog, source->type, source->name, source->family, source->family_label, source->colour,
                 source->width, source->height, source->stroke, source->on_wall, source->is_door) == NULL) {
            return 0;
        }
    }
    return 1;
}

/** Los 422 objetos CAD, con el nombre, el color y el pictograma del catálogo. */
static int load_cad(norma_object_catalog *catalog, const char *path, char *error, size_t error_size)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        snprintf(error, error_size, "No se pudo abrir «%s».", path);
        return 0;
    }
    char parse_error[160];
    norma_json *root = norma_json_parse(text, length, parse_error, sizeof(parse_error));
    free(text);
    if (root == NULL) {
        snprintf(error, error_size, "El catálogo de objetos CAD no es JSON válido: %s", parse_error);
        return 0;
    }
    const norma_json *objects = norma_json_get(root, "objects");
    const norma_json *categories = norma_json_get(root, "categories");
    const size_t total = norma_json_size(objects);
    if (total == 0) {
        norma_json_free(root);
        snprintf(error, error_size, "El catálogo de objetos CAD no tiene objetos.");
        return 0;
    }
    for (size_t index = 0; index < total; index += 1) {
        const char *key = norma_json_key_at(objects, index);
        const norma_json *object = key != NULL ? norma_json_get(objects, key) : NULL;
        if (object == NULL) {
            continue;
        }
        const char *category = norma_json_string_at(object, "category", "otros");
        const norma_json *family = norma_json_get(categories, category);
        const char *label = norma_json_string_at(family, "label", category);
        const char *svg = norma_json_string(norma_json_get(object, "svg"));
        if (svg == NULL || !norma_library_safe_svg(svg)) {
            norma_json_free(root);
            snprintf(error, error_size, "El pictograma del objeto «%s» no supera la validación de seguridad.",
                     key);
            return 0;
        }
        char family_key[NORMA_OBJECT_FAMILY];
        snprintf(family_key, sizeof(family_key), "cad:%s", category);
        norma_object_spec *spec = push(catalog, key, norma_json_string_at(object, "name", key), family_key,
                                       label, norma_json_string_at(object, "color", "#334155"),
                                       90.0, 90.0, 1.5, 0, 0);
        if (spec == NULL) {
            norma_json_free(root);
            snprintf(error, error_size, "No hay memoria para el catálogo de objetos CAD.");
            return 0;
        }
        spec->svg = copy_svg(svg);
        if (spec->svg == NULL) {
            norma_json_free(root);
            snprintf(error, error_size, "No hay memoria para el pictograma «%s».", key);
            return 0;
        }
    }
    norma_json_free(root);
    return 1;
}

/** Las 395 señales, con el tipo del editor, su familia y su pictograma. */
static int load_signs(norma_object_catalog *catalog, const char *directory, char *error, size_t error_size)
{
    norma_library library;
    if (!norma_library_load(directory, &library, error, error_size)) {
        return 0;
    }
    for (size_t index = 0; index < library.count; index += 1) {
        const norma_sign *sign = &library.items[index];
        char type[NORMA_OBJECT_TYPE];
        if (norma_library_type_for_code(sign->code, type, sizeof(type)) == NULL) {
            norma_library_free(&library);
            snprintf(error, error_size, "La señal «%s» no tiene un tipo válido.", sign->code);
            return 0;
        }
        char family_key[NORMA_OBJECT_FAMILY];
        snprintf(family_key, sizeof(family_key), "sign:%s", sign->category);
        /* Una señal es 64 × 64 cm en la web y no lleva trazo: su pictograma ya
           trae el color de la familia. */
        norma_object_spec *spec = push(catalog, type, sign->name, family_key, sign->family_label,
                                       sign->color, 64.0, 64.0, 0.0, 0, 0);
        if (spec == NULL) {
            norma_library_free(&library);
            snprintf(error, error_size, "No hay memoria para el catálogo de señalización.");
            return 0;
        }
        spec->svg = copy_svg(sign->svg);
        if (spec->svg == NULL) {
            norma_library_free(&library);
            snprintf(error, error_size, "No hay memoria para el pictograma «%s».", sign->code);
            return 0;
        }
    }
    norma_library_free(&library);
    return 1;
}

/**
 * Agrupa las piezas por familia conservando el orden en que cada familia
 * apareció por primera vez. Así el menú puede recorrer el catálogo de arriba
 * abajo y dibujar un submenú por familia sin repetir ninguno.
 */
static void group_families(norma_object_catalog *catalog)
{
    /* El orden de cada familia es el de su primera pieza. */
    for (size_t index = 0; index < catalog->count; index += 1) {
        size_t rank = index;
        for (size_t before = 0; before < index; before += 1) {
            if (strcmp(catalog->items[before].family, catalog->items[index].family) == 0) {
                rank = before;
                break;
            }
        }
        /* Inserción estable: no hay más de 820 piezas. */
        for (size_t position = index; position > rank; position -= 1) {
            const norma_object_spec swap = catalog->items[position - 1];
            catalog->items[position - 1] = catalog->items[position];
            catalog->items[position] = swap;
        }
    }
}

int norma_object_catalog_load(norma_object_catalog *catalog, const char *directory,
                              char *error, size_t error_size)
{
    if (catalog == NULL || error == NULL || error_size == 0) {
        return 0;
    }
    /* Se arranca de cero: la estructura puede venir sin inicializar. Si ya había
       un catálogo cargado, hay que liberarlo antes con `norma_object_catalog_free`. */
    memset(catalog, 0, sizeof(*catalog));
    const char *folder = directory != NULL && directory[0] != '\0' ? directory : "resources";
    copy_text(catalog->source, sizeof(catalog->source), folder);

    char path[512];
    if (!load_doors(catalog)) {
        snprintf(error, error_size, "No hay memoria para el catálogo de objetos.");
        clear(catalog);
        return 0;
    }
    snprintf(path, sizeof(path), "%s/cad-objects.json", folder);
    if (!load_cad(catalog, path, error, error_size)) {
        clear(catalog);
        return 0;
    }
    if (!load_signs(catalog, folder, error, error_size)) {
        clear(catalog);
        return 0;
    }
    group_families(catalog);
    catalog->loaded = 1;
    return 1;
}

void norma_object_catalog_free(norma_object_catalog *catalog)
{
    if (catalog == NULL) {
        return;
    }
    if (g_active == catalog) {
        g_active = NULL;
    }
    clear(catalog);
}

int norma_object_use(const norma_object_catalog *catalog)
{
    if (catalog == NULL) {
        g_active = NULL;
        return 1;
    }
    if (catalog->count == 0) {
        return 0;
    }
    g_active = catalog;
    return 1;
}

const norma_object_catalog *norma_object_active(void)
{
    return g_active;
}

/* ------------------------------- familias -------------------------------- */

size_t norma_object_family_count(void)
{
    size_t families = 0;
    const char *last = NULL;
    for (size_t index = 0; index < norma_object_count(); index += 1) {
        const norma_object_spec *spec = norma_object_at(index);
        if (spec == NULL) {
            continue;
        }
        if (index == 0 || last == NULL || strcmp(spec->family, last) != 0) {
            families += 1;
            last = spec->family;
        }
    }
    return families;
}

/** Primera pieza de la familia número `index` (el catálogo viene agrupado). */
static const norma_object_spec *family_head(size_t index)
{
    size_t families = 0;
    const char *last = NULL;
    for (size_t position = 0; position < norma_object_count(); position += 1) {
        const norma_object_spec *spec = norma_object_at(position);
        if (spec == NULL) {
            continue;
        }
        if (position == 0 || last == NULL || strcmp(spec->family, last) != 0) {
            if (families == index) {
                return spec;
            }
            families += 1;
            last = spec->family;
        }
    }
    return NULL;
}

const char *norma_object_family_at(size_t index)
{
    const norma_object_spec *head = family_head(index);
    return head != NULL ? head->family : NULL;
}

const char *norma_object_family_label_at(size_t index)
{
    const norma_object_spec *head = family_head(index);
    return head != NULL ? head->family_label : NULL;
}

const char *norma_object_family_label(const char *family)
{
    if (family == NULL) {
        return NULL;
    }
    for (size_t index = 0; index < norma_object_count(); index += 1) {
        const norma_object_spec *spec = norma_object_at(index);
        if (spec != NULL && strcmp(spec->family, family) == 0) {
            return spec->family_label;
        }
    }
    return NULL;
}

size_t norma_object_count_in(const char *family)
{
    if (family == NULL) {
        return 0;
    }
    size_t total = 0;
    for (size_t index = 0; index < norma_object_count(); index += 1) {
        const norma_object_spec *spec = norma_object_at(index);
        if (spec != NULL && strcmp(spec->family, family) == 0) {
            total += 1;
        }
    }
    return total;
}

const norma_object_spec *norma_object_at_in(const char *family, size_t index)
{
    if (family == NULL) {
        return NULL;
    }
    size_t seen = 0;
    for (size_t position = 0; position < norma_object_count(); position += 1) {
        const norma_object_spec *spec = norma_object_at(position);
        if (spec == NULL || strcmp(spec->family, family) != 0) {
            continue;
        }
        if (seen == index) {
            return spec;
        }
        seen += 1;
    }
    return NULL;
}
