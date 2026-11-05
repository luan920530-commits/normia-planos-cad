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
const makefile = read('Makefile');
/**
 * El código sin comentarios. Los comentarios explican justamente por qué no se
 * usa un WebView, así que no pueden contar como si se usara.
 */
const strip = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
const all = strip([main, delegate, canvas, canvasHeader].join('\n'));
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
  /CanvasToolPen/.test(canvas) && /keyCode == 36 \|\| event\.keyCode == 76/.test(canvas)
  && /clickCount >= 2/.test(canvas) && /_draftCount -= 1/.test(canvas),
  'Enter · doble clic · Retroceso');

report.check('El arco de tres puntos se arma con el núcleo, no con una aproximación',
  /CanvasToolArc/.test(canvas) && /norma_arc_from_points\(_draft\[0\], _draft\[1\], _draft\[2\]\)/.test(canvas)
  && /El arco no es válido/.test(canvas), 'tres puntos');

report.check('La cota se rotula con la cifra y la unidad del plano',
  /CanvasToolDimension/.test(canvas) && /norma_format_measure_cm/.test(canvas)
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
  /CanvasToolRoute/.test(canvas) && /isEqualToString:@"r"/.test(canvas)
  && /Ruta: un clic por nodo/.test(canvas)
  && /selectToolWithKey:/.test(canvas) && /selectToolWithKey:/.test(canvasHeader),
  'R · Enter · doble clic');

report.check('La ruta usa el mismo borrador de polilínea que la pluma',
  /_tool == CanvasToolPen \|\| _tool == CanvasToolRoute/.test(canvas)
  && /_tool == CanvasToolRoute\) && _draftCount >= 2/.test(canvas),
  'borrador compartido');

report.check('La ruta se guarda con el núcleo como tipo ruta, no como un muro',
  /norma_document_add_route\(self\.document, _draft, \(size_t\) _draftCount/.test(canvas)
  && !/norma_document_add_wall\(self\.document, _draft, \(size_t\) _draftCount\)\s*;\n?\s*\}\s*else if \(_tool == CanvasToolRoute/.test(canvas),
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

report.check('El paquete lleva los catálogos que el cajón necesita',
  /Contents\/Resources\/resources/.test(makefile) && /cp \.\.\/resources\/\*\.json/.test(makefile),
  'Resources/resources');

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

/* ------------------------------ 5 · sistema mínimo ----------------------------- */

report.check('El paquete declara macOS 12 Monterey como mínimo',
  /<key>LSMinimumSystemVersion<\/key>\s*<string>12\.0<\/string>/.test(plist), 'LSMinimumSystemVersion 12.0');

report.check('El paquete se identifica aparte de las ediciones existentes',
  /co\.normia\.estudio\.nativo/.test(plist) && /CFBundleDocumentTypes/.test(plist)
  && /public\.json/.test(plist), 'co.normia.estudio.nativo · .json');

report.check('La aplicación responde a --check sin abrir ventana',
  /--check/.test(main) && /norma_document_length_cm/.test(main), 'humo del núcleo');

/* -------------------------------- 6 · coherencia ------------------------------- */

for (const [name, source] of [['main.m', main], ['AppDelegate.m', delegate], ['CanvasView.m', canvas]]) {
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
