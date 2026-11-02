# Estabilidad de los datos · Fase 0

Qué protege esta entrega, cómo se comprueba y cómo se restaura o se revierte.
Aplica a partir de la versión **1.18.0** (`user_version = 7`).

---

## 1. Qué se guarda y dónde

| Dato | Dónde vive | En el respaldo |
| --- | --- | --- |
| Empresas, membresías y roles | SQLite (`organizations`, `memberships`) | Sí |
| Proyectos y pisos | SQLite (`projects`, `floors.design_json`) | Sí |
| Historial de versiones | SQLite (`floor_versions`, duplica el plano en cada una) | Sí |
| Verificaciones y **fotografías** | SQLite (`element_checks.photo`, base64 ≤ 512 KB) | Sí |
| Enlaces del modo brigadista | SQLite (`brigade_links`) | Sí |
| Complementos (manifiesto + SVG) | `storage/plugins/<id>/` | Sí |
| Configuración y `app_key` | `config/config.php` | Sí |
| Sesiones activas | `storage/sessions/` | No (se regeneran) |
| Registros | `storage/logs/` | No |

Todo lo que no se puede reconstruir está en la base o en `config/`. Las
fotografías van **dentro** de la base (base64), así que una copia de la base las
conserva; el ZIP las incluye sin hacer nada especial.

---

## 2. Respaldo

### Cómo se hace

`Backup::create()` usa **`VACUUM INTO`**, la forma que recomienda SQLite: produce
una copia completa y compactada sin detener el servicio y **sin depender del
`-wal`**. Copiar el `.sqlite` a mano con la aplicación abierta puede dejar fuera
las últimas transacciones; por eso ya no se documenta como método.

Si el motor no admite `VACUUM INTO`, el respaldo cae a un modo alternativo:
punto de control del WAL (`PRAGMA wal_checkpoint(TRUNCATE)`) y copia del archivo.
El manifiesto indica qué método se usó (`vacuum` o `copy`).

### Qué contiene el ZIP

```
storage/normia-<id>.sqlite     la base, con el nombre original
config/config.php              configuración (incluye app_key)
storage/plugins/…              complementos instalados
respaldo.json                  manifiesto: fecha, versión, conteos, SHA-256
LEEME-RESTAURACION.txt         instrucciones dentro del propio respaldo
```

El ZIP se escribe **sin compresión y sin `ZipArchive`** (el PHP de escritorio y
Android no siempre la trae). Cualquier descompresor de macOS, Windows o Linux lo
abre. Límite declarado: 4 GB; si se supera, se lanza un error en vez de generar
un archivo ilegible.

### Verificación

Cada respaldo se verifica **antes de darse por bueno**:

- `PRAGMA integrity_check` → debe responder `ok`;
- `PRAGMA foreign_key_check` → sin filas;
- existen las tablas esperadas;
- ninguna empresa sin propietario;
- ningún proyecto sin empresa;
- ningún piso sin proyecto.

El resultado queda en el manifiesto y se muestra en el panel. La acción
**Verificar** repite la comprobación sobre el ZIP ya guardado: extrae la base a
un temporal, la abre **en solo lectura, en otra conexión** y la valida sin tocar
la instalación en uso. Es la «restauración aislada» de esta fase: se comprueba
en aislado, no se sobrescribe nada desde la interfaz.

### Retención

- Se conservan las **10 copias más recientes**.
- La rotación **nunca** elimina una copia **fijada** (botón *Fijar*).
- Al superar las 10, se retira la más antigua no fijada y se avisa en el mensaje.
- Con una copia fijada fuera de la ventana, el total puede ser 11: la ventana de
  10 más la fijada.

### Dónde quedan y quién las ve

`storage/backups/` (protegido por el `.htaccess` de `storage/`). El panel
**Datos y respaldo** solo lo ve la **cuenta que instaló la aplicación**
(`users.is_admin = 1`): una copia completa incluye los datos de **todas las
empresas**, así que no puede quedar al alcance de un propietario de empresa. Un
miembro con rol `owner` de su empresa recibe un 422 explicándolo.

