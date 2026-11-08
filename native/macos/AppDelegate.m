/*
 * Normia nativo · ventana y menú de macOS.
 *
 * Una aplicación AppKit normal: menú en español, ventana que se ajusta, paneles
 * del sistema para abrir y guardar, y aviso al cerrar con cambios pendientes.
 * Sin WebView: el lienzo es `CanvasView` y los datos, el documento en C.
 */
#import "AppDelegate.h"
#import "CanvasView.h"
#import "CatalogPicker.h"
#import "InspectorPanel.h"
#import "ToolRail.h"

#import <QuartzCore/QuartzCore.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/inspect.h"
#include "normia/svg.h"

#include "normia/document.h"
#include "normia/object.h"

static const char *kAppName = "Normia Estudio";

@interface AppDelegate () <ToolRailDelegate, InspectorPanelDelegate>
@property(nonatomic, strong) NSWindow *window;
/* La ventana se compone como un CAD: tira de iconos arriba, paleta a la
   izquierda, lienzo en el centro, inspector a la derecha, línea de comando y
   barra de estado abajo. */
@property(nonatomic, strong) NSView *topBar;
@property(nonatomic, strong) NSView *commandBar;
@property(nonatomic, strong) NSView *statusBar;
@property(nonatomic, strong) ToolRail *rail;
@property(nonatomic, strong) NSScrollView *railScroll;
@property(nonatomic, strong) InspectorPanel *inspector;
@property(nonatomic, strong) NSTextField *commandField;
@property(nonatomic, strong) NSTextField *coordinateLabel;
@property(nonatomic, strong) NSTextField *zoomLabel;
@property(nonatomic, strong) NSSegmentedControl *layoutTabs;
/** Último comando escrito: Intro con la línea vacía lo repite, como en un CAD. */
@property(nonatomic, copy) NSString *lastCommand;
@property(nonatomic) norma_point lastPoint;
@property(nonatomic, strong) CanvasView *canvas;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic) norma_document document;
@property(nonatomic, copy) NSString *filePath;
@property(nonatomic, copy) NSString *planName;
/** Submenú «Abrir reciente», que se rehace cada vez que se abre. */
@property(nonatomic, strong) NSMenu *recentMenu;
/* Cajón de revisión: la lista de hallazgos del núcleo, sin recalcular nada. */
@property(nonatomic, strong) NSView *auditPanel;
@property(nonatomic, strong) NSTextView *auditText;
@property(nonatomic, strong) NSTextField *auditHeader;
@property(nonatomic, strong) NSMutableArray<NSValue *> *findingRanges;
@property(nonatomic) BOOL auditVisible;
@property(nonatomic) norma_inspect_result inspection;
@property(nonatomic) BOOL hasInspection;
/* El catálogo completo (820 piezas) se lee una vez al arrancar y vive hasta que
   se cierra la aplicación: el menú Insertar y el SVG lo consultan desde el
   núcleo, no desde una copia en AppKit. */
@property(nonatomic) norma_object_catalog catalog;
@property(nonatomic) BOOL hasCatalog;
/** Motivo por el que no se cargó el catálogo, para decirlo con la ventana ya abierta. */
@property(nonatomic, copy) NSString *catalogError;

- (void)buildAuditPanel:(NSView *)content;
- (void)toggleAudit:(id)sender;
- (void)layoutCanvas;
- (NSString *)resourcesPath;
- (void)refreshInspection:(id)sender;
- (void)fillAuditText;
- (void)updateCanvasFindings;
- (void)revealSelectedFinding:(id)sender;
- (void)invalidateInspection;
- (void)loadObjectCatalog;
- (void)insertFromPicker:(id)sender;
- (void)buildTopBar:(NSView *)content;
- (void)buildRail:(NSView *)content;
- (void)buildInspector:(NSView *)content;
- (void)buildCommandBar:(NSView *)content;
- (void)buildStatusBar:(NSView *)content;
- (void)layoutChrome;
- (void)applyTool:(NormiaTool)tool;
- (void)runCommand:(id)sender;
- (void)updateStatusReadout;
- (void)toggleGrid:(id)sender;
- (void)duplicateSelection:(id)sender;
- (void)rotateSelection:(id)sender;
- (void)focusLabel:(id)sender;
- (void)exportPlan:(id)sender;
- (void)chooseLayoutTab:(id)sender;
@end

/** Preferencia donde viven los últimos planos: archivo del equipo, nunca la app. */
static NSString *const kRecentKey = @"NormiaRecientes";
static const NSUInteger kRecentLimit = 10;

@implementation AppDelegate

- (instancetype)init
{
    self = [super init];
    if (self != nil) {
        norma_document_init(&_document);
        _planName = @"Plano sin título";
    }
    return self;
}

- (void)dealloc
{
    norma_document_free(&_document);
    if (_hasInspection) {
        norma_inspect_free(&_inspection);
    }
    norma_object_use(NULL);
    norma_object_catalog_free(&_catalog);
}

/* -------------------------------- arranque ------------------------------- */

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
    (void) notification;
    [self loadObjectCatalog];
    [self buildMenu];
    [self buildWindow];
    [self.canvas documentDidLoad];
    self.rail.tool = self.canvas.toolMode;
    [self.inspector reload];
    [self updateStatusReadout];
    [self refreshTitle];
    if (self.catalogError != nil) {
        [self canvasStatus:self.canvas message:self.catalogError];
    }
}

/** Cerrar la ventana con cambios pendientes pregunta antes, igual que ⌘Q. */
- (BOOL)windowShouldClose:(NSWindow *)sender
{
    (void) sender;
    return [self confirmDiscardIfNeeded];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender
{
    (void) sender;
    return YES;
}

/* ------------------------------ la ventana ------------------------------- */

static const CGFloat kTopBarHeight = 48.0;
static const CGFloat kCommandHeight = 30.0;
static const CGFloat kStatusHeight = 28.0;
static const CGFloat kPaletteWidth = 236.0;
static const CGFloat kInspectorWidth = 300.0;

static NSColor *chromeBackground(void) { return [NSColor colorWithCalibratedRed:0.17 green:0.18 blue:0.20 alpha:1.0]; }

- (void)buildWindow
{
    const NSRect frame = NSMakeRect(0, 0, 1440, 900);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                             styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                                                        | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                                               backing:NSBackingStoreBuffered
                                                 defer:NO];
    self.window.title = @"Normia Estudio";
    self.window.delegate = self;
    self.window.minSize = NSMakeSize(1040, 680);
    self.window.backgroundColor = chromeBackground();

    NSView *content = self.window.contentView;
    content.wantsLayer = YES;
    content.layer.backgroundColor = chromeBackground().CGColor;

    /* El lienzo se añade primero: los paneles van encima. */
    self.canvas = [[CanvasView alloc] initWithFrame:NSMakeRect(kPaletteWidth, kStatusHeight + kCommandHeight,
                                                               NSWidth(content.bounds) - kPaletteWidth - kInspectorWidth,
                                                               NSHeight(content.bounds) - kTopBarHeight
                                                                   - kStatusHeight - kCommandHeight)];
    self.canvas.delegate = self;
    self.canvas.document = &_document;
    [content addSubview:self.canvas];

    [self buildTopBar:content];
    [self buildRail:content];
    [self buildInspector:content];
    [self buildAuditPanel:content];
    [self buildCommandBar:content];
    [self buildStatusBar:content];
    [self layoutChrome];

    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [self.window makeFirstResponder:self.canvas];
}

