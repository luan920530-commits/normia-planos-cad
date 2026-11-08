/*
 * Normia nativo · exportación SVG.
 */
#include "normia/object.h"
#include "normia/svg.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/format.h"
#include "normia/jsonw.h"

/** Ancho mínimo del papel, como en `SvgExporter` (190 mm). */
static const double NORMA_MIN_SHEET_MM = 190.0;

/** Alto de la franja de datos, en milímetros. */
static const double NORMA_BAND_MM = 24.0;

static const double NORMA_GRID_CM = 20.0;


/**
 * Texto para XML: se escapan `&`, `<`, `>` y las comillas. No es JSON: aquí no
 * se ponen comillas alrededor del texto, solo se protege lo que lo rompería.
 */
static void write_xml(norma_buffer *buffer, const char *text)
{
    if (text == NULL) {
        return;
    }
    for (const char *cursor = text; *cursor != '\0'; cursor += 1) {
        switch (*cursor) {
        case '&': norma_buffer_raw(buffer, "&amp;"); break;
        case '<': norma_buffer_raw(buffer, "&lt;"); break;
        case '>': norma_buffer_raw(buffer, "&gt;"); break;
        case '"': norma_buffer_raw(buffer, "&quot;"); break;
        case '\'': norma_buffer_raw(buffer, "&apos;"); break;
        default: norma_buffer_raw(buffer, (char[2]) {*cursor, '\0'}); break;
        }
    }
}

/** Redondeo a dos decimales, alejándose del cero en el medio. */
static double round_hundredths(double value)
{
    const double scaled = fabs(value) * 100.0;
    const double rounded = floor(scaled + 0.5) / 100.0;
    return value < 0.0 ? -rounded : rounded;
}

void norma_svg_number(double value, char *out, size_t size)
{
    if (out == NULL || size == 0) {
        return;
    }
    out[0] = '\0';
    if (!isfinite(value)) {
        snprintf(out, size, "0");
        return;
    }
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "%.2f", round_hundredths(value));
    /* Se quitan los ceros de la derecha y el punto que queda suelto. */
    size_t length = strlen(buffer);
    while (length > 0 && buffer[length - 1] == '0') {
        buffer[length - 1] = '\0';
        length -= 1;
    }
    if (length > 0 && buffer[length - 1] == '.') {
        buffer[length - 1] = '\0';
        length -= 1;
    }
    if (length == 0 || strcmp(buffer, "-0") == 0) {
        snprintf(out, size, "0");
        return;
    }
    snprintf(out, size, "%s", buffer);
}

double norma_svg_mm_per_cm(const char *scale)
{
    const double denominator = norma_scale_denominator(scale);
    const double valid = denominator > 0.0 ? denominator : 100.0;
    return 10.0 / valid;
}

int norma_svg_path_cm(const norma_element *element, char *out, size_t size)
{
    if (element == NULL || out == NULL || size == 0 || element->node_count < 2) {
        return 0;
    }
    norma_buffer buffer;
    norma_buffer_init(&buffer);
    char number[64];

    norma_svg_number(element->nodes[0].x, number, sizeof(number));
    norma_buffer_raw(&buffer, "M ");
    norma_buffer_raw(&buffer, number);
    norma_buffer_raw(&buffer, " ");
    norma_svg_number(element->nodes[0].y, number, sizeof(number));
    norma_buffer_raw(&buffer, number);

    for (size_t index = 0; index + 1 < element->node_count; index += 1) {
        const norma_point next = element->nodes[index + 1];
        const norma_arc *arc = &element->arcs[index];
        if (arc->valid) {
            norma_buffer_raw(&buffer, " A ");
            norma_svg_number(arc->r, number, sizeof(number));
            norma_buffer_raw(&buffer, number);
            norma_buffer_raw(&buffer, " ");
            norma_buffer_raw(&buffer, number);
            norma_buffer_raw(&buffer, " 0 ");
            norma_buffer_raw(&buffer, arc->sweep > 3.14159265358979323846 ? "1" : "0");
            norma_buffer_raw(&buffer, " ");
            norma_buffer_raw(&buffer, arc->direction > 0 ? "1" : "0");
            norma_buffer_raw(&buffer, " ");
        } else {
            norma_buffer_raw(&buffer, " L ");
        }
        norma_svg_number(next.x, number, sizeof(number));
        norma_buffer_raw(&buffer, number);
        norma_buffer_raw(&buffer, " ");
        norma_svg_number(next.y, number, sizeof(number));
        norma_buffer_raw(&buffer, number);
    }

    if (buffer.failed) {
        norma_buffer_free(&buffer);
        return 0;
    }
    snprintf(out, size, "%s", norma_buffer_text(&buffer));
    norma_buffer_free(&buffer);
    return 1;
}

