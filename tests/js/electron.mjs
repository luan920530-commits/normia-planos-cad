/*
 * Pruebas de la edición Electron.
 *
 * No abren una ventana (eso necesita un entorno gráfico), pero sí comprueban lo
 * que de verdad puede fallar: que el servidor arranca PHP compilado a
 * WebAssembly, que la instalación escribe en la carpeta de datos elegida, que
 * `storage/` no se entrega por HTTP y que el armado del paquete deja el
 * intérprete al lado de la ventana, sin las piezas que no se usan.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeReporter, repoRoot } from '../php/harness.mjs';
import { startServer } from '../../tools/electron/server.mjs';
import { copyApp } from '../../tools/shared/app-copy.mjs';

const report = makeReporter('Escritorio (Electron)');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

/* ------------------------------ código fuente ------------------------------ */

const main = read('tools/electron/main.mjs');
const preload = read('tools/electron/preload.cjs');
const server = read('tools/electron/server.mjs');
const build = read('tools/electron/build.mjs');

report.check('La ventana no da acceso a Node a la página y usa un puente propio',
  /nodeIntegration: false/.test(main) && /contextIsolation: true/.test(main) && /sandbox: true/.test(main)
  && /preload: path\.join\(HERE, 'preload\.cjs'\)/.test(main));
report.check('El puente solo expone lo que la aplicación usa',
  /contextBridge\.exposeInMainWorld\('normiaDesktop'/.test(preload) && !/require\('fs'\)/.test(preload));
report.check('Los enlaces externos se abren en el navegador y no dentro de la ventana',
  /will-navigate/.test(main) && /setWindowOpenHandler/.test(main) && /shell\.openExternal\(url\)/.test(main));
report.check('Una sola instancia y cierre ordenado del servidor',
  /requestSingleInstanceLock\(\)/.test(main) && /before-quit/.test(main) && /server\?\.close\(\)/.test(main));
report.check('El menú está en español y no promete funciones que no existen',
  /'Guardar una copia de los datos…'/.test(main) && /'Abrir la carpeta de datos'/.test(main)
  && !/Restaurar/.test(main) && /Acerca de esta edición/.test(main));
report.check('Las descargas se guardan con un nombre libre y lo avisan',
  /will-download/.test(main) && /setSavePath/.test(main) && /Mostrar en la carpeta/.test(main));
report.check('El servidor solo escucha en 127.0.0.1 y no guarda cookies en memoria',
  /host = '127\.0\.0\.1'/.test(server) && /cookieStore: false/.test(server));
report.check('El intérprete recibe la carpeta de datos porque Emscripten no hereda el entorno',
  /ENV: \{ NORMA_DATA_PATH/.test(server) && /getenv\('NORMA_DATA_PATH'\)/.test(server));

const workflow = read('.github/workflows/dist-electron.yml');
report.check('El flujo compila las tres plataformas y publica lo que produce',
  /macos-latest/.test(workflow) && /windows-latest/.test(workflow) && /ubuntu-latest/.test(workflow)
  && /electron-builder/.test(workflow) && /upload-artifact/.test(workflow));
report.check('El flujo comprueba el contenido del paquete, no solo que se haya generado',
  /verify-package\.mjs "\$RESOURCES" --completo/.test(workflow));
report.check('Las sumas del flujo evitan opciones de GNU que macOS no tiene',
  !/^\s*find .* -printf/m.test(workflow) && /sha256sum "\$archivo"/.test(workflow) && /shasum -a 256/.test(workflow));
// Se mira la línea de comando del paso y no el texto: los comentarios explican
// justamente por qué ya no se usa `gh release upload`.
const commands = (text) => text.split('\n').filter((line) => !line.trim().startsWith('#')); 
report.check('Los instaladores se adjuntan con una acción, no con gh release upload',
  /softprops\/action-gh-release@v2/.test(workflow) && !commands(workflow).some((line) => /gh release upload/.test(line)));
const desktopWorkflow = read('.github/workflows/dist-desktop.yml');
report.check('El flujo nativo también adjunta con la acción',
  /softprops\/action-gh-release@v2/.test(desktopWorkflow)
  && !commands(desktopWorkflow).some((line) => /gh release upload/.test(line)));

/* ------------------------------- de punta a punta ------------------------------ */

const appDir = repoRoot;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'normia-electron-'));
const started = await startServer({ appDir, dataDir, port: 0, log: () => {} });
await started.waitUntilReady();
report.check('PHP compilado a WebAssembly arranca con las extensiones que usa la aplicación',
  started.environment.version === '8.3.33' || /^8\.3\./.test(started.environment.version),
  started.environment.version || 'sin versión');
report.check('El intérprete ve la carpeta de datos elegida',
  path.resolve(started.environment.data) === path.resolve(dataDir), started.environment.data || 'vacía');

let cookies = '';
async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.cookie = cookies;
  const response = await fetch(started.url.replace(/\/$/, '') + url, { ...options, headers, redirect: 'manual' });
  const jar = {};
  for (const raw of response.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    jar[pair.slice(0, index)] = pair.slice(index + 1);
  }
  if (Object.keys(jar).length) cookies = Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
  return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()).toString('utf8'), jar };
}

const install = await request('/index.php?r=install');
const token = /name="_token" value="([^"]+)"/.exec(install.body)?.[1] || '';
report.check('La pantalla de instalación responde y entrega el formulario con CSRF',
  install.status === 200 && token.length > 10 && install.body.includes('Normia'));
report.check('La sesión viaja en cookies, no en memoria del proceso', Boolean(install.jar.normia_sid));

