/*
 * Paridad entre el núcleo nativo (C) y el motor PHP.
 *
 * No basta con que el programa en C compile y dé «números parecidos»: la regla
 * del proyecto es que una medida no puede cambiar según quién la calcule. Esta
 * prueba toma un plano con tramos rectos y curvos, pide las cifras al núcleo en
 * C y las pide a `PathGeometry` y `Units` en PHP, y compara los dos resultados.
 *
 * Se ejecuta con `make -C native test` (solo la parte en C) y con
 * `node native/tests/parity.mjs`, que es el paso de la suite.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeReporter, repoRoot, startApp } from '../../tests/php/harness.mjs';

const VERSION = process.argv[2] || '8.3';
const report = makeReporter('Núcleo nativo (C)', `paridad PHP ${VERSION}`);
const nativeDir = path.join(repoRoot, 'native');

/* ---------------------------- 1 · compilar el C ---------------------------- */

let buildLog = '';
let buildOk = true;
try {
  buildLog = execFileSync('make', ['-C', nativeDir, 'clean'], { encoding: 'utf8', stdio: 'pipe' });
  buildLog += execFileSync('make', ['-C', nativeDir], { encoding: 'utf8', stdio: 'pipe' });
} catch (error) {
  buildOk = false;
  buildLog = String(error.stdout || '') + String(error.stderr || error.message);
}
const core = path.join(nativeDir, 'build', 'norma-core');
report.check('El núcleo en C compila sin avisos con las opciones estrictas',
  buildOk && fs.existsSync(core) && !/warning:/i.test(buildLog),
  buildOk ? `${buildLog.split('\n').length} líneas de compilación` : buildLog.slice(0, 200));

const runCore = (args) => execFileSync(core, args, { encoding: 'utf8' }).trim();
report.check('El programa en C arranca y se presenta', /núcleo nativo .* ok/.test(runCore(['--check'])), runCore(['--check']));

/* ------------------- 2 · el mismo plano, en C y en PHP -------------------- */

// Tres tramos: recto de 400, semicírculo de 300 de cuerda y 150 de flecha
// (vértice en x + 150) y otro recto de 250. Total esperado: 400 + 471,2389… + 250.
const plano = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Paridad' },
  design: {
    canvas: { width: 1123, height: 794, grid: 20, unit: 'cm', scale: '1:100' },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'recto', type: 'wall', x: 0, y: 0, w: 400, h: 2, points: [{ x: 0, y: 0 }, { x: 400, y: 0 }] },
      {
        id: 'curvo',
        type: 'wall',
        x: 400,
        y: 0,
        w: 300,
        h: 150,
        points: [{ x: 400, y: 0 }, { x: 400, y: 300 }],
        curves: [{ kind: 'arc', through: { x: 550, y: 150 } }],
      },
      { id: 'remate', type: 'wall', x: 400, y: 300, w: 250, h: 2, points: [{ x: 400, y: 300 }, { x: 400, y: 50 }] },
      { id: 'senal', type: 'sign', x: 40, y: 40 },
    ],
    groups: [],
  },
};

const fixture = path.join(os.tmpdir(), `normia-paridad-${process.pid}.json`);
fs.writeFileSync(fixture, `${JSON.stringify(plano, null, 2)}\n`, 'utf8');

let nativo = null;
let coreError = '';
try {
  nativo = JSON.parse(runCore(['--stats', fixture]));
} catch (error) {
  coreError = String(error.stdout || error.message);
}
report.check('El núcleo lee el plano y devuelve sus cifras',
  nativo !== null && nativo.elements === 4 && nativo.walls === 3,
  nativo ? `${nativo.elements} elementos · ${nativo.walls} muros` : coreError.slice(0, 160));

const app = await startApp(VERSION);
let php = null;
let phpError = '';
try {
  const resultado = await app.run(`
$design = json_decode((string) file_get_contents(${JSON.stringify(fixture)}), true)['design'];
$muros = array_values(array_filter($design['elements'], static fn ($e) => ($e['type'] ?? '') === 'wall'));
$total = 0.0;
$tramos = [];
foreach ($muros as $muro) {
    $largo = App\\Services\\PathGeometry::length($muro['points'], $muro['curves'] ?? null);
    $tramos[$muro['id']] = $largo;
    $total += $largo;
}
$canvas = $design['canvas'];
echo json_encode([
    'elements' => count($design['elements']),
    'walls' => count($muros),
    'tramos' => $tramos,
    'wall_length_cm' => $total,
    'wall_length_m' => App\\Core\\Units::toMeters($total, App\\Core\\Units::GEOMETRY_UNIT),
    'canvas_area_m2' => App\\Core\\Units::squareMeters($canvas['width'] * $canvas['height'], $canvas['unit'] ?? 'cm'),
    'arco_suelto' => App\\Services\\PathGeometry::length([['x' => 0, 'y' => 0], ['x' => 400, 'y' => 0]],
        [['kind' => 'arc', 'through' => ['x' => 200, 'y' => 200]]]),
]);
`);
  const text = String(resultado.text || '');
  php = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
} catch (error) {
  phpError = String(error?.message || error);
}
await app.close();

report.check('El motor PHP da las cifras del mismo plano', php !== null, php ? 'ok' : phpError.slice(0, 160));

/* ---------------------------- 3 · la comparación --------------------------- */

const same = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
const show = (value) => (typeof value === 'number' ? value.toPrecision(17) : String(value));

if (nativo && php) {
  report.check('El número de elementos y de muros coincide',
    nativo.elements === php.elements && nativo.walls === php.walls,
    `C: ${nativo.elements}/${nativo.walls} · PHP: ${php.elements}/${php.walls}`);

  report.check('La longitud total de muros coincide dígito a dígito',
    same(nativo.wall_length_cm, php.wall_length_cm),
    `C: ${show(nativo.wall_length_cm)} · PHP: ${show(php.wall_length_cm)}`);

  report.check('La longitud en metros coincide dígito a dígito',
    same(nativo.wall_length_m, php.wall_length_m),
    `C: ${show(nativo.wall_length_m)} · PHP: ${show(php.wall_length_m)}`);

  report.check('La superficie del lienzo en metros cuadrados coincide',
    same(nativo.canvas_area_m2, php.canvas_area_m2),
    `C: ${show(nativo.canvas_area_m2)} · PHP: ${show(php.canvas_area_m2)}`);

  const curvo = php.tramos?.curvo;
  report.check('El muro curvo mide lo mismo en C que en PHP, y no la cuerda',
    same(nativo.wall_length_cm - 650.0, curvo) && Math.abs(curvo - 471.23889803846896) < 1e-9,
    `arco C: ${show(nativo.wall_length_cm - 650.0)} · arco PHP: ${show(curvo)} · cuerda: 300`);

  report.check('El semicírculo aislado da el valor publicado de la etapa 0',
    same(php.arco_suelto, 628.3185307179587),
    `PHP: ${show(php.arco_suelto)}`);

  /* La unidad declarada solo cambia cómo se leen las cifras: el mismo dibujo en
     milímetros y en metros tiene que medir lo mismo en centímetros. */
  const otro = JSON.parse(JSON.stringify(plano));
  otro.design.canvas.unit = 'mm';
  const otraRuta = path.join(os.tmpdir(), `normia-paridad-mm-${process.pid}.json`);
  fs.writeFileSync(otraRuta, JSON.stringify(otro), 'utf8');
  const enMilimetros = JSON.parse(runCore(['--stats', otraRuta]));
  fs.rmSync(otraRuta, { force: true });
  report.check('Cambiar la unidad declarada no mueve ni un milímetro',
    same(enMilimetros.wall_length_cm, nativo.wall_length_cm) && same(enMilimetros.wall_length_m, nativo.wall_length_m),
    `${show(nativo.wall_length_cm)} cm en «cm» · ${show(enMilimetros.wall_length_cm)} cm en «mm»`);
}

