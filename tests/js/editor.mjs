/*
 * Pruebas de interfaz del editor (JSDOM + aplicación PHP real sobre php-wasm).
 * Cubre inserción, selección, mover, escalar, rotar, color, cambio de tipo,
 * deshacer/rehacer, guardado, reapertura, borradores, conflictos y exportación.
 */
import { startApp, extractToken } from '../php/harness.mjs';
import {
  openEditor,
  closeEditor,
  pointer,
  drag,
  key,
  clientPoint,
  waitFor,
  sleep,
  makeReporter,
} from './boot.mjs';

const VERSION = process.argv[2] || '8.3';
const report = makeReporter(`UI/PHP ${VERSION}`);

const q = (window, selector) => window.document.querySelector(selector);
const qa = (window, selector) => Array.from(window.document.querySelectorAll(selector));
const toastText = (window) => qa(window, '.toast-text').map((node) => node.textContent.trim()).join(' | ');
const clearToasts = (window) => qa(window, '.toast').forEach((node) => node.remove());

function nodeFor(app, id) {
  return q(app.window || app, '#plan-canvas')?.querySelector(`.plan-element[data-id="${id}"]`);
}

function elementById(app, id) {
  return app.model.design.elements.find((element) => element.id === id);
}

function selectElement(app, id) {
  app.applyTool('select');
  app.renderNow();
  const node = app.svg.querySelector(`.plan-element[data-id="${id}"]`);
  if (!node) throw new Error(`No se encontró el nodo del elemento ${id}`);
  const element = elementById(app, id);
  const frame = { x: element.x + element.w / 2, y: element.y + element.h / 2 };
  const point = clientPoint(app, frame.x, frame.y);
  pointer(app.window, node, 'pointerdown', point);
  pointer(app.window, node, 'pointerup', point);
  app.renderNow();
  return node;
}

function handle(app, name) {
  return app.svg.querySelector(`.selection-frame .handle[data-handle="${name}"]`);
}

function numbers(value) {
  return String(value || '').trim().split(/[\s,]+/).map(Number).filter((item) => Number.isFinite(item));
}

function renderedPoints(app, id) {
  const node = app.svg.querySelector(`.plan-element[data-id="${id}"]`);
  const polyline = node?.querySelector('polyline:not(.hit-area)');
  return polyline ? numbers(polyline.getAttribute('points')) : [];
}

function near(actual, expected, tolerance = 1.5) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

/** Puntos del trazo ya transformados por la rotación del grupo (como los pinta el navegador). */
function worldPoints(app, id) {
  const node = app.svg.querySelector(`.plan-element[data-id="${id}"]`);
  const polyline = node?.querySelector('polyline:not(.hit-area)');
  const raw = numbers(polyline?.getAttribute('points'));
  const transform = /translate\(([-\d.eE]+) ([-\d.eE]+)\) rotate\(([-\d.eE]+)\) translate\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(node?.getAttribute('transform') || '');
  if (!transform) return raw;
  const [, tx, ty, degrees, dx, dy] = transform.map(Number);
  const angle = (degrees * Math.PI) / 180;
  const points = [];
  for (let index = 0; index < raw.length; index += 2) {
    // translate(a b) rotate(θ) translate(d e) => mundo = R(p + d) + a
    const px = raw[index] + dx;
    const py = raw[index + 1] + dy;
    points.push({
      x: px * Math.cos(angle) - py * Math.sin(angle) + tx,
      y: px * Math.sin(angle) + py * Math.cos(angle) + ty,
    });
  }
  return points;
}

function routePath(relative) {
  return new URL(relative, 'http://127.0.0.1/').pathname + new URL(relative, 'http://127.0.0.1/').search;
}

