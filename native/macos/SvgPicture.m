/*
 * Normia nativo · puente entre el intérprete de SVG del núcleo y Core Graphics.
 *
 * El destino del dibujo (`norma_svg_sink`) acumula un `CGMutablePathRef` y, al
 * llegar `paint`, rellena y traza con el color y el grosor que ya vienen en
 * centímetros del plano. Los puntos llegan aplanados desde el núcleo, así que
 * aquí no hay matemática de transformaciones: solo pintar.
 */
#import "SvgPicture.h"

#import <AppKit/AppKit.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/object.h"

/** Destino de dibujo: el contexto de Core Graphics y el camino en curso. */
typedef struct {
    CGContextRef context;
    CGMutablePathRef path;
    /** El SVG venía en unidades de usuario con el eje Y hacia abajo, igual que
        el plano, así que no hay que voltear nada. */
    int paintings;
} picture;

static CGFloat colour_component(const char *colour, size_t offset)
{
    if (colour == NULL || colour[0] != '#') {
        return 0.0;
    }
    unsigned int value = 0;
    for (size_t index = 0; index < 2; index += 1) {
        const char digit = colour[offset + index];
        unsigned int nibble = 0;
        if (digit >= '0' && digit <= '9') {
            nibble = (unsigned int) (digit - '0');
        } else if (digit >= 'a' && digit <= 'f') {
            nibble = (unsigned int) (digit - 'a' + 10);
        } else if (digit >= 'A' && digit <= 'F') {
            nibble = (unsigned int) (digit - 'A' + 10);
        }
        value = value * 16 + nibble;
    }
    return (CGFloat) value / 255.0;
}

static void set_colour(CGContextRef context, const char *colour, double alpha, int fill)
{
    if (colour == NULL || colour[0] != '#') {
        return;
    }
    CGContextSetAlpha(context, (CGFloat) (alpha < 0.0 ? 0.0 : (alpha > 1.0 ? 1.0 : alpha)));
    if (fill) {
        CGContextSetRGBFillColor(context, colour_component(colour, 1), colour_component(colour, 3),
                                 colour_component(colour, 5), 1.0);
    } else {
        CGContextSetRGBStrokeColor(context, colour_component(colour, 1), colour_component(colour, 3),
                                   colour_component(colour, 5), 1.0);
    }
}

/** `stroke-dasharray="12 5"` → el arreglo que espera Core Graphics. */
static size_t parse_dashes(const char *dash, CGFloat *out, size_t capacity)
{
    if (dash == NULL || capacity == 0) {
        return 0;
    }
    size_t count = 0;
    const char *cursor = dash;
    while (*cursor != '\0' && count < capacity) {
        while (*cursor == ' ' || *cursor == ',') {
            cursor += 1;
        }
        if (*cursor == '\0') {
            break;
        }
        char *end = NULL;
        const double value = strtod(cursor, &end);
        if (end == cursor) {
            break;
        }
        out[count] = (CGFloat) value;
        count += 1;
        cursor = end;
    }
    return count;
}

static void picture_move(void *user, double x, double y)
{
    picture *state = (picture *) user;
    CGPathMoveToPoint(state->path, NULL, (CGFloat) x, (CGFloat) y);
}

static void picture_line(void *user, double x, double y)
{
    picture *state = (picture *) user;
    CGPathAddLineToPoint(state->path, NULL, (CGFloat) x, (CGFloat) y);
}

static void picture_curve(void *user, double x1, double y1, double x2, double y2, double x3, double y3)
{
    picture *state = (picture *) user;
    CGPathAddCurveToPoint(state->path, NULL, (CGFloat) x1, (CGFloat) y1, (CGFloat) x2, (CGFloat) y2,
                          (CGFloat) x3, (CGFloat) y3);
}

static void picture_close(void *user)
{
    picture *state = (picture *) user;
    CGPathCloseSubpath(state->path);
}

