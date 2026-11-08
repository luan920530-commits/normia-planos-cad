/*
 * Normia nativo · selector del catálogo.
 *
 * Con el catálogo completo son **820 piezas** repartidas en 41 familias. El menú
 * Insertar las tiene todas, familia por familia, pero buscar a mano un «botiquín
 * de droguería» entre 422 objetos no es razonable: esta ventana es el buscador.
 *
 * Es AppKit puro —un campo de búsqueda, una tabla y dos botones— no un WebView, y
 * no sabe nada del plano: devuelve el `type` elegido y quien llama decide qué
 * hacer con él.
 */
#import <Cocoa/Cocoa.h>

#include "normia/object.h"

NS_ASSUME_NONNULL_BEGIN

@interface NormiaCatalogPicker : NSObject

/**
 * Abre el buscador como hoja modal sobre `window`, con el catálogo ya cargado.
 * Devuelve el tipo elegido o `nil` si se canceló o no había catálogo.
 */
+ (nullable NSString *)pickFromCatalog:(const norma_object_catalog *)catalog
                              forWindow:(nullable NSWindow *)window
                              prompt:(nullable NSString *)prompt;

@end

NS_ASSUME_NONNULL_END