/* ------------------------------- documento -------------------------------- */

static void write_grid(norma_buffer *buffer, const norma_document *document)
{
    char x[32];
    char height[32];
    norma_svg_number(document->height, height, sizeof(height));
    norma_buffer_raw(buffer, "  <g stroke=\"#e6e9ef\" stroke-width=\"0.4\">\n");
    for (double value = NORMA_GRID_CM; value < document->width; value += NORMA_GRID_CM) {
        norma_svg_number(value, x, sizeof(x));
        norma_buffer_raw(buffer, "    <line x1=\"");
        norma_buffer_raw(buffer, x);
        norma_buffer_raw(buffer, "\" y1=\"0\" x2=\"");
        norma_buffer_raw(buffer, x);
        norma_buffer_raw(buffer, "\" y2=\"");
        norma_buffer_raw(buffer, height);
        norma_buffer_raw(buffer, "\"/>\n");
    }
    char width[32];
    norma_svg_number(document->width, width, sizeof(width));
    for (double value = NORMA_GRID_CM; value < document->height; value += NORMA_GRID_CM) {
        norma_svg_number(value, x, sizeof(x));
        norma_buffer_raw(buffer, "    <line x1=\"0\" y1=\"");
        norma_buffer_raw(buffer, x);
        norma_buffer_raw(buffer, "\" x2=\"");
        norma_buffer_raw(buffer, width);
        norma_buffer_raw(buffer, "\" y2=\"");
        norma_buffer_raw(buffer, x);
        norma_buffer_raw(buffer, "\"/>\n");
    }
    norma_buffer_raw(buffer, "  </g>\n");
}

