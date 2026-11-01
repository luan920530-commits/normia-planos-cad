/*
 * Pruebas del APK de Android.
 *
 * El contenedor nativo (Kotlin) y la pantalla no se pueden probar sin un
 * teléfono, pero el núcleo —ejecutar PHP compilado a WebAssembly, montar la
 * aplicación, atender peticiones con cookies y guardar los datos— es el mismo
 * código que usa la aplicación instalada y aquí se prueba de punta a punta con
 * el runtime web real.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { makeReporter, repoRoot } from '../php/harness.mjs';
import { NormiaApp, memoryStorage, decodeBase64, encodeBase64 } from '../../tools/android/web/app-core.js';

const report = makeReporter('Android');

globalThis.require = createRequire(import.meta.url);
const { PHP, PHPRequestHandler } = await import('@php-wasm/universal');
const { loadWebRuntime } = await import('@php-wasm/web');

/** Mismo conjunto de archivos que arma tools/android/build.mjs. */
const EXCLUDED = new Set(['.git', '.github', 'dist', 'node_modules', 'paquetes', 'coverage', 'tests', 'build', 'tools']);
function collectFiles(root) {
  const files = {};
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (prefix === '' && EXCLUDED.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) {
        if (/^config\/config\.php$/.test(relative)) continue;
        if (/^storage\//.test(relative)) continue;
        if (relative.endsWith('.DS_Store')) continue;
        files[relative] = fs.readFileSync(absolute).toString('base64');
      }
    }
  };
  walk(root, '');
  return files;
}

function findWasm() {
  const base = path.join(repoRoot, 'node_modules/@php-wasm/web-8-3');
  for (const variant of fs.readdirSync(base)) {
    const directory = path.join(base, variant);
    if (!fs.statSync(directory).isDirectory()) continue;
    for (const version of fs.readdirSync(directory)) {
      const candidate = path.join(directory, version, 'php_8_3.wasm');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

const wasmPath = findWasm();
if (!wasmPath) {
  console.error('Falta @php-wasm/web-8-3. Ejecuta: npm install --no-save @php-wasm/web@3.1.61 @php-wasm/web-8-3@3.1.61');
  process.exit(1);
}
const wasmBinary = fs.readFileSync(wasmPath);
const files = collectFiles(repoRoot);

async function boot(storage) {
  const php = new PHP(await loadWebRuntime('8.3', { emscriptenOptions: { wasmBinary } }));
  const app = new NormiaApp({
    php,
    files,
    storage,
    createHandler: (instance, documentRoot) => new PHPRequestHandler({ php: instance, documentRoot, absoluteUrl: 'http://127.0.0.1' }),
  });
  await app.start();
  return app;
}

const form = (fields) => new TextEncoder().encode(new URLSearchParams(fields).toString());
const URLENCODED = [['content-type', 'application/x-www-form-urlencoded']];

report.check('El paquete incluye la aplicación completa para el intérprete',
  Boolean(files['index.php'] && files['bootstrap.php'] && files['app/Core/Paths.php'])
  && Object.keys(files).length > 100,
  `${Object.keys(files).length} archivos`);

const storage = memoryStorage();
const app = await boot(storage);

let response = await app.request({ url: '/index.php?r=install' });
const token = /name="_token" value="([^"]+)"/.exec(response.text)?.[1] || '';
report.check('El editor arranca dentro del teléfono y muestra el instalador',
  response.status === 200 && /<form/.test(response.text) && token !== '',
  `${response.status} · ${response.ms} ms`);

response = await app.request({
  url: '/index.php?r=install',
  method: 'POST',
  headers: URLENCODED,
  body: form({ _token: token, name: 'Tableta', email: 'campo@normia.local', password: 'ClaveSegura2026', password_confirm: 'ClaveSegura2026', demo: '1' }),
});
report.check('La instalación en el teléfono crea la base de datos',
  response.status === 303 && app.dataFiles().some((file) => file.endsWith('.sqlite')),
  `${response.status} · ${app.dataFiles().filter((f) => f.endsWith('.sqlite')).join('')}`);

response = await app.request({ url: '/index.php?r=login' });
const loginToken = /name="_token" value="([^"]+)"/.exec(response.text)?.[1] || '';
response = await app.request({
  url: '/index.php?r=login',
  method: 'POST',
  headers: URLENCODED,
  body: form({ _token: loginToken, email: 'campo@normia.local', password: 'ClaveSegura2026' }),
});
report.check('El inicio de sesión guarda la cookie de la sesión',
  response.status === 303 && app.cookies.size > 0, `${response.status} · ${app.cookies.size} cookies`);

