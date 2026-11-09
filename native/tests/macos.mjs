/*
 * Pruebas de la ventana nativa de macOS (etapa N1).
 *
 * Aquí no hay macOS ni Xcode, así que lo que se comprueba es el **contrato** que
 * se puede leer en el código: que sea AppKit de verdad y no un WebView, que el
 * menú esté en español con sus atajos, que guarde en el sobre oficial, que
 * pregunte antes de perder cambios, que el mínimo de sistema sea macOS 12 y que
 * la compilación real quede a cargo del trabajo de macOS del flujo.
 *
 * Quien compila y arranca la aplicación es `.github/workflows/verify.yml`
 * (`make -C native/macos check`), en un runner de macOS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeReporter, repoRoot } from '../../tests/php/harness.mjs';

const report = makeReporter('Ventana nativa macOS');
const dir = path.join(repoRoot, 'native', 'macos');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

const main = read('main.m');
const delegate = read('AppDelegate.m');
const canvas = read('CanvasView.m');
const canvasHeader = read('CanvasView.h');
const plist = read('Info.plist');
const picker = read('CatalogPicker.m');
const rail = read('ToolRail.m');
const railHeader = read('ToolRail.h');
const inspector = read('InspectorPanel.m');
const inspectorHeader = read('InspectorPanel.h');
const pickerHeader = read('CatalogPicker.h');
const catalogH = fs.readFileSync(path.join(repoRoot, 'native', 'include', 'normia', 'object.h'), 'utf8');
const catalogC = fs.readFileSync(path.join(repoRoot, 'native', 'src', 'object.c'), 'utf8');
const cliC = fs.readFileSync(path.join(repoRoot, 'native', 'src', 'cli.c'), 'utf8');
const svgC = fs.readFileSync(path.join(repoRoot, 'native', 'src', 'svg.c'), 'utf8');
const objectH = fs.readFileSync(path.join(repoRoot, 'native', 'include', 'normia', 'object.h'), 'utf8');
const documentH = fs.readFileSync(path.join(repoRoot, 'native', 'include', 'normia', 'document.h'), 'utf8');
const signsTest = fs.readFileSync(path.join(repoRoot, 'native', 'tests', 'test_signs.c'), 'utf8');
const makefile = read('Makefile');
const picture = read('SvgPicture.m');
const pictureHeader = read('SvgPicture.h');
const svgdrawC = fs.readFileSync(path.join(repoRoot, 'native', 'src', 'svgdraw.c'), 'utf8');
const svgdrawH = fs.readFileSync(path.join(repoRoot, 'native', 'include', 'normia', 'svgdraw.h'), 'utf8');
const nativeMakefile = fs.readFileSync(path.join(repoRoot, 'native', 'Makefile'), 'utf8');
const svgdrawTest = fs.readFileSync(path.join(repoRoot, 'native', 'tests', 'test_svgdraw.c'), 'utf8');
const leerFlujo = (name) => fs.readFileSync(path.join(repoRoot, '.github', 'workflows', name), 'utf8');
const nativeWorkflow = leerFlujo('dist-nativo.yml');
const verifyWorkflow = leerFlujo('verify.yml');
const desktopWorkflow = leerFlujo('dist-desktop.yml');
/**
 * El código sin comentarios. Los comentarios explican justamente por qué no se
 * usa un WebView, así que no pueden contar como si se usara.
 */
const strip = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
const all = strip([main, delegate, canvas, canvasHeader, rail, inspector].join('\n'));
const code = [strip(main), strip(delegate), strip(canvas)].join('\n');

/* ------------------------- 1 · es AppKit, no un navegador ------------------------ */

report.check('La ventana es AppKit de verdad: sin WebView, sin JavaScript, sin Electron',
  !/WKWebView|WKWebViewConfiguration|UIWebView|JavaScriptCore|require\('electron'\)|BrowserWindow/.test(all)
  && /#import <Cocoa\/Cocoa\.h>/.test(main) && /NSWindow/.test(delegate),
  'Cocoa · AppKit');

report.check('El lienzo se dibuja con Core Graphics, no con HTML',
  /CGContextRef/.test(canvas) && /CGContextStrokePath/.test(canvas) && /drawRect:/.test(canvas)
  && !/innerHTML|<canvas|document\.write/.test(all),
  'CGContext');

report.check('La aplicación se compila con las herramientas de macOS y solo enlaza los marcos del sistema',
  /-fobjc-arc/.test(makefile) && /-framework Cocoa/.test(makefile) && /-framework UniformTypeIdentifiers/.test(makefile)
  && /clang/.test(makefile)
  && !/-framework (WebKit|Electron)/.test(strip(makefile)) && !/electron-builder/.test(strip(makefile)),
  'clang · Cocoa · UniformTypeIdentifiers');

/* ------------------------------ 2 · documentos --------------------------------- */

report.check('Abrir y guardar usan los paneles del sistema',
  /NSOpenPanel/.test(delegate) && /NSSavePanel/.test(delegate), 'NSOpenPanel · NSSavePanel');

report.check('El archivo guardado es el sobre oficial del proyecto',
  /norma_document_to_json/.test(delegate) && /norma_document_from_json/.test(delegate)
  && /format\\":\\"normia-plan|normia-plan/.test(fs.readFileSync(path.join(repoRoot, 'native', 'src', 'document.c'), 'utf8')),
  'normia-plan');

report.check('Cerrar con cambios sin guardar pregunta antes de perderlos',
  /Hay cambios sin guardar/.test(delegate) && /Cancelar/.test(delegate)
  && /norma_document_clear/.test(delegate), 'Guardar · Descartar · Cancelar');

report.check('El título avisa de los cambios y macOS marca el documento como editado',
  /Normia Estudio/.test(delegate) && /setDocumentEdited/.test(delegate) && /setRepresentedFilename/.test(delegate),
  'ventana y Dock');

/* --------------------------------- 3 · menú ------------------------------------ */

const menuItems = ['Archivo', 'Editar', 'Ver', 'Ayuda', 'Plano nuevo', 'Abrir…', 'Guardar', 'Guardar como…',
  'Deshacer', 'Rehacer', 'Ajustar a la ventana', 'Cómo se usa el lienzo'];
report.check('El menú está en español y con las órdenes de un editor',
  menuItems.every((item) => delegate.includes(item)),
  menuItems.filter((item) => !delegate.includes(item)).join(', ') || 'todas');

report.check('Los atajos son los de macOS: ⌘N, ⌘O, ⌘S, ⇧⌘S, ⌘Z y ⇧⌘Z',
  /keyEquivalent:@"n"/.test(delegate) && /keyEquivalent:@"o"/.test(delegate)
  && /keyEquivalent:@"s"/.test(delegate) && /keyEquivalent:@"S"/.test(delegate)
  && /keyEquivalent:@"z"/.test(delegate) && /keyEquivalent:@"Z"/.test(delegate)
  && /NSEventModifierFlagCommand \| NSEventModifierFlagShift/.test(delegate),
  '⌘N ⌘O ⌘S ⇧⌘S ⌘Z ⇧⌘Z');