/** Tira de iconos: las herramientas a un clic, como en la captura de referencia. */
- (void)buildTopBar:(NSView *)content
{
    NSView *bar = [[NSView alloc] initWithFrame:NSMakeRect(0, NSHeight(content.bounds) - kTopBarHeight,
                                                           NSWidth(content.bounds), kTopBarHeight)];
    bar.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    bar.wantsLayer = YES;
    bar.layer.backgroundColor = chromeBackground().CGColor;
    self.topBar = bar;

    /* Marca de la aplicación, a la izquierda. */
    NSTextField *brand = [NSTextField labelWithString:@"NORMIA"];
    brand.font = [NSFont systemFontOfSize:12.0 weight:NSFontWeightBold];
    brand.textColor = [NSColor whiteColor];
    brand.frame = NSMakeRect(14.0, 16.0, 74.0, 16.0);
    [bar addSubview:brand];

    NSTextField *edition = [NSTextField labelWithString:@"ESTUDIO"];
    edition.font = [NSFont systemFontOfSize:9.0 weight:NSFontWeightMedium];
    edition.textColor = [NSColor colorWithCalibratedWhite:0.55 alpha:1.0];
    edition.frame = NSMakeRect(14.0, 7.0, 74.0, 12.0);
    [bar addSubview:edition];

    /* Iconos: las doce herramientas del lienzo. */
    NSArray<NSArray<NSString *> *> *icons = @[
        @[ @"cursorarrow", @"Seleccionar (V)", @"0" ],
        @[ @"hand.raised", @"Mano (H)", @"7" ],
        @[ @"rectangle.split.3x1", @"Muro (M)", @"1" ],
        @[ @"line.diagonal", @"Línea (L)", @"8" ],
        @[ @"rectangle", @"Rectángulo (B)", @"9" ],
        @[ @"circle", @"Elipse (O)", @"10" ],
        @[ @"scribble", @"Pluma (P)", @"2" ],
        @[ @"arrow.up.right", @"Arco (A)", @"3" ],
        @[ @"textformat", @"Texto (T)", @"11" ],
        @[ @"ruler", @"Cota (D)", @"4" ],
        @[ @"arrow.turn.up.right", @"Ruta de evacuación (R)", @"5" ],
        @[ @"plus.square", @"Insertar del catálogo", @"6" ],
    ];
    CGFloat x = 96.0;
    NSInteger index = 0;
    for (NSArray<NSString *> *icon in icons) {
        if (index == 6 || index == 9) {
            /* Separadores finos entre los bloques de herramientas. */
            NSBox *separator = [[NSBox alloc] initWithFrame:NSMakeRect(x, 12.0, 1.0, 24.0)];
            separator.boxType = NSBoxSeparator;
            [bar addSubview:separator];
            x += 9.0;
        }
        NSImage *image = [NSImage imageWithSystemSymbolName:icon[0] accessibilityDescription:icon[1]];
        image.template = YES;
        NSButton *button = [[NSButton alloc] initWithFrame:NSMakeRect(x, 9.0, 34.0, 30.0)];
        button.image = image;
        button.imagePosition = NSImageOnly;
        button.bezelStyle = NSBezelStyleTexturedRounded;
        button.contentTintColor = [NSColor colorWithCalibratedWhite:0.88 alpha:1.0];
        button.target = self;
        button.action = @selector(chooseToolButton:);
        button.identifier = [NSString stringWithFormat:@"tool:%@", icon[2]];
        button.toolTip = icon[1];
        [bar addSubview:button];
        x += 37.0;
        index += 1;
    }

    /* A la derecha: buscar, revisar y estado de la herramienta. */
    NSArray<NSArray<NSString *> *> *actions = @[
        @[ @"magnifyingglass", @"Buscar e insertar (⌘⇧I)", @"action:catalog", @"100.0" ],
        @[ @"checklist", @"Revisar el plano (⌘R)", @"action:audit", @"64.0" ],
        @[ @"square.and.arrow.down", @"Exportar SVG", @"action:export", @"64.0" ],
    ];
    CGFloat right = 12.0;
    for (NSArray<NSString *> *action in actions) {
        const CGFloat width = action[3].doubleValue;
        NSButton *button = [[NSButton alloc] initWithFrame:NSMakeRect(NSWidth(bar.bounds) - right - width,
                                                                     9.0, width, 30.0)];
        button.autoresizingMask = NSViewMinXMargin;
        NSImage *image = [NSImage imageWithSystemSymbolName:action[0] accessibilityDescription:action[1]];
        image.template = YES;
        button.image = image;
        button.imagePosition = NSImageLeading;
        button.title = [action[2] isEqualToString:@"action:catalog"] ? @"Buscar" : @"";
        button.font = [NSFont systemFontOfSize:11.0];
        button.bezelStyle = NSBezelStyleTexturedRounded;
        button.contentTintColor = [NSColor colorWithCalibratedWhite:0.88 alpha:1.0];
        button.target = self;
        button.action = @selector(chooseToolButton:);
        button.identifier = action[2];
        button.toolTip = action[1];
        [bar addSubview:button];
        right += width + 8.0;
    }

    NSBox *bottom = [[NSBox alloc] initWithFrame:NSMakeRect(0, 0, NSWidth(bar.bounds), 1.0)];
    bottom.boxType = NSBoxSeparator;
    bottom.autoresizingMask = NSViewWidthSizable;
    [bar addSubview:bottom];

    [content addSubview:bar];
}

/** Paleta de conjuntos de herramientas, en su columna con desplazamiento. */
- (void)buildRail:(NSView *)content
{
    const CGFloat height = NSHeight(content.bounds) - kTopBarHeight - kStatusHeight - kCommandHeight;
    NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, kStatusHeight + kCommandHeight,
                                                                         kPaletteWidth, height)];
    scroll.autoresizingMask = NSViewHeightSizable;
    scroll.hasVerticalScroller = YES;
    scroll.autohidesScrollers = YES;
    scroll.drawsBackground = YES;
    scroll.backgroundColor = [NSColor colorWithCalibratedRed:0.14 green:0.15 blue:0.17 alpha:1.0];
    scroll.borderType = NSNoBorder;

    ToolRail *rail = [[ToolRail alloc] initWithFrame:NSMakeRect(0, 0, kPaletteWidth, [ToolRail preferredHeight])];
    rail.autoresizingMask = NSViewWidthSizable;
    rail.delegate = self;
    scroll.documentView = rail;

    self.rail = rail;
    self.railScroll = scroll;
    [content addSubview:scroll];
}

/** Inspector: capas arriba y ficha del elemento debajo. */
- (void)buildInspector:(NSView *)content
{
    const CGFloat height = NSHeight(content.bounds) - kTopBarHeight - kStatusHeight - kCommandHeight;
    InspectorPanel *panel = [[InspectorPanel alloc] initWithFrame:NSMakeRect(NSWidth(content.bounds) - kInspectorWidth,
                                                                            kStatusHeight + kCommandHeight,
                                                                            kInspectorWidth, height)];
    panel.autoresizingMask = NSViewMinXMargin | NSViewHeightSizable;
    panel.delegate = self;
    panel.document = &_document;
    panel.elementIndex = -1;
    self.inspector = panel;
    [content addSubview:panel];
}

/** Línea de comando: se escribe y se ejecuta con Intro, como en un CAD. */
- (void)buildCommandBar:(NSView *)content
{
    NSView *bar = [[NSView alloc] initWithFrame:NSMakeRect(0, kStatusHeight, NSWidth(content.bounds), kCommandHeight)];
    bar.autoresizingMask = NSViewWidthSizable;
    bar.wantsLayer = YES;
    bar.layer.backgroundColor = [NSColor colorWithCalibratedRed:0.12 green:0.13 blue:0.15 alpha:1.0].CGColor;
    self.commandBar = bar;

    NSTextField *prompt = [NSTextField labelWithString:@"Comando:"];
    prompt.font = [NSFont systemFontOfSize:11.0 weight:NSFontWeightMedium];
    prompt.textColor = [NSColor colorWithCalibratedWhite:0.70 alpha:1.0];
    prompt.frame = NSMakeRect(12.0, 7.0, 66.0, 16.0);
    [bar addSubview:prompt];

    self.commandField = [[NSTextField alloc] initWithFrame:NSMakeRect(80.0, 3.0, NSWidth(content.bounds) - 260.0, 24.0)];
    self.commandField.autoresizingMask = NSViewWidthSizable;
    self.commandField.font = [NSFont userFixedPitchFontOfSize:12.0];
    self.commandField.placeholderString = @"muro · linea · rect · elipse · texto · cota · ruta · capa <nombre> · zoom <n> · ayuda";
    self.commandField.textColor = [NSColor colorWithCalibratedWhite:0.95 alpha:1.0];
    self.commandField.backgroundColor = [NSColor colorWithCalibratedRed:0.18 green:0.19 blue:0.22 alpha:1.0];
    self.commandField.drawsBackground = YES;
    self.commandField.bezeled = YES;
    self.commandField.bezelStyle = NSTextFieldRoundedBezel;
    self.commandField.target = self;
    self.commandField.action = @selector(runCommand:);
    [bar addSubview:self.commandField];

    NSTextField *hint = [NSTextField labelWithString:@"Intro ejecuta · vacío repite"];
    hint.font = [NSFont systemFontOfSize:10.0];
    hint.textColor = [NSColor colorWithCalibratedWhite:0.48 alpha:1.0];
    hint.frame = NSMakeRect(NSWidth(bar.bounds) - 172.0, 8.0, 160.0, 14.0);
    hint.alignment = NSTextAlignmentRight;
    hint.autoresizingMask = NSViewMinXMargin;
    [bar addSubview:hint];

    [content addSubview:bar];
}

