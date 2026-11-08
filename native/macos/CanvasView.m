/*
 * Normia nativo · lienzo.
 *
 * Herramientas (etapa N4: las mismas del editor web, con el inspector al lado):
 *   · V · selección: clic elige el elemento más cercano; arrastrar mueve un nodo,
 *     el trazo completo o una esquina de la caja para escalarlo;
 *   · H · mano: arrastra el lienzo sin tocar el plano;
 *   · L · línea y B/O · rectángulo y elipse: dos clics, como el editor web;
 *   · T · texto suelto: un clic y se escribe el contenido en el inspector;
 *   · M · muro por tramos de dos clics;
 *   · P · pluma de nodos: un clic por nodo, Enter o doble clic cierra;
 *   · A · arco de tres puntos: inicio, punto de paso y fin;
 *   · D · cota entre dos puntos, rotulada con la cifra y la unidad;
 *   · R · ruta de evacuación: un clic por nodo, Enter o doble clic cierra; el
 *     auditor la mide después y dice si llega a una salida;
 *   · Insertar · un objeto del catálogo (`norma/object.h`) se coloca con un
 *     clic: puertas, extintor, botiquín, camilla, DEA, punto de encuentro y
 *     señales. La herramienta sigue armada hasta Esc, y ⌘⇧E marca la puerta
 *     seleccionada como salida de emergencia;
 *   · Esc cancela la herramienta y Retroceso borra lo seleccionado.
 *
 * La geometría, las medidas y el formato de las cifras viven en el núcleo en C:
 * aquí solo se pintan y se editan.
 */
#import "CanvasView.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "normia/format.h"
#include "normia/object.h"

static const CGFloat kToleranceScreen = 8.0;
static const int kMaxDraftNodes = 64;
/* π a mano: con `-std=c11` estricto, `M_PI` no está garantizado. */
static const double kPi = 3.14159265358979323846;

/** Tipo de entorno que dibuja cada herramienta (se define más abajo). */
static const char *environment_type(NormiaTool tool);
static const double kHalfPi = 1.57079632679489661923;

@interface CanvasView ()
@property(nonatomic) NormiaTool tool;
@property(nonatomic) BOOL draggingNode;
@property(nonatomic) norma_point dragOrigin;
@property(nonatomic) NSInteger selectedElement;
@property(nonatomic) norma_point cursorPoint;
- (void)ensureView;
- (void)placeInsertedObject:(norma_point)point;
- (void)clampZoom:(double *)zoom;
- (void)zoomBy:(double)factor atPoint:(NSPoint)anchor;
- (void)panByDeltaX:(CGFloat)dx deltaY:(CGFloat)dy;
- (void)announceSelection;
- (void)drawShape:(const norma_element *)element selected:(BOOL)selected context:(CGContextRef)context zoom:(CGFloat)zoom;
- (void)drawSelectionHandlesInContext:(CGContextRef)context;
- (NSInteger)resizeCornerAtPlanPoint:(norma_point)point tolerance:(double)tolerance;
- (void)nudgeSelectionByX:(double)dx y:(double)dy;
@end

@implementation CanvasView {
    /* El borrador de la herramienta en curso. Una matriz no puede ser
       propiedad de Objective-C, así que vive aquí dentro. */
    norma_point _draft[kMaxDraftNodes];
    int _draftCount;
    BOOL _hasCursor;
    /** Evita apilar un deshacer por cada clic: solo cuenta el arrastre real. */
    BOOL _editBegun;
    /* Vista del lienzo infinito: escala y desplazamiento en puntos de ventana. */
    double _zoom;
    double _panX;
    double _panY;
    BOOL _viewReady;
    /* Puntos de la revisión (hallazgos con posición), para verlos en el plano. */
    norma_point _findingPoints[64];
    size_t _findingCount;
    /* Tipo armado para insertar ("" si no hay ninguno). */
    /* El tipo más largo del catálogo son 24 caracteres (`cad_acc_accessible_lift`):
       con 24 bytes se cortaba y el objeto no se podía colocar. */
    char _insertType[NORMA_OBJECT_TYPE];
    /* Desfase entre el clic y la esquina de la caja, para que al arrastrar no
       salte el objeto bajo el puntero. */
    double _dragOffsetX;
    double _dragOffsetY;
    /* Mano: se guarda el desplazamiento de la vista al empezar a arrastrar. */
    BOOL _panning;
    NSPoint _panStart;
    double _panStartX;
    double _panStartY;
    /* El clic sobre el primer nodo del muro cierra el recinto. */
    BOOL _closingDraft;
    /* Maqueta de trazo: la imagen ya decodificada y su firma. */
    NSImage *_guideImage;
    unsigned long _guideSignature;
    /* Arrastre de la maqueta: -1 no, 0..3 una esquina, 4 el cuerpo entero. */
    NSInteger _guideDrag;
    norma_point _guideAnchor;
    double _guideStartX;
    double _guideStartY;
    double _guideStartW;
    double _guideStartH;
    /* Escalado por esquinas: -1 ninguna, 0..3 noroeste, noreste, suroeste, sureste. */
    NSInteger _resizeCorner;
    norma_point _resizeAnchor;
}

/* El acceso a la rejilla se escribe a mano (repinta), así que el ivar se
   declara explícitamente. */
@synthesize showsGrid = _showsGrid;

- (instancetype)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self != nil) {
        _selectedNode = -1;
        _selectedElement = -1;
        _tool = NormiaToolSelect;
        _showsGrid = YES;
        _resizeCorner = -1;
        _guideDrag = -1;
        self.wantsLayer = YES;
        // `acceptsFirstResponder` es de solo lectura: se responde YES en su
        // método (abajo), que es como AppKit pregunta si el lienzo toma el teclado.
    }
    return self;
}

- (BOOL)acceptsFirstResponder
{
    return YES;
}

/* --------------------------- propiedades públicas ------------------------ */

- (NormiaTool)toolMode
{
    return _tool;
}

/** Armar otra herramienta cancela el borrador y lo dice en la barra. */
- (void)setToolMode:(NormiaTool)tool
{
    [self cancelDraft];
    _tool = tool;
    _insertType[0] = '\0';
    [self.window makeFirstResponder:self];
    [self.delegate canvasStatus:self message:[self hintForTool]];
    if ([self.delegate respondsToSelector:@selector(canvas:didChooseTool:)]) {
        [self.delegate canvas:self didChooseTool:tool];
    }
    [self setNeedsDisplay:YES];
}

- (NSInteger)selectedElementIndex
{
    return _selectedElement;
}

- (BOOL)showsGrid
{
    return _showsGrid;
}

- (void)setShowsGrid:(BOOL)showsGrid
{
    _showsGrid = showsGrid;
    [self setNeedsDisplay:YES];
}

- (void)documentDidChangeExternally
{
    [self setNeedsDisplay:YES];
}

- (void)announceSelection
{
    if ([self.delegate respondsToSelector:@selector(canvasSelectionDidChange:)]) {
        [self.delegate canvasSelectionDidChange:self];
    }
}

- (BOOL)isFlipped
{
    // Coordenadas del plano: origen arriba a la izquierda, como en el editor.
    return YES;
}

- (void)documentDidLoad
{
    _selectedElement = -1;
    _selectedNode = -1;
    _tool = NormiaToolSelect;
    _draftCount = 0;
    _hasCursor = NO;
    _insertType[0] = '\0';
    _resizeCorner = -1;
    _panning = NO;
    _viewReady = NO; /* plano nuevo: se vuelve a ajustar a la ventana */
    [self setNeedsDisplay:YES];
}

/* -------------------------------- vista ---------------------------------- */

/**
 * Ajusta la hoja a la ventana con un margen.
 *
 * El lienzo es infinito como en un CAD: aquí solo se decide dónde empieza a
 * mirarse. El papel A4 sigue siendo la referencia de impresión y exportación.
 */
- (void)zoomToFit
{
    if (self.document == NULL) {
        return;
    }
    const double margin = 36.0;
    const double availableWidth = (double) NSWidth(self.bounds) - margin * 2.0;
    const double availableHeight = (double) NSHeight(self.bounds) - margin * 2.0;
    double zoom = 1.0;
    if (availableWidth > 10.0 && availableHeight > 10.0) {
        zoom = fmin(availableWidth / self.document->width, availableHeight / self.document->height);
    }
    [self clampZoom:&zoom];
    _zoom = zoom;
    _panX = ((double) NSWidth(self.bounds) - self.document->width * zoom) / 2.0;
    _panY = ((double) NSHeight(self.bounds) - self.document->height * zoom) / 2.0;
    _viewReady = YES;
    [self setNeedsDisplay:YES];
}

/** Límites de zoom: ni una hoja diminuta ni un plano que no se puede seguir. */
- (void)clampZoom:(double *)zoom
{
    if (*zoom < 0.02) {
        *zoom = 0.02;
    } else if (*zoom > 40.0) {
        *zoom = 40.0;
    }
}

/** La vista se arma en el primer dibujo: el tamaño de la ventana ya se conoce. */
- (void)ensureView
{
    if (!_viewReady) {
        [self zoomToFit];
    }
}

/** Escala del plano a la ventana: la del zoom actual, no la del ajuste. */
- (CGFloat)scale
{
    if (self.document == NULL) {
        return 1.0;
    }
    [self ensureView];
    return (CGFloat) _zoom;
}

/** Escala del plano a la ventana, sin efectos: sirve para el borrador. */
- (double)currentZoom
{
    [self ensureView];
    return _zoom;
}

- (CGAffineTransform)planTransform
{
    CGAffineTransform transform = CGAffineTransformMakeTranslation((CGFloat) _panX, (CGFloat) _panY);
    return CGAffineTransformScale(transform, (CGFloat) _zoom, (CGFloat) _zoom);
}

- (norma_point)planPointForEvent:(NSEvent *)event
{
    const NSPoint local = [self convertPoint:event.locationInWindow fromView:nil];
    [self ensureView];
    const norma_point point = {((double) local.x - _panX) / _zoom, ((double) local.y - _panY) / _zoom};
    return point;
}

/** Punto del plano a coordenadas de la ventana. */
- (NSPoint)viewPointForPlan:(norma_point)point
{
    [self ensureView];
    return NSMakePoint((CGFloat) (_panX + point.x * _zoom), (CGFloat) (_panY + point.y * _zoom));
}

/** Acerca o aleja manteniendo quieto el punto del plano que está bajo el cursor. */
- (void)zoomBy:(double)factor atPoint:(NSPoint)anchor
{
    if (self.document == NULL) {
        return;
    }
    [self ensureView];
    const double planX = ((double) anchor.x - _panX) / _zoom;
    const double planY = ((double) anchor.y - _panY) / _zoom;
    double zoom = _zoom * factor;
    [self clampZoom:&zoom];
    if (zoom == _zoom) {
        return;
    }
    _zoom = zoom;
    _panX = (double) anchor.x - planX * zoom;
    _panY = (double) anchor.y - planY * zoom;
    [self setNeedsDisplay:YES];
    [self.delegate canvasStatus:self
                        message:[NSString stringWithFormat:@"Zoom %.0f %% · lienzo abierto: la hoja A4 es la referencia de impresión",
                                                           _zoom * 100.0]];
}

