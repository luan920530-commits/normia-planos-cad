/*
 * Pruebas del núcleo nativo.
 *
 * Se compilan y se ejecutan con `make test` y en el flujo de verificación.
 * No usan ningún marco externo: son comprobaciones directas con un contador,
 * porque el núcleo no debe arrastrar dependencias.
 */
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "normia/geometry.h"
#include "normia/json.h"
#include "normia/plan.h"
#include "normia/units.h"

static int checks = 0;
static int failures = 0;

static void check(const char *name, int condition, const char *detail)
{
    checks += 1;
    if (condition) {
        printf("  ✓ %s%s%s\n", name, detail != NULL && detail[0] != '\0' ? " · " : "", detail != NULL ? detail : "");
        return;
    }
    failures += 1;
    printf("  ✗ %s%s%s\n", name, detail != NULL && detail[0] != '\0' ? " · " : "", detail != NULL ? detail : "");
}

static int close_to(double a, double b, double tolerance)
{
    const double difference = fabs(a - b);
    const double scale = fmax(1.0, fmax(fabs(a), fabs(b)));
    return difference <= tolerance * scale;
}

static void test_units(void)
{
    char detail[64];
    check("La unidad vacía o desconocida se lee como centímetros",
          norma_unit_from_name(NULL) == NORMA_UNIT_CM && norma_unit_from_name("pulgadas") == NORMA_UNIT_CM
              && norma_unit_from_name("mm") == NORMA_UNIT_MM && norma_unit_from_name("m") == NORMA_UNIT_M,
          norma_unit_name(norma_unit_from_name("pulgadas")));

    check("Un metro son cien centímetros y cien unidades en «cm»",
          norma_from_meters(1.0, NORMA_UNIT_CM) == 100.0 && norma_to_meters(100.0, NORMA_UNIT_CM) == 1.0
              && norma_from_meters(1.0, NORMA_UNIT_M) == 1.0 && norma_from_meters(1.0, NORMA_UNIT_MM) == 1000.0,
          NULL);

    snprintf(detail, sizeof(detail), "%.17g", norma_to_meters(3456.0, NORMA_UNIT_MM));
    check("Cambiar de unidad no altera la medida real", close_to(norma_to_meters(3456.0, NORMA_UNIT_MM), 3.456, 1e-12),
          detail);

    snprintf(detail, sizeof(detail), "%.17g", norma_square_meters(1123.0 * 794.0, NORMA_UNIT_CM));
    check("La superficie del lienzo se mide en metros cuadrados",
          close_to(norma_square_meters(1123.0 * 794.0, NORMA_UNIT_CM), 89.1662, 1e-9), detail);

    check("La tolerancia de aplanado es 0,5 cm del plano",
          norma_tolerance(NORMA_UNIT_CM) == 0.5 && close_to(norma_tolerance(NORMA_UNIT_MM), 5.0, 1e-12)
              && norma_tolerance(NORMA_UNIT_M) == 0.005,
          NULL);

    check("La escala solo se acepta como 1:N",
          norma_scale_denominator("1:100") == 100.0 && norma_scale_denominator("1:50") == 50.0
              && norma_scale_denominator("2:100") == 0.0 && norma_scale_denominator("1:0") == 0.0
              && norma_scale_denominator("1:") == 0.0 && norma_scale_denominator(NULL) == 0.0,
          NULL);
}

static void test_geometry(void)
{
    char detail[160];
    const norma_point a = {0.0, 0.0};
    const norma_point b = {400.0, 0.0};
    const norma_point through = {200.0, 200.0};

    const norma_point straight[2] = {{0.0, 0.0}, {300.0, 400.0}};
    check("Un tramo recto mide la cuerda", close_to(norma_polyline_length(straight, 2, NULL), 500.0, 1e-12), NULL);

    const norma_arc arc = norma_arc_from_points(a, through, b);
    snprintf(detail, sizeof(detail), "r=%.17g · barrido=%.17g · longitud=%.17g", arc.r, arc.sweep, arc.length);
    check("Un semicírculo de 400 de cuerda y 200 de flecha se mide como arco",
          arc.valid == 1 && close_to(arc.r, 200.0, 1e-12) && close_to(arc.sagitta, 200.0, 1e-12)
              && close_to(arc.length, 628.3185307179587, 1e-12),
          detail);

    const norma_point points[2] = {{0.0, 0.0}, {400.0, 0.0}};
    const norma_arc arcs[1] = {arc};
    snprintf(detail, sizeof(detail), "%.17g cm", norma_polyline_length(points, 2, arcs));
    check("La polilínea con arco usa el arco y no la cuerda",
          close_to(norma_polyline_length(points, 2, arcs), 628.3185307179587, 1e-12), detail);

    check("Un tramo degenerado o recto no fabrica un arco",
          norma_arc_from_points(a, a, b).valid == 0
              && norma_arc_from_points(a, (norma_point) {200.0, 0.0}, b).valid == 0,
          NULL);

    check("La distancia punto-segmento respeta los extremos",
          close_to(norma_point_segment_distance((norma_point) {200.0, 50.0}, a, b), 50.0, 1e-12)
              && close_to(norma_point_segment_distance((norma_point) {-30.0, 40.0}, a, b), 50.0, 1e-12),
          NULL);

    const norma_point middle = norma_arc_point_at(&arc, 0.5);
    snprintf(detail, sizeof(detail), "(%.6f, %.6f)", middle.x, middle.y);
    check("El punto medio del arco cae sobre el punto de paso", close_to(middle.x, 200.0, 1e-9) && close_to(middle.y, 200.0, 1e-9), detail);
}

