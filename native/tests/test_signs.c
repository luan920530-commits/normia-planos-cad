/*
 * Pruebas del catálogo de señalización y de los hallazgos que lo usan.
 *
 * Lo que se comprueba:
 *   1. que se lean las **395** señales (332 ISO 7010 + 63 propias) del catálogo
 *      local, que es lo que la edición web tiene disponible;
 *   2. que el tipo del editor y el código del catálogo se traduzcan en los dos
 *      sentidos, sin adivinar cuando el código no existe;
 *   3. que un pictograma se inserte como `<svg>` anidado con su `viewBox` y sus
 *      atributos de presentación (sin ellos se exportaría una caja vacía);
 *   4. que se rechace un SVG con scripts o referencias externas;
 *   5. que la señalización y los primeros auxilios emitan los hallazgos que
 *      dicen las reglas, y ninguno cuando el plano ya cumple.
 *
 * La ruta del catálogo se busca sola (`../resources`, `resources`…). Si no
 * aparece, la prueba falla: no se simula un catálogo.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/audit.h"
#include "normia/document.h"
#include "normia/findings.h"
#include "normia/firstaid.h"
#include "normia/grid.h"
#include "normia/library.h"
#include "normia/signage.h"
#include "normia/svg.h"

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

static int has_code(const norma_findings *findings, const char *code)
{
    for (size_t index = 0; index < findings->count; index += 1) {
        if (strcmp(findings->items[index].code, code) == 0) {
            return 1;
        }
    }
    return 0;
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

/** Busca el catálogo donde lo dejan el Makefile y la raíz del repositorio. */
static int load_library(norma_library *library, char *error, size_t error_size)
{
    static const char *const folders[] = {"../resources", "resources", "../../resources"};
    for (size_t index = 0; index < sizeof(folders) / sizeof(folders[0]); index += 1) {
        if (norma_library_load(folders[index], library, error, error_size)) {
            return 1;
        }
    }
    return 0;
}

