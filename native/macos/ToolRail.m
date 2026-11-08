/*
 * Normia nativo · paleta de herramientas (implementación).
 *
 * La paleta se arma con una tabla, no con código repetido: cada grupo dice su
 * rótulo y sus botones. Así añadir una herramienta es añadir una fila, y la
 * comprobación de `native/tests/macos.mjs` puede leer la misma lista.
 */
#import "ToolRail.h"

#import <QuartzCore/QuartzCore.h>

/** Ancho de la paleta: el de la captura de referencia (columna estrecha). */
static const CGFloat kRailWidth = 236.0;
static const CGFloat kRowHeight = 28.0;
static const CGFloat kRowGap = 4.0;
static const CGFloat kGroupGap = 13.0;
static const CGFloat kGroupTitle = 20.0;

/* Colores del tema oscuro de la ventana. */
static NSColor *railBackground(void) { return [NSColor colorWithCalibratedRed:0.14 green:0.15 blue:0.17 alpha:1.0]; }
static NSColor *railText(void) { return [NSColor colorWithCalibratedWhite:0.92 alpha:1.0]; }
static NSColor *railMuted(void) { return [NSColor colorWithCalibratedWhite:0.60 alpha:1.0]; }
static NSColor *railAccent(void) { return [NSColor colorWithCalibratedRed:0.16 green:0.43 blue:0.78 alpha:1.0]; }

/**
 * Un grupo de la paleta.
 *
 * `rows` es una lista de diccionarios: `title`, `symbol` (SF Symbol), `tool`
 * (número de `NormiaTool`) o `action` (cadena), y `key` (atajo, solo para el
 * globo de ayuda).
 */
@interface ToolRail ()
- (NSArray<NSDictionary *> *)groups;
- (void)buildRows;
- (void)buttonClicked:(NSButton *)sender;
- (void)applyActiveState;
@end

@implementation ToolRail

+ (CGFloat)preferredHeight
{
    /* Grupos de la tabla de arriba: 8 rótulos y 27 botones, con sus holguras. */
    return 1000.0;
}

- (instancetype)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self != nil) {
        _tool = NormiaToolSelect;
        [self buildRows];
    }
    return self;
}

- (BOOL)isFlipped
{
    /* De arriba abajo, como se lee la paleta. */
    return YES;
}

- (void)drawRect:(NSRect)dirtyRect
{
    (void) dirtyRect;
    [railBackground() setFill];
    NSRectFill(self.bounds);
    /* Una línea de separación con el lienzo, como el borde de un panel acoplado. */
    [[NSColor colorWithCalibratedWhite:0.24 alpha:1.0] setFill];
    NSRectFill(NSMakeRect(NSWidth(self.bounds) - 1.0, 0.0, 1.0, NSHeight(self.bounds)));
}

/* ------------------------------ construcción ----------------------------- */

