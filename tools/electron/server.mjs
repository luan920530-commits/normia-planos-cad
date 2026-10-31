/*
 * Servidor local de la edición Electron.
 *
 * La aplicación es PHP. En lugar de compilar un intérprete nativo para cada
 * sistema (lo que obliga a mantener dos arquitecturas de macOS y una cadena de
 * herramientas de Windows), aquí PHP corre compilado a WebAssembly dentro del
 * propio proceso principal de Electron. El resultado es un único paquete por
 * plataforma, sin dependencias externas ni instalador de PHP.
 *
 * El servidor HTTP se enlaza **solo a 127.0.0.1** y entrega la aplicación con
 * las mismas cabeceras que un servidor web normal: las cookies viajan en las
 * cabeceras (no se guardan en memoria), de modo que la sesión sobrevive al
 * cierre de la ventana y la base SQLite vive en una carpeta real del usuario.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Versión de PHP compilada a WebAssembly que viaja en el paquete. */
export const PHP_VERSION = '8.3';

/** Extensiones que la aplicación necesita de verdad. */
export const REQUIRED_EXTENSIONS = ['pdo_sqlite', 'sqlite3', 'mbstring', 'openssl', 'fileinfo', 'session'];

/** Carpetas de datos que la aplicación espera encontrar. */
export function ensureDataDir(dataDir) {
  for (const directory of ['config', 'storage', 'storage/sessions', 'storage/logs', 'storage/cache']) {
    fs.mkdirSync(path.join(dataDir, directory), { recursive: true });
  }
  return dataDir;
}

/**
 * Carga php-wasm. En desarrollo sale de `node_modules`; en el paquete viaja en
 * `resources/runtime/node_modules`, fuera del archivo asar, porque el
 * intérprete lee su `.wasm` del disco.
 */
async function loadPhpWasm(runtimeDir) {
  // En el paquete las dependencias viajan fuera del archivo asar, en
  // `runtime/node_modules`, con un pequeño módulo que las vuelve a exportar:
  // así Node resuelve los paquetes desde esa carpeta y no desde la del programa.
  const node = runtimeDir ? await import(pathToFileURL(path.join(runtimeDir, 'php-wasm.mjs')).href) : await import('@php-wasm/node');
  const universal = runtimeDir ? node : await import('@php-wasm/universal');
  return { loadNodeRuntime: node.loadNodeRuntime, useHostFilesystem: node.useHostFilesystem, PHP: universal.PHP, PHPRequestHandler: universal.PHPRequestHandler };
}

/** Arranca PHP y devuelve también la versión y las extensiones cargadas. */
export async function startPhp({ appDir, dataDir, runtimeDir = '', phpVersion = PHP_VERSION }) {
  ensureDataDir(dataDir);
  // Paths::fromEnvironment() lee esta variable en la primera petición. Solo se
  // acepta una ruta absoluta, igual que en el lanzador nativo.
  process.env.NORMA_DATA_PATH = path.resolve(dataDir);

  const { loadNodeRuntime, useHostFilesystem, PHP, PHPRequestHandler } = await loadPhpWasm(runtimeDir || null);
  // php-wasm identifica cada intérprete con un número propio (lo usa para sus
  // bloqueos de archivos). Sin él se niega a iniciar fuera de las pruebas.
  // El entorno del intérprete se fija aquí: Emscripten no hereda `process.env`,
  // así que la carpeta de datos se pasa explícitamente.
  const php = new PHP(await loadNodeRuntime(phpVersion, {
    emscriptenOptions: {
      processId: process.pid % 100000,
      ENV: { NORMA_DATA_PATH: path.resolve(dataDir) },
    },
  }));
  useHostFilesystem(php);

  const report = await php.run({
    code: `<?php echo json_encode([
      'version' => PHP_VERSION,
      'extensions' => array_fill_keys(${JSON.stringify(REQUIRED_EXTENSIONS)}, true),
      'loaded' => array_values(array_filter(${JSON.stringify(REQUIRED_EXTENSIONS)}, 'extension_loaded')),
      'data' => getenv('NORMA_DATA_PATH') ?: '',
    ]);`,
  });
  let environment = { version: '', loaded: [], data: '' };
  try {
    const text = (report.text || '').trim();
    environment = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    environment = { version: '', loaded: [], data: '' };
  }
  const missing = REQUIRED_EXTENSIONS.filter((extension) => !environment.loaded.includes(extension));

  const handler = new PHPRequestHandler({
    php,
    documentRoot: appDir,
    absoluteUrl: 'http://127.0.0.1',
    // Las cookies las administra el navegador de Electron, no php-wasm: así la
    // sesión sigue viva después de cerrar y abrir la aplicación.
    cookieStore: false,
  });

  return { php, handler, environment, missing };
}

/** Cabeceras que no deben repetirse en la respuesta. */
const HOP_BY_HOP = new Set(['transfer-encoding', 'connection', 'keep-alive', 'content-length']);

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined));
    request.on('error', () => resolve(undefined));
  });
}

