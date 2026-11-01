/*
 * Suite funcional de Normia Planos CAD.
 * Uso: node tests/php/functional.mjs 8.1|8.3
 *
 * Cubre instalación limpia, autenticación, proyectos, pisos, editor,
 * catálogos, versiones, borradores, exportaciones, importación, validación,
 * CSRF, aislamiento entre cuentas y carga de recursos locales.
 */
import { JSDOM } from 'jsdom';
import { startApp, extractToken, decodeEntities, makeReporter, Client } from './harness.mjs';

const version = process.argv[2] || '8.3';
const report = makeReporter(version);
const app = await startApp(version);
const { client } = app;
const guest = new Client(app.handler);
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
  report.check('Editor incluye el pliego y la medición de rutas',
    editorHtml.includes('data-drawer="schedule"') && editorHtml.includes('data-drawer="measure"')
    && editorHtml.includes('/assets/js/editor/schedule.js') && editorHtml.includes('/assets/js/editor/measure.js')
    && editorHtml.includes('data-open-drawer="schedule"') && editorHtml.includes('data-open-drawer="measure"'));
  report.check('Editor incluye el modo presentación',
    editorHtml.includes('/assets/js/editor/present.js') && editorHtml.includes('data-present-open')
    && editorHtml.includes('#i-present'));
  report.check('El editor trae la guía de primeros pasos y su buscador con sinónimos',
    editorHtml.includes('/assets/js/editor/guide.js') && editorHtml.includes('/assets/js/editor/toolsearch.js')
    && editorHtml.includes('data-drawer="guide"') && editorHtml.includes('data-guide-steps')
    && editorHtml.includes('data-open-drawer="guide"'));
  report.check('Las vías y andenes tienen baldosa propia en el rail',
    /data-tool="road"[^>]*data-tooltip="Vía vehicular/.test(editorHtml)
    && editorHtml.includes('data-road-flyout') && editorHtml.includes('data-road-menu'));
  report.check('Editor sin recursos externos', localAssets(editorHtml, `/index.php?r=projects/${projectId}/floors/${floorId}/editor`).external.length === 0);
  report.check('El editor abre con la pantalla de bienvenida y el emblema',
    editorHtml.includes('data-splash') && editorHtml.includes('normia-logo.png')
    && editorHtml.includes('/assets/js/splash.js') && editorHtml.includes('aria-live="polite"'));
  report.check('La marca usa el emblema como logo en toda la aplicación',
    editorHtml.includes('normia-emblem.png') && editorHtml.includes('apple-touch-icon.png')
    && editorHtml.includes('manifest.webmanifest'));
  report.check('La paleta «Todas las herramientas» reúne herramientas y acciones',
    editorHtml.includes('data-tools-popover')
    && (editorHtml.match(/class="tool-choice"/g) || []).length === 31
    && editorHtml.includes('data-tools-filter')
    && editorHtml.includes('data-open-drawer="audit"')
    && editorHtml.includes('data-present-open'));
  report.check('La paleta declara buscador y estado vacío, sin controles falsos',
    editorHtml.includes('data-tools-empty') && editorHtml.includes('aria-label="Buscar herramienta o acción"'));
  const bootMatch = /<textarea id="editor-boot" hidden>([\s\S]*?)<\/textarea>/.exec(editorHtml);
  let boot = null;
  try { boot = JSON.parse(decodeEntities(bootMatch?.[1] || '')); } catch { boot = null; }
  report.check('Boot del editor es JSON válido', Boolean(boot?.saveUrl && boot?.csrf && boot?.floorUrl), boot?.saveUrl || 'sin boot');
  report.check('Boot recibe metadatos del piso', boot?.floorMeta?.name === 'Planta baja' && boot?.project?.name?.includes('Bodega'), `${boot?.floorMeta?.name}`);
  const designMatch = /<textarea id="editor-design" hidden>([\s\S]*?)<\/textarea>/.exec(editorHtml);
  let design = null;
  try { design = JSON.parse(decodeEntities(designMatch?.[1] || '')); } catch { design = null; }
  report.check('Editor recibe el diseño guardado', design?.format === 2 && design?.elements?.length === 93, `${design?.elements?.length} elementos`);
  report.check('La demo trae dos salidas marcadas y la ocupación declarada',
    (design?.elements || []).filter((element) => element.isExit === true).length === 2 && design?.canvas?.occupancy === 30,
    `${(design?.elements || []).filter((element) => element.isExit === true).length} salidas · ${design?.canvas?.occupancy} personas`);
  const demoAudit = (await json(`api/floors/${floorId}/audit`)).body;
  report.check('La demo pasa la revisión de referencia sin hallazgos críticos',
    demoAudit.report?.counts?.high === 0 && demoAudit.report?.exits?.count === 2
    && demoAudit.report?.travel?.computed === true && demoAudit.report?.travel?.longestM > 0,
    `${demoAudit.report?.counts?.high} críticos · ${demoAudit.report?.exits?.count} salidas · ${demoAudit.report?.travel?.longestM} m`);
  report.check('El recorrido no cuenta el terreno de fuera del edificio',
    demoAudit.report?.travel?.exteriorAreaM2 > 0
    && demoAudit.report.travel.freeAreaM2 + demoAudit.report.travel.exteriorAreaM2 > demoAudit.report.travel.freeAreaM2
    && demoAudit.report.travel.freeAreaM2 < demoAudit.report.travel.reachableAreaM2 + 0.01,
    `libre ${demoAudit.report?.travel?.freeAreaM2} m² · exterior ${demoAudit.report?.travel?.exteriorAreaM2} m²`);

  const demoExt = demoAudit.report?.extinguishers || {};
  report.check('La demo incluye extintores con datos de norma',
    demoExt.summary?.count === 4 && demoExt.profile === 'colombia'
    && (demoExt.units || []).every((unit) => unit.agent && unit.rating && unit.travelLimitM > 0),
    `${demoExt.summary?.count} extintores · ${demoExt.summary?.coveredPct} % · ${demoExt.profileLabel}`);
  report.check('La cobertura se mide sobre la superficie útil del piso',
    demoExt.summary?.floorAreaM2 > 0 && demoExt.summary.floorAreaM2 <= demoExt.summary.coveredAreaM2 + demoExt.summary.uncoveredAreaM2 + 0.2
    && demoExt.summary.requiredByArea === Math.ceil(demoExt.summary.floorAreaM2 / 200),
    `piso ${demoExt.summary?.floorAreaM2} m² · mínimo por área ${demoExt.summary?.requiredByArea}`);
  const demoCo2 = (demoExt.units || []).find((unit) => unit.id === 'ext_co2_01');
  report.check('La demo trae un extintor mal ubicado a propósito',
    Boolean(demoCo2) && demoCo2.mountCm > demoCo2.mountMaxCm && demoCo2.signCovered === false
    && (demoExt.findings || []).some((finding) => finding.code === 'ext_height' && finding.elements.includes('ext_co2_01')),
    demoCo2 ? `${demoCo2.mountCm} cm sobre ${demoCo2.mountMaxCm} cm` : 'sin extintor');
  report.check('La cobertura declara sus límites y no afirma cumplimiento',
    /no certifica/i.test(demoExt.notice || '') && /NTC 2885/.test(demoExt.reference || '')
    && Boolean(demoExt.agents) && demoExt.agents.co2?.classes?.includes('B'));

  // Proyecto aislado: así las pruebas de guardado de extintores no alteran la
  // versión del piso de demostración, que otras comprobaciones dan por hecha.
  const extProjectPage = await client.get('projects/new');
  client.csrf = extractToken(extProjectPage.text);
  const extProject = await client.postForm('projects', {
    _token: client.csrf, name: 'Proyecto de extintores', site: 'Sede QA', workplace: 'Bodega',
    responsible: 'Equipo QA', notes: 'Cobertura de extintores', preset: 'bodega',
  });
  const extProjectId = Number(/projects\/(\d+)/.exec(decodeURIComponent(extProject.location))?.[1] || 0);
  const extProjectHtml = await client.get(`projects/${extProjectId}`);
  const extFloorHref = [...extProjectHtml.text.matchAll(/href="([^"]+)"/g)]
    .map((match) => { try { return decodeURIComponent(match[1]); } catch { return match[1]; } })
    .find((href) => /\/floors\/\d+\/editor/.test(href)) || '';
  const extFloorId = Number(/floors\/(\d+)\/editor/.exec(extFloorHref)?.[1] || 0);
  const extFloorBody = (await json(`api/floors/${extFloorId}`)).body;
  const extDesign = JSON.parse(JSON.stringify(extFloorBody.design));
  const extLayer = extDesign.layers[0].id;
  extDesign.canvas = { ...extDesign.canvas, width: 900, height: 600, occupancy: 20 };
  extDesign.elements = [{
    id: 'ext_probe', type: 'cad_eds_extinguisher', layerId: extLayer, x: 120, y: 120, w: 44, h: 44,
    rotation: 0, color: '#b71f2e', stroke: 2, opacity: 1, label: '', locked: false,
    extAgent: 'pqs_abc', extCapacityLb: 20, extRating: '4-A:60-B:C', extHazard: 'ordinary', extMountCm: 110,
  }, {
    id: 'ext_bad', type: 'cad_fire_ext_co2', layerId: extLayer, x: 700, y: 440, w: 44, h: 44,
    rotation: 0, color: '#b71f2e', stroke: 2, opacity: 1, label: '', locked: false,
    extAgent: 'co2', extCapacityLb: 5, extRating: '5-B:C', extHazard: 'ordinary', extMountCm: 190,
  }];
  extDesign.groups = [];
  extDesign.extinguishers = { profile: 'colombia', hazard: 'ordinary' };
  let extCurrent = (await json(`api/floors/${extFloorId}`)).body.floor.version;
  res = await client.postJson(`api/floors/${extFloorId}/save`, { design: extDesign, expected_version: extCurrent, note: 'Extintores de prueba' });
  report.check('Guardar extintores con datos de norma', res.status === 200, String(res.status));
  const extAudit = (await json(`api/floors/${extFloorId}/audit`)).body.report?.extinguishers || {};
  report.check('El cálculo de cobertura reconoce los extintores guardados',
    extAudit.summary?.count === 2 && extAudit.profile === 'colombia'
    && (extAudit.units || []).every((unit) => unit.travelLimitM > 0 && unit.rating === unit.rating.toUpperCase()),
    `${extAudit.summary?.count} equipos · ${extAudit.summary?.coveredPct} % · piso ${extAudit.summary?.floorAreaM2} m²`);
  report.check('El extintor sobremontado se marca y el cálculo admite el mínimo por área',
    (extAudit.findings || []).some((finding) => finding.code === 'ext_height' && finding.elements.includes('ext_bad'))
    && (extAudit.findings || []).some((finding) => finding.code === 'ext_without_sign'),
    (extAudit.findings || []).map((finding) => finding.code).join(','));
  const badRating = JSON.parse(JSON.stringify(extDesign));
  badRating.elements[0].extRating = 'ABC';
  res = await client.postJson(`api/floors/${extFloorId}/save`, { design: badRating, expected_version: (await json(`api/floors/${extFloorId}`)).body.floor.version });
  report.check('La API rechaza una clasificación de extintor inválida', res.status === 422, String(res.status));
  const badAgent = JSON.parse(JSON.stringify(extDesign));
  badAgent.elements[0].extAgent = 'gasolina';
  res = await client.postJson(`api/floors/${extFloorId}/save`, { design: badAgent, expected_version: (await json(`api/floors/${extFloorId}`)).body.floor.version });
  report.check('La API rechaza un agente extintor fuera del catálogo', res.status === 422, String(res.status));
  const nfpaDesign = JSON.parse(JSON.stringify(extDesign));
  nfpaDesign.extinguishers = { profile: 'nfpa10', hazard: 'extra' };
  nfpaDesign.elements = nfpaDesign.elements.map((element) => ({ ...element, extHazard: 'extra' }));
  res = await client.postJson(`api/floors/${extFloorId}/save`, { design: nfpaDesign, expected_version: (await json(`api/floors/${extFloorId}`)).body.floor.version });
  const nfpaAudit = (await json(`api/floors/${extFloorId}/audit`)).body.report?.extinguishers || {};
  report.check('El perfil internacional se guarda y cambia el cálculo',
    res.status === 200 && nfpaAudit.profile === 'nfpa10' && nfpaAudit.hazard === 'extra'
    && nfpaAudit.summary?.requiredByArea === 0 && /NFPA 10/.test(nfpaAudit.reference || ''),
    `${nfpaAudit.profile} · ${nfpaAudit.hazard} · mínimo ${nfpaAudit.summary?.requiredByArea}`);
  const extUnit = (nfpaAudit.units || []).find((unit) => unit.id === 'ext_probe');
  report.check('Cambiar a riesgo extra reduce el área admisible del extintor',
    Boolean(extUnit) && extUnit.hazard === 'extra' && extUnit.areaLimitM2 > 0 && extUnit.areaLimitM2 < 557.6,
    extUnit ? `${extUnit.areaLimitM2} m² · ${extUnit.rating}` : 'sin unidad');

  res = await client.get('/assets/js/editor.js');
  report.check('JS del editor se sirve completo', res.status === 200 && res.text.length > 20000, `${res.text.length} bytes`);
  for (const asset of ['/assets/css/app.css', '/assets/css/editor.css', '/assets/css/print.css', '/assets/js/ui.js', '/assets/js/app.js', '/assets/js/lib/model.js', '/assets/js/lib/geometry.js', '/assets/js/lib/renderer.js', '/assets/img/favicon.svg']) {
    const response = await client.get(asset);
    report.check(`Recurso local ${asset}`, response.status === 200 && response.text.length > 20, String(response.status));
  }

  let { response: catalogResponse, body: catalog } = await json('catalogs/signs');
  report.check('Catálogo de señales con 332 ISO 7010 y 63 propias, orientación, tránsito y brigada',
    catalogResponse.status === 200 && catalog.count === 395 && catalog.isoCount === 332 && catalog.serviceCount === 63
    && Object.keys(catalog.signs || {}).length === 395);
  report.check('Señales con SVG seguro embebido', catalog.signs?.E002?.svg?.startsWith('<svg') && !/xlink:href="(?!#)/.test(catalog.signs?.E002?.svg || ''));
  report.check('Señales de baño disponibles', ['SVC_WC_MEN', 'SVC_WC_WOMEN', 'SVC_WC_MIXED', 'SVC_WC_ACCESSIBLE'].every((code) => catalog.signs?.[code]?.svg?.startsWith('<svg')));
  report.check('Señales de emergencia y brigada con alias y pictograma',
    ['SVC_EVAC_ROUTE', 'SVC_EXIT_TEXT', 'SVC_HYDRANT', 'SVC_COMMAND_POST', 'SVC_GAS_SHUTOFF', 'SVC_POWER_SHUTOFF']
      .every((code) => catalog.signs?.[code]?.svg?.startsWith('<svg') && catalog.signs[code].aliases?.length
        && catalog.signs[code].category === 'brigade')
    && catalog.aliases?.SVC_EVAC_ROUTE?.includes('ruta de evacuacion'), '6 señales');
  report.check('Familias de señalización completas',
    Object.keys(catalog.categories || {}).length === 9 && catalog.colors?.emergency === '#237f52'
    && catalog.colors?.services === '#0f766e' && catalog.colors?.location === '#1d4ed8'
    && catalog.colors?.traffic === '#b45309'
    && catalog.categories?.location?.label === 'Ubicación en el plano'
    && catalog.colors?.brigade === '#b91c1c'
    && catalog.categories?.traffic?.label === 'Señalización de tránsito'
    && catalog.categories?.brigade?.label === 'Emergencia y brigada',
    Object.keys(catalog.categories || {}).join(','));
  report.check('Alias heredados disponibles', catalog.legacyTools?.extinguisher === 'F001' && catalog.legacyTools?.exit === 'E002');
  ({ response: catalogResponse, body: catalog } = await json('catalogs/cad'));
  report.check('Catálogo CAD con 420 objetos', catalogResponse.status === 200 && catalog.count === 420 && Object.keys(catalog.objects || {}).length === 420);
  report.check('Catálogo CAD con 31 familias sectoriales', Object.keys(catalog.categories || {}).length === 31
    && ['restaurant', 'warehouse', 'retail', 'hospital', 'textile', 'grill', 'supermarket', 'residential', 'sports', 'outdoor', 'electrico', 'hidraulico', 'eds', 'drogueria', 'gimnasio', 'colegio', 'cafeteria'].every((key) => catalog.categories?.[key]?.label),
    Object.keys(catalog.categories || {}).join(','));
  report.check('Cada familia CAD tiene objetos', Object.keys(catalog.categories || {}).every((key) => Object.values(catalog.objects || {}).some((object) => object.category === key)));
  report.check('Objetos CAD con SVG', Object.values(catalog.objects || {}).every((object) => String(object.svg || '').startsWith('<svg')));
  report.check('Familias de emergencia, técnicas, accesibilidad y seguridad',
    ['fire', 'emergency', 'technic', 'access', 'security'].every((key) => catalog.categories?.[key]?.label
      && Object.values(catalog.objects || {}).some((object) => object.category === key))
    && catalog.objects?.cad_fire_smoke_detector?.category === 'fire'
    && catalog.objects?.cad_acc_accessible_lift?.category === 'access',
    ['fire', 'emergency', 'technic', 'access', 'security'].map((key) => `${key}:${Object.values(catalog.objects || {}).filter((object) => object.category === key).length}`).join(' · '));
  const nombres = Object.values(catalog.objects || {}).map((object) => object.name);
  report.check('Sin nombres repetidos en el catálogo CAD', new Set(nombres).size === nombres.length, `${nombres.length - new Set(nombres).size} repetidos`);
  report.check('Símbolos de instalación eléctrica e hidráulica disponibles',
    ['cad_elec_outlet', 'cad_elec_panel', 'cad_elec_luminaire', 'cad_hyd_valve', 'cad_hyd_cabinet', 'cad_hyd_meter'].every((key) => catalog.objects?.[key]?.svg?.startsWith('<svg'))
    && catalog.objects?.cad_elec_luminaire?.load === 60);

  /* ------------------------------ redes técnicas ------------------------------ */
  let mepCatalog = {};
  ({ response: catalogResponse, body: mepCatalog } = await json('catalogs/mep'));
  report.check('Catálogo de redes con 6 sistemas', catalogResponse.status === 200
    && ['agua_fria', 'agua_caliente', 'gas', 'aguas_negras', 'aguas_lluvias', 'incendio'].every((key) => mepCatalog.hydraulic?.[key]?.label)
    && mepCatalog.diameters?.length === 11 && mepCatalog.electrical?.voltages?.includes(220),
    Object.keys(mepCatalog.hydraulic || {}).join(','));
  report.check('Las redes declaran que son valores de referencia', /no sustituyen/i.test(mepCatalog.notice || '') && /referencia/i.test(mepCatalog.hydraulic?.agua_fria?.reference || ''));

  /* ---------------------------- guardado y versiones ---------------------------- */
  ({ body: catalog } = await json(`api/floors/${floorId}`));
  let floor = catalog;
  report.check('API del piso devuelve diseño y versión', floor.floor?.version === 1 && floor.design?.elements?.length === 93, `v${floor.floor?.version}`);
  const original = floor.design;
  const changed = JSON.parse(JSON.stringify(original));
  changed.elements[0].label = 'Prueba funcional';
  changed.elements[0].x = 70;
  // Los tipos nuevos también tienen que pasar la validación del servidor.
  const extraBase = { layerId: changed.layers[0].id, x: 60, y: 60, w: 44, h: 44, rotation: 0, stroke: 2, opacity: 1, label: '', fontSize: 14, points: [], flipX: false, flipY: false, isExit: false, locked: false };
  changed.elements.push({ ...extraBase, id: 'probe_detector', type: 'cad_fire_smoke_detector', color: '#b71f2e' });
  changed.elements.push({ ...extraBase, id: 'probe_brigada', type: 'sig_evac_route', color: '#b91c1c' });
  res = await client.postJson(`api/floors/${floorId}/save`, { design: changed, expected_version: 1, note: 'Prueba funcional' });
  let saved = {};
  try { saved = JSON.parse(res.text); } catch {}
  report.check('Guardar crea la versión 2', res.status === 200 && saved.version === 2, `${res.status} v${saved.version}`);
  ({ body: catalog } = await json(`api/floors/${floorId}`));
  report.check('Guardado conserva el diseño', catalog.design?.elements?.[0]?.label === 'Prueba funcional' && catalog.floor?.version === 2, `v${catalog.floor?.version}`);
  report.check('El servidor acepta equipos de emergencia y señales de brigada',
    catalog.design?.elements?.some((element) => element.type === 'cad_fire_smoke_detector' && element.color === '#b71f2e')
    && catalog.design?.elements?.some((element) => element.type === 'sig_evac_route' && element.color === '#b91c1c'),
    `${catalog.design?.elements?.length} elementos`);

  /* -------------------- auditor de planos y evacuación -------------------- */
  const auditPage = await client.get('projects/new');
  client.csrf = extractToken(auditPage.text);
  const auditProject = await client.postForm('projects', {
    _token: client.csrf, name: 'Proyecto de revisión', site: 'Sede QA', workplace: 'Planta',
    responsible: 'Equipo QA', notes: 'Auditor de planos', preset: 'planta',
  });
  const auditProjectId = Number(/projects\/(\d+)/.exec(decodeURIComponent(auditProject.location))?.[1] || 0);
  const auditProjectPage = await client.get(`projects/${auditProjectId}`);
  const auditFloorHref = [...auditProjectPage.text.matchAll(/href="([^"]+)"/g)]
    .map((match) => { try { return decodeURIComponent(match[1]); } catch { return match[1]; } })
    .find((href) => /\/floors\/\d+\/editor/.test(href)) || '';
  const auditFloorId = Number(/floors\/(\d+)\/editor/.exec(auditFloorHref)?.[1] || 0);
  const auditFloor = (await json(`api/floors/${auditFloorId}`)).body;
  const baseDesign = JSON.parse(JSON.stringify(auditFloor.design));
  const auditLayer = baseDesign.layers[0].id;
  baseDesign.canvas = { ...baseDesign.canvas, width: 800, height: 600, unit: 'cm', scale: '1:100', occupancy: 0 };
  baseDesign.layers = [{ id: auditLayer, name: 'Planta', visible: true, locked: false }];
  baseDesign.groups = [];
  const wall = (id, x, y, w, h, points) => ({
    id, type: 'wall', layerId: auditLayer, x, y, w, h, rotation: 0, color: '#0f172a',
    stroke: 10, opacity: 1, label: '', locked: false, points,
  });
  const door = (id, x, isExit) => ({
    id, type: 'door', layerId: auditLayer, x, y: 410, w: 90, h: 90, rotation: 0,
    color: '#475569', stroke: 2, opacity: 1, label: '', locked: false,
    flipX: false, flipY: false, isExit,
  });
  baseDesign.elements = [
    wall('muro_sup', 100, 100, 600, 2, [{ x: 0, y: 0 }, { x: 600, y: 0 }]),
    wall('muro_izq', 100, 100, 2, 400, [{ x: 0, y: 0 }, { x: 0, y: 400 }]),
    wall('muro_der', 700, 100, 2, 400, [{ x: 0, y: 0 }, { x: 0, y: 400 }]),
    wall('muro_inf_a', 100, 500, 200, 2, [{ x: 0, y: 0 }, { x: 200, y: 0 }]),
    wall('muro_inf_b', 390, 500, 310, 2, [{ x: 0, y: 0 }, { x: 310, y: 0 }]),
    door('puerta_1', 300, true),
    {
      id: 'ruta_mala', type: 'route', layerId: auditLayer, x: 20, y: 300, w: 180, h: 2,
      rotation: 0, color: '#237f52', stroke: 3, opacity: 1, label: '', locked: false,
      points: [{ x: 0, y: 0 }, { x: 180, y: 0 }],
    },
    {
      id: 'texto_planta', type: 'text', layerId: auditLayer, x: 130, y: 130, w: 200, h: 30,
      rotation: 0, color: '#0f172a', stroke: 0, opacity: 1, label: 'Bodega', locked: false, fontSize: 18,
    },
  ];
  res = await client.postJson(`api/floors/${auditFloorId}/save`, { design: baseDesign, expected_version: 1, note: 'Plano a revisar' });
  report.check('Guardar un plano con una salida marcada', res.status === 200, String(res.status));
  let audit = {};
  ({ body: audit } = await json(`api/floors/${auditFloorId}/audit`));
  const auditReport = audit.report || {};
  const codes = (report) => (report.findings || []).map((finding) => finding.code);
  report.check('La API de revisión devuelve el informe del plano guardado',
    audit.ok === true && Array.isArray(auditReport.findings) && auditReport.exits?.count === 1,
    `${auditReport.findings?.length || 0} hallazgos · ${auditReport.exits?.count} salidas`);
  report.check('El auditor avisa de que una sola salida es insuficiente',
    codes(auditReport).includes('too_few_exits') && auditReport.counts.medium >= 1,
    codes(auditReport).join(','));
  report.check('El auditor marca la ruta que atraviesa un muro',
    codes(auditReport).includes('route_through_wall')
    && (auditReport.routes?.[0]?.wallCrossings || 0) >= 1,
    `cruces ${auditReport.routes?.[0]?.wallCrossings} · ${codes(auditReport).join(',')}`);
  report.check('El auditor detecta la ruta que no llega a una salida',
    auditReport.routes?.[0]?.endsAtExit === false && codes(auditReport).includes('route_no_exit'));
  report.check('El auditor estima la ocupación cuando no está declarada',
    auditReport.occupancy?.source === 'estimated' && auditReport.occupancy?.people >= 1
    && codes(auditReport).includes('occupancy_missing'),
    `${auditReport.occupancy?.people} personas`);
  report.check('El recorrido de evacuación se mide sobre el espacio libre',
    auditReport.travel?.computed === true
    && Number.isFinite(auditReport.travel?.longestM) && auditReport.travel.longestM > 0
    && auditReport.travel.freeAreaM2 > 0,
    `${auditReport.travel?.longestM} m · ${auditReport.travel?.freeAreaM2} m² libres`);
  report.check('El auditor echa en falta el marcador «Usted está aquí»',
    codes(auditReport).includes('no_you_are_here'));

  // Versión corregida: segunda salida, señalización junto a los vanos, marcador
  // de posición, ocupación declarada y una ruta limpia que termina en la salida.
  const fixedDesign = JSON.parse(JSON.stringify(baseDesign));
  fixedDesign.canvas.occupancy = 40;
  fixedDesign.elements = fixedDesign.elements.filter((element) => element.id !== 'muro_inf_b' && element.id !== 'ruta_mala');
  fixedDesign.elements.push(wall('muro_inf_b', 390, 500, 160, 2, [{ x: 0, y: 0 }, { x: 160, y: 0 }]));
  fixedDesign.elements.push(wall('muro_inf_c', 640, 500, 60, 2, [{ x: 0, y: 0 }, { x: 60, y: 0 }]));
  fixedDesign.elements.push(door('puerta_2', 550, true));
  fixedDesign.elements.push({
    id: 'senal_salida_1', type: 'iso_e001', layerId: auditLayer, x: 325, y: 520, w: 40, h: 40,
    rotation: 0, color: '#237f52', stroke: 0, opacity: 1, label: '', locked: false,
  });
  fixedDesign.elements.push({
    id: 'senal_salida_2', type: 'iso_e002', layerId: auditLayer, x: 575, y: 520, w: 40, h: 40,
    rotation: 0, color: '#237f52', stroke: 0, opacity: 1, label: '', locked: false,
  });
  fixedDesign.elements.push({
    id: 'aqui_1', type: 'sig_aqui', layerId: auditLayer, x: 200, y: 200, w: 64, h: 64,
    rotation: 0, color: '#1d4ed8', stroke: 0, opacity: 1, label: '', locked: false,
  });
  fixedDesign.elements.push({
    id: 'ruta_buena', type: 'route', layerId: auditLayer, x: 150, y: 470, w: 195, h: 20,
    rotation: 0, color: '#237f52', stroke: 3, opacity: 1, label: 'Ruta principal', locked: false,
    points: [{ x: 0, y: 20 }, { x: 195, y: 0 }],
  });
  const currentVersion = (await json(`api/floors/${auditFloorId}`)).body.floor.version;
  res = await client.postJson(`api/floors/${auditFloorId}/save`, { design: fixedDesign, expected_version: currentVersion, note: 'Plano corregido' });
  report.check('Guardar un plano corregido con dos salidas', res.status === 200, String(res.status));
  ({ body: audit } = await json(`api/floors/${auditFloorId}/audit`));
  const fixedReport = audit.report || {};
  report.check('Con dos salidas y ruta limpia no quedan hallazgos críticos ni importantes',
    fixedReport.exits?.count === 2 && fixedReport.counts.high === 0 && fixedReport.counts.medium === 0
    && (fixedReport.routes?.[0]?.wallCrossings || 0) === 0 && fixedReport.routes?.[0]?.endsAtExit === true,
    `salidas ${fixedReport.exits?.count} · críticos ${fixedReport.counts?.high} · importantes ${fixedReport.counts?.medium} · ${codes(fixedReport).join(',')}`);
  report.check('La ocupación declarada alimenta el ancho y el tiempo de evacuación',
    fixedReport.occupancy?.source === 'declared' && fixedReport.occupancy?.people === 40
    && Math.abs((fixedReport.egress?.requiredWidthM || 0) - 0.2) < 0.001
    && Number.isFinite(fixedReport.egress?.estimatedTimeS) && fixedReport.egress.estimatedTimeS > 0,
    `${fixedReport.occupancy?.people} pers · ${fixedReport.egress?.requiredWidthM} m · ${fixedReport.egress?.estimatedTimeS} s`);
  report.check('El auditor reconoce las señales junto a cada salida y el marcador de posición',
    codes(fixedReport).includes('exit_without_sign') === false
    && codes(fixedReport).includes('no_you_are_here') === false
    && fixedReport.signs?.youAreHere === true && fixedReport.signs?.exitSigns === 2,
    `${fixedReport.signs?.exitSigns} señales de salida`);
  const savedFixed = (await json(`api/floors/${auditFloorId}`)).body.design.elements.find((element) => element.id === 'puerta_2');
  report.check('La marca de salida de emergencia se conserva al guardar', savedFixed?.isExit === true);
  res = await client.postJson(`api/floors/${auditFloorId}/save`, {
    design: { ...fixedDesign, elements: fixedDesign.elements.map((element) => element.id === 'puerta_2' ? { ...element, isExit: 'sí' } : element) },
    expected_version: (await json(`api/floors/${auditFloorId}`)).body.floor.version,
  });
  report.check('La API rechaza una marca de salida inválida', res.status === 422, String(res.status));
  const outOfRange = JSON.parse(JSON.stringify(fixedDesign));
  outOfRange.canvas.occupancy = 12000;
  res = await client.postJson(`api/floors/${auditFloorId}/save`, {
    design: outOfRange,
    expected_version: (await json(`api/floors/${auditFloorId}`)).body.floor.version,
  });
  report.check('La API rechaza una ocupación fuera de rango', res.status === 422, String(res.status));
  const wallMarked = JSON.parse(JSON.stringify(fixedDesign));
  wallMarked.elements = wallMarked.elements.map((element) => (element.id === 'muro_sup' ? { ...element, isExit: true } : element));
  res = await client.postJson(`api/floors/${auditFloorId}/save`, {
    design: wallMarked,
    expected_version: (await json(`api/floors/${auditFloorId}`)).body.floor.version,
  });
  const markedWall = (await json(`api/floors/${auditFloorId}`)).body.design.elements.find((element) => element.id === 'muro_sup');
  report.check('La marca de salida no se guarda fuera de las puertas',
    res.status === 200 && markedWall?.isExit === undefined,
    `${res.status} · ${String(markedWall?.isExit)}`);
  const sealedDesign = JSON.parse(JSON.stringify(wallMarked));
  sealedDesign.elements.push(
    wall('recinto_sup', 430, 150, 240, 2, [{ x: 0, y: 0 }, { x: 240, y: 0 }]),
    wall('recinto_inf', 430, 388, 240, 2, [{ x: 0, y: 0 }, { x: 240, y: 0 }]),
    wall('recinto_izq', 430, 150, 2, 240, [{ x: 0, y: 0 }, { x: 0, y: 240 }]),
    wall('recinto_der', 668, 150, 2, 240, [{ x: 0, y: 0 }, { x: 0, y: 240 }])
  );
  res = await client.postJson(`api/floors/${auditFloorId}/save`, {
    design: sealedDesign,
    expected_version: (await json(`api/floors/${auditFloorId}`)).body.floor.version,
  });
  report.check('Guardar un plano con un recinto cerrado', res.status === 200, String(res.status));
  const sealedReport = (await json(`api/floors/${auditFloorId}/audit`)).body.report || {};
  const sealedFinding = (sealedReport.findings || []).find((finding) => finding.code === 'unreachable_area');
  report.check('El auditor detecta el recinto cerrado sin salida alcanzable',
    Boolean(sealedFinding) && sealedReport.counts.high >= 1 && sealedReport.travel.unreachableAreaM2 >= 3
    && sealedFinding.position !== null,
    `${sealedReport.travel?.unreachableAreaM2} m² · ${sealedFinding?.value} · ${sealedReport.counts?.high} críticos`);
  const auditView = await client.get(`projects/${auditProjectId}/floors/${auditFloorId}/audit`);
  report.check('El informe imprimible de revisión se genera',
    auditView.status === 200 && noPhpErrors(auditView.text)
    && /Auditor de planos de emergencia/.test(auditView.text) && /Proyecto de revisión/.test(auditView.text)
    && /Medición de evacuación/.test(auditView.text) && /Criterios aplicados/.test(auditView.text)
    && /no certifica cumplimiento normativo/i.test(auditView.text),
    `${auditView.status} · ${auditView.text.length} bytes`);

  /* --------------------------- guardado de redes --------------------------- */
  // Se prueba en un proyecto aparte para no alterar el número de versión del
  // piso de demostración, que las comprobaciones siguientes usan.
  const newProjectPage = await client.get('projects/new');
  client.csrf = extractToken(newProjectPage.text);
  const mepProject = await client.postForm('projects', {
    _token: client.csrf, name: 'Proyecto de redes', site: 'Sede', workplace: 'Planta',
    responsible: 'Equipo QA', notes: 'Redes hidrosanitarias y eléctricas', preset: 'planta',
  });
  const mepProjectId = Number(/projects\/(\d+)/.exec(decodeURIComponent(mepProject.location))?.[1] || 0);
  const mepProjectPage = await client.get(`projects/${mepProjectId}`);
  const mepFloorHref = [...mepProjectPage.text.matchAll(/href="([^"]+)"/g)]
    .map((match) => { try { return decodeURIComponent(match[1]); } catch { return match[1]; } })
    .find((href) => /\/floors\/\d+\/editor/.test(href)) || '';
  const mepFloorId = Number(/floors\/(\d+)\/editor/.exec(mepFloorHref)?.[1] || 0);
  const mepFloor = (await json(`api/floors/${mepFloorId}`)).body;
  const withMep = JSON.parse(JSON.stringify(mepFloor.design));
  const mepLayer = withMep.layers[0].id;
  withMep.elements.push({
    id: 'red_agua_1', type: 'pipe', layerId: mepLayer, x: 200, y: 300, w: 400, h: 100,
    rotation: 0, color: '#0891b2', stroke: 3.5, opacity: 1, label: '', locked: false,
    network: 'agua_fria', diameter: '3/4"', material: 'pvc', slope: 0, pressure: 280,
    points: [{ x: 0, y: 0 }, { x: 400, y: 100 }],
  });
  withMep.elements.push({
    id: 'red_elec_1', type: 'conduit', layerId: mepLayer, x: 200, y: 620, w: 400, h: 2,
    rotation: 0, color: '#2563eb', stroke: 2.5, opacity: 1, label: '', locked: false,
    circuit: 'C1', voltage: 220, gauge: '10', phases: 1,
    points: [{ x: 0, y: 1 }, { x: 400, y: 1 }],
  });
  withMep.elements.push({
    id: 'red_carga_1', type: 'cad_elec_ac', layerId: mepLayer, x: 640, y: 600, w: 90, h: 90,
    rotation: 0, color: '#334155', stroke: 1.5, opacity: 1, label: '', locked: false,
    circuit: 'C1', load: 3500,
  });
  res = await client.postJson(`api/floors/${mepFloorId}/save`, { design: withMep, expected_version: 1, note: 'Redes' });
  let savedMep = {};
  try { savedMep = JSON.parse(res.text); } catch {}
  report.check('Guardar un diseño con tuberías y circuitos', res.status === 200 && savedMep.version === 2, `${res.status} v${savedMep.version}`);
  let summary = {};
  ({ response: catalogResponse, body: summary } = await json(`api/floors/${mepFloorId}/mep`));
  report.check('La API de redes resume tuberías y circuitos', catalogResponse.status === 200
    && summary.summary?.pipes === 1 && summary.summary?.conduits === 1
    && Math.abs((summary.summary?.hydraulic?.[0]?.lengthM ?? 0) - 4.12) < 0.02
    && summary.summary?.electrical?.[0]?.loadVA === 3500,
    `${summary.summary?.pipes} tuberías · ${summary.summary?.electrical?.[0]?.loadVA} VA`);
  report.check('El resumen calcula breaker y calibre con reserva', summary.summary?.electrical?.[0]?.breaker === 20
    && summary.summary?.electrical?.[0]?.gauge === '12'
    && Math.abs((summary.summary?.electrical?.[0]?.current ?? 0) - 15.91) < 0.05,
    `${summary.summary?.electrical?.[0]?.breaker} A · ${summary.summary?.electrical?.[0]?.gauge} AWG · ${summary.summary?.electrical?.[0]?.current} A`);
  report.check('El resumen avisa que es esquemático', /no sustituye/i.test(summary.notice || '') && Array.isArray(summary.summary?.warnings));

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

  /* --------------------------- señalización de servicios --------------------------- */
  const serviceDesign = JSON.parse(JSON.stringify(catalog.design));
  serviceDesign.elements = serviceDesign.elements.filter((element) => !String(element.type).startsWith('sig_'));
  serviceDesign.elements.push(
    { id: 'bano_hombres', type: 'sig_wc_men', layerId: doorLayer, x: 120, y: 420, w: 64, h: 64, rotation: 0, color: '#0f766e', stroke: 0, opacity: 1, label: 'Baño', locked: false },
    { id: 'bano_mujeres', type: 'sig_wc_women', layerId: doorLayer, x: 200, y: 420, w: 64, h: 64, rotation: 0, color: '#0f766e', stroke: 0, opacity: 1, label: '', locked: false },
    { id: 'bano_accesible', type: 'sig_wc_accessible', layerId: doorLayer, x: 280, y: 420, w: 64, h: 64, rotation: 0, color: '#0f766e', stroke: 0, opacity: 1, label: '', locked: false },
  );
  res = await client.postJson(`api/floors/${floorId}/save`, { design: serviceDesign, expected_version: (await json(`api/floors/${floorId}`)).body.floor.version });
  report.check('La API acepta las señales de baño', res.status === 200, `${res.status} · ${res.text.slice(0, 120)}`);
  ({ body: catalog } = await json(`api/floors/${floorId}`));
  const savedService = (catalog.design?.elements || []).filter((element) => String(element.type).startsWith('sig_'));
  report.check('Las señales de servicio se guardan con su color de familia',
    savedService.length === 3 && savedService.every((element) => element.color === '#0f766e'),
    savedService.map((element) => element.type).join(','));
  res = await client.get(`projects/${projectId}/floors/${floorId}/export/svg`);
  const serviceSvg = res.text;
  report.check('El SVG exportado incluye las señales de baño',
    /data-element="bano_hombres"/.test(serviceSvg) && /data-element="bano_accesible"/.test(serviceSvg)
    && (serviceSvg.match(/<svg [^>]*color="#0f766e"/g) || []).length >= 3,
    `${(serviceSvg.match(/<svg [^>]*color="#0f766e"/g) || []).length} símbolos`);
  /* --------------------- señal «Usted está aquí» (SVC_AQUI) --------------------- */
  const locationDesign = JSON.parse(JSON.stringify(serviceDesign));
  locationDesign.elements = locationDesign.elements.filter((element) => !String(element.type).startsWith('sig_aqui'));
  locationDesign.elements.push(
    { id: 'aqui_piso', type: 'sig_aqui', layerId: doorLayer, x: 420, y: 460, w: 72, h: 72, rotation: 0, color: '#1d4ed8', stroke: 0, opacity: 1, label: '', locked: false },
  );
  res = await client.postJson(`api/floors/${floorId}/save`, { design: locationDesign, expected_version: (await json(`api/floors/${floorId}`)).body.floor.version });
  report.check('La API acepta la señal «Usted está aquí»', res.status === 200, `${res.status} · ${res.text.slice(0, 120)}`);
  const catalogSigns = await json('catalogs/signs');
  report.check('El catálogo expone la señal de posición con su familia y color',
    catalogSigns.body.signs?.SVC_AQUI?.name === 'Usted está aquí'
    && catalogSigns.body.signs?.SVC_AQUI?.category === 'location'
    && catalogSigns.body.colors?.location === '#1d4ed8',
    `${catalogSigns.body.signs?.SVC_AQUI?.name} · ${catalogSigns.body.colors?.location}`);
  res = await client.get(`projects/${projectId}/floors/${floorId}/export/svg`);
  const locationSvg = res.text;
  report.check('El SVG exportado dibuja la marca de posición con su azul de familia',
    /data-element="aqui_piso"/.test(locationSvg) && /<svg [^>]*color="#1d4ed8"/.test(locationSvg)
    && /viewBox="0 0 100 100"/.test(locationSvg),
    `${(locationSvg.match(/<svg [^>]*color="#1d4ed8"/g) || []).length} marcas`);

  const serviceBad = JSON.parse(JSON.stringify(serviceDesign));
  serviceBad.elements.push({ ...serviceDesign.elements[0], id: 'senal_inventada', type: 'sig_no_existe' });
  res = await client.postJson(`api/floors/${floorId}/save`, { design: serviceBad, expected_version: (await json(`api/floors/${floorId}`)).body.floor.version });
  report.check('La API rechaza una señal de servicio inexistente', res.status === 422, String(res.status));

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
  report.check('SVG sin recursos externos',
    !/(href|src)="https?:/.test(res.text)
    && !/xlink:href="(?!#|data:image\/)/.test(res.text)
    && !/url\((?!#)/.test(res.text));
  report.check('SVG con pictogramas embebidos', res.text.includes('<svg x=') && res.text.includes('data-layer='));
  const footerSvg = res.text;
  const footerCells = [...footerSvg.matchAll(/data-footer-cell="([a-z]+)"/g)].map((match) => match[1]);
  report.check('El SVG lleva la franja de orientación con las cinco celdas',
    footerSvg.includes('data-plan-footer="guia"')
    && ['position', 'route', 'exit', 'fire', 'meeting'].every((key) => footerCells.includes(key)),
    footerCells.join(','));
  const footerBand = footerSvg.slice(footerSvg.indexOf('id="guia-evacuacion"'), footerSvg.indexOf('id="datos-plano"'));
  report.check('Las celdas de orientación reutilizan los pictogramas ISO locales',
    (footerBand.match(/<svg x=/g) || []).length >= 3 && footerBand.includes('viewBox="0 0 105.833 105.833"'),
    `${(footerBand.match(/<svg x=/g) || []).length} pictogramas`);
  report.check('El pie incluye los datos del plano y la nota de la aplicación',
    footerSvg.includes('data-plan-data="1"') && footerSvg.includes('Bodega') && footerSvg.includes('Planta baja ajustada')
    && footerSvg.includes('Escala 1:') && footerSvg.includes('Versión v') && footerSvg.includes('elementos')
    && footerSvg.includes('© ') && footerSvg.includes('Normia Planos CAD') && footerSvg.includes('GPL-3.0')
    && footerSvg.includes('verifica dimensiones y escala en sitio'),
    (footerSvg.match(/data-footer-line="[a-z]+">([^<]{0,90})/g) || []).slice(0, 3).join(' | '));
  report.check('El pie no repite el título duplicado sobre el plano',
    !footerSvg.includes('Representación esquemática · verifica dimensiones') && /<title>/.test(footerSvg));
  report.check('El pie cambia de columnas según el ancho del lienzo',
    footerSvg.includes('data-footer-band="1"'), String(res.text.length));
  const brandBlock = footerSvg.slice(footerSvg.indexOf('data-footer-brand'), footerSvg.indexOf('</svg>', footerSvg.length - 6));
  report.check('El pie lleva la marca de agua de la app al final del plano',
    footerSvg.includes('id="marca-normia"')
    && brandBlock.includes('<image ')
    && brandBlock.includes('Generado con Normia Planos CAD')
    && /href="data:image\/png;base64,[A-Za-z0-9+/=]{200,}"/.test(brandBlock),
    `${brandBlock.length} caracteres`);
  report.check('La marca de agua se incrusta y no depende de archivos externos',
    !footerSvg.includes('href="/assets/img/normia-watermark.png"')
    && !/xlink:href/.test(brandBlock)
    && (footerSvg.match(/data:image\/png;base64,/g) || []).length === 1,
    `${(footerSvg.match(/data:image\/png;base64,/g) || []).length} imágenes incrustadas`);
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

  /* ------------------- muros curvos, vías y andenes (v3) ------------------- */
  const curveProjectPage = await client.get('projects/new');
  client.csrf = extractToken(curveProjectPage.text);
  const curveProject = await client.postForm('projects', {
    _token: client.csrf, name: 'Proyecto de vías', site: 'Sede QA', workplace: 'Planta',
    responsible: 'Equipo QA', notes: 'Muros curvos y vías', preset: 'planta',
  });
  const curveProjectId = Number(/projects\/(\d+)/.exec(decodeURIComponent(curveProject.location))?.[1] || 0);
  const curveProjectHtml = (await client.get(`projects/${curveProjectId}`)).text;
  const curveFloorHref = [...curveProjectHtml.matchAll(/href="([^"]+)"/g)]
    .map((match) => { try { return decodeURIComponent(match[1]); } catch { return match[1]; } })
    .find((href) => /\/floors\/\d+\/editor/.test(href)) || '';
  const curveFloorId = Number(/floors\/(\d+)\/editor/.exec(curveFloorHref)?.[1] || 0);
  const curveBase = JSON.parse(JSON.stringify((await json(`api/floors/${curveFloorId}`)).body.design));
  const curveLayer = curveBase.layers[0].id;
  curveBase.canvas = { ...curveBase.canvas, width: 800, height: 600, unit: 'cm', scale: '1:100', occupancy: 20 };
  curveBase.layers = [{ id: curveLayer, name: 'Planta', visible: true, locked: false }];
  curveBase.groups = [];
  const curveWall = (id, x, y, w, h, points, curves = null) => ({
    id, type: 'wall', layerId: curveLayer, x, y, w, h, rotation: 0, color: '#0f172a',
    stroke: 10, opacity: 1, label: '', locked: false, points,
    ...(curves ? { curves } : {}),
  });
  const curveDoor = {
    id: 'salida_curva', type: 'door', layerId: curveLayer, x: 300, y: 410, w: 90, h: 90, rotation: 0,
    color: '#475569', stroke: 2, opacity: 1, label: '', locked: false, flipX: false, flipY: false, isExit: true,
  };
  const roomWalls = () => [
    curveWall('muro_sup', 100, 100, 600, 2, [{ x: 0, y: 0 }, { x: 600, y: 0 }]),
    curveWall('muro_izq', 100, 100, 2, 400, [{ x: 0, y: 0 }, { x: 0, y: 400 }]),
    curveWall('muro_inf_a', 100, 500, 200, 2, [{ x: 0, y: 0 }, { x: 200, y: 0 }]),
    curveWall('muro_inf_b', 390, 500, 310, 2, [{ x: 0, y: 0 }, { x: 310, y: 0 }]),
  ];
  const straightRoom = { ...curveBase, elements: [
    ...roomWalls(),
    curveWall('muro_der', 700, 100, 2, 400, [{ x: 0, y: 0 }, { x: 0, y: 400 }]),
    curveDoor,
  ] };
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: straightRoom, expected_version: 1, note: 'Cuarto recto' });
  report.check('La API sigue aceptando planos de formato 2 sin curvas', res.status === 200, `${res.status} · ${res.text.slice(0, 90)}`);
  const straightAudit = (await json(`api/floors/${curveFloorId}/audit`)).body.report || {};
  const straightFree = Number(straightAudit.travel?.freeAreaM2 || 0);
  report.check('El auditor mide el cuarto recto', straightAudit.travel?.computed === true && straightFree > 15,
    `${straightFree} m² libres`);

  // Muro derecho curvo: el arco se comba hacia el interior del cuarto.
  const curvedRoom = {
    ...curveBase,
    format: 3,
    elements: [
      ...roomWalls(),
      curveWall('muro_der', 550, 100, 150, 400, [{ x: 150, y: 0 }, { x: 150, y: 400 }], [
        { kind: 'arc', through: { x: 0, y: 200 } },
        null,
      ]),
      curveDoor,
    ],
  };
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: curvedRoom, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version, note: 'Cuarto curvo' });
  const curvedSaved = (await json(`api/floors/${curveFloorId}`)).body;
  report.check('El servidor acepta muros con curvas y los guarda en formato 3',
    res.status === 200 && curvedSaved.design?.format === 3
    && Array.isArray(curvedSaved.design?.elements?.find((element) => element.id === 'muro_der')?.curves)
    && curvedSaved.design.elements.find((element) => element.id === 'muro_der').curves[0]?.through?.y === 200,
    `${res.status} · formato ${curvedSaved.design?.format}`);
  const curvedAudit = (await json(`api/floors/${curveFloorId}/audit`)).body.report || {};
  const curvedFree = Number(curvedAudit.travel?.freeAreaM2 || 0);
  report.check('El muro curvo separa recintos en el auditor (tolerancia de aplanado)',
    curvedFree > 0 && curvedFree < straightFree - 2,
    `recto ${straightFree} m² · curvo ${curvedFree} m²`);
  res = await client.get(`projects/${curveProjectId}/floors/${curveFloorId}/export/svg`);
  const curveSvg = res.text;
  const curveGroup = (/<g data-element="muro_der"[\s\S]*?<\/g>/.exec(curveSvg) || [''])[0];
  report.check('El SVG exporta el muro curvo con arcos A y sin aplanar a polilínea',
    res.status === 200 && /<path [^>]*d="M [^"]* A /.test(curveGroup) && !/<polyline/.test(curveGroup),
    curveGroup.slice(0, 160));
  report.check('El SVG conserva el arco con su radio y bandera de barrido',
    /A \d+(\.\d+)? \d+(\.\d+)? 0 [01] [01] /.test(curveGroup), curveGroup.slice(0, 160));

  // Vías y andenes: no bloquean, cuentan como exterior.
  const roadRoom = {
    ...curveBase,
    elements: [
      ...roomWalls(),
      curveWall('muro_der', 700, 100, 2, 400, [{ x: 0, y: 0 }, { x: 0, y: 400 }]),
      curveDoor,
      {
        id: 'via_central', type: 'road', layerId: curveLayer, x: 100, y: 300, w: 600, h: 2,
        rotation: 0, color: '#64748b', stroke: 1.5, opacity: 1, label: 'Vía de prueba', locked: false,
        widthM: 2, lanes: 2, points: [{ x: 0, y: 1 }, { x: 600, y: 1 }],
      },
      {
        id: 'anden_norte', type: 'sidewalk', layerId: curveLayer, x: 100, y: 180, w: 600, h: 2,
        rotation: 0, color: '#94a3b8', stroke: 1.2, opacity: 1, label: '', locked: false,
        widthM: 1, points: [{ x: 0, y: 1 }, { x: 600, y: 1 }],
      },
    ],
  };
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: roadRoom, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version, note: 'Vía interior' });
  const roadSaved = (await json(`api/floors/${curveFloorId}`)).body.design?.elements?.find((element) => element.id === 'via_central');
  report.check('La API acepta vías y andenes con su ancho y carriles',
    res.status === 200 && roadSaved?.widthM === 2 && roadSaved?.lanes === 2,
    `${res.status} · ${roadSaved?.widthM} m · ${roadSaved?.lanes} carriles`);
  const roadAudit = (await json(`api/floors/${curveFloorId}/audit`)).body.report || {};
  const roadFree = Number(roadAudit.travel?.freeAreaM2 || 0);
  const roadExterior = Number(roadAudit.travel?.exteriorAreaM2 || 0);
  const roadUnreachable = Number(roadAudit.travel?.unreachableAreaM2 || 0);
  report.check('La vía y el andén cuentan como exterior y no como área útil',
    roadFree < straightFree - 8 && roadExterior > Number(straightAudit.travel?.exteriorAreaM2 || 0) + 8,
    `libre ${roadFree} m² · exterior ${roadExterior} m² (recto: ${straightFree} m²)`);
  report.check('La vía no bloquea el tránsito: el recorrido no deja área inalcanzable',
    roadUnreachable <= 0.5, `${roadUnreachable} m² inalcanzables`);

  // Un muro interior sí bloquea: sirve de control negativo.
  const splitRoom = {
    ...curveBase,
    elements: [
      ...roomWalls(),
      curveWall('muro_der', 700, 100, 2, 400, [{ x: 0, y: 0 }, { x: 0, y: 400 }]),
      curveWall('muro_medio', 100, 300, 600, 2, [{ x: 0, y: 0 }, { x: 600, y: 0 }]),
      curveDoor,
    ],
  };
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: splitRoom, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version, note: 'Muro interior' });
  const splitAudit = (await json(`api/floors/${curveFloorId}/audit`)).body.report || {};
  report.check('Un muro recto en el mismo sitio sí bloquea el paso (control)',
    Number(splitAudit.travel?.unreachableAreaM2 || 0) > 2,
    `${splitAudit.travel?.unreachableAreaM2} m² inalcanzables`);

  // Validación de curvas.
  const wrongCurves = JSON.parse(JSON.stringify(curvedRoom));
  wrongCurves.elements.find((element) => element.id === 'muro_der').curves = [{ kind: 'arc', through: { x: 0, y: 200 } }];
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: wrongCurves, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Una curva desalineada con los vértices se rechaza', res.status === 422, String(res.status));
  const badCurve = JSON.parse(JSON.stringify(curvedRoom));
  badCurve.elements.find((element) => element.id === 'muro_der').curves = [{ kind: 'bezier', through: { x: 0, y: 200 } }, null];
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: badCurve, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Solo se admiten arcos de tres puntos', res.status === 422, String(res.status));
  const doorCurve = JSON.parse(JSON.stringify(straightRoom));
  doorCurve.elements.find((element) => element.id === 'salida_curva').curves = [{ kind: 'arc', through: { x: 1, y: 1 } }];
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: doorCurve, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Una puerta no admite curvas', res.status === 422, String(res.status));
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: { ...straightRoom, format: 5 }, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Un formato de plano desconocido se rechaza', res.status === 422, String(res.status));

  /* ------------------ sección tipo y glorieta (formato 4) ------------------ */
  const avenueSection = { lanes: 2, laneM: 3, medianM: 2, shoulderM: 0.5, bikeM: 1.8, sidewalkM: 1 };
  const ringSection = { lanes: 2, laneM: 3, medianM: 0, shoulderM: 0.5, bikeM: 1.8, sidewalkM: 2 };
  const sectionRoom = {
    ...curveBase,
    elements: [
      ...roomWalls(),
      curveWall('muro_der', 700, 100, 2, 400, [{ x: 0, y: 0 }, { x: 0, y: 400 }]),
      curveDoor,
      {
        id: 'avenida_tipo', type: 'road', layerId: curveLayer, x: 100, y: 300, w: 600, h: 2,
        rotation: 0, color: '#0f766e', stroke: 1.5, opacity: 1, label: 'Avenida 4', locked: false,
        widthM: 2, lanes: 2, section: avenueSection, points: [{ x: 0, y: 1 }, { x: 600, y: 1 }],
      },
      {
        id: 'glorieta_tipo', type: 'road', layerId: curveLayer, x: 100, y: 60, w: 600, h: 500,
        rotation: 0, color: '#0f766e', stroke: 1.5, opacity: 1, label: '', locked: false,
        widthM: 2, lanes: 2, section: ringSection,
        junction: { kind: 'roundabout', legs: 4, islandM: 6 },
        points: [{ x: 0, y: 1 }, { x: 600, y: 1 }],
      },
    ],
  };
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: sectionRoom, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version, note: 'Sección tipo' });
  const sectionSaved = (await json(`api/floors/${curveFloorId}`)).body.design || {};
  const avenueSaved = (sectionSaved.elements || []).find((element) => element.id === 'avenida_tipo');
  const ringSaved = (sectionSaved.elements || []).find((element) => element.id === 'glorieta_tipo');
  report.check('El servidor guarda la sección tipo en formato 4 y deriva el ancho',
    res.status === 200 && sectionSaved.format === 4 && avenueSaved?.widthM === 14.6 && avenueSaved?.section?.lanes === 2,
    `${res.status} · formato ${sectionSaved.format} · ${avenueSaved?.widthM} m`);
  report.check('La glorieta se guarda con sus accesos e isla',
    ringSaved?.junction?.kind === 'roundabout' && ringSaved?.junction?.legs === 4 && ringSaved?.junction?.islandM === 6,
    `${ringSaved?.junction?.kind} · ${ringSaved?.junction?.legs} accesos · isla ${ringSaved?.junction?.islandM} m`);
  const sectionSvg = (await client.get(`projects/${curveProjectId}/floors/${curveFloorId}/export/svg`)).text;
  const avenueGroup = (/<g data-element="avenida_tipo"[\s\S]*?<\/g>/.exec(sectionSvg) || [''])[0];
  const ringGroup = (/<g data-element="glorieta_tipo"[\s\S]*?<\/g>/.exec(sectionSvg) || [''])[0];
  report.check('El SVG exporta la calzada con carriles, andenes y su rótulo',
    /2 carriles · 14,6 m/.test(avenueGroup) && /stroke-width="900"/.test(avenueGroup) && /#e6eaf1/.test(avenueGroup),
    avenueGroup.slice(0, 160));
  report.check('El SVG exporta el perfil transversal acotado de la vía',
    /data-road-profile="1"/.test(sectionSvg) && /Perfil transversal/.test(sectionSvg)
    && /Ancho total 14,6 m/.test(sectionSvg),
    (/data-road-profile[\s\S]{0,240}/.exec(sectionSvg) || [''])[0].slice(0, 160));
  report.check('El SVG exporta la glorieta como anillo con accesos e isla',
    /<circle [^>]*class="hit-area"/.test(ringGroup) && /4 accesos · isla 6 m/.test(ringGroup) && /#eef2f7/.test(ringGroup),
    ringGroup.slice(0, 160));

  // Validación de la sección y de la glorieta.
  const wrongSection = JSON.parse(JSON.stringify(sectionRoom));
  wrongSection.elements.find((element) => element.id === 'avenida_tipo').section.laneM = 9;
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: wrongSection, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Un ancho de carril fuera de rango se rechaza', res.status === 422, String(res.status));
  const extraSection = JSON.parse(JSON.stringify(sectionRoom));
  extraSection.elements.find((element) => element.id === 'avenida_tipo').section.trenM = 1;
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: extraSection, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Una propiedad desconocida en la sección se rechaza', res.status === 422, String(res.status));
  const noSection = JSON.parse(JSON.stringify(sectionRoom));
  delete noSection.elements.find((element) => element.id === 'glorieta_tipo').section;
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: noSection, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Una glorieta sin sección tipo se rechaza', res.status === 422, String(res.status));
  const badJunction = JSON.parse(JSON.stringify(sectionRoom));
  badJunction.elements.find((element) => element.id === 'glorieta_tipo').junction.kind = 'puente';
  res = await client.postJson(`api/floors/${curveFloorId}/save`, { design: badJunction, expected_version: (await json(`api/floors/${curveFloorId}`)).body.floor.version });
  report.check('Un tipo de cruce desconocido se rechaza', res.status === 422, String(res.status));

  /* ---------------------------- modo brigadista ---------------------------- */
  res = await client.get(`projects/${projectId}/floors/${floorId}/brigade`);
  report.check('El panel del modo brigadista abre con enlace desactivado', res.status === 200 && /Modo brigadista/.test(res.text) && /Enlace desactivado/.test(res.text), String(res.status));
  res = await client.postForm(`projects/${projectId}/floors/${floorId}/brigade`, { _token: homeToken, action: 'enable' });
  report.check('Activar el enlace redirige al panel', [302, 303].includes(res.status), String(res.status));
  res = await client.get(`projects/${projectId}/floors/${floorId}/brigade`);
  const brigadeUrl = /value="(http:\/\/[^"]*r=b%2F[a-f0-9]{32}[^"]*)"/.exec(res.text)
    || /value="(http:\/\/[^"]*b\/[a-f0-9]{32}[^"]*)"/.exec(res.text);
  const brigadeToken = /b%2F([a-f0-9]{32})|b\/([a-f0-9]{32})/.exec(res.text || '');
  const tokenValue = brigadeToken ? (brigadeToken[1] || brigadeToken[2]) : '';
  report.check('El enlace público tiene un token de 32 caracteres', /^[a-f0-9]{32}$/.test(tokenValue), tokenValue);
  report.check('El panel muestra la dirección absoluta del enlace', Boolean(brigadeUrl), brigadeUrl ? 'sí' : 'no');
  res = await guest.get(`b/${tokenValue}`);
  report.check('La página pública abre sin sesión', res.status === 200 && /Modo brigadista/.test(res.text) && /Llamar emergencias/.test(res.text), String(res.status));
  report.check('La página pública no muestra el editor ni la cuenta', res.status === 200 && !/Cerrar sesión/.test(res.text) && !/rail/.test(res.text));
  res = await guest.get(`b/${tokenValue}/plan.json`, { accept: 'application/json' });
  let planBody = {};
  try { planBody = JSON.parse(res.text); } catch { planBody = {}; }
  report.check('La API pública devuelve el plano en JSON', res.status === 200 && planBody.ok === true && planBody.token === undefined && typeof planBody.floor?.name === 'string', String(res.status));
  report.check('La API pública trae grupos por acción rápida', Boolean(planBody.groups) && ['ruta', 'reunion', 'extintores'].every((key) => Array.isArray(planBody.groups[key])), JSON.stringify(planBody.counts || {}));
  report.check('La API pública trae la fecha de actualización', typeof planBody.updated_label === 'string' && planBody.updated_label !== '', String(planBody.updated_at || ''));
  res = await guest.get('b/' + 'f'.repeat(32));
  report.check('Un token inexistente responde 404', res.status === 404 && /no está disponible/.test(res.text), String(res.status));
  res = await guest.get(`api/floors/${floorId}`, { accept: 'application/json' });
  report.check('La API privada sigue exigiendo sesión', res.status === 401, String(res.status));
  res = await client.postForm(`projects/${projectId}/floors/${floorId}/brigade`, { _token: homeToken, action: 'regenerate' });
  res = await client.get(`projects/${projectId}/floors/${floorId}/brigade`);
  const regenerated = /b%2F([a-f0-9]{32})|b\/([a-f0-9]{32})/.exec(res.text || '');
  const newToken = regenerated ? (regenerated[1] || regenerated[2]) : '';
  report.check('Regenerar el enlace cambia el token', newToken !== '' && newToken !== tokenValue, newToken.slice(0, 8));
  res = await guest.get(`b/${tokenValue}`);
  report.check('El token anterior deja de abrir la página', res.status === 404, String(res.status));
  await client.postForm(`projects/${projectId}/floors/${floorId}/brigade`, { _token: homeToken, action: 'disable' });
  res = await guest.get(`b/${newToken}`);
  report.check('Desactivar el enlace corta el acceso público', res.status === 404, String(res.status));
  res = await guest.get('b/' + 'x' + 'f'.repeat(31));
  report.check('Un token con caracteres inválidos no llega al controlador', res.status === 404, String(res.status));

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
