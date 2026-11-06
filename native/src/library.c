/*
 * Normia nativo · biblioteca de señalización (espejo de `LibraryRepository`).
 *
 * Lee los catálogos locales completos —332 ISO 7010 y 63 señales propias de
 * orientación— y sirve para tres cosas: resolver el tipo del editor a su código,
 * insertar el pictograma en el SVG exportado y saber qué familia de color le
 * toca. El texto de los pictogramas se guarda tal cual viene del catálogo: aquí
 * no se reescribe ningún trazo.
 */
#include "normia/library.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/json.h"

/* Comparaciones sin distinguir mayúsculas, en C11 puro: `strcasecmp` no forma
   parte de la biblioteca estándar y aquí se compila con -Wpedantic. */
static int ci_prefix(const char *text, const char *prefix, size_t length)
{
    for (size_t index = 0; index < length; index += 1) {
        if (tolower((unsigned char) text[index]) != tolower((unsigned char) prefix[index])) {
            return 0;
        }
    }
    return 1;
}

static int ci_equals(const char *a, const char *b)
{
    const size_t length = strlen(b);
    return strlen(a) == length && ci_prefix(a, b, length);
}

typedef struct {
    const char *category;
    const char *color;
} norma_sign_color;

/** La misma tabla de `LibraryRepository::SIGN_COLORS`. */
static const norma_sign_color kColors[] = {
    {"emergency", "#237f52"},
    {"fire", "#b71f2e"},
    {"mandatory", "#005387"},
    {"prohibition", "#b71f2e"},
    {"warning", "#f9a800"},
    {"services", "#0f766e"},
    {"location", "#1d4ed8"},
    {"traffic", "#b45309"},
    {"brigade", "#b91c1c"},
};

const char *norma_library_color_for(const char *category)
{
    if (category != NULL) {
        for (size_t index = 0; index < sizeof(kColors) / sizeof(kColors[0]); index += 1) {
            if (strcmp(category, kColors[index].category) == 0) {
                return kColors[index].color;
            }
        }
    }
    return "#334155";
}

static void set_text(char *target, size_t size, const char *value)
{
    snprintf(target, size, "%s", value != NULL ? value : "");
}

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

static norma_sign *reserve(norma_library *library)
{
    if (library->count == library->capacity) {
        const size_t capacity = library->capacity == 0 ? 128 : library->capacity * 2;
        norma_sign *grown = (norma_sign *) realloc(library->items, capacity * sizeof(norma_sign));
        if (grown == NULL) {
            return NULL;
        }
        library->items = grown;
        library->capacity = capacity;
    }
    return &library->items[library->count];
}

/**
 * Añade las señales de un catálogo. `expected_prefix` es `""` para ISO y
 * `SVC_` para las de orientación: se usa para rechazar un archivo cambiado.
 */
static int load_catalog(const char *path, norma_library *library,
                        char *error, size_t error_size)
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
        snprintf(error, error_size, "El catálogo «%s» no es JSON válido: %s", path, parse_error);
        return 0;
    }
    const norma_json *signs = norma_json_get(root, "signs");
    const size_t total = norma_json_size(signs);
    if (total == 0) {
        norma_json_free(root);
        snprintf(error, error_size, "El catálogo «%s» no tiene señales.", path);
        return 0;
    }
    for (size_t index = 0; index < total; index += 1) {
        const char *code = norma_json_key_at(signs, index);
        const norma_json *sign = norma_json_get(signs, code != NULL ? code : "");
        if (code == NULL || sign == NULL) {
            continue;
        }
        const char *svg = norma_json_string(norma_json_get(sign, "svg"));
        if (svg == NULL || !norma_library_safe_svg(svg)) {
            norma_json_free(root);
            snprintf(error, error_size, "El pictograma «%s» no supera la validación de seguridad.", code);
            return 0;
        }
        norma_sign *target = reserve(library);
        if (target == NULL) {
            norma_json_free(root);
            snprintf(error, error_size, "No hay memoria para el catálogo de señalización.");
            return 0;
        }
        memset(target, 0, sizeof(*target));
        set_text(target->code, sizeof(target->code), code);
        set_text(target->name, sizeof(target->name), norma_json_string_at(sign, "name", code));
        set_text(target->category, sizeof(target->category),
                 norma_json_string_at(sign, "category", "services"));
        set_text(target->color, sizeof(target->color),
                 norma_library_color_for(target->category));
        const size_t svg_length = strlen(svg);
        target->svg = (char *) malloc(svg_length + 1);
        if (target->svg == NULL) {
            norma_json_free(root);
            snprintf(error, error_size, "No hay memoria para el pictograma «%s».", code);
            return 0;
        }
        memcpy(target->svg, svg, svg_length + 1);
        library->count += 1;
    }
    norma_json_free(root);
    return 1;
}