- (void)zoomIn
{
    const NSPoint center = NSMakePoint(NSWidth(self.bounds) / 2.0, NSHeight(self.bounds) / 2.0);
    [self zoomBy:1.25 atPoint:center];
}

- (void)zoomOut
{
    const NSPoint center = NSMakePoint(NSWidth(self.bounds) / 2.0, NSHeight(self.bounds) / 2.0);
    [self zoomBy:1.0 / 1.25 atPoint:center];
}

/** Escala real: un centímetro del plano ocupa un punto de la pantalla. */
- (void)zoomReset
{
    if (self.document == NULL) {
        return;
    }
    [self ensureView];
    const NSPoint center = NSMakePoint(NSWidth(self.bounds) / 2.0, NSHeight(self.bounds) / 2.0);
    const double planX = ((double) center.x - _panX) / _zoom;
    const double planY = ((double) center.y - _panY) / _zoom;
    _zoom = 1.0;
    _panX = (double) center.x - planX;
    _panY = (double) center.y - planY;
    [self setNeedsDisplay:YES];
    [self.delegate canvasStatus:self message:@"Zoom 100 % · un centímetro del plano, un punto de pantalla"];
}

/* ------------------------------- navegación ------------------------------- */

/** Rueda del ratón: acerca y aleja; con trackpad, desplaza el lienzo. */
- (void)scrollWheel:(NSEvent *)event
{
    if (self.document == NULL) {
        return;
    }
    [self ensureView];
    const BOOL precise = event.hasPreciseScrollingDeltas;
    const BOOL zooming = precise ? ((event.modifierFlags & NSEventModifierFlagCommand) != 0) : YES;
    if (zooming) {
        const double step = precise ? 0.01 : 0.05;
        const double factor = fmax(0.2, 1.0 + (double) event.scrollingDeltaY * step);
        const NSPoint local = [self convertPoint:event.locationInWindow fromView:nil];
        [self zoomBy:factor atPoint:local];
        return;
    }
    _panX += (double) event.scrollingDeltaX;
    _panY += (double) event.scrollingDeltaY;
    [self setNeedsDisplay:YES];
}

/** Pellizco del trackpad: zoom sobre el cursor, como en un CAD. */
- (void)magnifyWithEvent:(NSEvent *)event
{
    const NSPoint local = [self convertPoint:event.locationInWindow fromView:nil];
    [self zoomBy:1.0 + (double) event.magnification atPoint:local];
}

/** Botón central o derecho: arrastrar el lienzo sin mover nada del plano. */
- (void)otherMouseDown:(NSEvent *)event
{
    (void) event;
    self.window.acceptsMouseMovedEvents = YES;
}

- (void)otherMouseDragged:(NSEvent *)event
{
    [self panByDeltaX:event.deltaX deltaY:event.deltaY];
}

- (void)rightMouseDragged:(NSEvent *)event
{
    [self panByDeltaX:event.deltaX deltaY:event.deltaY];
}

- (void)panByDeltaX:(CGFloat)dx deltaY:(CGFloat)dy
{
    if (self.document == NULL) {
        return;
    }
    [self ensureView];
    _panX += (double) dx;
    _panY += (double) dy;
    [self setNeedsDisplay:YES];
}

/* -------------------------------- dibujo --------------------------------- */

/** Color de cada equipo: el mismo que usa la exportación a SVG. */
- (NSColor *)colourForObject:(const norma_element *)element
{
    const char *type = element->type;
    if (strncmp(type, "cad_fire_ext", 12) == 0 || strcmp(type, "cad_eds_extinguisher") == 0
        || strcmp(type, "cad_drg_extinguisher") == 0) {
        return [NSColor colorWithCalibratedRed:0.73 green:0.11 blue:0.11 alpha:1.0];
    }
    if (strcmp(type, "cad_emg_firstaid") == 0) {
        return [NSColor colorWithCalibratedRed:0.08 green:0.50 blue:0.24 alpha:1.0];
    }
    if (strcmp(type, "cad_emg_stretcher") == 0 || strcmp(type, "cad_hosp_stretcher") == 0) {
        return [NSColor colorWithCalibratedRed:0.05 green:0.45 blue:0.56 alpha:1.0];
    }
    if (strcmp(type, "cad_emg_aed") == 0) {
        return [NSColor colorWithCalibratedRed:0.49 green:0.23 blue:0.93 alpha:1.0];
    }
    if (strcmp(type, "cad_emg_meeting") == 0) {
        return [NSColor colorWithCalibratedRed:0.02 green:0.47 blue:0.34 alpha:1.0];
    }
    /* Cualquier otra pieza del catálogo trae su color de familia (`#rrggbb`). */
    const norma_object_spec *spec = norma_object_find(type);
    if (spec != NULL && spec->colour[0] == '#') {
        unsigned int red = 0;
        unsigned int green = 0;
        unsigned int blue = 0;
        if (sscanf(spec->colour + 1, "%2x%2x%2x", &red, &green, &blue) == 3) {
            return [NSColor colorWithCalibratedRed:(CGFloat) red / 255.0
                                             green:(CGFloat) green / 255.0
                                              blue:(CGFloat) blue / 255.0
                                             alpha:1.0];
        }
    }
    return [NSColor colorWithCalibratedRed:0.20 green:0.25 blue:0.33 alpha:1.0];
}

/**
 * Puerta en planta: jambas, umbral discontinuo, hoja y arco de apertura, el
 * mismo dibujo que `SvgExporter::doorMarkup()` en la web y que la exportación
 * del núcleo. La salida marcada va en verde de evacuación.
 */
- (void)drawDoor:(const norma_element *)element selected:(BOOL)selected context:(CGContextRef)context
            zoom:(CGFloat)zoom
{
    const double x = element->x;
    const double w = element->w > 0.0 ? element->w : 90.0;
    const double h = element->h > 0.0 ? element->h : 90.0;
    const double stroke = element->stroke > 0.0 ? element->stroke : 2.0;
    const double edge = element->y + h;
    const double jamb = fmin(14.0, fmax(5.0, h * 0.16));
    const double frame = fmax(1.8, stroke * 1.15);
    const double thin = fmax(1.0, stroke * 0.65);

    if (selected) {
        CGContextSetRGBStrokeColor(context, 0.22, 0.52, 1.0, 1.0);
    } else if (element->is_exit) {
        CGContextSetRGBStrokeColor(context, 0.14, 0.50, 0.32, 1.0);
    } else {
        CGContextSetRGBStrokeColor(context, 0.28, 0.33, 0.40, 1.0);
    }
    CGContextSetLineCap(context, kCGLineCapRound);
    CGContextSetLineDash(context, 0.0, NULL, 0);

    /* Jambas. */
    CGContextSetLineWidth(context, (CGFloat) frame / zoom);
    CGContextBeginPath(context);
    CGContextMoveToPoint(context, x, edge);
    CGContextAddLineToPoint(context, x, edge - jamb);
    CGContextMoveToPoint(context, x + w, edge);
    CGContextAddLineToPoint(context, x + w, edge - jamb);
    CGContextStrokePath(context);

    /* Umbral: la línea del muro, discontinua. */
    const CGFloat dashes[2] = {(CGFloat) fmax(2.0, 4.0 / zoom), (CGFloat) fmax(2.0, 4.0 / zoom)};
    CGContextSetLineDash(context, 0.0, dashes, 2);
    CGContextSetLineWidth(context, (CGFloat) thin / zoom);
    CGContextBeginPath(context);
    CGContextMoveToPoint(context, x, edge);
    CGContextAddLineToPoint(context, x + w, edge);
    CGContextStrokePath(context);
    CGContextSetLineDash(context, 0.0, NULL, 0);

    if (strcmp(element->type, "door_garage") == 0) {
        const double panel = fmin(30.0, fmax(10.0, h * 0.55));
        const double top = edge - panel;
        CGContextSetRGBFillColor(context, 0.28, 0.33, 0.40, 0.10);
        CGContextFillRect(context, CGRectMake(x + 3.0, top, fmax(6.0, w - 6.0), panel));
        CGContextSetLineWidth(context, (CGFloat) fmax(1.2, stroke * 0.75) / zoom);
        CGContextStrokeRect(context, CGRectMake(x + 3.0, top, fmax(6.0, w - 6.0), panel));
        const int bars = (int) fmax(3.0, fmin(14.0, round(w / 16.0)));
        CGContextSetLineWidth(context, (CGFloat) fmax(0.9, stroke * 0.55) / zoom);
        CGContextBeginPath(context);
        for (int bar = 1; bar < bars; bar += 1) {
            const double barX = x + 3.0 + (fmax(6.0, w - 6.0) * (double) bar) / (double) bars;
            CGContextMoveToPoint(context, barX, top + 1.5);
            CGContextAddLineToPoint(context, barX, edge - 1.5);
        }
        CGContextStrokePath(context);
        return;
    }

    const BOOL doubleLeaf = strcmp(element->type, "door_double") == 0;
    const double leaf = fmax(8.0, fmin(doubleLeaf ? w / 2.0 : w, h));
    const double leafWidth = fmax(2.2, stroke * 1.2);
    for (int side = 0; side < (doubleLeaf ? 2 : 1); side += 1) {
        const double hinge = side == 0 ? x : x + w;
        const double reach = side == 0 ? x + leaf : x + w - leaf;
        CGContextSetLineWidth(context, (CGFloat) leafWidth / zoom);
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, hinge, edge);
        CGContextAddLineToPoint(context, hinge, edge - leaf);
        CGContextStrokePath(context);
        /* El arco de apertura se traza por puntos: con la vista invertida, un
           `CGContextAddArc` con ángulos es más fácil de equivocar que de leer. */
        const double from = -kHalfPi;
        const double to = reach >= hinge ? 0.0 : -kPi;
        const int steps = 24;
        CGContextSetLineWidth(context, (CGFloat) fmax(1.0, stroke * 0.6) / zoom);
        CGContextBeginPath(context);
        for (int step = 0; step <= steps; step += 1) {
            const double angle = from + (to - from) * (double) step / (double) steps;
            const double px = hinge + leaf * cos(angle);
            const double py = edge + leaf * sin(angle);
            if (step == 0) {
                CGContextMoveToPoint(context, px, py);
            } else {
                CGContextAddLineToPoint(context, px, py);
            }
        }
        CGContextStrokePath(context);
    }
}

