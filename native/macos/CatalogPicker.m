/*
 * Normia nativo · biblioteca visual del catálogo.
 *
 * La web no ofrece un desplegable con nombres: abre una biblioteca de tarjetas
 * donde cada pictograma se ve antes de elegirlo, con su nombre y su código, y un
 * filtro por categoría. Esta hoja hace lo mismo con AppKit puro —campo de
 * búsqueda, filtro de familia, rejilla de tarjetas y dos botones—, sin WebView y
 * sin una lista copiada: las piezas salen del catálogo del núcleo y los dibujos
 * de `NormiaThumbnailForType()`, el mismo intérprete de SVG que dibuja el plano.
 *
 * Devuelve el `type` elegido; quien llama decide qué hacer con él.
 */
#import "CatalogPicker.h"
#import "SvgPicture.h"

#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/** Medidas de la rejilla, en puntos. */
static const CGFloat kCardWidth = 104.0;
static const CGFloat kCardHeight = 112.0;
static const CGFloat kCardGap = 10.0;
static const CGFloat kGridInset = 14.0;
static const CGFloat kThumbSide = 56.0;

/* Los dos se declaran antes de sus protocolos: el protocolo nombra a la clase. */
@class NormiaCatalogGrid;
@class NormiaCatalogChips;

@protocol NormiaCatalogGridDelegate <NSObject>
- (void)gridSelectionChanged:(NormiaCatalogGrid *)grid;
- (void)gridActivated:(NormiaCatalogGrid *)grid;
@end

/* ------------------------------- la rejilla ------------------------------- */

/**
 * Rejilla de tarjetas con desplazamiento, dibujada a mano.
 *
 * Se evita `NSCollectionView` a propósito: son tarjetas de tamaño fijo con un
 * pictograma y dos líneas de texto, y dibujarlas aquí cuesta menos código que
 * armar el flujo de disposición, los objetos y la reutilización de celdas.
 */
@interface NormiaCatalogGrid : NSView
@property(nonatomic) const norma_object_catalog *catalog;
/** Índices del catálogo que pasan el filtro; no se copian, se prestan. */
@property(nonatomic) const size_t *matches;
@property(nonatomic) size_t matchCount;
/** Índice dentro de `matches` de la tarjeta marcada, o -1. */
@property(nonatomic) NSInteger selectedIndex;
@property(nonatomic, weak, nullable) id<NormiaCatalogGridDelegate> delegate;

- (void)reloadMatches:(const size_t *)matches count:(size_t)count;
- (void)moveSelectionBy:(NSInteger)delta;
- (BOOL)activateSelection;
@end

@implementation NormiaCatalogGrid

- (BOOL)isFlipped
{
    return YES;
}

- (BOOL)acceptsFirstResponder
{
    return YES;
}

- (void)reloadMatches:(const size_t *)matches count:(size_t)count
{
    self.matches = matches;
    self.matchCount = count;
    self.selectedIndex = count > 0 ? 0 : -1;
    [self invalidateIntrinsicContentSize];
    [self setNeedsDisplay:YES];
}

- (void)setFrameSize:(NSSize)newSize
{
    [super setFrameSize:newSize];
    [self invalidateIntrinsicContentSize];
    [self setNeedsDisplay:YES];
}

/** Columnas que caben con el ancho actual. */
- (NSInteger)columns
{
    const CGFloat usable = NSWidth(self.bounds) - kGridInset * 2.0;
    if (usable < kCardWidth) {
        return 1;
    }
    return (NSInteger) floor((usable + kCardGap) / (kCardWidth + kCardGap));
}

- (NSSize)intrinsicContentSize
{
    const NSInteger columns = [self columns];
    const size_t rows = self.matchCount == 0 ? 0
                                            : (self.matchCount + (size_t) columns - 1) / (size_t) columns;
    /* El alto es lo que importa: la rejilla es el documento del `NSScrollView` y
       su ancho lo pone la vista que la contiene. */
    return NSMakeSize(NSWidth(self.bounds),
                      kGridInset * 2.0 + (CGFloat) rows * (kCardHeight + kCardGap));
}

/** Rectángulo de la tarjeta `index` dentro de `matches`. */
- (NSRect)rectForIndex:(NSInteger)index
{
    const NSInteger columns = [self columns];
    if (columns <= 0 || index < 0) {
        return NSZeroRect;
    }
    const NSInteger column = index % columns;
    const NSInteger row = index / columns;
    return NSMakeRect(kGridInset + (CGFloat) column * (kCardWidth + kCardGap),
                      kGridInset + (CGFloat) row * (kCardHeight + kCardGap),
                      kCardWidth, kCardHeight);
}

