# Distribución: macOS, Windows y Android

Normia Planos CAD se entrega de cuatro formas. Antes de la versión 1.9.0 solo
existía el paquete web (un ZIP que se descomprime en un servidor con PHP). Esta
guía cubre las tres que no necesitan instalar PHP ni un servidor: la aplicación
de escritorio **nativa** (esta página), la edición **Electron** —mismo motor en
macOS, Windows y Linux, con PHP compilado a WebAssembly; ver
[`ELECTRON.md`](ELECTRON.md)— y el APK de Android.

| Plataforma | Archivo | Requisitos | Cómo se arma |
| --- | --- | --- | --- |
| macOS 12 Monterey o superior (Intel y Apple Silicon) | `normia-planos-cad-<versión>-macos-x64.pkg` / `…-arm64.pkg` | El sistema que ya tienes. Nada más. | `dist-desktop.yml` en un Mac |
| Windows 10 y 11 de 64 bits | `normia-planos-cad-<versión>-windows-x64.exe` | El sistema que ya tienes. Nada más. | `dist-desktop.yml` en un equipo Windows |
| Android 8.0 o superior | `normia-planos-cad-<versión>-android.apk` | Un teléfono o tableta con WebView actualizado | `dist-android.yml` |

Los tres paquetes llevan el editor completo: proyectos, pisos, bibliotecas,
auditor, extintores, pliego, rutas, presentación, versiones y exportaciones.

> **Aviso importante.** Los planos que produce el editor son **esquemáticos**.
> Sirven para comunicación interna, inducción y simulacros. No son planos de
> obra ni certifican cumplimiento normativo. Verifica en el sitio las
> dimensiones, las rutas, los anchos de paso y la escala.

---

## Windows 10 y 11

### Qué contiene el instalador

Un instalador de Inno Setup que copia la aplicación en
`%LOCALAPPDATA%\Programs\Normia Planos CAD`, crea los accesos «Iniciar Normia» y
«Detener Normia» y añade los accesos de carpeta y escritorio que elijas. **No
pide permisos de administrador** y no toca el registro más allá de lo necesario
para desinstalar.

Dentro viaja un PHP 8.3 para Windows de 64 bits con `pdo_sqlite`, `sqlite3`,
`mbstring`, `openssl` y las extensiones que usa la aplicación. No hace falta
instalar PHP, Apache ni nada más.

### Instalar