report.check('Los atajos del menú no pisan los del sistema para copiar y pegar',
  !/keyEquivalent:@"c"/.test(delegate) && !/keyEquivalent:@"v"/.test(delegate) && !/keyEquivalent:@"x"/.test(delegate),
  'c · v · x libres');

/* -------------------------------- 4 · lienzo ----------------------------------- */

report.check('El lienzo usa el núcleo en C para medir, seleccionar y mover',
  /norma_document_hit_test/.test(canvas) && /norma_document_move_node/.test(canvas)
  && /norma_document_add_wall/.test(canvas) && /norma_arc_point_at/.test(canvas),
  'hit test · nodos · arcos');

report.check('El muro se dibuja con arcos reales y no con cuerdas',
  /arc->valid/.test(canvas) && /norma_arc_point_at\(arc/.test(canvas), 'arco aplanado');

report.check('La herramienta de muro y el borrado están en el lienzo, con Esc para salir',
  /isEqualToString:@"m"/.test(canvas) && /keyCode == 53/.test(canvas) && /keyCode == 51/.test(canvas),
  'M · Esc · Retroceso');

report.check('El lienzo responde al teclado y se adapta a la ventana',
  /acceptsFirstResponder/.test(canvas) && /zoomToFit/.test(canvas)
  && /NSViewWidthSizable \| NSViewHeightSizable/.test(delegate), 'primera respuesta · ajuste');

/* --------------------------- 4b · herramientas de N2 --------------------------- */

report.check('La pluma de nodos cierra con Enter o doble clic y quita el último nodo',
  /NormiaToolPen/.test(canvas) && /keyCode == 36 \|\| event\.keyCode == 76/.test(canvas)
  && /clickCount >= 2/.test(canvas) && /_draftCount -= 1/.test(canvas),
  'Enter · doble clic · Retroceso');

report.check('El arco de tres puntos se arma con el núcleo, no con una aproximación',
  /NormiaToolArc/.test(canvas) && /norma_arc_from_points\(_draft\[0\], _draft\[1\], _draft\[2\]\)/.test(canvas)
  && /El arco no es válido/.test(canvas), 'tres puntos');

report.check('La cota se rotula con la cifra y la unidad del plano',
  /NormiaToolDimension/.test(canvas) && /norma_format_measure_cm/.test(canvas)
  && /norma_document_add_dimension/.test(canvas), 'norma_format_measure_cm');

report.check('Cada herramienta tiene su tecla y Esc vuelve a la selección',
  /isEqualToString:@"m"/.test(canvas) && /isEqualToString:@"p"/.test(canvas)
  && /isEqualToString:@"a"/.test(canvas) && /isEqualToString:@"d"/.test(canvas)
  && /isEqualToString:@"v"/.test(canvas) && /event\.keyCode == 53/.test(canvas),
  'M · P · A · D · V · Esc');

report.check('Exportar SVG usa el núcleo con escala física y los paneles del sistema',
  /exportSvg:/.test(delegate) && /norma_document_to_svg/.test(delegate) && /UTTypeSVG/.test(delegate)
  && /Exportar SVG…/.test(delegate), '⌘E');

report.check('Hay una orden para cancelar la herramienta en curso',
  /cancelTool:/.test(delegate) && /cancelDraft/.test(canvasHeader), 'Esc · ⌘.');

report.check('El lienzo pinta las cotas con su línea, sus marcas y su cifra',
  /drawLabel:/.test(canvas) && /strcmp\(element->type, "dimension"\)/.test(canvas)
  && /node_count - 1/.test(canvas), 'línea · marcas · texto');

/* ---------------------- 4b2 · la herramienta de rutas de N3 ---------------------- */

report.check('R elige la herramienta de ruta y la pista dice cómo se cierra',
  /NormiaToolRoute/.test(canvas) && /isEqualToString:@"r"/.test(canvas)
  && /Ruta: un clic por nodo/.test(canvas)
  && /selectToolWithKey:/.test(canvas) && /selectToolWithKey:/.test(canvasHeader),
  'R · Enter · doble clic');

report.check('La ruta usa el mismo borrador de polilínea que la pluma y el muro',
  /_tool == NormiaToolPen \|\| _tool == NormiaToolRoute \|\| _tool == NormiaToolWall/.test(canvas)
  && /_tool == NormiaToolRoute \|\| _tool == NormiaToolWall\)\s*\n?\s*&& _draftCount >= 2/.test(canvas),
  'borrador compartido');

