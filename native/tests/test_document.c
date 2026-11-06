/*
 * Pruebas del documento nativo: lo que la ventana de macOS va a editar.
 *
 * Comprueban lo que no puede fallar en una app de dibujo: que el muro se mida
 * igual que en PHP, que deshacer devuelva el estado anterior, que la selección
 * elija lo que está debajo del puntero y que el archivo guardado se pueda
 * volver a leer sin perder nada.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/document.h"
#include "normia/json.h"

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

static int close_to(double a, double b, double tolerance)
{
    return fabs(a - b) <= tolerance * fmax(1.0, fmax(fabs(a), fabs(b)));
}

static void test_walls(void)
{
    norma_document document;
    norma_document_init(&document);
    check("Un documento nuevo es A4 horizontal a 1:100 en centímetros",
          document.width == 1123.0 && document.height == 794.0 && document.unit == NORMA_UNIT_CM
              && strcmp(document.scale, "1:100") == 0 && document.count == 0,
          "1123 × 794 cm");

    const norma_point recto[2] = {{0.0, 0.0}, {400.0, 0.0}};
    norma_document_begin_edit(&document);
    const long primero = norma_document_add_wall(&document, recto, 2, NULL, NULL);
    check("Un muro de dos nodos entra en el documento", primero == 0 && document.count == 1, document.elements[0].id);
    check("El muro recto mide su cuerda", close_to(norma_document_length_cm(&document), 400.0, 1e-12), NULL);

    const norma_point curvo[2] = {{400.0, 0.0}, {400.0, 300.0}};
    norma_arc arcos[1];
    arcos[0] = norma_arc_from_points(curvo[0], (norma_point) {550.0, 150.0}, curvo[1]);
    norma_document_begin_edit(&document);
    norma_document_add_wall(&document, curvo, 2, arcos, NULL);
    char detail[96];
    snprintf(detail, sizeof(detail), "%.17g cm", norma_document_length_cm(&document));
    check("El muro curvo suma el arco y no la cuerda",
          close_to(norma_document_length_cm(&document), 400.0 + 471.23889803846896, 1e-12), detail);

    check("La longitud en metros sale en metros",
          close_to(norma_document_length_m(&document), (400.0 + 471.23889803846896) / 100.0, 1e-12), NULL);

    norma_document_free(&document);
}

static void test_routes(void)
{
    norma_document document;
    norma_document_init(&document);
    const norma_point nodes[3] = {{100.0, 100.0}, {300.0, 100.0}, {300.0, 300.0}};
    const long index = norma_document_add_route(&document, nodes, 3, NULL, NULL);
    char detail[128];
    snprintf(detail, sizeof(detail), "%s · grosor %.1f · %zu nodos",
             index >= 0 ? document.elements[index].type : "sin ruta",
             index >= 0 ? document.elements[index].stroke : 0.0,
             index >= 0 ? document.elements[index].node_count : 0);
    check("La herramienta Ruta guarda un trazo de tipo ruta con su grosor",
          index >= 0 && strcmp(document.elements[index].type, "route") == 0
              && document.elements[index].stroke == 3.0
              && document.elements[index].node_count == 3,
          detail);
    check("La ruta se identifica con su propio nombre",
          index >= 0 && strncmp(document.elements[index].id, "ruta_", 5) == 0,
          index >= 0 ? document.elements[index].id : "sin ruta");
    check("La ruta entra al historial como cualquier otra edición",
          document.count == 1 && norma_document_length_cm(&document) > 399.0
              && norma_document_length_cm(&document) < 401.0,
          "400 cm dibujados");

    char *json = norma_document_to_json(&document, "Rutas");
    norma_document leido;
    norma_document_init(&leido);
    char error[128];
    const int ok = json != NULL
                   && norma_document_from_json(&leido, json, strlen(json), error, sizeof(error));
    check("La ruta sobrevive a guardar y abrir",
          ok && leido.count == 1 && strcmp(leido.elements[0].type, "route") == 0,
          ok ? leido.elements[0].type : error);
    free(json);
    norma_document_free(&leido);
    norma_document_free(&document);
}

static void test_history(void)
{
    norma_document document;
    norma_document_init(&document);
    const norma_point recto[2] = {{10.0, 10.0}, {210.0, 10.0}};
    norma_document_begin_edit(&document);
    norma_document_add_wall(&document, recto, 2, NULL, NULL);
    norma_document_begin_edit(&document);
    norma_document_add_marker(&document, "extinguisher", 50.0, 60.0, NULL);
    check("Dos ediciones dejan dos elementos", document.count == 2, NULL);

    check("Deshacer quita el último elemento", norma_document_undo(&document) == 1 && document.count == 1, NULL);
    check("Deshacer otra vez deja el plano vacío", norma_document_undo(&document) == 1 && document.count == 0, NULL);
    check("Sin ediciones no hay nada que deshacer", norma_document_undo(&document) == 0, NULL);

    check("Rehacer devuelve el muro", norma_document_redo(&document) == 1 && document.count == 1
              && strcmp(document.elements[0].type, "wall") == 0,
          document.count ? document.elements[0].type : "vacío");
    check("Rehacer devuelve también el equipo", norma_document_redo(&document) == 1 && document.count == 2, NULL);

    /* Editar después de deshacer descarta el futuro: es lo que espera
       cualquiera que haya usado un editor. */
    norma_document_undo(&document);
    norma_document_begin_edit(&document);
    norma_document_add_marker(&document, "sign", 90.0, 90.0, NULL);
    check("Editar tras deshacer descarta lo que se podía rehacer", norma_document_redo(&document) == 0, NULL);

    norma_document_free(&document);
}

