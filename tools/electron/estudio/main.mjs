/*
 * Normia Estudio · edición de escritorio «solo editor».
 *
 * Una ventana con el editor de Normia y nada más: no hay portada, ni cuentas,
 * ni proyectos, ni base de datos. El plano es un **archivo** que la persona
 * abre y guarda donde quiera (Escritorio, iCloud Drive, un pendrive), y la
 * aplicación solo hace las cuatro cosas que el navegador no puede hacer sola:
 * auditor, informe, impresión y exportación con escala física.
 *
 * PHP viaja compilado a WebAssembly dentro del paquete y el servidor se enlaza
 * **solo a 127.0.0.1**, en un puerto libre. No se abre nada a la red.
 *
 * Uso:
 *   normia-estudio --check        informa el intérprete y termina.
 *   normia-estudio                abre la ventana con un plano en blanco.
 *   normia-estudio plano.json     abre ese plano.
 *   normia-estudio --datos=<ruta> usa otra carpeta de datos.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEnvironment, startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = 'Normia Estudio';
const CHECK = process.argv.includes('--check');
const SHOW_DEVTOOLS = process.argv.includes('--devtools');

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('co.normia.estudio');

const appDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.resolve(HERE, '../..');
const runtimeDir = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : '';
const iconPath = path.join(appDir, 'assets', 'img', 'apple-touch-icon.png');
/** Filtros de los diálogos: el plano de Normia es JSON legible y portable. */
const PLAN_FILTERS = [{ name: 'Plano de Normia', extensions: ['json'] }, { name: 'Todos los archivos', extensions: ['*'] }];

/** Valor de un argumento `--nombre=valor`. */
function argumentValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

/** Plano que se abre al arrancar: `normia-estudio archivo.json`. */
function initialFile() {
  const candidate = process.argv.slice(1).find((argument) => !argument.startsWith('-') && /\.json$/i.test(argument));
  return candidate && fs.existsSync(candidate) ? path.resolve(candidate) : '';
}

/** Carpeta de datos de la aplicación (espejo del plano, registros, sesión). */
function resolveDataDir() {
  for (const candidate of [argumentValue('datos'), String(process.env.NORMA_DATA_PATH || '')]) {
    const value = candidate.trim();
    if (value && path.isAbsolute(value)) return value;
  }
  return path.join(app.getPath('userData'), 'datos');
}

const dataDir = CHECK ? path.resolve(argumentValue('datos') || path.join(app.getPath('temp'), 'normia-estudio-verificacion')) : resolveDataDir();
let server = null;
let mainWindow = null;
let phpReport = null;
/** Estado que informa la página: ruta abierta y si hay cambios sin guardar. */
let rendererState = { path: '', name: '', dirty: false };
let forceClose = false;

/* --------------------------------- utilidades -------------------------------- */

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    const directory = path.join(dataDir, 'storage', 'logs');
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'estudio.log'), line);
  } catch { /* si no se puede registrar, la aplicación sigue funcionando */ }
  if (!app.isPackaged) process.stdout.write(line);
}

/** Nombre libre en una carpeta: «plano (2).json» en vez de sobrescribir. */
function availablePath(directory, filename) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension) || 'archivo';
  let candidate = path.join(directory, `${stem}${extension}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    counter += 1;
    candidate = path.join(directory, `${stem} (${counter})${extension}`);
  }
  return candidate;
}

/* ------------------------------ archivo de plano ----------------------------- */

/**
 * Envuelve el plano en el sobre oficial (`normia-plan`). Así el archivo
 * guardado aquí se puede importar tal cual en un proyecto de la edición
 * completa, sin conversiones ni campos inventados.
 */
function envelope(design, name) {
  return {
    application: 'normia-planos-cad',
    format: 'normia-plan',
    schema_version: 3,
    exported_at: new Date().toISOString(),
    project: { name: name || 'Plano sin título', site: '', workplace: '', responsible: '', notes: '' },
    floor: { name: name || 'Plano sin título', level: '' },
    design,
    attribution: `Normia Estudio ${app.getVersion()}. Pictogramas ISO 7010 (MIT © Karl Norling).`,
  };
}

/** Lee un plano: sobre oficial, diseño suelto o archivo exportado antiguo. */
function parsePlan(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('El archivo no contiene un JSON válido.');
  }
  if (!payload || typeof payload !== 'object') throw new Error('El archivo no tiene la estructura de un plano.');
  if (payload.design && typeof payload.design === 'object') {
    const name = String(payload.project?.name || payload.floor?.name || payload.name || '').trim();
    return { design: payload.design, name };
  }
  if (payload.canvas && typeof payload.canvas === 'object') {
    return { design: payload, name: '' };
  }
  throw new Error('El archivo no contiene un plano de Normia.');
}

function readPlan(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parsePlan(text);
  return {
    ok: true,
    path: filePath,
    name: parsed.name || path.basename(filePath, path.extname(filePath)),
    design: parsed.design,
  };
}

function writePlan(filePath, design, name) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(envelope(design, name), null, 2)}\n`, 'utf8');
  return { ok: true, path: filePath, name: path.basename(filePath) };
}

