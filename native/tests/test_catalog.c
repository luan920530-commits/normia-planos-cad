/*
 * Pruebas del catálogo completo de objetos y señalización (etapa N4).
 *
 * Lo que se comprueba es que la ventana nativa ofrece **el catálogo entero**, no
 * una lista escogida a mano: las 3 puertas, los 422 objetos CAD y las 395
 * señales, con su nombre, su familia, su color y su pictograma. Y que un objeto
 * del catálogo se puede insertar, guardar y exportar sin perder ni el tipo ni el
 * dibujo, que es lo que de verdad importa cuando el plano se imprime.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/document.h"
#include "normia/json.h"
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

/** Busca los catálogos donde los dejan el Makefile y la raíz del repositorio. */
static int load_catalog(norma_object_catalog *catalog, char *error, size_t error_size)
{
    static const char *const folders[] = {"../resources", "resources", "../../resources"};
    for (size_t index = 0; index < sizeof(folders) / sizeof(folders[0]); index += 1) {
        if (norma_object_catalog_load(catalog, folders[index], error, error_size)) {
            return 1;
        }
    }
    return 0;
}

static void test_sizes(const norma_object_catalog *catalog)
{
    size_t doors = 0;
    size_t cad = 0;
    size_t signs = 0;
    size_t longest = 0;
    for (size_t index = 0; index < catalog->count; index += 1) {
        const norma_object_spec *spec = &catalog->items[index];
        if (spec->is_door) {
            doors += 1;
        } else if (strncmp(spec->type, "cad_", 4) == 0) {
            cad += 1;
        } else {
            signs += 1;
        }
        const size_t length = strlen(spec->type);
        if (length > longest) {
            longest = length;
        }
    }
    char detail[160];
    snprintf(detail, sizeof(detail), "%lu piezas: %lu puertas + %lu CAD + %lu señales",
             (unsigned long) catalog->count, (unsigned long) doors, (unsigned long) cad,
             (unsigned long) signs);
    check("El catálogo completo trae las 820 piezas", catalog->count == 820, detail);
    check("Son 3 puertas, 422 objetos CAD y 395 señales", doors == 3 && cad == 422 && signs == 395, detail);
    snprintf(detail, sizeof(detail), "%lu caracteres de tipo", (unsigned long) longest);
    check("El tipo más largo del catálogo cabe en el documento", longest + 1 <= NORMA_OBJECT_TYPE,
          detail);
}

static void test_families(const norma_object_catalog *catalog)
{
    (void) catalog;
    char detail[160];
    const size_t families = norma_object_family_count();
    snprintf(detail, sizeof(detail), "%lu familias", (unsigned long) families);
    check("Las familias son las de los catálogos: puertas, 31 CAD y 9 de señalización",
          families == 41, detail);
    check("La primera familia es la de las puertas y se llama «Puertas»",
          strcmp(norma_object_family_at(0), "door") == 0
              && strcmp(norma_object_family_label_at(0), "Puertas") == 0,
          norma_object_family_label_at(0));

    size_t total = 0;
    size_t empty = 0;
    for (size_t index = 0; index < families; index += 1) {
        const char *key = norma_object_family_at(index);
        const char *label = norma_object_family_label_at(index);
        const size_t count = norma_object_count_in(key);
        total += count;
        if (count == 0 || label == NULL || label[0] == '\0') {
            empty += 1;
        }
    }
    snprintf(detail, sizeof(detail), "%lu objetos repartidos", (unsigned long) total);
    check("Ninguna familia queda vacía y todas tienen rótulo", empty == 0, detail);
    check("Las familias suman el catálogo completo", total == 820, detail);
    check("El rótulo se puede buscar por su clave",
          norma_object_family_label("cad:emergency") != NULL
              && strcmp(norma_object_family_label("sign:fire"), "Respuesta contra incendios") == 0,
          norma_object_family_label("sign:fire"));
}