static void test_hit_test(void)
{
    norma_document document;
    norma_document_init(&document);
    const norma_point muro[2] = {{100.0, 100.0}, {400.0, 100.0}};
    norma_document_add_wall(&document, muro, 2, NULL, NULL);
    norma_document_add_marker(&document, "extinguisher", 600.0, 500.0, NULL);

    check("El puntero sobre el muro selecciona el muro",
          norma_document_hit_test(&document, (norma_point) {250.0, 103.0}, 5.0) == 0, NULL);
    check("El puntero sobre el equipo selecciona el equipo",
          norma_document_hit_test(&document, (norma_point) {603.0, 497.0}, 8.0) == 1, NULL);
    check("Lejos de todo no se selecciona nada",
          norma_document_hit_test(&document, (norma_point) {900.0, 700.0}, 5.0) == -1, NULL);
    check("La tolerancia manda: más holgura sí alcanza",
          norma_document_hit_test(&document, (norma_point) {250.0, 112.0}, 5.0) == -1
              && norma_document_hit_test(&document, (norma_point) {250.0, 112.0}, 15.0) == 0,
          NULL);

    norma_document_move_node(&document, 0, 0, 120.0, 120.0);
    check("Mover un nodo mueve el trazo",
          close_to(document.elements[0].nodes[0].x, 120.0, 1e-12)
              && norma_document_hit_test(&document, (norma_point) {110.0, 110.0}, 20.0) == 0,
          NULL);

    norma_document_begin_edit(&document);
    check("Borrar un elemento lo quita", norma_document_remove(&document, 1) == 1 && document.count == 1, NULL);
    check("Y se puede deshacer el borrado", norma_document_undo(&document) == 1 && document.count == 2, NULL);

    norma_document_free(&document);
}