/** Equipo o señal con caja: una caja con su pictograma dentro. */
- (void)drawObject:(const norma_element *)element selected:(BOOL)selected context:(CGContextRef)context
              zoom:(CGFloat)zoom
{
    const double w = element->w;
    const double h = element->h > 0.0 ? element->h : element->w;
    NSColor *colour = [self colourForObject:element];
    CGColorRef cg = colour.CGColor;
    CGContextSetStrokeColorWithColor(context, cg);
    CGContextSetLineWidth(context, (CGFloat) (selected ? 2.6 : 1.4) / zoom);
    const CGFloat radius = (CGFloat) fmin(4.0, fmin(w, h) * 0.12);
    CGPathRef box = CGPathCreateWithRoundedRect(CGRectMake(element->x, element->y, w, h), radius, radius, NULL);
    CGContextAddPath(context, box);
    CGContextSetFillColorWithColor(context, [colour colorWithAlphaComponent:0.14].CGColor);
    CGContextDrawPath(context, kCGPathFillStroke);
    CGPathRelease(box);

    CGContextSetFillColorWithColor(context, cg);
    CGContextSetStrokeColorWithColor(context, cg);
    const double cx = element->x + w / 2.0;
    const double cy = element->y + h / 2.0;
    const double size = fmin(w, h);
    const char *type = element->type;

    if (strcmp(type, "cad_emg_firstaid") == 0) {
        /* Cruz blanca de botiquín. */
        const double arm = size * 0.30;
        const double thick = size * 0.13;
        CGContextSetLineWidth(context, (CGFloat) thick);
        CGContextSetLineCap(context, kCGLineCapButt);
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, cx - arm, cy);
        CGContextAddLineToPoint(context, cx + arm, cy);
        CGContextMoveToPoint(context, cx, cy - arm);
        CGContextAddLineToPoint(context, cx, cy + arm);
        CGContextStrokePath(context);
        return;
    }
    if (strcmp(type, "cad_emg_meeting") == 0) {
        /* Cuatro flechas hacia fuera: el símbolo de punto de reunión. */
        CGContextSetLineWidth(context, (CGFloat) (size * 0.09));
        CGContextBeginPath(context);
        const double inner = size * 0.16;
        const double outer = size * 0.38;
        for (int side = 0; side < 4; side += 1) {
            const double angle = kHalfPi * (double) side;
            const double dx = cos(angle);
            const double dy = sin(angle);
            CGContextMoveToPoint(context, cx + dx * inner, cy + dy * inner);
            CGContextAddLineToPoint(context, cx + dx * outer, cy + dy * outer);
            /* Punta de la flecha. */
            const double tip = size * 0.11;
            CGContextMoveToPoint(context, cx + dx * outer, cy + dy * outer);
            CGContextAddLineToPoint(context, cx + dx * (outer - tip) - dy * tip * 0.7,
                                    cy + dy * (outer - tip) + dx * tip * 0.7);
            CGContextMoveToPoint(context, cx + dx * outer, cy + dy * outer);
            CGContextAddLineToPoint(context, cx + dx * (outer - tip) + dy * tip * 0.7,
                                    cy + dy * (outer - tip) - dx * tip * 0.7);
        }
        CGContextStrokePath(context);
        return;
    }
    if (strcmp(type, "cad_emg_stretcher") == 0 || strcmp(type, "cad_hosp_stretcher") == 0) {
        /* Camilla: dos barrotes y la cabecera. */
        CGContextSetLineWidth(context, (CGFloat) (size * 0.07));
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, cx - size * 0.34, cy - size * 0.16);
        CGContextAddLineToPoint(context, cx + size * 0.34, cy - size * 0.16);
        CGContextMoveToPoint(context, cx - size * 0.34, cy + size * 0.16);
        CGContextAddLineToPoint(context, cx + size * 0.34, cy + size * 0.16);
        CGContextStrokePath(context);
        CGContextFillEllipseInRect(context, CGRectMake(cx - size * 0.40, cy - size * 0.12, size * 0.16,
                                                      size * 0.24));
        return;
    }
    if (strcmp(type, "cad_emg_aed") == 0) {
        /* Rayo del desfibrilador. */
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, cx + size * 0.06, cy - size * 0.30);
        CGContextAddLineToPoint(context, cx - size * 0.18, cy + size * 0.04);
        CGContextAddLineToPoint(context, cx + size * 0.02, cy + size * 0.04);
        CGContextAddLineToPoint(context, cx - size * 0.08, cy + size * 0.30);
        CGContextAddLineToPoint(context, cx + size * 0.20, cy - size * 0.06);
        CGContextAddLineToPoint(context, cx, cy - size * 0.06);
        CGContextClosePath(context);
        CGContextFillPath(context);
        return;
    }
    if (strncmp(type, "cad_fire_ext", 12) == 0 || strstr(type, "extinguisher") != NULL) {
        /* Extintor: cuerpo y boquilla. */
        CGContextFillRect(context, CGRectMake(cx - size * 0.13, cy - size * 0.18, size * 0.26, size * 0.42));
        CGContextFillRect(context, CGRectMake(cx - size * 0.04, cy - size * 0.32, size * 0.08, size * 0.14));
        CGContextSetLineWidth(context, (CGFloat) (size * 0.07));
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, cx + size * 0.04, cy - size * 0.28);
        CGContextAddLineToPoint(context, cx + size * 0.22, cy - size * 0.20);
        CGContextStrokePath(context);
        return;
    }
    /* Señal del catálogo: marco interior, como el pictograma que se imprime. */
    CGContextSetLineWidth(context, (CGFloat) (size * 0.06));
    CGContextStrokeRect(context, CGRectMake(element->x + w * 0.18, element->y + h * 0.18, w * 0.64, h * 0.64));
}

/* ------------------------------ maqueta de trazo ------------------------- */

/**
 * Pinta la maqueta dentro de la transformación del plano.
 *
 * La imagen viene en base64 dentro del documento (así el plano es un solo
 * archivo), se decodifica una vez y se guarda mientras no cambie. Va debajo de
 * la hoja y con la opacidad del inspector: es una guía para calcar, no un
 * elemento que se imprima.
 */
- (void)drawGuideInContext:(CGContextRef)context
{
    if (self.document == NULL || !self.document->guide.present || !self.document->guide.visible
        || self.document->guide.data == NULL) {
        return;
    }
    const norma_guide *guide = &self.document->guide;
    /* Firma barata: tamaño y primeros bytes. Cambiar la imagen cambia la firma. */
    unsigned long signature = (unsigned long) guide->data_size;
    for (size_t index = 0; index < 32 && index < guide->data_size; index += 1) {
        signature = signature * 131 + (unsigned long) (unsigned char) guide->data[index];
    }
    if (_guideImage == nil || _guideSignature != signature) {
        NSString *encoded = [NSString stringWithUTF8String:guide->data];
        NSData *bytes = encoded != nil
            ? [[NSData alloc] initWithBase64EncodedString:encoded
                                                  options:NSDataBase64DecodingIgnoreUnknownCharacters]
            : nil;
        _guideImage = bytes != nil ? [[NSImage alloc] initWithData:bytes] : nil;
        _guideSignature = signature;
    }
    if (_guideImage == nil) {
        return;
    }
    const CGRect box = CGRectMake((CGFloat) guide->x, (CGFloat) guide->y,
                                  (CGFloat) guide->w, (CGFloat) guide->h);
    CGContextSaveGState(context);
    CGContextSetAlpha(context, (CGFloat) guide->opacity);
    /* `NSImage` en un contexto con el eje Y hacia abajo: se voltea el dibujo
       para que la maqueta no salga cabeza abajo. */
    CGContextTranslateCTM(context, 0.0, box.origin.y + box.size.height);
    CGContextScaleCTM(context, 1.0, -1.0);
    CGContextTranslateCTM(context, 0.0, -box.origin.y);
    NSGraphicsContext *graphics = [NSGraphicsContext graphicsContextWithCGContext:context flipped:YES];
    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext setCurrentContext:graphics];
    [_guideImage drawInRect:box fromRect:NSZeroRect operation:NSCompositingOperationSourceOver
                   fraction:1.0 respectFlipped:YES hints:nil];
    [NSGraphicsContext restoreGraphicsState];
    CGContextRestoreGState(context);

    /* El marco de la guía: se ve dónde está y se puede agarrar. */
    CGContextSetRGBStrokeColor(context, 0.35, 0.65, 0.95, 0.8);
    CGContextSetLineWidth(context, 1.0 / _zoom);
    const CGFloat dash[2] = {7.0 / (CGFloat) _zoom, 5.0 / (CGFloat) _zoom};
    CGContextSetLineDash(context, 0.0, dash, 2);
    CGContextStrokeRect(context, box);
    CGContextSetLineDash(context, 0.0, NULL, 0);
}

/** Esquina de la maqueta bajo el puntero, o -1. Mismo orden que las cajas. */
- (NSInteger)guideCornerAtPlanPoint:(norma_point)point tolerance:(double)tolerance
{
    if (self.document == NULL || !self.document->guide.present || !self.document->guide.visible
        || self.document->guide.locked) {
        return -1;
    }
    const norma_guide *guide = &self.document->guide;
    const norma_point corners[4] = {
        {guide->x, guide->y},
        {guide->x + guide->w, guide->y},
        {guide->x, guide->y + guide->h},
        {guide->x + guide->w, guide->y + guide->h},
    };
    for (int corner = 0; corner < 4; corner += 1) {
        if (norma_distance(point, corners[corner]) <= tolerance) {
            return corner;
        }
    }
    return -1;
}

/** 1 si el punto cae dentro de la maqueta (para arrastrarla). */
static int guide_contains(const norma_guide *guide, norma_point point)
{
    return point.x >= guide->x && point.x <= guide->x + guide->w
           && point.y >= guide->y && point.y <= guide->y + guide->h;
}

/** Color `#rrggbb` del elemento, o el oscuro de dibujo si no tiene uno. */
static NSColor *colour_from_hex(const char *hex)
{
    unsigned int red = 0;
    unsigned int green = 0;
    unsigned int blue = 0;
    if (hex != NULL && hex[0] == '#' && strlen(hex) == 7
        && sscanf(hex + 1, "%2x%2x%2x", &red, &green, &blue) == 3) {
        return [NSColor colorWithCalibratedRed:(CGFloat) red / 255.0
                                         green:(CGFloat) green / 255.0
                                          blue:(CGFloat) blue / 255.0
                                         alpha:1.0];
    }
    return [NSColor colorWithCalibratedRed:0.20 green:0.25 blue:0.33 alpha:1.0];
}

/** Color con el que se pinta un elemento: el suyo, o el de su familia. */
- (NSColor *)strokeColourForElement:(const norma_element *)element
{
    if (element->colour[0] == '#') {
        return colour_from_hex(element->colour);
    }
    /* Los oficios del entorno llevan el mismo color que en el SVG. */
    const char *type = element->type;
    if (strcmp(type, "road") == 0 || strcmp(type, "crosswalk") == 0) {
        return colour_from_hex("#64748b");
    }
    if (strcmp(type, "sidewalk") == 0) {
        return colour_from_hex("#94a3b8");
    }
    if (strcmp(type, "parking") == 0) {
        return colour_from_hex("#475569");
    }
    if (strcmp(type, "property") == 0) {
        return colour_from_hex("#7c3d12");
    }
    if (strcmp(type, "pipe") == 0) {
        return colour_from_hex("#2563eb");
    }
    if (strcmp(type, "conduit") == 0) {
        return colour_from_hex("#ea580c");
    }
    if (element->node_count < 2) {
        return [self colourForObject:element];
    }
    return colour_from_hex(NULL);
}

/**
 * Vía, andén, paso peatonal y parqueadero: zonas con su trama, no pictogramas.
 *
 * Se pintan en coordenadas del plano, con el grosor dividido por el zoom, para
 * que la trama no engorde al acercarse.
 */
