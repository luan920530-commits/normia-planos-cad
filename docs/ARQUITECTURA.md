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
       ├─ sin sesión → la raíz muestra la presentación; el resto, 401 (API) o login
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
| GET | `inicio` | Presentación pública (portada). |
| GET | `` | Panel con sesión; presentación sin ella. |
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
| GET | `…/audit` | Informe imprimible del auditor para el piso guardado. |
| GET | `api/floors/{id}` | Diseño, metadatos y borrador pendiente. |
| POST | `api/floors/{id}/save` | Guardar versión (bloqueo optimista). |
| POST | `api/floors/{id}/autosave`, `/discard-draft` | Borradores. |
| GET | `api/floors/{id}/versions` | Historial. |
| POST | `api/floors/{id}/versions/{versionId}/restore` | Restaurar como versión nueva. |
| POST | `api/floors/{id}/settings` | Nombre/nivel del piso. |
| GET | `api/floors/{id}/mep` | Resumen de redes y circuitos del piso guardado. |
| GET | `api/floors/{id}/audit` | Auditor y medición de evacuación; `?occupancy=N` simula el aforo. |
| GET | `catalogs/signs`, `catalogs/cad` | Catálogos locales. |
| GET/POST | `account/password` | Cambio de contraseña. |
| GET | `empresas`, `empresas/nueva` | Lista de empresas de la persona y formulario de alta. |
| GET/POST | `empresas`, `empresas/{id}` | Alta de empresa y edición de sus datos (nombre, NIT, ciudad). |
| POST | `empresas/{id}/personas` | Da acceso a una cuenta existente o crea la cuenta y la vincula. |
| POST | `empresas/{id}/personas/{userId}/rol`, `.../quitar` | Cambia el rol o retira el acceso. |
| POST | `empresas/{id}/eliminar` | Elimina la empresa con sus planos (solo el propietario, escribiendo el nombre). |

## Datos y persistencia

```sql
users (id, name, email único, password_hash, is_admin, timestamps)
organizations (id, name, tax_id, city, created_by → users, timestamps)
memberships (id, organization_id → organizations, user_id → users,
             role owner|admin|editor|viewer, created_at, UNIQUE(organization_id, user_id))
projects (id, organization_id → organizations, created_by → users,
          name, site, workplace, responsible, notes, timestamps)
floors (id, project_id → projects, name, level, sort_order, design_json,
        version, draft_json, draft_base_version, draft_updated_at, check_days, timestamps)
floor_versions (id, floor_id → floors, version, design_json, note,
                created_by → users, created_at, UNIQUE(floor_id, version))
brigade_links (id, floor_id → floors UNIQUE, token UNIQUE, enabled, timestamps)
verification_rounds (id, floor_id → floors, status, note, started_by, started_at,
                     closed_by, closed_at)
element_checks (id, floor_id → floors, round_id → verification_rounds, element_id,
                element_type, sector, status, note, photo, photo_type, photo_name,
                checked_by, checked_at)
plugins (id, plugin_id UNIQUE, name, version, enabled, manifest_json, installed_at)
schema_migrations (version PRIMARY KEY, name, checksum, duration_ms, applied_at)
```

- **Esquema versionado.** `resources/schema.sql` crea todo en instalaciones nuevas con `PRAGMA user_version = 7`. En instalaciones anteriores, `Migrations::run()` aplica los pasos que falten al arrancar (2 → 7: enlace brigadista, verificación, `floors.check_days`, la tabla `plugins`, las empresas con membresías y `floor_versions.pinned`), comprueba la columna con `PRAGMA table_info` y no vuelve a ejecutarse dentro de la misma petición.
- **Migraciones con bitácora.** `app/Core/Migrations.php` centraliza los pasos: cada uno corre en su propia transacción y solo sube `PRAGMA user_version` si terminó bien; al terminar, deja su fila en `schema_migrations` (nombre, suma de comprobación, duración, fecha) y anota el resultado en `storage/logs/migraciones.log`. `bootstrap()` registra los pasos ya incluidos en `schema.sql`, para que una instalación nueva tenga la bitácora completa y no solo el último número. Si un paso falla, se revierte, la versión no avanza y la petición se detiene con `SchemaException`.
- **Paso 6 (empresas) sin pérdida de datos.** SQLite no permite añadir una columna `NOT NULL` con clave foránea, así que el paso reconstruye `projects` en una transacción: copia cada fila a una tabla nueva, resuelve la empresa a partir de la membresía de su antiguo `user_id`, comprueba que no quede ningún proyecto huérfano y solo entonces reemplaza la tabla. Si algo falla se revierte y se lanza `SchemaException`, que **detiene la petición con una página de error accionable** en lugar de dejar la aplicación trabajando sobre un esquema a medias. Al terminar se verifica con `PRAGMA foreign_key_check`.
- **Fotos de evidencia.** Se guardan en la tabla como base64 (512 KB como máximo) porque algunos controladores SQLite empaquetados truncan los binarios con bytes de control; el tipo se detecta por la firma del archivo, sin depender de GD. Solo se sirven a la cuenta dueña del plano.