static void test_pieces(const norma_object_catalog *catalog)
{
    (void) catalog;
    const norma_object_spec *lift = norma_object_find("cad_acc_accessible_lift");
    check("Un objeto CAD del catálogo se encuentra por su tipo, con su nombre",
          lift != NULL && strcmp(lift->name, "Ascensor accesible") == 0
              && strcmp(lift->family, "cad:access") == 0,
          lift != NULL ? lift->name : "sin objeto");
    check("El objeto CAD trae su pictograma y su color de familia",
          lift != NULL && lift->svg != NULL && strstr(lift->svg, "<svg") != NULL
              && strcmp(lift->colour, "#0369a1") == 0,
          lift != NULL ? lift->colour : "sin color");

    const norma_object_spec *exit_sign = norma_object_find("iso_e002");
    check("La señal E002 está en el catálogo, con su tipo, su familia y su dibujo",
          exit_sign != NULL && strstr(exit_sign->name, "Salida") != NULL
              && strcmp(exit_sign->family, "sign:emergency") == 0 && exit_sign->svg != NULL,
          exit_sign != NULL ? exit_sign->name : "sin señal");

    const norma_object_spec *here = norma_object_find("sig_aqui");
    check("«Usted está aquí» se inserta con su código de orientación",
          here != NULL && here->svg != NULL && strcmp(here->family, "sign:location") == 0,
          here != NULL ? here->name : "sin señal");

    /* El tipo de una señal llega escrito de muchas maneras: la web lo normaliza
       antes de buscar el pictograma (`signTypeToCode()`) y aquí se acepta lo
       mismo, para que un plano traído de la web no se quede sin dibujo. */
    const norma_object_spec *e075 = norma_object_find("iso_e075");
    check("«ISO_E075», «ISO-E075» y «E075» llegan a la misma señal",
          e075 != NULL && norma_object_find("ISO_E075") == e075
              && norma_object_find("ISO-E075") == e075 && norma_object_find("e075") == e075,
          e075 != NULL ? e075->name : "sin señal");
    check("El código de servicios «SVC_WC_MEN» encuentra su señal del editor",
          norma_object_find("SVC_WC_MEN") != NULL
              && norma_object_find("SVC_WC_MEN") == norma_object_find("sig_wc_men"),
          norma_object_find("sig_wc_men") != NULL ? norma_object_find("sig_wc_men")->name : "sin señal");
    check("Un tipo que no existe sigue sin encontrarse",
          norma_object_find("iso_z999") == NULL && norma_object_find("cad_nada") == NULL
              && norma_object_find("sig_") == NULL,
          "iso_z999 · cad_nada · sig_");

    size_t without_svg = 0;
    for (size_t index = 0; index < norma_object_count(); index += 1) {
        const norma_object_spec *spec = norma_object_at(index);
        if (!spec->is_door && spec->svg == NULL) {
            without_svg += 1;
        }
    }
    char detail[96];
    snprintf(detail, sizeof(detail), "%lu piezas sin pictograma", (unsigned long) without_svg);
    check("Todas las piezas, salvo las puertas, traen su pictograma", without_svg == 0, detail);
    check("Las puertas se dibujan a mano y se reconocen como puertas",
          norma_object_is_door("door_double") && norma_object_is_door("door_garage")
              && !norma_object_is_door("cad_emg_aed"),
          "door · door_double · door_garage");
}

static void test_placement(const norma_object_catalog *catalog)
{
    (void) catalog;
    const norma_object_spec *door = norma_object_find("door");
    double x = 0.0;
    double y = 0.0;
    if (door != NULL) {
        norma_object_place(door, (norma_point) {200.0, 100.0}, &x, &y);
    }
    check("La puerta apoya su caja sobre el muro: el clic cae en `y + h`",
          door != NULL && fabs((y + door->height) - 100.0) < 1e-9 && fabs(x + door->width / 2.0 - 200.0) < 1e-9,
          "y + h = 100");

    const norma_object_spec *aed = norma_object_find("cad_emg_aed");
    x = 0.0;
    y = 0.0;
    if (aed != NULL) {
        norma_object_place(aed, (norma_point) {300.0, 400.0}, &x, &y);
    }
    check("Un equipo se centra en el clic: el auditor mide desde el centro",
          aed != NULL && fabs((x + aed->width / 2.0) - 300.0) < 1e-9
              && fabs((y + aed->height / 2.0) - 400.0) < 1e-9,
          "x + w/2 · y + h/2");

    const norma_object_spec *sign = norma_object_find("iso_e001");
    check("Una señal nace de 64 × 64 cm, como en la web", sign != NULL && fabs(sign->width - 64.0) < 1e-9
              && fabs(sign->height - 64.0) < 1e-9,
          "64 × 64");
}

