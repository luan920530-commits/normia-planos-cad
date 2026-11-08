/*
 * Normia nativo · inspector del plano (implementación).
 *
 * Panel derecho de la ventana: capas arriba, ficha del elemento seleccionado
 * debajo. Los campos se aplican con Intro o con el botón «Aplicar», y cada
 * cambio pasa por el núcleo: si el núcleo dice que no (un ancho de cero, un
 * color que no es `#rrggbb`), el campo vuelve a lo que el documento tiene.
 */
#import "InspectorPanel.h"

#import <QuartzCore/QuartzCore.h>

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/object.h"

static const CGFloat kPanelWidth = 300.0;
static const CGFloat kInset = 14.0;
static const CGFloat kRow = 30.0;
/** Nombres de campo, en el orden en que se ven. */
static NSString *const kFieldX = @"x";
static NSString *const kFieldY = @"y";
static NSString *const kFieldW = @"w";
static NSString *const kFieldH = @"h";
static NSString *const kFieldRotation = @"rotation";
static NSString *const kFieldStroke = @"stroke";
static NSString *const kFieldColour = @"colour";
static NSString *const kFieldLabel = @"label";
static NSString *const kFieldLayer = @"layer";

static NSColor *panelBackground(void) { return [NSColor colorWithCalibratedRed:0.13 green:0.14 blue:0.16 alpha:1.0]; }
static NSColor *panelText(void) { return [NSColor colorWithCalibratedWhite:0.93 alpha:1.0]; }
static NSColor *panelMuted(void) { return [NSColor colorWithCalibratedWhite:0.58 alpha:1.0]; }
static NSColor *panelField(void) { return [NSColor colorWithCalibratedRed:0.20 green:0.21 blue:0.24 alpha:1.0]; }
static NSColor *panelAccent(void) { return [NSColor colorWithCalibratedRed:0.16 green:0.43 blue:0.78 alpha:1.0]; }

@interface InspectorPanel ()
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSTextField *> *fields;
@property(nonatomic, strong) NSTextField *summary;
@property(nonatomic, strong) NSTextField *typeField;
@property(nonatomic, strong) NSTextField *hint;
@property(nonatomic, strong) NSPopUpButton *layerPopup;
@property(nonatomic, strong) NSTextField *layerField;
@property(nonatomic, strong) NSButton *exitButton;
- (void)buildPanel;
- (NSTextField *)fieldWithKey:(NSString *)key;
- (NSTextField *)labelledRow:(NSString *)caption key:(NSString *)key y:(CGFloat)y enabled:(BOOL)enabled;
- (void)populateLayers;
- (void)setField:(NSString *)key value:(NSString *)value;
- (void)applyFields:(id)sender;
- (void)layerChosen:(id)sender;
- (void)setCurrentLayerFromField:(id)sender;
- (void)groupTitle:(NSString *)title y:(CGFloat)y;
@end

@implementation InspectorPanel

- (instancetype)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self != nil) {
        _elementIndex = -1;
        self.wantsLayer = YES;
        [self buildPanel];
    }
    return self;
}

- (BOOL)isFlipped
{
    /* De arriba abajo: es más fácil leer la ficha así. */
    return YES;
}

- (void)drawRect:(NSRect)dirtyRect
{
    (void) dirtyRect;
    [panelBackground() setFill];
    NSRectFill(self.bounds);
    [[NSColor colorWithCalibratedWhite:0.24 alpha:1.0] setFill];
    NSRectFill(NSMakeRect(0.0, 0.0, 1.0, NSHeight(self.bounds)));
}

/* ------------------------------ construcción ----------------------------- */

- (void)groupTitle:(NSString *)title y:(CGFloat)y
{
    NSTextField *label = [NSTextField labelWithString:title];
    label.font = [NSFont systemFontOfSize:10.0 weight:NSFontWeightBold];
    label.textColor = panelMuted();
    label.frame = NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 1.0, 14.0);
    [self addSubview:label];
}

- (NSTextField *)fieldWithKey:(NSString *)key
{
    if (self.fields == nil) {
        self.fields = [NSMutableDictionary dictionary];
    }
    NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 0, 22.0)];
    field.font = [NSFont systemFontOfSize:11.5];
    field.textColor = panelText();
    field.backgroundColor = panelField();
    field.drawsBackground = YES;
    field.bezeled = YES;
    field.bezelStyle = NSTextFieldRoundedBezel;
    field.editable = YES;
    field.selectable = YES;
    field.focusRingType = NSFocusRingTypeExterior;
    field.target = self;
    field.action = @selector(applyFields:);
    field.toolTip = @"Intro aplica el cambio en el plano";
    self.fields[key] = field;
    return field;
}

