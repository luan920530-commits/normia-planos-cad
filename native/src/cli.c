/*
 * Normia nativo · programa de línea de órdenes del núcleo.
 *
 * No dibuja nada: sirve para comprobar que el núcleo compila, arranca y da las
 * mismas cifras que el motor PHP. La ventana nativa llega en la etapa siguiente.
 *
 *   norma-core --check              comprueba el núcleo y termina.
 *   norma-core --version            versión del núcleo.
 *   norma-core --stats plano.json   cifras del plano, en JSON.
 *   norma-core --sign-board x.svg   hoja con las 395 señalizaciones, en SVG.
 *   norma-core --help               esta ayuda.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/plan.h"
#include <math.h>

#include "normia/audit.h"
#include "normia/findings.h"
#include "normia/inspect.h"
#include "normia/extinguisher.h"
#include "normia/firstaid.h"
#include "normia/library.h"
#include "normia/routes.h"
#include "normia/scenarios.h"
#include "normia/signage.h"
#include "normia/jsonw.h"
#include "normia/grid.h"
#include "normia/svg.h"
#include "normia/travel.h"
#include "normia/units.h"

#define NORMA_CORE_VERSION "0.1.0"

static void usage(FILE *out, const char *program)
{
    fprintf(out,
            "Normia · núcleo nativo %s\n\n"
            "Uso:\n"
            "  %s --check              comprueba el núcleo y termina\n"
            "  %s --version            muestra la versión\n"
            "  %s --stats plano.json   cifras del plano, en JSON\n"
            "  %s --svg plano.json     SVG del plano, por la salida estándar\n"
            "  %s --audit plano.json   superficie libre y aforo, en JSON\n"
            "  %s --inspect plano.json resumen y hallazgos, como el cajón Revisión\n"
            "  %s --sign-board x.svg   hoja con todas las señalizaciones, en SVG\n"
            "  %s --help               esta ayuda\n\n"
            "Opciones:\n"
            "  --resources DIR         carpeta de catálogos (por omisión, ./resources)\n",
            NORMA_CORE_VERSION, program, program, program, program, program, program, program, program);
}

/** Carpeta de catálogos pedida con `--resources` o con el entorno. */
static const char *g_resources = NULL;

/** Carpeta que sí contenía los catálogos, para reutilizarla en las tablas. */
static char g_resources_found[256];

/**
 * Carga los catálogos de señalización probando, en orden, la carpeta pedida,
 * la del entorno y las rutas relativas habituales (raíz del repo o `native/`).
 * Si no se encuentra ninguno, el auditor sigue funcionando y dice que no hay
 * catálogo en vez de inventar códigos.
 */
static int load_library(norma_library *library, char *error, size_t error_size)
{
    const char *candidates[8];
    size_t count = 0;
    if (g_resources != NULL && g_resources[0] != '\0') {
        candidates[count++] = g_resources;
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
            snprintf(g_resources_found, sizeof(g_resources_found), "%s", candidates[index]);
            return 1;
        }
        snprintf(last, sizeof(last), "%s", error);
    }
    snprintf(error, error_size, "%s", last);
    return 0;
}

/** Señales ISO del catálogo, sin las propias (`SVC_…`). */
static size_t signage_iso_count(const norma_library *library)
{
    size_t count = 0;
    for (size_t index = 0; index < library->count; index += 1) {
        if (strncmp(library->items[index].code, "SVC_", 4) != 0) {
            count += 1;
        }
    }
    return count;
}

/** Lee un archivo completo. Devuelve NULL y explica el motivo si falla. */
static char *read_file(const char *path, size_t *length)
{
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        fprintf(stderr, "No se pudo abrir «%s».\n", path);
        return NULL;
    }
    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return NULL;
    }
    const long size = ftell(file);
    if (size < 0) {
        fclose(file);
        return NULL;
    }
    rewind(file);
    char *text = (char *) malloc((size_t) size + 1);
    if (text == NULL) {
        fclose(file);
        return NULL;
    }
    const size_t read = fread(text, 1, (size_t) size, file);
    fclose(file);
    text[read] = '\0';
    *length = read;
    return text;
}

