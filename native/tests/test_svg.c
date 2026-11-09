/*
 * Pruebas del formato de cifras y de la exportación SVG.
 *
 * Lo que se comprueba aquí es lo que se ve en el papel: que una cota diga
 * «400 cm» y no «400.0», que la escala sea física (190 mm de ancho a 1:100) y
 * que el trazado de un arco salga con las mismas cifras que el de PHP.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/document.h"
#include "normia/format.h"
#include "normia/object.h"
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

/** Cuántas veces aparece `needle` en `haystack`. */
static int count_of(const char *haystack, const char *needle)
{
    int total = 0;
    const size_t size = strlen(needle);
    for (const char *cursor = strstr(haystack, needle); cursor != NULL && size > 0;
         cursor = strstr(cursor + size, needle)) {
        total += 1;
    }
    return total;
}

static void test_numbers(void)
{
    char text[64];
    norma_svg_number(150.0, text, sizeof(text));
    check("Un número redondo no lleva decimales", strcmp(text, "150") == 0, text);
    norma_svg_number(150.004, text, sizeof(text));
    check("Los decimales se recortan a dos cifras", strcmp(text, "150") == 0, text);
    norma_svg_number(471.23889803846896, text, sizeof(text));
    check("El arco de la etapa 0 se escribe con dos decimales", strcmp(text, "471.24") == 0, text);
    norma_svg_number(-0.0001, text, sizeof(text));
    check("El cero negativo se escribe como cero", strcmp(text, "0") == 0, text);
}

static void test_measures(void)
{
    char text[64];
    norma_format_measure_cm(400.0, NORMA_UNIT_CM, text, sizeof(text));
    check("Cuatro metros se leen como 400 cm", strcmp(text, "400 cm") == 0, text);

    norma_format_measure_cm(471.23889803846896, NORMA_UNIT_CM, text, sizeof(text));
    check("Una cifra con decimales usa la coma", strcmp(text, "471,2 cm") == 0, text);

    norma_format_measure_cm(112123.89, NORMA_UNIT_CM, text, sizeof(text));
    check("Los miles llevan punto, como en es-CO", strcmp(text, "112.123,9 cm") == 0, text);

    norma_format_measure_cm(471.23889803846896, NORMA_UNIT_M, text, sizeof(text));
    check("En metros, la misma longitud se lee en metros", strcmp(text, "4,7 m") == 0, text);

    norma_format_measure_cm(471.23889803846896, NORMA_UNIT_MM, text, sizeof(text));
    check("En milímetros, la misma longitud se lee en milímetros", strcmp(text, "4.712,4 mm") == 0, text);

    norma_format_measure_cm(0.0, NORMA_UNIT_CM, text, sizeof(text));
    check("El cero se escribe sin decimales", strcmp(text, "0 cm") == 0, text);
}

/** SVG sin rejilla ni franja: no debe llevar ni líneas de rejilla ni escala. */
static int plain_svg_is_clean(const norma_document *document)
{
    norma_svg_options plain = {0, 0, "Sin franja"};
    char *clean = norma_document_to_svg(document, &plain);
    const int fine = clean != NULL && strstr(clean, "<line x1=\"20\"") == NULL && strstr(clean, "Escala") == NULL;
    free(clean);
    return fine;
}

