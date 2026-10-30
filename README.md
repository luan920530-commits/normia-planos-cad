# Normia Planos CAD

Editor de planos de emergencia y evacuación, en español, pensado para pequeñas y medianas organizaciones que necesitan documentar plantas, rutas, señalización y equipamiento sin depender de software CAD de escritorio ni de servicios externos.

- **Editor completo**: instalador web, cuentas, proyectos y pisos, editor SVG real, biblioteca de **389 pictogramas** (332 ISO 7010 + 23 de orientación y servicios como baños, vestidores, cafetería y **«Usted está aquí»** + **34 de señalización de tránsito**), **301 objetos CAD esquemáticos de 23 familias** (estación de servicio, droguería, gimnasio, colegio, cafetería, supermercado, restaurante, bodega, comercio, hospital, costura, asadero, vivienda, deportes, exteriores, instalaciones eléctricas y redes hidrosanitarias, entre otras), puertas de uno y dos batientes y portones, **rutas con vértices editables**, **redes de tubería (agua, gas, desagües e incendio) y circuitos eléctricos**, cambio de señal y de equipo desde el inspector, guardado con versiones, borradores automáticos, deshacer/rehacer y exportación SVG/JSON/PNG/impresión.
- **Auditor de planos y evacuación**: el cajón **Revisión** mide el recorrido más largo hasta las salidas marcadas, cuenta salidas y anchos útiles, estima la ocupación (declarada o por densidad), calcula el ancho requerido y el tiempo de evacuación, y lista los hallazgos por severidad con un botón para verlos en el plano. Los umbrales viven en `resources/audit-criteria.json`, el cálculo también corre en el servidor y el informe se imprime o se guarda como PDF.
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
7. [Revisión del plano y evacuación](#revisión-del-plano-y-evacuación)
8. [Guardado, versiones y borradores](#guardado-versiones-y-borradores)
9. [Exportaciones](#exportaciones)
10. [Formato de datos](#formato-de-datos)
11. [Arquitectura](#arquitectura)
12. [Seguridad](#seguridad)
13. [Pruebas](#pruebas)
14. [Cambios de la versión 1.2.0](#cambios-de-la-versión-120)
15. [Paquetes y verificación](#paquetes-y-verificación)
16. [Limitaciones](#limitaciones)
17. [Créditos, licencias y atribución](#créditos-licencias-y-atribución)

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
| Bibliotecas | 389 señales (332 ISO 7010 + 23 de orientación y servicios + 34 de tránsito) en 8 familias y 301 objetos CAD en 23 familias, con búsqueda y filtros por familia. |
| Propiedades | Posición, tamaño, rotación, sentido de apertura, color (paleta de 29), grosor, opacidad, texto, capa, bloqueo, cambio de tipo y, en redes, **sistema, diámetro, material, pendiente, presión, circuito, tensión, calibre, fases y carga**. |
| Historial | Deshacer/rehacer con 120 pasos, duplicar, pegar, agrupar, alinear, distribuir y orden de dibujo. |
| Redes | Panel **Redes y circuitos** con longitudes por sistema, diámetros usados, pendientes, cargas por circuito, breaker y calibre sugeridos y caída de tensión estimada. |
| Revisión | Cajón **Revisión** con recorrido más largo hasta las salidas, salidas y anchos, ocupación declarada o estimada, ancho requerido, tiempo de evacuación y hallazgos por severidad enlazados al plano. |
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

- **Seleccionar (V)** y **Mano (H)** para desplazar el lienzo sin tocar los elementos.
- **Muro (M)**, **Puerta (U)**, **Ruta de evacuación (E)**, **Tubería (P)** —con desplegable de red—, **Eléctrico (Shift + P)**, **Texto (T)**, **Medida (D)**, **Línea (L)**, **Rectángulo (B)** y **Elipse (O)**, agrupados en el menú de formas.
- **Todas las herramientas** (arriba del lienzo): paleta agrupada con icono, nombre y atajo de cada herramienta, incluida la Mano.
- **Señalización ISO 7010** y **Equipamiento CAD**: abren el cajón de biblioteca con búsqueda, familias y vista previa.
- **Redes y circuitos**, **Capas**, **Versiones**, **Ajustes**, **Atajos** e **Imprimir** en la parte inferior.

### Gestos y puntero

- Arrastrar con una herramienta de dibujo crea el elemento; `Shift` restringe a horizontal/vertical o mantiene proporciones.
- Con **Seleccionar**, un clic selecciona el objeto que está bajo el puntero, también el interior de un pictograma o de un equipo CAD aunque su dibujo sea de trazo fino: no hace falta la caja de selección. `Shift` añade a la selección; arrastrar el fondo dibuja una marquesina. El cursor cambia a la cruz de movimiento cuando hay algo seleccionable en ese punto.
- **Elementos superpuestos**: `Ctrl/⌘ + clic` selecciona el siguiente elemento hacia abajo y `Ctrl/⌘ + Shift + clic` vuelve a subir. La barra de estado indica cuántos hay en ese punto y el inspector lista la pila para cambiarla con un clic.
- **Mano (H)**: arrastra para desplazar el lienzo; la rueda sigue haciendo zoom y el botón central o `Espacio` + arrastre funcionan en cualquier herramienta.
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
| Mano (paneo) | `H` · también `Espacio` + arrastrar o botón central |
| Redes | `P` (tubería) · `Shift + P` (tubería eléctrica) |
| Seleccionar lo de abajo | `Ctrl/⌘ + clic` (baja) · `Ctrl/⌘ + Shift + clic` (sube) |
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

El inspector se organiza en una ficha superior con la miniatura, el tipo y las acciones rápidas (bloquear, duplicar, eliminar) y en **secciones plegables**: geometría, apariencia, instalación, elementos superpuestos, organización y orden. En **Apariencia**, cualquier señal seleccionada muestra su pictograma y un botón **Cambiar señal**, y cualquier equipo CAD muestra su miniatura, su familia y un botón **Cambiar equipo**. Ambos abren la biblioteca en modo sustitución: eliges otro recurso y se cambia sin mover el elemento ni perder tamaño, rotación, capa u opacidad. Con varias señales o varios equipos seleccionados el cambio se aplica a todos. Los campos numéricos muestran la unidad del lienzo y la rotación se ajusta con pasos de 90°. En tuberías añade **red, diámetro, material, pendiente y presión**; en circuitos, **código, tensión, calibre y fases**; en equipos eléctricos, **circuito y carga en VA**. Los controles que no aplican al elemento seleccionado no se muestran o quedan deshabilitados.

### Capas y grupos

- Hasta 24 capas por piso; se pueden renombrar, ocultar, bloquear, reordenar, crear y eliminar (no la última).
- Los elementos de una capa bloqueada u oculta no se pueden editar ni seleccionar.
- Agrupar (2–80 miembros) mueve y selecciona el grupo como una unidad; desagrupar lo disuelve.

---

## Bibliotecas de señalización y CAD

### Señalización: 332 ISO 7010 + 57 propias (orientación, servicios y tránsito)

**ISO 7010 (332 pictogramas)**

- Familias: emergencia/evacuación (`#237f52`), fuego (`#b71f2e`), obligación (`#005387`), prohibición (`#b71f2e`) y advertencia (`#f9a800`).
- Identificador interno: `iso_<código en minúsculas>` (por ejemplo `iso_e002`).
- Origen y licencia: `resources/licenses/iso-safety-signs.LICENSE.txt` y `iso-safety-signs.NOTICE.txt`.

**Orientación y servicios (23 pictogramas propios)**

- Familia `services` (`#0f766e`), identificador `sig_<nombre>` (por ejemplo `sig_wc_men` → `SVC_WC_MEN`).
- Cubre lo que ISO 7010 no normaliza y faltaba en la biblioteca: **baño de hombres**, **baño de mujeres**, **baño mixto**, **baño accesible (PMR)**, **cambiador de bebés**, **lactario**, **duchas**, **vestidores**, **cafetería**, **comedor**, **recepción**, **sala de espera**, **farmacia**, **parqueadero**, **bicicletero**, **punto de carga**, **lavandería**, **depósito**, **zona de fumadores**, **vigilancia**, **ascensor** y **escaleras**.
- **Ubicación (`location`, `#1d4ed8`)**: el marcador **«Usted está aquí»** (`SVC_AQUI` → `sig_aqui`), que sitúa la posición de quien lee el plano. Es la señal que acompaña al pie de evolución y se puede colocar en cualquier punto, con el tamaño que se quiera.
- Son pictogramas originales de este proyecto (GPL-3.0), no señales ISO 7010: se documenta así en la ficha de cada recurso para no atribuirles una norma que no les corresponde.
- Búsqueda por código, nombre, descripción, familia y alias en español (`baño`, `bano`, `sanitario`, `wc`, `vestuario`, `cafeteria`, `parqueadero`, `discapacidad`, `pmr`…).
- El color de las señales (ISO o propias) se deriva de su familia y no se edita con la paleta.

**Señalización de tránsito (34 pictogramas propios, familia `traffic`, `#b45309`)**

- **Reglamentación**: pare, ceda el paso, velocidad máxima 30 y 50, prohibido el paso, prohibido parquear, prohibido girar a izquierda y derecha, prohibido devolverse, prohibido adelantar, prohibido el paso de peatones, prohibido el paso de camiones y prohibido pitar.
- **Obligación**: sentido único, giro obligatorio a izquierda y derecha, siga de frente, glorieta, parqueadero y parqueadero accesible.
- **Prevención**: cruce de peatones, zona escolar, paso de ciclistas, resalto o reductor, semáforo, obras en la vía, piso resbaloso.
- **Demarcación e información**: cebra peatonal, flecha de carril, resalto demarcado, andén o acera, zona de carga y descarga, parada de transporte y vía sin salida.
- Son **pictogramas esquemáticos propios** (GPL-3.0) para accesos, parqueaderos y vías internas: no reproducen láminas oficiales de ningún manual de señalización ni certifican cumplimiento. Cada ficha lo dice y la descripción lo repite.

**Rutas y trazos editables**

- Cualquier ruta, muro, línea o medida seleccionada muestra un **tirador por vértice**: arrástralo para mover esa esquina (con `Shift` se alinea con el vértice anterior).
- **Doble clic** sobre el trazo añade un vértice en el segmento más cercano y **`Alt`+clic** sobre un vértice lo elimina.
- Al mover un vértice la caja del elemento se recalcula sola, la rotación se disuelve en los puntos y cada paso entra en el historial (deshacer/rehacer).
- Las rutas de evacuación conservan el cierre en circuito: el primer y el último punto siguen unidos.

### Equipamiento CAD (301 objetos en 23 familias)

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
| Supermercado | 27 | góndola, pasillo de góndolas, isla de frutas, cárcel de carnes, panadería, pescadería, nevera de bebidas, báscula de plataforma, corral de carros, seguridad, muelle de carga |
| Vivienda y edificios residenciales | 9 | sofá, cama doble, cocina integral, lavadora, baño completo |
| Deportes, canchas y piscinas | 11 | cancha de fútbol, de baloncesto, de tenis, piscina, trampolín, caminadora |
| Exteriores y urbanismo | 15 | árbol, arbusto, luminaria, hidrante, fuente, bicicletero, bolardo, matera, plaza de parqueo, contenedor, pérgola |
| Instalaciones eléctricas | 12 | tomacorriente, tomacorriente 220 V, interruptor, interruptor doble, tablero, luminaria, salida de techo, luminaria de emergencia, salida de datos, aire acondicionado, extractor, caja de piso |
| Redes hidrosanitarias | 12 | válvula de bola, válvula de compuerta, válvula de retención, medidor de agua, medidor de gas, equipo hidroneumático, tanque, rejilla de piso, bajante de cubierta, gabinete contra incendios, rociador, caja de inspección |
| **Estación de servicio (EDS)** | 24 | surtidor de gasolina, diésel y GLP, isla de surtidores, tanque enterrado, boca de llenado, venteo, punto de aire y agua, compresor, lavadero, aspiradora, oficina, tienda de conveniencia, baños, caja, bahías de servicio liviano y motos, carril de camiones, kit antiderrames, extintor, separador de grasas, residuos peligrosos, cubierta y caseta de vigilancia |
| **Droguería y farmacia** | 44 | mostrador de atención y de entregas, estantería de medicamentos y de rodillos, vitrina, nevera de cadena de frío, caja, sillas y banca de espera, inyectología, lavamanos, punto azul de posconsumo, guardián de punzocortantes, consultorio y box de asesoría, báscula, tensiómetro, glucómetro, nebulizador, área de empaque y línea de empaque, caja de autoservicio, lactario, ortopedia, acceso de emergencia |
| **Gimnasio y fitness** | 23 | caminadora, elíptica, bicicleta estática, remo, multifunción, banco de pesas, rack de sentadillas y de mancuernas, zona de peso libre, colchoneta, sala de clases dirigidas, spinning, boxeo, vestidores, duchas, sauna, recepción, zona infantil, fisioterapia, fuente de agua y suplementos |
| **Colegio y universidad** | 23 | pupitre y pupitres dobles, tablero y tablero digital, escritorio del docente, laboratorio, sala de cómputo, biblioteca y sala de lectura, comedor, cocina, coliseo, cancha exterior, patio de recreo, casilleros, enfermería, orientación escolar, administración, auditorio, aulas de arte, música y taller, paradero escolar |
| **Cafetería y panadería** | 22 | barra de café, máquina de espresso, molino, vitrina de repostería, horno, amasadora, mesas para dos y cuatro, banca, silla, barra de recogida, nevera exhibidora, poceta, máquina de hielo, estación de insumos, residuos, espera, punto de trabajo, baño, domicilios, terraza, puerta de servicio |

- Identificador `cad_*` (por ejemplo `cad_desk`, `cad_rest_bar`, `cad_sport_pool`, `cad_eds_dispenser`, `cad_drg_cold_chain`, `cad_gym_treadmill`, `cad_sch_desk`, `cad_caf_bar`).
- Los 301 objetos se generan y verifican con `tools/build-sector-catalogs.mjs` (mantenimiento; `tools/` no se distribuye).
- Los objetos de agua (piscina, trampolín) usan un color propio del catálogo (`#0891b2`); el resto hereda el color del elemento.
- Son **esquemáticos**: no representan medidas certificadas; la descripción y la referencia están en `resources/cad-objects.json`. Verifica siempre las dimensiones en el sitio.
- **Cambiar un equipo:** selecciónalo y pulsa **Cambiar equipo** en *Apariencia*. La biblioteca abre en modo sustitución con el equipo actual resaltado; al elegir otro se conservan posición, tamaño, rotación, capa, opacidad y bloqueo, y el nuevo objeto toma el color de su familia. También se puede hacer con varios equipos a la vez y se deshace con `Ctrl/⌘ + Z`.

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
| `resources/cad-objects.json` | `{version, categories{furniture,...}, objects{cad_*:{category,name,description,reference,color,load?,svg}}}` — 301 objetos en 23 familias |
| `resources/service-signs.json` | `{format, standard, license, categories{services,location}, signs{SVC_*:{name,category,description,aliases,svg}}}` — 23 señales propias |
| `resources/mep-networks.json` | `{hydraulic{clave:{label,short,color,dash,stroke,diameter,material,gravity,pressureKpa,reference}},diameters[],materials{},slopes{},electrical{...}}` — valores de referencia de redes y circuitos |
| `resources/audit-criteria.json` | `{version, notice, grid, egress, occupancy, signs}` — umbrales del auditor y de la medición de evacuación |
| `resources/sign-aliases.json` | Alias heredados → códigos ISO 7010 |
| `resources/schema.sql` | Esquema SQLite |
| `resources/demo/demo-project.json` | Proyecto de demostración (4 pisos) |

---

## Revisión del plano y evacuación

La barra lateral inferior tiene un botón **Revisión** que abre el auditor. Analiza el **último diseño guardado** (no los cambios sin guardar) y devuelve dos cosas: una medición de evacuación y una lista de hallazgos con severidad.

**Cómo marcar las salidas.** Selecciona una puerta y activa **Salida de emergencia** en *Apariencia*. Solo las puertas pueden ser salidas; el editor guarda la marca (`isExit`) y el servidor la valida. Marca todas las salidas reales: el auditor mide hasta la más cercana y cuenta el ancho útil de todas.

**Qué mide**

| Métrica | Cómo se calcula |
| --- | --- |
| Recorrido más largo | Rejilla de celdas sobre el espacio libre (muros y vanos respetados) y camino más corto desde cada celda hasta una salida. Se informa el punto más alejado y el límite de referencia. |
| Superficie libre y zonas sin salida | Área interior transitable, superficie alcanzable y recintos que quedan sin camino a una salida. El terreno de fuera del edificio no cuenta. |
| Salidas y anchos | Número de salidas, ancho de vano de cada una y ancho útil (vano × factor de holgura de hojas y marcos). |
| Ocupación | La declarada en **Ajustes → Ocupación declarada (personas)**; si está en 0, se estima con la densidad de referencia por superficie libre y el informe lo advierte. |
| Ancho requerido | Ocupación × ancho de paso por persona, comparado con el ancho útil disponible. |
| Tiempo estimado | Marcha (recorrido ÷ velocidad) + cola en las salidas (personas ÷ flujo por metro de ancho). |
| Señalización | Salida con pictograma de salida cerca del vano, presencia de «Usted está aquí» y de medios de extinción. |

**Hallazgos.** Cada aviso trae severidad (*crítico*, *importante*, *menor*, *informativo*), título, explicación, valor medido y, cuando aplica, los elementos del plano. El botón **Ver en el plano** selecciona el elemento y ajusta el zoom. El contador del botón de la barra lateral muestra los críticos e importantes pendientes. Códigos: `no_exit`, `too_few_exits`, `narrow_exit`, `travel_too_long`, `unreachable_area`, `no_route`, `route_no_exit`, `route_through_wall`, `occupancy_missing`, `width_short`, `exit_without_sign`, `no_you_are_here` y `no_fire_sign`.

**Criterios configurables.** Los umbrales están en `resources/audit-criteria.json`: recorrido máximo, mínimo de salidas, ancho mínimo de vano, factor de holgura, ancho por persona, velocidad de marcha, flujo, densidad de ocupación, tolerancia de llegada de las rutas, superficie mínima de recinto y radio de la señalización. Edita el archivo para ajustarlo a la norma aplicable; el informe imprimible enumera los valores usados.

**API e informe.** `GET /index.php?r=api/floors/{id}/audit` (admite `?occupancy=N` para simular una ocupación) devuelve `{ok, floor, report, notice}` con `findings`, `counts`, `exits`, `travel`, `occupancy`, `egress`, `routes`, `signs` y `criteria`. El informe imprimible está en `…/projects/{id}/floors/{floorId}/audit` y lleva las métricas, los hallazgos, las rutas, los criterios aplicados y el aviso de alcance.

> **La revisión es de referencia.** Los umbrales son configurables y el cálculo es esquemático: **no es un dictamen**, no certifica cumplimiento normativo y no sustituye la verificación en sitio ni la revisión de un profesional competente. Los anchos, las rutas y la ocupación real deben confirmarse en el sitio.

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
| `GET api/floors/{id}/audit` | Informe del auditor sobre el diseño guardado; `?occupancy=N` simula la ocupación. |

---

## Exportaciones

| Formato | Cómo | Contenido |
| --- | --- | --- |
| **SVG** | Botón Exportar o ruta `…/export/svg` | Dibujo vectorial de la versión guardada, con estilos incrustados, sin scripts. |
| **JSON** | `…/export/json` | `schema_version: 2`, proyecto, piso, diseño completo, atribución y fecha. |
| **PNG** | Exportar → PNG | Se rasteriza en el navegador el diseño actual; no sube nada al servidor. |
| **Impresión/PDF** | `…/print` o Exportar → Imprimir | Hoja con el plano, la leyenda de redes y el pie de orientación. Usa “Guardar como PDF” del navegador. |

Nombre de archivo: `normia-<proyecto>-<piso>-v<versión>.<svg|json|png>`. Las exportaciones usan la **última versión guardada**; si hay cambios sin guardar, el editor lo advierte antes de exportar.

Los SVG se generan con identificadores únicos por plano, sin `<script>`, sin `<foreignObject>`, sin eventos `on*` y sin referencias externas; los catálogos se insertan como símbolos saneados.

### Pie de plano

Los tres formatos que muestran el plano (SVG, PNG e impresión) llevan el mismo **pie de página** debajo del dibujo, generado a partir de los datos guardados del proyecto y del piso:

- **Franja de orientación** con cinco celdas, cada una con su pictograma: *su posición actual*, *rutas de evacuación*, *salidas de emergencia*, *equipos de protección contra incendios* y *punto de reunión*. Las celdas de salidas y extinción reutilizan los pictogramas ISO 7010 locales del catálogo (E002 y F001).
- **Bloque de datos**: proyecto, piso y nivel; sitio, área y responsable; escala, unidad, versión, fecha de guardado y número de elementos; y una nota de atribución con la aplicación que generó el plano (`© año Normia Planos CAD · GPL-3.0 · versión`), los créditos de los pictogramas y el aviso de que el plano es esquemático.
- La franja se reparte en **5, 3 o 1 columna** según el ancho del lienzo, y el texto se parte por palabras para no salirse de cada celda.
- Se puede revisar antes de exportar desde **Exportar → Pie de plano** (o el botón *Pie de plano* de la barra lateral), que muestra la vista previa real del pie con los datos actuales.

El mismo contenido se calcula una sola vez en `app/Services/PlanFooter.php`; el editor lo recibe en su arranque (`boot.footer`) para dibujar idéntico pie en la exportación PNG, que ocurre en el navegador.

---

## Formato de datos

El detalle completo está en [`docs/FORMATO-PLANO.md`](docs/FORMATO-PLANO.md). Resumen del esquema **v2**:

```json
{
  "format": 2,
  "canvas": { "width": 1123, "height": 794, "grid": 20, "unit": "cm", "scale": "1:100", "background": "#ffffff", "occupancy": 40 },
  "layers": [{ "id": "capa_planta", "name": "Planta", "visible": true, "locked": false }],
  "elements": [
    {
      "id": "el_planta_001", "type": "wall", "layerId": "capa_planta",
      "x": 60, "y": 60, "w": 400, "h": 12, "rotation": 0,
      "color": "#334155", "stroke": 12, "opacity": 1, "label": "", "locked": false,
      "points": [{ "x": 0, "y": 6 }, { "x": 400, "y": 6 }]
    },
    {
      "id": "el_salida_001", "type": "door", "layerId": "capa_planta",
      "x": 300, "y": 500, "w": 90, "h": 90, "rotation": 0,
      "color": "#475569", "stroke": 2, "opacity": 1, "label": "", "locked": false,
      "flipX": false, "flipY": false, "isExit": true
    }
  ],
  "groups": [{ "id": "grupo_puesto", "name": "Puesto de trabajo", "members": ["el_...", "el_..."] }]
}
```

`canvas.occupancy` es la ocupación declarada en personas (0–10 000; 0 = sin declarar). `isExit` solo se conserva en puertas y marca la salida de emergencia que usa el auditor. Límites del validador: lienzo 400–4000 × 300–3000, rejilla 5–100, hasta 1200 elementos, 24 capas y 80 grupos de 2–80 miembros, identificadores `^[A-Za-z][A-Za-z0-9_-]{2,63}$`, etiquetas de hasta 240 caracteres sin `<` ni `>`, 29 colores permitidos, trazos de hasta 40 puntos (línea y medida exactamente 2), JSON de hasta 2.5 MB.

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
- **`npm run test:offline`** recorre los 85 archivos que se sirven al navegador y falla si aparece una petición externa. Forma parte de `node tests/run-all.mjs`.

Lo único que no funciona sin red es la **vista previa de desarrollo** (`npm run preview`), que solo existe para revisar el editor en el equipo de desarrollo; nunca se incluye en los paquetes.

### Qué cubre cada bloque

| Bloque | Comprobaciones |
| --- | --- |
| `tests/php/lint.mjs` | `php -l` sobre todo `app/`, `bootstrap.php` e `index.php` en 8.1 y 8.3. |
| `tests/php/functional.mjs` | 174 comprobaciones: instalador, requisitos, contraseñas débiles, CSRF, sesión, autorización entre cuentas, CRUD de proyectos/pisos, duplicados, importación v1/v2, catálogos (389 señales y 301 objetos), catálogo y guardado de redes, señales de baño y de servicios (guardado, color de familia y exportación SVG), **auditor y medición de evacuación** (salidas, recorrido máximo, zonas inalcanzables, rutas que cruzan muros o no llegan a la salida, ocupación declarada y estimada, señalización, validación de `isExit`, informe imprimible y demo coherente), puertas y portones (geometría, sentidos de apertura, exportación con trazo), validaciones de la API, guardado/versiones/borradores/conflictos, exportaciones, ciclo de vida y logout. |
| `tests/js/editor.mjs` | 246 comprobaciones de interfaz sobre la app real: arranque, 389 señales y 301 objetos, **trazado de tuberías y circuitos, inspector de red y panel de redes**, **mano y paneo, selección de superpuestos, inspector plegable y paleta de herramientas**, puertas dobles y portones, **vértices de ruta editables (arrastrar, doble clic, Alt+clic)**, **señal de baño insertada desde la biblioteca**, **posiciones reales del trazo**, **clic sobre muros finos, pictogramas y equipos**, **cambio de señal y de equipo desde el inspector**, **auditor de planos** (interruptor de salida, ocupación declarada, cajón de revisión, contador, filtros, «Ver en el plano», cierre sin dejar el fondo bloqueado), **rotación**, **rutas cerradas**, **arrastrar y soltar desde la biblioteca sin que el cajón lo bloquee**, reglas, herramientas, inserción con puntero, selección, mover, escalar, rotar, color, cambio de tipo, deshacer/rehacer, duplicar, agrupar, bloquear, desplazar, texto y saneado, guardar, reabrir, borradores, conflictos, exportación SVG/JSON/PNG, tooltips sin acumulación, capas, versiones y límites. |
| `tests/js/pages.mjs` | 29 comprobaciones de las páginas fuera del editor: menú de acciones de proyectos y pisos (capa fija, colocación, teclado, un solo menú), confirmación de borrado y borrado real de piso y proyecto, con la protección del último piso. |
| `tests/php/package.mjs` | 39 comprobaciones: construye ambos ZIP, verifica que no haya bases, sesiones, credenciales, logs ni carpetas de desarrollo, valida los SHA-256 y hace una instalación limpia de la demo comprobando assets, catálogos (389/301), los cuatro pisos del proyecto de ejemplo, señales de servicios y redes en la demo, la señal «Usted está aquí», **el auditor y su informe en la demo empaquetada**, editor, SVG, JSON e impresión. |
| `tests/js/offline.mjs` | 0 dependencias de red: revisa las vistas, los estilos, los scripts y los catálogos y falla si aparece un `fetch`, un `WebSocket`, un `src`/`href`/`url()` externo, una llamada de red desde PHP o un dominio no declarado. |

Resultados esperados de la última ejecución completa:

```text
✓ Sintaxis PHP 8.1 · 56 archivos, sin errores
✓ Sintaxis PHP 8.3 · 56 archivos, sin errores
✓ Sintaxis JavaScript · 21 archivos, sin errores
✓ Funcionamiento sin conexión · 85 archivos, sin referencias externas
✓ Funcional PHP 8.1 · 174/174
✓ Funcional PHP 8.3 · 174/174
✓ Interfaz (JSDOM) PHP 8.1 · 246/246
✓ Interfaz (JSDOM) PHP 8.3 · 246/246
✓ Páginas y menús PHP 8.1 · 29/29
✓ Páginas y menús PHP 8.3 · 29/29
✓ Paquetes y demo · 39/39
11/11 pasos correctos
```

Las pruebas trabajan sobre copias temporales: no escriben configuración ni bases en el repositorio. `node_modules` solo contiene dependencias de desarrollo y se excluye de los paquetes.

---

## Cambios de la versión 1.2.0

La entrega de **bibliotecas sectoriales**. Los catálogos crecen de 355 a **389 señales** y de 145 a **301 objetos CAD**; los planos guardados siguen abriendo igual porque solo se añaden recursos nuevos.

- **Cinco sectores completos, con 20 a 44 objetos cada uno.** Estación de servicio (24), droguería y farmacia (44), gimnasio y fitness (23), colegio y universidad (23) y cafetería y panadería (22). Cada familia se dibuja en planta, con la misma retícula, trazo y relleno duotono del catálogo, y aparece como chip propio en la biblioteca de equipos.
- **Supermercado, de 7 a 27 objetos.** Pasillo de góndolas, isla de frutas y verduras, cárcel de carnes, panadería, pescadería, nevera de bebidas, báscula de plataforma, corral de carros, zona de empaque, servicio al cliente, farmacia, textil, control de seguridad, baños, muelle de carga, compactador, estiba, escaleras mecánicas y ascensor de carga.
- **Señalización de tránsito propia: 34 señales nuevas** en la familia `traffic` (`#b45309`). Reglamentación (pare, ceda el paso, velocidades máximas, prohibiciones de giro, de parqueo, de adelantamiento, de paso de camiones y de pitar), obligación (sentido único, giros obligatorios, siga de frente, glorieta, parqueadero y parqueadero accesible), prevención (peatones, zona escolar, ciclistas, resalto, semáforo, obras, piso resbaloso) y demarcación (cebra, flecha de carril, resalto demarcado, andén, carga y descarga, parada de transporte y vía sin salida).
- **Todo se comporta igual que lo anterior.** Las señales nuevas usan el mismo flujo de inserción, cambio desde el inspector, color por familia, leyenda MEP y exportación SVG; los objetos nuevos se pueden arrastrar al plano, rotar, escalar, cambiar desde *Apariencia* y entran en el historial.
- **Honestidad de alcance.** Las señales de tránsito son pictogramas esquemáticos propios: no reproducen láminas oficiales de ningún manual y cada ficha lo indica. Los 301 objetos siguen siendo representaciones esquemáticas: verifica dimensiones y escala en sitio.
- **Generador reproducible.** `tools/build-sector-catalogs.mjs` y `tools/sector-data/` dibujan y validan los catálogos nuevos; las pruebas comprueban que todo SVG carece de texto incrustado, referencias externas y colores fijos.

## Cambios de la versión 1.1.3

Entrega de aspecto. El editor pasa a leerse como una **aplicación de escritorio**: un chrome oscuro continuo arriba, el lienzo como una hoja sobre el escritorio y el inspector como un panel flotante. No cambia ningún dato guardado ni el funcionamiento.

- **Barra superior oscura de ventana.** La cabecera del editor deja el blanco y se alinea con el rail: degradado azul noche, filo superior de luz, cristal (`backdrop-filter`) y texto claro. El título del plano, el selector **Cambiar piso**, el estado de guardado, deshacer/rehacer, *Exportar* y *Guardar* se reestilizan para ese fondo, con el botón primario en azul con brillo y el secundario en cristal. El menú de pisos que se abre desde ahí usa el mismo cristal oscuro.
- **El lienzo es una hoja sobre el escritorio.** El área de trabajo tiene un fondo con degradado suave y el lienzo se separa como una hoja: borde redondeado de 16 px, filete de 1 px y sombra larga y difusa. Las reglas y la barra de estado acompañan ese marco.
- **Barra de herramientas flotante.** Las herramientas del lienzo (paleta, zoom, cuadrícula, ajuste y reglas) dejan de ser una franja pegada al borde y pasan a una **píldora de cristal** con margen, borde luminoso y sombra corta, como la barra de una app nativa. Los interruptores activos se tiñen de azul translúcido.
- **Inspector flotante.** El panel de propiedades gana margen, esquinas de 16 px, cristal claro y sombra propia; su cabecera se vuelve translúcida. En pantallas estrechas sigue entrando como panel deslizante desde la derecha.
- **Cajones como hojas de app.** Los cajones (bibliotecas, redes, capas, versiones, pie, ajustes, atajos, revisión y exportación) se separan 10 px de los bordes, con esquinas de 18 px, cristal y sombra profunda, en lugar de ocupar todo el alto de la ventana. El fondo oscurecido gana un desenfoque leve.
- **Avisos integrados.** Las franjas de aviso (borrador, conflicto, guardado) se apoyan sobre una continuación del chrome oscuro para que la transición entre cabecera y lienzo no se corte.
- **Sin cambios de contrato.** Los tests de estructura del editor (fila acotada, rail con scroll propio, menús anclados a la ventana, panel y cuerpo desplazables) siguen verificándose igual, y en móvil se mantiene el rail inferior y el panel deslizante.

## Cambios de la versión 1.1.2

Entrega visual. Solo cambian los iconos y su presentación: los planos, proyectos, versiones y datos guardados siguen abriendo sin cambios.

- **Set de iconos «Normia 2.0».** Los 88 símbolos del sprite local se redibujaron sobre la misma retícula de 24 × 24, con trazo de 1,7 px, remates y uniones redondeados y un relleno duotono suave (12 % de opacidad) que da volumen sin ensuciar a tamaño pequeño. Las formas se simplificaron para que se lean a 17–20 px: menos líneas, más aire y siluetas reconocibles de un vistazo.
- **Acabado tipo iOS en la barra de herramientas.** Cada botón del rail es ahora un chip *squircle* con cristal (`backdrop-filter` con desenfoque y saturación), brillo interior en el borde superior y sombra corta. El botón activo se tiñe con el degradado azul de la marca, borde luminoso y halo; el indicador lateral se mantiene. Las transiciones usan un muelle suave (`cubic-bezier(.34, 1.56, .64, 1)`) y respetan `prefers-reduced-motion`.
- **Menús flotantes coherentes.** Los desplegables de puertas, tubería y formas, y el botón de la paleta *Todas las herramientas*, comparten ya el mismo lenguaje: radio grande, cristal, borde translúcido y una entrada de 0,18 s.
- **Marca y botones de icono.** El logotipo pasa a un icono de app con degradado, brillo de cristal y esquinas de squircle; los botones de icono del editor ganan un hundimiento al pulsarlos.
- **Nada se movió de sitio.** La barra lateral conserva su ancho, su orden y su desplazamiento; en pantallas bajas sigue el modo compacto de solo iconos. Ningún icono se añadió ni se retiró: los 88 identificadores `#i-…` siguen siendo los mismos, así que no hay referencias rotas.

## Cambios de la versión 1.1.1

Versión de corrección de la 1.1.0. Los planos, proyectos y versiones guardados siguen abriendo sin cambios.

- **La flecha de acciones ya abre su menú.** El botón de los tres puntos de *Mis planos* y de la ficha del proyecto dejaba la vista bloqueada: el menú se abría dentro de la tarjeta y la tarjeta recorta su contenido (`overflow: hidden`), así que el panel quedaba fuera de la vista y los clics siguientes parecían muertos. Ahora el menú se monta en una **capa fija sobre el `<body>`** mientras está abierto, se coloca junto al botón (abajo o arriba según el espacio), se desplaza si no cabe y vuelve a su sitio al cerrarse. Ningún contenedor puede recortarlo.
- **Menú con teclado y sin estados pegados.** `Esc` cierra y devuelve el foco a la flecha, `↑`/`↓`/`Inicio`/`Fin` recorren las opciones, un clic fuera lo cierra y al elegir una opción el menú se recoge. Solo puede haber un menú abierto a la vez, y el mismo mecanismo arregla el selector **Cambiar piso** del editor.
- **Eliminar proyecto, visible y con contexto.** La ficha del proyecto estrena un botón **Eliminar proyecto** en la cabecera, en rojo y con confirmación que nombra el proyecto, sus pisos y sus versiones. El menú de cada tarjeta de *Mis planos* añade *Editar datos* y muestra un separador antes de la acción destructiva.
- **Eliminar piso, visible y honesto.** El menú de cada piso incluye ahora **Eliminar piso** con confirmación que nombra el plano, además de *Imprimir o PDF*, *Exportar JSON*, *Informe de revisión* y *Duplicar piso*. Cuando el proyecto tiene un solo piso, en lugar de un botón desactivado sin explicación aparece la nota *Único piso: el proyecto conserva al menos uno*.
- **Sin controles decorativos.** Se retira el indicador `•••` de las tarjetas, que aparentaba ser un menú y no hacía nada.
- **Pruebas nuevas de las páginas.** `tests/js/pages.mjs` (29 comprobaciones en PHP 8.1 y 8.3) abre el panel y la ficha reales en JSDOM y verifica apertura y cierre del menú, que se monte fuera de la tarjeta, la colocación, `Esc`, clic fuera, un solo menú abierto, la confirmación de borrado (cancelar no envía, confirmar sí), el borrado real de un piso y de un proyecto con su aviso, y la protección del último piso.

## Cambios de la versión 1.1.0

La entrega grande de esta versión: un **auditor de planos** y una **medición de evacuación** que usan la geometría real del plano. Los diseños guardados siguen abriendo sin cambios; las claves nuevas (`canvas.occupancy` e `isExit`) son opcionales y el formato sigue siendo v2.

- **Cajón «Revisión» con hallazgos por severidad.** El botón **Revisión** de la barra lateral inferior abre un auditor que analiza el último diseño guardado y lista los avisos en cuatro niveles (*crítico*, *importante*, *menor*, *informativo*), con filtros por nivel, el valor medido y un botón **Ver en el plano** que selecciona el elemento y ajusta el zoom. El contador del botón muestra los críticos e importantes pendientes.
- **Medición de evacuación.** Sobre una rejilla de celdas que respeta muros y vanos, el motor calcula el **camino más corto desde cada punto hasta la salida marcada más cercana** y devuelve el recorrido más largo, la superficie libre interior (el terreno de fuera del edificio no computa), las zonas sin salida alcanzable y la celda más desfavorable. Con eso avisa de recorridos por encima del umbral y de recintos sin salida.
- **Salidas de emergencia.** Cualquier puerta, puerta doble o portón se marca desde *Apariencia* con el interruptor **Salida de emergencia**. La marca (`isExit`) se valida en el servidor —solo se acepta en puertas y con un booleano— y es el origen de la medición. El inspector explica para qué sirve.
- **Ocupación declarada.** *Ajustes* incorpora **Ocupación declarada (personas)**. Si queda en 0, el auditor estima la ocupación por la densidad de referencia sobre la superficie libre y lo advierte en el informe; si se declara, se usa para el ancho requerido y el tiempo de evacuación.
- **Aforo, ancho y tiempo.** El informe compara el **ancho requerido** (personas × ancho de paso) con el **ancho útil** de las salidas (vano × holgura de marcos y hojas) y estima el **tiempo de evacuación** como marcha más cola en las salidas, con la velocidad y el flujo de referencia.
- **Rutas revisadas.** Las rutas dibujadas se miden, se comprueba si terminan en una salida (con tolerancia) y si cruzan muros fuera de un vano; los avisos enlazan con el trazo para corregirlo.
- **Criterios configurables.** Todos los umbrales están en `resources/audit-criteria.json` (recorrido máximo, mínimo de salidas, ancho mínimo, factor de holgura, ancho por persona, velocidad, flujo, densidad, tolerancias, superficie mínima de recinto y radio de señalización). El informe imprimible enumera los valores aplicados.
- **Cálculo en el servidor y API.** `GET api/floors/{id}/audit` devuelve el informe completo (`findings`, `counts`, `exits`, `travel`, `occupancy`, `egress`, `routes`, `signs`, `criteria`) y acepta `?occupancy=N` para simular otro aforo. El cajón usa ese mismo endpoint, así que la interfaz y la API nunca discrepan.
- **Informe imprimible.** `projects/{id}/floors/{floorId}/audit` genera una hoja con el encabezado del proyecto y del piso, las métricas, los hallazgos agrupados por severidad, la tabla de rutas, los criterios y el aviso de alcance; se imprime o se guarda como PDF desde el navegador.
- **Demo actualizada.** La planta baja del proyecto de ejemplo marca sus dos salidas, corrige la ruta de evacuación para que pase por los vanos en lugar de atravesar muros, incorpora el marcador **Usted está aquí**, una señal de salida junto al portón y una ocupación declarada de 30 personas. El auditor de la demo queda sin hallazgos críticos.
- **Correcciones de la entrega.** El interruptor de salida ya aplica el cambio al modelo (antes se repintaba sin efecto), el cajón se engancha siempre al documento aunque la aplicación no exponga la ventana y el auditor descuenta el exterior del edificio. La suite gana **pruebas funcionales del motor** (salidas, recorrido, rutas, señales y validación) y **de interfaz** (interruptor, ocupación, cajón, contador, filtros, «Ver en el plano» e informe).

## Cambios de la versión 1.0.9

- **Cambiar el equipo CAD desde el inspector.** Igual que las señales, cualquier equipo seleccionado muestra en **Apariencia** su miniatura, su familia y un botón **Cambiar equipo**. Abre la biblioteca de los 301 objetos en modo sustitución, con el equipo actual resaltado y la insignia *Equipo actual*: al elegir otro se conservan posición, tamaño, rotación, capa, opacidad y bloqueo, y el objeto toma el color de su nueva familia. Entra en el historial y funciona con varios equipos a la vez.
- **Seleccionar un solo objeto con un clic.** El problema real era que los pictogramas y los equipos se dibujan con trazos finos dentro de un SVG incrustado que ignora el puntero: al hacer clic en su interior no había nodo bajo el cursor, el editor lo interpretaba como un clic en el vacío y abría la caja de selección. Ahora el clic se resuelve contra la **pila geométrica real** (`hitStack`) con una tolerancia de 8 píxeles de pantalla, prefiere el objeto visible que queda encima y recurre al nodo SVG cuando el puntero acierta una forma pintada o su etiqueta. Un clic sencillo basta para muros finos, tuberías, textos, pictogramas y equipos; `Ctrl/⌘ + clic` sigue bajando en la pila y `Shift` sigue añadiendo a la selección.
- **Pista visual antes de hacer clic.** El cursor cambia a la cruz de movimiento cuando hay un elemento seleccionable bajo el puntero y vuelve a la flecha sobre el lienzo vacío. Las etiquetas y los textos de los elementos también reciben el clic, sin seleccionar el objeto equivocado.
- **Biblioteca con el vocabulario correcto.** En modo sustitución el cajón distingue señal y equipo: título *Cambiar equipo*, insignia *Equipo actual*, botón **Usar este equipo** y una nota propia que recuerda que los objetos CAD son esquemáticos y que las medidas y la escala se verifican en sitio.
- **229 comprobaciones de interfaz** en PHP 8.1 y 8.3, con pruebas nuevas para el clic sobre pictogramas, equipos y muros finos, la pila con `Ctrl` y `Shift`, el cursor, y el cambio de equipo con deshacer y conservación del circuito eléctrico.

## Cambios de la versión 1.0.8

- **Cambiar una señal sin volver a dibujarla.** En el inspector, sección **Apariencia**, cualquier señal muestra su pictograma actual y un botón **Cambiar señal**. Abre la biblioteca en modo sustitución, con la señal actual resaltada: al elegir otra se reemplaza el pictograma y se conservan posición, tamaño, rotación, capa y opacidad. Funciona también con varias señales seleccionadas y entra en el historial (deshacer).
- **Señal «Usted está aquí».** Nuevo pictograma `SVC_AQUI` (`sig_aqui`) en la familia **Ubicación**, con su propio azul (`#1d4ed8`), búsqueda por «aquí», «posición actual» o «estás aquí». Cierra el hueco frente a los planos de evacuación, que siempre necesitan marcar el punto de partida del lector.
- **La biblioteca entiende dos modos.** En modo sustitución las tarjetas no se arrastran al lienzo, el botón del detalle dice **Usar esta señal**, la tarjeta activa muestra una insignia *Actual* y el cajón se cierra al aplicar el cambio.
- **Recuentos del catálogo en el servidor.** Las vistas ya no llevan cifras fijas: `LibraryRepository::counts()` alimenta el panel, la barra lateral y la paleta, así que añadir pictogramas no deja números desactualizados.

## Cambios de la versión 1.0.7

- **El inspector vuelve a desplazarse.** La barra lateral de herramientas no tenía scroll propio, así que su altura (~18 botones) estiraba la fila del banco de trabajo; el inspector crecía con ella y su contenido quedaba cortado sin barra, como si estuviera fijo. Ahora la fila está acotada al alto de la ventana, la barra hace su propio scroll y el panel de propiedades conserva un cuerpo desplazable.
- **La barra lateral desplaza y no empuja.** Cuando no cabe, se desplaza dentro de su columna, con barra fina y sin afectar al lienzo ni al inspector.
- **Menús de la barra lateral a prueba de scroll.** Los desplegables de puertas, tubería y formas pasan a anclarse a la ventana y se colocan junto a su botón, así que la barra puede desplazarse sin recortarlos; se cierran al desplazar o redimensionar.
- **El inspector conserva el punto de lectura.** Al cambiar una propiedad ya no vuelve al principio: mantiene el desplazamiento y devuelve el foco al mismo campo.
- **Barra compacta en más pantallas.** El modo de sólo iconos entra a partir de 1000 px de alto, de manera que en portátiles cabe completa.

## Cambios de la versión 1.0.6

- **Pie de página en todos los planos.** La exportación SVG, el PNG y la hoja de impresión terminan con una franja de orientación para evacuación y un bloque de datos del piso. Se actualiza solo con lo último guardado.
- **Cinco celdas de orientación** con icono y color propios: su posición actual, rutas de evacuación, salidas de emergencia, equipos de protección contra incendios y punto de reunión. Dos de ellas reutilizan los pictogramas ISO 7010 del catálogo local.
- **Datos del plano y nota de la aplicación**: proyecto, piso, nivel, sitio, área, responsable, escala, unidad, versión, fecha de guardado, número de elementos, atribución de los pictogramas y aviso de verificación en sitio, con `© año Normia Planos CAD · GPL-3.0 · versión`.
- **Cajón «Pie de plano»** con la vista previa real, la lista de celdas y atajos para imprimir o descargar el SVG con el pie.
- **Un solo origen de contenido.** `PlanFooter` compone el pie en el servidor y el editor recibe los mismos datos, de modo que el PNG del navegador y el SVG del servidor no pueden desincronizarse.
- **La franja se adapta al ancho** del lienzo (5, 3 o 1 columna) y los textos se parten por palabras; la leyenda de redes también reparte sus entradas según el ancho disponible.

## Cambios de la versión 1.0.5

Entrega de interfaz sobre la 1.0.4. Los planos guardados siguen abriendo sin cambios.

- **Herramienta Mano.** La barra lateral gana la mano (`H`) para desplazar el lienzo sin tocar el dibujo, con cursor de agarre y paneo suave. Se suman a `Espacio` + arrastre y al botón central, que siguen funcionando en cualquier herramienta.
- **Selección de elementos superpuestos.** Antes sólo se podía seleccionar lo que estuviera encima. Ahora `Ctrl/⌘ + clic` baja al siguiente elemento de la pila y `Ctrl/⌘ + Shift + clic` sube; la barra de estado muestra cuántos hay en ese punto y el inspector añade la sección **Elementos superpuestos** para cambiarlos con un clic.
- **Inspector rediseñado.** Ficha de selección con miniatura y acciones rápidas, secciones plegables con iconos, campos numéricos con unidad y contador, rotación en pasos de 90°, controles de opacidad y color más compactos, rejilla de alineación y orden con iconos, y un estado vacío con resumen del piso.
- **Paleta «Todas las herramientas».** Un panel agrupado (seleccionar, dibujar, insertar) con icono, nombre y atajo de cada herramienta, al estilo de las barras profesionales modernas.
- **Iconos nuevos y coherentes.** Mover, paleta, pila, organizar, traer adelante y atrás, girar a izquierda y derecha y reglas ocultas; todos con la misma retícula de 24 px, trazo redondeado y peso uniforme. El interruptor de reglas cambia de icono y de tooltip según su estado. (En la v1.1.2 el conjunto se redibujó completo con el estilo «Normia 2.0».)
- **Corrección de cursores.** El cursor de cada herramienta ya no se perdía al repintar el lienzo; la mano muestra `grab`/`grabbing` y las herramientas de dibujo, la cruz.

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

Las versiones publicadas están en la página de **[Liberaciones](https://github.com/luan920530-commits/normia-planos-cad/releases)**. La versión vigente es la **v1.2.0**, con sus notas, sus sumas SHA-256 y los enlaces de descarga de los paquetes que viven en `paquetes/v1.2.0/`. Las entregas anteriores (v1.0.0 a v1.0.9 y las v1.1.0 a v1.1.3) no deben usarse: la v1.2.0 las reemplaza.

La entrega v1.2.0 incluye los ZIP ya construidos en **`paquetes/v1.2.0/`** (misma composición que genera el script, verificada por `tests/php/package.mjs`):

```text
paquetes/v1.2.0/
├── normia-planos-cad-1.2.0.zip
├── normia-planos-cad-demo-1.2.0.zip
├── SHA256SUMS.txt
├── BUILD.txt
└── LEEME.txt
```

Para regenerarlos desde el código (por ejemplo tras cambiar plantillas o catálogos):

```bash
npm run build          # o: bash tools/build-packages.sh
```

El script deja los artefactos en `dist/`:

```text
normia-planos-cad-1.2.0.zip
normia-planos-cad-demo-1.2.0.zip
SHA256SUMS.txt
BUILD.txt
```

- **Excluidos siempre**: `config/config.php`, `*.sqlite`, sesiones, logs, caché, `tests/`, `tools/`, `package.json`, `node_modules`, `.git`, `dist`, `paquetes` y el marcador de demo (salvo en el paquete de demostración).
- **Incluidos**: aplicación, assets, catálogos, licencias, documentación, `LEEME-PRIMERO.txt`, `config/config.example.php` y carpetas `storage` vacías con `.gitkeep`.
- Verifica las sumas:

```bash
cd paquetes/v1.1.2
sha256sum -c SHA256SUMS.txt
```

Los hashes exactos de los ZIP publicados están en `paquetes/v1.2.0/SHA256SUMS.txt`; `dist/` es solo la salida de trabajo y está ignorada por Git.

---

## Limitaciones

- Planos **esquemáticos**: no hay cálculo de áreas, estructuras ni normativa automática. La escala es una referencia declarada, no una medición certificada.
- **Las redes son un apoyo de diseño, no un cálculo firmado.** El panel estima longitudes, cargas, breaker, calibre y caída de tensión con tablas de referencia locales; no reemplaza la memoria de cálculo, el estudio de cargas, el diseño hidrosanitario ni la revisión de un profesional competente, y no verifica cumplimiento de NTC 1500, NTC 2505, NTC 2050, NFPA ni de la norma local aplicable.
- **El auditor y la medición de evacuación son de referencia.** Calculan sobre el dibujo esquemático con rejilla de 20 cm, umbrales configurables y supuestos de velocidad, flujo y densidad. No son un dictamen técnico, no certifican cumplimiento normativo, no reemplazan el estudio de evacuación ni la revisión de un profesional competente y deben confirmarse en sitio: ocupación real, ancho libre de marcos y hojas, estado de las vías, señalización física y puntos de reunión.
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
