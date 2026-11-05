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
#include "normia/document.h"
#include "normia/grid.h"

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

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Rejilla y aforo · pruebas\n");

    test_grid();
    test_open_canvas();
    test_aforo_from_area();
    test_aforo_room();

    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