int norma_library_load(const char *directory, norma_library *library, char *error, size_t error_size)
{
    if (library == NULL || error == NULL || error_size == 0) {
        return 0;
    }
    memset(library, 0, sizeof(*library));
    const char *folder = directory != NULL && directory[0] != '\0' ? directory : "resources";
    set_text(library->source, sizeof(library->source), folder);

    char path[512];
    snprintf(path, sizeof(path), "%s/iso7010-catalog.json", folder);
    if (!load_catalog(path, library, error, error_size)) {
        norma_library_free(library);
        return 0;
    }
    snprintf(path, sizeof(path), "%s/service-signs.json", folder);
    if (!load_catalog(path, library, error, error_size)) {
        norma_library_free(library);
        return 0;
    }
    return 1;
}

void norma_library_free(norma_library *library)
{
    if (library == NULL) {
        return;
    }
    for (size_t index = 0; index < library->count; index += 1) {
        free(library->items[index].svg);
    }
    free(library->items);
    library->items = NULL;
    library->count = 0;
    library->capacity = 0;
}

const norma_sign *norma_library_sign(const norma_library *library, const char *code)
{
    if (library == NULL || code == NULL) {
        return NULL;
    }
    for (size_t index = 0; index < library->count; index += 1) {
        if (strcmp(library->items[index].code, code) == 0) {
            return &library->items[index];
        }
    }
    return NULL;
}

/* --------------------------- tipos y códigos ----------------------------- */

/** Nombre válido de una señal: empieza por letra y sigue con [a-z0-9_]. */
static int valid_suffix(const char *text, size_t min_length, size_t max_length)
{
    const size_t length = strlen(text);
    if (length < min_length || length > max_length || !isalpha((unsigned char) text[0])) {
        return 0;
    }
    for (size_t index = 1; index < length; index += 1) {
        if (!isalnum((unsigned char) text[index]) && text[index] != '_') {
            return 0;
        }
    }
    return 1;
}

static size_t copy_upper(char *out, size_t out_size, const char *text, size_t length)
{
    if (out_size == 0) {
        return 0;
    }
    size_t written = 0;
    for (size_t index = 0; index < length && written + 1 < out_size; index += 1) {
        out[written] = (char) toupper((unsigned char) text[index]);
        written += 1;
    }
    out[written] = '\0';
    return written;
}

const char *norma_library_code_for_type(const norma_library *library, const char *type,
                                        char *out, size_t out_size)
{
    if (library == NULL || type == NULL || out == NULL || out_size == 0) {
        return NULL;
    }
    const size_t length = strlen(type);
    if (length < 6 || length > 62) {
        return NULL;
    }
    if (ci_prefix(type, "iso_", 4)) {
        const char *rest = type + 4;
        const size_t rest_length = strlen(rest);
        if (rest_length != 4) {
            return NULL;
        }
        const char letter = (char) toupper((unsigned char) rest[0]);
        if (letter != 'E' && letter != 'F' && letter != 'M' && letter != 'P' && letter != 'W') {
            return NULL;
        }
        for (size_t index = 1; index < 4; index += 1) {
            if (!isdigit((unsigned char) rest[index])) {
                return NULL;
            }
        }
        copy_upper(out, out_size, rest, rest_length);
        return norma_library_sign(library, out) != NULL ? out : NULL;
    }
    if (ci_prefix(type, "sig_", 4)) {
        const char *rest = type + 4;
        if (!valid_suffix(rest, 2, 41)) {
            return NULL;
        }
        const size_t written = copy_upper(out, out_size, rest, strlen(rest));
        if (written + 4 >= out_size) {
            return NULL;
        }
        memmove(out + 4, out, written + 1);
        memcpy(out, "SVC_", 4);
        return norma_library_sign(library, out) != NULL ? out : NULL;
    }
    if (ci_prefix(type, "plg_", 4)) {
        const char *rest = type + 4;
        if (!valid_suffix(rest, 2, 59)) {
            return NULL;
        }
        const size_t written = copy_upper(out, out_size, rest, strlen(rest));
        if (written + 4 >= out_size) {
            return NULL;
        }
        memmove(out + 4, out, written + 1);
        memcpy(out, "PLG_", 4);
        return norma_library_sign(library, out) != NULL ? out : NULL;
    }
    return NULL;
}