/* ------------------- 4 · el SVG también tiene que coincidir ------------------ */

// El trazado del muro curvo: el mismo `d` que compone PHP para el SVG, y la
// misma escala física. Si el núcleo nativo dibuja distinto, se ve aquí.
const fixtureSvg = path.join(os.tmpdir(), `normia-paridad-svg-${process.pid}.json`);
const planoCurvo = JSON.parse(JSON.stringify(plano));
planoCurvo.design.elements = [planoCurvo.design.elements[1]];
fs.writeFileSync(fixtureSvg, JSON.stringify(planoCurvo), 'utf8');
let svgNativo = '';
try {
  svgNativo = runCore(['--svg', fixtureSvg]);
} catch (error) {
  svgNativo = String(error.stdout || '');
}
const app2 = await startApp(VERSION);
let phpSvg = null;
try {
  const resultado = await app2.run(`
$design = json_decode((string) file_get_contents(${JSON.stringify(fixture)}), true)['design'];
$muro = $design['elements'][1];
$hoja = App\\Services\\SvgExporter::sheet($design);
echo json_encode([
    'path' => App\\Services\\PathGeometry::pathData($muro['points'], $muro['curves'] ?? null),
    'plano_ancho_mm' => $hoja['planWidthMm'],
    'plano_alto_mm' => $hoja['planHeightMm'],
    'mm_por_cm' => $hoja['mmPerCm'],
    'escala' => $hoja['scale'],
]);
`);
  const text = String(resultado.text || '');
  phpSvg = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
} catch (error) {
  phpSvg = null;
  report.check('El motor PHP compone el trazado del SVG', false, String(error?.message || error).slice(0, 120));
}
await app2.close();
fs.rmSync(fixtureSvg, { force: true });
fs.rmSync(fixture, { force: true });

if (phpSvg) {
  const dNativo = (svgNativo.match(/<path d="([^"]+)"/) || [])[1] || '';
  report.check('El trazado del arco es el mismo texto en C y en PHP',
    dNativo !== '' && dNativo === phpSvg.path,
    `C: ${dNativo} · PHP: ${phpSvg.path}`);

  const ancho = Number((svgNativo.match(/width="([0-9.]+)mm"/) || [])[1]);
  const alto = Number((svgNativo.match(/height="([0-9.]+)mm"/) || [])[1]);
  report.check('La hoja física mide lo mismo que la que calcula PHP',
    Number.isFinite(ancho) && Math.abs(ancho - Math.max(190, phpSvg.plano_ancho_mm)) < 0.01
      && alto > phpSvg.plano_alto_mm,
    `C: ${ancho} mm · PHP: ${phpSvg.plano_ancho_mm} mm de plano`);

  report.check('La escala impresa es la misma',
    svgNativo.includes(`Escala ${phpSvg.escala}`) && Math.abs(phpSvg.mm_por_cm - 0.1) < 1e-12,
    `${phpSvg.escala} · ${phpSvg.mm_por_cm} mm/cm`);
}

// La cifra de la cota se escribe como en el navegador: coma decimal y unidad.
const cotaFixture = path.join(os.tmpdir(), `normia-paridad-cota-${process.pid}.json`);
const planoCota = JSON.parse(JSON.stringify(plano));
planoCota.design.elements = [
  { id: 'c', type: 'dimension', points: [{ x: 0, y: 0 }, { x: 4212.389, y: 0 }], layerId: 'capa' },
];
fs.writeFileSync(cotaFixture, JSON.stringify(planoCota), 'utf8');
const svgCota = runCore(['--svg', cotaFixture]);
fs.rmSync(cotaFixture, { force: true });
report.check('La cota se rotula con coma decimal y punto de miles, como en la web',
  />4\.212,4 cm<\/text>/.test(svgCota), (svgCota.match(/>([0-9.,]+ cm)</) || [])[1] || 'sin cota');

/* -------------- 4b · superficie libre y aforo: los mismos números ------------- */

// Un recinto cerrado con un vano: el exterior tiene que descontarse y el aforo
// tiene que salir de la superficie libre, no del lienzo completo.
const planoRecinto = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Aforo' },
  design: {
    canvas: { width: 1123, height: 794, grid: 20, unit: 'cm', scale: '1:100', occupancy: 5000 },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'arriba', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 700, y: 100 }] },
      { id: 'derecha', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 700, y: 100 }, { x: 700, y: 500 }] },
      { id: 'izquierda', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 100, y: 500 }] },
      { id: 'abajo_1', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 500 }, { x: 380, y: 500 }] },
      { id: 'abajo_2', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 460, y: 500 }, { x: 700, y: 500 }] },
      { id: 'puerta', type: 'door', layerId: 'capa', x: 380, y: 480, w: 80, h: 20, isExit: true },
      { id: 'via', type: 'road', layerId: 'capa', x: 0, y: 700, w: 1123, h: 60, widthM: 4 },
    ],
  },
};
const fixtureAforo = path.join(os.tmpdir(), `normia-paridad-aforo-${process.pid}.json`);
fs.writeFileSync(fixtureAforo, JSON.stringify(planoRecinto), 'utf8');
let nativoAforo = null;
try {
  nativoAforo = JSON.parse(runCore(['--audit', fixtureAforo]));
} catch (error) {
  report.check('El núcleo mide la superficie libre y el aforo', false, String(error?.message || error).slice(0, 120));
}
const app3 = await startApp(VERSION);
let phpAforo = null;
try {
  const resultado = await app3.run(`
$design = json_decode((string) file_get_contents(${JSON.stringify(fixtureAforo)}), true)['design'];
echo json_encode([
    'libre' => App\\Services\\PlanAudit::freeArea($design),
    'aforo' => App\\Services\\PlanAudit::aforo($design),
    'egress' => App\\Services\\PlanAudit::analyze($design)['egress'],
    'travel' => App\\Services\\PlanAudit::analyze($design)['travel'],
]);
`);
  const text = String(resultado.text || '');
  phpAforo = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
} catch (error) {
  phpAforo = null;
  report.check('El motor PHP calcula la superficie libre y el aforo', false, String(error?.message || error).slice(0, 120));
}
await app3.close();
fs.rmSync(fixtureAforo, { force: true });

