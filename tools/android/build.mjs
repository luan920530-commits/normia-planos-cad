/*
 * Arma el contenido del APK de Android.
 *
 * Prepara dos cosas distintas que no se pueden confundir:
 *
 * - **Los activos del WebView** (`app/src/main/assets/`): lo único que el
 *   navegador pide por red —CSS, JS, imágenes y el manifiesto del editor— más la
 *   pantalla contenedora y el intérprete. `WebViewAssetLoader` sirve esa carpeta
 *   bajo `https://appassets.androidplatform.net/assets/`, de modo que la URL
 *   `/assets/css/app.css` del HTML es el archivo `css/app.css` del APK. Por eso
 *   las **tripas** de `assets/` (no la carpeta) se copian a la raíz.
 * - **El intérprete** (`php/app-files.json`): la aplicación PHP completa, que se
 *   monta en `/www` dentro de WebAssembly. Ahí sí va el árbol del repositorio con
 *   su carpeta `assets/` intacta, porque `Url::asset()` y el service worker del
 *   modo brigadista leen del disco del intérprete.
 *
 * Uso:
 *   npm install --no-save @php-wasm/web@3.1.61 @php-wasm/web-8-3@3.1.61 esbuild
 *   node tools/android/build.mjs            # deja los activos listos
 *   node tools/android/build.mjs --apk      # además compila con Gradle
 *
 * Sin SDK de Android ni Gradle no se puede compilar el APK: eso ocurre en
 * `.github/workflows/dist-android.yml`, en una máquina con el SDK instalado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
// Raíz de los activos del APK: la URL `/assets/…` se resuelve contra esta
// carpeta, así que contiene las **tripas** de `assets/` (css, img, js…) y no la
// carpeta en sí.
const TARGET = path.join(HERE, 'app/src/main/assets');
const STATIC = path.join(ROOT, 'assets');

/** Lo que no forma parte de la aplicación: pruebas, paquetes y control de versiones. */
const EXCLUDED = new Set(['.git', '.github', 'dist', 'node_modules', 'paquetes', 'coverage', 'tests', 'build', 'tools']);

const args = new Set(process.argv.slice(2));

function shouldCopy(relative) {
  const posix = relative.split('/').join('/');
  const [first] = posix.split('/');
  if (EXCLUDED.has(first)) return false;
  if (/^config\/config\.php$/.test(posix)) return false;
  if (/^storage\//.test(posix)) return false;
  if (posix.startsWith('tools/android/')) return false;
  if (posix.endsWith('.DS_Store')) return false;
  return true;
}

function version() {
  return String(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
}

/**
 * Copia al APK lo que el WebView carga por red: los archivos estáticos del
 * editor. Se copian las **tripas** de `assets/` a la raíz del destino porque el
 * cargador quita el prefijo `/assets/` de la URL antes de buscar el archivo:
 * `/assets/css/app.css` → `app/src/main/assets/css/app.css`.
 */
function copyStatic() {
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.mkdirSync(TARGET, { recursive: true });
  fs.cpSync(STATIC, TARGET, { recursive: true });
  return Object.keys(walkFiles(STATIC)).length;
}

/** Lista los archivos de una carpeta como `ruta relativa → ruta absoluta`. */
function walkFiles(directory, prefix = '') {
  const found = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(found, walkFiles(absolute, relative));
    else if (entry.isFile()) found[relative] = absolute;
  }
  return found;
}

/** Empaqueta los archivos de la aplicación para el intérprete (mapa ruta → base64). */
function packAppFiles() {
  const files = {};
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!shouldCopy(relative)) continue;
        walk(absolute, relative);
      } else if (entry.isFile()) {
        files[relative] = fs.readFileSync(absolute).toString('base64');
      }
    }
  };
  walk(ROOT, '');
  const payload = { version: version(), generatedAt: new Date().toISOString(), files };
  fs.mkdirSync(path.join(TARGET, 'php'), { recursive: true });
  fs.writeFileSync(path.join(TARGET, 'php/app-files.json'), JSON.stringify(payload), 'utf8');
  return { count: Object.keys(files).length, files };
}