static void test_roundtrip(void)
{
    norma_document document;
    norma_document_init(&document);
    const norma_point recto[2] = {{0.0, 0.0}, {400.0, 0.0}};
    const norma_point curvo[2] = {{400.0, 0.0}, {400.0, 300.0}};
    norma_arc arcos[1];
    arcos[0] = norma_arc_from_points(curvo[0], (norma_point) {550.0, 150.0}, curvo[1]);
    norma_document_add_wall(&document, recto, 2, NULL, NULL);
    norma_document_add_wall(&document, curvo, 2, arcos, NULL);
    norma_document_add_marker(&document, "extinguisher", 80.0, 80.0, NULL);
    /* Simulacro: reacción distinta de la de omisión y cronómetro declarado. */
    document.drill_reaction_s = 45;
    document.drill_measured_s = 95;

    const double antes = norma_document_length_cm(&document);
    char *json = norma_document_to_json(&document, "Planta nativa");
    check("El documento se guarda en el sobre oficial",
          json != NULL && strstr(json, "\"format\":\"normia-plan\"") != NULL
              && strstr(json, "\"schema_version\":3") != NULL && strstr(json, "\"Planta nativa\"") != NULL,
          json != NULL ? "normia-plan · esquema 3" : "sin texto");

    norma_document leido;
    norma_document_init(&leido);
    char error[128];
    const int ok = json != NULL && norma_document_from_json(&leido, json, strlen(json), error, sizeof(error));
    char detail[128];
    snprintf(detail, sizeof(detail), "%lu elementos · %.17g cm", (unsigned long) leido.count, norma_document_length_cm(&leido));
    check("El archivo guardado se vuelve a leer sin perder nada",
          ok && leido.count == 3 && close_to(norma_document_length_cm(&leido), antes, 1e-12), detail);
    check("El arco sobrevive a la ida y vuelta",
          ok && leido.elements[1].arcs[0].valid == 1
              && close_to(leido.elements[1].arcs[0].length, 471.23889803846896, 1e-9),
          ok ? "arco de 471,2389 cm" : error);
    check("El lienzo y la escala también se conservan",
          ok && leido.width == 1123.0 && leido.height == 794.0 && leido.unit == NORMA_UNIT_CM
              && strcmp(leido.scale, "1:100") == 0,
          ok ? leido.scale : error);

    check("El simulacro se guarda dentro del lienzo, no en el sobre",
          ok && leido.drill_reaction_s == 45 && leido.drill_measured_s == 95
              && json != NULL && strstr(json, "\"drill\":{\"reactionS\":45,\"measuredS\":95}") != NULL,
          ok ? "45 s de reacción · 95 s medidos" : error);

    norma_document sin_drill;
    norma_document_init(&sin_drill);
    const char *simple = "{\"design\":{\"canvas\":{\"width\":100,\"height\":100},"
                         "\"elements\":[]}}";
    const int leido_simple = norma_document_from_json(&sin_drill, simple, strlen(simple), error, sizeof(error));
    char *guardado = leido_simple ? norma_document_to_json(&sin_drill, "Sin simulacro") : NULL;
    check("Sin cronómetro ni reacción propia el bloque no se escribe",
          leido_simple && sin_drill.drill_reaction_s == 30 && sin_drill.drill_measured_s == 0
              && guardado != NULL && strstr(guardado, "\"drill\"") == NULL,
          guardado != NULL ? "sin bloque drill" : error);
    free(guardado);
    norma_document_free(&sin_drill);

    norma_json *parsed = norma_json_parse_cstr(json, error, sizeof(error));
    check("El archivo guardado es JSON válido y con la forma que espera la web",
          parsed != NULL && norma_json_get(parsed, "design") != NULL
              && norma_json_size(norma_json_get(norma_json_get(parsed, "design"), "elements")) == 3,
          parsed != NULL ? "design.elements" : error);
    norma_json_free(parsed);

    free(json);
    norma_document_free(&document);
    norma_document_free(&leido);

    norma_document vacio;
    norma_document_init(&vacio);
    char basura_error[128];
    check("Un archivo ajeno se rechaza con un motivo",
          norma_document_from_json(&vacio, "{\"hola\":1}", 9, basura_error, sizeof(basura_error)) == 0
              && basura_error[0] != '\0',
          basura_error);
    norma_document_free(&vacio);
}

static void test_units(void)
{
    /* El mismo dibujo declarado en milímetros: las coordenadas no cambian y la
       medida en centímetros tampoco. Es la regla del proyecto. */
    norma_document document;
    norma_document_init_with(&document, 1123.0, 794.0, NORMA_UNIT_MM, "1:50");
    const norma_point muro[2] = {{0.0, 0.0}, {250.0, 0.0}};
    norma_document_add_wall(&document, muro, 2, NULL, NULL);
    check("Cambiar la unidad declarada no altera la medida",
          close_to(norma_document_length_cm(&document), 250.0, 1e-12)
              && close_to(norma_document_length_m(&document), 2.5, 1e-12),
          NULL);

    char *json = norma_document_to_json(&document, "En milímetros");
    check("La unidad declarada se escribe en el archivo",
          json != NULL && strstr(json, "\"unit\":\"mm\"") != NULL && strstr(json, "\"scale\":\"1:50\"") != NULL,
          NULL);
    free(json);
    norma_document_free(&document);
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Documento nativo · pruebas\n\nMuros y medidas\n");
    test_walls();
    printf("\nRutas\n");
    test_routes();
    printf("\nDeshacer y rehacer\n");
    test_history();
    printf("\nSelección\n");
    test_hit_test();
    printf("\nGuardar y abrir\n");
    test_roundtrip();
    printf("\nUnidades\n");
    test_units();
    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