if (nativoAforo && phpAforo) {
  report.check('La superficie libre del recinto coincide al centímetro cuadrado',
    Math.abs(nativoAforo.freeAreaM2 - phpAforo.libre.freeAreaM2) < 1e-9,
    `C: ${nativoAforo.freeAreaM2} m² · PHP: ${phpAforo.libre.freeAreaM2} m²`);
  report.check('El exterior descontado coincide',
    Math.abs(nativoAforo.exteriorAreaM2 - phpAforo.libre.exteriorAreaM2) < 1e-9,
    `C: ${nativoAforo.exteriorAreaM2} m² · PHP: ${phpAforo.libre.exteriorAreaM2} m²`);
  report.check('La celda calculada es la misma',
    Math.abs(nativoAforo.grid.cell - phpAforo.libre.cellM * 100) < 1e-9,
    `C: ${nativoAforo.grid.cell} cm · PHP: ${phpAforo.libre.cellM} m`);

  const c = nativoAforo.aforo;
  const php = phpAforo.aforo;
  report.check('El aforo máximo, el declarado y el exceso coinciden',
    c.maxPersons === php.maxPersons && c.declared === php.declared && c.excess === php.excess
      && c.permitted === php.permitted && c.used === php.used,
    `C: ${c.maxPersons}/${c.declared}/${c.excess} · PHP: ${php.maxPersons}/${php.declared}/${php.excess}`);
  report.check('La fuente del aforo se rotula igual: declarado o estimado',
    c.source === php.source && c.source === 'declared', c.source);
  report.check('La superficie publicada del aforo coincide',
    Math.abs(c.freeAreaM2 - php.freeAreaM2) < 1e-9, `C: ${c.freeAreaM2} · PHP: ${php.freeAreaM2}`);

  const datos = nativoAforo.egress;
  const salida = phpAforo.egress;
  report.check('Las salidas marcadas se cuentan igual',
    datos.exitCount === 1 && datos.doorCount === 1,
    `${datos.exitCount} salida · ${datos.doorCount} puerta`);
  report.check('El ancho útil de la salida coincide al centímetro',
    Math.abs(datos.availableWidthM - salida.availableWidthM) < 1e-9,
    `C: ${datos.availableWidthM} m · PHP: ${salida.availableWidthM} m`);
  report.check('El ancho que pide el criterio coincide',
    Math.abs(datos.requiredWidthM - salida.requiredWidthM) < 1e-9,
    `C: ${datos.requiredWidthM} m · PHP: ${salida.requiredWidthM} m`);
  report.check('El tiempo de cola en la salida coincide al décimo de segundo',
    Math.abs(datos.queueTimeS - salida.queueTimeS) < 1e-9,
    `C: ${datos.queueTimeS} s · PHP: ${salida.queueTimeS} s`);
}

/* ---------------- 4c · recorridos y hallazgos: el mismo informe ------------- */

// Una nave de 40 × 30 m con una salida de 60 cm: recorrido largo, ancho corto,
// una sola salida, aforo declarado por encima y una zona sellada sin salida.
const planoNave = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Nave' },
  design: {
    canvas: { width: 4000, height: 3000, grid: 20, unit: 'cm', scale: '1:100', occupancy: 300 },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'n', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 3900, y: 100 }] },
      { id: 'e', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 3900, y: 100 }, { x: 3900, y: 2900 }] },
      { id: 'o', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 100, y: 2900 }] },
      { id: 's1', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 2900 }, { x: 300, y: 2900 }] },
      { id: 's2', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 360, y: 2900 }, { x: 3900, y: 2900 }] },
      { id: 'salida', type: 'door', layerId: 'capa', x: 300, y: 2880, w: 60, h: 20, isExit: true },
      { id: 'q1', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 3000, y: 1200 }, { x: 3700, y: 1200 }] },
      { id: 'q2', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 3700, y: 1200 }, { x: 3700, y: 2400 }] },
      { id: 'q3', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 3000, y: 2400 }, { x: 3700, y: 2400 }] },
      { id: 'q4', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 3000, y: 1200 }, { x: 3000, y: 2400 }] },
    ],
  },
};
const fixtureNave = path.join(os.tmpdir(), `normia-paridad-nave-${process.pid}.json`);
fs.writeFileSync(fixtureNave, JSON.stringify(planoNave), 'utf8');
let nativoNave = null;
try {
  nativoNave = JSON.parse(runCore(['--audit', fixtureNave]));
} catch (error) {
  report.check('El núcleo mide recorridos y arma hallazgos', false, String(error?.message || error).slice(0, 120));
}
const app4 = await startApp(VERSION);
let phpNave = null;
try {
  const resultado = await app4.run(`
$design = json_decode((string) file_get_contents(${JSON.stringify(fixtureNave)}), true)['design'];
$report = App\\Services\\PlanAudit::analyze($design);
echo json_encode(['travel' => $report['travel'], 'findings' => $report['findings']]);
`);
  const text = String(resultado.text || '');
  phpNave = JSON.parse(text.slice(text.indexOf('{"travel"')));
} catch (error) {
  phpNave = null;
  report.check('El motor PHP mide recorridos', false, String(error?.message || error).slice(0, 120));
}
await app4.close();
fs.rmSync(fixtureNave, { force: true });

if (nativoNave && phpNave) {
  const c = nativoNave.travel;
  const php = phpNave.travel;
  report.check('El recorrido más largo coincide al centímetro',
    Math.abs(c.longestM - php.longestM) < 1e-9, `C: ${c.longestM} m · PHP: ${php.longestM} m`);
  report.check('El punto más alejado es el mismo del plano',
    c.farthest.x === php.farthest.x && c.farthest.y === php.farthest.y,
    `C: (${c.farthest.x}, ${c.farthest.y}) · PHP: (${php.farthest.x}, ${php.farthest.y})`);
  report.check('La superficie alcanzable y la que no tiene salida coinciden',
    Math.abs(c.reachableAreaM2 - php.reachableAreaM2) < 1e-9
      && Math.abs(c.unreachableAreaM2 - php.unreachableAreaM2) < 1e-9,
    `C: ${c.reachableAreaM2} / ${c.unreachableAreaM2} m² · PHP: ${php.reachableAreaM2} / ${php.unreachableAreaM2} m²`);

  // Los hallazgos que el núcleo ya sabe emitir se comparan palabra por palabra.
  const codes = ['no_exit', 'too_few_exits', 'narrow_exit', 'travel_too_long', 'unreachable_area',
    'occupancy_over_capacity', 'occupancy_missing', 'width_short'];
  const mine = nativoNave.findings.filter((f) => codes.includes(f.code));
  const theirs = phpNave.findings.filter((f) => codes.includes(f.code));
  report.check('Salen los mismos hallazgos de evacuación y aforo, en el mismo orden',
    JSON.stringify(mine.map((f) => `${f.code}/${f.severity}`)) === JSON.stringify(theirs.map((f) => `${f.code}/${f.severity}`)),
    `${mine.length} hallazgos: ${mine.map((f) => f.code).join(' · ')}`);
  const mismatched = mine.filter((f) => {
    const pair = theirs.find((g) => g.code === f.code && g.title === f.title);
    return !pair || pair.detail !== f.detail || pair.value !== f.value
      || JSON.stringify(pair.elements) !== JSON.stringify(f.elements)
      || JSON.stringify(pair.position) !== JSON.stringify(f.position);
  });
  report.check('Cada hallazgo dice lo mismo: título, detalle, elementos, punto y valor',
    mine.length > 0 && mismatched.length === 0,
    mismatched.length === 0 ? `${mine.length} idénticos` : `distintos: ${mismatched.map((f) => f.code).join(', ')}`);
  report.check('Cuenta las zonas sin salida alcanzable',
    mine.some((f) => f.code === 'unreachable_area' && /m²/.test(f.value || '')),
    (mine.find((f) => f.code === 'unreachable_area') || {}).value || 'sin zona');
}