- (NSInteger)indexAtPoint:(NSPoint)point
{
    if (self.matchCount == 0) {
        return -1;
    }
    const NSInteger columns = [self columns];
    const CGFloat local_x = point.x - kGridInset;
    const CGFloat local_y = point.y - kGridInset;
    if (local_x < 0.0 || local_y < 0.0) {
        return -1;
    }
    const NSInteger column = (NSInteger) floor(local_x / (kCardWidth + kCardGap));
    const NSInteger row = (NSInteger) floor(local_y / (kCardHeight + kCardGap));
    if (column < 0 || column >= columns || row < 0) {
        return -1;
    }
    /* Fuera de la tarjeta pero dentro del hueco: no se selecciona nada. */
    const NSRect card = [self rectForIndex:row * columns + column];
    if (!NSPointInRect(point, card)) {
        return -1;
    }
    const NSInteger index = row * columns + column;
    return index < (NSInteger) self.matchCount ? index : -1;
}

/* ------------------------------ cómo se ve ------------------------------- */

/** El código corto de la pieza, como lo escribe la web en cada tarjeta. */
static NSString *short_code(const char *type)
{
    if (type == NULL) {
        return @"";
    }
    if (strncmp(type, "iso_", 4) == 0 || strncmp(type, "sig_", 4) == 0) {
        NSString *rest = [NSString stringWithUTF8String:type + 4];
        return rest != nil ? [rest uppercaseString] : @"";
    }
    return [NSString stringWithUTF8String:type] ?: @"";
}

- (void)drawRect:(NSRect)dirtyRect
{
    (void) dirtyRect;
    [[NSColor colorWithCalibratedRed:0.95 green:0.96 blue:0.97 alpha:1.0] setFill];
    NSRectFill(self.bounds);

    if (self.catalog == NULL || self.matchCount == 0) {
        NSDictionary *empty = @{
            NSFontAttributeName: [NSFont systemFontOfSize:13.0],
            NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.45 alpha:1.0],
        };
        NSString *message = @"Ninguna pieza coincide con la búsqueda.";
        const NSSize size = [message sizeWithAttributes:empty];
        [message drawAtPoint:NSMakePoint((NSWidth(self.bounds) - size.width) / 2.0, 40.0)
              withAttributes:empty];
        return;
    }

    NSDictionary *nameAttributes = @{
        NSFontAttributeName: [NSFont systemFontOfSize:10.5 weight:NSFontWeightSemibold],
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.15 alpha:1.0],
    };
    NSMutableParagraphStyle *centred = [[NSMutableParagraphStyle alloc] init];
    centred.alignment = NSTextAlignmentCenter;
    centred.lineBreakMode = NSLineBreakByTruncatingTail;
    NSDictionary *codeAttributes = @{
        NSFontAttributeName: [NSFont systemFontOfSize:9.0],
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.45 alpha:1.0],
        NSParagraphStyleAttributeName: centred,
    };
    NSMutableDictionary *nameBlocks = [nameAttributes mutableCopy];
    nameBlocks[NSParagraphStyleAttributeName] = centred;

    const NSRect visible = self.visibleRect;
    for (size_t index = 0; index < self.matchCount; index += 1) {
        const NSRect card = [self rectForIndex:(NSInteger) index];
        if (!NSIntersectsRect(card, visible)) {
            continue;
        }
        const BOOL chosen = (NSInteger) index == self.selectedIndex;
        NSBezierPath *frame = [NSBezierPath bezierPathWithRoundedRect:card xRadius:8.0 yRadius:8.0];
        [[NSColor whiteColor] setFill];
        [frame fill];
        if (chosen) {
            [[NSColor colorWithCalibratedRed:0.93 green:0.96 blue:1.0 alpha:1.0] setFill];
            [frame fill];
            [[NSColor colorWithCalibratedRed:0.15 green:0.36 blue:0.92 alpha:1.0] setStroke];
            frame.lineWidth = 2.0;
        } else {
            [[NSColor colorWithCalibratedWhite:0.86 alpha:1.0] setStroke];
            frame.lineWidth = 1.0;
        }
        [frame stroke];

        const norma_object_spec *spec = &self.catalog->items[self.matches[index]];
        /* El pictograma, dibujado por el intérprete del núcleo y guardado en
           caché: la misma imagen que el lienzo y el inspector. */
        NSImage *picture = NormiaThumbnailForType(spec->type, kThumbSide);
        if (picture != nil) {
            [picture drawInRect:NSMakeRect(NSMidX(card) - kThumbSide / 2.0, NSMinY(card) + 8.0,
                                           kThumbSide, kThumbSide)];
        }

        NSString *name = [NSString stringWithUTF8String:spec->name] ?: @"";
        [name drawInRect:NSMakeRect(NSMinX(card) + 6.0, NSMinY(card) + 8.0 + kThumbSide + 3.0,
                                    kCardWidth - 12.0, 26.0)
          withAttributes:nameBlocks];

        NSString *family = [NSString stringWithUTF8String:spec->family_label] ?: @"";
        NSString *detail = [NSString stringWithFormat:@"%@ · %@", short_code(spec->type), family];
        [detail drawInRect:NSMakeRect(NSMinX(card) + 4.0, NSMaxY(card) - 16.0, kCardWidth - 8.0, 12.0)
            withAttributes:codeAttributes];
    }
}

