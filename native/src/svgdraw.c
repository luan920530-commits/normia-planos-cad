/*
 * Normia nativo · intérprete del subconjunto de SVG de los pictogramas.
 *
 * El detalle de qué se admite y por qué está en `normia/svgdraw.h`. Aquí solo
 * hay dos reglas que conviene tener presentes al leer:
 *
 *   1. **Todo se aplana a curvas.** Rectángulos, círculos, elipses y arcos se
 *      convierten a Bézier cúbicas antes de salir del intérprete, así que quien
 *      dibuja no tiene que saber de transformaciones: recibe puntos ya en
 *      centímetros del plano. Un pictograma girado o escalado no deforma el
 *      grosor del trazo, que se escala con la raíz del determinante.
 *   2. **Nada es fatal.** Un pictograma con una capa que no se entiende se
 *      dibuja sin ella; un archivo roto devuelve 0 y la ventana cae en su
 *      dibujo de respaldo. Nunca se reserva memoria por nodo: el intérprete
 *      solo lee el texto del catálogo.
 */
#include "normia/svgdraw.h"

#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/** Anidamiento máximo: `use` dentro de `g` dentro de `defs` y poco más. */
#define NORMA_SVG_MAX_DEPTH 12
/** Presupuesto de operaciones por pictograma: corta un archivo patológico. */
#define NORMA_SVG_BUDGET 40000
/** Tope de una declaración de estilo leída. */
#define NORMA_SVG_VALUE 64

/* ------------------------------- matriz ---------------------------------- */

/** Matriz afín `a b c d e f`: (x, y) → (a·x + c·y + e, b·x + d·y + f). */
typedef struct {
    double a;
    double b;
    double c;
    double d;
    double e;
    double f;
} matrix;

/** La caja del `viewBox` se define al final y la consultan la raíz y los grupos. */
static matrix view_box_matrix(const char *view_box, double x, double y, double w, double h);
static int xml_view_box(const char *tag, size_t tag_length, char *out, size_t out_size);

static matrix matrix_identity(void)
{
    const matrix identity = {1.0, 0.0, 0.0, 1.0, 0.0, 0.0};
    return identity;
}

/** `first` aplicada después de `second` (first ∘ second). */
static matrix matrix_multiply(matrix first, matrix second)
{
    matrix out;
    out.a = first.a * second.a + first.c * second.b;
    out.b = first.b * second.a + first.d * second.b;
    out.c = first.a * second.c + first.c * second.d;
    out.d = first.b * second.c + first.d * second.d;
    out.e = first.a * second.e + first.c * second.f + first.e;
    out.f = first.b * second.e + first.d * second.f + first.f;
    return out;
}

static void matrix_apply(matrix m, double x, double y, double *out_x, double *out_y)
{
    *out_x = m.a * x + m.c * y + m.e;
    *out_y = m.b * x + m.d * y + m.f;
}

/** Escala media de la matriz: sirve para el grosor del trazo. */
static double matrix_scale(matrix m)
{
    const double determinant = fabs(m.a * m.d - m.b * m.c);
    return determinant > 0.0 ? sqrt(determinant) : 1.0;
}

/* ------------------------------- estado ---------------------------------- */

/** Estado de presentación, heredable de grupo a hijo. */
typedef struct {
    char fill[NORMA_SVG_VALUE];
    double fill_alpha;
    int even_odd;
    char stroke[NORMA_SVG_VALUE];
    double stroke_alpha;
    double stroke_width;
    char dash[NORMA_SVG_VALUE];
    double dash_offset;
    /** Opacidad acumulada de los grupos: multiplica la del relleno y el trazo. */
    double opacity;
} style;

/** Estado inicial, el que pide SVG cuando no se declara nada. */
static style style_initial(void)
{
    style value;
    memset(&value, 0, sizeof(value));
    snprintf(value.fill, sizeof(value.fill), "#000000");
    value.fill_alpha = 1.0;
    value.stroke_alpha = 1.0;
    value.stroke_width = 1.0;
    value.opacity = 1.0;
    return value;
}

typedef struct {
    const char *doc;
    size_t length;
    const norma_svg_sink *sink;
    /** Color que reciben los `currentColor` del pictograma. */
    char current_colour[16];
    int budget;
    int drew;
    /** 1 mientras se dibuja un `clipPath`: el camino se usa como recorte. */
    int clipping;
    int clip_pushed;
} context;

/* --------------------------- lectura de texto ---------------------------- */

static int is_space(char c)
{
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f';
}

static int same_name(const char *text, size_t length, const char *name)
{
    const size_t wanted = strlen(name);
    if (length != wanted) {
        return 0;
    }
    for (size_t index = 0; index < length; index += 1) {
        if (tolower((unsigned char) text[index]) != tolower((unsigned char) name[index])) {
            return 0;
        }
    }
    return 1;
}

/** Lee un número de SVG: signo, decimales y exponente. Devuelve 0 si no hay. */
static int read_number(const char **cursor, double *value)
{
    const char *text = *cursor;
    while (is_space(*text) || *text == ',') {
        text += 1;
    }
    char *end = NULL;
    const double number = strtod(text, &end);
    if (end == text) {
        return 0;
    }
    *cursor = end;
    *value = number;
    return 1;
}

/** Bandera de un arco: un solo carácter 0 o 1, sin separadores de por medio. */
static int read_flag(const char **cursor, int *value)
{
    const char *text = *cursor;
    while (is_space(*text) || *text == ',') {
        text += 1;
    }
    if (*text != '0' && *text != '1') {
        return 0;
    }
    *value = *text == '1';
    *cursor = text + 1;
    return 1;
}

/**
 * Busca un atributo dentro de una etiqueta (`<…>`).
 *
 * Devuelve 1 y copia el valor si está; acepta comillas simples y dobles, y
 * nombres con espacio de nombres (`xlink:href`). El valor se devuelve tal cual
 * viene, sin desescapar entidades: los catálogos no las usan en atributos que
 * este intérprete mire.
 */
