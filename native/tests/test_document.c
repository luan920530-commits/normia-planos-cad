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
#include "normia/svg.h"
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

/*
 * El inspector de la ventana edita el documento con estas funciones: si alguna
 * dejara de avisar del cambio, el plano se guardaría como si no se hubiera
 * tocado. Aquí se comprueban una por una, y que el color viaje en el archivo.
 */
static void test_inspector(void)
{
    norma_document document;
    norma_document_init(&document);
    const long index = norma_document_add_object(&document, "cad_emg_aed", (norma_point) {500.0, 400.0}, NULL);
    check("El inspector parte de un objeto colocado", index == 0, NULL);

    norma_element *element = &document.elements[0];
    const double start_x = element->x;
    const double start_y = element->y;

    check("Cambiar la caja mueve y redimensiona el objeto",
          norma_document_set_box(&document, 0, start_x + 40.0, start_y + 30.0, 120.0, 90.0) == 1
              && close_to(element->x, start_x + 40.0, 1e-9) && close_to(element->w, 120.0, 1e-9),
          "x · y · w · h");
    check("Una caja sin área se rechaza en vez de guardarse invisible",
          norma_document_set_box(&document, 0, 10.0, 10.0, 0.0, 40.0) == 0,
          NULL);
    check("El giro se guarda dentro de una vuelta completa",
          norma_document_set_rotation(&document, 0, -90.0) == 1 && close_to(element->rotation, 270.0, 1e-9),
          "370° y 10° son lo mismo");
    check("El grosor del trazo se puede cambiar, pero no a negativo",
          norma_document_set_stroke(&document, 0, 3.5) == 1 && close_to(element->stroke, 3.5, 1e-9)
              && norma_document_set_stroke(&document, 0, -1.0) == 0,
          "3,5 cm");
    check("El color propio se acepta en #rrggbb y lo demás no",
          norma_document_set_colour(&document, 0, "#0ea5e9") == 1
              && strcmp(element->colour, "#0ea5e9") == 0
              && norma_document_set_colour(&document, 0, "azul") == 0,
          "#0ea5e9");
    check("Quitar el color devuelve el objeto al de su familia",
          norma_document_set_colour(&document, 0, NULL) == 1 && element->colour[0] == '\0',
          "vacío = familia");
    check("El rótulo y la capa se cambian desde el inspector",
          norma_document_set_label(&document, 0, "DEA recepción") == 1
              && strcmp(element->label, "DEA recepción") == 0
              && norma_document_set_layer(&document, 0, "capa_equipos") == 1
              && strcmp(element->layer, "capa_equipos") == 0,
          "rótulo · capa");
    check("La capa activa recibe lo que se dibuja después",
          norma_document_set_current_layer(&document, "capa_rutas") == 1
              && strcmp(document.layer, "capa_rutas") == 0,
          "capa_rutas");

    /* El color propio tiene que sobrevivir al archivo: es lo que se elige en el
       inspector y lo que se ve en el plano impreso. */
    norma_document_set_colour(&document, 0, "#7c3aed");
    char *json = norma_document_to_json(&document, "Inspector");
    check("El color propio se escribe en el archivo",
          json != NULL && strstr(json, "\"color\":\"#7c3aed\"") != NULL,
          "color");
    norma_document other;
    norma_document_init(&other);
    char error[128];
    const int ok = json != NULL && norma_document_from_json(&other, json, strlen(json), error, sizeof(error));
    check("Abrir el plano devuelve el mismo color",
          ok && other.count == 1 && strcmp(other.elements[0].colour, "#7c3aed") == 0,
          ok ? "ida y vuelta" : error);
    free(json);
    norma_document_free(&other);
    norma_document_free(&document);
}

