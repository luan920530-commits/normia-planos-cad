/*
 * Normia nativo · selector del catálogo (buscador).
 *
 * Una ventana pequeña con: campo de búsqueda, tabla con las coincidencias (nombre
 * y familia), y los botones Insertar y Cancelar. Escribir filtra por nombre y por
 * tipo sin tildes ni mayúsculas; doble clic o Intro inserta lo seleccionado.
 *
 * Los objetos los trae el catálogo del núcleo (`norma/object.h`); aquí no hay
 * ninguna lista copiada.
 */
#import "CatalogPicker.h"
#import "SvgPicture.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

/** Fila de la tabla: una pieza del catálogo, ya resuelta a índice. */
static NSString *const kColumn = @"objeto";

@interface NormiaCatalogPicker () <NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSSearchField *search;
@property(nonatomic, strong) NSTableView *table;
@property(nonatomic, strong) NSTextField *summary;
@property(nonatomic, strong) NSButton *insertButton;
@property(nonatomic) const norma_object_catalog *catalog;
/** Biblioteca que se ofrece: todo, señales o equipos. */
@property(nonatomic) NormiaCatalogScope scope;
/** Índices del catálogo que pasan el filtro, en el orden del menú. */
@property(nonatomic) size_t *matches;
@property(nonatomic) size_t matchCount;
@property(nonatomic, copy) NSString *chosen;

- (NSString *)runForWindow:(nullable NSWindow *)parent prompt:(nullable NSString *)prompt;
- (void)filterChanged:(nullable id)sender;
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
        prompt = scope == NormiaCatalogScopeSigns ? @"Insertar una señal"
               : scope == NormiaCatalogScopeCad ? @"Insertar un equipo"
                                                : @"Insertar del catálogo";
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

- (NSString *)runForWindow:(NSWindow *)parent prompt:(NSString *)prompt
{
    const CGFloat width = 560.0;
    const CGFloat height = 420.0;
    NSRect frame = NSMakeRect(0.0, 0.0, width, height);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                             styleMask:NSWindowStyleMaskTitled
                                               backing:NSBackingStoreBuffered
                                                 defer:NO];
    self.window.title = prompt != nil ? prompt : @"Insertar del catálogo";
    self.window.releasedWhenClosed = NO;
    NSView *content = self.window.contentView;

    const CGFloat margin = 16.0;
    self.search = [[NSSearchField alloc] initWithFrame:NSMakeRect(margin, height - 44.0,
                                                                 width - margin * 2.0, 26.0)];
    self.search.placeholderString = self.scope == NormiaCatalogScopeSigns
        ? @"Buscar señal por nombre, código o familia: salida, extintor, E002…"
        : self.scope == NormiaCatalogScopeCad
            ? @"Buscar equipo por nombre o familia: camilla, botiquín, ascensor…"
            : @"Buscar por nombre o por tipo: extintor, camilla, E002…";
    self.search.delegate = self;
    self.search.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    self.search.target = self;
    self.search.action = @selector(filterChanged:);
    [content addSubview:self.search];

    self.summary = [NSTextField labelWithString:@""];
    self.summary.font = [NSFont systemFontOfSize:11.0];
    self.summary.textColor = [NSColor secondaryLabelColor];
    self.summary.frame = NSMakeRect(margin, height - 66.0, width - margin * 2.0, 16.0);
    self.summary.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
    [content addSubview:self.summary];

    NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(margin, 60.0,
                                                                         width - margin * 2.0,
                                                                         height - 134.0)];
    scroll.hasVerticalScroller = YES;
    scroll.borderType = NSBezelBorder;
    scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    self.table = [[NSTableView alloc] initWithFrame:scroll.bounds];
    NSTableColumn *column = [[NSTableColumn alloc] initWithIdentifier:kColumn];
    column.title = @"Objeto";
    column.width = width - margin * 2.0 - 24.0;
    column.resizingMask = NSTableColumnAutoresizingMask;
    [self.table addTableColumn:column];
    self.table.headerView = nil;
    self.table.rowHeight = 24.0;
    self.table.dataSource = self;
    self.table.delegate = self;
    self.table.target = self;
    self.table.doubleAction = @selector(insertChosen:);
    self.table.allowsEmptySelection = YES;
    scroll.documentView = self.table;
    [content addSubview:scroll];

    self.insertButton = [NSButton buttonWithTitle:@"Insertar"
                                           target:self
                                           action:@selector(insertChosen:)];
    self.insertButton.frame = NSMakeRect(width - margin - 110.0, 16.0, 110.0, 32.0);
    self.insertButton.bezelStyle = NSBezelStyleRounded;
    self.insertButton.keyEquivalent = @"\r";
    self.insertButton.autoresizingMask = NSViewMinXMargin | NSViewMaxYMargin;
    [content addSubview:self.insertButton];

    NSButton *cancel = [NSButton buttonWithTitle:@"Cancelar" target:self action:@selector(cancel:)];
    cancel.frame = NSMakeRect(width - margin - 110.0 - 100.0, 16.0, 100.0, 32.0);
    cancel.bezelStyle = NSBezelStyleRounded;
    cancel.keyEquivalent = @"\033";
    cancel.autoresizingMask = NSViewMinXMargin | NSViewMaxYMargin;
    [content addSubview:cancel];

    [self filterChanged:nil];
    if (self.matchCount > 0) {
        [self.table selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];
    }

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