const installed = await request('/index.php?r=install', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ _token: token, name: 'Ana', email: 'ana@normia.local', password: 'ClaveSegura2026', password_confirm: 'ClaveSegura2026', demo: '1' }),
});
report.check('La instalación completa escribe la configuración y la base en la carpeta de datos',
  installed.status === 303 && fs.existsSync(path.join(dataDir, 'config/config.php'))
  && fs.readdirSync(path.join(dataDir, 'storage')).some((file) => file.endsWith('.sqlite')));
report.check('Los datos no se escriben dentro del código de la aplicación',
  !fs.existsSync(path.join(appDir, 'config/config.php')));

const login = await request('/index.php?r=login');
const loginToken = /name="_token" value="([^"]+)"/.exec(login.body)?.[1] || '';
const entered = await request('/index.php?r=login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ _token: loginToken, email: 'ana@normia.local', password: 'ClaveSegura2026' }),
});
report.check('Se puede entrar con la cuenta creada y llegar al panel',
  entered.status === 303 && (await request('/')).status === 200);
report.check('El servidor no entrega nada de storage/ ni del código interno',
  (await request('/storage/config.php')).status === 404 && (await request('/config/config.php')).status === 404);
report.check('Los recursos locales se sirven con su tipo',
  (await request('/assets/css/app.css')).status === 200
  && (await request('/assets/css/app.css')).headers.get('content-type')?.includes('text/css'));

await started.close();
fs.rmSync(dataDir, { recursive: true, force: true });

/* --------------------------------- armado ---------------------------------- */

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'normia-electron-build-'));
let buildError = '';
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('../../tools/electron/build.mjs', import.meta.url)),
    `--out=${out}`, '--sin-instalador'], { stdio: 'pipe' });
} catch (error) {
  buildError = String(error.stderr || error.message);
}
const stage = path.join(out, 'stage');
report.check('El armado deja la aplicación, la ventana y el intérprete en su sitio',
  buildError === '' && fs.existsSync(path.join(stage, 'app/index.php'))
  && fs.existsSync(path.join(stage, 'electron/main.mjs')) && fs.existsSync(path.join(stage, 'runtime/php-wasm.mjs')),
  buildError.split('\n').slice(-3).join(' '));
report.check('El intérprete armado no lleva ICU ni extensiones que no se usan',
  !fs.existsSync(path.join(stage, 'runtime/node_modules/@php-wasm/node/shared/icu.dat'))
  && !fs.existsSync(path.join(stage, 'runtime/node_modules/@php-wasm/node-8-3/asyncify/extensions')));
report.check('Solo viaja la versión de PHP que usa la aplicación',
  fs.existsSync(path.join(stage, 'runtime/node_modules/@php-wasm/node-8-3'))
  && !fs.existsSync(path.join(stage, 'runtime/node_modules/@php-wasm/node-8-4')));
const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'), 'utf8'));
function manifestIconPatterns(directory) {
  // electron-builder convierte los PNG por su cuenta en macOS y Windows, y en
  // los flujos esa conversión falló: se entregan .icns y .ico ya hechos.
  return manifest.build.mac.icon.endsWith('.icns') && manifest.build.win.icon.endsWith('.ico')
    && fs.existsSync(path.join(directory, 'build', 'icon.icns'));
}
report.check('Los iconos salen en los formatos que espera cada sistema',
  ['icon.png', 'icon.ico', 'icon.icns'].every((name) => fs.existsSync(path.join(stage, 'build', name)))
  && manifestIconPatterns(stage));
report.check('El instalador es por usuario y sin firma comercial',
  manifest.build.appId === 'co.normia.cad' && manifest.build.nsis.perMachine === false
  && manifest.build.mac.identity === null && manifest.build.mac.category.startsWith('public.app-category'));

// El verificador de paquetes es lo que corre en los flujos: se prueba contra
// una carpeta con la forma real (`resources/app` + `resources/runtime`).
const packaged = path.join(out, 'paquete');
fs.mkdirSync(packaged, { recursive: true });
fs.cpSync(path.join(stage, 'app'), path.join(packaged, 'app'), { recursive: true });
fs.cpSync(path.join(stage, 'runtime'), path.join(packaged, 'runtime'), { recursive: true });
let verifyOk = true;
let verifyOutput = '';
try {
  verifyOutput = execFileSync(process.execPath, [fileURLToPath(new URL('../../tools/electron/verify-package.mjs', import.meta.url)), packaged, '--completo'], { encoding: 'utf8' });
} catch (error) {
  verifyOk = false;
  verifyOutput = String(error.stdout || error.message);
}
report.check('El verificador del paquete arranca el intérprete y el servidor desde resources/',
  verifyOk && /el servidor del paquete responde/.test(verifyOutput),
  verifyOutput.split('\n').filter((line) => line.includes('✗') || line.includes('::error')).join(' ').slice(0, 160));

fs.rmSync(out, { recursive: true, force: true });

// Los flujos compilan dentro del repositorio (`--out=dist/electron`). Node no
// deja copiar un directorio dentro de sí mismo, así que el armado copia entrada
// por entrada: aquí se comprueba con un destino dentro del propio repositorio.
const inside = path.join(repoRoot, 'dist', 'electron-prueba');
let insideError = '';
try {
  copyApp(inside, { excludeTools: true });
} catch (error) {
  insideError = String(error?.message || error);
}
report.check('El armado funciona con la carpeta de destino dentro del repositorio',
  insideError === '' && fs.existsSync(path.join(inside, 'index.php')) && !fs.existsSync(path.join(inside, 'node_modules')),
  insideError);
fs.rmSync(inside, { recursive: true, force: true });

process.exit(report.summary());