/** Barra de estado: pestañas Modelo/Hoja, coordenadas, avisos y zoom. */
- (void)buildStatusBar:(NSView *)content
{
    NSView *bar = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, NSWidth(content.bounds), kStatusHeight)];
    bar.autoresizingMask = NSViewWidthSizable;
    bar.wantsLayer = YES;
    bar.layer.backgroundColor = chromeBackground().CGColor;
    self.statusBar = bar;

    NSBox *top = [[NSBox alloc] initWithFrame:NSMakeRect(0, kStatusHeight - 1.0, NSWidth(bar.bounds), 1.0)];
    top.boxType = NSBoxSeparator;
    top.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    [bar addSubview:top];

    self.layoutTabs = [NSSegmentedControl segmentedControlWithLabels:@[ @"Modelo", @"Hoja A4" ]
                                                       trackingMode:NSSegmentSwitchTrackingSelectOne
                                                             target:self
                                                             action:@selector(chooseLayoutTab:)];
    self.layoutTabs.frame = NSMakeRect(10.0, 3.0, 150.0, 22.0);
    self.layoutTabs.selectedSegment = 0;
    self.layoutTabs.toolTip = @"Modelo: el lienzo abierto. Hoja A4: la referencia de impresión.";
    [bar addSubview:self.layoutTabs];

    self.coordinateLabel = [NSTextField labelWithString:@"X 0 · Y 0 cm"];
    self.coordinateLabel.font = [NSFont userFixedPitchFontOfSize:10.5];
    self.coordinateLabel.textColor = [NSColor colorWithCalibratedWhite:0.78 alpha:1.0];
    self.coordinateLabel.frame = NSMakeRect(170.0, 7.0, 200.0, 15.0);
    [bar addSubview:self.coordinateLabel];

    self.statusLabel = [NSTextField labelWithString:@""];
    self.statusLabel.font = [NSFont systemFontOfSize:11.0];
    self.statusLabel.textColor = [NSColor colorWithCalibratedWhite:0.88 alpha:1.0];
    self.statusLabel.frame = NSMakeRect(378.0, 7.0, NSWidth(bar.bounds) - 378.0 - 150.0, 15.0);
    self.statusLabel.autoresizingMask = NSViewWidthSizable;
    [bar addSubview:self.statusLabel];

    self.zoomLabel = [NSTextField labelWithString:@"1:100 · 100 %"];
    self.zoomLabel.font = [NSFont userFixedPitchFontOfSize:10.5];
    self.zoomLabel.textColor = [NSColor colorWithCalibratedWhite:0.78 alpha:1.0];
    self.zoomLabel.alignment = NSTextAlignmentRight;
    self.zoomLabel.frame = NSMakeRect(NSWidth(bar.bounds) - 144.0, 7.0, 132.0, 15.0);
    self.zoomLabel.autoresizingMask = NSViewMinXMargin;
    [bar addSubview:self.zoomLabel];

    [content addSubview:bar];
}

/** Reparte la ventana: paleta, lienzo, inspector, cajón de revisión y barras. */
- (void)layoutChrome
{
    NSView *content = self.window.contentView;
    const NSRect bounds = content.bounds;
    const CGFloat width = NSWidth(bounds);
    const CGFloat height = NSHeight(bounds);
    const CGFloat bottom = kStatusHeight + kCommandHeight;
    const CGFloat body = height - kTopBarHeight - bottom;

    self.topBar.frame = NSMakeRect(0.0, height - kTopBarHeight, width, kTopBarHeight);
    self.statusBar.frame = NSMakeRect(0.0, 0.0, width, kStatusHeight);
    self.commandBar.frame = NSMakeRect(0.0, kStatusHeight, width, kCommandHeight);
    self.railScroll.frame = NSMakeRect(0.0, bottom, kPaletteWidth, body);
    self.inspector.frame = NSMakeRect(width - kInspectorWidth, bottom, kInspectorWidth, body);

    CGFloat canvasRight = width - kInspectorWidth;
    if (self.auditVisible) {
        const CGFloat auditWidth = 330.0;
        self.auditPanel.frame = NSMakeRect(canvasRight - auditWidth, bottom, auditWidth, body);
        self.auditPanel.hidden = NO;
        canvasRight -= auditWidth;
    } else {
        self.auditPanel.hidden = YES;
    }
    self.canvas.frame = NSMakeRect(kPaletteWidth, bottom, MAX(120.0, canvasRight - kPaletteWidth), body);
    [self.canvas setNeedsDisplay:YES];
    [self updateStatusReadout];
}

- (void)windowDidResize:(NSNotification *)notification
{
    (void) notification;
    [self layoutChrome];
}

/** Lo que se lee abajo a la derecha: la posición del puntero y el zoom. */
- (void)updateStatusReadout
{
    self.coordinateLabel.stringValue = [NSString stringWithFormat:@"X %.0f · Y %.0f cm",
                                                                  self.lastPoint.x, self.lastPoint.y];
    self.zoomLabel.stringValue = [NSString stringWithFormat:@"%s · %ld %%",
                                                            self.document.scale[0] != '\0' ? self.document.scale : "1:100",
                                                            (long) lround([self.canvas zoomPercent])];
}

/* ------------------------------ herramientas ----------------------------- */

- (void)applyTool:(NormiaTool)tool
{
    [self.window makeFirstResponder:self.canvas];
    self.canvas.toolMode = tool;
    self.rail.tool = tool;
}

- (void)chooseToolButton:(NSButton *)sender
{
    NSString *identifier = sender.identifier ?: @"";
    if ([identifier hasPrefix:@"tool:"]) {
        [self applyTool:(NormiaTool)[[identifier substringFromIndex:5] integerValue]];
        return;
    }
    if ([identifier isEqualToString:@"action:catalog"]) {
        [self insertFromPicker:nil];
    } else if ([identifier isEqualToString:@"action:audit"]) {
        [self toggleAudit:nil];
    } else if ([identifier isEqualToString:@"action:export"]) {
        [self exportSvg:nil];
    }
}

- (void)selectToolFromMenu:(NSMenuItem *)sender
{
    [self applyTool:(NormiaTool) sender.tag];
}

/* --------------------------- paleta de herramientas ---------------------- */

- (void)toolRail:(ToolRail *)rail didChooseTool:(NormiaTool)tool
{
    (void) rail;
    [self applyTool:tool];
}

- (void)toolRailDidRequestCatalog:(ToolRail *)rail
{
    (void) rail;
    [self insertFromPicker:nil];
}

- (void)toolRail:(ToolRail *)rail didChooseAction:(NSString *)action
{
    (void) rail;
    if ([action isEqualToString:@"duplicate"]) {
        [self duplicateSelection:nil];
    } else if ([action isEqualToString:@"rotate"]) {
        [self rotateSelection:nil];
    } else if ([action isEqualToString:@"delete"]) {
        [self deleteSelection:nil];
    } else if ([action isEqualToString:@"grid"]) {
        [self toggleGrid:nil];
    } else if ([action isEqualToString:@"label"]) {
        [self focusLabel:nil];
    } else if ([action isEqualToString:@"fit"]) {
        [self zoomToFit:nil];
    } else if ([action isEqualToString:@"catalog"]) {
        [self insertFromPicker:nil];
    }
}

/* ------------------------------- inspector ------------------------------- */

- (void)inspector:(InspectorPanel *)panel didEditDocumentWithMessage:(NSString *)message
{
    (void) panel;
    [self refreshTitle];
    [self invalidateInspection];
    [self.canvas documentDidChangeExternally];
    [self canvasStatus:self.canvas message:message];
    [self updateStatusReadout];
}

- (void)inspector:(InspectorPanel *)panel status:(NSString *)message
{
    (void) panel;
    [self canvasStatus:self.canvas message:message];
}

- (void)inspectorDidRequestDuplicate:(InspectorPanel *)panel
{
    (void) panel;
    [self canvasStatus:self.canvas message:[self.canvas duplicateSelection]];
    [self.inspector reload];
}

- (void)inspectorDidRequestDelete:(InspectorPanel *)panel
{
    (void) panel;
    [self deleteSelection:nil];
    [self.inspector reload];
}

- (void)inspectorDidRequestExit:(InspectorPanel *)panel
{
    (void) panel;
    [self toggleExit:nil];
    [self.inspector reload];
}

- (void)canvas:(CanvasView *)view didChooseTool:(NormiaTool)tool
{
    (void) view;
    self.rail.tool = tool;
}

- (void)canvas:(CanvasView *)view didTrackPlanPoint:(norma_point)point
{
    (void) view;
    self.lastPoint = point;
    [self updateStatusReadout];
}

- (void)canvasSelectionDidChange:(CanvasView *)view
{
    self.inspector.elementIndex = view.selectedElementIndex;
    [self.inspector reload];
}

- (void)duplicateSelection:(id)sender
{
    (void) sender;
    [self.window makeFirstResponder:self.canvas];
    [self canvasStatus:self.canvas message:[self.canvas duplicateSelection]];
    [self.inspector reload];
}

- (void)rotateSelection:(id)sender
{
    (void) sender;
    [self.window makeFirstResponder:self.canvas];
    [self canvasStatus:self.canvas message:[self.canvas rotateSelection]];
    [self.inspector reload];
}

- (void)toggleGrid:(id)sender
{
    (void) sender;
    self.canvas.showsGrid = !self.canvas.showsGrid;
    [self canvasStatus:self.canvas message:self.canvas.showsGrid ? @"Rejilla de referencia visible" : @"Rejilla oculta"];
}

