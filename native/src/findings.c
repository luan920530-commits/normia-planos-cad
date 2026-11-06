/*
 * Normia nativo · hallazgos del auditor (evacuación y aforo).
 *
 * Los textos son los del auditor web, palabra por palabra: un hallazgo que diga
 * lo mismo con otras palabras en la versión nativa haría dudar de cuál de las
 * dos es la buena.
 */
#include "normia/findings.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/format.h"

/** Gravedades en el orden en que se muestran. */
static const char *const kSeverities[4] = {"high", "medium", "low", "info"};

static int severity_rank(const char *severity)
{
    for (int index = 0; index < 4; index += 1) {
        if (strcmp(severity, kSeverities[index]) == 0) {
            return index;
        }
    }
    return 9;
}

void norma_findings_init(norma_findings *findings)
{
    if (findings == NULL) {
        return;
    }
    memset(findings, 0, sizeof(*findings));
}

void norma_findings_free(norma_findings *findings)
{
    if (findings == NULL) {
        return;
    }
    free(findings->items);
    findings->items = NULL;
    findings->count = 0;
    findings->capacity = 0;
}

static norma_finding *reserve(norma_findings *findings)
{
    if (findings->failed) {
        return NULL;
    }
    if (findings->count == findings->capacity) {
        const size_t capacity = findings->capacity == 0 ? 8 : findings->capacity * 2;
        norma_finding *grown = (norma_finding *) realloc(findings->items, capacity * sizeof(norma_finding));
        if (grown == NULL) {
            findings->failed = 1;
            return NULL;
        }
        findings->items = grown;
        findings->capacity = capacity;
    }
    return &findings->items[findings->count];
}

void norma_findings_add(norma_findings *findings, const char *code, const char *severity,
                        const char *title, const char *detail,
                        const char *const *elements, size_t element_count,
                        const norma_point *position, const char *value)
{
    if (findings == NULL || code == NULL || severity == NULL) {
        return;
    }
    norma_finding *finding = reserve(findings);
    if (finding == NULL) {
        return;
    }
    memset(finding, 0, sizeof(*finding));
    snprintf(finding->code, sizeof(finding->code), "%s", code);
    snprintf(finding->severity, sizeof(finding->severity), "%s", severity);
    snprintf(finding->title, sizeof(finding->title), "%s", title != NULL ? title : "");
    snprintf(finding->detail, sizeof(finding->detail), "%s", detail != NULL ? detail : "");
    if (elements != NULL) {
        for (size_t index = 0; index < element_count && index < NORMA_FINDING_ELEMENTS; index += 1) {
            if (elements[index] == NULL) {
                continue;
            }
            snprintf(finding->element_ids[finding->element_count], 32, "%s", elements[index]);
            finding->element_count += 1;
        }
    }
    if (position != NULL) {
        finding->has_position = 1;
        finding->position.x = round(position->x * 100.0) / 100.0;
        finding->position.y = round(position->y * 100.0) / 100.0;
    }
    if (value != NULL) {
        finding->has_value = 1;
        snprintf(finding->value, sizeof(finding->value), "%s", value);
    }
    findings->count += 1;
}

void norma_findings_sort(norma_findings *findings)
{
    if (findings == NULL || findings->count < 2) {
        return;
    }
    for (size_t index = 1; index < findings->count; index += 1) {
        norma_finding current = findings->items[index];
        size_t position = index;
        while (position > 0) {
            const norma_finding *previous = &findings->items[position - 1];
            const int previous_rank = severity_rank(previous->severity);
            const int current_rank = severity_rank(current.severity);
            int goes_after;
            if (previous_rank != current_rank) {
                goes_after = previous_rank <= current_rank;
            } else {
                goes_after = strcmp(previous->title, current.title) <= 0;
            }
            if (goes_after) {
                break;
            }
            findings->items[position] = findings->items[position - 1];
            position -= 1;
        }
        findings->items[position] = current;
    }
}

