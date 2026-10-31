/*
 * Normia Planos CAD · edición Electron.
 *
 * Una sola ventana con la aplicación real (PHP + SQLite) servida desde este
 * mismo proceso: no hay servidor que instalar ni intérprete que compilar para
 * cada sistema, y los datos quedan en una carpeta normal del usuario.
 *
 * Uso:
 *   normia --check         informa el intérprete y las extensiones y termina.
 *   normia                 abre la ventana.
 *   normia --datos=<ruta>  usa otra carpeta de datos (también NORMA_DATA_PATH).
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEnvironment, startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = 'Normia Planos CAD';
const CHECK = process.argv.includes('--check');
const SHOW_DEVTOOLS = process.argv.includes('--devtools');

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('co.normia.cad');

/** Carpeta del código de la aplicación. */
const appDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.resolve(HERE, '../..');
/** Dependencias de PHP compilado (fuera del asar en la versión instalada). */
const runtimeDir = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : '';
const iconPath = path.join(appDir, 'assets', 'img', 'apple-touch-icon.png');

/** Valor de un argumento `--nombre=valor`. */
function argumentValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

/** Carpeta de datos: `--datos`, `NORMA_DATA_PATH` o la carpeta del usuario. */
function resolveDataDir() {
  for (const candidate of [argumentValue('datos'), String(process.env.NORMA_DATA_PATH || '')]) {
    const value = candidate.trim();
    if (value && path.isAbsolute(value)) return value;
  }
  return path.join(app.getPath('userData'), 'datos');
}

const dataDir = CHECK ? path.resolve(argumentValue('datos') || path.join(app.getPath('temp'), 'normia-verificacion')) : resolveDataDir();
let server = null;
let mainWindow = null;
let phpReport = null;

/* --------------------------------- utilidades -------------------------------- */

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    const directory = path.join(dataDir, 'storage', 'logs');
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'electron.log'), line);
  } catch { /* si no se puede registrar, la aplicación sigue funcionando */ }
  if (!app.isPackaged) process.stdout.write(line);
}

/** Nombre libre en una carpeta: «plano (2).svg» en vez de sobrescribir. */
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

async function saveDataCopy(window) {
  const chosen = await dialog.showOpenDialog(window, {
    title: 'Elige dónde guardar la copia',
    buttonLabel: 'Guardar aquí',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (chosen.canceled || !chosen.filePaths[0]) return;
  const stamp = new Date().toISOString().slice(0, 10);
  let destination = path.join(chosen.filePaths[0], `normia-datos-${stamp}`);
  let counter = 1;
  while (fs.existsSync(destination)) {
    counter += 1;
    destination = path.join(chosen.filePaths[0], `normia-datos-${stamp}-${counter}`);
  }
  try {
    fs.cpSync(dataDir, destination, { recursive: true });
    const result = await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Copia guardada',
      message: 'La copia de los datos quedó guardada.',
      detail: destination,
      buttons: ['Aceptar', 'Mostrar la carpeta'],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) shell.openPath(path.dirname(destination));
  } catch (error) {
    log(`No se pudo copiar la carpeta de datos: ${error?.message || error}`);
    dialog.showErrorBox('No se pudo guardar la copia', String(error?.message || error));
  }
}

async function showAbout(window) {
  await dialog.showMessageBox(window, {
    type: 'info',
    title: `Acerca de ${APP_NAME}`,
    message: `${APP_NAME} ${app.getVersion()}`,
    detail: [
      `PHP ${phpReport?.version || '—'} compilado a WebAssembly, dentro de la aplicación.`,
      `Datos: ${dataDir}`,
      '',
      'Los planos son esquemas de apoyo: no sustituyen la verificación de un profesional ni la normativa vigente.',
      'Esta edición no tiene certificado de firma comercial: Windows puede mostrar el aviso de SmartScreen y macOS el de Gatekeeper.',
    ].join('\n'),
    buttons: ['Aceptar'],
  });
}

/* ----------------------------------- menú ----------------------------------- */

function buildMenu(window) {
  const darwin = process.platform === 'darwin';
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
        { role: 'quit', label: 'Salir de Normia' },
      ],
    }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir la carpeta de datos', click: () => { fs.mkdirSync(dataDir, { recursive: true }); shell.openPath(dataDir); } },
        { label: 'Guardar una copia de los datos…', click: () => saveDataCopy(window) },
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
        { label: 'Acerca de esta edición', click: () => showAbout(window) },
        { type: 'separator' },
        { label: `Versión ${app.getVersion()}`, enabled: false },
      ],
    },
  ]);
}

/* -------------------------------- impresión --------------------------------- */

ipcMain.handle('normia:imprimir', (event) => new Promise((resolve) => {
  event.sender.print({ silent: false, printBackground: true, pageSize: 'A4' }, (ok, reason) => resolve({ ok, reason }));
}));

ipcMain.handle('normia:datos', () => dataDir);

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

/* -------------------------------- ventana ----------------------------------- */

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
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

  // La ventana solo navega dentro de su propio servidor; los enlaces externos
  // se abren en el navegador del sistema.
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
    dialog.showErrorBox('La aplicación se cerró de forma inesperada', 'Vuelve a abrirla. Tus datos siguen guardados.');
  });

  window.loadURL(server.url);
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
    dialog.showErrorBox('No se pudo iniciar Normia', `El servidor local no arrancó.\n\n${error?.message || error}`);
    app.exit(1);
    return;
  }

  server.waitUntilReady().then((state) => {
    phpReport = state.environment;
    log(`PHP ${state.environment.version} en ${server.url} · datos en ${dataDir}`);
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
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
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