- (void)focusLabel:(id)sender
{
    (void) sender;
    if (self.canvas.selectedElementIndex < 0) {
        [self canvasStatus:self.canvas message:@"Selecciona un elemento para ponerle rótulo."];
        return;
    }
    [self.inspector focusLabelField];
}

- (void)focusSelection:(id)sender
{
    (void) sender;
    [self.canvas focusSelection];
    [self canvasStatus:self.canvas message:@"La selección quedó en el centro de la vista."];
}

- (void)chooseLayoutTab:(id)sender
{
    (void) sender;
    if (self.layoutTabs.selectedSegment == 1) {
        [self zoomToFit:nil];
        [self canvasStatus:self.canvas message:@"Hoja A4: la referencia de impresión y exportación."];
        return;
    }
    [self canvasStatus:self.canvas message:@"Modelo: lienzo abierto, tan grande como haga falta."];
}

/* ----------------------------- línea de comando -------------------------- */

/** Sin tildes y en minúsculas: «Línea», «linea» y «LÍNEA» valen igual. */
static NSString *command_word(NSString *word)
{
    NSString *folded = [word stringByFoldingWithOptions:NSDiacriticInsensitiveSearch
                                                 locale:[NSLocale localeWithLocaleIdentifier:@"es"]];
    return [folded lowercaseString];
}

- (void)runCommand:(id)sender
{
    (void) sender;
    NSString *line = [self.commandField.stringValue stringByTrimmingCharactersInSet:
                      [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    self.commandField.stringValue = @"";

    if (line.length == 0) {
        /* Intro en vacío repite el último comando, como en AutoCAD. */
        line = self.lastCommand;
        if (line.length == 0) {
            return;
        }
    }
    self.lastCommand = line;

    NSMutableArray<NSString *> *words = [NSMutableArray array];
    for (NSString *word in [line componentsSeparatedByCharactersInSet:
                            [NSCharacterSet whitespaceCharacterSet]]) {
        if (word.length > 0) {
            [words addObject:word];
        }
    }
    if (words.count == 0) {
        return;
    }
    NSString *verb = command_word(words[0]);
    NSString *argument = words.count > 1 ? words[1] : nil;

    NSDictionary<NSString *, NSNumber *> *tools = @{
        @"seleccionar": @(NormiaToolSelect), @"seleccion": @(NormiaToolSelect),
        @"mano": @(NormiaToolPan), @"muro": @(NormiaToolWall), @"pared": @(NormiaToolWall),
        @"linea": @(NormiaToolLine), @"rectangulo": @(NormiaToolRect), @"rect": @(NormiaToolRect),
        @"elipse": @(NormiaToolEllipse), @"ovalo": @(NormiaToolEllipse),
        @"pluma": @(NormiaToolPen), @"polilinea": @(NormiaToolPen),
        @"arco": @(NormiaToolArc), @"texto": @(NormiaToolText),
        @"cota": @(NormiaToolDimension), @"medida": @(NormiaToolDimension),
        @"ruta": @(NormiaToolRoute), @"evacuacion": @(NormiaToolRoute),
        @"via": @(NormiaToolRoad), @"calle": @(NormiaToolRoad), @"road": @(NormiaToolRoad),
        @"anden": @(NormiaToolSidewalk), @"sidewalk": @(NormiaToolSidewalk),
        @"paso": @(NormiaToolCrosswalk), @"pasopeatonal": @(NormiaToolCrosswalk),
        @"parqueadero": @(NormiaToolParking), @"parking": @(NormiaToolParking),
        @"lindero": @(NormiaToolProperty), @"property": @(NormiaToolProperty),
        @"tuberia": @(NormiaToolPipe), @"pipe": @(NormiaToolPipe),
        @"canaleta": @(NormiaToolConduit), @"conduit": @(NormiaToolConduit),
    };
    if (tools[verb] != nil) {
        [self applyTool:(NormiaTool) tools[verb].integerValue];
        [self canvasStatus:self.canvas
                   message:[NSString stringWithFormat:@"Herramienta armada: %@", words[0]]];
        return;
    }
    if ([verb isEqualToString:@"insertar"] || [verb isEqualToString:@"insert"]) {
        if (argument != nil) {
            [self.window makeFirstResponder:self.canvas];
            [self.canvas beginInsert:argument];
            return;
        }
        [self insertFromPicker:nil];
        return;
    }
    if ([verb isEqualToString:@"duplicar"] || [verb isEqualToString:@"copia"]) {
        [self duplicateSelection:nil];
        return;
    }
    if ([verb isEqualToString:@"girar"] || [verb isEqualToString:@"rotar"]) {
        [self rotateSelection:nil];
        return;
    }
    if ([verb isEqualToString:@"borrar"] || [verb isEqualToString:@"eliminar"]) {
        [self deleteSelection:nil];
        return;
    }
    if ([verb isEqualToString:@"rejilla"]) {
        [self toggleGrid:nil];
        return;
    }
    if ([verb isEqualToString:@"rotulo"] || [verb isEqualToString:@"etiqueta"]) {
        [self focusLabel:nil];
        return;
    }
    if ([verb isEqualToString:@"capa"] && argument != nil) {
        if (norma_document_set_current_layer(&_document, argument.UTF8String)) {
            [self.inspector reload];
            [self refreshTitle];
            [self canvasStatus:self.canvas message:[NSString stringWithFormat:@"Capa activa: %@", argument]];
        } else {
            [self canvasStatus:self.canvas message:@"Ese nombre de capa no cabe (32 caracteres)."];
        }
        return;
    }
    if ([verb isEqualToString:@"ajustar"] || [verb isEqualToString:@"ajustar-a-la-hoja"]) {
        [self zoomToFit:nil];
        return;
    }
    if ([verb isEqualToString:@"zoom"] && argument != nil) {
        const double percent = [argument stringByReplacingOccurrencesOfString:@"," withString:@"."].doubleValue;
        if (percent >= 10.0 && percent <= 2000.0) {
            [self.canvas zoomToPercent:percent];
            [self updateStatusReadout];
            [self canvasStatus:self.canvas message:[NSString stringWithFormat:@"Zoom %.0f %%", percent]];
        } else {
            [self canvasStatus:self.canvas message:@"El zoom va entre 10 y 2000 %."];
        }
        return;
    }
    if ([verb isEqualToString:@"revisar"]) {
        if (!self.auditVisible) {
            [self toggleAudit:nil];
        } else {
            [self refreshInspection:nil];
        }
        return;
    }
    if ([verb isEqualToString:@"deshacer"]) {
        [self undoEdit:nil];
        return;
    }
    if ([verb isEqualToString:@"rehacer"]) {
        [self redoEdit:nil];
        return;
    }
    if ([verb isEqualToString:@"guardar"]) {
        [self savePlan:nil];
        return;
    }
    if ([verb isEqualToString:@"exportar"]) {
        [self exportSvg:nil];
        return;
    }
    if ([verb isEqualToString:@"ayuda"] || [verb isEqualToString:@"help"] || [verb isEqualToString:@"?"]) {
        [self showHelp:nil];
        return;
    }
    if ([verb isEqualToString:@"salir"] || [verb isEqualToString:@"quit"]) {
        [NSApp terminate:nil];
        return;
    }
    [self canvasStatus:self.canvas
               message:[NSString stringWithFormat:@"No conozco «%@». Escribe «ayuda» para ver los comandos.", words[0]]];
}

/* --------------------------- cajón de revisión ---------------------------- */

/**
 * El cajón de la derecha: el informe del núcleo tal cual, con los hallazgos en
 * orden y un botón para llevar el plano al punto del hallazgo elegido.
 *
 * No calcula nada: llama a `norma_inspect_document()`, la misma receta que
 * `norma-core --inspect`, para que la ventana y la web no puedan decir cosas
 * distintas.
 */
- (void)buildAuditPanel:(NSView *)content
{
    const CGFloat width = 330.0;
    const CGFloat height = NSHeight(content.bounds);
    NSView *panel = [[NSView alloc] initWithFrame:NSMakeRect(NSWidth(content.bounds) - width, 0.0,
                                                             width, height)];
    panel.autoresizingMask = NSViewMinXMargin | NSViewHeightSizable;

    self.auditHeader = [NSTextField labelWithString:@"Revisión del plano"];
    self.auditHeader.font = [NSFont systemFontOfSize:12.0 weight:NSFontWeightSemibold];
    self.auditHeader.textColor = [NSColor colorWithCalibratedWhite:0.92 alpha:1.0];
    self.auditHeader.frame = NSMakeRect(14.0, height - 36.0, width - 28.0, 28.0);
    self.auditHeader.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    [panel addSubview:self.auditHeader];

    NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0.0, 46.0, width, height - 90.0)];
    scroll.hasVerticalScroller = YES;
    scroll.drawsBackground = NO;
    scroll.borderType = NSNoBorder;
    scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    NSTextView *text = [[NSTextView alloc] initWithFrame:scroll.bounds];
    text.editable = NO;
    text.selectable = YES;
    text.richText = NO;
    text.drawsBackground = NO;
    text.font = [NSFont systemFontOfSize:12.0];
    text.textColor = [NSColor colorWithCalibratedWhite:0.90 alpha:1.0];
    text.textContainerInset = NSMakeSize(12.0, 10.0);
    text.verticallyResizable = YES;
    text.horizontallyResizable = NO;
    text.autoresizingMask = NSViewWidthSizable;
    text.textContainer.widthTracksTextView = YES;
    scroll.documentView = text;

    self.auditText = text;
    self.findingRanges = [NSMutableArray array];
    [panel addSubview:scroll];

    NSButton *reveal = [NSButton buttonWithTitle:@"Ver en el plano" target:self
                                          action:@selector(revealSelectedFinding:)];
    reveal.frame = NSMakeRect(14.0, 10.0, width - 28.0, 28.0);
    reveal.autoresizingMask = NSViewWidthSizable | NSViewMaxYMargin;
    reveal.bezelStyle = NSBezelStyleRounded;
    [panel addSubview:reveal];

    panel.hidden = YES;
    self.auditPanel = panel;
    [content addSubview:panel];
}

