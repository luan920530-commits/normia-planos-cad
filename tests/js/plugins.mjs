/*
 * Complementos (plugins) del lado del navegador.
 *
 * Comprueba que un tipo `plg_…` —una señal que aporta un complemento— se
 * traduce a su código `PLG_…`, que la biblioteca lo lista con su familia y su
 * color aunque el color no esté en la paleta base, que el buscador encuentra sus
 * sinónimos y que el modelo lo acepta como tipo conocido (inserción, guardado y
 * exportación). No usa PHP: son las reglas del editor, aisladas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const resultados = [];
const check = (nombre, condicion, detalle = '') => {
  const ok = Boolean(condicion);
  resultados.push({ nombre, ok });
  console.log(`${ok ? '✓' : '✗'} [Complementos] ${nombre}${detalle ? ` · ${detalle}` : ''}`);
  return ok;
};

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#7c3aed"/><circle cx="50" cy="50" r="18" fill="#fff"/></svg>';

const CODE = 'PLG_ACME_SENALIZACION_DUCHA_EMERGENCIA';
const TYPE = 'plg_acme_senalizacion_ducha_emergencia';
const CAD = 'cad_labo_equipos_tanque_agua';

const catalogs = {
  signs: {
    E002: { name: 'Salida de emergencia', category: 'emergency', description: 'Salida a lugar seguro.', svg, aliases: [] },
    SVC_WC_MEN: { name: 'Baño de hombres', category: 'services', description: 'Servicio sanitario.', svg, aliases: ['wc'] },
    [CODE]: {
      name: 'Ducha de emergencia',
      category: 'laboratorio',
      description: 'Ducha para enjuague tras contacto con sustancias.',
      svg,
      aliases: ['lavaojos', 'derrame', 'quimico'],
    },
  },
  signCategories: {
    emergency: { label: 'Evacuación', short: 'Evacuación', color: '#237f52' },
    services: { label: 'Servicios', short: 'Servicios', color: '#0f766e' },
    // Familia que solo existe porque la trae un complemento.
    laboratorio: { label: 'Laboratorio y sustancias', short: 'Laboratorio', color: '#7c3aed' },
  },
  signColors: { emergency: '#237f52', services: '#0f766e' },
  cad: {
    [CAD]: { name: 'Tanque de agua', category: 'laboratorio', description: 'Tanque elevado.', color: '#0f766e', svg },
  },
  cadCategories: { laboratorio: { label: 'Laboratorio', short: 'Laboratorio', color: '#7c3aed' } },
  aliases: { search: {} },
  mep: null,
};

const design = {
  canvas: { width: 1200, height: 800, grid: 20, unit: 'cm' },
  layers: [{ id: 'capa_planta', name: 'Planta', visible: true, locked: false }],
  elements: [],
};

const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
  url: 'http://127.0.0.1/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
const errores = [];
window.addEventListener('error', (event) => errores.push(String(event.message)));

for (const file of ['js/lib/geometry.js', 'js/lib/model.js', 'js/lib/renderer.js', 'js/editor/library.js']) {
  const fuente = fs.readFileSync(path.join(root, 'assets', file), 'utf8');
  window.eval(`${fuente}\n//# sourceURL=${file}`);
}

const { Normia } = window;
const model = new Normia.Model(design, catalogs);
const renderer = new Normia.Renderer(null, catalogs);
const library = new Normia.Library({ catalogs, model, renderer });

/* ------------------------------ tipos ------------------------------ */
check('El código del complemento se traduce a su tipo', model.typeForSignCode(CODE) === TYPE, model.typeForSignCode(CODE));
check('El tipo del complemento vuelve a su código', model.signCodeForType(TYPE) === CODE, String(model.signCodeForType(TYPE)));
check('Un tipo de complemento ausente no se da por válido', model.signCodeForType('plg_acme_senalizacion_no_existe') === null);
check('El tipo del complemento cuenta como conocido', model.isKnownType(TYPE) && model.isKnownType(CAD));
check('Un tipo inventado sigue siendo desconocido', !model.isKnownType('plg_') && !model.isKnownType('cad_inventado'));
check('Las señales ISO y propias no cambian de código',
  model.typeForSignCode('E002') === 'iso_e002' && model.typeForSignCode('SVC_WC_MEN') === 'sig_wc_men');

/* ------------------------------ color y tamaño ------------------------------ */
check('El color de la señal viene de su familia de complemento', model.signCategoryColor(CODE) === '#7c3aed', model.signCategoryColor(CODE));
const porDefecto = model.defaultFor(TYPE);
check('Una señal de complemento se inserta 64×64 y con el color de su familia',
  porDefecto.w === 64 && porDefecto.h === 64 && porDefecto.color === '#7c3aed' && porDefecto.stroke === 0,
  `${porDefecto.w}×${porDefecto.h} · ${porDefecto.color}`);
check('Un equipo de complemento se inserta con su color', model.defaultFor(CAD).color === '#0f766e');

/* ------------------------------ renderizador ------------------------------ */
check('El renderizador reconoce el código del complemento', renderer.signTypeToCode(TYPE) === CODE, String(renderer.signTypeToCode(TYPE)));
check('El renderizador reconoce el dibujo del complemento', Boolean(renderer.sourceFor(TYPE)), 'svg del complemento');

/* ------------------------------ biblioteca ------------------------------ */
library.kind = 'sign';
library.buildItems();
const ducha = library.items.find((item) => item.code === CODE);
check('La biblioteca lista la señal del complemento', Boolean(ducha) && ducha.type === TYPE, ducha ? ducha.type : 'ausente');
check('La señal del complemento trae el nombre de su familia', ducha?.familyName === 'Laboratorio y sustancias', ducha?.familyName);
check('La señal del complemento toma el color de la familia', ducha?.color === '#7c3aed', ducha?.color);
library.query = 'lavaojos';
check('El buscador encuentra los sinónimos del complemento',
  library.filtered().length === 1 && library.filtered()[0].code === CODE,
  String(library.filtered().length));
library.query = '';
library.family = 'laboratorio';
check('La familia del complemento filtra sus señales', library.filtered().length === 1 && library.filtered()[0].code === CODE);
library.family = 'all';
library.query = '';
const total = library.items.length;
check('Las señales base siguen estando', total === 3 && library.items.some((item) => item.code === 'E002'), String(total));

/* ------------------------------ guardado ------------------------------ */
model.addElement(TYPE, { x: 100, y: 100 });
const guardado = model.serialize();
const elemento = guardado.elements.find((item) => item.type === TYPE);
check('El plano guarda el elemento del complemento con su color',
  Boolean(elemento) && elemento.color === '#7c3aed', elemento ? elemento.color : 'ausente');
const reabierto = new Normia.Model(JSON.parse(JSON.stringify(guardado)), catalogs);
check('Al reabrir, el elemento del complemento sigue siendo válido',
  reabierto.isKnownType(reabierto.design.elements.find((item) => item.type === TYPE)?.type || ''));

/* ------------------------------ cierre ------------------------------ */
check('Sin errores de JavaScript durante las pruebas', errores.length === 0, errores.join(' | '));

const fallos = resultados.filter((fila) => !fila.ok);
console.log(`\nComplementos (JS): ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas.`);
if (fallos.length) {
  console.log('Fallos:\n' + fallos.map((fila) => `  - ${fila.nombre}`).join('\n'));
}
window.close();
process.exit(fallos.length ? 1 : 0);