- (void)drawEnvironment:(const norma_element *)element selected:(BOOL)selected
                context:(CGContextRef)context zoom:(CGFloat)zoom
{
    const CGFloat w = (CGFloat) element->w;
    const CGFloat h = (CGFloat) element->h;
    const CGRect box = CGRectMake((CGFloat) element->x, (CGFloat) element->y, w, h);
    NSColor *colour = [self strokeColourForElement:element];
    const char *type = element->type;

    if (strcmp(type, "road") == 0) {
        CGContextSetFillColorWithColor(context, [NSColor colorWithCalibratedWhite:0.93 alpha:1.0].CGColor);
        CGContextFillRect(context, box);
    } else if (strcmp(type, "sidewalk") == 0) {
        CGContextSetFillColorWithColor(context, [NSColor colorWithCalibratedWhite:0.98 alpha:1.0].CGColor);
        CGContextFillRect(context, box);
    } else if (strcmp(type, "crosswalk") == 0) {
        CGContextSetFillColorWithColor(context, [NSColor whiteColor].CGColor);
        CGContextFillRect(context, box);
        CGContextSetFillColorWithColor(context, [NSColor colorWithCalibratedWhite:0.80 alpha:1.0].CGColor);
        const int stripes = 6;
        for (int stripe = 0; stripe < stripes; stripe += 1) {
            const CGFloat stripeWidth = w * 0.5f / (CGFloat) stripes;
            CGContextFillRect(context, CGRectMake(box.origin.x + w * ((CGFloat) stripe + 0.25f) / (CGFloat) stripes,
                                                  box.origin.y + h * 0.12f, stripeWidth, h * 0.76f));
        }
    }

    CGContextSetStrokeColorWithColor(context, colour.CGColor);
    CGContextSetLineWidth(context, (CGFloat) (selected ? 2.2 : 1.2) / zoom);
    CGContextStrokeRect(context, box);

    if (strcmp(type, "road") == 0) {
        /* Eje discontinuo de la vía. */
        const CGFloat dash[2] = {12.0f / zoom, 8.0f / zoom};
        CGContextSetLineDash(context, 0.0, dash, 2);
        CGContextMoveToPoint(context, box.origin.x, box.origin.y + h / 2.0f);
        CGContextAddLineToPoint(context, box.origin.x + w, box.origin.y + h / 2.0f);
        CGContextStrokePath(context);
        CGContextSetLineDash(context, 0.0, NULL, 0);
    }
}

/**
 * Rectángulo y elipse: figuras del editor web.
 *
 * Se dibujan por lo que son —un rectángulo y una elipse—, no por su caja, y
 * respetan el giro del inspector alrededor de su centro.
 */
- (void)drawShape:(const norma_element *)element selected:(BOOL)selected context:(CGContextRef)context
             zoom:(CGFloat)zoom
{
    const double w = element->w;
    const double h = element->h;
    NSColor *colour = [self strokeColourForElement:element];
    CGContextSetStrokeColorWithColor(context, colour.CGColor);
    CGContextSetLineWidth(context, (CGFloat) (selected ? 2.4 : 1.4) / zoom);

    CGContextSaveGState(context);
    if (element->rotation != 0.0) {
        const double cx = element->x + w / 2.0;
        const double cy = element->y + h / 2.0;
        CGContextTranslateCTM(context, (CGFloat) cx, (CGFloat) cy);
        /* El lienzo tiene el eje Y hacia abajo: el giro se aplica al revés. */
        CGContextRotateCTM(context, (CGFloat) (-element->rotation * kPi / 180.0));
        CGContextTranslateCTM(context, (CGFloat) -cx, (CGFloat) -cy);
    }
    if (strcmp(element->type, "ellipse") == 0) {
        CGContextStrokeEllipseInRect(context, CGRectMake(element->x, element->y, w, h));
    } else {
        CGContextStrokeRect(context, CGRectMake(element->x, element->y, w, h));
    }
    CGContextRestoreGState(context);

    if (selected) {
        CGContextSetRGBStrokeColor(context, 0.22, 0.52, 1.0, 0.9);
        CGContextSetLineWidth(context, 1.0 / zoom);
        CGContextStrokeRect(context, CGRectMake(element->x - 3.0 / zoom, element->y - 3.0 / zoom,
                                                w + 6.0 / zoom, h + 6.0 / zoom));
    }
}

/**
 * Tiradores de la caja seleccionada: cuatro esquinas para escalarla con el
 * ratón. Son la versión nativa de los tiradores del editor web.
 */
- (void)drawSelectionHandlesInContext:(CGContextRef)context
{
    if (_selectedElement < 0 || _selectedElement >= (NSInteger) self.document->count) {
        return;
    }
    const norma_element *element = &self.document->elements[_selectedElement];
    if (element->node_count >= 2) {
        return;
    }
    const NSPoint corners[4] = {
        [self viewPointForPlan:((norma_point) {element->x, element->y})],
        [self viewPointForPlan:((norma_point) {element->x + element->w, element->y})],
        [self viewPointForPlan:((norma_point) {element->x, element->y + element->h})],
        [self viewPointForPlan:((norma_point) {element->x + element->w, element->y + element->h})],
    };
    for (int corner = 0; corner < 4; corner += 1) {
        const CGFloat size = 7.0;
        const CGRect handle = CGRectMake(corners[corner].x - size / 2.0, corners[corner].y - size / 2.0,
                                         size, size);
        CGContextSetRGBFillColor(context, 1.0, 1.0, 1.0, 1.0);
        CGContextFillRect(context, handle);
        CGContextSetRGBStrokeColor(context, 0.22, 0.52, 1.0, 1.0);
        CGContextSetLineWidth(context, 1.5);
        CGContextStrokeRect(context, handle);
    }
}

/** Esquina de escalado bajo el puntero, o -1 si no hay ninguna. */
- (NSInteger)resizeCornerAtPlanPoint:(norma_point)point tolerance:(double)tolerance
{
    if (_selectedElement < 0 || _selectedElement >= (NSInteger) self.document->count) {
        return -1;
    }
    const norma_element *element = &self.document->elements[_selectedElement];
    if (element->node_count >= 2) {
        return -1;
    }
    const norma_point corners[4] = {
        {element->x, element->y},
        {element->x + element->w, element->y},
        {element->x, element->y + element->h},
        {element->x + element->w, element->y + element->h},
    };
    for (int corner = 0; corner < 4; corner += 1) {
        if (norma_distance(point, corners[corner]) <= tolerance) {
            return corner;
        }
    }
    return -1;
}

