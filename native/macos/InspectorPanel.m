/*
 * Normia nativo · inspector del plano.
 *
 * La misma ficha que el panel de propiedades del editor web, sección por
 * sección: capas, la selección (con sus acciones), geometría, apariencia,
 * puerta, vía y entorno, extintor y organización; y debajo, la maqueta de trazo.
 *
 * No edita por su cuenta: todo pasa por el documento en C
 * (`norma_document_set_box`, `set_rotation`, `set_opacity`…), que es quien
 * valida y quien deja el deshacer. Si el núcleo rechaza un valor, el campo
 * vuelve a lo que el documento dice.
 */
#import "InspectorPanel.h"
#import "SvgPicture.h"

#import <QuartzCore/QuartzCore.h>

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/object.h"

static const CGFloat kPanelWidth = 300.0;
static const CGFloat kInset = 14.0;

/* Los colores de la paleta son los mismos del editor web (`COLORS` en
   `assets/js/lib/model.js`); aquí se muestran los de uso corriente. */
static NSString *const kColours[] = {
    @"#0f172a", @"#334155", @"#64748b", @"#94a3b8", @"#ffffff",
    @"#2563eb", @"#0f766e", @"#15803d", @"#237f52", @"#65a30d",
    @"#b71f2e", @"#dc2626", @"#ea580c", @"#f59e0b", @"#eab308",
    @"#7c3aed", @"#be185d", @"#0891b2", @"#0e7490", @"#b45309",
};
static const size_t kColourCount = sizeof(kColours) / sizeof(kColours[0]);

static NSColor *panelBackground(void) { return [NSColor colorWithCalibratedRed:0.13 green:0.14 blue:0.16 alpha:1.0]; }
static NSColor *panelText(void) { return [NSColor colorWithCalibratedWhite:0.93 alpha:1.0]; }
static NSColor *panelMuted(void) { return [NSColor colorWithCalibratedWhite:0.58 alpha:1.0]; }
static NSColor *panelField(void) { return [NSColor colorWithCalibratedRed:0.20 green:0.21 blue:0.24 alpha:1.0]; }
static NSColor *panelAccent(void) { return [NSColor colorWithCalibratedRed:0.16 green:0.43 blue:0.78 alpha:1.0]; }

/** Nombre legible del tipo, como `TYPE_NAMES` del inspector web. */
static NSString *type_name(const char *type)
{
    if (type == NULL) {
        return @"—";
    }
    if (strcmp(type, "wall") == 0) { return @"Muro"; }
    if (strcmp(type, "door") == 0) { return @"Puerta sencilla"; }
    if (strcmp(type, "door_double") == 0) { return @"Puerta doble"; }
    if (strcmp(type, "door_garage") == 0) { return @"Portón de garaje"; }
    if (strcmp(type, "route") == 0) { return @"Ruta de evacuación"; }
    if (strcmp(type, "text") == 0) { return @"Texto"; }
    if (strcmp(type, "dimension") == 0) { return @"Medida"; }
    if (strcmp(type, "line") == 0) { return @"Línea"; }
    if (strcmp(type, "rect") == 0) { return @"Rectángulo"; }
    if (strcmp(type, "ellipse") == 0) { return @"Elipse"; }
    if (strcmp(type, "pipe") == 0) { return @"Tubería"; }
    if (strcmp(type, "conduit") == 0) { return @"Tubería eléctrica"; }
    if (strcmp(type, "road") == 0) { return @"Vía vehicular"; }
    if (strcmp(type, "sidewalk") == 0) { return @"Andén"; }
    if (strcmp(type, "crosswalk") == 0) { return @"Paso cebra"; }
    if (strcmp(type, "parking") == 0) { return @"Parqueadero"; }
    if (strcmp(type, "property") == 0) { return @"Límite de predio"; }
    const norma_object_spec *spec = norma_object_find(type);
    if (spec != NULL) {
        return [NSString stringWithUTF8String:spec->name];
    }
    return [NSString stringWithUTF8String:type];
}

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

/** Tipo del elemento, con el índice ya validado. */
static const char *name_of_type(const norma_document *document, size_t index)
{
    if (document == NULL || index >= document->count) {
        return "";
    }
    return document->elements[index].type;
}

/** Número escrito a la española o a la inglesa: «12,5» y «12.5» valen igual. */
static double parse_number(NSString *text)
{
    NSString *clean = [text stringByReplacingOccurrencesOfString:@"," withString:@"."];
    return [clean doubleValue];
}

@interface InspectorPanel ()
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSTextField *> *fields;
@property(nonatomic, strong) NSScrollView *scroll;
@property(nonatomic, strong) NSView *content;
@property(nonatomic, strong) NSTextField *summary;
@property(nonatomic, strong) NSTextField *kindLabel;
@property(nonatomic, strong) NSTextField *metaLabel;
/** Miniatura del pictograma seleccionado, como el héroe del inspector web. */
@property(nonatomic, strong) NSImageView *heroPreview;
@property(nonatomic, strong) NSPopUpButton *layerPopup;
@property(nonatomic, strong) NSTextField *layerField;
@property(nonatomic, strong) NSPopUpButton *currentLayerPopup;
@property(nonatomic, strong) NSPopUpButton *typePopup;
@property(nonatomic, strong) NSPopUpButton *extAgent;
@property(nonatomic, strong) NSPopUpButton *extHazard;
@property(nonatomic, strong) NSButton *lockSwitch;
@property(nonatomic, strong) NSButton *flipXSwitch;
@property(nonatomic, strong) NSButton *flipYSwitch;
@property(nonatomic, strong) NSButton *exitSwitch;
@property(nonatomic, strong) NSButton *guideVisibleSwitch;
@property(nonatomic, strong) NSButton *guideLockSwitch;
@property(nonatomic, strong) NSSlider *opacitySlider;
@property(nonatomic, strong) NSSlider *guideOpacitySlider;
@property(nonatomic, strong) NSMutableArray<NSButton *> *swatches;
@property(nonatomic, strong) NSMutableArray<NSView *> *blocks;
/* Red de tubería y circuito: dos fichas del inspector web. */
@property(nonatomic, strong) NSView *pipeGroup;
@property(nonatomic, strong) NSView *circuitGroup;
@property(nonatomic, strong) NSTextField *mepTitle;
@property(nonatomic, strong) NSPopUpButton *networkPopup;
@property(nonatomic, strong) NSPopUpButton *diameterPopup;
@property(nonatomic, strong) NSPopUpButton *materialPopup;
@property(nonatomic, strong) NSPopUpButton *voltagePopup;
@property(nonatomic, strong) NSPopUpButton *gaugePopup;
@property(nonatomic, strong) NSPopUpButton *phasesPopup;
@property(nonatomic, strong) NSPopUpButton *lanesPopup;
/** Redes del catálogo (`resources/mep-networks.json`): clave, rótulo y valores. */
@property(nonatomic, strong) NSArray<NSDictionary<NSString *, NSString *> *> *mepNetworks;
/** Materiales y diámetros del catálogo, para los desplegables. */
@property(nonatomic, strong) NSArray<NSString *> *mepDiameters;
@property(nonatomic, strong) NSArray<NSString *> *mepMaterials;
/** Fila del tamaño de letra: solo tiene sentido en un texto. */
@property(nonatomic, strong) NSView *fontRow;

- (void)buildPanel;
- (NSView *)blockWithHeight:(CGFloat)height;
- (void)addTitle:(NSString *)title to:(NSView *)block at:(CGFloat)y;
- (NSTextField *)fieldWithKey:(NSString *)key;
- (NSTextField *)labelledRow:(NSString *)caption key:(NSString *)key y:(CGFloat)y enabled:(BOOL)enabled
                          in:(NSView *)block;
- (void)populateLayers;
- (void)setField:(NSString *)key value:(NSString *)value;
- (void)applyFields:(id)sender;
- (void)layerChosen:(id)sender;
- (void)createLayer:(id)sender;
- (void)rotateBy:(NSButton *)sender;
- (void)colourChosen:(NSButton *)sender;
- (void)opacityChanged:(NSSlider *)sender;
- (void)typeChosen:(id)sender;
- (void)lockToggled:(id)sender;
- (void)doorToggled:(id)sender;
- (void)extinguisherChanged:(id)sender;
- (void)loadMepCatalog;
- (void)refreshMepForElement:(const norma_element *)element;
- (void)mepChanged:(id)sender;
- (void)networkChosen:(id)sender;
- (void)circuitChanged:(id)sender;
- (void)lanesChanged:(id)sender;
- (void)guideOpacityChanged:(NSSlider *)sender;
- (void)guideVisibilityToggled:(id)sender;
- (void)guideLockToggled:(id)sender;
- (void)requestClearGuide:(id)sender;
- (void)requestImportGuide:(id)sender;
- (void)layoutBlocks;
@end

@implementation InspectorPanel

- (instancetype)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self != nil) {
        _elementIndex = -1;
        self.wantsLayer = YES;
        [self loadMepCatalog];
        [self buildPanel];
    }
    return self;
}