/* --------------------------------- recientes -------------------------------- */

function recentFile() {
  return path.join(app.getPath('userData'), 'recientes.json');
}

/**
 * Últimos diez planos abiertos. Un archivo borrado o movido desaparece de la
 * lista en vez de quedarse como una entrada que ya no abre nada.
 */
function readRecent() {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const alive = list
    .filter((item) => item && typeof item.path === 'string' && fs.existsSync(item.path))
    .slice(0, 10);
  if (alive.length !== list.length) {
    try {
      fs.writeFileSync(recentFile(), `${JSON.stringify(alive, null, 2)}\n`, 'utf8');
    } catch { /* si no se puede limpiar la lista, se muestra igual la que sirve */ }
  }
  return alive;
}

function rememberRecent(filePath, name) {
  const list = readRecent().filter((item) => item.path !== filePath);
  list.unshift({ path: filePath, name: name || path.basename(filePath), at: new Date().toISOString() });
  try {
    fs.mkdirSync(path.dirname(recentFile()), { recursive: true });
    fs.writeFileSync(recentFile(), `${JSON.stringify(list.slice(0, 10), null, 2)}\n`, 'utf8');
  } catch (error) {
    log(`No se pudo recordar el archivo reciente: ${error?.message || error}`);
  }
  if (mainWindow) Menu.setApplicationMenu(buildMenu(mainWindow));
}

/* ------------------------------ diálogos y IPC ------------------------------ */

async function openPlan(filePath = '') {
  let target = filePath;
  if (!target) {
    const chosen = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir un plano',
      buttonLabel: 'Abrir',
      properties: ['openFile'],
      filters: PLAN_FILTERS,
    });
    if (chosen.canceled || !chosen.filePaths[0]) return { cancelled: true };
    target = chosen.filePaths[0];
  }
  try {
    const result = readPlan(target);
    rememberRecent(result.path, result.name);
    return result;
  } catch (error) {
    return { ok: false, message: `No se pudo abrir el archivo: ${error.message}` };
  }
}

async function savePlanAs(payload = {}) {
  const suggested = payload.name ? `${String(payload.name).replace(/[\\/:*?"<>|]/g, '-')}.json` : 'plano.json';
  const chosen = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar el plano',
    buttonLabel: 'Guardar',
    defaultPath: path.join(app.getPath('documents'), suggested),
    filters: PLAN_FILTERS,
  });
  if (chosen.canceled || !chosen.filePath) return { cancelled: true };
  try {
    const result = writePlan(chosen.filePath, payload.design, payload.name);
    rememberRecent(result.path, payload.name);
    return result;
  } catch (error) {
    return { ok: false, message: `No se pudo guardar: ${error.message}` };
  }
}

async function savePlan(payload = {}) {
  if (!payload.path) return savePlanAs(payload);
  try {
    const result = writePlan(payload.path, payload.design, payload.name);
    rememberRecent(result.path, payload.name);
    return result;
  } catch (error) {
    return { ok: false, message: `No se pudo guardar: ${error.message}` };
  }
}

ipcMain.handle('estudio:abrir', async (_event, payload = {}) => openPlan(String(payload.path || '')));

/**
 * Un plano soltado sobre la ventana. Antes de reemplazar lo que hay en el
 * lienzo se pregunta si había cambios sin guardar: soltar un archivo no puede
 * ser la forma de perder media hora de dibujo.
 */