static int attribute(const char *tag, size_t tag_length, const char *name, char *out, size_t out_size)
{
    size_t index = 0;
    while (index < tag_length) {
        const size_t before = index;
        while (index < tag_length && (is_space(tag[index]) || tag[index] == '/' || tag[index] == '<')) {
            index += 1;
        }
        const size_t start = index;
        while (index < tag_length && (isalnum((unsigned char) tag[index]) || tag[index] == ':'
                                      || tag[index] == '-' || tag[index] == '_')) {
            index += 1;
        }
        const size_t name_length = index - start;
        while (index < tag_length && is_space(tag[index])) {
            index += 1;
        }
        if (index >= tag_length || tag[index] != '=') {
            /* Sin `=` no hay atributo: si además no se avanzó, se avanza a mano
               para no quedarse en el mismo carácter para siempre. */
            if (index == before) {
                index += 1;
            }
            continue;
        }
        index += 1;
        while (index < tag_length && is_space(tag[index])) {
            index += 1;
        }
        if (index >= tag_length) {
            return 0;
        }
        const char quote = tag[index] == '\'' ? '\'' : '"';
        index += 1;
        const size_t value_start = index;
        while (index < tag_length && tag[index] != quote) {
            index += 1;
        }
        const size_t value_length = index - value_start;
        if (index < tag_length) {
            index += 1;
        }
        if (name_length > 0 && same_name(tag + start, name_length, name) && out != NULL && out_size > 0) {
            const size_t copy = value_length < out_size - 1 ? value_length : out_size - 1;
            memcpy(out, tag + value_start, copy);
            out[copy] = '\0';
            return 1;
        }
    }
    return 0;
}

/** Fin de la etiqueta que empieza en `start`: posición del `>` (sin contar comillas). */
static size_t tag_end(const char *doc, size_t start, size_t length)
{
    char quote = '\0';
    for (size_t index = start; index < length; index += 1) {
        const char character = doc[index];
        if (quote != '\0') {
            if (character == quote) {
                quote = '\0';
            }
            continue;
        }
        if (character == '"' || character == '\'') {
            quote = character;
            continue;
        }
        if (character == '>') {
            return index;
        }
    }
    return length;
}

/* ------------------------------- colores --------------------------------- */

/** `#rgb` → `#rrggbb`; `none` → vacío; `currentColor` → color del elemento. */
static void normalize_colour(const char *value, const char *current, char *out, size_t out_size)
{
    out[0] = '\0';
    if (value == NULL || out_size < 8) {
        return;
    }
    while (is_space(*value)) {
        value += 1;
    }
    if (value[0] == '\0' || strcmp(value, "none") == 0 || strcmp(value, "transparent") == 0) {
        return;
    }
    if (strcmp(value, "currentColor") == 0 || strcmp(value, "currentcolor") == 0) {
        value = current != NULL && current[0] == '#' ? current : "#000000";
    }
    if (value[0] == '#') {
        const size_t digits = strlen(value);
        if (digits >= 7) {
            snprintf(out, out_size, "#%c%c%c%c%c%c", value[1], value[2], value[3],
                     value[4], value[5], value[6]);
            return;
        }
        if (digits >= 4) {
            snprintf(out, out_size, "#%c%c%c%c%c%c", value[1], value[1], value[2], value[2],
                     value[3], value[3]);
            return;
        }
        return;
    }
    /* Un color con nombre (no hay en los catálogos): negro, para no dejar el
       pictograma en blanco sobre blanco. */
    snprintf(out, out_size, "#000000");
}

/** Aplica una declaración de presentación (`clave: valor` o `clave="valor"`). */
static void apply_declaration(style *state, const char *key, const char *value)
{
    while (is_space(*key)) {
        key += 1;
    }
    while (is_space(*value)) {
        value += 1;
    }
    if (same_name(key, strlen(key), "fill")) {
        double alpha = state->fill_alpha;
        normalize_colour(value, NULL, state->fill, sizeof(state->fill));
        state->fill_alpha = alpha;
        return;
    }
    if (same_name(key, strlen(key), "stroke")) {
        normalize_colour(value, NULL, state->stroke, sizeof(state->stroke));
        return;
    }
    if (same_name(key, strlen(key), "stroke-width")) {
        const double width = atof(value);
        state->stroke_width = width > 0.0 ? width : 0.0;
        return;
    }
    if (same_name(key, strlen(key), "fill-opacity") || same_name(key, strlen(key), "stroke-opacity")) {
        const double alpha = atof(value);
        const double clamped = alpha < 0.0 ? 0.0 : (alpha > 1.0 ? 1.0 : alpha);
        if (key[0] == 'f' || key[0] == 'F') {
            state->fill_alpha = clamped;
        } else {
            state->stroke_alpha = clamped;
        }
        return;
    }
    if (same_name(key, strlen(key), "opacity")) {
        const double alpha = atof(value);
        state->opacity *= alpha < 0.0 ? 0.0 : (alpha > 1.0 ? 1.0 : alpha);
        return;
    }
    if (same_name(key, strlen(key), "fill-rule")) {
        state->even_odd = strstr(value, "evenodd") != NULL;
        return;
    }
    if (same_name(key, strlen(key), "stroke-dasharray")) {
        snprintf(state->dash, sizeof(state->dash), "%s", strcmp(value, "none") == 0 ? "" : value);
        return;
    }
    if (same_name(key, strlen(key), "stroke-dashoffset")) {
        state->dash_offset = atof(value);
    }
    /* El resto (color, línea, unión, recorte de trazo) no cambia el dibujo. */
}

/** Recorre `style="a:b;c:d"` y aplica cada declaración. */
static void apply_style_attribute(style *state, const char *text)
{
    char buffer[NORMA_SVG_VALUE * 2];
    snprintf(buffer, sizeof(buffer), "%s", text);
    char *cursor = buffer;
    while (*cursor != '\0') {
        char *end = strchr(cursor, ';');
        if (end != NULL) {
            *end = '\0';
        }
        char *colon = strchr(cursor, ':');
        if (colon != NULL) {
            *colon = '\0';
            apply_declaration(state, cursor, colon + 1);
        }
        if (end == NULL) {
            break;
        }
        cursor = end + 1;
    }
}

/** Lee los atributos de presentación de una etiqueta sobre el estado heredado. */
static void style_from_tag(const char *tag, size_t tag_length, style *state, const char *current)
{
    static const char *const names[] = {
        "fill", "stroke", "stroke-width", "fill-opacity", "stroke-opacity", "opacity",
        "fill-rule", "stroke-dasharray", "stroke-dashoffset",
    };
    char value[NORMA_SVG_VALUE * 2];
    /* El orden importa: `style` es una lista de declaraciones, y los atributos
       sueltos que vengan después la sobrescriben, como en CSS. */
    if (attribute(tag, tag_length, "style", value, sizeof(value))) {
        apply_style_attribute(state, value);
    }
    for (size_t index = 0; index < sizeof(names) / sizeof(names[0]); index += 1) {
        if (attribute(tag, tag_length, names[index], value, sizeof(value))) {
            if (strcmp(names[index], "fill") == 0 || strcmp(names[index], "stroke") == 0) {
                char colour[16];
                normalize_colour(value, current, colour, sizeof(colour));
                if (strcmp(names[index], "fill") == 0) {
                    snprintf(state->fill, sizeof(state->fill), "%s", colour);
                } else {
                    snprintf(state->stroke, sizeof(state->stroke), "%s", colour);
                }
            } else {
                apply_declaration(state, names[index], value);
            }
        }
    }
}

