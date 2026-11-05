/*
 * Normia nativo · lector de JSON.
 *
 * Sin dependencias: un lector recursivo con memoria propia. Está pensado para
 * archivos de plano (cientos de kilobytes como mucho) y no para flujos
 * gigantes, así que guarda el árbol completo en memoria.
 */
#include "normia/json.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const char *start;
    const char *cursor;
    const char *end;
    char *error;
    size_t error_size;
    int failed;
} parser;

static void fail(parser *p, const char *message)
{
    if (p->failed) {
        return;
    }
    p->failed = 1;
    if (p->error != NULL && p->error_size > 0) {
        snprintf(p->error, p->error_size, "%s", message);
    }
}

static norma_json *node_new(norma_json_type type)
{
    norma_json *node = (norma_json *) calloc(1, sizeof(norma_json));
    if (node != NULL) {
        node->type = type;
    }
    return node;
}

static void skip_whitespace(parser *p)
{
    while (p->cursor < p->end) {
        const char c = *p->cursor;
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            p->cursor += 1;
        } else {
            break;
        }
    }
}

static int reserve_child(norma_json *node)
{
    if (node->length < node->capacity) {
        return 1;
    }
    const size_t capacity = node->capacity == 0 ? 8 : node->capacity * 2;
    norma_json **items = (norma_json **) realloc(node->items, capacity * sizeof(norma_json *));
    if (items == NULL) {
        return 0;
    }
    node->items = items;
    if (node->type == NORMA_JSON_OBJECT) {
        char **keys = (char **) realloc(node->keys, capacity * sizeof(char *));
        if (keys == NULL) {
            return 0;
        }
        node->keys = keys;
    }
    node->capacity = capacity;
    return 1;
}

static void encode_utf8(unsigned int code, char *out, size_t *written)
{
    if (code <= 0x7F) {
        out[(*written)++] = (char) code;
    } else if (code <= 0x7FF) {
        out[(*written)++] = (char) (0xC0 | (code >> 6));
        out[(*written)++] = (char) (0x80 | (code & 0x3F));
    } else if (code <= 0xFFFF) {
        out[(*written)++] = (char) (0xE0 | (code >> 12));
        out[(*written)++] = (char) (0x80 | ((code >> 6) & 0x3F));
        out[(*written)++] = (char) (0x80 | (code & 0x3F));
    } else {
        out[(*written)++] = (char) (0xF0 | (code >> 18));
        out[(*written)++] = (char) (0x80 | ((code >> 12) & 0x3F));
        out[(*written)++] = (char) (0x80 | ((code >> 6) & 0x3F));
        out[(*written)++] = (char) (0x80 | (code & 0x3F));
    }
}

static int hex4(parser *p, unsigned int *value)
{
    if (p->end - p->cursor < 4) {
        fail(p, "cadena con escape \\u incompleto");
        return 0;
    }
    unsigned int result = 0;
    for (int index = 0; index < 4; index += 1) {
        const char c = p->cursor[index];
        unsigned int digit;
        if (c >= '0' && c <= '9') {
            digit = (unsigned int) (c - '0');
        } else if (c >= 'a' && c <= 'f') {
            digit = (unsigned int) (c - 'a' + 10);
        } else if (c >= 'A' && c <= 'F') {
            digit = (unsigned int) (c - 'A' + 10);
        } else {
            fail(p, "cadena con escape \\u no hexadecimal");
            return 0;
        }
        result = result * 16 + digit;
    }
    p->cursor += 4;
    *value = result;
    return 1;
}

/* Devuelve la cadena ya desescapada; mueve el cursor tras la comilla final. */
static char *parse_string_raw(parser *p)
{
    if (p->cursor >= p->end || *p->cursor != '"') {
        fail(p, "se esperaba una cadena");
        return NULL;
    }
    p->cursor += 1;
    const size_t limit = (size_t) (p->end - p->cursor);
    char *out = (char *) malloc(limit + 1);
    if (out == NULL) {
        fail(p, "sin memoria");
        return NULL;
    }
    size_t written = 0;
    while (p->cursor < p->end) {
        const unsigned char c = (unsigned char) *p->cursor;
        if (c == '"') {
            p->cursor += 1;
            out[written] = '\0';
            return out;
        }
        if (c != '\\') {
            out[written++] = (char) c;
            p->cursor += 1;
            continue;
        }
        p->cursor += 1;
        if (p->cursor >= p->end) {
            break;
        }
        const char escape = *p->cursor;
        p->cursor += 1;
        switch (escape) {
        case '"': out[written++] = '"'; break;
        case '\\': out[written++] = '\\'; break;
        case '/': out[written++] = '/'; break;
        case 'b': out[written++] = '\b'; break;
        case 'f': out[written++] = '\f'; break;
        case 'n': out[written++] = '\n'; break;
        case 'r': out[written++] = '\r'; break;
        case 't': out[written++] = '\t'; break;
        case 'u': {
            unsigned int code = 0;
            if (!hex4(p, &code)) {
                free(out);
                return NULL;
            }
            if (code >= 0xD800 && code <= 0xDBFF && p->end - p->cursor >= 6
                && p->cursor[0] == '\\' && p->cursor[1] == 'u') {
                p->cursor += 2;
                unsigned int low = 0;
                if (!hex4(p, &low)) {
                    free(out);
                    return NULL;
                }
                if (low >= 0xDC00 && low <= 0xDFFF) {
                    code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                }
            }
            encode_utf8(code, out, &written);
            break;
        }
        default:
            free(out);
            fail(p, "escape desconocido en una cadena");
            return NULL;
        }
    }
    free(out);
    fail(p, "cadena sin cerrar");
    return NULL;
}

