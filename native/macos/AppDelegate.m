/*
 * Normia nativo · ventana y menú de macOS.
 *
 * Una aplicación AppKit normal: menú en español, ventana que se ajusta, paneles
 * del sistema para abrir y guardar, y aviso al cerrar con cambios pendientes.
 * Sin WebView: el lienzo es `CanvasView` y los datos, el documento en C.
 */
#import "AppDelegate.h"
#import "CanvasView.h"

#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/inspect.h"
#include "normia/svg.h"

#include "normia/document.h"
#include "normia/object.h"

static const char *kAppName = "Normia Estudio";

@interface AppDelegate ()
@property(nonatomic, strong) NSWindow *window;
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

- (void)buildAuditPanel:(NSView *)content;
- (void)toggleAudit:(id)sender;
- (void)layoutCanvas;
- (NSString *)resourcesPath;
- (void)refreshInspection:(id)sender;
- (void)fillAuditText;
- (void)updateCanvasFindings;
- (void)revealSelectedFinding:(id)sender;
- (void)invalidateInspection;
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
}

/* -------------------------------- arranque ------------------------------- */

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
    (void) notification;
    [self buildMenu];
    [self buildWindow];
    [self.canvas documentDidLoad];
    [self refreshTitle];
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

- (void)buildWindow
{
    const NSRect frame = NSMakeRect(0, 0, 1280, 860);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                             styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                                                        | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                                               backing:NSBackingStoreBuffered
                                                 defer:NO];
    self.window.title = @"Normia Estudio";
    self.window.delegate = self;
    self.window.minSize = NSMakeSize(900, 600);
    self.window.backgroundColor = [NSColor colorWithCalibratedWhite:0.16 alpha:1.0];

    NSView *content = self.window.contentView;
    self.canvas = [[CanvasView alloc] initWithFrame:content.bounds];
    self.canvas.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.canvas.delegate = self;
    self.canvas.document = &_document;
    [content addSubview:self.canvas];

    [self buildAuditPanel:content];

    // Barra de estado sobria, debajo del lienzo.
    self.statusLabel = [NSTextField labelWithString:@""];
    self.statusLabel.font = [NSFont systemFontOfSize:11.0];
    self.statusLabel.textColor = [NSColor colorWithCalibratedWhite:0.75 alpha:1.0];
    self.statusLabel.frame = NSMakeRect(16, 8, NSWidth(content.bounds) - 32, 16);
    self.statusLabel.autoresizingMask = NSViewWidthSizable | NSViewMaxYMargin;
    [content addSubview:self.statusLabel];

    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [self.window makeFirstResponder:self.canvas];
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
    NSView *content = self.window.contentView;
    const CGFloat panel = self.auditVisible ? NSWidth(self.auditPanel.frame) : 0.0;
    const NSRect bounds = content.bounds;
    self.canvas.frame = NSMakeRect(0.0, 0.0, NSWidth(bounds) - panel, NSHeight(bounds));
    [self.canvas setNeedsDisplay:YES];
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
    NSArray<NSString *> *keys = @[@"u", @"U", @"g", @"e", @"b", @"c", @"d", @"m", @"1", @"2", @"a"];
    for (size_t index = 0; index < norma_object_count(); index += 1) {
        const norma_object_spec *spec = norma_object_at(index);
        NSString *title = [NSString stringWithFormat:@"%s", spec->name];
        NSString *key = index < keys.count ? keys[index] : @"";
        NSMenuItem *item = [insertMenu addItemWithTitle:title action:@selector(insertObject:) keyEquivalent:key];
        item.keyEquivalentModifierMask = NSEventModifierFlagControl;
        item.representedObject = [NSString stringWithFormat:@"%s", spec->type];
        item.tag = (NSInteger) index;
        /* Las puertas primero y un separador antes de los equipos, como la web. */
        if (strcmp(spec->type, "door_garage") == 0) {
            [insertMenu addItem:[NSMenuItem separatorItem]];
        }
        if (strcmp(spec->type, "cad_emg_meeting") == 0) {
            [insertMenu addItem:[NSMenuItem separatorItem]];
        }
    }
    [insertMenu addItem:[NSMenuItem separatorItem]];
    NSMenuItem *exitItem = [insertMenu addItemWithTitle:@"Marcar o desmarcar salida de emergencia"
                                                 action:@selector(toggleExit:)
                                          keyEquivalent:@"E"];
    exitItem.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    insertItem.submenu = insertMenu;
    [menubar addItem:insertItem];

    NSMenuItem *helpItem = [[NSMenuItem alloc] init];
    NSMenu *helpMenu = [[NSMenu alloc] initWithTitle:@"Ayuda"];
    [helpMenu addItemWithTitle:@"Cómo se usa el lienzo" action:@selector(showHelp:) keyEquivalent:@"?"];
    helpItem.submenu = helpMenu;
    [menubar addItem:helpItem];

    NSApp.mainMenu = menubar;
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
    }
}

- (void)redoEdit:(id)sender
{
    (void) sender;
    if (norma_document_redo(&_document)) {
        [self.canvas setNeedsDisplay:YES];
        [self refreshTitle];
    }
}

- (void)deleteSelection:(id)sender
{
    (void) sender;
    [self.canvas keyDown:[NSEvent keyEventWithType:NSEventTypeKeyDown
                                         location:NSZeroPoint
                                    modifierFlags:0
                                        timestamp:0
                                     windowNumber:self.window.windowNumber
                                          context:nil
                                       characters:@"\x7f"
                      charactersIgnoringModifiers:@"\x7f"
                                        isARepeat:NO
                                          keyCode:51]];
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
    /* El catálogo de señalización todavía no viaja dentro del paquete de la
       ventana: sin él, las señales se exportan con el marcador genérico. */
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
    [self.canvas zoomIn];
}

- (void)zoomOut:(id)sender
{
    (void) sender;
    [self.canvas zoomOut];
}

- (void)zoomReset:(id)sender
{
    (void) sender;
    [self.canvas zoomReset];
}

- (void)zoomToFit:(id)sender
{
    (void) sender;
    [self.canvas zoomToFit];
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
    alert.messageText = @"Cómo se usa el lienzo";
    alert.informativeText = @"V vuelve a la selección: clic en un muro lo elige y, si aciertas en un nodo, arrastrarlo lo mueve.\n"
                            @"M · muro por tramos de dos clics.\n"
                            @"P · pluma de nodos: un clic por nodo, Enter o doble clic cierra.\n"
                            @"A · arco de tres puntos: inicio, paso y fin.\n"
                            @"D · cota entre dos puntos, con la cifra y la unidad.\n"
                            @"R · ruta de evacuación: un clic por nodo, Enter o doble clic cierra.\n"
                            @"Insertar · puertas, extintor, botiquín, camilla, DEA, punto de encuentro y señales: "
                            @"se elige en el menú y se coloca con un clic (Esc termina de insertar).\n"
                            @"⌘⇧E marca o desmarca la puerta elegida como salida de emergencia: el auditor "
                            @"mide desde ahí el recorrido y la cuenta como salida.\n"
                            @"Esc cancela la herramienta; Retroceso quita el último nodo o borra lo seleccionado; ⌘Z deshace.\n"
                            @"⌘P imprime el plano en A4 horizontal y Archivo › Exportar PDF guarda esa misma hoja.\n"
                            @"El lienzo es tan grande como haga falta: rueda del ratón o pellizco para acercar, "
                            @"arrastrar con el botón central o derecho para moverse, ⌘0 ajusta la hoja y ⌘1 deja el zoom al 100 %.\n\n"
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
