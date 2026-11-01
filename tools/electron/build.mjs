/*
 * Arma la edición Electron de Normia Planos CAD.
 *
 * Junta tres cosas en una carpeta de trabajo:
 *   1. la aplicación PHP (código, recursos y documentos, sin pruebas ni datos),
 *   2. el intérprete: `@php-wasm/node` con PHP 8.3 y sus dependencias, tal cual
 *      vienen en `node_modules` (no se compila nada para cada sistema),
 *   3. la ventana de Electron (`main.mjs`, `server.mjs`, `preload.cjs`).
 *
 * Y luego llama a `electron-builder`, que produce el instalador de la
 * plataforma. Sin `electron-builder` instalado, deja la carpeta armada y lo
 * dice: así el flujo de trabajo puede compilar en cada sistema por separado.
 *
 * Uso:
 *   node tools/electron/build.mjs --out=dist/electron [--arch=arm64] [--sin-instalador]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyApp, readVersion } from '../shared/app-copy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/** Paquetes de php-wasm que viajan en el paquete (PHP 8.3 solamente). */
const REQUIRED_PHP_PACKAGES = [
  '@php-wasm/node',
  '@php-wasm/node-8-3',
  '@php-wasm/universal',
  '@php-wasm/util',
  '@php-wasm/logger',
  '@php-wasm/stream-compression',
  '@php-wasm/progress',
  '@php-wasm/cli-util',
];

/** Paquetes que solo existen por otros PHP: no viajan. */
function isUnwantedPackage(name) {
  return /^@php-wasm\/(node|web|cli)-?(5-2|7-4|8-[0-4]|8-5)?$/.test(name) && name !== '@php-wasm/node' && name !== '@php-wasm/node-8-3';
}

function parseArgs(argv) {
  const args = { out: path.join(ROOT, 'dist', 'electron'), arch: process.arch === 'x64' ? 'x64' : process.arch, installer: true };
  for (const argument of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argument);
    if (!match) continue;
    if (match[1] === 'sin-instalador') args.installer = false;
    else if (match[2] !== undefined) args[match[1]] = match[2];
  }
  return args;
}

