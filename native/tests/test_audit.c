/*
 * Pruebas de la rejilla de cálculo y del aforo (etapa N3).
 *
 * Lo que se comprueba: que una habitación cerrada descuente su exterior, que un
 * vano abra el paso sin dejar entrar el exterior por la puerta, que la vía del
 * entorno no cuente como piso, y que el aforo distinga siempre lo calculado de
 * lo declarado —incluido el caso incómodo: gente declarada por encima de la
 * capacidad, que no se recorta en silencio.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/audit.h"
#include "normia/findings.h"
#include "normia/travel.h"
#include "normia/document.h"
#include "normia/grid.h"
#include <errno.h>
#include <unistd.h>

#include "normia/inspect.h"
#include "normia/routes.h"
#include "normia/scenarios.h"

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

static int near(double value, double expected, double tolerance)
{
    return fabs(value - expected) <= tolerance;
}

/** Habitación de 6 × 4 m con un vano en la pared de abajo y una vía al sur. */
static void build_room(norma_document *document)
{
    norma_document_init(document);
    const norma_point top[2] = {{100.0, 100.0}, {700.0, 100.0}};
    const norma_point right[2] = {{700.0, 100.0}, {700.0, 500.0}};
    const norma_point left[2] = {{100.0, 100.0}, {100.0, 500.0}};
    const norma_point bottom_left[2] = {{100.0, 500.0}, {380.0, 500.0}};
    const norma_point bottom_right[2] = {{460.0, 500.0}, {700.0, 500.0}};
    const long walls[5] = {
        norma_document_add_wall(document, top, 2, NULL, NULL),
        norma_document_add_wall(document, right, 2, NULL, NULL),
        norma_document_add_wall(document, left, 2, NULL, NULL),
        norma_document_add_wall(document, bottom_left, 2, NULL, NULL),
        norma_document_add_wall(document, bottom_right, 2, NULL, NULL),
    };
    for (int index = 0; index < 5; index += 1) {
        if (walls[index] >= 0) {
            document->elements[walls[index]].stroke = 20.0;
        }
    }
    const long door = norma_document_add_marker(document, "door", 420.0, 490.0, NULL);
    if (door >= 0) {
        norma_element *element = &document->elements[door];
        element->x = 380.0;
        element->y = 480.0;
        element->w = 80.0;
        element->h = 20.0;
    }
    const long road = norma_document_add_marker(document, "road", 0.0, 700.0, NULL);
    if (road >= 0) {
        norma_element *element = &document->elements[road];
        element->x = 0.0;
        element->y = 700.0;
        element->w = 1123.0;
        element->h = 60.0;
        element->width_m = 4.0;
    }
}

/** Primer hallazgo cuyo código empiece por `prefix` (familias enteras). */
static const norma_finding *find_prefix(const norma_findings *findings, const char *prefix)
{
    const size_t length = strlen(prefix);
    for (size_t index = 0; index < findings->count; index += 1) {
        if (strncmp(findings->items[index].code, prefix, length) == 0) {
            return &findings->items[index];
        }
    }
    return NULL;
}

static void test_grid(void)
{
    norma_document document;
    build_room(&document);
    norma_grid grid;
    char error[256];
    const int ok = norma_grid_build(&document, NULL, &grid, error, sizeof(error));
    check("La rejilla se arma con celdas de 20 cm", ok && near(grid.cell, 20.0, 1e-9),
          ok ? "20 cm" : error);
    if (!ok) {
        norma_document_free(&document);
        return;
    }
    char detail[128];
    snprintf(detail, sizeof(detail), "%.2f m² libres · %.2f m² de exterior",
             grid.free_area_m2, grid.exterior_area_m2);
    check("La habitación cerrada descuenta su exterior", near(grid.free_area_m2, 20.4, 0.05), detail);

    snprintf(detail, sizeof(detail), "%.2f m²", grid.exterior_area_m2);
    check("El exterior medido es el de la vía y el borde del lienzo",
          near(grid.exterior_area_m2, 63.28, 0.05), detail);

    check("Una vía del entorno no se cuenta como piso útil", grid.free_area_m2 < 30.0, "menos de 30 m²");

    norma_grid_free(&grid);
    norma_document_free(&document);
}