/** Escribe una cadena JSON en la salida estándar, con comillas y escapes. */
static void write_json_string(const char *text)
{
    norma_buffer buffer;
    norma_buffer_init(&buffer);
    norma_buffer_string(&buffer, text != NULL ? text : "");
    if (!buffer.failed && buffer.text != NULL) {
        fputs(buffer.text, stdout);
    }
    norma_buffer_free(&buffer);
}

static int command_check(void)
{
    /* Una comprobación mínima de que las conversiones siguen siendo las del
       proyecto: 1 m son 100 cm y un plano en metros declara la misma
       geometría. Si esto falla, el núcleo no sirve para nada más. */
    const int ok = norma_from_meters(1.0, NORMA_UNIT_CM) == 100.0
                   && norma_to_meters(100.0, NORMA_UNIT_CM) == 1.0
                   && norma_cm_per_unit(NORMA_UNIT_M) == 100.0
                   && norma_scale_denominator("1:100") == 100.0
                   && norma_scale_denominator("2:100") == 0.0;
    if (!ok) {
        fprintf(stderr, "El núcleo no arranca: las conversiones no coinciden con las del proyecto.\n");
        return 1;
    }
    printf("Normia · núcleo nativo %s · ok\n", NORMA_CORE_VERSION);
    return 0;
}

static int command_stats(const char *path)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        return 1;
    }
    norma_plan_stats stats;
    char error[256];
    const int ok = norma_plan_analyze_text(text, length, &stats, error, sizeof(error));
    free(text);
    if (!ok) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    /* %.17g imprime el número tal como está en memoria: la prueba de paridad
       comparó antes este texto con el del motor PHP y no puede redondear. */
    printf("{\"core\":\"%s\",\"canvas\":{\"width\":%.17g,\"height\":%.17g,\"unit\":\"%s\",\"scale\":\"%s\"},"
           "\"elements\":%lu,\"walls\":%lu,\"curved_walls\":%lu,"
           "\"wall_length_cm\":%.17g,\"wall_length_m\":%.17g,\"canvas_area_m2\":%.17g}\n",
           NORMA_CORE_VERSION,
           stats.width, stats.height, norma_unit_name(stats.unit), stats.scale,
           (unsigned long) stats.elements, (unsigned long) stats.walls, (unsigned long) stats.curved_walls,
           stats.wall_length_cm, stats.wall_length_m, stats.canvas_area_m2);
    return 0;
}

/** Escribe un hallazgo como objeto JSON (el mismo en `--audit` y `--inspect`). */
static void write_finding(const norma_finding *finding)
{
    printf("{\"code\":");
    write_json_string(finding->code);
    printf(",\"severity\":");
    write_json_string(finding->severity);
    printf(",\"title\":");
    write_json_string(finding->title);
    printf(",\"detail\":");
    write_json_string(finding->detail);
    printf(",\"elements\":[");
    for (size_t element = 0; element < finding->element_count; element += 1) {
        if (element > 0) {
            printf(",");
        }
        write_json_string(finding->element_ids[element]);
    }
    printf("],\"position\":");
    if (finding->has_position) {
        printf("{\"x\":%.17g,\"y\":%.17g}", finding->position.x, finding->position.y);
    } else {
        printf("null");
    }
    printf(",\"value\":");
    if (finding->has_value) {
        write_json_string(finding->value);
    } else {
        printf("null");
    }
    printf("}");
}

/** La lista completa, en el orden del auditor. */
static void write_findings(const norma_findings *findings)
{
    printf("[");
    for (size_t index = 0; index < findings->count; index += 1) {
        if (index > 0) {
            printf(",");
        }
        write_finding(&findings->items[index]);
    }
    printf("]");
}