/* -------- 4d · señalización y primeros auxilios: el mismo informe -------- */

// Piso 1: 10 × 7 m, con salida señalizada, marcador «usted está aquí», señal de
// extintor, botiquín y DEA a menos de 30 m. No debe quedar hallazgo de
// señalización y sí el aviso de camilla.
const planoSeñales = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Señalización' },
  design: {
    canvas: { width: 1200, height: 900, grid: 20, unit: 'cm', scale: '1:100', occupancy: 40 },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'n', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 1100, y: 100 }] },
      { id: 's', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 800 }, { x: 1100, y: 800 }] },
      { id: 'o', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 100, y: 800 }] },
      { id: 'e1', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 1100, y: 100 }, { x: 1100, y: 350 }] },
      { id: 'e2', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 1100, y: 440 }, { x: 1100, y: 800 }] },
      { id: 'salida', type: 'door', layerId: 'capa', x: 1090, y: 350, w: 20, h: 90, isExit: true },
      { id: 'sg1', type: 'iso_e002', layerId: 'capa', x: 1000, y: 300, w: 40, h: 40 },
      { id: 'aqui', type: 'sig_aqui', layerId: 'capa', x: 500, y: 400, w: 40, h: 40 },
      { id: 'ext', type: 'iso_f001', layerId: 'capa', x: 200, y: 200, w: 40, h: 40 },
      { id: 'bot', type: 'cad_emg_firstaid', layerId: 'capa', x: 200, y: 700, w: 60, h: 60 },
      { id: 'dea', type: 'cad_emg_aed', layerId: 'capa', x: 900, y: 700, w: 60, h: 60 },
    ],
  },
};

// Piso 2: 58 × 38 m, 620 personas, un botiquín en una esquina, un DEA en la
// otra, sin camilla y sin señalización: botiquín y DEA fuera de alcance.
const planoGrande = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Nave de primeros auxilios' },
  design: {
    canvas: { width: 6000, height: 4000, grid: 20, unit: 'cm', scale: '1:100', occupancy: 620 },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'n', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 5900, y: 100 }] },
      { id: 's', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 3900 }, { x: 5900, y: 3900 }] },
      { id: 'o', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 100, y: 3900 }] },
      { id: 'e', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 5900, y: 100 }, { x: 5900, y: 3900 }] },
      { id: 'salida', type: 'door', layerId: 'capa', x: 5800, y: 1900, w: 100, h: 100, isExit: true },
      { id: 'bot', type: 'cad_emg_firstaid', layerId: 'capa', x: 200, y: 200, w: 60, h: 60 },
      { id: 'dea', type: 'cad_emg_aed', layerId: 'capa', x: 5400, y: 3600, w: 60, h: 60 },
    ],
  },
};

