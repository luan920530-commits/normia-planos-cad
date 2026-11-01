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

/* Errores que reporta el editor dentro del marco (ver `bridge.js`). */
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
      const listo = Boolean(frame.contentWindow && frame.contentWindow.__normiaBridgeListo);
      if (!listo) {
        const detail = frameProblems.length ? ` Último error: ${frameProblems.slice(-2).join(' · ')}` : '';
        fail(new Error(`El puente del editor no se cargó en la página, así que los botones y enlaces no responden.${detail}`));
        return;
      }
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
    /*
     * Siguiendo las redirecciones. Sin esto, la raíz de una instalación nueva
     * responde `303 → ?r=install` con el cuerpo vacío: la pantalla lo tomaba por
     * una descarga, ocultaba el arranque y dejaba el marco en blanco sin aviso.
     */
    const response = await app.fetchPage(target);
    if (!isHtml(response)) {
      if (response.status >= 300) {
        throw new Error(`La aplicación respondió ${response.status} sin una página que mostrar (${response.url}).`);
      }
      // Enlaces directos a exportaciones: se guardan como archivo.
      const type = String(header(response, 'content-type') || 'application/octet-stream');
      if (!response.bytes || response.bytes.length === 0) {
        throw new Error(`La aplicación respondió ${response.status} sin contenido (${response.url}).`);
      }
      saveBytes(fileName(response, 'normia'), type, response.bytes);
      splash.classList.add('is-hidden');
      return;
    }
    if (!String(response.text).trim()) {
      throw new Error(`La aplicación devolvió una página vacía (${response.url}).`);
    }
    render(response.text);
    if (!options.replace) history.push(url);
    currentUrl = response.url || url;
    window.__normiaUrl = currentUrl;
    showFrame();
    watchFrame();
  } catch (error) {
    fail(error);
  }
}

function render(html) {
  /*
   * El documento del marco lleva una <base> y el puente antes que cualquier
   * script de la aplicación, para que ningún `fetch` se escape. El puente es un
   * archivo (`/assets/bridge.js`), no código incrustado: así no depende de que
   * el navegador permita scripts en línea dentro del documento escrito.
   *
   * «Cargando…» queda a la vista si el puente no llega a ejecutarse; el
   * vigilante del marco lo detecta y lo cuenta en la pantalla de arranque.
   */
  const script = `<script src="${ORIGIN}/assets/bridge.js"></script>`;
  const base = `<base href="${ORIGIN}/">`;
  const cargando = '<p id="normia-cargando" style="margin:0;padding:14px 18px;font:14px/1.4 system-ui,sans-serif;color:#475569;background:#f1f5f9">Cargando…</p>';
  let content = String(html);
  if (/<head[^>]*>/i.test(content)) {
    content = content.replace(/<head([^>]*)>/i, `<head$1>${base}${script}`);
    content = content.replace(/<body([^>]*)>/i, `<body$1>${cargando}`);
  } else {
    content = `<!doctype html><html lang="es"><head>${base}${script}</head><body>${cargando}${content}</body></html>`;
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
    const response = await app.fetchPage(url);
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
      const next = await app.fetchPage(new URL(location, url).href);
      if (isHtml(next)) return { html: next.text, url: next.url };
      return { url: next.url };
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
  /** Lo usa el puente para avisar de que está trabajando (o de que terminó). */
  busy(active, label = '', detail = '') {
    if (active) {
      step(label || 'Procesando', detail);
      splash.classList.remove('is-error');
      splash.classList.remove('is-hidden');
    } else {
      showFrame();
    }
  },
  /** Lo usa el puente cuando algo falla: se ve en la pantalla de arranque. */
  fail(text) {
    fail(text instanceof Error ? text : new Error(String(text || 'Fallo en la página')));
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
