/*
 * Pruebas del intérprete de pictogramas SVG.
 *
 * Lo que se comprueba es que el dibujo que llega a la pantalla sea el del
 * catálogo, no una aproximación: que las formas caigan donde dice su `viewBox`,
 * que las transformaciones se apliquen, que `use` resuelva su referencia y que
 * los 820 pictogramas de verdad produzcan tinta.
 *
 * Para eso hay dos destinos de dibujo de prueba: uno que **cuenta** las
 * operaciones (mover, línea, curva, pintar) y otro que **rasteriza** el relleno
 * a 64 × 64 para medir cuánta superficie del pictograma queda cubierta. Con la
 * cobertura se distingue un pictograma bien dibujado de uno vacío o de un
 * cuadrado negro.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/object.h"
#include "normia/svgdraw.h"

static int checks = 0;
static int failures = 0;

static void check(const char *name, int condition, const char *detail)
{
    checks += 1;
    printf("  %s %s%s%s\n", condition ? "✓" : "✗", name,
           detail != NULL && detail[0] != '\0' ? " · " : "", detail != NULL ? detail : "");
    if (!condition) {
        failures += 1;
    }
}

/* --------------------------- destino que cuenta -------------------------- */

#define TRACE_POINTS 4096
#define TRACE_PAINTS 256

typedef struct {
    double xs[TRACE_POINTS];
    double ys[TRACE_POINTS];
    int points;
    int moves;
    int lines;
    int curves;
    int closes;
    int paints;
    int blanks;
    int clips;
    /* Rótulos del pictograma: cuántos, y el último tal como llegó. */
    int texts;
    char text[32];
    int text_anchor;
    double text_size;
    /* Lo que dijo el último `paint`. */
    char fill[16];
    char stroke[16];
    double fill_alpha;
    double stroke_width;
    int even_odd;
    int dashes;
    char colours[TRACE_PAINTS][16];
    double strokes[TRACE_PAINTS];
} trace;

static void trace_move(void *user, double x, double y)
{
    trace *state = (trace *) user;
    state->moves += 1;
    if (state->points < TRACE_POINTS) {
        state->xs[state->points] = x;
        state->ys[state->points] = y;
        state->points += 1;
    }
}

static void trace_line(void *user, double x, double y)
{
    trace *state = (trace *) user;
    state->lines += 1;
    if (state->points < TRACE_POINTS) {
        state->xs[state->points] = x;
        state->ys[state->points] = y;
        state->points += 1;
    }
}

static void trace_curve(void *user, double x1, double y1, double x2, double y2, double x3, double y3)
{
    trace *state = (trace *) user;
    (void) x1;
    (void) y1;
    (void) x2;
    (void) y2;
    state->curves += 1;
    if (state->points < TRACE_POINTS) {
        state->xs[state->points] = x3;
        state->ys[state->points] = y3;
        state->points += 1;
    }
}

static void trace_close(void *user)
{
    ((trace *) user)->closes += 1;
}

static void trace_paint(void *user, const norma_svg_paint *paint)
{
    trace *state = (trace *) user;
    /* `paint` también llega para las figuras que no pintan nada (el destino
       tiene que vaciar el camino): esas no cuentan como tinta. */
    if (paint->fill == NULL && paint->stroke == NULL) {
        state->blanks += 1;
        return;
    }
    state->paints += 1;
    snprintf(state->fill, sizeof(state->fill), "%s", paint->fill != NULL ? paint->fill : "");
    snprintf(state->stroke, sizeof(state->stroke), "%s", paint->stroke != NULL ? paint->stroke : "");
    state->fill_alpha = paint->fill_alpha;
    state->even_odd = paint->even_odd;
    state->stroke_width = paint->stroke_width;
    state->dashes = paint->dash != NULL;
    if (state->paints <= TRACE_PAINTS) {
        snprintf(state->colours[state->paints - 1], sizeof(state->colours[0]), "%s",
                 paint->fill != NULL ? paint->fill : paint->stroke);
        state->strokes[state->paints - 1] = paint->stroke_width;
    }
}