static int command_audit(const char *path)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        return 1;
    }
    norma_document document;
    norma_document_init(&document);
    char error[256];
    const int ok = norma_document_from_json(&document, text, length, error, sizeof(error));
    free(text);
    if (!ok) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    norma_grid grid;
    norma_aforo aforo;
    norma_egress egress;
    norma_travel travel;
    norma_findings findings;
    norma_finding_counts counts;
    if (!norma_audit_aforo(&document, 0, NULL, NULL, &aforo, &grid, error, sizeof(error))) {
        norma_document_free(&document);
        fprintf(stderr, "%s\n", error);
        return 3;
    }
    norma_travel_field(&document, &grid, NULL, &travel);
    norma_audit_egress(&document, aforo.used, travel.has_longest ? travel.longest_m : -1.0, NULL, &egress);
    norma_findings_init(&findings);
    norma_audit_egress_findings(&document, &travel, &aforo, &egress, NULL, &findings);
    /* Rutas dibujadas: longitud, llegada a la salida y cruces de muro. */
    norma_route routes[NORMA_MAX_ROUTES];
    const size_t route_count = norma_routes_analyze(&document, egress.exit_count > 0, routes,
                                                    NORMA_MAX_ROUTES);
    norma_routes_findings(routes, route_count, egress.exit_count > 0, &findings);
    /* Catálogo de señalización: si no está, el auditor no se inventa códigos. */
    norma_library library;
    norma_signage signage;
    char library_error[256] = "";
    const int has_library = load_library(&library, library_error, sizeof(library_error));
    if (has_library) {
        norma_signage_collect(&document, &library, &signage);
        norma_signage_findings(&document, &signage, NULL, &findings);
    } else {
        memset(&signage, 0, sizeof(signage));
    }
    /* Extintores: recorrido y área sobre la misma rejilla, con las tablas locales. */
    norma_ext_norms ext_norms;
    norma_ext_result ext_result;
    char ext_error[256] = "";
    const int has_ext_norms = norma_ext_norms_load(g_resources_found, document.ext_profile,
                                                   document.ext_hazard, &ext_norms, ext_error,
                                                   sizeof(ext_error));
    norma_ext_recommendation recommendations[NORMA_EXT_MAX_RECS];
    size_t recommendation_count = 0;
    if (has_ext_norms) {
        norma_ext_analyze(&document, &grid, has_library ? &library : NULL, &ext_norms, &ext_result);
        norma_ext_findings(&ext_result, &ext_norms, &findings);
        recommendation_count = norma_ext_recommend(&document, &grid,
                                                   has_library ? &library : NULL, &ext_norms,
                                                   &ext_result, recommendations,
                                                   NORMA_EXT_MAX_RECS);
    } else {
        memset(&ext_result, 0, sizeof(ext_result));
    }
    /* Primeros auxilios: botiquín, camilla y DEA, medidos sobre la misma rejilla. */
    norma_firstaid first_aid;
    norma_firstaid_analyze(&document, &grid, aforo.used, aforo.source, NULL, &first_aid, &findings);
    /* Escenarios de ocupación temporal: se revisan aparte, con el mismo piso y el
       mismo ancho útil; no tocan el aforo del plano. */
    norma_egress_criteria egress_criteria;
    norma_egress_criteria_default(&egress_criteria);
    norma_scenario_item scenarios[NORMA_MAX_SCENARIOS];
    size_t scenario_count = 0;
    if (document.scenario_count > 0) {
        scenario_count = norma_scenarios_analyze(&document, &aforo, &egress, &egress_criteria,
                                                scenarios, NORMA_MAX_SCENARIOS);
        norma_scenarios_findings(scenarios, scenario_count, &aforo, &findings);
    }
    long peak_persons = 0;
    char peak_name[64] = "";
    for (size_t index = 0; index < scenario_count; index += 1) {
        if (scenarios[index].persons > peak_persons) {
            peak_persons = scenarios[index].persons;
            snprintf(peak_name, sizeof(peak_name), "%.63s", scenarios[index].name);
        }
    }
    /* Las tres familias se ordenan juntas: gravedad y, dentro de ella, título. */
    norma_findings_sort(&findings);
    norma_findings_count(&findings, &counts);
    /* Un tiempo que no se puede calcular sale como null, no como un cero falso. */
    char queue[64];
    if (egress.queue_time_s >= 0.0) {
        snprintf(queue, sizeof(queue), "%.17g", egress.queue_time_s);
    } else {
        snprintf(queue, sizeof(queue), "null");
    }
    /* Las superficies salen redondeadas a dos decimales, como en el informe. */
    char longest[64];
    char farthest[128];
    char walk[64];
    char total[64];
    if (travel.has_longest) {
        snprintf(longest, sizeof(longest), "%.17g", travel.longest_m);
    } else {
        snprintf(longest, sizeof(longest), "null");
    }
    if (travel.has_farthest) {
        snprintf(farthest, sizeof(farthest), "{\"x\":%.17g,\"y\":%.17g}", travel.farthest.x, travel.farthest.y);
    } else {
        snprintf(farthest, sizeof(farthest), "null");
    }
    if (egress.walk_time_s >= 0.0) {
        snprintf(walk, sizeof(walk), "%.17g", egress.walk_time_s);
    } else {
        snprintf(walk, sizeof(walk), "null");
    }
    if (egress.estimated_time_s >= 0.0) {
        snprintf(total, sizeof(total), "%.17g", egress.estimated_time_s);
    } else {
        snprintf(total, sizeof(total), "null");
    }

    printf("{\"core\":\"%s\",\"canvas\":{\"width\":%.17g,\"height\":%.17g,\"unit\":\"%s\",\"scale\":\"%s\"},"
           "\"grid\":{\"cell\":%.17g,\"cellM\":%.17g,\"nx\":%lu,\"ny\":%lu,\"clearance\":%.17g},"
           "\"freeAreaM2\":%.17g,\"exteriorAreaM2\":%.17g,"
           "\"aforo\":{\"maxPersons\":%ld,\"declared\":%ld,\"permitted\":%ld,\"used\":%ld,"
           "\"excess\":%ld,\"source\":\"%s\",\"freeAreaM2\":%.17g,\"density\":%.17g,\"cap\":%ld},"
           "\"egress\":{\"exitCount\":%ld,\"doorCount\":%ld,\"exitWidthM\":%.17g,\"availableWidthM\":%.17g,"
           "\"requiredWidthM\":%.17g,\"walkTimeS\":%s,\"queueTimeS\":%s,\"estimatedTimeS\":%s,\"speedMps\":%.17g},"
           "\"travel\":{\"computed\":%s,\"longestM\":%s,\"farthest\":%s,\"freeAreaM2\":%.17g,"
           "\"exteriorAreaM2\":%.17g,\"reachableAreaM2\":%.17g,\"unreachableAreaM2\":%.17g,\"cellM\":%.17g,"
           "\"limitM\":%.17g,\"rooms\":[",
           NORMA_CORE_VERSION, document.width, document.height, norma_unit_name(document.unit), document.scale,
           grid.cell, grid.cell_m, (unsigned long) grid.nx, (unsigned long) grid.ny, grid.clearance,
           aforo.free_area_m2, round(grid.exterior_area_m2 * 100.0) / 100.0,
           aforo.max_persons, aforo.declared, aforo.permitted, aforo.used,
           aforo.excess, aforo.source, aforo.free_area_m2, aforo.density, aforo.cap,
           egress.exit_count, egress.door_count, egress.exit_width_m, egress.available_width_m,
           egress.required_width_m, walk, queue, total, egress.speed_mps,
           travel.computed ? "true" : "false", longest, farthest,
           travel.free_area_m2, travel.exterior_area_m2, travel.reachable_area_m2,
           travel.unreachable_area_m2, travel.cell_m, 30.0);
    for (size_t room = 0; room < travel.room_count; room += 1) {
        printf("%s{\"areaM2\":%.17g,\"cells\":%lu,\"center\":{\"x\":%.17g,\"y\":%.17g}}",
               room > 0 ? "," : "", travel.rooms[room].area_m2,
               (unsigned long) travel.rooms[room].cells,
               travel.rooms[room].center.x, travel.rooms[room].center.y);
    }
    printf("]},\"routes\":{\"count\":%lu,\"items\":[", (unsigned long) route_count);
    for (size_t index = 0; index < route_count; index += 1) {
        const norma_route *route = &routes[index];
        printf("%s{\"id\":", index > 0 ? "," : "");
        write_json_string(route->id);
        printf(",\"label\":");
        write_json_string(route->label);
        printf(",\"lengthM\":%.17g,\"lengthSource\":", route->length_m);
        write_json_string(route->length_source);
        printf(",\"endsAtExit\":%s,\"distanceToExitM\":", route->ends_at_exit ? "true" : "false");
        if (route->has_distance_to_exit) {
            printf("%.17g", route->distance_to_exit_m);
        } else {
            printf("null");
        }
        printf(",\"wallCrossings\":%d}", route->wall_crossings);
    }
    printf("]},\"signs\":{\"catalogLoaded\":%s,\"catalog\":%lu,\"iso\":%lu,\"services\":%lu,"
           "\"placed\":%lu,\"unknown\":%lu,\"exitSigns\":%lu,\"fireSigns\":%lu,\"codes\":[",
           has_library ? "true" : "false",
           (unsigned long) signage.catalog_total, (unsigned long) signage.catalog_iso,
           (unsigned long) signage.catalog_services,
           (unsigned long) signage.count, (unsigned long) signage.unknown,
           (unsigned long) signage.exit_sign_count, (unsigned long) signage.fire_sign_count);
    for (size_t index = 0; index < signage.count; index += 1) {
        if (index > 0) {
            printf(",");
        }
        write_json_string(signage.items[index].code);
    }
    printf("]},"); /* cierra los códigos y el bloque de señalización */
    printf("\"extinguishers\":{\"tablesLoaded\":%s,\"profile\":",
           has_ext_norms ? "true" : "false");
    if (has_ext_norms) {
        write_json_string(ext_norms.profile);
    } else {
        printf("null");
    }
    printf(",\"hazard\":");
    if (has_ext_norms) {
        write_json_string(ext_norms.hazard);
    } else {
        printf("null");
    }
    printf(",\"units\":%lu,\"floorAreaM2\":%.17g,\"coveredAreaM2\":%.17g,\"coveredPct\":%.17g,"
           "\"uncoveredAreaM2\":%.17g,\"requiredByArea\":%ld,\"zones\":%lu,"
           "\"unitsWithGap\":%lu,\"classes\":%d,\"missingClasses\":%d,\"recommendations\":[",
           (unsigned long) ext_result.unit_count, ext_result.summary.floor_area_m2,
           ext_result.summary.covered_area_m2, ext_result.summary.covered_pct,
           ext_result.summary.uncovered_area_m2, ext_result.summary.required_by_area,
           (unsigned long) ext_result.zone_count, (unsigned long) ext_result.summary.units_with_gap,
           ext_result.summary.classes, ext_result.summary.missing_classes);
    for (size_t index = 0; index < recommendation_count; index += 1) {
        const norma_ext_recommendation *item = &recommendations[index];
        if (index > 0) {
            printf(",");
        }
        printf("{\"action\":");
        write_json_string(item->action);
        printf(",\"elementId\":");
        if (item->element_id[0] != '\0') {
            write_json_string(item->element_id);
        } else {
            printf("null");
        }
        printf(",\"title\":");
        write_json_string(item->title);
        printf(",\"detail\":");
        write_json_string(item->detail);
        printf(",\"target\":");
        if (item->has_target) {
            printf("{\"x\":%.17g,\"y\":%.17g}", item->target.x, item->target.y);
        } else {
            printf("null");
        }
        printf(",\"type\":");
        write_json_string(item->element.type);
        printf(",\"agent\":");
        write_json_string(item->element.ext_agent);
        printf(",\"capacityLb\":%.17g", item->element.ext_capacity_lb);
        printf(",\"rating\":");
        write_json_string(item->element.ext_rating);
        printf(",\"element\":{\"id\":");
        write_json_string(item->element.id);
        printf(",\"type\":");
        write_json_string(item->element.type);
        printf(",\"x\":%.17g,\"y\":%.17g,\"w\":%.17g,\"h\":%.17g", item->element.x,
               item->element.y, item->element.w, item->element.h);
        printf(",\"extAgent\":");
        write_json_string(item->element.ext_agent);
        printf(",\"extRating\":");
        write_json_string(item->element.ext_rating);
        printf(",\"extCapacityLb\":%.17g", item->element.ext_capacity_lb);
        printf(",\"extMountCm\":%.17g}", item->element.ext_mount_cm);
        printf(",\"gainAreaM2\":%.17g,\"gainPct\":", item->gain_area_m2);
        if (item->has_gain_pct) {
            printf("%.17g", item->gain_pct);
        } else {
            printf("null");
        }
        printf("}");
    }
    printf("]},\"firstAid\":{");
    printf("\"people\":%ld,\"source\":\"%s\",\"kits\":%lu,\"stretchers\":%lu,"
           "\"aeds\":%lu,\"cells\":%lu,\"kitMaxM\":",
           first_aid.people, first_aid.source, (unsigned long) first_aid.kit_count,
           (unsigned long) first_aid.stretcher_count, (unsigned long) first_aid.aed_count,
           (unsigned long) first_aid.cells);
    if (first_aid.has_kit_max) {
        printf("%.17g", first_aid.kit_max_m);
    } else {
        printf("null");
    }
    printf(",\"aedMaxM\":");
    if (first_aid.has_aed_max) {
        printf("%.17g", first_aid.aed_max_m);
    } else {
        printf("null");
    }
    printf("},\"scenarios\":{\"count\":%lu,\"peakPersons\":%ld,\"peakName\":",
           (unsigned long) scenario_count, peak_persons);
    if (scenario_count > 0) {
        write_json_string(peak_name);
    } else {
        printf("null");
    }
    printf("},\"findingsCount\":{\"high\":%ld,\"medium\":%ld,\"low\":%ld,\"info\":%ld},"
           "\"findings\":",
           counts.high, counts.medium, counts.low, counts.info);
    write_findings(&findings);
    norma_findings_free(&findings);
    printf("}\n"); /* cierra el objeto raíz */
    norma_signage_free(&signage);
    if (has_ext_norms) {
        norma_ext_norms_free(&ext_norms);
    }
    if (has_library) {
        norma_library_free(&library);
    }
    norma_grid_free(&grid);
    norma_document_free(&document);
    return 0;
}

