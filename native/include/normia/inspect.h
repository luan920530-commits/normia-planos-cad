/*
 * Normia nativo · revisión completa de un plano.
 *
 * Es la receta del cajón **Revisión** de la edición web, en una sola llamada:
 * superficie libre, aforo, salidas, recorridos, rutas dibujadas, señalización,
 * primeros auxilios, extintores (con sus acciones) y escenarios, y al final la
 * lista de hallazgos ordenada por gravedad y título.
 *
 * Existe para que la ventana nativa y `norma-core --inspect` digan **lo mismo**:
 * si la ventana mostrara su propia lista, tendríamos dos auditores. El orden de
 * la receta es el de `PlanAudit::analyze()` y ninguna cifra se redondea aquí.
 *
 * Reglas que no cambian: los umbrales son **criterios de la app**, no una
 * certificación; un hallazgo sin dato no se inventa; y lo que no se pudo cargar
 * (catálogo de señalización o tablas de extintores) se dice en `has_library` y
 * `has_ext_norms` en vez de suponerlo.
 */
#ifndef NORMA_INSPECT_H
#define NORMA_INSPECT_H

#include <stddef.h>

#include "normia/audit.h"
#include "normia/document.h"
#include "normia/extinguisher.h"
#include "normia/findings.h"
#include "normia/firstaid.h"
#include "normia/grid.h"
#include "normia/library.h"
#include "normia/routes.h"
#include "normia/scenarios.h"
#include "normia/signage.h"
#include "normia/travel.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Lo que la ventana necesita para el pie y para la cabecera del cajón. */
typedef struct {
    long persons;
    long declared;
    long permitted;
    long excess;
    /** `declared` o `estimated`, tal cual lo dice el núcleo. */
    char source[12];
    double free_area_m2;
    long exit_count;
    int has_longest;
    double longest_travel_m;
    /** Recorrido más lejano, listo para centrar la vista. */
    int has_farthest;
    norma_point farthest;
    double unreachable_m2;
    size_t room_count;
    size_t route_count;
    size_t extinguisher_count;
    double covered_m2;
    int has_covered_pct;
    double covered_pct;
    /** Recuento por gravedad, ya ordenado como la lista. */
    norma_finding_counts counts;
} norma_inspect_summary;

typedef struct {
    norma_findings findings;
    norma_inspect_summary summary;

    /* Las piezas medidas, para que quien quiera más detalle no las recalcule. */
    norma_aforo aforo;
    norma_egress egress;
    norma_travel travel;
    norma_signage signage;
    norma_ext_result ext;
    norma_ext_recommendation recommendations[NORMA_EXT_MAX_RECS];
    size_t recommendation_count;
    norma_firstaid first_aid;
    norma_route routes[NORMA_MAX_ROUTES];
    size_t route_count;
    norma_scenario_item scenarios[NORMA_MAX_SCENARIOS];
    size_t scenario_count;

    int has_library;
    int has_ext_norms;
    char library_error[256];
    char ext_error[256];
} norma_inspect_result;

void norma_inspect_init(norma_inspect_result *result);
void norma_inspect_free(norma_inspect_result *result);

/**
 * Mide el plano y arma la lista de hallazgos.
 *
 * `resources` es la carpeta de los catálogos (`resources/` en el repositorio o
 * `Resources/` dentro del paquete de macOS). Si es `NULL` o no encuentra nada,
 * el informe sale **sin** la familia de señalización y sin extintores, y lo dice
 * en `has_library` / `has_ext_norms`; nunca se inventan códigos.
 *
 * Devuelve 1 si pudo medir, 0 si la rejilla no se pudo construir (con `error`).
 */
int norma_inspect_document(const norma_document *document, const char *resources,
                           norma_inspect_result *result, char *error, size_t error_size);

/** El aforo del informe: la cifra con la que se calcula todo lo demás. */
long norma_inspect_persons(const norma_inspect_result *result);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_INSPECT_H */
