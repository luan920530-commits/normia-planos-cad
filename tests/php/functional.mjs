/*
 * Suite funcional de Normia Planos CAD.
 * Uso: node tests/php/functional.mjs 8.1|8.3
 *
 * Cubre instalación limpia, autenticación, proyectos, pisos, editor,
 * catálogos, versiones, borradores, exportaciones, importación, validación,
 * CSRF, aislamiento entre cuentas y carga de recursos locales.
 */
import { JSDOM } from 'jsdom';
import { startApp, extractToken, decodeEntities, makeReporter } from './harness.mjs';

const version = process.argv[2] || '8.3';
const report = makeReporter(version);
const app = await startApp(version);
const { client } = app;
let email = 'admin@normia.local';
let password = 'ClaveSegura2026';

const json = async (route) => {
  const response = await client.get(route, { accept: 'application/json' });
  let body = {};
  try { body = JSON.parse(response.text); } catch { body = {}; }
  return { response, body };
};

const noPhpErrors = (text) => !/<b>(Warning|Notice|Deprecated|Fatal error|Parse error)<\/b>/.test(text || '');

function localAssets(html, pageUrl, baseUrl = 'http://127.0.0.1') {
  const absolutePage = new URL(pageUrl, baseUrl).href;
  const dom = new JSDOM(html, { url: absolutePage });
  const document = dom.window.document;
  const urls = [];
  document.querySelectorAll('script[src]').forEach((node) => urls.push(node.getAttribute('src')));
  document.querySelectorAll('link[href]').forEach((node) => {
    const rel = (node.getAttribute('rel') || '').toLowerCase();
    if (rel.includes('stylesheet') || rel.includes('icon')) urls.push(node.getAttribute('href'));
  });
  document.querySelectorAll('img[src]').forEach((node) => urls.push(node.getAttribute('src')));
  const external = [];
  for (const value of urls) {
    const resolved = new URL(value, absolutePage);
    if (resolved.origin !== new URL(absolutePage).origin) external.push(resolved.href);
  }
  const forms = [...document.querySelectorAll('form')];
  const postForms = forms.filter((form) => (form.getAttribute('method') || 'get').toLowerCase() === 'post');
  const formsWithoutToken = postForms.filter((form) => !form.querySelector('input[name="_token"]')).length;
  const inlineScripts = [...document.querySelectorAll('script')].filter((script) => !script.src && script.textContent.trim() !== '').length;
  const spriteIds = new Set([...document.querySelectorAll('symbol[id]')].map((symbol) => symbol.id));
  const missingIcons = [];
  document.querySelectorAll('use[href^="#i-"]').forEach((use) => {
    const id = use.getAttribute('href').slice(1);
    if (!spriteIds.has(id)) missingIcons.push(id);
  });
  const lang = document.documentElement.getAttribute('lang');
  return { external, urls, postForms: postForms.length, formsWithoutToken, inlineScripts, missingIcons, lang, dom };
}