/* ------------------------------ interacción ------------------------------ */

- (void)mouseDown:(NSEvent *)event
{
    [self.window makeFirstResponder:self];
    const NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
    const NSInteger index = [self indexAtPoint:point];
    if (index < 0) {
        return;
    }
    self.selectedIndex = index;
    [self setNeedsDisplay:YES];
    [self.delegate gridSelectionChanged:self];
    if (event.clickCount >= 2) {
        [self.delegate gridActivated:self];
    }
}

- (void)moveSelectionBy:(NSInteger)delta
{
    if (self.matchCount == 0) {
        return;
    }
    NSInteger target = self.selectedIndex < 0 ? 0 : self.selectedIndex + delta;
    if (delta == 0) {
        target = 0;
    }
    if (target < 0) {
        target = 0;
    }
    if (target >= (NSInteger) self.matchCount) {
        target = (NSInteger) self.matchCount - 1;
    }
    self.selectedIndex = target;
    [self setNeedsDisplay:YES];
    [self scrollRectToVisible:NSInsetRect([self rectForIndex:target], -kCardGap, -kCardGap)];
    [self.delegate gridSelectionChanged:self];
}

- (BOOL)activateSelection
{
    if (self.selectedIndex < 0 || self.selectedIndex >= (NSInteger) self.matchCount) {
        return NO;
    }
    [self.delegate gridActivated:self];
    return YES;
}

- (void)keyDown:(NSEvent *)event
{
    switch (event.keyCode) {
    case 123: /* ← */
        [self moveSelectionBy:-1];
        return;
    case 124: /* → */
        [self moveSelectionBy:1];
        return;
    case 125: /* ↓ */
        [self moveSelectionBy:[self columns]];
        return;
    case 126: /* ↑ */
        [self moveSelectionBy:-[self columns]];
        return;
    default:
        break;
    }
    if ([event.characters isEqualToString:@"\r"] || [event.characters isEqualToString:@"\n"]) {
        [self activateSelection];
        return;
    }
    [super keyDown:event];
}

@end

/* -------------------------------- las fichas ------------------------------ */

@protocol NormiaCatalogChipsDelegate;

/**
 * Fila de fichas de categoría, como las del modal de la web: «Todas 395»,
 * «Condición segura 73»… Se dibujan a mano porque un `NSPopUpButton` esconde las
 * categorías detrás de un clic y la web las muestra todas, con su cifra, para
 * que se vea de un vistazo qué hay en la biblioteca.
 */
@interface NormiaCatalogChips : NSView
@property(nonatomic, strong) NSArray<NSString *> *titles;
@property(nonatomic) NSInteger selectedIndex;
@property(nonatomic, weak, nullable) id<NormiaCatalogChipsDelegate> delegate;
- (CGFloat)preferredHeightForWidth:(CGFloat)width;
@end

@protocol NormiaCatalogChipsDelegate <NSObject>
- (void)chipsChanged:(NormiaCatalogChips *)chips;
@end

@interface NormiaCatalogChips () {
    /** Alto que ocupan las fichas con el ancho actual (una o dos filas). */
    CGFloat _chipRows;
}
/** Rects de cada ficha, ya dispuestas; se recalculan al ancho o al título. */
@property(nonatomic) NSMutableArray<NSValue *> *rects;
@end

