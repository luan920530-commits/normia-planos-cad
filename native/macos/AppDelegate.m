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

#include "normia/svg.h"

#include "normia/document.h"

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
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItemWithTitle:@"Pantalla completa" action:@selector(toggleFullScreen:) keyEquivalent:@"f"];
    viewItem.submenu = viewMenu;
    [menubar addItem:viewItem];

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

- (void)canvasDidChange:(CanvasView *)view
{
    (void) view;
    [self refreshTitle];
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
    info.horizontalPagination = NSFitPagination;
    info.verticalPagination = NSFitPagination;
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

- (void)zoomToFit:(id)sender
{
    (void) sender;
    [self.canvas zoomToFit];
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
                            @"Esc cancela la herramienta; Retroceso quita el último nodo o borra lo seleccionado; ⌘Z deshace.\n"
                            @"⌘P imprime el plano en A4 horizontal y Archivo › Exportar PDF guarda esa misma hoja.\n\n"
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
