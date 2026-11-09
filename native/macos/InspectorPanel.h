/*
 * Normia nativo · inspector del plano.
 *
 * El panel de la derecha, como el «Propiedades» de un CAD: arriba las capas
 * (la activa y las que ya existen en el plano) y debajo la ficha del elemento
 * seleccionado —posición, tamaño, giro, grosor, color, rótulo y capa— con sus
 * botones de duplicar, borrar y marcar salida.
 *
 * No edita por su cuenta: todo pasa por el documento en C
 * (`norma_document_set_box`, `set_rotation`, `set_colour`…), que es quien
 * valida y quien deja el deshacer. El panel solo pinta lo que el documento
 * dice.
 */
#import <Cocoa/Cocoa.h>

#include "normia/document.h"

@class InspectorPanel;

@protocol InspectorPanelDelegate <NSObject>
/** El documento cambió desde el inspector: la ventana marca el plano y guarda. */
- (void)inspector:(InspectorPanel *)panel didEditDocumentWithMessage:(NSString *)message;
/** Aviso breve para la barra de estado. */
- (void)inspector:(InspectorPanel *)panel status:(NSString *)message;
/** Duplicar la selección (⌘D), como el botón del inspector web. */
- (void)inspectorDidRequestDuplicate:(InspectorPanel *)panel;
/** Borrar la selección, como el botón del inspector web. */
- (void)inspectorDidRequestDelete:(InspectorPanel *)panel;
/** Marcar o desmarcar la salida de emergencia. */
- (void)inspectorDidRequestExit:(InspectorPanel *)panel;
/** Abrir el panel de archivo para elegir la imagen de la maqueta de trazo. */
- (void)inspectorDidRequestImportGuide:(InspectorPanel *)panel;
/** Quitar la maqueta del plano, con confirmación de la ventana. */
- (void)inspectorDidRequestClearGuide:(InspectorPanel *)panel;
@end

@interface InspectorPanel : NSView

@property(nonatomic, weak) id<InspectorPanelDelegate> delegate;
/** Documento que se inspecciona: el mismo que dibuja el lienzo. */
@property(nonatomic) norma_document *document;
/** Elemento seleccionado, o -1 si no hay ninguno. */
@property(nonatomic) NSInteger elementIndex;

/** Relee el documento y repinta la ficha (también las capas). */
- (void)reload;
/** Deja el cursor en el rótulo, para escribir el nombre de una señal. */
- (void)focusLabelField;

@end