const char *norma_library_type_for_code(const char *code, char *out, size_t out_size)
{
    if (code == NULL || out == NULL || out_size == 0) {
        return NULL;
    }
    if (strncmp(code, "PLG_", 4) == 0) {
        snprintf(out, out_size, "plg_");
    } else if (strncmp(code, "SVC_", 4) == 0) {
        snprintf(out, out_size, "sig_");
    } else {
        snprintf(out, out_size, "iso_");
    }
    size_t position = strlen(out);
    const size_t offset = strchr(code, '_') != NULL ? 4 : 0;
    for (size_t index = offset; code[index] != '\0' && position + 1 < out_size; index += 1) {
        out[position] = (char) tolower((unsigned char) code[index]);
        position += 1;
    }
    out[position] = '\0';
    return out;
}

/* ---------------------------- validación del SVG --------------------------- */

/** Busca `needle` sin distinguir mayúsculas. */
static int contains_ci(const char *text, const char *needle)
{
    const size_t length = strlen(needle);
    if (length == 0) {
        return 1;
    }
    for (const char *cursor = text; *cursor != '\0'; cursor += 1) {
        if (ci_prefix(cursor, needle, length)) {
            return 1;
        }
    }
    return 0;
}

int norma_library_safe_svg(const char *svg)
{
    if (svg == NULL) {
        return 0;
    }
    const size_t length = strlen(svg);
    if (length < 40 || length > 400000) {
        return 0;
    }
    const char *cursor = svg;
    while (*cursor == ' ' || *cursor == '\t' || *cursor == '\n' || *cursor == '\r') {
        cursor += 1;
    }
    if (!ci_prefix(cursor, "<svg", 4)) {
        return 0;
    }
    /* Lo que no puede aparecer nunca en un pictograma local. */
    static const char *const forbidden[] = {
        "<script", "<foreignobject", "<iframe", "<object", "<embed", "<audio", "<video",
        "<image", "<style", "<!entity", "<!doctype", "<?xml-stylesheet",
        "javascript:", "vbscript:", "data:",
    };
    for (size_t index = 0; index < sizeof(forbidden) / sizeof(forbidden[0]); index += 1) {
        if (contains_ci(svg, forbidden[index])) {
            return 0;
        }
    }
    /* Manejadores de eventos (`on…=`) y referencias externas. */
    for (const char *scan = svg; *scan != '\0'; scan += 1) {
        if (!isalpha((unsigned char) *scan)) {
            continue;
        }
        const int at_start = scan == svg || !isalnum((unsigned char) scan[-1]);
        if (!at_start) {
            continue;
        }
        if (ci_prefix(scan, "on", 2) && isalpha((unsigned char) scan[2])) {
            const char *equals = strchr(scan, '=');
            const char *space = strpbrk(scan, " \t\r\n/>");
            if (equals != NULL && (space == NULL || equals < space)) {
                return 0;
            }
        }
        /* `url(…)` solo vale si apunta a un degradado o patrón local. */
        if (ci_prefix(scan, "url", 3)) {
            const char *value = scan + 3;
            while (*value == ' ' || *value == '\t') {
                value += 1;
            }
            if (*value == '(') {
                value += 1;
                while (*value == ' ' || *value == '\t' || *value == '\'' || *value == '"') {
                    value += 1;
                }
                if (*value != '#') {
                    return 0;
                }
            }
        }
        /* Un `href` solo se acepta si apunta dentro del propio documento. */
        if (ci_prefix(scan, "href", 4)) {
            const char *value = scan + 4;
            if (*value == '=') {
                value += 1;
                while (*value == ' ' || *value == '\t' || *value == '\'' || *value == '"') {
                    value += 1;
                }
                if (*value != '#') {
                    return 0;
                }
            }
        }
    }
    return 1;
}

/* --------------------------- inserción en el SVG --------------------------- */

/** Extrae el valor de un atributo de la etiqueta raíz `<svg …>`. */
static int root_attribute(const char *svg, const char *name, char *out, size_t out_size)
{
    const char *root = strchr(svg, '>');
    if (root == NULL) {
        return 0;
    }
    const size_t name_length = strlen(name);
    const char *cursor = svg;
    while (cursor < root) {
        if (ci_prefix(cursor, name, name_length) && cursor[name_length] == '=') {
            const char *value = cursor + name_length + 1;
            const char quote = *value;
            if (quote != '"' && quote != '\'') {
                return 0;
            }
            value += 1;
            const char *end = strchr(value, quote);
            if (end == NULL || end > root) {
                return 0;
            }
            const size_t length = (size_t) (end - value);
            snprintf(out, out_size, "%.*s", (int) length, value);
            return 1;
        }
        cursor += 1;
    }
    return 0;
}