static void test_catalog(norma_library *library)
{
    char detail[160];
    size_t iso = 0;
    size_t services = 0;
    for (size_t index = 0; index < library->count; index += 1) {
        if (strncmp(library->items[index].code, "SVC_", 4) == 0) {
            services += 1;
        } else {
            iso += 1;
        }
    }
    snprintf(detail, sizeof(detail), "%lu señales: %lu ISO + %lu propias",
             (unsigned long) library->count, (unsigned long) iso, (unsigned long) services);
    check("El catálogo trae las 395 señales disponibles", library->count == 395, detail);
    check("Son 332 ISO 7010 y 63 propias de orientación", iso == 332 && services == 63, detail);

    char code[64];
    const char *resolved = norma_library_code_for_type(library, "iso_e002", code, sizeof(code));
    check("`iso_e002` se resuelve al código E002", resolved != NULL && strcmp(code, "E002") == 0,
          resolved != NULL ? code : "sin código");
    resolved = norma_library_code_for_type(library, "sig_wc_men", code, sizeof(code));
    check("`sig_wc_men` se resuelve al código SVC_WC_MEN",
          resolved != NULL && strcmp(code, "SVC_WC_MEN") == 0, resolved != NULL ? code : "sin código");
    check("Un código que no está en el catálogo no se inventa",
          norma_library_code_for_type(library, "iso_z999", code, sizeof(code)) == NULL, "sin código");

    char type[64];
    check("El código E001 vuelve al tipo `iso_e001`",
          strcmp(norma_library_type_for_code("E001", type, sizeof(type)), "iso_e001") == 0, type);
    check("El código SVC_AQUI vuelve al tipo `sig_aqui`",
          strcmp(norma_library_type_for_code("SVC_AQUI", type, sizeof(type)), "sig_aqui") == 0, type);

    const norma_sign *exit_sign = norma_library_sign(library, "E002");
    check("La señal E002 trae nombre, familia y color",
          exit_sign != NULL && strstr(exit_sign->name, "Salida") != NULL
              && strcmp(exit_sign->category, "emergency") == 0
              && strcmp(exit_sign->color, "#237f52") == 0,
          exit_sign != NULL ? exit_sign->name : "sin señal");

    norma_buffer nested;
    norma_buffer_init(&nested);
    const int wrote = exit_sign != NULL
                      && norma_library_nested_svg(exit_sign, 10.0, 20.0, 80.0, 60.0, exit_sign->color, &nested);
    const char *svg = norma_buffer_text(&nested);
    static const char *const opening = "<svg x=\"10\" y=\"20\" width=\"80\" height=\"60\"";
    check("La señal se inserta como `<svg>` anidado con su viewBox",
          wrote && strncmp(svg, opening, strlen(opening)) == 0
              && strstr(svg, "viewBox=\"0 0 105.833 105.833\"") != NULL
              && strstr(svg, "preserveAspectRatio=\"xMidYMid meet\"") != NULL,
          "atributos de posición y proporción");
    check("El pictograma conserva su dibujo y su relleno",
          wrote && strstr(svg, "<path") != NULL && strstr(svg, "fill=\"#237f52\"") != NULL
              && strstr(svg, "</svg>") != NULL,
          "trazos del catálogo");
    norma_buffer_free(&nested);

    check("Un SVG con script se rechaza",
          !norma_library_safe_svg("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"),
          "sin scripts");
    check("Un SVG con referencia externa se rechaza",
          !norma_library_safe_svg("<svg xmlns=\"http://www.w3.org/2000/svg\"><image href=\"http://ejemplo/x.png\"/></svg>"),
          "sin llamadas externas");
    check("Un SVG normal del catálogo se acepta",
          exit_sign != NULL && norma_library_safe_svg(exit_sign->svg), "catálogo local");

    /* El plano exportado dibuja el pictograma, no un marcador genérico. */
    norma_document plano;
    norma_document_init(&plano);
    const norma_point wall[2] = {{100.0, 100.0}, {900.0, 100.0}};
    norma_document_add_wall(&plano, wall, 2, NULL, NULL);
    const long sign = norma_document_add_marker(&plano, "iso_e002", 300.0, 300.0, NULL);
    if (sign >= 0) {
        plano.elements[sign].w = 60.0;
        plano.elements[sign].h = 60.0;
    }
    norma_svg_options options = {0, 0, "Prueba", library};
    char *svg_plano = norma_document_to_svg(&plano, &options);
    check("El SVG del plano inserta el pictograma de la señal",
          svg_plano != NULL && strstr(svg_plano, "viewBox=\"0 0 105.833 105.833\"") != NULL
              && strstr(svg_plano, "preserveAspectRatio=\"xMidYMid meet\"") != NULL,
          "señal real en el plano");
    free(svg_plano);
    options.library = NULL;
    char *svg_generico = norma_document_to_svg(&plano, &options);
    check("Sin catálogo la señal se dibuja como caja, no desaparece",
          svg_generico != NULL && strstr(svg_generico, "preserveAspectRatio") == NULL
              && strstr(svg_generico, "<rect x=\"300\" y=\"300\" width=\"60\" height=\"60\"") != NULL,
          "caja de reserva");
    free(svg_generico);
    norma_document_free(&plano);
}

/** Habitación de 8 × 6 m con una salida marcada y las señales que se pidan. */
static void build_floor(norma_document *document)
{
    norma_document_init(document);
    document->width = 1200.0;
    document->height = 900.0;
    document->occupancy = 40;
    const norma_point top[2] = {{100.0, 100.0}, {1100.0, 100.0}};
    const norma_point bottom[2] = {{100.0, 800.0}, {1100.0, 800.0}};
    const norma_point left[2] = {{100.0, 100.0}, {100.0, 800.0}};
    const norma_point right_a[2] = {{1100.0, 100.0}, {1100.0, 350.0}};
    const norma_point right_b[2] = {{1100.0, 440.0}, {1100.0, 800.0}};
    const norma_point *walls[5] = {top, bottom, left, right_a, right_b};
    for (int index = 0; index < 5; index += 1) {
        const long wall = norma_document_add_wall(document, walls[index], 2, NULL, NULL);
        if (wall >= 0) {
            document->elements[wall].stroke = 20.0;
        }
    }
    const long door = norma_document_add_marker(document, "door", 0.0, 0.0, NULL);
    if (door >= 0) {
        norma_element *element = &document->elements[door];
        element->x = 1090.0;
        element->y = 350.0;
        element->w = 20.0;
        element->h = 90.0;
        element->is_exit = 1;
    }
}