static void test_open_canvas(void)
{
    norma_document document;
    norma_document_init(&document);
    const norma_point wall[2] = {{0.0, 0.0}, {400.0, 0.0}};
    norma_document_add_wall(&document, wall, 2, NULL, NULL);
    norma_grid grid;
    char error[256];
    const int ok = norma_grid_build(&document, NULL, &grid, error, sizeof(error));
    check("Sin recinto cerrado se analiza el lienzo completo",
          ok && near(grid.exterior_area_m2, 0.0, 1e-9) && grid.free_area_m2 > 80.0,
          ok ? "todo el lienzo" : error);
    if (ok) {
        norma_grid_free(&grid);
    }
    norma_document_free(&document);
}

static void test_aforo_from_area(void)
{
    norma_aforo aforo;
    norma_document document;
    norma_document_init(&document);

    norma_audit_aforo_from_area(100.0, &document, 0, NULL, &aforo);
    check("Cien metros cuadrados dan veinte personas de capacidad",
          aforo.max_persons == 20 && near(aforo.density, 0.2, 1e-12), "20 personas");
    check("Sin aforo declarado la fuente es una estimación",
          strcmp(aforo.source, "estimated") == 0 && aforo.declared == 0, aforo.source);
    check("Sin declarar, se usa el máximo calculado", aforo.used == 20 && aforo.excess == 0, "20");

    norma_audit_aforo_from_area(100.0, &document, 12, NULL, &aforo);
    check("Un aforo declarado por debajo del máximo manda",
          aforo.permitted == 12 && aforo.used == 12 && strcmp(aforo.source, "declared") == 0, "12");
    check("Por debajo del máximo no hay exceso", aforo.excess == 0, "0");

    norma_audit_aforo_from_area(100.0, &document, 35, NULL, &aforo);
    check("El exceso se informa y no se recorta en silencio",
          aforo.excess == 15 && aforo.used == 35 && aforo.permitted == 20, "15 de exceso");

    document.occupancy = 8;
    norma_audit_aforo_from_area(100.0, &document, 0, NULL, &aforo);
    check("El aforo del plano se usa cuando no se pasa ninguno",
          aforo.declared == 8 && strcmp(aforo.source, "declared") == 0, "8");

    norma_occupancy_criteria criteria;
    norma_occupancy_criteria_default(&criteria);
    criteria.density_persons_per_m2 = 0.0;
    norma_audit_aforo_from_area(100.0, &document, 0, &criteria, &aforo);
    check("Sin densidad no se inventa capacidad: manda el tope",
          aforo.max_persons == 10000 && aforo.cap == 10000, "tope 10 000");

    criteria.density_persons_per_m2 = 0.2;
    criteria.max_persons = 15;
    norma_audit_aforo_from_area(1000.0, &document, 0, &criteria, &aforo);
    check("El tope de personas recorta la capacidad calculada", aforo.max_persons == 15, "15");

    norma_document_free(&document);
}

static void test_aforo_room(void)
{
    norma_document document;
    build_room(&document);
    document.occupancy = 5000;
    norma_aforo aforo;
    norma_grid grid;
    char error[256];
    const int ok = norma_audit_aforo(&document, 0, NULL, NULL, &aforo, &grid, error, sizeof(error));
    char detail[128];
    snprintf(detail, sizeof(detail), "%ld de capacidad · %ld declaradas · %ld de exceso",
             aforo.max_persons, aforo.declared, aforo.excess);
    check("La habitación admite la gente que cabe en 20,4 m²",
          ok && aforo.max_persons == 4, ok ? detail : error);
    check("Cinco mil personas declaradas en 20,4 m² se marcan como exceso",
          ok && aforo.declared == 5000 && aforo.excess == 4996 && aforo.permitted == 4, detail);
    check("La salida se calcula con la gente declarada, no con la capacidad",
          ok && aforo.used == 5000, "5 000");
    if (ok) {
        norma_grid_free(&grid);
    }
    norma_document_free(&document);
}