1. Descarga `normia-planos-cad-<versión>-windows-x64.exe`.
2. Ábrelo. Windows SmartScreen mostrará **«Windows protegió su PC»** porque el
   instalador no tiene certificado de firma de código (ver [SmartScreen](#windows-smartscreen)).
3. Pulsa **Más información → Ejecutar de todas formas**.
4. Sigue el asistente y abre «Iniciar Normia» desde el escritorio.

### Primer arranque

El lanzador busca un puerto libre en `127.0.0.1`, arranca el servidor interno y
abre el navegador en la pantalla de instalación. La primera vez hay que crear la
cuenta administradora y, si se quiere, cargar la demo.

El servidor local **no sale a la red**: escucha solo en `127.0.0.1`, que es esta
computadora. Además, el enrutador del escritorio bloquea `app/`, `config/`,
`resources/`, `storage/`, `tests/` y `tools/`, de modo que nadie puede descargar
la base de datos ni el archivo de configuración aunque comparta la red.

### Dónde quedan los datos

```text
%LOCALAPPDATA%\Normia\
├── config\config.php          clave de la aplicación
└── storage\
    ├── normia-<16 hex>.sqlite base de datos
    ├── sessions\              sesiones
    └── logs\                  registro del servidor
```

La carpeta del programa es independiente: desinstalar **no borra** los planos.
Si quieres borrarlos, elimina `%LOCALAPPDATA%\Normia` a mano.

### Detener el servidor

- Menú Inicio → **Detener Normia**;
- o el acceso «Detener Normia» de la carpeta de instalación;
- o cierra sesión en Windows: el lanzador detiene el servidor con la sesión.

### Windows SmartScreen

Windows muestra el aviso porque el instalador está firmado solo con una clave
propia, no con un certificado de firma de código emitido por una autoridad de
confianza (que cuesta entre 200 y 600 USD al año).

Si quieres evitar el aviso en una red de tu organización, el instalador es el
mismo y la decisión es de tu área de sistemas: se puede firmar con el
certificado de la empresa o distribuir por políticas de grupo.

### Windows 7, 8 y 8.1

**No están soportados** y no hay paquete para ellos, por dos motivos concretos:

1. **PHP 8.x no funciona en Windows 7.** El manual de PHP exige Windows 8 o
   Server 2012 como mínimo; el intérprete que se empaqueta es PHP 8.3.
2. **No hay navegador moderno.** Chrome y Edge dejaron de actualizarse en
   Windows 7/8/8.1 en 2023 (versión 109). Firefox 115 ESR fue el último y su
   mantenimiento terminó a comienzos de 2026. El editor usa características
   actuales de JavaScript y CSS y no se puede garantizar en esos navegadores.

La alternativa para un equipo con Windows 7 es publicar el paquete web en un
servidor con PHP 8.1 o superior y abrirlo con el navegador más reciente que
admita ese equipo, asumiendo que ya no recibe actualizaciones de seguridad.

---

## macOS 12 Monterey o superior

> **Si tu Mac no pasa de macOS 12.** Esta edición nativa funciona en Monterey
> porque usa el navegador del sistema. La edición Electron también, desde la
> **1.11.1**: su `DMG` se compila con Electron 43 y declara
> `LSMinimumSystemVersion 12.0`. Los `DMG` de la 1.11.0 (Electron 45) piden
> macOS 13 y no abren en Monterey; si los tienes descargados, usa el `.pkg` de
> esta edición o el `DMG` de la 1.11.1 o posterior.
>
> **Si al abrir la edición Electron aparece** «Cannot find package
> '@php-wasm/node' imported from …/Resources/runtime/php-wasm.mjs», es el `DMG`
> de la **1.11.1**: el empaquetador descartó `runtime/node_modules` y el
> intérprete quedó sin sus dependencias. No se arregla reinstalando ni
> cambiando permisos; la **1.12.0** corrige el empaquetado, revisa el instalador
> terminado y prueba el intérprete desde una copia aislada. Mientras tanto, la
> edición nativa `.pkg` de macOS abre sin problema.

### Qué contiene el instalador

Un `.pkg` que copia `Normia Planos CAD.app` en `/Aplicaciones`. La app incluye
PHP 8.3 estático para macOS y un lanzador que arranca el servidor interno en
`127.0.0.1` y abre el navegador.

Hay dos paquetes porque son dos arquitecturas distintas:

- `…-macos-arm64.pkg` para equipos con Apple Silicon (M1 y posteriores);
- `…-macos-x64.pkg` para equipos Intel.

### Instalar

1. Descarga el paquete que corresponda a tu equipo (menú Apple → «Acerca de esta
   Mac» → «Chip»).
2. Ábrelo. macOS mostrará que **no puede verificar el desarrollador** porque el
   paquete no está notarizado (ver [Gatekeeper](#macos-gatekeeper)).
3. Abre `Normia Planos CAD.app` con clic derecho → **Abrir** y confirma.
4. El lanzador abre el navegador en la pantalla de instalación.

### Dónde quedan los datos

```text
~/Library/Application Support/Normia/
├── config/config.php
└── storage/
    ├── normia-<16 hex>.sqlite
    ├── sessions/
    └── logs/
```

Desinstalar la app (arrastrarla a la papelera) no borra esa carpeta.

### macOS Gatekeeper

El paquete está firmado en **modo ad-hoc** (`codesign -s -`): macOS puede
comprobar que el binario no fue alterado, pero no puede saber quién lo firmó,
porque no hay cuenta de desarrollador de Apple (99 USD al año) ni proceso de
notarización.

Al abrir la app por primera vez, macOS puede mostrar «no se puede abrir porque es
de un desarrollador no identificado». Las opciones son:

- **Clic derecho → Abrir** y luego **Abrir** en el diálogo. Solo hace falta una
  vez.
- O en **Ajustes del Sistema → Privacidad y seguridad**, permitir la app que
  acabas de intentar abrir.

Si en tu organización hay un Mac administrado, el área de sistemas puede firmar
y notarizar la app con su cuenta de Apple Developer.

### Detener el servidor

El lanzador se puede controlar desde la Terminal:

```sh
"/Applications/Normia Planos CAD.app/Contents/MacOS/Normia" --status
"/Applications/Normia Planos CAD.app/Contents/MacOS/Normia" --stop
```

La app también se detiene al cerrar sesión en el Mac.

---

## Android

### Qué contiene el APK

El editor completo dentro de un `WebView`. En el teléfono no hay un servidor
remoto: PHP 8.3 se ejecuta compilado a **WebAssembly** dentro de la propia app y
atiende cada página, cada formulario y cada llamada del editor. Por eso funciona
sin conexión y **el APK no pide permiso de red**.

- **Android 8.0 (API 26) o superior.** El editor necesita un WebView
  actualizado (Chrome); en equipos con WebView muy antiguo la app muestra una
  pantalla de diagnóstico en vez de quedarse en blanco.
- **El guardado no frena la pantalla.** Cada petición solo marca que hay
  cambios; el guardado ocurre aparte, agrupado, y escribe únicamente los
  archivos que cambiaron. Al pasar a segundo plano o cerrar se guarda lo
  pendiente. Si el editor no dibuja nada en ocho segundos, la pantalla de
  arranque vuelve con el diagnóstico en vez de quedarse en blanco.
- **Los datos se guardan en el teléfono.** `config/` y `storage/` viven en el
  sistema de archivos privado del navegador (OPFS,
  `navigator.storage.getDirectory()`), con la API del estándar:
  `getDirectoryHandle()` y `getFileHandle()`. Esa pieza está en
  `tools/android/web/opfs.js` y las pruebas la ejecutan contra una
  implementación que solo expone esos nombres. Si el teléfono no ofrece
  almacenamiento —o se queda sin espacio— la app **abre igual**, avisa en la
  franja superior y deja el motivo en el registro, en vez de no arrancar.
- **Dos compilaciones del intérprete.** El paquete PHP trae el motor en
  `asyncify` y en `jspi`; el APK lleva **las dos** y la pantalla pide la que
  admite el navegador, consultando la misma detección que usa el cargador
  (`jspi()` de `wasm-feature-detect`, reexportada por `php/runtime.js`). Antes
  solo viajaba `asyncify` y en Android 15 (Chrome 137 o posterior) el arranque
  moría con `Import #0 "env" "invoke_ii": function import requires a callable`
  (corregido en la **1.15.3**).
- **La pantalla viaja dentro del APK.** `tools/android/build.mjs` copia las
  tripas de `assets/` (`css/`, `img/`, `js/`…) a la **raíz** de
  `app/src/main/assets/`, junto a la pantalla contenedora y al intérprete. El
  contenedor la sirve con `WebViewAssetLoader` bajo el prefijo `/assets/`, así
  que `https://appassets.androidplatform.net/assets/index.html` abre la pantalla
  y `/assets/css/app.css` encuentra el archivo `css/app.css`: el cargador
  descarta el prefijo antes de buscar. Con la aplicación en `assets/www/` el HTML
  cargaba «en crudo», sin estilos ni scripts (corregido en la **1.15.1**).
  `tools/android/check.mjs` pide las páginas al intérprete y comprueba que
  **cada** ruta `/assets/…` exista en el APK antes de compilar.
- Unos 80 MB de espacio desde la 1.15.3 (dos compilaciones del intérprete, ~17 MB cada una); los planos ocupan pocos cientos de KB más.
- Descargas en la carpeta **Descargas** del teléfono.
- Impresión con el servicio de impresión de Android (y «Guardar como PDF»).

### Instalar

1. Copia `normia-planos-cad-<versión>-android.apk` al teléfono.
2. Ábrelo. Android pedirá permitir la instalación de apps de esta fuente.
3. Acepta y abre **Normia Planos CAD**.
4. La primera vez hay que crear la cuenta administradora. Los datos quedan en el
   almacenamiento privado de la app; desinstalarla los borra.

### Qué esperar

- La primera pantalla tarda unos segundos: está arrancando el intérprete y
  montando la aplicación. En un equipo modesto puede llegar a diez segundos.
- El guardado es local. Para llevar un plano a otro equipo, usa
  **Exportar JSON** y vuelve a importarlo.
- Al cerrar la app se cierra la sesión; los planos quedan guardados y hay que
  volver a entrar con el correo y la contraseña.
- La impresión abre el diálogo de Android: elige una impresora o «Guardar como
  PDF».

### Sobre la firma del APK

Android exige que todo APK esté firmado. No hay cuenta de Google Play: el flujo
de trabajo genera una clave autofirmada con `keytool` o usa la que esté guardada
en los secretos del repositorio (`ANDROID_KEYSTORE_BASE64` y
`ANDROID_KEYSTORE_PASSWORD`).

Si la clave es distinta entre dos versiones, Android no deja actualizar sin
desinstalar antes (y desinstalar borra los datos de la app). Para conservar los
planos entre versiones, guarda una clave fija en los secretos del repositorio.

### Estado de esta entrega

El paquete que viaja dentro del APK **se verifica automáticamente**: el flujo
arranca el intérprete, monta la aplicación, crea la base, entra, abre el editor y
comprueba que el motor de extintores responde (`tools/android/check.mjs`). Lo que
no se puede probar sin un dispositivo es el `WebView` y el contenedor nativo, así
que esta primera versión del APK está **en validación**: si algo falla, la app
muestra un registro de los pasos con un botón para copiarlo.

---

## Cómo se generan los paquetes

Los binarios no se generan en el repositorio ni en una computadora cualquiera:
se generan en GitHub Actions, en el sistema operativo de destino.

| Flujo | Qué hace |
| --- | --- |
| `.github/workflows/verify.yml` | Corre la suite completa en PHP 8.1 y 8.3 en cada cambio y cada pull request. |
| `.github/workflows/dist-desktop.yml` | Descarga `static-php-cli` con su SHA-256 fijado, compila PHP 8.3 estático, arma la app, genera el `.pkg` o el `.exe`, **lo instala y arranca** y solo entonces lo publica. |
| `.github/workflows/dist-android.yml` | Arma el paquete web del editor, verifica que el intérprete arranca, compila el APK con Gradle, lo firma y lo verifica con `apksigner`. |

En una computadora con el SDK correspondiente también se pueden generar a mano:

Para comprobar el intérprete del paquete, sin abrir nada:

```sh
"Normia Planos CAD.app/Contents/MacOS/Normia" --check      # macOS
"dist\win-app\runtime\php.exe" "dist\win-app\tools\desktop\launcher.php" --check   # Windows
```

Dice la versión de PHP, el binario y si están las extensiones que usa la
aplicación (`pdo_sqlite`, `sqlite3`, `mbstring`, `openssl`, `fileinfo`,
`session`). En Windows el lanzador carga las extensiones con la ruta absoluta de
la carpeta `ext/` que viaja en el paquete, así que no depende del `php.ini` del
equipo que lo compiló.

```sh
# macOS (necesita Xcode Command Line Tools)
node tools/desktop/build.mjs --platform=mac --php=/ruta/al/php --out=dist --arch=arm64

# Windows (necesita Inno Setup 6)
node tools/desktop/build.mjs --platform=win --php=C:\php --out=dist

# Android (necesita JDK 17 y el SDK de Android)
npm install
node tools/android/build.mjs
node tools/android/check.mjs
node tools/android/build.mjs --apk
```

---

## Problemas frecuentes

| Síntoma | Qué hacer |
| --- | --- |
| El navegador no abre al iniciar | Abre `http://127.0.0.1:8790/index.php?r=` a mano. El lanzador escribe el puerto en `storage/normia-desktop.json`. |
| «Ya había una instancia abierta» | El lanzador reutiliza la ventana existente. Detén la anterior con «Detener Normia». |
| El instalador no arranca en Windows | SmartScreen: «Más información → Ejecutar de todas formas». |
| macOS dice que la app está dañada | Suele ser la cuarentena de un archivo descargado: clic derecho → Abrir. Si persiste, `xattr -dr com.apple.quarantine "/Applications/Normia Planos CAD.app"`. |
| Android se queda en blanco nada más abrir | APK de la **1.15.5** o anterior: sin base de datos la raíz responde un 303 al instalador y la pantalla lo trataba como una descarga, así que no dibujaba nada. Instala la **1.15.6** o posterior, que sigue la redirección. |
| Android se queda en blanco y al reabrir vuelve a pedir la instalación | APK de la **1.15.4** o anterior: el guardado bloqueaba cada recurso de la pantalla y, si se cerraba a media escritura, los datos no quedaban. Instala la **1.15.5** o posterior. |
| Android muestra `TypeError: root.getDirectory is not a function` | APK de la **1.15.3**: llamaba a `getDirectory()`, que no existe en el sistema de archivos del navegador (es `getDirectoryHandle()`). Instala la 1.15.4 o posterior. |
| Android muestra un `LinkError` con `Import #0 "env" "invoke_ii"` | APK anterior a la **1.15.3**: llevaba solo el intérprete `asyncify` y el WebView de Android 15 pedía el cargador `jspi`. Instala la 1.15.3 o posterior. |
| La app de Android se queda en la pantalla de arranque | Pulsa **Reintentar**; si vuelve a fallar, abre **Cómo reportar el problema** y envía el texto con el modelo del equipo y la versión de Android. |
| Android muestra «la página web no está disponible · `net::ERR_INVALID_RESPONSE`» | Es un APK anterior a la **1.15.1**: buscaba la pantalla en `…/index.html` o dejaba los estáticos fuera de sitio. Instala el APK de la 1.15.1 o posterior. Desde la 1.15.1, si algo no carga, la app muestra un aviso propio con el código y un botón **Reintentar**. |
| Android abre el editor «en crudo», sin estilos | APK de la **1.14.2**: la aplicación estaba en `assets/www/` y sus rutas `/assets/…` no encontraban los archivos. Instala la 1.15.1. |
| Android no deja instalar la actualización | El APK nuevo está firmado con otra clave. Desinstala la versión anterior (eso borra los datos de la app: exporta antes los planos) o guarda una clave fija en los secretos del repositorio. |
| Quiero empezar de cero | Detén la app, borra la carpeta de datos (`%LOCALAPPDATA%\Normia`, `~/Library/Application Support/Normia` o los datos de la app en Android) y vuelve a abrir. |

---

## Sobre la seguridad

- El servidor del escritorio escucha **solo** en `127.0.0.1`; no se puede
  alcanzar desde otra computadora de la red.
- El APK **no declara el permiso de internet**. Todo ocurre dentro del equipo.
- No se envían planos, cuentas ni telemetría a ningún servicio.
- La contraseña se guarda con `password_hash` y la base SQLite no se cifra: usa
  el cifrado de disco del sistema operativo si el equipo se comparte.