/* ----------------------------- transformaciones -------------------------- */

/** Concatena una lista `translate(…) rotate(…)` sobre la matriz del grupo. */
static matrix parse_transform(const char *text, matrix base)
{
    const char *cursor = text;
    while (*cursor != '\0') {
        while (is_space(*cursor) || *cursor == ',') {
            cursor += 1;
        }
        if (*cursor == '\0') {
            break;
        }
        const char *name_start = cursor;
        while (isalnum((unsigned char) *cursor)) {
            cursor += 1;
        }
        const size_t name_length = (size_t) (cursor - name_start);
        while (is_space(*cursor)) {
            cursor += 1;
        }
        if (*cursor != '(') {
            /* Sin paréntesis no hay transformación que leer. */
            break;
        }
        cursor += 1;
        double numbers[6] = {0.0, 0.0, 0.0, 0.0, 0.0, 0.0};
        size_t count = 0;
        while (*cursor != ')' && *cursor != '\0' && count < 6) {
            double number = 0.0;
            if (!read_number(&cursor, &number)) {
                break;
            }
            numbers[count] = number;
            count += 1;
            while (is_space(*cursor) || *cursor == ',') {
                cursor += 1;
            }
        }
        while (*cursor != ')' && *cursor != '\0') {
            cursor += 1;
        }
        if (*cursor == ')') {
            cursor += 1;
        }

        matrix step = matrix_identity();
        if (same_name(name_start, name_length, "matrix") && count == 6) {
            step.a = numbers[0];
            step.b = numbers[1];
            step.c = numbers[2];
            step.d = numbers[3];
            step.e = numbers[4];
            step.f = numbers[5];
        } else if (same_name(name_start, name_length, "translate") && count >= 1) {
            step.e = numbers[0];
            step.f = count >= 2 ? numbers[1] : 0.0;
        } else if (same_name(name_start, name_length, "scale") && count >= 1) {
            step.a = numbers[0];
            step.d = count >= 2 ? numbers[1] : numbers[0];
        } else if (same_name(name_start, name_length, "rotate") && count >= 1) {
            const double radians = numbers[0] * M_PI / 180.0;
            const double cosine = cos(radians);
            const double sine = sin(radians);
            matrix rotation;
            rotation.a = cosine;
            rotation.b = sine;
            rotation.c = -sine;
            rotation.d = cosine;
            rotation.e = 0.0;
            rotation.f = 0.0;
            if (count >= 3) {
                matrix to_origin = matrix_identity();
                matrix back = matrix_identity();
                to_origin.e = -numbers[1];
                to_origin.f = -numbers[2];
                back.e = numbers[1];
                back.f = numbers[2];
                step = matrix_multiply(back, matrix_multiply(rotation, to_origin));
            } else {
                step = rotation;
            }
        } else if (same_name(name_start, name_length, "skewX") && count >= 1) {
            step.c = tan(numbers[0] * M_PI / 180.0);
        } else if (same_name(name_start, name_length, "skewY") && count >= 1) {
            step.b = tan(numbers[0] * M_PI / 180.0);
        }
        base = matrix_multiply(base, step);
    }
    return base;
}

/* ------------------------------ el destino ------------------------------- */

static void emit_move(context *ctx, matrix m, double x, double y)
{
    double px = 0.0;
    double py = 0.0;
    matrix_apply(m, x, y, &px, &py);
    if (ctx->budget > 0 && ctx->sink->move_to != NULL) {
        ctx->sink->move_to(ctx->sink->user, px, py);
        ctx->budget -= 1;
    }
}

static void emit_line(context *ctx, matrix m, double x, double y)
{
    double px = 0.0;
    double py = 0.0;
    matrix_apply(m, x, y, &px, &py);
    if (ctx->budget > 0 && ctx->sink->line_to != NULL) {
        ctx->sink->line_to(ctx->sink->user, px, py);
        ctx->budget -= 1;
    }
}

static void emit_curve(context *ctx, matrix m, double x1, double y1, double x2, double y2, double x3,
                       double y3)
{
    double cx1 = 0.0;
    double cy1 = 0.0;
    double cx2 = 0.0;
    double cy2 = 0.0;
    double px = 0.0;
    double py = 0.0;
    matrix_apply(m, x1, y1, &cx1, &cy1);
    matrix_apply(m, x2, y2, &cx2, &cy2);
    matrix_apply(m, x3, y3, &px, &py);
    if (ctx->budget > 0 && ctx->sink->curve_to != NULL) {
        ctx->sink->curve_to(ctx->sink->user, cx1, cy1, cx2, cy2, px, py);
        ctx->budget -= 2;
    }
}

static void emit_close(context *ctx)
{
    if (ctx->budget > 0 && ctx->sink->close != NULL) {
        ctx->sink->close(ctx->sink->user);
        ctx->budget -= 1;
    }
}

/** Pinta el camino acumulado con el estado dado. En modo recorte, lo recorta. */
static void emit_paint(context *ctx, const style *state, matrix m)
{
    if (ctx->sink == NULL || ctx->sink->paint == NULL) {
        return;
    }
    if (ctx->clipping) {
        /* El recorte se acumula: un `clipPath` puede traer varias formas y todas
           recortan a la vez. Se empuja una sola vez, al terminar el bloque. */
        ctx->clip_pushed = 1;
        return;
    }
    norma_svg_paint paint;
    memset(&paint, 0, sizeof(paint));
    paint.fill = state->fill[0] != '\0' ? state->fill : NULL;
    paint.fill_alpha = state->fill_alpha * state->opacity;
    paint.even_odd = state->even_odd;
    paint.stroke = state->stroke[0] != '\0' ? state->stroke : NULL;
    paint.stroke_alpha = state->stroke_alpha * state->opacity;
    paint.stroke_width = state->stroke_width * matrix_scale(m);
    paint.dash = state->dash[0] != '\0' ? state->dash : NULL;
    paint.dash_offset = state->dash_offset;
    /* Sin relleno ni trazo (un `fill:none` con `stroke:none`) se avisa igual:
       el destino tiene que vaciar el camino, o la figura se pegaría a la
       siguiente y el pictograma saldría con manchas de más. */
    ctx->sink->paint(ctx->sink->user, &paint);
    if (paint.fill == NULL && paint.stroke == NULL) {
        return;
    }
    ctx->drew = 1;
    ctx->budget -= 1;
}

/* -------------------------------- formas --------------------------------- */