/** Muestra u oculta el cajón; al abrirlo, revisa el plano de nuevo. */
- (void)toggleAudit:(id)sender
{
    (void) sender;
    self.auditVisible = !self.auditVisible;
    self.auditPanel.hidden = !self.auditVisible;
    [self layoutCanvas];
    if (self.auditVisible) {
        [self refreshInspection:nil];
    }
    [self.window makeFirstResponder:self.auditVisible ? self.auditText : self.canvas];
}

/** El lienzo ocupa lo que deja el cajón y la barra de estado. */
- (void)layoutCanvas
{
    [self layoutChrome];
}

/** Carpeta de catálogos dentro del paquete (`Contents/Resources/resources`). */
- (NSString *)resourcesPath
{
    return [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"resources"];
}

/** Revisa el plano y llena el cajón. Una sola llamada al núcleo. */
- (void)refreshInspection:(id)sender
{
    (void) sender;
    if (self.hasInspection) {
        norma_inspect_free(&_inspection);
        self.hasInspection = NO;
    }
    char error[256] = "";
    const NSString *resources = [self resourcesPath];
    const int ok = norma_inspect_document(&_document, resources.fileSystemRepresentation, &_inspection,
                                          error, sizeof(error));
    if (!ok) {
        [self canvasStatus:self.canvas message:[NSString stringWithUTF8String:error]];
        return;
    }
    self.hasInspection = YES;
    [self fillAuditText];
    [self updateCanvasFindings];
    [self canvasStatus:self.canvas message:[NSString stringWithFormat:
                                            @"Revisión · %lu hallazgos · %ld personas · %ld salidas"
                                            @" · criterios de la app, no certificación",
                                            (unsigned long) _inspection.findings.count,
                                            _inspection.summary.persons, _inspection.summary.exit_count]];
}

/** Arma el texto del cajón y recuerda el tramo de cada hallazgo. */
- (void)fillAuditText
{
    [self.findingRanges removeAllObjects];
    NSMutableString *body = [NSMutableString string];
    const norma_inspect_summary *summary = &_inspection.summary;
    [body appendFormat:@"%ld personas · %.1f m² libres · %ld salidas\n", summary->persons,
                       summary->free_area_m2, summary->exit_count];
    if (summary->has_longest) {
        [body appendFormat:@"Recorrido más largo: %.1f m\n", summary->longest_travel_m];
    }
    if (!_inspection.has_library) {
        [body appendString:@"Sin catálogo de señalización: no se revisó la señalización.\n"];
    }
    if (!_inspection.has_ext_norms) {
        [body appendString:@"Sin tablas de extintores: no se revisó el equipamiento.\n"];
    }
    [body appendString:@"\n"];

    for (size_t index = 0; index < _inspection.findings.count; index += 1) {
        const norma_finding *finding = &_inspection.findings.items[index];
        const char *mark = strcmp(finding->severity, "high") == 0 ? "▲"
                          : strcmp(finding->severity, "medium") == 0 ? "●"
                          : strcmp(finding->severity, "low") == 0 ? "○" : "·";
        const NSUInteger start = body.length;
        [body appendFormat:@"%s %s\n%s\n\n", mark, finding->title, finding->detail];
        [self.findingRanges addObject:[NSValue valueWithRange:NSMakeRange(start, body.length - start)]];
    }
    if (_inspection.findings.count == 0) {
        [body appendString:@"Sin hallazgos con los criterios de la app.\n"];
    }

    self.auditHeader.stringValue = [NSString stringWithFormat:@"Revisión · %lu hallazgos",
                                    (unsigned long) _inspection.findings.count];
    self.auditText.string = body;
}

/** Copia al lienzo los puntos de los hallazgos para dibujarlos como anillos. */
- (void)updateCanvasFindings
{
    norma_point points[64];
    size_t count = 0;
    for (size_t index = 0; index < _inspection.findings.count && count < 64; index += 1) {
        const norma_finding *finding = &_inspection.findings.items[index];
        if (finding->has_position) {
            points[count] = finding->position;
            count += 1;
        }
    }
    [self.canvas setFindingPoints:points count:count];
}

/** Lleva el plano al punto del hallazgo donde está el cursor del cajón. */
- (void)revealSelectedFinding:(id)sender
{
    (void) sender;
    if (!self.hasInspection) {
        [self refreshInspection:nil];
    }
    if (!self.hasInspection || self.findingRanges.count == 0) {
        return;
    }
    const NSUInteger caret = self.auditText.selectedRange.location;
    NSUInteger index = 0;
    for (NSUInteger slot = 0; slot < self.findingRanges.count; slot += 1) {
        const NSRange range = self.findingRanges[slot].rangeValue;
        if (caret >= range.location && caret < NSMaxRange(range)) {
            index = slot;
            break;
        }
        if (caret >= NSMaxRange(range)) {
            index = slot;
        }
    }
    const norma_finding *finding = &_inspection.findings.items[index];
    if (!finding->has_position) {
        [self canvasStatus:self.canvas message:@"Ese hallazgo no tiene un punto en el plano."];
        return;
    }
    [self.canvas focusOnPoint:finding->position];
    [self canvasStatus:self.canvas message:[NSString stringWithUTF8String:finding->title]];
}

