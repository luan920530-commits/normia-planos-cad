# Arquitectura de Normia Planos CAD

Este documento explica cómo está construida la aplicación, por qué se tomaron ciertas decisiones y dónde tocar cada parte. El objetivo de la fase 1 es una aplicación **completa, desplegable y verificable** sin dependencias de ejecución.

## Principios

1. **Sin dependencias de ejecución**: no hay Composer, `node_modules`, CDN ni servicios externos. Todo el código y los recursos viajan en el ZIP.
2. **PHP ≥ 8.1 + SQLite**: suficiente para una instalación por organización, sin administrar un motor de base de datos aparte.
3. **MVC explícito y pequeño**: cada clase tiene una responsabilidad clara y se puede leer de arriba abajo.
4. **Servidor como autoridad**: el cliente dibuja y valida para dar buena experiencia, pero el servidor vuelve a validar todo (tipos, límites, capas, colores, CSRF y propiedad).
5. **Datos locales y respaldo simple**: configuración + un archivo `.sqlite` es todo lo que hay que copiar.
6. **Compatibilidad razonable**: PHP 8.1/8.3, Apache/LiteSpeed o Nginx, navegadores actuales con SVG y Pointer Events.

## Ciclo de una petición

```text
index.php
  └─ bootstrap.php
       ├─ comprueba PHP >= 8.1
       ├─ define BASE_PATH y NORMA_VERSION
       ├─ registra el autoloader PSR-4 (App\ → app/)
       ├─ carga app/Support/helpers.php
       ├─ Config::boot(BASE_PATH)
       └─ fija la zona horaria configurada (America/Bogota por defecto)
  └─ App\Core\Application::run()
       ├─ cabeceras de seguridad
       ├─ Session::start()
       ├─ Router: /index.php?r=<ruta>
       ├─ sin instalación → InstallController (GET/POST install)
       ├─ POST sin CSRF válido → 419
       ├─ sin sesión → 401 (API) o redirección a login
       ├─ el controlador valida y llama a modelos/servicios
       └─ View::render(...) o Response::json(...)
```

Los errores se traducen en un único punto:

| Excepción | Respuesta HTML | Respuesta API |
| --- | --- | --- |
| `ValidationException` | `422` con mensaje | `422 {ok:false, message, errors, code:"validation"}` |
| `DomainException` | `422` | `422 {ok:false, message, code:"invalid"}` |
| `VersionConflictException` | — | `409 {ok:false, code:"version_conflict", current_version}` |
| `Throwable` | `500` genérico + log local | `500` genérico |

## Capa Core

| Clase | Responsabilidad |
| --- | --- |
| `Autoloader` | PSR-4 para `App\` con prefijo `app/`. |
| `Application` | Punto de entrada HTTP, orden de guardas, tabla de rutas y manejo de errores. |
| `Router` | Coincidencia de rutas con parámetros `{id}` y despacho a *closures*. |
| `Request` | Parámetros de query/body, método, JSON, `Accept`, archivos y token CSRF. |
| `Response` | Redirecciones `303`, JSON, descarga de archivos y códigos de estado. |
| `Config` | Carga `config/config.php`, valores por defecto, `isInstalled()` y `isDemoBuild()`. |
| `Session` | `session_start` con nombre y flags, mensajes flash, datos antiguos y regeneración de ID. |
| `Csrf` | Token por sesión, `hash_equals`, integración con formularios y cabecera `X-CSRF-Token`. |
| `Auth` | Usuario actual cacheado, `attempt()` con límite de intentos, `logout()` y `requireUser()`. |
| `Database` | Conexión PDO única, `PRAGMA foreign_keys = ON`, consultas preparadas y transacciones. |
| `View` | Render de vistas PHP con `extract()` controlado y layout; escape con `e()`. |
| `Url` | Rutas `index.php?r=...` y assets locales con versión por `filemtime`. |
| `ValidationException` / `VersionConflictException` | Errores de dominio tipados. |

### Rutas principales

| Método | Ruta | Acción |
| --- | --- | --- |
| GET/POST | `install` | Instalador. |
| GET/POST | `login` | Acceso. |
| POST | `logout` | Cierre de sesión. |
| GET | `` | Panel. |
| GET/POST | `projects/new`, `projects` | Alta de proyecto. |
| GET/POST | `projects/{id}`, `projects/{id}/edit` | Ficha y edición. |
| POST | `projects/{id}/duplicate`, `/delete` | Duplicar y eliminar. |
| POST | `projects/{id}/floors` | Añadir piso. |
| POST | `projects/{id}/floors/{floorId}/duplicate`, `/delete` | Duplicar y eliminar piso. |
| POST | `projects/{id}/import` | Importar JSON/SVG heredado. |
| GET | `projects/{id}/floors/{floorId}/editor` | Editor. |
| GET | `projects/{id}/floors/{floorId}/print` | Hoja imprimible. |
| GET | `projects/{id}/floors/{floorId}/preview.svg` | Miniatura saneada. |
| GET | `…/export/svg`, `…/export/json` | Exportaciones. |
| GET | `api/floors/{id}` | Diseño, metadatos y borrador pendiente. |
| POST | `api/floors/{id}/save` | Guardar versión (bloqueo optimista). |
| POST | `api/floors/{id}/autosave`, `/discard-draft` | Borradores. |
| GET | `api/floors/{id}/versions` | Historial. |
| POST | `api/floors/{id}/versions/{versionId}/restore` | Restaurar como versión nueva. |
| POST | `api/floors/{id}/settings` | Nombre/nivel del piso. |
| GET | `catalogs/signs`, `catalogs/cad` | Catálogos locales. |
| GET/POST | `account/password` | Cambio de contraseña. |

## Datos y persistencia

```sql
users (id, name, email único, password_hash, is_admin, timestamps)
projects (id, user_id → users, name, site, workplace, responsible, notes, timestamps)
floors (id, project_id → projects, name, level, sort_order, design_json,
        version, draft_json, draft_base_version, draft_updated_at, timestamps)
