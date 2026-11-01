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
   * @param {object} [options.storage]  `{ restore(php, dir), save(php, dir, filter, files) }`
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
    this.lastSaveError = null;
    /** Archivos de la aplicación montados en el intérprete. */
    this.restored = 0;
    this.ms = 0;
    /** Última versión de cada archivo que se escribió en el almacenamiento. */
    this.saved = new Map();
    this.saveTimer = null;
    this.saving = null;
    this.pendingSave = false;
  }

  /** Monta la aplicación, recupera los datos y deja el servidor listo. */
  async start() {
    const t0 = Date.now();
    this.mount();
    this.log('archivos montados', { files: Object.keys(this.files).length, ms: Date.now() - t0 });
    if (this.storage) {
      this.restored = await this.storage.restore(this.php, this.dataDir);
      this.log('datos recuperados', { files: this.restored, ms: Date.now() - t0 });
    }
    this.handler = this.createHandler(this.php, this.dataDir);
    this.started = true;
    this.ms = Date.now() - t0;
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

  /** Detiene los guardados pendientes (al cerrar el intérprete). */
  dispose() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.pendingSave = false;
  }

  /**
   * Pide una página **siguiendo las redirecciones**.
   *
   * `PHPRequestHandler` no las sigue: devuelve el 303 tal cual, con el cuerpo
   * vacío. La pantalla trataba ese 303 como si fuera una descarga, ocultaba el
   * arranque y no dibujaba nada: pantalla en blanco. Con la base de datos aún
   * sin crear, la raíz responde `303 → /index.php?r=install`, así que el
   * instalador existía pero nunca se pedía. Esto lo pide.
   *
   * @returns {Promise<object>} la respuesta final, con `url` y `hops`
   */
  async fetchPage(url, { max = 6 } = {}) {
    let target = String(url || '/');
    let response = await this.request({ url: target });
    let hops = 0;
    while (response.status >= 300 && response.status < 400 && hops < max) {
      const location = headerOf(response.headers, 'location');
      if (!location) break;
      target = new URL(location, new URL(target, 'http://127.0.0.1')).href;
      response = await this.request({ url: target });
      hops += 1;
    }
    return { ...response, url: this.relative(target), hops };
  }

  /**
   * Pide un guardado agrupado. Varias peticiones seguidas producen una sola
   * escritura, y la respuesta no espera a que termine.
   */
  queueSave(delay = 400) {
    if (!this.storage) return;
    this.pendingSave = true;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      // Si el intérprete ya se cerró (o el almacenamiento falla), el error se
      // anota y se avisa; no puede convertirse en una excepción suelta.
      this.flush().catch((error) => {
        this.lastSaveError = error;
        this.log('no se pudieron guardar los datos', { error: String(error && error.message ? error.message : error) });
      });
    }, delay);
  }

  /**
   * Guarda lo que cambió, ahora mismo.
   *
   * Si ya hay un guardado en curso no se pisan las escrituras: se espera a que
   * termine y, si entretanto llegaron más cambios, se repite una vez.
   *
   * @returns {Promise<number>} archivos escritos
   */
  async flush() {
    if (!this.storage) return 0;
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.saving) {
      await this.saving;
      if (!this.pendingSave) return 0;
    }
    this.pendingSave = false;
    this.saving = this.persist();
    try {
      return await this.saving;
    } finally {
      this.saving = null;
    }
  }

  /**
   * Escribe en el almacenamiento los archivos que cambiaron desde el último
   * guardado. Devuelve cuántos se escribieron.
   */
  async persist() {
    if (!this.storage) return 0;
    const t0 = Date.now();
    const changed = [];
    for (const relative of this.dataFiles()) {
      if (SKIP_SAVE.some((skip) => skip.test(relative))) continue;
      const bytes = this.php.readFileAsBuffer(`${this.dataDir}/${relative}`);
      if (sameBytes(this.saved.get(relative), bytes)) continue;
      changed.push(relative);
      this.saved.set(relative, bytes);
    }
    if (changed.length === 0) return 0;
    try {
      const saved = await this.storage.save(this.php, this.dataDir, () => true, changed);
      this.lastSaveError = null;
      this.log('datos guardados', { files: saved, ms: Date.now() - t0 });
      return saved;
    } catch (error) {
      // Se olvida la versión marcada como guardada: el próximo intento la
      // vuelve a escribir en vez de creer que ya estaba.
      for (const relative of changed) this.saved.delete(relative);
      this.lastSaveError = error;
      this.log('no se pudieron guardar los datos', { error: String(error && error.message ? error.message : error) });
      throw error;
    }
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
    /*
     * Los datos se guardan aparte, agrupados y sin frenar la respuesta.
     *
     * La 1.15.4 guardaba dentro de la propia petición: abrir una pantalla del
     * editor pide 25 recursos y cada uno escribía la base de datos entera en el
     * teléfono. En un equipo modesto eso deja la pantalla esperando minutos —y
     * si se cierra la app a media escritura, la instalación parece perdida—.
     * Ahora cada petición marca «hay cambios» y el guardado ocurre poco después,
     * una sola vez y escribiendo solo lo que cambió.
     */
    this.queueSave();
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
      restored: this.restored,
      ms: this.ms,
      requests: this.requests,
      cookies: this.cookies.size,
      pendingSave: this.pendingSave,
      lastSaveError: this.lastSaveError ? String(this.lastSaveError.message || this.lastSaveError) : '',
    };
  }
}

/** Lee una cabecera sin depender de mayúsculas ni de si viene en lista. */
export function headerOf(headers, name) {
  const source = headers || {};
  const wanted = String(name).toLowerCase();
  for (const [key, value] of Object.entries(source)) {
    if (String(key).toLowerCase() !== wanted) continue;
    if (Array.isArray(value)) return String(value[0] ?? '');
    return value === undefined || value === null ? '' : String(value);
  }
  return '';
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
    async save(php, dataDir, filter = () => true, changed = null) {
      let count = 0;
      for (const relative of Array.isArray(changed) ? changed : listData(php, dataDir)) {
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

/** ¿Los dos contenidos son iguales? (evita reescribir lo que no cambió). */
function sameBytes(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
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