- (BOOL)isFlipped
{
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

/* ------------------------------- catálogo MEP ---------------------------- */

/**
 * Lee las redes del catálogo que ya usa la web (`resources/mep-networks.json`).
 *
 * No se copia la tabla al código: si mañana cambia un diámetro de referencia o
 * se añade una red, la ventana la ofrece sola. Si el archivo no está (una copia
 * suelta del `.app`), quedan unos valores mínimos para no dejar el desplegable
 * vacío.
 */
- (void)loadMepCatalog
{
    NSString *path = [[[NSBundle mainBundle] resourcePath]
        stringByAppendingPathComponent:@"resources/mep-networks.json"];
    NSData *data = [NSData dataWithContentsOfFile:path];
    NSDictionary *root = data != nil
        ? [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL] : nil;
    NSDictionary *hydraulic = [root isKindOfClass:[NSDictionary class]] ? root[@"hydraulic"] : nil;
    NSMutableArray<NSDictionary<NSString *, NSString *> *> *networks = [NSMutableArray array];
    if ([hydraulic isKindOfClass:[NSDictionary class]]) {
        for (NSString *key in hydraulic) {
            NSDictionary *info = hydraulic[key];
            if (![info isKindOfClass:[NSDictionary class]]) {
                continue;
            }
            [networks addObject:@{
                @"key": key,
                @"label": info[@"label"] != nil ? info[@"label"] : key,
                @"short": info[@"short"] != nil ? info[@"short"] : key,
                @"diameter": info[@"diameter"] != nil ? info[@"diameter"] : @"",
                @"material": info[@"material"] != nil ? info[@"material"] : @"",
                @"pressure": [NSString stringWithFormat:@"%g", [info[@"pressureKpa"] doubleValue]],
            }];
        }
    }
    [networks sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
        return [a[@"label"] localizedCaseInsensitiveCompare:b[@"label"]];
    }];
    self.mepNetworks = networks;
    NSArray *diameters = [root isKindOfClass:[NSDictionary class]] ? root[@"diameters"] : nil;
    self.mepDiameters = [diameters isKindOfClass:[NSArray class]] ? diameters : @[ @"1/2\"", @"3/4\"", @"1\"", @"2\"", @"4\"" ];
    NSDictionary *materials = [root isKindOfClass:[NSDictionary class]] ? root[@"materials"] : nil;
    self.mepMaterials = [materials isKindOfClass:[NSDictionary class]]
        ? [[materials allValues] sortedArrayUsingSelector:@selector(localizedCaseInsensitiveCompare:)]
        : @[ @"pvc", @"cpvc", @"acero", @"cobre", @"pead" ];
}

/* ------------------------------ construcción ----------------------------- */

/** Un bloque del panel: su alto lo decide quien lo arma, y se muestra u oculta. */
- (NSView *)blockWithHeight:(CGFloat)height
{
    NSView *block = [[NSView alloc] initWithFrame:NSMakeRect(0.0, 0.0, kPanelWidth, height)];
    block.autoresizingMask = NSViewWidthSizable;
    [self.blocks addObject:block];
    [self.content addSubview:block];
    return block;
}

- (void)addTitle:(NSString *)title to:(NSView *)block at:(CGFloat)y
{
    NSTextField *label = [NSTextField labelWithString:title];
    label.font = [NSFont systemFontOfSize:10.0 weight:NSFontWeightBold];
    label.textColor = panelMuted();
    label.frame = NSMakeRect(kInset, y, kPanelWidth - kInset * 2.0 - 1.0, 14.0);
    [block addSubview:label];
}