static void test_egress(void)
{
    norma_document document;
    build_room(&document);
    /* La puerta del recinto es la salida de emergencia. */
    for (size_t index = 0; index < document.count; index += 1) {
        if (strcmp(document.elements[index].type, "door") == 0) {
            document.elements[index].is_exit = 1;
        }
    }
    norma_egress egress;
    norma_audit_egress(&document, 5000, -1.0, NULL, &egress);
    check("Una puerta marcada es una salida", egress.exit_count == 1 && egress.door_count == 1, "1 de 1");

    char detail[160];
    snprintf(detail, sizeof(detail), "%.2f m útiles de %.1f m de vano", egress.available_width_m, egress.exit_width_m);
    check("El ancho útil es el vano por el factor de despeje", near(egress.available_width_m, 0.72, 1e-9), detail);
    snprintf(detail, sizeof(detail), "%.2f m", egress.required_width_m);
    check("Cinco mil personas piden veinticinco metros de ancho", near(egress.required_width_m, 25.0, 1e-9), detail);

    snprintf(detail, sizeof(detail), "%.1f s", egress.queue_time_s);
    check("La cola en la salida se calcula con el flujo de referencia",
          near(egress.queue_time_s, 5341.9, 1e-9), detail);
    check("Sin recorrido medido no se inventa el tiempo de marcha",
          egress.walk_time_s < 0.0 && egress.estimated_time_s < 0.0, "sin recorrido");

    norma_audit_egress(&document, 5000, 4.48, NULL, &egress);
    snprintf(detail, sizeof(detail), "%.1f s de marcha · %.1f s en total", egress.walk_time_s, egress.estimated_time_s);
    check("Con el recorrido medido se suman marcha y cola",
          near(egress.walk_time_s, 4.5, 1e-9) && near(egress.estimated_time_s, 5346.4, 1e-9), detail);

    /* Una medida declarada manda sobre la geometría dibujada. */
    const long extra = norma_document_add_marker(&document, "door", 900.0, 200.0, NULL);
    if (extra >= 0) {
        norma_element *element = &document.elements[extra];
        element->x = 880.0;
        element->y = 180.0;
        element->w = 200.0;
        element->h = 20.0;
        element->is_exit = 1;
        element->measured_m = 1.2;
    }
    norma_audit_egress(&document, 5000, -1.0, NULL, &egress);
    snprintf(detail, sizeof(detail), "%ld salidas · %.2f m de vano", egress.exit_count, egress.exit_width_m);
    check("Dos salidas suman su vano y la medida declarada manda",
          egress.exit_count == 2 && near(egress.exit_width_m, 2.0, 1e-9), detail);

    norma_egress_criteria criteria;
    norma_egress_criteria_default(&criteria);
    criteria.door_clearance_factor = 0.0;
    norma_audit_egress(&document, 5000, 4.48, &criteria, &egress);
    check("Sin ancho útil no hay tiempo de cola, y no se inventa un cero",
          egress.queue_time_s < 0.0 && egress.estimated_time_s < 0.0, "sin cola");

    norma_document_free(&document);
}

/* Una nave de 40 × 30 m con una salida angosta en una esquina: obliga a que el
 * recorrido pase de 30 m, el ancho no alcance y la salida sea la única. */
static void build_warehouse(norma_document *document)
{
    norma_document_init(document);
    document->width = 4000.0;
    document->height = 3000.0;
    document->occupancy = 300;
    const norma_point top[2] = {{100.0, 100.0}, {3900.0, 100.0}};
    const norma_point right[2] = {{3900.0, 100.0}, {3900.0, 2900.0}};
    const norma_point left[2] = {{100.0, 100.0}, {100.0, 2900.0}};
    const norma_point bottom_left[2] = {{100.0, 2900.0}, {300.0, 2900.0}};
    const norma_point bottom_right[2] = {{360.0, 2900.0}, {3900.0, 2900.0}};
    const norma_point *walls[5] = {top, right, left, bottom_left, bottom_right};
    for (int index = 0; index < 5; index += 1) {
        const long wall = norma_document_add_wall(document, walls[index], 2, NULL, NULL);
        if (wall >= 0) {
            document->elements[wall].stroke = 20.0;
        }
    }
    const long door = norma_document_add_marker(document, "door", 0.0, 0.0, NULL);
    if (door >= 0) {
        norma_element *element = &document->elements[door];
        element->x = 300.0;
        element->y = 2880.0;
        element->w = 60.0;
        element->h = 20.0;
        element->is_exit = 1;
    }
}