static int command_svg(const char *path)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        return 1;
    }
    norma_document document;
    norma_document_init(&document);
    char error[256];
    const int ok = norma_document_from_json(&document, text, length, error, sizeof(error));
    free(text);
    if (!ok) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    const char *name = strrchr(path, '/');
    char title[128];
    snprintf(title, sizeof(title), "%s", name != NULL ? name + 1 : path);
    char *dot = strrchr(title, '.');
    if (dot != NULL) {
        *dot = '\0';
    }
    /* Con el catálogo a mano, las señales salen con su pictograma real. */
    norma_library library;
    char library_error[256];
    const int has_library = load_library(&library, library_error, sizeof(library_error));
    norma_svg_options options = {1, 1, title, has_library ? &library : NULL};
    char *svg = norma_document_to_svg(&document, &options);
    if (has_library) {
        norma_library_free(&library);
    }
    norma_document_free(&document);
    if (svg == NULL) {
        fprintf(stderr, "No se pudo componer el SVG.\n");
        return 3;
    }
    fputs(svg, stdout);
    free(svg);
    return 0;
}

/**
 * Hoja con **todas** las señalizaciones del catálogo: se dibuja cada pictograma
 * con el mismo `<svg>` anidado que usa la exportación del plano, así se ve de un
 * vistazo que las 395 entran y se exportan. La hoja no certifica nada: sirve
 * para revisar qué hay disponible antes de ubicarlo en el plano.
 */
