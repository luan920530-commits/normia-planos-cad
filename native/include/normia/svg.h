/*
 * Normia nativo · exportación SVG.
 *
 * El SVG del núcleo sale con **escala física**: el `viewBox` está en las
 * unidades del plano (centímetros, igual que el documento) y el `width`/`height`
 * se declaran en milímetros de papel según la escala `1:N`. Así un muro de 4,20 m
 * mide 42 mm impreso a 1:100 sin que cambie una sola coordenada.
 *
 * El trazado (`d`) de los muros se compone con la misma regla que
 * `PathGeometry::pathData()` de PHP, para que la prueba de paridad pueda comparar
 * los dos textos carácter a carácter.
 */
#ifndef NORMA_SVG_H
#define NORMA_SVG_H

#include <stddef.h>

#include "normia/document.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    /** Dibujar la rejilla de 20 cm. */
    int grid;
    /** Dibujar la franja con el nombre del plano, la escala y la nota de la app. */
    int band;
    /** Nombre del plano en la franja. */
    const char *title;
} norma_svg_options;

/** Milímetros de papel por centímetro del plano, según `1:N`. */
double norma_svg_mm_per_cm(const char *scale);

/** Número con el formato del SVG: dos decimales como mucho y sin ceros de sobra. */
void norma_svg_number(double value, char *out, size_t size);

/**
 * Trazado `d` de un elemento, en unidades del plano (centímetros).
 * Devuelve 1 si escribió algo; 0 si el elemento no es un trazo.
 */
int norma_svg_path_cm(const norma_element *element, char *out, size_t size);

/** SVG completo del documento. Devuelve el texto; libéralo con `free`. */
char *norma_document_to_svg(const norma_document *document, const norma_svg_options *options);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_SVG_H */