- (NSTextField *)fieldWithKey:(NSString *)key
{
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
                          in:(NSView *)block
{
    NSTextField *label = [NSTextField labelWithString:caption];
    label.font = [NSFont systemFontOfSize:11.0];
    label.textColor = panelMuted();
    label.frame = NSMakeRect(kInset, y + 3.0, 74.0, 16.0);
    [block addSubview:label];

    NSTextField *field = [self fieldWithKey:key];
    field.frame = NSMakeRect(kInset + 78.0, y, kPanelWidth - kInset * 2.0 - 78.0 - 1.0, 22.0);
    field.enabled = enabled;
    [block addSubview:field];
    return field;
}

/** Interruptor con su explicación, como las filas `switch-row` de la web. */
- (NSButton *)switchRow:(NSString *)title detail:(NSString *)detail action:(SEL)action
{
    NSButton *button = [NSButton checkboxWithTitle:title target:self action:action];
    button.font = [NSFont systemFontOfSize:11.5];
    button.contentTintColor = panelText();
    button.toolTip = detail;
    return button;
}

- (void)buildPanel
{
    self.fields = [NSMutableDictionary dictionary];
    self.blocks = [NSMutableArray array];
    self.swatches = [NSMutableArray array];

    self.scroll = [[NSScrollView alloc] initWithFrame:self.bounds];
    self.scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.scroll.hasVerticalScroller = YES;
    self.scroll.autohidesScrollers = YES;
    self.scroll.drawsBackground = NO;
    self.scroll.borderType = NSNoBorder;
    self.content = [[NSView alloc] initWithFrame:NSMakeRect(0.0, 0.0, kPanelWidth, 1200.0)];
    self.content.autoresizingMask = NSViewWidthSizable;
    self.scroll.documentView = self.content;
    [self addSubview:self.scroll];

    /* ------------------------------- capas ------------------------------- */
    NSView *layers = [self blockWithHeight:104.0];
    [self addTitle:@"CAPAS" to:layers at:0.0];

    self.currentLayerPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 18.0,
                                                                             kPanelWidth - kInset * 2.0 - 1.0, 24.0)
                                                       pullsDown:NO];
    self.currentLayerPopup.font = [NSFont systemFontOfSize:11.5];
    self.currentLayerPopup.target = self;
    self.currentLayerPopup.action = @selector(layerChosen:);
    self.currentLayerPopup.toolTip = @"Capa activa: la que reciben los elementos nuevos";
    [layers addSubview:self.currentLayerPopup];

    self.layerField = [[NSTextField alloc] initWithFrame:NSMakeRect(kInset, 48.0,
                                                                    kPanelWidth - kInset * 2.0 - 42.0 - 1.0, 22.0)];
    self.layerField.placeholderString = @"Nueva capa activa…";
    self.layerField.font = [NSFont systemFontOfSize:11.5];
    self.layerField.textColor = panelText();
    self.layerField.backgroundColor = panelField();
    self.layerField.drawsBackground = YES;
    self.layerField.bezeled = YES;
    self.layerField.bezelStyle = NSTextFieldRoundedBezel;
    self.layerField.target = self;
    self.layerField.action = @selector(createLayer:);
    [layers addSubview:self.layerField];

    NSButton *create = [NSButton buttonWithTitle:@"＋" target:self action:@selector(createLayer:)];
    create.frame = NSMakeRect(kPanelWidth - kInset - 36.0, 46.0, 36.0, 26.0);
    create.bezelStyle = NSBezelStyleRounded;
    create.toolTip = @"Crear la capa y dejarla activa";
    [layers addSubview:create];

    NSTextField *hint = [NSTextField labelWithString:@"La capa activa recibe lo que se dibuja."];
    hint.font = [NSFont systemFontOfSize:10.0];
    hint.textColor = panelMuted();
    hint.frame = NSMakeRect(kInset, 78.0, kPanelWidth - kInset * 2.0 - 1.0, 14.0);
    [layers addSubview:hint];

    /* ------------------------------ selección ---------------------------- */
    NSView *hero = [self blockWithHeight:118.0];
    self.kindLabel = [NSTextField labelWithString:@"SELECCIÓN"];
    self.kindLabel.font = [NSFont systemFontOfSize:9.5 weight:NSFontWeightBold];
    self.kindLabel.textColor = panelMuted();
    self.kindLabel.frame = NSMakeRect(kInset, 2.0, kPanelWidth - kInset * 2.0 - 1.0, 12.0);
    [hero addSubview:self.kindLabel];

    /* La miniatura del pictograma, como el héroe del inspector web. */
    self.heroPreview = [[NSImageView alloc] initWithFrame:NSMakeRect(kInset, 18.0, 34.0, 34.0)];
    self.heroPreview.imageScaling = NSImageScaleProportionallyUpOrDown;
    self.heroPreview.wantsLayer = YES;
    self.heroPreview.layer.cornerRadius = 5.0;
    self.heroPreview.layer.backgroundColor = [NSColor colorWithCalibratedWhite:0.96 alpha:1.0].CGColor;
    [hero addSubview:self.heroPreview];

    self.summary = [NSTextField labelWithString:@"Nada seleccionado"];
    self.summary.font = [NSFont systemFontOfSize:14.0 weight:NSFontWeightSemibold];
    self.summary.textColor = panelText();
    self.summary.lineBreakMode = NSLineBreakByTruncatingTail;
    self.summary.frame = NSMakeRect(kInset + 42.0, 20.0, kPanelWidth - kInset * 2.0 - 43.0, 20.0);
    [hero addSubview:self.summary];

    self.metaLabel = [NSTextField labelWithString:@""];
    self.metaLabel.font = [NSFont systemFontOfSize:10.5];
    self.metaLabel.textColor = panelMuted();
    self.metaLabel.lineBreakMode = NSLineBreakByTruncatingTail;
    self.metaLabel.frame = NSMakeRect(kInset + 42.0, 40.0, kPanelWidth - kInset * 2.0 - 43.0, 16.0);
    [hero addSubview:self.metaLabel];

    /* Las tres acciones de la cabecera: bloquear, duplicar y borrar. */
    NSArray<NSArray<NSString *> *> *heroActions = @[
        @[ @"lock", @"Bloquear · ⌘L", @"toggleLockHero:" ],
        @[ @"plus.square.on.square", @"Duplicar · ⌘D", @"duplicateHero:" ],
        @[ @"trash", @"Eliminar · Supr", @"deleteHero:" ],
    ];
    CGFloat actionX = kInset;
    const CGFloat actionY = 62.0;
    for (NSArray<NSString *> *action in heroActions) {
        NSImage *image = [NSImage imageWithSystemSymbolName:action[0] accessibilityDescription:action[1]];
        image.template = YES;
        NSButton *button = [[NSButton alloc] initWithFrame:NSMakeRect(actionX, actionY, 34.0, 28.0)];
        button.image = image;
        button.imagePosition = NSImageOnly;
        button.bezelStyle = NSBezelStyleTexturedRounded;
        button.contentTintColor = panelText();
        button.toolTip = action[1];
        button.target = self;
        button.action = NSSelectorFromString(action[2]);
        [hero addSubview:button];
        actionX += 38.0;
    }
    self.lockSwitch = [NSButton checkboxWithTitle:@"Bloqueado" target:self action:@selector(lockToggled:)];
    self.lockSwitch.font = [NSFont systemFontOfSize:11.0];
    self.lockSwitch.frame = NSMakeRect(actionX + 10.0, actionY + 4.0, kPanelWidth - actionX - 20.0, 20.0);
    self.lockSwitch.toolTip = @"Evita mover o modificar el elemento";
    [hero addSubview:self.lockSwitch];

    /* ----------------------------- geometría ----------------------------- */
    NSView *geometry = [self blockWithHeight:196.0];
    [self addTitle:@"GEOMETRÍA" to:geometry at:0.0];
    const CGFloat half = (kPanelWidth - kInset * 2.0 - 8.0 - 1.0) / 2.0;
    NSArray<NSArray<NSString *> *> *pairs = @[
        @[ @"X (cm)", @"x", @"Y (cm)", @"y" ],
        @[ @"Ancho (cm)", @"w", @"Alto (cm)", @"h" ],
    ];
    CGFloat pairY = 20.0;
    for (NSArray<NSString *> *pair in pairs) {
        for (int column = 0; column < 2; column += 1) {
            NSTextField *label = [NSTextField labelWithString:pair[column * 2]];
            label.font = [NSFont systemFontOfSize:10.0];
            label.textColor = panelMuted();
            label.frame = NSMakeRect(kInset + (half + 8.0) * (CGFloat) column, pairY, half, 13.0);
            [geometry addSubview:label];
            NSTextField *field = [self fieldWithKey:pair[column * 2 + 1]];
            field.frame = NSMakeRect(kInset + (half + 8.0) * (CGFloat) column, pairY + 14.0, half, 22.0);
            [geometry addSubview:field];
        }
        pairY += 42.0;
    }

    /* Giro con sus dos botones de 90°, como la fila `rotation-row` web. */
    NSTextField *rotationLabel = [NSTextField labelWithString:@"Rotación"];
    rotationLabel.font = [NSFont systemFontOfSize:10.0];
    rotationLabel.textColor = panelMuted();
    rotationLabel.frame = NSMakeRect(kInset, pairY, half, 13.0);
    [geometry addSubview:rotationLabel];
    NSButton *left = [NSButton buttonWithTitle:@"−90°" target:self action:@selector(rotateBy:)];
    left.frame = NSMakeRect(kInset, pairY + 14.0, 58.0, 24.0);
    left.bezelStyle = NSBezelStyleRounded;
    left.tag = -90;
    [geometry addSubview:left];
    NSTextField *rotationField = [self fieldWithKey:@"rotation"];
    rotationField.frame = NSMakeRect(kInset + 62.0, pairY + 14.0, half * 2.0 + 8.0 - 124.0, 22.0);
    [geometry addSubview:rotationField];
    NSButton *right = [NSButton buttonWithTitle:@"+90°" target:self action:@selector(rotateBy:)];
    right.frame = NSMakeRect(kInset + half * 2.0 + 8.0 - 58.0, pairY + 14.0, 58.0, 24.0);
    right.bezelStyle = NSBezelStyleRounded;
    right.tag = 90;
    [geometry addSubview:right];
    pairY += 44.0;

    NSTextField *measure = [NSTextField labelWithString:@"Medida declarada (m)"];
    measure.font = [NSFont systemFontOfSize:10.0];
    measure.textColor = panelMuted();
    measure.frame = NSMakeRect(kInset, pairY, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [geometry addSubview:measure];
    NSTextField *measureField = [self fieldWithKey:@"measuredM"];
    measureField.frame = NSMakeRect(kInset, pairY + 14.0, kPanelWidth - kInset * 2.0 - 1.0, 22.0);
    measureField.toolTip = @"Medida tomada en sitio; el auditor la prefiere sobre el dibujo";
    [geometry addSubview:measureField];

    /* ---------------------------- apariencia ----------------------------- */
    NSView *appearance = [self blockWithHeight:206.0];
    [self addTitle:@"APARIENCIA" to:appearance at:0.0];

    NSTextField *colourCaption = [NSTextField labelWithString:@"Color"];
    colourCaption.font = [NSFont systemFontOfSize:10.0];
    colourCaption.textColor = panelMuted();
    colourCaption.frame = NSMakeRect(kInset, 18.0, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [appearance addSubview:colourCaption];

    /* La paleta, en dos filas de diez. */
    const CGFloat swatchSize = 20.0;
    const CGFloat swatchGap = 4.0;
    for (size_t index = 0; index < kColourCount; index += 1) {
        const int column = (int) (index % 10);
        const int row = (int) (index / 10);
        NSButton *swatch = [[NSButton alloc] initWithFrame:NSMakeRect(kInset + (swatchSize + swatchGap) * (CGFloat) column,
                                                                     32.0 + (swatchSize + swatchGap) * (CGFloat) row,
                                                                     swatchSize, swatchSize)];
        swatch.title = @"";
        swatch.bordered = YES;
        swatch.bezelStyle = NSBezelStyleRegularSquare;
        swatch.wantsLayer = YES;
        swatch.layer.cornerRadius = 3.0;
        swatch.tag = (NSInteger) index;
        swatch.target = self;
        swatch.action = @selector(colourChosen:);
        swatch.toolTip = kColours[index];
        [appearance addSubview:swatch];
        [self.swatches addObject:swatch];
    }

    CGFloat appearanceY = 82.0;
    self.opacitySlider = [[NSSlider alloc] initWithFrame:NSMakeRect(kInset + 70.0, appearanceY, 140.0, 20.0)];
    self.opacitySlider.minValue = 0.1;
    self.opacitySlider.maxValue = 1.0;
    self.opacitySlider.target = self;
    self.opacitySlider.action = @selector(opacityChanged:);
    self.opacitySlider.toolTip = @"Opacidad del elemento, como en la web";
    [appearance addSubview:self.opacitySlider];
    NSTextField *opacityCaption = [NSTextField labelWithString:@"Opacidad"];
    opacityCaption.font = [NSFont systemFontOfSize:10.0];
    opacityCaption.textColor = panelMuted();
    opacityCaption.frame = NSMakeRect(kInset, appearanceY + 2.0, 66.0, 13.0);
    [appearance addSubview:opacityCaption];

    [self labelledRow:@"Grosor" key:@"stroke" y:108.0 enabled:YES in:appearance];
    [self labelledRow:@"Rótulo" key:@"label" y:138.0 enabled:YES in:appearance];

    /* Tamaño de letra: el mismo campo de la ficha web, solo para textos. */
    self.fontRow = [[NSView alloc] initWithFrame:NSMakeRect(0.0, 168.0, kPanelWidth, 32.0)];
    [appearance addSubview:self.fontRow];
    NSTextField *fontCaption = [NSTextField labelWithString:@"Tamaño de letra"];
    fontCaption.font = [NSFont systemFontOfSize:11.0];
    fontCaption.textColor = panelMuted();
    fontCaption.frame = NSMakeRect(kInset, 3.0, 74.0, 16.0);
    [self.fontRow addSubview:fontCaption];
    NSTextField *fontField = [self fieldWithKey:@"fontSize"];
    fontField.frame = NSMakeRect(kInset + 78.0, 0.0, kPanelWidth - kInset * 2.0 - 78.0 - 1.0, 22.0);
    fontField.toolTip = @"Alto de la letra en centímetros del plano";
    [self.fontRow addSubview:fontField];

    /* ------------------------------ puerta ------------------------------- */
    NSView *door = [self blockWithHeight:110.0];
    [self addTitle:@"PUERTA" to:door at:0.0];
    self.flipXSwitch = [self switchRow:@"Cambiar bisagra"
                                 detail:@"Voltea la puerta hacia el otro lado del vano."
                                 action:@selector(doorToggled:)];
    self.flipXSwitch.frame = NSMakeRect(kInset, 20.0, kPanelWidth - kInset * 2.0 - 1.0, 20.0);
    [door addSubview:self.flipXSwitch];
    self.flipYSwitch = [self switchRow:@"Abrir al otro lado"
                                 detail:@"Invierte el sentido de abatimiento respecto al muro."
                                 action:@selector(doorToggled:)];
    self.flipYSwitch.frame = NSMakeRect(kInset, 44.0, kPanelWidth - kInset * 2.0 - 1.0, 20.0);
    [door addSubview:self.flipYSwitch];
    self.exitSwitch = [self switchRow:@"Salida de emergencia"
                                detail:@"El auditor mide el recorrido desde esta puerta y la cuenta como salida."
                                action:@selector(doorToggled:)];
    self.exitSwitch.frame = NSMakeRect(kInset, 68.0, kPanelWidth - kInset * 2.0 - 1.0, 20.0);
    [door addSubview:self.exitSwitch];

    /* --------------------------- vía y entorno --------------------------- */
    NSView *outdoor = [self blockWithHeight:118.0];
    [self addTitle:@"VÍA Y ENTORNO" to:outdoor at:0.0];
    NSTextField *outdoorLabel = [NSTextField labelWithString:@"Ancho declarado (m)"];
    outdoorLabel.font = [NSFont systemFontOfSize:10.0];
    outdoorLabel.textColor = panelMuted();
    outdoorLabel.frame = NSMakeRect(kInset, 18.0, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [outdoor addSubview:outdoorLabel];
    NSTextField *widthField = [self fieldWithKey:@"widthM"];
    widthField.frame = NSMakeRect(kInset, 32.0, kPanelWidth - kInset * 2.0 - 1.0, 22.0);
    widthField.toolTip = @"Ancho de la vía o del andén; cuenta como exterior en el auditor";
    [outdoor addSubview:widthField];
    /* Carriles: solo para la vía, como el campo «Carriles» de la web. */
    NSTextField *lanesCaption = [NSTextField labelWithString:@"Carriles"];
    lanesCaption.font = [NSFont systemFontOfSize:10.0];
    lanesCaption.textColor = panelMuted();
    lanesCaption.frame = NSMakeRect(kInset, 58.0, 74.0, 13.0);
    [outdoor addSubview:lanesCaption];
    self.lanesPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset + 78.0, 54.0,
                                                                      kPanelWidth - kInset * 2.0 - 78.0 - 1.0, 24.0)
                                                  pullsDown:NO];
    self.lanesPopup.font = [NSFont systemFontOfSize:11.0];
    self.lanesPopup.target = self;
    self.lanesPopup.action = @selector(lanesChanged:);
    [self.lanesPopup addItemsWithTitles:@[ @"1 carril", @"2 carriles", @"3 carriles",
                                          @"4 carriles", @"5 carriles", @"6 carriles" ]];
    self.lanesPopup.toolTip = @"Carriles de la vía: cuentan para el ancho útil del auditor";
    [outdoor addSubview:self.lanesPopup];

    NSTextField *outdoorHint = [NSTextField labelWithString:@"El nombre en el plano es el rótulo."];
    outdoorHint.font = [NSFont systemFontOfSize:10.0];
    outdoorHint.textColor = panelMuted();
    outdoorHint.frame = NSMakeRect(kInset, 86.0, kPanelWidth - kInset * 2.0 - 1.0, 26.0);
    outdoorHint.maximumNumberOfLines = 2;
    outdoorHint.lineBreakMode = NSLineBreakByWordWrapping;
    [outdoor addSubview:outdoorHint];

    /* --------------------- red de tubería y circuito --------------------- */
    NSView *mep = [self blockWithHeight:224.0];
    self.mepTitle = [NSTextField labelWithString:@"RED DE TUBERÍA"];
    self.mepTitle.font = [NSFont systemFontOfSize:10.0 weight:NSFontWeightBold];
    self.mepTitle.textColor = panelMuted();
    self.mepTitle.frame = NSMakeRect(kInset, 0.0, kPanelWidth - kInset * 2.0 - 1.0, 14.0);
    [mep addSubview:self.mepTitle];

    /* Tubería: red, diámetro, material, pendiente y presión. */
    self.pipeGroup = [[NSView alloc] initWithFrame:NSMakeRect(0.0, 18.0, kPanelWidth, 200.0)];
    [mep addSubview:self.pipeGroup];

    NSTextField *networkCaption = [NSTextField labelWithString:@"Red"];
    networkCaption.font = [NSFont systemFontOfSize:10.0];
    networkCaption.textColor = panelMuted();
    networkCaption.frame = NSMakeRect(kInset, 0.0, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [self.pipeGroup addSubview:networkCaption];
    self.networkPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 14.0,
                                                                       kPanelWidth - kInset * 2.0 - 1.0, 24.0)
                                                     pullsDown:NO];
    self.networkPopup.font = [NSFont systemFontOfSize:11.0];
    self.networkPopup.target = self;
    self.networkPopup.action = @selector(networkChosen:);
    self.networkPopup.toolTip = @"Al cambiar de red se aplican el diámetro, el material y la presión de referencia";
    [self.pipeGroup addSubview:self.networkPopup];

    NSTextField *diameterCaption = [NSTextField labelWithString:@"Diámetro"];
    diameterCaption.font = [NSFont systemFontOfSize:10.0];
    diameterCaption.textColor = panelMuted();
    diameterCaption.frame = NSMakeRect(kInset, 44.0, half, 13.0);
    [self.pipeGroup addSubview:diameterCaption];
    self.diameterPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 58.0, half, 24.0) pullsDown:NO];
    self.diameterPopup.font = [NSFont systemFontOfSize:11.0];
    self.diameterPopup.target = self;
    self.diameterPopup.action = @selector(mepChanged:);
    [self.pipeGroup addSubview:self.diameterPopup];

    NSTextField *materialCaption = [NSTextField labelWithString:@"Material"];
    materialCaption.font = [NSFont systemFontOfSize:10.0];
    materialCaption.textColor = panelMuted();
    materialCaption.frame = NSMakeRect(kInset + half + 8.0, 44.0, half, 13.0);
    [self.pipeGroup addSubview:materialCaption];
    self.materialPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset + half + 8.0, 58.0, half, 24.0)
                                                     pullsDown:NO];
    self.materialPopup.font = [NSFont systemFontOfSize:11.0];
    self.materialPopup.target = self;
    self.materialPopup.action = @selector(mepChanged:);
    [self.pipeGroup addSubview:self.materialPopup];

    NSTextField *slopeCaption = [NSTextField labelWithString:@"Pendiente (%)"];
    slopeCaption.font = [NSFont systemFontOfSize:10.0];
    slopeCaption.textColor = panelMuted();
    slopeCaption.frame = NSMakeRect(kInset, 88.0, half, 13.0);
    [self.pipeGroup addSubview:slopeCaption];
    NSTextField *slopeField = [self fieldWithKey:@"mepSlope"];
    slopeField.frame = NSMakeRect(kInset, 102.0, half, 22.0);
    [self.pipeGroup addSubview:slopeField];

    NSTextField *pressureCaption = [NSTextField labelWithString:@"Presión (kPa)"];
    pressureCaption.font = [NSFont systemFontOfSize:10.0];
    pressureCaption.textColor = panelMuted();
    pressureCaption.frame = NSMakeRect(kInset + half + 8.0, 88.0, half, 13.0);
    [self.pipeGroup addSubview:pressureCaption];
    NSTextField *pressureField = [self fieldWithKey:@"mepPressure"];
    pressureField.frame = NSMakeRect(kInset + half + 8.0, 102.0, half, 22.0);
    [self.pipeGroup addSubview:pressureField];

    NSTextField *mepHint = [NSTextField labelWithString:@"La pendiente y la presión son referencias de diseño: "
                                                        "el desagüe real se verifica en obra."];
    mepHint.font = [NSFont systemFontOfSize:10.0];
    mepHint.textColor = panelMuted();
    mepHint.frame = NSMakeRect(kInset, 130.0, kPanelWidth - kInset * 2.0 - 1.0, 40.0);
    mepHint.maximumNumberOfLines = 3;
    mepHint.lineBreakMode = NSLineBreakByWordWrapping;
    [self.pipeGroup addSubview:mepHint];

    /* Canaleta: circuito, tensión, calibre y fases. */
    self.circuitGroup = [[NSView alloc] initWithFrame:NSMakeRect(0.0, 18.0, kPanelWidth, 200.0)];
    [mep addSubview:self.circuitGroup];

    NSTextField *codeCaption = [NSTextField labelWithString:@"Circuito"];
    codeCaption.font = [NSFont systemFontOfSize:10.0];
    codeCaption.textColor = panelMuted();
    codeCaption.frame = NSMakeRect(kInset, 0.0, half, 13.0);
    [self.circuitGroup addSubview:codeCaption];
    NSTextField *codeField = [self fieldWithKey:@"circuitCode"];
    codeField.frame = NSMakeRect(kInset, 14.0, half, 22.0);
    codeField.toolTip = @"Los tramos con el mismo código forman un circuito";
    [self.circuitGroup addSubview:codeField];

    NSTextField *voltageCaption = [NSTextField labelWithString:@"Tensión"];
    voltageCaption.font = [NSFont systemFontOfSize:10.0];
    voltageCaption.textColor = panelMuted();
    voltageCaption.frame = NSMakeRect(kInset + half + 8.0, 0.0, half, 13.0);
    [self.circuitGroup addSubview:voltageCaption];
    self.voltagePopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset + half + 8.0, 14.0, half, 24.0)
                                                    pullsDown:NO];
    self.voltagePopup.font = [NSFont systemFontOfSize:11.0];
    self.voltagePopup.target = self;
    self.voltagePopup.action = @selector(circuitChanged:);
    [self.voltagePopup addItemsWithTitles:@[ @"110 V", @"208 V", @"220 V", @"440 V" ]];
    [self.circuitGroup addSubview:self.voltagePopup];

    NSTextField *gaugeCaption = [NSTextField labelWithString:@"Calibre (AWG)"];
    gaugeCaption.font = [NSFont systemFontOfSize:10.0];
    gaugeCaption.textColor = panelMuted();
    gaugeCaption.frame = NSMakeRect(kInset, 44.0, half, 13.0);
    [self.circuitGroup addSubview:gaugeCaption];
    self.gaugePopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 58.0, half, 24.0) pullsDown:NO];
    self.gaugePopup.font = [NSFont systemFontOfSize:11.0];
    self.gaugePopup.target = self;
    self.gaugePopup.action = @selector(circuitChanged:);
    [self.gaugePopup addItemsWithTitles:@[ @"14", @"12", @"10", @"8", @"6", @"4", @"2" ]];
    [self.circuitGroup addSubview:self.gaugePopup];

    NSTextField *phasesCaption = [NSTextField labelWithString:@"Fases"];
    phasesCaption.font = [NSFont systemFontOfSize:10.0];
    phasesCaption.textColor = panelMuted();
    phasesCaption.frame = NSMakeRect(kInset + half + 8.0, 44.0, half, 13.0);
    [self.circuitGroup addSubview:phasesCaption];
    self.phasesPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset + half + 8.0, 58.0, half, 24.0)
                                                   pullsDown:NO];
    self.phasesPopup.font = [NSFont systemFontOfSize:11.0];
    self.phasesPopup.target = self;
    self.phasesPopup.action = @selector(circuitChanged:);
    [self.phasesPopup addItemsWithTitles:@[ @"Monofásico (1)", @"Trifásico (3)" ]];
    [self.circuitGroup addSubview:self.phasesPopup];

    NSTextField *circuitHint = [NSTextField labelWithString:@"Los tramos con el mismo código forman un circuito. "
                                                             "El panel Redes de la web suma cargas y estima la caída de tensión."];
    circuitHint.font = [NSFont systemFontOfSize:10.0];
    circuitHint.textColor = panelMuted();
    circuitHint.frame = NSMakeRect(kInset, 88.0, kPanelWidth - kInset * 2.0 - 1.0, 40.0);
    circuitHint.maximumNumberOfLines = 3;
    circuitHint.lineBreakMode = NSLineBreakByWordWrapping;
    [self.circuitGroup addSubview:circuitHint];

    /* ------------------------------ extintor ----------------------------- */
    NSView *extinguisher = [self blockWithHeight:198.0];
    [self addTitle:@"EXTINTOR" to:extinguisher at:0.0];

    NSTextField *agentCaption = [NSTextField labelWithString:@"Agente extintor"];
    agentCaption.font = [NSFont systemFontOfSize:10.0];
    agentCaption.textColor = panelMuted();
    agentCaption.frame = NSMakeRect(kInset, 18.0, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [extinguisher addSubview:agentCaption];
    self.extAgent = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 32.0,
                                                                    kPanelWidth - kInset * 2.0 - 1.0, 24.0)
                                              pullsDown:NO];
    self.extAgent.font = [NSFont systemFontOfSize:11.0];
    self.extAgent.target = self;
    self.extAgent.action = @selector(extinguisherChanged:);
    [self.extAgent addItemsWithTitles:@[ @"Polvo químico seco ABC", @"Polvo químico seco BC",
                                        @"Dióxido de carbono (CO₂)", @"Agua presurizada",
                                        @"Espuma (AFFF/FFFP)", @"Químico húmedo (Clase K)" ]];
    [extinguisher addSubview:self.extAgent];

    [self labelledRow:@"Capacidad" key:@"extCapacityLb" y:62.0 enabled:YES in:extinguisher];
    [self labelledRow:@"Clasificación" key:@"extRating" y:92.0 enabled:YES in:extinguisher];
    [self labelledRow:@"Parte superior" key:@"extMountCm" y:122.0 enabled:YES in:extinguisher];

    NSTextField *hazardCaption = [NSTextField labelWithString:@"Riesgo"];
    hazardCaption.font = [NSFont systemFontOfSize:10.0];
    hazardCaption.textColor = panelMuted();
    hazardCaption.frame = NSMakeRect(kInset, 152.0, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [extinguisher addSubview:hazardCaption];
    self.extHazard = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 166.0,
                                                                     kPanelWidth - kInset * 2.0 - 1.0, 24.0)
                                                pullsDown:NO];
    self.extHazard.font = [NSFont systemFontOfSize:11.0];
    self.extHazard.target = self;
    self.extHazard.action = @selector(extinguisherChanged:);
    [self.extHazard addItemsWithTitles:@[ @"Leve", @"Ordinario", @"Extra" ]];
    [extinguisher addSubview:self.extHazard];

    /* ---------------------------- organización --------------------------- */
    NSView *organization = [self blockWithHeight:110.0];
    [self addTitle:@"ORGANIZACIÓN" to:organization at:0.0];
    NSTextField *layerCaption = [NSTextField labelWithString:@"Capa del elemento"];
    layerCaption.font = [NSFont systemFontOfSize:10.0];
    layerCaption.textColor = panelMuted();
    layerCaption.frame = NSMakeRect(kInset, 18.0, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [organization addSubview:layerCaption];
    self.layerPopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 32.0,
                                                                      kPanelWidth - kInset * 2.0 - 1.0, 24.0)
                                                 pullsDown:NO];
    self.layerPopup.font = [NSFont systemFontOfSize:11.0];
    self.layerPopup.target = self;
    self.layerPopup.action = @selector(applyFields:);
    [organization addSubview:self.layerPopup];

    NSTextField *typeCaption = [NSTextField labelWithString:@"Tipo de elemento"];
    typeCaption.font = [NSFont systemFontOfSize:10.0];
    typeCaption.textColor = panelMuted();
    typeCaption.frame = NSMakeRect(kInset, 62.0, kPanelWidth - kInset * 2.0 - 1.0, 13.0);
    [organization addSubview:typeCaption];
    self.typePopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(kInset, 76.0,
                                                                     kPanelWidth - kInset * 2.0 - 1.0, 24.0)
                                                pullsDown:NO];
    self.typePopup.font = [NSFont systemFontOfSize:11.0];
    self.typePopup.target = self;
    self.typePopup.action = @selector(typeChosen:);
    self.typePopup.toolTip = @"Convertir conserva posición, giro y capa";
    [organization addSubview:self.typePopup];

    /* ------------------------------ maqueta ------------------------------ */
    NSView *guide = [self blockWithHeight:180.0];
    [self addTitle:@"MAQUETA DE TRAZO" to:guide at:0.0];
    NSTextField *guideHint = [NSTextField labelWithString:@"Imagen de fondo para calcar el plano. No se imprime."];
    guideHint.font = [NSFont systemFontOfSize:10.0];
    guideHint.textColor = panelMuted();
    guideHint.frame = NSMakeRect(kInset, 18.0, kPanelWidth - kInset * 2.0 - 1.0, 26.0);
    guideHint.maximumNumberOfLines = 2;
    guideHint.lineBreakMode = NSLineBreakByWordWrapping;
    [guide addSubview:guideHint];

    NSButton *importGuide = [NSButton buttonWithTitle:@"Importar imagen…" target:self
                                               action:@selector(requestImportGuide:)];
    importGuide.frame = NSMakeRect(kInset, 48.0, kPanelWidth - kInset * 2.0 - 1.0, 26.0);
    importGuide.bezelStyle = NSBezelStyleRounded;
    [guide addSubview:importGuide];

    self.guideOpacitySlider = [[NSSlider alloc] initWithFrame:NSMakeRect(kInset + 70.0, 82.0, 140.0, 20.0)];
    self.guideOpacitySlider.minValue = 0.05;
    self.guideOpacitySlider.maxValue = 1.0;
    self.guideOpacitySlider.target = self;
    self.guideOpacitySlider.action = @selector(guideOpacityChanged:);
    [guide addSubview:self.guideOpacitySlider];
    NSTextField *guideOpacity = [NSTextField labelWithString:@"Opacidad"];
    guideOpacity.font = [NSFont systemFontOfSize:10.0];
    guideOpacity.textColor = panelMuted();
    guideOpacity.frame = NSMakeRect(kInset, 84.0, 66.0, 13.0);
    [guide addSubview:guideOpacity];

    self.guideVisibleSwitch = [self switchRow:@"Visible" detail:@"Oculta la maqueta sin perderla"
                                        action:@selector(guideVisibilityToggled:)];
    self.guideVisibleSwitch.frame = NSMakeRect(kInset, 110.0, kPanelWidth - kInset * 2.0 - 1.0, 20.0);
    [guide addSubview:self.guideVisibleSwitch];
    self.guideLockSwitch = [self switchRow:@"Bloqueada" detail:@"Evita que el lienzo la mueva al dibujar"
                                     action:@selector(guideLockToggled:)];
    self.guideLockSwitch.frame = NSMakeRect(kInset, 134.0, kPanelWidth - kInset * 2.0 - 1.0, 20.0);
    [guide addSubview:self.guideLockSwitch];

    NSButton *removeGuide = [NSButton buttonWithTitle:@"Quitar la maqueta" target:self
                                               action:@selector(requestClearGuide:)];
    removeGuide.frame = NSMakeRect(kInset, 158.0, kPanelWidth - kInset * 2.0 - 1.0, 20.0);
    removeGuide.bezelStyle = NSBezelStyleRounded;
    removeGuide.toolTip = @"Borra la imagen del archivo del plano";
    [guide addSubview:removeGuide];

    [self reload];
}

