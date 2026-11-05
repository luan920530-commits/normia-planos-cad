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

#include <stdlib.h>
#include <string.h>

#include "normia/document.h"

static const char *kAppName = "Normia Estudio";

@interface AppDelegate ()
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) CanvasView *canvas;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic) norma_document document;
@property(nonatomic, copy) NSString *filePath;
@property(nonatomic, copy) NSString *planName;
@end

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
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItemWithTitle:@"Guardar" action:@selector(savePlan:) keyEquivalent:@"s"];
    NSMenuItem *saveAs = [fileMenu addItemWithTitle:@"Guardar como…" action:@selector(savePlanAs:) keyEquivalent:@"S"];
    saveAs.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
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
    self.document.dirty = 0;
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
                                       characters:@"\u007f"
                      charactersIgnoringModifiers:@"\u007f"
                                        isARepeat:NO
                                          keyCode:51]];
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
    alert.informativeText = @"M arma la herramienta de muro: un clic por nodo y Esc para terminar.\n"
                            @"Clic en un muro lo selecciona; si aciertas en un nodo, arrastrarlo lo mueve.\n"
                            @"Retroceso borra lo seleccionado y ⌘Z deshace.\n\n"
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
