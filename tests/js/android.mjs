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
// Sin sesión la raíz es la presentación pública (no una redirección al acceso).
const muestraPortada = response.status === 200 && /id="capturas"/.test(response.text || '');
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
  muestraPortada && afterLogin.status === 200 && /Mis planos/.test(afterLogin.text),
  `${muestraPortada ? 'portada pública' : 'sin portada'} · ${reopened.status().dataFiles} archivos de datos`);

await reopened.request({ url: '/index.php?r=logout', method: 'POST', headers: URLENCODED, body: form({ _token: '' }) });
await reopened.reset();
response = await reopened.request({ url: '/index.php?r=' });
report.check('El reinicio de fábrica deja la app como recién instalada',
  response.status === 303 && reopened.dataFiles().every((file) => !file.endsWith('.sqlite')),
  `${response.status} · ${reopened.dataFiles().join(',') || 'sin datos'}`);
reopened.php.exit(0);

/*
 * Un almacenamiento que falla no puede tumbar el editor: cada respuesta guarda
 * y, si el teléfono se quedó sin espacio, la página tiene que llegar igual.
 */
const roto = { restore: async () => 0, save: async () => { throw new Error('sin espacio'); }, clear: async () => {} };
const appRota = await boot(roto);
const respuestaRota = await appRota.request({ url: '/index.php?r=install' });
let errorAlGuardar = null;
try { await appRota.flush(); } catch (error) { errorAlGuardar = error; }
report.check('Un fallo al guardar no impide abrir el editor',
  respuestaRota.status === 200 && appRota.lastSaveError instanceof Error && errorAlGuardar instanceof Error,
  `${respuestaRota.status} · ${appRota.lastSaveError ? appRota.lastSaveError.message : 'sin error'}`);
appRota.php.exit(0);

/*
 * Guardar no puede frenar el editor. En la 1.15.4 cada recurso de una pantalla
 * escribía la base de datos entera y el teléfono se quedaba en blanco esperando.
 */
let escrituras = 0;
const lento = {
  restore: async () => 0,
  save: async () => { escrituras += 1; await new Promise((resolve) => setTimeout(resolve, 400)); return 1; },
  clear: async () => {},
};
const appLenta = await boot(lento);
const antesLento = Date.now();
const respuestaRapida = await appLenta.request({ url: '/index.php?r=install' });
const msRespuesta = Date.now() - antesLento;
report.check('El guardado no frena la respuesta del editor',
  respuestaRapida.status === 200 && msRespuesta < 300 && escrituras === 0,
  `${msRespuesta} ms · ${escrituras} escrituras antes de devolver la página`);
await appLenta.flush();
report.check('Los cambios pendientes se guardan al terminar la pantalla', escrituras > 0, `${escrituras} escrituras`);
report.check('Sin cambios nuevos, el guardado no reescribe nada', await appLenta.flush() === 0);
appLenta.php.exit(0);

report.check('El ida y vuelta en base64 conserva los bytes',
  Buffer.from(decodeBase64(encodeBase64(new Uint8Array([0, 1, 127, 128, 255])))).equals(Buffer.from([0, 1, 127, 128, 255])));

/*
 * Almacenamiento del teléfono (OPFS). La 1.15.3 no pasaba de aquí: llamaba a
 * `root.getDirectory()`, un método que no existe en la API del estándar, y el
 * teléfono mostraba «root.getDirectory is not a function». Esta prueba ejecuta
 * la pieza real contra una implementación que solo expone los nombres
 * correctos (`getDirectoryHandle` / `getFileHandle`), así que un desliz así
 * aparece en la suite y no en el arranque del APK.
 */
const { openOpfsStorage } = await import('../../tools/android/web/opfs.js');

