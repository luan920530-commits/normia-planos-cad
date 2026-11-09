/*
 * Normia nativo · punto de entrada.
 *
 *   NormiaEstudio            abre la ventana con un plano en blanco.
 *   NormiaEstudio plano.json abre ese plano.
 *   NormiaEstudio --check    comprueba el núcleo y termina (sin ventana).
 *   NormiaEstudio --objects  cuenta el catálogo que lleva dentro y termina.
 *
 * Las dos órdenes sin ventana existen para el trabajo que empaqueta la
 * aplicación: así se comprueba, sobre el `.app` ya armado, que el núcleo responde
 * y que los catálogos viajaron dentro del paquete.
 */
#import <Cocoa/Cocoa.h>

#include <stdio.h>
#include <string.h>

#import "AppDelegate.h"

#include "normia/document.h"
#include "normia/object.h"
#include "normia/units.h"

static int runCheck(void)
{
    // La misma comprobación del núcleo: si las conversiones no son las del
    // proyecto, la aplicación no debe abrir una ventana que mienta.
    if (norma_from_meters(1.0, NORMA_UNIT_CM) != 100.0 || norma_scale_denominator("1:100") != 100.0) {
        fprintf(stderr, "El núcleo no responde como se espera.\n");
        return 1;
    }
    norma_document document;
    norma_document_init(&document);
    const norma_point nodes[2] = {{0.0, 0.0}, {400.0, 0.0}};
    norma_document_add_wall(&document, nodes, 2, NULL, NULL);
    const int ok = norma_document_length_cm(&document) == 400.0;
    norma_document_free(&document);
    if (!ok) {
        fprintf(stderr, "El documento no mide como se espera.\n");
        return 1;
    }
    printf("Normia Estudio nativo · N1 · ok (ventana AppKit, núcleo en C, sin WebView)\n");
    return 0;
}

/**
 * Cuenta el catálogo completo que va dentro del paquete
 * (`Contents/Resources/resources`): cuántas piezas y cuántas familias. Si los
 * catálogos no viajaron, sale con 2 y lo dice; nunca abre una ventana vacía.
 */
static int runObjects(void)
{
    NSString *folder = [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"resources"];
    norma_object_catalog catalog;
    char error[256] = "";
    if (!norma_object_catalog_load(&catalog, folder.fileSystemRepresentation, error, sizeof(error))
        || !norma_object_use(&catalog)) {
        fprintf(stderr, "Sin catálogo: %s\n", error);
        return 2;
    }
    printf("catálogo completo · %lu piezas · %lu familias\n", (unsigned long) catalog.count,
           (unsigned long) norma_object_family_count());
    for (size_t index = 0; index < norma_object_family_count(); index += 1) {
        const char *key = norma_object_family_at(index);
        printf("  · %-22s %-42s %lu\n", key != NULL ? key : "", norma_object_family_label_at(index),
               (unsigned long) norma_object_count_in(key));
    }
    norma_object_use(NULL);
    norma_object_catalog_free(&catalog);
    return 0;
}

int main(int argc, const char *argv[])
{
    @autoreleasepool {
        for (int index = 1; index < argc; index += 1) {
            if (strcmp(argv[index], "--check") == 0) {
                return runCheck();
            }
            if (strcmp(argv[index], "--objects") == 0) {
                return runObjects();
            }
        }
        NSApplication *application = [NSApplication sharedApplication];
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        application.delegate = delegate;
        [application run];
        (void) delegate;
    }
    return 0;
}