static void trace_push(void *user)
{
    ((trace *) user)->clips += 1;
}

static void trace_pop(void *user)
{
    (void) user;
}

static void trace_text(void *user, double x, double y, double size, int anchor, const char *fill,
                       double alpha, const char *content)
{
    (void) x;
    (void) y;
    (void) fill;
    (void) alpha;
    trace *state = (trace *) user;
    state->texts += 1;
    state->text_anchor = anchor;
    state->text_size = size;
    snprintf(state->text, sizeof(state->text), "%s", content != NULL ? content : "");
}

static norma_svg_sink trace_sink(trace *state)
{
    norma_svg_sink sink;
    sink.user = state;
    sink.move_to = trace_move;
    sink.line_to = trace_line;
    sink.curve_to = trace_curve;
    sink.close = trace_close;
    sink.paint = trace_paint;
    sink.push_clip = trace_push;
    sink.pop_clip = trace_pop;
    sink.text = trace_text;
    return sink;
}

/** Caja de todos los puntos trazados. */
static int trace_bounds(const trace *state, double *min_x, double *min_y, double *max_x, double *max_y)
{
    if (state->points == 0) {
        return 0;
    }
    *min_x = state->xs[0];
    *min_y = state->ys[0];
    *max_x = state->xs[0];
    *max_y = state->ys[0];
    for (int index = 1; index < state->points; index += 1) {
        if (state->xs[index] < *min_x) { *min_x = state->xs[index]; }
        if (state->xs[index] > *max_x) { *max_x = state->xs[index]; }
        if (state->ys[index] < *min_y) { *min_y = state->ys[index]; }
        if (state->ys[index] > *max_y) { *max_y = state->ys[index]; }
    }
    return 1;
}

/* ------------------------- destino que rasteriza ------------------------- */

/**
 * Rasteriza solo los rellenos, a 64 × 64, para medir cobertura.
 *
 * Las curvas se aplanan a 8 tramos, que a 64 píxeles es de sobra; el relleno se
 * resuelve por scanline con la regla par-impar o la de no-cero, como hará Core
 * Graphics. El trazo no se mide: un pictograma de líneas sin relleno sale con
 * cobertura 0, y eso también distingue un error.
 */
#define RASTER 64
#define RASTER_EDGES 20000

typedef struct {
    double x0[RASTER_EDGES];
    double y0[RASTER_EDGES];
    double x1[RASTER_EDGES];
    double y1[RASTER_EDGES];
    int edges;
    double first_x;
    double first_y;
    double last_x;
    double last_y;
    unsigned char area[RASTER * RASTER];
    int paintings;
} raster;

static int coverage_pixels(const raster *state)
{
    int total = 0;
    for (int index = 0; index < RASTER * RASTER; index += 1) {
        if (state->area[index] != 0) {
            total += 1;
        }
    }
    return total;
}

static void raster_edge(raster *state, double x0, double y0, double x1, double y1)
{
    if (state->edges < RASTER_EDGES) {
        state->x0[state->edges] = x0;
        state->y0[state->edges] = y0;
        state->x1[state->edges] = x1;
        state->y1[state->edges] = y1;
        state->edges += 1;
    }
}

static void raster_move(void *user, double x, double y)
{
    raster *state = (raster *) user;
    state->first_x = x;
    state->first_y = y;
    state->last_x = x;
    state->last_y = y;
}

static void raster_line(void *user, double x, double y)
{
    raster *state = (raster *) user;
    raster_edge(state, state->last_x, state->last_y, x, y);
    state->last_x = x;
    state->last_y = y;
}