/** OPFS mínimo y fiel al estándar, con los archivos en memoria. */
function fakeOpfs() {
  const makeDir = (name, parent = null) => ({
    kind: 'directory',
    name,
    parent,
    children: new Map(),
    async getDirectoryHandle(child, { create = false } = {}) {
      const found = this.children.get(child);
      if (found && found.kind === 'directory') return found;
      if (!create) throw new Error(`No existe la carpeta ${child}`);
      const directory = makeDir(child, this);
      this.children.set(child, directory);
      return directory;
    },
    async getFileHandle(child, { create = false } = {}) {
      const found = this.children.get(child);
      if (found && found.kind === 'file') return found;
      if (!create) throw new Error(`No existe el archivo ${child}`);
      const file = makeFile(child, this);
      this.children.set(child, file);
      return file;
    },
    async removeEntry(child, { recursive = false } = {}) {
      const found = this.children.get(child);
      if (!found) throw new Error(`No existe ${child}`);
      if (found.kind === 'directory' && found.children.size > 0 && !recursive) {
        throw new Error(`La carpeta ${child} tiene contenido`);
      }
      this.children.delete(child);
    },
    async *entries() {
      for (const pair of this.children) yield pair;
    },
  });
  const makeFile = (name, parent) => ({
    kind: 'file',
    name,
    parent,
    bytes: new Uint8Array(0),
    async getFile() {
      return { arrayBuffer: async () => this.bytes.slice().buffer };
    },
    async createWritable() {
      const self = this;
      const chunks = [];
      return {
        async write(chunk) { chunks.push(new Uint8Array(chunk)); },
        async close() {
          const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const merged = new Uint8Array(total);
          let at = 0;
          for (const chunk of chunks) { merged.set(chunk, at); at += chunk.length; }
          self.bytes = merged;
        },
        async abort() { chunks.length = 0; },
      };
    },
  });
  const root = makeDir('');
  const folder = () => {
    const normia = root.children.get('normia');
    return normia && normia.kind === 'directory' ? normia : null;
  };
  const read = (relative) => {
    let node = folder();
    const parts = relative.split('/');
    for (const part of parts.slice(0, -1)) node = node && node.children.get(part);
    const file = node && node.children.get(parts[parts.length - 1]);
    return file && file.kind === 'file' ? file.bytes : null;
  };
  const list = () => {
    const found = [];
    const walk = (node, prefix) => {
      for (const [name, child] of node.children) {
        const relative = prefix ? `${prefix}/${name}` : name;
        if (child.kind === 'directory') walk(child, relative);
        else found.push(relative);
      }
    };
    if (folder()) walk(folder(), '');
    return found.sort();
  };
  return { storage: { getDirectory: async () => root }, root, read, list };
}

const opfs = fakeOpfs();
const opfsStorage = await openOpfsStorage({ storage: opfs.storage });
report.check('El almacenamiento del teléfono expone la API que usa el editor',
  opfsStorage !== null
  && typeof opfsStorage.restore === 'function'
  && typeof opfsStorage.save === 'function'
  && typeof opfsStorage.clear === 'function');

const text = (value) => new TextEncoder().encode(value);
const opfsApp = await boot(opfsStorage);
opfsApp.php.writeFile('/www/config/nota.txt', text('hola teléfono'));
opfsApp.php.mkdir('/www/storage/logs');
opfsApp.php.writeFile('/www/storage/logs/arranque.log', text('no se guarda'));
const opfsSaved = await opfsApp.persist();
report.check('El guardado escribe los datos en el almacenamiento del teléfono con la API real',
  opfsSaved > 0
  && Buffer.from(opfs.read('config/nota.txt') || []).toString() === 'hola teléfono',
  `${opfsSaved} archivos · ${opfs.list().join(', ') || 'ninguno'}`);
report.check('Los registros de depuración no se guardan en el teléfono',
  opfs.read('storage/logs/arranque.log') === null);
opfsApp.php.exit(0);

const opfsReopened = await boot(opfsStorage);
report.check('Al reabrir, los datos vuelven del almacenamiento del teléfono',
  opfsReopened.php.fileExists('/www/config/nota.txt')
  && Buffer.from(opfsReopened.php.readFileAsBuffer('/www/config/nota.txt')).toString() === 'hola teléfono');
opfsReopened.php.exit(0);

await opfsStorage.clear();
report.check('El reinicio borra la carpeta del teléfono', opfs.list().length === 0);

let aviso = '';
const sinOpfs = await openOpfsStorage({ storage: {}, onUnavailable: (error) => { aviso = String(error && error.message); } });
report.check('Si el teléfono no ofrece almacenamiento, la app abre sin guardar y lo avisa',
  sinOpfs === null && aviso !== '', aviso);

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
// La pantalla cuelga directamente de la raíz de los activos: `/assets/index.html`.
const entryTail = '${ASSETS_PREFIX}index.html"';
report.check('El cargador registra el prefijo real de los activos y no la raíz',
  prefix === '/assets/'
  && /addPathHandler\(ASSETS_PREFIX, WebViewAssetLoader\.AssetsPathHandler\(this\)\)/.test(activity),
  prefix || 'sin prefijo');
report.check('La pantalla de arranque cuelga de la carpeta que arma el APK',
  assetsFolder === 'assets'
  && /loadUrl\(ENTRY\)/.test(activity)
  && entryLine.includes(entryTail),
  entryLine.trim() || 'sin URL de arranque');
