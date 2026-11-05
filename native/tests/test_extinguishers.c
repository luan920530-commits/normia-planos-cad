/*
 * Pruebas de la cobertura de extintores.
 *
 * Lo que se comprueba, en el orden en que se usa:
 *   1. que las tablas normativas se lean del catálogo local y que el perfil y
 *      el riesgo se normalicen (Colombia · NTC 2885 + Resolución 2400, y el
 *      perfil internacional · NFPA 10);
 *   2. que un rótulo como «2-A:10-B:C» se lea igual que en la web, incluidos
 *      los casos raros («10-B:C» sin Clase A, «12-B:C» que la NFPA 10:2007 ya
 *      no reconoce);
 *   3. que los límites salgan de la tabla: recorrido por clase y riesgo, área
 *      por número de A, cantidad mínima por superficie y altura de montaje;
 *   4. que el cálculo de cobertura diga lo mismo que la web: superficie libre,
 *      superficie alcanzada, zonas descubiertas y su motivo;
 *   5. que los hallazgos aparezcan cuando deben y **no** cuando el plano cumple.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/document.h"
#include "normia/extinguisher.h"
#include "normia/findings.h"
#include "normia/firstaid.h"
#include "normia/grid.h"
#include "normia/library.h"

static int checks = 0;
static int failures = 0;

static void check(const char *name, int condition, const char *detail)
{
    checks += 1;
    printf("  %s %s%s%s\n", condition ? "✓" : "✗", name,
           detail != NULL && detail[0] != '\0' ? " · " : "", detail != NULL ? detail : "");
    if (!condition) {
        failures += 1;
    }
}

static const norma_finding *find(const norma_findings *findings, const char *code)
{
    for (size_t index = 0; index < findings->count; index += 1) {
        if (strcmp(findings->items[index].code, code) == 0) {
            return &findings->items[index];
        }
    }
    return NULL;
}

static int count_of(const norma_findings *findings, const char *code)
{
    int total = 0;
    for (size_t index = 0; index < findings->count; index += 1) {
        if (strcmp(findings->items[index].code, code) == 0) {
            total += 1;
        }
    }
    return total;
}

static int load_tables(norma_ext_norms *norms)
{
    static const char *const folders[] = {"../resources", "resources", "../../resources"};
    char error[256];
    for (size_t index = 0; index < sizeof(folders) / sizeof(folders[0]); index += 1) {
        if (norma_ext_norms_load(folders[index], "", "", norms, error, sizeof(error))) {
            return 1;
        }
    }
    return 0;
}

static int load_catalog(norma_library *library)
{
    static const char *const folders[] = {"../resources", "resources", "../../resources"};
    char error[256];
    for (size_t index = 0; index < sizeof(folders) / sizeof(folders[0]); index += 1) {
        if (norma_library_load(folders[index], library, error, sizeof(error))) {
            return 1;
        }
    }
    return 0;
}

/** Piso rectangular cerrado con una salida y los extintores que se añadan. */
static void build_floor(norma_document *document, double width, double height)
{
    norma_document_init(document);
    document->width = width;
    document->height = height;
    const double left = 200.0;
    const double top_y = 200.0;
    const double right = width - 200.0;
    const double bottom = height - 200.0;
    const norma_point a[2] = {{left, top_y}, {right, top_y}};
    const norma_point b[2] = {{left, bottom}, {right, bottom}};
    const norma_point c[2] = {{left, top_y}, {left, bottom}};
    const norma_point d[2] = {{right, top_y}, {right, bottom}};
    const norma_point *walls[4] = {a, b, c, d};
    for (int index = 0; index < 4; index += 1) {
        const long wall = norma_document_add_wall(document, walls[index], 2, NULL, NULL);
        if (wall >= 0) {
            document->elements[wall].stroke = 20.0;
        }
    }
}

