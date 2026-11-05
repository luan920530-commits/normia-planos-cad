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
fs.rmSync(fixture, { force: true });

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

/* ------------------- 4 · el núcleo no se rompe con basura ------------------ */

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