static void test_svg(void)
{
    norma_document document;
    norma_document_init(&document);
    const norma_point recto[2] = {{0.0, 0.0}, {400.0, 0.0}};
    const norma_point curvo[2] = {{400.0, 0.0}, {400.0, 300.0}};
    norma_arc arcos[1];
    arcos[0] = norma_arc_from_points(curvo[0], (norma_point) {550.0, 150.0}, curvo[1]);
    norma_document_add_wall(&document, recto, 2, NULL, NULL);
    norma_document_add_wall(&document, curvo, 2, arcos, NULL);
    norma_document_add_dimension(&document, (norma_point) {0.0, 500.0}, (norma_point) {400.0, 500.0}, NULL);
    norma_document_add_marker(&document, "extinguisher", 80.0, 80.0, NULL);

    char buffer[4096];
    const int ok = norma_svg_path_cm(&document.elements[1], buffer, sizeof(buffer));
    check("El trazado del muro curvo se escribe como en PHP",
          ok && strcmp(buffer, "M 400 0 A 150 150 0 0 1 400 300") == 0, buffer);

    const int recto_ok = norma_svg_path_cm(&document.elements[0], buffer, sizeof(buffer));
    check("El muro recto se escribe como una línea", recto_ok && strcmp(buffer, "M 0 0 L 400 0") == 0, buffer);

    check("La escala física a 1:100 es 0,1 mm por centímetro",
          fabs(norma_svg_mm_per_cm("1:100") - 0.1) < 1e-12
              && fabs(norma_svg_mm_per_cm("1:50") - 0.2) < 1e-12,
          NULL);
    check("Una escala inválida se lee como 1:100",
          fabs(norma_svg_mm_per_cm("2:100") - 0.1) < 1e-12 && fabs(norma_svg_mm_per_cm(NULL) - 0.1) < 1e-12,
          NULL);

    norma_svg_options options = {1, 1, "Planta de prueba"};
    char *svg = norma_document_to_svg(&document, &options);
    check("El SVG se compone", svg != NULL && strstr(svg, "<svg") != NULL && strstr(svg, "</svg>") != NULL, NULL);
    if (svg != NULL) {
        check("El ancho del papel es físico y mínimo 190 mm",
              strstr(svg, "width=\"190.00mm\"") != NULL, "190 mm");
        check("El alto incluye la franja de datos",
              strstr(svg, "height=\"103.40mm\"") != NULL, "103,40 mm");
        check("El viewBox está en unidades del plano, no en milímetros",
              strstr(svg, "viewBox=\"0 0 1900 1034\"") != NULL, "1900 × 1034");
        check("La franja lleva el nombre, la escala y el aviso",
              strstr(svg, "Planta de prueba") != NULL && strstr(svg, "Escala 1:100") != NULL
                  && strstr(svg, "no es un plano de obra") != NULL,
              NULL);
        check("Los muros salen como trazados con arcos",
              strstr(svg, "M 400 0 A 150 150 0 0 1 400 300") != NULL, NULL);
        check("La cota se rotula con la cifra y la unidad",
              strstr(svg, ">400 cm</text>") != NULL, NULL);
        check("El equipo se marca con su círculo y su cruz",
              strstr(svg, "<circle cx=\"80\" cy=\"80\" r=\"12\"/>") != NULL, NULL);
        check("La rejilla y la franja se pueden apagar", plain_svg_is_clean(&document), NULL);
        free(svg);
    }

    /* El nombre con caracteres de XML no puede romper el archivo. */
    norma_svg_options risky = {0, 1, "Plano <A&B> \"2026\""};
    char *escaped = norma_document_to_svg(&document, &risky);
    check("El nombre se escapa para XML",
          escaped != NULL && strstr(escaped, "Plano &lt;A&amp;B&gt; &quot;2026&quot;") != NULL, NULL);
    free(escaped);

    norma_document_free(&document);
}

static void test_svg_roundtrip(void)
{
    /* Un plano guardado y vuelto a abrir tiene que dar el mismo SVG: si no, el
       archivo y la pantalla estarían mintiendo en algún sitio. */
    norma_document document;
    norma_document_init(&document);
    const norma_point nodes[3] = {{0.0, 0.0}, {300.0, 0.0}, {300.0, 200.0}};
    norma_arc arcs[2];
    arcs[0] = norma_arc_from_points(nodes[0], (norma_point) {150.0, 60.0}, nodes[1]);
    memset(&arcs[1], 0, sizeof(norma_arc));
    norma_document_add_wall(&document, nodes, 3, arcs, NULL);
    norma_document_add_dimension(&document, nodes[0], nodes[2], NULL);

    norma_svg_options options = {0, 0, "Ida y vuelta"};
    char *first = norma_document_to_svg(&document, &options);
    char *json = norma_document_to_json(&document, "Ida y vuelta");

    norma_document other;
    norma_document_init(&other);
    char error[128];
    const int ok = json != NULL && norma_document_from_json(&other, json, strlen(json), error, sizeof(error));
    char *second = ok ? norma_document_to_svg(&other, &options) : NULL;
    check("Guardar y volver a abrir da exactamente el mismo SVG",
          first != NULL && second != NULL && strcmp(first, second) == 0,
          ok ? "idéntico" : error);

    free(first);
    free(second);
    free(json);
    norma_document_free(&document);
    norma_document_free(&other);
}

