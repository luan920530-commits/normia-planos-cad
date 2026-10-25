/*
 * Ejecuta la suite completa de desarrollo de Normia Planos CAD.
 * Requiere Node 22+ y las dependencias de desarrollo (php-wasm y jsdom).
 * No forma parte del paquete de producción.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = new Set(process.argv.slice(2).filter((argument) => !argument.startsWith('-')));
const skipPackage = process.argv.includes('--skip-package');

const steps = [
  { name: 'Sintaxis PHP 8.1', script: 'tests/php/lint.mjs', args: ['8.1'] },
  { name: 'Sintaxis PHP 8.3', script: 'tests/php/lint.mjs', args: ['8.3'] },
  { name: 'Sintaxis JavaScript', script: 'tests/js/lint.mjs', args: [] },
  { name: 'Funcionamiento sin conexión', script: 'tests/js/offline.mjs', args: [] },
  { name: 'Funcional PHP 8.1', script: 'tests/php/functional.mjs', args: ['8.1'] },
  { name: 'Funcional PHP 8.3', script: 'tests/php/functional.mjs', args: ['8.3'] },
  { name: 'Interfaz (JSDOM) PHP 8.1', script: 'tests/js/editor.mjs', args: ['8.1'] },
  { name: 'Interfaz (JSDOM) PHP 8.3', script: 'tests/js/editor.mjs', args: ['8.3'] },
  { name: 'Paquetes y demo', script: 'tests/php/package.mjs', args: ['8.3'], package: true },
];

const selected = steps.filter((step) => {
  if (step.package && skipPackage) return false;
  if (only.size === 0) return true;
  return only.has(step.script) || only.has(step.name);
});

if (selected.length === 0) {
  console.log('No hay pasos que coincidan con el filtro. Usa: node tests/run-all.mjs [ruta-del-script]');
  process.exit(1);
}

const results = [];
const started = Date.now();
for (const step of selected) {
  console.log(`\n=== ${step.name} ===`);
  const stepStart = Date.now();
  const result = spawnSync(process.execPath, [step.script, ...step.args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const ok = result.status === 0;
  results.push({ ...step, ok, seconds: ((Date.now() - stepStart) / 1000).toFixed(1) });
  if (!ok) console.log(`\n✗ ${step.name} falló (código ${result.status}).`);
}

console.log('\n============================================');
console.log('Resumen de la suite');
console.log('============================================');
for (const result of results) {
  console.log(`${result.ok ? '✓' : '✗'} ${result.name} · ${result.seconds}s`);
}
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} pasos correctos en ${((Date.now() - started) / 1000).toFixed(1)}s.`);
if (failed.length) {
  console.log('Pasos con fallos:\n' + failed.map((result) => `  - ${result.name}`).join('\n'));
}
process.exitCode = failed.length === 0 ? 0 : 1;