response = await app.request({ url: '/index.php?r=' });
report.check('El panel abre con la demo y las tipografías locales',
  response.status === 200 && /Mis planos/.test(response.text) && /\/assets\/css\//.test(response.text),
  `${response.status} · ${response.text.length} caracteres`);

const projectHref = /href="(\/index\.php\?r=projects%2F\d+)"/.exec(response.text)?.[1] || /href="(\/index\.php\?r=projects\/\d+)"/.exec(response.text)?.[1];
response = await app.request({ url: projectHref || '/index.php?r=' });
const floorHref = /href="([^"]*floors(?:%2F|\/)\d+(?:%2F|\/)editor)"/.exec(response.text)?.[1] || '';
response = await app.request({ url: floorHref || '/index.php?r=' });
report.check('El editor del plano se dibuja sin navegador de escritorio',
  response.status === 200 && /id="editor-app"/.test(response.text) && /assets\/js\/editor/.test(response.text),
  `${response.status} · ${floorHref ? 'con piso' : 'sin piso'}`);

const floorId = /floors(?:%2F|\/)(\d+)(?:%2F|\/)editor/.exec(floorHref || '')?.[1] || '';
const api = await app.request({ url: `/index.php?r=api/floors/${floorId}/audit`, headers: [['accept', 'application/json']] });
let audit = null;
try { audit = JSON.parse(api.text); } catch { audit = null; }
const analysis = audit?.report?.extinguishers ?? null;
report.check('El motor de extintores responde desde el teléfono',
  api.status === 200 && analysis && typeof analysis.summary?.coveredPct === 'number',
  `${api.status} · ${analysis?.summary?.coveredPct ?? '—'} %`);

const savedFiles = await app.persist();
report.check('Los datos quedan guardados en el almacenamiento del equipo',
  savedFiles > 0 && [...storage.files.keys()].some((file) => file.endsWith('.sqlite')),
  `${savedFiles} archivos · ${storage.files.size} en total`);

// Cierre y reapertura: se pierde el intérprete y la sesión, no los planos.
app.php.exit(0);
const reopened = await boot(storage);
response = await reopened.request({ url: '/index.php?r=' });
const pideEntrar = response.status === 303;
response = await reopened.request({ url: '/index.php?r=login' });
const reopenToken = /name="_token" value="([^"]+)"/.exec(response.text)?.[1] || '';
response = await reopened.request({
  url: '/index.php?r=login',
  method: 'POST',
  headers: URLENCODED,
  body: form({ _token: reopenToken, email: 'campo@normia.local', password: 'ClaveSegura2026' }),
});
const afterLogin = await reopened.request({ url: '/index.php?r=' });
report.check('Al reabrir la app los planos siguen ahí y se vuelve a entrar',
  pideEntrar && afterLogin.status === 200 && /Mis planos/.test(afterLogin.text),
  `${pideEntrar ? 'pide sesión' : 'sin sesión previa'} · ${reopened.status().dataFiles} archivos de datos`);

await reopened.request({ url: '/index.php?r=logout', method: 'POST', headers: URLENCODED, body: form({ _token: '' }) });
await reopened.reset();
response = await reopened.request({ url: '/index.php?r=' });
report.check('El reinicio de fábrica deja la app como recién instalada',
  response.status === 303 && reopened.dataFiles().every((file) => !file.endsWith('.sqlite')),
  `${response.status} · ${reopened.dataFiles().join(',') || 'sin datos'}`);
reopened.php.exit(0);

report.check('El ida y vuelta en base64 conserva los bytes',
  Buffer.from(decodeBase64(encodeBase64(new Uint8Array([0, 1, 127, 128, 255])))).equals(Buffer.from([0, 1, 127, 128, 255])));

/* ------------------------- archivos del contenedor ------------------------- */

