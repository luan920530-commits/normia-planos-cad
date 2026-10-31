/*
 * Núcleo de la aplicación para la tableta o el teléfono (APK de Android).
 *
 * El editor es una aplicación PHP con SQLite. En Android no hay PHP nativo, así
 * que se ejecuta el intérprete compilado a WebAssembly dentro de la misma
 * página. Este archivo contiene solo la lógica: montar los archivos, atender
 * peticiones, mantener las cookies y guardar los datos en el almacenamiento del
 * equipo. No toca el DOM, por eso se puede probar sin navegador en
 * `tests/js/android.mjs`.
 *
 * La pantalla (`shell.js`) y el contenedor nativo solo se encargan de mostrar lo
 * que devuelve `request()` y de guardar o imprimir archivos.
 */

/** Decodifica base64 tanto en el navegador como en Node. */
export function decodeBase64(value) {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
}

/** Codifica a base64 para enviar un archivo al sistema operativo. */
export function encodeBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + step));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

/** Carpetas que forman los datos del usuario y que se guardan en el equipo. */
export const DATA_ROOTS = ['config', 'storage'];
const SKIP_RESTORE = [/^storage\/logs\//, /^storage\/cache\//];
const SKIP_SAVE = [/^storage\/logs\/.*\.log$/, /^storage\/cache\//];

export class NormiaApp {
  /**
   * @param {object} options
   * @param {object} options.php        intérprete ya iniciado (`@php-wasm`)
   * @param {Function} options.createHandler (php, documentRoot) => manejador de peticiones
   * @param {object} options.files      mapa «ruta relativa → base64» con la aplicación
   * @param {string} [options.dataDir]  carpeta donde vive la aplicación dentro del intérprete
   * @param {object} [options.storage]  `{ restore(php, dir), save(php, dir) }`
   * @param {Function} [options.log]    registro de pasos para el diagnóstico
   */
  constructor({ php, createHandler, files = {}, dataDir = '/www', storage = null, log = () => {} }) {
    this.php = php;
    this.createHandler = createHandler;
    this.files = files;
    this.dataDir = dataDir;
    this.storage = storage;
    this.log = log;
    this.handler = null;
    this.cookies = new Map();
    this.requests = 0;
    this.started = false;
  }

  /** Monta la aplicación, recupera los datos y deja el servidor listo. */
  async start() {
    const t0 = Date.now();
    this.mount();
    this.log('archivos montados', { files: Object.keys(this.files).length, ms: Date.now() - t0 });
    if (this.storage) {
      const restored = await this.storage.restore(this.php, this.dataDir);
      this.log('datos recuperados', { files: restored, ms: Date.now() - t0 });
    }
    this.handler = this.createHandler(this.php, this.dataDir);
    this.started = true;
    return this;
  }

  /** Escribe en el intérprete el árbol de archivos de la aplicación. */
  mount() {
    const php = this.php;
    const directories = new Set([this.dataDir]);
    const entries = Object.entries(this.files);
    for (const [relative] of entries) {
      const parts = relative.split('/');
      parts.pop();
      directories.add([this.dataDir, ...parts].join('/'));
    }
    for (const directory of [...directories].sort()) {
      if (!php.fileExists(directory)) php.mkdir(directory);
    }
    for (const [relative, base64] of entries) {
      php.writeFile(`${this.dataDir}/${relative}`, decodeBase64(base64));
    }
    // La carpeta de datos debe existir aunque la instalación aún no se haya hecho.
    for (const relative of ['config', 'storage', 'storage/sessions', 'storage/logs', 'storage/cache']) {
      const directory = `${this.dataDir}/${relative}`;
      if (!php.fileExists(directory)) php.mkdir(directory);
    }
  }

  /** Lista los archivos de datos (rutas relativas a la carpeta de la app). */
  dataFiles() {
    const found = [];
    const walk = (relative) => {
      const absolute = `${this.dataDir}/${relative}`;
      if (!this.php.fileExists(absolute)) return;
      for (const name of this.php.listFiles(absolute)) {
        const child = `${relative}/${name}`;
        if (this.php.isDir(`${this.dataDir}/${child}`)) walk(child);
        else found.push(child);
      }
    };
    for (const root of DATA_ROOTS) walk(root);
    return found;
  }

  /** Guarda los datos en el almacenamiento del equipo. */
  async persist() {
    if (!this.storage) return 0;
    const t0 = Date.now();
    const saved = await this.storage.save(this.php, this.dataDir, (relative) => !SKIP_SAVE.some((skip) => skip.test(relative)));
    this.log('datos guardados', { files: saved, ms: Date.now() - t0 });
    return saved;
  }

  /** Borra los datos y deja la aplicación como recién instalada. */
  async reset() {
    const php = this.php;
    for (const relative of this.dataFiles()) {
      try { php.unlink(`${this.dataDir}/${relative}`); } catch { /* puede no existir */ }
    }
    if (this.storage && typeof this.storage.clear === 'function') await this.storage.clear();
    this.cookies.clear();
  }

  /** Cabecera de cookies acumulada. */
  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  rememberCookies(headers) {
    const raw = headers['set-cookie'] ?? headers['Set-Cookie'];
    if (!raw) return;
    for (const cookie of Array.isArray(raw) ? raw : [raw]) {
      const pair = String(cookie).split(';')[0].trim();
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  /**
   * Atiende una petición del editor.
   *
   * @param {object} request
   * @param {string} request.url      ruta o URL completa («/index.php?r=projects/1»)
   * @param {string} [request.method]
   * @param {Uint8Array|string|null} [request.body]
   * @param {Array<[string,string]>|object} [request.headers]
   */
  async request({ url, method = 'GET', body = null, headers = [] }) {
    const started = Date.now();
    const path = this.relative(url);
    const outgoing = normalizeHeaders(headers);
    const cookie = this.cookieHeader();
    if (cookie) outgoing.cookie = cookie;
    if (!outgoing.accept) outgoing.accept = 'text/html,application/xhtml+xml';
    const options = { url: path, method: method.toUpperCase(), headers: outgoing };
    if (body !== null && body !== undefined && body.length !== 0) options.body = body;
    const response = await this.handler.request(options);
    this.rememberCookies(response.headers || {});
    this.requests += 1;
    const result = {
      status: response.httpStatusCode,
      headers: response.headers || {},
      bytes: response.bytes ?? new Uint8Array(),
      text: response.text ?? '',
      url: path,
      ms: Date.now() - started,
    };
    // Cada respuesta deja los datos en el almacenamiento: cerrar la app sin
    // guardar no debe perder el plano.
    await this.persist();
    return result;
  }

  /** Convierte una URL del marco en la ruta que entiende el intérprete. */
  relative(url) {
    const value = String(url || '/');
    const withoutOrigin = value.replace(/^[a-z]+:\/\/[^/]+/i, '');
    const path = withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;
    return path === '' ? '/' : path;
  }

  /** Estado para el panel de diagnóstico. */
  status() {
    return {
      started: this.started,
      files: Object.keys(this.files).length,
      dataFiles: this.started ? this.dataFiles().length : 0,
      requests: this.requests,
      cookies: this.cookies.size,
    };
  }
}

function normalizeHeaders(headers) {
  const output = {};
  if (Array.isArray(headers)) {
    for (const [name, value] of headers) output[String(name).toLowerCase()] = String(value);
  } else if (headers && typeof headers === 'object') {
    for (const [name, value] of Object.entries(headers)) output[String(name).toLowerCase()] = String(value);
  }
  return output;
}

/** Almacenamiento en memoria: lo usan las pruebas y el modo sin persistencia. */
export function memoryStorage() {
  const files = new Map();
  return {
    files,
    async restore(php, dataDir) {
      let count = 0;
      for (const [relative, bytes] of files) {
        const parts = `${dataDir}/${relative}`.split('/');
        parts.pop();
        let directory = '';
        for (const part of parts) {
          directory += `/${part}`;
          if (!php.fileExists(directory)) php.mkdir(directory);
        }
        php.writeFile(`${dataDir}/${relative}`, bytes);
        count += 1;
      }
      return count;
    },
    async save(php, dataDir, filter = () => true) {
      files.clear();
      let count = 0;
      for (const relative of listData(php, dataDir)) {
        if (!filter(relative)) continue;
        files.set(relative, php.readFileAsBuffer(`${dataDir}/${relative}`));
        count += 1;
      }
      return count;
    },
    async clear() {
      files.clear();
    },
  };
}

function listData(php, dataDir) {
  const found = [];
  const walk = (relative) => {
    const absolute = `${dataDir}/${relative}`;
    if (!php.fileExists(absolute)) return;
    for (const name of php.listFiles(absolute)) {
      const child = `${relative}/${name}`;
      if (php.isDir(`${dataDir}/${child}`)) walk(child);
      else found.push(child);
    }
  };
  for (const root of DATA_ROOTS) walk(root);
  return found;
}
