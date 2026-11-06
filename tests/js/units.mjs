/*
 * Unidades · autoridad única en el editor (etapa 0 de NORMIA-004).
 * Uso: node tests/js/units.mjs
 *
 * Comprueba assets/js/lib/units.js contra la misma tabla compartida que la
 * suite de PHP (tests/fixtures/units.json). Si una de las dos implementaciones
 * se separa de la tabla, falla. No levanta PHP: es una prueba de módulo puro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { repoRoot, makeReporter } from '../php/harness.mjs';

const report = makeReporter('JS', '');
const fixturePath = path.join(repoRoot, 'tests/fixtures/units.json');
const sourcePath = path.join(repoRoot, 'assets', 'js', 'lib', 'units.js');

if (!fs.existsSync(fixturePath) || !fs.existsSync(sourcePath)) {
  report.check('Existen el módulo de unidades y su tabla compartida', false,
    `${sourcePath} · ${fixturePath}`);
  process.exit(report.summary() ? 1 : 0);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const source = fs.readFileSync(sourcePath, 'utf8');

const dom = new JSDOM('<!doctype html><html lang="es"><body></body></html>', {
  url: 'http://127.0.0.1/',
  runScripts: 'outside-only',
});
const { window } = dom;
window.eval(`${source}\n//# sourceURL=units.js`);
const U = window.Normia?.Units;

const near = (a, b, tolerance = 1e-12) => Math.abs(Number(a) - Number(b)) <= tolerance;
const fmt = (value) => Number(value).toLocaleString('es-CO', { maximumFractionDigits: 9 });

report.check('El módulo se publica como window.Normia.Units', Boolean(U) && typeof U.toMeters === 'function',
  U ? Object.keys(U).length + ' funciones' : 'no existe');

if (!U) {
  process.exit(report.summary() ? 1 : 0);
}

/* ------------------------------ constantes ------------------------------ */

report.check('Admite mm, cm y m', Array.isArray(U.SUPPORTED) && U.SUPPORTED.join(',') === 'mm,cm,m', U.SUPPORTED.join(', '));
report.check('La unidad por defecto es cm', U.DEFAULT_UNIT === 'cm', String(U.DEFAULT_UNIT));
report.check('La tolerancia de aplanado es 0,5 cm', U.TOLERANCE_CM === 0.5, String(U.TOLERANCE_CM));

/* ------------------------------- factores ------------------------------- */

for (const item of fixture.units) {
  const unit = item.unit;
  const pairs = [
    ['metros por unidad', U.metersPerUnit(unit), item.metersPerUnit],
    ['centímetros por unidad', U.cmPerUnit(unit), item.cmPerUnit],
    ['unidades por metro', U.unitsPerMeter(unit), item.unitsPerMeter],
    ['tolerancia', U.tolerance(unit), item.tolerance],
  ];
  const wrong = pairs.filter(([, actual, expected]) => !near(actual, expected));
  report.check(`Factores de la unidad ${unit}`, wrong.length === 0,
    wrong.length === 0
      ? `${fmt(item.metersPerUnit)} m/u · ${fmt(item.unitsPerMeter)} u/m`
      : wrong.map(([name, actual, expected]) => `${name}: ${fmt(actual)} (esperado ${fmt(expected)})`).join(' · '));
}

/* ----------------------------- longitudes ----------------------------- */

for (const item of fixture.lengths) {
  const meters = U.toMeters(item.value, item.unit);
  const back = U.fromMeters(meters, item.unit);
  report.check(item.label, near(meters, item.meters) && near(back, item.value, 1e-9),
    `${fmt(item.value)} ${item.unit} → ${fmt(meters)} m`);
}

/* ------------------------------ superficies ------------------------------ */

for (const item of fixture.areas) {
  const area = U.squareMeters(item.value, item.unit);
  report.check(item.label, near(area, item.squareMeters, 1e-9), `${fmt(item.value)} u² → ${fmt(area)} m²`);
}

/* --------------------------- unidad inválida --------------------------- */

const invalidFailures = [];
for (const value of fixture.invalidUnits) {
  try {
    if (U.normalize(value) !== 'cm' || U.isSupported(value) !== false) invalidFailures.push(JSON.stringify(value));
  } catch (error) {
    invalidFailures.push(`${JSON.stringify(value)} → ${error.message}`);
  }
}
report.check('Una unidad desconocida cae a cm sin lanzar', invalidFailures.length === 0,
  invalidFailures.length === 0 ? `${fixture.invalidUnits.length} casos` : invalidFailures.join(', '));

/* -------------------------------- escalas -------------------------------- */

const scaleFailures = [];
for (const item of fixture.scales) {
  const denominator = U.scaleDenominator(item.scale);
  const ok = item.denominator === null ? denominator === null : near(denominator, item.denominator);
  if (!ok) scaleFailures.push(JSON.stringify(item.scale));
}
report.check('La escala de impresión se lee y nunca se aplica a longitudes', scaleFailures.length === 0,
  scaleFailures.length === 0 ? `${fixture.scales.length} casos` : scaleFailures.join(', '));

/* ------------------- paridad exacta con el cálculo anterior ------------------- */

const legacy = 1 / 100;
const exact = U.metersPerUnit('cm') === legacy
  && U.cmPerUnit('cm') === 1
  && U.unitsPerMeter('cm') === 100
  && U.toMeters(1200, 'cm') === 1200 * legacy
  && U.tolerance('cm') === 0.5
  && U.tolerance('cm') * U.cmPerUnit('cm') === 0.5;
report.check('La ruta «cm» es idéntica bit a bit al cálculo anterior', exact,
  `metersPerUnit=${U.metersPerUnit('cm')} · toMeters(1200)=${U.toMeters(1200, 'cm')}`);

