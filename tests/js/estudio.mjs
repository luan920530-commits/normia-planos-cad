/*
 * Pruebas del **modo estudio**: el editor suelto que viaja en la edición de
 * escritorio «solo editor».
 *
 * Lo que se comprueba, en orden:
 *   1. la página abre en una instalación **sin base de datos** (sin instalar);
 *   2. no hay portada, ni conmutador de pisos, ni versiones: solo el editor;
 *   3. el editor arranca en JSDOM con un plano en blanco y sin errores;
 *   4. el puente de archivos guarda, abre y avisa al proceso principal;
 *   5. soltar un plano sobre la ventana pide abrirlo (y solo un .json);
 *   6. el plano en curso llega al auditor, al informe, a la impresión y al SVG;
 *   7. el JSON que se descarga es el sobre oficial, importable sin conversiones;
 *   8. renombrar el plano y los nombres con acentos llegan al informe y al archivo;
 *   9. los catálogos se sirven sin sesión (la biblioteca del editor).
 */
import fs from 'node:fs';
import path from 'node:path';
import { startApp, repoRoot } from '../php/harness.mjs';
import { openEditor, closeEditor, waitFor, key, makeReporter } from './boot.mjs';

const VERSION = process.argv[2] || '8.3';
const report = makeReporter(`Estudio/PHP ${VERSION}`);

const q = (window, selector) => window.document.querySelector(selector);
const estudioSource = fs.readFileSync(path.join(repoRoot, 'assets/js/editor/study.js'), 'utf8');