const fixtures = [planoSeñales, planoGrande].map((plano, index) => {
  const file = path.join(os.tmpdir(), `normia-paridad-senales-${index}-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(plano), 'utf8');
  return file;
});
const resources = path.join(repoRoot, 'resources');
const míos = fixtures.map((file) => {
  try {
    return JSON.parse(runCore(['--audit', file, '--resources', resources]));
  } catch (error) {
    report.check('El núcleo audita un plano con señalización y primeros auxilios', false,
      String(error?.message || error).slice(0, 120));
    return null;
  }
});

// La hoja de señalización: los 395 pictogramas, dibujados con el mismo código
// que usa la exportación del plano.
const hoja = path.join(os.tmpdir(), `normia-hoja-senales-${process.pid}.svg`);
let hojaOk = false;
let hojaDetail = '';
try {
  const salida = JSON.parse(runCore(['--sign-board', hoja, '--resources', resources]));
  const svg = fs.readFileSync(hoja, 'utf8');
  const dibujos = (svg.match(/preserveAspectRatio="xMidYMid meet"/g) || []).length;
  hojaOk = salida.signs === 395 && salida.iso === 332 && salida.services === 63 && dibujos === 395;
  hojaDetail = `${salida.signs} señales · ${dibujos} pictogramas dibujados`;
} catch (error) {
  hojaDetail = String(error?.message || error).slice(0, 120);
}
fs.rmSync(hoja, { force: true });
report.check('La hoja de señalización dibuja las 395 del catálogo local', hojaOk, hojaDetail);

const app5 = await startApp(VERSION);
let suyos = null;
try {
  const resultado = await app5.run(`
$salida = [];
foreach (${JSON.stringify(fixtures)} as $file) {
  $design = json_decode((string) file_get_contents($file), true)['design'];
  $report = App\\Services\\PlanAudit::analyze($design);
  $firstAid = App\\Services\\FirstAidInventory::analyze($design, 0);
  $salida[] = ['findings' => $report['findings'], 'coverage' => $firstAid['coverage'],
    'kits' => $firstAid['kits']['count'], 'aeds' => $firstAid['aeds']['count']];
}
echo json_encode($salida);
`);
  const text = String(resultado.text || '');
  suyos = JSON.parse(text.slice(text.indexOf('[')));
} catch (error) {
  report.check('El motor PHP audita la señalización', false, String(error?.message || error).slice(0, 120));
}
await app5.close();
fixtures.forEach((file) => fs.rmSync(file, { force: true }));

const comparar = (lista, otra, códigos) => {
  const mío = lista.filter((f) => códigos.includes(f.code));
  const suyo = otra.filter((f) => códigos.includes(f.code));
  const plano = (f) => `${f.code}/${f.severity}/${f.title}/${f.detail}/${f.elements.join(',')}`
    + `/${JSON.stringify(f.position)}/${f.value}`;
  return { mío, suyo, igual: JSON.stringify(mío.map(plano)) === JSON.stringify(suyo.map(plano)) };
};

if (míos[0] && suyos) {
  const signs = míos[0].signs;
  report.check('El catálogo de señalización se lee completo: 332 ISO + 63 propias',
    signs.catalogLoaded === true && signs.catalog === 395 && signs.iso === 332 && signs.services === 63,
    `${signs.catalog} señales`);
  report.check('Las señales del plano se resuelven a su código del catálogo',
    JSON.stringify(signs.codes) === JSON.stringify(['E002', 'SVC_AQUI', 'F001']),
    signs.codes.join(' · '));

  const señalización = comparar(míos[0].findings, suyos[0].findings,
    ['exit_without_sign', 'no_you_are_here', 'no_fire_sign']);
  report.check('La señalización no produce hallazgos cuando el plano está señalizado',
    señalización.mío.length === 0 && señalización.suyo.length === 0 && señalización.igual,
    `${señalización.mío.length} hallazgos`);

  const sinSeñales = comparar(míos[1].findings, suyos[1].findings,
    ['exit_without_sign', 'no_you_are_here', 'no_fire_sign']);
  report.check('Sin señalización salen los mismos tres hallazgos, con el mismo texto',
    sinSeñales.mío.length === 3 && sinSeñales.igual,
    `${sinSeñales.mío.map((f) => f.code).join(' · ')}`);

  const primeros = comparar(míos[0].findings, suyos[0].findings,
    ['no_first_aid_kit', 'first_aid_kit_far', 'no_stretcher', 'no_aed', 'aed_far']);
  report.check('Los hallazgos de primeros auxilios coinciden palabra por palabra',
    primeros.mío.length > 0 && primeros.igual,
    `${primeros.mío.length} hallazgos: ${primeros.mío.map((f) => f.code).join(' · ')}`);

  const lejanos = comparar(míos[1].findings, suyos[1].findings,
    ['no_first_aid_kit', 'first_aid_kit_far', 'no_stretcher', 'no_aed', 'aed_far']);
  report.check('El botiquín y el DEA fuera de alcance se avisan con la misma cifra',
    lejanos.mío.some((f) => f.code === 'first_aid_kit_far') && lejanos.igual,
    `${lejanos.mío.map((f) => `${f.code} ${f.value || ''}`.trim()).join(' · ')}`);

  for (let index = 0; index < 2; index += 1) {
    const c = míos[index].firstAid;
    const p = suyos[index].coverage;
    const mismo = (c.kitMaxM === null ? p.kitMaxM === null : Math.abs(c.kitMaxM - p.kitMaxM) < 1e-9)
      && (c.aedMaxM === null ? p.aedMaxM === null : Math.abs(c.aedMaxM - p.aedMaxM) < 1e-9)
      && c.cells === p.cells && c.kits === suyos[index].kits && c.aeds === suyos[index].aeds;
    report.check(`La cobertura de primeros auxilios del piso ${index + 1} coincide con PHP`, mismo,
      `C: ${c.kitMaxM} m / ${c.aedMaxM} m · PHP: ${p.kitMaxM} m / ${p.aedMaxM} m`);
  }
}

/* ------------- 4e · extintores: el mismo dictamen de ubicación ------------- */

// Nave de 40 × 30 m con tres equipos distintos (ABC de 20 lb, CO₂ de 10 lb y
// ABC de 10 lb con riesgo leve), sin señal de extintor.
const planoNaveExtintores = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Extintores' },
  design: {
    canvas: { width: 4000, height: 3000, grid: 20, unit: 'cm', scale: '1:100', occupancy: 120 },
    extinguishers: { profile: 'colombia', hazard: 'ordinary' },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'n', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 3900, y: 100 }] },
      { id: 's', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 2900 }, { x: 3900, y: 2900 }] },
      { id: 'o', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 100, y: 2900 }] },
      { id: 'e', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 3900, y: 100 }, { x: 3900, y: 2900 }] },
      { id: 'salida', type: 'door', layerId: 'capa', x: 3800, y: 1400, w: 100, h: 100, isExit: true },
      { id: 'ext1', type: 'cad_eds_extinguisher', layerId: 'capa', x: 400, y: 400, w: 40, h: 40,
        extAgent: 'pqs_abc', extCapacityLb: 20, extRating: '4-A:60-B:C', extHazard: 'ordinary', extMountCm: 120 },
      { id: 'ext2', type: 'cad_fire_ext_co2', layerId: 'capa', x: 3000, y: 2200, w: 40, h: 40,
        extAgent: 'co2', extCapacityLb: 10, extRating: '10-B:C', extHazard: 'ordinary', extMountCm: 120 },
      { id: 'ext3', type: 'cad_drg_extinguisher', layerId: 'capa', x: 2000, y: 1500, w: 40, h: 40,
        extAgent: 'pqs_abc', extCapacityLb: 10, extRating: '2-A:10-B:C', extHazard: 'light', extMountCm: 160 },
    ],
  },
};

// Piso de 20 × 20 m con un solo 1-A: el recorrido alcanza más área de la que
// admite el rótulo, así que el límite que se incumple es el de área.
const planoAreaExtintores = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Área de extintores' },
  design: {
    canvas: { width: 2400, height: 2400, grid: 20, unit: 'cm', scale: '1:100', occupancy: 10 },
    extinguishers: { profile: 'colombia', hazard: 'ordinary' },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'n', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 200, y: 200 }, { x: 2200, y: 200 }] },
      { id: 's', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 200, y: 2200 }, { x: 2200, y: 2200 }] },
      { id: 'o', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 200, y: 200 }, { x: 200, y: 2200 }] },
      { id: 'e', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 2200, y: 200 }, { x: 2200, y: 2200 }] },
      { id: 'salida', type: 'door', layerId: 'capa', x: 2100, y: 1100, w: 100, h: 100, isExit: true },
      { id: 'ext1', type: 'cad_eds_extinguisher', layerId: 'capa', x: 1180, y: 1180, w: 40, h: 40,
        extAgent: 'pqs_abc', extCapacityLb: 5, extRating: '1-A:10-B:C', extHazard: 'ordinary', extMountCm: 120 },
    ],
  },
};

const fixturesExt = [planoNaveExtintores, planoAreaExtintores].map((plano, index) => {
  const file = path.join(os.tmpdir(), `normia-paridad-ext-${index}-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(plano), 'utf8');
  return file;
});
const miosExt = fixturesExt.map((file) => {
  try {
    return JSON.parse(runCore(['--audit', file, '--resources', resources]));
  } catch (error) {
    report.check('El núcleo calcula la cobertura de extintores', false,
      String(error?.message || error).slice(0, 120));
    return null;
  }
});

const app6 = await startApp(VERSION);
let suyosExt = null;
try {
  const resultado = await app6.run(`
$salida = [];
foreach (${JSON.stringify(fixturesExt)} as $file) {
  $design = json_decode((string) file_get_contents($file), true)['design'];
  $report = App\\Services\\PlanAudit::analyze($design);
  $coverage = App\\Services\\ExtinguisherCoverage::analyze($design, false);
  $salida[] = ['findings' => $report['findings'], 'summary' => $coverage['summary'],
    'zones' => count($coverage['zones']), 'units' => count($coverage['units'])];
}
echo json_encode($salida);
`);
  const text = String(resultado.text || '');
  suyosExt = JSON.parse(text.slice(text.indexOf('[')));
} catch (error) {
  report.check('El motor PHP calcula la cobertura de extintores', false,
    String(error?.message || error).slice(0, 120));
}
await app6.close();
fixturesExt.forEach((file) => fs.rmSync(file, { force: true }));

const CODES_EXT = ['ext_missing', 'ext_ratio_short', 'ext_travel_too_long', 'ext_coverage_gap',
  'ext_class_gap', 'ext_no_class_a', 'ext_wrong_class', 'ext_without_sign', 'ext_height',
  'ext_obsolete_rating'];