/** Las figuras de la paleta: línea, rectángulo, elipse y texto. */
static void test_shapes(void)
{
    norma_document document;
    norma_document_init(&document);
    const long line = norma_document_add_shape(&document, "line", (norma_point) {100.0, 400.0},
                                               (norma_point) {300.0, 500.0}, NULL);
    const long rect = norma_document_add_shape(&document, "rect", (norma_point) {500.0, 400.0},
                                               (norma_point) {620.0, 480.0}, NULL);
    const long ellipse = norma_document_add_shape(&document, "ellipse", (norma_point) {700.0, 400.0},
                                                  (norma_point) {800.0, 460.0}, NULL);
    check("La línea se guarda por sus dos nodos",
          line == 0 && document.elements[0].node_count == 2
              && close_to(document.elements[0].nodes[1].x, 300.0, 1e-9),
          "2 nodos");
    check("El rectángulo y la elipse se guardan como caja, sin importar el orden de las esquinas",
          rect == 1 && ellipse == 2 && close_to(document.elements[1].x, 500.0, 1e-9)
              && close_to(document.elements[1].w, 120.0, 1e-9) && close_to(document.elements[2].h, 60.0, 1e-9),
          "500 × 400 · 120 × 80");
    check("Una figura que no es de la paleta se rechaza",
          norma_document_add_shape(&document, "hexágono", (norma_point) {0.0, 0.0}, (norma_point) {10.0, 10.0},
                                   NULL) == -1,
          NULL);

    const long text = norma_document_add_text(&document, (norma_point) {100.0, 600.0}, 200.0, 30.0,
                                              "Salida de emergencia", NULL);
    check("El texto nace con su caja y su contenido",
          text == 3 && strcmp(document.elements[3].type, "text") == 0
              && strcmp(document.elements[3].label, "Salida de emergencia") == 0,
          "texto");
    check("Un texto vacío no se crea",
          norma_document_add_text(&document, (norma_point) {0.0, 0.0}, 100.0, 20.0, "", NULL) == -1,
          NULL);

    const long copy = norma_document_duplicate(&document, (size_t) rect);
    check("Duplicar copia el elemento desplazado y con su propio identificador",
          copy == 4 && strcmp(document.elements[4].type, "rect") == 0
              && close_to(document.elements[4].x, document.elements[1].x + 20.0, 1e-9)
              && strcmp(document.elements[4].id, document.elements[1].id) != 0,
          "+20 cm");

    norma_svg_options options = {0, 0, "Paleta"};
    char *svg = norma_document_to_svg(&document, &options);
    check("El SVG dibuja la línea, el rectángulo, la elipse y el texto por lo que son",
          svg != NULL && strstr(svg, "M 100 400 L 300 500") != NULL
              && strstr(svg, "<rect x=\"500\" y=\"400\" width=\"120\" height=\"80\"/>") != NULL
              && strstr(svg, "<ellipse cx=\"750\" cy=\"430\"") != NULL
              && strstr(svg, ">Salida de emergencia</text>") != NULL,
          "line · rect · ellipse · text");
    free(svg);
    norma_document_free(&document);
}

