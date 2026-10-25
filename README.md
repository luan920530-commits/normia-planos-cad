# Normia Planos CAD

Editor de planos de emergencia y evacuación, en español, pensado para pequeñas y medianas organizaciones que necesitan documentar plantas, rutas, señalización y equipamiento sin depender de software CAD de escritorio ni de servicios externos.

- **Editor completo**: instalador web, cuentas, proyectos y pisos, editor SVG real, biblioteca de **354 pictogramas** (332 ISO 7010 + 22 señales de servicios como baños, vestidores y cafetería), **145 objetos CAD esquemáticos de 18 familias** (restaurante, bodega, comercio, hospital, costura, asadero, supermercado, vivienda, deportes, exteriores, instalaciones eléctricas y redes hidrosanitarias, entre otras), puertas de uno y dos batientes y portones, **rutas con vértices editables**, **redes de tubería (agua, gas, desagües e incendio) y circuitos eléctricos**, guardado con versiones, borradores automáticos, deshacer/rehacer y exportación SVG/JSON/PNG/impresión.
- **Instalaciones**: tuberías de agua, gas, desagües e incendio y red eléctrica con longitudes, diámetros, circuitos, cargas y caída de tensión estimada.
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
13. [Cambios de la versión 1.0.4](#cambios-de-la-versión-104)
14. [Paquetes y verificación](#paquetes-y-verificación)
15. [Limitaciones](#limitaciones)
16. [Créditos, licencias y atribución](#créditos-licencias-y-atribución)

---

## Qué incluye

| Área | Detalle |
| --- | --- |
| Instalación | Instalador web en 1 paso: requisitos, cuenta administradora, base SQLite y demo opcional. |
| Acceso | Inicio y cierre de sesión, contraseñas con `password_hash`, límite de intentos, sesión con nombre propio y regeneración de ID. |
| Proyectos | Nombre, sede, área de trabajo, responsable y notas. Duplicar, editar y eliminar con confirmación. |
| Pisos | Varios pisos por proyecto, orden, duplicación y protección del último piso. |
| Editor | Lienzo SVG con rejilla, reglas, ajuste, zoom, paneo, selección múltiple, marquesina, capas y grupos. |
| Herramientas | Muro, puerta sencilla, puerta doble, portón o reja, ruta de evacuación, texto, medida, línea, rectángulo, elipse, **tubería** y **tubería eléctrica**. |
| Bibliotecas | 354 señales (332 ISO 7010 + 22 de orientación y servicios) en 6 familias y 145 objetos CAD en 18 familias, con búsqueda y filtros por familia. |
| Propiedades | Posición, tamaño, rotación, sentido de apertura, color (paleta de 29), grosor, opacidad, texto, capa, bloqueo, cambio de tipo y, en redes, **sistema, diámetro, material, pendiente, presión, circuito, tensión, calibre, fases y carga**. |
| Historial | Deshacer/rehacer con 120 pasos, duplicar, pegar, agrupar, alinear, distribuir y orden de dibujo. |
| Redes | Panel **Redes y circuitos** con longitudes por sistema, diámetros usados, pendientes, cargas por circuito, breaker y calibre sugeridos y caída de tensión estimada. |
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

`normia-planos-cad-demo-<versión>.zip` es la misma aplicación con el marcador `resources/demo/.demo-build`, que **premarca** la casilla de demostración en el instalador. El proyecto de ejemplo incluye cuatro pisos (“Planta baja”, “Mezzanine”, “Local comercial y cafetería” y “Zona recreativa”), capas de planta/equipos/señalización/rutas, muros, puertas sencillas y dobles, un portón de carga, mobiliario de restaurante, comercio, supermercado y hospital, señales de baño, duchas y cafetería, una piscina, canchas, vegetación exterior y rutas de evacuación. También puedes cargar la demo desde el paquete de producción marcando la casilla.

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
- **Muro (M)**, **Puerta (U)**, **Ruta de evacuación (E)**, **Tubería (P)** —con desplegable de red—, **Eléctrico (Shift + P)**, **Texto (T)**, **Medida (D)**, **Línea (L)**, **Rectángulo (B)** y **Elipse (O)**, agrupados en el menú de formas.
- **Señalización ISO 7010** y **Equipamiento CAD**: abren el cajón de biblioteca con búsqueda, familias y vista previa.
- **Redes y circuitos**, **Capas**, **Versiones**, **Ajustes**, **Atajos** e **Imprimir** en la parte inferior.

### Gestos y puntero

- Arrastrar con una herramienta de dibujo crea el elemento; `Shift` restringe a horizontal/vertical o mantiene proporciones.
- Con **Seleccionar**, clic selecciona; `Shift` añade a la selección; arrastrar el fondo dibuja una marquesina.
- Arrastrar un elemento seleccionado lo mueve con ajuste a la rejilla (`Alt` desactiva el ajuste).
- Los tiradores de la caja de selección escalan; el tirador superior rota (`Shift` fija pasos de 15°). Los tiradores se dibujan un poco más grandes que el trazo para poder agarrar muros finos, pero un clic sin arrastre nunca mueve ni deforma nada.
- **Rutas de evacuación**: clic para añadir puntos, clic sobre el primer punto para cerrar el circuito, `Retroceso` quita el último punto, `Enter` o doble clic termina y `Esc` cancela.
- **Biblioteca**: arrastra una tarjeta al lienzo o pulsa **Insertar en el plano**; el cajón se cierra y el recurso se coloca con el siguiente clic (o `Enter` sobre la tarjeta).
- **Tuberías y circuitos**: igual que una ruta (clic para añadir puntos, `Enter` o doble clic para cerrar, `Esc` para cancelar). Después puedes arrastrar sus vértices como cualquier trazo.
- Rueda = zoom en el puntero; `Shift` + rueda = desplazamiento vertical; barra espaciadora + arrastrar = paneo.
- Doble clic en un texto o etiqueta abre y enfoca el campo de texto del inspector.

### Atajos de teclado

| Acción | Atajo |
| --- | --- |
| Herramientas | `V` `M` `U` `E` `T` `D` `L` `B` `O` |
| Redes | `P` (tubería) · `Shift + P` (tubería eléctrica) |
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

El inspector permite editar geometría (X, Y, ancho, alto, rotación), apariencia (29 colores, grosor, opacidad), sentido de apertura en puertas, texto y tamaño de letra, capa, bloqueo, cambio de tipo entre formas básicas, duplicado, eliminación, agrupación, alineación, distribución y orden de dibujo. En tuberías añade **red, diámetro, material, pendiente y presión**; en circuitos, **código, tensión, calibre y fases**; en equipos eléctricos, **circuito y carga en VA**. Los controles que no aplican al elemento seleccionado no se muestran o quedan deshabilitados.

### Capas y grupos

- Hasta 24 capas por piso; se pueden renombrar, ocultar, bloquear, reordenar, crear y eliminar (no la última).
- Los elementos de una capa bloqueada u oculta no se pueden editar ni seleccionar.
- Agrupar (2–80 miembros) mueve y selecciona el grupo como una unidad; desagrupar lo disuelve.

---

## Bibliotecas de señalización y CAD

### Señalización: 332 ISO 7010 + 22 de servicios

**ISO 7010 (332 pictogramas)**

- Familias: emergencia/evacuación (`#237f52`), fuego (`#b71f2e`), obligación (`#005387`), prohibición (`#b71f2e`) y advertencia (`#f9a800`).
- Identificador interno: `iso_<código en minúsculas>` (por ejemplo `iso_e002`).
- Origen y licencia: `resources/licenses/iso-safety-signs.LICENSE.txt` y `iso-safety-signs.NOTICE.txt`.

**Orientación y servicios (22 pictogramas propios)**

- Familia `services` (`#0f766e`), identificador `sig_<nombre>` (por ejemplo `sig_wc_men` → `SVC_WC_MEN`).
- Cubre lo que ISO 7010 no normaliza y faltaba en la biblioteca: **baño de hombres**, **baño de mujeres**, **baño mixto**, **baño accesible (PMR)**, **cambiador de bebés**, **lactario**, **duchas**, **vestidores**, **cafetería**, **comedor**, **recepción**, **sala de espera**, **farmacia**, **parqueadero**, **bicicletero**, **punto de carga**, **lavandería**, **depósito**, **zona de fumadores**, **vigilancia**, **ascensor** y **escaleras**.
- Son pictogramas originales de este proyecto (GPL-3.0), no señales ISO 7010: se documenta así en la ficha de cada recurso para no atribuirles una norma que no les corresponde.
- Búsqueda por código, nombre, descripción, familia y alias en español (`baño`, `bano`, `sanitario`, `wc`, `vestuario`, `cafeteria`, `parqueadero`, `discapacidad`, `pmr`…).
- El color de las señales (ISO o de servicios) se deriva de su familia y no se edita con la paleta.

**Rutas y trazos editables**

- Cualquier ruta, muro, línea o medida seleccionada muestra un **tirador por vértice**: arrástralo para mover esa esquina (con `Shift` se alinea con el vértice anterior).
- **Doble clic** sobre el trazo añade un vértice en el segmento más cercano y **`Alt`+clic** sobre un vértice lo elimina.
- Al mover un vértice la caja del elemento se recalcula sola, la rotación se disuelve en los puntos y cada paso entra en el historial (deshacer/rehacer).
- Las rutas de evacuación conservan el cierre en circuito: el primer y el último punto siguen unidos.

### Equipamiento CAD (145 objetos en 18 familias)

| Familia | Objetos | Ejemplos |
| --- | --- | --- |
| Mobiliario y estanterías | 8 | escritorio, mesa de reuniones, estantería, archivador |
| Baños | 6 | inodoro, lavamanos, ducha, cambiador de bebés, baño accesible completo |
| Cocinas | 5 | estufa, nevera, lavaplatos, campana extractora |
| Equipos industriales | 8 | compresor, sierra circular, generador, bomba, tanque |
| Vehículos y maquinaria | 7 | automóvil, camión, montacargas, retroexcavadora, grúa |
| Conexiones entre pisos | 6 | escalera recta, escalera en L, rampa, ascensor |
| Restaurante y cafetería | 7 | mesa de cuatro puestos, barra, cocina de línea, nevera de bebidas |
| Bodega y logística | 8 | racks, palé, báscula, muelle de carga, banda transportadora |
| Comercio y centro comercial | 6 | vitrina, probador, caja registradora, isla de kiosco |
| Salud y hospital | 10 | camilla, cama, sillón odontológico, rayos X, incubadora, estación de enfermería |
| Costura y confección | 6 | máquina plana, fileteadora, mesa de corte, maniquí |
| Asadero y parrilla | 5 | parrilla, horno de asadero, campana, mesón, tanque de gas |
| Supermercado | 7 | góndola, nevera mural, congelador, carrito, caja |
| Vivienda y edificios residenciales | 9 | sofá, cama doble, cocina integral, lavadora, baño completo |
| Deportes, canchas y piscinas | 11 | cancha de fútbol, de baloncesto, de tenis, piscina, trampolín, caminadora |
| Exteriores y urbanismo | 15 | árbol, arbusto, luminaria, hidrante, fuente, bicicletero, bolardo, matera, plaza de parqueo, contenedor, pérgola |
| Instalaciones eléctricas | 12 | tomacorriente, tomacorriente 220 V, interruptor, interruptor doble, tablero, luminaria, salida de techo, luminaria de emergencia, salida de datos, aire acondicionado, extractor, caja de piso |
| Redes hidrosanitarias | 12 | válvula de bola, válvula de compuerta, válvula de retención, medidor de agua, medidor de gas, equipo hidroneumático, tanque, rejilla de piso, bajante de cubierta, gabinete contra incendios, rociador, caja de inspección |

- Identificador `cad_*` (por ejemplo `cad_desk`, `cad_rest_bar`, `cad_sport_pool`).
- Los objetos de agua (piscina, trampolín) usan un color propio del catálogo (`#0891b2`); el resto hereda el color del elemento.
- Son **esquemáticos**: no representan medidas certificadas; la descripción y la referencia están en `resources/cad-objects.json`. Verifica siempre las dimensiones en el sitio.

### Puertas y portones

| Tipo | Caja por defecto | Uso |
| --- | --- | --- |
| `door` | 90 × 90 | Puerta de un batiente, con marco, hoja y arco de abatimiento continuo. |
| `door_double` | 120 × 60 | Puerta de dos batientes, con dos hojas y dos arcos simétricos. |
| `door_garage` | 160 × 50 | Portón o reja de garaje: panel con barras verticales, raíles y hueco en el muro. |

- El borde inferior de la caja es el **vano**: dibuja el muro a la altura de `y + h` y deja el hueco del ancho de la puerta.
- `flipX` invierte el lado de apertura y `flipY` el sentido de la hoja (útil en muros verticales).
- Los planos antiguos con puertas de 80 × 16 se migran automáticamente al esquema actual.

### Redes de tubería y circuitos eléctricos

Dos herramientas nuevas permiten dibujar instalaciones sobre la misma planta:

| Herramienta | Atajo | Qué dibuja |
| --- | --- | --- |
| **Tubería** | `P` | Tramos de agua fría, agua caliente, gas combustible, aguas negras, aguas lluvias y red contra incendios. El desplegable del botón cambia de sistema. |
| **Tubería eléctrica** | `Shift + P` | Tramos de circuito (tubería/conduit) que agrupan cargas por código. |

- Cada sistema tiene **color, estilo de línea, diámetro y material de referencia** propios; al cambiar de red se aplican esos valores y después puedes sobrescribirlos.
- Cada tramo guarda **sistema, diámetro, material, pendiente (física, en %), presión de referencia (kPa)** si es tubería, o **circuito, tensión, calibre y fases** si es eléctrica. Los equipos de la familia *Instalaciones eléctricas* guardan **circuito y carga (VA)**.
- Los tramos se dibujan con nodos en los extremos y un rótulo técnico sobre el trazo (por ejemplo `AN Ø 4" · 8,2 m · i=2 %` o `C2 · 12 AWG · 220 V`).
- El trazo es editable por vértice igual que las rutas: arrastrar, doble clic para añadir y `Alt`+clic para quitar.
- Todo se guarda en el diseño, se valida en el servidor y se exporta a SVG, PNG y PDF/impresión.

El panel **Redes y circuitos** (barra lateral inferior) resume el piso:

- Longitud por sistema, diámetros usados y materiales.
- Avisos de pendiente cuando un tramo de desagüe queda por debajo de la referencia de su diámetro o asciende en lugar de descender.
- Carga instalada por circuito, corriente calculada, **breaker sugerido** (con reserva del 125 %) y **calibre sugerido** por capacidad de conducción.
- **Caída de tensión estimada** por circuito y aviso cuando supera el 3 % de referencia.
- Los mismos datos están disponibles en la API: `GET /index.php?r=api/floors/{id}/mep` y el catálogo en `GET /index.php?r=catalogs/mep`.

> **Estos cálculos son de referencia.** Las tablas de capacidad, las pendientes mínimas y las caídas de tensión admisibles dependen de la norma aplicable, del material, de la temperatura y del proyecto. Confírmalos con la memoria de cálculo y con un profesional competente antes de construir. La aplicación no emite certificados ni dictámenes.

### Catálogos en disco

| Archivo | Contenido |
| --- | --- |
| `resources/iso7010-catalog.json` | `{format, standard, source, license, categories, signs{CODE:{name,category,description,svg}}}` |
| `resources/cad-objects.json` | `{version, categories{furniture,...}, objects{cad_*:{category,name,description,reference,color,load?,svg}}}` — 145 objetos en 18 familias |
| `resources/service-signs.json` | `{format, standard, license, categories{services}, signs{SVC_*:{name,category,description,aliases,svg}}}` — 22 señales propias |
| `resources/mep-networks.json` | `{hydraulic{clave:{label,short,color,dash,stroke,diameter,material,gravity,pressureKpa,reference}},diameters[],materials{},slopes{},electrical{...}}` — valores de referencia de redes y circuitos |
| `resources/sign-aliases.json` | Alias heredados → códigos ISO 7010 |
| `resources/schema.sql` | Esquema SQLite |
| `resources/demo/demo-project.json` | Proyecto de demostración (4 pisos) |

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

Límites del validador: lienzo 400–4000 × 300–3000, rejilla 5–100, hasta 1200 elementos, 24 capas y 80 grupos de 2–80 miembros, identificadores `^[A-Za-z][A-Za-z0-9_-]{2,63}$`, etiquetas de hasta 240 caracteres sin `<` ni `>`, 29 colores permitidos, trazos de hasta 40 puntos (línea y medida exactamente 2), JSON de hasta 2.5 MB.

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
npm run lint:php       # sintaxis de 52 archivos PHP en 8.1 y 8.3
npm run lint:js        # sintaxis de todos los JS/MJS
npm run test:offline   # verifica que no haya ningún recurso ni dato externo
npm run preview        # vista previa real en http://localhost:8080 (PHP en WebAssembly)
```

`npm run preview` levanta la aplicación completa con `@php-wasm/node`: instala la demo en una copia temporal, inicia sesión y sirve el editor para revisarlo en un navegador real sin instalar PHP. Es solo para desarrollo (`tools/` no se incluye en los ZIP). Cuenta de la vista previa: `admin@normia.local` / `ClaveSegura2026`. Para cambiar el puerto, `PORT=9000 npm run preview`.

El servidor HTTP se enlaza **antes** de cargar PHP a propósito: php-wasm abre un proxy WebSocket en un puerto efímero que, si se adelanta, responde 403 y deja la vista previa en blanco. Si el puerto elegido está ocupado, el script lo indica y sugiere `PORT=8080`.

### Funcionamiento sin conexión

La aplicación está pensada para redes aisladas y equipos sin internet:

- **Todo se sirve desde el propio paquete**: hojas de estilo, scripts, iconos SVG, pictogramas ISO 7010, señales de servicios y catálogos CAD viven en `assets/` y `resources/`. No hay CDN, fuentes web ni imágenes remotas.
- **Las fuentes son del sistema** (`-apple-system`, `Segoe UI`, `Roboto`, `Arial`), no se descargan.
- **La política de seguridad del navegador** (`Content-Security-Policy`) limita `script-src`, `style-src`, `img-src`, `font-src` y `connect-src` a `'self'`; cualquier intento de cargar algo externo queda bloqueado por el propio navegador.
- **El servidor no hace llamadas salientes**: no usa `curl`, `fsockopen`, `get_headers` ni `file_get_contents()` sobre URLs.
- **Las exportaciones se generan en local**: el SVG y el JSON los produce PHP; el PNG lo dibuja el navegador sobre el propio SVG. La impresión usa `print.css` local.
- **`npm run test:offline`** recorre los 78 archivos que se sirven al navegador y falla si aparece una petición externa. Forma parte de `node tests/run-all.mjs`.

Lo único que no funciona sin red es la **vista previa de desarrollo** (`npm run preview`), que solo existe para revisar el editor en el equipo de desarrollo; nunca se incluye en los paquetes.

### Qué cubre cada bloque

| Bloque | Comprobaciones |
| --- | --- |
| `tests/php/lint.mjs` | `php -l` sobre todo `app/`, `bootstrap.php` e `index.php` en 8.1 y 8.3. |
| `tests/php/functional.mjs` | 144 comprobaciones: instalador, requisitos, contraseñas débiles, CSRF, sesión, autorización entre cuentas, CRUD de proyectos/pisos, duplicados, importación v1/v2, catálogos (354 señales y 145 objetos), catálogo y guardado de redes, señales de baño y de servicios (guardado, color de familia y exportación SVG), puertas y portones (geometría, sentidos de apertura, exportación con trazo), validaciones de la API, guardado/versiones/borradores/conflictos, exportaciones, ciclo de vida y logout. |
| `tests/js/editor.mjs` | 153 comprobaciones de interfaz sobre la app real: arranque, 354 señales y 145 objetos, **trazado de tuberías y circuitos, inspector de red y panel de redes**, puertas dobles y portones, **vértices de ruta editables (arrastrar, doble clic, Alt+clic)**, **señal de baño insertada desde la biblioteca**, **posiciones reales del trazo**, **clic sobre muros finos**, **rotación**, **rutas cerradas**, **arrastrar y soltar desde la biblioteca sin que el cajón lo bloquee**, reglas, herramientas, inserción con puntero, selección, mover, escalar, rotar, color, cambio de tipo, deshacer/rehacer, duplicar, agrupar, bloquear, desplazar, texto y saneado, guardar, reabrir, borradores, conflictos, exportación SVG/JSON/PNG, tooltips sin acumulación, capas, versiones y límites. |
| `tests/php/package.mjs` | 37 comprobaciones: construye ambos ZIP, verifica que no haya bases, sesiones, credenciales, logs ni carpetas de desarrollo, valida los SHA-256 y hace una instalación limpia de la demo comprobando assets (11), catálogos (354/145), los cuatro pisos del proyecto de ejemplo, señales de servicios y redes en la demo, editor, SVG, JSON e impresión. |
| `tests/js/offline.mjs` | 0 dependencias de red: revisa las vistas, los estilos, los scripts y los catálogos y falla si aparece un `fetch`, un `WebSocket`, un `src`/`href`/`url()` externo, una llamada de red desde PHP o un dominio no declarado. |

Resultados esperados de la última ejecución completa:

```text
✓ Sintaxis PHP 8.1 · 52 archivos, sin errores
✓ Sintaxis PHP 8.3 · 52 archivos, sin errores
✓ Sintaxis JavaScript · 20 archivos, sin errores
✓ Funcionamiento sin conexión · 78 archivos, sin referencias externas
✓ Funcional PHP 8.1 · 144/144
✓ Funcional PHP 8.3 · 144/144
✓ Interfaz (JSDOM) PHP 8.1 · 153/153
✓ Interfaz (JSDOM) PHP 8.3 · 153/153
✓ Paquetes y demo · 37/37
9/9 pasos correctos
```

Las pruebas trabajan sobre copias temporales: no escriben configuración ni bases en el repositorio. `node_modules` solo contiene dependencias de desarrollo y se excluye de los paquetes.

---

## Cambios de la versión 1.0.4

Ampliación de contenido sobre la 1.0.3. Los planos guardados siguen abriendo sin cambios.

- **Tuberías por sistema.** Nueva herramienta `pipe` con seis redes: agua fría, agua caliente, gas combustible, aguas negras, aguas lluvias y red contra incendios. Cada sistema trae color, estilo de línea, diámetro y material de referencia. El inspector permite cambiar sistema, diámetro, material, pendiente y presión.
- **Red eléctrica.** Nueva herramienta `conduit` para tramos de circuito con código, tensión, calibre y número de fases; los equipos de la familia *Instalaciones eléctricas* guardan circuito y carga en VA. El color del tramo sigue al circuito para leerlo agrupado.
- **Panel Redes y circuitos.** Resume longitudes por sistema, diámetros, cargas por circuito, corriente, breaker sugerido con reserva del 125 %, calibre sugerido y caída de tensión estimada, con avisos de pendiente en desagües y de caída superior al 3 %.
- **API de redes.** `GET /index.php?r=api/floors/{id}/mep` devuelve el resumen calculado sobre el diseño guardado; `GET /index.php?r=catalogs/mep` entrega el catálogo técnico local.
- **Catálogo CAD de 121 a 145 objetos** con dos familias nuevas: **Instalaciones eléctricas** (12 símbolos: tomacorrientes, interruptores, tablero, luminarias, salida de datos, aire acondicionado, extractor, caja de piso) y **Redes hidrosanitarias** (12 símbolos: válvulas, medidores, hidroneumático, tanque, rejillas, bajante, gabinete contra incendios, rociador, caja de inspección).
- **Demo con instalaciones.** La planta baja estrena cuatro redes (AF, AN, ALL, RCI) y tres circuitos (C1 monofásico, C2 y C3 trifásico) con sus equipos; el local comercial suma agua fría y caliente, gas, desagüe y dos circuitos.
- **Aviso explícito de alcance.** Los valores de `resources/mep-networks.json` son referencias configurables: la interfaz y la documentación repiten que no sustituyen memoria de cálculo ni revisión profesional.

## Cambios de la versión 1.0.3

Ampliación de contenido y correcciones de la 1.0.2. Los planos guardados siguen abriendo sin cambios.

- **Rutas y trazos editables.** Antes, una ruta de evacuación solo se podía mover o escalar como un bloque. Ahora, al seleccionarla, cada vértice tiene su tirador: arrástralo para mover esa esquina, haz doble clic sobre el trazo para añadir un vértice y `Alt`+clic para quitarlo. Funciona igual en muros, líneas y medidas.
- **Señalización de baño.** La biblioteca no tenía baños porque **ISO 7010 no los normaliza** (la norma cubre seguridad, no orientación). Se añaden 22 señales de servicios propias: baño de hombres, de mujeres, mixto y accesible, cambiador de bebés, lactario, duchas, vestidores, cafetería, comedor, recepción, sala de espera, farmacia, parqueadero, bicicletero, punto de carga, lavandería, depósito, zona de fumadores, vigilancia, ascensor y escaleras. Se identifican como complementarias, no como ISO 7010.
- **Catálogo CAD de 90 a 121 objetos.** Se añaden 31 equipos: archivador, mesa de reuniones, baño accesible completo, cambiador, campana de cocina, generador, bomba, tanque, muelle de carga, banda transportadora, nevera de bebidas, incubadora, sillón odontológico, estación de enfermería, caja de supermercado, cocina integral, cancha de fútbol, cancha de baloncesto, caminadora y una familia nueva de **exteriores y urbanismo** (árboles, luminarias, hidrantes, fuentes, bicicleteros, bolardos, materas, parqueo, contenedores, pérgola).
- **Verificación sin conexión.** La suite gana un paso que revisa los 75 archivos servidos al navegador y falla si alguno pide recursos o datos a otro dominio, abre sockets o usa red desde el servidor. La aplicación funciona íntegramente en local: sin CDN, sin fuentes remotas y sin llamadas salientes.
- **Demo de cuatro pisos actualizada** con señales de baño, de duchas y de cafetería y con el mobiliario exterior de la zona recreativa.

## Cambios de la versión 1.0.2

Ampliación de contenido de la 1.0.1. Los planos y proyectos guardados siguen abriendo sin cambios.

- **Puertas rediseñadas.** La puerta sencilla tiene marco, hoja y un arco de abatimiento continuo (antes punteado y más fino), y se dibuja completa en el editor, el SVG exportado, el PNG y la impresión.
- **Puertas dobles y portones.** Dos tipos nuevos: puerta de dos batientes (120 × 60) y portón o reja de garaje (160 × 50), con barras, raíles y hueco real en el muro. Se insertan desde el menú de la barra lateral (también con `Shift+U` y `R`) o cambiando el tipo en el inspector.
- **Sentido de apertura.** El inspector gana `flipX` y `flipY` para girar la hoja y el arco; se guardan, se exportan y se validan en el servidor.
- **Catálogo CAD de 32 a 90 objetos.** Nueve familias nuevas: restaurante y cafetería, bodega y logística, comercio y centro comercial, salud y hospital, costura y confección, asadero y parrilla, supermercado, vivienda y edificios residenciales, y deportes (canchas, piscinas, gradas).
- **Biblioteca por familias reales.** El cajón de equipamiento muestra el nombre corto de cada familia y el contador real (90 objetos), y la búsqueda filtra por nombre, familia y descripción.
- **Los equipos CAD se exportan con su trazo.** El exportador copia las propiedades de presentación heredadas del `<svg>` del catálogo (`fill`, `stroke`, `stroke-width`, `stroke-linecap`), así que los pictogramas de equipos ya no salen como cajas grises en SVG, PNG ni impresión.
- **Demo de cuatro pisos.** Se añaden “Local comercial y cafetería” (comercio, restaurante y un portón) y “Zona recreativa” (piscina, canchas y portón de mantenimiento); la planta baja estrena puertas dobles, portones con vano real y puertas giradas sobre muros verticales.

### 1.0.1

Versión de corrección sobre la 1.0.0. Reemplaza los paquetes anteriores: la 1.0.0 tenía fallos reales en el editor que no se veían en las pruebas.

- **Abrir un plano ya no falla.** El renombrado de identificadores SVG usaba el selector `[xlink:href]`, que los navegadores reales rechazan; jsdom lo aceptaba y ocultaba el error. Ahora se recorren los nodos y se leen las referencias con `getAttribute`/`getAttributeNS` sobre el espacio de nombres XLink, sin selectores inválidos.
- **Muros, rutas, líneas y cotas se dibujan donde se trazan.** El renderizador usaba coordenadas locales del elemento sin sumar su posición; ahora el trazo usa puntos absolutos y una zona de pulsación transparente más ancha.
- **Un muro fino ya no desaparece ni se deforma al segundo clic.** Los tiradores de selección se dibujan con un mínimo de 22 px de alto y no empiezan a transformar hasta que el puntero se desplaza 3 px, así que un clic simple nunca inicia un escalado o una rotación.
- **Rotar mantiene el trazo junto a su caja.** La rotación se aplica sobre el centro real del elemento y las pruebas comprueban el punto pintado, no solo el modelo.
- **La señalización se puede aplicar al plano.** La ficha de la biblioteca cierra el cajón al insertar, muestra una pista clara y las tarjetas se pueden arrastrar al lienzo (o pulsar `Enter` para colocarlas). El recurso sigue al cursor hasta que haces clic.
- **Rutas de evacuación cerradas.** Un clic sobre el primer punto cierra el circuito con ≥3 puntos; `Retroceso` quita el último punto, `Enter` o doble clic terminan y `Esc` cancela. La pista del lienzo indica el número de puntos y cómo cerrar.
- **Líneas coherentes al exportar.** El exportador SVG usa los puntos reales del trazo en lugar de la diagonal de la caja del elemento.

---

## Paquetes y verificación

La entrega v1.0.4 incluye los ZIP ya construidos en **`paquetes/v1.0.4/`** (misma composición que genera el script, verificada por `tests/php/package.mjs`):

```text
paquetes/v1.0.4/
├── normia-planos-cad-1.0.4.zip
├── normia-planos-cad-demo-1.0.4.zip
├── SHA256SUMS.txt
└── BUILD.txt
```

Para regenerarlos desde el código (por ejemplo tras cambiar plantillas o catálogos):

```bash
npm run build          # o: bash tools/build-packages.sh
```

El script deja los artefactos en `dist/`:

```text
normia-planos-cad-1.0.4.zip
normia-planos-cad-demo-1.0.4.zip
SHA256SUMS.txt
BUILD.txt
```

- **Excluidos siempre**: `config/config.php`, `*.sqlite`, sesiones, logs, caché, `tests/`, `tools/`, `package.json`, `node_modules`, `.git`, `dist`, `paquetes` y el marcador de demo (salvo en el paquete de demostración).
- **Incluidos**: aplicación, assets, catálogos, licencias, documentación, `LEEME-PRIMERO.txt`, `config/config.example.php` y carpetas `storage` vacías con `.gitkeep`.
- Verifica las sumas:

```bash
cd paquetes/v1.0.4
sha256sum -c SHA256SUMS.txt
```

Los hashes exactos de los ZIP publicados están en `paquetes/v1.0.4/SHA256SUMS.txt`; `dist/` es solo la salida de trabajo y está ignorada por Git.

---

## Limitaciones

- Planos **esquemáticos**: no hay cálculo de áreas, estructuras ni normativa automática. La escala es una referencia declarada, no una medición certificada.
- **Las redes son un apoyo de diseño, no un cálculo firmado.** El panel estima longitudes, cargas, breaker, calibre y caída de tensión con tablas de referencia locales; no reemplaza la memoria de cálculo, el estudio de cargas, el diseño hidrosanitario ni la revisión de un profesional competente, y no verifica cumplimiento de NTC 1500, NTC 2505, NTC 2050, NFPA ni de la norma local aplicable.
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