static void test_travel_and_findings(void)
{
    norma_document document;
    build_warehouse(&document);
    norma_grid grid;
    char error[256];
    if (!norma_grid_build(&document, NULL, &grid, error, sizeof(error))) {
        check("La rejilla de la nave se arma", 0, error);
        norma_document_free(&document);
        return;
    }
    norma_travel travel;
    norma_travel_field(&document, &grid, NULL, &travel);
    char detail[160];
    snprintf(detail, sizeof(detail), "%.2f m hasta el punto más lejano", travel.longest_m);
    check("El recorrido de la nave pasa de treinta metros", travel.computed && travel.has_longest
          && travel.longest_m > 30.0, detail);
    check("Lo que tiene salida se separa de lo que no",
          near(travel.reachable_area_m2 + travel.unreachable_area_m2, grid.free_area_m2, 0.011),
          "suma la superficie libre");

    norma_aforo aforo;
    norma_audit_aforo_from_area(grid.free_area_m2, &document, 0, NULL, &aforo);
    norma_egress egress;
    norma_audit_egress(&document, aforo.used, travel.longest_m, NULL, &egress);

    norma_findings findings;
    norma_findings_init(&findings);
    norma_audit_egress_findings(&document, &travel, &aforo, &egress, NULL, &findings);
    check("La nave produce cinco hallazgos de evacuación y aforo", findings.count == 5, "5");

    const char *expected[5] = {"travel_too_long", "occupancy_over_capacity", "width_short",
                               "too_few_exits", "narrow_exit"};
    int order = findings.count == 5;
    for (size_t index = 0; index < findings.count && index < 5; index += 1) {
        if (strcmp(findings.items[index].code, expected[index]) != 0) {
            order = 0;
        }
    }
    check("Los hallazgos salen por gravedad y luego por título", order, "orden estable");

    const norma_finding *travel_finding = NULL;
    const norma_finding *narrow_finding = NULL;
    for (size_t index = 0; index < findings.count; index += 1) {
        if (strcmp(findings.items[index].code, "travel_too_long") == 0) {
            travel_finding = &findings.items[index];
        } else if (strcmp(findings.items[index].code, "narrow_exit") == 0) {
            narrow_finding = &findings.items[index];
        }
    }
    check("El hallazgo de recorrido dice cuánto mide y cuánto admite el criterio",
          travel_finding != NULL
          && strstr(travel_finding->detail, "admite 30,00 m") != NULL
          && strcmp(travel_finding->severity, "high") == 0,
          travel_finding != NULL ? travel_finding->value : "sin hallazgo");
    check("El hallazgo de la salida angosta cita el ancho medido y el mínimo",
          narrow_finding != NULL
          && strstr(narrow_finding->detail, "mide 0,60 m de vano") != NULL
          && strstr(narrow_finding->detail, "pide 0,80 m") != NULL
          && narrow_finding->has_position,
          narrow_finding != NULL ? narrow_finding->value : "sin hallazgo");

    norma_finding_counts counts;
    norma_findings_count(&findings, &counts);
    snprintf(detail, sizeof(detail), "%ld altas · %ld medias", counts.high, counts.medium);
    check("El recuento por gravedad coincide con la lista",
          counts.high == 1 && counts.medium == 4 && counts.low == 0 && counts.info == 0, detail);
    norma_findings_free(&findings);

    /* Sin salidas marcadas: un solo hallazgo alto, y no se inventa el recorrido. */
    document.elements[document.count - 1].is_exit = 0;
    norma_grid_free(&grid);
    if (norma_grid_build(&document, NULL, &grid, error, sizeof(error))) {
        norma_travel_field(&document, &grid, NULL, &travel);
        check("Sin salidas no se calcula el recorrido", travel.computed == 0 && travel.has_longest == 0,
              "sin recorrido");
        norma_audit_aforo_from_area(grid.free_area_m2, &document, 0, NULL, &aforo);
        norma_audit_egress(&document, aforo.used, -1.0, NULL, &egress);
        norma_findings_init(&findings);
        norma_audit_egress_findings(&document, &travel, &aforo, &egress, NULL, &findings);
        int has_no_exit = 0;
        int has_travel = 0;
        for (size_t index = 0; index < findings.count; index += 1) {
            if (strcmp(findings.items[index].code, "no_exit") == 0) {
                has_no_exit = 1;
            }
            if (strcmp(findings.items[index].code, "travel_too_long") == 0) {
                has_travel = 1;
            }
        }
        check("Sin salidas el hallazgo es «Sin salidas» y no uno de recorrido",
              has_no_exit == 1 && has_travel == 0, "no_exit");
        norma_findings_free(&findings);
        norma_grid_free(&grid);
    }
    norma_document_free(&document);
}