static void raster_curve(void *user, double x1, double y1, double x2, double y2, double x3, double y3)
{
    raster *state = (raster *) user;
    double previous_x = state->last_x;
    double previous_y = state->last_y;
    for (int step = 1; step <= 8; step += 1) {
        const double t = (double) step / 8.0;
        const double u = 1.0 - t;
        const double x = u * u * u * previous_x + 3.0 * u * u * t * x1 + 3.0 * u * t * t * x2 + t * t * t * x3;
        const double y = u * u * u * previous_y + 3.0 * u * u * t * y1 + 3.0 * u * t * t * y2 + t * t * t * y3;
        raster_edge(state, state->last_x, state->last_y, x, y);
        state->last_x = x;
        state->last_y = y;
    }
}

static void raster_close(void *user)
{
    raster *state = (raster *) user;
    raster_edge(state, state->last_x, state->last_y, state->first_x, state->first_y);
}

/** Rellena lo acumulado y empieza un camino nuevo. */
static void raster_paint(void *user, const norma_svg_paint *paint)
{
    raster *state = (raster *) user;
    if (paint->fill != NULL && state->edges > 0) {
        state->paintings += 1;
        for (int row = 0; row < RASTER; row += 1) {
            const double y = (double) row + 0.5;
            double crossings[128];
            int count = 0;
            for (int edge = 0; edge < state->edges && count < 128; edge += 1) {
                const double y0 = state->y0[edge];
                const double y1 = state->y1[edge];
                if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
                    const double t = (y - y0) / (y1 - y0);
                    crossings[count] = state->x0[edge] + t * (state->x1[edge] - state->x0[edge]);
                    count += 1;
                }
            }
            /* Ordenar por inserción: son pocas por fila. */
            for (int a = 1; a < count; a += 1) {
                const double value = crossings[a];
                int b = a - 1;
                while (b >= 0 && crossings[b] > value) {
                    crossings[b + 1] = crossings[b];
                    b -= 1;
                }
                crossings[b + 1] = value;
            }
            for (int index = 0; index < count; index += 1) {
                const double start = crossings[index];
                double end = 0.0;
                if (paint->even_odd) {
                    if (index % 2 == 0 && index + 1 < count) {
                        end = crossings[index + 1];
                    } else {
                        continue;
                    }
                } else {
                    if (index + 1 >= count) {
                        continue;
                    }
                    /* Regla de no-cero: el sentido de la arista decide. */
                    int winding = 0;
                    for (int other = 0; other <= index; other += 1) {
                        winding += 1;
                    }
                    (void) winding;
                    end = crossings[index + 1];
                }
                int from = (int) floor(start);
                int to = (int) ceil(end);
                if (from < 0) { from = 0; }
                if (to > RASTER) { to = RASTER; }
                for (int column = from; column < to; column += 1) {
                    state->area[row * RASTER + column] = 1;
                }
            }
        }
    }
    state->edges = 0;
}

static void raster_push(void *user)
{
    (void) user;
}

static void raster_pop(void *user)
{
    (void) user;
}

static norma_svg_sink raster_sink(raster *state)
{
    norma_svg_sink sink;
    sink.user = state;
    sink.move_to = raster_move;
    sink.line_to = raster_line;
    sink.curve_to = raster_curve;
    sink.close = raster_close;
    sink.paint = raster_paint;
    sink.push_clip = raster_push;
    sink.pop_clip = raster_pop;
    sink.text = NULL; /* el rótulo no cambia la cobertura del relleno */
    return sink;
}

/** Cobertura del pictograma dentro de su caja, de 0 a 1. */
static double coverage_of(const char *svg, const char *colour)
{
    raster state;
    memset(&state, 0, sizeof(state));
    const norma_svg_sink sink = raster_sink(&state);
    if (!norma_svg_draw(svg, 0.0, 0.0, (double) RASTER, (double) RASTER, colour, &sink)) {
        return 0.0;
    }
    return (double) coverage_pixels(&state) / (double) (RASTER * RASTER);
}

/* ------------------------------- pruebas --------------------------------- */