const app = await startApp(VERSION);
try {
  /* ------------------- 1 · abre sin instalar la aplicación ------------------- */
  const page = await app.client.get('estudio', { accept: 'text/html' });
  report.check('El modo estudio abre sin instalar la base de datos', page.status === 200, `${page.status} · ${page.text.length} bytes`);
  const html = page.text;
  report.check('La página no tiene conmutador de pisos ni botón de versiones',
    !html.includes('floor-switcher') && !html.includes('data-open-drawer="versions"'),
    `${(html.match(/floor-switcher/g) || []).length} conmutadores`);
  report.check('La barra dice que es el editor suelto', /study-chip/.test(html) && /Estudio<\/span>/.test(html));
  report.check('La página carga el puente de archivos del estudio', /js\/editor\/study\.js/.test(html));
  report.check('El arranque del editor se declara en modo estudio', /study&quot;:true/.test(html), 'boot.study');
  const htmlPlano = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  report.check('El plano en blanco es A4 horizontal a 1:100', /"width":1123/.test(htmlPlano) && /"scale":"1:100"/.test(htmlPlano),
    (htmlPlano.match(/"width":[0-9]+,"height":[0-9]+/) || [''])[0]);
  // El test usa las mismas rutas que el editor, con el token que sirve la
  // página: así se comprueba el servidor tal como lo ve el navegador.
  app.client.csrf = (htmlPlano.match(/"csrf":"([^"]+)"/) || [])[1] || '';

  report.check('Los cajones hablan del plano, no de un piso de proyecto',
    htmlPlano.includes('Ajustes del plano') && !htmlPlano.includes('Ajustes del piso')
    && /datos guardados del plano en curso/.test(htmlPlano),
    `${(htmlPlano.match(/Ajustes del (plano|piso)/g) || []).join(' · ')}`);

  /* ------------------- 2 · catálogos sin sesión ni instalación ------------------- */
  const signs = await app.client.get('catalogs/signs', { accept: 'application/json' });
  const cad = await app.client.get('catalogs/cad', { accept: 'application/json' });
  report.check('La biblioteca de señales se sirve sin sesión', signs.status === 200 && JSON.parse(signs.text).signs, `${signs.status} · ${signs.text.length} bytes`);
  report.check('La biblioteca de objetos CAD se sirve sin sesión', cad.status === 200 && JSON.parse(cad.text).objects, `${cad.status} · ${cad.text.length} bytes`);

  /* --------------------------- 3 · el editor arranca --------------------------- */
  const { window, app: editor } = await openEditor(app.client, 'estudio');
  report.check('El editor del estudio arranca con el plano en blanco',
    editor.boot.study === true && editor.model.design.elements.length === 0,
    `${editor.model.design.elements.length} elementos · ${editor.model.design.canvas.width}×${editor.model.design.canvas.height}`);
  report.check('Sin autoguardado: en el estudio el archivo manda', editor.store.autosaveTimer === null);

  /* -------------------- 4 · el puente de archivos de Electron -------------------- */
  const escritos = [];
  const abiertos = [];
  const titulos = [];
  const estados = [];
  const soltados = [];
  let comando = null;
  window.NormiaEstudio = {
    guardar: async (payload) => {
      escritos.push({ ...payload, via: 'guardar' });
      return { ok: true, path: '/tmp/bodega.json', name: 'bodega.json' };
    },
    guardarComo: async (payload) => {
      escritos.push({ ...payload, via: 'guardar-como' });
      return { ok: true, path: '/tmp/bodega.json', name: 'bodega.json' };
    },
    abrir: async () => {
      abiertos.push(true);
      return {
        ok: true,
        path: '/tmp/planta.json',
        name: 'Planta de prueba',
        design: {
          format: 5,
          canvas: { width: 1400, height: 900, grid: 20, unit: 'cm', scale: '1:100', background: '#ffffff' },
          layers: [{ id: 'capa_planta', name: 'Planta', visible: true, locked: false }],
          elements: [
            { id: 'muro_prueba', type: 'wall', x: 200, y: 200, w: 400, h: 16, points: [{ x: 0, y: 8 }, { x: 400, y: 8 }], layerId: 'capa_planta' },
          ],
          groups: [],
        },
      };
    },
    titulo: (payload) => titulos.push(payload),
    estado: (payload) => estados.push(payload),
    rutaDeArchivo: (file) => `/tmp/${file?.name || 'soltado.json'}`,
    soltar: (payload) => soltados.push(payload),
    alComando: (callback) => { comando = callback; },
  };
  window.eval(`${estudioSource}\n//# sourceURL=js/editor/study.js`);
  await waitFor(() => window.NormiaStud || null, 8000);
  report.check('El puente del estudio se engancha al editor', Boolean(window.NormiaStud) && typeof window.NormiaEstudioUI?.guardar === 'function');
  report.check('La ventana recibe el título y el estado del documento',
    titulos.length > 0 && titulos[0].name.includes('Plano sin título'), titulos[0]?.name || 'sin título');

  /* Dibujar algo real con la pluma antes de guardar. */
  editor.applyTool('wall');
  const click = (x, y) => {
    const rect = editor.svg.getBoundingClientRect();
    const point = { clientX: rect.left + editor.view.panX + x * editor.view.zoom, clientY: rect.top + editor.view.panY + y * editor.view.zoom };
    for (const type of ['pointerdown', 'pointerup']) {
      editor.svg.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...point }));
    }
  };
  click(300, 300);
  click(700, 300);
  key(window, window.document.body, 'Enter');
  editor.renderNow();
  report.check('Se dibuja en el estudio como en el editor completo', editor.model.design.elements.length === 1,
    `${editor.model.design.elements.length} elementos`);

  const guardado = await window.NormiaStud.guardar();
  report.check('El primer guardado pregunta dónde guardar y escribe el archivo',
    guardado === true && escritos.length === 1 && escritos[0].via === 'guardar-como' && escritos[0].design?.elements?.length === 1,
    `${escritos.length} escrituras · ${escritos[0]?.via || 'sin puente'}`);
  report.check('El archivo recibe el plano que está en el lienzo',
    escritos[0]?.design?.elements?.length === 1, `${escritos[0]?.design?.elements?.length ?? 0} elementos`);
  report.check('Guardar deja el plano sin cambios pendientes', editor.model.isDirty() === false);

  const abierto = await window.NormiaStud.abrir();
  report.check('Abrir pide el archivo al proceso principal', abiertos.length === 1 && abierto === undefined);
  report.check('El plano abierto reemplaza al del lienzo',
    editor.model.design.elements.length === 1 && editor.model.design.elements[0].id === 'muro_prueba'
    && editor.model.design.canvas.width === 1400,
    `${editor.model.design.elements[0]?.id} · ${editor.model.design.canvas.width}`);
  report.check('El nombre del archivo pasa a la barra y al título',
    q(window, '[data-floor-label]')?.textContent === 'Planta de prueba' && window.document.title.includes('Planta de prueba'),
    q(window, '[data-floor-label]')?.textContent || '');

  if (comando) comando('guardar');
  await waitFor(() => escritos.length >= 2, 4000);
  report.check('El menú nativo guarda por la misma puerta', escritos.length === 2 && escritos[1].via === 'guardar'
    && escritos[1].path === '/tmp/planta.json',
    `${escritos.length} escrituras · ${escritos[1]?.path || 'sin ruta'}`);

  /* ------------------- 5 · soltar un plano sobre la ventana ------------------- */
  const drop = (files, types = ['Files']) => {
    const event = new window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files, types } });
    window.dispatchEvent(event);
    return event;
  };
  const soltarPlano = drop([new window.File(['{}'], 'planta.json', { type: 'application/json' })]);
  report.check('Soltar un plano .json pide abrirlo al proceso principal',
    soltados.length === 1 && soltados[0].path === '/tmp/planta.json' && soltarPlano.defaultPrevented,
    `${soltados.length} soltados · ${soltados[0]?.path || 'sin ruta'}`);
  const soltarTexto = drop([new window.File(['hola'], 'notas.txt', { type: 'text/plain' })]);
  // La ventana no debe navegar al archivo soltado, y tampoco abrirlo como plano.
  report.check('Soltar otra cosa no abre nada y la ventana no navega',
    soltados.length === 1 && soltarTexto.defaultPrevented, `${soltados.length} soltados`);
  drop([new window.File(['{}'], 'objeto.json', { type: 'application/json' })], ['Files', 'application/x-normia-resource']);
  report.check('Un arrastre interno del editor no se confunde con un archivo',
    soltados.length === 1, `${soltados.length} soltados`);

  /* ------------------ 6 · el plano llega al auditor y al informe ------------------ */
  await window.NormiaStud.sync();
  const auditoria = await app.client.get('estudio/auditoria', { accept: 'application/json' });
  let auditoriaData = {};
  try { auditoriaData = JSON.parse(auditoria.text); } catch { auditoriaData = {}; }
  const errorPhp = (() => {
    try {
      return fs.readFileSync(path.join(app.target, 'storage', 'last-error.log'), 'utf8').split('\n')[0];
    } catch { return ''; }
  })();
  report.check('El auditor revisa el plano en curso sin base de datos',
    auditoria.status === 200 && auditoriaData.ok === true && Boolean(auditoriaData.report?.criteria),
    `${auditoria.status} · ${auditoriaData.report?.findings?.length ?? 0} hallazgos · ${auditoria.text.slice(0, 160)}${errorPhp ? ` · ${errorPhp.slice(0, 120)}` : ''}`);
  report.check('El auditor avisa de que es una revisión de referencia',
    /no es un dictamen/i.test(String(auditoriaData.notice || '')), String(auditoriaData.notice || '').slice(0, 60));

  const informe = await app.client.get('estudio/informe', { accept: 'text/html' });
  report.check('El informe se genera con el nombre del plano',
    informe.status === 200 && /Planta de prueba/.test(informe.text), `${informe.status} · ${informe.text.length} bytes`);
  const impresion = await app.client.get('estudio/imprimir', { accept: 'text/html' });
  report.check('La impresión sale con la hoja y la escala',
    impresion.status === 200 && /A4/.test(impresion.text) && /<svg/i.test(impresion.text), `${impresion.status} · ${impresion.text.length} bytes`);
  const svg = await app.client.get('estudio/export/svg', { accept: 'image/svg+xml' });
  report.check('El SVG se exporta con escala física', svg.status === 200 && /<svg/i.test(svg.text) && /mm/.test(svg.text), `${svg.type} · ${svg.text.length} bytes`);

  /* ------------------- 7 · el JSON es el sobre oficial e importable ------------------- */
  const json = await app.client.get('estudio/export/json', { accept: 'application/json' });
  let sobre = {};
  try { sobre = JSON.parse(json.text); } catch { sobre = {}; }
  report.check('El JSON del estudio es el sobre oficial de Normia',
    sobre.application === 'normia-planos-cad' && sobre.format === 'normia-plan' && sobre.schema_version === 3,
    `${sobre.application || 'sin aplicación'} · ${sobre.schema_version || 'sin esquema'}`);
  report.check('El sobre lleva el plano y su nombre', sobre.design?.elements?.length === 1 && sobre.project?.name === 'Planta de prueba',
    `${sobre.design?.elements?.length ?? 0} elementos · ${sobre.project?.name || ''}`);

  const ruta = path.join(app.target, 'storage', 'prueba-estudio.json');
  fs.writeFileSync(ruta, json.text);
  const importado = await app.run(`
$resultado = App\\Services\\DesignImporter::parse((string) file_get_contents(BASE_PATH . '/storage/prueba-estudio.json'));
echo json_encode([
    'elements' => count($resultado['design']['elements']),
    'project' => (string) ($resultado['project']['name'] ?? ''),
    'canvas' => (int) $resultado['design']['canvas']['width'],
]);
`);
  let datos = {};
  try { datos = JSON.parse(importado.text || '{}'); } catch { datos = {}; }
  report.check('El archivo del estudio se importa en la edición completa sin conversiones',
    datos.elements === 1 && datos.project === 'Planta de prueba' && datos.canvas === 1400,
    `${datos.elements ?? '?'} elementos · ${datos.canvas ?? '?'}`);
  fs.rmSync(ruta, { force: true });

  /* -------------- 8 · renombrar y nombres con acentos en el archivo -------------- */
  const renombrado = await app.client.postJson('estudio/nombre', { name: 'Sótano · Diseño' });
  let nombreNuevo = {};
  try { nombreNuevo = renombrado.json(); } catch { nombreNuevo = {}; }
  report.check('Renombrar desde Ajustes cambia el nombre del plano en curso',
    renombrado.status === 200 && nombreNuevo.ok === true && nombreNuevo.name === 'Sótano · Diseño',
    `${renombrado.status} · ${nombreNuevo.name || renombrado.text.slice(0, 80)}`);

  const conAcento = await app.client.get('estudio/export/json', { accept: 'application/json' });
  const disposicion = String([].concat(conAcento.headers['content-disposition'] || '')[0] || '');
  const nombreInforme = await app.client.get('estudio/informe', { accept: 'text/html' });
  report.check('El nombre con acentos llega al informe y al archivo sin perder letras',
    /Sótano · Diseño/.test(nombreInforme.text) && /filename="sotano-diseno\.json"/.test(disposicion),
    disposicion || 'sin nombre de archivo');

  report.check('Sin errores de JavaScript durante la sesión del estudio',
    window.__errors.length === 0, window.__errors.slice(0, 2).join(' | '));
  closeEditor(window);
} finally {
  await app.close();
}

report.summary();