if (miosExt[0] && suyosExt) {
  for (let index = 0; index < 2; index += 1) {
    const comparable = comparar(miosExt[index].findings, suyosExt[index].findings, CODES_EXT);
    report.check(`Los hallazgos de extintores del piso ${index + 1} coinciden palabra por palabra`,
      comparable.mío.length > 0 && comparable.igual,
      comparable.mío.map((f) => f.code).join(' · ') || 'sin hallazgos');
  }

  const c = miosExt[0].extinguishers;
  const p = suyosExt[0].summary;
  const redondear = (valor) => Math.round(valor * 10) / 10;
  report.check('La superficie y la cobertura de extintores coinciden con PHP',
    c.units === p.count && redondear(c.floorAreaM2) === p.floorAreaM2
      && redondear(c.coveredAreaM2) === p.coveredAreaM2 && redondear(c.coveredPct) === p.coveredPct
      && redondear(c.uncoveredAreaM2) === p.uncoveredAreaM2 && c.requiredByArea === p.requiredByArea
      && c.unitsWithGap === p.unitsWithGap && c.zones === suyosExt[0].zones,
    `C: ${c.coveredAreaM2} de ${c.floorAreaM2} m² · PHP: ${p.coveredAreaM2} de ${p.floorAreaM2} m²`);

  report.check('El área del rótulo es la que manda en el segundo piso',
    miosExt[1].findings.some((f) => f.code === 'ext_coverage_gap')
      && !miosExt[1].findings.some((f) => f.code === 'ext_travel_too_long'),
    `cubre ${miosExt[1].extinguishers.coveredAreaM2} de ${miosExt[1].extinguishers.floorAreaM2} m²`);
}

/* ------------- 4f · extintores: acciones con ganancia medida -------------- */

// Nave de 40 × 30 m con tres equipos de 4-A cerca del mismo rincón: la zona
// descubierta queda lejos, así que la web propone reubicar los dos más cercanos
// y añadir otro. La ganancia se comprueba contra el PHP, no a ojo.
const planoReubicarExtintores = {
  application: 'normia-planos-cad',
  format: 'normia-plan',
  schema_version: 3,
  project: { name: 'Reubicar extintores' },
  design: {
    canvas: { width: 4000, height: 3000, grid: 20, unit: 'cm', scale: '1:100', occupancy: 10 },
    extinguishers: { profile: 'colombia', hazard: 'ordinary' },
    layers: [{ id: 'capa', name: 'Planta', visible: true, locked: false }],
    elements: [
      { id: 'n', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 3900, y: 100 }] },
      { id: 's', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 2900 }, { x: 3900, y: 2900 }] },
      { id: 'o', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 100, y: 100 }, { x: 100, y: 2900 }] },
      { id: 'e', type: 'wall', layerId: 'capa', stroke: 20, points: [{ x: 3900, y: 100 }, { x: 3900, y: 2900 }] },
      { id: 'salida', type: 'door', layerId: 'capa', x: 3800, y: 1450, w: 100, h: 100, isExit: true },
      { id: 'ext1', type: 'cad_eds_extinguisher', layerId: 'capa', x: 1300, y: 500, w: 40, h: 40,
        extAgent: 'pqs_abc', extCapacityLb: 20, extRating: '4-A:60-B:C', extHazard: 'ordinary', extMountCm: 120 },
      { id: 'ext2', type: 'cad_eds_extinguisher', layerId: 'capa', x: 1400, y: 1300, w: 40, h: 40,
        extAgent: 'pqs_abc', extCapacityLb: 5, extRating: '4-A:60-B:C', extHazard: 'ordinary', extMountCm: 120 },
      { id: 'ext3', type: 'cad_eds_extinguisher', layerId: 'capa', x: 600, y: 2000, w: 40, h: 40,
        extAgent: 'pqs_abc', extCapacityLb: 5, extRating: '4-A:60-B:C', extHazard: 'ordinary', extMountCm: 120 },
    ],
  },
};

const fixturesAcciones = [planoNaveExtintores, planoReubicarExtintores].map((plano, index) => {
  const file = path.join(os.tmpdir(), `normia-paridad-acciones-${index}-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(plano), 'utf8');
  return file;
});
const miasAcciones = fixturesAcciones.map((file) => {
  try {
    return JSON.parse(runCore(['--audit', file, '--resources', resources])).extinguishers.recommendations;
  } catch (error) {
    report.check('El núcleo propone acciones sobre los extintores', false,
      String(error?.message || error).slice(0, 120));
    return null;
  }
});

const app7 = await startApp(VERSION);
let suyasAcciones = null;
try {
  const resultado = await app7.run(`
$salida = [];
foreach (${JSON.stringify(fixturesAcciones)} as $file) {
  $design = json_decode((string) file_get_contents($file), true)['design'];
  $lista = App\\Services\\ExtinguisherCoverage::analyze($design, true)['recommendations'];
  $salida[] = array_map(static function (array $r): array {
    return [
      'action' => $r['action'], 'elementId' => $r['elementId'], 'title' => $r['title'],
      'detail' => $r['detail'], 'target' => $r['target'], 'type' => $r['type'],
      'agent' => $r['agent'], 'capacityLb' => $r['capacityLb'], 'rating' => $r['rating'],
      'gainAreaM2' => $r['gainAreaM2'], 'gainPct' => $r['gainPct'],
    ];
  }, $lista);
}
echo json_encode($salida);
`);
  const text = String(resultado.text || '');
  suyasAcciones = JSON.parse(text.slice(text.indexOf('[')));
} catch (error) {
  report.check('El motor PHP propone acciones sobre los extintores', false,
    String(error?.message || error).slice(0, 120));
}
await app7.close();
fixturesAcciones.forEach((file) => fs.rmSync(file, { force: true }));

if (miasAcciones[0] && suyasAcciones) {
  for (let index = 0; index < 2; index += 1) {
    const mías = miasAcciones[index];
    const suyas = suyasAcciones[index];
    const campos = ['action', 'elementId', 'title', 'detail', 'target', 'type', 'agent',
      'capacityLb', 'rating', 'gainAreaM2', 'gainPct'];
    const iguales = mías.length === suyas.length && mías.every((mía, item) => campos.every(
      (campo) => JSON.stringify(mía[campo]) === JSON.stringify(suyas[item][campo])));
    report.check(`Las acciones de extintores del plano ${index + 1} coinciden con PHP`,
      iguales && mías.length > 0,
      mías.map((mía) => `${mía.action} ${mía.gainAreaM2} m²`).join(' · ') || 'sin acciones');
  }

  report.check('La acción de más ganancia es la que encabeza la lista',
    miasAcciones[1].length >= 3 && miasAcciones[1][0].action === 'move'
      && miasAcciones[1].every((mía, index) => index === 0
        || mía.gainAreaM2 <= miasAcciones[1][index - 1].gainAreaM2),
    miasAcciones[1].map((mía) => `${mía.action} ${mía.gainAreaM2}`).join(' · '));

  report.check('Las acciones se quedan en cuatro como mucho',
    miasAcciones.every((lista) => lista.length <= 4),
    miasAcciones.map((lista) => lista.length).join(' · '));
}

/* ---------- 4g · escenarios de ocupación temporal, cifra por cifra -------- */

// Los mismos dos pisos de la nave, con tres y con seis escenarios declarados.
const conEscenarios = (escenarios) => {
  const plano = JSON.parse(JSON.stringify(planoNaveExtintores));
  plano.design.canvas.scenarios = escenarios;
  return plano;
};
const fixturesEscenarios = [
  conEscenarios([{ name: 'Feria', persons: 400 }, { name: 'Capacitación', persons: 60 },
    { name: 'Hora pico', persons: 500 }]),
  conEscenarios([{ name: 'Feria', persons: 400 }, { name: 'Boda', persons: 300 },
    { name: 'Taller', persons: 250 }, { name: 'Feria 2', persons: 200 },
    { name: 'Concierto', persons: 900 }, { name: 'Charla', persons: 150 }]),
].map((plano, index) => {
  const file = path.join(os.tmpdir(), `normia-paridad-escenarios-${index}-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(plano), 'utf8');
  return file;
});
const miosEscenarios = fixturesEscenarios.map((file) => {
  try {
    return JSON.parse(runCore(['--audit', file, '--resources', resources]));
  } catch (error) {
    report.check('El núcleo revisa los escenarios de ocupación', false,
      String(error?.message || error).slice(0, 120));
    return null;
  }
});