void norma_findings_count(const norma_findings *findings, norma_finding_counts *counts)
{
    if (counts == NULL) {
        return;
    }
    counts->high = 0;
    counts->medium = 0;
    counts->low = 0;
    counts->info = 0;
    if (findings == NULL) {
        return;
    }
    for (size_t index = 0; index < findings->count; index += 1) {
        const char *severity = findings->items[index].severity;
        if (strcmp(severity, "high") == 0) {
            counts->high += 1;
        } else if (strcmp(severity, "medium") == 0) {
            counts->medium += 1;
        } else if (strcmp(severity, "low") == 0) {
            counts->low += 1;
        } else if (strcmp(severity, "info") == 0) {
            counts->info += 1;
        }
    }
}

/* --------------------------- hallazgos de salida --------------------------- */

static int is_door_type(const char *type)
{
    return strcmp(type, "door") == 0 || strcmp(type, "door_double") == 0
           || strcmp(type, "door_garage") == 0;
}

/** Ancho del vano en metros, con la medida declarada primero (como la web). */
static double door_width_m(const norma_element *element)
{
    const double meters_per_unit = norma_meters_per_unit(NORMA_UNIT_CM);
    double cm = 0.0;
    if (element->measured_m > 0.0) {
        cm = round(element->measured_m * 100.0 * 1e6) / 1e6;
    } else {
        cm = element->w > 0.0 ? element->w : 0.0;
    }
    return round(cm * meters_per_unit * 100.0) / 100.0;
}

static void number_text(double value, char *out, size_t size)
{
    norma_format_fixed(value, 2, out, size);
}

