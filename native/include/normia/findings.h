/*
 * Normia nativo · hallazgos del auditor.
 *
 * Espejo de la lista que arma `PlanAudit::analyze()` en la edición web: cada
 * hallazgo lleva su **gravedad**, un **título** corto, un **detalle** que dice
 * qué pasa y qué hacer, los elementos del plano a los que se refiere y, cuando
 * tiene sentido, el punto del plano donde mirar y el valor medido.
 *
 * Reglas que se mantienen iguales en las dos ediciones:
 *   1. Un hallazgo no afirma certificación: son **criterios de la app**.
 *   2. El orden es por gravedad (alta, media, baja, informativa) y, dentro de
 *      cada una, por título, para que la lista no cambie de orden sin motivo.
 *   3. Un hallazgo sin dato no se inventa: si falta el recorrido, no hay
 *      hallazgo de recorrido.
 */
#ifndef NORMA_FINDINGS_H
#define NORMA_FINDINGS_H

#include <stddef.h>

#include "normia/audit.h"
#include "normia/document.h"
#include "normia/grid.h"
#include "normia/travel.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Elementos a los que puede referirse un hallazgo. */
#define NORMA_FINDING_ELEMENTS 8

typedef struct {
    char code[40];
    char severity[12];
    char title[128];
    char detail[640];
    size_t element_count;
    char element_ids[NORMA_FINDING_ELEMENTS][32];
    int has_position;
    norma_point position;
    int has_value;
    char value[48];
} norma_finding;

typedef struct {
    norma_finding *items;
    size_t count;
    size_t capacity;
    int failed;
} norma_findings;

typedef struct {
    long high;
    long medium;
    long low;
    long info;
} norma_finding_counts;

void norma_findings_init(norma_findings *findings);
void norma_findings_free(norma_findings *findings);

/** Añade un hallazgo. Los textos se copian; `elements` puede ser NULL. */
void norma_findings_add(norma_findings *findings, const char *code, const char *severity,
                        const char *title, const char *detail,
                        const char *const *elements, size_t element_count,
                        const norma_point *position, const char *value);

/** Ordena por gravedad y título, como el auditor web. */
void norma_findings_sort(norma_findings *findings);

/** Cuenta los hallazgos por gravedad. */
void norma_findings_count(const norma_findings *findings, norma_finding_counts *counts);

/**
 * Hallazgos de evacuación y aforo: salidas, recorrido, zonas sin salida y
 * capacidad. Es la parte del auditor que ya mide el núcleo nativo.
 */
void norma_audit_egress_findings(const norma_document *document, const norma_travel *travel,
                                const norma_aforo *aforo, const norma_egress *egress,
                                const norma_egress_criteria *criteria, norma_findings *findings);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_FINDINGS_H */
