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
 * Guarda config/ y storage/ en el almacenamiento privado del navegador (OPFS).
 * Si el equipo no lo ofrece, la app avisa que los cambios no se conservarán en
 * vez de fingir que guardó.
 */
async function openStorage() {
  if (!navigator.storage || !navigator.storage.getDirectory) {
    banner.hidden = false;
    banner.textContent = 'Este navegador del sistema no permite guardar datos. Los cambios se perderán al cerrar.';
    return null;
  }
  const root = await navigator.storage.getDirectory();
  const folder = await root.getDirectory('normia', { create: true });

  const join = (base, name) => `${base}/${name}`;
  const walk = async (directory, prefix, visit) => {
    for await (const [name, handle] of directory.entries()) {
      const relative = prefix ? join(prefix, name) : name;
      if (handle.kind === 'directory') await walk(handle, relative, visit);
      else await visit(relative, handle);
    }
  };

  return {
    async restore(php, dataDir) {
      let count = 0;
      await walk(folder, '', async (relative, handle) => {
        const file = await handle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const parts = `${dataDir}/${relative}`.split('/');
        parts.pop();
        let path = '';
        for (const part of parts) {
          path += `/${part}`;
          if (!php.fileExists(path)) php.mkdir(path);
        }
        php.writeFile(`${dataDir}/${relative}`, bytes);
        count += 1;
      });
      return count;
    },
    async save(php, dataDir, filter = () => true) {
      let count = 0;
      for (const relative of app.dataFiles()) {
        if (!filter(relative)) continue;
        const parts = relative.split('/');
        let directory = folder;
        for (const part of parts.slice(0, -1)) directory = await directory.getDirectory(part, { create: true });
        const handle = await directory.getFileHandle(parts[parts.length - 1], { create: true });
        const stream = await handle.createWritable();
        await stream.write(php.readFileAsBuffer(`${dataDir}/${relative}`));
        await stream.close();
        count += 1;
      }
      return count;
    },
    async clear() {
      for await (const [name] of folder.entries()) {
        await folder.removeEntry(name, { recursive: true });
      }
    },
  };
}

/* -------------------------------- arranque -------------------------------- */

async function boot() {
  step('Cargando el intérprete', `PHP 8.3 · WebAssembly`);
  const runtime = await import('./php/runtime.js');
  const wasmUrl = new URL('./php/php_8_3.wasm', import.meta.url);
  // El archivo llega desde los activos del APK; no hay red de por medio.
  const wasmBinary = new Uint8Array(await (await fetch(wasmUrl.href)).arrayBuffer());
  step('Intérprete descargado', `${Math.round(wasmBinary.length / 1048576)} MB`);
  const php = new runtime.PHP(
    await runtime.loadWebRuntime('8.3', { emscriptenOptions: { wasmBinary } })
  );
  step('Intérprete iniciado');

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
  await app.start();
  step('Datos del equipo listos', `${app.status().dataFiles} archivos`);

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
  } catch (error) {
    fail(error);
  }
}

const guestBootstrap = function guestBootstrap() {
  const bridge = window.parent.__normiaBridge;
  const ORIGIN = 'https://appassets.androidplatform.net';
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  const toHeaders = (list) => list.map(([name, value]) => [name, value]);

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
    await app.persist();
  } catch (error) {
    HOST.log(`[normia] no se pudo guardar: ${error}`);
  }
};

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