static void test_json(void)
{
    char error[128];
    norma_json *root = norma_json_parse_cstr("{\"a\":[1,2.5,true,null,\"x\\u00ed\"],\"b\":{\"c\":\"S\\u00f3tano\"}}", error, sizeof(error));
    check("El lector entiende objetos, arreglos, números y literales", root != NULL, error);
    if (root == NULL) {
        return;
    }
    const norma_json *array = norma_json_get(root, "a");
    check("Cuenta los elementos del arreglo", norma_json_size(array) == 5, NULL);
    check("Lee números y valores lógicos",
          norma_json_number(norma_json_at(array, 1), 0.0) == 2.5 && norma_json_number(norma_json_at(array, 2), 0.0) == 1.0,
          NULL);
    check("Desescapa tildes de \\u", strcmp(norma_json_string(norma_json_at(array, 4)), "xí") == 0, norma_json_string(norma_json_at(array, 4)));
    check("Entra en objetos anidados",
          strcmp(norma_json_string_at(norma_json_get(root, "b"), "c", ""), "Sótano") == 0,
          norma_json_string_at(norma_json_get(root, "b"), "c", ""));
    norma_json_free(root);

    check("Un documento roto no se acepta",
          norma_json_parse_cstr("{\"a\": ", error, sizeof(error)) == NULL
              && norma_json_parse_cstr("[] basura", error, sizeof(error)) == NULL
              && norma_json_parse_cstr("{\"a\":1,}", error, sizeof(error)) == NULL,
          error);
}

static void test_plan(void)
{
    static const char *plan =
        "{\"application\":\"normia-planos-cad\",\"format\":\"normia-plan\",\"schema_version\":3,"
        "\"project\":{\"name\":\"Planta de prueba\"},"
        "\"design\":{\"canvas\":{\"width\":1123,\"height\":794,\"grid\":20,\"unit\":\"cm\",\"scale\":\"1:100\"},"
        "\"elements\":["
        "{\"id\":\"m1\",\"type\":\"wall\",\"points\":[{\"x\":0,\"y\":0},{\"x\":400,\"y\":0}]},"
        "{\"id\":\"m2\",\"type\":\"wall\",\"points\":[{\"x\":400,\"y\":0},{\"x\":400,\"y\":300}],"
        "\"curves\":[{\"kind\":\"arc\",\"through\":{\"x\":550,\"y\":150}}]},"
        "{\"id\":\"p1\",\"type\":\"sign\",\"x\":10,\"y\":10}"
        "]}}";
    norma_plan_stats stats;
    char error[128];
    const int ok = norma_plan_analyze_text(plan, strlen(plan), &stats, error, sizeof(error));
    char detail[160];
    snprintf(detail, sizeof(detail), "%lu elementos · %lu muros · %.17g cm", (unsigned long) stats.elements,
             (unsigned long) stats.walls, stats.wall_length_cm);
    check("El sobre oficial se lee y cuenta elementos y muros",
          ok && stats.elements == 3 && stats.walls == 2 && stats.curved_walls == 1, detail);

    /* Muro recto de 400 + semicírculo de 300 de cuerda y 150 de flecha
       (radio 150, punto de paso en el vértice): 400 + 471,23889803846896. */
    snprintf(detail, sizeof(detail), "%.17g cm · %.17g m", stats.wall_length_cm, stats.wall_length_m);
    check("El muro curvo se mide como arco dentro del plano",
          close_to(stats.wall_length_cm, 400.0 + 471.23889803846896, 1e-12)
              && close_to(stats.wall_length_m, (400.0 + 471.23889803846896) / 100.0, 1e-12),
          detail);

    snprintf(detail, sizeof(detail), "%.17g m² · %s", stats.canvas_area_m2, norma_unit_name(stats.unit));
    check("La superficie y la unidad salen del lienzo", close_to(stats.canvas_area_m2, 89.1662, 1e-9) && stats.unit == NORMA_UNIT_CM, detail);

    check("Un archivo que no es un plano se rechaza con un motivo",
          norma_plan_analyze_text("{\"hola\":1}", 9, &stats, error, sizeof(error)) == 0 && error[0] != '\0',
          error);

    /* El mismo plano declarado en metros mide exactamente lo mismo: la unidad
       solo cambia cómo se leen las cifras, nunca la geometría. */
    static const char *en_metros =
        "{\"design\":{\"canvas\":{\"width\":11.23,\"height\":7.94,\"unit\":\"m\",\"scale\":\"1:100\"},"
        "\"elements\":[{\"type\":\"wall\",\"points\":[{\"x\":0,\"y\":0},{\"x\":400,\"y\":0}]}]}}";
    norma_plan_stats metros;
    const int ok_metros = norma_plan_analyze_text(en_metros, strlen(en_metros), &metros, error, sizeof(error));
    snprintf(detail, sizeof(detail), "%.17g m²", metros.canvas_area_m2);
    check("Cambiar la unidad declarada no altera la medida real",
          ok_metros && close_to(metros.canvas_area_m2, 11.23 * 7.94, 1e-12)
              && close_to(metros.wall_length_cm, 400.0, 1e-12),
          detail);
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Núcleo nativo · pruebas\n\nUnidades\n");
    test_units();
    printf("\nGeometría\n");
    test_geometry();
    printf("\nJSON\n");
    test_json();
    printf("\nPlano\n");
    test_plan();
    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
