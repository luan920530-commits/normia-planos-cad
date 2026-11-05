/*
 * Normia nativo · lienzo.
 *
 * Dibujo con Core Graphics y edición con el ratón:
 *   · clic elige el elemento más cercano dentro de la tolerancia;
 *   · arrastrar mueve un nodo (o el equipo completo);
 *   · la tecla M arma la herramienta de muro: dos clics por tramo, Esc termina;
 *   · Retroceso borra lo seleccionado, ⌘Z deshace (lo atiende el menú).
 *
 * La geometría y las medidas viven en el núcleo en C: aquí no se calcula
 * ninguna cifra, solo se pintan las que el documento ya tiene.
 */
#import "CanvasView.h"

#include <math.h>

static const CGFloat kToleranceScreen = 8.0;

@interface CanvasView ()
@property(nonatomic) BOOL wallTool;
@property(nonatomic) BOOL draggingNode;
@property(nonatomic) BOOL hasPending;
@property(nonatomic) norma_point pending;
@property(nonatomic) NSInteger selectedElement;
/** Punto donde empezó el arrastre, para mover el elemento completo. */
@property(nonatomic) norma_point dragOrigin;
@end

@implementation CanvasView

- (instancetype)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self != nil) {
        _selectedNode = -1;
        _selectedElement = -1;
        self.wantsLayer = YES;
        // El lienzo responde al teclado sin que haya que pulsar antes.
        self.acceptsFirstResponder = YES;
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
    _wallTool = NO;
    _hasPending = NO;
    [self zoomToFit];
    [self setNeedsDisplay:YES];
}

/* -------------------------------- vista ---------------------------------- */

- (void)zoomToFit
{
    if (self.document == NULL || self.document->width <= 0.0 || self.document->height <= 0.0) {
        return;
    }
    [self setNeedsDisplay:YES];
}

/** Escala que hace que el lienzo quepa en la ventana, con margen. */
- (CGFloat)scale
{
    if (self.document == NULL) {
        return 1.0;
    }
    const CGFloat availableWidth = NSWidth(self.bounds) - 80.0;
    const CGFloat availableHeight = NSHeight(self.bounds) - 80.0;
    if (availableWidth <= 0.0 || availableHeight <= 0.0) {
        return 1.0;
    }
    const CGFloat width = (CGFloat) self.document->width;
    const CGFloat height = (CGFloat) self.document->height;
    const CGFloat factor = fmin(availableWidth / width, availableHeight / height);
    return factor < 0.05 ? 0.05 : factor;
}

/** Punto del plano a partir de un punto de la ventana. */
- (norma_point)planPointForEvent:(NSEvent *)event
{
    const NSPoint local = [self convertPoint:event.locationInWindow fromView:nil];
    const CGFloat scale = [self scale];
    const CGFloat offsetX = (NSWidth(self.bounds) - (CGFloat) self.document->width * scale) / 2.0;
    const CGFloat offsetY = (NSHeight(self.bounds) - (CGFloat) self.document->height * scale) / 2.0;
    norma_point point = {((double) local.x - (double) offsetX) / (double) scale,
                         ((double) local.y - (double) offsetY) / (double) scale};
    return point;
}

- (CGAffineTransform)planTransform
{
    const CGFloat scale = [self scale];
    const CGFloat offsetX = (NSWidth(self.bounds) - (CGFloat) self.document->width * scale) / 2.0;
    const CGFloat offsetY = (NSHeight(self.bounds) - (CGFloat) self.document->height * scale) / 2.0;
    CGAffineTransform transform = CGAffineTransformMakeTranslation(offsetX, offsetY);
    return CGAffineTransformScale(transform, scale, scale);
}

/* -------------------------------- dibujo --------------------------------- */

