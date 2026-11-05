/*
 * Normia nativo · lienzo.
 *
 * Herramientas (etapa N2):
 *   · selección: clic elige el elemento más cercano; arrastrar mueve un nodo o
 *     el trazo completo;
 *   · M · muro por tramos de dos clics;
 *   · P · pluma de nodos: un clic por nodo, Enter o doble clic cierra;
 *   · A · arco de tres puntos: inicio, punto de paso y fin;
 *   · D · cota entre dos puntos, rotulada con la cifra y la unidad;
 *   · R · ruta de evacuación: un clic por nodo, Enter o doble clic cierra; el
 *     auditor la mide después y dice si llega a una salida;
 *   · Esc cancela la herramienta y Retroceso borra lo seleccionado.
 *
 * La geometría, las medidas y el formato de las cifras viven en el núcleo en C:
 * aquí solo se pintan y se editan.
 */
#import "CanvasView.h"

#include <math.h>
#include <string.h>

#include "normia/format.h"

static const CGFloat kToleranceScreen = 8.0;
static const int kMaxDraftNodes = 64;

typedef NS_ENUM(NSInteger, CanvasTool) {
    CanvasToolSelect = 0,
    CanvasToolWall,
    CanvasToolPen,
    CanvasToolArc,
    CanvasToolDimension,
    CanvasToolRoute,
};

@interface CanvasView ()
@property(nonatomic) CanvasTool tool;
@property(nonatomic) BOOL draggingNode;
@property(nonatomic) norma_point dragOrigin;
@property(nonatomic) NSInteger selectedElement;
@property(nonatomic) norma_point cursorPoint;
- (void)ensureView;
- (void)clampZoom:(double *)zoom;
- (void)zoomBy:(double)factor atPoint:(NSPoint)anchor;
- (void)panByDeltaX:(CGFloat)dx deltaY:(CGFloat)dy;
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
}

