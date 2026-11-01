/*
 * Comprueba el paquete que se mete dentro del APK, antes de compilarlo.
 *
 * Arranca el mismo `runtime.js` que usa la aplicación en el teléfono, monta los
 * archivos de `app-files.json` y pide el instalador y el panel. Es la última
 * verificación posible sin un dispositivo: si esto pasa, lo que falta por probar
 * son solo el WebView y el contenedor nativo.
 *
 * Uso: node tools/android/check.mjs   (después de tools/android/build.mjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NormiaApp, memoryStorage } from './web/app-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, 'app/src/main/assets');
const ROOT = path.resolve(HERE, '../..');

const failures = [];
const ok = (label, detail = '') => console.log(`✓ ${label}${detail ? ' · ' + detail : ''}`);
const bad = (label, detail = '') => {
  failures.push(label);
  console.log(`✗ ${label}${detail ? ' · ' + detail : ''}`);
};

for (const file of ['index.html', 'shell.js', 'shell.css', 'app-core.js', 'php/runtime.js', 'php/php_8_3.wasm', 'php/app-files.json', 'css/app.css', 'css/editor.css', 'js/app.js', 'img/normia-logo.png']) {
  if (!fs.existsSync(path.join(ASSETS, file))) bad(`Falta ${file}`);
}
if (failures.length) {
  console.error('Ejecuta primero: node tools/android/build.mjs');
  process.exit(1);
}
ok('El paquete incluye pantalla, estilo, intérprete y aplicación');

/*
 * La pantalla que pide el contenedor tiene que existir **debajo** del prefijo
 * que registra `WebViewAssetLoader`. Con el prefijo en la raíz y la URL
 * `/index.html`, el cargador buscaba `assets/index.html`, no lo encontraba y el
 * WebView mostraba «net::ERR_INVALID_RESPONSE» en vez del editor.
 */
