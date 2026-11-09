/*
 * Normia nativo · selector del catálogo.
 *
 * Con el catálogo completo son **820 piezas** repartidas en 41 familias. El menú
 * Insertar las tiene todas, familia por familia, pero buscar a mano un «botiquín
 * de droguería» entre 422 objetos no es razonable: esta ventana es el buscador.
 *
 * Es AppKit puro —un campo de búsqueda, las fichas de categoría, la rejilla de
 * tarjetas con el pictograma de cada pieza y dos botones—, no un WebView, y no
 * sabe nada del plano: devuelve el `type` elegido y quien llama decide qué hacer
 * con él. La rejilla y las fichas imitan el modal de la biblioteca visual de la
 * web, donde la señal se elige mirándola y no leyendo su nombre.
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

/** Qué parte del catálogo se ofrece, como las dos bibliotecas del rail web. */
typedef NS_ENUM(NSInteger, NormiaCatalogScope) {
    /** Todo: puertas, equipos y señales. */
    NormiaCatalogScopeAll = 0,
    /** Solo la señalización (ISO 7010 y señales de servicio): `sign:…`. */
    NormiaCatalogScopeSigns,
    /** Solo el equipamiento CAD: `cad:…`. */
    NormiaCatalogScopeCad,
};

/**
 * Igual que `pickFromCatalog:forWindow:prompt:`, pero acotado a una biblioteca:
 * «Señales» o «Equipos», como los dos botones de biblioteca del editor web.
 * El filtro se aplica sobre la familia del catálogo, no sobre una lista copiada.
 */
+ (nullable NSString *)pickFromCatalog:(const norma_object_catalog *)catalog
                              forWindow:(nullable NSWindow *)window
                                 prompt:(nullable NSString *)prompt
                                  scope:(NormiaCatalogScope)scope;

@end

NS_ASSUME_NONNULL_END