/** Copia un paquete de `node_modules` y, recursivamente, sus dependencias. */
function copyPackage(name, destination, seen = new Set()) {
  if (seen.has(name) || isUnwantedPackage(name)) return;
  seen.add(name);
  const source = path.join(ROOT, 'node_modules', name);
  const manifestPath = path.join(source, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Falta ${name} en node_modules. Ejecuta: npm install`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const target = path.join(destination, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, dereference: true });
  // Se copian los PHP de las dependencias declaradas pero solo si viajan.
  const dependencies = { ...(manifest.dependencies || {}), ...(manifest.optionalDependencies || {}) };
  for (const dependency of Object.keys(dependencies)) copyPackage(dependency, destination, seen);
}

function buildRuntime(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const modules = path.join(destination, 'node_modules');
  for (const name of REQUIRED_PHP_PACKAGES) copyPackage(name, modules);
  // Un único punto de entrada: Node resuelve los paquetes desde esta carpeta,
  // porque en la versión instalada el `asar` no puede cargar `.wasm`.
  fs.writeFileSync(path.join(destination, 'php-wasm.mjs'), [
    '// Punto de entrada del intérprete para la edición instalada.',
    '// Las dependencias viven al lado, en node_modules, fuera del archivo asar.',
    "export { loadNodeRuntime, createNodeFsMountHandler } from '@php-wasm/node';",
    "export { PHP, PHPRequestHandler } from '@php-wasm/universal';",
    '',
  ].join('\n'), 'utf8');
  // Las extensiones opcionales (intl, xdebug, redis, memcached) y los datos de
  // ICU añaden más peso que la aplicación entera y no se usan: se quitan. Si
  // alguna vez se piden, php-wasm avisa con un error explícito.
  for (const name of ['intl', 'xdebug', 'redis', 'memcached']) {
    for (const variant of ['asyncify', 'jspi']) {
      fs.rmSync(path.join(modules, '@php-wasm', 'node-8-3', variant, 'extensions'), { recursive: true, force: true });
      fs.rmSync(path.join(modules, '@php-wasm', 'node-8-3', variant, `${name}.so`), { force: true });
    }
  }
  fs.rmSync(path.join(modules, '@php-wasm', 'node', 'shared', 'icu.dat'), { force: true });

  // Una versión de PHP que no se use ocupa más que toda la aplicación: se
  // avisa si quedó alguna (por ejemplo, por `npm install` de otra herramienta).
  const leftover = fs.existsSync(path.join(modules, '@php-wasm'))
    ? fs.readdirSync(path.join(modules, '@php-wasm')).filter((name) => /^(web|cli)/.test(name) || /^node-(?!8-3$)/.test(name))
    : [];
  if (leftover.length) console.warn(`Aviso: sobran paquetes de php-wasm en el armado: ${leftover.join(', ')}`);
  return modules;
}

function build() {
  const args = parseArgs(process.argv.slice(2));
  const version = readVersion();
  const out = path.resolve(args.out);
  const stage = path.join(out, 'stage');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  console.log(`· Normia Planos CAD ${version} · edición Electron`);
  console.log('· Copiando la aplicación…');
  copyApp(path.join(stage, 'app'), { excludeTools: true });

  console.log('· Copiando el intérprete PHP 8.3 para WebAssembly…');
  const modules = buildRuntime(path.join(stage, 'runtime'));

  console.log('· Copiando la ventana…');
  const electronDir = path.join(stage, 'electron');
  fs.mkdirSync(electronDir, { recursive: true });
  for (const file of ['main.mjs', 'server.mjs', 'preload.cjs']) {
    fs.copyFileSync(path.join(HERE, file), path.join(electronDir, file));
  }

  console.log('· Generando el icono…');
  const buildDir = path.join(stage, 'build');
  execFileSync(process.execPath, [path.join(HERE, 'make-icon.mjs'), path.join(ROOT, 'assets/img/normia-logo.png'), buildDir], { stdio: 'inherit' });

  const manifest = {
    name: 'normia-planos-cad',
    productName: 'Normia Planos CAD',
    version,
    description: 'Planos de emergencia y señalización: editor CAD en el escritorio, sin servidor.',
    private: true,
    type: 'module',
    main: 'electron/main.mjs',
    author: { name: 'Normia', email: 'soporte@normia.local' },
    license: 'UNLICENSED',
    homepage: 'https://github.com/luan920530-commits/normia-planos-cad',
    build: {
      appId: 'co.normia.cad',
      productName: 'Normia Planos CAD',
      copyright: `Normia Planos CAD ${version}`,
      directories: { output: path.join(out, 'installers'), buildResources: buildDir },
      files: ['electron/**/*', 'package.json'],
      extraResources: [
        { from: 'app', to: 'app' },
        // El intérprete PHP se copia desde la raíz del armado y con filtro, no
        // con `{ from: 'runtime' }`: electron-builder descarta en silencio
        // cualquier carpeta `node_modules` que esté en la raíz del origen de
        // `extraResources` (fileMatcher: `if (relative === 'node_modules')
        // return false`). Con el origen en la raíz, la ruta relativa pasa a ser
        // «runtime/node_modules/…» y sí se copia. Sin esto el paquete instala
        // pero no arranca: «Cannot find package '@php-wasm/node' imported from
        // …/Resources/runtime/php-wasm.mjs».
        { from: '.', to: '.', filter: ['runtime{,/**/*}'] },
      ],
      asar: true,
      compression: 'normal',
      // La aplicación PHP no tiene dependencias de Node: no hay nada que
      // reconstruir ni que instalar al empaquetar.
      npmRebuild: false,
      nodeGypRebuild: false,
      buildDependenciesFromSource: false,
      // Se fija la versión del propio Electron: el empaquetador la descarga él
      // mismo, sin depender de que esté instalada en el equipo que compila.
      ...(readElectronVersion() ? { electronVersion: readElectronVersion() } : {}),
      mac: {
        category: 'public.app-category.graphics-design',
        icon: path.join(buildDir, 'icon.icns'),
        identity: null,
        hardenedRuntime: false,
        gatekeeperAssess: false,
        // Electron 43 declara LSMinimumSystemVersion 12.0, la última rama que
        // abre en macOS 12 Monterey (39–43). Electron 44 sube el mínimo a
        // macOS 13: si algún día se actualiza, hay que cambiar este valor, la
        // tabla de requisitos de docs/ELECTRON.md y el mensaje del instalador.
        minimumSystemVersion: '12.0',
        target: [{ target: 'dmg', arch: [args.arch] }, { target: 'zip', arch: [args.arch] }],
        artifactName: `normia-planos-cad-\${version}-macos-\${arch}.\${ext}`,
      },
      dmg: {
        title: 'Normia Planos CAD',
        contents: [
          { x: 130, y: 220, type: 'file' },
          { x: 410, y: 220, type: 'link', path: '/Applications' },
        ],
      },
      win: {
        icon: path.join(buildDir, 'icon.ico'),
        target: [{ target: 'nsis', arch: [args.arch] }, { target: 'zip', arch: [args.arch] }],
        artifactName: `normia-planos-cad-\${version}-windows-\${arch}.\${ext}`,
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Normia Planos CAD',
        artifactName: `normia-planos-cad-\${version}-windows-\${arch}-instalador.\${ext}`,
        uninstallDisplayName: 'Normia Planos CAD',
      },
      linux: {
        icon: path.join(buildDir, 'icon.png'),
        category: 'Graphics',
        target: [{ target: 'AppImage', arch: [args.arch] }],
        artifactName: `normia-planos-cad-\${version}-linux-\${arch}.\${ext}`,
      },
    },
  };
  fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const runtimeSize = directorySize(path.join(stage, 'runtime'));
  const appSize = directorySize(path.join(stage, 'app'));
  console.log(`· Carpeta armada: aplicación ${(appSize / 1048576).toFixed(1)} MB · intérprete ${(runtimeSize / 1048576).toFixed(1)} MB`);
  console.log(`· Módulos: ${modules}`);

  if (!args.installer) {
    console.log('· Sin instalador (--sin-instalador).');
    return;
  }

  const builder = path.join(ROOT, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
  if (!fs.existsSync(builder)) {
    console.warn('Aviso: no está electron-builder. La carpeta quedó armada; instálalo con: npm install --no-save electron electron-builder');
    return;
  }
  const electronVersion = readElectronVersion();
  if (!electronVersion) throw new Error('Falta electron en node_modules. Ejecuta: npm install --no-save electron');
  // Desde Electron 44 el binario exige macOS 13 o superior. Se avisa aquí
  // porque el síntoma en el equipo del usuario es «requiere macOS 13» al abrir
  // el DMG, no un error de compilación.
  const electronMajor = Number(String(electronVersion).split('.')[0]) || 0;
  if (electronMajor >= 44 && args.installer) {
    console.warn(`Aviso: Electron ${electronVersion} exige macOS 13 o superior; el DMG ya no abrirá en macOS 12 Monterey.`);
  }
  console.log(`· Compilando el instalador con electron-builder (Electron ${electronVersion}, ${args.arch})…`);
  // Se ejecuta desde la carpeta armada y sin opciones raras: electron-builder
  // lee su `package.json` (con la clave `build`) y resuelve todo desde ahí.
  execFileSync(process.execPath, [builder, '--publish=never', `--${args.arch}`], {
    cwd: stage,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_BUILDER_CACHE: path.join(out, '.cache'), CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });
  verifyInstallers(out);
}