@implementation NormiaCatalogChips

- (BOOL)isFlipped
{
    return YES;
}

static NSDictionary *chip_attributes(BOOL chosen)
{
    return @{
        NSFontAttributeName: [NSFont systemFontOfSize:11.0 weight:chosen ? NSFontWeightSemibold
                                                                        : NSFontWeightRegular],
        NSForegroundColorAttributeName: chosen ? [NSColor whiteColor]
                                               : [NSColor colorWithCalibratedWhite:0.25 alpha:1.0],
    };
}

/** Ancho de una ficha: su texto más 22 px de relleno. */
- (CGFloat)widthForTitle:(NSString *)title chosen:(BOOL)chosen
{
    return ceil([title sizeWithAttributes:chip_attributes(chosen)].width) + 22.0;
}

- (void)layoutChips
{
    NSMutableArray<NSValue *> *rects = [NSMutableArray array];
    const CGFloat available = MAX(120.0, NSWidth(self.bounds));
    CGFloat x = 0.0;
    CGFloat y = 0.0;
    const CGFloat height = 24.0;
    const CGFloat gap = 6.0;
    for (NSUInteger index = 0; index < self.titles.count; index += 1) {
        const CGFloat width = [self widthForTitle:self.titles[index]
                                           chosen:(NSInteger) index == self.selectedIndex];
        if (x > 0.0 && x + width > available) {
            x = 0.0;
            y += height + gap;
        }
        [rects addObject:[NSValue valueWithRect:NSMakeRect(x, y, width, height)]];
        x += width + gap;
    }
    self.rects = rects;
    _chipRows = y + height;
}

- (CGFloat)preferredHeightForWidth:(CGFloat)width
{
    const NSRect saved = self.frame;
    [self setFrameSize:NSMakeSize(width, NSHeight(saved))];
    [self layoutChips];
    /* El alto se guarda antes de devolver el marco: al restaurarlo, `layoutChips`
       vuelve a medir con el ancho viejo. */
    const CGFloat rows = _chipRows;
    [self setFrameSize:saved.size];
    return rows;
}

- (void)setTitles:(NSArray<NSString *> *)titles
{
    _titles = [titles copy];
    [self layoutChips];
    [self setNeedsDisplay:YES];
}

- (void)setSelectedIndex:(NSInteger)selectedIndex
{
    _selectedIndex = selectedIndex;
    [self layoutChips];
    [self setNeedsDisplay:YES];
}

- (void)setFrameSize:(NSSize)newSize
{
    [super setFrameSize:newSize];
    [self layoutChips];
    [self setNeedsDisplay:YES];
}

- (void)drawRect:(NSRect)dirtyRect
{
    (void) dirtyRect;
    if (self.rects.count != self.titles.count) {
        [self layoutChips];
    }
    for (NSUInteger index = 0; index < self.rects.count; index += 1) {
        const NSRect rect = self.rects[index].rectValue;
        const BOOL chosen = (NSInteger) index == self.selectedIndex;
        NSBezierPath *pill = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:12.0 yRadius:12.0];
        if (chosen) {
            [[NSColor colorWithCalibratedWhite:0.13 alpha:1.0] setFill];
            [pill fill];
        } else {
            [[NSColor whiteColor] setFill];
            [pill fill];
            [[NSColor colorWithCalibratedWhite:0.82 alpha:1.0] setStroke];
            pill.lineWidth = 1.0;
            [pill stroke];
        }
        NSDictionary *attributes = chip_attributes(chosen);
        const NSSize size = [self.titles[index] sizeWithAttributes:attributes];
        [self.titles[index] drawAtPoint:NSMakePoint(NSMidX(rect) - size.width / 2.0,
                                                    NSMidY(rect) - size.height / 2.0)
                         withAttributes:attributes];
    }
}

- (void)mouseDown:(NSEvent *)event
{
    const NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
    for (NSUInteger index = 0; index < self.rects.count; index += 1) {
        if (NSPointInRect(point, self.rects[index].rectValue)) {
            self.selectedIndex = (NSInteger) index;
            [self setNeedsDisplay:YES];
            [self.delegate chipsChanged:self];
            return;
        }
    }
}

@end

/* -------------------------------- la hoja -------------------------------- */

/* Extensión de la clase pública: `CatalogPicker.h` ya declara la interfaz y sus
   dos métodos de clase; aquí solo van los detalles de la hoja. */
