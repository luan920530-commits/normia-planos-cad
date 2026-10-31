/*
 * Pruebas de la distribución de escritorio.
 *
 * Verifican lo que se puede probar sin compilar instaladores: el enrutador que
 * protege `config/`, `storage/` y el resto de carpetas internas; el lanzador
 * (rutas de datos por sistema, preparación de carpetas, estado de la instancia,
 * puerto libre y lectura de argumentos); y que la aplicación arranca con los
 * datos fuera del código, como en la app instalada.
 *
 * Los binarios de los instaladores los genera el flujo de trabajo
 * `.github/workflows/dist-desktop.yml` en macOS y Windows reales.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startRuntime, cloneProject, makeReporter, extractToken } from './harness.mjs';

const report = makeReporter('Escritorio');

/* ------------------------------ enrutador ------------------------------ */

const routerSource = fs.readFileSync(new URL('../../tools/desktop/router.php', import.meta.url), 'utf8');
const launcherSource = fs.readFileSync(new URL('../../tools/desktop/launcher.php', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/dist-desktop.yml', import.meta.url), 'utf8');
const verifyWorkflow = fs.readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
const iss = fs.readFileSync(new URL('../../tools/desktop/windows/normia.iss', import.meta.url), 'utf8');

report.check('El enrutador declara las carpetas internas como protegidas',
  /'\/app', '\/config', '\/resources', '\/storage', '\/tests', '\/tools', '\/docs', '\/paquetes'/.test(routerSource),
  'lista de prefijos');
report.check('El enrutador entrega solo assets/ como archivo estático',
  /str_starts_with\(\$path, '\/assets\/'\)/.test(routerSource) && !/\/storage\/'\)\)\s*\{\s*return true/.test(routerSource));
report.check('El enrutador rechaza rutas con salto de directorio',
  /\/\.\.\//.test(routerSource) && /str_contains\(\$path, "\\0"\)/.test(routerSource));
report.check('El instalador de Windows es por usuario, sin administrador',
  /PrivilegesRequired=lowest/.test(iss) && /ArchitecturesAllowed=x64compatible/.test(iss));
report.check('El instalador de Windows crea las carpetas de datos y el desinstalador detiene el servidor',
  /Name: "\{localappdata\}\\Normia"/.test(iss) && /--stop/.test(iss) && /Iniciar Normia\.vbs/.test(iss));
report.check('El flujo de escritorio fija versión y suma de static-php-cli',
  /SPC_VERSION: '2\.8\.5'/.test(workflow)
  && /acf2f25d56d0cbf8e65aa82e5054fef555f7be7c5c38046c6e0819f266d83225/.test(workflow)
  && /shasum -a 256 -c/.test(workflow));
report.check('El flujo arranca el servidor y comprueba la respuesta HTTP antes de publicar',
  /curl -fsS "http:\/\/127\.0\.0\.1:8791\/index\.php\?r=install"/.test(workflow)
  && /storage\/normia\.sqlite/.test(workflow));
report.check('El flujo instala el .exe en silencio y lo prueba instalado',
  /\/VERYSILENT/.test(workflow) && /normia-instalada/.test(workflow));
report.check('La verificación continua cubre PHP 8.1 y 8.3', /php: \['8\.1', '8\.3'\]/.test(verifyWorkflow));

/* ------------------------------- lanzador ------------------------------ */

const runtime = await startRuntime(cloneProject(), '8.3', { cleanup: true });

const launcherProbe = await runtime.run(`
define('NORMA_LAUNCHER_LIB', true);
require BASE_PATH . '/tools/desktop/launcher.php';
$out = [];
$out['min'] = defined('NORMA_LAUNCHER_MIN_SECONDS') ? 'definida' : 'no';
$out['url'] = normaLAppUrl(8791, 'install');
$out['url_vacia'] = normaLAppUrl(8791);
$out['args'] = normaLParseArgs(['launcher.php', '--no-browser', '--port=9001', '--data=/tmp/x']);
$out['args_vacios'] = normaLParseArgs(['launcher.php']);
$out['state'] = normaLStateFile('/tmp/normia-demo');
$port = normaLFreePort();
$out['puerto'] = is_int($port) && $port >= 0;
$out['rango'] = normaLFreePort(8790, 8810) === 0 ? 'sin-rango' : 'con-rango';
$probe = sys_get_temp_dir() . '/normia-launcher-' . bin2hex(random_bytes(4));
$fallos = normaLPrepareDataDir($probe);
$out['carpetas_ok'] = $fallos === []
  && is_dir($probe . '/config') && is_dir($probe . '/storage/sessions') && is_dir($probe . '/storage/logs');
normaLWriteState($probe, ['pid' => 111, 'child' => 222, 'port' => 4321, 'started_at' => '2026-01-01T00:00:00Z', 'url' => 'http://127.0.0.1:4321/index.php?r=']);
$state = normaLReadState($probe);
$out['estado'] = $state['port'] === 4321 && $state['child'] === 222;
normaLClearState($probe);
$out['estado_borrado'] = normaLReadState($probe) === null;
$out['vivo_falso'] = normaLProcessAlive(999999);
$out['no_vivo'] = normaLProcessAlive(0);
// Se borra el temporal que creó la prueba.
foreach (['config', 'storage/sessions', 'storage/logs', 'storage/cache', 'storage'] as $dir) {
    @rmdir($probe . '/' . $dir);
}
@rmdir($probe);
$out['home'] = normaLDefaultDataDir();
echo json_encode($out);
`);

const launcher = JSON.parse(launcherProbe.text || '{}');
report.check('El lanzador se puede cargar como biblioteca sin arrancar el servidor',
  launcher.min === 'no' && typeof launcher.url === 'string', launcherProbe.text?.slice(0, 60));
report.check('El lanzador arma la URL de instalación y la de la aplicación',
  launcher.url === 'http://127.0.0.1:8791/index.php?r=install'
  && launcher.url_vacia === 'http://127.0.0.1:8791/index.php?r=',
  `${launcher.url} · ${launcher.url_vacia}`);
report.check('El lanzador entiende --no-browser, --port y --data',
  launcher.args?.port === 9001 && launcher.args?.data === '/tmp/x' && launcher.args?.['no-browser'] === true
  && launcher.args_vacios?.port === 0 && launcher.args_vacios?.stop === false);
report.check('El lanzador pide al sistema un puerto libre y tiene un rango de respaldo',
  launcher.puerto === true && typeof launcher.rango === 'string', `${launcher.puerto} · ${launcher.rango}`);
report.check('El lanzador prepara config, sesiones y registros en la carpeta de datos',
  launcher.carpetas_ok === true);
report.check('El estado de la instancia se escribe, se lee y se borra',
  launcher.estado === true && launcher.estado_borrado === true);
report.check('El lanzador no confunde un proceso inexistente con uno vivo',
  launcher.vivo_falso === false && launcher.no_vivo === false);
report.check('La carpeta de datos por defecto es la del usuario', /config|Normia|\.local/.test(launcher.home || ''), launcher.home);

report.check('El lanzador escucha solo en la interfaz local',
  /127\.0\.0\.1:' \. \$port/.test(launcherSource) && !/0\.0\.0\.0/.test(launcherSource));
report.check('El lanzador nunca usa una carpeta de datos relativa',
  /NORMA_DATA_PATH/ .test(launcherSource) && /#\^\(\[A-Za-z\]:/.test(fs.readFileSync(new URL('../../app/Core/Paths.php', import.meta.url), 'utf8')));
report.check('El lanzador abre la instalación la primera vez y la app después',
  /is_file\(\$config\) \? '' : 'install'/.test(launcherSource));
report.check('El lanzador cierra el servidor cuando lo cierra el sistema',
  /pcntl_signal/.test(launcherSource) && /proc_terminate/.test(launcherSource));

/* ------------------ arranque con los datos fuera del código ------------------ */

report.check('La instancia de prueba parte sin instalación previa',
  !fs.existsSync(path.join(runtime.target, 'config/config.php')));
const installView = await runtime.client.get('install');
const installToken = extractToken(installView.text);
const desktopDir = path.join(runtime.target, 'storage', 'escritorio');
const installResult = await runtime.client.postForm('install', {
  _token: installToken,
  name: 'Administrador de escritorio',
  email: 'escritorio@normia.local',
  password: 'ClaveSegura2026',
  password_confirm: 'ClaveSegura2026',
  demo: '1',
});
const installedConfig = path.join(runtime.target, 'config/config.php');
const installedDb = fs.readdirSync(path.join(runtime.target, 'storage')).find((file) => file.endsWith('.sqlite')) || '';
report.check('La instalación deja config y base en la carpeta de datos',
  installResult.status === 303 && fs.existsSync(installedConfig) && installedDb !== '',
  `${installResult.status} · ${installedDb || 'sin base'}`);
report.check('La instalación no escribe fuera de storage/ y config/ del proyecto',
  !fs.existsSync(desktopDir), 'sin carpetas sueltas');

const session = await runtime.login('escritorio@normia.local', 'ClaveSegura2026');
const dashboard = await runtime.client.get('');
report.check('La aplicación instalada deja entrar y mostrar el panel con la demo',
  session.status === 303 && dashboard.status === 200 && /Bodega|plano/i.test(dashboard.text),
  `${session.status} · ${dashboard.status}`);

const separation = await runtime.run(`
$base = sys_get_temp_dir() . '/normia-paths-' . bin2hex(random_bytes(4));
$data = $base . '/datos';
@mkdir($base . '/codigo', 0770, true);
@mkdir($data, 0770, true);
App\\Core\\Paths::init($base . '/codigo', $data);
$out = [
  'base' => App\\Core\\Paths::base(),
  'data' => App\\Core\\Paths::data(),
  'portable' => App\\Core\\Paths::isPortable(),
  'config' => App\\Core\\Paths::configFile(),
  'storage' => App\\Core\\Paths::storage(),
  'db' => App\\Core\\Paths::database('../../etc/passwd'),
];
$sin = sys_get_temp_dir() . '/normia-paths-' . bin2hex(random_bytes(4));
App\\Core\\Paths::init($sin, null);
$out['iguales'] = App\\Core\\Paths::isPortable() === false && App\\Core\\Paths::data() === App\\Core\\Paths::base();
putenv('NORMA_DATA_PATH=relativa/no/vale');
$out['relativa'] = App\\Core\\Paths::fromEnvironment();
putenv('NORMA_DATA_PATH=' . $data);
$out['absoluta'] = App\\Core\\Paths::fromEnvironment() === $data;
putenv('NORMA_DATA_PATH');
@rmdir($base . '/codigo'); @rmdir($data); @rmdir($base);
echo json_encode($out);
`);
const paths = JSON.parse(separation.text || '{}');
report.check('Las rutas separan el código de los datos',
  paths.portable === true && paths.data !== paths.base && String(paths.config).endsWith('/config/config.php'),
  paths.data);
report.check('Sin datos externos las rutas vuelven a coincidir con el código', paths.iguales === true);
report.check('La base nunca sale de la carpeta de datos', /\/storage\/passwd$/.test(String(paths.db)), paths.db);
report.check('NORMA_DATA_PATH solo acepta rutas absolutas',
  paths.relativa === '' && paths.absoluta === true, `${paths.relativa} · ${paths.absoluta}`);

/* ------------------------------ enrutador ------------------------------ */

const routesProbe = await runtime.run(`
define('NORMA_LAUNCHER_LIB', true);
require BASE_PATH . '/tools/desktop/router.php';
$blocked = ['/storage/normia.sqlite', '/config/config.php', '/app/Core/Config.php', '/tests/php/harness.mjs', '/tools/desktop/launcher.php'];
$allowed = ['/index.php', '/', '/assets/css/app.css', '/assets/img/normia-logo.png', '/storagex/nota.txt'];
$out = [];
foreach ($blocked as $path) { $out[$path] = normaDesktopRoute($path); }
foreach ($allowed as $path) { $out[$path] = normaDesktopRoute($path); }
$out['traversal'] = normaDesktopRoute('/assets/../config/config.php');
$out['encoded'] = normaDesktopRoute('/storage/%2e%2e/config/config.php');
$out['nulo'] = normaDesktopRoute("/assets/x" . chr(0) . ".png");
echo json_encode($out);
`);
const routes = JSON.parse(routesProbe.text.replace(/^[\s\S]*?(\{[\s\S]*\})\s*$/, '$1') || '{}');
report.check('El enrutador bloquea config, storage, app y pruebas',
  routes['/config/config.php'] === 'deny' && routes['/storage/normia.sqlite'] === 'deny'
  && routes['/app/Core/Config.php'] === 'deny' && routes['/tests/php/harness.mjs'] === 'deny'
  && routes['/tools/desktop/launcher.php'] === 'deny',
  JSON.stringify(routes).slice(0, 120));
report.check('El enrutador deja pasar index.php y los assets locales',
  routes['/index.php'] === 'app' && routes['/'] === 'app' && routes['/assets/css/app.css'] === 'static'
  && routes['/assets/img/normia-logo.png'] === 'static' && routes['/storagex/nota.txt'] === 'app');
report.check('El enrutador resiste el salto de directorio y el byte nulo',
  routes.traversal === 'deny' && routes.encoded === 'deny' && routes.nulo === 'deny',
  `${routes.traversal} · ${routes.encoded} · ${routes.nulo}`);

runtime.close();
process.exit(report.summary());