static int command_sign_board(const char *path)
{
    norma_library library;
    char error[256];
    if (!load_library(&library, error, sizeof(error))) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    const size_t columns = 10;
    const size_t rows = (library.count + columns - 1) / columns;
    const double cell = 100.0;
    const double margin = 40.0;
    const double top = 96.0;
    const double width = (double) columns * cell + margin * 2.0;
    const double height = top + (double) rows * cell + 64.0;

    norma_buffer buffer;
    norma_buffer_init(&buffer);
    char text[256];
    snprintf(text, sizeof(text),
             "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%.0fmm\" height=\"%.0fmm\" "
             "viewBox=\"0 0 %.0f %.0f\">",
             width * 0.264583, height * 0.264583, width, height);
    norma_buffer_raw(&buffer, text);
    norma_buffer_raw(&buffer, "<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>");
    snprintf(text, sizeof(text),
             "<text x=\"%.0f\" y=\"44\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"22\" "
             "font-weight=\"600\" fill=\"#0f172a\">Señalización disponible · %lu pictogramas</text>",
             margin, (unsigned long) library.count);
    norma_buffer_raw(&buffer, text);
    snprintf(text, sizeof(text),
             "<text x=\"%.0f\" y=\"70\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"13\" "
             "fill=\"#475569\">%lu ISO 7010 · %lu propias de orientación, servicios, tránsito y brigada · "
             "catálogo local</text>",
             margin, (unsigned long) signage_iso_count(&library),
             (unsigned long) (library.count - signage_iso_count(&library)));
    norma_buffer_raw(&buffer, text);

    for (size_t index = 0; index < library.count; index += 1) {
        const norma_sign *sign = &library.items[index];
        const size_t column = index % columns;
        const size_t row = index / columns;
        const double x = margin + (double) column * cell;
        const double y = top + (double) row * cell;
        if (!norma_library_nested_svg(sign, x + 18.0, y + 4.0, 64.0, 64.0, sign->color, &buffer)) {
            norma_library_free(&library);
            norma_buffer_free(&buffer);
            fprintf(stderr, "No se pudo dibujar «%s».\n", sign->code);
            return 3;
        }
        snprintf(text, sizeof(text),
                 "<text x=\"%.0f\" y=\"%.0f\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"13\" "
                 "text-anchor=\"middle\" fill=\"#0f172a\">%.24s</text>",
                 x + cell / 2.0, y + 88.0, sign->code);
        norma_buffer_raw(&buffer, text);
    }
    snprintf(text, sizeof(text),
             "<text x=\"%.0f\" y=\"%.0f\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"11\" "
             "fill=\"#64748b\">Pictogramas ISO 7010 © Karl Norling (MIT) y señales propias (GPL-3.0). "
             "Ubica cada señal solo si el equipo o el recorrido existe; compruébalo en sitio.</text>",
             margin, height - 22.0);
    norma_buffer_raw(&buffer, text);
    norma_buffer_raw(&buffer, "</svg>\n");

    FILE *file = fopen(path, "wb");
    if (file == NULL) {
        norma_library_free(&library);
        norma_buffer_free(&buffer);
        fprintf(stderr, "No se pudo escribir «%s».\n", path);
        return 4;
    }
    fputs(norma_buffer_text(&buffer), file);
    fclose(file);
    norma_buffer_free(&buffer);

    printf("{\"file\":");
    write_json_string(path);
    printf(",\"signs\":%lu,\"iso\":%lu,\"services\":%lu,\"columns\":%lu,\"rows\":%lu}\n",
           (unsigned long) library.count, (unsigned long) signage_iso_count(&library),
           (unsigned long) (library.count - signage_iso_count(&library)),
           (unsigned long) columns, (unsigned long) rows);
    norma_library_free(&library);
    return 0;
}

