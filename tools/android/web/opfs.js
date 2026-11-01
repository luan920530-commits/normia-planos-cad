/*
 * Datos del usuario dentro del navegador (OPFS).
 *
 * El editor guarda `config/` y `storage/` en el sistema de archivos privado del
 * navegador (`navigator.storage.getDirectory()`), no en memoria: así los planos
 * siguen ahí cuando se cierra la app o se reinicia el teléfono.
 *
 * La API real de OPFS es `getDirectoryHandle()` / `getFileHandle()`. Llamar a
 * `getDirectory()` —un nombre que no existe en el estándar— se escribe igual y
 * falla en el teléfono con «root.getDirectory is not a function», que es justo
 * el error que dio la 1.15.3. Por eso esta pieza vive en su propio archivo y
 * `tests/js/android.mjs` la ejecuta contra una implementación de OPFS que solo
 * expone los métodos del estándar: si alguien vuelve a inventar un método, la
 * suite lo detecta antes de compilar el APK.
 */

/** Nombre de la carpeta de la aplicación dentro del almacenamiento del navegador. */
export const OPFS_FOLDER = 'normia';

/**
 * Abre el almacenamiento del navegador.
 *
 * @param {object} [options]
 * @param {object} [options.storage]       `navigator.storage` (se puede inyectar en las pruebas)
 * @param {Function} [options.onUnavailable] recibe el motivo cuando no se puede usar
 * @returns {Promise<null|{restore: Function, save: Function, clear: Function}>}
 */
export async function openOpfsStorage({ storage, onUnavailable = () => {} } = {}) {
  const area = storage || (typeof navigator !== 'undefined' ? navigator.storage : null);

  // Sin OPFS no hay dónde guardar. Se avisa y se sigue sin persistencia: un
  // editor que abre sin guardar es mejor que uno que no abre.
  if (!area || typeof area.getDirectory !== 'function') {
    onUnavailable(new Error('El navegador del sistema no ofrece OPFS.'));
    return null;
  }

  let root;
  try {
    root = await area.getDirectory();
  } catch (error) {
    onUnavailable(error);
    return null;
  }
  if (!root || typeof root.getDirectoryHandle !== 'function') {
    onUnavailable(new Error('El almacenamiento del navegador no ofrece carpetas.'));
    return null;
  }

  let folder;
  try {
    folder = await root.getDirectoryHandle(OPFS_FOLDER, { create: true });
  } catch (error) {
    onUnavailable(error);
    return null;
  }

  const join = (base, name) => `${base}/${name}`;

  const walk = async (directory, prefix, visit) => {
    for await (const [name, handle] of directory.entries()) {
      const relative = prefix ? join(prefix, name) : name;
      if (handle.kind === 'directory') await walk(handle, relative, visit);
      else await visit(relative, handle);
    }
  };

  return {
    /** Escribe en el intérprete lo que ya estaba guardado en el teléfono. */
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
    /**
     * Guarda en el teléfono los archivos indicados.
     *
     * @param {object} php
     * @param {string} dataDir
     * @param {Function} [filter]    decide qué rutas se guardan
     * @param {string[]} [files]     rutas relativas a guardar (`app.dataFiles()`)
     */
    async save(php, dataDir, filter = () => true, files = []) {
      let count = 0;
      for (const relative of Array.isArray(files) ? files : []) {
        if (!filter(relative)) continue;
        const parts = relative.split('/');
        let directory = folder;
        for (const part of parts.slice(0, -1)) {
          directory = await directory.getDirectoryHandle(part, { create: true });
        }
        const handle = await directory.getFileHandle(parts[parts.length - 1], { create: true });
        const stream = await handle.createWritable();
        await stream.write(php.readFileAsBuffer(`${dataDir}/${relative}`));
        await stream.close();
        count += 1;
      }
      return count;
    },
    /** Borra todo: la aplicación queda como recién instalada. */
    async clear() {
      for await (const [name] of folder.entries()) {
        await folder.removeEntry(name, { recursive: true });
      }
    },
  };
}