static void test_signage(const norma_library *library)
{
    norma_document document;
    build_floor(&document);

    norma_signage signage;
    norma_signage_collect(&document, library, &signage);
    check("Un plano sin señales no declara ninguna", signage.count == 0 && signage.unknown == 0, "0");

    norma_findings findings;
    norma_findings_init(&findings);
    norma_signage_findings(&document, &signage, NULL, &findings);
    check("Sin señalización salen tres hallazgos: salida, «aquí» y extinción",
          findings.count == 3 && has_code(&findings, "exit_without_sign")
              && has_code(&findings, "no_you_are_here") && has_code(&findings, "no_fire_sign"),
          "3 hallazgos");
    const norma_finding *exit = find(&findings, "exit_without_sign");
    check("El hallazgo de la salida pide la señal a menos de 1,50 m",
          exit != NULL && strstr(exit->detail, "a menos de 1,50 m") != NULL && exit->has_position
              && strcmp(exit->severity, "low") == 0,
          exit != NULL ? exit->element_ids[0] : "sin hallazgo");
    norma_findings_free(&findings);
    norma_signage_free(&signage);

    /* Ahora con señal de salida junto al vano, marcador «aquí» y extintor. */
    const long exit_sign = norma_document_add_marker(&document, "iso_e002", 1000.0, 300.0, NULL);
    const long here = norma_document_add_marker(&document, "sig_aqui", 500.0, 400.0, NULL);
    const long fire = norma_document_add_marker(&document, "iso_f001", 200.0, 200.0, NULL);
    const long unknown = norma_document_add_marker(&document, "iso_z999", 700.0, 700.0, NULL);
    for (int index = 0; index < 4; index += 1) {
        const long ids[4] = {exit_sign, here, fire, unknown};
        if (ids[index] >= 0) {
            document.elements[ids[index]].w = 40.0;
            document.elements[ids[index]].h = 40.0;
        }
    }
    norma_signage_collect(&document, library, &signage);
    char detail[160];
    snprintf(detail, sizeof(detail), "%lu colocadas · %lu desconocidas",
             (unsigned long) signage.count, (unsigned long) signage.unknown);
    check("Se resuelven las tres señales y se aparta la que no está en el catálogo",
          signage.count == 3 && signage.unknown == 1 && signage.exit_sign_count == 1
              && signage.fire_sign_count == 1,
          detail);

    norma_findings_init(&findings);
    norma_signage_findings(&document, &signage, NULL, &findings);
    check("Con la señalización puesta no queda ningún hallazgo de señalización",
          findings.count == 0, "0 hallazgos");
    norma_findings_free(&findings);

    /* La señal existe pero está lejos: el hallazgo vuelve. */
    document.elements[exit_sign].x = 200.0;
    document.elements[exit_sign].y = 700.0;
    norma_signage_collect(&document, library, &signage);
    norma_findings_init(&findings);
    norma_signage_findings(&document, &signage, NULL, &findings);
    check("Una señal de salida a más de 1,50 m no cubre la salida",
          findings.count == 1 && has_code(&findings, "exit_without_sign"), "vuelve el hallazgo");
    norma_findings_free(&findings);
    norma_signage_free(&signage);
    norma_document_free(&document);
}