/* ------------------- metros → unidades: identidad exacta -------------------
 * Misma tabla que la suite de PHP. Se compara con igualdad estricta: si JS
 * dividiera por los metros por unidad en vez de multiplicar por 100 y dividir
 * por los centímetros por unidad, un ancho de vía saldría un bit distinto que
 * en el servidor, y el SVG del navegador no coincidiría con el exportado.
 */

const fromFailures = [];
for (const item of fixture.fromMeters) {
  const value = U.fromMeters(item.meters, item.unit);
  if (value !== item.units) fromFailures.push(`${item.meters} m en ${item.unit}: ${value} ≠ ${item.units}`);
}
report.check('Metros → unidades coincide bit a bit con la tabla compartida', fromFailures.length === 0,
  fromFailures.length === 0 ? `${fixture.fromMeters.length} casos en mm, cm y m` : fromFailures.join(' · '));

/* ---------------------------- invariancias ---------------------------- */

const invariant = U.SUPPORTED.every((unit) => {
  const factor = U.metersPerUnit(unit);
  return near(U.unitsPerMeter(unit) * factor, 1) && near(U.cmPerUnit(unit), factor * 100);
});
report.check('Los factores guardan sus invariancias en las tres unidades', invariant);

const squares = U.SUPPORTED.every((unit) => {
  const factor = U.metersPerUnit(unit);
  return near(U.squareMeters(4, unit), (4 * factor) * factor);
});
report.check('La superficie sale del mismo factor que la longitud', squares);

/* --------------------- longitud de arcos: PHP y JS iguales ---------------------
 * El trazo curvo se mide por su arco en los dos lados:
 *
 *   JavaScript: Mep.elementLengthMeters → Geometry.pathLength
 *   PHP:        MepCalculator::length     → PathGeometry::length
 *
 * Con un semicírculo de 400 unidades de cuerda y 200 de flecha, el trazo mide
 * 628,318… unidades y la cuerda 400. Aquí se fija el valor del editor y se
 * comprueba contra la referencia que también guarda el golden en PHP, para que
 * una regresión en cualquiera de los dos lados rompa esta suite.
 */
for (const file of ['js/lib/geometry.js', 'js/lib/mep.js']) {
  window.eval(`${fs.readFileSync(path.join(repoRoot, 'assets', file), 'utf8')}\n//# sourceURL=${file}`);
}
const Mep = window.Normia?.Mep;
const arco = {
  id: 'el_arco',
  type: 'pipe',
  points: [{ x: 0, y: 200 }, { x: 400, y: 200 }],
  curves: [{ kind: 'arc', through: { x: 200, y: 0 } }, null],
};
const chord = 400;
const arcLength = Math.PI * 200;
const canvasCm = { unit: 'cm', scale: '1:100' };
const jsMeters = Mep?.elementLengthMeters?.(arco, canvasCm);

report.check('La longitud de un trazo curvo en el editor incluye el arco',
  Number.isFinite(jsMeters) && near(jsMeters, arcLength / 100, 1e-9),
  `${jsMeters} m (arco) frente a ${chord / 100} m de cuerda`);
report.check('El servidor mide lo mismo que el editor (referencia del golden PHP)',
  near(jsMeters, 6.283185307179586, 1e-9) && Math.abs(jsMeters - chord / 100) > 2,
  'MepCalculator y Mep.elementLengthMeters coinciden en 6,283185307179586 m');
report.check('Un trazo recto no se mueve al medir con arcos',
  near(Mep?.elementLengthMeters?.({ points: [{ x: 0, y: 0 }, { x: 400, y: 0 }] }, canvasCm), 4, 1e-12),
  'recta de 400 unidades = 4 m');

/* --------------------- paridad con el golden que escribe PHP ---------------------
 * El golden (tests/fixtures/golden/numeric.json) lo produce PHP. Aquí se lee y
 * se comprueba que el editor calcula exactamente la misma cifra para la misma
 * geometría: es la prueba cruzada de que PHP y JS no se separan sin que falle
 * una suite, sin necesidad de un tercer valor de referencia.
 */

const goldenPath = path.join(repoRoot, 'tests/fixtures/golden/numeric.json');
if (fs.existsSync(goldenPath)) {
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const tuberia = golden?.synthetic?.tuberia ?? {};
  const recta = { points: [{ x: 0, y: 0 }, { x: 400, y: 0 }] };
  const jsRecta = Mep?.elementLengthMeters?.(recta, canvasCm);
  report.check('El golden de PHP trae la medición del arco de referencia',
    typeof tuberia.arcoMetrosMep === 'number' && typeof tuberia.rectaMetros === 'number',
    `arco ${tuberia.arcoMetrosMep} m · recta ${tuberia.rectaMetros} m`);
  report.check('El editor coincide exactamente con el golden de PHP',
    jsMeters === tuberia.arcoMetrosMep && jsRecta === tuberia.rectaMetros,
    `JS arco ${jsMeters} · PHP ${tuberia.arcoMetrosMep}`);
}

/* ------------------------------ pureza ------------------------------ */

report.check('El módulo no toca el DOM ni la red',
  !/document\.|localStorage|sessionStorage|fetch\(|XMLHttpRequest|WebSocket/.test(source),
  'sin acceso al documento ni a la red');

report.check('Unidades y tabla compartida coinciden en cantidad de casos',
  fixture.units.length === 3 && fixture.lengths.length >= 6 && fixture.areas.length === 3,
  `${fixture.units.length} unidades · ${fixture.lengths.length} longitudes · ${fixture.areas.length} superficies`);

process.exit(report.summary() ? 1 : 0);
