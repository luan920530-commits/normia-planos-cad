/*
 * Pantalla del APK: arranca el intérprete de PHP compilado a WebAssembly y
 * muestra el editor dentro de un marco propio.
 *
 * No hay servidor: cada enlace, formulario o `fetch` del editor se atiende en el
 * propio teléfono con `NormiaApp` (app-core.js), y la respuesta se escribe en un
 * marco del mismo origen. Así funcionan las páginas PHP, las sesiones y el
 * guardado sin conexión, y el contenedor nativo no necesita red.
 *
 * Las descargas se guardan con `NormiaHost.saveFile` y la impresión usa el
 * servicio de impresión de Android (`NormiaHost.printHtml`).
 */
import { NormiaApp } from './app-core.js';
import { openOpfsStorage } from './opfs.js';

const ORIGIN = 'https://appassets.androidplatform.net';
const HOST = window.NormiaHost || {
  log: () => {},
  saveFile: () => false,
  printHtml: () => {},
  close: () => {},
  version: () => 'web',
};

const splash = document.getElementById('splash');
const stepsList = document.getElementById('steps');
const frame = document.getElementById('app-frame');
const diagnostics = document.getElementById('diagnostics');
const banner = document.getElementById('banner');
const retryButton = document.getElementById('retry');

const steps = [];
let app = null;
let history = [];
let currentUrl = '';
let pendingSize = 0;

function step(label, detail = '') {
  steps.push({ label, detail, at: Date.now() });
  const item = document.createElement('li');
  item.innerHTML = `<span></span>`;
  item.firstChild.textContent = label;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    item.appendChild(small);
  }
  stepsList.appendChild(item);
  HOST.log(`[normia] ${label}${detail ? ' · ' + detail : ''}`);
}

function fail(error) {
  step('No se pudo abrir el editor', String(error && error.message ? error.message : error));
  const text = document.getElementById('diagnostics-text');
  if (text) {
    text.textContent = `${steps.map((item) => `· ${item.label}${item.detail ? ' — ' + item.detail : ''}`).join('\n')}\n\n${error && error.stack ? error.stack : error}`;
  }
  splash.classList.add('is-error');
  diagnostics.hidden = false;
  diagnostics.open = true;
  retryButton.hidden = false;
  HOST.log(`[normia] ERROR ${error && error.stack ? error.stack : error}`);
}

function showFrame() {
  splash.classList.add('is-hidden');
  frame.classList.add('is-visible');
}

/* ----------------------------- almacenamiento ----------------------------- */

/**
 * Guarda `config/` y `storage/` en el almacenamiento privado del navegador
 * (OPFS, ver `opfs.js`). Si el teléfono no lo ofrece —o falla al abrirlo— se
 * avisa en la franja superior y la aplicación sigue funcionando **sin**
 * guardar: perder los cambios es malo, no poder abrir el editor es peor.
 */
async function openStorage() {
  return openOpfsStorage({
    onUnavailable: (error) => {
      banner.hidden = false;
      banner.textContent = 'Este teléfono no permite guardar los datos de la aplicación. Los cambios se perderán al cerrar.';
      HOST.log(`[normia] almacenamiento no disponible: ${error && error.message ? error.message : error}`);
    },
  });
}

/* -------------------------------- arranque -------------------------------- */