@interface NormiaCatalogPicker () <NormiaCatalogGridDelegate, NormiaCatalogChipsDelegate,
                                   NSSearchFieldDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSSearchField *search;
@property(nonatomic, strong) NormiaCatalogChips *chips;
@property(nonatomic, strong) NSScrollView *scroll;
@property(nonatomic, strong) NormiaCatalogGrid *grid;
@property(nonatomic, strong) NSTextField *detail;
@property(nonatomic, strong) NSTextField *summary;
@property(nonatomic, strong) NSButton *insertButton;
@property(nonatomic) const norma_object_catalog *catalog;
/** Biblioteca que se ofrece: todo, señales o equipos. */
@property(nonatomic) NormiaCatalogScope scope;
/** Claves de familia del filtro, en el orden del catálogo; índice 0 = todas. */
@property(nonatomic, strong) NSArray<NSString *> *families;
/** Índices del catálogo que pasan el filtro, en el orden del menú. */
@property(nonatomic) size_t *matches;
@property(nonatomic) size_t matchCount;
@property(nonatomic, copy) NSString *chosen;

- (NSString *)runForWindow:(nullable NSWindow *)parent prompt:(nullable NSString *)prompt;
- (void)buildFamilyFilter;
- (void)filterChanged:(nullable id)sender;
- (nullable NSString *)selectedFamilyKey;
- (BOOL)spec:(const norma_object_spec *)spec belongsToScope:(NormiaCatalogScope)scope;
- (void)insertChosen:(nullable id)sender;
- (void)cancel:(nullable id)sender;
@end

@implementation NormiaCatalogPicker

+ (NSString *)pickFromCatalog:(const norma_object_catalog *)catalog
                    forWindow:(NSWindow *)window
                       prompt:(NSString *)prompt
{
    return [self pickFromCatalog:catalog forWindow:window prompt:prompt scope:NormiaCatalogScopeAll];
}

+ (NSString *)pickFromCatalog:(const norma_object_catalog *)catalog
                    forWindow:(NSWindow *)window
                       prompt:(NSString *)prompt
                        scope:(NormiaCatalogScope)scope
{
    if (catalog == NULL || catalog->count == 0) {
        return nil;
    }
    NormiaCatalogPicker *picker = [[NormiaCatalogPicker alloc] init];
    picker.catalog = catalog;
    picker.scope = scope;
    if (prompt == nil) {
        prompt = scope == NormiaCatalogScopeSigns ? @"Biblioteca visual · señalización y orientación"
               : scope == NormiaCatalogScopeCad ? @"Biblioteca visual · equipos y mobiliario"
                                                : @"Biblioteca visual · todo el catálogo";
    }
    return [picker runForWindow:window prompt:prompt];
}

/** 1 si la pieza es de la biblioteca pedida, según su familia del catálogo. */
- (BOOL)spec:(const norma_object_spec *)spec belongsToScope:(NormiaCatalogScope)scope
{
    if (scope == NormiaCatalogScopeAll) {
        return YES;
    }
    const char *family = spec->family;
    const BOOL sign = strncmp(family, "sign", 4) == 0;
    if (scope == NormiaCatalogScopeSigns) {
        return sign;
    }
    /* Equipos: todo lo que no es señal, con las puertas aparte. */
    return !sign && !norma_object_is_door(spec->type);
}

- (void)dealloc
{
    free(_matches);
}

/** Compara sin mayúsculas ni tildes. */
static BOOL contains_text(const char *haystack, const char *needle)
{
    if (needle == NULL || needle[0] == '\0') {
        return YES;
    }
    if (haystack == NULL) {
        return NO;
    }
    const size_t length = strlen(needle);
    for (const char *cursor = haystack; *cursor != '\0'; cursor += 1) {
        size_t index = 0;
        while (index < length) {
            const unsigned char a = (unsigned char) cursor[index];
            const unsigned char b = (unsigned char) needle[index];
            if (a == '\0' || tolower(a) != tolower(b)) {
                break;
            }
            index += 1;
        }
        if (index == length) {
            return YES;
        }
    }
    return NO;
}

/* ------------------------------ la ventana ------------------------------- */

