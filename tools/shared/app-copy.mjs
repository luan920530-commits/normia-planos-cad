/*
 * Copia la aplicación a una carpeta de distribución.
 *
 * La usan las dos ediciones de escritorio (la nativa de `tools/desktop` y la
 * de Electron) para no duplicar la lista de lo que viaja y lo que no: el
 * código, los recursos y los documentos sí; las pruebas, los flujos, los datos
 * del usuario y las dependencias de desarrollo, no.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Carpetas que nunca forman parte de la aplicación instalada. */
const EXCLUDED = new Set(['.git', '.github', '.arena', 'dist', 'node_modules', 'paquetes', 'coverage', 'tests', 'build']);

/** ¿Se copia este archivo (ruta relativa a la raíz del repositorio)? */
export function shouldCopy(relative, { excludeTools = false } = {}) {
  const posix = relative.split(path.sep).join('/');
  if (posix === '') return true;
  const [first] = posix.split('/');
  if (EXCLUDED.has(first)) return false;
  // El proyecto de Android y sus activos generados no forman parte de la app
  // de escritorio (el APK incluye el intérprete para WebAssembly, no este).
  if (posix === 'tools/android' || posix.startsWith('tools/android/')) return false;
  // La edición de Electron guarda su propio código aparte: no necesita el
  // lanzador nativo ni los constructores de paquetes.
  if (excludeTools && (posix === 'tools' || posix.startsWith('tools/'))) return false;
  // `package.json` es del repositorio (pruebas y herramientas), no de la
  // aplicación: los paquetes web y de escritorio tampoco lo llevan.
  if (posix === 'package.json' || posix === 'package-lock.json') return false;
  if (/^config\/config\.php$/.test(posix)) return false;
  if (/^storage\/.+\.(sqlite|sqlite-wal|sqlite-shm)$/.test(posix)) return false;
  if (/^storage\/(sessions|logs|cache)\/.+/.test(posix) && !posix.endsWith('.gitkeep')) return false;
  if (/^storage\/last-error\.log$/.test(posix)) return false;
  if (posix.endsWith('.DS_Store')) return false;
  return true;
}

/**
 * Copia el repositorio completo (con el filtro) y prepara las carpetas vacías.
 *
 * Se copia entrada por entrada y no la raíz entera: en los flujos de trabajo la
 * carpeta de destino (`dist/…`) vive **dentro** del repositorio y Node rechaza
 * copiar un directorio dentro de sí mismo.
 */
export function copyApp(destination, options = {}) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!shouldCopy(entry.name, options)) continue;
    fs.cpSync(path.join(ROOT, entry.name), path.join(destination, entry.name), {
      recursive: true,
      filter: (source) => shouldCopy(path.relative(ROOT, source), options),
    });
  }
  for (const directory of ['config', 'storage', 'storage/sessions', 'storage/logs', 'storage/cache']) {
    fs.mkdirSync(path.join(destination, directory), { recursive: true });
  }
  return destination;
}

/** Versión declarada por la aplicación (bootstrap.php, una sola fuente). */
export function readVersion() {
  const source = fs.readFileSync(path.join(ROOT, 'bootstrap.php'), 'utf8');
  const match = /define\('NORMA_VERSION', '([0-9.]+)'\);/.exec(source);
  if (!match) throw new Error('No se pudo leer NORMA_VERSION de bootstrap.php.');
  return match[1];
}