static long add_extinguisher(norma_document *document, const char *id, const char *type,
                             double x, double y, const char *agent, double capacity,
                             const char *rating, const char *hazard, double mount)
{
    const long index = norma_document_add_marker(document, type, 0.0, 0.0, NULL);
    if (index < 0) {
        return -1;
    }
    norma_element *element = &document->elements[index];
    snprintf(element->id, sizeof(element->id), "%s", id);
    element->x = x;
    element->y = y;
    element->w = 40.0;
    element->h = 40.0;
    snprintf(element->ext_agent, sizeof(element->ext_agent), "%s", agent);
    snprintf(element->ext_rating, sizeof(element->ext_rating), "%s", rating);
    snprintf(element->ext_hazard, sizeof(element->ext_hazard), "%s", hazard);
    element->ext_capacity_lb = capacity;
    element->ext_mount_cm = mount;
    element->has_ext_mount = 1;
    return index;
}

static void test_ratings(const norma_ext_norms *norms)
{
    int a = 0;
    int b = 0;
    int classes = 0;
    char detail[96];

    norma_ext_parse_rating("2-A:10-B:C", &a, &b, &classes);
    snprintf(detail, sizeof(detail), "%d-A · %d-B · clases %d", a, b, classes);
    check("«2-A:10-B:C» se lee como 2 de A, 10 de B y clases A, B y C",
          a == 2 && b == 10 && (classes & (NORMA_FIRE_A | NORMA_FIRE_B | NORMA_FIRE_C))
                                  == (NORMA_FIRE_A | NORMA_FIRE_B | NORMA_FIRE_C),
          detail);

    norma_ext_parse_rating("10-B:C", &a, &b, &classes);
    snprintf(detail, sizeof(detail), "%d-A · %d-B · clases %d", a, b, classes);
    check("«10-B:C» no tiene Clase A: es un extintor de BC",
          a == 0 && b == 10 && (classes & NORMA_FIRE_A) == 0 && (classes & NORMA_FIRE_B) != 0,
          detail);

    norma_ext_parse_rating(" 4 - A : 60 - B : C ", &a, &b, &classes);
    snprintf(detail, sizeof(detail), "%d-A · %d-B", a, b);
    check("Los espacios del rótulo no cambian la lectura", a == 4 && b == 60, detail);

    norma_ext_parse_rating("12-B:C", &a, &b, &classes);
    check("«12-B» se lee aunque la norma ya no lo reconozca", b == 12, "12-B");

    const char *profile = norma_ext_profile_key(norms);
    check("El perfil por omisión es el colombiano (NTC 2885 + Resolución 2400)",
          strcmp(profile, "colombia") == 0, profile);
    check("El riesgo por omisión es ordinario", strcmp(norms->hazard, "ordinary") == 0, norms->hazard);
    check("La etiqueta del riesgo se toma de la tabla",
          strcmp(norma_ext_hazard_label(norms, "ordinary"), "Ordinario") == 0,
          norma_ext_hazard_label(norms, "ordinary"));
}