floor_versions (id, floor_id → floors, version, design_json, note,
                created_by → users, created_at, UNIQUE(floor_id, version))
```

- Todas las lecturas de piso incluyen la condición de propiedad (`projects.user_id = :userId`) en la misma consulta; no se confía en el `id` recibido.
- Los guardados y las duplicaciones usan transacciones.
- El piso mantiene la versión actual en `floors.version`; cada guardado inserta en `floor_versions` y actualiza el piso con `WHERE version = :expected`. Si el `UPDATE` no afecta exactamente una fila, se lanza `VersionConflictException` con la versión real.
- Las versiones son inmutables. Restaurar copia el diseño de la versión elegida a un **nuevo** registro con el siguiente número, conservando el historial.
- Los borradores viven en el piso (`draft_json`) y nunca crean versiones. Se descartan al guardar.

### Bloqueo optimista

```text
Editor A (v5) ── guarda v6 ──▶ servidor: version 6
Editor B (v5) ── guarda ─────▶ servidor: 409 + current_version 6
Editor B: conserva el diseño, muestra aviso, permite recargar v6 o descargar copia local
```

## Modelos y servicios

| Clase | Rol |
| --- | --- |
| `User` | Alta, búsqueda por correo, verificación de contraseña y cambio de clave. |
| `Project` | CRUD de proyectos con validación de nombre/sede/área/responsable/notas; crea el primer piso. |
| `Floor` | Acceso por usuario, guardado con versión, borradores, historial y restauración. |
| `DesignFactory` | Diseño en blanco por preset (A4 horizontal/vertical, A3, planta amplia, lienzo libre) con capas iniciales. |
| `DesignValidator` | Normalización y límites del esquema v2 (lienzo, capas, elementos, grupos, etiquetas, colores, puntos, tamaño JSON). |
| `DesignImporter` | Importación del JSON propio (v2) y del formato heredado v1 con alias de herramientas y señales. |
| `LibraryRepository` | Carga y **valida** los catálogos locales: 332 señales ISO 7010 + 22 de servicios, 6 familias, 145 objetos CAD, 18 familias, redes y valores eléctricos de `mep-networks.json`, SVG seguros, colores por familia u objeto. Expone `typeForCode()`/`codeForType()` para traducir `iso_*`/`sig_*` ↔ código de catálogo. |
| `SvgExporter` | Exportación SVG de la versión guardada, con identificadores únicos y símbolos incrustados (señales ISO, de servicios y equipos CAD). |
| `Installer` | Requisitos, validación de la cuenta, creación del esquema, usuario administrador, demo opcional y escritura atómica de `config/config.php`. |
| `DemoSeeder` | Carga `resources/demo/demo-project.json` como proyecto de ejemplo con sus pisos. |

`LibraryRepository::safeSvg()` rechaza SVG con `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, `<audio>`, `<video>`, `<image>`, `<style>`, atributos `on*`, `href` no locales, `javascript:`/`vbscript:`/`data:`, `url()` remotos, `<!ENTITY`, `<!DOCTYPE` y `xml-stylesheet`. Los catálogos se validan al cargarse: si uno no pasa la comprobación, la aplicación registra el error y no sirve contenido inseguro.

