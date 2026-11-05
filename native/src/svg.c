/*
 * Normia nativo · exportación SVG.
 */
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

static void write_marker(norma_buffer *buffer, const norma_element *element)
{
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
        } else if (element->node_count < 2) {
            write_marker(&buffer, element);
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
