# Edición Electron (macOS, Windows y Linux)

Esta edición empaqueta el editor completo en una aplicación de escritorio con
Electron. A diferencia de la edición nativa, **no compila un intérprete de PHP
para cada sistema**: PHP 8.3 viaja compilado a WebAssembly dentro del propio
paquete, igual que en el APK de Android. Es el mismo motor en las tres
plataformas, sin servidor que instalar ni extensiones que configurar.

| Plataforma | Archivo | Requisitos |
| --- | --- | --- |
| macOS 12 Monterey o superior · Intel y Apple Silicon | `normia-planos-cad-<versión>-macos-arm64.dmg` · `…-macos-x64.dmg` | Ninguno adicional |
| Windows 10 y 11 de 64 bits | `normia-planos-cad-<versión>-windows-x64-instalador.exe` | Ninguno adicional |
| Linux de 64 bits | `normia-planos-cad-<versión>-linux-x64.AppImage` | `libfuse2` o ejecutar con `--appimage-extract-and-run` |

> **Por qué macOS 12 y no 13.** La edición se compila con **Electron 43**, la
> última rama que abre en **macOS 12 Monterey** (Electron 39–43). Electron 44 y
> posteriores subieron el mínimo a macOS 13 Ventura, así que la versión está
> **fijada a propósito** y el paquete declara `LSMinimumSystemVersion 12.0`.
> Si algún día se sube de rama mayor, hay que cambiar esa declaración
> (`mac.minimumSystemVersion` en `tools/electron/build.mjs`), la tabla de arriba
> y este aviso: el síntoma que ve el usuario es un mensaje de macOS diciendo que
> la aplicación «requiere macOS 13 o posterior».
>
> En macOS 12 también funciona la **edición nativa** (`.pkg`), que usa el
> navegador del sistema y no depende de Electron; ver
> [`ESCRITORIO.md`](ESCRITORIO.md).

## Cómo funciona

```
Electron
 ├── ventana (Chromium) ──► http://127.0.0.1:<puerto libre>
 └── proceso principal
      ├── servidor HTTP local (Node)
      └── PHP 8.3 compilado a WebAssembly (@php-wasm/node)
```

- **El servidor se enlaza solo a `127.0.0.1`** y en un puerto libre que se pide
  al sistema. No se abre nada a la red y no hace falta permiso de cortafuegos.
- **PHP no ve el disco del equipo**: solo se montan la carpeta de la aplicación
  (`/normia/app`) y la de datos (`/normia/datos`).
- **Las cookies las administra Chromium**, no la memoria del proceso: la sesión
  sobrevive a cerrar y abrir la ventana, como en un navegador.
- **Los datos viven en una carpeta normal del usuario** y se pueden abrir desde
  el menú **Archivo → Abrir la carpeta de datos**:
  - macOS: `~/Library/Application Support/Normia Planos CAD/datos`
  - Windows: `%APPDATA%\Normia Planos CAD\datos`
  - Linux: `~/.config/Normia Planos CAD/datos`
- **Copia de seguridad**: **Archivo → Guardar una copia de los datos…** copia la
  carpeta entera a donde elijas, con la fecha en el nombre. Es la forma de mover
  los planos a otro equipo.
- **Descargas**: los planos exportados se guardan en la carpeta de Descargas con
  un nombre libre (no sobrescriben) y la aplicación ofrece abrir la carpeta.
- **Impresión**: el botón de imprimir de la aplicación abre el diálogo del
  sistema en A4, con los fondos incluidos.

`--check` informa el intérprete sin abrir ventana:

```sh
# macOS
"/Applications/Normia Planos CAD.app/Contents/MacOS/Normia Planos CAD" --check
# Windows (instalado por usuario)
"%LOCALAPPDATA%\Programs\Normia Planos CAD\Normia Planos CAD.exe" --check
```

Debe mostrar `PHP 8.3.x (WebAssembly)` y las seis extensiones en ✓
(`pdo_sqlite`, `sqlite3`, `mbstring`, `openssl`, `fileinfo`, `session`).

## Problemas al abrir en macOS

| Mensaje | Causa | Solución |
| --- | --- | --- |
| «Normia Planos CAD no se puede abrir porque requiere macOS 13 o posterior» | Es un DMG compilado con Electron 44 o superior. | Usa el paquete de la **1.11.1** o posterior (Electron 43, macOS 12+) o la edición nativa `.pkg`. |
| «No se puede verificar el desarrollador» | La app no tiene certificado comercial (firma ad-hoc). | **Ajustes del sistema → Privacidad y seguridad → Abrir de todos modos**, o clic derecho → **Abrir**. |
| «La aplicación está dañada y debe moverse a la papelera» | Descarga incompleta o cuarentena de Gatekeeper. | Vuelve a descargar el DMG, comprueba su SHA-256 y arrastra la app a **Aplicaciones** antes de abrirla. No hace falta `sudo` ni desactivar Gatekeeper. |