/*
 * El HTML del editor pide sus recursos en `/assets/css/…`, y el cargador quita
 * ese prefijo antes de buscar: el archivo tiene que ser `css/…` en la raíz de
 * los activos del APK. Copiar la carpeta `assets/` entera (o dejarla en
 * `www/`) deja la aplicación sin estilos ni scripts aunque `index.html` cargue.
 */
report.check('Los estáticos del editor se copian a la raíz de los activos del APK',
  /const STATIC = path\.join\(ROOT, 'assets'\)/.test(androidBuild)
  && /fs\.cpSync\(STATIC, TARGET, \{ recursive: true \}\)/.test(androidBuild),
  'copia de assets/ a la raíz del APK');
report.check('El origen del puente sigue siendo la raíz del dominio virtual',
  (androidShell.match(/const ORIGIN = 'https:\/\/appassets\.androidplatform\.net';/g) || []).length === 2,
  `${(androidShell.match(/const ORIGIN = 'https:\/\/appassets\.androidplatform\.net';/g) || []).length} usos`);
report.check('Si la pantalla no carga se avisa en español con un enlace para reintentar',
  /onReceivedError/.test(activity) && /request\.isForMainFrame/.test(activity)
  && /No se pudo abrir el editor/.test(activity) && /Reintentar/.test(activity)
  && !/net::ERR_INVALID_RESPONSE/.test(activity.replace(/\/\*[\s\S]*?\*\//g, '')));

/*
 * El fallo de arranque en Android 15: `loadWebRuntime` elige el cargador con
 * `jspi()` de `wasm-feature-detect`, y el APK solo llevaba el binario de
 * asyncify. En un WebView con JSPI el cargador JSPI instanciaba el wasm de
 * asyncify y moría con «Import #0 "env" "invoke_ii": function import requires
 * a callable». Ahora viajan las dos compilaciones y la pantalla pide la que
 * corresponde consultando la misma detección que exporta el paquete.
 */
report.check('El armado copia las dos compilaciones del intérprete (asyncify y jspi)',
  /for \(const modo of \['asyncify', 'jspi'\]\)/.test(androidBuild)
  && /php_8_3_\$\{modo\}\.wasm/.test(androidBuild)
  && /!copied\.jspi/.test(androidBuild),
  'asyncify + jspi');
report.check('La pantalla elige el intérprete con la detección de JSPI del cargador',
  /runtime\.jspi\(\)/.test(androidShell)
  && /php_8_3_\$\{cual\}\.wasm/.test(androidShell)
  && /export \{ jspi \} from '@php-wasm\/web-8-3'/.test(androidBuild),
  'misma detección en pantalla y cargador');
report.check('Si una compilación no arranca, la pantalla prueba la otra antes de rendirse',
  /const alternativa = modo === 'jspi' \? 'asyncify' : 'jspi';/.test(androidShell)
  && /cargado = await cargar\(alternativa\);/.test(androidShell)
  && /Import #0 "env" "invoke_ii"/.test(androidShell));
/*
 * El armado copia los wasm desde `node_modules`; se revisa ahí y, si el APK ya
 * se compiló en este equipo, también en sus propios activos. Así la suite no
 * depende de haber ejecutado `tools/android/build.mjs` antes.
 */
const esWasm = (file) => {
  if (!fs.existsSync(file)) return false;
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(4);
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  return head.equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
};
const variantesWasm = ['asyncify', 'jspi'].map((modo) => {
  const origen = path.join(repoRoot, 'node_modules/@php-wasm/web-8-3', modo);
  const versiones = fs.existsSync(origen) ? fs.readdirSync(origen) : [];
  const fuente = versiones.map((v) => path.join(origen, v, 'php_8_3.wasm')).find((file) => fs.existsSync(file)) || '';
  const enApk = path.join(repoRoot, 'tools/android/app/src/main/assets/php', `php_8_3_${modo}.wasm`);
  return { modo, fuente: esWasm(fuente), apk: fs.existsSync(enApk) ? esWasm(enApk) : null };
});
report.check('Las dos compilaciones del intérprete son módulos WebAssembly de verdad',
  variantesWasm.every((variante) => variante.fuente && variante.apk !== false),
  variantesWasm.map((v) => `${v.modo} ${v.fuente ? 'fuente ✓' : 'fuente ✗'}${v.apk === null ? '' : v.apk ? ' · APK ✓' : ' · APK ✗'}`).join(' · '));

report.check('El flujo compila el APK y lo adjunta a la release',
  /assembleRelease/.test(androidWorkflow) && /apksigner/.test(androidWorkflow)
  && /gh release upload/.test(androidWorkflow),
  '');

process.exit(report.summary());