- (void)drawRect:(NSRect)dirtyRect
{
    (void) dirtyRect;
    if (self.printing) {
        [[NSColor whiteColor] setFill];
    } else {
        /* Espacio de trabajo oscuro, con la hoja blanca encima: la misma
           lectura que un CAD en espacio de presentación. */
        [[NSColor colorWithCalibratedRed:0.11 green:0.12 blue:0.14 alpha:1.0] setFill];
    }
    NSRectFill(self.bounds);
    if (self.document == NULL) {
        return;
    }
    CGContextRef context = NSGraphicsContext.currentContext.CGContext;
    [self ensureView];
    const CGFloat zoom = (CGFloat) _zoom;

    // Rejilla de referencia en todo el espacio de trabajo: el lienzo es
    // infinito y se puede dibujar fuera de la hoja. Al alejarse, la rejilla se
    // agranda para no dibujar miles de líneas.
    if (!self.printing && _showsGrid) {
        double grid = 20.0;
        while (grid * (double) zoom < 9.0) {
            grid *= 5.0;
        }
        const double minX = (0.0 - _panX) / _zoom;
        const double maxX = ((double) NSWidth(self.bounds) - _panX) / _zoom;
        const double minY = (0.0 - _panY) / _zoom;
        const double maxY = ((double) NSHeight(self.bounds) - _panY) / _zoom;
        CGContextSetRGBStrokeColor(context, 0.22, 0.24, 0.28, 1.0);
        CGContextSetLineWidth(context, 1.0);
        CGContextBeginPath(context);
        for (double x = floor(minX / grid) * grid; x <= maxX; x += grid) {
            const double viewX = _panX + x * _zoom;
            CGContextMoveToPoint(context, (CGFloat) viewX, 0.0);
            CGContextAddLineToPoint(context, (CGFloat) viewX, NSHeight(self.bounds));
        }
        for (double y = floor(minY / grid) * grid; y <= maxY; y += grid) {
            const double viewY = _panY + y * _zoom;
            CGContextMoveToPoint(context, 0.0, (CGFloat) viewY);
            CGContextAddLineToPoint(context, NSWidth(self.bounds), (CGFloat) viewY);
        }
        CGContextStrokePath(context);
    }

    CGContextSaveGState(context);
    CGContextConcatCTM(context, [self planTransform]);

    /* La maqueta de trazo va debajo de todo: es una imagen para calcar, no un
       elemento del plano; no se imprime ni sale en el SVG. */
    if (!self.printing) {
        [self drawGuideInContext:context];
    }

    // La hoja de papel: la referencia de impresión, no el límite del dibujo.
    CGContextSetRGBFillColor(context, 1.0, 1.0, 1.0, 1.0);
    CGContextFillRect(context, CGRectMake(0, 0, self.document->width, self.document->height));
    CGContextSetRGBStrokeColor(context, 0.55, 0.58, 0.62, 1.0);
    CGContextSetLineWidth(context, 1.0 / zoom);
    CGContextStrokeRect(context, CGRectMake(0, 0, self.document->width, self.document->height));

    for (size_t index = 0; index < self.document->count; index += 1) {
        const norma_element *element = &self.document->elements[index];
        const BOOL selected = (NSInteger) index == _selectedElement;
        const BOOL isDimension = strcmp(element->type, "dimension") == 0;

        /* Rectángulo y elipse: figuras por lo que son, no por su caja. */
        if (strcmp(element->type, "rect") == 0 || strcmp(element->type, "ellipse") == 0) {
            [self drawShape:element selected:selected context:context zoom:zoom];
            continue;
        }
        /* El texto suelto se rotula abajo, en coordenadas de ventana. */
        if (strcmp(element->type, "text") == 0) {
            continue;
        }

        /* Vías, andenes, pasos y parqueaderos: zonas con su trama. */
        if (element->node_count < 2 && norma_environment_is(element->type)) {
            [self drawEnvironment:element selected:selected context:context zoom:zoom];
            continue;
        }

        /* Puertas y objetos con caja se dibujan aparte: no son trazos. */
        if (element->node_count < 2 && norma_object_is_door(element->type)) {
            [self drawDoor:element selected:selected context:context zoom:zoom];
            continue;
        }
        if (element->node_count < 2 && element->w > 0.0) {
            [self drawObject:element selected:selected context:context zoom:zoom];
            continue;
        }

        if (selected) {
            CGContextSetRGBStrokeColor(context, 0.22, 0.52, 1.0, 1.0);
            CGContextSetLineWidth(context, 3.0 / zoom);
        } else if (isDimension) {
            CGContextSetRGBStrokeColor(context, 0.28, 0.33, 0.40, 1.0);
            CGContextSetLineWidth(context, 1.0 / zoom);
        } else if (strcmp(element->type, "wall") == 0) {
            CGContextSetRGBStrokeColor(context, 0.12, 0.15, 0.20, 1.0);
            CGContextSetLineWidth(context, 1.6 / zoom);
        } else if (strcmp(element->type, "route") == 0) {
            // Verde de evacuación, el mismo de la edición web.
            CGContextSetRGBStrokeColor(context, 0.14, 0.50, 0.32, 1.0);
            CGContextSetLineWidth(context, 2.4 / zoom);
        } else if (strcmp(element->type, "property") == 0) {
            /* Lindero discontinuo, como en el plano impreso. */
            CGContextSetStrokeColorWithColor(context, [self strokeColourForElement:element].CGColor);
            CGContextSetLineWidth(context, (CGFloat) (element->stroke > 0.0 ? element->stroke : 2.0) / zoom);
            const CGFloat dash[2] = {8.0 / zoom, 5.0 / zoom};
            CGContextSetLineDash(context, 0.0, dash, 2);
        } else if (strcmp(element->type, "pipe") == 0 || strcmp(element->type, "conduit") == 0) {
            CGContextSetStrokeColorWithColor(context, [self strokeColourForElement:element].CGColor);
            CGContextSetLineWidth(context, (CGFloat) (element->stroke > 0.0 ? element->stroke : 3.0) / zoom);
        } else if (strcmp(element->type, "line") == 0) {
            /* Línea de dibujo: su color, o el oscuro de las figuras. */
            CGContextSetStrokeColorWithColor(context, [self strokeColourForElement:element].CGColor);
            CGContextSetLineWidth(context, (CGFloat) (element->stroke > 0.0 ? element->stroke : 1.4) / zoom);
        } else {
            CGContextSetRGBStrokeColor(context, 0.85, 0.22, 0.24, 1.0);
            CGContextSetLineWidth(context, 1.4 / zoom);
        }

        if (element->node_count >= 2) {
            CGContextBeginPath(context);
            CGContextMoveToPoint(context, element->nodes[0].x, element->nodes[0].y);
            for (size_t node = 0; node + 1 < element->node_count; node += 1) {
                const norma_arc *arc = &element->arcs[node];
                if (arc->valid) {
                    const int steps = 24;
                    for (int step = 1; step <= steps; step += 1) {
                        const norma_point point = norma_arc_point_at(arc, (double) step / (double) steps);
                        CGContextAddLineToPoint(context, point.x, point.y);
                    }
                } else {
                    CGContextAddLineToPoint(context, element->nodes[node + 1].x, element->nodes[node + 1].y);
                }
            }
            CGContextStrokePath(context);
            CGContextSetLineDash(context, 0.0, NULL, 0);
            if (strcmp(element->type, "route") == 0 && element->node_count >= 2) {
                // Punta de flecha en el sentido de la evacuación.
                const norma_point end = element->nodes[element->node_count - 1];
                const norma_point previous = element->nodes[element->node_count - 2];
                const double angle = atan2(end.y - previous.y, end.x - previous.x);
                const double size = 9.0 / zoom;
                CGContextSetRGBFillColor(context, 0.14, 0.50, 0.32, 1.0);
                CGContextBeginPath(context);
                CGContextMoveToPoint(context, end.x, end.y);
                CGContextAddLineToPoint(context, end.x - size * cos(angle - 0.4), end.y - size * sin(angle - 0.4));
                CGContextAddLineToPoint(context, end.x - size * cos(angle + 0.4), end.y - size * sin(angle + 0.4));
                CGContextClosePath(context);
                CGContextFillPath(context);
            }
            if (isDimension) {
                // Marcas en los extremos, como en el editor web.
                for (size_t end = 0; end < 2; end += 1) {
                    const norma_point point = element->nodes[end == 0 ? 0 : element->node_count - 1];
                    CGContextMoveToPoint(context, point.x, point.y - 6.0);
                    CGContextAddLineToPoint(context, point.x, point.y + 6.0);
                }
                CGContextStrokePath(context);
            }
        } else {
            const CGRect marker = CGRectMake(element->x - 12.0, element->y - 12.0, 24.0, 24.0);
            CGContextStrokeEllipseInRect(context, marker);
            CGContextMoveToPoint(context, element->x - 16.0, element->y);
            CGContextAddLineToPoint(context, element->x + 16.0, element->y);
            CGContextMoveToPoint(context, element->x, element->y - 16.0);
            CGContextAddLineToPoint(context, element->x, element->y + 16.0);
            CGContextStrokePath(context);
        }
    }

    const CGFloat handle = 4.0 / zoom;
    if (_selectedElement >= 0 && _selectedElement < (NSInteger) self.document->count && _selectedNode >= 0) {
        const norma_element *element = &self.document->elements[_selectedElement];
        if ((size_t) _selectedNode < element->node_count) {
            const norma_point node = element->nodes[_selectedNode];
            CGContextSetRGBFillColor(context, 0.22, 0.52, 1.0, 1.0);
            CGContextFillRect(context, CGRectMake(node.x - handle, node.y - handle, handle * 2.0, handle * 2.0));
        }
    }

    // Borrador de la herramienta en curso.
    /* Muro y pluma: el trazo ya dibujado se ve entero, con el tramo elástico
       hasta el cursor, como el pincel del editor web. */
    if (_draftCount >= 2) {
        CGContextSetRGBStrokeColor(context, 0.95, 0.45, 0.10, 0.95);
        CGContextSetLineWidth(context, 1.6 / zoom);
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, _draft[0].x, _draft[0].y);
        for (int index = 1; index < _draftCount; index += 1) {
            CGContextAddLineToPoint(context, _draft[index].x, _draft[index].y);
        }
        CGContextStrokePath(context);
    }
    CGContextSetRGBFillColor(context, 0.95, 0.45, 0.10, 1.0);
    for (int index = 0; index < _draftCount; index += 1) {
        CGContextFillRect(context, CGRectMake(_draft[index].x - handle, _draft[index].y - handle,
                                              handle * 2.0, handle * 2.0));
    }
    if (_draftCount >= 3 && _tool == NormiaToolWall) {
        /* Primer nodo: el clic aquí cierra el recinto. */
        const CGFloat ring = 9.0 / zoom;
        CGContextSetRGBStrokeColor(context, 0.14, 0.62, 0.36, 0.95);
        CGContextSetLineWidth(context, 1.8 / zoom);
        CGContextStrokeEllipseInRect(context, CGRectMake(_draft[0].x - ring, _draft[0].y - ring,
                                                         ring * 2.0, ring * 2.0));
    }
    if (_draftCount > 0 && _hasCursor) {
        CGContextSetRGBStrokeColor(context, 0.95, 0.45, 0.10, 0.9);
        CGContextSetLineWidth(context, 1.0 / zoom);
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, _draft[_draftCount - 1].x, _draft[_draftCount - 1].y);
        CGContextAddLineToPoint(context, _cursorPoint.x, _cursorPoint.y);
        CGContextStrokePath(context);

        /* Rectángulo y elipse se previsualizan como van a quedar. */
        if (_tool == NormiaToolRect || _tool == NormiaToolEllipse || environment_type(_tool) != NULL) {
            const CGRect box = CGRectMake(_draft[0].x, _draft[0].y,
                                          _cursorPoint.x - _draft[0].x, _cursorPoint.y - _draft[0].y);
            const CGRect normal = CGRectStandardize(box);
            if (_tool == NormiaToolEllipse) {
                CGContextStrokeEllipseInRect(context, normal);
            } else {
                CGContextStrokeRect(context, normal);
            }
        }
    }

    // La revisión: un anillo por hallazgo con punto en el plano.
    CGContextSetRGBStrokeColor(context, 0.86, 0.30, 0.22, 0.95);
    CGContextSetLineWidth(context, 1.8 / zoom);
    for (size_t index = 0; index < _findingCount; index += 1) {
        const norma_point point = _findingPoints[index];
        const CGFloat radius = 11.0 / zoom;
        CGContextStrokeEllipseInRect(context, CGRectMake(point.x - radius, point.y - radius,
                                                         radius * 2.0, radius * 2.0));
    }

    CGContextRestoreGState(context);

    /* Los tiradores, en puntos de pantalla: no crecen con el zoom. */
    if (!self.printing) {
        [self drawSelectionHandlesInContext:context];
    }

    // Las cifras se dibujan en coordenadas de la ventana: si se hicieran dentro
    // de la transformación, el texto crecería con el zoom.
    for (size_t index = 0; index < self.document->count; index += 1) {
        const norma_element *element = &self.document->elements[index];
        if (strcmp(element->type, "text") == 0) {
            /* El texto se lee en el plano: su tamaño en pantalla sigue al zoom,
               con un mínimo para que no desaparezca al alejarse. */
            NSString *content = element->label[0] != '\0' ? [NSString stringWithUTF8String:element->label] : @"Texto";
            NSFont *font = [NSFont systemFontOfSize:fmax(9.0, 12.0 * (double) zoom)];
            NSDictionary *attributes = @{
                NSFontAttributeName: font,
                NSForegroundColorAttributeName: [self strokeColourForElement:element],
            };
            const NSPoint origin = [self viewPointForPlan:((norma_point) {element->x, element->y})];
            [content drawAtPoint:origin withAttributes:attributes];
            if ((NSInteger) index == _selectedElement) {
                const NSSize size = [content sizeWithAttributes:attributes];
                CGContextSetRGBStrokeColor(context, 0.22, 0.52, 1.0, 0.9);
                CGContextSetLineWidth(context, 1.0);
                CGContextStrokeRect(context, CGRectMake(origin.x - 3.0, origin.y - 2.0, size.width + 6.0,
                                                       size.height + 4.0));
            }
            continue;
        }
        if (element->node_count < 2) {
            NSString *caption = [self captionForObject:element];
            if (caption != nil) {
                [self drawLabel:caption
                         atPlan:((norma_point) {element->x + element->w / 2.0,
                                                element->y + (element->h > 0.0 ? element->h : 0.0) + 4.0})];
            }
            continue;
        }
        if (strcmp(element->type, "route") == 0) {
            // La longitud de la ruta se rotula junto a su extremo, con la misma
            // cifra que dará el auditor.
            char caption[64];
            norma_format_measure_cm(norma_polyline_length(element->nodes, element->node_count, element->arcs),
                                    self.document->unit, caption, sizeof(caption));
            const norma_point end = element->nodes[element->node_count - 1];
            [self drawLabel:@(caption) atPlan:((norma_point) {end.x + 6.0, end.y + 14.0})];
            continue;
        }
        if (strcmp(element->type, "dimension") != 0) {
            continue;
        }
        const norma_point a = element->nodes[0];
        const norma_point b = element->nodes[element->node_count - 1];
        char caption[64];
        norma_format_measure_cm(norma_distance(a, b), self.document->unit, caption, sizeof(caption));
        [self drawLabel:@(caption) atPlan:((norma_point) {(a.x + b.x) / 2.0, (a.y + b.y) / 2.0})];
    }
}

/**
 * Rótulo del objeto. No inventa nombres: usa el que la persona le puso; si no
 * hay, el código de la señal (`iso_e001` → `E001`) o una abreviatura conocida.
 * Lo que diga el informe lo decide el catálogo, no esto.
 */