/* -------------------------------- lectura -------------------------------- */

- (const norma_element *)selectedElement
{
    if (self.document == NULL || self.elementIndex < 0 || (size_t) self.elementIndex >= self.document->count) {
        return NULL;
    }
    return &self.document->elements[(size_t) self.elementIndex];
}

/** Capas del plano: la activa primero y luego las que ya existen. */
- (NSArray<NSString *> *)layerNames
{
    NSMutableArray<NSString *> *names = [NSMutableArray array];
    if (self.document == NULL) {
        return names;
    }
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
        [names addObject:@"capa_planta"];
    }
    return names;
}

- (void)populateLayers
{
    NSArray<NSString *> *names = [self layerNames];
    [self.currentLayerPopup removeAllItems];
    [self.currentLayerPopup addItemsWithTitles:names];
    [self.currentLayerPopup selectItemAtIndex:0];

    NSString *current = self.selectedElement != NULL
        ? [NSString stringWithUTF8String:self.selectedElement->layer] : nil;
    [self.layerPopup removeAllItems];
    [self.layerPopup addItemsWithTitles:names];
    if (current != nil && [names containsObject:current]) {
        [self.layerPopup selectItemWithTitle:current];
    }
}

- (void)setField:(NSString *)key value:(NSString *)value
{
    NSTextField *field = self.fields[key];
    if (field != nil) {
        field.stringValue = value != nil ? value : @"";
    }
}

