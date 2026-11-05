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
/**
 * Dibujo para papel o PDF: fondo blanco en vez del gris oscuro de la pantalla,
 * para no gastar tinta ni entregar un plano con fondo negro.
 */
@property(nonatomic) BOOL printing;

- (void)documentDidLoad;
/** Ajusta la hoja a la ventana (el lienzo sigue abierto por los lados). */
- (void)zoomToFit;
- (void)zoomIn;
- (void)zoomOut;
/** Zoom 100 %: un centímetro del plano, un punto de pantalla. */
- (void)zoomReset;
/** Escala actual del plano en la ventana. */
- (double)currentZoom;
/**
 * Elige herramienta con la letra del lienzo (`m`, `p`, `a`, `d`, `r`, `v`).
 * Devuelve `NO` si la tecla no es de ninguna herramienta.
 */
- (BOOL)selectToolWithKey:(NSString *)key;
/**
 * Marca los puntos de la revisión (hallazgos con posición) para verlos en el
 * plano. Se copian: la lista del informe puede cambiar sin avisar.
 */
- (void)setFindingPoints:(const norma_point * _Nullable)points count:(size_t)count;
- (size_t)findingCount;
/** Centra el plano en un punto y, si hace falta, lo acerca para poder leerlo. */
- (void)focusOnPoint:(norma_point)point;
/** Cancela la herramienta en curso sin tocar el documento. */
- (void)cancelDraft;

@end

NS_ASSUME_NONNULL_END