- (NSArray<NSDictionary *> *)groups
{
    return @[
        @{ @"title": @"DIBUJO",
           @"rows": @[
               @{ @"title": @"Seleccionar", @"symbol": @"cursorarrow", @"tool": @(NormiaToolSelect), @"key": @"V" },
               @{ @"title": @"Mano", @"symbol": @"hand.raised", @"tool": @(NormiaToolPan), @"key": @"H" },
               @{ @"title": @"Muro", @"symbol": @"rectangle.split.3x1", @"tool": @(NormiaToolWall), @"key": @"M",
                  @"tip": @"Un clic por vértice; el primer nodo cierra el recinto" },
               @{ @"title": @"Línea", @"symbol": @"line.diagonal", @"tool": @(NormiaToolLine), @"key": @"L" },
               @{ @"title": @"Rectángulo", @"symbol": @"rectangle", @"tool": @(NormiaToolRect), @"key": @"B" },
               @{ @"title": @"Elipse", @"symbol": @"circle", @"tool": @(NormiaToolEllipse), @"key": @"O" },
               @{ @"title": @"Pluma", @"symbol": @"scribble", @"tool": @(NormiaToolPen), @"key": @"P" },
               @{ @"title": @"Arco", @"symbol": @"arrow.up.right", @"tool": @(NormiaToolArc), @"key": @"A" },
           ] },
        @{ @"title": @"MODIFICAR",
           @"rows": @[
               @{ @"title": @"Duplicar", @"symbol": @"plus.square.on.square", @"action": @"duplicate", @"key": @"⌘D" },
               @{ @"title": @"Girar 90°", @"symbol": @"rotate.right", @"action": @"rotate", @"key": @"⌘R" },
               @{ @"title": @"Borrar", @"symbol": @"trash", @"action": @"delete", @"key": @"⌫" },
               @{ @"title": @"Rejilla", @"symbol": @"grid", @"action": @"grid", @"key": @"F7" },
           ] },
        @{ @"title": @"TEXTO",
           @"rows": @[
               @{ @"title": @"Texto", @"symbol": @"textformat", @"tool": @(NormiaToolText), @"key": @"T" },
               @{ @"title": @"Rótulo", @"symbol": @"tag", @"action": @"label", @"key": @"⌘L" },
           ] },
        @{ @"title": @"ACOTACIÓN",
           @"rows": @[
               @{ @"title": @"Cota", @"symbol": @"ruler", @"tool": @(NormiaToolDimension), @"key": @"D" },
           ] },
        @{ @"title": @"RUTAS",
           @"rows": @[
               @{ @"title": @"Ruta de evacuación", @"symbol": @"arrow.turn.up.right", @"tool": @(NormiaToolRoute), @"key": @"R" },
               @{ @"title": @"Ajustar a la hoja", @"symbol": @"arrow.up.left.and.arrow.down.right", @"action": @"fit", @"key": @"⌘0" },
           ] },
        @{ @"title": @"ENTORNO",
           @"rows": @[
               @{ @"title": @"Vía", @"symbol": @"road.lanes", @"tool": @(NormiaToolRoad), @"key": @"E" },
               @{ @"title": @"Andén", @"symbol": @"figure.walk", @"tool": @(NormiaToolSidewalk), @"key": @"N" },
               @{ @"title": @"Paso peatonal", @"symbol": @"rectangle.dashed", @"tool": @(NormiaToolCrosswalk), @"key": @"C" },
               @{ @"title": @"Parqueadero", @"symbol": @"parkingsign", @"tool": @(NormiaToolParking), @"key": @"K" },
               @{ @"title": @"Lindero", @"symbol": @"ruler", @"tool": @(NormiaToolProperty), @"key": @"J" },
           ] },
        @{ @"title": @"INSTALACIONES",
           @"rows": @[
               @{ @"title": @"Tubería", @"symbol": @"cylinder", @"tool": @(NormiaToolPipe), @"key": @"Q" },
               @{ @"title": @"Canaleta", @"symbol": @"cable.connector", @"tool": @(NormiaToolConduit), @"key": @"W" },
           ] },
        @{ @"title": @"BIBLIOTECA",
           @"rows": @[
               @{ @"title": @"Señalización ISO 7010…", @"symbol": @"exclamationmark.triangle",
                  @"action": @"librarySign", @"key": @"⌃⇧S" },
               @{ @"title": @"Equipos y mobiliario…", @"symbol": @"cross.case",
                  @"action": @"libraryCad", @"key": @"⌃⇧E" },
               @{ @"title": @"Buscar e insertar…", @"symbol": @"magnifyingglass",
                  @"action": @"catalog", @"key": @"⌘⇧I" },
           ] },
    ];
}

/** Una imagen de símbolo del sistema, o `nil` si el sistema no la tiene. */
static NSImage *symbolImage(NSString *name)
{
    NSImage *image = [NSImage imageWithSystemSymbolName:name accessibilityDescription:nil];
    image.template = YES;
    return image;
}