La arquitectura importa: en un Mac con chip **Intel** va `…-macos-x64.dmg`; en
uno con **Apple Silicon** (M1 o posterior), `…-macos-arm64.dmg`. El `.pkg` de la
edición nativa sigue la misma regla.

## Instalación y avisos del sistema

No hay certificados comerciales de Apple ni de Microsoft; la edición se entrega
sin firmar a propósito y se explica cómo abrirla:

- **macOS.** La aplicación se firma de forma ad-hoc. La primera vez, el sistema
  puede decir que no se puede verificar el desarrollador: abre **Ajustes del
  sistema → Privacidad y seguridad**, revisa el aviso y pulsa **Abrir de todos
  modos**. También sirve clic derecho sobre la aplicación → **Abrir**.
- **Windows.** SmartScreen mostrará un aviso de editor desconocido: **Más
  información → Ejecutar de todos modos**. El instalador es por usuario, no pide
  permisos de administrador y se desinstala desde **Aplicaciones**.
- **Linux.** El `AppImage` necesita permiso de ejecución
  (`chmod +x …AppImage`). En distribuciones sin `libfuse2`, ejecútalo con
  `--appimage-extract-and-run`.

Ninguna de estas tres ediciones promete un instalador sin avisos.

## Qué se guarda y qué no

- La carpeta `app/` del paquete es **solo el programa**: si se actualiza, los
  planos siguen en la carpeta de datos.
- El paquete incluye `resources/app` (código PHP, vistas, estilos y catálogos),
  `resources/runtime` (intérprete de WebAssembly y sus dependencias) y la ventana
  de Electron. No incluye pruebas, flujos de trabajo ni datos de ejemplo.
- Se quitan del intérprete las extensiones que la aplicación no usa (`intl`,
  `xdebug`, `redis`, `memcached`) y los datos de ICU: son casi la mitad del
  tamaño y no hacen falta.
- La aplicación no tiene telemetría ni llamadas externas. Los enlaces externos,
  si aparecen, se abren en el navegador del sistema, nunca dentro de la ventana.

## Diferencias con la edición nativa

| | Nativa (`.pkg` / `.exe`) | Electron |
| --- | --- | --- |
| Intérprete | PHP estático (macOS) o copia de PHP (Windows) | PHP 8.3 en WebAssembly |
| Tamaño instalado | ~40–60 MB | ~260 MB |
| Descarga | ~30–40 MB | ~120–140 MB |
| macOS | un `.pkg` por arquitectura | un `.dmg` por arquitectura |
| Linux | no | sí (`AppImage`) |
| Ventana propia y menús | navegador del sistema | sí |

La edición nativa sigue siendo la recomendada cuando importa el tamaño; la de
Electron, cuando importa tener el mismo binario en las tres plataformas y no
depender de cadenas de compilación de PHP.

## Cómo se construye

```sh
npm install
node tools/electron/build.mjs --out=dist/electron --sin-instalador   # solo arma la carpeta
node tools/electron/build.mjs --out=dist/electron                     # + instalador
```

`build.mjs` copia la aplicación (`tools/shared/app-copy.mjs`), copia el
intérprete con **solo** `@php-wasm/node`, `@php-wasm/node-8-3` y sus
dependencias, escribe un punto de entrada (`runtime/php-wasm.mjs`) y llama a
`electron-builder`. Sin `electron-builder` instalado deja la carpeta armada y lo
avisa.

El flujo `.github/workflows/dist-electron.yml` compila en `macos-latest`,
`macos-15-intel`, `windows-latest` y `ubuntu-latest`, ejecuta `--check` sobre el
paquete ya empaquetado y publica los instaladores con su `SHA256SUMS.txt`.

## Problemas conocidos

- La primera apertura tarda uno o dos segundos más: el intérprete de WebAssembly
  se carga en memoria antes de mostrar la aplicación.
- La base SQLite vive en el sistema de archivos real, pero el intérprete accede
  a ella a través de Node: guardar es algo más lento que en la edición nativa.
- Windows 7, 8 y 8.1 no están soportados: Electron actual exige Windows 10.
- No hay certificado de firma: los avisos de Gatekeeper y SmartScreen están
  documentados arriba y descritos en **Ayuda → Acerca de esta edición**.