const activitySource = fs.readFileSync(path.join(HERE, 'app/src/main/java/co/normia/cad/MainActivity.kt'), 'utf8');
const assetPrefix = (/private const val ASSETS_PREFIX = "([^"]+)"/.exec(activitySource) || [])[1] || '';
const entryTail = (/private val ENTRY = "[^"]*ASSETS_PREFIX\}([^"]+)"/.exec(activitySource) || [])[1] || '';
// El prefijo se descarta al buscar en disco: `/assets/` es la raíz de `assets/`.
const entryFile = path.join(ASSETS, entryTail);
if (assetPrefix === '/assets/' && entryTail && fs.existsSync(entryFile)) {
  ok('El contenedor abre una pantalla que existe debajo del prefijo registrado', `${assetPrefix}${entryTail}`);
} else {
  bad('El contenedor pide una pantalla que no está debajo del prefijo registrado', `${assetPrefix}${entryTail || '?'}`);
}

/*
 * La comprobación que habría evitado el fallo de la 1.14.2: el HTML que genera
 * el PHP pide sus estilos, scripts e imágenes en `/assets/…`, y el cargador
 * quita ese prefijo antes de buscar el archivo. Se piden páginas reales al
 * intérprete y se verifica que **cada** ruta exista dentro del APK.
 */
/** Rutas `/assets/…` que el navegador pedirá al abrir la página. */
const assetRoutes = (html) => [...new Set((String(html).match(/(?:href|src)="(\/assets\/[^"?#]+)/g) || [])
  .map((match) => match.split('"')[1]))];

const info = JSON.parse(fs.readFileSync(path.join(ASSETS, 'php/app-files.json'), 'utf8'));
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
if (info.version === version) ok('La versión del paquete coincide con package.json', info.version);
else bad('La versión del paquete no coincide', `${info.version} ≠ ${version}`);
if (Object.keys(info.files).length > 100) ok('Los archivos de PHP viajan en el APK', `${Object.keys(info.files).length}`);
else bad('Faltan archivos de PHP', String(Object.keys(info.files).length));

const runtimeFile = path.join(ASSETS, 'php/runtime.js');
const sizeMb = fs.statSync(runtimeFile).size / 1048576;
if (sizeMb < 6) ok('El paquete JavaScript no arrastra datos de internacionalización', `${sizeMb.toFixed(1)} MB`);
else bad('El paquete JavaScript es demasiado grande', `${sizeMb.toFixed(1)} MB`);

globalThis.require = createRequire(import.meta.url);
const runtime = await import(runtimeFile);
const wasmBinary = fs.readFileSync(path.join(ASSETS, 'php/php_8_3.wasm'));
const php = new runtime.PHP(await runtime.loadWebRuntime('8.3', { emscriptenOptions: { wasmBinary } }));
const app = new NormiaApp({
  php,
  files: info.files,
  storage: memoryStorage(),
  createHandler: (instance, documentRoot) => new runtime.PHPRequestHandler({ php: instance, documentRoot, absoluteUrl: 'http://127.0.0.1' }),
});
const started = Date.now();
await app.start();
ok('El intérprete del APK arranca y monta la aplicación', `${Date.now() - started} ms`);

const install = await app.request({ url: '/index.php?r=install' });
if (install.status === 200 && /Normia/.test(install.text) && /name="_token"/.test(install.text)) {
  ok('La pantalla de instalación se dibuja dentro del teléfono', `${install.text.length} caracteres`);
} else {
  bad('La instalación no respondió', `${install.status}`);
}

const token = /name="_token" value="([^"]+)"/.exec(install.text)?.[1] || '';
const created = await app.request({
  url: '/index.php?r=install',
  method: 'POST',
  headers: [['content-type', 'application/x-www-form-urlencoded']],
  body: new TextEncoder().encode(new URLSearchParams({
    _token: token,
    name: 'Teléfono',
    email: 'campo@normia.local',
    password: 'ClaveSegura2026',
    password_confirm: 'ClaveSegura2026',
    demo: '1',
  }).toString()),
});
if (created.status === 303 && app.dataFiles().some((file) => file.endsWith('.sqlite'))) {
  ok('La instalación crea la base de datos en el equipo');
} else {
  bad('La instalación no creó la base', `${created.status}`);
}

// Las rutas estáticas de la pantalla de instalación tienen que existir en el APK.
const installRoutes = assetRoutes(install.text);
const missingInstall = installRoutes.filter((route) => !fs.existsSync(path.join(ASSETS, route.replace(/^\/assets\//, ''))));
if (installRoutes.length && missingInstall.length === 0) {
  ok('Los estilos y scripts de la instalación están en el APK', `${installRoutes.length} rutas`);
} else {
  bad('El APK no tiene los archivos que pide la página', missingInstall.join(', ') || 'sin rutas /assets/');
}

const loginPage = await app.request({ url: '/index.php?r=login' });
const loginToken = /name="_token" value="([^"]+)"/.exec(loginPage.text)?.[1] || '';
await app.request({
  url: '/index.php?r=login',
  method: 'POST',
  headers: [['content-type', 'application/x-www-form-urlencoded']],
  body: new TextEncoder().encode(new URLSearchParams({ _token: loginToken, email: 'campo@normia.local', password: 'ClaveSegura2026' }).toString()),
});
const panel = await app.request({ url: '/index.php?r=' });
if (panel.status === 200 && /Mis planos/.test(panel.text) && /\/assets\/css\//.test(panel.text)) {
  ok('El editor abre con estilos y datos de la demo');
} else {
  bad('El panel no abrió', `${panel.status} · ${(/<title>([^<]*)/.exec(panel.text) || [])[1]}`);
}

/*
 * La misma comprobación sobre el editor, que es la pantalla que más archivos
 * pide (25 rutas: hojas del editor, módulos, iconos y catálogos). Si una sola
 * faltara, el editor abriría sin estilos o sin la herramienta correspondiente.
 */
const proyecto = await app.request({ url: '/index.php?r=projects/1' });
const floorId = (/floors\/(\d+)\/editor/.exec(decodeURIComponent(proyecto.text)) || [])[1];
const editor = floorId
  ? await app.request({ url: `/index.php?r=projects/1/floors/${floorId}/editor` })
  : { status: 0, text: '' };
const editorRoutes = assetRoutes(editor.text);
const missingEditor = editorRoutes.filter((route) => !fs.existsSync(path.join(ASSETS, route.replace(/^\/assets\//, ''))));
if (editor.status === 200 && editorRoutes.length >= 20 && missingEditor.length === 0) {
  ok('El editor encuentra en el APK todos sus recursos', `${editorRoutes.length} rutas`);
} else {
  bad('Faltan recursos del editor en el APK', `${editor.status} · ${editorRoutes.length} rutas · ${missingEditor.slice(0, 4).join(', ') || '—'}`);
}

const saved = await app.persist();
if (saved > 0) ok('Los datos se pueden guardar para el próximo arranque', `${saved} archivos`);
else bad('No se pudo guardar nada');

php.exit(0);

if (failures.length) {
  console.error(`\nAPK: ${failures.length} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nAPK: paquete verificado. Falta compilarlo y probarlo en un dispositivo.');