static void picture_paint(void *user, const norma_svg_paint *paint)
{
    picture *state = (picture *) user;
    if (state->path == NULL || paint == NULL) {
        return;
    }
    CGContextSaveGState(state->context);
    if (paint->fill != NULL) {
        set_colour(state->context, paint->fill, paint->fill_alpha, 1);
        CGContextAddPath(state->context, state->path);
        CGContextFillPath(state->context);
        /* `FillPath` vacía el camino del contexto, no el nuestro: se vuelve a
           añadir para el trazo. */
        state->paintings += 1;
    }
    if (paint->stroke != NULL && paint->stroke_width > 0.0) {
        set_colour(state->context, paint->stroke, paint->stroke_alpha, 0);
        CGContextSetLineWidth(state->context, (CGFloat) paint->stroke_width);
        CGContextSetLineJoin(state->context, kCGLineJoinRound);
        CGContextSetLineCap(state->context, kCGLineCapRound);
        CGFloat dashes[8];
        const size_t count = parse_dashes(paint->dash, dashes, 8);
        if (count > 0) {
            CGContextSetLineDash(state->context, (CGFloat) paint->dash_offset, dashes, count);
        } else {
            CGContextSetLineDash(state->context, 0.0, NULL, 0);
        }
        CGContextAddPath(state->context, state->path);
        CGContextStrokePath(state->context);
        state->paintings += 1;
    }
    CGContextSetAlpha(state->context, 1.0);
    CGContextSetLineDash(state->context, 0.0, NULL, 0);
    CGContextRestoreGState(state->context);
    /* El camino se rehace para el siguiente elemento del pictograma. */
    if (state->path != NULL) {
        CGPathRelease(state->path);
    }
    state->path = CGPathCreateMutable();
}

static void picture_push_clip(void *user)
{
    picture *state = (picture *) user;
    if (state->path == NULL) {
        return;
    }
    /* El grupo que recorta guarda y restaura su propio estado: así el recorte
       no se escapa al pictograma. */
    CGContextSaveGState(state->context);
    CGContextAddPath(state->context, state->path);
    CGContextClip(state->context);
    CGPathRelease(state->path);
    state->path = CGPathCreateMutable();
}

static void picture_pop_clip(void *user)
{
    picture *state = (picture *) user;
    if (state->path != NULL) {
        CGPathRelease(state->path);
        state->path = CGPathCreateMutable();
    }
    CGContextRestoreGState(state->context);
}

/** El rótulo de las piezas que lo llevan dentro del SVG (la «P» del
    parqueadero, el «30» de la señal de velocidad). */
static void picture_text(void *user, double x, double y, double size, int anchor, const char *fill,
                         double alpha, const char *content)
{
    picture *state = (picture *) user;
    if (content == NULL || content[0] == '\0' || size <= 0.0 || size > 2000.0) {
        return;
    }
    NSString *text = [NSString stringWithUTF8String:content];
    if (text == nil) {
        return;
    }
    CGFloat red = 0.2;
    CGFloat green = 0.25;
    CGFloat blue = 0.33;
    if (fill != NULL && strlen(fill) == 7 && fill[0] == '#') {
        red = colour_component(fill, 1);
        green = colour_component(fill, 3);
        blue = colour_component(fill, 5);
    }
    NSColor *colour = [NSColor colorWithCalibratedRed:red green:green blue:blue
                                               alpha:(alpha < 0.0 ? 0.0 : (alpha > 1.0 ? 1.0 : alpha))];
    NSFont *font = [NSFont systemFontOfSize:(CGFloat) size weight:NSFontWeightBold];
    NSDictionary *attributes = @{NSFontAttributeName: font, NSForegroundColorAttributeName: colour};
    const NSSize extent = [text sizeWithAttributes:attributes];
    CGFloat origin = (CGFloat) x;
    if (anchor == NORMA_SVG_TEXT_MIDDLE) {
        origin -= extent.width / 2.0;
    } else if (anchor == NORMA_SVG_TEXT_END) {
        origin -= extent.width;
    }
    /* El contexto del plano tiene el eje Y hacia abajo, así que se declara
       volteado: AppKit dibuja los glifos derechos y `y` es la línea base. */
    NSGraphicsContext *graphics = [NSGraphicsContext graphicsContextWithCGContext:state->context
                                                                         flipped:YES];
    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext setCurrentContext:graphics];
    [text drawAtPoint:NSMakePoint(origin, (CGFloat) y - extent.height * 0.78) withAttributes:attributes];
    [NSGraphicsContext restoreGraphicsState];
}