/** Compara sin mayúsculas ni tildes, y acepta que la aguja venga en cualquier orden. */
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

- (void)filterChanged:(id)sender
{
    (void) sender;
    NSString *text = self.search.stringValue;
    /* Sin tildes: buscar «botiquin» tiene que encontrar «Botiquín». */
    NSString *plain = [text stringByFoldingWithOptions:NSDiacriticInsensitiveSearch
                                                locale:[NSLocale localeWithLocaleIdentifier:@"es_CO"]];
    const char *needle = plain.UTF8String != NULL ? plain.UTF8String : "";
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
    [self.table reloadData];
    if (_matchCount > 0) {
        [self.table selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];
        [self.table scrollRowToVisible:0];
    }
    NSString *library = self.scope == NormiaCatalogScopeSigns ? @"señales"
                        : self.scope == NormiaCatalogScopeCad ? @"equipos"
                                                             : @"objetos";
    self.summary.stringValue = [NSString stringWithFormat:@"%lu de %lu %@ · %@",
                                                          (unsigned long) _matchCount,
                                                          (unsigned long) self.catalog->count,
                                                          library,
                                                          @"doble clic o Intro para insertar"];
    self.insertButton.enabled = _matchCount > 0;
}

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView
{
    (void) tableView;
    return (NSInteger) _matchCount;
}

- (NSView *)tableView:(NSTableView *)tableView viewForTableColumn:(NSTableColumn *)column row:(NSInteger)row
{
    (void) tableView;
    (void) column;
    if (row < 0 || (size_t) row >= _matchCount) {
        return nil;
    }
    const norma_object_spec *spec = &self.catalog->items[_matches[row]];
    /* La fila lleva el pictograma, no solo el nombre: la biblioteca se elige
       mirando la señal, que es como se busca una imagen en la web. */
    NSTableCellView *cell = [[NSTableCellView alloc] initWithFrame:NSMakeRect(0.0, 0.0, 480.0, 24.0)];
    NSImageView *icon = [[NSImageView alloc] initWithFrame:NSMakeRect(2.0, 1.0, 22.0, 22.0)];
    icon.imageScaling = NSImageScaleProportionallyUpOrDown;
    icon.image = NormiaThumbnailForType(spec->type, 20.0);
    [cell addSubview:icon];
    cell.imageView = icon;

    NSTextField *label = [NSTextField labelWithString:@""];
    label.font = [NSFont systemFontOfSize:12.0];
    label.lineBreakMode = NSLineBreakByTruncatingTail;
    NSString *detail = [NSString stringWithFormat:@"%s · %s", spec->name, spec->family_label];
    label.stringValue = detail;
    label.textColor = [NSColor labelColor];
    label.frame = NSMakeRect(30.0, 3.0, NSWidth(cell.bounds) - 34.0, 18.0);
    label.autoresizingMask = NSViewWidthSizable;
    [cell addSubview:label];
    cell.textField = label;
    return cell;
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
    const NSInteger row = self.table.selectedRow;
    if (row < 0 || (size_t) row >= _matchCount) {
        return;
    }
    const norma_object_spec *spec = &self.catalog->items[_matches[row]];
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
