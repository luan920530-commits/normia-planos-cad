/*
 * Normia nativo · señalización del plano.
 *
 * Espejo de la parte de señalización de `PlanAudit::analyze()`: recorre los
 * elementos del plano, resuelve cada tipo del editor a su código del catálogo
 * (`iso_e002` → `E002`, `sig_aqui` → `SVC_AQUI`) y responde tres preguntas:
 *
 *   1. ¿Cada salida de emergencia tiene un pictograma de salida cerca?
 *   2. ¿El plano dice dónde está parado quien lo lee («Usted está aquí»)?
 *   3. ¿Hay señalización de medios de extinción?
 *
 * Los radios y los códigos son **criterios de la aplicación** tomados de
 * `resources/audit-criteria.json` (ISO 7010 para los pictogramas, NTC 1461 y
 * Resolución 2400 de 1979 para la señalización en Colombia). No son un
 * dictamen ni certifican cumplimiento: la señal se verifica en sitio.
 */
#ifndef NORMA_SIGNAGE_H
#define NORMA_SIGNAGE_H

#include <stddef.h>

#include "normia/document.h"
#include "normia/findings.h"
#include "normia/library.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Criterios de señalización: los mismos valores de `audit-criteria.json`. */
typedef struct {
    /** Códigos que cuentan como señal de salida (ISO 7010 E). */
    char exit_codes[4][8];
    size_t exit_code_count;
    /** Radio de cobertura de la señal de salida, en centímetros. */
    double exit_radius_cm;
    /** Código del marcador «Usted está aquí». */
    char you_are_here_code[16];
    /** Códigos que cuentan como señal de extinción. */
    char fire_codes[4][8];
    size_t fire_code_count;
} norma_signage_criteria;

void norma_signage_criteria_default(norma_signage_criteria *criteria);

/** Una señal dibujada en el plano, ya resuelta al catálogo. */
typedef struct {
    char code[32];
    char category[24];
    char element_id[32];
    norma_point center;
} norma_sign_placed;

typedef struct {
    norma_sign_placed *items;
    size_t count;
    size_t capacity;
    /** Señales de salida y de extinción encontradas. */
    size_t exit_sign_count;
    size_t fire_sign_count;
    /** Elementos de señal cuyo tipo no está en el catálogo (no se adivinan). */
    size_t unknown;
    /** 1 si el catálogo se pudo leer: sin él no se emiten hallazgos. */
    int catalog_loaded;
    size_t catalog_total;
    size_t catalog_iso;
    size_t catalog_services;
} norma_signage;

/** Recorre el documento y resuelve sus señales contra el catálogo. */
void norma_signage_collect(const norma_document *document, const norma_library *library,
                           norma_signage *signage);

void norma_signage_free(norma_signage *signage);

/** 1 si el plano tiene una señal con ese código. */
int norma_signage_has(const norma_signage *signage, const char *code);

/**
 * Añade los hallazgos de señalización. No los ordena: el llamador ordena la
 * lista completa al final, como hace el auditor web.
 */
void norma_signage_findings(const norma_document *document, const norma_signage *signage,
                            const norma_signage_criteria *criteria, norma_findings *findings);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_SIGNAGE_H */