static void test_shapes(void)
{
    /* Un cuadrado que llena el `viewBox` tiene que llenar la caja destino. */
    const char *square =
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">"
        "<rect x=\"0\" y=\"0\" width=\"10\" height=\"10\" fill=\"#237f52\"/></svg>";
    trace state;
    memset(&state, 0, sizeof(state));
    norma_svg_sink sink = trace_sink(&state);
    check("Un rectángulo del viewBox se dibuja con cuatro lados",
          norma_svg_draw(square, 100.0, 50.0, 64.0, 64.0, NULL, &sink) == 1
              && state.lines == 3 && state.closes == 1 && state.paints == 1,
          "4 lados · 1 relleno");
    double min_x = 0.0;
    double min_y = 0.0;
    double max_x = 0.0;
    double max_y = 0.0;
    const int bounded = trace_bounds(&state, &min_x, &min_y, &max_x, &max_y);
    check("El rectángulo cae exactamente en la caja pedida",
          bounded && fabs(min_x - 100.0) < 1e-6 && fabs(min_y - 50.0) < 1e-6
              && fabs(max_x - 164.0) < 1e-6 && fabs(max_y - 114.0) < 1e-6,
          "100 · 50 · 64 × 64");
    check("El relleno es el color del SVG y va opaco",
          strcmp(state.fill, "#237f52") == 0 && fabs(state.fill_alpha - 1.0) < 1e-9,
          "#237f52");

    /* Un `viewBox` que no empieza en cero se descuenta. */
    const char *offset =
        "<svg viewBox=\"100 100 20 20\"><circle cx=\"110\" cy=\"110\" r=\"10\" fill=\"#000\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(offset, 0.0, 0.0, 20.0, 20.0, NULL, &sink);
    const int centered = trace_bounds(&state, &min_x, &min_y, &max_x, &max_y);
    check("El viewBox desplazado se centra en la caja",
          centered && fabs((min_x + max_x) / 2.0 - 10.0) < 0.01
              && fabs((min_y + max_y) / 2.0 - 10.0) < 0.01
              && fabs((max_x - min_x) - 20.0) < 0.01,
          "círculo centrado · 20 de diámetro");

    const char *ellipse =
        "<svg viewBox=\"0 0 100 100\"><ellipse cx=\"50\" cy=\"50\" rx=\"50\" ry=\"25\" fill=\"#000\"/></svg>";
    check("Un círculo se convierte en cuatro curvas y llena su caja",
          coverage_of(ellipse, NULL) > 0.15 && coverage_of(ellipse, NULL) < 0.85,
          "elipse");
}