- (NSTextField *)labelledRow:(NSString *)caption key:(NSString *)key y:(CGFloat)y enabled:(BOOL)enabled
{
    NSTextField *caption2 = [NSTextField labelWithString:caption];
    caption2.font = [NSFont systemFontOfSize:11.0];
    caption2.textColor = panelMuted();
    caption2.frame = NSMakeRect(kInset, y + 3.0, 74.0, 16.0);
    [self addSubview:caption2];

    NSTextField *field = [self fieldWithKey:key];
    field.frame = NSMakeRect(kInset + 78.0, y, kPanelWidth - kInset * 2.0 - 78.0 - 1.0, 22.0);
    field.enabled = enabled;
    [self addSubview:field];
    return field;
}

- (void)buildPanel
{
    CGFloat y = 12.0;

    NSTextField *title = [NSTextField labelWithString:@"PROPIEDADES DEL PLANO"];
    title.font = [NSFont systemFontOfSize:10.0 weight:NSFontWeightBold];
    title.textColor = panelMuted();
    title.frame = NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 1.0, 14.0);
    [self addSubview:title];
    y += 22.0;

    /* ------------------------------- capas ------------------------------- */
    [self groupTitle:@"CAPAS" y:y];
    y += 18.0;

    self.layerPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 1.0, 24.0)
                                                  pullsDown:NO];
    self.layerPopup.font = [NSFont systemFontOfSize:11.5];
    self.layerPopup.target = self;
    self.layerPopup.action = @selector(layerChosen:);
    self.layerPopup.toolTip = @"Capa activa: la que reciben los elementos nuevos";
    [self addSubview:self.layerPopup];
    y += 30.0;

    self.layerField = [[NSTextField alloc] initWithFrame:NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 42.0 - 1.0, 22.0)];
    self.layerField.placeholderString = @"Nueva capa activa…";
    self.layerField.font = [NSFont systemFontOfSize:11.5];
    self.layerField.textColor = panelText();
    self.layerField.backgroundColor = panelField();
    self.layerField.drawsBackground = YES;
    self.layerField.bezeled = YES;
    self.layerField.bezelStyle = NSTextFieldRoundedBezel;
    self.layerField.target = self;
    self.layerField.action = @selector(setCurrentLayerFromField:);
    [self addSubview:self.layerField];

    NSButton *createLayer = [NSButton buttonWithTitle:@"＋" target:self action:@selector(setCurrentLayerFromField:)];
    createLayer.frame = NSMakeRect(kPanelWidth - kInset - 36.0, y - 2.0, 36.0, 26.0);
    createLayer.bezelStyle = NSBezelStyleRounded;
    createLayer.toolTip = @"Crear la capa y dejarla activa";
    [self addSubview:createLayer];
    y += 34.0;

    /* ---------------------------- propiedades ---------------------------- */
    [self groupTitle:@"ELEMENTO SELECCIONADO" y:y];
    y += 18.0;

    self.summary = [NSTextField labelWithString:@"Nada seleccionado"];
    self.summary.font = [NSFont systemFontOfSize:11.5 weight:NSFontWeightMedium];
    self.summary.textColor = panelText();
    self.summary.frame = NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 1.0, 18.0);
    [self addSubview:self.summary];
    y += 22.0;

    self.typeField = [self labelledRow:@"Tipo" key:@"type" y:y enabled:NO];
    y += kRow;
    [self labelledRow:@"X (cm)" key:kFieldX y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Y (cm)" key:kFieldY y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Ancho (cm)" key:kFieldW y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Alto (cm)" key:kFieldH y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Giro (°)" key:kFieldRotation y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Grosor (cm)" key:kFieldStroke y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Color" key:kFieldColour y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Rótulo" key:kFieldLabel y:y enabled:YES];
    y += kRow;
    [self labelledRow:@"Capa" key:kFieldLayer y:y enabled:YES];
    y += kRow + 6.0;

    NSButton *apply = [NSButton buttonWithTitle:@"Aplicar cambios" target:self action:@selector(applyFields:)];
    apply.frame = NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 1.0, 28.0);
    apply.bezelStyle = NSBezelStyleRounded;
    apply.toolTip = @"Aplica lo escrito en los campos (Intro)";
    [self addSubview:apply];
    y += 36.0;

    const CGFloat third = (kPanelWidth - kInset * 2.0 - 9.0 - 1.0) / 3.0;
    NSButton *duplicate = [NSButton buttonWithTitle:@"Duplicar" target:self action:@selector(requestDuplicate:)];
    duplicate.frame = NSMakeRect(kInset, y, third, 26.0);
    duplicate.bezelStyle = NSBezelStyleRounded;
    [self addSubview:duplicate];

    NSButton *remove = [NSButton buttonWithTitle:@"Borrar" target:self action:@selector(requestDelete:)];
    remove.frame = NSMakeRect(kInset + third + 4.5, y, third, 26.0);
    remove.bezelStyle = NSBezelStyleRounded;
    [self addSubview:remove];

    self.exitButton = [NSButton buttonWithTitle:@"Salida" target:self action:@selector(requestExit:)];
    self.exitButton.frame = NSMakeRect(kInset + (third + 4.5) * 2.0, y, third, 26.0);
    self.exitButton.bezelStyle = NSBezelStyleRounded;
    self.exitButton.toolTip = @"Marca la puerta como salida de emergencia";
    [self addSubview:self.exitButton];
    y += 34.0;

    self.hint = [NSTextField labelWithString:@"Selecciona un elemento en el plano para editar su ficha."];
    self.hint.font = [NSFont systemFontOfSize:10.5];
    self.hint.textColor = panelMuted();
    self.hint.frame = NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 1.0, 44.0);
    self.hint.maximumNumberOfLines = 3;
    self.hint.lineBreakMode = NSLineBreakByWordWrapping;
    [self addSubview:self.hint];
    y += 52.0;

    self.frame = NSMakeRect(NSMinX(self.frame), NSMinY(self.frame), kPanelWidth, MAX(NSHeight(self.frame), y + 8.0));
    [self reload];
}