### Avisos

- El panel avisa si **no hay ninguna copia** o si la última tiene **más de 30
  días**.
- La integridad de la base se comprueba **una vez al día** (`PRAGMA
  quick_check`, cacheado en `storage/cache/salud-base.json`) y, si falla, el
  panel muestra un aviso rojo permanente hasta que se resuelva.

---

## 3. Restaurar una copia

> La restauración **no** se hace desde la interfaz en esta versión. Reemplazar la
> base con el servidor abierto puede corromperla, así que el procedimiento es
> manual, con la aplicación detenida y verificando antes.

1. **Comprueba la copia** sin tocar la instalación:
   ```bash
   unzip normia-<fecha>.zip -d copia
   sqlite3 copia/storage/normia-<id>.sqlite "PRAGMA integrity_check; PRAGMA foreign_key_check;"
   ```
   Debe responder `ok` y no devolver filas.
2. **Detén** el servidor web o cierra la aplicación de escritorio.
3. **Aparta** lo actual, sin borrar:
   ```bash
   mv storage storage-anterior-$(date +%Y%m%d-%H%M)
   ```
4. **Copia** del respaldo a su sitio:
   ```bash
   mkdir -p storage
   cp copia/config/config.php config/config.php
   cp copia/storage/normia-<id>.sqlite storage/
   cp -R copia/storage/plugins storage/ 2>/dev/null || true
   ```
   Ajusta permisos (`chmod 660` para la base, `640` para la configuración).
5. **Abre** la aplicación. Si la copia es de una versión anterior del esquema, la
   migración la pondrá al día sola al primer arranque.
6. Comprueba panel, proyectos, empresas y una fotografía de verificación.
7. Si algo no cuadra, **vuelve atrás**: detén el servidor, aparta lo nuevo y
   devuelve `storage-anterior-<fecha>` a su sitio.

---

## 4. Actualizar y revertir la aplicación

### Actualizar

1. Respaldo desde el panel (**Crear respaldo**) y descárgalo fuera del equipo.
2. Sustituye el código por el del paquete nuevo, conservando `config/` y
   `storage/`.
3. Abre la aplicación: `Migrations::run()` aplica los pasos que falten.
4. Si la migración falla, la aplicación **no arranca a medias**: muestra el error,
   la versión no cambia y el detalle queda en `storage/logs/migraciones.log` y
   `storage/last-error.log`.

### Revertir (volver a la versión anterior del software)

SQLite no baja `user_version` al revés: el código anterior no entiende las
columnas y tablas nuevas, pero las ignora. Dos caminos:

- **Reversión blanda** (la habitual): vuelve a poner el código anterior sobre la
  misma base. Las tablas nuevas (`schema_migrations`, `organizations`,
  `memberships`, `floor_versions.pinned`) quedan sin usar. **No** vuelvas a guardar
  planos con el código antiguo y luego al nuevo sin respaldo: los datos nuevos
  (membresías, roles) se pierden al no existir en el esquema antiguo.
- **Reversión completa**: restaura el respaldo previo a la actualización siguiendo
  la sección 3. Es la única forma de dejar la base exactamente como estaba.

---

## 5. Migraciones versionadas

- `Migrations::VERSION` (hoy **7**) es la versión que espera el código.
- `PRAGMA user_version` manda para decidir rápido si hace falta migrar.
- `schema_migrations (version, name, checksum, duration_ms, applied_at)` es la
  bitácora auditable.
- Cada paso corre **en su propia transacción** y solo sube `user_version` si
  terminó bien.
- El paso 6 (empresas) maneja él mismo `PRAGMA foreign_keys`, que SQLite ignora
  dentro de una transacción.
- Si un paso falla: se revierte, la versión **no** avanza, se escribe en
  `storage/logs/migraciones.log` y se lanza `SchemaException`, que detiene la
  petición con un mensaje accionable.

