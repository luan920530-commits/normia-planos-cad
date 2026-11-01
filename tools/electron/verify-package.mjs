/*
 * Comprueba un paquete ya compilado de la edición Electron.
 *
 * Uso:
 *   node tools/electron/verify-package.mjs <carpeta resources> [--completo]
 *
 * Se le pasa la carpeta `resources` del paquete (la que contiene `app/` y
 * `runtime/`), con una ruta relativa: así el guion funciona igual en el Git Bash
 * de Windows, en macOS y en Linux, sin conversiones de rutas.
 *
 * Qué comprueba:
 *   1. Que el intérprete del paquete carga y trae las seis extensiones, sin usar
 *      el `node_modules` del repositorio ni el sistema de archivos del equipo.
 *      Para eso se copia `runtime/` a una carpeta temporal fuera del repositorio
 *      y se importa desde ahí: si se importara en su sitio, Node subiría por el
 *      árbol y encontraría el `node_modules` del repositorio, que es justo lo
 *      que no lleva el paquete instalado. Con ese atajo, un paquete sin
 *      `runtime/node_modules` pasaba la comprobación y fallaba en el Mac del
 *      usuario con «Cannot find package '@php-wasm/node'».
 *   2. Que viajan los paquetes de php-wasm que el intérprete necesita.
 *   3. Que la aplicación está completa (index.php, app/, assets/, recursos).
 *   4. Con `--completo`, además arranca el servidor real, instala y entra.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED = ['pdo_sqlite', 'sqlite3', 'mbstring', 'openssl', 'fileinfo', 'session'];
/** Paquetes que el intérprete importa al arrancar; el paquete debe llevarlos. */
const PHP_PACKAGES = [
  '@php-wasm/node',
  '@php-wasm/node-8-3',
  '@php-wasm/universal',
  '@php-wasm/util',
  '@php-wasm/logger',
  '@php-wasm/stream-compression',
  '@php-wasm/progress',
  '@php-wasm/cli-util',
];
const FILES = [
  'app/index.php',
  'app/bootstrap.php',
  'app/app/Core/Application.php',
  'app/assets/css/app.css',
  'app/assets/js/editor.js',
  'app/resources/iso7010-catalog.json',
  'app/resources/cad-objects.json',
];

const [, , target, ...flags] = process.argv;
if (!target) {
  console.error('Uso: node tools/electron/verify-package.mjs <carpeta resources> [--completo]');
  process.exit(2);
}

const resources = path.resolve(target);
const appDir = path.join(resources, 'app');
const runtimeDir = path.join(resources, 'runtime');
const problems = [];
const note = (line) => console.log(line);

note(`· Paquete: ${resources}`);

/* 1. El intérprete viaja completo: los paquetes de php-wasm y sus archivos. */
for (const name of PHP_PACKAGES) {
  const manifest = path.join(runtimeDir, 'node_modules', name, 'package.json');
  if (!fs.existsSync(manifest)) problems.push(`falta runtime/node_modules/${name}`);
}
if (!problems.length) note(`  ✓ los ${PHP_PACKAGES.length} paquetes de php-wasm están en el paquete`);

/* 2. Intérprete del paquete, aislado en una carpeta temporal fuera del repo. */
let php = null;
let isolated = '';
try {
  if (!fs.existsSync(path.join(runtimeDir, 'php-wasm.mjs'))) throw new Error('falta runtime/php-wasm.mjs');
  isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'normia-verifica-'));
  const copy = path.join(isolated, 'runtime');
  fs.cpSync(runtimeDir, copy, { recursive: true, dereference: true });
  // Si algún día la carpeta temporal quedara dentro de un proyecto con
  // `node_modules`, la prueba volvería a mentir: se avisa en vez de callarlo.
  for (let directory = isolated; directory !== path.dirname(directory); directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, 'node_modules'))) {
      note(`  · aviso: ${path.join(directory, 'node_modules')} podría resolver los paquetes por fuera del paquete`);
      break;
    }
  }
  const runtime = await import(pathToFileURL(path.join(copy, 'php-wasm.mjs')).href);
  php = new runtime.PHP(await runtime.loadNodeRuntime('8.3', { emscriptenOptions: { processId: process.pid % 100000 } }));
  const report = await php.run({
    code: `<?php echo json_encode([
      'version' => PHP_VERSION,
      'loaded' => array_values(array_filter(${JSON.stringify(REQUIRED)}, 'extension_loaded')),
      'drivers' => class_exists('PDO') ? \\PDO::getAvailableDrivers() : [],
    ]);`,
  });
  const text = String(report.text || '');
  const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const missing = REQUIRED.filter((name) => !data.loaded.includes(name));
  note(`  PHP ${data.version} · controladores: ${(data.drivers || []).join(', ') || 'ninguno'}`);
  for (const name of REQUIRED) note(`  ${data.loaded.includes(name) ? '✓' : '✗'} ${name}`);
  if (missing.length) problems.push(`faltan extensiones: ${missing.join(', ')}`);
  if (!/^8\.3\./.test(data.version)) problems.push(`versión inesperada de PHP: ${data.version}`);
  if (!(data.drivers || []).includes('sqlite')) problems.push('PDO no ofrece el controlador sqlite');
} catch (error) {
  problems.push(`el intérprete del paquete no arrancó: ${error?.message || error}`);
} finally {
  try { php?.exit?.(); } catch { /* nada que cerrar */ }
  if (isolated) fs.rmSync(isolated, { recursive: true, force: true });
}

/* 3. La aplicación completa. */
for (const relative of FILES) {
  if (!fs.existsSync(path.join(appDir, relative.replace(/^app\//, '')))) problems.push(`falta ${relative}`);
}
if (!problems.length) note('  ✓ la aplicación está completa');

/* 4. Opcional: el servidor de verdad, instalando en una carpeta temporal. */
if (flags.includes('--completo')) {
  const dataDir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || process.env.TEMP || '/tmp', 'normia-paquete-'));
  try {
    const { startServer } = await import('./server.mjs');
    const started = await startServer({ appDir, dataDir, runtimeDir, port: 0, log: (line) => note(`    ${line}`) });
    await started.waitUntilReady();
    const home = await fetch(`${started.url.replace(/\/$/, '')}/index.php?r=install`);
    const html = await home.text();
    const token = /name="_token" value="([^"]+)"/.exec(html)?.[1] || '';
    if (home.status !== 200 || !token) throw new Error(`la instalación respondió ${home.status} sin formulario`);
    const stored = await fetch(`${started.url.replace(/\/$/, '')}/storage/config.php`);
    if (stored.status !== 404) throw new Error(`storage/ respondió ${stored.status}`);
    note('  ✓ el servidor del paquete responde y no entrega storage/');
    await started.close();
  } catch (error) {
    problems.push(`el servidor del paquete no respondió: ${error?.message || error}`);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

if (problems.length) {
  for (const problem of problems) console.log(`::error title=paquete::${problem}`);
  console.error(`\nEl paquete no sirve: ${problems.length} problema(s).`);
  process.exit(1);
}
console.log('\nEl paquete está completo y su intérprete funciona.');