/* -------------------------------- lectura -------------------------------- */

/** Caja de un elemento: la de su caja o la de sus nodos, en centímetros. */
static void element_bounds(const norma_element *element, double *x, double *y, double *w, double *h)
{
    if (element->node_count >= 2) {
        double minX = element->nodes[0].x;
        double maxX = minX;
        double minY = element->nodes[0].y;
        double maxY = minY;
        for (size_t node = 1; node < element->node_count; node += 1) {
            const norma_point point = element->nodes[node];
            if (point.x < minX) { minX = point.x; }
            if (point.x > maxX) { maxX = point.x; }
            if (point.y < minY) { minY = point.y; }
            if (point.y > maxY) { maxY = point.y; }
        }
        *x = minX;
        *y = minY;
        *w = maxX - minX;
        *h = maxY - minY;
        return;
    }
    *x = element->x;
    *y = element->y;
    *w = element->w;
    *h = element->h;
}

- (const norma_element *)selectedElement
{
    if (self.document == NULL || self.elementIndex < 0 || (size_t) self.elementIndex >= self.document->count) {
        return NULL;
    }
    return &self.document->elements[(size_t) self.elementIndex];
}

/** Nombre legible del tipo: el del catálogo si lo hay, o el tipo tal cual. */
static NSString *display_name(const norma_element *element)
{
    if (element->label[0] != '\0' && strcmp(element->type, "text") == 0) {
        return [NSString stringWithFormat:@"Texto · «%s»", element->label];
    }
    if (strcmp(element->type, "text") == 0) {
        return @"Texto";
    }
    return [NSString stringWithUTF8String:element->type];
}

- (void)populateLayers
{
    [self.layerPopup removeAllItems];
    if (self.document == NULL) {
        return;
    }
    NSMutableArray<NSString *> *names = [NSMutableArray array];
    /* La capa activa primero: es la que se va a usar. */
    if (self.document->layer[0] != '\0') {
        [names addObject:[NSString stringWithUTF8String:self.document->layer]];
    }
    for (size_t index = 0; index < self.document->count; index += 1) {
        const char *layer = self.document->elements[index].layer;
        if (layer[0] == '\0') {
            continue;
        }
        NSString *name = [NSString stringWithUTF8String:layer];
        if (![names containsObject:name]) {
            [names addObject:name];
        }
    }
    if (names.count == 0) {
        [names addObject:@"General"];
    }
    [self.layerPopup addItemsWithTitles:names];
    self.layerPopup.toolTip = [NSString stringWithFormat:@"Capa activa: %@", names.firstObject];
}