async function boot() {
  step('Cargando el intérprete', `PHP 8.3 · WebAssembly`);
  const runtime = await import('./php/runtime.js');
  /*
   * El intérprete viene compilado de dos maneras y hay que cargar la que
   * corresponde al cargador que `loadWebRuntime` va a usar:
   *
   *   asyncify  → el motor «clásico», el que también usan las pruebas en Node.
   *   jspi      → suspensión nativa del navegador (Chrome moderno, Android 15).
   *
   * La decisión la toma `wasm-feature-detect`. Se consulta la **misma** función
   * que usa el cargador para no desalinearse: si se pide el binario de asyncify
   * con el cargador de JSPI, el arranque muere con «Import #0 "env"
   * "invoke_ii": function import requires a callable».
   */
  let modo = 'asyncify';
  try {
    if (typeof runtime.jspi === 'function' && await runtime.jspi()) modo = 'jspi';
  } catch (error) {
    HOST.log(`[normia] no se pudo comprobar JSPI: ${error}`);
  }

  // El archivo llega desde los activos del APK; no hay red de por medio.
  const cargar = async (cual) => {
    const respuesta = await fetch(new URL(`./php/php_8_3_${cual}.wasm`, import.meta.url).href);
    if (!respuesta.ok) throw new Error(`No se encontró el intérprete «${cual}» (código ${respuesta.status}).`);
    const wasmBinary = new Uint8Array(await respuesta.arrayBuffer());
    step('Intérprete descargado', `${Math.round(wasmBinary.length / 1048576)} MB · ${cual}`);
    const instancia = await runtime.loadWebRuntime('8.3', { emscriptenOptions: { wasmBinary } });
    return { php: new runtime.PHP(instancia), modo: cual };
  };

  // Si la detección de la pantalla y la del cargador no coincidieran —no debería,
  // es la misma función—, el error típico es `Import #0 "env" "invoke_ii":
  // function import requires a callable`. En vez de dejar al usuario en el
  // arranque, se prueba la otra compilación una sola vez.
  let cargado;
  try {
    cargado = await cargar(modo);
  } catch (error) {
    HOST.log(`[normia] el intérprete ${modo} no arrancó: ${error}`);
    const alternativa = modo === 'jspi' ? 'asyncify' : 'jspi';
    step('Reintentando con otro intérprete', alternativa);
    cargado = await cargar(alternativa);
  }
  const php = cargado.php;
  step('Intérprete iniciado', `modo ${cargado.modo}`);

  const info = await (await fetch('./php/app-files.json')).json();
  step('Aplicación empaquetada', `${Object.keys(info.files).length} archivos · versión ${info.version}`);

  const storage = await openStorage();
  app = new NormiaApp({
    php,
    files: info.files,
    storage,
    log: (label, detail) => HOST.log(`[normia] ${label} ${JSON.stringify(detail || {})}`),
    createHandler: (instance, documentRoot) => new runtime.PHPRequestHandler({
      php: instance,
      documentRoot,
      absoluteUrl: 'http://127.0.0.1',
    }),
  });
  const arranque = Date.now();
  await app.start();
  step('Datos del equipo listos', `${app.restored} recuperados · ${app.status().dataFiles} archivos · ${Date.now() - arranque} ms`);

  step('Listo', `Normia ${info.version}`);
  await navigate('/', { replace: true });
}

/* ------------------------------ peticiones ------------------------------- */

function headerObject(headers) {
  const output = {};
  for (const [name, value] of headers) output[String(name).toLowerCase()] = String(value);
  return output;
}

async function ask({ url, method = 'GET', headers = [], body = null }) {
  if (!app) throw new Error('El editor todavía no está listo');
  const result = await app.request({ url, method, body, headers });
  return {
    status: result.status,
    headers: result.headers,
    text: result.text,
    bytes: result.bytes,
    url: result.url,
  };
}

function isHtml(response) {
  const type = String(response.headers['content-type'] || (Array.isArray(response.headers['Content-Type']) ? response.headers['Content-Type'][0] : '') || '');
  return type.includes('text/html');
}