/** La ficha del inspector web: bloqueo, opacidad, letra, puerta y tipo. */
static void test_inspector_web(void)
{
    norma_document document;
    norma_document_init(&document);

    const long door = norma_document_add_object(&document, "door", (norma_point) {300.0, 400.0}, NULL);
    const long text = norma_document_add_text(&document, (norma_point) {500.0, 400.0}, 180.0, 32.0,
                                              "Salida", NULL);
    check("Hay una puerta y un texto para editar como en el inspector web",
          door == 0 && text == 1, "door · text");

    check("La puerta acepta bisagra y abatimiento invertidos",
          norma_document_set_door_flips(&document, 0, 1, 1) == 1
              && document.elements[0].flip_x == 1 && document.elements[0].flip_y == 1
              && norma_document_set_door_flips(&document, 0, 1, 1) == 0,
          "flipX · flipY");
    check("Solo una puerta acepta esos dos cambios",
          norma_document_set_door_flips(&document, 1, 1, 0) == 0, NULL);

    check("La opacidad se mueve entre el 10 % y el 100 %, como en la web",
          norma_document_set_opacity(&document, 0, 0.55) == 1
              && close_to(document.elements[0].opacity, 0.55, 1e-9)
              && norma_document_set_opacity(&document, 0, 0.01) == 1
              && close_to(document.elements[0].opacity, 0.1, 1e-9)
              && norma_document_set_opacity(&document, 0, 3.0) == 1
              && close_to(document.elements[0].opacity, 1.0, 1e-9),
          "0,55 · 0,10 · 1,00");

    check("El tamaño de letra del texto se puede fijar en centímetros",
          norma_document_set_font_size(&document, 1, 18.0) == 1
              && close_to(document.elements[1].font_size, 18.0, 1e-9)
              && norma_document_set_font_size(&document, 1, 0.0) == 0,
          "18 cm");

    /* Bloqueo: protege de mover, pero no de desbloquear. */
    check("Bloquear un elemento impide moverlo, redimensionarlo y borrarlo por accidente",
          norma_document_set_locked(&document, 0, 1) == 1 && document.elements[0].locked == 1
              && norma_document_move_object(&document, 0, 900.0, 900.0) == 0
              && norma_document_set_box(&document, 0, 10.0, 10.0, 50.0, 50.0) == 0
              && norma_document_set_opacity(&document, 0, 0.3) == 0
              && norma_document_set_locked(&document, 0, 0) == 1,
          "locked · desbloquear sí");

    check("Un elemento se convierte a otro tipo del dibujo y conserva la caja",
          norma_document_set_type(&document, 0, "rect") == 0
              && norma_document_set_type(&document, 1, "rect") == 1
              && strcmp(document.elements[1].type, "rect") == 0
              && norma_document_set_type(&document, 1, "wall") == 0
              && norma_document_set_type(&document, 1, "portal") == 0,
          "texto → rectángulo");

    check("El ancho declarado de una vía se guarda en metros",
          norma_document_add_environment(&document, "road", (norma_point) {0.0, 0.0},
                                         (norma_point) {600.0, 300.0}, NULL) == 2
              && norma_document_set_width_m(&document, 2, 7.5) == 1
              && close_to(document.elements[2].width_m, 7.5, 1e-9),
          "7,5 m");

    const long extinguisher = norma_document_add_object(&document, "cad_eds_extinguisher", (norma_point) {700.0, 500.0}, NULL);
    check("La ficha del extintor acepta agente, clasificación, riesgo, capacidad y montaje",
          extinguisher == 3
              && norma_document_set_extinguisher(&document, 3, "pqs_abc", "2-A:10-B:C", "ordinary", 10.0, 120.0) == 1
              && strcmp(document.elements[3].ext_agent, "pqs_abc") == 0
              && strcmp(document.elements[3].ext_rating, "2-A:10-B:C") == 0
              && strcmp(document.elements[3].ext_hazard, "ordinary") == 0
              && close_to(document.elements[3].ext_capacity_lb, 10.0, 1e-9)
              && document.elements[3].has_ext_mount == 1,
          "pqs_abc · 2-A:10-B:C · ordinario");

    /* Todo lo anterior tiene que viajar en el sobre oficial. */
    char *json = norma_document_to_json(&document, "Inspector web");
    check("Los campos nuevos se escriben en el plano",
          json != NULL && strstr(json, "\"flipX\":true") != NULL && strstr(json, "\"flipY\":true") != NULL
              && strstr(json, "\"fontSize\":18") != NULL && strstr(json, "\"widthM\":7.5") != NULL,
          "flipX · flipY · fontSize · widthM");
    norma_document other;
    norma_document_init(&other);
    char error[128];
    const int ok = json != NULL && norma_document_from_json(&other, json, strlen(json), error, sizeof(error));
    check("Abrir el plano devuelve la ficha completa",
          ok && other.count == 4 && other.elements[0].flip_x == 1 && other.elements[0].flip_y == 1
              && close_to(other.elements[1].font_size, 18.0, 1e-9)
              && close_to(other.elements[2].width_m, 7.5, 1e-9)
              && strcmp(other.elements[3].ext_rating, "2-A:10-B:C") == 0,
          ok ? "ida y vuelta" : error);
    free(json);
    norma_document_free(&other);
    norma_document_free(&document);
}