- (void)buildMenu
{
    NSMenu *menubar = [[NSMenu alloc] init];

    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:kAppName ? @(kAppName) : @"Normia"];
    [appMenu addItemWithTitle:@"Acerca de Normia Estudio" action:@selector(showAbout:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Ocultar Normia Estudio" action:@selector(hide:) keyEquivalent:@"h"];
    [appMenu addItemWithTitle:@"Salir de Normia Estudio" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    [menubar addItem:appItem];

    NSMenuItem *fileItem = [[NSMenuItem alloc] init];
    NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"Archivo"];
    [fileMenu addItemWithTitle:@"Plano nuevo" action:@selector(newPlan:) keyEquivalent:@"n"];
    [fileMenu addItemWithTitle:@"Abrir…" action:@selector(openPlan:) keyEquivalent:@"o"];
    NSMenuItem *recentItem = [[NSMenuItem alloc] initWithTitle:@"Abrir reciente" action:nil keyEquivalent:@""];
    self.recentMenu = [[NSMenu alloc] initWithTitle:@"Abrir reciente"];
    self.recentMenu.delegate = self;
    recentItem.submenu = self.recentMenu;
    [fileMenu addItem:recentItem];
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItemWithTitle:@"Guardar" action:@selector(savePlan:) keyEquivalent:@"s"];
    NSMenuItem *saveAs = [fileMenu addItemWithTitle:@"Guardar como…" action:@selector(savePlanAs:) keyEquivalent:@"S"];
    saveAs.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItemWithTitle:@"Imprimir…" action:@selector(printPlan:) keyEquivalent:@"p"];
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItemWithTitle:@"Exportar SVG…" action:@selector(exportSvg:) keyEquivalent:@"E"];
    [fileMenu addItemWithTitle:@"Exportar PDF…" action:@selector(exportPdf:) keyEquivalent:@""];
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItemWithTitle:@"Cerrar ventana" action:@selector(performClose:) keyEquivalent:@"w"];
    fileItem.submenu = fileMenu;
    [menubar addItem:fileItem];

    NSMenuItem *editItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Editar"];
    [editMenu addItemWithTitle:@"Deshacer" action:@selector(undoEdit:) keyEquivalent:@"z"];
    NSMenuItem *redo = [editMenu addItemWithTitle:@"Rehacer" action:@selector(redoEdit:) keyEquivalent:@"Z"];
    redo.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Borrar lo seleccionado" action:@selector(deleteSelection:) keyEquivalent:@""];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Cancelar herramienta" action:@selector(cancelTool:) keyEquivalent:@"."];
    editItem.submenu = editMenu;
    [menubar addItem:editItem];

    NSMenuItem *viewItem = [[NSMenuItem alloc] init];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"Ver"];
    [viewMenu addItemWithTitle:@"Ajustar a la ventana" action:@selector(zoomToFit:) keyEquivalent:@"0"];
    [viewMenu addItemWithTitle:@"Acercar" action:@selector(zoomIn:) keyEquivalent:@"+"];
    [viewMenu addItemWithTitle:@"Alejar" action:@selector(zoomOut:) keyEquivalent:@"-"];
    [viewMenu addItemWithTitle:@"Zoom 100 %" action:@selector(zoomReset:) keyEquivalent:@"1"];
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItemWithTitle:@"Revisar plano" action:@selector(toggleAudit:) keyEquivalent:@"r"];
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItemWithTitle:@"Pantalla completa" action:@selector(toggleFullScreen:) keyEquivalent:@"f"];
    viewItem.submenu = viewMenu;
    [menubar addItem:viewItem];

    NSMenuItem *insertItem = [[NSMenuItem alloc] init];
    NSMenu *insertMenu = [[NSMenu alloc] initWithTitle:@"Insertar"];
    /* El lienzo usa letras sueltas para las herramientas, así que aquí los atajos
       van con Control: ⌃ no produce caracteres muertos como ⌥ en un teclado
       en español. */
    NSMenuItem *searchItem = [insertMenu addItemWithTitle:@"Buscar en el catálogo…"
                                                   action:@selector(insertFromPicker:)
                                            keyEquivalent:@"i"];
    searchItem.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [insertMenu addItem:[NSMenuItem separatorItem]];

    /*
     * Un submenú por familia: con el catálogo completo son 820 piezas y 41
     * familias, así que una lista plana no se podría recorrer. Las tres puertas
     * se quedan arriba, con su tecla, porque son lo que se inserta todo el rato.
     */
    NSArray<NSString *> *doorKeys = @[@"u", @"U", @"g"];
    size_t door_index = 0;
    const size_t families = norma_object_family_count();
    for (size_t family = 0; family < families; family += 1) {
        const char *key = norma_object_family_at(family);
        if (key == NULL) {
            continue;
        }
        if (strcmp(key, "door") == 0) {
            for (size_t position = 0; position < norma_object_count_in(key); position += 1) {
                const norma_object_spec *spec = norma_object_at_in(key, position);
                NSString *title = [NSString stringWithFormat:@"%s", spec->name];
                NSString *equivalent = door_index < doorKeys.count ? doorKeys[door_index] : @"";
                NSMenuItem *item = [insertMenu addItemWithTitle:title
                                                        action:@selector(insertObject:)
                                                 keyEquivalent:equivalent];
                item.keyEquivalentModifierMask = NSEventModifierFlagControl;
                item.representedObject = [NSString stringWithFormat:@"%s", spec->type];
                door_index += 1;
            }
            continue;
        }
        NSMenu *submenu = [[NSMenu alloc] initWithTitle:@"Familia"];
        const size_t total = norma_object_count_in(key);
        for (size_t position = 0; position < total; position += 1) {
            const norma_object_spec *spec = norma_object_at_in(key, position);
            NSMenuItem *item = [submenu addItemWithTitle:[NSString stringWithFormat:@"%s", spec->name]
                                                  action:@selector(insertObject:)
                                           keyEquivalent:@""];
            item.representedObject = [NSString stringWithFormat:@"%s", spec->type];
            item.toolTip = [NSString stringWithFormat:@"%s · %s", spec->type, spec->family_label];
        }
        NSMenuItem *familyItem = [[NSMenuItem alloc] init];
        familyItem.title = [NSString stringWithFormat:@"%s (%lu)", norma_object_family_label_at(family),
                                                      (unsigned long) total];
        familyItem.submenu = submenu;
        [insertMenu addItem:familyItem];
    }
    if (!self.hasCatalog) {
        NSMenuItem *note = [insertMenu addItemWithTitle:@"Sin catálogo completo: solo once piezas"
                                                 action:nil
                                          keyEquivalent:@""];
        note.enabled = NO;
    }
    [insertMenu addItem:[NSMenuItem separatorItem]];
    NSMenuItem *exitItem = [insertMenu addItemWithTitle:@"Marcar o desmarcar salida de emergencia"
                                                 action:@selector(toggleExit:)
                                          keyEquivalent:@"E"];
    exitItem.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    insertItem.submenu = insertMenu;
    [menubar addItem:insertItem];

    /* Menú Herramientas: lo mismo que la paleta, con atajos para lo que más se
       usa. Las letras sueltas son del lienzo (V, M, L…), así que aquí van con
       ⌘ para no robarle el teclado. */
    NSMenuItem *toolsItem = [[NSMenuItem alloc] init];
    NSMenu *toolsMenu = [[NSMenu alloc] initWithTitle:@"Herramientas"];
    NSArray<NSArray *> *toolEntries = @[
        @[ @"Seleccionar", @(NormiaToolSelect) ],
        @[ @"Mano", @(NormiaToolPan) ],
        @[ @"Muro", @(NormiaToolWall) ],
        @[ @"Línea", @(NormiaToolLine) ],
        @[ @"Rectángulo", @(NormiaToolRect) ],
        @[ @"Elipse", @(NormiaToolEllipse) ],
        @[ @"Pluma de nodos", @(NormiaToolPen) ],
        @[ @"Arco de tres puntos", @(NormiaToolArc) ],
        @[ @"Texto", @(NormiaToolText) ],
        @[ @"Cota", @(NormiaToolDimension) ],
        @[ @"Ruta de evacuación", @(NormiaToolRoute) ],
        @[ @"Vía", @(NormiaToolRoad) ],
        @[ @"Andén", @(NormiaToolSidewalk) ],
        @[ @"Paso peatonal", @(NormiaToolCrosswalk) ],
        @[ @"Parqueadero", @(NormiaToolParking) ],
        @[ @"Lindero", @(NormiaToolProperty) ],
        @[ @"Tubería", @(NormiaToolPipe) ],
        @[ @"Canaleta", @(NormiaToolConduit) ],
    ];
    for (NSArray *entry in toolEntries) {
        NSMenuItem *item = [toolsMenu addItemWithTitle:entry[0]
                                                action:@selector(selectToolFromMenu:)
                                         keyEquivalent:@""];
        item.tag = [entry[1] integerValue];
        item.toolTip = @"Herramienta de la paleta; también con su letra en el lienzo";
    }
    [toolsMenu addItem:[NSMenuItem separatorItem]];
    NSMenuItem *duplicate = [toolsMenu addItemWithTitle:@"Duplicar lo seleccionado"
                                                 action:@selector(duplicateSelection:)
                                          keyEquivalent:@"d"];
    duplicate.toolTip = @"Copia el elemento 20 cm a la derecha";
    NSMenuItem *rotate = [toolsMenu addItemWithTitle:@"Girar 90°"
                                              action:@selector(rotateSelection:)
                                       keyEquivalent:@"r"];
    rotate.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagOption;
    [toolsMenu addItemWithTitle:@"Poner o cambiar el rótulo"
                         action:@selector(focusLabel:)
                  keyEquivalent:@"l"];
    NSMenuItem *grid = [toolsMenu addItemWithTitle:@"Mostrar u ocultar la rejilla"
                                            action:@selector(toggleGrid:)
                                     keyEquivalent:@"g"];
    grid.toolTip = @"Rejilla de referencia: no se imprime ni sale en el SVG";
    [toolsMenu addItem:[NSMenuItem separatorItem]];
    [toolsMenu addItemWithTitle:@"Enfocar lo seleccionado" action:@selector(focusSelection:) keyEquivalent:@""];
    toolsItem.submenu = toolsMenu;
    [menubar addItem:toolsItem];

    NSMenuItem *helpItem = [[NSMenuItem alloc] init];
    NSMenu *helpMenu = [[NSMenu alloc] initWithTitle:@"Ayuda"];
    [helpMenu addItemWithTitle:@"Cómo se usa el lienzo" action:@selector(showHelp:) keyEquivalent:@"?"];
    helpItem.submenu = helpMenu;
    [menubar addItem:helpItem];

    NSApp.mainMenu = menubar;
}

/* ------------------------------- catálogo -------------------------------- */

/**
 * Carga el catálogo completo de objetos y señalización que viaja dentro del
 * paquete (`Contents/Resources/resources`). Sin él la ventana sigue abriendo con
 * las once piezas de respaldo; el menú y el SVG dicen cuál se está usando.
 */