async function main() {
  const runtime = await startApp(VERSION);
  const client = runtime.client;
  let editor = null;
  try {
    await runtime.install({ demo: false });
    await runtime.login('admin@normia.local', 'ClaveSegura2026');

    /* ----------------------------- proyecto vacío ----------------------------- */
    const form = await client.get('projects/new');
    const token = extractToken(form.text);
    client.csrf = token;
    const created = await client.postForm('projects', {
      _token: token,
      name: 'Proyecto UI',
      site: 'Sede de pruebas',
      workplace: 'Bodega',
      responsible: 'Equipo QA',
      notes: 'Proyecto creado por la prueba de interfaz.',
      preset: 'a4h',
    });
    const projectId = Number(/projects\/(\d+)/.exec(decodeURIComponent(created.location))?.[1] || 0);
    const projectPage = await client.get(`projects/${projectId}`);
    const editorHref = Array.from(projectPage.text.matchAll(/href="([^"]+)"/g))
      .map((match) => {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return match[1];
        }
      })
      .find((href) => /\/floors\/\d+\/editor/.test(href)) || '';
    const floorId = Number(/floors\/(\d+)\/editor/.exec(editorHref)?.[1] || 0);
    report.check('Proyecto y piso de prueba creados', projectId > 0 && floorId > 0, `proyecto ${projectId} · piso ${floorId}`);

    const editorRoute = `/index.php?r=projects/${projectId}/floors/${floorId}/editor`;
    editor = await openEditor(client, editorRoute);
    const { app, window } = editor;
    app.window = window;
    const design0 = JSON.parse(JSON.stringify(app.model.design));

    /* ------------------------------- arranque ------------------------------- */
    report.check('El editor arranca con la aplicación real', Boolean(app && app.model && app.renderer), window.document.title);
    report.check('Catálogo de señalización completo', Object.keys(app.catalogs.signs).length === 332, String(Object.keys(app.catalogs.signs).length));
    report.check('Catálogo CAD completo', Object.keys(app.catalogs.cad).length === 32, String(Object.keys(app.catalogs.cad).length));
    report.check('Familias CAD cargadas', Object.keys(app.catalogs.cadCategories).length === 6, Object.keys(app.catalogs.cadCategories).join(','));
    report.check('Paleta de colores expuesta', window.Normia.COLORS.length === 28, String(window.Normia.COLORS.length));
    report.check('Lienzo con el preset A4 horizontal', app.model.design.canvas.width === 1123 && app.model.design.canvas.height === 794, `${app.model.design.canvas.width}×${app.model.design.canvas.height}`);
    report.check('Barra de estado muestra el tamaño', q(window, '[data-canvas-size]').textContent.includes('794'), q(window, '[data-canvas-size]').textContent);
    report.check('Escala visible en la barra de estado', q(window, '[data-scale-label]').textContent.includes('1:100'), q(window, '[data-scale-label]').textContent);
    report.check('Reglas dibujadas', q(window, '[data-ruler-h] svg')?.children.length > 0 && q(window, '[data-ruler-v] svg')?.children.length > 0,
      `${q(window, '[data-ruler-h] svg')?.children.length || 0} marcas horizontales`);
    report.check('Los campos de arranque se eliminan del DOM', !q(window, '#editor-design') && !q(window, '#editor-boot'));
    report.check('El estado inicial está guardado', /v1/.test(q(window, '[data-save-label]').textContent), q(window, '[data-save-label]').textContent);

    /* --------------------------- herramientas/base --------------------------- */
    const toolNames = qa(window, '[data-tool]').map((button) => button.dataset.tool).filter(Boolean);
    report.check('La barra lateral expone las herramientas básicas', ['select', 'wall', 'door', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse'].every((tool) => toolNames.includes(tool)), toolNames.join(','));
    q(window, '[data-tool="wall"]').click();
    report.check('Elegir herramienta actualiza el estado y la pista', app.tool === 'wall' && q(window, '[data-stage-hint]').textContent.includes('Muro'), q(window, '[data-stage-hint]').textContent.slice(0, 40));
    app.applyTool('herramienta_inventada');
    report.check('Herramienta desconocida rechazada', app.tool === 'wall' && /Herramienta no disponible/.test(toastText(window)), toastText(window).slice(0, 60));
    clearToasts(window);
    app.applyTool('select');

    /* ---------------------------- insertar con puntero ---------------------------- */
    app.applyTool('wall');
    const beforeWall = app.model.design.elements.length;
    drag(window, app.svg, clientPoint(app, 200, 200), clientPoint(app, 420, 200));
    app.renderNow();
    report.check('Dibujar un muro añade un elemento', app.model.design.elements.length === beforeWall + 1, `${beforeWall} → ${app.model.design.elements.length}`);
    const wall = app.model.design.elements[app.model.design.elements.length - 1];
    report.check('El muro conserva dos puntos y su longitud', wall?.type === 'wall' && wall.points?.length === 2 && Math.round(wall.w) === 220, `${wall?.type} · ancho ${Math.round(wall?.w || 0)}`);

    /* ---------------- posiciones reales del trazo (no en el origen) ---------------- */
    const wallNode = () => app.svg.querySelector(`.plan-element[data-id="${wall.id}"]`);
    const wallStroke = () => wallNode()?.querySelector('polyline:not(.hit-area)');
    let drawn = renderedPoints(app, wall.id);
    report.check('El muro se dibuja en su posición real, no en el origen',
      near(drawn[0], wall.x + wall.points[0].x) && near(drawn[1], wall.y + wall.points[0].y)
      && near(drawn[2], wall.x + wall.points[1].x) && near(drawn[3], wall.y + wall.points[1].y),
      `dibujado ${drawn.slice(0, 4).join(',')} · modelo ${Math.round(wall.x)},${Math.round(wall.y)}`);
    report.check('El muro tiene una zona de pulsación amplia', Number(wallStroke()?.getAttribute('stroke-width')) > 0
      && Number(wallNode()?.querySelector('.hit-area')?.getAttribute('stroke-width')) >= 12,
      `${wallNode()?.querySelector('.hit-area')?.getAttribute('stroke-width')} uds`);

    app.applyTool('select');
    app.model.clearSelection();
    app.renderNow();
    const wallHit = clientPoint(app, wall.x + wall.w / 2, wall.y + wall.h / 2);
    pointer(window, wallNode().querySelector('.hit-area') || wallStroke(), 'pointerdown', wallHit);
    pointer(window, wallNode().querySelector('.hit-area') || wallStroke(), 'pointerup', wallHit);
    app.renderNow();
    report.check('Un clic en el trazo selecciona el muro correcto', app.model.selection.size === 1 && app.model.selection.has(wall.id));
    const beforeSecondClick = JSON.stringify(elementById(app, wall.id));
    pointer(window, wallNode().querySelector('.hit-area') || wallStroke(), 'pointerdown', wallHit);
    pointer(window, wallNode().querySelector('.hit-area') || wallStroke(), 'pointerup', wallHit);
    app.renderNow();
    report.check('Un segundo clic no borra ni deforma el muro',
      JSON.stringify(elementById(app, wall.id)) === beforeSecondClick && app.model.design.elements.some((element) => element.id === wall.id),
      `elementos ${app.model.design.elements.length}`);

    window.document.querySelector('[data-tool="rect"]')?.click();
    app.renderNow();
    window.document.querySelector('[data-tool="select"]')?.click();
    app.renderNow();
    report.check('Cambiar de herramienta conserva el elemento y su geometría',
      JSON.stringify(elementById(app, wall.id)) === beforeSecondClick && Boolean(wallNode()));

    /* --------------------- rotación sin saltar fuera del lienzo --------------------- */
    app.model.select([wall.id]);
    app.model.setRotation(90);
    app.renderNow();
    drawn = renderedPoints(app, wall.id);
    const rotated = elementById(app, wall.id);
    const rotatedWorld = worldPoints(app, wall.id);
    const boxCenter = { x: rotated.x + rotated.w / 2, y: rotated.y + rotated.h / 2 };
    const angle = (rotated.rotation * Math.PI) / 180;
    const expectedPoint = (() => {
      const world = { x: rotated.x + rotated.points[0].x, y: rotated.y + rotated.points[0].y };
      const dx = world.x - boxCenter.x;
      const dy = world.y - boxCenter.y;
      return { x: boxCenter.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: boxCenter.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
    })();
    report.check('Rotar el muro mantiene el trazo junto a su caja',
      near(rotatedWorld[0].x, expectedPoint.x, 2) && near(rotatedWorld[0].y, expectedPoint.y, 2)
      && rotatedWorld[0].x > 0 && rotatedWorld[0].y > 0
      && rotatedWorld[0].x < app.model.design.canvas.width && rotatedWorld[0].y < app.model.design.canvas.height,
      `pintado ${Math.round(rotatedWorld[0].x)},${Math.round(rotatedWorld[0].y)} · esperado ${Math.round(expectedPoint.x)},${Math.round(expectedPoint.y)}`);
    app.model.setRotation(0);
    app.renderNow();

    /* -------------------------------- líneas -------------------------------- */
    app.applyTool('line');
    drag(window, app.svg, clientPoint(app, 600, 400), clientPoint(app, 400, 500));
    app.renderNow();
    const lineElement = app.model.design.elements.at(-1);
    const lineDrawn = renderedPoints(app, lineElement.id);
    report.check('La línea respeta la dirección del trazo (no la diagonal de la caja)',
      lineElement.type === 'line' && lineDrawn[0] > lineDrawn[2] && lineDrawn[1] < lineDrawn[3],
      `${lineDrawn.slice(0, 4).join(',')}`);
    report.check('La línea se dibuja en su posición real',
      near(lineDrawn[0], 600, 3) && near(lineDrawn[1], 400, 3) && near(lineDrawn[2], 400, 3) && near(lineDrawn[3], 500, 3),
      `${lineDrawn.slice(0, 4).map((value) => Math.round(value)).join(',')}`);

    /* --------------------------------- rutas --------------------------------- */
    const clickAt = (x, y) => {
      const point = clientPoint(app, x, y);
      pointer(window, app.svg, 'pointerdown', point);
      pointer(window, app.svg, 'pointerup', point);
      return point;
    };
    app.applyTool('route');
    clickAt(120, 620);
    clickAt(320, 620);
    clickAt(320, 720);
    report.check('La ruta acumula puntos mientras se dibuja', app.draft?.points?.length === 4, `${app.draft?.points?.length} puntos`);
    report.check('La pista de la ruta indica cómo cerrarla', /cerrar el circuito/.test(q(window, '[data-stage-hint]').textContent), q(window, '[data-stage-hint]').textContent.slice(0, 60));
    key(window, window.document.body, 'Backspace');
    app.renderNow();
    report.check('Retroceso quita el último punto de la ruta', app.draft?.points?.length === 3, `${app.draft?.points?.length}`);
    clickAt(320, 720);
    clickAt(122, 622);
    app.renderNow();
    const route = app.model.design.elements.at(-1);
    report.check('Clic en el primer punto cierra el circuito', route.type === 'route' && route.points.length === 4
      && near(route.points[0].x, route.points[3].x, 0.01) && near(route.points[0].y, route.points[3].y, 0.01),
      `${route.points.length} puntos`);
    const routeDrawn = renderedPoints(app, route.id);
    report.check('La ruta se dibuja donde se trazó, no en el origen',
      routeDrawn.length === 8 && near(routeDrawn[0], route.x + route.points[0].x, 2) && near(routeDrawn[1], route.y + route.points[0].y, 2)
      && near(routeDrawn[6], route.x + route.points[3].x, 2) && near(routeDrawn[7], route.y + route.points[3].y, 2),
      drawn.slice(0, 4).join(','));
    app.model.select([route.id]);
    app.renderNow();
    report.check('La selección de la ruta abraza su caja real',
      near(app.model.selectionFrame().x, route.x, 0.5) && near(app.model.selectionFrame().y, route.y, 0.5),
      `${Math.round(app.model.selectionFrame().x)},${Math.round(app.model.selectionFrame().y)}`);
    app.model.clearSelection();
    app.applyTool('select');
    app.renderNow();

    app.applyTool('door');
    const beforeDoor = app.model.design.elements.length;
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 640, 320));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 640, 320));
    app.renderNow();
    report.check('Insertar una puerta con un clic', app.model.design.elements.length === beforeDoor + 1 && app.model.design.elements.at(-1).type === 'door');

    /* --------------------------- biblioteca y colocación --------------------------- */
    const signButton = q(window, '[data-open-library="sign"]');
    signButton?.click();
    app.library.open('sign');
    report.check('La biblioteca de señalización muestra 332 resultados', q(window, '[data-library-families]').textContent.includes('332'), q(window, '[data-library-families]').textContent.slice(0, 80));
    report.check('La biblioteca pinta pictogramas locales', qa(window, '[data-library-grid] .library-thumb svg').length > 0, String(qa(window, '[data-library-grid] .library-thumb svg').length));
    /* --------------- flujo real: tarjeta → insertar → clic en el plano --------------- */
    const signCard = qa(window, '[data-library-grid] .library-card').find((card) => card.dataset.key === 'E002');
    report.check('Las tarjetas de la biblioteca se pueden arrastrar', signCard?.draggable === true);
    signCard?.click();
    report.check('Elegir una tarjeta muestra su ficha y el botón Insertar',
      Boolean(q(window, '[data-library-detail] [data-insert]')) && q(window, '[data-library-detail]').textContent.includes('Salida'),
      q(window, '[data-library-detail] h3')?.textContent);
    q(window, '[data-library-detail] [data-insert]')?.click();
    await sleep(30);
    report.check('Insertar cierra el cajón y activa el modo colocación',
      app.activeDrawer === null && app.tool === 'place' && app.placement?.type === 'iso_e002',
      `cajón ${app.activeDrawer} · herramienta ${app.tool}`);
    const beforeSign = app.model.design.elements.length;
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 800, 300));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 800, 300));
    app.renderNow();
    const signElement = app.model.design.elements.at(-1);
    report.check('Colocar una señal ISO 7010 desde la biblioteca', app.model.design.elements.length === beforeSign + 1 && signElement.type === 'iso_e002', signElement?.type);
    report.check('La señal cae en el punto donde se hizo clic',
      near(signElement.x + signElement.w / 2, 800, 12) && near(signElement.y + signElement.h / 2, 300, 12),
      `centro ${Math.round(signElement.x + signElement.w / 2)},${Math.round(signElement.y + signElement.h / 2)}`);
    report.check('La señal usa el color de su familia', signElement?.color === '#237f52', signElement?.color);
    const signNode = app.svg.querySelector(`.plan-element[data-id="${signElement.id}"]`);
    report.check('La señal se dibuja como pictograma local', Boolean(signNode?.querySelector('svg')) && signNode.querySelector('svg').getAttribute('width') === String(signElement.w));

    const cadKey = Object.keys(app.catalogs.cad)[0];
    const beforeCad = app.model.design.elements.length;
    app.startPlacement('cad', cadKey);
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 900, 520));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 900, 520));
    app.renderNow();
    report.check('Colocar un objeto CAD', app.model.design.elements.length === beforeCad + 1 && app.model.design.elements.at(-1).type === cadKey, cadKey);

    /* --------------------- arrastrar y soltar desde la biblioteca --------------------- */
    app.openDrawer('library');
    app.library.open('cad');
    app.renderNow();
    const dropEvent = new window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(dropEvent, {
      clientX: { value: clientPoint(app, 700, 620).clientX },
      clientY: { value: clientPoint(app, 700, 620).clientY },
      dataTransfer: { value: { getData: (type) => (type === 'text/plain' || type === 'application/x-normia-resource' ? JSON.stringify({ kind: 'cad', key: cadKey }) : '') } },
    });
    app.svg.dispatchEvent(dropEvent);
    app.renderNow();
    const dropped = app.model.design.elements.at(-1);
    report.check('Arrastrar una tarjeta al lienzo crea el recurso', dropped.type === cadKey && app.model.design.elements.length === beforeCad + 2,
      `${dropped.type} en ${Math.round(dropped.x)},${Math.round(dropped.y)}`);
    report.check('Soltar cierra el cajón y vuelve a seleccionar', app.activeDrawer === null && app.tool === 'select');

    /* ------------------------------- selección ------------------------------- */
    selectElement(app, wall.id);
    report.check('Seleccionar con el puntero', app.model.selection.size === 1 && app.model.selection.has(wall.id), String(app.model.selection.size));
    report.check('El inspector muestra las propiedades del muro', q(window, '[data-properties-title]')?.textContent.includes('Muro'), q(window, '[data-properties-title]')?.textContent);
    report.check('El inspector ofrece geometría editable', q(window, '[data-prop="x"]') && q(window, '[data-prop="w"]'));

    /* --------------------------------- mover --------------------------------- */
    const startX = wall.x;
    const startY = wall.y;
    const center = clientPoint(app, wall.x + wall.w / 2, wall.y + wall.h / 2);
    drag(window, app.svg.querySelector(`.plan-element[data-id="${wall.id}"]`), center, {
      clientX: center.clientX + 80 * app.view.zoom,
      clientY: center.clientY + 40 * app.view.zoom,
    });
    app.renderNow();
    report.check('Mover con el puntero y ajuste a la rejilla', Math.round(wall.x - startX) === 80 && Math.round(wall.y - startY) === 40, `Δ ${Math.round(wall.x - startX)},${Math.round(wall.y - startY)}`);

    /* --------------------------------- escalar --------------------------------- */
    const frameBefore = app.model.selectionFrame();
    const se = handle(app, 'se');
    report.check('La caja de selección expone tiradores', Boolean(se) && Boolean(handle(app, 'rotate')), Boolean(se));
    if (se) {
      const from = { clientX: Number(se.getAttribute('x')) , clientY: Number(se.getAttribute('y')) };
      const fromPoint = clientPoint(app, frameBefore.x + frameBefore.w, frameBefore.y + frameBefore.h);
      const to = { clientX: fromPoint.clientX + 60 * app.view.zoom, clientY: fromPoint.clientY + 40 * app.view.zoom };
      drag(window, se, fromPoint, to, 4);
      app.renderNow();
    }
    const frameAfter = app.model.selectionFrame();
    report.check('Escalar desde el tirador', frameAfter.w > frameBefore.w + 20 && frameAfter.h > frameBefore.h + 10, `${Math.round(frameBefore.w)}×${Math.round(frameBefore.h)} → ${Math.round(frameAfter.w)}×${Math.round(frameAfter.h)}`);

    /* --------------------------------- rotar --------------------------------- */
    const rotateHandle = handle(app, 'rotate');
    const wallBeforeRotate = elementById(app, wall.id);
    const centerNow = { x: wallBeforeRotate.x + wallBeforeRotate.w / 2, y: wallBeforeRotate.y + wallBeforeRotate.h / 2 };
    const rotateFrom = clientPoint(app, centerNow.x, centerNow.y - Math.max(wallBeforeRotate.w, wallBeforeRotate.h) / 2 - 20);
    const rotateTo = clientPoint(app, centerNow.x + 60, centerNow.y);
    drag(window, rotateHandle, rotateFrom, rotateTo, 3);
    app.renderNow();
    report.check('Rotar desde el tirador', elementById(app, wall.id).rotation !== 0, `${Math.round(elementById(app, wall.id).rotation)}°`);

    /* ---------------------------------- color ---------------------------------- */
    const swatch = q(window, '[data-action="color"][data-value="#2563eb"]');
    report.check('El inspector pinta la paleta de 28 colores', qa(window, '[data-action="color"]').length === 28, String(qa(window, '[data-action="color"]').length));
    swatch?.click();
    app.renderNow();
    report.check('Aplicar color desde la paleta', elementById(app, wall.id).color === '#2563eb', elementById(app, wall.id).color);

    /* ------------------------------ cambio de tipo ------------------------------ */
    app.applyTool('rect');
    drag(window, app.svg, clientPoint(app, 200, 600), clientPoint(app, 320, 680));
    app.renderNow();
    const rectId = app.model.design.elements.at(-1).id;
    selectElement(app, rectId);
    const typeSelect = q(window, '[data-prop="type"]');
    report.check('El inspector permite cambiar de tipo', Boolean(typeSelect) && typeSelect.value === 'rect', typeSelect?.value);
    typeSelect.value = 'ellipse';
    typeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.renderNow();
    report.check('Cambiar rectángulo a elipse', elementById(app, rectId).type === 'ellipse', elementById(app, rectId).type);
    q(window, '[data-undo]').click();
    app.renderNow();
    report.check('Deshacer revierte el cambio de tipo', elementById(app, rectId).type === 'rect', elementById(app, rectId).type);
    q(window, '[data-redo]').click();
    app.renderNow();
    report.check('Rehacer reaplica el cambio de tipo', elementById(app, rectId).type === 'ellipse', elementById(app, rectId).type);
    q(window, '[data-undo]').click();

    /* ------------------------- eliminar, duplicar, agrupar ------------------------- */
    selectElement(app, rectId);
    const beforeDelete = app.model.design.elements.length;
    key(window, window.document.body, 'Delete');
    app.renderNow();
    report.check('Suprimir con el teclado', app.model.design.elements.length === beforeDelete - 1, `${beforeDelete} → ${app.model.design.elements.length}`);
    key(window, window.document.body, 'z', { ctrlKey: true });
    app.renderNow();
    report.check('Deshacer recupera el elemento suprimido', app.model.design.elements.length === beforeDelete);

    selectElement(app, rectId);
    const beforeDuplicate = app.model.design.elements.length;
    key(window, window.document.body, 'd', { ctrlKey: true });
    app.renderNow();
    report.check('Duplicar con Ctrl+D', app.model.design.elements.length === beforeDuplicate + 1, `${beforeDuplicate} → ${app.model.design.elements.length} · selección ${app.model.selection.size}`);

    const ids = app.model.design.elements.slice(-2).map((element) => element.id);
    app.model.select(ids);
    app.renderNow();
    key(window, window.document.body, 'g', { ctrlKey: true });
    app.renderNow();
    report.check('Agrupar con Ctrl+G', app.model.design.groups.length === 1 && app.model.design.groups[0].members.length === 2, String(app.model.design.groups.length));
    key(window, window.document.body, 'g', { ctrlKey: true, shiftKey: true });
    app.renderNow();
    report.check('Desagrupar con Ctrl+Shift+G', app.model.design.groups.length === 0);

    /* --------------------------------- bloquear --------------------------------- */
    selectElement(app, rectId);
    key(window, window.document.body, 'l', { ctrlKey: true });
    app.renderNow();
    report.check('Bloquear con Ctrl+L impide editar', elementById(app, rectId).locked === true && !app.model.canEdit());
    key(window, window.document.body, 'l', { ctrlKey: true });
    app.renderNow();
    report.check('Desbloquear restaura la edición', elementById(app, rectId).locked === false && app.model.canEdit());

    /* -------------------------------- desplazar -------------------------------- */
    selectElement(app, rectId);
    const nudgeFrom = elementById(app, rectId).x;
    key(window, window.document.body, 'ArrowRight', { shiftKey: true });
    app.renderNow();
    report.check('Desplazar con flechas y Shift', elementById(app, rectId).x === nudgeFrom + 20, `${nudgeFrom} → ${elementById(app, rectId).x}`);

    /* ------------------------------- herramientas ------------------------------- */
    app.applyTool('text');
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 500, 700));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 500, 700));
    app.renderNow();
    const textElement = app.model.design.elements.at(-1);
    report.check('Insertar texto y abrir el inspector', textElement.type === 'text' && q(window, '[data-properties-panel]').classList.contains('is-open'), textElement.type);
    clearToasts(window);
    let labelField = q(window, '[data-prop="label"]');
    labelField.value = '<script>alert(1)</script>';
    labelField.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.renderNow();
    report.check('La etiqueta con HTML se rechaza', !elementById(app, textElement.id).label.includes('<') && /no admite HTML/.test(toastText(window)), toastText(window).slice(0, 80));
    clearToasts(window);
    labelField = q(window, '[data-prop="label"]');
    labelField.value = 'Ruta de evacuación';
    labelField.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.renderNow();
    report.check('La etiqueta de texto se actualiza', elementById(app, textElement.id).label === 'Ruta de evacuación', elementById(app, textElement.id).label);
    report.check('El texto se dibuja como nodo de texto, no como marcado', app.svg.textContent.includes('Ruta de evacuación') && !app.svg.querySelector('script'));

    /* --------------------------------- guardar --------------------------------- */
    const elementsBeforeSave = app.model.design.elements.length;
    q(window, '[data-save]').click();
    await waitFor(() => app.store.version >= 2 && !app.store.saving && !app.model.isDirty(), 20000);
    report.check('Guardar crea la versión 2', app.store.version === 2, `v${app.store.version}`);
    report.check('La barra de estado confirma el guardado', /Guardado · v2/.test(q(window, '[data-save-label]').textContent), q(window, '[data-save-label]').textContent);
    const savedFloor = (await client.get(`api/floors/${floorId}`, { accept: 'application/json' })).json();
    report.check('El servidor almacena el diseño editado', savedFloor.floor.version === 2 && savedFloor.design.elements.length === elementsBeforeSave, `v${savedFloor.floor.version} · ${savedFloor.design.elements.length} elementos`);

    q(window, '[data-save]').click();
    await sleep(300);
    report.check('Guardar sin cambios no crea otra versión', app.store.version === 2 && /No hay cambios pendientes/.test(toastText(window)), toastText(window).slice(0, 60));
    clearToasts(window);
    await app.saveNow('Guardado forzado', { force: true });
    report.check('El guardado forzado crea una versión nueva', app.store.version === 3, `v${app.store.version}`);

    /* --------------------------------- reabrir --------------------------------- */
    const reopened = await openEditor(client, editorRoute);
    try {
      report.check('Reabrir recupera todos los elementos', reopened.app.model.design.elements.length === elementsBeforeSave, `${reopened.app.model.design.elements.length} elementos`);
      report.check('Reabrir conserva el color editado', reopened.app.model.design.elements.some((element) => element.color === '#2563eb'));
      report.check('Reabrir arranca en la última versión', reopened.app.store.version === 3, `v${reopened.app.store.version}`);
      report.check('Reabrir sin borrador no muestra aviso de borrador', !reopened.window.document.querySelector('[data-banner-key="draft"]'));
    } finally {
      closeEditor(reopened);
    }

    /* -------------------------------- borradores -------------------------------- */
    app.model.select([rectId]);
    app.model.moveSelected(40, 0);
    report.check('Hay cambios sin guardar tras editar', app.model.isDirty());
    await app.store.autosave();
    report.check('El autoguardado registra la hora', Boolean(app.store.lastDraftAt), app.store.lastDraftAt || 'sin fecha');
    const draftFloor = (await client.get(`api/floors/${floorId}`, { accept: 'application/json' })).json();
    report.check('El borrador se guarda en el servidor', Boolean(draftFloor.floor.draft?.design_json) && /Ruta de evacuación/.test(draftFloor.floor.draft.design_json));
    const withDraft = await openEditor(client, editorRoute);
    try {
      report.check('Reabrir con borrador muestra el aviso', Boolean(withDraft.window.document.querySelector('[data-banner-key="draft"]')));
      report.check('Reabrir con borrador mantiene la versión guardada', withDraft.app.store.version === 3, `v${withDraft.app.store.version}`);
    } finally {
      closeEditor(withDraft);
    }

    /* -------------------------------- conflicto -------------------------------- */
    const serverDesign = JSON.parse(JSON.stringify(app.model.design));
    const remote = await client.postJson(`api/floors/${floorId}/save`, { design: serverDesign, expected_version: 3, note: 'Guardado remoto de prueba' });
    report.check('Otra sesión guarda la versión 4', remote.status === 200, String(remote.status));
    app.model.select([rectId]);
    app.model.moveSelected(20, 0);
    await app.saveNow();
    report.check('El conflicto de versión se muestra al guardar', app.statusState === 'conflict' && Boolean(q(window, '[data-banner-key="conflict"]')), app.statusText);
    await app.reloadFromServer();
    report.check('Recargar desde el servidor resuelve el conflicto', app.store.version === 4 && !app.conflictVersion, `v${app.store.version}`);
    report.check('La recarga elimina el aviso de conflicto', !q(window, '[data-banner-key="conflict"]'));

    /* -------------------------------- exportación -------------------------------- */
    const svgExport = await client.get(routePath(app.boot.exportSvgUrl));
    report.check('La exportación SVG responde 200', svgExport.status === 200 && /svg/.test(svgExport.type), `${svgExport.status} ${svgExport.type}`);
    report.check('El SVG exportado no contiene scripts ni recursos externos', !/<script/i.test(svgExport.text) && !/href="https?:/i.test(svgExport.text));
    report.check('El SVG exportado incluye el contenido del plano', /Ruta de evacuación/.test(svgExport.text) && /<svg/i.test(svgExport.text), `${svgExport.text.length} bytes`);
    const jsonExport = await client.get(routePath(app.boot.exportJsonUrl));
    const exported = JSON.parse(jsonExport.text);
    report.check('La exportación JSON usa el esquema v2', exported.schema_version === 2 && exported.application === 'normia-planos-cad', String(exported.schema_version));
    report.check('El JSON exportado incluye proyecto y piso', exported.project?.name === 'Proyecto UI' && exported.floor?.name, `${exported.project?.name} · ${exported.floor?.name}`);
    report.check('El JSON exportado contiene los elementos guardados', exported.design.elements.length === app.model.design.elements.length, `${exported.design.elements.length}`);

    await app.export('svg');
    report.check('Exportar SVG genera una descarga local', window.__downloads.some((item) => decodeURIComponent(String(item.href)).includes('export/svg')), JSON.stringify(window.__downloads.at(-1)));
    await app.exportPng('plano-prueba');
    report.check('Exportar PNG genera un archivo', window.__downloads.some((item) => item.download === 'plano-prueba.png'), JSON.stringify(window.__downloads.at(-1)));
    await app.export('print');
    report.check('La impresión usa la ruta del servidor', String(app.boot.printUrl).includes('print'));

    /* ------------------------------- interfaz/tooltips ------------------------------- */
    const tips = qa(window, '[data-tooltip]');
    report.check('Hay controles con tooltip accesible', tips.length > 5, String(tips.length));
    const firstTip = tips.find((node) => !node.closest('[data-drawer]')) || tips[0];
    const secondTip = tips.find((node) => node !== firstTip && !node.closest('[data-drawer]')) || tips[1];
    firstTip.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    await sleep(360);
    const tooltip = q(window, '#normia-tooltip');
    const firstText = tooltip?.textContent;
    secondTip.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    await sleep(360);
    report.check('Los tooltips se actualizan sin acumularse', qa(window, '#normia-tooltip').length === 1 && tooltip.textContent !== firstText, `${firstText} → ${tooltip.textContent}`);
    firstTip.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: window.document.body }));
    report.check('El tooltip se oculta y limpia al salir', tooltip.hidden === true && tooltip.textContent === '', String(tooltip.hidden));

    /* ------------------------------ capas y versiones ------------------------------ */
    app.applyTool('select');
    q(window, '[data-open-drawer="layers"]')?.click();
    await waitFor(() => q(window, '[data-layer-list]')?.children.length > 0, 5000);
    report.check('El cajón de capas lista las capas del plano', qa(window, '[data-layer-list] .layer-row').length >= 1, String(qa(window, '[data-layer-list] .layer-row').length));
    app.closeDrawer();
    q(window, '[data-open-drawer="versions"]')?.click();
    await waitFor(() => q(window, '[data-version-list]')?.textContent.includes('v4'), 8000);
    report.check('El cajón de versiones muestra el historial', /v4/.test(q(window, '[data-version-list]').textContent) && /v1/.test(q(window, '[data-version-list]').textContent));
    app.closeDrawer();

    /* ------------------------------ límites/seguridad ------------------------------ */
    const previousTool = app.tool;
    app.model.addElement.bind(app.model);
    let threw = false;
    try {
      app.model.addElement('muro_falso');
    } catch {
      threw = true;
    }
    report.check('El modelo rechaza tipos fuera del catálogo', threw);
    threw = false;
    try {
      app.model.addPath('wall', [{ x: 0, y: 0 }]);
    } catch {
      threw = true;
    }
    report.check('El modelo rechaza trazados incompletos', threw && app.tool === previousTool);
    const clamped = app.model.addElement('wall', { x: -500, y: -500, w: 99999, h: 2 });
    app.renderNow();
    report.check('Las coordenadas fuera del lienzo se limitan', clamped.x === 0 && clamped.y === 0 && clamped.w <= app.model.design.canvas.width, `${clamped.x},${clamped.y} ${clamped.w}`);

    /* -------------------- bibliotecas completas sin excepciones -------------------- */
    let assetsOk = 0;
    const assetFailures = [];
    for (const code of Object.keys(app.catalogs.signs)) {
      try {
        const thumb = app.renderer.thumbnail(`iso_${code.toLowerCase()}`);
        if (thumb.querySelector('svg')) assetsOk += 1;
        else assetFailures.push(code);
      } catch (error) {
        assetFailures.push(`${code}: ${error.message}`);
      }
    }
    for (const key of Object.keys(app.catalogs.cad)) {
      try {
        const thumb = app.renderer.thumbnail(key);
        if (thumb.querySelector('svg')) assetsOk += 1;
        else assetFailures.push(key);
      } catch (error) {
        assetFailures.push(`${key}: ${error.message}`);
      }
    }
    report.check('Los 332 pictogramas y 32 equipos se instancian sin errores', assetsOk === 364 && assetFailures.length === 0,
      `${assetsOk}/364 · ${assetFailures.slice(0, 3).join(', ')}`);

    const xlink = new window.DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><defs><g id="marca"><rect width="10" height="10"/></g></defs><use xlink:href="#marca"/></svg>',
      'image/svg+xml',
    ).documentElement;
    let namespaceError = '';
    try {
      app.renderer.namespaceIds(xlink);
    } catch (error) {
      namespaceError = error.message;
    }
    const prefixed = xlink.querySelector('use')?.getAttribute('xlink:href') || xlink.querySelector('use')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
    report.check('Los identificadores y referencias SVG se renombran sin selectores inválidos',
      namespaceError === '' && prefixed.startsWith('#') && prefixed !== '#marca' && /-a\d+-marca$/.test(prefixed)
      && !/a\d+-[^#]*-a\d+-marca$/.test(prefixed),
      namespaceError || prefixed);

    report.check('Sin errores de JavaScript durante la sesión', window.__errors.length === 0, window.__errors.join(' | ').slice(0, 200));
  } finally {
    closeEditor(editor);
    await runtime.close();
  }
}

main()
  .then(() => {
    const failed = report.summary();
    process.exitCode = failed === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error('\nLa suite de interfaz se detuvo:', error);
    report.summary();
    process.exitCode = 1;
  });
