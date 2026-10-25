/*
 * Arnés de pruebas de Normia Planos CAD.
 * Ejecuta la aplicación real sobre PHP compilado a WebAssembly (php-wasm),
 * en una copia temporal del repositorio, sin modificar el proyecto.
 *
 * Solo se usa en desarrollo: el paquete de producción no necesita Node.
 */
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { PHP, PHPRequestHandler } from '@php-wasm/universal';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let runtimeCounter = 700;

const EXCLUDED = [/^\.git(\/|$)/, /^node_modules(\/|$)/, /^dist(\/|$)/, /^\.arena(\/|$)/];

function shouldCopy(relative) {
  const posix = relative.split(path.sep).join('/');
  if (posix === '') return true;
  if (EXCLUDED.some((pattern) => pattern.test(posix))) return false;
  if (posix === 'config/config.php') return false;
  if (/^storage\/.+\.sqlite(-wal|-shm)?$/.test(posix)) return false;
  if (/^storage\/sessions\/.+/.test(posix)) return false;
  if (/^storage\/logs\/.+/.test(posix) && !posix.endsWith('.gitkeep')) return false;
  if (posix.endsWith('.log') || posix.endsWith('.tmp')) return false;
  return true;
}

export function cloneProject() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'normia-e2e-'));
  fs.cpSync(repoRoot, target, {
    recursive: true,
    filter: (source) => shouldCopy(path.relative(repoRoot, source)),
  });
  return target;
}

export function decodeEntities(text) {
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function extractToken(html) {
  const match = /name="_token" value="([^"]+)"/.exec(html || '');
  return match ? match[1] : '';
}

export class Client {
  constructor(handler) {
    this.handler = handler;
    this.cookie = '';
    this.csrf = '';
  }

  async request(route, options = {}) {
    const url = route.startsWith('/') ? route : `/index.php?r=${route}`;
    const headers = { Accept: options.accept || 'text/html', ...(options.headers || {}) };
    if (this.cookie) headers.Cookie = this.cookie;
    let body = options.body;
    if (body instanceof URLSearchParams) {
      body = body.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (body && typeof body === 'object' && !(body instanceof Uint8Array)) {
      // multipart (File objects)
    } else if (typeof body === 'string' && options.json) {
      headers['Content-Type'] = 'application/json';
      if (this.csrf && !options.skipCsrf) headers['X-CSRF-Token'] = this.csrf;
    }
    if (typeof body === 'string') body = new TextEncoder().encode(body);
    const response = await this.handler.request({ method: options.method || 'GET', url, headers, body });
    const firstHeader = (name) => {
      const value = response.headers[name];
      if (Array.isArray(value)) return String(value[0] ?? '');
      return value === undefined || value === null ? '' : String(value);
    };
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      this.cookie = String(raw).split(';')[0];
    }
    return {
      status: response.httpStatusCode,
      headers: response.headers,
      text: response.text || '',
      location: firstHeader('location'),
      type: firstHeader('content-type'),
      json() {
        return JSON.parse(this.text);
      },
    };
  }

  get(route, options = {}) {
    return this.request(route, options);
  }

  postForm(route, fields, options = {}) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) body.set(key, String(value));
    return this.request(route, { ...options, method: 'POST', body });
  }

  postJson(route, payload, options = {}) {
    return this.request(route, {
      ...options,
      method: 'POST',
      body: JSON.stringify(payload),
      json: true,
      accept: 'application/json',
    });
  }
}

/**
 * Inicia la aplicación sobre un directorio ya existente (por ejemplo un ZIP
 * descomprimido) y devuelve un cliente HTTP con sus utilidades de instalación.
 */
export async function startRuntime(documentRoot, version = '8.3', options = {}) {
  runtimeCounter += 1;
  const php = new PHP(await loadNodeRuntime(version, { emscriptenOptions: { processId: runtimeCounter } }));
  useHostFilesystem(php);
  const handler = new PHPRequestHandler({ php, documentRoot, absoluteUrl: 'http://127.0.0.1', cookieStore: false });
  const client = new Client(handler);
  const target = documentRoot;
  const baseUrl = 'http://127.0.0.1';

  return {
    php,
    target,
    handler,
    client,
    baseUrl,
    async close() {
      try { php.exit(0); } catch { /* el runtime puede haberse cerrado solo */ }
      if (options.cleanup === true) fs.rmSync(target, { recursive: true, force: true });
    },
    async install(options = {}) {
      const email = options.email || 'admin@normia.local';
      const password = options.password || 'ClaveSegura2026';
      const page = await client.get('install');
      const token = extractToken(page.text);
      const result = await client.postForm('install', {
        _token: token,
        name: options.name || 'Administrador de prueba',
        email,
        password,
        password_confirm: password,
        demo: options.demo === false ? '' : '1',
      });
      return { page, result, email, password };
    },
    async login(email, password) {
      const page = await client.get('login');
      const token = extractToken(page.text);
      return client.postForm('login', { _token: token, email, password });
    },
    /** Ejecuta código PHP dentro de la instalación temporal (solo pruebas). */
    run(code) {
      return php.run({
        code: `<?php
define('BASE_PATH', ${JSON.stringify(target)});
require BASE_PATH . '/app/Core/Autoloader.php';
App\\Core\\Autoloader::register(BASE_PATH . '/app');
require BASE_PATH . '/app/Support/helpers.php';
App\\Core\\Config::boot(BASE_PATH);
date_default_timezone_set((string) App\\Core\\Config::get('timezone', 'America/Bogota'));
${code}`,
      });
    },
  };
}

export async function startApp(version = '8.3') {
  return startRuntime(cloneProject(), version, { cleanup: true });
}

export function makeReporter(version) {
  const results = [];
  return {
    check(name, condition, detail = '') {
      const ok = Boolean(condition);
      results.push({ name, ok, detail });
      console.log(`${ok ? '✓' : '✗'} [PHP ${version}] ${name}${detail ? ` · ${detail}` : ''}`);
      return ok;
    },
    summary() {
      const failed = results.filter((row) => !row.ok);
      console.log(`\nPHP ${version}: ${results.length - failed.length}/${results.length} comprobaciones correctas.`);
      if (failed.length) {
        console.log('Fallos:\n' + failed.map((row) => `  - ${row.name}${row.detail ? ` (${row.detail})` : ''}`).join('\n'));
      }
      return failed.length;
    },
    results,
  };
}