- (void)loadObjectCatalog
{
    char error[256] = "";
    const NSString *resources = [self resourcesPath];
    if (norma_object_catalog_load(&_catalog, resources.fileSystemRepresentation, error, sizeof(error))
        && norma_object_use(&_catalog)) {
        self.hasCatalog = YES;
        return;
    }
    self.hasCatalog = NO;
    self.catalogError = [NSString stringWithFormat:@"Sin catálogo completo (%s): quedan las once piezas de respaldo.",
                                                   error];
}

/* ------------------------------- recientes ------------------------------- */

/** Los últimos planos abiertos o guardados, sin los que ya no están en el disco. */
- (NSArray<NSString *> *)recentPaths
{
    NSArray *stored = [[NSUserDefaults standardUserDefaults] arrayForKey:kRecentKey];
    NSMutableArray<NSString *> *paths = [NSMutableArray array];
    for (id item in stored) {
        if (![item isKindOfClass:[NSString class]]) {
            continue;
        }
        NSString *path = (NSString *) item;
        if ([[NSFileManager defaultManager] fileExistsAtPath:path]) {
            [paths addObject:path];
        }
    }
    return paths;
}

- (void)rememberPath:(NSString *)path
{
    if (path.length == 0) {
        return;
    }
    NSMutableArray<NSString *> *paths = [NSMutableArray arrayWithObject:path];
    for (NSString *other in [self recentPaths]) {
        if (![other isEqualToString:path]) {
            [paths addObject:other];
        }
        if (paths.count >= kRecentLimit) {
            break;
        }
    }
    [[NSUserDefaults standardUserDefaults] setObject:paths forKey:kRecentKey];
}

- (void)rebuildRecentMenu
{
    [self.recentMenu removeAllItems];
    NSArray<NSString *> *paths = [self recentPaths];
    if (paths.count == 0) {
        NSMenuItem *empty = [[NSMenuItem alloc] initWithTitle:@"Todavía no hay planos recientes"
                                                      action:nil keyEquivalent:@""];
        empty.enabled = NO;
        [self.recentMenu addItem:empty];
        return;
    }
    for (NSString *path in paths) {
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:path.lastPathComponent
                                                     action:@selector(openRecent:)
                                              keyEquivalent:@""];
        item.representedObject = path;
        item.toolTip = path;
        [self.recentMenu addItem:item];
    }
    [self.recentMenu addItem:[NSMenuItem separatorItem]];
    [self.recentMenu addItemWithTitle:@"Limpiar la lista" action:@selector(clearRecents:) keyEquivalent:@""];
}

- (void)menuNeedsUpdate:(NSMenu *)menu
{
    if (menu == self.recentMenu) {
        [self rebuildRecentMenu];
    }
}

- (void)openRecent:(NSMenuItem *)sender
{
    NSString *path = sender.representedObject;
    if (path.length == 0) {
        return;
    }
    if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        [self showError:@"Ese archivo ya no está" detail:path];
        [self rebuildRecentMenu];
        return;
    }
    if (![self confirmDiscardIfNeeded]) {
        return;
    }
    [self loadPlanAtPath:path];
}

- (void)clearRecents:(id)sender
{
    (void) sender;
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:kRecentKey];
    [self rebuildRecentMenu];
}

/* ------------------------------ documentos ------------------------------- */

- (void)refreshTitle
{
    NSString *name = self.planName.length > 0 ? self.planName : @"Plano sin título";
    const BOOL dirty = self.document.dirty != 0;
    self.window.title = [NSString stringWithFormat:@"%@%@ — Normia Estudio", name, dirty ? @" •" : @""];
    [self.window setDocumentEdited:dirty];
    if (self.filePath.length > 0) {
        [self.window setRepresentedFilename:self.filePath];
    }
}

/** Cualquier edición deja la revisión vieja: se vuelve a pedir con ⌘R. */
- (void)invalidateInspection
{
    if (self.hasInspection) {
        norma_inspect_free(&_inspection);
        self.hasInspection = NO;
    }
    [self.canvas setFindingPoints:NULL count:0];
    self.auditHeader.stringValue = @"Revisión · sin actualizar";
    self.auditText.string = @"El plano cambió. Pulsa ⌘R para revisarlo de nuevo.";
    [self.findingRanges removeAllObjects];
}

- (void)canvasDidChange:(CanvasView *)view
{
    (void) view;
    [self refreshTitle];
    if (self.hasInspection) {
        [self invalidateInspection];
    }
    /* La ficha sigue al plano: al arrastrar, el inspector enseña las cifras
       nuevas. */
    if (self.inspector != nil) {
        self.inspector.elementIndex = self.canvas.selectedElementIndex;
        [self.inspector reload];
    }
}

- (void)canvasStatus:(CanvasView *)view message:(NSString *)message
{
    (void) view;
    self.statusLabel.stringValue = message != nil ? message : @"";
}

- (BOOL)confirmDiscardIfNeeded
{
    if (self.document.dirty == 0) {
        return YES;
    }
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Hay cambios sin guardar";
    alert.informativeText = @"El plano tiene cambios que todavía no están en el archivo.";
    [alert addButtonWithTitle:@"Guardar"];
    [alert addButtonWithTitle:@"Descartar"];
    [alert addButtonWithTitle:@"Cancelar"];
    const NSModalResponse response = [alert runModal];
    if (response == NSAlertFirstButtonReturn) {
        [self savePlan:nil];
        return self.document.dirty == 0;
    }
    return response == NSAlertSecondButtonReturn;
}

- (void)newPlan:(id)sender
{
    (void) sender;
    if (![self confirmDiscardIfNeeded]) {
        return;
    }
    norma_document_clear(&_document);
    norma_document_init_with(&_document, 1123.0, 794.0, NORMA_UNIT_CM, "1:100");
    self.filePath = nil;
    self.planName = @"Plano sin título";
    [self.canvas documentDidLoad];
    self.rail.tool = self.canvas.toolMode;
    [self.inspector reload];
    [self updateStatusReadout];
    [self refreshTitle];
    [self canvasStatus:self.canvas message:@"Plano nuevo. Pulsa M para dibujar un muro."];
    [self invalidateInspection];
}

- (void)openPlan:(id)sender
{
    (void) sender;
    if (![self confirmDiscardIfNeeded]) {
        return;
    }
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowedContentTypes = @[ UTTypeJSON ];
    panel.allowsMultipleSelection = NO;
    panel.message = @"Abrir un plano de Normia";
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
        return;
    }
    [self loadPlanAtPath:panel.URL.path];
}

- (void)loadPlanAtPath:(NSString *)path
{
    NSError *error = nil;
    const NSString *text = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
    if (text == nil) {
        [self showError:@"No se pudo leer el archivo" detail:error.localizedDescription];
        return;
    }
    char message[256] = {0};
    const char *raw = text.UTF8String;
    if (!norma_document_from_json(&_document, raw, strlen(raw), message, sizeof(message))) {
        [self showError:@"El archivo no se pudo abrir" detail:@(message)];
        return;
    }
    self.filePath = path;
    self.planName = path.lastPathComponent.stringByDeletingPathExtension;
    [self rememberPath:path];
    [self.canvas documentDidLoad];
    self.rail.tool = self.canvas.toolMode;
    [self.inspector reload];
    [self updateStatusReadout];
    [self refreshTitle];
    [self canvasStatus:self.canvas message:[NSString stringWithFormat:@"Plano abierto · %@", self.planName]];
    [self invalidateInspection];
}

- (void)savePlan:(id)sender
{
    (void) sender;
    if (self.filePath.length == 0) {
        [self savePlanAs:sender];
        return;
    }
    [self writePlanTo:self.filePath];
}

- (void)savePlanAs:(id)sender
{
    (void) sender;
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.allowedContentTypes = @[ UTTypeJSON ];
    panel.nameFieldStringValue = [NSString stringWithFormat:@"%@.json", self.planName ?: @"plano"];
    panel.message = @"Guardar el plano";
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
        return;
    }
    [self writePlanTo:panel.URL.path];
}

