/*
 * Normia nativo · señalización del plano.
 *
 * Los textos son los del auditor web, palabra por palabra, y las cifras salen
 * con el mismo formato de es-CO (dos decimales, coma decimal), para que las dos
 * ediciones no digan cosas distintas del mismo plano.
 */
#include "normia/signage.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/format.h"

static void set_text(char *target, size_t size, const char *value)
{
    snprintf(target, size, "%s", value != NULL ? value : "");
}

static void add_code(char codes[][8], size_t capacity, size_t *count, const char *code)
{
    if (*count >= capacity) {
        return;
    }
    set_text(codes[*count], 8, code);
    *count += 1;
}

void norma_signage_criteria_default(norma_signage_criteria *criteria)
{
    if (criteria == NULL) {
        return;
    }
    memset(criteria, 0, sizeof(*criteria));
    add_code(criteria->exit_codes, 4, &criteria->exit_code_count, "E001");
    add_code(criteria->exit_codes, 4, &criteria->exit_code_count, "E002");
    criteria->exit_radius_cm = 150.0;
    set_text(criteria->you_are_here_code, sizeof(criteria->you_are_here_code), "SVC_AQUI");
    add_code(criteria->fire_codes, 4, &criteria->fire_code_count, "F001");
    add_code(criteria->fire_codes, 4, &criteria->fire_code_count, "F002");
    add_code(criteria->fire_codes, 4, &criteria->fire_code_count, "F005");
}

static norma_sign_placed *reserve(norma_signage *signage)
{
    if (signage->count == signage->capacity) {
        const size_t capacity = signage->capacity == 0 ? 16 : signage->capacity * 2;
        norma_sign_placed *grown = (norma_sign_placed *) realloc(signage->items,
                                                                capacity * sizeof(norma_sign_placed));
        if (grown == NULL) {
            return NULL;
        }
        signage->items = grown;
        signage->capacity = capacity;
    }
    return &signage->items[signage->count];
}

void norma_signage_free(norma_signage *signage)
{
    if (signage == NULL) {
        return;
    }
    free(signage->items);
    signage->items = NULL;
    signage->count = 0;
    signage->capacity = 0;
    signage->exit_sign_count = 0;
    signage->fire_sign_count = 0;
    signage->unknown = 0;
    signage->catalog_loaded = 0;
    signage->catalog_total = 0;
    signage->catalog_iso = 0;
    signage->catalog_services = 0;
}

/** Código que cuenta como señal de extinción según los criterios. */
static int is_fire_code(const norma_signage_criteria *criteria, const char *code)
{
    for (size_t index = 0; index < criteria->fire_code_count; index += 1) {
        if (strcmp(criteria->fire_codes[index], code) == 0) {
            return 1;
        }
    }
    return 0;
}

static int is_exit_code(const norma_signage_criteria *criteria, const char *code)
{
    for (size_t index = 0; index < criteria->exit_code_count; index += 1) {
        if (strcmp(criteria->exit_codes[index], code) == 0) {
            return 1;
        }
    }
    return 0;
}

/** ¿El tipo del elemento pretende ser una señal del catálogo? */
static int looks_like_sign(const char *type)
{
    return strncmp(type, "iso_", 4) == 0 || strncmp(type, "sig_", 4) == 0
        || strncmp(type, "plg_", 4) == 0 || strncmp(type, "ISO_", 4) == 0
        || strncmp(type, "SIG_", 4) == 0 || strncmp(type, "PLG_", 4) == 0;
}