- (void)drawRect:(NSRect)dirtyRect
{
    (void) dirtyRect;
    [[NSColor colorWithCalibratedWhite:0.16 alpha:1.0] setFill];
    NSRectFill(self.bounds);
    if (self.document == NULL) {
        return;
    }
    CGContextRef context = NSGraphicsContext.currentContext.CGContext;
    CGContextSaveGState(context);
    CGContextConcatCTM(context, [self planTransform]);

    // Hoja del plano.
    CGContextSetRGBFillColor(context, 1.0, 1.0, 1.0, 1.0);
    CGContextFillRect(context, CGRectMake(0, 0, self.document->width, self.document->height));
    CGContextSetRGBStrokeColor(context, 0.55, 0.58, 0.62, 1.0);
    CGContextSetLineWidth(context, 1.0 / [self scale]);
    CGContextStrokeRect(context, CGRectMake(0, 0, self.document->width, self.document->height));

    // Rejilla de 20 cm, como el editor.
    const double grid = 20.0;
    CGContextSetRGBStrokeColor(context, 0.88, 0.90, 0.93, 1.0);
    for (double x = grid; x < self.document->width; x += grid) {
        CGContextMoveToPoint(context, x, 0);
        CGContextAddLineToPoint(context, x, self.document->height);
    }
    for (double y = grid; y < self.document->height; y += grid) {
        CGContextMoveToPoint(context, 0, y);
        CGContextAddLineToPoint(context, self.document->width, y);
    }
    CGContextStrokePath(context);

    for (size_t index = 0; index < self.document->count; index += 1) {
        const norma_element *element = &self.document->elements[index];
        const BOOL selected = (NSInteger) index == _selectedElement;
        if (selected) {
            CGContextSetRGBStrokeColor(context, 0.22, 0.52, 1.0, 1.0);
            CGContextSetLineWidth(context, 3.0 / [self scale]);
        } else if (strcmp(element->type, "wall") == 0) {
            CGContextSetRGBStrokeColor(context, 0.12, 0.15, 0.20, 1.0);
            CGContextSetLineWidth(context, 1.6 / [self scale]);
        } else {
            CGContextSetRGBStrokeColor(context, 0.85, 0.22, 0.24, 1.0);
            CGContextSetLineWidth(context, 1.4 / [self scale]);
        }

        if (element->node_count >= 2) {
            CGContextBeginPath(context);
            CGContextMoveToPoint(context, element->nodes[0].x, element->nodes[0].y);
            for (size_t node = 0; node + 1 < element->node_count; node += 1) {
                const norma_point next = element->nodes[node + 1];
                const norma_arc *arc = &element->arcs[node];
                if (arc->valid) {
                    // El arco va por el punto de paso: se aplana en tramos
                    // cortos para que Core Graphics lo dibuje igual que el SVG.
                    const int steps = 24;
                    for (int step = 1; step <= steps; step += 1) {
                        const norma_point point = norma_arc_point_at(arc, (double) step / (double) steps);
                        CGContextAddLineToPoint(context, point.x, point.y);
                    }
                } else {
                    CGContextAddLineToPoint(context, next.x, next.y);
                }
            }
            CGContextStrokePath(context);
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

    // Nodo seleccionado y punto pendiente del muro.
    const CGFloat handle = 4.0 / [self scale];
    if (_selectedElement >= 0 && _selectedElement < (NSInteger) self.document->count && _selectedNode >= 0) {
        const norma_element *element = &self.document->elements[_selectedElement];
        if ((size_t) _selectedNode < element->node_count) {
            const norma_point node = element->nodes[_selectedNode];
            CGContextSetRGBFillColor(context, 0.22, 0.52, 1.0, 1.0);
            CGContextFillRect(context, CGRectMake(node.x - handle, node.y - handle, handle * 2.0, handle * 2.0));
        }
    }
    if (_hasPending) {
        CGContextSetRGBFillColor(context, 0.95, 0.45, 0.10, 1.0);
        CGContextFillRect(context, CGRectMake(_pending.x - handle, _pending.y - handle, handle * 2.0, handle * 2.0));
    }

    CGContextRestoreGState(context);
}

/* -------------------------------- edición -------------------------------- */

- (void)mouseDown:(NSEvent *)event
{
    if (self.document == NULL) {
        return;
    }
    const norma_point point = [self planPointForEvent:event];
    if (_wallTool) {
        if (!_hasPending) {
            _pending = point;
            _hasPending = YES;
            [self setNeedsDisplay:YES];
            [self.delegate canvasStatus:self message:@"Segundo clic para cerrar el tramo. Esc termina."];
            return;
        }
        const norma_point nodes[2] = {_pending, point};
        norma_document_begin_edit(self.document);
        const long index = norma_document_add_wall(self.document, nodes, 2, NULL, NULL);
        _pending = point;
        if (index >= 0) {
            _selectedElement = index;
            _selectedNode = 1;
        }
        [self.delegate canvasDidChange:self];
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
        // Elegir el nodo más cercano si el clic cayó sobre él.
        for (size_t node = 0; node < element->node_count; node += 1) {
            const double distance = norma_distance(point, element->nodes[node]);
            if (distance <= planTolerance) {
                _selectedNode = (NSInteger) node;
                _draggingNode = YES;
                _dragOrigin = point;
                break;
            }
        }
        if (!_draggingNode) {
            norma_document_begin_edit(self.document);
            _draggingNode = YES;
            _dragOrigin = point;
        }
    }
    [self setNeedsDisplay:YES];
}

- (void)mouseDragged:(NSEvent *)event
{
    if (self.document == NULL || _selectedElement < 0 || !_draggingNode) {
        return;
    }
    const norma_point point = [self planPointForEvent:event];
    const size_t element = (size_t) _selectedElement;
    if (element >= self.document->count) {
        return;
    }
    norma_element *item = &self.document->elements[element];
    if (_selectedNode >= 0 && (size_t) _selectedNode < item->node_count) {
        norma_document_move_node(self.document, element, (size_t) _selectedNode, point.x, point.y);
    } else if (item->node_count >= 2) {
        // Arrastrar el trazo entero: se desplazan todos sus nodos a la vez.
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

- (void)keyDown:(NSEvent *)event
{
    const NSString *characters = event.charactersIgnoringModifiers.lowercaseString;
    if ([characters isEqualToString:@"m"]) {
        _wallTool = YES;
        _hasPending = NO;
        [self.delegate canvasStatus:self message:@"Herramienta de muro: dos clics por tramo. Esc termina."];
        [self setNeedsDisplay:YES];
        return;
    }
    if (event.keyCode == 53) { // Esc
        _wallTool = NO;
        _hasPending = NO;
        [self.delegate canvasStatus:self message:@""];
        [self setNeedsDisplay:YES];
        return;
    }
    if (event.keyCode == 51 || event.keyCode == 117) { // Retroceso y Suprimir
        if (_selectedElement >= 0) {
            norma_document_begin_edit(self.document);
            norma_document_remove(self.document, (size_t) _selectedElement);
            _selectedElement = -1;
            _selectedNode = -1;
            [self.delegate canvasDidChange:self];
            [self setNeedsDisplay:YES];
        }
        return;
    }
    [super keyDown:event];
}

@end