/**
 * Lo que se inserta desde la ventana: la puerta, el portón y los equipos. Se
 * comparan las piezas que se ven en el papel, no el archivo entero.
 */
static void test_inserted_objects(void)
{
    norma_document document;
    norma_document_init(&document);
    /* La puerta apoya su caja sobre el muro: el clic va en la línea del muro. */
    const long door = norma_document_add_object(&document, "door", (norma_point) {90.0, 90.0}, NULL);
    const long garage = norma_document_add_object(&document, "door_garage", (norma_point) {400.0, 200.0}, NULL);
    (void) norma_document_add_object(&document, "cad_eds_extinguisher", (norma_point) {600.0, 300.0}, NULL);
    (void) norma_document_add_object(&document, "cad_emg_firstaid", (norma_point) {800.0, 300.0}, NULL);
    (void) norma_document_add_object(&document, "cad_emg_aed", (norma_point) {1000.0, 300.0}, NULL);

    check("Los objetos del menú se insertan en el documento", door == 0 && garage == 1,
          "door · door_garage");

    norma_svg_options options = {0, 0, "Objetos"};
    char *svg = norma_document_to_svg(&document, &options);
    check("La puerta se exporta con jambas, umbral discontinuo, hoja y arco",
          svg != NULL && strstr(svg, "M 45 90 V 76") != NULL
              && strstr(svg, "M 45 90 H 135") != NULL
              && strstr(svg, "stroke-dasharray=\"4 4\"") != NULL
              && strstr(svg, "M 45 0 A 90 90 0 0 1 135 90") != NULL,
          "jambas · umbral · hoja · arco");

    check("El portón lleva su panel y sus barrotes",
          svg != NULL && count_of(svg, "opacity=\".75\"") == 9
              && strstr(svg, "fill-opacity=\".1\"") != NULL,
          "panel · 9 barrotes");

    check("El extintor se dibuja con su cuerpo y su manguera, no con una caja vacía",
          svg != NULL && strstr(svg, "<g fill=\"#b91c1c\">") != NULL
              && strstr(svg, "stroke=\"#b91c1c\" stroke-width=\"6.3\"") != NULL,
          "cuerpo · manguera");

    check("El botiquín y el DEA llevan su pictograma",
          svg != NULL && strstr(svg, "<g fill=\"#15803d\">") != NULL
              && strstr(svg, "<path fill=\"#7c3aed\" d=\"M ") != NULL,
          "cruz · rayo");

    if (svg != NULL && door >= 0) {
        const int changed = norma_document_set_exit(&document, (size_t) door, 1);
        char *green = norma_document_to_svg(&document, &options);
        check("Una puerta marcada como salida va en verde de evacuación",
              changed == 1 && green != NULL && strstr(green, "stroke=\"#237f52\"") != NULL,
              "#237f52");
        free(green);
    }
    free(svg);
    norma_document_free(&document);
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("SVG y cifras · pruebas\n\nNúmeros\n");
    test_numbers();
    printf("\nMedidas\n");
    test_measures();
    printf("\nExportación\n");
    test_svg();
    printf("\nObjetos insertados\n");
    test_inserted_objects();
    printf("\nIda y vuelta\n");
    test_svg_roundtrip();
    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