Comprobar el estado:

```php
App\Core\Migrations::pending();   // true si falta algún paso
App\Core\Migrations::ledger();    // filas de schema_migrations
```

---

## 6. Restaurar una versión del plano

`Floor::restoreVersion()` ahora **comprueba cuántas filas cambió** el `UPDATE`.
Si otra persona guardó entre la lectura y la escritura, no se toca nada, no se
inserta en el historial y se lanza `VersionConflictException`; la API responde
**409** con `current_version`. Antes la fila se insertaba igualmente y el
historial podía registrar como vigente un diseño que nunca lo estuvo.

La autorización multiempresa se mantiene: la consulta exige membresía y rol
`owner`, `admin` o `editor`.

---

## 7. Cuerpos JSON

Antes, un cuerpo vacío, uno ilegible y uno de más de 2,5 MB devolvían los tres
`[]` y acababan en un 422 «no contiene un diseño válido». Ahora:

| Caso | Estado | `code` |
| --- | --- | --- |
| Cuerpo vacío (con `Content-Type: application/json`) | 400 | `empty_body` |
| JSON mal formado o que no es objeto | 400 | `invalid_json` |
| Más de 2,5 MB | 413 | `payload_too_large` |
| JSON válido al que le faltan campos | 422 | `validation` / `invalid` |

El límite vive en `Request::MAX_JSON_BYTES` y el mensaje del 413 explica cuánto y
qué hacer. Los formularios normales (multipart, urlencoded) no pasan por esta
puerta y siguen funcionando igual.

---

## 8. Conservación de versiones

`VersionRetention::plan()` no borra nada: dice qué se conservaría y qué se podría
retirar. Política:

- todo lo de los **últimos 30 días**;
- de 30 a 180 días, **una por día** (la última de cada día);
- de 180 días en adelante, **una por mes**;
- **nunca**: la versión vigente, la inicial, la última ni las fijadas a mano;
- sin fecha legible: se conserva.

`prune()` recalcula el plan en el momento de borrar y solo elimina los ids que
**siguen siendo candidatos**: si alguien fijó una versión entretanto, se queda.
Además:

- se ejecuta **solo a mano**, desde *Historial y conservación* del piso;
- antes de borrar se crea un **respaldo** (`antes-de-podar`); si el respaldo
  falla, **no se borra nada**;
- el resultado se anota en `storage/logs/retencion.log`.

---

## 9. Pruebas

`tests/php/stability.mjs` (45 comprobaciones, en PHP 8.1 y 8.3) cubre:

- panel de respaldo, creación, descarga del ZIP y de la base;
- verificación aislada de una copia y detección de un archivo corrupto;
- que la **fotografía** de verificación viaja dentro de la copia;
- rotación con copia fijada;
- que una cuenta que no instaló la aplicación **no** accede al respaldo;
- bitácora de migraciones completa y sin trabajo pendiente;
- migración que falla: excepción, versión intacta, datos y empresas intactos;
- restauración de versión y conflicto de carrera sin insertar filas;
- los cuatro casos de cuerpo JSON (400/400/413/422) y un guardado correcto;
- política de conservación: protección de vigente, inicial y fijadas, borrado
  solo de lo seleccionado, y que la poda nunca vacía el historial.

---

## 10. Límites conocidos

- **No hay restauración desde la interfaz** ni copia programada: se crea a mano y
  se descarga.
- La rotación puede eliminar copias antiguas no fijadas (por diseño, con aviso).
- No hay copia fuera del equipo: si el disco se pierde junto con
  `storage/backups`, se pierden también las copias. **Descarga y guarda fuera.**
- El ZIP no se cifra: contiene datos personales y fotografías.
- La verificación diaria usa `quick_check`; la completa se hace sobre cada copia.
- Sin envío de correo ni notificaciones: el aviso de «sin respaldo» se ve al
  entrar al panel.