/**
 * Arranca el servidor. El socket se enlaza **antes** de cargar PHP para que el
 * mensaje «Preparando» se pueda mostrar mientras el intérprete arranca.
 */
export async function startServer(options) {
  const { appDir, dataDir, port = 0, host = '127.0.0.1', runtimeDir = '', log = console.log } = options;
  if (!appDir || !dataDir) throw new Error('Faltan appDir y dataDir.');

  let phpState = null;
  let failure = null;
  let boundPort = port;

  const server = http.createServer(async (request, response) => {
    if (!phpState) {
      response.writeHead(failure ? 500 : 503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '2' });
      response.end(failure
        ? '<!doctype html><html lang="es"><meta charset="utf-8"><title>Normia</title><body style="font-family:system-ui;padding:2rem"><h1>No se pudo iniciar PHP</h1><p>Revisa el registro de la aplicación.</p></body></html>'
        : '<!doctype html><html lang="es"><meta charset="utf-8"><title>Normia Planos CAD</title><meta http-equiv="refresh" content="1"><body style="font-family:system-ui;padding:2rem;color:#1e293b"><h1 style="font-size:1.05rem">Preparando Normia Planos CAD…</h1><p>El motor PHP se está iniciando.</p></body></html>');
      return;
    }
    try {
      const headers = {};
      for (const [name, value] of Object.entries(request.headers)) {
        const key = name.toLowerCase();
        if (key === 'host' || key === 'connection' || key === 'content-length' || HOP_BY_HOP.has(key)) continue;
        headers[key] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
      }
      headers.host = host === '127.0.0.1' ? `127.0.0.1:${boundPort}` : `${host}:${boundPort}`;
      const body = await readBody(request);
      const result = await phpState.handler.request({
        method: request.method || 'GET',
        url: request.url || '/',
        headers,
        body,
      });
      const outgoing = {};
      for (const [name, value] of Object.entries(result.headers || {})) {
        const key = name.toLowerCase();
        if (HOP_BY_HOP.has(key)) continue;
        outgoing[key] = value;
      }
      response.writeHead(result.httpStatusCode || 200, outgoing);
      response.end(Buffer.from(result.bytes || new Uint8Array()));
    } catch (error) {
      log(`Error al atender ${request.method} ${request.url}: ${error?.message || error}`);
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('La aplicación encontró un error. Revisa el registro de Normia.');
    }
  });

  server.keepAliveTimeout = 60000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
  boundPort = server.address().port;

  startPhp({ appDir, dataDir, runtimeDir })
    .then((state) => { phpState = state; })
    .catch((error) => { failure = error; log(`No se pudo iniciar PHP: ${error?.message || error}`); });

  return {
    server,
    get port() { return boundPort; },
    get url() { return `http://${host}:${boundPort}/`; },
    get ready() { return Boolean(phpState); },
    get environment() { return phpState?.environment || null; },
    async waitUntilReady(timeoutMs = 30000) {
      const started = Date.now();
      while (!phpState) {
        if (failure) throw failure;
        if (Date.now() - started > timeoutMs) throw new Error('PHP no terminó de iniciar.');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return phpState;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      try { phpState?.php?.exit?.(); } catch { /* el proceso ya terminó */ }
    },
  };
}

/**
 * Modo `--check`: informa el intérprete que viaja en el paquete y sus
 * extensiones sin abrir ventana. Lo usan los flujos de trabajo y el usuario.
 */
export async function checkEnvironment({ appDir, dataDir, runtimeDir = '', out = console.log }) {
  const state = await startPhp({ appDir, dataDir, runtimeDir });
  out(`PHP ${state.environment.version} (WebAssembly)`);
  out(`Carpeta de la aplicación: ${appDir}`);
  out(`Carpeta de datos: ${state.environment.data || dataDir}`);
  for (const extension of REQUIRED_EXTENSIONS) {
    const loaded = state.environment.loaded.includes(extension);
    out(`  ${loaded ? '✓' : '✗'} ${extension}`);
  }
  try { state.php.exit(); } catch { /* nada que cerrar */ }
  if (state.missing.length) {
    out(`Faltan extensiones: ${state.missing.join(', ')}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = {};
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (match) args[match[1]] = match[2];
  }
  const appDir = path.resolve(args.app || process.cwd());
  const dataDir = path.resolve(args.data || path.join(process.cwd(), 'datos'));
  if (process.argv.includes('--check')) {
    checkEnvironment({ appDir, dataDir, runtimeDir: args.runtime ? path.resolve(args.runtime) : '' })
      .then((code) => process.exit(code))
      .catch((error) => { console.error(error?.message || error); process.exit(1); });
  } else {
    const started = await startServer({ appDir, dataDir, port: Number(args.port || 8793), runtimeDir: args.runtime ? path.resolve(args.runtime) : '' });
    await started.waitUntilReady();
    console.log(`Normia Planos CAD en ${started.url}`);
    console.log(`Datos en ${dataDir}`);
  }
}
