/*
 * Normia nativo · lectura del plano.
 *
 * Espejo de `DesignImporter::parse()` (sobre) y de `MepCalculator::length()` +
 * `PathGeometry::length()` (medida de un trazo con arcos).
 */
#include "normia/plan.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/geometry.h"

/** Nodo del diseño: el sobre lo lleva en `design`; un diseño suelto es la raíz. */
static const norma_json *design_node(const norma_json *document)
{
    if (document == NULL || document->type != NORMA_JSON_OBJECT) {
        return NULL;
    }
    const norma_json *design = norma_json_get(document, "design");
    if (design != NULL && design->type == NORMA_JSON_OBJECT) {
        return design;
    }
    if (norma_json_get(document, "canvas") != NULL) {
        return document;
    }
    return NULL;
}

static int read_points(const norma_json *element, norma_point **points, size_t *count)
{
    *points = NULL;
    *count = 0;
    const norma_json *array = norma_json_get(element, "points");
    if (array == NULL || array->type != NORMA_JSON_ARRAY || array->length < 2) {
        return 0;
    }
    norma_point *list = (norma_point *) calloc(array->length, sizeof(norma_point));
    if (list == NULL) {
        return 0;
    }
    for (size_t index = 0; index < array->length; index += 1) {
        const norma_json *point = norma_json_at(array, index);
        list[index].x = norma_json_number(norma_json_get(point, "x"), 0.0);
        list[index].y = norma_json_number(norma_json_get(point, "y"), 0.0);
    }
    *points = list;
    *count = array->length;
    return 1;
}

/** Arcos por tramo: `curves[i] = {kind: "arc", through: {x, y}}`. */
static int read_curves(const norma_json *element, size_t segments, norma_arc **arcs, int *has_arc)
{
    *arcs = NULL;
    *has_arc = 0;
    const norma_json *curves = norma_json_get(element, "curves");
    if (curves == NULL || curves->type != NORMA_JSON_ARRAY || segments == 0) {
        return 1;
    }
    norma_arc *list = (norma_arc *) calloc(segments, sizeof(norma_arc));
    if (list == NULL) {
        return 0;
    }
    *arcs = list;
    return 1;
}

double norma_plan_element_length_cm(const norma_json *element)
{
    norma_point *points = NULL;
    size_t count = 0;
    if (!read_points(element, &points, &count)) {
        return 0.0;
    }
    norma_arc *arcs = NULL;
    int has_arc = 0;
    read_curves(element, count - 1, &arcs, &has_arc);
    if (arcs != NULL) {
        const norma_json *curves = norma_json_get(element, "curves");
        for (size_t index = 0; index + 1 < count; index += 1) {
            const norma_json *curve = norma_json_at(curves, index);
            if (curve == NULL || curve->type != NORMA_JSON_OBJECT) {
                continue;
            }
            if (strcmp(norma_json_string_at(curve, "kind", ""), "arc") != 0) {
                continue;
            }
            const norma_json *through = norma_json_get(curve, "through");
            if (through == NULL || through->type != NORMA_JSON_OBJECT) {
                continue;
            }
            const norma_point middle = {
                norma_json_number(norma_json_get(through, "x"), 0.0),
                norma_json_number(norma_json_get(through, "y"), 0.0),
            };
            arcs[index] = norma_arc_from_points(points[index], middle, points[index + 1]);
        }
    }
    const double length = norma_polyline_length(points, count, arcs);
    free(points);
    free(arcs);
    return length;
}

int norma_plan_analyze(const norma_json *document, norma_plan_stats *out, char *error, size_t error_size)
{
    if (out == NULL) {
        return 0;
    }
    memset(out, 0, sizeof(*out));
    const norma_json *design = design_node(document);
    if (design == NULL) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "el archivo no tiene un plano de Normia");
        }
        return 0;
    }
    const norma_json *canvas = norma_json_get(design, "canvas");
    if (canvas == NULL || canvas->type != NORMA_JSON_OBJECT) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "el plano no declara el lienzo");
        }
        return 0;
    }
    out->width = norma_json_number(norma_json_get(canvas, "width"), 0.0);
    out->height = norma_json_number(norma_json_get(canvas, "height"), 0.0);
    out->unit = norma_unit_from_name(norma_json_string(norma_json_get(canvas, "unit")));
    snprintf(out->scale, sizeof(out->scale), "%s", norma_json_string_at(canvas, "scale", "1:100"));

    const norma_json *elements = norma_json_get(design, "elements");
    const size_t total = norma_json_size(elements);
    out->elements = total;
    double wall_cm = 0.0;
    for (size_t index = 0; index < total; index += 1) {
        const norma_json *element = norma_json_at(elements, index);
        if (element == NULL || element->type != NORMA_JSON_OBJECT) {
            continue;
        }
        if (strcmp(norma_json_string_at(element, "type", ""), "wall") != 0) {
            continue;
        }
        out->walls += 1;
        const norma_json *curves = norma_json_get(element, "curves");
        if (curves != NULL && curves->type == NORMA_JSON_ARRAY) {
            for (size_t c = 0; c < curves->length; c += 1) {
                const norma_json *curve = norma_json_at(curves, c);
                if (curve != NULL && strcmp(norma_json_string_at(curve, "kind", ""), "arc") == 0) {
                    out->curved_walls += 1;
                    break;
                }
            }
        }
        wall_cm += norma_plan_element_length_cm(element);
    }
    out->wall_length_cm = wall_cm;
    out->wall_length_m = norma_to_meters(wall_cm, NORMA_UNIT_CM);
    out->canvas_area_m2 = norma_square_meters(out->width * out->height, out->unit);
    return 1;
}

int norma_plan_analyze_text(const char *text, size_t length, norma_plan_stats *out, char *error, size_t error_size)
{
    char parse_error[128];
    norma_json *document = norma_json_parse(text, length, parse_error, sizeof(parse_error));
    if (document == NULL) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "el archivo no es JSON válido: %s", parse_error);
        }
        return 0;
    }
    const int ok = norma_plan_analyze(document, out, error, error_size);
    norma_json_free(document);
    return ok;
}