- (NSString *)captionForObject:(const norma_element *)element
{
    if (element->label[0] != '\0') {
        return [NSString stringWithUTF8String:element->label];
    }
    if (norma_object_is_door(element->type)) {
        return element->is_exit ? @"SALIDA" : nil;
    }
    const char *type = element->type;
    if (strncmp(type, "iso_", 4) == 0 && strlen(type) == 8) {
        return [[NSString stringWithUTF8String:type + 4] uppercaseString];
    }
    if (strncmp(type, "sig_", 4) == 0) {
        return [NSString stringWithUTF8String:type + 4];
    }
    if (strcmp(type, "cad_ems_extinguisher") == 0 || strstr(type, "extinguisher") != NULL) {
        return @"EXT";
    }
    if (strcmp(type, "cad_emg_firstaid") == 0) {
        return @"BOTIQUÍN";
    }
    if (strcmp(type, "cad_emg_stretcher") == 0 || strcmp(type, "cad_hosp_stretcher") == 0) {
        return @"CAMILLA";
    }
    if (strcmp(type, "cad_emg_aed") == 0) {
        return @"DEA";
    }
    if (strcmp(type, "cad_emg_meeting") == 0) {
        return @"ENCUENTRO";
    }
    if (strcmp(type, "text") == 0) {
        return nil; /* el texto ya se rotula con su contenido */
    }
    if (strcmp(type, "parking") == 0) {
        return @"P";
    }
    /* Cualquier otra pieza del catálogo se rotula con el nombre que tiene en el
       catálogo —«Ascensor accesible», «Estantería 4 niveles»—, que es lo que
       hace legible un plano con 820 objetos disponibles. */
    const norma_object_spec *spec = norma_object_find(type);
    if (spec != NULL) {
        return [NSString stringWithUTF8String:spec->name];
    }
    return nil;
}

- (void)drawLabel:(NSString *)text atPlan:(norma_point)point
{
    NSFont *font = [NSFont systemFontOfSize:11.0 weight:NSFontWeightMedium];
    NSDictionary *attributes = @{
        NSFontAttributeName: font,
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedRed:0.28 green:0.33 blue:0.40 alpha:1.0],
    };
    const NSSize size = [text sizeWithAttributes:attributes];
    const NSPoint anchor = [self viewPointForPlan:point];
    [text drawAtPoint:NSMakePoint(anchor.x - size.width / 2.0, anchor.y - size.height - 4.0) withAttributes:attributes];
}

/* -------------------------------- edición -------------------------------- */

/** Cierra el borrador: muro con nodos, arco de tres puntos o cota. */
/** Tipo de entorno que dibuja cada herramienta (NULL si no es del entorno). */
static const char *environment_type(NormiaTool tool)
{
    switch (tool) {
    case NormiaToolRoad: return "road";
    case NormiaToolSidewalk: return "sidewalk";
    case NormiaToolCrosswalk: return "crosswalk";
    case NormiaToolParking: return "parking";
    case NormiaToolProperty: return "property";
    case NormiaToolPipe: return "pipe";
    case NormiaToolConduit: return "conduit";
    default: return NULL;
    }
}

- (void)commitDraft
{
    if (self.document == NULL || _draftCount < 2) {
        _draftCount = 0;
        return;
    }
    norma_document_begin_edit(self.document);
    long index = -1;
    if (_tool == NormiaToolDimension) {
        index = norma_document_add_dimension(self.document, _draft[0], _draft[1], NULL);

        char caption[64];
        norma_format_measure_cm(norma_distance(_draft[0], _draft[1]), self.document->unit, caption, sizeof(caption));
        [self.delegate canvasStatus:self message:[NSString stringWithFormat:@"Cota de %s", caption]];
    } else if (_tool == NormiaToolArc) {
        norma_arc arc = norma_arc_from_points(_draft[0], _draft[1], _draft[2]);
        if (arc.valid) {
            const norma_point nodes[2] = {_draft[0], _draft[2]};
            const norma_arc arcs[1] = {arc};
            index = norma_document_add_wall(self.document, nodes, 2, arcs, NULL);
        } else {
            [self.delegate canvasStatus:self message:@"El arco no es válido: los tres puntos están en línea." ];
        }
    } else if (_tool == NormiaToolRoute) {
        index = norma_document_add_route(self.document, _draft, (size_t) _draftCount, NULL, NULL);
    } else if (_tool == NormiaToolLine) {
        index = norma_document_add_shape(self.document, "line", _draft[0], _draft[1], NULL);
    } else if (_tool == NormiaToolRect) {
        index = norma_document_add_shape(self.document, "rect", _draft[0], _draft[1], NULL);
    } else if (_tool == NormiaToolEllipse) {
        index = norma_document_add_shape(self.document, "ellipse", _draft[0], _draft[1], NULL);
    } else if (environment_type(_tool) != NULL) {
        index = norma_document_add_environment(self.document, environment_type(_tool), _draft[0], _draft[1], NULL);
    } else if (_tool == NormiaToolWall) {
        /* Cierre por el primer nodo: el recinto es un polígono cerrado, como
           cuando se vuelve a hacer clic sobre el nodo inicial en la web. */
        if (_closingDraft && _draftCount + 1 <= kMaxDraftNodes) {
            _draft[_draftCount] = _draft[0];
            _draftCount += 1;
        }
        index = norma_document_add_wall(self.document, _draft, (size_t) _draftCount, NULL, NULL);
    } else {
        index = norma_document_add_wall(self.document, _draft, (size_t) _draftCount, NULL, NULL);
    }
    _closingDraft = NO;
    if (index >= 0) {
        _selectedElement = index;
        _selectedNode = -1;
        [self.delegate canvasDidChange:self];
        [self announceSelection];
    } else if (_tool == NormiaToolRect || _tool == NormiaToolEllipse || _tool == NormiaToolLine
               || environment_type(_tool) != NULL) {
        [self.delegate canvasStatus:self
                            message:@"El elemento quedó sin área: los dos clics están en el mismo punto."];
    }
    _draftCount = 0;
    [self setNeedsDisplay:YES];
}

- (void)mouseDown:(NSEvent *)event
{
    if (self.document == NULL) {
        return;
    }
    const norma_point point = [self planPointForEvent:event];

    /* Mano: arrastrar el lienzo no toca el plano. */
    if (_tool == NormiaToolPan) {
        _panning = YES;
        _panStart = [self convertPoint:event.locationInWindow fromView:nil];
        _panStartX = _panX;
        _panStartY = _panY;
        return;
    }

    if (_tool == NormiaToolInsert && _insertType[0] != '\0') {
        [self placeInsertedObject:point];
        return;
    }

    /* Texto: un clic y queda escrito «Texto», listo para renombrar. */
    if (_tool == NormiaToolText) {
        [self.delegate canvasStatus:self message:[self addTextAtPoint:point]];
        return;
    }

    /* El muro es un pincel de nodos, como en el editor web: cada clic añade un
       vértice y el tramo sigue al cursor; el clic sobre el primer nodo cierra el
       recinto y Enter, el doble clic o Esc terminan el trazo. */
    if (_tool == NormiaToolWall) {
        const double clickTolerance = (double) kToleranceScreen / (double) [self scale];
        if (_draftCount >= 3 && norma_distance(point, _draft[0]) <= clickTolerance) {
            _closingDraft = YES;
            [self commitDraft];
            [self.delegate canvasStatus:self message:@"Recinto cerrado."];
            return;
        }
        if (_draftCount < kMaxDraftNodes) {
            _draft[_draftCount] = point;
            _draftCount += 1;
        }
        if (event.clickCount >= 2 && _draftCount > 2) {
            _draftCount -= 1; /* el doble clic no añade un nodo de más */
            [self commitDraft];
        } else {
            [self.delegate canvasStatus:self message:[self hintForTool]];
        }
        [self setNeedsDisplay:YES];
        return;
    }

    if (_tool == NormiaToolDimension || _tool == NormiaToolArc
        || _tool == NormiaToolLine || _tool == NormiaToolRect || _tool == NormiaToolEllipse
        || environment_type(_tool) != NULL) {
        if (_draftCount < kMaxDraftNodes) {
            _draft[_draftCount] = point;
            _draftCount += 1;
        }
        if ((_tool == NormiaToolDimension && _draftCount == 2)
            || (_tool == NormiaToolArc && _draftCount == 3)
            || ((_tool == NormiaToolLine || _tool == NormiaToolRect || _tool == NormiaToolEllipse
                 || environment_type(_tool) != NULL)
                && _draftCount == 2)) {
            [self commitDraft];
        } else {
            [self.delegate canvasStatus:self message:[self hintForTool]];
            [self setNeedsDisplay:YES];
        }
        return;
    }

    if (_tool == NormiaToolPen || _tool == NormiaToolRoute) {
        if (_draftCount < kMaxDraftNodes) {
            _draft[_draftCount] = point;
            _draftCount += 1;
        }
        if (event.clickCount >= 2 && _draftCount > 2) {
            _draftCount -= 1; /* el doble clic no añade un nodo de más */
            [self commitDraft];
        } else {
            [self.delegate canvasStatus:self message:[self hintForTool]];
        }
        [self setNeedsDisplay:YES];
        return;
    }

    const double planTolerance = (double) kToleranceScreen / (double) [self scale];

    /* La maqueta se agarra por sus esquinas o por su cuerpo, pero solo cuando el
       clic no cae sobre un elemento del plano: lo dibujado siempre manda. */
    if (_tool == NormiaToolSelect && self.document != NULL && self.document->guide.present
        && self.document->guide.visible && !self.document->guide.locked
        && norma_document_hit_test(self.document, point, planTolerance) < 0) {
        const NSInteger guideCorner = [self guideCornerAtPlanPoint:point tolerance:planTolerance];
        const int inside = guide_contains(&self.document->guide, point);
        if (guideCorner >= 0 || inside) {
            const norma_guide *guide = &self.document->guide;
            _guideDrag = guideCorner >= 0 ? guideCorner : 4;
            const norma_point corners[4] = {
                {guide->x, guide->y},
                {guide->x + guide->w, guide->y},
                {guide->x, guide->y + guide->h},
                {guide->x + guide->w, guide->y + guide->h},
            };
            _guideAnchor = guideCorner >= 0 ? corners[3 - guideCorner] : point;
            _guideStartX = guide->x;
            _guideStartY = guide->y;
            _guideStartW = guide->w;
            _guideStartH = guide->h;
            _selectedElement = -1;
            _selectedNode = -1;
            _editBegun = NO;
            [self announceSelection];
            [self.delegate canvasStatus:self
                                message:@"Maqueta: arrastra para moverla; las esquinas la escalan. Bloquéala en el inspector para no moverla sin querer."];
            [self setNeedsDisplay:YES];
            return;
        }
    }

    /* Antes de elegir otra cosa: ¿se agarró una esquina de la caja? */
    const NSInteger corner = [self resizeCornerAtPlanPoint:point tolerance:planTolerance];
    if (corner >= 0 && _selectedElement >= 0) {
        const norma_element *selectedElement = &self.document->elements[_selectedElement];
        const norma_point corners[4] = {
            {selectedElement->x, selectedElement->y},
            {selectedElement->x + selectedElement->w, selectedElement->y},
            {selectedElement->x, selectedElement->y + selectedElement->h},
            {selectedElement->x + selectedElement->w, selectedElement->y + selectedElement->h},
        };
        /* La esquina opuesta queda quieta mientras se arrastra. */
        _resizeAnchor = corners[3 - corner];
        _resizeCorner = corner;
        _draggingNode = NO;
        _editBegun = NO;
        [self setNeedsDisplay:YES];
        return;
    }

    const long hit = norma_document_hit_test(self.document, point, planTolerance);
    _selectedElement = hit;
    _selectedNode = -1;
    _draggingNode = NO;
    [self announceSelection];
    if (hit >= 0) {
        const norma_element *element = &self.document->elements[hit];
        for (size_t node = 0; node < element->node_count; node += 1) {
            if (norma_distance(point, element->nodes[node]) <= planTolerance) {
                _selectedNode = (NSInteger) node;
                break;
            }
        }
        _draggingNode = YES;
        _editBegun = NO;
        _dragOrigin = point;
        /* El desfase se mide desde la esquina de la caja: así el objeto no salta
           bajo el puntero al empezar a arrastrar. */
        _dragOffsetX = point.x - element->x;
        _dragOffsetY = point.y - element->y;
    }
    [self setNeedsDisplay:YES];
}