void norma_signage_collect(const norma_document *document, const norma_library *library,
                           norma_signage *signage)
{
    if (signage == NULL) {
        return;
    }
    memset(signage, 0, sizeof(*signage));
    if (library != NULL) {
        signage->catalog_loaded = 1;
        signage->catalog_total = library->count;
        for (size_t index = 0; index < library->count; index += 1) {
            if (strncmp(library->items[index].code, "SVC_", 4) == 0) {
                signage->catalog_services += 1;
            } else {
                signage->catalog_iso += 1;
            }
        }
    }
    if (document == NULL) {
        return;
    }
    norma_signage_criteria criteria;
    norma_signage_criteria_default(&criteria);
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!looks_like_sign(element->type)) {
            continue;
        }
        char code[64] = "";
        const char *resolved = NULL;
        if (library != NULL) {
            resolved = norma_library_code_for_type(library, element->type, code, sizeof(code));
        }
        if (resolved == NULL) {
            signage->unknown += 1;
            continue;
        }
        norma_sign_placed *placed = reserve(signage);
        if (placed == NULL) {
            return;
        }
        memset(placed, 0, sizeof(*placed));
        set_text(placed->code, sizeof(placed->code), resolved);
        const norma_sign *sign = norma_library_sign(library, resolved);
        set_text(placed->category, sizeof(placed->category), sign != NULL ? sign->category : "");
        set_text(placed->element_id, sizeof(placed->element_id), element->id);
        placed->center.x = element->x + element->w / 2.0;
        placed->center.y = element->y + element->h / 2.0;
        if (is_exit_code(&criteria, placed->code)) {
            signage->exit_sign_count += 1;
        }
        if (is_fire_code(&criteria, placed->code)) {
            signage->fire_sign_count += 1;
        }
        signage->count += 1;
    }
}

int norma_signage_has(const norma_signage *signage, const char *code)
{
    if (signage == NULL || code == NULL) {
        return 0;
    }
    for (size_t index = 0; index < signage->count; index += 1) {
        if (strcmp(signage->items[index].code, code) == 0) {
            return 1;
        }
    }
    return 0;
}

void norma_signage_findings(const norma_document *document, const norma_signage *signage,
                            const norma_signage_criteria *criteria, norma_findings *findings)
{
    if (document == NULL || signage == NULL || findings == NULL) {
        return;
    }
    /* Sin catálogo no se sabe qué código corresponde a cada tipo: no se emite
       un hallazgo que después no se pueda sostener. */
    if (!signage->catalog_loaded) {
        return;
    }
    norma_signage_criteria defaults;
    if (criteria == NULL) {
        norma_signage_criteria_default(&defaults);
        criteria = &defaults;
    }

    char radius[48];
    norma_format_fixed(criteria->exit_radius_cm / 100.0, 2, radius, sizeof(radius));

    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!element->is_exit) {
            continue;
        }
        const norma_point center = {element->x + element->w / 2.0, element->y + element->h / 2.0};
        int covered = 0;
        for (size_t sign = 0; sign < signage->count; sign += 1) {
            if (!is_exit_code(criteria, signage->items[sign].code)) {
                continue;
            }
            const double dx = signage->items[sign].center.x - center.x;
            const double dy = signage->items[sign].center.y - center.y;
            if (sqrt(dx * dx + dy * dy) <= criteria->exit_radius_cm) {
                covered = 1;
                break;
            }
        }
        if (covered) {
            continue;
        }
        char detail[640];
        snprintf(detail, sizeof(detail),
                 "No hay una señal de salida de emergencia a menos de %s m de esta salida. Coloca el "
                 "pictograma junto al vano y en el sentido de evacuación.",
                 radius);
        const char *ids[1] = {element->id};
        norma_findings_add(findings, "exit_without_sign", "low",
                           "Salida sin señal de emergencia cercana", detail, ids, 1, &center, NULL);
    }

    if (!norma_signage_has(signage, criteria->you_are_here_code)) {
        norma_findings_add(findings, "no_you_are_here", "low", "Falta el marcador «Usted está aquí»",
                           "Un plano de evacuación sin el punto de partida del lector obliga a adivinar "
                           "dónde está. Añade la señal SVC_AQUI de la familia Ubicación.",
                           NULL, 0, NULL, NULL);
    }

    int has_fire = 0;
    for (size_t sign = 0; sign < signage->count; sign += 1) {
        if (is_fire_code(criteria, signage->items[sign].code)) {
            has_fire = 1;
            break;
        }
    }
    if (!has_fire) {
        norma_findings_add(findings, "no_fire_sign", "info",
                           "Sin señalización de protección contra incendios",
                           "El plano no incluye pictogramas de extintor, manguera o medios de extinción. "
                           "Si el piso cuenta con ellos, ubícalos para que el recorrido hasta el equipo "
                           "sea visible.",
                           NULL, 0, NULL, NULL);
    }
}