## Capa web

- Vistas PHP con `layout.php` (panel, proyectos, cuenta) y layouts propios para acceso, instalador, editor e impresión.
- `partials/icons.php` contiene el sprite completo de iconos (`<symbol id="i-*">`); no se usan fuentes de iconos ni imágenes remotas.
- Toda salida dinámica pasa por `e()` (`htmlspecialchars` con `ENT_QUOTES`).
- Los formularios incluyen `_token` (helper `csrf_field()`); los formularios con acciones destructivas piden confirmación con `data-confirm` y `ui.js`.

## Frontend del editor

```text
assets/js/ui.js              Tooltips únicos, toasts, diálogos, menús y confirmaciones
assets/js/lib/geometry.js    clamp, snap, distancia, rotación, cajas, marcos, redimensionado
assets/js/lib/model.js       Diseño normalizado, selección, historial (120), operaciones CAD
assets/js/lib/renderer.js    Dibujo SVG: rejilla, capas, elementos, selección, reglas, miniaturas, pie de plano
assets/js/editor/store.js    API: guardar, autosave, versiones, restaurar, ajustes, errores
assets/js/editor/inspector.js Inspector plegable: ficha, geometría, apariencia, redes, superposiciones y acciones
assets/js/editor/library.js  Cajón de bibliotecas: chips, búsqueda, grilla y detalle
assets/js/editor.js          EditorApp: arranque, herramientas, puntero, teclado, guardado, exportación
```

- El HTML entrega `#editor-design` y `#editor-boot` como JSON embebido; el editor los lee, los elimina del DOM y arranca.
- `Model` mantiene `design`, `selection`, `history`, `future`, `clipboard` y `_pendingSnapshot`. `begin()/end()` agrupa arrastres y transformaciones en un solo paso de historial.
- `Model.hitStack(point)` devuelve los elementos bajo un punto en el mismo orden de pintado del lienzo (capas y luego orden interno) usando geometría real: cajas rotadas, elipses y distancia a los segmentos de los trazos. Es la base de `Ctrl/⌘ + clic` para llegar al elemento que queda debajo de una superposición y de la sección **Elementos superpuestos** del inspector.
- `EditorApp` mantiene la herramienta activa (`select`, `hand`, `place` o una de dibujo), el cursor que corresponde a cada una y el estado del paneo; el cursor se pasa al `Renderer` en cada repintado para que no se pierda.
- `Renderer` no usa frameworks ni medidas del DOM para dibujar: recibe `view {zoom, panX, panY}` y genera SVG con `createElementNS`. Las vistas previas de biblioteca e inspector se construyen con el mismo renderizador.
- Las reglas se dibujan en contenedores propios a partir del zoom y el desplazamiento; se actualizan al redimensionar y al hacer zoom.
- `Store` centraliza las llamadas `fetch` con `Accept: application/json`, `Content-Type: application/json` y `X-CSRF-Token`; interpreta `409` y `419` de forma específica.
- Los tooltips son **uno solo** en el DOM (`#normia-tooltip`), con temporizador y limpieza de texto al ocultarse; así no se acumulan.
- La exportación PNG rasteriza el mismo renderizador en un `<canvas>` del navegador; nada se sube al servidor.
- La impresión se resuelve en el servidor (`editor/print.php`) con `print.css` y el diseño guardado, para que el resultado sea reproducible.

## Pie de página de los planos

El pie que acompaña a cada plano se compone en el servidor y se reutiliza tal cual en el navegador:

```text
app/Services/PlanFooter.php   Celdas de orientación, líneas de datos, maquetación adaptable y dibujo SVG
app/Services/SvgAsset.php     Incrustación saneada de pictogramas del catálogo (señales y equipos CAD)
```