static void shape_rect(context *ctx, const char *tag, size_t tag_length, matrix m, const style *state)
{
    char value[NORMA_SVG_VALUE];
    const double x = attribute(tag, tag_length, "x", value, sizeof(value)) ? atof(value) : 0.0;
    const double y = attribute(tag, tag_length, "y", value, sizeof(value)) ? atof(value) : 0.0;
    const double width = attribute(tag, tag_length, "width", value, sizeof(value)) ? atof(value) : 0.0;
    const double height = attribute(tag, tag_length, "height", value, sizeof(value)) ? atof(value) : 0.0;
    if (width <= 0.0 || height <= 0.0) {
        return;
    }
    /* `rx`/`ry` se aceptan como esquina redondeada simple: los catálogos los
       usan para el fondo de las señales, y un rectángulo recto se vería mal. */
    double rx = attribute(tag, tag_length, "rx", value, sizeof(value)) ? atof(value) : 0.0;
    double ry = attribute(tag, tag_length, "ry", value, sizeof(value)) ? atof(value) : 0.0;
    if (rx <= 0.0) {
        rx = ry;
    }
    if (ry <= 0.0) {
        ry = rx;
    }
    rx = fmin(rx, width / 2.0);
    ry = fmin(ry, height / 2.0);
    if (rx <= 0.0 || ry <= 0.0) {
        emit_move(ctx, m, x, y);
        emit_line(ctx, m, x + width, y);
        emit_line(ctx, m, x + width, y + height);
        emit_line(ctx, m, x, y + height);
        emit_close(ctx);
    } else {
        const double kx = rx * 0.5522847498307936;
        const double ky = ry * 0.5522847498307936;
        emit_move(ctx, m, x + rx, y);
        emit_line(ctx, m, x + width - rx, y);
        emit_curve(ctx, m, x + width - rx + kx, y, x + width, y + ry - ky, x + width, y + ry);
        emit_line(ctx, m, x + width, y + height - ry);
        emit_curve(ctx, m, x + width, y + height - ry + ky, x + width - rx + kx, y + height,
                   x + width - rx, y + height);
        emit_line(ctx, m, x + rx, y + height);
        emit_curve(ctx, m, x + rx - kx, y + height, x, y + height - ry + ky, x, y + height - ry);
        emit_line(ctx, m, x, y + ry);
        emit_curve(ctx, m, x, y + ry - ky, x + rx - kx, y, x + rx, y);
        emit_close(ctx);
    }
    emit_paint(ctx, state, m);
}