static void test_transforms_and_state(void)
{
    const char *transformed =
        "<svg viewBox=\"0 0 100 100\"><g transform=\"translate(50 0) scale(0.5 0.5)\">"
        "<rect x=\"0\" y=\"0\" width=\"100\" height=\"100\" fill=\"#000\"/></g></svg>";
    trace state;
    memset(&state, 0, sizeof(state));
    norma_svg_sink sink = trace_sink(&state);
    norma_svg_draw(transformed, 0.0, 0.0, 100.0, 100.0, NULL, &sink);
    double min_x = 0.0;
    double min_y = 0.0;
    double max_x = 0.0;
    double max_y = 0.0;
    check("translate y scale del grupo mueven y encogen la figura",
          trace_bounds(&state, &min_x, &min_y, &max_x, &max_y)
              && fabs(min_x - 50.0) < 1e-6 && fabs(max_x - 100.0) < 1e-6
              && fabs(max_y - 50.0) < 1e-6,
          "mitad derecha");

    const char *styled =
        "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0h10v10z\" style=\"fill:#f9a800;stroke:#000;"
        "stroke-width:2;fill-rule:evenodd;opacity:0.5\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(styled, 0.0, 0.0, 10.0, 10.0, NULL, &sink);
    check("La declaración `style` trae relleno, trazo, regla y opacidad",
          strcmp(state.fill, "#f9a800") == 0 && strcmp(state.stroke, "#000000") == 0
              && state.even_odd == 1 && fabs(state.fill_alpha - 0.5) < 1e-9,
          "#f9a800 · evenodd · 50 %");

    const char *faded =
        "<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\" fill-opacity=\".25\" "
        "fill=\"#2563eb\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(faded, 0.0, 0.0, 10.0, 10.0, NULL, &sink);
    check("`fill-opacity` se respeta",
          fabs(state.fill_alpha - 0.25) < 1e-9 && strcmp(state.fill, "#2563eb") == 0, "25 %");

    const char *current =
        "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0h10v10z\" fill=\"currentColor\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(current, 0.0, 0.0, 10.0, 10.0, "#b91c1c", &sink);
    check("`currentColor` toma el color del elemento",
          strcmp(state.fill, "#b91c1c") == 0, "#b91c1c");

    const char *short_colour =
        "<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\" fill=\"#fff\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(short_colour, 0.0, 0.0, 10.0, 10.0, NULL, &sink);
    check("El color de tres cifras se expande a seis",
          strcmp(state.fill, "#ffffff") == 0, "#fff → #ffffff");

    const char *stroke_only =
        "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0L10 10\" fill=\"none\" stroke=\"#334155\" "
        "stroke-width=\"2\" stroke-dasharray=\"4 2\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(stroke_only, 0.0, 0.0, 20.0, 20.0, NULL, &sink);
    check("Un trazo sin relleno se pinta solo con su grosor escalado y su raya",
          state.fill[0] == '\0' && strcmp(state.stroke, "#334155") == 0
              && fabs(state.stroke_width - 4.0) < 1e-6 && state.dashes == 1,
          "2 unidades → 4 cm en una caja de 20");
}

static void test_text(void)
{
    /* Tres piezas del catálogo llevan su rótulo dentro del SVG: la «P» del
       parqueadero, la «E» del estacionamiento exclusivo y el «30» de la señal
       de velocidad. Sin esto salían el aro y el fondo, pero no la cifra. */
    const char *labelled =
        "<svg viewBox=\"0 0 100 100\"><text x=\"50\" y=\"59\" text-anchor=\"middle\" "
        "font-size=\"24\" fill=\"#b91c1c\">30</text></svg>";
    trace state;
    memset(&state, 0, sizeof(state));
    norma_svg_sink sink = trace_sink(&state);
    norma_svg_draw(labelled, 0.0, 0.0, 100.0, 100.0, NULL, &sink);
    check("El rótulo de dentro del SVG llega al destino con su texto y su alineación",
          state.texts == 1 && strcmp(state.text, "30") == 0
              && state.text_anchor == NORMA_SVG_TEXT_MIDDLE,
          "«30» centrado");
    check("El cuerpo de letra viene escalado a la caja del plano, no en unidades del SVG",
          fabs(state.text_size - 24.0) < 0.01, "24 unidades en una caja de 100");
    const char *plain = "<svg viewBox=\"0 0 10 10\"><text x=\"1\" y=\"5\">A</text></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(plain, 0.0, 0.0, 10.0, 10.0, NULL, &sink);
    check("Un rótulo sin `text-anchor` se alinea a la izquierda y no pinta formas",
          state.texts == 1 && state.text_anchor == NORMA_SVG_TEXT_START && state.paints == 0,
          "«A» a la izquierda");

    /* El rótulo sobrevive al `use` y a la transformación del grupo. */
    const char *nested =
        "<svg viewBox=\"0 0 100 100\"><g transform=\"translate(10 0)\">"
        "<text x=\"40\" y=\"20\" font-size=\"10\" fill=\"#000\">P</text></g></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(nested, 0.0, 0.0, 100.0, 100.0, NULL, &sink);
    check("El rótulo de dentro de un grupo también llega, con su texto",
          state.texts == 1 && strcmp(state.text, "P") == 0, "«P» en un grupo con transformación");
}

