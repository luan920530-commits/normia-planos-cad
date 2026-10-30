/*
 * Pruebas de interfaz del editor (JSDOM + aplicación PHP real sobre php-wasm).
 * Cubre inserción, selección, mover, escalar, rotar, color, cambio de tipo,
 * deshacer/rehacer, guardado, reapertura, borradores, conflictos y exportación.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startApp, extractToken, repoRoot } from '../php/harness.mjs';
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

function rendererOfDoor(app, id) {
  return app.svg.querySelector(`.plan-element[data-id="${id}"] .door`);
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
    const signCodes = Object.keys(app.catalogs.signs);
    const serviceCodes = signCodes.filter((code) => code.startsWith('SVC_'));
    report.check('Catálogo de señalización completo', signCodes.length === 389 && serviceCodes.length === 57, `${signCodes.length} · ${serviceCodes.length} de servicios`);
    report.check('Señales de baño disponibles', ['SVC_WC_MEN', 'SVC_WC_WOMEN', 'SVC_WC_MIXED', 'SVC_WC_ACCESSIBLE', 'SVC_BABY'].every((code) => app.catalogs.signs[code]?.name),
      ['SVC_WC_MEN', 'SVC_WC_WOMEN', 'SVC_WC_MIXED', 'SVC_WC_ACCESSIBLE', 'SVC_BABY'].filter((code) => !app.catalogs.signs[code]).join(',') || 'todas');
    report.check('La familia de servicios está disponible', app.catalogs.signCategories.services?.label === 'Orientación y servicios', app.catalogs.signCategories.services?.label);
    report.check('Catálogo CAD ampliado a 301 objetos', Object.keys(app.catalogs.cad).length === 301, String(Object.keys(app.catalogs.cad).length));
    report.check('Familias CAD ampliadas a 23', Object.keys(app.catalogs.cadCategories).length === 23, Object.keys(app.catalogs.cadCategories).join(','));
    const expectedFamilies = ['restaurant', 'warehouse', 'retail', 'hospital', 'textile', 'grill', 'supermarket', 'residential', 'sports', 'outdoor', 'electrico', 'hidraulico', 'eds', 'drogueria', 'gimnasio', 'colegio', 'cafeteria'];
    report.check('Nuevas familias sectoriales disponibles', expectedFamilies.every((key) => app.catalogs.cadCategories[key]?.label), expectedFamilies.filter((key) => !app.catalogs.cadCategories[key]).join(',') || 'todas');
    report.check('Paleta de colores expuesta', window.Normia.COLORS.length === 29, String(window.Normia.COLORS.length));
    report.check('La barra lateral cuenta los equipos del catálogo', q(window, '[data-cad-count]')?.textContent === '301', q(window, '[data-cad-count]')?.textContent);
    report.check('La barra lateral cuenta las señales del catálogo', q(window, '[data-sign-count]')?.textContent === '389', q(window, '[data-sign-count]')?.textContent);
    report.check('Lienzo con el preset A4 horizontal', app.model.design.canvas.width === 1123 && app.model.design.canvas.height === 794, `${app.model.design.canvas.width}×${app.model.design.canvas.height}`);
    report.check('Barra de estado muestra el tamaño', q(window, '[data-canvas-size]').textContent.includes('794'), q(window, '[data-canvas-size]').textContent);
    report.check('Escala visible en la barra de estado', q(window, '[data-scale-label]').textContent.includes('1:100'), q(window, '[data-scale-label]').textContent);
    report.check('Reglas dibujadas', q(window, '[data-ruler-h] svg')?.children.length > 0 && q(window, '[data-ruler-v] svg')?.children.length > 0,
      `${q(window, '[data-ruler-h] svg')?.children.length || 0} marcas horizontales`);
    report.check('Los campos de arranque se eliminan del DOM', !q(window, '#editor-design') && !q(window, '#editor-boot'));
    report.check('El estado inicial está guardado', /v1/.test(q(window, '[data-save-label]').textContent), q(window, '[data-save-label]').textContent);

    /* --------------------------- herramientas/base --------------------------- */
    const toolNames = qa(window, '[data-tool]').map((button) => button.dataset.tool).filter(Boolean);
    report.check('La barra lateral expone las herramientas básicas', ['select', 'wall', 'door', 'door_double', 'door_garage', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse'].every((tool) => toolNames.includes(tool)), toolNames.join(','));
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
    let wall = app.model.design.elements[app.model.design.elements.length - 1];
    const wallId = wall.id;
    report.check('El muro conserva dos puntos y su longitud', wall?.type === 'wall' && wall.points?.length === 2 && Math.round(wall.w) === 220, `${wall?.type} · ancho ${Math.round(wall?.w || 0)}`);

    /* ---------------- posiciones reales del trazo (no en el origen) ---------------- */
    const wallNode = () => app.svg.querySelector(`.plan-element[data-id="${wall.id}"]`);
    const wallStroke = () => wallNode()?.querySelector('polyline:not(.hit-area)');
    let drawn = renderedPoints(app, wall.id);
    /* ---------------------------- símbolos de puerta ---------------------------- */
    const addDoor = (type, x, y, extra = {}) => app.model.addElement(type, { x, y, ...extra });
    const plainDoor = addDoor('door', 60, 260);
    app.renderNow();
    const plainNode = rendererOfDoor(app, plainDoor.id);
    report.check('La puerta usa un símbolo de abatimiento (hoja, bisagra y arco)',
      Boolean(plainNode) && plainNode.querySelectorAll('line').length >= 3 && plainNode.querySelectorAll('circle').length >= 1 && Boolean(plainNode.querySelector('path')),
      `${plainNode?.querySelectorAll('line').length || 0} líneas · ${plainNode?.querySelectorAll('circle').length || 0} bisagras`);
    const plainArcNode = plainNode?.querySelector('path');
    const plainArc = plainArcNode?.getAttribute('d') || '';
    report.check('El arco de la puerta es continuo y no punteado',
      Boolean(plainArc) && !plainArcNode.hasAttribute('stroke-dasharray') && /A\s/.test(plainArc), plainArc.slice(0, 42));
    report.check('La puerta sencilla mide 90 de vano y 90 de abatimiento', plainDoor.w === 90 && plainDoor.h === 90, `${plainDoor.w}×${plainDoor.h}`);
    app.model.select([plainDoor.id]);
    app.model.deleteSelected();

    // Una puerta guardada con el formato anterior (solo el hueco del muro)
    // debe migrar sin moverse de la línea del muro.
    const legacyDoor = app.model.createElement('door', { x: 60, y: 210, w: 80, h: 16 });
    report.check('La puerta antigua 80×16 migra conservando la línea del muro',
      legacyDoor.h === 80 && Math.abs((legacyDoor.y + legacyDoor.h) - 226) < 0.6,
      `${legacyDoor.w}×${legacyDoor.h} en y=${legacyDoor.y}`);

    app.model.clearSelection();
    const doubleDoor = addDoor('door_double', 120, 380);
    app.renderNow();
    const doubleNode = rendererOfDoor(app, doubleDoor.id);
    report.check('La puerta doble dibuja dos hojas encontradas',
      doubleNode?.querySelectorAll('path').length === 2 && doubleNode.querySelectorAll('circle').length === 2,
      `${doubleNode?.querySelectorAll('path').length} arcos`);
    report.check('La puerta doble mide 120 de vano y 60 de abatimiento', doubleDoor.w === 120 && doubleDoor.h === 60, `${doubleDoor.w}×${doubleDoor.h}`);

    const garage = addDoor('door_garage', 300, 380);
    app.renderNow();
    const garageNode = rendererOfDoor(app, garage.id);
    report.check('El portón de garaje dibuja panel con barrotes',
      Boolean(garageNode?.querySelector('rect')) && garageNode.querySelectorAll('line').length >= 5,
      `${garageNode?.querySelectorAll('line').length} líneas`);
    report.check('El portón mide 160 de vano', garage.w === 160 && garage.h === 50, `${garage.w}×${garage.h}`);

    app.model.select([garage.id]);
    app.model.setProps({ flipX: true, flipY: true });
    app.renderNow();
    const flipped = rendererOfDoor(app, garage.id);
    report.check('Voltear la puerta invierte bisagra y sentido con una transformación',
      (flipped?.getAttribute('transform') || '').includes('scale(-1 -1)'), flipped?.getAttribute('transform'));

    app.model.setProps({ flipX: false, flipY: false });
    app.model.select([doubleDoor.id]);
    q(window, '[data-prop="flipY"]')?.click();
    app.renderNow();
    report.check('El inspector ofrece cambiar bisagra y lado de apertura',
      Boolean(q(window, '[data-prop="flipX"]')) && Boolean(q(window, '[data-prop="flipY"]')) && Boolean(q(window, '[data-prop="flipY"]').checked));
    app.model.setProps({ flipY: false });

    const garageGhost = app.renderer.ghostNode({ x: 500, y: 500, w: 160, h: 50, type: 'door_garage' });
    report.check('La vista previa de colocación dibuja el portón', Boolean(garageGhost.querySelector('.door')));

    app.model.select([garage.id, doubleDoor.id]);
    app.model.deleteSelected();
    app.renderNow();

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

    /* --------------------- edición de vértices de la ruta --------------------- */
    app.model.select([route.id]);
    app.applyTool('select');
    app.renderNow();
    const vertexHandles = () => qa(window, '.selection-frame .vertex-handle:not(.is-midpoint)');
    report.check('La ruta seleccionada muestra un tirador por vértice', vertexHandles().length === 4, String(vertexHandles().length));

    const beforeVertex = app.model.visualPoints(app.model.element(route.id));
    const firstVertex = vertexHandles()[0];
    const vertexStart = clientPoint(app, Number(firstVertex.getAttribute('cx')), Number(firstVertex.getAttribute('cy')));
    pointer(window, firstVertex, 'pointerdown', vertexStart);
    pointer(window, app.svg, 'pointermove', { clientX: vertexStart.clientX + 80, clientY: vertexStart.clientY + 60 });
    pointer(window, app.svg, 'pointerup', { clientX: vertexStart.clientX + 80, clientY: vertexStart.clientY + 60 });
    app.renderNow();
    const afterVertex = app.model.visualPoints(app.model.element(route.id));
    report.check('Arrastrar un vértice mueve solo ese punto',
      afterVertex.length === 4 && Math.abs(afterVertex[0].x - beforeVertex[0].x) > 30
      && near(afterVertex[1].x, beforeVertex[1].x, 0.5) && near(afterVertex[1].y, beforeVertex[1].y, 0.5),
      `${Math.round(beforeVertex[0].x)},${Math.round(beforeVertex[0].y)} → ${Math.round(afterVertex[0].x)},${Math.round(afterVertex[0].y)}`);
    report.check('La caja del trazo se recalcula al mover el vértice',
      near(app.model.element(route.id).x, Math.min(...afterVertex.map((point) => point.x)), 1),
      String(Math.round(app.model.element(route.id).x)));
    app.model.undo();
    app.renderNow();
    const undone = app.model.visualPoints(app.model.element(route.id));
    report.check('Deshacer devuelve el vértice a su sitio', near(undone[0].x, beforeVertex[0].x, 0.5) && near(undone[0].y, beforeVertex[0].y, 0.5),
      `${Math.round(undone[0].x)},${Math.round(undone[0].y)}`);
    // Deshacer reconstruye los elementos desde el historial: se refresca la
    // referencia local para que las comprobaciones siguientes sigan siendo válidas.
    wall = app.model.element(wallId);

    const segmentPoint = clientPoint(app, beforeVertex[0].x + (beforeVertex[1].x - beforeVertex[0].x) / 2, beforeVertex[0].y);
    const segmentNode = app.svg.querySelector(`.plan-element[data-id="${route.id}"] .hit-area`);
    const dbl = new window.MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window, button: 0, clientX: Math.round(segmentPoint.clientX), clientY: Math.round(segmentPoint.clientY) });
    segmentNode.dispatchEvent(dbl);
    app.renderNow();
    const inserted = app.model.visualPoints(app.model.element(route.id));
    report.check('Doble clic sobre el trazo añade un vértice nuevo', inserted.length === 5, `${inserted.length} puntos`);

    const lastVertex = vertexHandles().at(-1);
    const lastStart = clientPoint(app, Number(lastVertex.getAttribute('cx')), Number(lastVertex.getAttribute('cy')));
    pointer(window, lastVertex, 'pointerdown', lastStart, { altKey: true });
    pointer(window, lastVertex, 'pointerup', lastStart, { altKey: true });
    app.renderNow();
    report.check('Alt+clic elimina el vértice señalado', app.model.visualPoints(app.model.element(route.id)).length === 4,
      String(app.model.visualPoints(app.model.element(route.id)).length));

    app.model.clearSelection();
    app.applyTool('select');
    app.renderNow();

    app.applyTool('door');
    const beforeDoor = app.model.design.elements.length;
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 640, 320));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 640, 320));
    app.renderNow();
    report.check('Insertar una puerta con un clic', app.model.design.elements.length === beforeDoor + 1 && app.model.design.elements.at(-1).type === 'door');

    /* --------------------------- redes: tubería y circuitos --------------------------- */
    report.check('El editor recibe el catálogo de redes',
      Boolean(app.catalogs.mep?.hydraulic?.aguas_negras) && Object.keys(app.catalogs.mep.hydraulic).length === 6,
      Object.keys(app.catalogs.mep?.hydraulic || {}).join(','));

    // Tubería: se elige la red en el desplegable del raíl y se traza con clics.
    const pipeMenu = q(window, '[data-pipe-menu]');
    pipeMenu?.click();
    const pipeOption = qa(window, '[data-pipe-flyout] [data-network]').find((button) => button.dataset.network === 'aguas_negras');
    report.check('El desplegable de tubería ofrece las seis redes', qa(window, '[data-pipe-flyout] [data-network]').length === 6);
    pipeOption?.click();
    report.check('Elegir una red activa la herramienta de tubería', app.tool === 'pipe' && app.pipeNetwork === 'aguas_negras',
      `${app.tool} · ${app.pipeNetwork}`);
    const beforePipe = app.model.design.elements.length;
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 200, 600));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 200, 600));
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 400, 640));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 400, 640));
    app.renderNow();
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 600, 600));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 600, 600));
    app.renderNow();
    app.finishPipe();
    app.renderNow();
    const pipe = app.model.design.elements.at(-1);
    report.check('Trazar una tubería con varios puntos',
      app.model.design.elements.length === beforePipe + 1 && pipe?.type === 'pipe' && pipe.points.length === 3,
      `${pipe?.type} · ${pipe?.points?.length} puntos`);
    report.check('La tubería hereda red, color, diámetro y material',
      pipe?.network === 'aguas_negras' && pipe?.color === '#7c3aed' && pipe?.diameter === '4"' && pipe?.material === 'pvc',
      `${pipe?.network} · ${pipe?.color} · ${pipe?.diameter}`);
    const pipeNode = app.svg.querySelector(`.plan-element[data-id="${pipe.id}"]`);
    report.check('La tubería se dibuja con nodos y rótulo técnico',
      Boolean(pipeNode?.querySelector('polyline')) && Boolean(pipeNode?.querySelector('.mep-label'))
      && /AN Ø 4"/.test(pipeNode?.textContent || ''),
      pipeNode?.querySelector('.mep-label')?.textContent);

    // Inspector: cambiar red y diámetro.
    selectElement(app, pipe.id);
    const networkSelect = q(window, '[data-prop="network"]');
    report.check('El inspector muestra la red de la tubería seleccionada', networkSelect?.value === 'aguas_negras', networkSelect?.value);
    networkSelect.value = 'incendio';
    networkSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.renderNow();
    const pipeAfter = elementById(app, pipe.id);
    report.check('Cambiar de red aplica color y diámetro de referencia',
      pipeAfter.network === 'incendio' && pipeAfter.color === '#b71f2e' && pipeAfter.diameter === '2"' && pipeAfter.material === 'galvanizado',
      `${pipeAfter.network} · ${pipeAfter.color} · ${pipeAfter.diameter}`);

    // Tubería eléctrica.
    app.applyTool('conduit');
    const beforeConduit = app.model.design.elements.length;
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 200, 700));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 200, 700));
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 620, 700));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 620, 700));
    app.finishPipe();
    app.renderNow();
    const conduit = app.model.design.elements.at(-1);
    report.check('Trazar una tubería eléctrica',
      app.model.design.elements.length === beforeConduit + 1 && conduit?.type === 'conduit'
      && conduit.circuit === 'C1' && conduit.gauge === '12' && Number(conduit.phases) >= 1,
      `${conduit?.type} · ${conduit?.circuit} · ${conduit?.gauge} AWG`);
    selectElement(app, conduit.id);
    const conduitColorBefore = conduit.color;
    const circuitField = q(window, '[data-prop="circuit"]');
    circuitField.value = 'C7';
    circuitField.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.renderNow();
    report.check('El circuito se puede renombrar y colorea el tramo',
      elementById(app, conduit.id).circuit === 'C7' && elementById(app, conduit.id).color !== conduitColorBefore,
      elementById(app, conduit.id).color);

    // Equipo eléctrico con carga.
    const beforeDevice = app.model.design.elements.length;
    app.model.addElement('cad_elec_ac', { x: 700, y: 640, circuit: 'C7' });
    app.renderNow();
    const device = app.model.design.elements.at(-1);
    report.check('Los equipos eléctricos admiten circuito y carga',
      app.model.design.elements.length === beforeDevice + 1 && device.circuit === 'C7' && device.load === 3500,
      `${device?.circuit} · ${device?.load} VA`);

    // Resumen y panel de redes.
    const summary = app.computeNetworks();
    const circuit7 = summary.electrical.find((entry) => entry.code === 'C7');
    report.check('El resumen de redes agrupa la carga por circuito',
      summary.pipes >= 1 && summary.conduits >= 1 && circuit7?.deviceCount === 1 && circuit7?.loadVA === 3500,
      `${summary.pipes} tuberías · ${summary.electrical.map((entry) => entry.code).join(',')}`);
    report.check('El resumen calcula corriente, breaker y calibre',
      circuit7?.breaker === 20 && /^1[024]$/.test(circuit7?.gauge || '') && circuit7.current > 15,
      `${circuit7?.current?.toFixed(1)} A · ${circuit7?.breaker} A · ${circuit7?.gauge} AWG`);
    app.openDrawer('networks');
    await sleep(30);
    report.check('El panel de redes resume el piso',
      /Tuberías/.test(q(window, '[data-networks-content]')?.textContent || '')
      && /Circuito C7/.test(q(window, '[data-networks-content]')?.textContent || ''),
      q(window, '[data-networks-content] h3')?.textContent);
    report.check('El panel de redes repite que es un cálculo de referencia',
      /no sustituye/i.test(q(window, '[data-networks-content]')?.textContent || ''));
    app.closeDrawer();

    /* --------------------------- biblioteca y colocación --------------------------- */
    const signButton = q(window, '[data-open-library="sign"]');
    signButton?.click();
    app.library.open('sign');
    report.check('La biblioteca de señalización muestra las 389 señales', q(window, '[data-library-families]').textContent.includes('389'), q(window, '[data-library-families]').textContent.slice(0, 80));
    report.check('La biblioteca incluye la familia de servicios', q(window, '[data-library-families]').textContent.includes('Servicios'), q(window, '[data-library-families]').textContent.slice(0, 120));
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

    /* ------------------- señal de baño desde la biblioteca ------------------- */
    app.library.open('sign');
    app.library.family = 'services';
    app.library.renderChips();
    app.library.renderGrid();
    const serviceCard = qa(window, '[data-library-grid] .library-card').find((card) => card.dataset.key === 'SVC_WC_MEN');
    report.check('La familia de servicios muestra la señal de baño', Boolean(serviceCard), String(qa(window, '[data-library-grid] .library-card').length));
    app.library.select('SVC_WC_MEN');
    app.startPlacement('sign', 'SVC_WC_MEN');
    await sleep(20);
    report.check('Colocar una señal de servicios activa el modo colocación', app.placement?.type === 'sig_wc_men', String(app.placement?.type));
    pointer(window, app.svg, 'pointerdown', clientPoint(app, 980, 300));
    pointer(window, app.svg, 'pointerup', clientPoint(app, 980, 300));
    app.renderNow();
    const bathSign = app.model.design.elements.at(-1);
    report.check('La señal de baño se inserta y usa el color de servicios', bathSign.type === 'sig_wc_men' && bathSign.color === '#0f766e', `${bathSign.type} · ${bathSign.color}`);
    const bathNode = app.svg.querySelector(`.plan-element[data-id="${bathSign.id}"]`);
    report.check('La señal de baño se dibuja en el lienzo', Boolean(bathNode?.querySelector('svg rect')));
    app.model.select([bathSign.id]);
    app.renderNow();
    report.check('El inspector reconoce la señal de servicios', q(window, '[data-properties-panel]')?.textContent.includes('Baño de hombres'),
      q(window, '[data-properties-title]')?.textContent);
    app.model.clearSelection();
    app.applyTool('select');

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
    const dragStart = new window.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: { setData: () => {}, effectAllowed: '' },
    });
    qa(window, '[data-library-grid] .library-card')[0].dispatchEvent(dragStart);
    app.renderNow();
    report.check('Arrastrar una tarjeta libera el lienzo (el fondo del cajón no bloquea)',
      q(window, '[data-drawer-backdrop]').hidden === true && app.activeDrawer === 'library');
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
    app.openDrawer('library');
    app.library.open('cad');
    app.renderNow();
    const cancelDrag = new window.Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(cancelDrag, 'dataTransfer', { value: { setData: () => {}, effectAllowed: '' } });
    qa(window, '[data-library-grid] .library-card')[0].dispatchEvent(cancelDrag);
    q(window, '[data-library-grid]').dispatchEvent(new window.Event('dragend', { bubbles: true }));
    app.renderNow();
    report.check('Cancelar el arrastre restaura el fondo del cajón',
      q(window, '[data-drawer-backdrop]').hidden === false && app.activeDrawer === 'library');
    app.closeDrawer();
    app.applyTool('select');
    app.renderNow();

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
    report.check('El inspector pinta la paleta de 29 colores', qa(window, '[data-action="color"]').length === 29, String(qa(window, '[data-action="color"]').length));
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

    /* ---------------------------- pie de plano ---------------------------- */
    report.check('El arranque recibe los datos del pie de página',
      Array.isArray(app.boot.footer?.cells) && app.boot.footer.cells.length === 5
      && app.boot.footer.cells.map((cell) => cell.key).join(',') === 'position,route,exit,fire,meeting',
      (app.boot.footer?.cells || []).map((cell) => cell.key).join(','));
    q(window, '[data-open-drawer="footer"]').click();
    app.renderFooterPreview();
    const footerPreview = q(window, '[data-footer-preview] svg');
    report.check('El cajón del pie de plano muestra una vista previa real',
      app.activeDrawer === 'footer' && Boolean(footerPreview)
      && footerPreview.querySelectorAll('[data-footer-cell]').length === 5,
      `${footerPreview?.querySelectorAll('[data-footer-cell]').length} celdas`);
    report.check('La vista previa incluye los datos del proyecto y la nota de la aplicación',
      /Proyecto UI/.test(footerPreview?.textContent || '') && /Normia Planos CAD/.test(footerPreview?.textContent || '')
      && /GPL-3\.0/.test(footerPreview?.textContent || ''),
      (footerPreview?.textContent || '').replace(/\s+/g, ' ').slice(0, 110));
    report.check('El cajón lista las cinco celdas de orientación',
      qa(window, '[data-footer-cells] [data-footer-cell]').length === 5,
      String(qa(window, '[data-footer-cells] [data-footer-cell]').length));
    const footerExport = app.buildExportSvg();
    const footerGroup = footerExport.svg.querySelector('[data-footer-band]');
    report.check('El PNG incorpora el pie debajo del plano',
      Boolean(footerGroup) && footerExport.height > app.model.design.canvas.height
      && Number(footerExport.svg.getAttribute('height')) === footerExport.height,
      `alto ${Math.round(footerExport.height)} vs lienzo ${app.model.design.canvas.height}`);
    report.check('El pie exportado conserva las cinco celdas y las líneas de datos',
      footerExport.svg.querySelectorAll('[data-footer-cell]').length === 5
      && footerExport.svg.querySelectorAll('[data-footer-line]').length >= 4,
      `${footerExport.svg.querySelectorAll('[data-footer-cell]').length} celdas · ${footerExport.svg.querySelectorAll('[data-footer-line]').length} líneas`);
    app.closeDrawer();
    report.check('El cajón del pie se cierra sin dejar el fondo bloqueado',
      app.activeDrawer === null && !window.document.body.classList.contains('has-drawer'),
      String(app.activeDrawer));

    /* ------------------------ mano, superposiciones, inspector ------------------------ */
    app.model.clearSelection();
    app.applyTool('select');
    app.fit(true);
    app.renderNow();
    const beforeHand = app.model.design.elements.length;
    q(window, '[data-tool="hand"]').click();
    report.check('La barra lateral incluye la herramienta Mano', app.tool === 'hand' && q(window, '[data-stage-hint]').textContent.includes('Mano'), app.tool);
    report.check('La herramienta Mano muestra el cursor de agarre', app.svg.style.cursor === 'grab', app.svg.style.cursor);
    const panBefore = { x: app.view.panX, y: app.view.panY };
    drag(window, app.svg, clientPoint(app, 400, 300), clientPoint(app, 460, 350));
    app.renderNow();
    report.check('Arrastrar con la Mano desplaza el lienzo',
      Math.abs((app.view.panX - panBefore.x) - 60) <= 4 && Math.abs((app.view.panY - panBefore.y) - 50) <= 4,
      `${Math.round(app.view.panX - panBefore.x)},${Math.round(app.view.panY - panBefore.y)}`);
    report.check('La Mano no mueve ni crea elementos', app.model.design.elements.length === beforeHand && app.model.selection.size === 0,
      `${app.model.design.elements.length} elementos`);
    key(window, app.svg, 'h');
    report.check('El atajo H activa la Mano desde el teclado', app.tool === 'hand');
    key(window, app.svg, 'v');
    report.check('El atajo V vuelve a Seleccionar', app.tool === 'select' && app.svg.style.cursor === 'default', app.svg.style.cursor);

    q(window, '[data-tools-toggle]').click();
    report.check('La paleta «Todas las herramientas» se abre',
      q(window, '[data-tools-popover]').hidden === false && qa(window, '.tool-choice').length >= 14,
      `${qa(window, '.tool-choice').length} herramientas`);
    report.check('La paleta incluye la Mano y los atajos', Boolean(q(window, '.tool-choice[data-tool-choice="hand"]')) && q(window, '.tool-choice kbd')?.textContent.length > 0);
    q(window, '.tool-choice[data-tool-choice="hand"]').click();
    report.check('Elegir en la paleta activa la herramienta y cierra el panel',
      app.tool === 'hand' && q(window, '[data-tools-popover]').hidden === true && q(window, '[data-tools-label]').textContent === 'Mano',
      q(window, '[data-tools-label]').textContent);
    app.applyTool('select');
    app.fit(true);
    app.renderNow();

    const stackBottom = app.model.addElement('rect', { x: 900, y: 600, w: 140, h: 110, color: '#2563eb' });
    const stackTop = app.model.addElement('rect', { x: 920, y: 615, w: 140, h: 110, color: '#dc2626' });
    app.renderNow();
    app.model.select([stackTop.id]);
    const stackPoint = clientPoint(app, 960, 660);
    pointer(window, app.svg, 'pointerdown', stackPoint, { ctrlKey: true });
    app.renderNow();
    report.check('Ctrl + clic alcanza el elemento que está debajo',
      app.model.selection.size === 1 && app.model.selection.has(stackBottom.id), [...app.model.selection].join(','));
    const stackStatus = q(window, '[data-stack-status]');
    report.check('La barra de estado avisa de los elementos superpuestos',
      stackStatus.hidden === false && /2 superpuestos/.test(stackStatus.textContent), stackStatus.textContent);
    pointer(window, app.svg, 'pointerdown', stackPoint, { ctrlKey: true });
    app.renderNow();
    report.check('Ctrl + clic vuelve a subir al elemento superior', app.model.selection.has(stackTop.id));
    pointer(window, app.svg, 'pointerdown', stackPoint, { ctrlKey: true, shiftKey: true });
    app.renderNow();
    report.check('Ctrl + Shift + clic retrocede en la pila', app.model.selection.has(stackBottom.id));
    /* ---------------- desplazamiento del inspector y de la barra lateral ---------------- */
    const editorCss = fs.readFileSync(path.join(repoRoot, 'assets/css/editor.css'), 'utf8');
    const cssBlock = (selector) => {
      const index = editorCss.indexOf(selector + ' {');
      if (index < 0) return '';
      return editorCss.slice(index, editorCss.indexOf('}', index) + 1);
    };
    report.check('La fila del banco de trabajo queda acotada al alto de la ventana',
      /grid-template-rows:\s*minmax\(0,\s*1fr\)/.test(cssBlock('.editor-workbench'))
      && /overflow:\s*hidden/.test(cssBlock('.editor-workbench')),
      cssBlock('.editor-workbench').replace(/\s+/g, ' ').slice(0, 120));
    report.check('Los menús de la barra lateral se anclan a la ventana y no se recortan',
      /position:\s*fixed/.test(cssBlock('.rail-flyout'))
      && /overflow-y:\s*auto/.test(cssBlock('.rail')),
      cssBlock('.rail-flyout').replace(/\s+/g, ' ').slice(0, 100));
    report.check('La barra lateral hace su propio scroll y no estira la fila',
      /overflow-y:\s*auto/.test(cssBlock('.rail')) && /min-height:\s*0/.test(cssBlock('.rail')),
      cssBlock('.rail').replace(/\s+/g, ' ').slice(0, 120));
    report.check('El panel y su cuerpo están acotados para poder desplazarse',
      /min-height:\s*0/.test(cssBlock('.properties-panel'))
      && /overflow-y:\s*auto/.test(cssBlock('.properties-body'))
      && /min-height:\s*0/.test(cssBlock('.properties-body')),
      cssBlock('.properties-body').replace(/\s+/g, ' ').slice(0, 120));

    const railMenu = q(window, '[data-pipe-menu]');
    railMenu?.click();
    const railFlyout = q(window, '[data-pipe-flyout]');
    report.check('Al abrir el menú de la barra lateral se calcula su posición',
      Boolean(railFlyout) && railFlyout.hidden === false
      && /^\d+px$/.test(railFlyout.style.left) && /^\d+px$/.test(railFlyout.style.top),
      `${railFlyout?.style.left} · ${railFlyout?.style.top}`);
    q(window, '.rail')?.dispatchEvent(new window.Event('scroll'));
    report.check('Desplazar la barra lateral cierra sus menús',
      q(window, '[data-pipe-flyout]')?.hidden === true,
      String(q(window, '[data-pipe-flyout]')?.hidden));

    const inspectorBody = q(window, '[data-properties]');
    const propField = q(window, '[data-section="geometry"] [data-prop="x"]');
    inspectorBody.scrollTop = 260;
    propField?.focus?.();
    propField.value = '120';
    propField.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.renderNow();
    report.check('Editar una propiedad conserva el desplazamiento del inspector',
      q(window, '[data-properties]').scrollTop === 260,
      String(q(window, '[data-properties]').scrollTop));
    report.check('Editar una propiedad devuelve el foco al mismo campo',
      window.document.activeElement?.dataset?.prop === 'x',
      window.document.activeElement?.dataset?.prop || window.document.activeElement?.tagName);
    q(window, '[data-properties]').scrollTop = 0;
    app.model.clearSelection();
    app.renderNow();

    report.check('El inspector lista los elementos superpuestos',
      Boolean(q(window, '[data-section="stack"]')) && qa(window, '.stack-row').length === 2,
      `${qa(window, '.stack-row').length} filas`);
    q(window, '.stack-row:not(.is-current)')?.click();
    report.check('Elegir una fila de la pila cambia la selección', app.model.selection.has(stackTop.id));

    report.check('El inspector agrupa las propiedades en secciones plegables',
      qa(window, '[data-properties] [data-section]').length >= 5 && Boolean(q(window, '[data-section="geometry"] .section-head')),
      `${qa(window, '[data-properties] [data-section]').length} secciones`);
    report.check('La ficha del inspector ofrece acciones rápidas', qa(window, '.inspector-hero [data-action]').length === 3);
    const appearanceHead = q(window, '[data-section="appearance"] .section-head');
    appearanceHead.click();
    app.renderNow();
    const collapsedNow = q(window, '[data-section="appearance"]').classList.contains('is-collapsed');
    q(window, '[data-section="appearance"] .section-head').click();
    app.renderNow();
    report.check('Las secciones del inspector se pliegan y se despliegan',
      collapsedNow && !q(window, '[data-section="appearance"]').classList.contains('is-collapsed'));
    report.check('Los campos de geometría muestran la unidad del lienzo',
      q(window, '[data-section="geometry"] .num-unit')?.textContent === app.model.design.canvas.unit,
      q(window, '[data-section="geometry"] .num-unit')?.textContent);
    report.check('El inspector permite girar en pasos de 90°', qa(window, '[data-action="rotate"]').length === 2);
    q(window, '[data-action="rotate"][data-value="90"]').click();
    app.renderNow();
    report.check('Girar 90° actualiza la rotación del elemento', Math.round(elementById(app, stackTop.id).rotation) === 90, String(elementById(app, stackTop.id).rotation));
    q(window, '[data-action="rotate"][data-value="-90"]').click();
    app.renderNow();
    report.check('Girar −90° devuelve el elemento a su orientación', Math.round(elementById(app, stackTop.id).rotation) === 0, String(elementById(app, stackTop.id).rotation));

    app.model.select([stackBottom.id, stackTop.id]);
    app.model.deleteSelected();
    app.model.clearSelection();
    app.renderNow();
    report.check('La prueba de superposición limpia sus elementos', !app.model.design.elements.some((element) => element.id === stackTop.id || element.id === stackBottom.id));

    const rulersToggle = q(window, '[data-toggle="rulers"]');
    const rulerUse = rulersToggle?.querySelector('use');
    const rulerStart = rulerUse?.getAttribute('href');
    rulersToggle?.click();
    const rulerHidden = rulerUse?.getAttribute('href');
    rulersToggle?.click();
    report.check('El interruptor de reglas cambia de icono y de tooltip',
      rulerStart === '#i-ruler' && rulerHidden === '#i-ruler-slash'
      && rulerUse?.getAttribute('href') === '#i-ruler'
      && rulersToggle?.dataset.tooltip === 'Ocultar reglas',
      `${rulerStart} → ${rulerHidden} → ${rulerUse?.getAttribute('href')} · ${rulersToggle?.dataset.tooltip}`);

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
        const thumb = app.renderer.thumbnail(app.model.typeForSignCode(code));
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
    report.check('Los 389 pictogramas y 301 equipos se instancian sin errores', assetsOk === 690 && assetFailures.length === 0,
      `${assetsOk}/500 · ${assetFailures.slice(0, 3).join(', ')}`);

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

    /* --------------------- señal «Usted está aquí» en el catálogo --------------------- */
    report.check('El catálogo local incluye la señal «Usted está aquí»',
      app.catalogs.signs.SVC_AQUI?.name === 'Usted está aquí'
      && app.catalogs.signs.SVC_AQUI?.category === 'location'
      && app.catalogs.signColors?.location === '#1d4ed8',
      `${app.catalogs.signs.SVC_AQUI?.name} · ${app.catalogs.signs.SVC_AQUI?.category}`);

    /* ---------------------- cambio de señal desde el inspector ---------------------- */
    app.model.select([signElement.id]);
    app.renderNow();
    const swapButton = q(window, '[data-section="appearance"] [data-action="swap-sign"]');
    report.check('El inspector ofrece cambiar la señal desde Apariencia',
      Boolean(swapButton) && /Cambiar señal/.test(swapButton.textContent), swapButton?.textContent.trim());
    report.check('La apariencia muestra la miniatura de la señal actual',
      qa(window, '[data-section="appearance"] .sign-swap-thumb > svg').length === 1,
      String(qa(window, '[data-section="appearance"] .sign-swap-thumb > svg').length));
    const beforeSwap = { x: signElement.x, y: signElement.y, w: signElement.w, h: signElement.h, rotation: signElement.rotation };
    swapButton?.click();
    report.check('Cambiar señal abre la biblioteca en modo reemplazo',
      app.activeDrawer === 'library' && app.library.mode === 'replace'
      && q(window, '[data-library-title]').textContent.includes('Cambiar señal')
      && q(window, '[data-drawer="library"]')?.dataset.libraryMode === 'replace',
      `${app.activeDrawer} · ${app.library.mode} · ${q(window, '[data-library-title]').textContent}`);
    report.check('La señal actual queda resaltada en la biblioteca',
      q(window, '[data-library-grid] .library-card.is-current')?.dataset.key === 'E002'
      && /Señal actual/.test(q(window, '[data-library-grid] .library-card.is-current')?.textContent || ''),
      q(window, '[data-library-grid] .library-card.is-current')?.dataset.key);
    report.check('En modo reemplazo las tarjetas no se arrastran al plano',
      q(window, '[data-library-grid] .library-card')?.draggable === false);
    app.library.open('sign', { mode: 'replace', current: 'E002' });
    app.library.family = 'location';
    app.library.renderChips();
    app.library.renderGrid();
    report.check('La familia Ubicación agrupa la señal de posición',
      q(window, '[data-library-families]').textContent.includes('Ubicación')
      && qa(window, '[data-library-grid] .library-card').some((card) => card.dataset.key === 'SVC_AQUI'),
      String(qa(window, '[data-library-grid] .library-card').length));
    const aquiCard = qa(window, '[data-library-grid] .library-card').find((card) => card.dataset.key === 'SVC_AQUI');
    aquiCard?.click();
    report.check('La ficha cambia su acción a «Usar esta señal»',
      /Usar esta señal/.test(q(window, '[data-library-detail] [data-insert]')?.textContent || ''),
      q(window, '[data-library-detail] [data-insert]')?.textContent.trim());
    q(window, '[data-library-detail] [data-insert]')?.click();
    app.renderNow();
    const swapped = elementById(app, signElement.id);
    report.check('Elegir otra señal sustituye el pictograma sin mover el elemento',
      swapped.type === 'sig_aqui'
      && near(swapped.x, beforeSwap.x, 0.01) && near(swapped.y, beforeSwap.y, 0.01)
      && near(swapped.w, beforeSwap.w, 0.01) && near(swapped.h, beforeSwap.h, 0.01)
      && swapped.rotation === beforeSwap.rotation,
      `${swapped.type} · ${Math.round(swapped.x)},${Math.round(swapped.y)} · ${Math.round(swapped.w)}×${Math.round(swapped.h)}`);
    report.check('La señal nueva toma el color de su familia', swapped.color === '#1d4ed8', swapped.color);
    report.check('El cajón se cierra y la herramienta vuelve a seleccionar',
      app.activeDrawer === null && app.tool === 'select', `${app.activeDrawer} · ${app.tool}`);
    report.check('El inspector muestra la señal nueva',
      /Usted está aquí/.test(q(window, '[data-properties-title]').textContent)
      && /Usted está aquí/.test(q(window, '[data-section="appearance"] .sign-swap-copy')?.textContent || ''),
      q(window, '[data-properties-title]').textContent);
    app.model.undo();
    app.renderNow();
    const restoredSign = elementById(app, signElement.id);
    report.check('Deshacer devuelve la señal anterior',
      restoredSign.type === 'iso_e002' && restoredSign.color === '#237f52', `${restoredSign.type} · ${restoredSign.color}`);
    app.model.clearSelection();
    app.renderNow();
    report.check('Los elementos que no son señales no ofrecen cambiar de señal',
      (() => {
        const wallForSwap = app.model.design.elements.find((element) => element.type === 'wall');
        app.model.select([wallForSwap.id]);
        app.renderNow();
        const hasSwap = Boolean(q(window, '[data-section="appearance"] [data-action="swap-sign"]'));
        app.model.clearSelection();
        app.renderNow();
        return !hasSwap;
      })());

    /* ------------- selección con un clic y cambio de equipo (v1.0.9) ------------- */
    app.applyTool('select');
    app.model.clearSelection();
    app.renderNow();
    // El pictograma es un SVG incrustado que ignora el puntero: antes, hacer
    // clic dentro de él no encontraba nodo y abría la caja de selección.
    const signClick = clientPoint(app, signElement.x + 24, signElement.y + 24);
    pointer(window, app.svg, 'pointerdown', signClick);
    pointer(window, app.svg, 'pointerup', signClick);
    app.renderNow();
    report.check('Un clic sencillo selecciona un pictograma sin abrir la caja de selección',
      app.model.selection.size === 1 && app.model.selection.has(signElement.id), [...app.model.selection].join(','));
    pointer(window, app.svg, 'pointermove', signClick);
    report.check('El cursor avisa de que el objeto bajo el puntero es seleccionable',
      app.svg.style.cursor === 'move', app.svg.style.cursor);
    const emptyCorner = clientPoint(app, app.model.design.canvas.width - 6, app.model.design.canvas.height - 6);
    pointer(window, app.svg, 'pointermove', emptyCorner);
    report.check('El cursor vuelve a la flecha sobre el lienzo vacío', app.svg.style.cursor === 'default', app.svg.style.cursor);

    // Pasillo libre calculado sobre el plano: la prueba no depende de que una
    // coordenada fija siga vacía después de dibujar los demás elementos.
    const freeLane = (() => {
      const canvas = app.model.design.canvas;
      const offsets = [0, 20, 40, 60, 80, 100, 120, 140, 160];
      for (let y = canvas.height - 40; y >= 80; y -= 20) {
        for (let x = 80; x <= canvas.width - 240; x += 20) {
          if (offsets.every((dx) => app.model.hitStack({ x: x + dx, y }, { tolerance: 20 }).length === 0)) return { x, y };
        }
      }
      return { x: 80, y: canvas.height - 40 };
    })();
    const clickWall = app.model.addPath('wall', [{ x: freeLane.x, y: freeLane.y }, { x: freeLane.x + 160, y: freeLane.y }], { stroke: 6 });
    app.renderNow();
    app.model.clearSelection();
    app.renderNow();
    // 7 unidades por encima del eje: fuera del trazo pintado, dentro del alcance.
    const thinPoint = clientPoint(app, freeLane.x + 80, freeLane.y + 7);
    pointer(window, app.svg, 'pointerdown', thinPoint);
    pointer(window, app.svg, 'pointerup', thinPoint);
    app.renderNow();
    report.check('Un clic junto a un muro fino (sin acertar el trazo) lo selecciona',
      app.model.selection.size === 1 && app.model.selection.has(clickWall.id), [...app.model.selection].join(','));

    const gear = app.model.addElement('cad_forklift', { x: freeLane.x + 35, y: freeLane.y - 45 });
    app.renderNow();
    app.model.clearSelection();
    app.renderNow();
    const gearPoint = clientPoint(app, gear.x + gear.w / 2, gear.y + gear.h / 2);
    pointer(window, app.svg, 'pointerdown', gearPoint);
    pointer(window, app.svg, 'pointerup', gearPoint);
    app.renderNow();
    report.check('Un clic dentro de un equipo lo selecciona sin la caja de selección',
      app.model.selection.size === 1 && app.model.selection.has(gear.id), [...app.model.selection].join(','));
    report.check('El clic prefiere el equipo visible sobre el muro que queda debajo', app.model.selection.has(gear.id));
    pointer(window, app.svg, 'pointerdown', gearPoint, { ctrlKey: true });
    app.renderNow();
    report.check('Ctrl + clic baja al muro que hay debajo del equipo', app.model.selection.has(clickWall.id), [...app.model.selection].join(','));
    app.model.select([gear.id]);
    const wallOnlyPoint = clientPoint(app, freeLane.x + 145, freeLane.y + 5);
    pointer(window, app.svg, 'pointerdown', wallOnlyPoint, { shiftKey: true });
    pointer(window, app.svg, 'pointerup', wallOnlyPoint, { shiftKey: true });
    app.renderNow();
    report.check('Shift + clic añade otro objeto a la selección',
      app.model.selection.size === 2 && app.model.selection.has(gear.id) && app.model.selection.has(clickWall.id),
      [...app.model.selection].join(','));

    /* ------------------- cambio de equipo desde el inspector ------------------- */
    app.model.select([gear.id]);
    app.renderNow();
    report.check('Un equipo no ofrece cambiar de señal', !q(window, '[data-section="appearance"] [data-action="swap-sign"]'));
    const gearButton = q(window, '[data-section="appearance"] [data-action="swap-equipment"]');
    report.check('El inspector ofrece cambiar el equipo desde Apariencia',
      Boolean(gearButton) && /Cambiar equipo/.test(gearButton.textContent), gearButton?.textContent.trim());
    report.check('La apariencia muestra la miniatura y la familia del equipo actual',
      qa(window, '[data-section="appearance"] .equipment-swap .sign-swap-thumb > svg').length === 1
      && /Vehículos/.test(q(window, '[data-section="appearance"] .equipment-swap .sign-swap-copy')?.textContent || ''),
      q(window, '[data-section="appearance"] .equipment-swap .sign-swap-copy')?.textContent.trim());
    const beforeGear = { x: gear.x, y: gear.y, w: gear.w, h: gear.h, rotation: gear.rotation };
    gearButton?.click();
    report.check('Cambiar equipo abre la biblioteca de equipos en modo reemplazo',
      app.activeDrawer === 'library' && app.library.kind === 'cad' && app.library.mode === 'replace'
      && /Cambiar equipo/.test(q(window, '[data-library-title]').textContent)
      && q(window, '[data-drawer="library"]')?.dataset.libraryMode === 'replace',
      `${app.activeDrawer} · ${app.library.kind} · ${app.library.mode} · ${q(window, '[data-library-title]').textContent}`);
    const currentGear = q(window, '[data-library-grid] .library-card.is-current');
    report.check('El equipo actual queda resaltado en la biblioteca',
      currentGear?.dataset.key === 'cad_forklift' && /Equipo actual/.test(currentGear.textContent),
      `${currentGear?.dataset.key} · ${currentGear?.textContent.trim().slice(0, 60)}`);
    report.check('En modo reemplazo las tarjetas de equipo no se arrastran al plano',
      q(window, '[data-library-grid] .library-card')?.draggable === false);
    app.library.family = 'electrico';
    app.library.renderChips();
    app.library.renderGrid();
    const acCard = qa(window, '[data-library-grid] .library-card').find((card) => card.dataset.key === 'cad_elec_ac');
    report.check('La familia eléctrica muestra los equipos del catálogo', Boolean(acCard), String(qa(window, '[data-library-grid] .library-card').length));
    acCard?.click();
    report.check('La ficha cambia su acción a «Usar este equipo»',
      /Usar este equipo/.test(q(window, '[data-library-detail] [data-insert]')?.textContent || ''),
      q(window, '[data-library-detail] [data-insert]')?.textContent.trim());
    report.check('La ficha del equipo avisa de verificar dimensiones y escala en sitio',
      /verificar/i.test(q(window, '[data-library-detail]')?.textContent || '') && /escala/i.test(q(window, '[data-library-detail]')?.textContent || ''));
    q(window, '[data-library-detail] [data-insert]')?.click();
    app.renderNow();
    const swappedGear = elementById(app, gear.id);
    report.check('Elegir otro equipo lo sustituye sin moverlo de sitio',
      swappedGear.type === 'cad_elec_ac'
      && near(swappedGear.x, beforeGear.x, 0.01) && near(swappedGear.y, beforeGear.y, 0.01)
      && near(swappedGear.w, beforeGear.w, 0.01) && near(swappedGear.h, beforeGear.h, 0.01)
      && swappedGear.rotation === beforeGear.rotation,
      `${swappedGear.type} · ${Math.round(swappedGear.x)},${Math.round(swappedGear.y)} · ${Math.round(swappedGear.w)}×${Math.round(swappedGear.h)}`);
    report.check('El equipo nuevo toma el color de su familia', swappedGear.color === '#334155', swappedGear.color);
    report.check('El cajón se cierra y el inspector muestra el equipo nuevo',
      app.activeDrawer === null && app.tool === 'select'
      && /Aire acondicionado/.test(q(window, '[data-properties-title]').textContent)
      && /Aire acondicionado/.test(q(window, '[data-section="appearance"] .equipment-swap .sign-swap-copy')?.textContent || ''),
      q(window, '[data-properties-title]').textContent);
    app.model.undo();
    app.renderNow();
    const restoredGear = elementById(app, gear.id);
    report.check('Deshacer devuelve el equipo anterior y su color',
      restoredGear.type === 'cad_forklift' && restoredGear.color === '#ca8a04', `${restoredGear.type} · ${restoredGear.color}`);
    const circuitProbe = app.model.addElement('cad_elec_ac', { x: 60, y: 60, circuit: 'C7' });
    app.model.select([circuitProbe.id]);
    app.model.changeType('cad_elec_outlet');
    report.check('Cambiar entre equipos eléctricos conserva el circuito asignado',
      elementById(app, circuitProbe.id).type === 'cad_elec_outlet' && elementById(app, circuitProbe.id).circuit === 'C7',
      `${elementById(app, circuitProbe.id).type} · ${elementById(app, circuitProbe.id).circuit}`);
    app.model.select([circuitProbe.id]);
    app.model.deleteSelected();
    app.renderNow();
    app.model.clearSelection();
    app.model.select([clickWall.id]);
    app.renderNow();
    report.check('Los elementos que no son equipos no ofrecen cambiar de equipo',
      !q(window, '[data-section="appearance"] [data-action="swap-equipment"]'));
    app.model.clearSelection();
    app.applyTool('select');
    app.renderNow();

    /* ----------------------- redes guardadas en el servidor ----------------------- */
    app.model.addElement('cad_elec_ac', { x: 740, y: 660, circuit: 'C9', load: 4000 });
    await app.saveNow('Redes de prueba', { force: true });
    await sleep(500);
    const persisted = JSON.parse((await client.get(`api/floors/${floorId}/mep`, { accept: 'application/json' })).text);
    const circuit9 = (persisted.summary?.electrical || []).find((entry) => entry.code === 'C9');
    report.check('El servidor resume las redes guardadas',
      persisted.summary?.pipes >= 1 && persisted.summary?.conduits >= 1
      && circuit9?.loadVA === 4000 && circuit9?.breaker === 50
      && circuit9?.warnings?.some((message) => /Sin tramos/.test(message)),
      `${persisted.summary?.pipes} tuberías · ${(persisted.summary?.electrical || []).map((entry) => `${entry.code}:${entry.loadVA}VA/${entry.breaker}A`).join(' ')}`);

    /* ---------------------- auditor de planos y evacuación ---------------------- */
    const auditDoor = app.model.addElement('door', { x: 980, y: 300, label: 'Salida de prueba' });
    app.model.select([auditDoor.id]);
    app.renderNow();
    const exitSwitch = q(window, '[data-prop="isExit"]');
    report.check('El inspector ofrece la marca de salida de emergencia', Boolean(exitSwitch));
    exitSwitch.click();
    app.renderNow();
    report.check('Marcar la puerta como salida actualiza el modelo', elementById(app, auditDoor.id)?.isExit === true,
      String(elementById(app, auditDoor.id)?.isExit));

    q(window, '[data-open-drawer="settings"]').click();
    const occupancyField = q(window, '[data-drawer="settings"] input[name="occupancy"]');
    report.check('Los ajustes del piso piden la ocupación declarada',
      Boolean(occupancyField) && /Ocupación declarada/.test(q(window, '[data-drawer="settings"]')?.textContent || ''));
    occupancyField.value = '40';
    q(window, '[data-canvas-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    app.closeDrawer();
    report.check('La ocupación declarada se guarda en el lienzo', app.model.design.canvas.occupancy === 40,
      String(app.model.design.canvas.occupancy));

    await app.saveNow('Plano para revisión', { force: true });
    await sleep(400);
    const savedAuditFloor = JSON.parse((await client.get(`api/floors/${floorId}`, { accept: 'application/json' })).text);
    const savedAuditDoor = (savedAuditFloor.design?.elements || []).find((element) => element.id === auditDoor.id);
    report.check('El servidor conserva la salida marcada y la ocupación',
      savedAuditDoor?.isExit === true && savedAuditFloor.design?.canvas?.occupancy === 40,
      `salida ${savedAuditDoor?.isExit} · ${savedAuditFloor.design?.canvas?.occupancy} personas`);

    report.check('El arranque recibe la dirección del auditor', decodeURIComponent(String(app.boot.auditUrl || '')).includes('/audit'), app.boot.auditUrl);
    report.check('El cajón de revisión avisa de que no es un dictamen',
      /no es un dictamen/i.test(q(window, '[data-drawer="audit"]')?.textContent || ''));
    const reportHref = decodeURIComponent(q(window, '[data-audit-report]')?.getAttribute('href') || '');
    report.check('El cajón enlaza al informe imprimible', /floors\/\d+\/audit/.test(reportHref), reportHref);
    q(window, '[data-open-drawer="audit"]').click();
    report.check('La barra lateral abre el cajón de revisión', app.activeDrawer === 'audit' && app.audit !== null, `cajón ${app.activeDrawer} · auditor ${Boolean(app.audit)} · oculto ${q(window, '[data-drawer="audit"]')?.hidden}`);
    await waitFor(() => q(window, '[data-drawer="audit"] .audit-stat'), 20000);
    const auditReport = app.audit.report;
    report.check('La revisión mide salidas, recorrido y tiempo de evacuación',
      auditReport?.exits?.count >= 1 && Boolean(auditReport.travel) && Boolean(auditReport.egress)
      && qa(window, '[data-drawer="audit"] .audit-stat').length === 4,
      `${auditReport?.exits?.count} salidas · ${auditReport?.travel?.longestM} m · ${auditReport?.egress?.estimatedTimeS} s`);
    report.check('El cajón muestra la medición y el listado de hallazgos',
      /Medición de evacuación/.test(q(window, '[data-drawer="audit"]')?.textContent || '')
      && qa(window, '[data-drawer="audit"] .audit-finding').length === (auditReport?.findings || []).length,
      `${(auditReport?.findings || []).length} hallazgos`);
    const totalUrgent = (auditReport?.counts?.high || 0) + (auditReport?.counts?.medium || 0);
    const auditBadge = q(window, '[data-audit-count]');
    report.check('El contador de la barra lateral refleja los hallazgos urgentes',
      auditBadge.hidden === (totalUrgent === 0) && (totalUrgent === 0 || auditBadge.textContent === String(totalUrgent)),
      totalUrgent === 0 ? 'sin urgentes' : `${auditBadge.textContent} urgentes`);
    const filterKey = ['high', 'medium', 'low', 'info'].find((key) => (auditReport?.counts?.[key] || 0) > 0) || 'high';
    q(window, `[data-audit-filter="${filterKey}"]`).click();
    const filteredRows = qa(window, '[data-drawer="audit"] .audit-finding');
    report.check('El filtro por severidad deja solo los hallazgos de esa categoría',
      filteredRows.length === (auditReport?.counts?.[filterKey] || 0)
      && filteredRows.every((row) => row.classList.contains(`audit-sev-${filterKey}`)),
      `${filterKey}: ${filteredRows.length} visibles de ${auditReport?.counts?.[filterKey] || 0}`);
    q(window, '[data-audit-filter="all"]').click();
    report.check('El filtro «Todos» recupera el listado completo',
      qa(window, '[data-drawer="audit"] .audit-finding').length === (auditReport?.findings || []).length);
    const locate = qa(window, '[data-audit-locate]').find((button) => (button.dataset.auditElements || '').length > 0);
    if (locate) {
      locate.click();
      await sleep(20);
      const located = (locate.dataset.auditElements || '').split(',').filter(Boolean);
      report.check('«Ver en el plano» selecciona el elemento del hallazgo',
        located.some((id) => app.model.selection.has(id)) || /Hallazgo en el plano|Punto del hallazgo/.test(toastText(window)),
        located.join(','));
    } else {
      report.check('«Ver en el plano» disponible para los hallazgos con ubicación', true, 'sin hallazgos con elementos');
    }
    q(window, '[data-drawer="audit"] [data-close-drawer]').click();
    report.check('El cajón de revisión se cierra', app.activeDrawer === null);
    await app.saveNow('Guardado posterior a la revisión', { force: true });
    await sleep(300);
    report.check('Guardar descarta el informe anterior y oculta el contador',
      app.audit.report === null && q(window, '[data-audit-count]').hidden === true
      && /cambió/.test(q(window, '[data-audit-content]')?.textContent || ''),
      q(window, '[data-audit-content]')?.textContent?.slice(0, 60));
    app.model.clearSelection();
    app.applyTool('select');
    app.renderNow();

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