const app8 = await startApp(VERSION);
let suyosEscenarios = null;
try {
  const resultado = await app8.run(`
$salida = [];
foreach (${JSON.stringify(fixturesEscenarios)} as $file) {
  $design = json_decode((string) file_get_contents($file), true)['design'];
  $report = App\\Services\\PlanAudit::analyze($design);
  $salida[] = ['findings' => array_values(array_filter($report['findings'],
    static fn (array $f): bool => str_starts_with((string) $f['code'], 'scenario'))),
    'count' => $report['scenarios']['count']];
}
echo json_encode($salida);
`);
  const text = String(resultado.text || '');
  suyosEscenarios = JSON.parse(text.slice(text.indexOf('[')));
} catch (error) {
  report.check('El motor PHP revisa los escenarios de ocupación', false,
    String(error?.message || error).slice(0, 120));
}
await app8.close();
fixturesEscenarios.forEach((file) => fs.rmSync(file, { force: true }));

if (miosEscenarios[0] && suyosEscenarios) {
  for (let index = 0; index < 2; index += 1) {
    const míos = miosEscenarios[index].findings.filter((f) => f.code.startsWith('scenario'));
    const comparable = comparar(míos, suyosEscenarios[index].findings,
      ['scenario_over_capacity', 'scenario_width_short', 'scenario_more']);
    report.check(`Los hallazgos de escenarios del plano ${index + 1} coinciden palabra por palabra`,
      comparable.igual, míos.map((f) => f.code).join(' · ') || 'sin hallazgos');
  }
  report.check('Los escenarios se cuentan igual que en PHP',
    miosEscenarios[0].scenarios.count === suyosEscenarios[0].count
      && miosEscenarios[1].scenarios.count === suyosEscenarios[1].count,
    `C: ${miosEscenarios[0].scenarios.count} y ${miosEscenarios[1].scenarios.count} · `
      + `PHP: ${suyosEscenarios[0].count} y ${suyosEscenarios[1].count}`);
  const eventos = miosEscenarios[1].findings.filter((f) => f.code === 'scenario_over_capacity');
  report.check('El evento más exigente entra en el informe corto de escenarios',
    eventos.some((f) => f.value === '900 de 208') && eventos.length === 4,
    eventos.map((f) => f.value).join(' · ') || 'sin hallazgo');
}

/* ----------------- 4h · rutas de evacuación dibujadas --------------------- */

// La misma nave, ahora con dos rutas: una que llega a la salida y otra que se
// queda corta y atraviesa el muro del fondo.
const planoConRutas = JSON.parse(JSON.stringify(planoNaveExtintores));
planoConRutas.design.elements.push(
  { id: 'ruta1', type: 'route', layerId: 'capa', stroke: 3, label: 'Ruta principal',
    points: [{ x: 1000, y: 1000 }, { x: 2000, y: 1200 }, { x: 3850, y: 1450 }] },
  { id: 'ruta2', type: 'route', layerId: 'capa', stroke: 3, label: 'Ruta corta',
    points: [{ x: 3000, y: 1000 }, { x: 3950, y: 1000 }] },
);
const fixtureRutas = path.join(os.tmpdir(), `normia-paridad-rutas-${process.pid}.json`);
fs.writeFileSync(fixtureRutas, JSON.stringify(planoConRutas), 'utf8');
const míasRutas = JSON.parse(runCore(['--audit', fixtureRutas, '--resources', resources]));

const app9 = await startApp(VERSION);
let suyasRutas = null;
try {
  const resultado = await app9.run(`
$design = json_decode((string) file_get_contents(${JSON.stringify(fixtureRutas)}), true)['design'];
$report = App\\Services\\PlanAudit::analyze($design);
echo json_encode(['routes' => $report['routes'], 'findings' => $report['findings']]);
`);
  const text = String(resultado.text || '');
  suyasRutas = JSON.parse(text.slice(text.indexOf('{')));
} catch (error) {
  report.check('El motor PHP revisa las rutas de evacuación', false,
    String(error?.message || error).slice(0, 120));
}
await app9.close();
fs.rmSync(fixtureRutas, { force: true });

if (suyasRutas) {
  const campos = ['id', 'label', 'lengthM', 'lengthSource', 'endsAtExit', 'distanceToExitM',
    'wallCrossings'];
  const iguales = míasRutas.routes.items.length === suyasRutas.routes.length
    && míasRutas.routes.items.every((mía, index) => campos.every(
      (campo) => JSON.stringify(mía[campo]) === JSON.stringify(suyasRutas.routes[index][campo])));
  report.check('La longitud, la llegada a la salida y los cruces de cada ruta coinciden con PHP',
    iguales, míasRutas.routes.items.map((r) => `${r.lengthM} m · ${r.wallCrossings} cruces`).join(' · '));

  const comparable = comparar(míasRutas.findings, suyasRutas.findings,
    ['no_route', 'route_no_exit', 'route_through_wall']);
  report.check('Los hallazgos de rutas coinciden palabra por palabra',
    comparable.igual && comparable.mío.length === 2,
    comparable.mío.map((f) => f.code).join(' · ') || 'sin hallazgos');

  const fixtureSinRutas = path.join(os.tmpdir(), `normia-paridad-sin-rutas-${process.pid}.json`);
  fs.writeFileSync(fixtureSinRutas, JSON.stringify(planoAreaExtintores), 'utf8');
  const vacío = JSON.parse(runCore(['--audit', fixtureSinRutas, '--resources', resources]));
  fs.rmSync(fixtureSinRutas, { force: true });
  report.check('Un plano sin rutas avisa de que falta dibujarlas',
    vacío.findings.some((f) => f.code === 'no_route'), 'no_route');
}