- Todas las lecturas de piso incluyen la condición de pertenencia (`JOIN memberships m ... m.user_id = :userId`) en la misma consulta; no se confía en el `id` recibido.
- La **frontera de los datos es la empresa**: un proyecto cuelga de `projects.organization_id` y el acceso se resuelve con la membresía de la persona. Las escrituras añaden además el rol (`m.role IN ('owner','admin','editor')`) a la propia consulta, de modo que un lector no puede guardar aunque construya la petición a mano.
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
| `Brigade` | Enlace público del piso: token de 32 caracteres, activar/desactivar, regenerar y fecha de actualización. |
| `Check` | Verificaciones de campo por elemento (estado, nota, foto en base64 y responsable), rondas e historial. |
| `VerificationInventory` | Inventario verificable del plano: excluye muros y trazos, toma el nombre del catálogo (CAD o señal) y el sector de la capa, y calcula cobertura % por familia y por sector. |
| `DesignFactory` | Diseño en blanco por preset (A4 horizontal/vertical, A3, planta amplia, lienzo libre) con capas iniciales. |
| `DesignValidator` | Normalización y límites del esquema v2/v3/**v4** (lienzo, capas, elementos, grupos, etiquetas, colores, puntos, curvas, sección tipo, tamaño JSON). Acepta `canvas.occupancy` (0–10 000), `isExit` en puertas (y lo descarta en cualquier otro tipo), `curves` solo en trazos, `widthM`/`lanes` en vías y andenes, y `section`/`junction` en vías (lista blanca de claves y rangos; el ancho se deriva de la sección y un cruce sin sección responde `422`). |
| `DesignImporter` | Importación del JSON propio (v2) y del formato heredado v1 con alias de herramientas y señales. |
| `LibraryRepository` | Carga y **valida** los catálogos locales: 332 señales ISO 7010 + 63 propias (23 de orientación y servicios + 34 de tránsito + 6 de brigada), 9 familias, 420 objetos CAD, 31 familias, redes y valores eléctricos de `mep-networks.json`, SVG seguros, colores por familia u objeto. Expone `typeForCode()`/`codeForType()` para traducir `iso_*`/`sig_*` ↔ código de catálogo y `counts()` para que las vistas no repitan cifras. |
| `SvgExporter` | Exportación SVG de la versión guardada, con identificadores únicos y símbolos incrustados (señales ISO, de servicios y equipos CAD). Los trazos con curvas se escriben como `path` con arcos `A`; sin curvas el resultado es idéntico al de la 1.10.0. Las vías con sección tipo usan `roadSectionMarkup()` (calzada, carriles, separador, berma, ciclorruta y andenes) y las glorietas o intersecciones `roadJunctionMarkup()`, con el mismo dibujo que el editor y en coordenadas absolutas. |
| `PathGeometry` | Aplanado único del servidor: arco por tres puntos, longitud, muestreo por tolerancia y `d` del SVG. Es la pareja de `assets/js/lib/geometry.js`; el auditor, la cobertura y la exportación lo comparten. |
| `Installer` | Requisitos, validación de la cuenta, creación del esquema, usuario administrador, demo opcional y escritura atómica de `config/config.php`. |
| `MepCalculator` | Longitudes, pendientes, cargas, breaker, calibre y caída de tensión de referencia a partir de `mep-networks.json`. |
| `PlanGrid` | Rejilla compartida del plano: celdas de 20 cm, bloqueo de muros rectos y curvos con holgura (incluye medio lado de celda para no perder trazos finos), apertura de vanos y separación del terreno exterior. Las vías, andenes, cebras, parqueaderos y linderos marcan exterior sin bloquear. La usan el auditor y el cálculo de extintores. |
| `PlanAudit` | Auditor de planos: salidas, rejilla de recorrido, ocupación, ancho requerido, tiempo de evacuación, señalización y hallazgos con severidad. Criterios en `resources/audit-criteria.json`; incorpora los hallazgos de extintores. |
| `ExtinguisherNorms` | Tablas de extintores: perfiles NTC 2885 / NFPA 10, agentes y clases de fuego, clasificaciones, distancias por clase y riesgo, área admisible, alturas de montaje y mínimo por superficie. Lee `resources/extinguisher-criteria.json`. |
| `ExtinguisherCoverage` | Cobertura por Dijkstra multi-fuente sobre `PlanGrid`: recorrido real, área admisible por clasificación, zonas descubiertas con motivo y acciones simuladas (añadir, reubicar, subir clasificación) con su ganancia medida. |
| `DemoSeeder` | Carga `resources/demo/demo-project.json` como proyecto de ejemplo con sus pisos. |

`LibraryRepository::safeSvg()` rechaza SVG con `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, `<audio>`, `<video>`, `<image>`, `<style>`, atributos `on*`, `href` no locales, `javascript:`/`vbscript:`/`data:`, `url()` remotos, `<!ENTITY`, `<!DOCTYPE` y `xml-stylesheet`. Los catálogos se validan al cargarse: si uno no pasa la comprobación, la aplicación registra el error y no sirve contenido inseguro.

## Extintores

`ExtinguisherCoverage::analyze($design)` recibe el diseño ya normalizado y devuelve `summary`, `units`, `zones`, `findings`, `recommendations`, `agents`, `examples` y `notice`. No calcula nada en el cliente: el cajón y el inspector solo pintan el informe del último plano guardado y las acciones se aplican al modelo para que el siguiente guardado las valide. El detalle normativo, las tablas y los límites están en [`EXTINTORES.md`](EXTINTORES.md).

La rejilla es la misma del auditor, de modo que una mejora en el bloqueo de muros o en la detección del exterior se refleja en los dos cálculos. Los muros se bloquean con `medio trazo + holgura + medio lado de celda` y los vanos se abren con el mismo margen: así un trazo de 2 cm no desaparece entre dos centros de celda.

## Capa web

- Vistas PHP con `layout.php` (panel, proyectos, cuenta) y layouts propios para acceso, instalador, editor e impresión.
- `partials/splash.php` dibuja la pantalla de bienvenida (emblema, barra de progreso y estado) que se incluye en el layout, el acceso y el editor; `assets/js/splash.js` la retira al terminar la carga y el CSS la oculta sola si no hay JavaScript. La marca vive en `assets/img/`: `normia-logo.png` (384 px, arte de bienvenida), `normia-emblem.png` (160 px, logo de la interfaz), `favicon-32.png`, `apple-touch-icon.png` y `normia-watermark.png` (marca de agua del pie), todas generadas a partir del emblema con fondo transparente.
- `partials/icons.php` contiene el sprite completo de iconos (`<symbol id="i-*">`, 88 símbolos, retícula de 24 × 24). Desde la v1.1.2 el conjunto usa el estilo «Normia 2.0»: trazo de 1,7 px con remates redondeados, relleno duotono al 12 % y formas simplificadas para leerse a 20 px. No se usan fuentes de iconos ni imágenes remotas; el CSS los presenta como chips con cristal (`assets/css/editor.css`, `.rail-button`).
- Desde la v1.1.3 el editor se compone como una aplicación de escritorio: chrome oscuro continuo (`.editor-topbar` + `.rail`), lienzo como hoja sobre un escritorio con degradado (`.canvas-shell`), barra de herramientas flotante (`.stage-toolbar`) e inspector flotante (`.properties-panel`). Los cajones se separan 10 px de los bordes.
- Desde la v1.6.0 el rail es una columna de **14 baldosas de 40 × 40 px** (`grid-template-columns: 68px …`) sin texto: cada una lleva su icono y una etiqueta flotante (`data-tooltip-side="right"`). Los grupos se separan con `.rail-separator` y las herramientas con variantes muestran el chevrón dentro de la baldosa (`.rail-caret`: Puertas, Tubería y Formas). **Análisis** y **Vista** agrupan las acciones que antes ocupaban la mitad inferior, y **Versiones**, **Pie de plano** y **Atajos** viven en `.topbar-tools` de la barra superior, con menú **Más** (`[data-topbar-menu]`) por debajo de 1100 px.
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
assets/js/editor/audit.js    Cajón de revisión: pide el informe, pinta métricas y hallazgos, filtra y enlaza al plano
assets/js/editor/schedule.js Cajón del pliego: agrupa señales, tamaños, precios, consistencia y CSV
assets/js/editor/measure.js  Cajón de rutas internas: retícula, A*, tramos, tiempos y guardado en capa
assets/js/editor/present.js   Modo presentación: láser, spotlight, rutas animadas, capas y quiz
assets/css/presentacion.css   Portada pública: portada oscura, tarjetas, galería y formulario
assets/js/presentacion.js     Galería de capturas: flechas con JavaScript, teclado y estado en los extremos
assets/js/editor/toolsearch.js Buscador de la paleta: normaliza tildes y amplía con sinónimos de obra
assets/js/editor/guide.js     Guía de primeros pasos: siete pasos, progreso desde el plano y salto al control real
assets/js/editor.js          EditorApp: arranque, herramientas, puntero, teclado, guardado, exportación
```

- El HTML entrega `#editor-design` y `#editor-boot` como JSON embebido; el editor los lee, los elimina del DOM y arranca.
- `Model` mantiene `design`, `selection`, `history`, `future`, `clipboard` y `_pendingSnapshot`. `begin()/end()` agrupa arrastres y transformaciones en un solo paso de historial.
- `Model.hitStack(point)` devuelve los elementos bajo un punto en el mismo orden de pintado del lienzo (capas y luego orden interno) usando geometría real: cajas rotadas, elipses y distancia a los segmentos de los trazos. Es la base de la selección con un clic (ver *Selección con el puntero*), de `Ctrl/⌘ + clic` para llegar al elemento que queda debajo de una superposición y de la sección **Elementos superpuestos** del inspector.
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

## Desplazamiento del editor

El editor ocupa la ventana completa (`body { overflow: hidden }`), así que cada zona que puede crecer debe acotar su alto y desplazarse por dentro:

- `.editor-app` reparte el alto con `grid-template-rows: auto auto minmax(0, 1fr)`.
- `.editor-workbench` fija su única fila con `minmax(0, 1fr)`, `min-height: 0` y `overflow: hidden`: ningún hijo puede estirarla.
- `.rail` hace su propio scroll (`overflow-y: auto`) cuando la ventana es muy baja, aunque con las 14 baldosas ya no lo necesita a partir de 720 px de alto. Sus desplegables usan `position: fixed` y el editor los coloca junto al botón (`placeFlyout`); se cierran al desplazar la barra, al cambiar el tamaño de la ventana o al hacer clic fuera.
- Los seis menús (`door`, `pipe`, `shape`, `analysis`, `view`, `topbar`) comparten `menuPairs()`, `toggleMenu()`, `closeMenu()` y `closeMenus()`: solo hay uno abierto y `aria-expanded` se sincroniza en cada apertura y cierre.
- La paleta **Todas las herramientas** (`data-tools-popover`) es anterior a los menús del rail y conserva su propio ciclo: `toggleToolsPalette()` la abre, `closeToolsPalette()` la cierra y `[data-tools-filter]` filtra sus `.tool-choice` ocultando los grupos vacíos. No se duplicó como menú del rail para no tener dos paneles con el mismo nombre.

## Marca de agua del pie

`PlanFooter` dibuja, al final del bloque de datos y antes de la leyenda de redes, un grupo `#marca-normia` con el emblema y la línea «Generado con Normia Planos CAD v…». El PNG viaja como `data:image/png;base64` (una sola copia) para que el SVG exportado sea autónomo: no hay rutas a `assets/` ni peticiones externas, y la prueba de exportación lo verifica. `PlanFooter::dataHeight()` reserva `BRAND_HEIGHT` y `Renderer.footerHeight()` hace lo mismo en el navegador, de modo que el PNG del editor y el SVG del servidor coinciden.
- `.properties-panel` es una columna flex con `min-height: 0` y `overflow: hidden`; el scroll vive en `.properties-body` (`flex: 1 1 auto; min-height: 0; overflow-y: auto`), y sus bloques llevan `flex: 0 0 auto` para que nunca se compriman.
- `Inspector.render()` conserva `scrollTop` y el foco del campo cuando la selección no cambió; antes cada retoque devolvía el panel al principio.

## Biblioteca en modo sustitución

`Library` trabaja en dos modos, con el mismo estado y el mismo buscador:

- `insert` (por defecto): la tarjeta se arrastra al lienzo o se pulsa **Insertar**; el recurso sigue al cursor (`EditorApp.startPlacement`).
- `replace`: la tarjeta no se arrastra. Al elegirla, `EditorApp.replaceSelection(type)` llama a `Model.changeType()`, que conserva posición, tamaño, rotación, capa, opacidad y bloqueo, y aplica el color de la nueva familia. Si el elemento era un equipo eléctrico y el nuevo también lo es, conserva el circuito asignado; si deja de serlo, elimina los datos de red. El recurso actual se marca con la insignia *Actual* y el detalle cambia su botón a **Usar esta señal** o **Usar este equipo** según el tipo.

El inspector abre el cajón desde la sección **Apariencia**: `[data-action="swap-sign"]` llama a `EditorApp.startSignSwap()` y `[data-action="swap-equipment"]` a `EditorApp.startEquipmentSwap()`. Cada botón sólo aparece cuando todos los elementos seleccionados son señales o equipos CAD, respectivamente. `Library` adapta título, insignia, botón, pistas y nota al sustantivo del recurso, y expone el modo en `data-library-mode` para que el CSS y las pruebas puedan comprobarlo.

## Selección con el puntero

El lienzo es un SVG con una zona invisible (`hit-area`) para muros, tuberías, líneas y medidas, pero los pictogramas y los equipos CAD son trazos finos dentro de un SVG incrustado que, por CSS (`.asset-svg { pointer-events: none }`), no recibe el puntero. Confiar sólo en `event.target.closest('.plan-element')` hacía que un clic dentro de un símbolo no encontrara nodo: el editor lo trataba como clic en el vacío y abría la caja de selección.

`EditorApp.hitTarget(point, event)` resuelve el clic en dos capas:

1. Calcula la pila geométrica con `Model.hitStack(point, { tolerance })`, con una tolerancia de **8 px de pantalla** convertida a unidades del lienzo (`8 / zoom`).
2. Da prioridad al nodo SVG cuando el puntero acierta una **forma pintada o una etiqueta**; si el nodo es una `hit-area` invisible, manda el primer elemento de la pila, que es el que realmente se ve. Si no hay nodo (interior de un pictograma o de un equipo), también manda la pila; si no hay pila, no hay objetivo y empieza la marquesina.

`onPointerDown` usa ese resultado para seleccionar y para armar el arrastre pendiente; `onDoubleClick` lo reutiliza para editar etiquetas y añadir vértices. `Ctrl/⌘ + clic` sigue recorriendo la pila (`cycleSelection`) y `Shift` sigue sumando a la selección. En `onPointerMove`, cuando la herramienta es *Seleccionar*, se consulta la misma pila para cambiar el cursor a `move` si hay algo seleccionable bajo el puntero. Las etiquetas de los elementos (`.element-label`, `.element-text`, `.element-dimension`) reciben el puntero, de modo que también seleccionan su elemento.

## Auditor y medición de evacuación

`app/Services/PlanAudit.php` es el único motor de cálculo; la API y el informe imprimible lo llaman con el diseño ya normalizado, de modo que la interfaz nunca calcula cifras por su cuenta.

```text
GET api/floors/{id}/audit[?occupancy=N]
  └─ FloorApiController::audit()
       ├─ DesignValidator::normalizeJson()      (autoridad de esquema)
       ├─ PlanAudit::analyze($design, $occupancy)
       │    ├─ salidas y vanos (puertas con isExit)
       │    ├─ travelField()  rejilla + Dijkstra 8-vecinos
       │    ├─ ocupación, ancho requerido y tiempos
       │    ├─ rutas (longitud, llegada a salida, cruces de muro)
       │    ├─ señalización (salida junto al vano, «Usted está aquí», extinción)
       │    └─ hallazgos con severidad y criterios aplicados
       └─ Response::json({ok, floor, report, notice})
```

Decisiones del cálculo:

1. **Rejilla**: celdas de 20 cm configurables (`grid.cellCm`) sobre el lienzo, con un máximo de celdas (`grid.maxCells`); si se supera, la celda crece en pasos de 1,5 hasta caber. Los muros bloquean celdas a menos de medio trazo más una holgura (`grid.wallClearanceCm`). Cada puerta libera las celdas de su vano, así que una puerta abierta no se confunde con una pared.
2. **Vanos como origen**: los centros de las celdas del vano de cada salida son las semillas (coste 0). El recorrido de cada celda es el camino más corto hasta la salida más cercana, con vecinos de 8 direcciones (diagonal = √2). El máximo de esas distancias es el **recorrido más largo**.
3. **Exterior fuera del cómputo**: se inunda el espacio libre desde el borde del lienzo con los vanos cerrados. Esa región es el terreno de fuera del edificio; se descuenta de la superficie libre, de la ocupación estimada, del recorrido y de los recintos sin salida. Solo se aplica cuando el recinto está cerrado y queda al menos un 20 % de superficie interior; en un plano sin cerramiento se analiza el lienzo completo y el informe lo refleja con `exteriorAreaM2 = 0`.
4. **Zonas sin salida**: las celdas libres interiores que el recorrido no alcanza se agrupan por componentes conexas y se informan a partir de `egress.minRoomAreaM2` para no repetir un aviso por celda.
5. **Ocupación**: `canvas.occupancy` si es mayor que 0 (`declared`); si no, `densityPersonsPerM2 × freeAreaM2` redondeado (`estimated`) y aviso `occupancy_missing`.
6. **Ancho y tiempo**: ancho útil = Σ vanos × `doorClearanceFactor`; ancho requerido = personas × `widthMmPerPerson`; marcha = recorrido máximo ÷ `travelSpeedMps`; cola = personas ÷ (`flowPersonsPerSecondPerMeter` × ancho útil); tiempo estimado = marcha + cola. Un ancho insuficiente genera `width_short`; una salida por debajo de `minExitWidthCm` genera `narrow_exit`.
7. **Rutas dibujadas**: se mide la polilínea con sus puntos reales (rotación incluida) y se comprueba la distancia del extremo a la salida más cercana (`routeExitToleranceCm`) y las intersecciones con muros fuera de un vano (`wallCrossings`).
8. **Señalización**: pictogramas de salida (`exitSignCodes`) a menos de `exitSignRadiusCm` del vano, presencia del marcador `youAreHereCode` y de algún pictograma de extinción (`fireSignCodes`).

El cajón `assets/js/editor/audit.js` llama al endpoint (`boot.auditUrl`), pinta cuatro tarjetas de resumen, las métricas, la tabla de rutas y la lista de hallazgos con filtros por severidad; el contador del botón de la barra lateral resume críticos e importantes. «Ver en el plano» usa `EditorApp.focusAuditFinding()` → `Model.select()` + `EditorApp.frameBounds()`. La hoja imprimible vive en `app/Views/editor/audit-report.php` y comparte el aviso de alcance con el resto de la aplicación.

> Los criterios son **referencias configurables**, no normativa: el auditor no emite dictámenes ni certifica cumplimiento. La velocidad, el flujo, la densidad y los anchos deben ajustarse a la norma aplicable y confirmarse en sitio.

---

## Menús de las páginas fuera del editor

`assets/js/ui.js` centraliza los tooltips, los avisos y los menús de acciones (`[data-menu-toggle]` → `.menu`). El menú **no** se abre dentro de su tarjeta:

```text
clic en la flecha
  └─ openMenu(button, menu)
       ├─ guarda dónde vivía el menú (envoltorio y posición)
       ├─ lo monta en [data-menu-layer] al final del <body>
       ├─ placeMenu(): fixed bajo el botón, o encima si no cabe,
       │               con scroll interno y siempre dentro de la ventana
       └─ aria-expanded="true"
```

Motivo: las tarjetas de *Mis planos* y de los pisos recortan su contenido (`overflow: hidden` para redondear la vista previa). Con `position: absolute` el panel quedaba fuera de la tarjeta: invisible pero con la zona bloqueada. La capa `[data-menu-layer]` es `position: fixed`, ocupa la ventana y no recibe punteros (`pointer-events: none`); solo el menú los recibe. Al cerrar, el menú vuelve a su sitio en el DOM para que el HTML siga siendo válido sin JavaScript.

- `Esc` cierra y devuelve el foco a la flecha; `↑`/`↓`/`Inicio`/`Fin` recorren las opciones; un clic fuera cierra; elegir una opción recoge el menú.
- Solo hay un menú abierto a la vez, y se recoloca al redimensionar o desplazar la página.
- El mismo mecanismo sirve al selector **Cambiar piso** del editor, que vive en una barra superior recortada.
- Las acciones destructivas son formularios POST con `data-confirm`, y `assets/js/app.js` los intercepta para pedir confirmación (`NormiaUI.confirm`) antes de enviarlos.

## Complementos

La plataforma se amplía con **paquetes de datos**, no de código. Un complemento
es un `plugin.json` —solo o dentro de un `.zip` con sus `.svg`— que declara
señales (`signs`), equipos (`cad`) y familias propias (`categories`).

- `PluginManager` lee, valida e instala: escribe en
  `storage/plugins/<id>/plugin.json` y anota el estado en la tabla `plugins`.
  Nunca ejecuta código del paquete.
- `LibraryRepository::loadSigns()` y `loadCad()` funden los complementos activos
  con los catálogos base; los códigos llevan prefijo propio (`PLG_…` y
  `cad_<complemento>_<objeto>`) para no suplantar un ISO, un `SVC_` ni un objeto
  del catálogo. `LibraryRepository::forget()` limpia las cachés cuando se
  instala, se activa o se borra un complemento (importante en el APK, donde el
  intérprete vive mientras la aplicación está abierta).
- El resto del código no distingue un complemento de una señal base: auditor,
  exportaciones, pliego, verificación y biblioteca usan `codeForType()`.
- El router acepta parámetros con forma: `{id:slug}`, `{tipo:word}` y `{token}`.

La especificación y el manual están en `docs/PLUGINS.md` y dentro de la propia
aplicación (`plugins/manual`).

## Empresas, personas y roles

La versión 1.17.0 introduce la tenencia. Antes, un proyecto pertenecía a una cuenta (`projects.user_id`); ahora pertenece a una **empresa** (`projects.organization_id`) y las personas entran por una **membresía** con rol.

| Rol | Consulta | Edita planos | Crea y elimina proyectos | Administra personas |
| --- | --- | --- | --- | --- |
| `owner` | Sí | Sí | Sí | Sí (no puede quedarse sin propietario) |
| `admin` | Sí | Sí | Sí | Sí, salvo otros administradores y el propietario |
| `editor` | Sí | Sí | Crea; **no** elimina | No |
| `viewer` | Sí | No | No | No |

- **Una persona, varias empresas.** El panel muestra los planos de todas las empresas a las que pertenece, cada tarjeta con el nombre de su empresa. No hay «cambio de contexto»: la empresa es un atributo del plano.
- **La empresa de cada cuenta se crea sola.** El instalador crea la empresa del propietario; la migración crea una por cada cuenta existente con sus proyectos dentro.
- **Altas sin correo.** El administrador escribe el correo: si la cuenta existe se le añade la membresía; si no, se crea con la contraseña temporal que él mismo define y la entrega en mano. La aplicación no envía correo ni guarda invitaciones pendientes.
- **Retirar acceso no borra historia.** Al quitar una membresía se conservan proyectos, versiones y autoría (`floor_versions.created_by`).
- **Eliminar una empresa** borra en cascada sus proyectos, pisos, versiones, enlaces de brigada, rondas y verificaciones. Las cuentas de las personas sobreviven.
- **Límites conocidos.** El rol se guarda como texto y la comprobación se hace en cada consulta; no hay permisos por proyecto, ni invitaciones con caducidad, ni bitácora de cambios de rol, ni segundo factor.

## Respaldo, verificación y conservación

- **`app/Services/ZipWriter.php`** escribe un ZIP «store» (sin compresión) en PHP puro. El PHP de escritorio y el del APK no siempre traen `ZipArchive` ni `zlib`, y el respaldo no puede depender de eso. Cada entrada guarda su nombre; límite declarado de 4 GB, sin ZIP64.
- **`app/Services/Backup.php`** crea la copia con `VACUUM INTO` —consistente con el `-wal` y sin detener el servicio—, con alternativa de punto de control más copia si el motor no lo admite. El ZIP lleva la base, `config/config.php`, los complementos, un manifiesto con conteos y SHA-256 y un `LEEME-RESTAURACION.txt`. La verificación comprueba `integrity_check`, `foreign_key_check`, la presencia de las tablas esperadas, las empresas sin propietario y los proyectos o pisos huérfanos; sobre una copia guardada, abre la base extraída en una conexión aparte y en solo lectura. Rotación de 10 copias, con las fijadas fuera de la rotación, y salud de la base con `quick_check` cacheado un día en `storage/cache/salud-base.json`.
- **`app/Services/VersionRetention.php`** decide qué historial se conserva: todo lo de los últimos 30 días, una versión diaria hasta 180 y una mensual después; la vigente, la inicial, la última y las fijadas nunca son candidatas. `plan()` no borra; `prune()` recalcula el plan y solo elimina los ids que siguen siendo candidatos, previo respaldo obligatorio desde el controlador.
- **Permisos.** El panel de respaldo exige la cuenta que instaló la aplicación (`users.is_admin`), porque una copia completa contiene los datos de **todas** las empresas; la poda de versiones exige capacidad `manage` sobre el proyecto y un respaldo correcto antes de borrar.
- **`app/Core/HttpException.php`** separa los errores de petición (estado HTTP + código de máquina) de las validaciones de dominio, para que un cuerpo vacío, uno ilegible y uno enorme no acaben en el mismo 422.

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
- `tests/php/functional.mjs` recorre instalación, autenticación, autorización, proyectos, pisos, editor, guardado, versiones, borradores, conflictos, validaciones, importación, exportación, **auditor y medición de evacuación** e informe imprimible.
- `App\Core\Units` y `window.Normia.Units` son la **autoridad única** de unidades: `metersPerUnit` es la fuente y el resto se deriva. Los conversores que antes vivían en `PlanGrid`, `PlanAudit`, `PathGeometry`, `MepCalculator`, `SvgExporter`, `geometry.js`, `mep.js`, `measure.js` y `schedule.js` delegan en ella; las API públicas se conservan para no romper llamadas. Ver `docs/DIMENSIONAL.md`.
- `tests/php/golden.mjs` fija 6 405 valores del auditor, extintores, redes y el SVG de la demo: si la consolidación de unidades moviera una cifra, falla.
- `tests/php/units.mjs` y `tests/js/units.mjs` verifican la **autoridad única de unidades** (`App\Core\Units` y `window.Normia.Units`) contra una misma tabla compartida, `tests/fixtures/units.json`: si una de las dos implementaciones se separa, falla. Incluyen la paridad bit a bit de la ruta `cm` con el cálculo anterior al refactor.
- `tests/php/stability.mjs` cubre la Fase 0: respaldo real descargado y verificado, fotografía dentro de la copia, rotación con copia fijada, reserva del panel a la cuenta que instaló, migración forzada a fallar sin tocar la versión ni los datos, conflicto de restauración, los cuatro casos de cuerpo JSON y la poda sobre 40 versiones.
- `tests/js/boot.mjs` crea un JSDOM con el HTML real del editor, conecta `window.fetch` al cliente PHP y suple lo que JSDOM no implementa (medidas del SVG, Canvas, descargas, `window.open`).
- `tests/js/editor.mjs` ejecuta el editor real y comprueba interacciones de puntero, teclado, bibliotecas, guardado, reapertura, exportaciones y saneado.
- `tests/js/pages.mjs` abre *Mis planos* y la ficha del proyecto reales, y comprueba los menús de acciones (capa fija, colocación, teclado, un solo menú), la confirmación y el borrado de pisos y proyectos.
- `tests/php/package.mjs` construye los ZIP, verifica su contenido y sumas, y hace una **instalación limpia** del paquete de demostración comprobando assets, catálogos y exportaciones.

Cada prueba corre en PHP 8.1 y 8.3 (la de paquetes en 8.3), sin instalar PHP en el equipo. Los resultados esperados están en el README.

## Empaquetado

`tools/build-packages.sh` copia el árbol a un directorio temporal con una lista explícita de exclusiones, crea las carpetas de datos vacías con `.gitkeep`, añade `LEEME-PRIMERO.txt` y comprime con `zip`. El paquete de demostración añade `resources/demo/.demo-build`, que el instalador lee para premarcar la casilla de demo. Al final calcula `SHA256SUMS.txt` y `BUILD.txt`.

## Decisiones y límites de la fase 1

- Sin DWG/DXF: fuera de alcance; se documenta explícitamente para no prometer compatibilidad inexistente.
- Sin colaboración en tiempo real: el bloqueo optimista por versión evita pérdidas silenciosas, pero la coordinación es humana.
- **Empresas y roles en la interfaz (1.17.0).** Cada cuenta estrena su propia empresa como propietaria; desde *Empresas* el propietario o un administrador da acceso por correo, crea la cuenta si no existe (con contraseña temporal entregada en mano) y asigna rol `owner`, `admin`, `editor` o `viewer`. Una persona puede pertenecer a varias empresas y ve los planos de todas. El sistema impide dejar una empresa sin propietario y no permite administrar a alguien con un rol igual o superior al propio. **No se envían correos**: no hay SMTP, la entrega de credenciales es humana.
- Migraciones automáticas y repetibles por `PRAGMA user_version` (hoy 7). Cada paso crea solo lo que falta; las instalaciones nuevas ya traen el esquema completo en `resources/schema.sql`. El paso que reescribe datos (empresas) va en transacción y, si falla, detiene la aplicación con un mensaje en vez de continuar.
- La escala es una **referencia declarada**: el editor no mide el mundo real ni convierte unidades físicas a píxeles de impresión.


## Pliego de señalización y rutas internas

- **Pliego (`schedule.js`)** trabaja sobre el diseño en pantalla: cuenta los elementos cuyo tipo empieza por `iso_` o `sig_`, resuelve su código con `Model.signCodeForType()`, agrupa por código, suma cantidades y toma nombre, familia y color de los catálogos ya cargados. El tamaño sugerido depende del área del piso (150/300/450 mm) y los precios unitarios viven en `localStorage` (`normia.schedule.prices`), nunca en la base. La consistencia compara el centro de cada equipo (extintor, botiquín, hidrante, alarma) con las señales `F001`, `E003`, `F002` y `F005`, y el final de cada ruta con las señales `E002`. La exportación es CSV con BOM y `;` y TSV al portapapeles.
- **Rutas (`measure.js`)** construye una retícula de 10 unidades sobre el lienzo, bloquea los muros por distancia al segmento (+ holgura), libera el rectángulo de cada puerta y rodea los equipos grandes; en modo silla de ruedas sube la holgura y bloquea también escaleras y equipos medianos. Busca el camino con A* (heap binario, 8 vecinos sin cortar esquinas) y lo suaviza con «tira de la cuerda» para que el trazo guardado no quede en escalera. El tiempo usa 1,2 m/s a pie y 0,8 m/s en silla de ruedas. **Guardar en el plano** crea la capa *Mediciones de ruta* y añade una `line` con etiqueta y un `text` con la distancia, todo dentro de `Model.begin()/end()` para que sea un solo paso del historial.
- Ambos cajones se registran en `EditorApp` como `app.schedule` y `app.measure`. El editor les pasa el clic del lienzo mientras `measure.tracing` está activo, redibuja su superposición al final de `renderNow()` y marca el pliego como desactualizado cuando cambia el modelo.

## Modo presentación

`assets/js/editor/present.js` es un controlador de vista que se monta una vez en `document.body` y se abre desde el botón `[data-present-open]`. Al abrir guarda un *snapshot* (selección, herramienta, vista y visibilidad de capas), añade `is-presenting` al `body` —el CSS oculta barra superior, rail, inspector, paleta y barra de estado y fija el lienzo a pantalla completa— y pide pantalla completa al navegador si está disponible.

- **Láser y spotlight** escuchan `pointermove` en el documento y pintan en una capa SVG propia; `track()` filtra movimientos menores de 7 px y limita la estela a 40 marcas.
- **Rutas** localiza el `polyline` de cada elemento `route` en el SVG del renderer, calcula su longitud con los puntos y aplica `stroke-dasharray`/`stroke-dashoffset` con la animación `present-trace`; la duración sale de la longitud y de la velocidad elegida.
- **Capas** escribe `layer.visible` y repinta con `scheduleRender()`; el snapshot devuelve el estado original al salir.
- **Quiz** se construye con el diseño en pantalla (puertas con `isExit`, códigos `F001` y `E007`, rutas) y se corrige en el cliente.
- **Salida** restaura selección, vista, herramienta y capas, y quita la clase del `body`. Mientras `app.presenting` es verdadero, `onPointerDown` y `onKeyDown` del editor no hacen nada.
