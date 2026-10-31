/*
 * Construye la distribución de escritorio a partir del repositorio.
 *
 * No descarga nada: el intérprete de PHP se pasa con --php y lo prepara el flujo
 * de trabajo (.github/workflows/dist-desktop.yml). Aquí solo se arma la carpeta,
 * se firma en modo ad-hoc en macOS y se empaqueta.
 *
 * Uso:
 *   node tools/desktop/build.mjs --platform=mac --php=/ruta/php --out=dist --arch=arm64
 *   node tools/desktop/build.mjs --platform=win --php=C:\\php --out=dist
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyApp as sharedCopyApp } from '../shared/app-copy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

function copyApp(destination) {
  return sharedCopyApp(destination);
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return String(pkg.version);
}

function parseArgs(argv) {
  const args = { platform: process.platform === 'darwin' ? 'mac' : 'win', php: '', out: path.join(ROOT, 'dist'), arch: process.arch };
  for (const argument of argv) {
    const match = /^--([a-z]+)=(.*)$/.exec(argument);
    if (!match) continue;
    args[match[1]] = match[2];
  }
  return args;
}

function run(command, args, options = {}) {
  console.log(`· ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

/* ------------------------------- macOS ------------------------------- */

function buildMac({ php, out, arch }, version) {
  const appName = 'Normia Planos CAD';
  const app = path.join(out, `${appName}.app`);
  fs.rmSync(app, { recursive: true, force: true });
  const contents = path.join(app, 'Contents');
  const resources = path.join(contents, 'Resources');
  const appDir = path.join(resources, 'app');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  copyApp(appDir);

  // Intérprete incluido. En macOS es un binario estático sin dependencias.
  fs.mkdirSync(path.join(appDir, 'runtime'), { recursive: true });
  const runtime = path.join(appDir, 'runtime', 'php');
  fs.copyFileSync(php, runtime);
  fs.chmodSync(runtime, 0o755);

  const starter = path.join(contents, 'MacOS', 'Normia');
  fs.writeFileSync(starter, `#!/bin/sh
set -e
APP="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "$NORMA_DATA_PATH" ]; then
  NORMA_DATA_PATH="$HOME/Library/Application Support/Normia"
  export NORMA_DATA_PATH
fi
exec "$APP/Resources/app/runtime/php" "$APP/Resources/app/tools/desktop/launcher.php" "$@"
`, { mode: 0o755 });

  fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${appName}</string>
  <key>CFBundleDisplayName</key><string>${appName}</string>
  <key>CFBundleIdentifier</key><string>co.normia.cad</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Normia</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`, 'utf8');

  // Firma ad-hoc: sin certificado de Apple, pero el binario queda firmado y
  // Gatekeeper puede evaluarlo igual. Los avisos de "desarrollador no
  // identificado" solo desaparecen con un Developer ID.
  if (process.platform === 'darwin') {
    try {
      run('codesign', ['--force', '--sign', '-', runtime]);
      run('codesign', ['--force', '--deep', '--sign', '-', app]);
    } catch (error) {
      console.warn('Aviso: no se pudo firmar en modo ad-hoc. El paquete seguirá funcionando con el aviso de Gatekeeper.');
    }
  }

  // Instalador .pkg que coloca la app en /Aplicaciones.
  const payload = path.join(out, 'mac-payload');
  fs.rmSync(payload, { recursive: true, force: true });
  fs.mkdirSync(path.join(payload, 'Applications'), { recursive: true });
  fs.cpSync(app, path.join(payload, 'Applications', `${appName}.app`), { recursive: true });
  const component = path.join(out, 'component.pkg');
  const tag = arch === 'arm64' ? 'arm64' : 'x64';
  const finalPkg = path.join(out, `normia-planos-cad-${version}-macos-${tag}.pkg`);
  if (process.platform === 'darwin') {
    run('pkgbuild', ['--root', payload, '--identifier', 'co.normia.cad', '--version', version, '--install-location', '/', component]);
    run('productbuild', ['--package', component, finalPkg]);
    fs.rmSync(component, { force: true });
  }
  return { app, pkg: finalPkg };
}

/* ------------------------------ Windows ------------------------------ */

function writeWindowsLaunchers(app) {
  // VBS: arranca el servidor sin dejar una ventana negra abierta. Es el modo
  // estándar en Windows para lanzar un proceso oculto sin instalar nada más.
  const common = [
    'Option Explicit',
    'Dim shell, fso, base, cmd',
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'base = fso.GetParentFolderName(WScript.ScriptFullName)',
    'cmd = Chr(34) & base & "\\runtime\\php.exe" & Chr(34) & " " & Chr(34) & base & "\\tools\\desktop\\launcher.php" & Chr(34)',
  ].join('\r\n');
  const iniciar = `${common}\r\nshell.Run cmd, 0, False\r\n`;
  const detener = `${common} & " --stop"\r\nshell.Run cmd, 0, True\r\nMsgBox "Normia se detuvo. Puedes cerrar esta ventana.", 64, "Normia Planos CAD"\r\n`;
  fs.writeFileSync(path.join(app, 'Iniciar Normia.vbs'), iniciar, 'utf8');
  fs.writeFileSync(path.join(app, 'Detener Normia.vbs'), detener, 'utf8');
}

function buildWindows({ php, out }, version) {
  const app = path.join(out, 'win-app');
  fs.rmSync(app, { recursive: true, force: true });
  fs.mkdirSync(app, { recursive: true });
  copyApp(app);
  writeWindowsLaunchers(app);

  // Se copia la instalación completa de PHP (php.exe + ext + DLL). En Windows
  // no hay binario estático razonable: la carpeta autocontenida es equivalente
  // y no pide instalar nada en el equipo.
  const phpSource = fs.statSync(php).isDirectory() ? php : path.dirname(php);
  fs.cpSync(phpSource, path.join(app, 'runtime'), { recursive: true });
  // La configuración de PHP del equipo de compilación apunta a su propia
  // carpeta de extensiones. En el paquete las DLL viajan al lado, así que la
  // ruta debe ser relativa o el intérprete no encuentra pdo_sqlite al instalar.
  const extDir = path.join(app, 'runtime', 'ext', 'php_pdo_sqlite.dll');
  if (!fs.existsSync(extDir)) {
    throw new Error(`La instalación de PHP no trae ext/php_pdo_sqlite.dll (${phpSource}).`);
  }

  // La instalación de PHP del flujo puede no traer php.ini (solo las plantillas
  // php.ini-development/production). Sin él, php.exe no carga pdo_sqlite en
  // absoluto y la comprobación del paquete falla con un error poco claro.
  const ini = path.join(app, 'runtime', 'php.ini');
  const lines = fs.existsSync(ini) ? fs.readFileSync(ini, 'utf8').split(/\r?\n/) : [];
  const clean = lines.filter((line) => !/^[ \t]*extension_dir[ \t]*=/i.test(line));
  clean.push('extension_dir = "ext"');
  for (const extension of ['pdo', 'pdo_sqlite', 'sqlite3', 'mbstring', 'openssl', 'fileinfo']) {
    const enabled = new RegExp(`^[ \\t]*extension[ \\t]*=[ \\t]*"?php_${extension}\\.dll"?[ \\t]*$`, 'i');
    if (!clean.some((line) => enabled.test(line))) {
      clean.push(`extension=${extension}`);
    }
  }
  fs.writeFileSync(ini, clean.join('\r\n'), 'utf8');

  const icon = path.join(out, 'normia.ico');
  try {
    execFileSync(process.execPath, [path.join(HERE, 'make-ico.mjs'), path.join(ROOT, 'assets/img/apple-touch-icon.png'), icon], { stdio: 'inherit' });
  } catch {
    console.warn('Aviso: no se pudo generar el icono. El instalador saldrá sin icono propio.');
  }

  const iss = path.join(HERE, 'windows', 'normia.iss');
  if (process.platform === 'win32') {
    // Inno Setup puede no estar instalado todavía (el flujo lo instala después);
    // en ese caso se avisa y el paso del flujo compila el instalador.
    try {
      run('iscc.exe', [`/DAppVersion=${version}`, `/DSourceDir=${app}`, `/DOutputDir=${out}`, `/DIconFile=${icon}`, iss]);
    } catch {
      console.warn('Aviso: Inno Setup no respondió. El instalador se compila en el paso siguiente del flujo.');
    }
  }
  return { app, ico: icon };
}

/* -------------------------------- main -------------------------------- */

const args = parseArgs(process.argv.slice(2));
const version = readVersion();
if (!args.php) {
  console.error('Falta --php=<binario o carpeta de PHP>.');
  process.exit(1);
}
fs.mkdirSync(args.out, { recursive: true });
console.log(`Normia Planos CAD · paquete de escritorio v${version} (${args.platform})`);
const result = args.platform === 'mac' ? buildMac(args, version) : buildWindows(args, version);
console.log('Listo:', Object.values(result).join(' · '));