void NormiaDrawSvgInContext(CGContextRef context, const char *svg, CGRect box, const char *colour)
{
    if (context == NULL || svg == NULL || box.size.width <= 0.0 || box.size.height <= 0.0) {
        return;
    }
    /* `colour_component` lee seis dígitos: un color corto se sustituye por el
       de reserva en vez de leer fuera de la cadena. */
    if (colour == NULL || strlen(colour) != 7 || colour[0] != '#') {
        colour = "#334155";
    }
    picture state;
    state.context = context;
    state.path = CGPathCreateMutable();
    state.paintings = 0;

    norma_svg_sink sink;
    sink.user = &state;
    sink.move_to = picture_move;
    sink.line_to = picture_line;
    sink.curve_to = picture_curve;
    sink.close = picture_close;
    sink.paint = picture_paint;
    sink.push_clip = picture_push_clip;
    sink.pop_clip = picture_pop_clip;
    sink.text = picture_text;

    CGContextSaveGState(context);
    /* Mismo relleno que la web: sin relleno por omisión, el pictograma manda. */
    norma_svg_draw(svg, (double) box.origin.x, (double) box.origin.y, (double) box.size.width,
                   (double) box.size.height, colour, &sink);
    CGContextRestoreGState(context);
    if (state.path != NULL) {
        CGPathRelease(state.path);
    }
}

/* ------------------------------ miniaturas ------------------------------- */

/** Caché de miniaturas: clave `tipo@lado` → NSImage ya rasterizada. */
static NSMutableDictionary<NSString *, NSImage *> *thumbnail_cache(void)
{
    static NSMutableDictionary<NSString *, NSImage *> *cache = nil;
    if (cache == nil) {
        cache = [NSMutableDictionary dictionary];
    }
    return cache;
}

NSImage *NormiaThumbnailForType(const char *type, CGFloat size)
{
    if (type == NULL || size <= 0.0) {
        return nil;
    }
    NSString *key = [NSString stringWithFormat:@"%s@%.0f", type, (double) size];
    NSImage *cached = thumbnail_cache()[key];
    if (cached != nil) {
        return cached;
    }
    const norma_object_spec *spec = norma_object_find(type);
    if (spec == NULL || spec->svg == NULL) {
        return nil;
    }
    const NSInteger pixels = (NSInteger) (size * 2.0);
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    CGContextRef bitmap = CGBitmapContextCreate(NULL, (size_t) pixels, (size_t) pixels, 8, 0, space,
                                                (CGBitmapInfo) kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(space);
    if (bitmap == NULL) {
        return nil;
    }
    CGContextSetShouldAntialias(bitmap, YES);
    /* El mapa de bits nace con el eje Y hacia arriba y el plano lo tiene hacia
       abajo: se voltea y se escala 2× de una vez, o la miniatura sale del revés. */
    CGContextTranslateCTM(bitmap, 0.0, size);
    CGContextScaleCTM(bitmap, 2.0, -2.0);
    /* Un lienzo claro detrás: las señales tienen fondo propio, pero los
       pictogramas de equipos son trazos oscuros sobre nada. */
    CGContextSetRGBFillColor(bitmap, 1.0, 1.0, 1.0, 1.0);
    CGContextFillRect(bitmap, CGRectMake(0.0, 0.0, size, size));
    char colour[NORMA_OBJECT_COLOUR];
    snprintf(colour, sizeof(colour), "%s", spec->colour[0] == '#' ? spec->colour : "#334155");
    NormiaDrawSvgInContext(bitmap, spec->svg, CGRectMake(1.0, 1.0, size - 2.0, size - 2.0), colour);
    CGImageRef image = CGBitmapContextCreateImage(bitmap);
    CGContextRelease(bitmap);
    if (image == NULL) {
        return nil;
    }
    NSImage *thumbnail = [[NSImage alloc] initWithCGImage:image size:NSMakeSize(size, size)];
    CGImageRelease(image);
    if (thumbnail != nil) {
        thumbnail_cache()[key] = thumbnail;
    }
    return thumbnail;
}

void NormiaClearThumbnailCache(void)
{
    [thumbnail_cache() removeAllObjects];
}