/** La maqueta de trazo: imagen de fondo y su caja. */
static void test_guide(void)
{
    norma_document document;
    norma_document_init(&document);
    check("Un plano nuevo no tiene maqueta y no se pueden cambiar sus ajustes",
          document.guide.present == 0 && norma_document_set_guide_opacity(&document, 0.5) == 0
              && norma_document_set_guide_visible(&document, 1) == 0
              && norma_document_clear_guide(&document) == 0,
          "sin guía");

    /* Un PNG mínimo, ya en base64 como lo entrega la ventana. */
    const char *data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    check("La maqueta se guarda con su nombre, su caja y su opacidad",
          norma_document_set_guide(&document, "planta.png", data, 100.0, 80.0, 900.0, 600.0) == 1
              && document.guide.present == 1 && document.guide.data_size == strlen(data)
              && strcmp(document.guide.name, "planta.png") == 0
              && close_to(document.guide.w, 900.0, 1e-9)
              && close_to(document.guide.opacity, 0.45, 1e-9)
              && document.guide.visible == 1,
          "planta.png · 900 × 600 · 45 %");
    check("La opacidad de la maqueta se mueve entre el 5 % y el 100 %",
          norma_document_set_guide_opacity(&document, 0.0) == 1
              && close_to(document.guide.opacity, 0.05, 1e-9)
              && norma_document_set_guide_opacity(&document, 0.7) == 1
              && close_to(document.guide.opacity, 0.7, 1e-9),
          "0,05 · 0,70");
    check("La caja de la maqueta se puede recolocar y escalar",
          norma_document_set_guide_box(&document, 50.0, 40.0, 1000.0, 700.0) == 1
              && close_to(document.guide.x, 50.0, 1e-9)
              && norma_document_set_guide_box(&document, 50.0, 40.0, 0.0, 700.0) == 0,
          "50 · 40 · 1000 × 700");
    check("La maqueta se puede ocultar sin perderla y bloquear para calcar encima",
          norma_document_set_guide_visible(&document, 0) == 1 && document.guide.visible == 0
              && document.guide.present == 1
              && norma_document_set_guide_locked(&document, 1) == 1 && document.guide.locked == 1,
          "oculta · bloqueada");

    char *json = norma_document_to_json(&document, "Con maqueta");
    check("La maqueta viaja dentro del archivo del plano, en la raíz del sobre",
          json != NULL && strstr(json, "\"guide\":{\"name\":\"planta.png\"") != NULL
              && strstr(json, data) != NULL && strstr(json, "\"visible\":false") != NULL,
          "guide.data");
    norma_document other;
    norma_document_init(&other);
    char error[128];
    const int ok = json != NULL && norma_document_from_json(&other, json, strlen(json), error, sizeof(error));
    check("Abrir el plano devuelve la maqueta con su caja y su visibilidad",
          ok && other.guide.present == 1 && other.guide.data_size == strlen(data)
              && close_to(other.guide.x, 50.0, 1e-9) && other.guide.visible == 0
              && other.guide.locked == 1 && other.count == 0,
          ok ? "ida y vuelta" : error);
    free(json);

    check("Quitar la maqueta la borra del plano y libera su imagen",
          norma_document_clear_guide(&other) == 1 && other.guide.present == 0
              && other.guide.data == NULL && norma_document_clear_guide(&other) == 0,
          "clear_guide");
    char *clean = norma_document_to_json(&other, "Sin maqueta");
    check("Un plano sin maqueta no escribe la sección",
          clean != NULL && strstr(clean, "\"guide\"") == NULL, "sin guide");
    free(clean);
    norma_document_free(&other);
    norma_document_free(&document);
}