static const norma_finding *find_code(const norma_findings *findings, const char *code)
{
    for (size_t index = 0; index < findings->count; index += 1) {
        if (strcmp(findings->items[index].code, code) == 0) {
            return &findings->items[index];
        }
    }
    return NULL;
}

static void test_scenarios(void)
{
    norma_document document;
    build_warehouse(&document);
    document.scenarios[0].persons = 400;
    snprintf(document.scenarios[0].name, sizeof(document.scenarios[0].name), "Feria");
    document.scenarios[1].persons = 20;
    snprintf(document.scenarios[1].name, sizeof(document.scenarios[1].name), "Charla");
    document.scenario_count = 2;

    norma_grid grid;
    char error[256];
    if (!norma_grid_build(&document, NULL, &grid, error, sizeof(error))) {
        check("La rejilla de la nave se arma para los escenarios", 0, error);
        norma_document_free(&document);
        return;
    }
    norma_travel travel;
    norma_travel_field(&document, &grid, NULL, &travel);
    norma_aforo aforo;
    norma_audit_aforo_from_area(grid.free_area_m2, &document, 0, NULL, &aforo);
    norma_egress egress;
    norma_audit_egress(&document, aforo.used, travel.has_longest ? travel.longest_m : -1.0, NULL,
                       &egress);

    norma_egress_criteria criteria;
    norma_egress_criteria_default(&criteria);
    norma_scenario_item items[NORMA_MAX_SCENARIOS];
    const size_t count = norma_scenarios_analyze(&document, &aforo, &egress, &criteria, items,
                                                NORMA_MAX_SCENARIOS);
    char detail[200];
    snprintf(detail, sizeof(detail), "%zu escenarios · capacidad %ld", count, items[0].capacity);
    check("Los escenarios se calculan con la capacidad del piso", count == 2 && items[0].capacity > 0,
          detail);
    check("El escenario por encima de la capacidad se marca con el exceso",
          items[0].fits == 0 && items[0].excess == items[0].persons - items[0].capacity, detail);
    check("Un escenario que cabe no se marca", items[1].fits == 1 && items[1].excess == 0,
          "Charla cabe");

    norma_findings findings;
    norma_findings_init(&findings);
    norma_scenarios_findings(items, count, &aforo, &findings);
    norma_findings_sort(&findings);
    const norma_finding *over = find_code(&findings, "scenario_over_capacity");
    snprintf(detail, sizeof(detail), "%zu hallazgos", findings.count);
    check("El escenario que no cabe produce su hallazgo", over != NULL
          && strcmp(over->severity, "medium") == 0, detail);
    check("El hallazgo del escenario cita la capacidad y el exceso",
          over != NULL && strstr(over->detail, "0,20 pers./m²") != NULL
              && over->has_value,
          over != NULL ? over->value : "sin hallazgo");
    check("El nombre del escenario va en el título del hallazgo",
          over != NULL && strstr(over->title, "Feria") != NULL,
          over != NULL ? over->title : "sin hallazgo");
    norma_findings_free(&findings);

    /* Sin escenarios declarados no hay hallazgos de escenario. */
    document.scenario_count = 0;
    const size_t none = norma_scenarios_analyze(&document, &aforo, &egress, &criteria, items,
                                               NORMA_MAX_SCENARIOS);
    norma_findings_init(&findings);
    norma_scenarios_findings(items, none, &aforo, &findings);
    check("Sin escenarios declarados no se inventa ninguno", none == 0 && findings.count == 0,
          "sin escenarios");
    norma_findings_free(&findings);

    norma_grid_free(&grid);
    norma_document_free(&document);
}