/* ---------- 4i · la revisión de la ventana: una sola lista de hallazgos ------ */

// `--inspect` es exactamente la receta que usará el cajón Revisión de la ventana
// nativa. Se compara su lista completa y su resumen con `PlanAudit::analyze()`:
// si la ventana y la web dijeran cosas distintas, esto falla.
const fixtureRevision = path.join(os.tmpdir(), `normia-paridad-revision-${process.pid}.json`);
fs.writeFileSync(fixtureRevision, JSON.stringify(planoConRutas), 'utf8');
const míaRevision = JSON.parse(runCore(['--inspect', fixtureRevision, '--resources', resources]));

const app10 = await startApp(VERSION);
let suyaRevision = null;
try {
  const resultado = await app10.run(`
$design = json_decode((string) file_get_contents(${JSON.stringify(fixtureRevision)}), true)['design'];
$report = App\\Services\\PlanAudit::analyze($design);
echo json_encode(['report' => $report]);
`);
  const text = String(resultado.text || '');
  suyaRevision = JSON.parse(text.slice(text.indexOf('{'))).report;
} catch (error) {
  report.check('El motor PHP entrega su informe completo', false,
    String(error?.message || error).slice(0, 120));
}
await app10.close();
fs.rmSync(fixtureRevision, { force: true });

if (suyaRevision) {
  report.check('La revisión del núcleo trae los mismos hallazgos que el informe PHP',
    míaRevision.findings.length === suyaRevision.findings.length,
    `${míaRevision.findings.length} hallazgos · PHP ${suyaRevision.findings.length}`);
  const todos = míaRevision.findings.map((f) => f.code);
  const comparable = comparar(míaRevision.findings, suyaRevision.findings, todos);
  report.check('Cada hallazgo del cajón de revisión coincide palabra por palabra con PHP',
    comparable.igual, `${comparable.mío.length} comparados`);
  report.check('El resumen de la ventana usa las mismas personas que el informe PHP',
    míaRevision.summary.persons === Number(suyaRevision.occupancy.people),
    `${míaRevision.summary.persons} personas · ${míaRevision.summary.exitCount} salidas`);
  report.check('La revisión dice si encontró el catálogo y las tablas de extintores',
    míaRevision.summary.hasLibrary === true && míaRevision.summary.hasExtinguisherNorms === true,
    'catálogo y tablas cargados');
}

/* --------------------- 4j · simulacro: el tiempo objetivo -------------------- */

// El mismo piso con un punto de encuentro dibujado, 45 s de reacción y 95 s
// medidos con cronómetro: el informe tiene que separar el cálculo del cronómetro.
const planoSimulacro = JSON.parse(JSON.stringify(planoConRutas));
planoSimulacro.design.canvas.drill = { reactionS: 45, measuredS: 95 };
planoSimulacro.design.elements.push({ id: 'encuentro', type: 'cad_emg_meeting', layerId: 'capa',
  x: 4200, y: 1500, w: 60, h: 60 });
const fixtureSimulacro = path.join(os.tmpdir(), `normia-paridad-simulacro-${process.pid}.json`);
fs.writeFileSync(fixtureSimulacro, JSON.stringify(planoSimulacro), 'utf8');
const míoSimulacro = JSON.parse(runCore(['--audit', fixtureSimulacro, '--resources', resources])).drill;
const míoSimulacroFindings = JSON.parse(runCore(['--inspect', fixtureSimulacro, '--resources', resources])).findings;

const app11 = await startApp(VERSION);
let suyoSimulacro = null;
try {
  const resultado = await app11.run(`
$design = json_decode((string) file_get_contents(${JSON.stringify(fixtureSimulacro)}), true)['design'];
$report = App\\Services\\PlanAudit::analyze($design);
echo json_encode(['drill' => $report['drill'], 'findings' => $report['findings']]);
`);
  const text = String(resultado.text || '');
  suyoSimulacro = JSON.parse(text.slice(text.indexOf('{')));
} catch (error) {
  report.check('El motor PHP calcula el tiempo objetivo del simulacro', false,
    String(error?.message || error).slice(0, 120));
}
await app11.close();
fs.rmSync(fixtureSimulacro, { force: true });

if (suyoSimulacro) {
  const suyo = suyoSimulacro.drill;
  const campos = ['id', 'lengthM', 'pathM', 'walkS', 'meetingM', 'transferS', 'arrivalS',
    'targetSource', 'endsAtExit', 'exitId'];
  const rutasIguales = míoSimulacro.routes.length === suyo.routes.length
    && míoSimulacro.routes.every((mía, index) => campos.every(
      (campo) => JSON.stringify(mía[campo]) === JSON.stringify(suyo.routes[index][campo])));
  report.check('El camino caminable y el tiempo de cada ruta coinciden con PHP, ruta por ruta',
    rutasIguales, míoSimulacro.routes.map((r) => `${r.pathM} m · ${r.walkS} s`).join(' · '));

  report.check('El objetivo, el punto de encuentro y el tramo de fuera coinciden con PHP',
    míoSimulacro.targetS === suyo.targetS && míoSimulacro.targetSource === suyo.targetSource
    && míoSimulacro.reactionS === suyo.reactionS
    && míoSimulacro.meeting.found === suyo.meeting.found
    && míoSimulacro.meeting.source === suyo.meeting.source
    && JSON.stringify(míoSimulacro.meeting.position) === JSON.stringify(suyo.meeting.position),
    `${míoSimulacro.targetS} s · ${míoSimulacro.targetSource} · ${míoSimulacro.meeting.source}`);

  report.check('El tiempo medido y su diferencia se informan aparte del calculado',
    míoSimulacro.measuredS === suyo.measuredS && míoSimulacro.differenceS === suyo.differenceS
    && míoSimulacro.measuredS === 95 && míoSimulacro.differenceS === suyo.differenceS,
    `${míoSimulacro.measuredS} s medidos · ${míoSimulacro.differenceS} s de diferencia`);

  const comparableSimulacro = comparar(míoSimulacroFindings, suyoSimulacro.findings,
    ['drill_route_blocked', 'no_meeting_point', 'drill_slower_than_target']);
  report.check('El aviso del cronómetro coincide palabra por palabra con PHP',
    comparableSimulacro.igual && comparableSimulacro.mío.length === 1
    && comparableSimulacro.mío[0].value === '1 min 18 s',
    comparableSimulacro.mío.map((f) => `${f.code} · ${f.value}`).join(' · ') || 'sin hallazgo');
}

/* ------------------- 5 · el núcleo no se rompe con basura ------------------ */

const basura = path.join(os.tmpdir(), `normia-basura-${process.pid}.json`);
fs.writeFileSync(basura, '{"hola": 1}', 'utf8');
let rechazo = '';
try {
  runCore(['--stats', basura]);
} catch (error) {
  rechazo = String(error.stderr || error.message);
}
fs.rmSync(basura, { force: true });
report.check('Un archivo que no es un plano se rechaza con un motivo en español',
  /no tiene un plano de Normia/.test(rechazo), rechazo.trim().slice(0, 120));

const fallos = report.summary();
process.exit(fallos === 0 ? 0 : 1);
