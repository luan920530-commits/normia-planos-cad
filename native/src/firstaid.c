/*
 * Normia nativo · primeros auxilios del piso (espejo de FirstAidInventory).
 *
 * Las cifras se escriben con **un decimal y sin separador de miles**, igual que
 * `FirstAidInventory::number()`, que es distinto del formato del resto del
 * auditor (dos decimales con puntos de mil). No es un descuido: el detalle del
 * hallazgo tiene que decir lo mismo en las dos ediciones.
 */
#include "normia/firstaid.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

/** Una décima, con coma decimal y sin separador de miles (`number_format(…,1,'.','')`). */
static void one_decimal(double value, char *out, size_t size)
{
    const int negative = value < 0.0;
    const long long tenths = (long long) floor(fabs(value) * 10.0 + 0.5);
    snprintf(out, size, "%s%lld,%lld", negative && tenths != 0 ? "-" : "",
             tenths / 10, tenths % 10);
}

void norma_firstaid_criteria_default(norma_firstaid_criteria *criteria)
{
    if (criteria == NULL) {
        return;
    }
    criteria->kit_travel_m = 30.0;
    criteria->aed_travel_m = 100.0;
    criteria->aed_min_persons = 500;
    criteria->stretcher_per_floor = 1;
}

/* Tipos del catálogo CAD que cuentan como recurso (los mismos del PHP). */
static int is_kit_type(const char *type)
{
    return strcmp(type, "cad_emg_firstaid") == 0;
}

static int is_stretcher_type(const char *type)
{
    return strcmp(type, "cad_emg_stretcher") == 0 || strcmp(type, "cad_hosp_stretcher") == 0;
}

static int is_aed_type(const char *type)
{
    return strcmp(type, "cad_emg_aed") == 0;
}

/** Distancia del punto al recurso más cercano, en metros (línea recta). */
static double nearest_m(double x, double y, const double *centers, size_t count,
                        double meters_per_unit)
{
    double best = 0.0;
    for (size_t index = 0; index < count; index += 1) {
        const double dx = centers[index * 2] - x;
        const double dy = centers[index * 2 + 1] - y;
        const double distance = sqrt(dx * dx + dy * dy) * meters_per_unit;
        best = index == 0 ? distance : (distance < best ? distance : best);
    }
    return best;
}

