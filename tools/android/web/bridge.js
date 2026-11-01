/*
 * Puente entre las páginas de la aplicación y el contenedor del APK.
 *
 * Este archivo se carga como `<script src>` dentro del marco —nunca incrustado—
 * y se ejecuta antes que los scripts de la página. Parchea `fetch`, intercepta
 * enlaces y formularios para que las peticiones las atienda PHP (en el propio
 * teléfono) y deja ver en la pantalla de arranque cualquier error.
 *
 * Si no llegara a ejecutarse, el aviso «Cargando…» que inyecta `shell.js` se
 * queda a la vista y el contenedor lo detecta: mejor eso que un botón que no
 * hace nada.
 */
(function normiaBridge() {
  'use strict';

  const bridge = window.parent.__normiaBridge;
  if (!bridge) {
    window.document.title = 'Normia · sin puente';
    return;
  }
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
      bridge.busy(true, 'Instalando o guardando', 'Esto puede tardar unos segundos en el teléfono.');
      const result = await bridge.submit(action.href, headers, body);
      if (result.html) bridge.renderHtml(result.html);
      else if (result.download) bridge.save(result.download.name, result.download.mime, result.download.base64);
      else bridge.fail('El servidor no devolvió una página después de enviar el formulario. Inténtalo otra vez.');
    } catch (error) {
      bridge.fail(`No se pudo enviar el formulario: ${error && error.message ? error.message : error}`);
    } finally {
      bridge.busy(false);
    }
  }, true);

  window.open = function patchedOpen(url) {
    bridge.open(new URL(String(url), document.baseURI).href);
    return null;
  };
  window.__normiaBridgeListo = true;
  // El aviso de «Cargando…» que dibuja `shell.js` se retira en cuanto el puente
  // está vivo. Puede no existir todavía (este script va en el <head>), así que
  // también se intenta al terminar de leer el documento.
  const quitarAviso = () => {
    const aviso = window.document.getElementById('normia-cargando');
    if (aviso) aviso.remove();
  };
  quitarAviso();
  window.document.addEventListener('DOMContentLoaded', quitarAviso);
}());
