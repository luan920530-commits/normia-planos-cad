/*
 * Servidor de vista previa SOLO para desarrollo.
 *
 * Levanta la aplicación real (PHP compilado a WebAssembly) sobre HTTP para
 * revisar el editor en un navegador real sin instalar PHP en el equipo.
 * No forma parte de los paquetes: `tools/` se excluye de los ZIP.
 *
 * Uso:
 *   node tools/preview-server.mjs            # puerto 8080, PHP 8.3
 *   PORT=9000 node tools/preview-server.mjs  # otro puerto
 *
 * Instala automáticamente la demo en una copia temporal del repositorio y
 * deja una sesión iniciada, para entrar directo al editor.
 */
import http from 'node:http';
import { startRuntime, cloneProject } from '../tests/php/harness.mjs';

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PHP_VERSION || '8.3';
const EMAIL = process.env.NORMIA_EMAIL || 'admin@normia.local';
const PASSWORD = process.env.NORMIA_PASSWORD || 'ClaveSegura2026';

const runtime = await startRuntime(cloneProject(), VERSION, { cleanup: true });

async function ensureInstalled() {
  const home = await runtime.client.get('/');
  const location = decodeURIComponent(home.location || '');
  if (home.status !== 200 && !location.includes('install')) return true;
  if (!location.includes('install') && home.status !== 302 && home.status !== 303) return true;
  console.log('Instalando la aplicación con el proyecto de demostración…');
  const installed = await runtime.install({ demo: true, email: EMAIL, password: PASSWORD });
  const ok = installed.result.status === 302 || installed.result.status === 303;
  if (!ok) console.log('El instalador respondió', installed.result.status, installed.result.text.slice(0, 500));
  return ok;
}

function toHeaders(raw = {}) {
  const headers = {};
  for (const [name, value] of Object.entries(raw)) {
    const key = name.toLowerCase();
    if (key === 'set-cookie' || key === 'transfer-encoding' || key === 'connection' || key === 'content-length') continue;
    // La vista previa se muestra dentro del visor del entorno de desarrollo.
    // La aplicación real mantiene estas cabeceras; aquí solo se permite el marco
    // del proxy para poder revisarla sin descargar nada.
    if (key === 'x-frame-options') continue;
    if (key === 'content-security-policy') {
      headers[key] = String(value).replace(/frame-ancestors[^;]*;?/i, '');
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined));
    request.on('error', () => resolve(undefined));
  });
}

await ensureInstalled();
await runtime.login(EMAIL, PASSWORD);
console.log(`Sesión iniciada como ${EMAIL}`);

const server = http.createServer(async (request, response) => {
  try {
    const body = await readBody(request);
    const headers = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (name === 'host' || name === 'connection' || name === 'content-length') continue;
      headers[name] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    }
    headers.host = 'localhost';
    if (runtime.client.cookie) headers.cookie = runtime.client.cookie;

    const result = await runtime.handler.request({
      method: request.method || 'GET',
      url: request.url || '/',
      headers,
      body,
    });

    response.writeHead(result.httpStatusCode, toHeaders(result.headers));
    response.end(Buffer.from(result.bytes));
  } catch (error) {
    console.error('Error en la vista previa:', error?.message || error);
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('La vista previa encontró un error. Revisa la consola del servidor.');
  }
});

server.keepAliveTimeout = 60000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Normia Planos CAD · vista previa PHP ${VERSION} en http://0.0.0.0:${PORT}`);
  console.log(`Cuenta: ${EMAIL} · contraseña: ${PASSWORD}`);
  console.log('Solo para revisión local: los datos viven en una copia temporal.');
});