- (void)buildRows
{
    const CGFloat inset = 12.0;
    const CGFloat width = kRailWidth - inset * 2.0 - 2.0;
    CGFloat y = 10.0;

    NSTextField *title = [NSTextField labelWithString:@"CONJUNTOS DE HERRAMIENTAS"];
    title.font = [NSFont systemFontOfSize:10.0 weight:NSFontWeightBold];
    title.textColor = railMuted();
    title.frame = NSMakeRect(inset, y, width, 14.0);
    [self addSubview:title];
    y += 22.0;

    for (NSDictionary *group in [self groups]) {
        NSTextField *header = [NSTextField labelWithString:group[@"title"]];
        header.font = [NSFont systemFontOfSize:10.0 weight:NSFontWeightSemibold];
        header.textColor = railMuted();
        header.frame = NSMakeRect(inset, y, width, kGroupTitle - 4.0);
        [self addSubview:header];
        y += kGroupTitle;

        for (NSDictionary *row in group[@"rows"]) {
            NSButton *button = [[NSButton alloc] initWithFrame:NSMakeRect(inset, y, width, kRowHeight)];
            button.title = row[@"title"];
            button.alignment = NSTextAlignmentLeft;
            button.font = [NSFont systemFontOfSize:11.5];
            button.image = symbolImage(row[@"symbol"]);
            button.imagePosition = NSImageLeading;
            button.bordered = NO;
            button.contentTintColor = railText();
            button.wantsLayer = YES;
            button.layer.cornerRadius = 5.0;
            button.layer.backgroundColor = [NSColor clearColor].CGColor;
            button.target = self;
            button.action = @selector(buttonClicked:);
            if (row[@"tool"] != nil) {
                button.identifier = [NSString stringWithFormat:@"tool:%d", [row[@"tool"] intValue]];
            } else {
                button.identifier = [NSString stringWithFormat:@"action:%@", row[@"action"]];
            }
            /* El globo añade la pista de uso cuando la herramienta la tiene: el
               muro, por ejemplo, explica que el primer nodo cierra el recinto. */
            NSString *shortcut = row[@"key"] != nil
                ? [NSString stringWithFormat:@"%@ · %@", row[@"title"], row[@"key"]] : row[@"title"];
            button.toolTip = row[@"tip"] != nil
                ? [NSString stringWithFormat:@"%@ — %@", shortcut, row[@"tip"]] : shortcut;
            [self addSubview:button];
            y += kRowHeight + kRowGap;
        }
        y += kGroupGap - kRowGap;
    }

    self.frame = NSMakeRect(NSMinX(self.frame), NSMinY(self.frame), kRailWidth, y + 10.0);
    [self applyActiveState];
}

- (void)buttonClicked:(NSButton *)sender
{
    NSString *identifier = sender.identifier;
    if ([identifier hasPrefix:@"tool:"]) {
        const NormiaTool tool = (NormiaTool) [[identifier substringFromIndex:5] intValue];
        self.tool = tool;
        [self.delegate toolRail:self didChooseTool:tool];
        return;
    }
    if ([identifier isEqualToString:@"action:catalog"]) {
        [self.delegate toolRailDidRequestCatalog:self];
        return;
    }
    if ([identifier hasPrefix:@"action:"]) {
        [self.delegate toolRail:self didChooseAction:[identifier substringFromIndex:7]];
    }
}

/** Marca el botón de la herramienta armada; los demás vuelven al fondo. */
- (void)applyActiveState
{
    for (NSView *view in self.subviews) {
        if (![view isKindOfClass:[NSButton class]]) {
            continue;
        }
        NSButton *button = (NSButton *) view;
        if (![button.identifier hasPrefix:@"tool:"]) {
            continue;
        }
        const NormiaTool tool = (NormiaTool) [[button.identifier substringFromIndex:5] intValue];
        const BOOL active = tool == self.tool;
        button.layer.backgroundColor = active ? railAccent().CGColor : [NSColor clearColor].CGColor;
        button.contentTintColor = active ? [NSColor whiteColor] : railText();
    }
}

- (void)setTool:(NormiaTool)tool
{
    if (_tool == tool) {
        return;
    }
    _tool = tool;
    [self applyActiveState];
    [self setNeedsDisplay:YES];
}

@end
