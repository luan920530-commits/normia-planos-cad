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

/**
 * Herramientas del lienzo, en el orden en que las ofrece la paleta y la tira
 * superior. Son las de la edición web que tienen sentido en un plano de
 * evacuación: seleccionar, mano, muro, línea, rectángulo, elipse, pluma, arco,
 * texto, cota, ruta e insertar del catálogo.
 */
typedef NS_ENUM(NSInteger, NormiaTool) {
    NormiaToolSelect = 0,
    NormiaToolWall,
    NormiaToolPen,
    NormiaToolArc,
    NormiaToolDimension,
    NormiaToolRoute,
    NormiaToolInsert,
    NormiaToolPan,
    NormiaToolLine,
    NormiaToolRect,
    NormiaToolEllipse,
    NormiaToolText,
    /* Entorno e instalaciones: las herramientas del editor web que no son del
       catálogo (vías, andenes, pasos, parqueaderos, linderos, tuberías y
       canaletas). Nacen de dos clics, como un rectángulo. */
    NormiaToolRoad,
    NormiaToolSidewalk,
    NormiaToolCrosswalk,
    NormiaToolParking,
    NormiaToolProperty,
    NormiaToolPipe,
    NormiaToolConduit,
};

/** Lo que la ventana necesita saber del lienzo para el título y el guardado. */
@protocol CanvasViewDelegate <NSObject>
- (void)canvasDidChange:(CanvasView *)view;
- (void)canvasStatus:(CanvasView *)view message:(NSString *)message;
@optional
/** Cambió la selección: el inspector tiene que releer el elemento. */
- (void)canvasSelectionDidChange:(CanvasView *)view;
/** Se armó otra herramienta desde el teclado: la paleta marca su botón. */
- (void)canvas:(CanvasView *)view didChooseTool:(NormiaTool)tool;
/** Posición del puntero en el plano, para la barra de coordenadas. */
- (void)canvas:(CanvasView *)view didTrackPlanPoint:(norma_point)point;
@end

@interface CanvasView : NSView

@property(nonatomic, assign) norma_document *document;
@property(nonatomic, weak, nullable) id<CanvasViewDelegate> delegate;
/** Nodo seleccionado dentro del elemento seleccionado, o -1 si es un equipo. */
@property(nonatomic) NSInteger selectedNode;
/** Herramienta armada. Al cambiarla se cancela el borrador en curso. */
@property(nonatomic) NormiaTool toolMode;
/** Rejilla de referencia del lienzo (no se imprime nunca). */
@property(nonatomic) BOOL showsGrid;
/** Índice del elemento seleccionado, o -1. */
@property(nonatomic, readonly) NSInteger selectedElementIndex;
/** La paleta y el inspector pintaron un cambio: se redibuja sin tocarlo. */
- (void)documentDidChangeExternally;
/** Duplica el elemento seleccionado 20 cm a la derecha. Devuelve el aviso. */
- (NSString *)duplicateSelection;
/** Gira la selección 90°. Devuelve el aviso. */
- (NSString *)rotateSelection;
/** Borra lo seleccionado. Devuelve el aviso para la barra de estado. */
- (NSString *)deleteSelection;
/** Coloca un texto suelto en el punto dado y lo deja seleccionado. */
- (NSString *)addTextAtPoint:(norma_point)point;
/** Lleva la selección al centro de la vista. */
- (void)focusSelection;
/** Zoom actual en porcentaje (100 = un centímetro por punto). */
- (double)zoomPercent;
/** Lleva el zoom al porcentaje pedido, manteniendo quieto el centro. */
- (void)zoomToPercent:(double)percent;
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
 * Arma la colocación de un objeto del catálogo (`norma/object.h`): el siguiente
 * clic en el plano lo inserta. La herramienta sigue armada hasta Esc, para
 * poner varios extintores seguidos.
 */
- (void)beginInsert:(NSString *)type;

/** Tipo que se está insertando, o `nil` si no hay ninguno armado. */
- (NSString *)insertingType;

/**
 * Marca o desmarca como salida de emergencia la puerta seleccionada y devuelve
 * el mensaje para la barra de estado. Sin puerta seleccionada devuelve `nil`.
 */
- (NSString *)toggleSelectedExit;

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