/** Añade una ruta al documento (el tipo lo pone la herramienta Ruta). */
static long add_route(norma_document *document, const char *id, const char *label,
                      const norma_point *points, size_t count)
{
    const long index = norma_document_add_wall(document, points, count, NULL, NULL);
    if (index < 0) {
        return -1;
    }
    norma_element *element = &document->elements[index];
    snprintf(element->type, sizeof(element->type), "route");
    snprintf(element->id, sizeof(element->id), "%s", id);
    snprintf(element->label, sizeof(element->label), "%s", label);
    return index;
}

static void test_routes(void)
{
    norma_document document;
    build_warehouse(&document);
    norma_route routes[NORMA_MAX_ROUTES];
    norma_findings findings;

    /* Sin rutas dibujadas el auditor lo dice. */
    size_t count = norma_routes_analyze(&document, 1, routes, NORMA_MAX_ROUTES);
    norma_findings_init(&findings);
    norma_routes_findings(routes, count, 1, &findings);
    check("Un plano sin rutas avisa de que falta dibujarlas",
          count == 0 && findings.count == 1 && strcmp(findings.items[0].code, "no_route") == 0,
          count == 0 ? "no_route" : "ruta inesperada");
    norma_findings_free(&findings);

    /* Ruta que llega a la salida (300..360, 2880..2900 → centro 330, 2890). */
    const norma_point buena[2] = {{330.0, 200.0}, {330.0, 2890.0}};
    add_route(&document, "ruta1", "Ruta principal", buena, 2);
    /* Ruta que se queda corta y atraviesa el muro de arriba. */
    const norma_point mala[2] = {{500.0, 500.0}, {500.0, 50.0}};
    add_route(&document, "ruta2", "Ruta corta", mala, 2);

    count = norma_routes_analyze(&document, 1, routes, NORMA_MAX_ROUTES);
    char detail[200];
    snprintf(detail, sizeof(detail), "%zu rutas · %.2f m la primera", count, routes[0].length_m);
    check("Se leen las dos rutas y su longitud dibujada",
          count == 2 && routes[0].length_m > 26.0 && routes[0].length_m < 27.5
              && strcmp(routes[0].length_source, "geometry") == 0,
          detail);
    check("La ruta que termina en la salida se da por buena",
          routes[0].ends_at_exit == 1 && routes[0].wall_crossings == 0, "llega a la salida");
    check("La ruta que se queda corta y cruza el muro se detecta",
          routes[1].ends_at_exit == 0 && routes[1].wall_crossings == 1,
          "1 cruce y sin salida");

    norma_findings_init(&findings);
    norma_routes_findings(routes, count, 1, &findings);
    norma_findings_sort(&findings);
    const norma_finding *crossing = find_code(&findings, "route_through_wall");
    const norma_finding *no_exit = find_code(&findings, "route_no_exit");
    check("La ruta que atraviesa un muro es un hallazgo alto",
          crossing != NULL && strcmp(crossing->severity, "high") == 0
              && crossing->has_value && strcmp(crossing->value, "1") == 0,
          crossing != NULL ? crossing->value : "sin hallazgo");
    check("El hallazgo del cruce nombra la ruta", crossing != NULL
          && crossing->element_count == 1 && strcmp(crossing->element_ids[0], "ruta2") == 0,
          crossing != NULL ? crossing->element_ids[0] : "sin hallazgo");
    check("La ruta que no llega a la salida dice a cuánto queda",
          no_exit != NULL && strstr(no_exit->detail, " m de la salida marcada") != NULL
              && no_exit->has_position,
          no_exit != NULL ? no_exit->value : "sin hallazgo");
    check("Con una salida marcada la ruta buena no genera aviso de salida",
          findings.count == 2, "dos hallazgos");
    norma_findings_free(&findings);

    /* La medida declarada manda sobre el trazo (NORMIA-006 §6.1). */
    document.elements[document.count - 2].measured_m = 40.0;
    count = norma_routes_analyze(&document, 1, routes, NORMA_MAX_ROUTES);
    char measured[80];
    snprintf(measured, sizeof(measured), "%.2f m · %s", routes[0].length_m, routes[0].length_source);
    check("Una ruta con medida declarada usa la medida y no el trazo",
          count == 2 && near(routes[0].length_m, 40.0, 0.001)
              && strcmp(routes[0].length_source, "measured") == 0,
          measured);

    norma_document_free(&document);
}