static void test_document_roundtrip(void)
{
    norma_document document;
    norma_document_init(&document);
    /* El tipo más largo del catálogo: 24 caracteres. */
    const long lift = norma_document_add_object(&document, "cad_acc_accessible_lift",
                                                (norma_point) {500.0, 500.0}, NULL);
    const long exit_sign = norma_document_add_object(&document, "iso_e002", (norma_point) {700.0, 500.0}, NULL);
    check("El documento acepta un objeto CAD y una señal del catálogo completo",
          lift == 0 && exit_sign == 1, "cad_acc_accessible_lift · iso_e002");
    check("El tipo se guarda entero, sin cortarlo",
          lift >= 0 && strcmp(document.elements[0].type, "cad_acc_accessible_lift") == 0
              && exit_sign >= 0 && strcmp(document.elements[1].type, "iso_e002") == 0,
          document.elements[0].type);

    norma_svg_options options = {0, 0, "Catálogo"};
    char *svg = norma_document_to_svg(&document, &options);
    check("El SVG del objeto trae su pictograma escalado a la caja",
          svg != NULL && strstr(svg, "<svg x=\"455\" y=\"455\" width=\"90\" height=\"90\"") != NULL,
          "x · y · ancho · alto");
    check("El SVG de la señal trae su pictograma con el color de la familia",
          svg != NULL && strstr(svg, "<svg x=\"668\" y=\"468\" width=\"64\" height=\"64\"") != NULL
              && strstr(svg, "color=\"#237f52\"") != NULL,
          "#237f52");
    free(svg);

    char *json = norma_document_to_json(&document, "Catálogo");
    norma_document other;
    norma_document_init(&other);
    char error[128];
    const int ok = json != NULL && norma_document_from_json(&other, json, strlen(json), error, sizeof(error));
    check("Guardar y abrir conserva el objeto del catálogo y su tipo largo",
          ok && other.count == 2 && strcmp(other.elements[0].type, "cad_acc_accessible_lift") == 0,
          ok ? "ida y vuelta" : error);
    free(json);
    norma_document_free(&other);
    norma_document_free(&document);
}

static void test_fallback(void)
{
    /* Sin catálogo cargado el núcleo sigue funcionando con las once de siempre. */
    check("Sin catálogo, el respaldo sigue siendo de once piezas",
          norma_object_count() == NORMA_OBJECT_FALLBACK_COUNT
              && norma_object_find("cad_acc_accessible_lift") == NULL,
          "11 de respaldo");
    check("Las once de respaldo conservan sus familias",
          norma_object_family_count() == 4 && strcmp(norma_object_family_at(0), "door") == 0,
          "door · cad:emergency · sign:emergency · sign:location");
}

int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    printf("Catálogo completo de objetos y señalización · pruebas\n\n");

    norma_object_catalog catalog;
    char error[256] = "";
    const int loaded = load_catalog(&catalog, error, sizeof(error));
    check("Los catálogos locales se leen y se validan", loaded, loaded ? catalog.source : error);
    if (!loaded) {
        printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
        return 1;
    }
    check("El catálogo activo es el completo, no el de respaldo",
          norma_object_use(&catalog) && norma_object_active() == &catalog && norma_object_count() == 820,
          "820 piezas");

    printf("\nTamaño\n");
    test_sizes(&catalog);
    printf("\nFamilias\n");
    test_families(&catalog);
    printf("\nPiezas\n");
    test_pieces(&catalog);
    printf("\nColocación\n");
    test_placement(&catalog);
    printf("\nDocumento y SVG\n");
    test_document_roundtrip();

    printf("\nRespaldo\n");
    norma_object_use(NULL);
    test_fallback();
    norma_object_catalog_free(&catalog);

    printf("\n%d/%d comprobaciones correctas.\n", checks - failures, checks);
    return failures == 0 ? 0 : 1;
}