ipcMain.on('estudio:soltar', async (_event, payload = {}) => {
  const file = String(payload.path || '');
  if (!file || !fs.existsSync(file)) {
    return; // Un arrastre que no deja ruta (por ejemplo desde el navegador) se ignora.
  }
  if (rendererState.dirty) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Hay cambios sin guardar',
      message: 'Abrir otro plano descarta los cambios de este.',
      detail: 'Guarda primero si quieres conservarlos.',
      buttons: ['Abrir de todas formas', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice.response !== 0) return;
  }
  openRecent(file);
});
ipcMain.handle('estudio:guardar', async (_event, payload = {}) => savePlan(payload));
ipcMain.handle('estudio:guardar-como', async (_event, payload = {}) => savePlanAs(payload));

ipcMain.handle('estudio:titulo', (_event, payload = {}) => {
  rendererState = {
    path: String(payload.path || rendererState.path || ''),
    name: String(payload.name || rendererState.name || ''),
    dirty: Boolean(payload.dirty),
  };
  if (mainWindow) {
    mainWindow.setTitle(`${rendererState.name || 'Plano sin título'}${rendererState.dirty ? ' •' : ''} — ${APP_NAME}`);
    // macOS: el nombre del documento acompaña al icono de la ventana.
    mainWindow.setDocumentEdited(Boolean(rendererState.dirty) && process.platform === 'darwin');
    mainWindow.setRepresentedFilename(rendererState.path || '');
  }
  return { ok: true };
});

ipcMain.on('estudio:estado', (_event, payload = {}) => {
  rendererState = {
    path: String(payload.path ?? rendererState.path),
    name: rendererState.name,
    dirty: Boolean(payload.dirty),
  };
});

/* --------------------------------- imprimir --------------------------------- */

ipcMain.handle('normia:imprimir', (event) => new Promise((resolve) => {
  event.sender.print({ silent: false, printBackground: true, pageSize: 'A4' }, (ok, reason) => resolve({ ok, reason }));
}));

/* -------------------------------- descargas --------------------------------- */

function watchDownloads() {
  session.defaultSession.on('will-download', (_event, item, webContents) => {
    const target = availablePath(app.getPath('downloads'), item.getFilename());
    item.setSavePath(target);
    item.once('done', async (_doneEvent, state) => {
      if (state !== 'completed') {
        log(`Descarga interrumpida (${state}): ${item.getFilename()}`);
        return;
      }
      const window = BrowserWindow.fromWebContents(webContents) || mainWindow;
      const result = await dialog.showMessageBox(window, {
        type: 'info',
        title: 'Archivo guardado',
        message: item.getFilename(),
        detail: target,
        buttons: ['Aceptar', 'Mostrar en la carpeta'],
        defaultId: 1,
      });
      if (result.response === 1) shell.showItemInFolder(target);
    });
  });
}

/* ---------------------------------- menú ------------------------------------ */

function sendCommand(command) {
  if (mainWindow) mainWindow.webContents.send('estudio:comando', command);
}

function buildMenu(window) {
  const darwin = process.platform === 'darwin';
  const recent = readRecent();
  return Menu.buildFromTemplate([
    ...(darwin ? [{
      label: APP_NAME,
      submenu: [
        { label: `Acerca de ${APP_NAME}`, click: () => showAbout(window) },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar' },
        { role: 'hideOthers', label: 'Ocultar las demás' },
        { role: 'unhide', label: 'Mostrar todas' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir de Normia Estudio' },
      ],
    }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Plano nuevo', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('nuevo') },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('abrir') },
        {
          label: 'Abrir reciente',
          enabled: recent.length > 0,
          submenu: recent.length
            ? recent.map((item) => ({ label: `${item.name} — ${item.path}`, click: () => openRecent(item.path) }))
            : [{ label: 'Todavía no hay archivos', enabled: false }],
        },
        { type: 'separator' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('guardar') },
        { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('guardar-como') },
        { type: 'separator' },
        { label: 'Abrir la carpeta de datos', click: () => { fs.mkdirSync(dataDir, { recursive: true }); shell.openPath(dataDir); } },
        { type: 'separator' },
        darwin ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }]),
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        ...(darwin ? [{ role: 'zoom', label: 'Zoom' }, { role: 'front', label: 'Traer al frente' }] : []),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Cómo se usa el editor', click: () => sendCommand('ayuda') },
        { label: 'Acerca de esta edición', click: () => showAbout(window) },
        { type: 'separator' },
        { label: `Versión ${app.getVersion()}`, enabled: false },
      ],
    },
  ]);
}