static void shape_ellipse(context *ctx, const char *tag, size_t tag_length, matrix m, const style *state,
                          int circle)
{
    char value[NORMA_SVG_VALUE];
    const double cx = attribute(tag, tag_length, "cx", value, sizeof(value)) ? atof(value) : 0.0;
    const double cy = attribute(tag, tag_length, "cy", value, sizeof(value)) ? atof(value) : 0.0;
    double rx = 0.0;
    double ry = 0.0;
    if (circle) {
        rx = attribute(tag, tag_length, "r", value, sizeof(value)) ? atof(value) : 0.0;
        ry = rx;
    } else {
        rx = attribute(tag, tag_length, "rx", value, sizeof(value)) ? atof(value) : 0.0;
        ry = attribute(tag, tag_length, "ry", value, sizeof(value)) ? atof(value) : 0.0;
    }
    if (rx <= 0.0 || ry <= 0.0) {
        return;
    }
    const double kx = rx * 0.5522847498307936;
    const double ky = ry * 0.5522847498307936;
    emit_move(ctx, m, cx + rx, cy);
    emit_curve(ctx, m, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    emit_curve(ctx, m, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    emit_curve(ctx, m, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
    emit_curve(ctx, m, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
    emit_close(ctx);
    emit_paint(ctx, state, m);
}

static void shape_line(context *ctx, const char *tag, size_t tag_length, matrix m, const style *state)
{
    char value[NORMA_SVG_VALUE];
    const double x1 = attribute(tag, tag_length, "x1", value, sizeof(value)) ? atof(value) : 0.0;
    const double y1 = attribute(tag, tag_length, "y1", value, sizeof(value)) ? atof(value) : 0.0;
    const double x2 = attribute(tag, tag_length, "x2", value, sizeof(value)) ? atof(value) : 0.0;
    const double y2 = attribute(tag, tag_length, "y2", value, sizeof(value)) ? atof(value) : 0.0;
    emit_move(ctx, m, x1, y1);
    emit_line(ctx, m, x2, y2);
    emit_paint(ctx, state, m);
}

/** `polyline` y `polygon`: lista de puntos `x,y x,y …`. */
static void shape_poly(context *ctx, const char *tag, size_t tag_length, matrix m, const style *state,
                       int closed)
{
    char points[NORMA_SVG_VALUE * 16];
    if (!attribute(tag, tag_length, "points", points, sizeof(points))) {
        return;
    }
    const char *cursor = points;
    double x = 0.0;
    double y = 0.0;
    if (!read_number(&cursor, &x) || !read_number(&cursor, &y)) {
        return;
    }
    emit_move(ctx, m, x, y);
    while (read_number(&cursor, &x) && read_number(&cursor, &y)) {
        emit_line(ctx, m, x, y);
    }
    if (closed) {
        emit_close(ctx);
    }
    emit_paint(ctx, state, m);
}

/* ------------------------------ arcos de SVG ----------------------------- */

/**
 * Convierte un arco elíptico (el comando `A` de `path`) en curvas cúbicas.
 *
 * Es la conversión de siempre —punto extremo a centro, y de ahí a tramos de
 * 90°— pero importa que esté: los pictogramas del catálogo dibujan los aros de
 * prohibición y las flechas circulares con arcos, y sin esto saldrían como
 * líneas rectas.
 */
static void emit_arc(context *ctx, matrix m, double x0, double y0, double rx, double ry,
                     double rotation_deg, int large_arc, int sweep, double x1, double y1)
{
    if (rx == 0.0 || ry == 0.0) {
        emit_line(ctx, m, x1, y1);
        return;
    }
    rx = fabs(rx);
    ry = fabs(ry);
    const double phi = rotation_deg * M_PI / 180.0;
    const double cosine = cos(phi);
    const double sine = sin(phi);
    const double dx2 = (x0 - x1) / 2.0;
    const double dy2 = (y0 - y1) / 2.0;
    const double x1p = cosine * dx2 + sine * dy2;
    const double y1p = -sine * dx2 + cosine * dy2;

    /* Radios demasiado pequeños: se agrandan hasta que el arco exista. */
    const double lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1.0) {
        const double factor = sqrt(lambda);
        rx *= factor;
        ry *= factor;
    }
    const double numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const double denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    double coefficient = denominator > 0.0 ? sqrt(fmax(0.0, numerator / denominator)) : 0.0;
    if (large_arc == sweep) {
        coefficient = -coefficient;
    }
    const double cxp = coefficient * (rx * y1p / ry);
    const double cyp = coefficient * (-ry * x1p / rx);
    const double cx = cosine * cxp - sine * cyp + (x0 + x1) / 2.0;
    const double cy = sine * cxp + cosine * cyp + (y0 + y1) / 2.0;

    const double start_angle = atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
    const double end_angle = atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx);
    double sweep_angle = end_angle - start_angle;
    if (!sweep && sweep_angle > 0.0) {
        sweep_angle -= 2.0 * M_PI;
    } else if (sweep && sweep_angle < 0.0) {
        sweep_angle += 2.0 * M_PI;
    }

    const int segments = (int) ceil(fabs(sweep_angle) / (M_PI / 2.0));
    const double step = sweep_angle / (double) segments;
    double angle = start_angle;
    for (int index = 0; index < segments; index += 1) {
        const double next = angle + step;
        /* Cada tramo de 90° se aproxima con una cúbica con el factor κ de
           siempre: el error es menor que una milésima del radio. */
        const double k = 4.0 / 3.0 * tan(step / 4.0);
        const double cos_a = cos(angle);
        const double sin_a = sin(angle);
        const double cos_b = cos(next);
        const double sin_b = sin(next);
        const double px0 = cx + rx * cos_a * cosine - ry * sin_a * sine;
        const double py0 = cy + rx * cos_a * sine + ry * sin_a * cosine;
        const double px3 = cx + rx * cos_b * cosine - ry * sin_b * sine;
        const double py3 = cy + rx * cos_b * sine + ry * sin_b * cosine;
        const double d0x = -rx * sin_a * cosine - ry * cos_a * sine;
        const double d0y = -rx * sin_a * sine + ry * cos_a * cosine;
        const double d1x = -rx * sin_b * cosine - ry * cos_b * sine;
        const double d1y = -rx * sin_b * sine + ry * cos_b * cosine;
        emit_curve(ctx, m, px0 + k * d0x, py0 + k * d0y, px3 - k * d1x, py3 - k * d1y, px3, py3);
        angle = next;
    }
}

/* ----------------------------- camino (`d`) ------------------------------ */

/** Interpreta el atributo `d` de un `path` y deja el camino acumulado. */
static void shape_path(context *ctx, const char *d, matrix m, const style *state)
{
    const char *cursor = d;
    double cx = 0.0;
    double cy = 0.0;
    double start_x = 0.0;
    double start_y = 0.0;
    /* Último punto de control, para las curvas suaves `S` y `T`. */
    double control_x = 0.0;
    double control_y = 0.0;
    char previous = '\0';
    int open = 0;

    while (*cursor != '\0') {
        while (is_space(*cursor) || *cursor == ',') {
            cursor += 1;
        }
        if (*cursor == '\0') {
            break;
        }
        char command = *cursor;
        if (!isalpha((unsigned char) command)) {
            /* Un número sin comando repite el anterior; si no hay anterior, se
               deja de leer para no quedarse en un bucle. */
            command = previous;
            if (command == '\0' || command == 'Z' || command == 'z') {
                break;
            }
        } else {
            cursor += 1;
        }
        const int relative = islower((unsigned char) command);
        const char upper = (char) toupper((unsigned char) command);
        double x = 0.0;
        double y = 0.0;

        if (upper == 'Z') {
            if (open) {
                emit_close(ctx);
            }
            cx = start_x;
            cy = start_y;
            previous = command;
            continue;
        }
        if (upper == 'H') {
            if (!read_number(&cursor, &x)) {
                break;
            }
            const double target = relative ? cx + x : x;
            if (!open) {
                emit_move(ctx, m, target, cy);
                start_x = target;
                start_y = cy;
                open = 1;
            } else {
                emit_line(ctx, m, target, cy);
            }
            cx = target;
            previous = command;
            continue;
        }
        if (upper == 'V') {
            if (!read_number(&cursor, &y)) {
                break;
            }
            const double target = relative ? cy + y : y;
            if (!open) {
                emit_move(ctx, m, cx, target);
                start_x = cx;
                start_y = target;
                open = 1;
            } else {
                emit_line(ctx, m, cx, target);
            }
            cy = target;
            previous = command;
            continue;
        }
        if (upper == 'M') {
            double mx = 0.0;
            double my = 0.0;
            if (!read_number(&cursor, &mx) || !read_number(&cursor, &my)) {
                break;
            }
            const double target_x = relative ? cx + mx : mx;
            const double target_y = relative ? cy + my : my;
            emit_move(ctx, m, target_x, target_y);
            cx = target_x;
            cy = target_y;
            start_x = target_x;
            start_y = target_y;
            open = 1;
            /* Los pares siguientes de un `M` son líneas, y relativos si el
               comando venía en minúscula. */
            previous = relative ? 'l' : 'L';
            /* Los pares siguientes de un `M` son líneas. */
            while (read_number(&cursor, &x) && read_number(&cursor, &y)) {
                const double line_x = relative ? cx + x : x;
                const double line_y = relative ? cy + y : y;
                emit_line(ctx, m, line_x, line_y);
                cx = line_x;
                cy = line_y;
            }
            continue;
        }
        if (upper == 'L') {
            if (!read_number(&cursor, &x) || !read_number(&cursor, &y)) {
                break;
            }
            const double target_x = relative ? cx + x : x;
            const double target_y = relative ? cy + y : y;
            if (!open) {
                emit_move(ctx, m, target_x, target_y);
                start_x = target_x;
                start_y = target_y;
                open = 1;
            } else {
                emit_line(ctx, m, target_x, target_y);
            }
            cx = target_x;
            cy = target_y;
            previous = command;
            continue;
        }
        if (upper == 'C' || upper == 'S') {
            double c1x = 0.0;
            double c1y = 0.0;
            double c2x = 0.0;
            double c2y = 0.0;
            if (upper == 'C') {
                if (!read_number(&cursor, &c1x) || !read_number(&cursor, &c1y)) {
                    break;
                }
                if (relative) {
                    c1x += cx;
                    c1y += cy;
                }
            } else {
                /* Curva suave: el primer control es el reflejo del anterior. */
                const int smooth = previous == 'C' || previous == 'c' || previous == 'S' || previous == 's';
                c1x = smooth ? 2.0 * cx - control_x : cx;
                c1y = smooth ? 2.0 * cy - control_y : cy;
            }
            if (!read_number(&cursor, &c2x) || !read_number(&cursor, &c2y)) {
                break;
            }
            if (relative) {
                c2x += cx;
                c2y += cy;
            }
            if (!read_number(&cursor, &x) || !read_number(&cursor, &y)) {
                break;
            }
            const double target_x = relative ? cx + x : x;
            const double target_y = relative ? cy + y : y;
            if (!open) {
                emit_move(ctx, m, cx, cy);
                start_x = cx;
                start_y = cy;
                open = 1;
            }
            emit_curve(ctx, m, c1x, c1y, c2x, c2y, target_x, target_y);
            control_x = c2x;
            control_y = c2y;
            cx = target_x;
            cy = target_y;
            /* Se guarda la letra **tal como venía**: si el camino repite el
               comando con más números (`c …  …  …`), la repetición sigue siendo
               relativa. Guardar 'C' convertía los tramos siguientes en
               absolutos y el pictograma salía descolocado. */
            previous = command;
            continue;
        }
        if (upper == 'Q' || upper == 'T') {
            double qx = 0.0;
            double qy = 0.0;
            if (upper == 'Q') {
                if (!read_number(&cursor, &qx) || !read_number(&cursor, &qy)) {
                    break;
                }
                if (relative) {
                    qx += cx;
                    qy += cy;
                }
            } else {
                const int smooth = previous == 'Q' || previous == 'q' || previous == 'T' || previous == 't';
                qx = smooth ? 2.0 * cx - control_x : cx;
                qy = smooth ? 2.0 * cy - control_y : cy;
            }
            if (!read_number(&cursor, &x) || !read_number(&cursor, &y)) {
                break;
            }
            const double target_x = relative ? cx + x : x;
            const double target_y = relative ? cy + y : y;
            if (!open) {
                emit_move(ctx, m, cx, cy);
                start_x = cx;
                start_y = cy;
                open = 1;
            }
            /* Cuadrática → cúbica, con los dos tercios de siempre. */
            emit_curve(ctx, m, cx + 2.0 / 3.0 * (qx - cx), cy + 2.0 / 3.0 * (qy - cy),
                       target_x + 2.0 / 3.0 * (qx - target_x), target_y + 2.0 / 3.0 * (qy - target_y),
                       target_x, target_y);
            control_x = qx;
            control_y = qy;
            cx = target_x;
            cy = target_y;
            previous = command;
            continue;
        }
        if (upper == 'A') {
            double rx = 0.0;
            double ry = 0.0;
            double rotation = 0.0;
            int large_arc = 0;
            int sweep = 0;
            if (!read_number(&cursor, &rx) || !read_number(&cursor, &ry) || !read_number(&cursor, &rotation)
                || !read_flag(&cursor, &large_arc) || !read_flag(&cursor, &sweep)
                || !read_number(&cursor, &x) || !read_number(&cursor, &y)) {
                break;
            }
            const double target_x = relative ? cx + x : x;
            const double target_y = relative ? cy + y : y;
            if (!open) {
                emit_move(ctx, m, cx, cy);
                start_x = cx;
                start_y = cy;
                open = 1;
            }
            emit_arc(ctx, m, cx, cy, rx, ry, rotation, large_arc, sweep, target_x, target_y);
            cx = target_x;
            cy = target_y;
            previous = command;
            continue;
        }
        /* Un comando que no se entiende: se corta el camino aquí. */
        break;
    }
    if (open) {
        emit_paint(ctx, state, m);
    }
}

/* ---------------------------- recorrido del SVG -------------------------- */

static void render_range(context *ctx, const style *parent, matrix m, size_t start, size_t end,
                         int depth);

/** Posición de la etiqueta que declara `id="…"` en el documento, o `length`. */
static size_t find_id(const char *doc, size_t length, const char *wanted, size_t *tag_start)
{
    const size_t wanted_length = strlen(wanted);
    for (size_t index = 0; index + 3 < length; index += 1) {
        if (doc[index] != 'i' || doc[index + 1] != 'd' || doc[index + 2] != '=') {
            continue;
        }
        if (doc[index + 3] != '"' && doc[index + 3] != '\'') {
            continue;
        }
        const char quote = doc[index + 3];
        const size_t value_start = index + 4;
        size_t value_end = value_start;
        while (value_end < length && doc[value_end] != quote) {
            value_end += 1;
        }
        if (value_end - value_start != wanted_length
            || memcmp(doc + value_start, wanted, wanted_length) != 0) {
            continue;
        }
        /* El elemento empieza en el último `<` anterior a la declaración. */
        size_t begin = index;
        while (begin > 0 && doc[begin] != '<') {
            begin -= 1;
        }
        if (tag_start != NULL) {
            *tag_start = begin;
        }
        return value_start;
    }
    return length;
}

/** Nombre de la etiqueta que empieza en `start` (sin el `<`). */
static size_t tag_name(const char *doc, size_t start, size_t length, char *out, size_t out_size)
{
    size_t index = start + 1;
    size_t count = 0;
    if (index < length && (doc[index] == '!' || doc[index] == '?')) {
        out[0] = '\0';
        return 0;
    }
    /* Una etiqueta de cierre se nombra igual que la de apertura: `find_close`
       necesita `</g>` para llevar la cuenta de los grupos anidados. */
    if (index < length && doc[index] == '/') {
        index += 1;
    }
    while (index < length && (isalnum((unsigned char) doc[index]) || doc[index] == ':')
           && count + 1 < out_size) {
        out[count] = doc[index];
        count += 1;
        index += 1;
    }
    out[count] = '\0';
    return count;
}

/** Busca el `</nombre>` que cierra la etiqueta abierta antes de `from`. */
static size_t find_close(const char *doc, size_t length, const char *name, size_t from)
{
    int depth = 1;
    size_t index = from;
    while (index < length) {
        const char *found_open = memchr(doc + index, '<', length - index);
        if (found_open == NULL) {
            return length;
        }
        const size_t next = (size_t) (found_open - doc);
        char found[32];
        const size_t found_length = tag_name(doc, next, length, found, sizeof(found));
        const int closing = next + 1 < length && doc[next + 1] == '/';
        if (found_length > 0 && same_name(found, found_length, name)) {
            const size_t end = tag_end(doc, next, length);
            if (closing) {
                depth -= 1;
                if (depth == 0) {
                    return next;
                }
            } else if (end > next && doc[end - 1] != '/') {
                depth += 1;
            }
            index = end;
        } else {
            index = tag_end(doc, next, length);
        }
    }
    return length;
}

/** Dibuja el elemento referenciado por un `use`. */
static void render_reference(context *ctx, const style *parent, matrix m, const char *reference,
                             int depth)
{
    if (reference == NULL || reference[0] != '#' || depth > NORMA_SVG_MAX_DEPTH) {
        return;
    }
    size_t start = 0;
    const size_t found = find_id(ctx->doc, ctx->length, reference + 1, &start);
    if (found >= ctx->length) {
        return;
    }
    /* Se dibuja la etiqueta referida con sus atributos; si tuviera contenido
       (no es el caso de los catálogos), `render_element` lo recorre. */
    const size_t open_end = tag_end(ctx->doc, start, ctx->length);
    char name[32];
    const size_t name_length = tag_name(ctx->doc, start, ctx->length, name, sizeof(name));
    if (name_length == 0) {
        return;
    }
    render_range(ctx, parent, m, start, open_end + 1, depth + 1);
}

/** Dibuja el contenido de un `clipPath` para usarlo como recorte. */
static void render_clip(context *ctx, const style *parent, matrix m, const char *reference, int depth)
{
    if (reference == NULL || reference[0] != '#') {
        return;
    }
    size_t start = 0;
    if (find_id(ctx->doc, ctx->length, reference + 1, &start) >= ctx->length) {
        return;
    }
    const size_t open_end = tag_end(ctx->doc, start, ctx->length);
    char name[32];
    const size_t name_length = tag_name(ctx->doc, start, ctx->length, name, sizeof(name));
    if (name_length == 0) {
        return;
    }
    const size_t close = find_close(ctx->doc, ctx->length, name, open_end + 1);
    ctx->clipping = 1;
    ctx->clip_pushed = 0;
    render_range(ctx, parent, m, open_end + 1, close, depth + 1);
    ctx->clipping = 0;
    /* Si el `clipPath` traía formas, el camino acumulado es el recorte. */
    if (ctx->clip_pushed && ctx->sink->push_clip != NULL) {
        ctx->sink->push_clip(ctx->sink->user);
    } else {
        ctx->clip_pushed = 0;
    }
}

/** Rótulo del pictograma: `<text x y font-size text-anchor>` con su contenido. */
static void shape_text(context *ctx, const char *tag, size_t tag_length, matrix m, const style *state,
                       size_t content_start)
{
    if (ctx->sink->text == NULL) {
        return;
    }
    /* `<text …/>` no tiene contenido: sin esta guarda se leería hasta el final
       del documento buscando un cierre que no existe. */
    if (tag_length > 1 && tag[tag_length - 2] == '/') {
        return;
    }
    char value[NORMA_SVG_VALUE];
    double x = attribute(tag, tag_length, "x", value, sizeof(value)) ? atof(value) : 0.0;
    double y = attribute(tag, tag_length, "y", value, sizeof(value)) ? atof(value) : 0.0;
    double size = attribute(tag, tag_length, "font-size", value, sizeof(value)) ? atof(value) : 12.0;
    if (size <= 0.0) {
        size = 12.0;
    }
    int anchor = NORMA_SVG_TEXT_START;
    if (attribute(tag, tag_length, "text-anchor", value, sizeof(value))) {
        if (strstr(value, "middle") != NULL) {
            anchor = NORMA_SVG_TEXT_MIDDLE;
        } else if (strstr(value, "end") != NULL) {
            anchor = NORMA_SVG_TEXT_END;
        }
    }
    /* El contenido va hasta el cierre; si trae etiquetas (`tspan`), se queda
       con el texto de fuera de ellas, que es lo que usan los catálogos. */
    const size_t close = find_close(ctx->doc, ctx->length, "text", content_start);
    char content[NORMA_SVG_VALUE];
    size_t written = 0;
    int inside_tag = 0;
    for (size_t index = content_start; index < close && written + 1 < sizeof(content); index += 1) {
        const char character = ctx->doc[index];
        if (character == '<') {
            inside_tag = 1;
            continue;
        }
        if (character == '>') {
            inside_tag = 0;
            continue;
        }
        if (inside_tag || character == '\n' || character == '\r' || character == '\t') {
            continue;
        }
        content[written] = character;
        written += 1;
    }
    content[written] = '\0';
    while (written > 0 && content[written - 1] == ' ') {
        written -= 1;
        content[written] = '\0';
    }
    if (written == 0) {
        return;
    }
    double px = 0.0;
    double py = 0.0;
    matrix_apply(m, x, y, &px, &py);
    ctx->sink->text(ctx->sink->user, px, py, size * matrix_scale(m), anchor,
                    state->fill[0] != '\0' ? state->fill : NULL, state->fill_alpha * state->opacity,
                    content);
    ctx->drew = 1;
}

static void render_element(context *ctx, const style *parent, matrix m, size_t start, size_t end,
                           int depth)
{
    char name[32];
    const size_t name_length = tag_name(ctx->doc, start, ctx->length, name, sizeof(name));
    if (name_length == 0) {
        return;
    }
    const char *tag = ctx->doc + start;
    const size_t tag_length = end - start;
    const int empty = tag_length > 1 && tag[tag_length - 2] == '/';

    style state = *parent;
    style_from_tag(tag, tag_length, &state, ctx->current_colour);

    matrix local = m;
    char value[512];
    if (attribute(tag, tag_length, "transform", value, sizeof(value))) {
        local = parse_transform(value, m);
    }

    /* Recorte del grupo: se aplica antes de dibujar su contenido. */
    int clipped = 0;
    if (attribute(tag, tag_length, "clip-path", value, sizeof(value))) {
        const char *hash = strchr(value, '#');
        if (hash != NULL) {
            char reference[64];
            size_t index = 0;
            while (hash[index] != '\0' && hash[index] != ')' && index + 1 < sizeof(reference)) {
                reference[index] = hash[index];
                index += 1;
            }
            reference[index] = '\0';
            render_clip(ctx, parent, local, reference, depth);
            clipped = ctx->clip_pushed;
        }
    }

    if (same_name(name, name_length, "path")) {
        char d[8192];
        if (attribute(tag, tag_length, "d", d, sizeof(d))) {
            char rule[NORMA_SVG_VALUE];
            if (attribute(tag, tag_length, "fill-rule", rule, sizeof(rule))) {
                state.even_odd = strstr(rule, "evenodd") != NULL;
            }
            shape_path(ctx, d, local, &state);
        }
    } else if (same_name(name, name_length, "rect")) {
        shape_rect(ctx, tag, tag_length, local, &state);
    } else if (same_name(name, name_length, "circle")) {
        shape_ellipse(ctx, tag, tag_length, local, &state, 1);
    } else if (same_name(name, name_length, "ellipse")) {
        shape_ellipse(ctx, tag, tag_length, local, &state, 0);
    } else if (same_name(name, name_length, "line")) {
        shape_line(ctx, tag, tag_length, local, &state);
    } else if (same_name(name, name_length, "polyline")) {
        shape_poly(ctx, tag, tag_length, local, &state, 0);
    } else if (same_name(name, name_length, "polygon")) {
        shape_poly(ctx, tag, tag_length, local, &state, 1);
    } else if (same_name(name, name_length, "use")) {
        char reference[128];
        if (!attribute(tag, tag_length, "xlink:href", reference, sizeof(reference))
            && !attribute(tag, tag_length, "href", reference, sizeof(reference))) {
            reference[0] = '\0';
        }
        if (reference[0] != '\0') {
            matrix placed = local;
            char xs[NORMA_SVG_VALUE];
            char ys[NORMA_SVG_VALUE];
            if (attribute(tag, tag_length, "x", xs, sizeof(xs))) {
                placed.e += atof(xs);
            }
            if (attribute(tag, tag_length, "y", ys, sizeof(ys))) {
                placed.f += atof(ys);
            }
            render_reference(ctx, &state, placed, reference, depth);
        }
    } else if (same_name(name, name_length, "text")) {
        shape_text(ctx, tag, tag_length, local, &state, end);
    } else if (same_name(name, name_length, "svg") || same_name(name, name_length, "g")) {
        if (!empty) {
            /* `end` ya es el primer carácter después del `>`: ahí empiezan los
               hijos, no en `end + 1`. */
            const size_t close = find_close(ctx->doc, ctx->length, name, end);
            render_range(ctx, &state, local, end, close, depth + 1);
        }
    }
    /* `defs`, `clipPath`, `title`, `desc`: no se dibujan en su sitio. */

    while (clipped > 0) {
        if (ctx->sink->pop_clip != NULL) {
            ctx->sink->pop_clip(ctx->sink->user);
        }
        clipped -= 1;
    }
}

static void render_range(context *ctx, const style *parent, matrix m, size_t start, size_t end,
                         int depth)
{
    if (ctx->budget <= 0 || depth > NORMA_SVG_MAX_DEPTH) {
        return;
    }
    size_t index = start;
    while (index < end) {
        const char *open = memchr(ctx->doc + index, '<', end - index);
        if (open == NULL) {
            break;
        }
        const size_t position = (size_t) (open - ctx->doc);
        if (position + 1 >= end) {
            break;
        }
        const char next = ctx->doc[position + 1];
        if (next == '!' || next == '?') {
            /* Comentario, CDATA o declaración: se salta entera. */
            const char *close = strstr(ctx->doc + position, "-->");
            index = close != NULL ? (size_t) (close - ctx->doc) + 3 : tag_end(ctx->doc, position, end) + 1;
            continue;
        }
        if (next == '/') {
            index = tag_end(ctx->doc, position, end) + 1;
            continue;
        }
        const size_t close = tag_end(ctx->doc, position, end);
        char name[32];
        const size_t name_length = tag_name(ctx->doc, position, end, name, sizeof(name));
        render_element(ctx, parent, m, position, close + 1, depth);
        /* Un contenedor ya dibujó a sus hijos: se salta hasta su cierre para no
           dibujarlos otra vez fuera de su grupo (sin transformación ni estado). */
        const int self_closing = close > position && ctx->doc[close - 1] == '/';
        const int container = same_name(name, name_length, "g") || same_name(name, name_length, "svg")
                              || same_name(name, name_length, "defs")
                              || same_name(name, name_length, "clipPath")
                              || same_name(name, name_length, "title")
                              || same_name(name, name_length, "desc");
        if (container && !self_closing && name_length > 0) {
            const size_t container_close = find_close(ctx->doc, ctx->length, name, close + 1);
            index = container_close < end ? container_close : end;
            if (index > position) {
                continue;
            }
        }
        index = close + 1;
    }
}

/* ------------------------------- entrada --------------------------------- */

int norma_svg_drawable(const char *svg)
{
    if (svg == NULL) {
        return 0;
    }
    const char *cursor = svg;
    while (is_space(*cursor)) {
        cursor += 1;
    }
    return strncmp(cursor, "<svg", 4) == 0 || strncmp(cursor, "<?xml", 5) == 0;
}

int norma_svg_draw(const char *svg, double x, double y, double w, double h, const char *colour,
                   const norma_svg_sink *sink)
{
    if (svg == NULL || sink == NULL || w <= 0.0 || h <= 0.0) {
        return 0;
    }
    const size_t length = strlen(svg);
    if (length < 16 || length > 400000) {
        return 0;
    }
    /* La etiqueta raíz tiene que ser `svg`; el resto lo resuelve el intérprete. */
    const char *first = svg;
    while (is_space((char) *first)) {
        first += 1;
    }
    if (strncmp(first, "<?xml", 5) == 0) {
        const char *skip = strstr(first, "?>");
        if (skip == NULL) {
            return 0;
        }
        first = skip + 2;
        while (is_space((char) *first)) {
            first += 1;
        }
    }
    if (strncmp(first, "<svg", 4) != 0) {
        return 0;
    }
    const size_t root = (size_t) (first - svg);
    const size_t root_end = tag_end(svg, root, length);
    if (root_end >= length) {
        return 0;
    }

    context ctx;
    memset(&ctx, 0, sizeof(ctx));
    ctx.doc = svg;
    ctx.length = length;
    ctx.sink = sink;
    ctx.budget = NORMA_SVG_BUDGET;
    snprintf(ctx.current_colour, sizeof(ctx.current_colour), "%s",
             colour != NULL && colour[0] == '#' ? colour : "#000000");

    /* La caja de destino y el `viewBox` dan la matriz raíz. */
    char view_box[64];
    matrix root_matrix = matrix_identity();
    root_matrix.e = x;
    root_matrix.f = y;
    if (xml_view_box(svg + root, root_end - root + 1, view_box, sizeof(view_box))) {
        root_matrix = matrix_multiply(root_matrix, view_box_matrix(view_box, 0.0, 0.0, w, h));
    } else {
        root_matrix.a = w / 100.0;
        root_matrix.d = h / 100.0;
    }

    style state = style_initial();
    style_from_tag(svg + root, root_end - root + 1, &state, ctx.current_colour);

    const size_t close = find_close(svg, length, "svg", root_end + 1);
    render_range(&ctx, &state, root_matrix, root_end + 1, close, 0);
    return ctx.drew;
}

/* ---------------------------- caja del viewBox --------------------------- */

/** Matriz que lleva un `viewBox` a la caja de destino, con `meet` centrado. */
static matrix view_box_matrix(const char *view_box, double x, double y, double w, double h)
{
    double min_x = 0.0;
    double min_y = 0.0;
    double width = 100.0;
    double height = 100.0;
    const char *cursor = view_box;
    if (!read_number(&cursor, &min_x) || !read_number(&cursor, &min_y)
        || !read_number(&cursor, &width) || !read_number(&cursor, &height)) {
        return matrix_identity();
    }
    if (width <= 0.0 || height <= 0.0) {
        return matrix_identity();
    }
    if (w <= 0.0 || h <= 0.0) {
        w = width;
        h = height;
    }
    const double scale = fmin(w / width, h / height);
    matrix m = matrix_identity();
    m.a = scale;
    m.d = scale;
    m.e = x + (w - width * scale) / 2.0 - min_x * scale;
    m.f = y + (h - height * scale) / 2.0 - min_y * scale;
    return m;
}

static int xml_view_box(const char *tag, size_t tag_length, char *out, size_t out_size)
{
    return attribute(tag, tag_length, "viewBox", out, out_size);
}