- (instancetype)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self != nil) {
        _selectedNode = -1;
        _selectedElement = -1;
        _tool = CanvasToolSelect;
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

- (BOOL)isFlipped
{
    // Coordenadas del plano: origen arriba a la izquierda, como en el editor.
    return YES;
}

- (void)documentDidLoad
{
    _selectedElement = -1;
    _selectedNode = -1;
    _tool = CanvasToolSelect;
    _draftCount = 0;
    _hasCursor = NO;
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

- (void)drawRect:(NSRect)dirtyRect
{
    (void) dirtyRect;
    if (self.printing) {
        [[NSColor whiteColor] setFill];
    } else {
        [[NSColor colorWithCalibratedWhite:0.16 alpha:1.0] setFill];
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
    if (!self.printing) {
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
    CGContextSetRGBFillColor(context, 0.95, 0.45, 0.10, 1.0);
    for (int index = 0; index < _draftCount; index += 1) {
        CGContextFillRect(context, CGRectMake(_draft[index].x - handle, _draft[index].y - handle,
                                              handle * 2.0, handle * 2.0));
    }
    if (_draftCount > 0 && _hasCursor) {
        CGContextSetRGBStrokeColor(context, 0.95, 0.45, 0.10, 0.9);
        CGContextSetLineWidth(context, 1.0 / zoom);
        CGContextBeginPath(context);
        CGContextMoveToPoint(context, _draft[_draftCount - 1].x, _draft[_draftCount - 1].y);
        CGContextAddLineToPoint(context, _cursorPoint.x, _cursorPoint.y);
        CGContextStrokePath(context);
    }

    CGContextRestoreGState(context);

    // Las cifras se dibujan en coordenadas de la ventana: si se hicieran dentro
    // de la transformación, el texto crecería con el zoom.
    for (size_t index = 0; index < self.document->count; index += 1) {
        const norma_element *element = &self.document->elements[index];
        if (element->node_count < 2) {
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
- (void)commitDraft
{
    if (self.document == NULL || _draftCount < 2) {
        _draftCount = 0;
        return;
    }
    norma_document_begin_edit(self.document);
    long index = -1;
    if (_tool == CanvasToolDimension) {
        index = norma_document_add_dimension(self.document, _draft[0], _draft[1], NULL);

        char caption[64];
        norma_format_measure_cm(norma_distance(_draft[0], _draft[1]), self.document->unit, caption, sizeof(caption));
        [self.delegate canvasStatus:self message:[NSString stringWithFormat:@"Cota de %s", caption]];
    } else if (_tool == CanvasToolArc) {
        norma_arc arc = norma_arc_from_points(_draft[0], _draft[1], _draft[2]);
        if (arc.valid) {
            const norma_point nodes[2] = {_draft[0], _draft[2]};
            const norma_arc arcs[1] = {arc};
            index = norma_document_add_wall(self.document, nodes, 2, arcs, NULL);
        } else {
            [self.delegate canvasStatus:self message:@"El arco no es válido: los tres puntos están en línea." ];
        }
    } else if (_tool == CanvasToolRoute) {
        index = norma_document_add_route(self.document, _draft, (size_t) _draftCount, NULL, NULL);
    } else {
        index = norma_document_add_wall(self.document, _draft, (size_t) _draftCount, NULL, NULL);
    }
    if (index >= 0) {
        _selectedElement = index;
        _selectedNode = -1;
        [self.delegate canvasDidChange:self];
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

    if (_tool == CanvasToolDimension || _tool == CanvasToolArc || _tool == CanvasToolWall) {
        if (_draftCount < kMaxDraftNodes) {
            _draft[_draftCount] = point;
            _draftCount += 1;
        }
        if ((_tool == CanvasToolDimension && _draftCount == 2)
            || (_tool == CanvasToolArc && _draftCount == 3)
            || (_tool == CanvasToolWall && _draftCount == 2)) {
            [self commitDraft];
        } else {
            [self.delegate canvasStatus:self message:[self hintForTool]];
            [self setNeedsDisplay:YES];
        }
        return;
    }

    if (_tool == CanvasToolPen || _tool == CanvasToolRoute) {
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
    const long hit = norma_document_hit_test(self.document, point, planTolerance);
    _selectedElement = hit;
    _selectedNode = -1;
    _draggingNode = NO;
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
    }
    [self setNeedsDisplay:YES];
}

- (NSString *)hintForTool
{
    switch (_tool) {
    case CanvasToolWall:
        return @"Muro: segundo clic para cerrar el tramo. Esc termina.";
    case CanvasToolPen:
        return @"Pluma: un clic por nodo. Enter o doble clic cierra el trazo; Retroceso quita el último nodo.";
    case CanvasToolArc:
        return @"Arco: tercer clic para cerrar la curva por el punto de paso.";
    case CanvasToolRoute:
        return @"Ruta: un clic por nodo. Enter o doble clic cierra el trazo; el auditor dirá si llega a una salida.";
    case CanvasToolDimension:
        return @"Cota: segundo clic para medir el tramo.";
    case CanvasToolSelect:
    default:
        return @"";
    }
}

- (void)mouseDragged:(NSEvent *)event
{
    if (self.document == NULL || _selectedElement < 0 || !_draggingNode) {
        return;
    }
    const norma_point point = [self planPointForEvent:event];
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
        item->x = point.x;
        item->y = point.y;
        self.document->dirty = 1;
    }
    [self.delegate canvasDidChange:self];
    [self setNeedsDisplay:YES];
}

- (void)mouseUp:(NSEvent *)event
{
    (void) event;
    _draggingNode = NO;
    _editBegun = NO;
}

- (void)mouseMoved:(NSEvent *)event
{
    if (_draftCount == 0) {
        return;
    }
    _cursorPoint = [self planPointForEvent:event];
    _hasCursor = YES;
    [self setNeedsDisplay:YES];
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
    const NSString *characters = event.charactersIgnoringModifiers.lowercaseString;
    if (![self selectToolWithKey:characters]) {
        if (event.keyCode == 53) { // Esc
            _tool = CanvasToolSelect;
            _draftCount = 0;
            _hasCursor = NO;
            [self.delegate canvasStatus:self message:@""];
            [self setNeedsDisplay:YES];
            return;
        } else if (event.keyCode == 36 || event.keyCode == 76) { // Return y Enter
            if ((_tool == CanvasToolPen || _tool == CanvasToolRoute) && _draftCount >= 2) {
                [self commitDraft];
            }
            return;
        } else if (event.keyCode == 51 || event.keyCode == 117) { // Retroceso y Suprimir
            if ((_tool == CanvasToolPen || _tool == CanvasToolRoute) && _draftCount > 0) {
                _draftCount -= 1;
                [self setNeedsDisplay:YES];
                return;
            }
            if (_selectedElement >= 0) {
                norma_document_begin_edit(self.document);
                norma_document_remove(self.document, (size_t) _selectedElement);
                _selectedElement = -1;
                _selectedNode = -1;
                [self.delegate canvasDidChange:self];
                [self setNeedsDisplay:YES];
            }
            return;
        } else {
            [super keyDown:event];
            return;
        }
    }
    [self.delegate canvasStatus:self message:[self hintForTool]];
    [self setNeedsDisplay:YES];
}

- (BOOL)selectToolWithKey:(NSString *)key
{
    NSString *caracter = [key lowercaseString];
    CanvasTool tool = CanvasToolSelect;
    if ([caracter isEqualToString:@"m"]) {
        tool = CanvasToolWall;
    } else if ([caracter isEqualToString:@"p"]) {
        tool = CanvasToolPen;
    } else if ([caracter isEqualToString:@"a"]) {
        tool = CanvasToolArc;
    } else if ([caracter isEqualToString:@"d"]) {
        tool = CanvasToolDimension;
    } else if ([caracter isEqualToString:@"r"]) {
        tool = CanvasToolRoute;
    } else if ([caracter isEqualToString:@"v"]) {
        tool = CanvasToolSelect;
    } else {
        return NO;
    }
    _tool = tool;
    _draftCount = 0;
    _hasCursor = NO;
    [self.delegate canvasStatus:self message:[self hintForTool]];
    [self setNeedsDisplay:YES];
    return YES;
}

- (void)cancelDraft
{
    _draftCount = 0;
    _hasCursor = NO;
    _tool = CanvasToolSelect;
    [self.delegate canvasStatus:self message:@""];
    [self setNeedsDisplay:YES];
}

@end