/** Cuenta que el APK trae creada. Se muestra en la pantalla de acceso. */
const SEED_EMAIL = 'admin@normia.local';
const SEED_PASSWORD = 'ClaveSegura2026';

/**
 * Deja la aplicación **ya instalada** dentro del APK: base de datos, cuenta
 * administradora y proyecto de demostración.
 *
 * En un teléfono, el instalador es un formulario que hay que enviar y esperar;
 * si ese envío falla, el usuario se queda mirando una pantalla que no avanza.
 * Como el APK es una aplicación de un solo usuario y no se instala por web, la
 * instalación se hace **aquí**, en la máquina que compila, y el resultado viaja
 * como semilla (`php/seed.json`). Al primer arranque, `NormiaApp` la escribe en
 * el intérprete y la guarda en el teléfono.
 *
 * Las credenciales son fijas y se muestran en la pantalla de acceso.
 *
 * @returns {Promise<null|object>} contenido de la semilla
 */
async function makeSeed(files) {
  if (args.has('--no-seed')) {
    console.log('· sin semilla (--no-seed): el APK arrancará con el instalador');
    return null;
  }
  const { createRequire } = await import('node:module');
  globalThis.require = createRequire(import.meta.url);
  const { PHP, PHPRequestHandler } = await import('@php-wasm/universal');
  const { loadWebRuntime } = await import('@php-wasm/web');
  const { NormiaApp } = await import('./web/app-core.js');

  const base = path.join(ROOT, 'node_modules/@php-wasm/web-8-3/asyncify');
  const versions = fs.existsSync(base) ? fs.readdirSync(base) : [];
  const wasm = versions.map((v) => path.join(base, v, 'php_8_3.wasm')).find((file) => fs.existsSync(file));
  if (!wasm) throw new Error('Falta el intérprete asyncify para preparar la instalación de fábrica.');

  const php = new PHP(await loadWebRuntime('8.3', { emscriptenOptions: { wasmBinary: fs.readFileSync(wasm) } }));
  const app = new NormiaApp({
    php,
    files,
    storage: null,
    createHandler: (instance, documentRoot) => new PHPRequestHandler({ php: instance, documentRoot, absoluteUrl: 'http://127.0.0.1' }),
  });
  await app.start();

  const page = await app.fetchPage('/');
  const token = /name="_token" value="([^"]+)"/.exec(page.text)?.[1] || '';
  if (!token) throw new Error('El instalador no devolvió su token; no se puede preparar la semilla.');

  const body = new TextEncoder().encode(new URLSearchParams({
    _token: token,
    name: 'Equipo Android',
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    password_confirm: SEED_PASSWORD,
    demo: '1',
  }).toString());
  const post = await app.request({
    url: '/index.php?r=install',
    method: 'POST',
    headers: [['content-type', 'application/x-www-form-urlencoded']],
    body,
  });
  if (post.status !== 303) {
    const detalle = String(post.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error(`La instalación de fábrica falló (${post.status}). ${detalle}`);
  }

  // Solo lo que forma los datos del usuario: configuración y base de datos.
  // Solo lo que forma la instalación: la configuración generada y la base de
  // datos. Los archivos de ejemplo de `config/` no aportan y no se copian.
  const elegidos = app.dataFiles().filter((relative) => relative === 'config/config.php' || /\.sqlite$/.test(relative));
  const seedFiles = {};
  for (const relative of elegidos) {
    seedFiles[relative] = Buffer.from(php.readFileAsBuffer(`${app.dataDir}/${relative}`)).toString('base64');
  }
  const sqlite = elegidos.find((relative) => relative.endsWith('.sqlite'));
  if (!sqlite) throw new Error('La instalación de fábrica no creó la base de datos.');
  app.dispose();
  php.exit(0);

  const seed = {
    version: version(),
    generatedAt: new Date().toISOString(),
    account: { email: SEED_EMAIL, password: SEED_PASSWORD, name: 'Equipo Android', demo: true },
    files: seedFiles,
    bytes: Object.values(seedFiles).reduce((sum, value) => sum + Buffer.from(value, 'base64').length, 0),
  };
  fs.writeFileSync(path.join(TARGET, 'php/seed.json'), JSON.stringify(seed), 'utf8');
  return seed;
}