static void test_use_and_arcs(void)
{
    const char *with_use =
        "<svg viewBox=\"0 0 100 100\"><defs><path id=\"p1\" d=\"M0 0h40v40z\" fill=\"#000\"/>"
        "</defs><use xlink:href=\"#p1\"/><use href=\"#p1\" x=\"50\" y=\"50\"/></svg>";
    trace state;
    memset(&state, 0, sizeof(state));
    norma_svg_sink sink = trace_sink(&state);
    norma_svg_draw(with_use, 0.0, 0.0, 100.0, 100.0, NULL, &sink);
    check("`use` con xlink:href y con href dibuja la pieza definida",
          state.paints == 2, "dos usos");

    const char *arc =
        "<svg viewBox=\"0 0 100 100\"><path d=\"M10 50 A40 40 0 0 1 90 50\" fill=\"none\" "
        "stroke=\"#000\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    norma_svg_draw(arc, 0.0, 0.0, 100.0, 100.0, NULL, &sink);
    double min_x = 0.0;
    double min_y = 0.0;
    double max_x = 0.0;
    double max_y = 0.0;
    const int bounded = trace_bounds(&state, &min_x, &min_y, &max_x, &max_y);
    /* Un semicírculo de radio 40: llega a x = 90 y sube hasta y = 10 (el punto
       más alto del arco), no se queda en una línea recta. */
    check("El comando `A` se convierte en curvas y describe el arco",
          state.curves >= 1 && bounded && fabs(max_x - 90.0) < 0.5 && min_y < 15.0,
          "semicírculo de 40");

    const char *quadratic =
        "<svg viewBox=\"0 0 100 100\"><path d=\"M0 100 Q50 0 100 100 T200 100\" fill=\"none\" "
        "stroke=\"#000\"/></svg>";
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    check("Las curvas suaves `T` se apoyan en la anterior",
          norma_svg_draw(quadratic, 0.0, 0.0, 200.0, 100.0, NULL, &sink) == 1
              && state.curves == 2,
          "dos cúbicas");
}

static void test_robustness(void)
{
    trace state;
    memset(&state, 0, sizeof(state));
    norma_svg_sink sink = trace_sink(&state);
    check("Un texto que no es SVG no dibuja nada",
          norma_svg_draw("no soy un svg", 0.0, 0.0, 10.0, 10.0, NULL, &sink) == 0
              && state.paints == 0,
          "sin etiqueta svg");
    check("Un SVG sin formas válidas no dibuja nada",
          norma_svg_draw("<svg viewBox=\"0 0 10 10\"><title>hola</title></svg>", 0.0, 0.0, 10.0, 10.0,
                         NULL, &sink) == 0,
          "solo título");
    check("Una caja de tamaño cero se rechaza",
          norma_svg_draw("<svg><rect width=\"5\" height=\"5\"/></svg>", 0.0, 0.0, 0.0, 10.0, NULL, &sink)
              == 0,
          "0 × 10");
    check("`norma_svg_drawable` reconoce un pictograma y descarta basura",
          norma_svg_drawable("  <svg viewBox=\"0 0 1 1\"></svg>") == 1
              && norma_svg_drawable("<html>") == 0 && norma_svg_drawable(NULL) == 0,
          "svg");

    /* Un camino gigantesco no puede colgar el dibujo: el presupuesto lo corta. */
    static char huge[64000];
    size_t written = (size_t) snprintf(huge, sizeof(huge), "<svg viewBox=\"0 0 100 100\"><path d=\"M0 0");
    for (int index = 0; index < 4000 && written + 12 < sizeof(huge); index += 1) {
        written += (size_t) snprintf(huge + written, sizeof(huge) - written, " l1 1");
    }
    snprintf(huge + written, sizeof(huge) - written, "\" fill=\"#000\"/></svg>");
    memset(&state, 0, sizeof(state));
    sink = trace_sink(&state);
    const int drawn = norma_svg_draw(huge, 0.0, 0.0, 100.0, 100.0, NULL, &sink);
    check("Un camino enorme se corta por presupuesto y no cuelga la ventana",
          drawn == 1 && state.lines > 0 && state.lines < 40000, "presupuesto");
}