void norma_firstaid_analyze(const norma_document *document, const norma_grid *grid, long people,
                            const char *source, const norma_firstaid_criteria *criteria,
                            norma_firstaid *first_aid, norma_findings *findings)
{
    if (first_aid == NULL) {
        return;
    }
    memset(first_aid, 0, sizeof(*first_aid));
    norma_firstaid_criteria defaults;
    if (criteria == NULL) {
        norma_firstaid_criteria_default(&defaults);
        criteria = &defaults;
    }
    const double kit_travel = criteria->kit_travel_m > 1.0 ? criteria->kit_travel_m : 1.0;
    const double aed_travel = criteria->aed_travel_m > 1.0 ? criteria->aed_travel_m : 1.0;
    const long aed_min = criteria->aed_min_persons > 1 ? criteria->aed_min_persons : 1;
    first_aid->people = people > 0 ? people : 0;
    snprintf(first_aid->source, sizeof(first_aid->source), "%s", source != NULL ? source : "");

    /* Centros de los recursos, en el orden del documento. */
    double kits[64 * 2];
    double aeds[64 * 2];
    const char *kit_ids[NORMA_FINDING_ELEMENTS];
    const char *aed_ids[NORMA_FINDING_ELEMENTS];
    size_t kit_centers = 0;
    size_t aed_centers = 0;
    size_t kit_total = 0;
    size_t aed_total = 0;
    size_t stretchers = 0;
    if (document != NULL) {
        for (size_t index = 0; index < document->count; index += 1) {
            const norma_element *element = &document->elements[index];
            const double cx = element->x + element->w / 2.0;
            const double cy = element->y + element->h / 2.0;
            if (is_kit_type(element->type)) {
                if (kit_centers < 64) {
                    kits[kit_centers * 2] = cx;
                    kits[kit_centers * 2 + 1] = cy;
                    kit_centers += 1;
                }
                if (kit_total < NORMA_FINDING_ELEMENTS) {
                    kit_ids[kit_total] = element->id;
                }
                kit_total += 1;
            } else if (is_stretcher_type(element->type)) {
                stretchers += 1;
            } else if (is_aed_type(element->type)) {
                if (aed_centers < 64) {
                    aeds[aed_centers * 2] = cx;
                    aeds[aed_centers * 2 + 1] = cy;
                    aed_centers += 1;
                }
                if (aed_total < NORMA_FINDING_ELEMENTS) {
                    aed_ids[aed_total] = element->id;
                }
                aed_total += 1;
            }
        }
    }
    first_aid->kit_count = kit_total;
    first_aid->stretcher_count = stretchers;
    first_aid->aed_count = aed_total;

    /* Cobertura: el punto más lejano del espacio libre. */
    if (grid != NULL && grid->blocked != NULL && grid->exterior != NULL
        && (kit_centers > 0 || aed_centers > 0)) {
        const double meters_per_unit = 0.01; /* geometría en centímetros */
        for (size_t iy = 0; iy < grid->ny; iy += 1) {
            for (size_t ix = 0; ix < grid->nx; ix += 1) {
                const size_t index = iy * grid->nx + ix;
                if (grid->blocked[index] || grid->exterior[index]) {
                    continue;
                }
                const double x = fmin(grid->width, ((double) ix + 0.5) * grid->cell);
                const double y = fmin(grid->height, ((double) iy + 0.5) * grid->cell);
                first_aid->cells += 1;
                if (kit_centers > 0) {
                    const double nearest = nearest_m(x, y, kits, kit_centers, meters_per_unit);
                    first_aid->kit_max_m = first_aid->has_kit_max && first_aid->kit_max_m > nearest
                                               ? first_aid->kit_max_m
                                               : nearest;
                    first_aid->has_kit_max = 1;
                }
                if (aed_centers > 0) {
                    const double nearest = nearest_m(x, y, aeds, aed_centers, meters_per_unit);
                    first_aid->aed_max_m = first_aid->has_aed_max && first_aid->aed_max_m > nearest
                                               ? first_aid->aed_max_m
                                               : nearest;
                    first_aid->has_aed_max = 1;
                }
            }
        }
    }
    /* Dos decimales, como `FirstAidInventory::round()` antes de escribir. */
    if (first_aid->has_kit_max) {
        first_aid->kit_max_m = round(first_aid->kit_max_m * 100.0) / 100.0;
    }
    if (first_aid->has_aed_max) {
        first_aid->aed_max_m = round(first_aid->aed_max_m * 100.0) / 100.0;
    }

    if (findings == NULL) {
        return;
    }

    char distance[48];
    char limit[48];
    char text[640];

    if (kit_total == 0) {
        norma_findings_add(findings, "no_first_aid_kit", "medium",
                           "Sin botiquín de primeros auxilios en el plano",
                           "El piso no tiene ningún botiquín ubicado. Si el piso cuenta con uno, ubícalo con "
                           "el objeto «Botiquín de primeros auxilios» para que el alcance sea visible; el "
                           "plano no puede comprobar su contenido ni su vigencia.",
                           NULL, 0, NULL, NULL);
    } else if (first_aid->has_kit_max && first_aid->kit_max_m > kit_travel) {
        one_decimal(first_aid->kit_max_m, distance, sizeof(distance));
        one_decimal(kit_travel, limit, sizeof(limit));
        snprintf(text, sizeof(text),
                 "El punto más lejano del espacio libre queda a %s m del botiquín más cercano y el criterio "
                 "de referencia es %s m. Ubica otro botiquín o revisa si el recorrido real permite llegar "
                 "antes.",
                 distance, limit);
        char value[64];
        snprintf(value, sizeof(value), "%s m", distance);
        norma_findings_add(findings, "first_aid_kit_far", "medium",
                           "Botiquín fuera del alcance de referencia", text, kit_ids,
                           kit_total < NORMA_FINDING_ELEMENTS ? kit_total : NORMA_FINDING_ELEMENTS,
                           NULL, value);
    }

    if (criteria->stretcher_per_floor && stretchers == 0) {
        norma_findings_add(findings, "no_stretcher", "medium", "Sin camilla en el plano",
                           "No hay camilla ubicada en el piso. Si la atención de primeros auxilios del piso "
                           "dispone de una, ubícala para que la brigada sepa dónde está; si se comparte "
                           "entre pisos, indícalo en el nombre del objeto para no contarla dos veces.",
                           NULL, 0, NULL, NULL);
    }

    if (aed_total == 0) {
        const int required = first_aid->people >= aed_min;
        if (required) {
            snprintf(text, sizeof(text),
                     "El piso calcula %ld personas y el umbral de referencia para contar con DEA es %ld. La "
                     "Ley 1831 de 2017 y la Resolución 3316 de 2019 regulan su uso: confirma con la "
                     "autoridad si tu establecimiento está obligado y, si lo tienes, ubícalo en el plano.",
                     first_aid->people, aed_min);
        } else {
            snprintf(text, sizeof(text),
                     "No hay DEA ubicado y el piso calcula %ld personas, por debajo del umbral de "
                     "referencia (%ld). No se declara obligatorio: si tu análisis de riesgo o la afluencia "
                     "real lo justifican, ubícalo para que su alcance quede a la vista.",
                     first_aid->people, aed_min);
        }
        char value[48];
        snprintf(value, sizeof(value), "%ld pers.", aed_min);
        norma_findings_add(findings, "no_aed", required ? "medium" : "low",
                           required ? "Sin DEA con la afluencia calculada"
                                    : "Sin desfibrilador externo automático (DEA)",
                           text, NULL, 0, NULL, value);
    } else if (first_aid->has_aed_max && first_aid->aed_max_m > aed_travel) {
        one_decimal(first_aid->aed_max_m, distance, sizeof(distance));
        one_decimal(aed_travel, limit, sizeof(limit));
        snprintf(text, sizeof(text),
                 "El punto más lejano del espacio libre queda a %s m del DEA y el criterio de referencia es "
                 "%s m. Un desfibrilador sirve si llega a tiempo: revisa si el recorrido real permite usarlo.",
                 distance, limit);
        char value[64];
        snprintf(value, sizeof(value), "%s m", distance);
        norma_findings_add(findings, "aed_far", "low", "DEA fuera del alcance de referencia", text,
                           aed_ids, aed_total < NORMA_FINDING_ELEMENTS ? aed_total : NORMA_FINDING_ELEMENTS,
                           NULL, value);
    }
}