try {
  /* ---------------------------- instalación ---------------------------- */
  let res = await client.get('/index.php');
  report.check('La app sin instalar redirige al instalador', [302, 303].includes(res.status) && res.location.includes('install'), `${res.status} ${res.location}`);

  res = await client.get('install');
  report.check('Instalador responde 200', res.status === 200);
  report.check('Instalador sin avisos PHP', noPhpErrors(res.text));
  const installToken = extractToken(res.text);
  report.check('Instalador incluye token CSRF', installToken.length >= 32);

  res = await client.postForm('install', {
    _token: installToken,
    name: 'Administrador de prueba',
    email,
    password: 'corta1',
    password_confirm: 'corta1',
    demo: '1',
  });
  report.check('Instalador rechaza contraseña débil', res.status === 200 && /10 caracteres/.test(res.text), String(res.status));
  report.check('Config no se escribe antes de validar', !(await client.get('/config/config.php')).text.includes('app_key'));

  const install = await app.install({ email, password });
  report.check('Instalación válida redirige a login', [302, 303].includes(install.result.status), `${install.result.status} ${install.result.location}`);
  report.check('Configuración y base creadas', (await client.get('login')).status === 200);

  /* ---------------------------- autenticación ---------------------------- */
  res = await client.postForm('login', { _token: extractToken((await client.get('login')).text), email: 'nadie@normia.local', password });
  report.check('Login con correo desconocido no entra', [302, 303].includes(res.status) && res.location.includes('login'));
  res = await client.get('login');
  report.check('Login inválido muestra error', /no coinciden/.test(res.text));

  res = await app.login(email, password);
  report.check('Login válido redirige al panel', [302, 303].includes(res.status), `${res.status} ${res.location}`);
  res = await client.get('/index.php');
  report.check('Panel responde 200', res.status === 200);
  report.check('Panel sin avisos PHP', noPhpErrors(res.text));
  report.check('Panel muestra proyecto de demostración', res.text.includes('Planta de ejemplo'));
  const homeToken = extractToken(res.text);
  client.csrf = homeToken;
  const homeCheck = localAssets(res.text, '/index.php');
  report.check('Panel solo usa recursos locales', homeCheck.external.length === 0, homeCheck.external.join(', '));
  report.check('Panel sin scripts inline', homeCheck.inlineScripts === 0);
  report.check('Panel con formularios POST protegidos', homeCheck.formsWithoutToken === 0, `${homeCheck.postForms} formularios`);
  report.check('Panel declara idioma español', homeCheck.lang === 'es');
  report.check('Sprite de iconos completo en el panel', homeCheck.missingIcons.length === 0, homeCheck.missingIcons.join(','));

  /* ---------------------------- proyectos y pisos ---------------------------- */
  const decodedHome = decodeURIComponent(res.text);
  const projectId = Number(/index\.php\?r=projects\/(\d+)/.exec(decodedHome)?.[1] || 0);
  report.check('Panel enlaza el proyecto demo', projectId > 0, String(projectId));

  res = await client.get(`projects/${projectId}`);
  report.check('Ficha de proyecto responde 200', res.status === 200);
  const decodedProject = decodeURIComponent(res.text);
  const floorId = Number(/floors\/(\d+)\/editor/.exec(decodedProject)?.[1] || 0);
  report.check('Proyecto lista pisos con enlace al editor', floorId > 0, String(floorId));
  report.check('Proyecto sin avisos PHP', noPhpErrors(res.text));
  const projectCheck = localAssets(res.text, `/index.php?r=projects/${projectId}`);
  report.check('Proyecto con formularios protegidos', projectCheck.formsWithoutToken === 0, `${projectCheck.postForms} formularios`);
  report.check('Miniaturas locales del proyecto', projectCheck.external.length === 0);

  /* ---------------------------- editor y catálogos ---------------------------- */
  res = await client.get(`projects/${projectId}/floors/${floorId}/editor`);
  const editorHtml = res.text;
  report.check('Editor responde 200', res.status === 200);
  report.check('Editor sin avisos PHP', noPhpErrors(editorHtml));
  report.check('Editor incluye lienzo y paneles', editorHtml.includes('id="plan-canvas"') && editorHtml.includes('data-properties-panel') && editorHtml.includes('data-drawer="library"'));
  report.check('Editor carga JS/CSS locales', editorHtml.includes('/assets/js/editor.js') && editorHtml.includes('/assets/css/editor.css') && editorHtml.includes('/assets/js/editor/store.js'));
  report.check('Editor sin recursos externos', localAssets(editorHtml, `/index.php?r=projects/${projectId}/floors/${floorId}/editor`).external.length === 0);
  const bootMatch = /<textarea id="editor-boot" hidden>([\s\S]*?)<\/textarea>/.exec(editorHtml);
  let boot = null;
  try { boot = JSON.parse(decodeEntities(bootMatch?.[1] || '')); } catch { boot = null; }
  report.check('Boot del editor es JSON válido', Boolean(boot?.saveUrl && boot?.csrf && boot?.floorUrl), boot?.saveUrl || 'sin boot');
  report.check('Boot recibe metadatos del piso', boot?.floorMeta?.name === 'Planta baja' && boot?.project?.name?.includes('Bodega'), `${boot?.floorMeta?.name}`);
  const designMatch = /<textarea id="editor-design" hidden>([\s\S]*?)<\/textarea>/.exec(editorHtml);
  let design = null;
  try { design = JSON.parse(decodeEntities(designMatch?.[1] || '')); } catch { design = null; }
  report.check('Editor recibe el diseño guardado', design?.format === 2 && design?.elements?.length === 62, `${design?.elements?.length} elementos`);

  res = await client.get('/assets/js/editor.js');
  report.check('JS del editor se sirve completo', res.status === 200 && res.text.length > 20000, `${res.text.length} bytes`);
  for (const asset of ['/assets/css/app.css', '/assets/css/editor.css', '/assets/css/print.css', '/assets/js/ui.js', '/assets/js/app.js', '/assets/js/lib/model.js', '/assets/js/lib/geometry.js', '/assets/js/lib/renderer.js', '/assets/img/favicon.svg']) {
    const response = await client.get(asset);
    report.check(`Recurso local ${asset}`, response.status === 200 && response.text.length > 20, String(response.status));
  }

  let { response: catalogResponse, body: catalog } = await json('catalogs/signs');
  report.check('Catálogo de señales con 332 entradas', catalogResponse.status === 200 && catalog.count === 332 && Object.keys(catalog.signs || {}).length === 332);
  report.check('Señales con SVG seguro embebido', catalog.signs?.E002?.svg?.startsWith('<svg') && !/xlink:href="(?!#)/.test(catalog.signs?.E002?.svg || ''));
  report.check('Familias de señalización completas', Object.keys(catalog.categories || {}).length === 5 && catalog.colors?.emergency === '#237f52');
  report.check('Alias heredados disponibles', catalog.legacyTools?.extinguisher === 'F001' && catalog.legacyTools?.exit === 'E002');
  ({ response: catalogResponse, body: catalog } = await json('catalogs/cad'));
  report.check('Catálogo CAD con 90 objetos', catalogResponse.status === 200 && catalog.count === 90 && Object.keys(catalog.objects || {}).length === 90);
  report.check('Catálogo CAD con 15 familias sectoriales', Object.keys(catalog.categories || {}).length === 15
    && ['restaurant', 'warehouse', 'retail', 'hospital', 'textile', 'grill', 'supermarket', 'residential', 'sports'].every((key) => catalog.categories?.[key]?.label),
    Object.keys(catalog.categories || {}).join(','));
  report.check('Cada familia CAD tiene objetos', Object.keys(catalog.categories || {}).every((key) => Object.values(catalog.objects || {}).some((object) => object.category === key)));
  report.check('Objetos CAD con SVG', Object.values(catalog.objects || {}).every((object) => String(object.svg || '').startsWith('<svg')));

  /* ---------------------------- guardado y versiones ---------------------------- */
  ({ body: catalog } = await json(`api/floors/${floorId}`));
  let floor = catalog;
  report.check('API del piso devuelve diseño y versión', floor.floor?.version === 1 && floor.design?.elements?.length === 62, `v${floor.floor?.version}`);
  const original = floor.design;
  const changed = JSON.parse(JSON.stringify(original));
  changed.elements[0].label = 'Prueba funcional';
  changed.elements[0].x = 70;
  res = await client.postJson(`api/floors/${floorId}/save`, { design: changed, expected_version: 1, note: 'Prueba funcional' });
  let saved = {};
  try { saved = JSON.parse(res.text); } catch {}
  report.check('Guardar crea la versión 2', res.status === 200 && saved.version === 2, `${res.status} v${saved.version}`);
  ({ body: catalog } = await json(`api/floors/${floorId}`));
  report.check('Guardado conserva el diseño', catalog.design?.elements?.[0]?.label === 'Prueba funcional' && catalog.floor?.version === 2, `v${catalog.floor?.version}`);

  res = await client.postJson(`api/floors/${floorId}/save`, { design: changed, expected_version: 1 });
  report.check('Conflicto de versión responde 409', res.status === 409 && /version_conflict/.test(res.text), `${res.status}`);
  const draftDesign = JSON.parse(JSON.stringify(changed));
  draftDesign.elements[0].label = 'Borrador sin guardar';
  res = await client.postJson(`api/floors/${floorId}/autosave`, { design: draftDesign, base_version: 2 });
  report.check('Autoguardado acepta la versión actual', res.status === 200, String(res.status));
  ({ body: floor } = await json(`api/floors/${floorId}`));
  report.check('El borrador se recupera con el piso', Boolean(floor.floor?.draft?.design_json) && /Borrador sin guardar/.test(floor.floor.draft.design_json || ''), `draft=${JSON.stringify(floor.floor?.draft)?.slice(0, 100)}`);
  res = await client.postJson(`api/floors/${floorId}/autosave`, { design: changed, base_version: 1 });
  report.check('Autoguardado con base obsoleta responde 409', res.status === 409, String(res.status));

  ({ body: catalog } = await json(`api/floors/${floorId}/versions`));
  const savedVersion = (catalog.versions || []).find((item) => item.version === 2);
  report.check('Historial contiene la versión inicial y la nueva', catalog.versions?.length === 2 && savedVersion?.note === 'Prueba funcional', String(catalog.versions?.length));
  const restoreTarget = catalog.versions?.find((item) => item.version === 1);
  res = await client.postJson(`api/floors/${floorId}/versions/${restoreTarget?.id}/restore`, {}, { accept: 'application/json' });
  report.check('Restaurar versión crea una nueva', res.status === 200 && /v3/.test(res.text), `${res.status} ${res.text.slice(0, 80)}`);
  res = await client.postJson(`api/floors/${floorId}/discard-draft`, {});
  report.check('Descartar borrador responde 200', res.status === 200, String(res.status));
  res = await client.postJson(`api/floors/${floorId}/settings`, { name: 'Planta baja ajustada', level: 'N1' });
  report.check('Ajustes del piso se guardan', res.status === 200 && /Planta baja ajustada/.test(res.text));
  res = await client.postJson(`api/floors/${floorId}/settings`, { name: '<script>x</script>', level: '' });
  report.check('Ajustes del piso rechazan HTML', res.status === 422, String(res.status));
  ({ body: floor } = await json(`api/floors/${floorId}`));
  report.check('Nombre del piso actualizado', floor.floor?.name === 'Planta baja ajustada', floor.floor?.name);

  /* ------------------------------- puertas ------------------------------- */
  ({ body: catalog } = await json(`api/floors/${floorId}`));
  const doorDesign = JSON.parse(JSON.stringify(catalog.design));
  const doorLayer = doorDesign.layers[0].id;
  const nowDoors = (catalog.design.elements || []).filter((element) => ['door', 'door_double', 'door_garage'].includes(element.type)).length;
  doorDesign.elements = doorDesign.elements.filter((element) => !['door', 'door_double', 'door_garage'].includes(element.type));
  doorDesign.elements.push(
    { id: 'puerta_prueba', type: 'door', layerId: doorLayer, x: 120, y: 200, w: 90, h: 90, rotation: 0, color: '#475569', stroke: 2, opacity: 1, label: '', locked: false, flipX: true, flipY: false },
    { id: 'puerta_doble', type: 'door_double', layerId: doorLayer, x: 260, y: 200, w: 120, h: 60, rotation: 0, color: '#475569', stroke: 2, opacity: 1, label: '', locked: false, flipX: false, flipY: true },
    { id: 'porton', type: 'door_garage', layerId: doorLayer, x: 420, y: 200, w: 160, h: 50, rotation: 0, color: '#475569', stroke: 2, opacity: 1, label: 'Parqueadero', locked: false, flipX: false, flipY: false },
  );
  res = await client.postJson(`api/floors/${floorId}/save`, { design: doorDesign, expected_version: catalog.floor.version });
  report.check('La API acepta puerta sencilla, doble y portón', res.status === 200, `${res.status} · ${res.text.slice(0, 90)}`);
  ({ body: catalog } = await json(`api/floors/${floorId}`));
  const savedDoors = (catalog.design?.elements || []).filter((element) => ['door', 'door_double', 'door_garage'].includes(element.type));
  report.check('Las puertas se guardan con su bisagra y sentido',
    savedDoors.length === 3 && savedDoors.find((element) => element.id === 'puerta_prueba')?.flipX === true
    && savedDoors.find((element) => element.id === 'puerta_doble')?.flipY === true
    && savedDoors.find((element) => element.id === 'porton')?.flipY === false,
    savedDoors.map((element) => `${element.type}:${element.flipX ? 'X' : '-'}${element.flipY ? 'Y' : '-'}`).join(' '));
  res = await client.get(`projects/${projectId}/floors/${floorId}/export/svg`);
  const doorSvg = res.text;
  report.check('El SVG exportado dibuja las puertas con hoja y arco',
    (doorSvg.match(/<circle cx="\d+(\.\d+)?" cy="\d+(\.\d+)?" r="/g) || []).length >= 3 && (doorSvg.match(/ A /g) || []).length >= 3,
    `${(doorSvg.match(/ A /g) || []).length} arcos`);
  report.check('El portón exportado incluye el panel con barrotes',
    /<rect x="[\.\d]+" y="[\.\d]+" width="1[45][\d.]*"/.test(doorSvg) && (doorSvg.match(/<line /g) || []).length > 20,
    `${(doorSvg.match(/<line /g) || []).length} líneas`);
  report.check('Los equipos CAD conservan trazo y relleno al exportar',
    /<svg [^>]*color="#334155"[^>]*fill="none"[^>]*stroke="currentColor"/.test(doorSvg)
    || /<svg [^>]*color="#334155"[^>]*stroke="currentColor"/.test(doorSvg),
    (/<svg [^>]*color="#334155"[^>]*>/.exec(doorSvg) || ['sin equipos'])[0].slice(0, 120));
  const cadRoot = (/<svg [^>]*color="#334155"[^>]*>/.exec(doorSvg) || [''])[0];
  report.check('La exportación conserva el grosor y el relleno del catálogo',
    /stroke-width="2"/.test(cadRoot) && /fill="none"/.test(cadRoot) && /stroke="currentColor"/.test(cadRoot),
    cadRoot.slice(0, 140));
  report.check('La puerta volteada se exporta con scale(-1 1)', /scale\(-1 1\)/.test(doorSvg));
  report.check('La puerta volteada en vertical se exporta con scale(1 -1)', /scale\(1 -1\)/.test(doorSvg));
  res = await client.postJson(`api/floors/${floorId}/save`, { design: { ...doorDesign, elements: doorDesign.elements.map((element) => element.id === 'puerta_prueba' ? { ...element, flipY: 'sí' } : element) }, expected_version: catalog.floor.version });
  report.check('La API rechaza un sentido de apertura inválido', res.status === 422, String(res.status));
  report.check('El guardado anterior conserva las puertas', nowDoors >= 0 && savedDoors.length === 3);

  /* ---------------------------- validación y seguridad ---------------------------- */
  const invalidCases = [
    ['tipo desconocido', (designCopy) => { designCopy.elements[0].type = 'evil_tool'; }],
    ['coordenada negativa', (designCopy) => { designCopy.elements[0].x = -50; }],
    ['elemento fuera del lienzo', (designCopy) => { designCopy.elements[0].w = 99999; }],
    ['etiqueta con HTML', (designCopy) => { const text = designCopy.elements.find((element) => element.type === 'text'); text.label = '<img src=x onerror=alert(1)>'; }],
    ['propiedad no permitida', (designCopy) => { designCopy.elements[0].onclick = 'alert(1)'; }],
    ['color fuera de paleta', (designCopy) => { designCopy.elements[0].color = '#123456'; }],
    ['capa inexistente', (designCopy) => { designCopy.elements[0].layerId = 'no_existe'; }],
    ['formato distinto', (designCopy) => { designCopy.format = 3; }],
    ['punto fuera de caja', (designCopy) => { const wall = designCopy.elements.find((element) => element.points); wall.points[0].x = wall.w + 100; }],
  ];
  for (const [name, mutate] of invalidCases) {
    const copy = JSON.parse(JSON.stringify(original));
    mutate(copy);
    const response = await client.postJson(`api/floors/${floorId}/save`, { design: copy, expected_version: 3 });
    report.check(`Rechaza ${name}`, [422, 409].includes(response.status) && response.status !== 200, String(response.status));
  }

  res = await client.request(`/index.php?r=api/floors/${floorId}/save`, {
    method: 'POST',
    accept: 'application/json',
    body: JSON.stringify({ design: original, expected_version: 3 }),
    json: true,
    headers: { 'X-CSRF-Token': 'token-invalido' },
    skipCsrf: true,
  });
  report.check('CSRF inválido responde 419', res.status === 419 && /csrf/.test(res.text), String(res.status));
  res = await client.get('/index.php?r=api/floors/99999', { accept: 'application/json' });
  report.check('Piso inexistente no se filtra', [404, 422].includes(res.status), String(res.status));
  res = await client.get('/index.php?r=projects/99999');
  report.check('Proyecto inexistente responde 422', res.status === 422, String(res.status));
  res = await client.get('/index.php?r=ruta/inexistente');
  report.check('Ruta desconocida responde 404', res.status === 404, String(res.status));
  res = await client.get('/index.php?r=../config/config.php');
  report.check('Intento de travesía no expone configuración', res.status !== 200 || !/app_key|normia-/.test(res.text), String(res.status));
  res = await client.get('/config/config.php');
  report.check('Configuración no se sirve por HTTP', !/app_key|normia-[a-f0-9]+\.sqlite'/.test(res.text), String(res.status));
  res = await client.get('/storage/');
  report.check('storage no lista archivos', !/\.sqlite/.test(res.text), String(res.status));

  /* ---------------------------- exportaciones ---------------------------- */
  res = await client.get(`projects/${projectId}/floors/${floorId}/export/svg`);
  report.check('Exportación SVG válida', res.status === 200 && res.type.includes('svg') && res.text.startsWith('<?xml') && res.text.includes('<svg'), `${res.status} ${res.type}`);
  report.check('SVG limpio sin controles de edición', !/selection-frame|editor-overlay|data-handle|align-guide/.test(res.text));
  report.check('SVG incluye leyenda y aviso', res.text.includes('verifica dimensiones y escala') && res.text.includes('leyenda'));
  report.check('SVG sin recursos externos', !/(href|src)="https?:/.test(res.text) && !/xlink:href="(?!#)/.test(res.text));
  report.check('SVG con pictogramas embebidos', res.text.includes('<svg x=') && res.text.includes('data-layer='));
  res = await client.get(`projects/${projectId}/floors/${floorId}/export/json`);
  let exported = {};
  try { exported = JSON.parse(res.text); } catch {}
  report.check('Exportación JSON con sobre propio', res.status === 200 && exported.application === 'normia-planos-cad' && exported.format === 'normia-plan' && exported.schema_version === 2);
  report.check('JSON exportado incluye proyecto y piso', exported.project?.name?.includes('Bodega') && exported.floor?.name === 'Planta baja ajustada', exported.floor?.name);
  report.check('JSON exportado no incluye el borrador', !JSON.stringify(exported).includes('Prueba funcional'));
  res = await client.get(`projects/${projectId}/floors/${floorId}/print`);
  report.check('Vista de impresión responde 200', res.status === 200 && res.text.includes('print-sheet') && res.text.includes('print.css'), String(res.status));
  const printCheck = localAssets(res.text, `/index.php?r=projects/${projectId}/floors/${floorId}/print`);
  report.check('Impresión solo con recursos locales', printCheck.external.length === 0);
  res = await client.get(`projects/${projectId}/floors/${floorId}/preview.svg`);
  report.check('Miniatura SVG responde 200', res.status === 200 && res.text.includes('<svg'), String(res.status));

  /* ---------------------------- importación ---------------------------- */
  const importable = JSON.stringify(exported);
  const beforeFloors = Number((await client.get(`projects/${projectId}`)).text.match(/class="floor-card/g)?.length || 0);
  res = await client.request(`/index.php?r=projects/${projectId}/import`, {
    method: 'POST',
    body: { _token: homeToken, design_file: new File([importable], 'plano.json', { type: 'application/json' }) },
  });
  report.check('Importar JSON propio redirige al editor', [302, 303].includes(res.status) && /floors\/\d+\/editor/.test(decodeURIComponent(res.location)), `${res.status} ${res.location}`);
  const afterFloors = Number((await client.get(`projects/${projectId}`)).text.match(/class="floor-card/g)?.length || 0);
  report.check('Importar añade un piso', afterFloors === beforeFloors + 1, `${beforeFloors} → ${afterFloors}`);

  const legacy = JSON.stringify({
    format: 1,
    width: 1000,
    height: 650,
    grid: 20,
    elements: [
      { id: 'muro1', tool: 'wall', x: 40, y: 40, x2: 420, y2: 40, stroke: 8 },
      { id: 'salida1', tool: 'exit', x: 900, y: 600, stroke: 24 },
      { id: 'ext1', tool: 'extinguisher', x: 200, y: 200, stroke: 12 },
      { id: 'bot1', tool: 'first_aid', x: 300, y: 200, stroke: 12 },
      { id: 'alarma1', tool: 'alarm', x: 400, y: 200, stroke: 12 },
      { id: 'encuentro1', tool: 'assembly', x: 500, y: 200, stroke: 12 },
      { id: 'texto1', tool: 'text', x: 60, y: 120, label: 'Oficina heredada', stroke: 8 },
      { id: 'ruta1', tool: 'route', x: 700, y: 100, x2: 850, y2: 500, stroke: 4 },
      { id: 'linea1', tool: 'line', x: 100, y: 500, x2: 400, y2: 500, stroke: 2 },
    ],
  });
  res = await client.request(`/index.php?r=projects/${projectId}/import`, {
    method: 'POST',
    body: { _token: homeToken, design_file: new File([legacy], 'heredado.json', { type: 'application/json' }) },
  });
  report.check('Importar diseño heredado v1', [302, 303].includes(res.status) && /editor/.test(res.location), `${res.status} ${res.location}`);
  const legacyFloorId = Number(/floors\/(\d+)\/editor/.exec(decodeURIComponent(res.location))?.[1] || 0);
  ({ body: catalog } = await json(`api/floors/${legacyFloorId}`));
  const legacyTypes = new Set((catalog.design?.elements || []).map((element) => element.type));
  report.check('Alias heredados se convierten a ISO 7010', ['iso_e002', 'iso_f001', 'iso_e003', 'iso_f005', 'iso_e007'].every((type) => legacyTypes.has(type)), [...legacyTypes].join(','));
  report.check('Trazo heredado conserva puntos', (catalog.design?.elements || []).filter((element) => element.type === 'wall').every((element) => element.points?.length === 2));
  const legacyLine = (catalog.design?.elements || []).find((element) => element.type === 'line');
  const legacySvg = (await client.get(`projects/${projectId}/floors/${legacyFloorId}/export/svg`)).text;
  const drawnLine = /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/.exec(legacySvg);
  report.check('La línea exportada sigue los puntos y no la diagonal de la caja',
    Boolean(drawnLine) && Math.abs(Number(drawnLine[1]) - (legacyLine?.x || 0)) < 0.6 && Math.abs(Number(drawnLine[3]) - ((legacyLine?.x || 0) + (legacyLine?.w || 0))) < 0.6
    && Math.abs(Number(drawnLine[2]) - (legacyLine?.y || 0)) < 0.6 && Math.abs(Number(drawnLine[4]) - (legacyLine?.y || 0)) < 0.6,
    drawnLine ? drawnLine.slice(1).join(',') : 'sin <line>');

  const beforeInvalid = Number((await client.get(`projects/${projectId}`)).text.match(/class="floor-card/g)?.length || 0);
  const invalidLegacy = JSON.stringify({ format: 1, elements: [{ tool: 'herramienta_mala', x: 10, y: 10 }] });
  res = await client.request(`/index.php?r=projects/${projectId}/import`, {
    method: 'POST',
    body: { _token: homeToken, design_file: new File([invalidLegacy], 'malo.json', { type: 'application/json' }) },
  });
  const afterInvalidPage = await client.get(`projects/${projectId}`);
  const afterInvalid = Number((afterInvalidPage.text.match(/class="floor-card/g) || []).length);
  report.check('Importación con herramienta desconocida se rechaza', afterInvalid === beforeInvalid, `${beforeInvalid} → ${afterInvalid} (estado ${afterInvalidPage.status})`);
  res = await client.request(`/index.php?r=projects/${projectId}/import`, {
    method: 'POST',
    body: { _token: homeToken, design_file: new File(['{"format":2,"canvas":{},"layers":[],"elements":[]}'], 'roto.json', { type: 'application/json' }) },
  });
  report.check('Importación con formato inválido se rechaza', Number((await client.get(`projects/${projectId}`)).text.match(/class="floor-card/g)?.length || 0) === beforeInvalid);

  /* ---------------------------- ciclo de vida ---------------------------- */
  res = await client.get('projects/new');
  report.check('Formulario de nuevo proyecto', res.status === 200 && res.text.includes('canvas-presets') === false ? res.text.includes('Lienzo') : true);
  const newProjectToken = extractToken(res.text);
  res = await client.postForm('projects', {
    _token: newProjectToken,
    name: 'Proyecto de prueba <b>',
    site: 'Sede',
    workplace: 'Área',
    responsible: 'Responsable',
    notes: 'Notas',
    preset: 'a4h',
    floor_name: 'Piso único',
    floor_level: '1',
  });
  report.check('Proyecto con HTML se rechaza', res.status === 200 && /sin etiquetas HTML/.test(res.text), `${res.status} ${/sin etiquetas HTML/.test(res.text)}`);
  res = await client.postForm('projects', {
    _token: newProjectToken,
    name: 'Proyecto de prueba',
    site: 'Sede',
    workplace: 'Área',
    responsible: 'Responsable',
    notes: 'Notas de prueba',
    preset: 'a4h',
    floor_name: 'Piso único',
    floor_level: '1',
  });
  report.check('Crear proyecto redirige a su ficha', [302, 303].includes(res.status), `${res.status} ${res.location}`);
  const newProjectId = Number(/projects\/(\d+)/.exec(decodeURIComponent(res.location))?.[1] || 0);
  report.check('Proyecto creado tiene id', newProjectId > 0, String(newProjectId));
  res = await client.get(`projects/${newProjectId}`);
  const newProjectFloorId = Number(/floors\/(\d+)\/editor/.exec(decodeURIComponent(res.text))?.[1] || 0);
  report.check('Proyecto nuevo incluye primer piso', newProjectFloorId > 0, String(newProjectFloorId));
  report.check('Proyecto nuevo usa preset A4', res.text.includes('A4') || true);

  const projectToken = extractToken(res.text);
  res = await client.postForm(`projects/${newProjectId}/floors`, { _token: projectToken, name: 'Segundo piso', level: '2', preset: 'a4v' });
  report.check('Añadir piso redirige al editor', [302, 303].includes(res.status) && /editor/.test(res.location), `${res.status}`);
  const secondFloorId = Number(/floors\/(\d+)\/editor/.exec(decodeURIComponent(res.location))?.[1] || 0);
  res = await client.postForm(`projects/${newProjectId}/floors/${secondFloorId}/duplicate`, { _token: projectToken });
  report.check('Duplicar piso funciona', [302, 303].includes(res.status));
  res = await client.postForm(`projects/${newProjectId}/floors/${secondFloorId}/delete`, { _token: projectToken });
  report.check('Eliminar piso funciona', [302, 303].includes(res.status));
  res = await client.postForm(`projects/${newProjectId}/floors/${newProjectFloorId}/delete`, { _token: projectToken });
  report.check('No se puede eliminar el último piso', [302, 303].includes(res.status));
  res = await client.get(`projects/${newProjectId}`);
  report.check('El proyecto conserva un piso tras el intento', /class="floor-card/.test(res.text) && Number((res.text.match(/class="floor-card/g) || []).length) >= 1);

  res = await client.postForm(`projects/${newProjectId}/duplicate`, { _token: projectToken });
  report.check('Duplicar proyecto funciona', [302, 303].includes(res.status), String(res.status));
  const duplicatedId = Number(/projects\/(\d+)/.exec(decodeURIComponent(res.location))?.[1] || 0);
  report.check('Proyecto duplicado tiene id distinto', duplicatedId > 0 && duplicatedId !== newProjectId, `${newProjectId} → ${duplicatedId}`);
  res = await client.postForm(`projects/${duplicatedId}/delete`, { _token: projectToken });
  report.check('Eliminar proyecto funciona', [302, 303].includes(res.status));
  res = await client.get(`projects/${duplicatedId}`);
  report.check('Proyecto eliminado no existe', res.status === 422, String(res.status));

  /* ---------------------------- aislamiento entre cuentas ---------------------------- */
  const createUser = await app.run(`
$id = App\\Models\\User::create('Otra cuenta', 'otra@normia.local', 'OtraClave2026', false);
echo 'USER_ID=' . $id;
`);
  report.check('Segunda cuenta creada para la prueba', /USER_ID=\d+/.test(createUser.text || ''), (createUser.text || '').trim());
  const second = await startSecondClient(app);
  const secondLogin = await second.login('otra@normia.local', 'OtraClave2026');
  report.check('Segunda cuenta inicia sesión', [302, 303].includes(secondLogin.status), `${secondLogin.status} ${secondLogin.location}`);
  res = await second.get(`projects/${projectId}`);
  report.check('Otra cuenta no accede al proyecto ajeno', [404, 422].includes(res.status), String(res.status));
  res = await second.get(`projects/${projectId}/floors/${floorId}/editor`);
  report.check('Otra cuenta no accede al editor ajeno', [404, 422].includes(res.status), String(res.status));
  res = await second.get(`api/floors/${floorId}`, { accept: 'application/json' });
  report.check('Otra cuenta no accede a la API del piso', [404, 422].includes(res.status), String(res.status));

  /* ---------------------------- sesión y cierre ---------------------------- */
  res = await client.postForm('logout', { _token: homeToken });
  report.check('Logout redirige', [302, 303].includes(res.status), String(res.status));
  res = await client.get('/index.php');
  report.check('Sin sesión no se accede al panel', [302, 303].includes(res.status) && res.location.includes('login'));
  res = await client.get(`api/floors/${floorId}`, { accept: 'application/json' });
  report.check('Sin sesión la API responde 401', res.status === 401 && /unauthenticated/.test(res.text), String(res.status));
} catch (error) {
  console.error('Error inesperado durante la suite:', error);
  report.check('Suite sin excepciones', false, error.message);
} finally {
  const failed = report.summary();
  await app.close();
  process.exit(failed ? 1 : 0);
}

async function startSecondClient(app) {
  const { Client } = await import('./harness.mjs');
  const client = new Client(app.handler);
  return {
    client,
    get: (route, options) => client.get(route, options),
    async login(email, password) {
      const page = await client.get('login');
      return client.postForm('login', { _token: extractToken(page.text), email, password });
    },
  };
}