static void test_first_aid(void)
{
    norma_document document;
    norma_document_init(&document);
    document.width = 6000.0;
    document.height = 4000.0;
    document.occupancy = 620;
    const norma_point top[2] = {{100.0, 100.0}, {5900.0, 100.0}};
    const norma_point bottom[2] = {{100.0, 3900.0}, {5900.0, 3900.0}};
    const norma_point left[2] = {{100.0, 100.0}, {100.0, 3900.0}};
    const norma_point right[2] = {{5900.0, 100.0}, {5900.0, 3900.0}};
    const norma_point *walls[4] = {top, bottom, left, right};
    for (int index = 0; index < 4; index += 1) {
        const long wall = norma_document_add_wall(&document, walls[index], 2, NULL, NULL);
        if (wall >= 0) {
            document.elements[wall].stroke = 20.0;
        }
    }
    const long door = norma_document_add_marker(&document, "door", 0.0, 0.0, NULL);
    if (door >= 0) {
        norma_element *element = &document.elements[door];
        element->x = 5800.0;
        element->y = 1900.0;
        element->w = 100.0;
        element->h = 100.0;
        element->is_exit = 1;
    }

    norma_grid grid;
    char error[256];
    if (!norma_grid_build(&document, NULL, &grid, error, sizeof(error))) {
        check("La rejilla del piso grande se arma", 0, error);
        norma_document_free(&document);
        return;
    }
    norma_aforo aforo;
    norma_audit_aforo_from_area(grid.free_area_m2, &document, 0, NULL, &aforo);

    norma_firstaid first_aid;
    norma_findings findings;
    norma_findings_init(&findings);
    norma_firstaid_analyze(&document, &grid, aforo.used, aforo.source, NULL, &first_aid, &findings);
    char detail[160];
    snprintf(detail, sizeof(detail), "%ld personas", first_aid.people);
    check("Sin recursos salen los tres avisos: botiquín, camilla y DEA",
          findings.count == 3 && has_code(&findings, "no_first_aid_kit")
              && has_code(&findings, "no_stretcher") && has_code(&findings, "no_aed"),
          detail);
    const norma_finding *aed = find(&findings, "no_aed");
    check("Con 620 personas el DEA deja de ser informativo y pasa a medio",
          aed != NULL && strcmp(aed->severity, "medium") == 0,
          aed != NULL ? aed->severity : "sin hallazgo");
    check("El aviso del DEA cita el umbral de 500 personas",
          aed != NULL && strstr(aed->detail, "umbral de referencia para contar con DEA es 500") != NULL,
          aed != NULL ? aed->value : "sin valor");
    norma_findings_free(&findings);

    /* Botiquín y DEA en una esquina: no alcanzan 2 000 cm de piso. */
    const long kit = norma_document_add_marker(&document, "cad_emg_firstaid", 200.0, 200.0, NULL);
    const long aed_item = norma_document_add_marker(&document, "cad_emg_aed", 5400.0, 3600.0, NULL);
    const long stretcher = norma_document_add_marker(&document, "cad_emg_stretcher", 5600.0, 3800.0, NULL);
    const long items[3] = {kit, aed_item, stretcher};
    for (int index = 0; index < 3; index += 1) {
        if (items[index] >= 0) {
            document.elements[items[index]].w = 60.0;
            document.elements[items[index]].h = 60.0;
        }
    }
    norma_firstaid_analyze(&document, &grid, aforo.used, aforo.source, NULL, &first_aid, &findings);
    snprintf(detail, sizeof(detail), "botiquín a %.2f m · DEA a %.2f m",
             first_aid.kit_max_m, first_aid.aed_max_m);
    check("Se cuenta un botiquín, una camilla y un DEA",
          first_aid.kit_count == 1 && first_aid.stretcher_count == 1 && first_aid.aed_count == 1,
          "1 · 1 · 1");
    check("El punto más lejano queda lejos del botiquín y del DEA",
          first_aid.has_kit_max && first_aid.kit_max_m > 30.0 && first_aid.has_aed_max
              && first_aid.aed_max_m > 60.0,
          detail);
    check("La camilla ya no se reclama", !has_code(&findings, "no_stretcher"), "camilla ubicada");
    const norma_finding *kit_far = find(&findings, "first_aid_kit_far");
    check("El botiquín lejano se avisa con la distancia y el criterio",
          kit_far != NULL && strstr(kit_far->detail, "criterio de referencia es 30,0 m") != NULL
              && kit_far->has_value,
          kit_far != NULL ? kit_far->value : "sin hallazgo");

    /* Un botiquín por cuadrante: el piso entero queda dentro del alcance. */
    const norma_point corners[4] = {{1500.0, 1100.0}, {4500.0, 1100.0}, {1500.0, 2900.0},
                                    {4500.0, 2900.0}};
    for (int index = 0; index < 4; index += 1) {
        const long extra = norma_document_add_marker(&document, "cad_emg_firstaid",
                                                     corners[index].x, corners[index].y, NULL);
        if (extra >= 0) {
            document.elements[extra].w = 60.0;
            document.elements[extra].h = 60.0;
        }
    }
    norma_findings_free(&findings);
    norma_findings_init(&findings);
    norma_firstaid_analyze(&document, &grid, aforo.used, aforo.source, NULL, &first_aid, &findings);
    snprintf(detail, sizeof(detail), "%.2f m al botiquín más cercano", first_aid.kit_max_m);
    check("Con un botiquín por cuadrante el alcance baja del criterio",
          first_aid.kit_count == 5 && first_aid.kit_max_m < 30.0, detail);
    check("Ese alcance ya no produce hallazgo de botiquín", !has_code(&findings, "first_aid_kit_far"),
          "sin hallazgo");
    norma_findings_free(&findings);
    norma_grid_free(&grid);
    norma_document_free(&document);
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Señalización y primeros auxilios · pruebas\n");

    norma_library library;
    char error[256];
    if (!load_library(&library, error, sizeof(error))) {
        printf("  ✗ No se pudo leer el catálogo local: %s\n", error);
        printf("\n0/1 comprobaciones correctas.\n");
        return 1;
    }
    test_catalog(&library);
    test_signage(&library);
    test_first_aid();
    norma_library_free(&library);

    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