const manifest = fs.readFileSync(new URL('../../tools/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const activity = fs.readFileSync(new URL('../../tools/android/app/src/main/java/co/normia/cad/MainActivity.kt', import.meta.url), 'utf8');
const gradle = fs.readFileSync(new URL('../../tools/android/app/build.gradle.kts', import.meta.url), 'utf8');
const androidWorkflow = fs.readFileSync(new URL('../../.github/workflows/dist-android.yml', import.meta.url), 'utf8');

report.check('El contenedor no pide permisos de red ni de ubicación',
  !/android.permission.INTERNET/.test(manifest) && !/ACCESS_FINE_LOCATION/.test(manifest)
  && /android:usesCleartextTraffic="false"/.test(manifest));
report.check('El APK usa WebView con los activos de la app como origen seguro',
  /WebViewAssetLoader/.test(activity) && /appassets\.androidplatform\.net/.test(activity));
report.check('El contenedor guarda descargas en la carpeta pública de descargas',
  /MediaStore/.test(activity) && /Downloads/.test(activity));
report.check('El contenedor imprime el plano con el servicio de impresión de Android',
  /PrintManager/.test(activity) && /createPrintDocumentAdapter/.test(activity));
report.check('El contenedor permite elegir archivos para importar un plano',
  /onShowFileChooser/.test(activity) && /ActivityResultContracts/.test(activity));
report.check('El APK se firma con una clave propia generada por el flujo',
  /minSdk = 26/.test(gradle) && /signingConfigs/.test(gradle));
/*
 * La pantalla tiene que estar debajo del prefijo que el cargador registra.
 * Con el handler en «/» y la URL /index.html, el cargador buscaba
 * assets/index.html —que no existe—, devolvía una respuesta inválida y el
 * WebView mostraba «net::ERR_INVALID_RESPONSE» en lugar del editor.
 */
const androidBuild = fs.readFileSync(new URL('../../tools/android/build.mjs', import.meta.url), 'utf8');
const androidShell = fs.readFileSync(new URL('../../tools/android/web/shell.js', import.meta.url), 'utf8');
const prefixMatch = /private const val ASSETS_PREFIX = "([^"]+)"/.exec(activity);
const prefix = prefixMatch ? prefixMatch[1] : '';
const targetMatch = /const TARGET = path\.join\(HERE, '([^']+)'\)/.exec(androidBuild);
const assetsFolder = targetMatch ? path.posix.basename(targetMatch[1].replace(/\\/g, '/')) : '';
const entryLine = activity.split('\n').find((line) => line.includes('private val ENTRY =')) || '';
const entryTail = '${ASSETS_PREFIX}' + assetsFolder + '/index.html"';
report.check('El cargador registra el prefijo real de los activos y no la raíz',
  prefix === '/assets/'
  && /addPathHandler\(ASSETS_PREFIX, WebViewAssetLoader\.AssetsPathHandler\(this\)\)/.test(activity),
  prefix || 'sin prefijo');
report.check('La pantalla de arranque cuelga de la carpeta que arma el APK',
  assetsFolder === 'www'
  && /loadUrl\(ENTRY\)/.test(activity)
  && entryLine.includes(entryTail),
  entryLine.trim() || 'sin URL de arranque');
report.check('El origen del puente sigue siendo la raíz del dominio virtual',
  (androidShell.match(/const ORIGIN = 'https:\/\/appassets\.androidplatform\.net';/g) || []).length === 2,
  `${(androidShell.match(/const ORIGIN = 'https:\/\/appassets\.androidplatform\.net';/g) || []).length} usos`);
report.check('Si la pantalla no carga se avisa en español con un enlace para reintentar',
  /onReceivedError/.test(activity) && /request\.isForMainFrame/.test(activity)
  && /No se pudo abrir el editor/.test(activity) && /Reintentar/.test(activity)
  && !/net::ERR_INVALID_RESPONSE/.test(activity.replace(/\/\*[\s\S]*?\*\//g, '')));

report.check('El flujo compila el APK y lo adjunta a la release',
  /assembleRelease/.test(androidWorkflow) && /apksigner/.test(androidWorkflow)
  && /gh release upload/.test(androidWorkflow),
  '');

process.exit(report.summary());