/**
 * Comprueba que el instalador recién compilado lleve el intérprete completo.
 * Electron-builder puede terminar «bien» y dejar fuera `runtime/node_modules`
 * —el paquete se instala y luego no arranca—, así que se mira el resultado y no
 * solo la carpeta de trabajo.
 */
function verifyInstallers(out) {
  const installers = path.join(out, 'installers');
  if (!fs.existsSync(installers)) return;
  const entries = [];
  const walk = (directory, depth = 0) => {
    if (depth > 8) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name === 'php-wasm.mjs' && path.basename(directory) === 'runtime') entries.push(directory);
    }
  };
  walk(installers);
  if (!entries.length) {
    throw new Error('El instalador no contiene resources/runtime/php-wasm.mjs.');
  }
  const missing = [];
  for (const runtime of entries) {
    for (const name of REQUIRED_PHP_PACKAGES) {
      if (!fs.existsSync(path.join(runtime, 'node_modules', name, 'package.json'))) missing.push(`${path.relative(installers, runtime)} → ${name}`);
    }
  }
  if (missing.length) {
    throw new Error(`El instalador quedó sin paquetes de php-wasm: ${missing.join(', ')}.\nElectron-builder descarta «node_modules» en la raíz de extraResources; revisa el filtro de build.mjs.`);
  }
  console.log(`· Instalador comprobado: ${entries.length} copia(s) del intérprete con sus ${REQUIRED_PHP_PACKAGES.length} paquetes.`);
}

function readElectronVersion() {
  const manifest = path.join(ROOT, 'node_modules', 'electron', 'package.json');
  if (!fs.existsSync(manifest)) return '';
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
}

function directorySize(directory) {
  let total = 0;
  if (!fs.existsSync(directory)) return total;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(target) : fs.statSync(target).size;
  }
  return total;
}

build();
