/*
 * Normia nativo · revisión completa de un plano.
 *
 * Una sola receta, la misma del cajón Revisión de la edición web y la misma que
 * imprime `norma-core --audit`. Aquí no hay fórmulas nuevas: se llama en orden a
 * las piezas del núcleo y se guarda todo lo medido, para que la ventana pueda
 * pintar la lista y saltar al punto sin recalcular nada.
 */
#include "normia/inspect.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/** Nombres de la gravedad, para sumar sin equivocarse. */
static void sumar_gravedad(const norma_findings *findings, norma_finding_counts *counts)
{
    memset(counts, 0, sizeof(*counts));
    norma_findings_count(findings, counts);
}

void norma_inspect_init(norma_inspect_result *result)
{
    if (result == NULL) {
        return;
    }
    memset(result, 0, sizeof(*result));
    norma_findings_init(&result->findings);
    snprintf(result->summary.source, sizeof(result->summary.source), "estimated");
}

void norma_inspect_free(norma_inspect_result *result)
{
    if (result == NULL) {
        return;
    }
    norma_findings_free(&result->findings);
}

long norma_inspect_persons(const norma_inspect_result *result)
{
    return result == NULL ? 0 : result->aforo.used;
}

/**
 * Busca la carpeta de los catálogos como lo hace el programa: la pedida, la del
 * entorno y las rutas relativas habituales. Si no aparece, se dice.
 */
static int cargar_catalogo(const char *resources, norma_library *library, char *found, size_t found_size,
                           char *error, size_t error_size)
{
    const char *candidates[8];
    size_t count = 0;
    if (resources != NULL && resources[0] != '\0') {
        candidates[count++] = resources;
    }
    const char *from_env = getenv("NORMA_RESOURCES");
    if (from_env != NULL && from_env[0] != '\0') {
        candidates[count++] = from_env;
    }
    candidates[count++] = "resources";
    candidates[count++] = "../resources";
    candidates[count++] = "../../resources";
    candidates[count++] = "../../../resources";
    char last[256] = "No se encontró la carpeta «resources» con los catálogos de señalización.";
    for (size_t index = 0; index < count; index += 1) {
        if (norma_library_load(candidates[index], library, error, error_size)) {
            snprintf(found, found_size, "%s", candidates[index]);
            return 1;
        }
        snprintf(last, sizeof(last), "%s", error);
    }
    snprintf(error, error_size, "%s", last);
    return 0;
}

int norma_inspect_document(const norma_document *document, const char *resources,
                           norma_inspect_result *result, char *error, size_t error_size)
{
    if (document == NULL || result == NULL) {
        return 0;
    }
    norma_inspect_init(result);
    if (error != NULL && error_size > 0) {
        error[0] = '\0';
    }

    norma_grid grid;
    if (!norma_audit_aforo(document, 0, NULL, NULL, &result->aforo, &grid, error, error_size)) {
        return 0;
    }
    norma_travel_field(document, &grid, NULL, &result->travel);
    norma_audit_egress(document, result->aforo.used,
                       result->travel.has_longest ? result->travel.longest_m : -1.0, NULL,
                       &result->egress);

    norma_findings *findings = &result->findings;
    norma_audit_egress_findings(document, &result->travel, &result->aforo, &result->egress, NULL,
                                findings);

    /* Rutas dibujadas: longitud, llegada a la salida y cruces de muro. */
    result->route_count = norma_routes_analyze(document, result->egress.exit_count > 0,
                                               result->routes, NORMA_MAX_ROUTES);
    norma_routes_findings(result->routes, result->route_count, result->egress.exit_count > 0,
                          findings);

    /* Catálogo de señalización: si no está, el auditor no se inventa códigos. */
    norma_library library;
    char resources_found[256] = "";
    result->has_library = cargar_catalogo(resources, &library, resources_found,
                                          sizeof(resources_found), result->library_error,
                                          sizeof(result->library_error));
    if (result->has_library) {
        norma_signage_collect(document, &library, &result->signage);
        norma_signage_findings(document, &result->signage, NULL, findings);
    }

    /* Extintores: recorrido y área sobre la misma rejilla, con las tablas locales. */
    norma_ext_norms norms;
    memset(&norms, 0, sizeof(norms));
    const char *ext_root = resources_found[0] != '\0' ? resources_found
                                                      : (resources != NULL ? resources : "resources");
    result->has_ext_norms = norma_ext_norms_load(ext_root, document->ext_profile,
                                                 document->ext_hazard, &norms, result->ext_error,
                                                 sizeof(result->ext_error));
    if (result->has_ext_norms) {
        norma_ext_analyze(document, &grid, result->has_library ? &library : NULL, &norms,
                          &result->ext);
        norma_ext_findings(&result->ext, &norms, findings);
        result->recommendation_count =
            norma_ext_recommend(document, &grid, result->has_library ? &library : NULL, &norms,
                                &result->ext, result->recommendations, NORMA_EXT_MAX_RECS);
    }

    /* Primeros auxilios: botiquín, camilla y DEA, sobre la misma rejilla. */
    norma_firstaid_analyze(document, &grid, result->aforo.used, result->aforo.source, NULL,
                           &result->first_aid, findings);

    /* Escenarios de ocupación temporal: se revisan aparte y no tocan el aforo. */
    norma_egress_criteria criteria;
    norma_egress_criteria_default(&criteria);
    if (document->scenario_count > 0) {
        result->scenario_count =
            norma_scenarios_analyze(document, &result->aforo, &result->egress, &criteria,
                                    result->scenarios, NORMA_MAX_SCENARIOS);
        norma_scenarios_findings(result->scenarios, result->scenario_count, &result->aforo, findings);
    }

    norma_grid_free(&grid);
    if (result->has_library) {
        norma_library_free(&library);
    }
    if (result->has_ext_norms) {
        norma_ext_norms_free(&norms);
    }

    /* Las familias se ordenan juntas: gravedad y, dentro de ella, título. */
    norma_findings_sort(findings);
    sumar_gravedad(findings, &result->summary.counts);

    norma_inspect_summary *summary = &result->summary;
    summary->persons = result->aforo.used;
    summary->declared = result->aforo.declared;
    summary->permitted = result->aforo.permitted;
    summary->excess = result->aforo.excess;
    snprintf(summary->source, sizeof(summary->source), "%s",
             result->aforo.source != NULL ? result->aforo.source : "estimated");
    summary->free_area_m2 = result->aforo.free_area_m2;
    summary->exit_count = result->egress.exit_count;
    summary->has_longest = result->travel.has_longest;
    summary->longest_travel_m = result->travel.has_longest ? result->travel.longest_m : 0.0;
    summary->has_farthest = result->travel.has_farthest;
    summary->farthest = result->travel.farthest;
    summary->unreachable_m2 = result->travel.unreachable_area_m2;
    summary->room_count = result->travel.room_count;
    summary->route_count = result->route_count;
    summary->extinguisher_count = result->ext.unit_count;
    summary->covered_m2 = result->ext.summary.covered_area_m2;
    summary->has_covered_pct = result->ext.unit_count > 0;
    summary->covered_pct = result->ext.summary.covered_pct;
    return 1;
}
