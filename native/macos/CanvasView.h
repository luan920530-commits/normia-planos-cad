/*
 * Normia nativo · lienzo de la ventana de macOS.
 *
 * Vista propia de AppKit que dibuja el plano con Core Graphics y atiende el
 * ratón y el teclado. No usa WebView, ni HTML, ni JavaScript: los elementos
 * vienen del documento en C (`normia/document.h`) y aquí solo se pintan y se
 * editan.
 */
#import <Cocoa/Cocoa.h>

#include "normia/document.h"

NS_ASSUME_NONNULL_BEGIN

@class CanvasView;

/** Lo que la ventana necesita saber del lienzo para el título y el guardado. */
@protocol CanvasViewDelegate <NSObject>
- (void)canvasDidChange:(CanvasView *)view;
- (void)canvasStatus:(CanvasView *)view message:(NSString *)message;
@end

@interface CanvasView : NSView

@property(nonatomic, assign) norma_document *document;
@property(nonatomic, weak, nullable) id<CanvasViewDelegate> delegate;
/** Nodo seleccionado dentro del elemento seleccionado, o -1 si es un equipo. */
@property(nonatomic) NSInteger selectedNode;

- (void)documentDidLoad;
- (void)zoomToFit;

@end

NS_ASSUME_NONNULL_END