- `PlanFooter::payload($design, $meta)` devuelve `cells`, `lines` y `fields`. El editor lo recibe en `boot.footer`; `EditorController` y `ExportController` lo generan con los mismos datos guardados.
- `SvgExporter` reserva la altura con `PlanFooter::bandHeight()` y `PlanFooter::dataHeight()` y dibuja la franja antes de la leyenda de redes; así el alto total del SVG siempre coincide con el contenido.
- En el navegador, `Renderer.footerBand(payload, {width, top})` produce el mismo marcado (`data-plan-footer`, `data-footer-cell`, `data-footer-line`), que es lo que entra al PNG. `EditorApp.buildExportSvg()` amplía el `viewBox` con la altura del pie.
- Las celdas se reparten en 5, 3 o 1 columna según el ancho y cada texto se parte por palabras con `SvgAsset::wrap()`, el mismo algoritmo en PHP y en JS.
- `SvgAsset` centraliza la validación (`LibraryRepository::safeSvg`) y la copia de atributos de presentación, de modo que el plano y el pie comparten una única ruta de incrustación.

## Seguridad

| Amenaza | Mitigación |
| --- | --- |
| CSRF | Token por sesión en todos los POST; `hash_equals`; cabecera `X-CSRF-Token` para JSON. |
| XSS | Escape de salida; etiquetas sin `<`/`>`; SVG de catálogo validados; sin `innerHTML` con datos de usuario sin escapar (se usa `esc()` en las plantillas JS). |
| Inyección SQL | PDO con consultas preparadas y parámetros; nunca concatenación de valores. |
| Acceso a datos ajenos | Condición de propietario en cada consulta de proyecto/piso/versión. |
| Fuerza bruta | 6 intentos por 10 minutos por sesión y `password_hash`. |
| Sesión | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` bajo HTTPS, ID regenerado al autenticar. |
| Rutas internas | `.htaccess` raíz y por carpeta; Nginx documentado. |
| Subidas | Solo JSON de diseño; límite de 2.5 MB, validación profunda y transacciones. |
| DoS básico | Límites de elementos, capas, grupos, puntos, etiquetas y JSON (2.5 MB). |
| Fugas de información | Mensajes genéricos al usuario; detalle solo en el log local. |

## Pruebas

La suite es parte del repositorio y no del paquete de producción:

- `tests/php/harness.mjs` copia el repositorio a un directorio temporal (excluye configuración, bases, sesiones, logs y `node_modules`), levanta PHP compilado a WebAssembly con `@php-wasm/node` y expone un cliente HTTP con cookies, formularios y JSON.
- `tests/php/lint.mjs` ejecuta `php -l` sobre los archivos de la aplicación.
- `tests/php/functional.mjs` recorre instalación, autenticación, autorización, proyectos, pisos, editor, guardado, versiones, borradores, conflictos, validaciones, importación, exportación y ciclo de vida.
- `tests/js/boot.mjs` crea un JSDOM con el HTML real del editor, conecta `window.fetch` al cliente PHP y suple lo que JSDOM no implementa (medidas del SVG, Canvas, descargas, `window.open`).
- `tests/js/editor.mjs` ejecuta el editor real y comprueba interacciones de puntero, teclado, bibliotecas, guardado, reapertura, exportaciones y saneado.
- `tests/php/package.mjs` construye los ZIP, verifica su contenido y sumas, y hace una **instalación limpia** del paquete de demostración comprobando assets, catálogos y exportaciones.

Cada prueba corre en PHP 8.1 y 8.3 (la de paquetes en 8.3), sin instalar PHP en el equipo. Los resultados esperados están en el README.

## Empaquetado

`tools/build-packages.sh` copia el árbol a un directorio temporal con una lista explícita de exclusiones, crea las carpetas de datos vacías con `.gitkeep`, añade `LEEME-PRIMERO.txt` y comprime con `zip`. El paquete de demostración añade `resources/demo/.demo-build`, que el instalador lee para premarcar la casilla de demo. Al final calcula `SHA256SUMS.txt` y `BUILD.txt`.

## Decisiones y límites de la fase 1

- Sin DWG/DXF: fuera de alcance; se documenta explícitamente para no prometer compatibilidad inexistente.
- Sin colaboración en tiempo real: el bloqueo optimista por versión evita pérdidas silenciosas, pero la coordinación es humana.
- Sin gestor de usuarios en la interfaz: la fase 1 crea la cuenta administradora en el instalador. El esquema y las consultas ya soportan varias cuentas con proyectos aislados, pero las cuentas adicionales se crean por base de datos; un gestor de usuarios queda para una fase posterior.
- Sin migraciones automáticas: el esquema es estable y `PRAGMA user_version = 1`; una versión futura podrá migrar con un paso explícito.
- La escala es una **referencia declarada**: el editor no mide el mundo real ni convierte unidades físicas a píxeles de impresión.