- (void)reload
{
    if (self.document == NULL) {
        return;
    }
    [self populateLayers];
    const norma_element *element = [self selectedElement];

    /* Bloques que solo tienen sentido con una selección. */
    NSMutableDictionary<NSString *, NSNumber *> *visible = [NSMutableDictionary dictionary];

    if (element == NULL) {
        self.kindLabel.stringValue = @"SELECCIÓN";
        self.heroPreview.image = nil;
        self.heroPreview.hidden = YES;
        self.summary.stringValue = [NSString stringWithFormat:@"Nada seleccionado · %zu elementos",
                                                              self.document->count];
        self.summary.textColor = panelText();
        self.metaLabel.stringValue = @"Haz clic en un elemento del plano para editar su ficha.";
        self.lockSwitch.hidden = YES;
        self.lockSwitch.state = NSControlStateValueOff;
        for (NSString *key in self.fields) {
            NSTextField *field = self.fields[key];
            field.stringValue = @"";
            field.enabled = NO;
        }
        self.opacitySlider.enabled = NO;
        for (size_t index = 0; index < kColourCount; index += 1) {
            self.swatches[index].hidden = YES;
        }
        self.fontRow.hidden = YES;
        visible[@"geometry"] = @0;
        visible[@"appearance"] = @0;
        visible[@"door"] = @0;
        visible[@"outdoor"] = @0;
        visible[@"mep"] = @0;
        visible[@"extinguisher"] = @0;
        visible[@"organization"] = @0;
        self.lanesPopup.hidden = YES;
    } else {
        double x = 0.0;
        double y = 0.0;
        double w = 0.0;
        double h = 0.0;
        element_bounds(element, &x, &y, &w, &h);
        const BOOL box = element->node_count < 2;
        const BOOL door = norma_object_is_door(element->type) != 0;
        const BOOL extinguisher = strstr(element->type, "extinguisher") != NULL;
        const BOOL outdoor = strcmp(element->type, "road") == 0 || strcmp(element->type, "sidewalk") == 0
                             || strcmp(element->type, "crosswalk") == 0
                             || strcmp(element->type, "parking") == 0
                             || strcmp(element->type, "property") == 0;
        const BOOL pathType = strcmp(element->type, "wall") == 0 || strcmp(element->type, "line") == 0
                              || strcmp(element->type, "route") == 0
                              || strcmp(element->type, "dimension") == 0;

        self.kindLabel.stringValue = [type_name(element->type) uppercaseString];
        /* La miniatura del catálogo; si la pieza no tiene pictograma (un muro,
           una cota) se deja el hueco en blanco en vez de una imagen falsa. */
        self.heroPreview.image = NormiaThumbnailForType(element->type, 32.0);
        self.heroPreview.hidden = self.heroPreview.image == nil;
        self.summary.stringValue = type_name(element->type);
        self.summary.textColor = panelAccent();
        /* Si la pieza es del catálogo y su pictograma no aparece, se dice aquí:
           es la primera pregunta al abrir una incidencia sobre una señal. */
        NSString *picture = @"";
        if (box && !door) {
            const norma_object_spec *spec = norma_object_find(element->type);
            if (spec == NULL) {
                picture = @" · sin pictograma en el catálogo";
            } else if (spec->svg == NULL) {
                picture = @" · sin dibujo propio";
            } else {
                picture = [NSString stringWithFormat:@" · %s", spec->name];
            }
        }
        self.metaLabel.stringValue = [NSString stringWithFormat:@"%@ · %@%@%@",
                                                                box ? @"caja" : @"trazo",
                                                                element->layer[0] != '\0'
                                                                    ? [NSString stringWithUTF8String:element->layer]
                                                                    : @"sin capa",
                                                                element->locked ? @" · bloqueado" : @"",
                                                                picture];
        [self setField:@"x" value:[NSString stringWithFormat:@"%.0f", x]];
        [self setField:@"y" value:[NSString stringWithFormat:@"%.0f", y]];
        [self setField:@"w" value:[NSString stringWithFormat:@"%.0f", w]];
        [self setField:@"h" value:[NSString stringWithFormat:@"%.0f", h]];
        [self setField:@"rotation" value:[NSString stringWithFormat:@"%.0f", element->rotation]];
        [self setField:@"stroke" value:[NSString stringWithFormat:@"%.1f", element->stroke]];
        [self setField:@"measuredM" value:element->measured_m > 0.0
            ? [NSString stringWithFormat:@"%g", element->measured_m] : @""];
        [self setField:@"label" value:[NSString stringWithUTF8String:element->label]];
        [self setField:@"fontSize" value:element->font_size > 0.0
            ? [NSString stringWithFormat:@"%g", element->font_size] : @""];
        self.fontRow.hidden = strcmp(element->type, "text") != 0;
        [self setField:@"widthM" value:[NSString stringWithFormat:@"%g", element->width_m]];
        [self setField:@"extCapacityLb" value:element->ext_capacity_lb > 0.0
            ? [NSString stringWithFormat:@"%.1f", element->ext_capacity_lb] : @""];
        [self setField:@"extRating" value:[NSString stringWithUTF8String:element->ext_rating]];
        [self setField:@"extMountCm" value:element->has_ext_mount
            ? [NSString stringWithFormat:@"%.0f", element->ext_mount_cm] : @""];

        for (NSString *key in self.fields) {
            self.fields[key].enabled = !element->locked;
        }
        self.fields[@"w"].enabled = box && !element->locked;
        self.fields[@"h"].enabled = box && !element->locked;
        self.opacitySlider.enabled = !element->locked;
        self.opacitySlider.doubleValue = element->opacity > 0.0 ? element->opacity : 1.0;

        /* Paleta: el color de la familia y el propio. */
        for (size_t index = 0; index < kColourCount; index += 1) {
            NSButton *swatch = self.swatches[index];
            swatch.hidden = NO;
            swatch.enabled = !element->locked;
            NSColor *colour = [NSColor colorWithSRGBRed:0.0 green:0.0 blue:0.0 alpha:1.0];
            NSColor *parsed = nil;
            unsigned int red = 0;
            unsigned int green = 0;
            unsigned int blue = 0;
            if (sscanf(kColours[index].UTF8String + 1, "%2x%2x%2x", &red, &green, &blue) == 3) {
                parsed = [NSColor colorWithSRGBRed:(CGFloat) red / 255.0 green:(CGFloat) green / 255.0
                                              blue:(CGFloat) blue / 255.0 alpha:1.0];
            }
            colour = parsed != nil ? parsed : colour;
            swatch.layer.backgroundColor = colour.CGColor;
            const BOOL selected = element->colour[0] == '#'
                                  && [kColours[index] caseInsensitiveCompare:[NSString stringWithUTF8String:element->colour]]
                                         == NSOrderedSame;
            swatch.layer.borderWidth = selected ? 2.5 : 1.0;
            swatch.layer.borderColor = selected ? panelAccent().CGColor
                                                : [NSColor colorWithCalibratedWhite:0.35 alpha:1.0].CGColor;
        }

        self.lockSwitch.hidden = NO;
        self.lockSwitch.state = element->locked ? NSControlStateValueOn : NSControlStateValueOff;

        self.flipXSwitch.state = element->flip_x ? NSControlStateValueOn : NSControlStateValueOff;
        self.flipYSwitch.state = element->flip_y ? NSControlStateValueOn : NSControlStateValueOff;
        self.exitSwitch.state = element->is_exit ? NSControlStateValueOn : NSControlStateValueOff;
        self.exitSwitch.enabled = door && !element->locked;

        [self.extAgent selectItemAtIndex:0];
        if (strncmp(element->ext_agent, "co2", 3) == 0) { [self.extAgent selectItemAtIndex:2]; }
        else if (strncmp(element->ext_agent, "water", 5) == 0) { [self.extAgent selectItemAtIndex:3]; }
        else if (strncmp(element->ext_agent, "foam", 4) == 0) { [self.extAgent selectItemAtIndex:4]; }
        else if (strncmp(element->ext_agent, "wet", 3) == 0) { [self.extAgent selectItemAtIndex:5]; }
        else if (strncmp(element->ext_agent, "pqs_bc", 6) == 0) { [self.extAgent selectItemAtIndex:1]; }
        [self.extHazard selectItemAtIndex:strncmp(element->ext_hazard, "light", 5) == 0
                                              ? 0 : (strncmp(element->ext_hazard, "extra", 5) == 0 ? 2 : 1)];

        /* Conversión de tipo: solo entre dibujos de la misma clase. */
        [self.typePopup removeAllItems];
        [self.typePopup addItemWithTitle:type_name(element->type)];
        if (pathType || box) {
            NSArray<NSString *> *choices = pathType
                ? @[ @"wall", @"line", @"route", @"dimension" ]
                : @[ @"rect", @"ellipse", @"text" ];
            for (NSString *choice in choices) {
                if (strcmp(element->type, choice.UTF8String) != 0) {
                    [self.typePopup addItemWithTitle:type_name(choice.UTF8String)];
                }
            }
        }
        self.typePopup.enabled = (pathType || box) && !element->locked;

        const BOOL pipe = strcmp(element->type, "pipe") == 0;
        const BOOL conduit = strcmp(element->type, "conduit") == 0;
        self.lanesPopup.hidden = strcmp(element->type, "road") != 0;
        if (strcmp(element->type, "road") == 0) {
            const int lanes = element->lanes > 0 ? element->lanes : 2;
            [self.lanesPopup selectItemAtIndex:lanes - 1];
            self.lanesPopup.enabled = !element->locked;
        }
        [self refreshMepForElement:element];
        visible[@"mep"] = @(pipe || conduit);

        visible[@"geometry"] = @1;
        visible[@"appearance"] = @1;
        self.fontRow.hidden = strcmp(element->type, "text") != 0;
        visible[@"door"] = @(door);
        visible[@"outdoor"] = @(outdoor);
        visible[@"extinguisher"] = @(extinguisher);
        visible[@"organization"] = @1;
    }

    /* Maqueta: siempre visible; sus controles, solo con imagen. */
    const BOOL hasGuide = self.document->guide.present != 0;
    self.guideOpacitySlider.enabled = hasGuide;
    self.guideVisibleSwitch.enabled = hasGuide;
    self.guideLockSwitch.enabled = hasGuide;
    if (hasGuide) {
        self.guideOpacitySlider.doubleValue = self.document->guide.opacity;
        self.guideVisibleSwitch.state = self.document->guide.visible ? NSControlStateValueOn
                                                                     : NSControlStateValueOff;
        self.guideLockSwitch.state = self.document->guide.locked ? NSControlStateValueOn
                                                                 : NSControlStateValueOff;
    }

    /* La geometría y la apariencia se ocultan sin selección; las capas y la
       maqueta siempre están. */
    const NSArray<NSString *> *order = @[ @"layers", @"hero", @"geometry", @"appearance", @"door",
                                          @"outdoor", @"mep", @"extinguisher", @"organization", @"guide" ];
    for (NSUInteger index = 0; index < self.blocks.count && index < order.count; index += 1) {
        NSNumber *flag = visible[order[index]];
        self.blocks[index].hidden = flag != nil && flag.boolValue == NO;
    }
    [self layoutBlocks];
}

