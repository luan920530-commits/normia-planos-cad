/*
 * Pruebas de las páginas fuera del editor (Mis planos y ficha del proyecto):
 * menú de acciones, borrado de proyectos y de pisos, y confirmación previa.
 *
 * El HTML viene de la aplicación PHP real; ui.js y app.js se ejecutan en JSDOM
 * igual que en el navegador. El menú debe salir de la tarjeta (que recorta su
 * contenido) y montarse en la capa fija del <body>.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { startApp, extractToken, repoRoot } from '../php/harness.mjs';
import { makeReporter } from './boot.mjs';

const VERSION = process.argv[2] || '8.3';
const report = makeReporter(`Páginas/PHP ${VERSION}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Carga una página real de la aplicación y ejecuta los scripts de interfaz. */
function openPage(client, route) {
  return client.get(route, { accept: 'text/html' }).then((response) => {
    if (response.status !== 200) throw new Error(`No se pudo cargar ${route} (${response.status}).`);
    const dom = new JSDOM(response.text, {
      url: new URL(route, 'http://127.0.0.1').href,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const { window } = dom;
    window.__errors = [];
    window.addEventListener('error', (event) => window.__errors.push(String(event.message)));
    window.addEventListener('unhandledrejection', (event) => window.__errors.push(String(event.reason)));
    for (const file of ['js/ui.js', 'js/app.js']) {
      window.eval(`${fs.readFileSync(path.join(repoRoot, 'assets', file), 'utf8')}\n//# sourceURL=${file}`);
    }
    window.NormiaUI.init();
    return { window, response, html: response.text };
  });
}

/** JSDOM no calcula maquetación: se le da una caja realista al botón. */
function placeAt(element, box) {
  element.getBoundingClientRect = () => ({
    ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top,
  });
  return element;
}

const $ = (window, selector) => window.document.querySelector(selector);
const $$ = (window, selector) => Array.from(window.document.querySelectorAll(selector));
const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

async function main() {
  const runtime = await startApp(VERSION);
  const client = runtime.client;
  try {
    await runtime.install({ demo: true });
    await runtime.login('admin@normia.local', 'ClaveSegura2026');

    /* --------------------- un segundo proyecto de apoyo --------------------- */
    let page = await client.get('projects/new');
    client.csrf = extractToken(page.text);
    const created = await client.postForm('projects', {
      _token: client.csrf, name: 'Proyecto secundario', site: 'Sede 2', workplace: 'Bodega 2',
      responsible: 'Equipo QA', notes: '', preset: 'a4h',
    });
    const secondId = Number(/projects\/(\d+)/.exec(decodeURIComponent(created.location))?.[1] || 0);
    report.check('Hay dos proyectos para comparar menús', secondId > 0, String(secondId));

    /* ---------------------------- Mis planos ---------------------------- */
    const dashboard = await openPage(client, '');
    const { window } = dashboard;
    const doc = window.document;
    report.check('El panel titula la biblioteca de planos', /Biblioteca de planos/.test(text($(window, 'h2'))));
    const cards = $$(window, '.project-card');
    report.check('Cada proyecto se muestra en su tarjeta', cards.length === 2, `${cards.length} tarjetas`);

    const firstToggle = $(window, '.project-card [data-menu-toggle]');
    const firstMenu = $(window, '.project-card .menu');
    report.check('La flecha del proyecto empieza cerrada',
      Boolean(firstToggle) && firstToggle.getAttribute('aria-expanded') === 'false'
      && firstMenu?.hidden === true && firstToggle.getAttribute('aria-haspopup') === 'true');
    report.check('La tarjeta recorta su contenido (causa del menú invisible)',
      /overflow:\s*hidden/.test(cards[0].getAttribute('style') || '') === false);

    placeAt(firstToggle, { top: 360, bottom: 396, left: 260, right: 296 });
    firstToggle.click();
    const layerMenu = $(window, '[data-menu-layer] .menu');
    report.check('La flecha abre un menú visible',
      firstToggle.getAttribute('aria-expanded') === 'true' && layerMenu !== null && layerMenu.hidden === false);
    report.check('El menú se monta fuera de la tarjeta y no queda recortado',
      Boolean(layerMenu) && firstMenu.parentElement === $(window, '[data-menu-layer]')
      && !cards[0].contains(layerMenu) && layerMenu.closest('.project-card') === null);
    report.check('El menú se coloca junto al botón y dentro de la ventana',
      layerMenu?.style.position !== 'absolute'
      && parseInt(layerMenu.style.top, 10) >= 0 && parseInt(layerMenu.style.left, 10) >= 0
      && parseInt(layerMenu.style.top, 10) < window.innerHeight,
      `top ${layerMenu?.style.top} · left ${layerMenu?.style.left} · ${layerMenu?.dataset.menuPlacement}`);
    const items = $$(window, '[data-menu-layer] .menu-item').map(text);
    report.check('El menú ofrece editar, duplicar y eliminar el proyecto',
      items.some((item) => /Duplicar proyecto/.test(item)) && items.some((item) => /Eliminar proyecto/.test(item))
      && items.some((item) => /Editar datos/.test(item)),
      items.join(' | '));
    const deleteForm = $(window, '[data-menu-layer] .menu form[data-confirm]');
    report.check('Eliminar proyecto pide confirmación y lleva su token',
      Boolean(deleteForm) && /\/delete$/.test(decodeURIComponent(deleteForm.getAttribute('action') || ''))
      && Boolean(deleteForm.querySelector('input[name="_token"]'))
      && /«/.test(deleteForm.getAttribute('data-confirm') || ''),
      deleteForm?.getAttribute('data-confirm'));

    const secondToggle = placeAt($$(window, '.project-card [data-menu-toggle]')[1], { top: 360, bottom: 396, left: 620, right: 656 });
    secondToggle.click();
    report.check('Solo hay un menú abierto a la vez',
      $$(window, '[data-menu-layer] .menu').length === 1
      && firstToggle.getAttribute('aria-expanded') === 'false'
      && secondToggle.getAttribute('aria-expanded') === 'true');

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    report.check('Escape cierra el menú y devuelve el foco a la flecha',
      $$(window, '[data-menu-layer] .menu').length === 0
      && secondToggle.getAttribute('aria-expanded') === 'false'
      && doc.activeElement === secondToggle
      && Boolean($(window, '.project-card .menu')));

    secondToggle.click();
    doc.body.click();
    report.check('Un clic fuera del menú lo cierra',
      $$(window, '[data-menu-layer] .menu').length === 0 && secondToggle.getAttribute('aria-expanded') === 'false');

    secondToggle.click();
    secondToggle.click();
    report.check('La flecha también cierra el menú al pulsarla de nuevo',
      $$(window, '[data-menu-layer] .menu').length === 0 && secondToggle.getAttribute('aria-expanded') === 'false');

    /* ---------------------- confirmación del formulario ---------------------- */
    const projectPage = await openPage(client, `projects/${secondId}`);
    const confirmForm = $(projectPage.window, '.project-head-actions form[data-confirm]');
    report.check('La ficha del proyecto tiene un botón visible para eliminarlo',
      Boolean(confirmForm) && /\/delete$/.test(decodeURIComponent(confirmForm.getAttribute('action') || ''))
      && Boolean(confirmForm.querySelector('.button-danger')));
    let submits = 0;
    confirmForm.submit = () => { submits += 1; };
    projectPage.window.NormiaUI.confirm = () => Promise.resolve(false);
    confirmForm.dispatchEvent(new projectPage.window.Event('submit', { bubbles: true, cancelable: true }));
    await sleep(20);
    const cancelled = submits === 0;
    projectPage.window.NormiaUI.confirm = () => Promise.resolve(true);
    confirmForm.dispatchEvent(new projectPage.window.Event('submit', { bubbles: true, cancelable: true }));
    await sleep(30);
    report.check('Cancelar en el diálogo no envía; confirmar sí envía el borrado',
      cancelled && submits === 1, `envíos ${submits}`);
    report.check('La ficha no registra errores de JavaScript', projectPage.window.__errors.length === 0,
      projectPage.window.__errors.join(' | ').slice(0, 160));

    /* --------------------------- menús de los pisos --------------------------- */
    // El proyecto de demostración tiene cuatro pisos: sirve para ver el menú
    // completo y para borrar uno de verdad sin tocar el proyecto de un piso.
    const floorPage = await openPage(client, 'projects/1');
    const demoFloorCount = Number((floorPage.html.match(/class="floor-card/g) || []).length);
    const floorWindow = floorPage.window;
    const floorToggle = placeAt($(floorWindow, '.floor-card [data-menu-toggle]'), { top: 520, bottom: 556, left: 700, right: 736 });
    report.check('Cada piso ofrece su propio menú de acciones', Boolean(floorToggle));
    floorToggle.click();
    const floorMenu = $(floorWindow, '[data-menu-layer] .menu');
    const floorItems = $$(floorWindow, '[data-menu-layer] .menu-item').map(text);
    const firstFloorCard = $(floorWindow, '.floor-card');
    report.check('El menú del piso se abre fuera de la tarjeta',
      Boolean(floorMenu) && floorMenu.parentElement === $(floorWindow, '[data-menu-layer]')
      && !firstFloorCard.contains(floorMenu) && floorMenu.closest('.floor-card') === null);
    report.check('El proyecto de demostración tiene varios pisos', demoFloorCount >= 4, String(demoFloorCount));
    report.check('El menú del piso reúne imprimir, exportar, duplicar y eliminar',
      floorItems.some((item) => /Imprimir o PDF/.test(item))
      && floorItems.some((item) => /Exportar JSON/.test(item))
      && floorItems.some((item) => /Duplicar piso/.test(item))
      && floorItems.some((item) => /Eliminar piso/.test(item)),
      floorItems.join(' | '));
    const floorDelete = $(floorWindow, '[data-menu-layer] .menu form[data-confirm]');
    report.check('Eliminar piso pide confirmación con el nombre del plano',
      Boolean(floorDelete) && /floors\/\d+\/delete$/.test(decodeURIComponent(floorDelete.getAttribute('action') || ''))
      && /«/.test(floorDelete.getAttribute('data-confirm') || ''));
    report.check('El menú del piso enlaza al informe de revisión',
      floorItems.some((item) => /Informe de revisión/.test(item)));

    /* ------------------- un proyecto con un solo piso no borra ------------------- */
    page = await client.get('projects/new');
    client.csrf = extractToken(page.text);
    const single = await client.postForm('projects', {
      _token: client.csrf, name: 'Proyecto de un piso', site: '', workplace: '', responsible: '', notes: '', preset: 'a4h',
    });
    const singleId = Number(/projects\/(\d+)/.exec(decodeURIComponent(single.location))?.[1] || 0);
    const singlePage = await openPage(client, `projects/${singleId}`);
    const singleToggle = placeAt($(singlePage.window, '.floor-card [data-menu-toggle]'), { top: 520, bottom: 556, left: 700, right: 736 });
    singleToggle.click();
    const singleMenu = $(singlePage.window, '[data-menu-layer] .menu');
    report.check('El único piso explica por qué no se puede borrar',
      singleMenu !== null && $(singlePage.window, '[data-menu-layer] .menu-item-danger') === null
      && /al menos uno/.test(text(singleMenu)),
      text(singleMenu).slice(0, 90));
    singlePage.window.dispatchEvent(new singlePage.window.KeyboardEvent('keydown', { key: 'Escape' }));

    /* ------------------------- borrado real de un piso ------------------------- */
    const beforeFloors = demoFloorCount;
    const decodedFloorHtml = decodeURIComponent(floorPage.html);
    const floorIds = [...new Set(Array.from(decodedFloorHtml.matchAll(/floors\/(\d+)\/editor/g)).map((match) => Number(match[1])))];
    client.csrf = extractToken(floorPage.html);
    const removed = await client.postForm(`projects/1/floors/${floorIds[floorIds.length - 1]}/delete`, { _token: client.csrf });
    const afterPage = await openPage(client, 'projects/1');
    const afterFloors = Number((afterPage.html.match(/class="floor-card/g) || []).length);
    report.check('Eliminar el piso lo quita de la lista y avisa',
      [302, 303].includes(removed.status) && afterFloors === beforeFloors - 1
      && /Piso eliminado/.test(decodeURIComponent(afterPage.html)),
      `${beforeFloors} → ${afterFloors} · ${removed.status}`);

    /* ------------------------ borrado real de un proyecto ------------------------ */
    const deleteProject = await client.postForm(`projects/${secondId}/delete`, { _token: client.csrf });
    const dashboardAfter = await openPage(client, '');
    report.check('Eliminar el proyecto devuelve a Mis planos con aviso',
      [302, 303].includes(deleteProject.status)
      && /Proyecto eliminado/.test(decodeURIComponent(dashboardAfter.html))
      && !/Proyecto secundario/.test(dashboardAfter.html),
      `${deleteProject.status} · ${deleteProject.location}`);
    report.check('El proyecto eliminado ya no existe', (await client.get(`projects/${secondId}`)).status === 422);

    /* -------------------- el último piso sigue protegido -------------------- */
    const lastFloorHref = /floors\/(\d+)\/editor/.exec(decodeURIComponent(singlePage.html))?.[1] || '0';
    const refused = await client.postForm(`projects/${singleId}/floors/${lastFloorHref}/delete`, { _token: client.csrf });
    const singleAfter = await openPage(client, `projects/${singleId}`);
    report.check('El servidor protege el último piso con un aviso claro',
      [302, 303].includes(refused.status)
      && Number((singleAfter.html.match(/class="floor-card/g) || []).length) === 1
      && /al menos un piso/.test(decodeURIComponent(singleAfter.html)),
      refused.status);

    report.check('Las páginas no registran errores de JavaScript',
      [dashboard.window, floorWindow, singlePage.window, dashboardAfter.window, singleAfter.window].every((win) => win.__errors.length === 0),
      [dashboard.window, floorWindow, singlePage.window, dashboardAfter.window, singleAfter.window].map((win) => win.__errors.join(' | ')).join(' | ').slice(0, 200));
  } finally {
    await runtime.close();
  }
}

main()
  .then(() => {
    const failed = report.summary();
    process.exitCode = failed === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error('\nLa suite de páginas se detuvo:', error);
    report.summary();
    process.exitCode = 1;
  });
