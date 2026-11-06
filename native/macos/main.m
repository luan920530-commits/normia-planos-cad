/*
 * Normia nativo · punto de entrada.
 *
 *   NormiaEstudio            abre la ventana con un plano en blanco.
 *   NormiaEstudio plano.json abre ese plano.
 *   NormiaEstudio --check    comprueba el núcleo y termina (sin ventana).
 */
#import <Cocoa/Cocoa.h>

#include <stdio.h>
#include <string.h>

#import "AppDelegate.h"

#include "normia/document.h"
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

int main(int argc, const char *argv[])
{
    @autoreleasepool {
        for (int index = 1; index < argc; index += 1) {
            if (strcmp(argv[index], "--check") == 0) {
                return runCheck();
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
