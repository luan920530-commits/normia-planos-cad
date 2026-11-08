/*
 * Normia nativo · los pictogramas del catálogo, dibujados de verdad.
 *
 * Los 820 objetos y señales son SVG. La ventana solo pintaba una caja y el
 * nombre, así que los diseños no se veían. Aquí se conecta el intérprete del
 * núcleo (`normia/svgdraw.h`) con Core Graphics, de dos maneras:
 *
 *   · **en el lienzo**, vector a vector, para que el pictograma esté nítido a
 *     cualquier zoom y gire con el elemento;
 *   · **en miniaturas**, rasterizando una vez a un mapa de bits que se guarda
 *     en la caché, para el buscador del catálogo y la ficha del inspector.
 *
 * Nada de esto vuelve a leer el archivo: el SVG lo tiene el catálogo en
 * memoria, ya cargado por `norma_object_catalog_load`.
 */
#import <Cocoa/Cocoa.h>

#include "normia/svgdraw.h"

NS_ASSUME_NONNULL_BEGIN

/** Dibuja el SVG dentro de `box`, en las coordenadas del contexto. */
void NormiaDrawSvgInContext(CGContextRef context, const char *svg, CGRect box, const char *colour);

/**
 * Miniatura del pictograma, cuadrada y de `size` puntos, ya rasterizada.
 * Devuelve `nil` si el tipo no está en el catálogo o si su SVG no se puede leer.
 */
NSImage * _Nullable NormiaThumbnailForType(const char *type, CGFloat size);

/** Vacía la caché de miniaturas (al abrir otro plano o cambiar de catálogo). */
void NormiaClearThumbnailCache(void);

NS_ASSUME_NONNULL_END