/**
 * `--inspect plano.json`: lo mismo que la ventana nativa muestra en su cajón de
 * revisión —resumen y hallazgos—, con una sola receta (`norma_inspect_document`).
 * Existe para que la lista de la ventana se pueda comparar con el motor PHP.
 */
static int command_inspect(const char *path)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        return 1;
    }
    norma_document document;
    norma_document_init(&document);
    char error[256];
    const int ok = norma_document_from_json(&document, text, length, error, sizeof(error));
    free(text);
    if (!ok) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    norma_inspect_result report;
    if (!norma_inspect_document(&document, g_resources, &report, error, sizeof(error))) {
        norma_document_free(&document);
        fprintf(stderr, "%s\n", error);
        return 3;
    }
    const norma_inspect_summary *summary = &report.summary;
    printf("{\"summary\":{\"persons\":%ld,\"declared\":%ld,\"permitted\":%ld,\"excess\":%ld,\"source\":",
           summary->persons, summary->declared, summary->permitted, summary->excess);
    write_json_string(summary->source);
    printf(",\"freeAreaM2\":%.17g,\"exitCount\":%ld,\"longestTravelM\":", summary->free_area_m2,
           summary->exit_count);
    if (summary->has_longest) {
        printf("%.17g", summary->longest_travel_m);
    } else {
        printf("null");
    }
    printf(",\"unreachableM2\":%.17g,\"rooms\":%lu,\"routes\":%lu,\"extinguishers\":%lu,"
           "\"coveredM2\":%.17g,\"coveredPct\":",
           summary->unreachable_m2, (unsigned long) summary->room_count,
           (unsigned long) summary->route_count, (unsigned long) summary->extinguisher_count,
           summary->covered_m2);
    if (summary->has_covered_pct) {
        printf("%.17g", summary->covered_pct);
    } else {
        printf("null");
    }
    printf(",\"hasLibrary\":%s,\"hasExtinguisherNorms\":%s,\"counts\":{"
           "\"high\":%ld,\"medium\":%ld,\"low\":%ld,\"info\":%ld}},"
           "\"findings\":",
           report.has_library ? "true" : "false",
           report.has_ext_norms ? "true" : "false", summary->counts.high, summary->counts.medium,
           summary->counts.low, summary->counts.info);
    write_findings(&report.findings);
    printf("}\n");
    norma_inspect_free(&report);
    norma_document_free(&document);
    return 0;
}