static norma_json *parse_value(parser *p, int depth);

static norma_json *parse_container(parser *p, int depth, int is_object)
{
    norma_json *node = node_new(is_object ? NORMA_JSON_OBJECT : NORMA_JSON_ARRAY);
    if (node == NULL) {
        fail(p, "sin memoria");
        return NULL;
    }
    p->cursor += 1; /* { o [ */
    skip_whitespace(p);
    const char closing = is_object ? '}' : ']';
    if (p->cursor < p->end && *p->cursor == closing) {
        p->cursor += 1;
        return node;
    }
    for (;;) {
        char *key = NULL;
        if (is_object) {
            skip_whitespace(p);
            key = parse_string_raw(p);
            if (key == NULL) {
                norma_json_free(node);
                return NULL;
            }
            skip_whitespace(p);
            if (p->cursor >= p->end || *p->cursor != ':') {
                free(key);
                norma_json_free(node);
                fail(p, "falta «:» después de una clave");
                return NULL;
            }
            p->cursor += 1;
        }
        norma_json *child = parse_value(p, depth + 1);
        if (child == NULL) {
            free(key);
            norma_json_free(node);
            return NULL;
        }
        if (!reserve_child(node)) {
            free(key);
            norma_json_free(child);
            norma_json_free(node);
            fail(p, "sin memoria");
            return NULL;
        }
        if (is_object) {
            node->keys[node->length] = key;
        }
        node->items[node->length] = child;
        node->length += 1;
        skip_whitespace(p);
        if (p->cursor < p->end && *p->cursor == ',') {
            p->cursor += 1;
            skip_whitespace(p);
            continue;
        }
        if (p->cursor < p->end && *p->cursor == closing) {
            p->cursor += 1;
            return node;
        }
        norma_json_free(node);
        fail(p, is_object ? "objeto sin cerrar" : "arreglo sin cerrar");
        return NULL;
    }
}

static norma_json *parse_value(parser *p, int depth)
{
    if (depth > 200) {
        fail(p, "el documento está anidado demasiado");
        return NULL;
    }
    skip_whitespace(p);
    if (p->cursor >= p->end) {
        fail(p, "el documento termina antes de tiempo");
        return NULL;
    }
    const char c = *p->cursor;
    if (c == '{') {
        return parse_container(p, depth, 1);
    }
    if (c == '[') {
        return parse_container(p, depth, 0);
    }
    if (c == '"') {
        char *text = parse_string_raw(p);
        if (text == NULL) {
            return NULL;
        }
        norma_json *node = node_new(NORMA_JSON_STRING);
        if (node == NULL) {
            free(text);
            fail(p, "sin memoria");
            return NULL;
        }
        node->string = text;
        node->length = strlen(text);
        return node;
    }
    if (c == 't' && p->end - p->cursor >= 4 && memcmp(p->cursor, "true", 4) == 0) {
        p->cursor += 4;
        norma_json *node = node_new(NORMA_JSON_BOOL);
        if (node != NULL) {
            node->boolean = 1;
        }
        return node;
    }
    if (c == 'f' && p->end - p->cursor >= 5 && memcmp(p->cursor, "false", 5) == 0) {
        p->cursor += 5;
        return node_new(NORMA_JSON_BOOL);
    }
    if (c == 'n' && p->end - p->cursor >= 4 && memcmp(p->cursor, "null", 4) == 0) {
        p->cursor += 4;
        return node_new(NORMA_JSON_NULL);
    }
    {
        const char *begin = p->cursor;
        if (*p->cursor == '-' || *p->cursor == '+') {
            p->cursor += 1;
        }
        while (p->cursor < p->end) {
            const char d = *p->cursor;
            if ((d >= '0' && d <= '9') || d == '.' || d == 'e' || d == 'E' || d == '+' || d == '-') {
                p->cursor += 1;
            } else {
                break;
            }
        }
        if (p->cursor == begin) {
            fail(p, "valor no reconocido");
            return NULL;
        }
        char buffer[64];
        const size_t size = (size_t) (p->cursor - begin);
        if (size >= sizeof(buffer)) {
            fail(p, "número demasiado largo");
            return NULL;
        }
        memcpy(buffer, begin, size);
        buffer[size] = '\0';
        char *end_pointer = NULL;
        const double value = strtod(buffer, &end_pointer);
        if (end_pointer == buffer) {
            fail(p, "número mal formado");
            return NULL;
        }
        norma_json *node = node_new(NORMA_JSON_NUMBER);
        if (node != NULL) {
            node->number = value;
        }
        return node;
    }
}

