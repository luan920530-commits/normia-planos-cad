/*
 * Suite de estabilidad de Normia Planos CAD (Fase 0).
 * Uso: node tests/php/stability.mjs 8.1|8.3
 *
 * Cubre las cinco etapas del plan: respaldos consistentes (WAL, fotos,
 * retención, verificación aislada), migraciones versionadas con fallo visible,
 * restauración de versiones con rowCount, distinción de cuerpo JSON vacío /
 * inválido / demasiado grande, y conservación de versiones con simulación.
 */
import fs from 'node:fs';
import { startApp, extractToken, makeReporter, Client } from './harness.mjs';

const version = process.argv[2] || '8.3';
const report = makeReporter(version);
const app = await startApp(version);
const { client } = app;

const html = (text) => String(text || '');
const jsonBody = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

try {
  await app.install({ demo: true });
  await app.login('admin@normia.local', 'ClaveSegura2026');
  const home = await client.get('');
  const token = extractToken(home.text);
  client.csrf = token;

  /* ------------------------------ A · respaldos ------------------------------ */

  let res = await client.get('respaldo');
  report.check('El panel de respaldo responde y se explica', res.status === 200 && /Datos y respaldo/.test(res.text),
    String(res.status));
  report.check('Sin copias, el panel lo dice con claridad', /Aún no hay respaldos/.test(res.text));
  report.check('El panel muestra la integridad de la base', /Integridad de la base/.test(res.text));

  // Una verificación con foto antes del respaldo: la foto debe viajar dentro.
  const floorInfo = await app.run(`
$floor = App\\Core\\Database::first('SELECT id FROM floors ORDER BY id LIMIT 1');
echo 'FLOOR=' . $floor['id'];
`);
  const floorId = Number((floorInfo.text.match(/FLOOR=(\d+)/) || [])[1] || 0);
  const projectInfo = await app.run(`
$row = App\\Core\\Database::first('SELECT project_id FROM floors WHERE id = ' . (int) ${floorId});
echo 'PROJECT=' . $row['project_id'];
`);
  const projectId = Number((projectInfo.text.match(/PROJECT=(\d+)/) || [])[1] || 0);
  report.check('Hay un piso de demostración para la prueba', floorId > 0 && projectId > 0, `${projectId}/${floorId}`);

  const elementInfo = await app.run(`
$floor = App\\Core\\Database::first('SELECT design_json FROM floors WHERE id = ' . (int) ${floorId});
$design = App\\Services\\DesignValidator::normalizeJson($floor['design_json']);
$items = App\\Services\\VerificationInventory::items($design);
echo 'ELEMENT=' . ($items[0]['id'] ?? '');
`);
  const elementId = (elementInfo.text.match(/ELEMENT=(\S*)/) || [])[1] || '';
  report.check('El plano de demostración tiene elementos verificables', elementId !== '', elementId);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  res = await client.request(`projects/${projectId}/floors/${floorId}/verifications`, {
    method: 'POST',
    body: {
      _token: token,
      element_id: elementId,
      status: 'ok',
      note: 'Evidencia para el respaldo',
      photo: new File([png], 'evidencia.png', { type: 'image/png' }),
    },
  });
  report.check('La verificación con foto se guarda antes del respaldo', [302, 303].includes(res.status), String(res.status));

  res = await client.postForm('respaldo', { _token: token });
  report.check('Crear respaldo redirige al panel', [302, 303].includes(res.status), String(res.status));

  const snap = await app.run(`
$items = App\\Services\\Backup::list();
$last = $items[0] ?? null;
if ($last === null) { echo 'SIN_RESPALDO'; return; }
$path = App\\Services\\Backup::downloadPath($last['name']);
$counts = $last['report']['counts'] ?? [];
$inspect = App\\Services\\Backup::inspectArchive($path);
echo 'NAME=' . $last['name']
   . ' SIZE=' . (int) $last['bytes']
   . ' PROYECTOS=' . (int) ($counts['projects'] ?? 0)
   . ' PISOS=' . (int) ($counts['floors'] ?? 0)
   . ' VERSIONES=' . (int) ($counts['floor_versions'] ?? 0)
   . ' VERIF=' . (int) ($counts['element_checks'] ?? 0)
   . ' OK=' . (!empty($last['report']['ok']) ? 'si' : 'no')
   . ' ZIP=' . (str_starts_with((string) @file_get_contents($path, false, null, 0, 2), 'PK') ? 'si' : 'no')
   . ' INSPECCION=' . ($inspect['ok'] ? 'ok' : 'no') . '|' . implode(' ', $inspect['report']['errors'] ?? []);
@unlink($inspect['database']);
$db = (int) App\\Core\\Database::value('SELECT COUNT(*) FROM element_checks WHERE photo IS NOT NULL');
echo ' FOTO_EN_BASE=' . $db;
`);
  const snapText = (snap.text || '').trim();
  report.check('El respaldo guarda proyectos, pisos y versiones',
    /PROYECTOS=\d+ PISOS=\d+ VERSIONES=\d+/.test(snapText) && /VERIF=1/.test(snapText), snapText.slice(0, 120));
  report.check('El respaldo se verifica solo (integridad, claves foráneas, invariantes)',
    /OK=si/.test(snapText) && /INSPECCION=ok/.test(snapText), snapText.slice(0, 160));
  report.check('El respaldo es un ZIP real y contiene la base', /ZIP=si/.test(snapText));
  report.check('La fotografía de verificación viaja dentro de la copia', /FOTO_EN_BASE=1/.test(snapText));
  const backupName = (snapText.match(/NAME=(normia-\d{8}-\d{6})/) || [])[1] || '';

  res = await client.get(`respaldo/${backupName}`, { accept: 'application/zip' });
  report.check('La descarga del respaldo entrega un ZIP', res.status === 200 && res.type.includes('application/zip')
    && res.text.startsWith('PK'), `${res.status} ${res.type}`);

  res = await client.get('respaldo/base');
  report.check('La copia rápida de la base se descarga como SQLite',
    res.status === 200 && /application\/(vnd\.)?sqlite3?/.test(res.type) && res.text.startsWith('SQLite format 3'),
    `${res.status} ${res.type}`);

  res = await client.get(`respaldo/${backupName}/verificar`);
  const afterVerify = await client.get('respaldo');
  report.check('Verificar una copia informa el resultado sin tocar la base',
    [302, 303].includes(res.status) && /Respaldo verificado/.test(afterVerify.text), String(res.status));

  res = await client.get('respaldo/normia-00000000-000000');
  report.check('Un nombre de respaldo inventado no descarga nada', [302, 303, 404].includes(res.status), String(res.status));

  // Rotación y fijado.
  const rotation = await app.run(`
$dir = App\\Services\\Backup::directory();
for ($i = 1; $i <= 12; $i++) {
    $name = 'normia-202001' . str_pad((string) $i, 2, '0', STR_PAD_LEFT) . '-000000';
    file_put_contents($dir . '/' . $name . '.zip', 'PK' . $i);
    file_put_contents($dir . '/' . $name . '.json', json_encode([
        'name' => $name, 'created_at' => '2020-01-' . str_pad((string) $i, 2, '0', STR_PAD_LEFT) . 'T00:00:00+00:00',
        'kind' => 'prueba', 'bytes' => 3, 'pinned' => false,
    ]));
}
$antes = count(App\\Services\\Backup::list());
App\\Services\\Backup::pin('normia-20200101-000000', true);
$borradas = App\\Services\\Backup::prune(10);
$despues = count(App\\Services\\Backup::list());
$fijada = is_file($dir . '/normia-20200101-000000.zip') ? 'si' : 'no';
echo "ANTES=$antes DESPUES=$despues BORRADAS=" . count($borradas) . ' FIJADA=' . $fijada;
`);
  const rot = (rotation.text || '').trim();
  // 13 copias: se conservan las 10 más recientes y además la fijada, que está
  // fuera de esa ventana; por eso quedan 11 y no 10.
  report.check('La rotación conserva 10 copias más la fijada y no la toca',
    /DESPUES=11/.test(rot) && /FIJADA=si/.test(rot) && /BORRADAS=2/.test(rot), rot);

  const corrupt = await app.run(`
$file = sys_get_temp_dir() . '/normia-corrupta-' . bin2hex(random_bytes(3)) . '.sqlite';
file_put_contents($file, 'esto no es una base de datos');
$report = App\\Services\\Backup::verify($file);
echo 'OK=' . ($report['ok'] ? 'si' : 'no') . ' ERRORES=' . count($report['errors']);
@unlink($file);
`);
  report.check('La verificación detecta un archivo que no es una base',
    /OK=no/.test(corrupt.text || '') && /ERRORES=[1-9]/.test(corrupt.text || ''), (corrupt.text || '').trim());

  const health = await app.run(`
$h = App\\Services\\Backup::health(true);
echo 'OK=' . ($h['ok'] ? 'si' : 'no') . ' RESULTADO=' . $h['result'];
`);
  report.check('La salud de la base responde ok', /OK=si/.test(health.text || ''), (health.text || '').trim());

  /* --------------------- A · aislamiento del respaldo --------------------- */

  const second = await app.run(`
$user = App\\Models\\User::create('Cuenta secundaria', 'secundaria@normia.local', 'Secundaria2026', false);
if ($user !== null) {}
echo 'ID=' . $user;
`);
  const secondId = Number((second.text.match(/ID=(\d+)/) || [])[1] || 0);
  report.check('Se crea una cuenta que no administra la instalación', secondId > 0, String(secondId));
  const member = new Client(app.handler);
  await member.get('login');
  await member.postForm('login', {
    _token: extractToken((await member.get('login')).text),
    email: 'secundaria@normia.local',
    password: 'Secundaria2026',
  });
  res = await member.get('respaldo');
  report.check('Una cuenta que no instaló la aplicación no puede ver los respaldos',
    res.status === 422 && /datos de todas las empresas/.test(res.text), `${res.status}`);
  res = await member.get('respaldo/base');
  report.check('Tampoco puede descargar la base completa', [422, 403].includes(res.status), String(res.status));
  res = await member.get('respaldo');
  report.check('El enlace de respaldo no aparece en su navegación', !/Respaldo/.test(res.text) || res.status === 422);

  /* ------------------------------ B · migraciones ------------------------------ */

  const ledger = await app.run(`
echo 'VERSION=' . (int) App\\Core\\Database::value('PRAGMA user_version');
echo ' FILAS=' . (int) App\\Core\\Database::value('SELECT COUNT(*) FROM schema_migrations');
echo ' ULTIMA=' . (string) App\\Core\\Database::value('SELECT MAX(version) FROM schema_migrations');
echo ' NOMBRES=' . (int) App\\Core\\Database::value('SELECT COUNT(*) FROM schema_migrations WHERE name <> ""');
`);
  const ledgerText = (ledger.text || '').trim();
  report.check('La bitácora de migraciones está completa y al día',
    /VERSION=7/.test(ledgerText) && /ULTIMA=7/.test(ledgerText) && /FILAS=6/.test(ledgerText) && /NOMBRES=6/.test(ledgerText),
    ledgerText);

  const pendiente = await app.run(`
echo 'PENDIENTE=' . (App\\Core\\Migrations::pending() ? 'si' : 'no');
echo ' VERSION=' . App\\Core\\Migrations::VERSION;
`);
  report.check('Con la base al día no queda trabajo pendiente',
    /PENDIENTE=no/.test(pendiente.text || '') && /VERSION=7/.test(pendiente.text || ''), (pendiente.text || '').trim());

  const fallo = await app.run(`
$tmp = sys_get_temp_dir() . '/normia-fallo-' . bin2hex(random_bytes(4)) . '.sqlite';
$pdo = new PDO('sqlite:' . $tmp);
$pdo->exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT, is_admin INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)');
$pdo->exec('CREATE TABLE organizations (id INTEGER PRIMARY KEY, name TEXT)');
$pdo->exec('CREATE TABLE memberships (id INTEGER PRIMARY KEY, organization_id INTEGER, user_id INTEGER, role TEXT)');
$pdo->exec('CREATE TABLE projects (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT)');
$pdo->exec('CREATE TABLE floors (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, design_json TEXT, version INTEGER)');
// Sin floor_id: el índice de la migración 7 no se puede crear.
$pdo->exec('CREATE TABLE floor_versions (id INTEGER PRIMARY KEY, version INTEGER, design_json TEXT)');
$pdo->exec('PRAGMA user_version = 6');
$pdo->exec('INSERT INTO users (id, name, email, password_hash) VALUES (1, "Ana", "ana@x.local", "x")');
$pdo->exec('INSERT INTO organizations (id, name) VALUES (1, "Empresa intacta")');
$pdo->exec('INSERT INTO projects (id, organization_id, name) VALUES (1, 1, "Bodega intacta")');
$pdo = null;

App\\Core\\Database::reset();
App\\Core\\Database::connect($tmp);
$mensaje = '';
try {
    App\\Core\\Migrations::run();
    $mensaje = 'SIN_ERROR';
} catch (Throwable $e) {
    $mensaje = get_class($e);
}
$version = (int) App\\Core\\Database::value('PRAGMA user_version');
$proyecto = (string) App\\Core\\Database::value('SELECT name FROM projects WHERE id = 1');
$empresa = (string) App\\Core\\Database::value('SELECT name FROM organizations WHERE id = 1');
$log = is_file(App\\Core\\Paths::logs() . '/migraciones.log') ? 'si' : 'no';
App\\Core\\Database::reset();
App\\Core\\Database::connect(App\\Core\\Config::databasePath());
@unlink($tmp);
echo 'ERROR=' . $mensaje . ' VERSION=' . $version . ' PROYECTO=' . $proyecto . ' EMPRESA=' . $empresa . ' LOG=' . $log;
`);
  const falloText = (fallo.text || '').trim();
  report.check('Una migración que falla se detiene en voz alta',
    /ERROR=App\\Core\\SchemaException/.test(falloText), falloText);
  report.check('La migración fallida no cambia la versión ni pierde datos',
    /VERSION=6/.test(falloText) && /PROYECTO=Bodega intacta/.test(falloText) && /EMPRESA=Empresa intacta/.test(falloText)
    && /LOG=si/.test(falloText), falloText);

  /* --------------------------- C · restauración --------------------------- */

  const restore = await app.run(`
$floorId = (int) ${floorId};
$userId = 1;
$versions = App\\Core\\Database::query('SELECT * FROM floor_versions WHERE floor_id = ? ORDER BY version ASC', [$floorId]);
$primera = $versions[0];
$resultado = App\\Models\\Floor::restoreVersion($floorId, (int) $primera['id'], $userId);
echo 'NUEVA=' . $resultado['version'];
$historial = (int) App\\Core\\Database::value('SELECT COUNT(*) FROM floor_versions WHERE floor_id = ?', [$floorId]);
echo ' HISTORIAL=' . $historial;

// Carrera: se pide restaurar con una versión esperada que ya no es la real.
$actual = (int) App\\Core\\Database::value('SELECT version FROM floors WHERE id = ?', [$floorId]);
$antes = (int) App\\Core\\Database::value('SELECT COUNT(*) FROM floor_versions WHERE floor_id = ?', [$floorId]);
$error = '';
try {
    App\\Models\\Floor::applyRestore($floorId, $primera, $userId, $actual - 1);
    $error = 'SIN_ERROR';
} catch (Throwable $e) {
    $error = get_class($e);
}
$despues = (int) App\\Core\\Database::value('SELECT COUNT(*) FROM floor_versions WHERE floor_id = ?', [$floorId]);
$quedo = (int) App\\Core\\Database::value('SELECT version FROM floors WHERE id = ?', [$floorId]);
echo ' CARRERA=' . $error . ' SIN_INSERTAR=' . ($antes === $despues ? 'si' : 'no') . ' VIGENTE=' . $quedo;
`);
  const restoreText = (restore.text || '').trim();
  report.check('Restaurar una versión crea una nueva y conserva el historial',
    /NUEVA=2/.test(restoreText) && /HISTORIAL=2/.test(restoreText), restoreText);
  report.check('Una restauración en carrera lanza conflicto y no inserta nada',
    /CARRERA=App\\Core\\VersionConflictException/.test(restoreText) && /SIN_INSERTAR=si/.test(restoreText),
    restoreText);

  const conflictoHttp = await app.run(`
$floorId = (int) ${floorId};
$v = App\\Core\\Database::first('SELECT * FROM floor_versions WHERE floor_id = ? ORDER BY version ASC LIMIT 1', [$floorId]);
$actual = (int) App\\Core\\Database::value('SELECT version FROM floors WHERE id = ?', [$floorId]);
try {
    App\\Models\\Floor::applyRestore($floorId, $v, 1, $actual - 1);
    echo 'SIN_ERROR';
} catch (App\\Core\\VersionConflictException $e) {
    echo 'CONFLICTO=' . $e->currentVersion();
}
`);
  report.check('El conflicto informa la versión real para resolverlo',
    /CONFLICTO=\d+/.test(conflictoHttp.text || ''), (conflictoHttp.text || '').trim());

  /* ------------------------- D · cuerpos JSON ------------------------- */

  const saveRoute = `api/floors/${floorId}/save`;
  const designPayload = await app.run(`
$floor = App\\Core\\Database::first('SELECT design_json, version FROM floors WHERE id = ' . (int) ${floorId});
echo json_encode(['design' => json_decode($floor['design_json'], true), 'expected_version' => (int) $floor['version']]);
`);
  const payload = jsonBody(designPayload.text);

  let raw = await client.request(saveRoute, {
    method: 'POST',
    body: '   ',
    json: true,
    accept: 'application/json',
  });
  let body = jsonBody(raw.text);
  report.check('Un cuerpo vacío responde 400 empty_body',
    raw.status === 400 && body.code === 'empty_body', `${raw.status} ${body.code || ''}`);

  raw = await client.request(saveRoute, {
    method: 'POST',
    body: '{"design": ',
    json: true,
    accept: 'application/json',
  });
  body = jsonBody(raw.text);
  report.check('Un JSON mal formado responde 400 invalid_json',
    raw.status === 400 && body.code === 'invalid_json', `${raw.status} ${body.code || ''}`);

  const huge = '{"design":"' + 'x'.repeat(2_600_000) + '"}';
  raw = await client.request(saveRoute, {
    method: 'POST',
    body: huge,
    json: true,
    accept: 'application/json',
  });
  body = jsonBody(raw.text);
  report.check('Un cuerpo de más de 2,5 MB responde 413 payload_too_large',
    raw.status === 413 && body.code === 'payload_too_large', `${raw.status} ${body.code || ''}`);
  report.check('El mensaje del 413 explica el límite y qué hacer',
    /2\.5 MB/.test(body.message || '') && /Reduce el plano/.test(body.message || ''), (body.message || '').slice(0, 80));

  raw = await client.request(saveRoute, {
    method: 'POST',
    body: JSON.stringify({ design: { canvas: {} }, expected_version: payload.expected_version }),
    json: true,
    accept: 'application/json',
  });
  body = jsonBody(raw.text);
  report.check('Un JSON válido pero incompleto sigue respondiendo 422',
    raw.status === 422 && ['validation', 'invalid'].includes(body.code), `${raw.status} ${body.code || ''}`);

  raw = await client.request(saveRoute, {
    method: 'POST',
    body: JSON.stringify(payload),
    json: true,
    accept: 'application/json',
  });
  body = jsonBody(raw.text);
  report.check('Un guardado correcto sigue funcionando', raw.status === 200 && body.ok === true,
    `${raw.status} ${body.message || ''}`.slice(0, 90));

  /* --------------------------- E · conservación --------------------------- */

  const retention = await app.run(`
$floorId = (int) ${floorId};
$userId = 1;
App\\Core\\Database::execute('DELETE FROM floor_versions WHERE floor_id = ?', [$floorId]);
$actual = (int) App\\Core\\Database::value('SELECT version FROM floors WHERE id = ?', [$floorId]);
$design = (string) App\\Core\\Database::value('SELECT design_json FROM floors WHERE id = ?', [$floorId]);
// 40 versiones repartidas en 400 días, una cada 10 días.
for ($i = 1; $i <= 40; $i++) {
    $fecha = gmdate('Y-m-d H:i:s', time() - ($i * 10 * 86400));
    App\\Core\\Database::execute(
        'INSERT INTO floor_versions (floor_id, version, design_json, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [$floorId, $i, $design, 'Versión ' . $i, $userId, $fecha]
    );
}
App\\Core\\Database::execute('UPDATE floors SET version = 40 WHERE id = ?', [$floorId]);

$plan = App\\Services\\VersionRetention::plan($floorId);
$protegidas = array_column($plan['protected'], 'version');
echo 'TOTAL=' . $plan['total'];
echo ' CANDIDATAS=' . count($plan['candidates']);
echo ' CONSERVADAS=' . $plan['kept'];
echo ' VIGENTE=' . (in_array(40, $protegidas, true) ? 'si' : 'no');
echo ' INICIAL=' . (in_array(1, $protegidas, true) ? 'si' : 'no');
echo ' LIBERA=' . ($plan['freed'] > 0 ? 'si' : 'no');

// Filtrar la vigente y una inexistente: no debe borrarlas.
$ids = [$plan['candidates'][0]['id'], 999999];
$resultado = App\\Services\\VersionRetention::prune($floorId, $ids);
echo ' BORRADAS=' . $resultado['deleted'] . ' OMITIDAS=' . $resultado['skipped'];
echo ' QUEDA_VIGENTE=' . (int) App\\Core\\Database::value('SELECT COUNT(*) FROM floor_versions WHERE floor_id = ? AND version = 40', [$floorId]);
echo ' QUEDA_INICIAL=' . (int) App\\Core\\Database::value('SELECT COUNT(*) FROM floor_versions WHERE floor_id = ? AND version = 1', [$floorId]);

// Fijar la última candidata: la poda ya no puede tocarla.
$plan = App\\Services\\VersionRetention::plan($floorId);
$ultima = end($plan['candidates']);
if ($ultima !== false) {
    App\\Services\\VersionRetention::pin($floorId, (int) $ultima['id'], true);
    $borrado = App\\Services\\VersionRetention::prune($floorId, [(int) $ultima['id']]);
    echo ' FIJADA_PROTEGIDA=' . ($borrado['deleted'] === 0 ? 'si' : 'no');
}
`);
  const retText = (retention.text || '').trim();
  report.check('El plan conserva la versión vigente y la inicial',
    /VIGENTE=si/.test(retText) && /INICIAL=si/.test(retText), retText);
  report.check('El plan reduce el historial sin vaciarlo',
    /TOTAL=40/.test(retText) && /CANDIDATAS=\d+/.test(retText) && /CONSERVADAS=\d+/.test(retText) && /LIBERA=si/.test(retText),
    retText.slice(0, 140));
  report.check('La poda borra solo lo seleccionado y válido',
    /BORRADAS=1/.test(retText) && /OMITIDAS=1/.test(retText), retText.slice(0, 160));
  report.check('La poda nunca elimina la versión vigente',
    /QUEDA_VIGENTE=1/.test(retText), retText.slice(0, 160));
  report.check('Una versión fijada queda fuera de la poda', /FIJADA_PROTEGIDA=si/.test(retText), retText.slice(0, 160));

  res = await client.get(`projects/${projectId}/floors/${floorId}/versiones`);
  report.check('La página de historial y conservación responde',
    res.status === 200 && /Historial y conservación/.test(res.text) && /Cómo se decide qué se conserva/.test(res.text),
    String(res.status));
  report.check('La página avisa del respaldo previo y del alcance',
    /Se creará un respaldo antes de borrar/.test(res.text));

  res = await client.postForm(`projects/${projectId}/floors/${floorId}/versiones/podar`, { _token: token });
  const afterEmpty = await client.get(`projects/${projectId}/floors/${floorId}/versiones`);
  report.check('Podar sin selección no borra nada y lo explica',
    [302, 303].includes(res.status) && /No seleccionaste ninguna versión/.test(afterEmpty.text), String(res.status));

  res = await member.get(`projects/${projectId}/floors/${floorId}/versiones`);
  report.check('Una cuenta sin empresa no entra al historial ajeno', [404, 422].includes(res.status), String(res.status));

  /* ------------------------------- cierre ------------------------------- */

  res = await client.get('respaldo');
  report.check('El panel sigue sano después de todo lo anterior',
    res.status === 200 && !/<b>(Warning|Fatal error|Notice)<\/b>/.test(res.text), String(res.status));
} catch (error) {
  console.error('Error inesperado durante la suite:', error);
  report.check('Suite sin excepciones', false, error.message);
} finally {
  const failed = report.summary();
  await app.close();
  process.exit(failed ? 1 : 0);
}
