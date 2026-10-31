/*
 * Arma el contenido del APK de Android.
 *
 * Copia la aplicación al proyecto de Gradle (`app/src/main/assets/www`), empaqueta
 * los archivos de PHP que se montan dentro del intérprete de WebAssembly, genera
 * el paquete JavaScript del runtime y copia el binario `php_8_3.wasm`.
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
const TARGET = path.join(HERE, 'app/src/main/assets/www');

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

/** Copia el árbol de la aplicación a `www/`. */
function copyApp() {
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.mkdirSync(TARGET, { recursive: true });
  // Copia manual: el destino vive dentro del repositorio y `fs.cpSync` se niega
  // a copiar una carpeta dentro de sí misma aunque el filtro la excluya.
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!shouldCopy(relative)) continue;
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(source, relative);
      else if (entry.isFile()) {
        const destination = path.join(TARGET, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
    }
  };
  walk(ROOT, '');
  for (const directory of ['config', 'storage', 'storage/sessions', 'storage/logs', 'storage/cache']) {
    fs.mkdirSync(path.join(TARGET, directory), { recursive: true });
  }
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
  return Object.keys(files).length;
}

/** Genera `php/runtime.js` con el intérprete y el manejador de peticiones. */
async function bundleRuntime() {
  const esbuild = await import('esbuild');
  const entry = path.join(HERE, 'web/runtime-entry.js');
  fs.writeFileSync(entry, [
    "export { PHP, PHPRequestHandler } from '@php-wasm/universal';",
    "export { loadWebRuntime } from '@php-wasm/web';",
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

/** Copia el binario de PHP compilado a WebAssembly. */
function copyWasm() {
  const base = path.join(ROOT, 'node_modules/@php-wasm/web-8-3');
  if (!fs.existsSync(base)) {
    throw new Error('Falta @php-wasm/web-8-3. Instálalo con npm install --no-save.');
  }
  const candidates = [];
  for (const variant of fs.readdirSync(base)) {
    const directory = path.join(base, variant);
    if (!fs.statSync(directory).isDirectory()) continue;
    for (const version of fs.readdirSync(directory)) {
      const candidate = path.join(directory, version, 'php_8_3.wasm');
      if (fs.existsSync(candidate)) candidates.push(candidate);
    }
  }
  if (candidates.length === 0) throw new Error('No se encontró php_8_3.wasm en @php-wasm/web-8-3.');
  const chosen = candidates.find((file) => file.includes('asyncify')) || candidates[0];
  fs.copyFileSync(chosen, path.join(TARGET, 'php/php_8_3.wasm'));
  return chosen;
}

/** Copia la pantalla del contenedor (HTML, CSS y JS). */
function copyShell() {
  for (const name of ['index.html', 'shell.css', 'shell.js', 'app-core.js']) {
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
  copyApp();
  const count = packAppFiles();
  copyShell();
  const wasm = copyWasm();
  await bundleRuntime();
  console.log(`· ${count} archivos de la aplicación`);
  console.log(`· intérprete ${path.relative(ROOT, wasm)}`);
  console.log(`· activos en ${path.relative(ROOT, TARGET)}`);
  if (args.has('--apk')) gradle();
}

main().catch((error) => {
  console.error(`No se pudo preparar el APK: ${error.message}`);
  process.exit(1);
});