- (NSString *)runForWindow:(NSWindow *)parent prompt:(NSString *)prompt
{
    const CGFloat width = 900.0;
    const CGFloat height = 640.0;
    NSRect frame = NSMakeRect(0.0, 0.0, width, height);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                             styleMask:NSWindowStyleMaskTitled
                                               backing:NSBackingStoreBuffered
                                                 defer:NO];
    self.window.title = prompt != nil ? prompt : @"Biblioteca visual";
    self.window.releasedWhenClosed = NO;
    NSView *content = self.window.contentView;
    const CGFloat margin = 18.0;

    NSTextField *title = [NSTextField labelWithString:prompt != nil ? prompt : @"Biblioteca visual"];
    title.font = [NSFont systemFontOfSize:16.0 weight:NSFontWeightSemibold];
    title.frame = NSMakeRect(margin, height - 42.0, width - margin * 2.0, 22.0);
    title.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    [content addSubview:title];

    self.summary = [NSTextField labelWithString:@""];
    self.summary.font = [NSFont systemFontOfSize:10.5];
    self.summary.textColor = [NSColor secondaryLabelColor];
    self.summary.frame = NSMakeRect(margin, height - 60.0, width - margin * 2.0, 14.0);
    self.summary.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    [content addSubview:self.summary];

    self.search = [[NSSearchField alloc] initWithFrame:NSMakeRect(margin, height - 96.0,
                                                                 width - margin * 2.0, 28.0)];
    self.search.placeholderString = self.scope == NormiaCatalogScopeSigns
        ? @"Buscar por nombre, código o alias: salida, extintor, E002…"
        : self.scope == NormiaCatalogScopeCad
            ? @"Buscar equipo por nombre o familia: camilla, botiquín, ascensor…"
            : @"Buscar por nombre, código o tipo: extintor, camilla, E002…";
    self.search.delegate = self;
    self.search.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    self.search.target = self;
    self.search.action = @selector(filterChanged:);
    [content addSubview:self.search];

    /* Las categorías, en fichas como el modal de la web: todas a la vista con su
       cifra. Ocupan una o dos filas según el ancho, así que la rejilla se coloca
       después de medirlas. */
    self.chips = [[NormiaCatalogChips alloc] initWithFrame:NSMakeRect(margin, 0.0, width - margin * 2.0, 0.0)];
    self.chips.delegate = self;
    self.chips.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    [content addSubview:self.chips];
    [self buildFamilyFilter];
    const CGFloat chipsHeight = MAX(24.0, [self.chips preferredHeightForWidth:width - margin * 2.0]);
    const CGFloat chipsTop = height - 108.0;
    self.chips.frame = NSMakeRect(margin, chipsTop - chipsHeight, width - margin * 2.0, chipsHeight);

    NSTextField *hint = [NSTextField labelWithString:@"Doble clic o Intro para insertar · flechas para moverse"];
    hint.font = [NSFont systemFontOfSize:10.0];
    hint.textColor = [NSColor secondaryLabelColor];
    hint.alignment = NSTextAlignmentRight;
    hint.frame = NSMakeRect(width - margin - 320.0, chipsTop - chipsHeight - 20.0, 320.0, 16.0);
    hint.autoresizingMask = NSViewMinXMargin | NSViewMinYMargin;
    [content addSubview:hint];

    const CGFloat gridTop = chipsTop - chipsHeight - 26.0;
    NSRect gridFrame = NSMakeRect(margin, 62.0, width - margin * 2.0, MAX(120.0, gridTop - 62.0));
    self.scroll = [[NSScrollView alloc] initWithFrame:gridFrame];
    self.scroll.hasVerticalScroller = YES;
    self.scroll.borderType = NSNoBorder;
    self.scroll.drawsBackground = YES;
    self.scroll.backgroundColor = [NSColor colorWithCalibratedRed:0.95 green:0.96 blue:0.97 alpha:1.0];
    self.scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.grid = [[NormiaCatalogGrid alloc] initWithFrame:gridFrame];
    self.grid.catalog = self.catalog;
    self.grid.autoresizingMask = NSViewWidthSizable;
    self.grid.delegate = self;
    self.scroll.documentView = self.grid;
    [content addSubview:self.scroll];

    self.detail = [NSTextField labelWithString:@""];
    self.detail.font = [NSFont systemFontOfSize:10.5];
    self.detail.textColor = [NSColor secondaryLabelColor];
    self.detail.lineBreakMode = NSLineBreakByTruncatingTail;
    self.detail.frame = NSMakeRect(margin, 26.0, width - margin * 2.0 - 240.0, 18.0);
    self.detail.autoresizingMask = NSViewWidthSizable | NSViewMaxYMargin;
    [content addSubview:self.detail];

    self.insertButton = [NSButton buttonWithTitle:@"Insertar"
                                           target:self
                                           action:@selector(insertChosen:)];
    self.insertButton.frame = NSMakeRect(width - margin - 110.0, 18.0, 110.0, 32.0);
    self.insertButton.bezelStyle = NSBezelStyleRounded;
    self.insertButton.keyEquivalent = @"\r";
    self.insertButton.autoresizingMask = NSViewMinXMargin | NSViewMaxYMargin;
    [content addSubview:self.insertButton];

    NSButton *cancel = [NSButton buttonWithTitle:@"Cancelar" target:self action:@selector(cancel:)];
    cancel.frame = NSMakeRect(width - margin - 220.0, 18.0, 100.0, 32.0);
    cancel.bezelStyle = NSBezelStyleRounded;
    cancel.keyEquivalent = @"\033";
    cancel.autoresizingMask = NSViewMinXMargin | NSViewMaxYMargin;
    [content addSubview:cancel];

    [self buildFamilyFilter];
    [self filterChanged:nil];
    self.window.initialFirstResponder = self.search;

    if (parent != nil) {
        [parent beginSheet:self.window completionHandler:nil];
        [NSApp runModalForWindow:self.window];
        [parent endSheet:self.window];
    } else {
        [NSApp runModalForWindow:self.window];
    }
    [self.window orderOut:nil];
    NSString *chosen = self.chosen;
    self.window = nil;
    return chosen;
}