- (void)reload
{
    if (self.document == NULL) {
        return;
    }
    [self populateLayers];
    const norma_element *element = [self selectedElement];
    if (element == NULL) {
        self.summary.stringValue = [NSString stringWithFormat:@"Nada seleccionado · %zu elementos",
                                                              self.document->count];
        [(NSTextField *) self.fields[@"type"] setStringValue:@"—"];
        for (NSString *key in self.fields) {
            if ([key isEqualToString:@"type"]) {
                continue;
            }
            [(NSTextField *) self.fields[key] setStringValue:@""];
            ((NSTextField *) self.fields[key]).enabled = NO;
        }
        self.exitButton.enabled = NO;
        self.exitButton.state = NSControlStateValueOff;
        self.hint.stringValue = @"Selecciona un elemento en el plano para editar su ficha. Las capas se eligen arriba.";
        return;
    }

    double x = 0.0;
    double y = 0.0;
    double w = 0.0;
    double h = 0.0;
    element_bounds(element, &x, &y, &w, &h);

    self.summary.stringValue = [NSString stringWithFormat:@"%@ · %@", display_name(element),
                                                          element->node_count >= 2 ? @"trazo" : @"caja"];
    [(NSTextField *) self.fields[@"type"] setStringValue:display_name(element)];
    const BOOL box = element->node_count < 2;
    [self setField:kFieldX value:[NSString stringWithFormat:@"%.0f", x]];
    [self setField:kFieldY value:[NSString stringWithFormat:@"%.0f", y]];
    [self setField:kFieldW value:[NSString stringWithFormat:@"%.0f", w]];
    [self setField:kFieldH value:[NSString stringWithFormat:@"%.0f", h]];
    [self setField:kFieldRotation value:[NSString stringWithFormat:@"%.0f", element->rotation]];
    [self setField:kFieldStroke value:[NSString stringWithFormat:@"%.1f", element->stroke]];
    [self setField:kFieldColour value:element->colour[0] != '\0' ? [NSString stringWithUTF8String:element->colour] : @""];
    [self setField:kFieldLabel value:[NSString stringWithUTF8String:element->label]];
    [self setField:kFieldLayer value:[NSString stringWithUTF8String:element->layer]];

    ((NSTextField *) self.fields[kFieldW]).enabled = box;
    ((NSTextField *) self.fields[kFieldH]).enabled = box;
    ((NSTextField *) self.fields[kFieldX]).enabled = YES;
    ((NSTextField *) self.fields[kFieldY]).enabled = YES;
    ((NSTextField *) self.fields[kFieldRotation]).enabled = box;
    ((NSTextField *) self.fields[kFieldStroke]).enabled = YES;
    ((NSTextField *) self.fields[kFieldColour]).enabled = YES;
    ((NSTextField *) self.fields[kFieldLabel]).enabled = YES;
    ((NSTextField *) self.fields[kFieldLayer]).enabled = YES;

    const BOOL door = norma_object_is_door(element->type) != 0;
    self.exitButton.enabled = door;
    self.exitButton.state = element->is_exit ? NSControlStateValueOn : NSControlStateValueOff;
    self.exitButton.title = element->is_exit ? @"Es salida" : @"Salida";
    self.hint.stringValue = box
        ? @"Ancho y alto en centímetros; el giro en grados. El color admite «#rrggbb» o vacío para el de su familia."
        : @"En un trazo, X e Y desplazan el conjunto de nodos. El grosor es el que usa el auditor para bloquear el paso.";
}

- (void)setField:(NSString *)key value:(NSString *)value
{
    NSTextField *field = self.fields[key];
    if (field != nil) {
        field.stringValue = value != nil ? value : @"";
    }
}

- (void)focusLabelField
{
    NSTextField *field = self.fields[kFieldLabel];
    if (field != nil && field.enabled) {
        [self.window makeFirstResponder:field];
    }
}

/* -------------------------------- edición -------------------------------- */

/** Número escrito a la española o a la inglesa: «12,5» y «12.5» valen igual. */
static double parse_number(NSString *text)
{
    NSString *clean = [text stringByReplacingOccurrencesOfString:@"," withString:@"."];
    return [clean doubleValue];
}