static void test_inspect(void)
{
    norma_document document;
    build_warehouse(&document);
    const norma_point buena[2] = {{330.0, 200.0}, {330.0, 2890.0}};
    add_route(&document, "ruta1", "Ruta principal", buena, 2);
    document.occupancy = 120;

    norma_inspect_result report;
    char error[256];
    const int ok = norma_inspect_document(&document, "../../resources", &report, error, sizeof(error));
    char detail[220];
    snprintf(detail, sizeof(detail), "%zu hallazgos · %.1f m² libres · %ld personas",
             report.findings.count, report.summary.free_area_m2, report.summary.persons);
    check("La revisión mide el plano y arma la lista completa",
          ok && report.findings.count > 0 && report.summary.free_area_m2 > 100.0
              && report.summary.persons == 120,
          ok ? detail : error);
    check("La revisión encuentra el catálogo y las tablas de extintores",
          ok && report.has_library == 1 && report.has_ext_norms == 1, "catálogo y tablas");
    check("La lista de la revisión va ordenada por gravedad",
          ok && report.findings.count > 0 && strcmp(report.findings.items[0].severity, "high") == 0,
          ok && report.findings.count > 0 ? report.findings.items[0].severity : "sin lista");
    long suma = report.summary.counts.high + report.summary.counts.medium + report.summary.counts.low
                + report.summary.counts.info;
    check("El recuento por gravedad cuadra con la lista",
          ok && suma == (long) report.findings.count,
          "cuenta y lista coinciden");
    check("La revisión informa la salida y la ruta dibujada",
          ok && report.summary.exit_count == 1 && report.summary.route_count == 1,
          "una salida · una ruta");
    const norma_finding *sin_botiquin = find_code(&report.findings, "no_first_aid_kit");
    const norma_finding *de_extintores = find_prefix(&report.findings, "ext_");
    check("La revisión trae también los hallazgos de primeros auxilios y extintores",
          ok && sin_botiquin != NULL && de_extintores != NULL,
          de_extintores != NULL ? de_extintores->code : "sin hallazgo de extintores");
    norma_inspect_free(&report);

    /* Sin recursos se dice que faltan, no se inventan códigos. Para que no
       encuentre el `resources/` del repositorio, se mira desde la raíz. */
    char previous[1024];
    const int had_cwd = getcwd(previous, sizeof(previous)) != NULL;
    if (had_cwd && chdir("/") == 0) {
        norma_inspect_result sin_catalogo;
        const int sin = norma_inspect_document(&document, "/ruta/que/no/existe", &sin_catalogo,
                                               error, sizeof(error));
        check("Sin catálogo la revisión sigue midiendo y lo dice",
              sin == 1 && sin_catalogo.has_library == 0 && sin_catalogo.has_ext_norms == 0
                  && sin_catalogo.findings.count > 0,
              "sin catálogo, con hallazgos");
        norma_inspect_free(&sin_catalogo);
        if (chdir(previous) != 0) {
            check("La prueba vuelve a su carpeta de trabajo", 0, strerror(errno));
        }
    } else {
        check("La prueba puede mirar desde otra carpeta", 0, "sin cambiar de carpeta");
    }
    norma_document_free(&document);
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Rejilla y aforo · pruebas\n");

    test_grid();
    test_open_canvas();
    test_aforo_from_area();
    test_aforo_room();
    test_egress();
    test_travel_and_findings();
    test_scenarios();
    test_routes();
    printf("\nRevisión completa\n");
    test_inspect();

    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