/** Entorno: las herramientas del editor web que no salen del catálogo. */
static void test_environment(void)
{
    norma_document document;
    norma_document_init(&document);
    norma_document_begin_edit(&document);

    const long road = norma_document_add_environment(&document, "road", (norma_point) {0.0, 0.0},
                                                     (norma_point) {600.0, 300.0}, "Vías");
    const long sidewalk = norma_document_add_environment(&document, "sidewalk", (norma_point) {600.0, 300.0},
                                                         (norma_point) {300.0, 420.0}, NULL);
    const long crosswalk = norma_document_add_environment(&document, "crosswalk", (norma_point) {0.0, 300.0},
                                                          (norma_point) {300.0, 420.0}, NULL);
    const long parking = norma_document_add_environment(&document, "parking", (norma_point) {700.0, 100.0},
                                                        (norma_point) {950.0, 600.0}, NULL);
    check("La vía, el andén, el paso y el parqueadero nacen de dos esquinas como caja",
          road == 0 && sidewalk == 1 && crosswalk == 2 && parking == 3
              && close_to(document.elements[0].w, 600.0, 1e-9)
              && close_to(document.elements[1].x, 300.0, 1e-9)
              && close_to(document.elements[3].h, 500.0, 1e-9)
              && document.elements[3].node_count == 0
              && strcmp(document.elements[1].layer, "capa_planta") == 0,
          "vía · andén · paso · parqueadero");
    check("El andén acepta las esquinas en cualquier orden",
          close_to(document.elements[1].w, 300.0, 1e-9) && close_to(document.elements[1].h, 120.0, 1e-9),
          "300 × 120");

    const long property = norma_document_add_environment(&document, "property", (norma_point) {0.0, 700.0},
                                                         (norma_point) {900.0, 700.0}, "Lindero");
    const long pipe = norma_document_add_environment(&document, "pipe", (norma_point) {100.0, 800.0},
                                                     (norma_point) {400.0, 800.0}, NULL);
    const long conduit = norma_document_add_environment(&document, "conduit", (norma_point) {100.0, 850.0},
                                                        (norma_point) {400.0, 850.0}, NULL);
    check("El lindero, la tubería y la canaleta se guardan por sus nodos, con su grosor",
          property == 4 && pipe == 5 && conduit == 6
              && document.elements[4].node_count == 2 && close_to(document.elements[4].stroke, 2.0, 1e-9)
              && close_to(document.elements[5].stroke, 4.0, 1e-9)
              && close_to(document.elements[6].stroke, 3.0, 1e-9)
              && strcmp(document.elements[4].layer, "Lindero") == 0,
          "lindero 2 cm · tubería 4 cm · canaleta 3 cm");

    check("Un elemento de entorno sin área no se crea",
          norma_document_add_environment(&document, "road", (norma_point) {10.0, 10.0},
                                         (norma_point) {10.0, 60.0}, NULL) == -1
              && norma_document_add_environment(&document, "pipe", (norma_point) {5.0, 5.0},
                                                (norma_point) {5.0, 5.0}, NULL) == -1,
          NULL);
    check("Solo los siete oficios del entorno se reconocen como tales",
          norma_environment_is("road") && norma_environment_is("sidewalk")
              && norma_environment_is("crosswalk") && norma_environment_is("parking")
              && norma_environment_is("property") && norma_environment_is("pipe")
              && norma_environment_is("conduit")
              && !norma_environment_is("wall") && !norma_environment_is(NULL),
          "7 oficios");

    norma_svg_options options = {0, 0, "Entorno"};
    char *svg = norma_document_to_svg(&document, &options);
    check("El SVG dibuja la trama de la vía, el andén, el paso y el parqueadero",
          svg != NULL && strstr(svg, "stroke-dasharray=\"12 8\"") != NULL
              && strstr(svg, "fill=\"#f8fafc\"") != NULL
              && strstr(svg, ">P</text>") != NULL,
          "vía · andén · paso · parqueadero");
    check("El lindero va discontinuo y la tubería y la canaleta con su color",
          svg != NULL && strstr(svg, "stroke=\"#7c3d12\"") != NULL
              && strstr(svg, "stroke-dasharray=\"8 5\"") != NULL
              && strstr(svg, "stroke=\"#2563eb\"") != NULL
              && strstr(svg, "stroke=\"#ea580c\"") != NULL,
          "lindero · tubería · canaleta");
    free(svg);

    char *json = norma_document_to_json(&document, "Entorno");
    norma_document otro;
    norma_document_init(&otro);
    char error[256] = "";
    const int loaded = json != NULL
        && norma_document_from_json(&otro, json, strlen(json), error, sizeof(error));
    check("El entorno se guarda y se vuelve a abrir sin perder su oficio ni su grosor",
          loaded && otro.count == document.count
              && strcmp(otro.elements[0].type, "road") == 0
              && strcmp(otro.elements[5].type, "pipe") == 0
              && close_to(otro.elements[5].stroke, 4.0, 1e-9)
              && otro.elements[2].node_count == 0,
          "road · pipe · canaleta");
    free(json);
    norma_document_free(&otro);

    norma_document_undo(&document);
    check("Deshacer devuelve el documento al estado anterior al entorno",
          document.count == 0, "sin elementos");
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
    printf("\nInspector\n");
    test_inspector();
    printf("\nFiguras y texto\n");
    test_shapes();
    printf("\nEntorno\n");
    test_environment();
    printf("\nInspector del editor web\n");
    test_inspector_web();
    printf("\nMaqueta de trazo\n");
    test_guide();
    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