void norma_audit_egress_findings(const norma_document *document, const norma_travel *travel,
                                const norma_aforo *aforo, const norma_egress *egress,
                                const norma_egress_criteria *criteria, norma_findings *findings)
{
    if (document == NULL || travel == NULL || aforo == NULL || egress == NULL || findings == NULL) {
        return;
    }
    norma_egress_criteria defaults;
    if (criteria == NULL) {
        norma_egress_criteria_default(&defaults);
        criteria = &defaults;
    }

    /* Salidas marcadas y todas las puertas, en el orden del documento. */
    const char *exit_ids[NORMA_FINDING_ELEMENTS];
    size_t exit_count = 0;
    const char *door_ids[NORMA_FINDING_ELEMENTS];
    size_t door_count = 0;
    const norma_element *narrow[NORMA_FINDING_ELEMENTS];
    size_t narrow_count = 0;
    const double min_width_m = criteria->min_exit_width_cm / 100.0;
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!is_door_type(element->type)) {
            continue;
        }
        if (door_count < NORMA_FINDING_ELEMENTS) {
            door_ids[door_count] = element->id;
            door_count += 1;
        }
        if (!element->is_exit) {
            continue;
        }
        if (exit_count < NORMA_FINDING_ELEMENTS) {
            exit_ids[exit_count] = element->id;
            exit_count += 1;
        }
        if (door_width_m(element) + 0.001 < min_width_m && narrow_count < NORMA_FINDING_ELEMENTS) {
            narrow[narrow_count] = element;
            narrow_count += 1;
        }
    }

    char text[640];
    char first[32];
    char second[32];

    if (exit_count == 0) {
        norma_findings_add(findings, "no_exit", "high", "Sin salidas de emergencia marcadas",
                           "Ninguna puerta está marcada como salida de emergencia. Selecciona una puerta "
                           "exterior y activa «Salida de emergencia» en Apariencia para que el auditor "
                           "pueda medir el recorrido.",
                           door_ids, door_count, NULL, NULL);
    } else {
        if ((long) exit_count < criteria->min_exit_count) {
            snprintf(text, sizeof(text),
                     "El plano declara %ld salida%s y el criterio de referencia pide al menos %ld. Revisa "
                     "si el uso y la ocupación del piso exigen una segunda vía de evacuación.",
                     (long) exit_count, exit_count == 1 ? "" : "s", criteria->min_exit_count);
            norma_findings_add(findings, "too_few_exits", "medium", "Pocas salidas de emergencia",
                               text, exit_ids, exit_count, NULL, NULL);
        }
        for (size_t index = 0; index < narrow_count; index += 1) {
            const double width = door_width_m(narrow[index]);
            number_text(width, first, sizeof(first));
            number_text(min_width_m, second, sizeof(second));
            snprintf(text, sizeof(text),
                     "La salida mide %s m de vano y el criterio de referencia pide %s m como mínimo. "
                     "Verifica el ancho libre real, descartando marcos y hojas abiertas.",
                     first, second);
            char value[64];
            snprintf(value, sizeof(value), "%s m", first);
            const norma_point center = {narrow[index]->x + narrow[index]->w / 2.0,
                                       narrow[index]->y + narrow[index]->h / 2.0};
            const char *ids[1] = {narrow[index]->id};
            norma_findings_add(findings, "narrow_exit", "medium",
                               "Salida más angosta que el mínimo de referencia", text, ids, 1,
                               &center, value);
        }
    }

    /* Recorrido: solo si hay algo que medir. */
    if (travel->computed && travel->has_longest && travel->longest_m > criteria->max_travel_m) {
        number_text(travel->longest_m, first, sizeof(first));
        number_text(criteria->max_travel_m, second, sizeof(second));
        snprintf(text, sizeof(text),
                 "El punto más alejado queda a %s m de una salida por el camino libre y el criterio de "
                 "referencia admite %s m. Revisa la ubicación de las salidas o los obstáculos del recorrido.",
                 first, second);
        char value[64];
        snprintf(value, sizeof(value), "%s m", first);
        norma_findings_add(findings, "travel_too_long", "high",
                           "Recorrido de evacuación demasiado largo", text, exit_ids, exit_count,
                           travel->has_farthest ? &travel->farthest : NULL, value);
    }
    if (travel->computed) {
        for (size_t index = 0; index < travel->room_count; index += 1) {
            number_text(travel->rooms[index].area_m2, first, sizeof(first));
            snprintf(text, sizeof(text),
                     "Hay una zona de %s m² a la que no llega ningún recorrido desde las salidas "
                     "marcadas: puede faltar una puerta, un vano está tapado o el muro cierra el paso.",
                     first);
            char value[64];
            snprintf(value, sizeof(value), "%s m²", first);
            norma_findings_add(findings, "unreachable_area", "high", "Recinto sin salida alcanzable",
                               text, NULL, 0, &travel->rooms[index].center, value);
        }
    }

    /* Aforo: lo calculado no es lo declarado. */
    if (aforo->excess > 0) {
        number_text(aforo->free_area_m2, first, sizeof(first));
        number_text(aforo->density, second, sizeof(second));
        snprintf(text, sizeof(text),
                 "El piso declara %ld personas y su superficie libre de %s m² admite %ld con la densidad "
                 "de referencia (%s pers./m²). El aforo permitido queda en %ld: reduce la ocupación, "
                 "amplía la superficie útil o ajusta la densidad documentada.",
                 aforo->declared, first, aforo->max_persons, second, aforo->permitted);
        char value[48];
        snprintf(value, sizeof(value), "%ld de %ld", aforo->declared, aforo->max_persons);
        norma_findings_add(findings, "occupancy_over_capacity", "medium",
                           "Aforo declarado por encima de la capacidad del piso", text, NULL, 0, NULL,
                           value);
    }
    if (strcmp(aforo->source, "estimated") == 0) {
        number_text(aforo->free_area_m2, first, sizeof(first));
        snprintf(text, sizeof(text),
                 "No hay ocupación declarada para el piso, así que el ancho y el tiempo se estiman con %ld "
                 "personas a partir de %s m² de superficie libre y una densidad de referencia. Declara la "
                 "ocupación real en Ajustes del piso.",
                 aforo->used, first);
        char value[48];
        snprintf(value, sizeof(value), "%ld", aforo->used);
        norma_findings_add(findings, "occupancy_missing", "info", "Ocupación no declarada", text, NULL, 0,
                           NULL, value);
    }
    if (egress->required_width_m > 0.0 && egress->available_width_m > 0.0
        && egress->required_width_m > egress->available_width_m + 0.001) {
        number_text(egress->required_width_m, first, sizeof(first));
        number_text(egress->available_width_m, second, sizeof(second));
        snprintf(text, sizeof(text),
                 "Con %ld personas el criterio de referencia pide %s m de ancho útil y las salidas marcadas "
                 "suman %s m. Revisa el número de salidas o su ancho libre.",
                 aforo->used, first, second);
        char value[64];
        snprintf(value, sizeof(value), "%s m", first);
        norma_findings_add(findings, "width_short", "medium",
                           "Ancho de salida insuficiente para la ocupación", text, exit_ids, exit_count,
                           NULL, value);
    }

    norma_findings_sort(findings);
}