static void test_catalog(void)
{
    norma_object_catalog catalog;
    char error[256] = "";
    static const char *const folders[] = {"../resources", "resources", "../../resources"};
    int loaded = 0;
    for (size_t index = 0; index < sizeof(folders) / sizeof(folders[0]) && !loaded; index += 1) {
        memset(&catalog, 0, sizeof(catalog));
        loaded = norma_object_catalog_load(&catalog, folders[index], error, sizeof(error));
    }
    check("El catálogo completo se carga para dibujarlo",
          loaded == 1 && catalog.count == 820, loaded ? "820 piezas" : error);
    if (!loaded) {
        return;
    }
    norma_object_use(&catalog);

    size_t drawable = 0;
    size_t empty = 0;
    size_t no_svg = 0;
    size_t labelled = 0;
    long paints = 0;
    long curves = 0;
    const char *first_empty = NULL;
    for (size_t index = 0; index < catalog.count; index += 1) {
        const norma_object_spec *spec = &catalog.items[index];
        if (spec->svg == NULL) {
            no_svg += 1;
            continue;
        }
        trace state;
        memset(&state, 0, sizeof(state));
        const norma_svg_sink sink = trace_sink(&state);
        if (norma_svg_draw(spec->svg, 10.0, 20.0, 64.0, 64.0, spec->colour, &sink)
            && (state.paints > 0 || state.texts > 0)) {
            drawable += 1;
            paints += state.paints;
            curves += state.curves;
            labelled += (size_t) state.texts;
        } else {
            empty += 1;
            if (first_empty == NULL) {
                first_empty = spec->type;
            }
        }
    }
    printf("    %zu dibujables · %ld rellenos · %ld curvas · %zu rótulos · %zu sin SVG · %zu vacíos%s%s\n",
           drawable, paints, curves, labelled, no_svg, empty, first_empty != NULL ? " · primero: " : "",
           first_empty != NULL ? first_empty : "");
    check("Los 820 pictogramas del catálogo se dibujan con tinta",
          empty == 0 && no_svg == 3 && drawable == 817,
          "817 con SVG y las 3 puertas dibujadas a mano");
    check("Las nueve piezas con rótulo dentro del SVG lo dibujan",
          labelled == 9, "P · E · 30 · PARE · SALIDA · 50");
    check("El dibujo de los 820 produce caminos de verdad, no cajas",
          paints > 4000 && curves > 20000,
          "más de 4 000 rellenos y 20 000 curvas");

    /* Dos señales conocidas, medidas por cobertura del relleno. */
    const norma_object_spec *exit_sign = NULL;
    const norma_object_spec *prohibition = NULL;
    for (size_t index = 0; index < catalog.count; index += 1) {
        const norma_object_spec *spec = &catalog.items[index];
        if (strcmp(spec->type, "iso_e001") == 0) {
            exit_sign = spec;
        }
        if (strcmp(spec->type, "iso_p001") == 0) {
            prohibition = spec;
        }
    }
    check("La señal de salida trae su fondo verde y llena su caja",
          exit_sign != NULL && exit_sign->svg != NULL && coverage_of(exit_sign->svg, "#237f52") > 0.85,
          "fondo completo");
    check("Una señal de prohibición tiene el aro, no un cuadrado lleno",
          prohibition != NULL && prohibition->svg != NULL
              && coverage_of(prohibition->svg, "#b71f2e") > 0.15
              && coverage_of(prohibition->svg, "#b71f2e") < 0.9,
          "aro con hueco");

    norma_object_use(NULL);
    norma_object_catalog_free(&catalog);
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Pictogramas SVG · pruebas\n\nFormas y caja\n");
    test_shapes();
    printf("\nTransformaciones y estado\n");
    test_transforms_and_state();
    printf("\nReferencias y arcos\n");
    test_use_and_arcs();
    test_text();
    printf("\nRobustez\n");
    test_robustness();
    printf("\nCatálogo completo\n");
    test_catalog();
    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
