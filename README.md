# Normia Planos CAD

Editor de planos de emergencia y evacuación, en español, pensado para pequeñas y medianas organizaciones que necesitan documentar plantas, rutas, señalización y equipamiento sin depender de software CAD de escritorio ni de servicios externos.

- **Fase 1 completa**: instalador web, cuentas, proyectos y pisos, editor SVG real, biblioteca ISO 7010 de 332 pictogramas, 32 objetos CAD esquemáticos, guardado con versiones, borradores automáticos, deshacer/rehacer y exportación SVG/JSON/PNG/impresión.
- **PHP ≥ 8.1 + SQLite/PDO**, arquitectura MVC propia, sin Composer, sin `node_modules` en producción y sin CDN.
- **100 % local**: las fuentes, los estilos, los iconos, los pictogramas y los catálogos viven en el paquete. La aplicación no hace llamadas a servicios de terceros.
- **Licencia GPL-3.0**. Los pictogramas ISO 7010 conservan su licencia MIT y su atribución (ver [Créditos](#créditos-licencias-y-atribución)).

> **Aviso importante.** Los planos que produce este editor son **esquemáticos**. Sirven para comunicación interna, inducción y preparación de simulacros, pero **no son planos de obra ni certifican cumplimiento normativo**. Contrasta dimensiones, rutas, anchos de paso y escala en el sitio con la autoridad competente antes de usarlos como referencia de construcción o de cumplimiento legal.

---

## Índice

1. [Qué incluye](#qué-incluye)
2. [Requisitos](#requisitos)
3. [Instalación](#instalación)
4. [Primeros pasos](#primeros-pasos)
5. [El editor](#el-editor)
6. [Bibliotecas de señalización y CAD](#bibliotecas-de-señalización-y-cad)
7. [Guardado, versiones y borradores](#guardado-versiones-y-borradores)
8. [Exportaciones](#exportaciones)
9. [Formato de datos](#formato-de-datos)
10. [Arquitectura](#arquitectura)
11. [Seguridad](#seguridad)
12. [Pruebas](#pruebas)
13. [Paquetes y verificación](#paquetes-y-verificación)
14. [Limitaciones](#limitaciones)
15. [Créditos, licencias y atribución](#créditos-licencias-y-atribución)

---

## Qué incluye

| Área | Detalle |
| --- | --- |
| Instalación | Instalador web en 1 paso: requisitos, cuenta administradora, base SQLite y demo opcional. |
| Acceso | Inicio y cierre de sesión, contraseñas con `password_hash`, límite de intentos, sesión con nombre propio y regeneración de ID. |
| Proyectos | Nombre, sede, área de trabajo, responsable y notas. Duplicar, editar y eliminar con confirmación. |
| Pisos | Varios pisos por proyecto, orden, duplicación y protección del último piso. |
| Editor | Lienzo SVG con rejilla, reglas, ajuste, zoom, paneo, selección múltiple, marquesina, capas y grupos. |
| Herramientas | Muro, puerta, ruta de evacuación, texto, medida, línea, rectángulo y elipse. |
| Bibliotecas | 332 señales ISO 7010 (5 familias) y 32 objetos CAD de 6 familias, con búsqueda y filtros. |
| Propiedades | Posición, tamaño, rotación, color (paleta de 28), grosor, opacidad, texto, capa, bloqueo y cambio de tipo. |
| Historial | Deshacer/rehacer con 120 pasos, duplicar, pegar, agrupar, alinear, distribuir y orden de dibujo. |
| Persistencia | Guardado manual con nota, versiones inmutables, restaurar versión, borrador automático cada 30 s y detección de conflictos. |
| Exportación | SVG, JSON, PNG (generado en el navegador) e impresión lista para PDF desde el navegador. |
| Datos | Base SQLite con claves foráneas, consultas preparadas y copia de seguridad = 2 archivos. |

**No incluye** (por decisión de alcance de la fase 1): edición DWG/DXF, cálculo estructural, bibliotecas de mobiliario realistas, trabajo colaborativo en tiempo real, aplicaciones móviles nativas ni integraciones con servicios en la nube.

---

## Requisitos

**Producción**

- PHP **8.1 o superior** con `pdo_sqlite`, `session` y `json` (extensiones estándar).
- Apache o LiteSpeed con `.htaccess` (recomendado) o Nginx con la regla de la sección de instalación.
- Permisos de escritura para `config/`, `storage/`, `storage/sessions/` y `storage/logs/` (por ejemplo `755`/`775` según el usuario del servidor web).
- Navegador actualizado con SVG y Pointer Events (Chrome/Edge/Firefox/Safari de los últimos años).

**Desarrollo (solo para ejecutar las pruebas o reempaquetar)**

- Node.js **22 o superior** y `npm install` (instala `@php-wasm/node` y `jsdom` como dependencias de desarrollo).
- `bash`, `zip`, `unzip` y `sha256sum` para generar los paquetes.

No se necesita Composer, Node, ni ninguna biblioteca PHP de terceros para ejecutar la aplicación.

---

## Instalación

### 1. Publicar el paquete

Descomprime el ZIP en el directorio público del sitio. El paquete ya trae las carpetas internas protegidas con `.htaccess`:

```text
public_html/
├── index.php
├── bootstrap.php
├── .htaccess
├── app/
├── assets/
├── config/
├── docs/
├── resources/
└── storage/
```

El sitio puede vivir en la raíz del dominio o en una subcarpeta (`https://ejemplo.com/planos/`); los enlaces se calculan desde `index.php`.

### 2. Abrir el instalador

Visita el sitio. Si aún no hay configuración, la aplicación redirige a `index.php?r=install`.

El instalador comprueba:

- versión de PHP, PDO, PDO SQLite, sesiones y JSON;
- presencia de los catálogos locales;
- escritura en `storage/`, `storage/sessions/` y `config/`.

Después pide nombre, correo, contraseña (mínimo 10 caracteres con letras y números), confirmación y, opcionalmente, cargar el proyecto de demostración. Al finalizar escribe `config/config.php` con una clave aleatoria y crea `storage/normia-<16 hex>.sqlite`.

### 3. Nginx (si no usas Apache)

El `.htaccess` no se aplica en Nginx. Añade reglas equivalentes:

```nginx
root /var/www/normia/public;

location ~ ^/(app|config|resources|storage|tests|tools|docs)/ {
    deny all;
    return 404;
}

location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location ~ \.php$ {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
}
```

Sirve siempre por **HTTPS**: la sesión usa cookies `HttpOnly` y `SameSite=Lax`, pero la confidencialidad del tráfico depende del TLS del hosting.

### 4. Configuración manual (avanzado)

El camino soportado es el instalador. Para despliegues automatizados, copia `config/config.example.php` como `config/config.php`, ajusta la ruta de la base y genera una clave de 64 hexadecimales:

```bash
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

Luego importa `resources/schema.sql` en el archivo SQLite y crea el usuario administrador. Si el archivo de base no existe, la aplicación vuelve a mostrar el instalador.

### 5. Paquete de demostración

`normia-planos-cad-demo-<versión>.zip` es la misma aplicación con el marcador `resources/demo/.demo-build`, que **premarca** la casilla de demostración en el instalador. El proyecto de ejemplo incluye dos pisos (“Planta baja” y “Mezzanine”), capas de planta/equipos/señalización/rutas, muros, puertas, mobiliario, señalización ISO 7010 y rutas de evacuación. También puedes cargar la demo desde el paquete de producción marcando la casilla.

### 6. Copias de seguridad y reinstalación

- Respaldo completo: `config/config.php` + el archivo `storage/normia-*.sqlite` (más `-wal`/`-shm` si existen; detén el servidor o usa `sqlite3 .backup` para una copia consistente).
- Para reinstalar: elimina `config/config.php` y los `*.sqlite` de `storage/`; el instalador volverá a aparecer.
- No publiques `config/`, `storage/` ni `resources/`. El `.htaccess` incluido devuelve 404 para esas rutas, pero verifica la configuración de tu servidor.

---

## Primeros pasos

1. Entra con la cuenta creada en el instalador.
2. Crea un proyecto con nombre, sede, área de trabajo, responsable y notas.
3. El proyecto nace con un primer piso; puedes duplicarlo, añadir más o importar un diseño.
4. Abre el piso en el editor, dibuja la planta, coloca señalización y equipos y guarda una versión.
5. Exporta el SVG/JSON o usa **Imprimir** para generar un PDF desde el navegador.

---

## El editor

### Barra lateral izquierda

- **Seleccionar (V)**.
- **Muro (M)**, **Puerta (U)**, **Ruta de evacuación (E)**, **Texto (T)**, **Medida (D)**, **Línea (L)**, **Rectángulo (B)** y **Elipse (O)**, agrupados en el menú de formas.
- **Señalización ISO 7010** y **Equipamiento CAD**: abren el cajón de biblioteca con búsqueda, familias y vista previa.
- **Capas**, **Versiones** e **Imprimir** en la parte inferior.

### Gestos y puntero

- Arrastrar con una herramienta de dibujo crea el elemento; `Shift` restringe a horizontal/vertical o mantiene proporciones.
- Con **Seleccionar**, clic selecciona; `Shift` añade a la selección; arrastrar el fondo dibuja una marquesina.
- Arrastrar un elemento seleccionado lo mueve con ajuste a la rejilla (`Alt` desactiva el ajuste).
- Los tiradores de la caja de selección escalan; el tirador superior rota (`Shift` fija pasos de 15°).
- Rueda = zoom en el puntero; `Shift` + rueda = desplazamiento vertical; barra espaciadora + arrastrar = paneo.
- Doble clic en un texto o etiqueta abre y enfoca el campo de texto del inspector.

### Atajos de teclado

| Acción | Atajo |
| --- | --- |
| Herramientas | `V` `M` `U` `E` `T` `D` `L` `B` `O` |
| Guardar versión | `Ctrl/⌘ + S` |
| Deshacer / rehacer | `Ctrl/⌘ + Z` / `Ctrl/⌘ + Y` o `Ctrl/⌘ + Shift + Z` |
| Seleccionar todo | `Ctrl/⌘ + A` |
| Copiar / pegar | `Ctrl/⌘ + C` / `Ctrl/⌘ + V` |
| Duplicar | `Ctrl/⌘ + D` |
| Agrupar / desagrupar | `Ctrl/⌘ + G` / `Ctrl/⌘ + Shift + G` |
| Bloquear / desbloquear | `Ctrl/⌘ + L` |
| Eliminar | `Supr` o `Retroceso` |
| Mover 1 paso / 10 pasos | Flechas / `Shift` + flechas |
| Zoom / ajustar | `+` `-` / `0` |
| Cancelar / volver a seleccionar | `Esc` (cierra cajón, cancela colocación, sale de la herramienta) |

### Reglas, rejilla y estado

- Reglas horizontal y vertical con marcas cada 10–2000 unidades según el zoom y etiqueta de unidad.
- La barra de estado muestra tamaño del lienzo, escala de referencia, coordenadas del puntero y selección actual.
- El lienzo avisa cuando está vacío y muestra una pista contextual por herramienta.

### Propiedades

El inspector permite editar geometría (X, Y, ancho, alto, rotación), apariencia (28 colores, grosor, opacidad), texto y tamaño de letra, capa, bloqueo, cambio de tipo entre formas básicas, duplicado, eliminación, agrupación, alineación, distribución y orden de dibujo. Los controles que no aplican al elemento seleccionado no se muestran o quedan deshabilitados.

### Capas y grupos

- Hasta 24 capas por piso; se pueden renombrar, ocultar, bloquear, reordenar, crear y eliminar (no la última).
- Los elementos de una capa bloqueada u oculta no se pueden editar ni seleccionar.
- Agrupar (2–80 miembros) mueve y selecciona el grupo como una unidad; desagrupar lo disuelve.

---

## Bibliotecas de señalización y CAD

### Señalización ISO 7010 (332 pictogramas)

- Familias: emergencia/evacuación (`#237f52`), fuego (`#b71f2e`), obligación (`#005387`), prohibición (`#b71f2e`) y advertencia (`#f9a800`).
- Identificador interno: `iso_<código en minúsculas>` (por ejemplo `iso_e002`).
- Búsqueda por código, nombre, descripción, familia y alias heredados (`exit`, `extinguisher`, `first_aid`, `alarm`, `assembly`).
- El color de las señales se deriva de su familia y no se edita con la paleta.
- Origen y licencia: `resources/licenses/iso-safety-signs.LICENSE.txt` y `iso-safety-signs.NOTICE.txt`.

### Equipamiento CAD (32 objetos)

- Familias: mobiliario, sanitarios, cocina, industrial, vehículos y verticales (escaleras/rampas).
- Identificador `cad_*` (por ejemplo `cad_desk`, `cad_forklift`, `cad_stairs_straight`).
- Son **esquemáticos**: no representan medidas certificadas; la descripción y la referencia están en `resources/cad-objects.json`.

### Catálogos en disco

| Archivo | Contenido |
| --- | --- |
| `resources/iso7010-catalog.json` | `{format, standard, source, license, categories, signs{CODE:{name,category,description,svg}}}` |
| `resources/cad-objects.json` | `{version, categories{furniture,...}, objects{cad_*:{category,name,description,reference,color,svg}}}` |
| `resources/sign-aliases.json` | Alias heredados → códigos ISO 7010 |
| `resources/schema.sql` | Esquema SQLite |
| `resources/demo/demo-project.json` | Proyecto de demostración (2 pisos) |

---

## Guardado, versiones y borradores

- **Guardar** crea una versión nueva e inmutable en `floor_versions`; el piso apunta siempre a la última.
- La primera vez que se guarda un piso recién creado se genera la **v2** con el diseño inicial editado.
- Cada versión guarda número, nota, autor y fecha; se puede **restaurar** (crea una versión nueva, no reescribe el historial).
- **Borrador automático** cada 30 segundos si hay cambios sin guardar (`draft_json`, `draft_base_version`, `draft_updated_at`). No crea versiones.
- Al reabrir con borrador se muestra un aviso con dos acciones: descartarlo o guardar una versión.
- **Conflictos**: cada guardado envía `expected_version`. Si otra sesión guardó antes, el servidor responde `409` con `current_version`; el editor conserva el trabajo en pantalla y ofrece recargar la versión actual o descargar una copia local en JSON.
- Antes de cerrar la pestaña, el navegador pide confirmación si hay cambios sin guardar.

API interna del editor (todas las peticiones POST requieren `X-CSRF-Token` o `_token`):

| Método y ruta | Uso |
| --- | --- |
| `GET api/floors/{id}` | Diseño actual, metadatos del piso y borrador pendiente. |
| `POST api/floors/{id}/save` | `{design, expected_version, note?}` → `{ok, version, message}`. |
| `POST api/floors/{id}/autosave` | `{design, base_version}` → borrador. |
| `POST api/floors/{id}/discard-draft` | Elimina el borrador del piso. |
| `GET api/floors/{id}/versions` | Historial. |
| `POST api/floors/{id}/versions/{versionId}/restore` | Restaura una versión como nueva. |
| `POST api/floors/{id}/settings` | Nombre y nivel del piso (rechaza `<` y `>`). |

---

## Exportaciones

| Formato | Cómo | Contenido |
| --- | --- | --- |
| **SVG** | Botón Exportar o ruta `…/export/svg` | Dibujo vectorial de la versión guardada, con estilos incrustados, sin scripts. |
| **JSON** | `…/export/json` | `schema_version: 2`, proyecto, piso, diseño completo, atribución y fecha. |
| **PNG** | Exportar → PNG | Se rasteriza en el navegador el diseño actual; no sube nada al servidor. |
| **Impresión/PDF** | `…/print` o Exportar → Imprimir | Hoja con membrete, metadatos, plano y pie con el aviso de verificación en sitio. Usa “Guardar como PDF” del navegador. |

Nombre de archivo: `normia-<proyecto>-<piso>-v<versión>.<svg|json|png>`. Las exportaciones usan la **última versión guardada**; si hay cambios sin guardar, el editor lo advierte antes de exportar.

Los SVG se generan con identificadores únicos por plano, sin `<script>`, sin `<foreignObject>`, sin eventos `on*` y sin referencias externas; los catálogos se insertan como símbolos saneados.

---

## Formato de datos

El detalle completo está en [`docs/FORMATO-PLANO.md`](docs/FORMATO-PLANO.md). Resumen del esquema **v2**:

```json
{
  "format": 2,
  "canvas": { "width": 1123, "height": 794, "grid": 20, "unit": "cm", "scale": "1:100", "background": "#ffffff" },
  "layers": [{ "id": "capa_planta", "name": "Planta", "visible": true, "locked": false }],
  "elements": [
    {
      "id": "el_planta_001", "type": "wall", "layerId": "capa_planta",
      "x": 60, "y": 60, "w": 400, "h": 12, "rotation": 0,
      "color": "#334155", "stroke": 12, "opacity": 1, "label": "", "locked": false,
      "points": [{ "x": 0, "y": 6 }, { "x": 400, "y": 6 }]
    }
  ],
  "groups": [{ "id": "grupo_puesto", "name": "Puesto de trabajo", "members": ["el_...", "el_..."] }]
}
```

Límites del validador: lienzo 400–4000 × 300–3000, rejilla 5–100, hasta 1200 elementos, 24 capas y 80 grupos de 2–80 miembros, identificadores `^[A-Za-z][A-Za-z0-9_-]{2,63}$`, etiquetas de hasta 240 caracteres sin `<` ni `>`, 28 colores permitidos, trazos de hasta 40 puntos (línea y medida exactamente 2), JSON de hasta 2.5 MB.

La importación acepta el JSON propio v2 y el formato heredado de la fase de referencia (`format: 1`, `elements[].tool`), y convierte alias (`exit`, `extinguisher`, `first_aid`, `alarm`, `assembly`, `exit_sign`, `fire_extinguisher`, `first_aid_kit`, `emergency_exit`) a señales ISO 7010. Un archivo con herramientas desconocidas, markup arbitrario, colores fuera de paleta o coordenadas inválidas se rechaza entero (no se importa parcialmente). No se importan DWG, DXF ni SVG.

---

## Arquitectura

Detalle ampliado en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

```text
.
├── bootstrap.php          Guarda PHP ≥ 8.1, autoloader, helpers, config y zona horaria
├── index.php              Punto de entrada → Application::run()
├── app/
│   ├── Core/              Autoloader, Application, Router, Request/Response, Config,
│   │                      Session, Csrf, Auth, Database, View, Url, excepciones
│   ├── Controllers/       Instalación, acceso, panel, proyectos, editor, API, exportación, biblioteca, cuenta
│   ├── Models/            User, Project, Floor
│   ├── Services/          DesignFactory, DesignValidator, DesignImporter, LibraryRepository,
│   │                      SvgExporter, Installer, DemoSeeder
│   ├── Support/helpers.php
│   └── Views/             Plantillas PHP con escape (layout, auth, panel, editor, impresión, errores)
├── assets/
│   ├── css/               app.css, editor.css, print.css
│   ├── js/                ui.js, app.js, print.js
│   │   ├── lib/           geometry.js, model.js, renderer.js
│   │   └── editor/        store.js, inspector.js, library.js + editor.js
│   └── img/favicon.svg
├── config/                config.example.php (el config.php real lo genera el instalador)
├── resources/             Catálogos, esquema, alias, demo y licencias
├── storage/               Base de datos, sesiones, caché y logs (protegida)
├── tests/                 Suite de desarrollo (PHP/JS con php-wasm y JSDOM)
└── tools/build-packages.sh
```

### Modelo de petición

1. `index.php` carga `bootstrap.php` (versión de PHP, autoloader, helpers, configuración, zona horaria).
2. `App\Core\Application::run()` envía cabeceras de seguridad, inicia la sesión y resuelve la ruta con `Router`.
3. Sin configuración → instalador. POST sin CSRF válido → `419`. Sin sesión → `401`/redirección a login.
4. El controlador valida, llama a modelos/servicios con consultas preparadas y renderiza una vista o JSON.
5. `ValidationException` → `422`; `DomainException` → `422`; errores inesperados → `500` con mensaje genérico.

### Frontend

- JavaScript sin frameworks en módulos IIFE que comparten el espacio `window.Normia`.
- `Model` contiene el diseño normalizado, selección, historial y operaciones; `Renderer` dibuja SVG; `EditorStore` habla con la API; `Inspector` y `Library` renderizan paneles; `EditorApp` coordina eventos, herramientas y atajos.
- El HTML del editor entrega el diseño y el contexto como JSON embebido (se elimina del DOM tras el arranque).
- Todo el texto de interfaz y los mensajes están en español.

### Base de datos

SQLite con `PRAGMA foreign_keys = ON` y consultas preparadas. Tablas: `users`, `projects` (FK a usuarios, `ON DELETE CASCADE`), `floors` (FK a proyectos, diseño, versión y borrador) y `floor_versions` (FK a pisos y usuarios, única por `floor_id + version`). Los nombres de archivo de la base y la clave de aplicación son aleatorios en cada instalación.

---

## Seguridad

- Contraseñas con `password_hash`/`password_verify`; mínimo 10 caracteres con letras y números; límite de 6 intentos por 10 minutos por sesión.
- CSRF con token por sesión en todos los formularios y en las llamadas de la API; respuestas `419` claras.
- Cookies de sesión `HttpOnly`, `SameSite=Lax` y `Secure` cuando hay HTTPS; nombre de cookie configurable; regeneración de ID al iniciar sesión.
- Todas las consultas usan PDO con parámetros; no se concatenan valores en SQL.
- Escapado de salida con `e()` en las vistas; validación de tipos, colores, capas, coordenadas, etiquetas y tamaños en servidor.
- Los SVG importados se sanean (sin `<script>`, `<foreignObject>`, `on*`, `<style>`, `class`, `href` externos) y se convierten a elementos internos.
- `.htaccess` raíz niega `app/`, `config/`, `resources/`, `storage/`, `tests/`, `tools/` y `docs/`, y las carpetas `storage/*` y `config/` traen su propio `.htaccess`.
- Cabeceras: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- Subidas acotadas a 2.5 MB y validadas antes de tocar la base (solo JSON de diseño).
- Los errores inesperados se registran en `storage/last-error.log` y en el log del servidor; nunca se muestran trazas al usuario. Este archivo está ignorado por Git y excluido de los paquetes.

---

## Pruebas

La suite usa **php-wasm** (PHP compilado a WebAssembly) y **JSDOM**, de modo que las pruebas ejecutan la aplicación real —no mocks— en PHP 8.1 y 8.3, sin necesidad de instalar PHP en el equipo.

```bash
npm install            # solo desarrollo: @php-wasm/node y jsdom
npm test               # suite completa (8 pasos)
npm run test:quick     # sin construir/validar paquetes
npm run test:php:81    # suite funcional en PHP 8.1
npm run test:php:83    # suite funcional en PHP 8.3
npm run test:js        # editor real en JSDOM (PHP 8.3)
npm run test:package   # construye los ZIP y hace la instalación limpia de la demo
npm run lint:php       # sintaxis de 51 archivos PHP en 8.1 y 8.3
npm run lint:js        # sintaxis de todos los JS/MJS
```

### Qué cubre cada bloque

| Bloque | Comprobaciones |
| --- | --- |
| `tests/php/lint.mjs` | `php -l` sobre todo `app/`, `bootstrap.php` e `index.php` en 8.1 y 8.3. |
| `tests/php/functional.mjs` | 119 comprobaciones: instalador, requisitos, contraseñas débiles, CSRF, sesión, autorización entre cuentas, CRUD de proyectos/pisos, duplicados, importación v1/v2, validaciones de la API, guardado/versiones/borradores/conflictos, exportaciones, ciclo de vida y logout. |
| `tests/js/editor.mjs` | 84 comprobaciones de interfaz sobre la app real: arranque, 332 señales y 32 objetos, reglas, herramientas, inserción con puntero, selección, mover, escalar, rotar, color, cambio de tipo, deshacer/rehacer, duplicar, agrupar, bloquear, desplazar, texto y saneado, guardar, reabrir, borradores, conflictos, exportación SVG/JSON/PNG, tooltips sin acumulación, capas, versiones y límites. |
| `tests/php/package.mjs` | 32 comprobaciones: construye ambos ZIP, verifica que no haya bases, sesiones, credenciales, logs ni carpetas de desarrollo, valida los SHA-256 y hace una instalación limpia de la demo comprobando assets (11), catálogos (332/32), editor, SVG, JSON e impresión. |

Resultados esperados de la última ejecución completa:

```text
✓ Sintaxis PHP 8.1 · 51 archivos, sin errores
✓ Sintaxis PHP 8.3 · 51 archivos, sin errores
✓ Sintaxis JavaScript · 16 archivos, sin errores
✓ Funcional PHP 8.1 · 119/119
✓ Funcional PHP 8.3 · 119/119
✓ Interfaz (JSDOM) PHP 8.1 · 84/84
✓ Interfaz (JSDOM) PHP 8.3 · 84/84
✓ Paquetes y demo · 32/32
8/8 pasos correctos
```

Las pruebas trabajan sobre copias temporales: no escriben configuración ni bases en el repositorio. `node_modules` solo contiene dependencias de desarrollo y se excluye de los paquetes.

---

## Paquetes y verificación

La entrega v1.0.0 incluye los ZIP ya construidos en **`paquetes/v1.0.0/`** (misma composición que genera el script, verificada por `tests/php/package.mjs`):

```text
paquetes/v1.0.0/
├── normia-planos-cad-1.0.0.zip
├── normia-planos-cad-demo-1.0.0.zip
├── SHA256SUMS.txt
└── BUILD.txt
```

Para regenerarlos desde el código (por ejemplo tras cambiar plantillas o catálogos):

```bash
npm run build          # o: bash tools/build-packages.sh
```

El script deja los artefactos en `dist/`:

```text
normia-planos-cad-1.0.0.zip
normia-planos-cad-demo-1.0.0.zip
SHA256SUMS.txt
BUILD.txt
```

- **Excluidos siempre**: `config/config.php`, `*.sqlite`, sesiones, logs, caché, `tests/`, `tools/`, `package.json`, `node_modules`, `.git`, `dist`, `paquetes` y el marcador de demo (salvo en el paquete de demostración).
- **Incluidos**: aplicación, assets, catálogos, licencias, documentación, `LEEME-PRIMERO.txt`, `config/config.example.php` y carpetas `storage` vacías con `.gitkeep`.
- Verifica las sumas:

```bash
cd paquetes/v1.0.0
sha256sum -c SHA256SUMS.txt
```

Los hashes exactos de los ZIP publicados están en `paquetes/v1.0.0/SHA256SUMS.txt`; `dist/` es solo la salida de trabajo y está ignorada por Git.

---

## Limitaciones

- Planos **esquemáticos**: no hay cálculo de áreas, estructuras, cargas ni normativa automática. La escala es una referencia declarada, no una medición certificada.
- Sin DWG/DXF ni importación de CAD de escritorio. La importación acepta el JSON propio (v2 y heredado v1); no se importan SVG ni archivos de CAD.
- El trabajo es por cuenta: no hay colaboración simultánea. El control de versiones evita sobrescrituras accidentales, pero dos personas deben coordinar quién guarda.
- El PNG se rasteriza en el cliente; en navegadores muy antiguos o sin Canvas puede no generarse (el SVG y el JSON siguen disponibles).
- La impresión depende del navegador: usa “Guardar como PDF”, tamaño de papel y escala de impresión adecuados.
- SQLite es ideal para una instalación por organización y cargas moderadas; no está pensado para decenas de usuarios concurrentes ni para almacenamiento en red (NFS/SMB).
- Los pictogramas ISO 7010 son referencias gráficas: la señalización física debe cumplir la norma y la normativa local aplicable.
- No se declara certificación, acreditación ni cumplimiento legal automático de ningún país. La responsabilidad del contenido final y de su validación es de la organización que usa la herramienta.

---

## Créditos, licencias y atribución

- **Normia Planos CAD** se distribuye bajo **GNU GPL-3.0** (ver `LICENSE`).
- **Pictogramas ISO 7010**: provienen de `@iso-safety-signs/core` 1.1.0, licencia **MIT**, © Karl Norling (<https://github.com/karlnorling/iso-safety-signs>). La atribución de archivos procedentes de Wikimedia Commons está en `resources/licenses/iso-safety-signs.NOTICE.txt`; los términos completos, en `resources/licenses/iso-safety-signs.LICENSE.txt`.
- **Objetos CAD**: creados para Normia como representaciones esquemáticas; se incluyen en el proyecto bajo la misma licencia GPL-3.0.
- **Tipografía e iconos**: la interfaz usa la pila de fuentes del sistema y un sprite SVG propio; no se descargan fuentes ni iconos externos.
- Los nombres de productos o normas citados pertenecen a sus titulares y se usan solo con fines descriptivos.

---

Hecho para documentar plantas de emergencia con datos que se quedan en tu servidor. Si encuentras un error o quieres proponer una mejora, revisa primero `docs/` y la suite de pruebas: casi todo lo que la interfaz promete está cubierto por una comprobación automática.
