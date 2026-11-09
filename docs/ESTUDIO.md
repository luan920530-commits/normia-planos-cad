# Normia Estudio · el editor suelto

**Normia Estudio** es la edición de escritorio que trae **solo el editor**. No hay
portada, ni cuentas, ni proyectos, ni base de datos: se abre y se dibuja. El plano
es un **archivo** que se abre y se guarda donde la persona quiera —el Escritorio,
una carpeta de iCloud Drive, un pendrive— y ese archivo se puede importar después
en un proyecto de la edición completa, sin conversiones.

| Plataforma | Archivo | Requisitos |
| --- | --- | --- |
| macOS 12 Monterey o superior · Intel y Apple Silicon | `normia-estudio-<versión>-macos-arm64.dmg` · `…-macos-x64.dmg` | Ninguno adicional |
| Windows 10 y 11 de 64 bits | `normia-estudio-<versión>-windows-x64-instalador.exe` | Ninguno adicional |
| Linux de 64 bits | `normia-estudio-<versión>-linux-x64.AppImage` | `libfuse2` o `--appimage-extract-and-run` |

> **Por qué macOS 12 y no 13.** Se compila con **Electron 43**, la última rama que
> abre en **macOS 12 Monterey** (Electron 39–43). Electron 44 subió el mínimo a
> macOS 13. La versión está **fijada a propósito** y el paquete declara
> `LSMinimumSystemVersion 12.0`; el flujo lee ese valor del `.app` ya compilado y
> **falla** si algún día pide más de 12.

> **Firma.** No hay certificados de Apple ni de Microsoft. macOS puede mostrar el
> aviso de Gatekeeper y Windows el de SmartScreen. Las instrucciones están más
> abajo: no son un defecto del paquete y no se promete lo que no se tiene.

---

## 1. Qué es y qué no es

**Es** el editor completo: muros (con la pluma de nodos de la 1.27.0 y arcos de
tres puntos), puertas, biblioteca de señales y objetos CAD, redes y circuitos,
vías y andenes, capas, deshacer, inspector, guía de primeros pasos, modo
presentación, auditor, informe, impresión con escala física y exportaciones.

**No es** la aplicación con cuentas: no hay empresas, ni personas, ni roles, ni
versiones guardadas en una base de datos, ni modo brigadista, ni verificación
física, ni respaldos del servidor. El historial de versiones es **el archivo**:
cada vez que se guarda queda lo que hay en el lienzo, y el historial de deshacer
vive mientras la ventana está abierta.

| Pieza | Edición completa | Normia Estudio |
| --- | --- | --- |
| Portada, acceso y cuentas | sí | **no** |
| Proyectos, pisos y empresas | sí | **no** (un plano = un archivo) |
| Base de datos SQLite | sí | **no** |
| Editor, biblioteca y auditor | sí | **sí** |
| Informe, impresión y SVG con escala | sí | **sí** |
| Versiones del piso y borradores | sí | **no** (el archivo manda) |

---

## 2. Cómo funciona

```
Electron
 ├── ventana (Chromium) ──► http://127.0.0.1:<puerto libre>/index.php?r=estudio
 └── proceso principal
      ├── servidor HTTP local (Node)
      ├── PHP 8.3 compilado a WebAssembly (@php-wasm/node)
      └── archivos del plano (abrir, guardar, recientes)
```

- **El servidor se enlaza solo a `127.0.0.1`**, en un puerto libre que se pide al
  sistema. No se abre nada a la red y no hace falta permiso de cortafuegos.
- **PHP no ve el disco del equipo**: solo se montan la carpeta de la aplicación y
  la de datos. Los archivos del plano los lee y los escribe el **proceso
  principal** de Electron, que es el que abre los diálogos del sistema; la página
  nunca toca el disco.
- **Por qué hay PHP dentro de una app «sin servidor»**: el auditor, el informe, la
  impresión con escala física y el SVG se calculan con el mismo código que la
  edición completa. Se prefirió reutilizarlo antes que reescribir esos cálculos en
  JavaScript y acabar con dos versiones que miden distinto.
- **La copia del plano en la sesión** es solo un espejo: cuando se pide el
  informe, la impresión o el SVG, el editor manda el plano en curso al servidor
  local para que lo calcule. El archivo sigue siendo la verdad.
- **Sin base de datos**: el modo estudio no crea tablas, no migra nada y no toca
  `storage/` salvo su registro. `user_version` no aparece por ninguna parte.