- (void)writePlanTo:(NSString *)path
{
    char *json = norma_document_to_json(&_document, self.planName.UTF8String);
    if (json == NULL) {
        [self showError:@"No se pudo preparar el archivo" detail:@"El documento no produjo ningún texto."];
        return;
    }
    const NSString *text = @(json);
    free(json);
    NSError *error = nil;
    if (![text writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
        [self showError:@"No se pudo guardar" detail:error.localizedDescription];
        return;
    }
    self.filePath = path;
    _document.dirty = 0;
    [self rememberPath:path];
    [self refreshTitle];
    [self canvasStatus:self.canvas message:[NSString stringWithFormat:@"Plano guardado · %@", path.lastPathComponent]];
}

/* -------------------------------- acciones ------------------------------- */

- (void)undoEdit:(id)sender
{
    (void) sender;
    if (norma_document_undo(&_document)) {
        [self.canvas setNeedsDisplay:YES];
        [self refreshTitle];
        [self.inspector reload];
        [self canvasStatus:self.canvas message:@"Deshecho."];
    }
}

- (void)redoEdit:(id)sender
{
    (void) sender;
    if (norma_document_redo(&_document)) {
        [self.canvas setNeedsDisplay:YES];
        [self refreshTitle];
        [self.inspector reload];
        [self canvasStatus:self.canvas message:@"Rehecho."];
    }
}

- (void)deleteSelection:(id)sender
{
    (void) sender;
    [self.window makeFirstResponder:self.canvas];
    [self.canvas deleteSelection];
    [self.inspector reload];
}

- (void)exportSvg:(id)sender
{
    (void) sender;
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.allowedContentTypes = @[ UTTypeSVG ];
    panel.nameFieldStringValue = [NSString stringWithFormat:@"%@.svg", self.planName ?: @"plano"];
    panel.message = @"Exportar el plano en SVG con escala física";
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
        return;
    }
    norma_svg_options options;
    options.grid = 1;
    options.band = 1;
    options.title = self.planName.UTF8String;
    /* El catálogo completo ya está activo (`loadObjectCatalog`): las 820 piezas
       salen con su pictograma. `library` se deja en NULL porque el catálogo de
       objetos ya resuelve tanto los objetos CAD como las señales. */
    options.library = NULL;
    char *svg = norma_document_to_svg(&_document, &options);
    if (svg == NULL) {
        [self showError:@"No se pudo componer el SVG" detail:@"El documento no produjo ningún texto."];
        return;
    }
    const NSString *text = @(svg);
    free(svg);
    NSError *error = nil;
    if (![text writeToFile:panel.URL.path atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
        [self showError:@"No se pudo guardar el SVG" detail:error.localizedDescription];
        return;
    }
    [self canvasStatus:self.canvas message:[NSString stringWithFormat:@"SVG exportado · %@", panel.URL.lastPathComponent]];
}

- (void)printPlan:(id)sender
{
    (void) sender;
    NSPrintInfo *info = [[NSPrintInfo sharedPrintInfo] copy]; /* no tocar el compartido */
    info.orientation = NSPaperOrientationLandscape;
    [info setPaperSize:NSMakeSize(842.0, 595.0)]; /* A4 horizontal, en puntos */
    info.horizontalPagination = NSPrintingPaginationModeFit;
    info.verticalPagination = NSPrintingPaginationModeFit;
    info.horizontallyCentered = YES;
    info.verticallyCentered = YES;
    info.topMargin = 24.0;
    info.bottomMargin = 24.0;
    info.leftMargin = 24.0;
    info.rightMargin = 24.0;

    self.canvas.printing = YES;
    NSPrintOperation *operation = [NSPrintOperation printOperationWithView:self.canvas printInfo:info];
    operation.showsPrintPanel = YES;
    operation.showsProgressPanel = YES;
    [operation runOperation];
    self.canvas.printing = NO;
    [self.canvas setNeedsDisplay:YES];
    [self canvasStatus:self.canvas message:@"Plano enviado a la impresión"];
}

- (void)exportPdf:(id)sender
{
    (void) sender;
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.allowedContentTypes = @[ UTTypePDF ];
    panel.nameFieldStringValue = [NSString stringWithFormat:@"%@.pdf", self.planName ?: @"plano"];
    panel.message = @"Exportar el plano en PDF";
    if ([panel runModal] != NSModalResponseOK || panel.URL == nil) {
        return;
    }
    self.canvas.printing = YES;
    NSData *pdf = [self.canvas dataWithPDFInsideRect:self.canvas.bounds];
    self.canvas.printing = NO;
    [self.canvas setNeedsDisplay:YES];
    if (pdf == nil || ![pdf writeToFile:panel.URL.path atomically:YES]) {
        [self showError:@"No se pudo escribir el PDF" detail:panel.URL.path];
        return;
    }
    [self canvasStatus:self.canvas message:[NSString stringWithFormat:@"PDF exportado · %@", panel.URL.lastPathComponent]];
}

- (void)cancelTool:(id)sender
{
    (void) sender;
    [self.canvas cancelDraft];
}

- (void)zoomIn:(id)sender
{
    (void) sender;
    [self.canvas zoomIn]
    [self updateStatusReadout];
}

- (void)zoomOut:(id)sender
{
    (void) sender;
    [self.canvas zoomOut]
    [self updateStatusReadout];
}

- (void)zoomReset:(id)sender
{
    (void) sender;
    [self.canvas zoomReset]
    [self updateStatusReadout];
}

- (void)zoomToFit:(id)sender
{
    (void) sender;
    [self.canvas zoomToFit]
    [self updateStatusReadout];
}

/* ------------------------------- insertar -------------------------------- */

- (void)insertObject:(NSMenuItem *)sender
{
    NSString *type = sender.representedObject;
    if (![type isKindOfClass:[NSString class]]) {
        return;
    }
    [self.window makeFirstResponder:self.canvas];
    [self.canvas beginInsert:type];
}

/** Buscar en las 820 piezas y colocar la elegida. */
- (void)insertFromPicker:(id)sender
{
    (void) sender;
    NSString *type = [NormiaCatalogPicker pickFromCatalog:&_catalog
                                                forWindow:self.window
                                                   prompt:@"Insertar del catálogo (820 objetos y señales)"];
    if (type == nil) {
        return;
    }
    [self.window makeFirstResponder:self.canvas];
    [self.canvas beginInsert:type];
}

- (void)toggleExit:(id)sender
{
    (void) sender;
    NSString *message = [self.canvas toggleSelectedExit];
    [self canvasStatus:self.canvas
               message:message != nil ? message
                                      : @"Elige una puerta para marcarla como salida de emergencia."];
}

- (void)showHelp:(id)sender
{
    (void) sender;
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Cómo se usa Normia Estudio";
    alert.informativeText = @"La ventana es la de un CAD: la paleta de la izquierda agrupa las herramientas, "
                            @"la tira de arriba las repite como iconos y el inspector de la derecha edita la ficha "
                            @"del elemento seleccionado.\n\n"
                            @"V · seleccionar: el clic elige el elemento; arrastrar mueve un nodo, el trazo completo "
                            @"o una esquina de la caja seleccionada, que la escala.\n"
                            @"H · mano: arrastra el lienzo sin tocar el plano.\n"
                            @"M · muro por tramos de dos clics. L · línea, B · rectángulo y O · elipse: dos clics.\n"
                            @"P · pluma de nodos y R · ruta de evacuación: un clic por nodo, Enter o doble clic cierra.\n"
                            @"A · arco de tres puntos. D · cota. T · texto: un clic y se escribe en el inspector.\n"
                            @"I · insertar del catálogo (820 piezas), también con ⌘⇧I y el buscador.\n"
                            @"E · vía, N · andén, C · paso peatonal, K · parqueadero, J · lindero, "
                            @"Q · tubería y W · canaleta: el entorno del editor web, dos clics cada uno.\n\n"
                            @"El inspector: capas arriba —la activa recibe lo nuevo— y la ficha debajo: X, Y, ancho, "
                            @"alto, giro, grosor, color, rótulo y capa. Intro o «Aplicar cambios» lo llevan al plano; "
                            @"Duplicar, Borrar y Salida quedan a un clic. ⌘D duplica y ⌘⌥R gira 90°.\n\n"
                            @"La línea de comando de abajo entiende «muro», «linea», «rect», «elipse», «texto», "
                            @"«cota», «ruta», «capa <nombre>», «zoom <n>», «duplicar», «girar», «borrar», "
                            @"«rejilla», «revisar», «ajustar», «exportar», «guardar» y «ayuda». Intro en vacío "
                            @"repite el último comando.\n\n"
                            @"Esc cancela la herramienta; Retroceso borra lo seleccionado; las flechas mueven un "
                            @"centímetro, diez con Mayúsculas; ⌘Z deshace. Rueda o pellizco para acercar, "
                            @"botón central o derecho para desplazarse, ⌘0 ajusta la hoja y ⌘1 deja el zoom al 100 %.\n\n"
                            @"Los planos son esquemas de apoyo: no sustituyen la verificación de un "
                            @"profesional ni la normativa vigente.";
    [alert runModal];
}

- (void)showAbout:(id)sender
{
    (void) sender;
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Normia Estudio (nativo)";
    alert.informativeText = @"Etapa N1: ventana, lienzo y archivos, sin WebView.\n"
                            @"Los cálculos los hace el mismo núcleo en C que la versión web usa en PHP, "
                            @"con paridad comprobada.\n\n"
                            @"Esta compilación no está firmada: macOS puede pedir permiso la primera vez.";
    [alert runModal];
}

- (void)showError:(NSString *)message detail:(NSString *)detail
{
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = message;
    alert.informativeText = detail ?: @"";
    [alert runModal];
}

@end