function header(response, name) {
  const value = response.headers[name] || response.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function fileName(response, fallback) {
  const disposition = String(header(response, 'content-disposition') || '');
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (match) return decodeURIComponent(match[1]);
  return fallback;
}

/** Guarda un archivo generado por el editor (SVG, JSON, PNG, CSV). */
function saveBytes(name, mime, bytes) {
  const base64 = bytesToBase64(bytes);
  const ok = HOST.saveFile(name, mime, base64);
  return ok;
}

function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

/* -------------------------------- pantalla ------------------------------- */

function baseUrlOf(url) {
  return new URL(url, ORIGIN).href;
}

/* Errores que reporta el editor dentro del marco (ver `guestBootstrap`). */
const frameProblems = [];

/**
 * Si el marco no dibuja nada en unos segundos, se muestra el diagnóstico en vez
 * de dejar una pantalla en blanco sin explicación.
 */
let paintTimer = null;
function watchFrame() {
  if (paintTimer !== null) clearTimeout(paintTimer);
  paintTimer = setTimeout(() => {
    paintTimer = null;
    try {
      const document = frame.contentDocument;
      const text = document && document.body ? document.body.textContent.replace(/\s+/g, ' ').trim() : '';
      if (text.length > 20) return;
      const detail = frameProblems.length ? ` Último error: ${frameProblems.slice(-2).join(' · ')}` : '';
      fail(new Error(`El editor no terminó de dibujarse en la pantalla.${detail}`));
    } catch (error) {
      HOST.log(`[normia] no se pudo revisar el marco: ${error}`);
    }
  }, 8000);
}

async function navigate(url, options = {}) {
  const target = baseUrlOf(url);
  splash.classList.remove('is-hidden');
  try {
    const response = await ask({ url: target });
    if (!isHtml(response)) {
      // Enlaces directos a exportaciones: se guardan como archivo.
      const type = String(header(response, 'content-type') || 'application/octet-stream');
      saveBytes(fileName(response, 'normia'), type, response.bytes);
      splash.classList.add('is-hidden');
      return;
    }
    render(response.text);
    if (!options.replace) history.push(url);
    currentUrl = url;
    window.__normiaUrl = url;
    showFrame();
    watchFrame();
  } catch (error) {
    fail(error);
  }
}

const guestBootstrap = function guestBootstrap() {
  const bridge = window.parent.__normiaBridge;
  const ORIGIN = 'https://appassets.androidplatform.net';
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  const toHeaders = (list) => list.map(([name, value]) => [name, value]);

  // Cualquier error de JavaScript del editor se ve en la pantalla de arranque en
  // vez de quedarse como una página a medio dibujar.
  const avisar = (texto) => {
    try {
      bridge.problem(String(texto || ''));
    } catch (error) { /* el padre pudo desaparecer */ }
  };
  window.addEventListener('error', (event) => {
    avisar(`${event.message || 'Error'} en ${event.filename || ''}:${event.lineno || 0}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason && event.reason.message ? event.reason.message : event.reason;
    avisar(`Promesa rechazada: ${reason}`);
  });

  async function send(url, method, headers, body) {
    return bridge.request({ url, method, headers: toHeaders(headers), body });
  }

  const toResponse = (result) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(result.headers || {})) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, String(item)));
      else headers.append(name, String(value));
    }
    return new Response(result.bytes ? result.bytes.slice().buffer : null, {
      status: result.status,
      headers,
    });
  };

  window.fetch = async function patchedFetch(input, init) {
    let request;
    try {
      request = new Request(input, init);
    } catch (error) {
      return nativeFetch ? nativeFetch(input, init) : Promise.reject(error);
    }
    if (!request.url.startsWith(ORIGIN)) {
      return nativeFetch ? nativeFetch(input, init) : Promise.reject(new TypeError('Sin conexión'));
    }
    const bytes = request.method === 'GET' || request.method === 'HEAD'
      ? null
      : new Uint8Array(await request.arrayBuffer());
    const result = await send(request.url, request.method, [...request.headers], bytes);
    return toResponse(result);
  };

  window.__normiaSave = async function (blob, name) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    bridge.save(name, blob.type || 'application/octet-stream', btoa(binary));
  };

  document.addEventListener('click', (event) => {
    const anchor = event.target && event.target.closest ? event.target.closest('a') : null;
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) return;
    if (href.startsWith('blob:')) {
      event.preventDefault();
      event.stopPropagation();
      fetch(href)
        .then((response) => response.blob())
        .then((blob) => window.__normiaSave(blob, anchor.getAttribute('download') || 'normia'))
        .catch(() => {});
      return;
    }
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const absolute = new URL(href, document.baseURI);
    event.preventDefault();
    event.stopPropagation();
    if (anchor.target === '_blank' || anchor.hasAttribute('data-print')) {
      bridge.open(absolute.href);
    } else {
      bridge.go(absolute.href);
    }
  }, true);

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    event.preventDefault();
    event.stopPropagation();
    const data = new FormData(form);
    const method = (form.getAttribute('method') || 'GET').toUpperCase();
    const action = new URL(form.getAttribute('action') || document.baseURI, document.baseURI);
    if (method === 'GET') {
      const query = new URLSearchParams();
      for (const [name, value] of data.entries()) if (typeof value === 'string') query.append(name, value);
      for (const [name, value] of new URLSearchParams(action.search)) query.append(name, value);
      action.search = query.toString();
      bridge.go(action.href);
      return;
    }
    let body;
    let headers = [];
    if ([...data.values()].some((value) => typeof value !== 'string')) {
      const encoded = new Response(data);
      headers = [['content-type', encoded.headers.get('content-type') || 'multipart/form-data']];
      body = new Uint8Array(await encoded.arrayBuffer());
    } else {
      const query = new URLSearchParams();
      for (const [name, value] of data.entries()) query.append(name, String(value));
      headers = [['content-type', 'application/x-www-form-urlencoded']];
      body = new TextEncoder().encode(query.toString());
    }
    try {
      const result = await bridge.submit(action.href, headers, body);
      if (result.html) bridge.renderHtml(result.html);
      else if (result.download) bridge.save(result.download.name, result.download.mime, result.download.base64);
    } catch (error) {
      bridge.log(String(error));
    }
  }, true);

  window.open = function patchedOpen(url) {
    bridge.open(new URL(String(url), document.baseURI).href);
    return null;
  };
};

function render(html) {
  // El documento del marco lleva una <base> y el puente antes que cualquier
  // script de la aplicación, para que ningún `fetch` se escape.
  const script = `<script>(${guestBootstrap.toString()})();</script>`;
  const base = `<base href="${ORIGIN}/">`;
  let content = String(html);
  if (/<head[^>]*>/i.test(content)) {
    content = content.replace(/<head([^>]*)>/i, `<head$1>${base}${script}`);
  } else {
    content = `<!doctype html><html lang="es"><head>${base}${script}</head><body>${content}</body></html>`;
  }
  const document = frame.contentDocument;
  document.open();
  document.write(content);
  document.close();
}

/* --------------------------- puente con el marco -------------------------- */

window.__normiaBridge = {
  async request(payload) {
    const result = await ask(payload);
    return { status: result.status, headers: result.headers, bytes: result.bytes };
  },
  go(url) {
    return navigate(url);
  },
  async open(url) {
    const response = await ask({ url });
    if (isHtml(response)) {
      const isPrint = /\/print(\?|$)/.test(String(url).replace(/[?#].*$/, '')) || /r=[^&]*%2Fprint(?:&|$)/i.test(String(url)) || /[?&]r=[^&]*\/print(?:&|$)/.test(String(url));
      if (isPrint) {
        history.push(url);
        HOST.printHtml(response.text, 'Normia · plano');
        window.__normiaUrl = url;
        return;
      }
      render(response.text);
      history.push(url);
      window.__normiaUrl = url;
      return;
    }
    const type = String(header(response, 'content-type') || 'application/octet-stream');
    saveBytes(fileName(response, 'normia'), type, response.bytes);
  },
  async submit(url, headers, body) {
    const response = await ask({ url, method: 'POST', headers, body });
    const location = String(header(response, 'location') || '');
    if (response.status >= 300 && response.status < 400 && location) {
      const next = await ask({ url: new URL(location, url).href });
      if (isHtml(next)) return { html: next.text, url: new URL(location, url).href };
      return { url: new URL(location, url).href };
    }
    if (isHtml(response)) return { html: response.text };
    const type = String(header(response, 'content-type') || 'application/octet-stream');
    return { download: { name: fileName(response, 'normia'), mime: type, base64: bytesToBase64(response.bytes) } };
  },
  renderHtml(html) {
    render(html);
    showFrame();
    watchFrame();
  },
  /** El editor avisa de un error de JavaScript: se guarda para el diagnóstico. */
  problem(text) {
    const message = String(text || '').slice(0, 400);
    if (!message) return;
    frameProblems.push(message);
    if (frameProblems.length > 8) frameProblems.shift();
    HOST.log(`[normia] error del editor: ${message}`);
  },
  save(name, mime, base64) {
    HOST.saveFile(name, mime, base64);
  },
  log(message) {
    HOST.log(String(message));
  },
};

window.__normiaBack = () => {
  if (history.length <= 1) return 'salir';
  history.pop();
  const previous = history[history.length - 1] || '/';
  navigate(previous, { replace: true });
  return 'atras';
};

window.__normiaPersist = async () => {
  if (!app) return;
  try {
    await app.flush();
  } catch (error) {
    banner.hidden = false;
    banner.textContent = 'No se pudieron guardar los cambios en el teléfono (puede que no quede espacio). Expórtalos antes de cerrar.';
    HOST.log(`[normia] no se pudo guardar: ${error}`);
  }
};

/*
 * El guardado se agrupa y ocurre poco después de cada pantalla. Si el usuario
 * cierra, cambia de app o el sistema la detiene, se fuerza ahora para no perder
 * el último cambio.
 */
const guardarAhora = () => {
  if (!app) return;
  window.__normiaPersist();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') guardarAhora();
});
window.addEventListener('pagehide', guardarAhora);
window.addEventListener('beforeunload', guardarAhora);

window.__normiaReset = async () => {
  if (!app) return false;
  await app.reset();
  history = [];
  await navigate('/');
  return true;
};

retryButton.addEventListener('click', () => {
  window.location.reload();
});

boot().catch(fail);
