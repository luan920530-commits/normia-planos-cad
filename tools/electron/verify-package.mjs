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
 *   2. Que la aplicación está completa (index.php, app/, assets/, recursos).
 *   3. Con `--completo`, además arranca el servidor real, instala y entra.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED = ['pdo_sqlite', 'sqlite3', 'mbstring', 'openssl', 'fileinfo', 'session'];
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

/* 1. Intérprete del paquete, sin tocar el sistema de archivos del equipo. */
let php = null;
try {
  if (!fs.existsSync(path.join(runtimeDir, 'php-wasm.mjs'))) throw new Error('falta runtime/php-wasm.mjs');
  const runtime = await import(pathToFileURL(path.join(runtimeDir, 'php-wasm.mjs')).href);
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
}
try { php?.exit?.(); } catch { /* nada que cerrar */ }

/* 2. La aplicación completa. */
for (const relative of FILES) {
  if (!fs.existsSync(path.join(appDir, relative.replace(/^app\//, '')))) problems.push(`falta ${relative}`);
}
if (!problems.length) note('  ✓ la aplicación está completa');

/* 3. Opcional: el servidor de verdad, instalando en una carpeta temporal. */
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