/**
 * Llena la ficha de red o de circuito con lo que dice el documento.
 *
 * Los desplegables se rehacen en cada lectura porque las redes salen del
 * catálogo y el elemento puede traer un valor que no esté en la tabla; en ese
 * caso se añade al final para no perderlo al guardar.
 */
- (void)refreshMepForElement:(const norma_element *)element
{
    const BOOL pipe = strcmp(element->type, "pipe") == 0;
    self.mepTitle.stringValue = pipe ? @"RED DE TUBERÍA" : @"CIRCUITO ELÉCTRICO";
    self.pipeGroup.hidden = !pipe;
    self.circuitGroup.hidden = pipe;

    if (pipe) {
        [self.networkPopup removeAllItems];
        NSInteger selected = -1;
        NSInteger index = 0;
        for (NSDictionary<NSString *, NSString *> *network in self.mepNetworks) {
            [self.networkPopup addItemWithTitle:[NSString stringWithFormat:@"%@ (%@)",
                                                 network[@"label"], network[@"short"]]];
            if (strcmp(element->mep_network, network[@"key"].UTF8String) == 0) {
                selected = index;
            }
            index += 1;
        }
        if (self.mepNetworks.count == 0) {
            [self.networkPopup addItemWithTitle:@"Sin catálogo de redes"];
        }
        if (selected >= 0) {
            [self.networkPopup selectItemAtIndex:selected];
        }

        NSMutableArray<NSString *> *diameters = [self.mepDiameters mutableCopy];
        if (element->mep_diameter[0] != '\0'
            && ![diameters containsObject:[NSString stringWithUTF8String:element->mep_diameter]]) {
            [diameters insertObject:[NSString stringWithUTF8String:element->mep_diameter] atIndex:0];
        }
        [self.diameterPopup removeAllItems];
        [self.diameterPopup addItemsWithTitles:diameters];
        if (element->mep_diameter[0] != '\0') {
            [self.diameterPopup selectItemWithTitle:[NSString stringWithUTF8String:element->mep_diameter]];
        }

        NSMutableArray<NSString *> *materials = [self.mepMaterials mutableCopy];
        if (element->mep_material[0] != '\0'
            && ![materials containsObject:[NSString stringWithUTF8String:element->mep_material]]) {
            [materials insertObject:[NSString stringWithUTF8String:element->mep_material] atIndex:0];
        }
        [self.materialPopup removeAllItems];
        [self.materialPopup addItemsWithTitles:materials];
        if (element->mep_material[0] != '\0') {
            [self.materialPopup selectItemWithTitle:[NSString stringWithUTF8String:element->mep_material]];
        }

        [self setField:@"mepSlope" value:element->mep_slope > 0.0
            ? [NSString stringWithFormat:@"%g", element->mep_slope] : @""];
        [self setField:@"mepPressure" value:element->mep_pressure > 0.0
            ? [NSString stringWithFormat:@"%g", element->mep_pressure] : @""];

        const BOOL editable = !element->locked;
        self.networkPopup.enabled = editable;
        self.diameterPopup.enabled = editable;
        self.materialPopup.enabled = editable;
    } else {
        [self setField:@"circuitCode" value:element->circuit[0] != '\0'
            ? [NSString stringWithUTF8String:element->circuit] : @"C1"];

        const int voltages[4] = {110, 208, 220, 440};
        NSInteger selected = -1;
        for (int index = 0; index < 4; index += 1) {
            if (voltages[index] == element->circuit_voltage) {
                selected = index;
            }
        }
        [self.voltagePopup selectItemAtIndex:selected >= 0 ? selected : 2];
        self.voltagePopup.enabled = !element->locked;

        NSString *gauge = element->circuit_gauge[0] != '\0'
            ? [NSString stringWithUTF8String:element->circuit_gauge] : @"12";
        if ([self.gaugePopup indexOfItemWithTitle:gauge] < 0) {
            [self.gaugePopup addItemWithTitle:gauge];
        }
        [self.gaugePopup selectItemWithTitle:gauge];
        self.gaugePopup.enabled = !element->locked;

        [self.phasesPopup selectItemAtIndex:element->circuit_phases >= 3 ? 1 : 0];
        self.phasesPopup.enabled = !element->locked;
    }
}