norma_json *norma_json_parse(const char *text, size_t length, char *error, size_t error_size)
{
    if (text == NULL) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "no hay texto");
        }
        return NULL;
    }
    parser p;
    p.start = text;
    p.cursor = text;
    p.end = text + length;
    p.error = error;
    p.error_size = error_size;
    p.failed = 0;
    if (error != NULL && error_size > 0) {
        error[0] = '\0';
    }
    norma_json *root = parse_value(&p, 0);
    if (root == NULL) {
        return NULL;
    }
    skip_whitespace(&p);
    if (p.cursor < p.end) {
        norma_json_free(root);
        fail(&p, "hay texto después del documento");
        return NULL;
    }
    return root;
}

norma_json *norma_json_parse_cstr(const char *text, char *error, size_t error_size)
{
    return norma_json_parse(text, text != NULL ? strlen(text) : 0, error, error_size);
}

void norma_json_free(norma_json *value)
{
    if (value == NULL) {
        return;
    }
    /* En las cadenas, `length` es el largo del texto y no una cantidad de
       hijos: solo los contenedores tienen algo que liberar por dentro. */
    if (value->type == NORMA_JSON_ARRAY || value->type == NORMA_JSON_OBJECT) {
        for (size_t index = 0; index < value->length; index += 1) {
            norma_json_free(value->items[index]);
            if (value->keys != NULL) {
                free(value->keys[index]);
            }
        }
    }
    free(value->items);
    free(value->keys);
    free(value->string);
    free(value);
}

const norma_json *norma_json_get(const norma_json *object, const char *key)
{
    if (object == NULL || object->type != NORMA_JSON_OBJECT || key == NULL) {
        return NULL;
    }
    for (size_t index = 0; index < object->length; index += 1) {
        if (object->keys[index] != NULL && strcmp(object->keys[index], key) == 0) {
            return object->items[index];
        }
    }
    return NULL;
}

const norma_json *norma_json_at(const norma_json *array, size_t index)
{
    if (array == NULL || array->type != NORMA_JSON_ARRAY || index >= array->length) {
        return NULL;
    }
    return array->items[index];
}

const char *norma_json_key_at(const norma_json *object, size_t index)
{
    if (object == NULL || object->type != NORMA_JSON_OBJECT || index >= object->length) {
        return NULL;
    }
    return object->keys != NULL ? object->keys[index] : NULL;
}

size_t norma_json_size(const norma_json *value)
{
    if (value == NULL) {
        return 0;
    }
    return (value->type == NORMA_JSON_ARRAY || value->type == NORMA_JSON_OBJECT) ? value->length : 0;
}

double norma_json_number(const norma_json *value, double fallback)
{
    if (value == NULL) {
        return fallback;
    }
    if (value->type == NORMA_JSON_NUMBER) {
        return value->number;
    }
    if (value->type == NORMA_JSON_BOOL) {
        return value->boolean ? 1.0 : 0.0;
    }
    return fallback;
}

const char *norma_json_string(const norma_json *value)
{
    if (value == NULL || value->type != NORMA_JSON_STRING) {
        return NULL;
    }
    return value->string;
}

const char *norma_json_string_at(const norma_json *object, const char *key, const char *fallback)
{
    const char *text = norma_json_string(norma_json_get(object, key));
    return text != NULL ? text : fallback;
}

int norma_json_int_at(const norma_json *object, const char *key, int fallback)
{
    const norma_json *node = norma_json_get(object, key);
    if (node == NULL || node->type != NORMA_JSON_NUMBER) {
        return fallback;
    }
    return (int) lround(node->number);
}

int norma_json_bool_at(const norma_json *object, const char *key, int fallback)
{
    const norma_json *node = norma_json_get(object, key);
    if (node == NULL || node->type != NORMA_JSON_BOOL) {
        return fallback;
    }
    return node->boolean;
}
