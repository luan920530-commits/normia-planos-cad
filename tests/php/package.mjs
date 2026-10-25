/*
 * Verificación de los paquetes de distribución:
 *  - construye los ZIP con tools/build-packages.sh;
 *  - comprueba que no incluyan bases de datos, sesiones, credenciales ni logs;
 *  - valida los SHA-256 publicados;
 *  - descomprime el paquete de demostración y lo instala desde cero con php-wasm,
 *    verificando instalador, cuenta, proyecto demo, editor y carga de assets.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startRuntime, extractToken, makeReporter, repoRoot } from './harness.mjs';

const VERSION_PHP = process.argv[2] || '8.3';
const report = makeReporter('Paquete');
const appVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
const dist = path.join(repoRoot, 'dist');
const prodZip = path.join(dist, `normia-planos-cad-${appVersion}.zip`);
const demoZip = path.join(dist, `normia-planos-cad-demo-${appVersion}.zip`);

function listZip(file) {
  const result = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`No se pudo leer ${file}: ${result.stderr}`);
  return result.stdout.trim().split('\n').filter(Boolean);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function invalidEntries(entries) {
  return entries.filter((entry) => {
    if (/(^|\/)config\/config\.php$/.test(entry)) return true;
    if (/\.sqlite(-wal|-shm)?$/.test(entry)) return true;
    if (/storage\/sessions\/(?!\.gitkeep$).+/.test(entry)) return true;
    if (/storage\/logs\/(?!\.gitkeep$).+/.test(entry)) return true;
    if (/storage\/cache\/(?!\.gitkeep$).+/.test(entry)) return true;
    if (/last-error\.log$|\.DS_Store$|node_modules\/|\.git\//.test(entry)) return true;
    if (/(^|\/)(tests|tools|paquetes|dist)\//.test(entry)) return true;
    if (/(^|\/)package(-lock)?\.json$/.test(entry)) return true;
    return false;
  });
}

async function main() {
  /* ------------------------------- empaquetado ------------------------------- */
  const build = spawnSync('bash', ['tools/build-packages.sh'], { cwd: repoRoot, encoding: 'utf8' });
  report.check('Empaquetar sin errores', build.status === 0, (build.stderr || build.stdout).trim().split('\n').slice(-2).join(' '));
  report.check('Se generan los dos ZIP', fs.existsSync(prodZip) && fs.existsSync(demoZip),
    `${Math.round(fs.statSync(prodZip).size / 1024)} KB / ${Math.round(fs.statSync(demoZip).size / 1024)} KB`);

  const prodEntries = listZip(prodZip);
  const demoEntries = listZip(demoZip);
  const prodInvalid = invalidEntries(prodEntries);
  const demoInvalid = invalidEntries(demoEntries);
  report.check('El ZIP de producción no incluye datos sensibles', prodInvalid.length === 0, prodInvalid.slice(0, 5).join(', '));
  report.check('El ZIP de demostración no incluye datos sensibles', demoInvalid.length === 0, demoInvalid.slice(0, 5).join(', '));
  report.check('El paquete de producción no está marcado como demo', !prodEntries.some((entry) => entry.endsWith('resources/demo/.demo-build')));
  report.check('El paquete de demostración lleva su marca', demoEntries.some((entry) => entry.endsWith('resources/demo/.demo-build')));
  const essentials = [
    'normia-planos-cad/index.php',
    'normia-planos-cad/bootstrap.php',
    'normia-planos-cad/.htaccess',
    'normia-planos-cad/app/Core/Application.php',
    'normia-planos-cad/assets/js/editor.js',
    'normia-planos-cad/assets/js/editor/store.js',
    'normia-planos-cad/resources/iso7010-catalog.json',
    'normia-planos-cad/resources/cad-objects.json',
    'normia-planos-cad/resources/demo/demo-project.json',
    'normia-planos-cad/config/config.example.php',
    'normia-planos-cad/storage/sessions/.gitkeep',
    'normia-planos-cad/LEEME-PRIMERO.txt',
    'normia-planos-cad/LICENSE',
  ];
  const missing = essentials.filter((entry) => !prodEntries.includes(entry));
  report.check('El ZIP de producción contiene la aplicación completa', missing.length === 0, missing.join(', '));

  const sums = (() => {
    const file = path.join(dist, 'SHA256SUMS.txt');
    if (!fs.existsSync(file)) return {};
    return Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => {
      const [hash, name] = line.trim().split(/\s+/);
      return [name, hash];
    }));
  })();
  report.check('SHA-256 del paquete de producción coincide', sums[path.basename(prodZip)] === sha256(prodZip), sums[path.basename(prodZip)] || 'sin suma');
  report.check('SHA-256 del paquete de demostración coincide', sums[path.basename(demoZip)] === sha256(demoZip), sums[path.basename(demoZip)] || 'sin suma');
  report.check('BUILD.txt documenta los paquetes', fs.existsSync(path.join(dist, 'BUILD.txt')) && fs.readFileSync(path.join(dist, 'BUILD.txt'), 'utf8').includes(appVersion));

  const releaseDir = path.join(repoRoot, 'paquetes', `v${appVersion}`);
  report.check('La entrega incluye los ZIP en paquetes/', fs.existsSync(path.join(releaseDir, `normia-planos-cad-${appVersion}.zip`)) && fs.existsSync(path.join(releaseDir, `normia-planos-cad-demo-${appVersion}.zip`)));
  const releaseFile = path.join(releaseDir, 'SHA256SUMS.txt');
  const releaseSums = fs.existsSync(releaseFile)
    ? Object.fromEntries(fs.readFileSync(releaseFile, 'utf8').trim().split('\n').map((line) => {
      const [hash, name] = line.trim().split(/\s+/);
      return [name, hash];
    }))
    : {};
  const releaseOk = fs.existsSync(releaseDir) && [`normia-planos-cad-${appVersion}.zip`, `normia-planos-cad-demo-${appVersion}.zip`].every((name) => {
    const file = path.join(releaseDir, name);
    return fs.existsSync(file) && releaseSums[name] === sha256(file);
  });
  report.check('Las sumas de la entrega coinciden con sus ZIP', releaseOk, Object.keys(releaseSums).join(', '));

  /* ---------------------- instalación limpia de la demo ---------------------- */
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'normia-package-'));
  const extract = spawnSync('unzip', ['-q', demoZip, '-d', workdir], { encoding: 'utf8' });
  report.check('El ZIP de demostración se descomprime', extract.status === 0, (extract.stderr || '').trim());
  const documentRoot = path.join(workdir, 'normia-planos-cad-demo');
  report.check('El ZIP no trae configuración previa', !fs.existsSync(path.join(documentRoot, 'config/config.php')));
  report.check('El ZIP no trae base de datos', fs.readdirSync(path.join(documentRoot, 'storage')).every((name) => !name.endsWith('.sqlite')));

  const runtime = await startRuntime(documentRoot, VERSION_PHP, { cleanup: false });
  const client = runtime.client;
  try {
    const install = await client.get('install');
    report.check('Instalador accesible en la copia limpia', install.status === 200 && /Crear instalación|Instalador|instalación/i.test(install.text), String(install.status));
    report.check('La demo viene premarcada', /name="demo" value="1"[^>]*checked/.test(install.text));
    const token = extractToken(install.text);
    const created = await client.postForm('install', {
      _token: token,
      name: 'Cuenta de demostración',
      email: 'demo@normia.local',
      password: 'Demostracion2026',
      password_confirm: 'Demostracion2026',
      demo: '1',
    });
    report.check('La instalación se completa y redirige', [302, 303].includes(created.status), `${created.status} ${created.location}`);
    report.check('Se escribe la configuración y la base', fs.existsSync(path.join(documentRoot, 'config/config.php')) && fs.readdirSync(path.join(documentRoot, 'storage')).some((name) => name.endsWith('.sqlite')));
    const access = await runtime.login('demo@normia.local', 'Demostracion2026');
    report.check('La cuenta de demostración inicia sesión', [302, 303].includes(access.status), `${access.status} ${access.location}`);
    const dashboard = await client.get('');
    report.check('El panel muestra el proyecto de demostración', dashboard.status === 200 && /Planta de ejemplo/i.test(dashboard.text), String(dashboard.status));
    const projectHref = Array.from(dashboard.text.matchAll(/href="([^"]+)"/g))
      .map((match) => match[1])
      .find((href) => /\/index\.php\?r=projects\/\d+$/.test(decodeURIComponent(href))) || '';
    report.check('El panel enlaza la ficha del proyecto', projectHref !== '', projectHref);
    const projectRoute = new URL(decodeURIComponent(projectHref), 'http://127.0.0.1').searchParams.get('r') || '';
    report.check('La ruta del proyecto es válida', projectRoute === 'projects/1', projectRoute);
    const project = await client.get(projectRoute);
    let projectHtml = project.text;
    try {
      projectHtml = decodeURIComponent(project.text);
    } catch {
      /* hay páginas con % literales que no forman secuencias válidas */
    }
    const floorIds = [...new Set(Array.from(projectHtml.matchAll(/floors\/(\d+)\/editor/g)).map((match) => Number(match[1])))];
    report.check('El proyecto de ejemplo tiene cuatro pisos', project.status === 200 && floorIds.length === 4, `${floorIds.join(',')} · estado ${project.status}`);
    const editor = floorIds.length ? await client.get(`projects/1/floors/${floorIds[0]}/editor`) : { status: 0, text: '' };
    const editorOk = report.check('El editor de la demo carga', editor.status === 200 && /id="plan-canvas"/.test(editor.text), String(editor.status));
    if (editorOk) {
      const decode = (value) => value
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const bootJson = /<textarea id="editor-boot" hidden>([\s\S]*?)<\/textarea>/.exec(editor.text)?.[1] || '';
      const designJson = /<textarea id="editor-design" hidden>([\s\S]*?)<\/textarea>/.exec(editor.text)?.[1] || '';
      const boot = JSON.parse(decode(bootJson));
      const design = JSON.parse(decode(designJson));
      report.check('La demo arranca marcada como demostración', boot.demo === true);
      report.check('El plano de ejemplo tiene contenido', Array.isArray(design.elements) && design.elements.length >= 30, `${design.elements.length} elementos`);
      report.check('El plano de ejemplo usa señalización ISO 7010', design.elements.some((element) => String(element.type).startsWith('iso_')));
      const assetPaths = [...new Set(Array.from(editor.text.matchAll(/(?:href|src)="([^"]*\/assets\/[^"]+)"/g)).map((match) => match[1]))];
      report.check('La página del editor referencia assets locales', assetPaths.length >= 10, `${assetPaths.length} referencias`);
      const assetResults = [];
      for (const assetPath of assetPaths) {
        const relative = assetPath.replace(/^\.?\//, '').split('?')[0];
        const response = await client.get(`/${relative}`, { accept: '*' });
        assetResults.push({ path: relative, status: response.status, size: response.text.length });
      }
      const failedAssets = assetResults.filter((asset) => asset.status !== 200 || asset.size === 0);
      report.check('Todos los assets del editor responden 200', failedAssets.length === 0, failedAssets.slice(0, 3).map((asset) => `${asset.path} (${asset.status})`).join(', ') || `${assetResults.length} assets`);
      const svg = await client.get(`projects/1/floors/${floorIds[0]}/export/svg`);
      report.check('La exportación SVG de la demo funciona', svg.status === 200 && /<svg/i.test(svg.text) && !/<script/i.test(svg.text), `${svg.text.length} bytes`);
      const json = await client.get(`projects/1/floors/${floorIds[0]}/export/json`);
      const exported = JSON.parse(json.text);
      report.check('La exportación JSON de la demo funciona', exported.schema_version === 2 && exported.design.elements.length >= 30);
      const print = await client.get(`projects/1/floors/${floorIds[0]}/print`);
      report.check('La vista de impresión de la demo funciona', print.status === 200 && /editor-print|print/i.test(print.text));
    }
    const account = await client.get('account/password');
    report.check('Las vistas internas responden con sesión', account.status === 200);
  } finally {
    await runtime.close();
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    const failed = report.summary();
    process.exitCode = failed === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error('\nLa verificación de paquetes se detuvo:', error);
    report.summary();
    process.exitCode = 1;
  });