- **Carpeta de datos** (registro y sesión del espejo):
  - macOS: `~/Library/Application Support/Normia Estudio/datos`
  - Windows: `%APPDATA%\Normia Estudio\datos`
  - Linux: `~/.config/Normia Estudio/datos`

---

## 3. Abrir, guardar y empezar de cero

| Acción | Atajo | Qué hace |
| --- | --- | --- |
| Plano nuevo | `⌘N` / `Ctrl+N` | Lienzo A4 horizontal a 1:100, en blanco |
| Abrir… | `⌘O` / `Ctrl+O` | Diálogo del sistema; acepta `.json` de Normia |
| Guardar | `⌘S` / `Ctrl+S` | Escribe en el archivo abierto (si no hay, pregunta dónde) |
| Guardar como… | `⇧⌘S` / `Ctrl+Shift+S` | Siempre pregunta dónde |
| Abrir reciente | menú **Archivo** | Los últimos diez archivos, con su ruta |

- **Guardar dos veces seguidas no duplica nada**: el archivo se reescribe y el
  título pierde el punto de «cambios sin guardar».
- **Cerrar con cambios pendientes pregunta**: *Guardar y cerrar*, *Salir sin
  guardar* o *Cancelar*. Nunca se pierde trabajo en silencio.
- **Abrir un archivo desde el sistema** (doble clic, *Abrir con…*) funciona: si la
  aplicación ya está abierta, la ventana existente carga ese plano.
- **Soltar un plano sobre la ventana también lo abre**: mientras arrastras, un
  borde discontinuo y una pastilla avisan de lo que va a pasar. Antes de
  reemplazar el lienzo se pregunta si había cambios sin guardar, y soltar otra
  cosa (una foto, un PDF) no hace nada más que decirlo.
- **Abrir reciente se limpia solo**: si un archivo se movió o se borró, sale de
  la lista en vez de quedarse como una entrada que ya no abre nada.
- **El archivo guardado es el sobre oficial** (`application:
  normia-planos-cad`, `format: normia-plan`, `schema_version: 3`): el mismo que
  exporta la edición completa y el mismo que su importador acepta. Un plano
  dibujado en el estudio se puede llevar a un proyecto sin tocar una coma.

---

## 4. Documentos: informe, impresión y exportaciones

Todo esto se calcula con el mismo motor que la edición completa:

- **Revisión** (cajón del editor): recorridos, salidas, anchos, aforo, señalización,
  primeros auxilios, escenarios y simulacro. El botón **Informe** abre el informe
  imprimible del plano **en curso**, sin haber guardado antes.
- **Exportar → SVG / PNG / JSON / Imprimir**: el SVG y la impresión llevan **escala
  física** (la hoja y la escala se eligen en la impresión) y el **pie del plano**
  con el nombre, la escala, la unidad y la nota de la aplicación.
- **Los documentos dicen lo que no comprueban**: el informe declara sus umbrales
  como criterios de la aplicación y no como un dictamen ni una certificación.

---

## 5. Qué no cambia respecto de la edición completa

- **Las cifras**: los cálculos son los mismos, byte a byte, porque es el mismo
  código en PHP. El golden de regresión numérica cubre ese motor.
- **El formato del plano**: el mismo documento. Un archivo del estudio importado
  en un proyecto se ve igual, con sus capas, curvas y medidas declaradas.
- **La advertencia**: los planos siguen siendo **esquemáticos**. Sirven para
  comunicar, inducir y preparar simulacros; no son planos de obra ni certifican
  cumplimiento normativo.

---

## 6. Compilar

### Descargar los instaladores ya compilados

Los instaladores no se adjuntan al repositorio: los produce **GitHub Actions** y
se descargan del trabajo que los compiló.

1. GitHub → pestaña **Actions** → **Distribución de Normia Estudio (solo editor)**.
2. Abre el trabajo de la versión que buscas (por ejemplo el del tag `v1.28.0`).
3. Abajo, en **Artifacts**, descarga el de tu sistema:

| Sistema | Artefacto | Archivo dentro |
| --- | --- | --- |
| macOS Intel (Monterey o superior) | `normia-estudio-macos-15-intel-x64` | `normia-estudio-<versión>-macos-x64.dmg` |
| macOS Apple Silicon | `normia-estudio-macos-latest-arm64` | `normia-estudio-<versión>-macos-arm64.dmg` |
| Windows 10/11 de 64 bits | `normia-estudio-windows-latest-x64` | `normia-estudio-<versión>-windows-x64-instalador.exe` |
| Linux de 64 bits | `normia-estudio-ubuntu-latest-x64` | `normia-estudio-<versión>-linux-x64.AppImage` |

