/*
 * Normia nativo · paleta de herramientas.
 *
 * La columna de la izquierda, como el «Conjunto de herramientas» de un CAD: los
 * grupos con su rótulo (Dibujo, Modificar, Texto, Acotación, Rutas y
 * Biblioteca) y, debajo de cada uno, sus botones. Cada botón arma la misma
 * herramienta que su tecla en el lienzo; el que está armado se queda marcado.
 *
 * No dibuja el plano ni toca el documento: solo avisa a la ventana de qué
 * herramienta se eligió.
 */
#import <Cocoa/Cocoa.h>

#import "CanvasView.h"

@class ToolRail;

@protocol ToolRailDelegate <NSObject>
/** Se eligió una herramienta; la ventana se la pasa al lienzo. */
- (void)toolRail:(ToolRail *)rail didChooseTool:(NormiaTool)tool;
/** «Buscar e insertar»: abre el catálogo completo. */
- (void)toolRailDidRequestCatalog:(ToolRail *)rail;
/** Acciones sueltas: duplicar, girar, borrar, rejilla, ajustar. */
- (void)toolRail:(ToolRail *)rail didChooseAction:(NSString *)action;
@end

@interface ToolRail : NSView

@property(nonatomic, weak) id<ToolRailDelegate> delegate;
/** Herramienta marcada; al cambiarla se repinta el botón activo. */
@property(nonatomic) NormiaTool tool;

/** Alto que necesita la paleta para mostrar todos sus grupos. */
+ (CGFloat)preferredHeight;

@end