static void write_dimension(norma_buffer *buffer, const norma_document *document, const norma_element *element)
{
    const norma_point a = element->nodes[0];
    const norma_point b = element->nodes[element->node_count - 1];
    char value[32];
    char caption[64];
    const double length_cm = norma_distance(a, b);
    norma_format_measure_cm(length_cm, document->unit, caption, sizeof(caption));

    norma_buffer_raw(buffer, "    <g stroke=\"#475569\" stroke-width=\"1.5\">\n");
    norma_buffer_raw(buffer, "      <line x1=\"");
    norma_svg_number(a.x, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" y1=\"");
    norma_svg_number(a.y, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" x2=\"");
    norma_svg_number(b.x, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" y2=\"");
    norma_svg_number(b.y, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\"/>\n");
    /* Marcas en los extremos, de 6 cm a cada lado del eje. */
    for (int end = 0; end < 2; end += 1) {
        const norma_point point = end == 0 ? a : b;
        norma_buffer_raw(buffer, "      <line x1=\"");
        norma_svg_number(point.x, value, sizeof(value));
        norma_buffer_raw(buffer, value);
        norma_buffer_raw(buffer, "\" y1=\"");
        norma_svg_number(point.y - 6.0, value, sizeof(value));
        norma_buffer_raw(buffer, value);
        norma_buffer_raw(buffer, "\" x2=\"");
        norma_svg_number(point.x, value, sizeof(value));
        norma_buffer_raw(buffer, value);
        norma_buffer_raw(buffer, "\" y2=\"");
        norma_svg_number(point.y + 6.0, value, sizeof(value));
        norma_buffer_raw(buffer, value);
        norma_buffer_raw(buffer, "\" stroke-width=\"0.8\"/>\n");
    }
    norma_buffer_raw(buffer, "    </g>\n");
    norma_buffer_raw(buffer, "    <text x=\"");
    norma_svg_number((a.x + b.x) / 2.0, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" y=\"");
    norma_svg_number((a.y + b.y) / 2.0 - 8.0, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" text-anchor=\"middle\" font-size=\"12\" fill=\"#475569\""
                            " font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">");
    write_xml(buffer, caption);
    norma_buffer_raw(buffer, "</text>\n");
}

/**
 * Señal o equipo: si el catálogo local reconoce su tipo, se inserta el
 * pictograma real dentro de la caja del elemento; si no, queda el marcador
 * genérico del núcleo. Nunca se inventa un dibujo que no esté en el catálogo.
 */
/** Número suelto en el SVG, sin ceros de más. */
static void poner(norma_buffer *buffer, double value)
{
    char text[32];
    norma_svg_number(value, text, sizeof(text));
    norma_buffer_raw(buffer, text);
}

/** Color de cada equipo: el mismo criterio en la pantalla y en el papel. */
static const char *object_colour(const norma_element *element)
{
    const char *type = element->type;
    /* Todos los extintores del catálogo empiezan igual; el lienzo hace la misma
       comprobación por prefijo. */
    if (strncmp(type, "cad_fire_ext", 12) == 0 || strcmp(type, "cad_eds_extinguisher") == 0
        || strcmp(type, "cad_drg_extinguisher") == 0) {
        return "#b91c1c";
    }
    if (strcmp(type, "cad_emg_firstaid") == 0) {
        return "#15803d";
    }
    if (strcmp(type, "cad_emg_stretcher") == 0 || strcmp(type, "cad_hosp_stretcher") == 0) {
        return "#0e7490";
    }
    if (strcmp(type, "cad_emg_aed") == 0) {
        return "#7c3aed";
    }
    if (strcmp(type, "cad_emg_meeting") == 0) {
        return "#047857";
    }
    return "#334155";
}

/**
 * Puerta en planta: el mismo dibujo que `SvgExporter::doorMarkup()` de la web
 * —jambas, umbral discontinuo, hoja y arco de apertura—, para que lo que se
 * imprime desde la ventana nativa no salga con un símbolo distinto. Una puerta
 * marcada como salida se dibuja en verde de evacuación.
 */
static void write_door(norma_buffer *buffer, const norma_element *element)
{
    const double x = element->x;
    const double y = element->y;
    const double w = element->w > 0.0 ? element->w : 90.0;
    const double h = element->h > 0.0 ? element->h : 90.0;
    const double stroke = element->stroke > 0.0 ? element->stroke : 2.0;
    const char *colour = element->is_exit ? "#237f52" : "#475569";
    const double edge = y + h;
    const double jamb = fmin(14.0, fmax(5.0, h * 0.16));
    const double frame = fmax(1.8, stroke * 1.15);
    const double thin = fmax(1.0, stroke * 0.65);

    norma_buffer_raw(buffer, "    <g fill=\"none\" stroke=\"");
    norma_buffer_raw(buffer, colour);
    norma_buffer_raw(buffer, "\" stroke-linecap=\"round\">\n");
    /* Jambas: los dos extremos del vano, hacia dentro del recinto. */
    norma_buffer_raw(buffer, "      <path d=\"M ");
    poner(buffer, x);
    norma_buffer_raw(buffer, " ");
    poner(buffer, edge);
    norma_buffer_raw(buffer, " V ");
    poner(buffer, edge - jamb);
    norma_buffer_raw(buffer, " M ");
    poner(buffer, x + w);
    norma_buffer_raw(buffer, " ");
    poner(buffer, edge);
    norma_buffer_raw(buffer, " V ");
    poner(buffer, edge - jamb);
    norma_buffer_raw(buffer, "\" stroke-width=\"");
    poner(buffer, frame);
    norma_buffer_raw(buffer, "\"/>\n");
    /* Umbral: la línea del muro donde está el vano, discontinua. */
    norma_buffer_raw(buffer, "      <path d=\"M ");
    poner(buffer, x);
    norma_buffer_raw(buffer, " ");
    poner(buffer, edge);
    norma_buffer_raw(buffer, " H ");
    poner(buffer, x + w);
    norma_buffer_raw(buffer, "\" stroke-width=\"");
    poner(buffer, thin);
    norma_buffer_raw(buffer, "\" stroke-dasharray=\"4 4\" opacity=\".5\"/>\n");

    if (strcmp(element->type, "door_garage") == 0) {
        const double panel = fmin(30.0, fmax(10.0, h * 0.55));
        const double top = edge - panel;
        const double inner = fmax(6.0, w - 6.0);
        norma_buffer_raw(buffer, "      <rect x=\"");
        poner(buffer, x + 3.0);
        norma_buffer_raw(buffer, "\" y=\"");
        poner(buffer, top);
        norma_buffer_raw(buffer, "\" width=\"");
        poner(buffer, inner);
        norma_buffer_raw(buffer, "\" height=\"");
        poner(buffer, panel);
        norma_buffer_raw(buffer, "\" fill=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\" fill-opacity=\".1\" stroke=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\" stroke-width=\"");
        poner(buffer, fmax(1.2, stroke * 0.75));
        norma_buffer_raw(buffer, "\"/>\n");
        const int bars = (int) fmax(3.0, fmin(14.0, round(w / 16.0)));
        for (int bar = 1; bar < bars; bar += 1) {
            const double bar_x = x + 3.0 + (inner * (double) bar) / (double) bars;
            norma_buffer_raw(buffer, "      <path d=\"M ");
            poner(buffer, bar_x);
            norma_buffer_raw(buffer, " ");
            poner(buffer, top + 1.5);
            norma_buffer_raw(buffer, " V ");
            poner(buffer, edge - 1.5);
            norma_buffer_raw(buffer, "\" stroke=\"");
            norma_buffer_raw(buffer, colour);
            norma_buffer_raw(buffer, "\" stroke-width=\"");
            poner(buffer, fmax(0.9, stroke * 0.55));
            norma_buffer_raw(buffer, "\" opacity=\".75\"/>\n");
        }
        norma_buffer_raw(buffer, "    </g>\n");
        return;
    }

    const double leaf = fmax(8.0, fmin(strcmp(element->type, "door_double") == 0 ? w / 2.0 : w, h));
    const double leaf_width = fmax(2.2, stroke * 1.2);
    const int double_leaf = strcmp(element->type, "door_double") == 0;
    for (int side = 0; side < (double_leaf ? 2 : 1); side += 1) {
        const double hinge = side == 0 ? x : x + w;
        const double reach = side == 0 ? x + leaf : x + w - leaf;
        norma_buffer_raw(buffer, "      <path d=\"M ");
        poner(buffer, hinge);
        norma_buffer_raw(buffer, " ");
        poner(buffer, edge);
        norma_buffer_raw(buffer, " V ");
        poner(buffer, edge - leaf);
        norma_buffer_raw(buffer, "\" stroke-width=\"");
        poner(buffer, leaf_width);
        norma_buffer_raw(buffer, "\"/>\n");
        /* El arco de apertura, de la punta de la hoja al otro extremo del vano. */
        norma_buffer_raw(buffer, "      <path d=\"M ");
        poner(buffer, hinge);
        norma_buffer_raw(buffer, " ");
        poner(buffer, edge - leaf);
        norma_buffer_raw(buffer, " A ");
        poner(buffer, leaf);
        norma_buffer_raw(buffer, " ");
        poner(buffer, leaf);
        norma_buffer_raw(buffer, " 0 0 ");
        norma_buffer_raw(buffer, reach >= hinge ? "1" : "0");
        norma_buffer_raw(buffer, " ");
        poner(buffer, reach);
        norma_buffer_raw(buffer, " ");
        poner(buffer, edge);
        norma_buffer_raw(buffer, "\" stroke-width=\"");
        poner(buffer, fmax(1.0, stroke * 0.6));
        norma_buffer_raw(buffer, "\" opacity=\".55\"/>\n");
    }
    norma_buffer_raw(buffer, "    </g>\n");
}

/**
 * Pictograma de un equipo, con las mismas proporciones que el lienzo
 * (`drawObject:` de la ventana): cruz del botiquín, camilla, rayo del DEA,
 * flechas del punto de encuentro y extintor. Devuelve 1 si el tipo tiene
 * pictograma y 0 si no, para que el que llama decida qué dibujar.
 */
static int write_equipment_glyph(norma_buffer *buffer, const norma_element *element, const char *colour)
{
    const char *type = element->type;
    const double w = element->w;
    const double h = element->h > 0.0 ? element->h : element->w;
    const double size = fmin(w, h);
    if (size <= 0.0) {
        return 0;
    }
    const double cx = element->x + w / 2.0;
    const double cy = element->y + h / 2.0;

    if (strcmp(type, "cad_emg_firstaid") == 0) {
        /* Cruz del botiquín: dos barras centradas. */
        const double arm = size * 0.30;
        const double thick = size * 0.13;
        norma_buffer_raw(buffer, "    <g fill=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\">\n      <rect x=\"");
        poner(buffer, cx - arm);
        norma_buffer_raw(buffer, "\" y=\"");
        poner(buffer, cy - thick / 2.0);
        norma_buffer_raw(buffer, "\" width=\"");
        poner(buffer, arm * 2.0);
        norma_buffer_raw(buffer, "\" height=\"");
        poner(buffer, thick);
        norma_buffer_raw(buffer, "\"/>\n      <rect x=\"");
        poner(buffer, cx - thick / 2.0);
        norma_buffer_raw(buffer, "\" y=\"");
        poner(buffer, cy - arm);
        norma_buffer_raw(buffer, "\" width=\"");
        poner(buffer, thick);
        norma_buffer_raw(buffer, "\" height=\"");
        poner(buffer, arm * 2.0);
        norma_buffer_raw(buffer, "\"/>\n    </g>\n");
        return 1;
    }
    if (strcmp(type, "cad_emg_aed") == 0) {
        /* Rayo del desfibrilador. */
        norma_buffer_raw(buffer, "    <path fill=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\" d=\"M ");
        poner(buffer, cx + size * 0.06);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy - size * 0.30);
        norma_buffer_raw(buffer, " L ");
        poner(buffer, cx - size * 0.18);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy + size * 0.04);
        norma_buffer_raw(buffer, " L ");
        poner(buffer, cx + size * 0.02);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy + size * 0.04);
        norma_buffer_raw(buffer, " L ");
        poner(buffer, cx - size * 0.08);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy + size * 0.30);
        norma_buffer_raw(buffer, " L ");
        poner(buffer, cx + size * 0.20);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy - size * 0.06);
        norma_buffer_raw(buffer, " L ");
        poner(buffer, cx);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy - size * 0.06);
        norma_buffer_raw(buffer, " Z\"/>\n");
        return 1;
    }
    if (strcmp(type, "cad_emg_stretcher") == 0 || strcmp(type, "cad_hosp_stretcher") == 0) {
        /* Camilla: dos barrotes y la cabecera. */
        norma_buffer_raw(buffer, "    <g stroke=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\" fill=\"none\" stroke-width=\"");
        poner(buffer, size * 0.07);
        norma_buffer_raw(buffer, "\" stroke-linecap=\"round\">\n      <path d=\"M ");
        poner(buffer, cx - size * 0.34);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy - size * 0.16);
        norma_buffer_raw(buffer, " H ");
        poner(buffer, cx + size * 0.34);
        norma_buffer_raw(buffer, " M ");
        poner(buffer, cx - size * 0.34);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy + size * 0.16);
        norma_buffer_raw(buffer, " H ");
        poner(buffer, cx + size * 0.34);
        norma_buffer_raw(buffer, "\"/>\n    </g>\n    <ellipse cx=\"");
        poner(buffer, cx - size * 0.32);
        norma_buffer_raw(buffer, "\" cy=\"");
        poner(buffer, cy);
        norma_buffer_raw(buffer, "\" rx=\"");
        poner(buffer, size * 0.08);
        norma_buffer_raw(buffer, "\" ry=\"");
        poner(buffer, size * 0.12);
        norma_buffer_raw(buffer, "\" fill=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\"/>\n");
        return 1;
    }
    if (strcmp(type, "cad_emg_meeting") == 0) {
        /* Cuatro flechas hacia fuera. */
        const double inner = size * 0.16;
        const double outer = size * 0.38;
        const double tip = size * 0.11;
        static const double axis_x[4] = {1.0, 0.0, -1.0, 0.0};
        static const double axis_y[4] = {0.0, 1.0, 0.0, -1.0};
        norma_buffer_raw(buffer, "    <g stroke=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\" fill=\"none\" stroke-width=\"");
        poner(buffer, size * 0.09);
        norma_buffer_raw(buffer, "\" stroke-linecap=\"round\">\n      <path d=\"");
        for (int side = 0; side < 4; side += 1) {
            const double ux = axis_x[side];
            const double uy = axis_y[side];
            norma_buffer_raw(buffer, side == 0 ? "M " : " M ");
            poner(buffer, cx + ux * inner);
            norma_buffer_raw(buffer, " ");
            poner(buffer, cy + uy * inner);
            norma_buffer_raw(buffer, " L ");
            poner(buffer, cx + ux * outer);
            norma_buffer_raw(buffer, " ");
            poner(buffer, cy + uy * outer);
            norma_buffer_raw(buffer, " M ");
            poner(buffer, cx + ux * outer);
            norma_buffer_raw(buffer, " ");
            poner(buffer, cy + uy * outer);
            norma_buffer_raw(buffer, " L ");
            poner(buffer, cx + ux * (outer - tip) - uy * tip * 0.7);
            norma_buffer_raw(buffer, " ");
            poner(buffer, cy + uy * (outer - tip) + ux * tip * 0.7);
            norma_buffer_raw(buffer, " M ");
            poner(buffer, cx + ux * outer);
            norma_buffer_raw(buffer, " ");
            poner(buffer, cy + uy * outer);
            norma_buffer_raw(buffer, " L ");
            poner(buffer, cx + ux * (outer - tip) + uy * tip * 0.7);
            norma_buffer_raw(buffer, " ");
            poner(buffer, cy + uy * (outer - tip) - ux * tip * 0.7);
        }
        norma_buffer_raw(buffer, "\"/>\n    </g>\n");
        return 1;
    }
    if (strncmp(type, "cad_fire_ext", 12) == 0 || strstr(type, "extinguisher") != NULL) {
        /* Extintor: cuerpo, cuello y manguera. */
        norma_buffer_raw(buffer, "    <g fill=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\">\n      <rect x=\"");
        poner(buffer, cx - size * 0.13);
        norma_buffer_raw(buffer, "\" y=\"");
        poner(buffer, cy - size * 0.18);
        norma_buffer_raw(buffer, "\" width=\"");
        poner(buffer, size * 0.26);
        norma_buffer_raw(buffer, "\" height=\"");
        poner(buffer, size * 0.42);
        norma_buffer_raw(buffer, "\"/>\n      <rect x=\"");
        poner(buffer, cx - size * 0.04);
        norma_buffer_raw(buffer, "\" y=\"");
        poner(buffer, cy - size * 0.32);
        norma_buffer_raw(buffer, "\" width=\"");
        poner(buffer, size * 0.08);
        norma_buffer_raw(buffer, "\" height=\"");
        poner(buffer, size * 0.14);
        norma_buffer_raw(buffer, "\"/>\n    </g>\n    <path fill=\"none\" stroke=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\" stroke-width=\"");
        poner(buffer, size * 0.07);
        norma_buffer_raw(buffer, "\" stroke-linecap=\"round\" d=\"M ");
        poner(buffer, cx + size * 0.04);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy - size * 0.28);
        norma_buffer_raw(buffer, " L ");
        poner(buffer, cx + size * 0.22);
        norma_buffer_raw(buffer, " ");
        poner(buffer, cy - size * 0.20);
        norma_buffer_raw(buffer, "\"/>\n");
        return 1;
    }
    return 0;
}

