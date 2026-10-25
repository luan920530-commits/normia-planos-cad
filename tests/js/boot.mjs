/*
 * Arranque del editor real dentro de JSDOM para las pruebas de interfaz.
 * El HTML proviene de la aplicación PHP; los scripts se leen del repositorio
 * y se ejecutan en el mismo orden en que los carga la vista del editor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { repoRoot } from '../php/harness.mjs';

export const SCRIPTS = [
  'js/ui.js',
  'js/lib/geometry.js',
  'js/lib/model.js',
  'js/lib/renderer.js',
  'js/editor/store.js',
  'js/editor/inspector.js',
  'js/editor/library.js',
  'js/editor.js',
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(predicate, timeout = 20000, interval = 25) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(`Tiempo de espera agotado${lastError ? `: ${lastError.message}` : ''}`);
}

/** Puente entre window.fetch (editor) y el cliente HTTP de php-wasm. */
export function bridgeFetch(client, base = 'http://127.0.0.1/') {
  const calls = [];
  const fetchFn = async (input, config = {}) => {
    const raw = typeof input === 'string' ? input : String(input?.url || '');
    const method = String(config.method || 'GET').toUpperCase();
    calls.push({ url: raw, method });
    const target = new URL(raw, base);
    const route = target.pathname + target.search;
    const accept = config.headers?.Accept || 'application/json';
    let result;
    if (method === 'GET') {
      result = await client.get(route, { accept });
    } else {
      result = await client.request(route, {
        method,
        body: config.body ?? '',
        json: true,
        skipCsrf: true,
        accept,
        headers: { ...(config.headers || {}) },
      });
    }
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: result.headers,
      url: target.href,
      async text() {
        return result.text;
      },
      async json() {
        return JSON.parse(result.text);
      },
    };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

/** Prepara JSDOM con lo mínimo que un navegador real ofrece y JSDOM no. */
export function prepareWindow(dom, { viewport = { width: 1280, height: 800 } } = {}) {
  const { window } = dom;
  const svg = window.document.querySelector('#plan-canvas');
  if (!svg) throw new Error('La página del editor no contiene #plan-canvas.');
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: viewport.width,
    height: viewport.height,
    right: viewport.width,
    bottom: viewport.height,
    x: 0,
    y: 0,
  });
  const emptyContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect() {},
    drawImage() {},
    clearRect() {},
    getImageData() {
      return { data: new Uint8ClampedArray(4) };
    },
  };
  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return emptyContext;
  };
  window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    window.setTimeout(() => callback(new window.Blob(['png'], { type: 'image/png' })), 0);
  };
  window.URL.createObjectURL = () => 'blob:normia/prueba';
  window.URL.revokeObjectURL = () => {};
  window.Image = class FakeImage {
    set src(value) {
      this.dataset = { ...(this.dataset || {}), src: value };
      window.setTimeout(() => this.onload?.(), 0);
    }

    get src() {
      return this.dataset?.src || '';
    }
  };
  const clicks = [];
  window.HTMLAnchorElement.prototype.click = function click() {
    clicks.push({ href: this.getAttribute('href'), download: this.getAttribute('download') });
  };
  window.__downloads = clicks;
  window.open = (url) => {
    window.__opened = window.__opened || [];
    window.__opened.push(String(url));
    return { focus() {}, close() {} };
  };
  return window;
}

export function evalScripts(window, files = SCRIPTS) {
  for (const file of files) {
    const source = fs.readFileSync(path.join(repoRoot, 'assets', file), 'utf8');
    window.eval(`${source}\n//# sourceURL=${file}`);
  }
}

/**
 * Abre la página del editor y espera a que la aplicación real quede lista.
 * Devuelve el DOM, la ventana y la instancia de EditorApp (window.NormiaEditor).
 */
export async function openEditor(client, route, options = {}) {
  const response = await client.get(route, { accept: 'text/html' });
  if (response.status !== 200) {
    throw new Error(`No se pudo cargar el editor (${response.status}).`);
  }
  const dom = new JSDOM(response.text, {
    url: new URL(route, 'http://127.0.0.1').href,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const window = prepareWindow(dom, options);
  window.fetch = bridgeFetch(client);
  window.__errors = [];
  window.addEventListener('error', (event) => window.__errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => window.__errors.push(String(event.reason)));
  const bootField = window.document.querySelector('#editor-boot');
  const designField = window.document.querySelector('#editor-design');
  const boot = JSON.parse(bootField.value);
  const design = JSON.parse(designField.value);
  evalScripts(window, options.scripts || SCRIPTS);
  const app = await waitFor(() => window.NormiaEditor || null, options.timeout || 20000);
  app.fit(true);
  app.renderNow();
  return { dom, window, app, boot, design, response, fetch: window.fetch };
}

/** Convierte coordenadas del lienzo a coordenadas de cliente del navegador. */
export function clientPoint(app, x, y) {
  const rect = app.svg.getBoundingClientRect();
  return {
    clientX: rect.left + app.view.panX + x * app.view.zoom,
    clientY: rect.top + app.view.panY + y * app.view.zoom,
  };
}

export function pointer(window, target, type, point, extra = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: Math.round(point.clientX ?? 0),
    clientY: Math.round(point.clientY ?? 0),
    shiftKey: false,
    altKey: false,
    ...extra,
  });
  target.dispatchEvent(event);
  return event;
}

export function drag(window, target, from, to, steps = 3) {
  pointer(window, target, 'pointerdown', from);
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    pointer(window, target, 'pointermove', {
      clientX: from.clientX + (to.clientX - from.clientX) * ratio,
      clientY: from.clientY + (to.clientY - from.clientY) * ratio,
    });
  }
  pointer(window, target, 'pointerup', to);
}

export function key(window, target, keyName, options = {}) {
  const event = new window.KeyboardEvent('keydown', {
    key: keyName,
    code: options.code || keyName,
    bubbles: true,
    cancelable: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...options,
  });
  (target || window.document.activeElement || window.document.body).dispatchEvent(event);
  return event;
}

export function makeReporter(label = 'UI') {
  const results = [];
  return {
    check(name, condition, detail = '') {
      const ok = Boolean(condition);
      results.push({ name, ok, detail });
      console.log(`${ok ? '✓' : '✗'} [${label}] ${name}${detail ? ` · ${detail}` : ''}`);
      return ok;
    },
    results,
    summary() {
      const failed = results.filter((row) => !row.ok);
      console.log(`\n${label}: ${results.length - failed.length}/${results.length} comprobaciones correctas.`);
      if (failed.length) {
        console.log('Fallos:\n' + failed.map((row) => `  - ${row.name}${row.detail ? ` (${row.detail})` : ''}`).join('\n'));
      }
      return failed.length;
    },
  };
}

/** Cierra el DOM liberando temporizadores para que Node pueda terminar. */
export function closeEditor(editor) {
  try {
    editor?.app?.store?.stopAutosave?.();
    editor?.window?.close?.();
  } catch {
    /* el DOM ya puede estar cerrado */
  }
}