int main(int argc, char **argv)
{
    const char *program = argc > 0 ? argv[0] : "norma-core";
    if (argc < 2) {
        usage(stderr, program);
        return 64;
    }
    /* `--resources DIR` vale en cualquier posición y no se pasa como archivo. */
    char *args[16];
    int count = 0;
    for (int index = 1; index < argc && count < 15; index += 1) {
        if (strcmp(argv[index], "--resources") == 0 && index + 1 < argc) {
            g_resources = argv[index + 1];
            index += 1;
            continue;
        }
        args[count++] = argv[index];
    }
    if (count == 0) {
        usage(stderr, program);
        return 64;
    }
    const char *command = args[0];
    if (strcmp(command, "--help") == 0 || strcmp(command, "-h") == 0) {
        usage(stdout, program);
        return 0;
    }
    if (strcmp(command, "--version") == 0) {
        printf("%s\n", NORMA_CORE_VERSION);
        return 0;
    }
    if (strcmp(command, "--check") == 0) {
        return command_check();
    }
    if (strcmp(command, "--inspect") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Uso: %s --inspect plano.json\n", argv[0]);
            return 2;
        }
        return command_inspect(argv[2]);
    }
    if (strcmp(command, "--audit") == 0) {
        if (count < 2) {
            fprintf(stderr, "Falta el archivo del plano.\n");
            return 64;
        }
        return command_audit(args[1]);
    }
    if (strcmp(command, "--sign-board") == 0) {
        if (count < 2) {
            fprintf(stderr, "Falta el archivo SVG de destino.\n");
            return 64;
        }
        return command_sign_board(args[1]);
    }
    if (strcmp(command, "--svg") == 0) {
        if (count < 2) {
            fprintf(stderr, "Falta el archivo del plano.\n");
            return 64;
        }
        return command_svg(args[1]);
    }
    if (strcmp(command, "--stats") == 0) {
        if (count < 2) {
            fprintf(stderr, "Falta el archivo del plano.\n");
            return 64;
        }
        return command_stats(args[1]);
    }
    fprintf(stderr, "Orden no reconocida: %s\n\n", command);
    usage(stderr, program);
    return 64;
}