/** Genera `php/runtime.js` con el intérprete y el manejador de peticiones. */
async function bundleRuntime() {
  const esbuild = await import('esbuild');
  const entry = path.join(HERE, 'web/runtime-entry.js');
  fs.writeFileSync(entry, [
    "export { PHP, PHPRequestHandler } from '@php-wasm/universal';",
    "export { loadWebRuntime } from '@php-wasm/web';",
    // La misma detección que usa `loadWebRuntime` para elegir cargador: la
    // pantalla la consulta para pedir el binario que corresponde (asyncify o
    // jspi). Sin esto, un WebView con JSPI recibía el binario de asyncify.
    "export { jspi } from '@php-wasm/web-8-3';",
    '',
  ].join('\n'), 'utf8');
  // El entorno de desarrollo puede tener varias copias de `@php-wasm/universal`
  // (una por paquete que la pide). El intérprete guarda su registro en memoria,
  // así que todas las importaciones deben apuntar a la misma copia.
  const shared = new URL('../../node_modules/', import.meta.url).pathname;
  const alias = {};
  for (const name of ['universal', 'util', 'logger', 'fs-journal']) {
    alias[`@php-wasm/${name}`] = `${shared}@php-wasm/${name}/index.js`;
  }

  await esbuild.build({
    entryPoints: [entry],
    alias,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome110'],
    outfile: path.join(TARGET, 'php/runtime.js'),
    minify: true,
    legalComments: 'none',
    // El paquete tiene ramas para Node que el navegador nunca ejecuta.
    external: ['worker_threads', 'node:worker_threads', 'fs', 'node:fs', 'path', 'node:path'],
    // `getIntlExtensionPath()` importa un idioma de PHP como archivo con sufijo
    // `?url`, que solo entiende un empaquetador como Vite. No se usa: se anula.
    plugins: [{
      // `icu.dat` son 30 MB de datos de internacionalización que solo se cargan
      // al pedir la extensión `intl`. Normia no la usa: no viaja en el APK.
      name: 'sin-icu',
      setup(build) {
        build.onResolve({ filter: /\.dat$/ }, () => ({ path: 'icu', namespace: 'icu-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'icu-stub' }, () => ({ contents: 'export default new Uint8Array(0);', loader: 'js' }));
      },
    }, {
      // El paquete trae el cargador de las nueve versiones de PHP. El APK usa
      // solo la 8.3: las demás se reemplazan por un aviso para no cargar 40 MB
      // de código que nunca se ejecuta.
      name: 'solo-php-83',
      setup(build) {
        build.onResolve({ filter: /^@php-wasm\/web-/ }, (args) => {
          if (args.path === '@php-wasm/web-8-3' || args.path === '@php-wasm/web-service-worker') return null;
          return { path: args.path, namespace: 'php-version-stub' };
        });
        build.onLoad({ filter: /.*/, namespace: 'php-version-stub' }, () => ({
          contents: [
            'export async function getPHPLoaderModule() {',
            "  throw new Error('Esta compilación solo incluye PHP 8.3');",
            '}',
            'export async function getIntlExtensionPath() { return ""; }',
            'export const jspi = async () => false;',
            '',
          ].join('\n'),
          loader: 'js',
        }));
      },
    }, {
      name: 'ignore-php-url-imports',
      setup(build) {
        build.onResolve({ filter: /\?url$/ }, () => ({ path: 'stub-url', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default "";', loader: 'js' }));
      },
    }],
  });
  fs.rmSync(entry, { force: true });
}

/**
 * Copia **las dos** compilaciones del intérprete: `asyncify` y `jspi`.
 *
 * `@php-wasm/web` elige entre las dos con `jspi()` de `wasm-feature-detect`, y
 * esa elección también decide qué cargador de JavaScript usa. Si se copiara una
 * sola —como se hacía antes, siempre asyncify— en un navegador con JSPI
 * (Chrome moderno, Android 15) el cargador JSPI instanciaría el binario de
 * asyncify y fallaría con «Import #0 "env" "invoke_ii": function import
 * requires a callable». La pantalla (`shell.js`) hace la misma detección y pide
 * el archivo correspondiente.
 */
function copyWasm() {
  const base = path.join(ROOT, 'node_modules/@php-wasm/web-8-3');
  if (!fs.existsSync(base)) {
    throw new Error('Falta @php-wasm/web-8-3. Instálalo con npm install --no-save.');
  }
  const copied = {};
  for (const modo of ['asyncify', 'jspi']) {
    const directory = path.join(base, modo);
    if (!fs.existsSync(directory)) continue;
    let candidate = null;
    for (const version of fs.readdirSync(directory)) {
      const file = path.join(directory, version, 'php_8_3.wasm');
      if (fs.existsSync(file)) candidate = file;
    }
    if (!candidate) continue;
    const destination = path.join(TARGET, `php/php_8_3_${modo}.wasm`);
    fs.copyFileSync(candidate, destination);
    copied[modo] = { source: candidate, destination, size: fs.statSync(destination).size };
  }
  if (!copied.asyncify) throw new Error('No se encontró el intérprete asyncify de PHP 8.3 en @php-wasm/web-8-3.');
  if (!copied.jspi) {
    // Sin la variante JSPI, un navegador que la elija no podría arrancar: es
    // mejor detener el armado que publicar un APK que falla en equipos nuevos.
    throw new Error('Falta la variante «jspi» de PHP 8.3; el paquete @php-wasm/web-8-3 está incompleto.');
  }
  return copied;
}

/** Copia la pantalla del contenedor (HTML, CSS y JS). */
function copyShell() {
  for (const name of ['index.html', 'shell.css', 'shell.js', 'app-core.js', 'opfs.js', 'bridge.js']) {
    fs.copyFileSync(path.join(HERE, 'web', name), path.join(TARGET, name));
  }
}

function gradle() {
  const command = process.platform === 'win32' ? 'gradle.bat' : 'gradle';
  execFileSync(command, ['assembleRelease', `-PnormiaVersion=${version()}`, '--no-daemon'], {
    cwd: HERE,
    stdio: 'inherit',
  });
}

async function main() {
  if (args.has('--check')) {
    console.log(`Versión ${version()} · destino ${path.relative(ROOT, TARGET)}`);
    return;
  }
  const staticCount = copyStatic();
  const packed = packAppFiles();
  copyShell();
  const wasm = copyWasm();
  await bundleRuntime();
  const seed = await makeSeed(packed.files);
  console.log(`· ${packed.count} archivos de la aplicación para el intérprete`);
  if (seed) {
    console.log(`· instalación de fábrica: ${Object.keys(seed.files).join(', ')} (${(seed.bytes / 1024).toFixed(0)} KB)`);
    console.log(`· cuenta del APK: ${seed.account.email} · ${seed.account.demo ? 'con demo' : 'sin demo'}`);
  }
  console.log(`· ${staticCount} activos estáticos para el WebView`);
  for (const [modo, info] of Object.entries(wasm)) {
    console.log(`· intérprete ${modo}: ${(info.size / 1048576).toFixed(1)} MB`);
  }
  console.log(`· activos en ${path.relative(ROOT, TARGET)}`);
  if (args.has('--apk')) gradle();
}

main().catch((error) => {
  console.error(`No se pudo preparar el APK: ${error.message}`);
  process.exit(1);
});