/** Coloca los bloques visibles uno tras otro y ajusta el alto del contenido. */
- (void)layoutBlocks
{
    CGFloat y = 10.0;
    for (NSView *block in self.blocks) {
        if (block.hidden) {
            continue;
        }
        block.frame = NSMakeRect(0.0, y, kPanelWidth, NSHeight(block.frame));
        y += NSHeight(block.frame) + 12.0;
    }
    self.content.frame = NSMakeRect(0.0, 0.0, kPanelWidth, MAX(y + 8.0, NSHeight(self.scroll.bounds)));
}

- (void)focusLabelField
{
    NSTextField *field = self.fields[@"label"];
    if (field != nil && field.enabled) {
        [self.window makeFirstResponder:field];
    }
}

/* -------------------------------- edición -------------------------------- */

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
    if (element->locked) {
        [self.delegate inspector:self status:@"El elemento está bloqueado: desbloquéalo para editarlo."];
        return;
    }
    /* Datos que no cambian durante la edición: el puntero al elemento puede
       dejar de valer si el documento reasigna su lista, así que se copian. */
    const size_t nodeCount = element->node_count;
    NSString *name = type_name(element->type);
    /* Los límites se leen antes de abrir la edición: el documento puede mover su
       lista de elementos y dejar viejo el puntero. */
    double currentX = 0.0;
    double currentY = 0.0;
    double currentW = 0.0;
    double currentH = 0.0;
    element_bounds(element, &currentX, &currentY, &currentW, &currentH);
    (void) currentW;
    (void) currentH;
    norma_document_begin_edit(self.document);

    double x = parse_number([(NSTextField *) self.fields[@"x"] stringValue]);
    double y = parse_number([(NSTextField *) self.fields[@"y"] stringValue]);
    double w = parse_number([(NSTextField *) self.fields[@"w"] stringValue]);
    double h = parse_number([(NSTextField *) self.fields[@"h"] stringValue]);
    const double rotation = parse_number([(NSTextField *) self.fields[@"rotation"] stringValue]);
    const double stroke = parse_number([(NSTextField *) self.fields[@"stroke"] stringValue]);
    const double measured = parse_number([(NSTextField *) self.fields[@"measuredM"] stringValue]);
    NSString *label = [(NSTextField *) self.fields[@"label"] stringValue];
    NSString *layer = self.layerPopup.titleOfSelectedItem;
    const double widthM = parse_number([(NSTextField *) self.fields[@"widthM"] stringValue]);

    int changed = 0;
    NSMutableArray<NSString *> *refused = [NSMutableArray array];

    if (nodeCount >= 2) {
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

    if (norma_document_set_rotation(self.document, index, rotation)) {
        changed = 1;
    }
    if (norma_document_set_stroke(self.document, index, stroke)) {
        changed = 1;
    }
    if (norma_document_set_label(self.document, index, label.UTF8String)) {
        changed = 1;
    }
    if (layer != nil && norma_document_set_layer(self.document, index, layer.UTF8String)) {
        changed = 1;
    }
    if (widthM > 0.0 && norma_document_set_width_m(self.document, index, widthM)) {
        changed = 1;
    }
    const double fontSize = parse_number([(NSTextField *) self.fields[@"fontSize"] stringValue]);
    if (strcmp(name_of_type(self.document, index), "text") == 0 && fontSize > 0.0
        && norma_document_set_font_size(self.document, index, fontSize)) {
        changed = 1;
    }
    if (measured > 0.0) {
        self.document->elements[index].measured_m = measured;
        changed = 1;
    }

    [self reload];
    if (changed) {
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Ficha aplicada a %@", name]];
    } else if (refused.count > 0) {
        [self.delegate inspector:self
                            status:[NSString stringWithFormat:@"No se aplicó: %@.",
                                                              [refused componentsJoinedByString:@"; "]]];
    } else {
        [self.delegate inspector:self status:@"La ficha ya estaba así."];
    }
}

- (void)rotateBy:(NSButton *)sender
{
    const norma_element *element = [self selectedElement];
    if (self.document == NULL || element == NULL || element->locked) {
        return;
    }
    norma_document_begin_edit(self.document);
    if (norma_document_set_rotation(self.document, (size_t) self.elementIndex,
                                    element->rotation + (double) sender.tag)) {
        [self reload];
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Girado %ld°", (long) sender.tag]];
    }
}

- (void)colourChosen:(NSButton *)sender
{
    const norma_element *element = [self selectedElement];
    if (self.document == NULL || element == NULL || sender.tag < 0
        || (size_t) sender.tag >= kColourCount || element->locked) {
        return;
    }
    norma_document_begin_edit(self.document);
    if (norma_document_set_colour(self.document, (size_t) self.elementIndex,
                                  kColours[sender.tag].UTF8String)) {
        [self reload];
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Color %@", kColours[sender.tag]]];
    }
}

- (void)opacityChanged:(NSSlider *)sender
{
    if (self.document == NULL || self.elementIndex < 0) {
        return;
    }
    /* La opacidad se mueve como en la web: sin apilar un deshacer por paso. */
    if (norma_document_set_opacity(self.document, (size_t) self.elementIndex, sender.doubleValue)) {
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Opacidad %ld %%",
                                                                  (long) lround(sender.doubleValue * 100.0)]];
    }
}