async function openRecent(filePath) {
  if (!mainWindow) return;
  const result = await openPlan(filePath);
  if (result.cancelled) return;
  if (result.ok === false) {
    dialog.showErrorBox('No se pudo abrir el plano', result.message || '');
    return;
  }
  // La página carga el plano por su propio puente: así pasa por el modelo,
  // el historial y el ajuste a pantalla de siempre.
  await mainWindow.webContents.executeJavaScript(
    `window.NormiaEstudioUI?.cargar(${JSON.stringify({ path: result.path, name: result.name, design: result.design })})`
  );
}

async function showAbout(window) {
  await dialog.showMessageBox(window, {
    type: 'info',
    title: `Acerca de ${APP_NAME}`,
    message: `${APP_NAME} ${app.getVersion()}`,
    detail: [
      'El editor de Normia Planos CAD, suelto: sin cuentas, sin proyectos y sin base de datos.',
      `PHP ${phpReport?.version || '—'} compilado a WebAssembly, dentro de la aplicación.`,
      `Datos de la aplicación: ${dataDir}`,
      '',
      'Los planos son esquemas de apoyo: no sustituyen la verificación de un profesional ni la normativa vigente.',
      'Esta edición no tiene certificado de firma comercial: macOS puede mostrar el aviso de Gatekeeper y Windows el de SmartScreen.',
    ].join('\n'),
    buttons: ['Aceptar'],
  });
}

/* --------------------------------- ventana ---------------------------------- */

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    title: `${APP_NAME}`,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1220' : '#f4f6fb',
    icon: process.platform === 'darwin' ? undefined : iconPath,
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const origin = new URL(server.url).origin;
  window.webContents.on('will-navigate', (event, url) => {
    let target = null;
    try { target = new URL(url).origin; } catch { target = null; }
    if (target !== origin) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log(`La ventana se cerró de forma inesperada: ${details.reason}`);
    dialog.showErrorBox('La aplicación se cerró de forma inesperada', 'Vuelve a abrirla. El plano guardado sigue en su archivo.');
  });

  // Cerrar con cambios sin guardar pregunta antes de perderlos.
  window.on('close', async (event) => {
    if (forceClose || !rendererState.dirty) return;
    event.preventDefault();
    const choice = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Hay cambios sin guardar',
      message: 'El plano tiene cambios que todavía no están en el archivo.',
      detail: 'Puedes guardarlos antes de cerrar o salir descartándolos.',
      buttons: ['Guardar y cerrar', 'Salir sin guardar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice.response === 0) {
      const saved = await window.webContents.executeJavaScript('window.NormiaEstudioUI?.guardar?.()');
      if (saved === false) return;
      forceClose = true;
      window.close();
    } else if (choice.response === 1) {
      forceClose = true;
      window.close();
    }
  });

  window.loadURL(`${server.url}index.php?r=estudio`);
  window.on('closed', () => { mainWindow = null; });
  if (SHOW_DEVTOOLS) window.webContents.openDevTools({ mode: 'detach' });
  return window;
}

/* --------------------------------- arranque --------------------------------- */

async function boot() {
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    server = await startServer({ appDir, dataDir, runtimeDir, log });
  } catch (error) {
    log(`No se pudo iniciar el servidor: ${error?.message || error}`);
    dialog.showErrorBox('No se pudo iniciar Normia Estudio', `El servidor local no arrancó.\n\n${error?.message || error}`);
    app.exit(1);
    return;
  }

  server.waitUntilReady().then((state) => {
    phpReport = state.environment;
    log(`PHP ${state.environment.version} en ${server.url} · datos en ${dataDir}`);
    const file = initialFile();
    if (file && mainWindow) openRecent(file);
  }).catch((error) => {
    log(`PHP no inició: ${error?.message || error}`);
    dialog.showErrorBox('No se pudo iniciar PHP', String(error?.message || error));
  });

  watchDownloads();
  mainWindow = createWindow();
  Menu.setApplicationMenu(buildMenu(mainWindow));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    // Abrir un archivo desde el sistema con la aplicación ya abierta.
    const file = argv.slice(1).find((argument) => !argument.startsWith('-') && /\.json$/i.test(argument));
    if (file && fs.existsSync(file)) openRecent(path.resolve(file));
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow && fs.existsSync(filePath)) openRecent(filePath);
  });

  app.whenReady().then(async () => {
    if (CHECK) {
      const code = await checkEnvironment({ appDir, dataDir, runtimeDir, out: (line) => console.log(line) })
        .catch((error) => { console.error(error?.message || error); return 1; });
      app.exit(code);
      return;
    }
    await boot();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { server?.close().catch(() => {}); });
}