/** Escribe un atributo de presentación con sus comillas, escapando lo mínimo. */
static void copy_presentation(norma_buffer *out, const char *name, const char *value)
{
    norma_buffer_raw(out, " ");
    norma_buffer_raw(out, name);
    norma_buffer_raw(out, "=\"");
    for (const char *cursor = value; *cursor != '\0'; cursor += 1) {
        switch (*cursor) {
        case '&':
            norma_buffer_raw(out, "&amp;");
            break;
        case '<':
            norma_buffer_raw(out, "&lt;");
            break;
        case '>':
            norma_buffer_raw(out, "&gt;");
            break;
        case '"':
            norma_buffer_raw(out, "&quot;");
            break;
        case '\'':
            norma_buffer_raw(out, "&#039;");
            break;
        default: {
            char letter[2] = {*cursor, '\0'};
            norma_buffer_raw(out, letter);
            break;
        }
        }
    }
    norma_buffer_raw(out, "\"");
}

static int is_presentation(const char *name)
{
    static const char *const names[] = {
        "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
        "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "opacity",
    };
    for (size_t index = 0; index < sizeof(names) / sizeof(names[0]); index += 1) {
        if (ci_equals(name, names[index])) {
            return 1;
        }
    }
    return 0;
}

/**
 * Número SVG igual que `SvgAsset::num`: dos decimales, sin ceros sobrantes y
 * sin notación científica. `-0` se escribe `0`.
 */
void norma_library_number(double value, char *out, size_t size)
{
    char raw[64];
    snprintf(raw, sizeof(raw), "%.2f", value);
    char *dot = strchr(raw, '.');
    if (dot != NULL) {
        char *end = raw + strlen(raw) - 1;
        while (end > dot && *end == '0') {
            *end = '\0';
            end -= 1;
        }
        if (end == dot) {
            *end = '\0';
        }
    }
    if (strcmp(raw, "-0") == 0 || raw[0] == '\0') {
        snprintf(out, size, "0");
        return;
    }
    snprintf(out, size, "%s", raw);
}

int norma_library_nested_svg(const norma_sign *sign, double x, double y, double w, double h,
                             const char *color, norma_buffer *out)
{
    if (sign == NULL || sign->svg == NULL || out == NULL) {
        return 0;
    }
    if (!norma_library_safe_svg(sign->svg)) {
        return 0;
    }
    /* viewBox del pictograma; si no lo declara, se asume 100 × 100. */
    char view_box[64] = "0 0 100 100";
    root_attribute(sign->svg, "viewBox", view_box, sizeof(view_box));

    /* Contenido interior, sin la etiqueta `<svg>` que lo envuelve. */
    const char *open = strchr(sign->svg, '>');
    if (open == NULL) {
        return 0;
    }
    const char *close = strstr(open, "</svg>");
    if (close == NULL) {
        return 0;
    }
    const char *inner = open + 1;
    const size_t inner_length = (size_t) (close - inner);

    char text[64];
    norma_buffer_raw(out, "<svg x=\"");
    norma_library_number(x, text, sizeof(text));
    norma_buffer_raw(out, text);
    norma_buffer_raw(out, "\" y=\"");
    norma_library_number(y, text, sizeof(text));
    norma_buffer_raw(out, text);
    norma_buffer_raw(out, "\" width=\"");
    norma_library_number(w, text, sizeof(text));
    norma_buffer_raw(out, text);
    norma_buffer_raw(out, "\" height=\"");
    norma_library_number(h, text, sizeof(text));
    norma_buffer_raw(out, text);
    norma_buffer_raw(out, "\" viewBox=\"");
    norma_buffer_raw(out, view_box);
    norma_buffer_raw(out, "\" preserveAspectRatio=\"xMidYMid meet\" color=\"");
    norma_buffer_raw(out, color != NULL ? color : "#334155");
    norma_buffer_raw(out, "\"");

    /* Los atributos de presentación de la etiqueta raíz se heredan: sin ellos
       el pictograma se exporta sin relleno. */
    const char *root = sign->svg;
    while (root < open) {
        if (isalpha((unsigned char) *root)
            && (root == sign->svg || !isalnum((unsigned char) root[-1]))) {
            char name[48];
            size_t length = 0;
            const char *cursor = root;
            while (cursor < open && (isalnum((unsigned char) *cursor) || *cursor == '-')
                   && length + 1 < sizeof(name)) {
                name[length] = *cursor;
                length += 1;
                cursor += 1;
            }
            name[length] = '\0';
            if (length > 0 && cursor < open && *cursor == '=' && is_presentation(name)) {
                char value[256];
                if (root_attribute(sign->svg, name, value, sizeof(value))) {
                    copy_presentation(out, name, value);
                }
            }
            root = cursor;
            continue;
        }
        root += 1;
    }
    norma_buffer_raw(out, ">");
    if (inner_length > 0) {
        norma_buffer_raw_n(out, inner, inner_length);
    }
    norma_buffer_raw(out, "</svg>\n");
    return 1;
}