/** El filtro de categorías, con las familias que de verdad hay en la biblioteca. */
- (void)buildFamilyFilter
{
    NSMutableArray<NSString *> *keys = [NSMutableArray arrayWithObject:@""];
    NSMutableArray<NSString *> *titles = [NSMutableArray array];
    size_t inScope = 0;
    if (self.catalog != NULL) {
        for (size_t index = 0; index < self.catalog->count; index += 1) {
            if ([self spec:&self.catalog->items[index] belongsToScope:self.scope]) {
                inScope += 1;
            }
        }
    }
    [titles addObject:[NSString stringWithFormat:@"Todas (%lu)", (unsigned long) inScope]];
    if (self.catalog != NULL) {
        for (size_t index = 0; index < self.catalog->count; index += 1) {
            const norma_object_spec *spec = &self.catalog->items[index];
            if (![self spec:spec belongsToScope:self.scope]) {
                continue;
            }
            NSString *key = [NSString stringWithUTF8String:spec->family] ?: @"";
            if ([keys containsObject:key]) {
                continue;
            }
            size_t count = 0;
            for (size_t other = 0; other < self.catalog->count; other += 1) {
                if (strcmp(self.catalog->items[other].family, spec->family) == 0
                    && [self spec:&self.catalog->items[other] belongsToScope:self.scope]) {
                    count += 1;
                }
            }
            [keys addObject:key];
            [titles addObject:[NSString stringWithFormat:@"%s (%lu)", spec->family_label,
                                                         (unsigned long) count]];
        }
    }
    self.families = keys;
    self.chips.titles = titles;
    self.chips.selectedIndex = 0;
}

/* ------------------------------- la búsqueda ----------------------------- */