static void test_measure(const norma_ext_norms *norms, const norma_library *library)
{
    /* Nave de 40 × 30 m con tres equipos distintos. */
    norma_document document;
    build_floor(&document, 4000.0, 3000.0);
    add_extinguisher(&document, "ext1", "cad_eds_extinguisher", 400.0, 400.0, "pqs_abc", 20.0,
                     "4-A:60-B:C", "ordinary", 120.0);
    add_extinguisher(&document, "ext2", "cad_fire_ext_co2", 3000.0, 2200.0, "co2", 10.0,
                     "10-B:C", "ordinary", 120.0);
    add_extinguisher(&document, "ext3", "cad_drg_extinguisher", 2000.0, 1500.0, "pqs_abc", 10.0,
                     "2-A:10-B:C", "light", 160.0);
    const long sign = norma_document_add_marker(&document, "iso_f001", 2000.0, 1500.0, NULL);
    if (sign >= 0) {
        document.elements[sign].w = 40.0;
        document.elements[sign].h = 40.0;
    }

    norma_grid grid;
    char error[256];
    if (!norma_grid_build(&document, NULL, &grid, error, sizeof(error))) {
        check("La rejilla de la nave se arma", 0, error);
        norma_document_free(&document);
        return;
    }
    norma_ext_result result;
    norma_ext_analyze(&document, &grid, library, norms, &result);

    char detail[160];
    snprintf(detail, sizeof(detail), "%.1f m² de %.1f m² (%.1f %%)",
             result.summary.covered_area_m2, result.summary.floor_area_m2,
             result.summary.covered_pct);
    check("Se miden los tres equipos y la superficie libre de la nave",
          result.unit_count == 3 && fabs(result.summary.floor_area_m2 - 911.4) < 0.05, detail);
    check("La cobertura se mide por recorrido y no en línea recta",
          fabs(result.summary.covered_area_m2 - 801.0) < 0.05
              && fabs(result.summary.covered_pct - 87.9) < 0.05,
          detail);
    snprintf(detail, sizeof(detail), "%ld equipos por 200 m²",
             result.summary.required_by_area);
    check("La Resolución 2400 pide 5 equipos para 911,4 m²",
          result.summary.required_by_area == 5, detail);

    const norma_ext_unit *co2 = &result.units[1];
    snprintf(detail, sizeof(detail), "%.2f m · área %s", co2->travel_m,
             co2->has_area_limit ? "con tope" : "sin tope");
    check("Un 10-B:C de CO₂ tiene recorrido de Clase B y no cubre área de piso",
          co2->has_travel && fabs(co2->travel_m - 9.15) < 0.001 && !co2->has_area_limit
              && co2->classes == (NORMA_FIRE_B | NORMA_FIRE_C),
          detail);

    const norma_ext_unit *abc = &result.units[0];
    snprintf(detail, sizeof(detail), "%.2f m · %.1f m²", abc->travel_m, abc->area_limit_m2);
    check("El 4-A:60-B:C queda con el recorrido más restrictivo y su área por número de A",
          abc->has_travel && fabs(abc->travel_m - 15.25) < 0.001 && abc->has_area_limit
              && fabs(abc->area_limit_m2 - 557.6) < 0.05,
          detail);

    check("El área asignada nunca pasa del tope del rótulo",
          abc->coverage_area_m2 <= abc->area_limit_m2 + 0.05,
          detail);
    check("El equipo más cercano a la señal de extintor queda señalizado",
          result.units[2].sign_covered && result.summary.signs == 1, "F001 cerca");

    norma_findings findings;
    norma_findings_init(&findings);
    norma_ext_findings(&result, norms, &findings);
    snprintf(detail, sizeof(detail), "%lu hallazgos", (unsigned long) findings.count);
    check("La nave produce los hallazgos esperados de extintores",
          find(&findings, "ext_ratio_short") != NULL && find(&findings, "ext_travel_too_long") != NULL
              && find(&findings, "ext_height") != NULL && count_of(&findings, "ext_without_sign") == 2,
          detail);
    const norma_finding *ratio = find(&findings, "ext_ratio_short");
    check("El hallazgo de cantidad cita la norma y la cuenta",
          ratio != NULL && strstr(ratio->detail, "art. 221") != NULL
              && strstr(ratio->detail, "corresponden 5 y el plano tiene 3") != NULL,
          ratio != NULL ? ratio->value : "sin hallazgo");
    const norma_finding *height = find(&findings, "ext_height");
    check("El hallazgo de altura cita la altura y el máximo de la tabla",
          height != NULL && strstr(height->detail, "está a 160 cm") != NULL
              && strstr(height->detail, "pide 153 cm") != NULL,
          height != NULL ? height->value : "sin hallazgo");
    const norma_finding *travel = find(&findings, "ext_travel_too_long");
    check("El hallazgo de recorrido dice la superficie y el punto más desfavorable",
          travel != NULL && strstr(travel->detail, "m²") != NULL && travel->has_position,
          travel != NULL ? travel->value : "sin hallazgo");
    norma_findings_free(&findings);
    norma_grid_free(&grid);
    norma_document_free(&document);

    /* Piso pequeño con un 1-A: el área del rótulo se queda corta. */
    norma_document small;
    build_floor(&small, 2400.0, 2400.0);
    add_extinguisher(&small, "uno", "cad_eds_extinguisher", 1180.0, 1180.0, "pqs_abc", 5.0,
                     "1-A:10-B:C", "ordinary", 120.0);
    if (norma_grid_build(&small, NULL, &grid, error, sizeof(error))) {
        norma_ext_analyze(&small, &grid, library, norms, &result);
        snprintf(detail, sizeof(detail), "cubre %.1f m² de %.1f m²",
                 result.summary.covered_area_m2, result.summary.floor_area_m2);
        check("Un 1-A cubre 139,4 m² y el resto queda para otro equipo",
              fabs(result.summary.covered_area_m2 - 139.4) < 0.05, detail);
        norma_findings_init(&findings);
        norma_ext_findings(&result, norms, &findings);
        check("Cuando el límite que se incumple es el área, el hallazgo lo dice",
              find(&findings, "ext_coverage_gap") != NULL
                  && find(&findings, "ext_travel_too_long") == NULL,
              "ext_coverage_gap");
        norma_findings_free(&findings);
        norma_grid_free(&grid);
    }
    norma_document_free(&small);

    /* Sin extintores: un solo hallazgo informativo, sin inventar cobertura. */
    norma_document empty;
    build_floor(&empty, 2400.0, 2400.0);
    if (norma_grid_build(&empty, NULL, &grid, error, sizeof(error))) {
        norma_ext_analyze(&empty, &grid, library, norms, &result);
        norma_findings_init(&findings);
        norma_ext_findings(&result, norms, &findings);
        check("Sin extintores el auditor lo dice y no calcula cobertura",
              result.unit_count == 0 && findings.count == 1
                  && find(&findings, "ext_missing") != NULL,
              find(&findings, "ext_missing") != NULL ? find(&findings, "ext_missing")->title
                                                     : "sin hallazgo");
        norma_findings_free(&findings);
        norma_grid_free(&grid);
    }
    norma_document_free(&empty);

    /* Rótulo retirado de la norma y equipo sin planilla. */
    norma_document legacy;
    build_floor(&legacy, 2400.0, 2400.0);
    add_extinguisher(&legacy, "viejo", "cad_eds_extinguisher", 1180.0, 1180.0, "pqs_bc", 10.0,
                     "12-B:C", "ordinary", 100.0);
    if (norma_grid_build(&legacy, NULL, &grid, error, sizeof(error))) {
        norma_ext_analyze(&legacy, &grid, library, norms, &result);
        norma_findings_init(&findings);
        norma_ext_findings(&result, norms, &findings);
        const norma_finding *obsolete = find(&findings, "ext_obsolete_rating");
        check("Un rótulo 12-B se marca como retirado por la NFPA 10:2007",
              obsolete != NULL && strcmp(obsolete->severity, "info") == 0
                  && obsolete->has_value && strcmp(obsolete->value, "12-B:C") == 0,
              obsolete != NULL ? obsolete->value : "sin hallazgo");
        check("Un piso que solo tiene BC avisa de la Clase A ausente",
              find(&findings, "ext_no_class_a") != NULL,
              "sin Clase A se avisa");
        norma_findings_free(&findings);
        norma_grid_free(&grid);
    }
    norma_document_free(&legacy);
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Extintores · pruebas\n");

    norma_ext_norms norms;
    if (!load_tables(&norms)) {
        printf("  ✗ No se pudieron leer las tablas de extintores del catálogo local.\n");
        printf("\n0/1 comprobaciones correctas.\n");
        return 1;
    }
    norma_library library;
    const int has_library = load_catalog(&library);

    test_ratings(&norms);
    test_measure(&norms, has_library ? &library : NULL);

    if (has_library) {
        norma_library_free(&library);
    }
    norma_ext_norms_free(&norms);
    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