- (void)applyFields:(id)sender
{
    (void) sender;
    if (self.document == NULL) {
        return;
    }
    const norma_element *element = [self selectedElement];
    if (element == NULL) {
        [self.delegate inspector:self status:@"Selecciona un elemento para editarlo."];
        return;
    }
    const size_t index = (size_t) self.elementIndex;
    /* Datos que no cambian durante la edición: el puntero al elemento puede
       dejar de valer si el documento reasigna su lista, así que se copian. */
    const size_t nodeCount = element->node_count;
    NSString *name = display_name(element);
    norma_document_begin_edit(self.document);

    double x = parse_number([(NSTextField *) self.fields[kFieldX] stringValue]);
    double y = parse_number([(NSTextField *) self.fields[kFieldY] stringValue]);
    double w = parse_number([(NSTextField *) self.fields[kFieldW] stringValue]);
    double h = parse_number([(NSTextField *) self.fields[kFieldH] stringValue]);
    const double rotation = parse_number([(NSTextField *) self.fields[kFieldRotation] stringValue]);
    const double stroke = parse_number([(NSTextField *) self.fields[kFieldStroke] stringValue]);
    NSString *colour = [(NSTextField *) self.fields[kFieldColour] stringValue];
    NSString *label = [(NSTextField *) self.fields[kFieldLabel] stringValue];
    NSString *layer = [(NSTextField *) self.fields[kFieldLayer] stringValue];

    int changed = 0;
    NSMutableArray<NSString *> *refused = [NSMutableArray array];

    double currentX = 0.0;
    double currentY = 0.0;
    double currentW = 0.0;
    double currentH = 0.0;
    element_bounds(element, &currentX, &currentY, &currentW, &currentH);

    if (nodeCount >= 2) {
        /* Trazo: X e Y desplazan el conjunto, la caja no se fuerza. */
        const double dx = round(x) - round(currentX);
        const double dy = round(y) - round(currentY);
        if (dx != 0.0 || dy != 0.0) {
            for (size_t node = 0; node < nodeCount; node += 1) {
                if (norma_document_move_node(self.document, index, node,
                                             self.document->elements[index].nodes[node].x + dx,
                                             self.document->elements[index].nodes[node].y + dy)) {
                    changed = 1;
                }
            }
        }
    } else if (norma_document_set_box(self.document, index, round(x), round(y), w, h)) {
        changed = 1;
    } else if (w <= 0.0 || h <= 0.0) {
        [refused addObject:@"el ancho y el alto tienen que ser mayores que cero"];
    }

    if (nodeCount < 2 && norma_document_set_rotation(self.document, index, rotation)) {
        changed = 1;
    }
    if (norma_document_set_stroke(self.document, index, stroke)) {
        changed = 1;
    }
    if (norma_document_set_colour(self.document, index, colour.UTF8String)) {
        changed = 1;
    } else if (colour.length > 0 && ![colour hasPrefix:@"#"]) {
        [refused addObject:@"el color va en «#rrggbb»"];
    }
    if (norma_document_set_label(self.document, index, label.UTF8String)) {
        changed = 1;
    }
    if (norma_document_set_layer(self.document, index, layer.UTF8String)) {
        changed = 1;
    }

    [self reload];
    if (changed) {
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Ficha aplicada a %@", name]];
    } else if (refused.count > 0) {
        [self.delegate inspector:self status:[NSString stringWithFormat:@"No se aplicó: %@.", [refused componentsJoinedByString:@"; "]]];
    } else {
        [self.delegate inspector:self status:@"La ficha ya estaba así."];
    }
}

- (void)layerChosen:(id)sender
{
    (void) sender;
    if (self.document == NULL) {
        return;
    }
    NSString *title = self.layerPopup.titleOfSelectedItem;
    if (norma_document_set_current_layer(self.document, title.UTF8String) != 0) {
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Capa activa: %@", title]];
    }
}

- (void)setCurrentLayerFromField:(id)sender
{
    (void) sender;
    if (self.document == NULL) {
        return;
    }
    NSString *name = [self.layerField.stringValue stringByTrimmingCharactersInSet:
                      [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (name.length == 0) {
        [self.delegate inspector:self status:@"Escribe el nombre de la capa."];
        return;
    }
    if (norma_document_set_current_layer(self.document, name.UTF8String) != 0) {
        self.layerField.stringValue = @"";
        [self reload];
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Capa activa: %@", name]];
        return;
    }
    [self.delegate inspector:self status:@"Ese nombre de capa no cabe (32 caracteres como máximo)."];
}

- (void)requestDuplicate:(id)sender
{
    (void) sender;
    [self.delegate inspectorDidRequestDuplicate:self];
}

- (void)requestDelete:(id)sender
{
    (void) sender;
    [self.delegate inspectorDidRequestDelete:self];
}

- (void)requestExit:(id)sender
{
    (void) sender;
    [self.delegate inspectorDidRequestExit:self];
}

@end