- Los artefactos son **ZIP**, con el instalador y su `SHA256SUMS.txt` dentro; se
  conservan **30 días**.
- El flujo se puede lanzar a mano (**Run workflow**) porque escucha
  `workflow_dispatch`, además de los tags `v*`.
- **El `.dmg` no se puede compilar fuera de macOS**: en Linux o Windows solo se
  obtienen el `.exe` y el `.AppImage`. Por eso, si el trabajo de macOS no ha
  corrido, el `.dmg` no existe en ninguna parte.
- Si un sistema falla, el motivo aparece como **anotación** del trabajo (no hace
  falta abrir el registro completo).

En el equipo de desarrollo (necesita Node ≥ 22 y `npm install`):

```sh
# Arma la carpeta (sin instalador) y comprueba el intérprete
node tools/electron/build.mjs --modo=estudio --out=dist/estudio --sin-instalador

# Instaladores: macOS (Intel o Apple Silicon), Windows y Linux
npm install --no-save electron@43 electron-builder@26
node tools/electron/build.mjs --modo=estudio --out=dist/estudio --arch=arm64
```

Los instaladores de las tres plataformas los compila **GitHub Actions** en el
flujo **Distribución de Normia Estudio (solo editor)**
(`.github/workflows/dist-estudio.yml`): un trabajo por sistema, con la
comprobación del contenido del paquete, el mínimo de macOS leído del `.app` y las
sumas SHA-256.

`--check` informa del intérprete sin abrir ventana:

```sh
"/Applications/Normia Estudio.app/Contents/MacOS/Normia Estudio" --check
```

---

## 7. Gatekeeper (macOS) y SmartScreen (Windows)

Sin certificado comercial, el sistema avisa la primera vez. El archivo **no está
roto** y no se pide desactivar la seguridad del equipo:

- **macOS**: clic derecho sobre la aplicación → **Abrir** → **Abrir**. Si macOS
  dice que «no se puede abrir porque proviene de un desarrollador no
  identificado», es lo mismo: *Ajustes del sistema → Privacidad y seguridad →
  Abrir de todos modos*.
- **Windows**: **Más información → Ejecutar de todos modos** en el aviso de
  SmartScreen.

Lo que **no** se puede prometer: un instalador firmado y notarizado por Apple o
Microsoft. Eso exige certificados de pago que esta edición no tiene.

---

## 8. Pruebas

| Suite | Qué cubre |
| --- | --- |
| `tests/js/estudio.mjs` (35) | La página abre **sin instalar** nada; no hay portada, pisos ni versiones; los cajones hablan del plano y no de un piso de proyecto; el editor arranca en blanco; el puente guarda, abre y avisa del título; el plano llega al auditor, al informe, a la impresión y al SVG; el JSON es el sobre oficial y se importa en la edición completa; renombrar funciona y los acentos no se pierden en el nombre del archivo; soltar un plano pide abrirlo (y solo un `.json`); los catálogos se sirven sin sesión |
| `tests/js/electron.mjs` (52) | Incluye la edición del estudio: ventana sin Node, puente mínimo, cierre con aviso, diálogos de archivo, arrastrar y soltar, sobre oficial, el flujo de las tres plataformas y **el paquete real abriendo el estudio sin base de datos** |
| `tests/run-all.mjs` | 26 pasos con PHP 8.1 y 8.3: el estudio corre en los dos intérpretes |

---

## 9. Límites conocidos

- **Sin impresión silenciosa**: la impresión abre el diálogo del sistema, igual que
  en la edición completa; no hay «exportar PDF» de un clic sin pasar por el
  diálogo.
- **Sin historial en disco**: si se cierra sin guardar, no hay borrador que
  recuperar (el aviso de cierre es la red de seguridad).
- **Sin sincronización**: dos personas no pueden editar el mismo archivo a la vez;
  si el archivo está en iCloud Drive o en una carpeta compartida, manda la última
  escritura, como con cualquier documento.
- **El plano en curso tiene un tope de tamaño** (2,5 MB de JSON), el mismo del
  importador de la edición completa.