report.check('La ruta se guarda con el núcleo como tipo ruta, no como un muro',
  /norma_document_add_route\(self\.document, _draft, \(size_t\) _draftCount/.test(canvas)
  && !/norma_document_add_wall\(self\.document, _draft, \(size_t\) _draftCount\)\s*;\n?\s*\}\s*else if \(_tool == NormiaToolRoute/.test(canvas),
  'norma_document_add_route');

report.check('La ruta se pinta con su color, su punta de flecha y su longitud',
  /strcmp\(element->type, "route"\) == 0/.test(canvas)
  && /Punta de flecha/.test(canvas)
  && /norma_polyline_length\(element->nodes, element->node_count, element->arcs\)/.test(canvas),
  'verde · flecha · cifra');

/* --------------------- 4b3 · el cajón de revisión (N3) --------------------- */

report.check('El cajón de revisión pide el informe al núcleo, no lo inventa',
  /norma_inspect_document\(&_document/.test(delegate) && /norma_inspect_free/.test(delegate)
  && /#include "normia\/inspect\.h"/.test(delegate) && /norma_inspect_result inspection/.test(delegate),
  'norma_inspect_document');

report.check('⌘R abre y cierra la revisión desde el menú Ver',
  /Revisar plano/.test(delegate) && /action:@selector\(toggleAudit:\) keyEquivalent:@"r"/.test(delegate)
  && /- \(void\)toggleAudit:/.test(delegate), '⌘R');

report.check('La lista del cajón sigue el orden del auditor y lleva al punto',
  /fillAuditText/.test(delegate) && /findingRanges/.test(delegate)
  && /focusOnPoint:/.test(delegate) && /revealSelectedFinding:/.test(delegate),
  'título · detalle · Ver en el plano');

report.check('Los hallazgos con punto se dibujan en el plano',
  /setFindingPoints:/.test(canvas) && /setFindingPoints:\(const norma_point \* _Nullable\)points count:/.test(canvasHeader)
  && /CGContextStrokeEllipseInRect/.test(canvas) && /focusOnPoint:\(norma_point\)point/.test(canvasHeader),
  'anillos rojos');

report.check('Editar el plano invalida la revisión en vez de mostrar cifras viejas',
  /invalidateInspection/.test(delegate) && /if \(self\.hasInspection\) \{\s*\[self invalidateInspection\]/.test(delegate),
  'se vuelve a pedir con ⌘R');

report.check('La ventana enlaza todos los fuentes del núcleo, también el catálogo de objetos',
  /\$\{CORE\}|\.\.\/src\/object\.c/.test(makefile) && /\.\.\/src\/svg\.c/.test(makefile)
  && /\.\.\/src\/document\.c/.test(makefile)
  && /\.\.\/src\/object\.c/.test(makefile),
  '../src/object.c en CORE');

report.check('El paquete lleva los catálogos que el cajón necesita',
  /Contents\/Resources\/resources/.test(makefile) && /cp \.\.\/\.\.\/resources\/\*\.json/.test(makefile),
  'Resources/resources desde la raíz del repositorio');

/* ------------------------ 4c · recientes, papel y PDF ------------------------ */

report.check('Los recientes se guardan como preferencia y no dentro del paquete',
  /NSUserDefaults standardUserDefaults/.test(delegate) && /arrayForKey:kRecentKey/.test(delegate)
  && /setObject:paths forKey:kRecentKey/.test(delegate), 'NSUserDefaults');

report.check('La lista de recientes es corta y descarta lo que ya no está',
  /kRecentLimit = 10/.test(delegate) && /fileExistsAtPath:path/.test(delegate)
  && /paths\.count >= kRecentLimit/.test(delegate), '10 archivos');

report.check('«Abrir reciente» se rehace al abrirse y se puede limpiar',
  /menuNeedsUpdate:/.test(delegate) && /rebuildRecentMenu/.test(delegate)
  && /Limpiar la lista/.test(delegate) && /removeObjectForKey:kRecentKey/.test(delegate),
  'menú dinámico');

report.check('Abrir y guardar recuerdan el archivo, y falta el archivo avisa',
  (delegate.match(/\[self rememberPath:path\];/g) || []).length === 2
  && /Ese archivo ya no está/.test(delegate), 'dos llamadas');

report.check('Imprimir abre el panel del sistema en A4 horizontal y ajusta la hoja',
  /printPlan:/.test(delegate) && /NSPrintOperation printOperationWithView:self\.canvas/.test(delegate)
  && /NSPaperOrientationLandscape/.test(delegate) && /NSPrintingPaginationModeFit/.test(delegate)
  && /Imprimir…".*printPlan:.*keyEquivalent:@"p"\]/.test(delegate), '⌘P');

report.check('Al imprimir o exportar PDF el fondo es blanco, no el gris de pantalla',
  /self\.canvas\.printing = YES/.test(delegate) && /printing/.test(canvasHeader)
  && /if \(self\.printing\)/.test(canvas) && /whiteColor/.test(canvas), 'fondo blanco');

report.check('Exportar PDF guarda la misma hoja que se imprime',
  /exportPdf:/.test(delegate) && /dataWithPDFInsideRect:self\.canvas\.bounds/.test(delegate)
  && /UTTypePDF/.test(delegate) && /Exportar PDF…/.test(delegate), '⌘E · PDF');

/* --------------------------- 4d · lienzo infinito --------------------------- */

report.check('El lienzo se desplaza y se acerca como un CAD, no como una hoja fija',
  /scrollWheel:/.test(canvas) && /magnifyWithEvent:/.test(canvas)
  && /otherMouseDragged:/.test(canvas) && /rightMouseDragged:/.test(canvas),
  'rueda · pellizco · botón central');

report.check('La vista guarda escala y desplazamiento, no un ajuste calculado cada vez',
  /double _zoom;/.test(canvas) && /double _panX;/.test(canvas)
  && /zoomBy:\(double\)factor atPoint:\(NSPoint\)anchor/.test(canvas)
  && /_panX = \(double\) anchor\.x - planX \* zoom;/.test(canvas),
  'zoom anclado al cursor');

report.check('El zoom tiene límites sensatos y el 100 % vuelve a la escala real',
  /zoom < 0\.02/.test(canvas) && /zoom > 40\.0/.test(canvas)
  && /- \(void\)zoomReset/.test(canvas) && /_zoom = 1\.0;/.test(canvas)
  && /zoomIn/.test(canvasHeader) && /zoomOut/.test(canvasHeader),
  '2 % – 4000 %');

report.check('La hoja A4 sigue dibujándose como referencia de impresión',
  /CGContextFillRect\(context, CGRectMake\(0, 0, self\.document->width, self\.document->height\)\)/.test(canvas),
  'papel, no límite');

report.check('La rejilla cubre todo el espacio de trabajo y se agranda al alejarse',
  /while \(grid \* \(double\) zoom < 9\.0\)/.test(canvas) && /minX/.test(canvas)
  && /maxX/.test(canvas) && /floor\(minX \/ grid\) \* grid/.test(canvas),
  'rejilla adaptativa');

report.check('Acercar, alejar y zoom 100 % están en el menú Ver con sus atajos',
  /\[self\.canvas zoomIn\]/.test(delegate) && /\[self\.canvas zoomOut\]/.test(delegate)
  && /\[self\.canvas zoomReset\]/.test(delegate) && /Zoom 100 %/.test(delegate)
  && /action:@selector\(zoomIn:\) keyEquivalent:@"\+"/.test(delegate),
  '⌘+ ⌘- ⌘1 ⌘0');

report.check('Al cambiar el zoom se dice en la barra de estado',
  /Zoom %\.0f %%/.test(canvas), 'porcentaje');

/* ------------------- 4e · el menú Insertar de la etapa N4 ------------------- */

report.check('El menú Insertar se arma con el catálogo del núcleo, no con una lista copiada',
  /NSMenu \*insertMenu = \[\[NSMenu alloc\] initWithTitle:@"Insertar"\]/.test(delegate)
  && /norma_object_family_count\(\)/.test(delegate) && /norma_object_family_at\(family\)/.test(delegate)
  && /norma_object_count_in\(key\)/.test(delegate) && /norma_object_at_in\(key, position\)/.test(delegate)
  && /#include "normia\/object\.h"/.test(delegate)
  && !/@"cad_emg_aed"/.test(delegate),
  'un submenú por familia');

report.check('La aplicación carga el catálogo completo al arrancar y lo deja activo para el SVG',
  /- \(void\)loadObjectCatalog/.test(delegate)
  && /norma_object_catalog_load\(&_catalog/.test(delegate) && /norma_object_use\(&_catalog\)/.test(delegate)
  && /norma_object_use\(NULL\)/.test(delegate) && /norma_object_catalog_free\(&_catalog\)/.test(delegate),
  '820 piezas · Contents/Resources/resources');

report.check('El catálogo completo son 820 piezas: 3 puertas, 422 objetos CAD y 395 señales',
  /norma_object_catalog_load/.test(catalogH) && /norma_object_catalog_load/.test(catalogC)
  && /cad-objects\.json/.test(catalogC) && /norma_library_load/.test(catalogC)
  && /sign:%s/.test(catalogC) && /cad:%s/.test(catalogC),
  'object.c · cad-objects.json · library');

report.check('Cada pieza trae nombre, familia, color y pictograma, y las puertas se dibujan a mano',
  /char family\[NORMA_OBJECT_FAMILY\]/.test(catalogH) && /char colour\[NORMA_OBJECT_COLOUR\]/.test(catalogH)
  && /char \*svg;/.test(catalogH) && /strncmp\(spec->type, "cad_", 4\)/.test(fs.readFileSync(path.join(repoRoot, 'native', 'tests', 'test_catalog.c'), 'utf8'))
  && /norma_library_nested_svg_text\(spec->svg/.test(fs.readFileSync(path.join(repoRoot, 'native', 'src', 'svg.c'), 'utf8')),
  'nombre · familia · color · svg');

report.check('El tipo más largo del catálogo cabe en el elemento del plano',
  /char type\[48\];/.test(fs.readFileSync(path.join(repoRoot, 'native', 'include', 'normia', 'document.h'), 'utf8')),
  'type[48] · cad_acc_accessible_lift');

report.check('Hay un buscador para las 820 piezas, porque un menú plano no se recorrería',
  /Buscar en el catálogo…/.test(delegate) && /insertFromPicker:/.test(delegate)
  && /NormiaCatalogPicker pickFromCatalog:&_catalog/.test(delegate)
  && /NSSearchField/.test(picker) && /NormiaCatalogGrid/.test(picker)
  && /pickFromCatalog:/.test(pickerHeader)
  && /- \(void\)controlTextDidChange:/.test(picker),
  '⌘⇧I · filtro sin tildes');

report.check('El buscador es AppKit de verdad, sin WebView ni HTML',
  !/WKWebView|innerHTML|document\.write/.test(strip([picker, pickerHeader].join('\n')))
  && !/innerHTML/.test(all),
  'NSSearchField · rejilla de tarjetas');

report.check('Los atajos de Insertar van con ⌃ y no pisan las letras del lienzo',
  /NSEventModifierFlagControl/.test(delegate)
  && /item\.keyEquivalentModifierMask = NSEventModifierFlagControl;/.test(delegate)
  && /NSArray<NSString \*> \*doorKeys = @\[@"u", @"U", @"g"\]/.test(delegate),
  '⌃U ⌃U ⌃G · ⌘⇧I para buscar');

report.check('El núcleo puede listar el catálogo completo, para que el menú y el núcleo cuenten lo mismo',
  /--objects/.test(cliC) && /command_objects/.test(cliC) && /norma_object_family_count/.test(cliC),
  'norma-core --objects');

report.check('Marcar o desmarcar una salida está en el menú Insertar y no en el lienzo',
  /Marcar o desmarcar salida de emergencia/.test(delegate)
  && /action:@selector\(toggleExit:\)/.test(delegate)
  && /exitItem\.keyEquivalentModifierMask = NSEventModifierFlagCommand \| NSEventModifierFlagShift;/.test(delegate)
  && /- \(void\)toggleExit:/.test(delegate)
  && /action:@selector\(toggleExit:\)[\s\S]{0,160}keyEquivalent:@"O"/.test(delegate),
  '⌘⇧O');

report.check('La herramienta de inserción coloca el objeto con un clic y Esc la termina',
  /NormiaToolInsert/.test(canvas) && /- \(void\)beginInsert:\(NSString \*\)type/.test(canvasHeader)
  && /norma_document_add_object\(self\.document, _insertType, point, NULL\)/.test(canvas)
  && /if \(_tool == NormiaToolInsert && _insertType\[0\] != '\\0'\)/.test(canvas)
  && (canvas.match(/_insertType\[0\] = '\\0';/g) || []).length >= 2,
  'beginInsert: · Esc · cancelDraft');

report.check('El núcleo sabe insertar, mover y marcar salida sin salir del documento',
  /norma_document_add_object/.test(documentH) && /norma_document_set_exit/.test(documentH)
  && /norma_document_move_object/.test(documentH)
  && /norma_document_move_object\(self\.document, element, round\(point\.x - _dragOffsetX\)/.test(canvas),
  'add_object · set_exit · move_object');

report.check('La puerta se dibuja con jambas, umbral discontinuo, hoja y arco',
  /- \(void\)drawDoor:\(const norma_element \*\)element selected:\(BOOL\)selected/.test(canvas)
  && /CGContextSetLineDash\(context, 0\.0, dashes, 2\)/.test(canvas)
  && /element->is_exit/.test(canvas) && /strcmp\(element->type, "door_garage"\) == 0/.test(canvas),
  'jambas · umbral · hoja · arco');

report.check('La exportación a SVG dibuja la misma puerta que la web',
  /static void write_door\(norma_buffer \*buffer, const norma_element \*element\)/.test(svgC)
  && /stroke-dasharray=\\"4 4\\"/.test(svgC) && /#237f52/.test(svgC) && /#475569/.test(svgC),
  'write_door · verde de salida');

report.check('Los equipos y las señales se dibujan con su pictograma y nada más',
  /- \(void\)drawObject:\(const norma_element \*\)element selected:\(BOOL\)selected/.test(canvas)
  && /- \(NSColor \*\)colourForObject:/.test(canvas)
  && /NormiaDrawSvgInContext\(context, spec->svg/.test(canvas)
  && /CGContextSetRGBStrokeColor\(context, 0\.86, 0\.15, 0\.15/.test(canvas)
  && !/Señal del catálogo: marco interior/.test(canvas),
  'pictograma · rectángulo rojo de la web si falta · sin caja imitada');

report.check('El lienzo no escribe el código de la señal debajo del pictograma',
  /- \(NSString \*\)captionForObject:\(const norma_element \*\)element/.test(canvas)
  && !/strncmp\(type, "iso_", 4\)/.test(canvas)
  && !/@\"BOTIQUÍN\"/.test(canvas) && !/@\"CAMILLA\"/.test(canvas),
  'solo lo que escribió la persona · SALIDA en las puertas');

report.check('Los objetos de una sola caja llevan su rótulo con la medida y la unidad del plano',
  /- \(NSString \*\)captionForObject:\(const norma_element \*\)element/.test(canvas)
  && /norma_format_measure_cm\(element->w, self\.document->unit/.test(canvas),
  'captionForObject:');

/* ------------- 4f · el trabajo que arma la app de Monterey (N4) ------------- */

report.check('Hay un trabajo que arma la app nativa para macOS 12 y la publica',
  /name: App nativa de macOS \(Monterey\)/.test(nativeWorkflow)
  && /runs-on: macos-/.test(nativeWorkflow) && /workflow_dispatch:/.test(nativeWorkflow)
  && /upload-artifact@v4/.test(nativeWorkflow),
  'dist-nativo.yml');

report.check('El paquete es universal: se compila con las dos arquitecturas en una pasada',
  /ARCHS \?=/.test(makefile) && /ARCHFLAGS := \$\(foreach arch,\$\(ARCHS\),-arch \$\(arch\)\)/.test(makefile)
  && /\$\(DEPLOY_FLAGS\) \$\(ARCHFLAGS\) \$\(CFLAGS\)/.test(makefile)
  && /ARCHS="x86_64 arm64"/.test(nativeWorkflow)
  && /lipo -archs/.test(nativeWorkflow),
  'x86_64 + arm64 · lipo');

report.check('El trabajo exige macOS 12 en el Mach-O de cada arquitectura, no solo en el plist',
  /otool -l -arch "\$ARQ"/.test(nativeWorkflow)
  && /LC_BUILD_VERSION/.test(nativeWorkflow) && /minos/.test(nativeWorkflow)
  && /LSMinimumSystemVersion/.test(nativeWorkflow)
  && /DEPLOYMENT: \$\{\{ github\.event\.inputs\.deployment \|\| '12\.0' \}\}/.test(nativeWorkflow),
  'minos 12.0 · x86_64 y arm64');

report.check('El paquete se firma en ad-hoc y se publica con su SHA-256',
  /codesign --force --deep --sign -/.test(nativeWorkflow)
  && /ditto -c -k --sequesterRsrc --keepParent/.test(nativeWorkflow)
  && /shasum -a 256/.test(nativeWorkflow)
  && /\*\.zip\.sha256/.test(nativeWorkflow),
  'ad-hoc · ditto · SHA-256');

report.check('Con una etiqueta, el paquete se adjunta a la release',
  /startsWith\(github\.ref, 'refs\/tags\/v'\)/.test(nativeWorkflow)
  && /gh release upload/.test(nativeWorkflow)
  && /permissions:\s*\n\s*contents: write/.test(nativeWorkflow),
  'v* · gh release');

report.check('El trabajo arranca la aplicación sin ventana y cuenta el catálogo del paquete',
  /"\$BIN" --check/.test(nativeWorkflow) && /"\$BIN" --objects/.test(nativeWorkflow)
  && /820 piezas/.test(nativeWorkflow) && /41 familias/.test(nativeWorkflow),
  '--check · --objects');

report.check('La aplicación responde a --objects sin abrir ventana, con su propio catálogo',
  /--objects/.test(main) && /runObjects/.test(main)
  && /stringByAppendingPathComponent:@"resources"/.test(main)
  && /norma_object_catalog_load\(&catalog/.test(main) && /catálogo completo · %lu piezas · %lu familias/.test(main),
  'Contents/Resources/resources');

/* ------------------------------ 5 · sistema mínimo ----------------------------- */

report.check('El paquete declara macOS 12 Monterey como mínimo',
  /<key>LSMinimumSystemVersion<\/key>\s*<string>12\.0<\/string>/.test(plist), 'LSMinimumSystemVersion 12.0');

// El Info.plist es una promesa; el binario es lo que el sistema mira. Si se
// compila sin destino, clang toma el macOS del runner (15) y el paquete no abre
// en Monterey aunque la cabecera diga 12.0.
report.check('El binario se compila con destino macOS 12, no con el del runner',
  /DEPLOYMENT \?= 12\.0/.test(makefile)
  && /-mmacosx-version-min=\$\(DEPLOYMENT\)/.test(makefile)
  && /export MACOSX_DEPLOYMENT_TARGET := \$\(DEPLOYMENT\)/.test(makefile),
  'make -C native/macos · -mmacosx-version-min=12.0');

report.check('El flujo de verificación comprueba el minos del Mach-O',
  /otool -l/.test(verifyWorkflow) && /LC_BUILD_VERSION/.test(verifyWorkflow)
  && /minos/.test(verifyWorkflow) && /DEPLOYMENT=12\.0/.test(verifyWorkflow),
  'otool · minos 12.0');

report.check('El minos comprobado se publica como anotación, no solo en el registro',
  /::notice title=macOS::el binario pide macOS \$MINOS/.test(verifyWorkflow),
  '::notice · minos');

report.check('El escritorio compila el intérprete de PHP con destino macOS 12',
  /MACOSX_DEPLOYMENT_TARGET: '12\.0'/.test(desktopWorkflow) && /otool -l/.test(desktopWorkflow),
  'dist-desktop.yml · MACOSX_DEPLOYMENT_TARGET');

report.check('El paquete se identifica aparte de las ediciones existentes',
  /co\.normia\.estudio\.nativo/.test(plist) && /CFBundleDocumentTypes/.test(plist)
  && /public\.json/.test(plist), 'co.normia.estudio.nativo · .json');

report.check('La aplicación responde a --check sin abrir ventana',
  /--check/.test(main) && /norma_document_length_cm/.test(main), 'humo del núcleo');

/* ---------------------------- 6 · la ventana como un CAD ---------------------- */

// La captura de referencia no es un adorno: pide paleta de conjuntos, tira de
// iconos, inspector con capas, línea de comando y coordenadas. Todo eso tiene
// que existir en el código, no solo en la documentación.
report.check('La paleta agrupa las herramientas como el conjunto de herramientas de la captura',
  /@"DIBUJO"/.test(rail) && /@"MODIFICAR"/.test(rail) && /@"TEXTO"/.test(rail)
  && /@"ACOTACIÓN"/.test(rail) && /@"RUTAS"/.test(rail) && /@"BIBLIOTECA"/.test(rail)
  && /CONJUNTOS DE HERRAMIENTAS/.test(rail),
  'Dibujo · Modificar · Texto · Acotación · Rutas · Biblioteca');

const herramientas = ['Select', 'Pan', 'Wall', 'Line', 'Rect', 'Ellipse', 'Pen', 'Arc', 'Text',
  'Dimension', 'Route', 'Road', 'Sidewalk', 'Crosswalk', 'Parking', 'Property', 'Pipe', 'Conduit'];
report.check('La paleta ofrece las mismas herramientas que el editor web, una por una',
  herramientas.every((name) => rail.includes(`NormiaTool${name}`))
  && (rail.match(/@"tool": @\(NormiaTool/g) || []).length >= 18
  && /@"action": @"duplicate"/.test(rail) && /@"action": @"catalog"/.test(rail),
  'seleccionar · mano · muro · línea · rectángulo · elipse · pluma · arco · texto · cota · ruta');

report.check('La tira superior repite las herramientas con iconos del sistema',
  /- \(void\)buildTopBar:/.test(delegate) && /imageWithSystemSymbolName:/.test(delegate)
  && /NSBezelStyleTexturedRounded/.test(delegate)
  && /@selector\(chooseToolButton:\)/.test(delegate), 'buildTopBar: · SF Symbols');

report.check('La ventana reparte paleta, lienzo, inspector, comando y estado',
  /- \(void\)buildRail:/.test(delegate) && /- \(void\)buildInspector:/.test(delegate)
  && /- \(void\)buildCommandBar:/.test(delegate) && /- \(void\)buildStatusBar:/.test(delegate)
  && /- \(void\)layoutChrome/.test(delegate)
  && /kPaletteWidth/.test(delegate) && /kInspectorWidth/.test(delegate),
  'paleta · lienzo · inspector · comando · estado');

report.check('La ventana usa la apariencia oscura del sistema, como un CAD',
  /NSAppearanceNameDarkAqua/.test(delegate) && /NSAppearance appearanceNamed:/.test(delegate)
  && /self\.window\.appearance = oscura/.test(delegate),
  'DarkAqua');

report.check('La barra de estado tiene las pestañas Modelo y Hoja A4 y las coordenadas',
  /NSSegmentedControl segmentedControlWithLabels:@\[ @"Modelo", @"Hoja A4" \]/.test(delegate)
  && /coordinateLabel/.test(delegate) && /X %\.0f · Y %\.0f cm/.test(delegate),
  'Modelo · Hoja A4 · X · Y');

report.check('El inspector edita la ficha completa con el núcleo, no por su cuenta',
  /norma_document_set_box/.test(inspector) && /norma_document_set_rotation/.test(inspector)
  && /norma_document_set_stroke/.test(inspector) && /norma_document_set_colour/.test(inspector)
  && /norma_document_set_label/.test(inspector) && /norma_document_set_layer/.test(inspector)
  && /norma_document_set_current_layer/.test(inspector),
  'X · Y · ancho · alto · giro · grosor · color · rótulo · capa');

report.check('El inspector tiene capas y los campos que se ven en la captura',
  /CAPAS/.test(inspector) && /@"SELECCIÓN"/.test(inspector) && /@"GEOMETRÍA"/.test(inspector)
  && /@"X \(cm\)"/.test(inspector) && /@"Y \(cm\)"/.test(inspector)
  && /@"Ancho \(cm\)"/.test(inspector) && /@"Alto \(cm\)"/.test(inspector)
  && /@"Rotación"/.test(inspector) && /@"Grosor"/.test(inspector)
  && /@"Color"/.test(inspector) && /@"Rótulo"/.test(inspector)
  && /@"Capa del elemento"/.test(inspector) && /@"Capa activa/.test(inspector),
  'capas · X · Y · ancho · alto · giro · grosor · color · rótulo');

/* ------------------------- 5 · la ficha del editor web ------------------------- */

report.check('El inspector ofrece las mismas secciones que el editor web',
  /@"APARIENCIA"/.test(inspector) && /@"PUERTA"/.test(inspector)
  && /@"VÍA Y ENTORNO"/.test(inspector) && /@"EXTINTOR"/.test(inspector)
  && /@"ORGANIZACIÓN"/.test(inspector) && /@"MAQUETA DE TRAZO"/.test(inspector)
  && /@"Cambiar bisagra"/.test(inspector) && /@"Abrir al otro lado"/.test(inspector)
  && /@"Salida de emergencia"/.test(inspector),
  'apariencia · puerta · vía · extintor · organización');

report.check('La ficha nueva llama al núcleo: opacidad, letra, bisagra, tipo, ancho y extintor',
  /norma_document_set_opacity/.test(inspector) && /norma_document_set_door_flips/.test(inspector)
  && /norma_document_set_locked/.test(inspector) && /norma_document_set_type/.test(inspector)
  && /norma_document_set_width_m/.test(inspector) && /norma_document_set_extinguisher/.test(inspector)
  && /norma_document_set_font_size/.test(inspector),
  'opacity · flipX · flipY · locked · type · widthM · extintor');

report.check('El inspector tiene la ficha de red, la de circuito y los carriles',
  /@"RED DE TUBERÍA"/.test(inspector) && /@"CIRCUITO ELÉCTRICO"/.test(inspector)
  && /norma_document_set_mep/.test(inspector) && /norma_document_set_circuit/.test(inspector)
  && /@"Carriles"/.test(inspector) && /norma_document_set_lanes/.test(inspector)
  && /@"Pendiente \(%\)"/.test(inspector) && /@"Presión \(kPa\)"/.test(inspector)
  && /@"Calibre \(AWG\)"/.test(inspector) && /@"Fases"/.test(inspector),
  'red · circuito · carriles');

report.check('Las redes del inspector salen del catálogo de la web, no de una lista copiada',
  /mep-networks\.json/.test(inspector) && /NSJSONSerialization/.test(inspector)
  && /mepNetworks/.test(inspector) && /refreshMepForElement/.test(inspector),
  'resources/mep-networks.json');

report.check('El inspector usa la paleta de colores del editor web',
  /kColours/.test(inspector) && /#2563eb/.test(inspector) && /#b71f2e/.test(inspector)
  && /kColourCount/.test(inspector),
  'COLORS de assets/js/lib/model.js');

/* --------------------- 5b · la señalización en la paleta --------------------- */

report.check('La paleta tiene las dos bibliotecas de la web: señalización y equipos',
  /Señalización ISO 7010/.test(rail) && /action": @"librarySign"/.test(rail)
  && /Equipos y mobiliario/.test(rail) && /action": @"libraryCad"/.test(rail)
  && /NormiaCatalogScopeSigns/.test(delegate) && /NormiaCatalogScopeCad/.test(delegate),
  'sign · cad');

report.check('El buscador del catálogo acepta acotarse a una biblioteca',
  /NormiaCatalogScopeAll/.test(pickerHeader) && /NormiaCatalogScopeSigns/.test(pickerHeader)
  && /belongsToScope:/.test(picker) && /strncmp\(family, "sign", 4\)/.test(picker)
  && /norma_object_is_door/.test(picker),
  'scope · sign: · cad:');

report.check('Las bibliotecas se abren desde la paleta y desde el menú Insertar',
  /insertFromLibrary:NormiaCatalogScopeSigns/.test(delegate)
  && /insertFromLibrary:NormiaCatalogScopeCad/.test(delegate)
  && /insertSignFromMenu:/.test(delegate) && /insertEquipmentFromMenu:/.test(delegate)
  && /@"Señalización \(ISO 7010 y servicio\)…"/.test(delegate),
  'rail · menú');

/* ----------------------- 5c · el muro con pincel de nodos --------------------- */

report.check('El muro se traza con un clic por nodo, como el pincel de la web',
  /if \(_tool == NormiaToolWall\)/.test(canvas)
  && /_draft\[_draftCount\] = point;/.test(canvas)
  && /clickCount >= 2/.test(canvas),
  'nodo por clic · doble clic cierra');

report.check('El clic sobre el primer nodo cierra el recinto',
  /_closingDraft/.test(canvas)
  && /_draftCount >= 3 && norma_distance\(point, _draft\[0\]\) <= clickTolerance/.test(canvas)
  && /_draft\[_draftCount\] = _draft\[0\];/.test(canvas),
  'primer nodo · polígono cerrado');

report.check('El trazo en curso se ve entero, con su tramo elástico y el nodo de cierre',
  /for \(int index = 1; index < _draftCount; index \+= 1\)/.test(canvas)
  && /el clic aquí cierra el recinto/.test(canvas)
  && /_cursorPoint\.x, _cursorPoint\.y/.test(canvas),
  'polilínea · tramo elástico · anillo');

/* ------------------------ 5d · la maqueta de trazo --------------------------- */

report.check('La maqueta se importa con el panel de archivo y se guarda en el plano',
  /NSOpenPanel openPanel/.test(delegate) && /NSBitmapImageFileTypePNG/.test(delegate)
  && /allowedContentTypes = @\[ UTTypePNG/.test(delegate)
  && /base64EncodedStringWithOptions:0/.test(delegate)
  && /norma_document_set_guide\(/.test(delegate) && /norma_document_set_guide_box\(/.test(delegate),
  'NSOpenPanel · PNG base64 · guía');

report.check('La maqueta se dibuja debajo de lo dibujado y no se imprime',
  /drawGuideInContext:/.test(canvas) && /if \(!self\.printing\) \{\s*\n\s*\[self drawGuideInContext:context\];/.test(canvas)
  && /CGContextSetAlpha\(context, \(CGFloat\) guide->opacity\)/.test(canvas),
  'debajo de la hoja · opacidad · sin imprimir');

report.check('La maqueta se puede agarrar, mover y escalar en el lienzo, salvo bloqueada',
  /guideCornerAtPlanPoint:/.test(canvas) && /guide_contains\(/.test(canvas)
  && /self\.document->guide\.locked/.test(canvas)
  && /norma_document_set_guide_box\(self\.document/.test(canvas),
  'arrastrar · esquinas · bloqueo');

report.check('El inspector maneja la maqueta: opacidad, visible, bloqueada y quitarla',
  /norma_document_set_guide_opacity/.test(inspector) && /norma_document_set_guide_visible/.test(inspector)
  && /norma_document_set_guide_locked/.test(inspector) && /norma_document_clear_guide/.test(delegate)
  && /inspectorDidRequestImportGuide/.test(inspectorHeader),
  'opacidad · visible · bloqueada · quitar');

report.check('La línea de comando entiende los verbos del editor y repite con Intro vacío',
  /- \(void\)runCommand:/.test(delegate)
  && /@"muro"/.test(delegate) && /@"linea"/.test(delegate) && /@"rect"/.test(delegate)
  && /@"elipse"/.test(delegate) && /@"texto"/.test(delegate) && /@"ruta"/.test(delegate)
  && /@"capa"/.test(delegate) && /@"zoom"/.test(delegate) && /@"ayuda"/.test(delegate)
  && /line = self\.lastCommand/.test(delegate),
  'comando · repetir · ayuda');

report.check('El lienzo gana mano, línea, rectángulo, elipse y texto con el núcleo de figuras',
  /NormiaToolPan/.test(canvas) && /NormiaToolLine/.test(canvas)
  && /NormiaToolRect/.test(canvas) && /NormiaToolEllipse/.test(canvas)
  && /NormiaToolText/.test(canvas)
  && /norma_document_add_shape\(self\.document, "line"/.test(canvas)
  && /norma_document_add_shape\(self\.document, "rect"/.test(canvas)
  && /norma_document_add_shape\(self\.document, "ellipse"/.test(canvas)
  && /norma_document_add_text\(self\.document, point/.test(canvas),
  'mano · línea · rectángulo · elipse · texto');

report.check('La selección se escala por esquinas y se mueve con las flechas',
  /_resizeCorner/.test(canvas) && /resizeCornerAtPlanPoint:/.test(canvas)
  && /norma_document_set_box\(self\.document, \(size_t\) _selectedElement/.test(canvas)
  && /nudgeSelectionByX:/.test(canvas) && /keyCode >= 123 && event\.keyCode <= 126/.test(canvas),
  'tiradores · flechas');

report.check('El entorno del editor web está en el núcleo, no simulado en la ventana',
  /norma_document_add_environment/.test(documentH) && /norma_environment_is/.test(documentH)
  && /norma_document_add_environment/.test(fs.readFileSync(path.join(repoRoot, 'native', 'src', 'document.c'), 'utf8'))
  && /NormiaToolRoad/.test(rail) && /NormiaToolSidewalk/.test(rail) && /NormiaToolCrosswalk/.test(rail)
  && /NormiaToolParking/.test(rail) && /NormiaToolProperty/.test(rail)
  && /"pipe"/.test(canvas) && /"conduit"/.test(canvas)
  && /@"ENTORNO"/.test(rail) && /@"INSTALACIONES"/.test(rail),
  'vía · andén · paso · parqueadero · lindero · tubería · canaleta');

report.check('La vía, el andén, el paso y el parqueadero se dibujan con su trama y su rótulo',
  /drawEnvironment:/.test(canvas) && /CGContextSetLineDash/.test(canvas)
  && /strcmp\(type, "parking"\) == 0/.test(canvas)
  && /norma_environment_is\(element->type\)/.test(canvas),
  'trama · eje discontinuo · P');

report.check('El SVG exporta la trama del entorno y el lindero discontinuo',
  /strcmp\(element->type, "road"\) == 0/.test(svgC) && /strcmp\(element->type, "crosswalk"\) == 0/.test(svgC)
  && /strcmp\(type, "property"\) == 0/.test(svgC) && /stroke-dasharray/.test(svgC)
  && /#2563eb/.test(svgC) && /#ea580c/.test(svgC),
  'road · crosswalk · property · pipe · conduit');

report.check('Duplicar y girar usan las operaciones nuevas del documento',
  /norma_document_duplicate\(self\.document/.test(canvas)
  && /norma_document_set_rotation\(self\.document, index/.test(canvas)
  && /- \(NSString \*\)duplicateSelection/.test(canvasHeader)
  && /- \(NSString \*\)rotateSelection/.test(canvasHeader),
  'duplicar · girar 90°');

report.check('La paleta y el inspector se compilan y se marcan solos al cambiar de herramienta',
  /ToolRail\.m/.test(makefile) && /InspectorPanel\.m/.test(makefile)
  && /- \(void\)toolRail:\(ToolRail \*\)rail didChooseTool:\(NormiaTool\)tool/.test(delegate)
  && /- \(void\)canvas:\(CanvasView \*\)view didChooseTool:\(NormiaTool\)tool/.test(delegate)
  && /canvasSelectionDidChange:/.test(delegate) && /canvasSelectionDidChange:/.test(canvasHeader),
  'ToolRail · InspectorPanel · selección');

/* ------------------------------ 7 · pictogramas -------------------------------- */

report.check('El intérprete de pictogramas está en el núcleo y se compila con él',
  /src\/svgdraw\.c/.test(nativeMakefile) && /tests-svgdraw/.test(nativeMakefile)
  && /norma_svg_draw/.test(svgdrawH) && /norma_svg_drawable/.test(svgdrawH)
  && /same_name\(name, name_length, "use"\)/.test(svgdrawC)
  && /clipPath/.test(svgdrawC) && /even_odd/.test(svgdrawC),
  'svgdraw.c · use · clipPath · evenodd');

report.check('El intérprete cubre las formas y los atributos que trae el catálogo',
  /"path"/.test(svgdrawC) && /"rect"/.test(svgdrawC) && /"circle"/.test(svgdrawC)
  && /"ellipse"/.test(svgdrawC) && /"polygon"/.test(svgdrawC) && /"polyline"/.test(svgdrawC)
  && /"line"/.test(svgdrawC) && /viewBox/.test(svgdrawC) && /fill-opacity/.test(svgdrawC)
  && /stroke-dasharray/.test(svgdrawC) && /currentColor/.test(svgdrawC),
  'path · rect · circle · ellipse · polígonos · línea · viewBox · opacidad · raya · currentColor');

report.check('El puente dibuja el SVG en Core Graphics, rotula y rasteriza las miniaturas',
  /#import "SvgPicture\.h"/.test(picture) && /CGContextAddPath/.test(picture)
  && /sink\.text = picture_text/.test(picture) && /drawAtPoint:NSMakePoint/.test(picture)
  && /CGContextFillPath/.test(picture) && /CGContextStrokePath/.test(picture)
  && /CGContextSetLineDash/.test(picture) && /CGContextSaveGState/.test(picture)
  && /CGBitmapContextCreate/.test(picture)
  && /NormiaDrawSvgInContext/.test(pictureHeader) && /NormiaThumbnailForType/.test(pictureHeader)
  && /SvgPicture\.m/.test(makefile) && /\.\.\/src\/svgdraw\.c/.test(makefile),
  'CGMutablePath · bitmap 2× · caché · enlazado con el núcleo');

report.check('La ventana dibuja el pictograma del catálogo, no una caja con su nombre',
  /norma_object_find\(element->type\)/.test(canvas)
  && /NormiaDrawSvgInContext\(context, spec->svg/.test(canvas)
  && /CGContextRotateCTM/.test(canvas) && /CGContextSetAlpha/.test(canvas),
  'pictograma · giro · opacidad');

report.check('El pictograma se dibuja sin caja ni nombre encima, como en la web',
  /norma_object_find\(element->type\)/.test(canvas)
  && /spec != NULL && spec->svg != NULL/.test(canvas)
  && !/spec != NULL && spec->svg == NULL && spec->name/.test(canvas),
  'el nombre queda en el globo, el inspector y la biblioteca');

report.check('La biblioteca visual muestra cada pictograma en una tarjeta, como la web',
  /@interface NormiaCatalogGrid : NSView/.test(picker)
  && /NormiaThumbnailForType\(spec->type, kThumbSide\)/.test(picker)
  && /kCardWidth = 104\.0/.test(picker) && /kCardHeight = 112\.0/.test(picker)
  && /kThumbSide = 56\.0/.test(picker)
  && /- \(NSInteger\)indexAtPoint:/.test(picker) && /drawInRect/.test(picker),
  'rejilla de tarjetas · pictograma 56 px · nombre y código');

report.check('La biblioteca visual filtra por familia y busca sin tildes, como la web',
  /NSPopUpButton \*family;/.test(picker) && /buildFamilyFilter/.test(picker)
  && /Todas \(%lu\)/.test(picker) && /NSDiacriticInsensitiveSearch/.test(picker)
  && /Doble clic o Intro para insertar/.test(picker),
  'categorías · buscador · atajos');

report.check('El inspector sigue mostrando la miniatura de la pieza elegida',
  /NormiaThumbnailForType\(element->type, 32\.0\)/.test(inspector)
  && /heroPreview/.test(inspector) && /heroPreview\.hidden = YES/.test(inspector),
  'miniatura 32 en la ficha');

report.check('Las pruebas del intérprete dibujan los 820 pictogramas y miden su cobertura',
  /trace_paint/.test(svgdrawTest) && /raster/.test(svgdrawTest)
  && /iso_e001/.test(svgdrawTest) && /iso_p001/.test(svgdrawTest)
  && /817/.test(svgdrawTest) && /coverage_of/.test(svgdrawTest),
  'destino de trazo · destino que rasteriza · señales conocidas');

report.check('El rótulo que traen dentro nueve piezas (P · E · 30 · PARE) también se dibuja',
  /NORMA_SVG_TEXT_MIDDLE/.test(svgdrawH) && /NORMA_SVG_TEXT_MIDDLE/.test(svgdrawC)
  && /shape_text/.test(svgdrawC) && /"text-anchor"/.test(svgdrawC)
  && /state\.texts/.test(svgdrawTest) && /labelled == 9/.test(svgdrawTest),
  'sink.text · text-anchor · nueve piezas');

/* -------------------------------- 8 · coherencia ------------------------------- */

for (const [name, source] of [['main.m', main], ['AppDelegate.m', delegate], ['CanvasView.m', canvas],
                              ['ToolRail.m', rail], ['InspectorPanel.m', inspector]]) {
  const open = (source.match(/\{/g) || []).length;
  const close = (source.match(/\}/g) || []).length;
  report.check(`${name} tiene las llaves equilibradas`, open === close, `${open} abre · ${close} cierra`);
}

report.check('El flujo compila y arranca la aplicación en un runner de macOS',
  /native\/macos/.test(fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'verify.yml'), 'utf8'))
  && /macos-/.test(fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'verify.yml'), 'utf8')),
  'verify.yml · jobs.macos');

const fallos = report.summary();
process.exit(fallos === 0 ? 0 : 1);