- (void)beginInsert:(NSString *)type
{
    const norma_object_spec *spec = norma_object_find(type.UTF8String);
    if (spec == NULL) {
        [self.delegate canvasStatus:self message:@"Ese objeto no se puede insertar."];
        return;
    }
    snprintf(_insertType, sizeof(_insertType), "%s", spec->type);
    _tool = NormiaToolInsert;
    _draftCount = 0;
    _hasCursor = NO;
    _selectedNode = -1;
    [self.delegate canvasStatus:self
                        message:[NSString stringWithFormat:@"%s: un clic en el plano para colocar. Esc termina.",
                                                           spec->name]];
    [self.window makeFirstResponder:self];
    [self setNeedsDisplay:YES];
}

- (NSString *)insertingType
{
    return _insertType[0] != '\0' ? [NSString stringWithUTF8String:_insertType] : nil;
}

/** Coloca el objeto armado en el punto del clic y lo deja seleccionado. */
- (void)placeInsertedObject:(norma_point)point
{
    norma_document_begin_edit(self.document);
    const long index = norma_document_add_object(self.document, _insertType, point, NULL);
    if (index < 0) {
        [self.delegate canvasStatus:self message:@"No se pudo colocar el objeto."];
        return;
    }
    _selectedElement = index;
    _selectedNode = -1;
    const norma_element *element = &self.document->elements[index];
    [self.delegate canvasDidChange:self];
    char caption[64];
    norma_format_measure_cm(element->w, self.document->unit, caption, sizeof(caption));
    [self.delegate canvasStatus:self
                        message:[NSString stringWithFormat:@"Colocado: %s de ancho. Esc termina de insertar.",
                                                           caption]];
    [self setNeedsDisplay:YES];
}

- (NSString *)toggleSelectedExit
{
    if (self.document == NULL || _selectedElement < 0 || _selectedElement >= (NSInteger) self.document->count) {
        return nil;
    }
    const size_t element = (size_t) _selectedElement;
    if (!norma_object_is_door(self.document->elements[element].type)) {
        return @"Solo una puerta puede marcarse como salida de emergencia.";
    }
    norma_document_begin_edit(self.document);
    const int wanted = self.document->elements[element].is_exit ? 0 : 1;
    if (!norma_document_set_exit(self.document, element, wanted)) {
        return @"La puerta ya estaba así.";
    }
    [self.delegate canvasDidChange:self];
    [self setNeedsDisplay:YES];
    return wanted ? @"Puerta marcada como salida de emergencia: el auditor ya cuenta el recorrido hasta ella."
                  : @"Puerta desmarcada como salida.";
}

- (NSString *)hintForTool
{
    switch (_tool) {
    case NormiaToolWall:
        return @"Muro: un clic por vértice; el tramo sigue al cursor. Clic en el primer nodo cierra el recinto; "
                "Enter o doble clic termina, Esc vuelve a seleccionar.";
    case NormiaToolPen:
        return @"Pluma: un clic por nodo. Enter o doble clic cierra el trazo; Retroceso quita el último nodo.";
    case NormiaToolArc:
        return @"Arco: tercer clic para cerrar la curva por el punto de paso.";
    case NormiaToolRoute:
        return @"Ruta: un clic por nodo. Enter o doble clic cierra el trazo; el auditor dirá si llega a una salida.";
    case NormiaToolDimension:
        return @"Cota: segundo clic para medir el tramo.";
    case NormiaToolInsert: {
        const norma_object_spec *spec = norma_object_find(_insertType);
        if (spec == NULL) {
            return @"";
        }
        return [NSString stringWithFormat:@"%s: un clic en el plano para colocar. Esc termina.", spec->name];
    }
    case NormiaToolPan:
        return @"Mano: arrastra el lienzo. La rueda acerca y aleja; Esc vuelve a seleccionar.";
    case NormiaToolLine:
        return @"Línea: segundo clic para cerrarla.";
    case NormiaToolRect:
        return @"Rectángulo: segundo clic en la esquina opuesta.";
    case NormiaToolEllipse:
        return @"Elipse: segundo clic define la caja que la contiene.";
    case NormiaToolText:
        return @"Texto: un clic en el plano y se escribe en el inspector.";
    case NormiaToolRoad:
        return @"Vía: segundo clic en la esquina opuesta. Se guarda como zona, no como trazo.";
    case NormiaToolSidewalk:
        return @"Andén: segundo clic en la esquina opuesta.";
    case NormiaToolCrosswalk:
        return @"Paso peatonal: segundo clic en la esquina opuesta.";
    case NormiaToolParking:
        return @"Parqueadero: segundo clic en la esquina opuesta.";
    case NormiaToolProperty:
        return @"Lindero: segundo clic para cerrar el tramo discontinuo.";
    case NormiaToolPipe:
        return @"Tubería: segundo clic para cerrar el tramo.";
    case NormiaToolConduit:
        return @"Canaleta: segundo clic para cerrar el tramo.";
    case NormiaToolSelect:
    default:
        return @"";
    }
}

- (void)mouseDragged:(NSEvent *)event
{
    const norma_point point = [self planPointForEvent:event];
    if ([self.delegate respondsToSelector:@selector(canvas:didTrackPlanPoint:)]) {
        [self.delegate canvas:self didTrackPlanPoint:point];
    }

    if (_guideDrag >= 0 && self.document->guide.present) {
        if (!_editBegun) {
            norma_document_begin_edit(self.document);
            _editBegun = YES;
        }
        if (_guideDrag == 4) {
            norma_document_set_guide_box(self.document,
                                         round(_guideStartX + (point.x - _guideAnchor.x)),
                                         round(_guideStartY + (point.y - _guideAnchor.y)),
                                         _guideStartW, _guideStartH);
        } else {
            double width = fabs(point.x - _guideAnchor.x);
            double height = fabs(point.y - _guideAnchor.y);
            if (width < 20.0) { width = 20.0; }
            if (height < 20.0) { height = 20.0; }
            norma_document_set_guide_box(self.document, round(fmin(_guideAnchor.x, point.x)),
                                         round(fmin(_guideAnchor.y, point.y)), round(width), round(height));
        }
        [self.delegate canvasDidChange:self];
        [self setNeedsDisplay:YES];
        return;
    }

    if (_panning) {
        const NSPoint local = [self convertPoint:event.locationInWindow fromView:nil];
        _panX = _panStartX + ((double) local.x - (double) _panStart.x);
        _panY = _panStartY + ((double) local.y - (double) _panStart.y);
        [self setNeedsDisplay:YES];
        return;
    }

    /* Escalado por esquina: la esquina opuesta queda quieta. */
    if (_resizeCorner >= 0 && _selectedElement >= 0
        && (size_t) _selectedElement < self.document->count) {
        if (!_editBegun) {
            norma_document_begin_edit(self.document);
            _editBegun = YES;
        }
        double width = fabs(point.x - _resizeAnchor.x);
        double height = fabs(point.y - _resizeAnchor.y);
        if (width < 5.0) { width = 5.0; }
        if (height < 5.0) { height = 5.0; }
        norma_document_set_box(self.document, (size_t) _selectedElement,
                               round(fmin(_resizeAnchor.x, point.x)), round(fmin(_resizeAnchor.y, point.y)),
                               round(width), round(height));
        [self.delegate canvasDidChange:self];
        [self setNeedsDisplay:YES];
        return;
    }

    if (self.document == NULL || _selectedElement < 0 || !_draggingNode) {
        return;
    }
    if (!_editBegun) {
        norma_document_begin_edit(self.document);
        _editBegun = YES;
    }
    const size_t element = (size_t) _selectedElement;
    if (element >= self.document->count) {
        return;
    }
    norma_element *item = &self.document->elements[element];
    if (_selectedNode >= 0 && (size_t) _selectedNode < item->node_count) {
        norma_document_move_node(self.document, element, (size_t) _selectedNode, point.x, point.y);
    } else if (item->node_count >= 2) {
        const double dx = point.x - _dragOrigin.x;
        const double dy = point.y - _dragOrigin.y;
        for (size_t node = 0; node < item->node_count; node += 1) {
            norma_document_move_node(self.document, element, node,
                                    item->nodes[node].x + dx, item->nodes[node].y + dy);
        }
        _dragOrigin = point;
    } else {
        /* Caja: se mueve por su esquina, redondeando al centímetro para que el
           plano guarde medidas limpias. */
        norma_document_move_object(self.document, element, round(point.x - _dragOffsetX),
                                   round(point.y - _dragOffsetY));
    }
    [self.delegate canvasDidChange:self];
    [self setNeedsDisplay:YES];
}

- (void)mouseUp:(NSEvent *)event
{
    (void) event;
    _draggingNode = NO;
    _editBegun = NO;
    _panning = NO;
    _resizeCorner = -1;
    _guideDrag = -1;
    [self announceSelection];
    [self setNeedsDisplay:YES];
}

- (void)mouseMoved:(NSEvent *)event
{
    _cursorPoint = [self planPointForEvent:event];
    _hasCursor = YES;
    if ([self.delegate respondsToSelector:@selector(canvas:didTrackPlanPoint:)]) {
        [self.delegate canvas:self didTrackPlanPoint:_cursorPoint];
    }
    if (_draftCount > 0) {
        [self setNeedsDisplay:YES];
    }
}

- (void)viewDidMoveToWindow
{
    [super viewDidMoveToWindow];
    // Sin esto, AppKit no entrega `mouseMoved:` y el borrador no se previsualiza.
    self.window.acceptsMouseMovedEvents = YES;
}

- (void)updateTrackingAreas
{
    [super updateTrackingAreas];
    for (NSTrackingArea *area in self.trackingAreas) {
        [self removeTrackingArea:area];
    }
    NSTrackingArea *area = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                        options:(NSTrackingMouseMoved | NSTrackingActiveInKeyWindow
                                                                 | NSTrackingInVisibleRect)
                                                          owner:self
                                                       userInfo:nil];
    [self addTrackingArea:area];
}