- (void)filterChanged:(id)sender
{
    (void) sender;
    NSString *text = self.search.stringValue;
    /* Sin tildes: buscar «botiquin» tiene que encontrar «Botiquín». */
    NSString *plain = [text stringByFoldingWithOptions:NSDiacriticInsensitiveSearch
                                                locale:[NSLocale localeWithLocaleIdentifier:@"es_CO"]];
    const char *needle = plain.UTF8String != NULL ? plain.UTF8String : "";
    /* La clave se copia: el `NSString` de la ficha es temporal y el puntero
       interno dejaría de valer a la vuelta del ciclo de eventos. */
    char family_key[NORMA_OBJECT_FAMILY];
    int filter_family = 0;
    family_key[0] = '\0';
    NSString *chosenFamily = [self selectedFamilyKey];
    if (chosenFamily != nil) {
        snprintf(family_key, sizeof(family_key), "%s", chosenFamily.UTF8String);
        filter_family = 1;
    }

    free(_matches);
    _matches = NULL;
    _matchCount = 0;
    if (self.catalog == NULL) {
        return;
    }
    _matches = (size_t *) malloc(self.catalog->count * sizeof(size_t));
    if (_matches == NULL) {
        return;
    }
    for (size_t index = 0; index < self.catalog->count; index += 1) {
        const norma_object_spec *spec = &self.catalog->items[index];
        if (![self spec:spec belongsToScope:self.scope]) {
            continue;
        }
        if (filter_family && strcmp(spec->family, family_key) != 0) {
            continue;
        }
        NSString *name = [NSString stringWithUTF8String:spec->name];
        NSString *family = [NSString stringWithUTF8String:spec->family_label];
        NSString *folded = [[NSString stringWithFormat:@"%@ %@ %@", name != nil ? name : @"",
                             family != nil ? family : @"", [NSString stringWithUTF8String:spec->type]]
            stringByFoldingWithOptions:NSDiacriticInsensitiveSearch
                                locale:[NSLocale localeWithLocaleIdentifier:@"es_CO"]];
        if (text.length == 0 || contains_text(folded.UTF8String, needle)) {
            _matches[_matchCount] = index;
            _matchCount += 1;
        }
    }
    [self.grid reloadMatches:_matches count:_matchCount];
    [self.grid setFrameSize:NSMakeSize(NSWidth(self.scroll.contentView.bounds),
                                       MAX(NSHeight(self.scroll.contentView.bounds),
                                           self.grid.intrinsicContentSize.height))];
    [self.grid setNeedsDisplay:YES];
    /* Se cuenta lo que hay de verdad, no lo que se supone: si mañana entra una
       señal nueva al catálogo, la cifra cambia sola. */
    size_t iso = 0;
    size_t own = 0;
    for (size_t index = 0; index < self.catalog->count; index += 1) {
        const char *type = self.catalog->items[index].type;
        if (strncmp(type, "iso_", 4) == 0) {
            iso += 1;
        } else if (strncmp(type, "sig_", 4) == 0) {
            own += 1;
        }
    }
    NSString *library = self.scope == NormiaCatalogScopeSigns ? @"señales"
                        : self.scope == NormiaCatalogScopeCad ? @"equipos"
                                                             : @"piezas";
    self.summary.stringValue = [NSString stringWithFormat:
        @"%lu de %lu %@ · %lu ISO 7010 + %lu propias, leídas de los catálogos locales",
        (unsigned long) _matchCount, (unsigned long) self.catalog->count, library,
        (unsigned long) iso, (unsigned long) own];
    self.insertButton.enabled = _matchCount > 0;
    [self gridSelectionChanged:self.grid];
}

/** Clave de familia de la ficha activa; `nil` si es «Todas». */
- (NSString *)selectedFamilyKey
{
    const NSInteger index = self.chips.selectedIndex;
    if (index <= 0 || (NSUInteger) index >= self.families.count) {
        return nil;
    }
    return self.families[(NSUInteger) index];
}

/** Al cambiar de categoría se vuelve a filtrar y se vuelve a la primera tarjeta. */
- (void)chipsChanged:(NormiaCatalogChips *)chips
{
    (void) chips;
    [self filterChanged:nil];
    [self.grid scrollRectToVisible:NSMakeRect(0.0, 0.0, 1.0, 1.0)];
}

/* ------------------------- lo que dice la rejilla ------------------------ */

- (void)gridSelectionChanged:(NormiaCatalogGrid *)grid
{
    const NSInteger index = grid.selectedIndex;
    if (index < 0 || (size_t) index >= _matchCount) {
        self.detail.stringValue = @"";
        self.insertButton.enabled = NO;
        return;
    }
    const norma_object_spec *spec = &self.catalog->items[_matches[(size_t) index]];
    self.detail.stringValue = [NSString stringWithFormat:@"%s · %s", spec->name, spec->family_label];
    self.insertButton.enabled = YES;
}

- (void)gridActivated:(NormiaCatalogGrid *)grid
{
    (void) grid;
    [self insertChosen:nil];
}

/** Filtrar mientras se escribe, sin esperar a Intro. */
- (void)controlTextDidChange:(NSNotification *)note
{
    (void) note;
    [self filterChanged:nil];
}

- (void)insertChosen:(id)sender
{
    (void) sender;
    const NSInteger index = self.grid.selectedIndex;
    if (index < 0 || (size_t) index >= _matchCount) {
        return;
    }
    const norma_object_spec *spec = &self.catalog->items[_matches[(size_t) index]];
    self.chosen = [NSString stringWithUTF8String:spec->type];
    [NSApp stopModal];
}

- (void)cancel:(id)sender
{
    (void) sender;
    self.chosen = nil;
    [NSApp stopModal];
}

@end