/**
 * Equipo o señal con caja: si el catálogo lo reconoce se inserta su pictograma
 * real (`norma_library_nested_svg`); si no, se dibuja una caja rotulada para que
 * el objeto no desaparezca del plano impreso.
 */
static void write_box_object(norma_buffer *buffer, const norma_element *element,
                            const norma_library *library)
{
    /* Un texto no es una caja: se rotula donde está y nada más. */
    if (strcmp(element->type, "text") == 0) {
        if (element->label[0] == '\0') {
            return;
        }
        const double size = element->h > 0.0 ? fmax(4.0, element->h * 0.55) : 14.0;
        norma_buffer_raw(buffer, "    <text x=\"");
        poner(buffer, element->x);
        norma_buffer_raw(buffer, "\" y=\"");
        poner(buffer, element->y + size);
        norma_buffer_raw(buffer, "\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"");
        poner(buffer, size);
        norma_buffer_raw(buffer, "\" font-weight=\"600\" fill=\"#0f172a\">");
        write_xml(buffer, element->label);
        norma_buffer_raw(buffer, "</text>\n");
        return;
    }
    const double w = element->w;
    const double h = element->h > 0.0 ? element->h : element->w;
    const char *colour = object_colour(element);
    if (library != NULL) {
        char code[64];
        const char *resolved = norma_library_code_for_type(library, element->type, code, sizeof(code));
        const norma_sign *sign = resolved != NULL ? norma_library_sign(library, resolved) : NULL;
        if (sign != NULL && norma_library_nested_svg(sign, element->x, element->y, w, h, sign->color, buffer)) {
            return;
        }
    }
    norma_buffer_raw(buffer, "    <g fill=\"");
    norma_buffer_raw(buffer, colour);
    norma_buffer_raw(buffer, "\" fill-opacity=\".12\" stroke=\"");
    norma_buffer_raw(buffer, colour);
    norma_buffer_raw(buffer, "\" stroke-width=\"1.2\">\n      <rect x=\"");
    poner(buffer, element->x);
    norma_buffer_raw(buffer, "\" y=\"");
    poner(buffer, element->y);
    norma_buffer_raw(buffer, "\" width=\"");
    poner(buffer, w);
    norma_buffer_raw(buffer, "\" height=\"");
    poner(buffer, h);
    norma_buffer_raw(buffer, "\" rx=\"");
    poner(buffer, fmin(4.0, fmin(w, h) * 0.12));
    norma_buffer_raw(buffer, "\"/>\n    </g>\n");
    (void) write_equipment_glyph(buffer, element, colour);
    /* Rótulo: el nombre del objeto o su código, dentro de la caja. */
    const char *caption = element->label[0] != '\0' ? element->label : NULL;
    if (caption != NULL) {
        norma_buffer_raw(buffer, "    <text x=\"");
        poner(buffer, element->x + w / 2.0);
        norma_buffer_raw(buffer, "\" y=\"");
        poner(buffer, element->y + h / 2.0 + fmin(w, h) * 0.09);
        norma_buffer_raw(buffer, "\" text-anchor=\"middle\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"");
        poner(buffer, fmax(3.0, fmin(w, h) * 0.26));
        norma_buffer_raw(buffer, "\" fill=\"");
        norma_buffer_raw(buffer, colour);
        norma_buffer_raw(buffer, "\">");
        write_xml(buffer, caption);
        norma_buffer_raw(buffer, "</text>\n");
    }
}

static void write_marker(norma_buffer *buffer, const norma_element *element, const norma_library *library)
{
    if (library != NULL) {
        char code[64];
        const char *resolved = norma_library_code_for_type(library, element->type, code, sizeof(code));
        const norma_sign *sign = resolved != NULL ? norma_library_sign(library, resolved) : NULL;
        if (sign != NULL) {
            const double width = element->w > 0.0 ? element->w : 40.0;
            const double height = element->h > 0.0 ? element->h : width;
            const double x = element->w > 0.0 ? element->x : element->x - width / 2.0;
            const double y = element->h > 0.0 ? element->y : element->y - height / 2.0;
            if (norma_library_nested_svg(sign, x, y, width, height, sign->color, buffer)) {
                return;
            }
        }
    }
    char value[32];
    norma_buffer_raw(buffer, "    <g stroke=\"#d97706\" fill=\"none\" stroke-width=\"1.2\">\n      <circle cx=\"");
    norma_svg_number(element->x, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" cy=\"");
    norma_svg_number(element->y, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" r=\"12\"/>\n      <path d=\"M ");
    norma_svg_number(element->x - 17.0, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, " ");
    norma_svg_number(element->y, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, " L ");
    norma_svg_number(element->x + 17.0, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, " ");
    norma_svg_number(element->y, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, " M ");
    norma_svg_number(element->x, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, " ");
    norma_svg_number(element->y - 17.0, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, " L ");
    norma_svg_number(element->x, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, " ");
    norma_svg_number(element->y + 17.0, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\"/>\n    </g>\n");
}

static void write_band(norma_buffer *buffer, const norma_document *document, const char *title,
                       double mm_per_cm, double width_units, double band_units)
{
    char value[32];
    const double band_top = document->height;
    (void) band_units;
    norma_buffer_raw(buffer, "  <g font-family=\"system-ui, -apple-system, Segoe UI, sans-serif\">\n");
    norma_buffer_raw(buffer, "    <rect x=\"0\" y=\"");
    norma_svg_number(band_top, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" width=\"");
    norma_svg_number(width_units, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" height=\"24\" fill=\"#f1f4f9\"/>\n");
    norma_buffer_raw(buffer, "    <text x=\"8\" y=\"");
    norma_svg_number(band_top + 15.5, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" font-size=\"11\" font-weight=\"600\" fill=\"#0f172a\">");
    write_xml(buffer, title != NULL && title[0] != '\0' ? title : "Plano sin título");
    norma_buffer_raw(buffer, "</text>\n");
    norma_buffer_raw(buffer, "    <text x=\"");
    norma_svg_number(width_units - 8.0, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" y=\"");
    norma_svg_number(band_top + 15.5, value, sizeof(value));
    norma_buffer_raw(buffer, value);
    norma_buffer_raw(buffer, "\" font-size=\"9\" text-anchor=\"end\" fill=\"#475569\">");
    char note[160];
    snprintf(note, sizeof(note), "Escala %s · %s · %s", document->scale,
             norma_unit_name(document->unit),
             mm_per_cm > 0.0 ? "Normia nativo · esquema de apoyo, no es un plano de obra" : "");
    write_xml(buffer, note);
    norma_buffer_raw(buffer, "</text>\n  </g>\n");
}

char *norma_document_to_svg(const norma_document *document, const norma_svg_options *options)
{
    if (document == NULL) {
        return NULL;
    }
    const double mm_per_cm = norma_svg_mm_per_cm(document->scale);
    const double plan_width_mm = document->width * mm_per_cm;
    const double width_mm = plan_width_mm > NORMA_MIN_SHEET_MM ? plan_width_mm : NORMA_MIN_SHEET_MM;
    const double band_units = NORMA_BAND_MM / mm_per_cm;
    const double height_mm = document->height * mm_per_cm + (options != NULL && options->band ? NORMA_BAND_MM : 0.0);
    /* El viewBox va en unidades del plano (centímetros) y el ancho del papel en
       milímetros: la escala física queda declarada, no dibujada. */
    const double view_width = width_mm / mm_per_cm;
    const double view_height = document->height + (options != NULL && options->band ? band_units : 0.0);

    norma_buffer buffer;
    norma_buffer_init(&buffer);
    char value[32];

    norma_buffer_raw(&buffer, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    norma_buffer_raw(&buffer, "<svg xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" width=\"");
    snprintf(value, sizeof(value), "%.2fmm", width_mm);
    norma_buffer_raw(&buffer, value);
    norma_buffer_raw(&buffer, "\" height=\"");
    snprintf(value, sizeof(value), "%.2fmm", height_mm);
    norma_buffer_raw(&buffer, value);
    norma_buffer_raw(&buffer, "\" viewBox=\"0 0 ");
    norma_svg_number(view_width, value, sizeof(value));
    norma_buffer_raw(&buffer, value);
    norma_buffer_raw(&buffer, " ");
    norma_svg_number(view_height, value, sizeof(value));
    norma_buffer_raw(&buffer, value);
    norma_buffer_raw(&buffer, "\">\n  <title>");
    write_xml(&buffer, options != NULL && options->title != NULL ? options->title : "Plano de Normia");
    norma_buffer_raw(&buffer, "</title>\n  <rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>\n");

    if (options == NULL || options->grid) {
        write_grid(&buffer, document);
    }

    norma_buffer_raw(&buffer, "  <g fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n");
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (strcmp(element->type, "dimension") == 0 || element->node_count < 2) {
            continue; /* las cotas llevan texto y se dibujan aparte */
        }
        char path[4096];
        if (!norma_svg_path_cm(element, path, sizeof(path))) {
            continue;
        }
        const char *colour = strcmp(element->type, "wall") == 0 ? "#0f172a" : "#334155";
        const double stroke = strcmp(element->type, "wall") == 0 ? 1.5 : 1.1;
        norma_buffer_raw(&buffer, "    <path d=\"");
        norma_buffer_raw(&buffer, path);
        norma_buffer_raw(&buffer, "\" stroke=\"");
        norma_buffer_raw(&buffer, colour);
        norma_buffer_raw(&buffer, "\" stroke-width=\"");
        norma_svg_number(stroke, value, sizeof(value));
        norma_buffer_raw(&buffer, value);
        norma_buffer_raw(&buffer, "\"/>\n");
    }
    norma_buffer_raw(&buffer, "  </g>\n");

    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (strcmp(element->type, "dimension") == 0 && element->node_count >= 2) {
            write_dimension(&buffer, document, element);
        } else if (element->node_count < 2 && norma_object_is_door(element->type)) {
            write_door(&buffer, element);
        } else if (element->node_count < 2 && element->w > 0.0) {
            write_box_object(&buffer, element, options != NULL ? options->library : NULL);
        } else if (element->node_count < 2) {
            write_marker(&buffer, element, options != NULL ? options->library : NULL);
        }
    }

    if (options != NULL && options->band) {
        write_band(&buffer, document, options->title, mm_per_cm, view_width, band_units);
    }
    norma_buffer_raw(&buffer, "</svg>\n");

    if (buffer.failed) {
        norma_buffer_free(&buffer);
        return NULL;
    }
    return buffer.text;
}