- (void)keyDown:(NSEvent *)event
{
    NSString *characters = [event.charactersIgnoringModifiers lowercaseString];
    if (![self selectToolWithKey:characters]) {
        if (event.keyCode == 53) { // Esc
            _tool = NormiaToolSelect;
            _draftCount = 0;
            _hasCursor = NO;
            _insertType[0] = '\0';
            [self.delegate canvasStatus:self message:@""];
            [self setNeedsDisplay:YES];
            return;
        } else if (event.keyCode == 36 || event.keyCode == 76) { // Return y Enter
            if ((_tool == NormiaToolPen || _tool == NormiaToolRoute || _tool == NormiaToolWall)
                && _draftCount >= 2) {
                [self commitDraft];
            }
            return;
        } else if (event.keyCode >= 123 && event.keyCode <= 126) { // Flechas
            const double step = (event.modifierFlags & NSEventModifierFlagShift) != 0 ? 10.0 : 1.0;
            double dx = 0.0;
            double dy = 0.0;
            if (event.keyCode == 123) { dx = -step; }
            if (event.keyCode == 124) { dx = step; }
            if (event.keyCode == 125) { dy = step; }
            if (event.keyCode == 126) { dy = -step; }
            [self nudgeSelectionByX:dx y:dy];
            return;
        } else if (event.keyCode == 51 || event.keyCode == 117) { // Retroceso y Suprimir
            if ((_tool == NormiaToolPen || _tool == NormiaToolRoute || _tool == NormiaToolWall)
                && _draftCount > 0) {
                _draftCount -= 1;
                [self setNeedsDisplay:YES];
                return;
            }
            [self.delegate canvasStatus:self message:[self deleteSelection]];
            return;
        } else {
            [super keyDown:event];
            return;
        }
    }
    /* La pista de la herramienta ya la dejó `selectToolWithKey:`; aquí solo se
       repinta (así el aviso de la rejilla no se borra). */
    [self setNeedsDisplay:YES];
}

- (BOOL)selectToolWithKey:(NSString *)key
{
    NSString *caracter = [key lowercaseString];
    NormiaTool tool = NormiaToolSelect;
    if ([caracter isEqualToString:@"m"]) {
        tool = NormiaToolWall;
    } else if ([caracter isEqualToString:@"p"]) {
        tool = NormiaToolPen;
    } else if ([caracter isEqualToString:@"a"]) {
        tool = NormiaToolArc;
    } else if ([caracter isEqualToString:@"d"]) {
        tool = NormiaToolDimension;
    } else if ([caracter isEqualToString:@"r"]) {
        tool = NormiaToolRoute;
    } else if ([caracter isEqualToString:@"v"]) {
        tool = NormiaToolSelect;
    } else if ([caracter isEqualToString:@"h"]) {
        tool = NormiaToolPan;
    } else if ([caracter isEqualToString:@"l"]) {
        tool = NormiaToolLine;
    } else if ([caracter isEqualToString:@"b"]) {
        tool = NormiaToolRect;
    } else if ([caracter isEqualToString:@"o"]) {
        tool = NormiaToolEllipse;
    } else if ([caracter isEqualToString:@"t"]) {
        tool = NormiaToolText;
    } else if ([caracter isEqualToString:@"i"]) {
        tool = NormiaToolInsert;
    } else if ([caracter isEqualToString:@"e"]) {
        tool = NormiaToolRoad;
    } else if ([caracter isEqualToString:@"n"]) {
        tool = NormiaToolSidewalk;
    } else if ([caracter isEqualToString:@"c"]) {
        tool = NormiaToolCrosswalk;
    } else if ([caracter isEqualToString:@"k"]) {
        tool = NormiaToolParking;
    } else if ([caracter isEqualToString:@"j"]) {
        tool = NormiaToolProperty;
    } else if ([caracter isEqualToString:@"q"]) {
        tool = NormiaToolPipe;
    } else if ([caracter isEqualToString:@"w"]) {
        tool = NormiaToolConduit;
    } else if ([caracter isEqualToString:@"g"]) {
        /* Rejilla: es una ayuda de dibujo, no una herramienta. */
        self.showsGrid = !self.showsGrid;
        [self.delegate canvasStatus:self
                            message:self.showsGrid ? @"Rejilla de referencia visible" : @"Rejilla oculta"];
        return YES;
    } else {
        return NO;
    }
    _tool = tool;
    _draftCount = 0;
    _hasCursor = NO;
    [self.delegate canvasStatus:self message:[self hintForTool]];
    if ([self.delegate respondsToSelector:@selector(canvas:didChooseTool:)]) {
        [self.delegate canvas:self didChooseTool:tool];
    }
    [self setNeedsDisplay:YES];
    return YES;
}

/* ------------------------- revisión sobre el plano ------------------------ */

/** Puntos de los hallazgos: se pintan como anillos rojos hasta la próxima revisión. */
- (void)setFindingPoints:(const norma_point *)points count:(size_t)count
{
    _findingCount = 0;
    if (points == NULL) {
        return;
    }
    for (size_t index = 0; index < count && _findingCount < 64; index += 1) {
        _findingPoints[_findingCount] = points[index];
        _findingCount += 1;
    }
    [self setNeedsDisplay:YES];
}

- (size_t)findingCount
{
    return _findingCount;
}

/**
 * Lleva el plano a un punto: lo deja en el centro y, si la vista está muy
 * alejada, la acerca lo suficiente para leer el plano alrededor.
 */
- (void)focusOnPoint:(norma_point)point
{
    [self ensureView];
    const double zoom = _zoom < 0.8 ? 1.2 : _zoom;
    const double width = (double) NSWidth(self.bounds);
    const double height = (double) NSHeight(self.bounds);
    _zoom = zoom;
    _panX = width / 2.0 - point.x * zoom;
    _panY = height / 2.0 - point.y * zoom;
    [self setNeedsDisplay:YES];
}

/* --------------------------- acciones del inspector ---------------------- */

- (NSString *)deleteSelection
{
    if (self.document == NULL || _selectedElement < 0
        || (size_t) _selectedElement >= self.document->count) {
        return @"No hay nada seleccionado.";
    }
    norma_document_begin_edit(self.document);
    norma_document_remove(self.document, (size_t) _selectedElement);
    _selectedElement = -1;
    _selectedNode = -1;
    _draftCount = 0;
    [self.delegate canvasDidChange:self];
    [self announceSelection];
    [self setNeedsDisplay:YES];
    return @"Elemento borrado. ⌘Z lo devuelve.";
}

- (NSString *)addTextAtPoint:(norma_point)point
{
    if (self.document == NULL) {
        return @"No hay plano abierto.";
    }
    norma_document_begin_edit(self.document);
    const long index = norma_document_add_text(self.document, point, 180.0, 32.0, "Texto", NULL);
    if (index < 0) {
        return @"No se pudo añadir el texto.";
    }
    _selectedElement = index;
    _selectedNode = -1;
    [self.delegate canvasDidChange:self];
    [self announceSelection];
    [self setNeedsDisplay:YES];
    return @"Texto colocado: escribe su contenido en el inspector (⌘L lleva el cursor al rótulo).";
}

- (NSString *)duplicateSelection
{
    if (self.document == NULL || _selectedElement < 0
        || (size_t) _selectedElement >= self.document->count) {
        return @"Selecciona un elemento para duplicarlo.";
    }
    norma_document_begin_edit(self.document);
    const long index = norma_document_duplicate(self.document, (size_t) _selectedElement);
    if (index < 0) {
        return @"No se pudo duplicar el elemento.";
    }
    _selectedElement = index;
    _selectedNode = -1;
    [self.delegate canvasDidChange:self];
    [self announceSelection];
    [self setNeedsDisplay:YES];
    return @"Duplicado 20 cm a la derecha, ya seleccionado.";
}

- (NSString *)rotateSelection
{
    if (self.document == NULL || _selectedElement < 0
        || (size_t) _selectedElement >= self.document->count) {
        return @"Selecciona un elemento para girarlo.";
    }
    norma_document_begin_edit(self.document);
    const size_t index = (size_t) _selectedElement;
    const norma_element *element = &self.document->elements[index];
    if (element->node_count < 2) {
        if (!norma_document_set_rotation(self.document, index, element->rotation + 90.0)) {
            return @"El elemento no gira.";
        }
    } else {
        /* Un trazo gira nodo a nodo alrededor del centro de su caja. */
        double minX = element->nodes[0].x;
        double maxX = minX;
        double minY = element->nodes[0].y;
        double maxY = minY;
        for (size_t node = 1; node < element->node_count; node += 1) {
            const norma_point point = element->nodes[node];
            if (point.x < minX) { minX = point.x; }
            if (point.x > maxX) { maxX = point.x; }
            if (point.y < minY) { minY = point.y; }
            if (point.y > maxY) { maxY = point.y; }
        }
        const double cx = (minX + maxX) / 2.0;
        const double cy = (minY + maxY) / 2.0;
        for (size_t node = 0; node < element->node_count; node += 1) {
            const norma_point point = element->nodes[node];
            const double dx = point.x - cx;
            const double dy = point.y - cy;
            norma_document_move_node(self.document, index, node,
                                     round(cx - dy), round(cy + dx));
        }
    }
    [self.delegate canvasDidChange:self];
    [self setNeedsDisplay:YES];
    return @"Girado 90°.";
}

/** Flechas del teclado: un centímetro, o diez con Mayúsculas. */
- (void)nudgeSelectionByX:(double)dx y:(double)dy
{
    if (self.document == NULL || _selectedElement < 0
        || (size_t) _selectedElement >= self.document->count) {
        return;
    }
    norma_document_begin_edit(self.document);
    const size_t index = (size_t) _selectedElement;
    norma_element *element = &self.document->elements[index];
    if (element->node_count >= 2) {
        for (size_t node = 0; node < element->node_count; node += 1) {
            norma_document_move_node(self.document, index, node,
                                     element->nodes[node].x + dx, element->nodes[node].y + dy);
        }
    } else {
        norma_document_move_object(self.document, index, element->x + dx, element->y + dy);
    }
    [self.delegate canvasDidChange:self];
    [self.delegate canvasStatus:self
                        message:[NSString stringWithFormat:@"Movido %.0f cm · %.0f", dx, dy]];
    [self setNeedsDisplay:YES];
}

- (double)zoomPercent
{
    /* Antes del primer dibujo la vista no tiene encuadre: se informa el 100 %
       en vez de un cero que no significa nada. */
    return (_zoom > 0.0 ? _zoom : 1.0) * 100.0;
}

- (void)zoomToPercent:(double)percent
{
    if (self.document == NULL || percent <= 0.0) {
        return;
    }
    [self ensureView];
    const NSPoint center = NSMakePoint(NSWidth(self.bounds) / 2.0, NSHeight(self.bounds) / 2.0);
    const double planX = ((double) center.x - _panX) / _zoom;
    const double planY = ((double) center.y - _panY) / _zoom;
    double zoom = percent / 100.0;
    [self clampZoom:&zoom];
    _zoom = zoom;
    _panX = (double) center.x - planX * zoom;
    _panY = (double) center.y - planY * zoom;
    [self setNeedsDisplay:YES];
}

- (void)focusSelection
{
    if (self.document == NULL || _selectedElement < 0
        || (size_t) _selectedElement >= self.document->count) {
        return;
    }
    const norma_element *element = &self.document->elements[_selectedElement];
    if (element->node_count >= 2) {
        [self focusOnPoint:element->nodes[0]];
    } else {
        [self focusOnPoint:((norma_point) {element->x + element->w / 2.0, element->y + element->h / 2.0})];
    }
}

- (void)cancelDraft
{
    _draftCount = 0;
    _hasCursor = NO;
    _insertType[0] = '\0';
    _tool = NormiaToolSelect;
    [self.delegate canvasStatus:self message:@""];
    [self setNeedsDisplay:YES];
}

@end