- (void)typeChosen:(id)sender
{
    (void) sender;
    const norma_element *element = [self selectedElement];
    if (self.document == NULL || element == NULL || element->locked) {
        return;
    }
    NSString *title = self.typePopup.titleOfSelectedItem;
    if (title == nil || [title isEqualToString:type_name(element->type)]) {
        return;
    }
    /* El título visible se traduce al tipo del modelo. */
    NSDictionary<NSString *, NSString *> *types = @{
        @"Muro": @"wall", @"Línea": @"line", @"Ruta de evacuación": @"route", @"Medida": @"dimension",
        @"Rectángulo": @"rect", @"Elipse": @"ellipse", @"Texto": @"text",
    };
    NSString *type = types[title];
    if (type == nil) {
        return;
    }
    norma_document_begin_edit(self.document);
    if (norma_document_set_type(self.document, (size_t) self.elementIndex, type.UTF8String)) {
        [self reload];
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Ahora es %@", title]];
        return;
    }
    [self reload];
    [self.delegate inspector:self
                        status:@"Un trazo no se convierte en caja (ni al revés) sin perder sus nodos."];
}

- (void)lockToggled:(id)sender
{
    (void) sender;
    if (self.document == NULL || self.elementIndex < 0) {
        return;
    }
    const int wanted = self.lockSwitch.state == NSControlStateValueOn ? 1 : 0;
    norma_document_begin_edit(self.document);
    if (norma_document_set_locked(self.document, (size_t) self.elementIndex, wanted)) {
        [self reload];
        [self.delegate inspector:self
            didEditDocumentWithMessage:wanted ? @"Elemento bloqueado" : @"Elemento desbloqueado"];
    }
}

- (void)doorToggled:(id)sender
{
    (void) sender;
    if (self.document == NULL || self.elementIndex < 0) {
        return;
    }
    const size_t index = (size_t) self.elementIndex;
    norma_document_begin_edit(self.document);
    int changed = 0;
    if (norma_document_set_door_flips(self.document, index,
                                      self.flipXSwitch.state == NSControlStateValueOn,
                                      self.flipYSwitch.state == NSControlStateValueOn)) {
        changed = 1;
    }
    const int exit = self.exitSwitch.state == NSControlStateValueOn ? 1 : 0;
    if (norma_document_set_exit(self.document, index, exit)) {
        changed = 1;
    }
    if (changed) {
        [self reload];
        [self.delegate inspector:self didEditDocumentWithMessage:@"Puerta actualizada"];
    }
}

- (void)extinguisherChanged:(id)sender
{
    (void) sender;
    if (self.document == NULL || self.elementIndex < 0) {
        return;
    }
    NSArray<NSString *> *agents = @[ @"pqs_abc", @"pqs_bc", @"co2", @"water", @"foam", @"wet_k" ];
    NSArray<NSString *> *hazards = @[ @"light", @"ordinary", @"extra" ];
    const NSInteger agentIndex = self.extAgent.indexOfSelectedItem;
    const NSInteger hazardIndex = self.extHazard.indexOfSelectedItem;
    norma_document_begin_edit(self.document);
    NSString *rating = [(NSTextField *) self.fields[@"extRating"] stringValue];
    const double capacity = parse_number([(NSTextField *) self.fields[@"extCapacityLb"] stringValue]);
    const double mount = parse_number([(NSTextField *) self.fields[@"extMountCm"] stringValue]);
    if (norma_document_set_extinguisher(self.document, (size_t) self.elementIndex,
                                        agentIndex >= 0 ? agents[agentIndex].UTF8String : NULL,
                                        rating.UTF8String,
                                        hazardIndex >= 0 ? hazards[hazardIndex].UTF8String : NULL,
                                        capacity, mount)) {
        [self reload];
        [self.delegate inspector:self didEditDocumentWithMessage:@"Ficha del extintor actualizada"];
    }
}

- (void)layerChosen:(id)sender
{
    (void) sender;
    if (self.document == NULL) {
        return;
    }
    NSString *title = self.currentLayerPopup.titleOfSelectedItem;
    if (title != nil && norma_document_set_current_layer(self.document, title.UTF8String) != 0) {
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Capa activa: %@", title]];
    }
}

- (void)createLayer:(id)sender
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

/* ---------------------- red de tubería, circuito y carriles -------------- */

/** Red elegida: aplica también el diámetro, el material y la presión de la tabla. */
- (void)networkChosen:(id)sender
{
    (void) sender;
    const norma_element *element = [self selectedElement];
    if (self.document == NULL || element == NULL || element->locked) {
        return;
    }
    const NSInteger index = self.networkPopup.indexOfSelectedItem;
    if (index < 0 || (NSUInteger) index >= self.mepNetworks.count) {
        return;
    }
    NSDictionary<NSString *, NSString *> *network = self.mepNetworks[(NSUInteger) index];
    norma_document_begin_edit(self.document);
    const int changed = norma_document_set_mep(self.document, (size_t) self.elementIndex,
                                               network[@"key"].UTF8String,
                                               network[@"diameter"].length > 0 ? network[@"diameter"].UTF8String : NULL,
                                               network[@"material"].length > 0 ? network[@"material"].UTF8String : NULL,
                                               -1.0, network[@"pressure"].doubleValue);
    [self reload];
    if (changed) {
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Red %@: %@ · %@ · %@ kPa",
                                                                  network[@"label"], network[@"diameter"],
                                                                  network[@"material"], network[@"pressure"]]];
    }
}

/** Diámetro, material, pendiente y presión: lo que se edita a mano. */
- (void)mepChanged:(id)sender
{
    (void) sender;
    const norma_element *element = [self selectedElement];
    if (self.document == NULL || element == NULL || element->locked) {
        return;
    }
    NSString *diameter = self.diameterPopup.titleOfSelectedItem;
    NSString *material = self.materialPopup.titleOfSelectedItem;
    const double slope = parse_number([(NSTextField *) self.fields[@"mepSlope"] stringValue]);
    const double pressure = parse_number([(NSTextField *) self.fields[@"mepPressure"] stringValue]);
    norma_document_begin_edit(self.document);
    if (norma_document_set_mep(self.document, (size_t) self.elementIndex, NULL,
                               diameter.UTF8String, material.UTF8String, slope, pressure)) {
        [self reload];
        [self.delegate inspector:self didEditDocumentWithMessage:@"Red de tubería actualizada"];
    }
}

- (void)circuitChanged:(id)sender
{
    (void) sender;
    const norma_element *element = [self selectedElement];
    if (self.document == NULL || element == NULL || element->locked) {
        return;
    }
    const int voltages[4] = {110, 208, 220, 440};
    const NSInteger voltageIndex = self.voltagePopup.indexOfSelectedItem;
    NSString *code = [(NSTextField *) self.fields[@"circuitCode"] stringValue];
    NSString *gauge = self.gaugePopup.titleOfSelectedItem;
    const int phases = self.phasesPopup.indexOfSelectedItem == 1 ? 3 : 1;
    norma_document_begin_edit(self.document);
    if (norma_document_set_circuit(self.document, (size_t) self.elementIndex,
                                   code.length > 0 ? code.UTF8String : NULL,
                                   voltageIndex >= 0 && voltageIndex < 4 ? voltages[voltageIndex] : 0,
                                   gauge.UTF8String, phases, -1.0)) {
        [self reload];
        [self.delegate inspector:self didEditDocumentWithMessage:@"Circuito actualizado"];
    }
}

- (void)lanesChanged:(id)sender
{
    (void) sender;
    if (self.document == NULL || self.elementIndex < 0) {
        return;
    }
    const NSInteger index = self.lanesPopup.indexOfSelectedItem;
    norma_document_begin_edit(self.document);
    if (norma_document_set_lanes(self.document, (size_t) self.elementIndex, (int) index + 1)) {
        [self reload];
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Vía de %ld carriles", (long) index + 1]];
    }
}

/* -------------------------------- maqueta -------------------------------- */

- (void)guideOpacityChanged:(NSSlider *)sender
{
    if (self.document == NULL) {
        return;
    }
    if (norma_document_set_guide_opacity(self.document, sender.doubleValue)) {
        [self.delegate inspector:self
            didEditDocumentWithMessage:[NSString stringWithFormat:@"Maqueta al %ld %%",
                                                                  (long) lround(sender.doubleValue * 100.0)]];
    }
}

- (void)guideVisibilityToggled:(id)sender
{
    (void) sender;
    if (self.document == NULL) {
        return;
    }
    if (norma_document_set_guide_visible(self.document, self.guideVisibleSwitch.state == NSControlStateValueOn)) {
        [self reload];
        [self.delegate inspector:self didEditDocumentWithMessage:@"Maqueta actualizada"];
    }
}

- (void)guideLockToggled:(id)sender
{
    (void) sender;
    if (self.document == NULL) {
        return;
    }
    if (norma_document_set_guide_locked(self.document, self.guideLockSwitch.state == NSControlStateValueOn)) {
        [self reload];
        [self.delegate inspector:self didEditDocumentWithMessage:@"Maqueta actualizada"];
    }
}

- (void)requestClearGuide:(id)sender
{
    (void) sender;
    [self.delegate inspectorDidRequestClearGuide:self];
}

- (void)requestImportGuide:(id)sender
{
    (void) sender;
    [self.delegate inspectorDidRequestImportGuide:self];
}

/* ------------------------- acciones de la cabecera ----------------------- */

- (void)toggleLockHero:(id)sender
{
    if (self.document == NULL || self.elementIndex < 0) {
        return;
    }
    const norma_element *element = [self selectedElement];
    if (element == NULL) {
        return;
    }
    norma_document_begin_edit(self.document);
    const int wanted = element->locked ? 0 : 1;
    if (norma_document_set_locked(self.document, (size_t) self.elementIndex, wanted)) {
        [self reload];
        [self.delegate inspector:self
            didEditDocumentWithMessage:wanted ? @"Elemento bloqueado" : @"Elemento desbloqueado"];
    }
}

- (void)duplicateHero:(id)sender
{
    (void) sender;
    [self.delegate inspectorDidRequestDuplicate:self];
}

- (void)deleteHero:(id)sender
{
    (void) sender;
    [self.delegate inspectorDidRequestDelete:self];
}

@end
