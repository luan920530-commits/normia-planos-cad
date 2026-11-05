# Normia nativa: plan de una aplicación 100 % nativa

**Estado:** en marcha. Hechas la **etapa N0** (núcleo en C con paridad
verificada contra el motor PHP, § 11) y la **etapa N1** (documento editable y
ventana nativa de macOS con lienzo propio, sin WebView, § 12). Las etapas N2–N4
siguen siendo el plan.

**Pregunta que responde:** ¿Normia Estudio puede ser una aplicación nativa de
verdad —como AutoCAD— y no una app con Electron?

**Respuesta corta:** técnicamente sí, y este documento dice cuánto cuesta. Hoy
**no lo es**: la carcasa es nativa y el interior es el editor web con un
intérprete PHP compilado a WebAssembly.

---

## 1. Qué significa «nativa», en tres capas

Una aplicación de escritorio se puede describir en tres capas independientes. La
confusión de «¿es nativa?» viene de mezclarlas: se puede tener una capa nativa y
las otras dos no.

| Capa | Qué es | Quién la dibuja |
| --- | --- | --- |
| **1 · Carcasa** | Ventana, barra de menús, Dock, diálogos de Abrir/Guardar, impresión, avisos, cierre con cambios, `⌘O` desde el Finder | El sistema operativo |
| **2 · Interfaz** | Lienzo, cotas, rail, cajones, inspector, capas, guía | El motor gráfico de la app |
| **3 · Motor** | Unidades, auditor, aforo, rutas, redes, extintores, importación y exportación | Un lenguaje y una biblioteca de cálculo |

## 2. Qué hay hoy, medido en el repositorio

| Capa | Tecnología | Tamaño | ¿Nativa? |
| --- | --- | --- | --- |
| Carcasa | Electron 43 (`tools/electron/estudio/main.mjs`) | 1 807 líneas | **Sí**: ventana, menú, diálogos, Dock, «Abrir con…» |
| Interfaz | HTML + SVG + CSS en Chromium | 13 464 líneas de JS en 25 archivos · 3 183 de CSS | **No** |
| Motor | PHP 8.3 → WebAssembly dentro del paquete | 16 757 líneas en 98 archivos | **No**, aunque el código sea el mismo de la edición web |

Consecuencias medibles de esa decisión:

| Dato | Hoy |
| --- | --- |
| Instalador macOS | 145–150 MB (lleva Chromium completo y el intérprete) |
| Arranque en frío | 2–4 s (hay que levantar el motor y el motor gráfico) |
| Memoria en reposo | cientos de MB, el coste de un navegador |
| Sistemas | macOS 12+, Windows 10+, Linux, con **un solo** código de editor y de motor |
| Cifras del auditor | **Idénticas** a la edición web, porque es literalmente el mismo PHP |

Esa última fila es la razón de fondo de las otras: un solo motor evita que dos
implementaciones den números distintos. Cualquier plan de app nativa tiene que
responder qué pasa con esa garantía (§ 5).

## 3. Los cuatro caminos

| Camino | Qué cambia | Instalador | Arranque | Plataformas | Sensación |
| --- | --- | --- | --- | --- | --- |
| **A · Electron (actual)** | — | 150 MB | 2–4 s | 3 | Ventana de Mac, interior web |
| **B · Carcasa nativa + WebKit** | Capa 1 en SwiftUI; capa 2 en el WebKit del sistema | ~35–45 MB | < 1,5 s | **solo macOS** | Muy cerca de una app de Mac |
| **C · Nativa completa** | Capas 1, 2 y 3 en el lenguaje del sistema | ~15–25 MB | < 1 s | 1 por plataforma | Como AutoCAD |
| **D · Carcasa liviana (Tauri)** | Capa 1 en Rust; capa 2 en el WebView del sistema | ~20–30 MB | 1–2 s | 3 | Web dentro de una ventana nativa |

Lo que de verdad se percibe como «nativo» no es el lenguaje, es: arranque
inmediato, menús y diálogos del sistema, gestos de trackpad, modo oscuro,
tipografía, peso del archivo, consumo de batería y que la app no pese como un
navegador. B y C dan casi todo eso; D da una parte; A ya da menús y diálogos.

## 4. El camino C, por etapas

Cada etapa entrega algo que se puede instalar y probar. Si se decide parar, se
para con algo utilizable.

### E1 · Carcasa nativa macOS (SwiftUI + WKWebView)

- **Entrega:** una `.app` real, sin Electron, con menú nativo (Archivo, Editar,
  Ver, Ventana, Ayuda), diálogos del sistema, documentos recientes en el Dock,
  cierre con cambios pendientes, y el editor actual dentro del **WebKit del
  sistema**.
- **Se escribe:** app de documentos en SwiftUI (`NSDocument` o `FileDocument`),
  puente de archivos con `WKScriptMessageHandler`, *security-scoped bookmarks*
  para que el archivo abierto sobreviva a un reinicio con el sandbox activo.
- **Se reutiliza:** el 100 % de las capas 2 y 3; el motor PHP sigue en WASM
  dentro del WebView.
- **Prueba:** `xcodebuild` en el runner `macos-15-intel`, `ctest` de arranque
  (`--check`), apertura de un `.json` de la demo y auditoría.
- **Estimación:** 2 semanas.
- **Riesgo principal:** WKWebView no es Chromium; ver § 7.

### E2 · Motor PHP nativo (sin WebAssembly)

- **Entrega:** el mismo código PHP, compilado como **binario estático** por
  plataforma (PHP 8.3 + `pdo_sqlite`, `sqlite3`, `mbstring`, `openssl`,
  `fileinfo`, `session`) y lanzado como proceso hijo en `127.0.0.1` con puerto
  efímero y token de sesión. La app habla con él por HTTP local, igual que hoy.
- **Por qué así:** se conserva **byte a byte** el motor que ya está probado con
  386 comprobaciones funcionales y 7 552 valores golden. Reescribirlo en Swift
  está descartado (§ 5).
- **Se gana:** arranque más rápido que WASM, unos 40 MB menos en el paquete y la
  posibilidad de usar SQLite nativo en el futuro.
- **Estimación:** 1–2 semanas en macOS; +1 en Windows.

### E3 · Lienzo nativo (la parte grande)

Es reescribir la capa 2: lo que el usuario ve y toca.

| Módulo actual | Líneas | Equivalente nativo |
| --- | --- | --- |
| `editor.js` (herramientas, puntero, pluma, deshacer) | 3 014 | Gestos y máquina de estados en Swift |
| `lib/model.js` (documento, capas, historial) | 2 303 | Modelo de documento |
| `lib/renderer.js` (dibujo) | 1 527 | Core Graphics / `CALayer` |
| `editor/present.js` (modo presentación) | 921 | Vista de presentación |
| `editor/inspector.js` | 905 | Panel de propiedades |
| `lib/geometry.js` (arcos, intersecciones, ajustes) | 580 | Geometría |
| `editor/measure.js` | 518 | Medición de rutas |
| `editor/schedule.js`, `library.js`, `mep.js`, `extinguishers.js`, `guide.js`, `audit.js`, `study.js`, `ui.js`, `store.js`, `brigade.js` | 2 956 | Pliego, biblioteca, redes, cobertura, guía, informe, puente |
| **Total** | **13 464** | |

- **Entrega:** el editor sin WebView: lienzo, herramientas, cotas, capas,
  deshacer y presentación dibujados por el sistema.
- **Estimación:** **3–5 meses** solo en macOS, a 350–450 líneas equivalentes por
  día incluyendo pruebas de paridad con el editor actual.
- **Criterio de aceptación:** los golden de la demo dan **los mismos valores**
  que la edición web, y los seis flujos de la guía se completan igual.

### E4 · Windows y Linux

No hay atajo: WinUI 3 (o WPF) en Windows y GTK 4 en Linux, cada uno con su
carcasa y su lienzo. Las cifras de E3 se repiten.

- **Estimación:** 2–3 meses por plataforma, suponiendo que E3 dejó las reglas de
  negocio aisladas y probadas.

## 5. La decisión de fondo: qué pasa con el motor

| Opción | Cifras | Riesgo |
| --- | --- | --- |
| **Un solo motor PHP** (WASM hoy, binario nativo en E2) | Idénticas por construcción | Ninguno nuevo. Depende de mantener PHP |
| **Reescribir el motor en Swift** (y luego en C# y C) | **Pueden cambiar** | Alto: tres implementaciones del auditor, del aforo y de las rutas que se separan con el tiempo |
| **Motor en un servicio aparte** | Idénticas | Necesita servidor: contradice «solo activos locales» |

Recomendación: **mantener un solo motor**. La regla del proyecto —cambiar de
unidad no altera dimensiones, no modificar resultados en silencio— solo se puede
sostener con una implementación.

## 6. Calendario, con supuestos

Supuestos: una persona, 20–25 h por semana, sin rediseño visual, sin cambio de
alcance y sin contratiempos de firma.

| Hito | Contenido | Semanas | Qué se puede instalar al terminar |
| --- | --- | --- | --- |
| M1 | E1 + E2 | 3–4 | `.app` nativa de Mac con el editor actual y motor nativo |
| M2 | E3 mitad: modelo, dibujo, selección, muebles, capas, deshacer | 8–10 | Editor nativo usable para dibujar |
| M3 | E3 completo: cotas, pluma, rutas, auditor en pantalla, presentación | 8–10 | **App 100 % nativa en macOS** |
| M4 | E4 Windows | 10–12 | Nativa en Mac y Windows |
| M5 | E4 Linux | 8–10 | Nativa en las tres |

Total del camino C hasta macOS: **5–6 meses**. Las tres plataformas: **10–12
meses**, con la advertencia de que son estimaciones, no compromisos.

El camino B (solo E1) son **2 semanas** y ya cambia la sensación de la app en tu
Mac.

## 7. macOS 12 Monterey y el WebKit del sistema

Si se hace E1 o E3 hay que respetar tu equipo:

- **SwiftUI está disponible desde macOS 10.15**, pero muchas comodidades
  (`Grid`, `NavigationStack`, `Chart`, nuevas APIs de `Window`) llegan en 13 y
  14. Con *deployment target* 12 hay que usar `LazyVStack`, `ObservableObject` y
  comprobaciones de disponibilidad.
- **Tu Mac, con 12.7.6, trae el WebKit de Safari 17.** En un 12.7.6 el editor
  actual funciona; en un 12.0 el WebKit es Safari 15 y hay que revisar tres
  usos de `replaceChildren` (Safari 14+) y el resto de la sintaxis moderna, que
  en el editor es conservadora: no hay `structuredClone`, ni `.at()`, ni
  `Object.hasOwn`, ni `OffscreenCanvas`.
- **Firma:** una `.app` sin notarizar muestra el aviso de Gatekeeper. Notarizar
  exige cuenta de desarrollador de Apple (99 USD al año) y es una decisión
  aparte, también para el camino A.

## 8. Lo que se gana y lo que se pierde

**Se gana**

- Arranque y memoria de una app normal; paquete de 15–45 MB en vez de 150.
- Menús, atajos, gestos y accesibilidad reales del sistema (VoiceOver sobre
  controles nativos, no sobre un lienzo web).
- Un solo binario por plataforma, sin Chromium que actualizar.
- Puerta abierta a un iPad de verdad, que con WebView no se sostiene.

**Se pierde**

- **Una sola base de código.** Hoy un cambio se escribe una vez; después, tres.
- La garantía de que las cifras son iguales en todas las plataformas, salvo que
  el motor siga siendo uno (§ 5).
- Velocidad de entrega: cada función habrá que hacerla tres veces.
- Los 26 pasos de la suite actual dejan de cubrir la interfaz nativa: hará falta
  una suite de UI por plataforma.

## 9. Lo que este plan no promete

- No promete certificación de nada, ni compatibilidad DWG/DXF.
- No promete que una app nativa sea «más exacta»: la exactitud está en el motor,
  que no cambia.
- No promete plazos cerrados: las cifras de § 6 son estimaciones con supuestos
  declarados.
- No promete que se pueda probar aquí: este entorno es Linux sin pantalla. Todo
  lo nativo se compila en GitHub Actions y lo estrena un equipo real.

## 10. Decisión pendiente

Tres preguntas, en orden:

1. ¿Se queda la edición actual (A) como está, o se hace E1 + E2 (camino B) para
   que en la Mac sea una app nativa de verdad con el mismo editor dentro?
2. ¿El objetivo es «que se sienta de Mac» (B) o «que no quede nada de web»
   (C, 5–6 meses en macOS)?
3. ¿Windows y Linux siguen siendo requisito? Si la respuesta es no, el camino C
   baja de 10–12 meses a 5–6.

Mientras no haya decisión, **no se toca nada**: la 1.28.0 sigue siendo la
entrega vigente y su `.dmg` funciona en tu Mac.

## 11. Etapa N0, hecha: el núcleo en C da las mismas cifras

Primer paso del camino C, elegido el 2026-11-04. Está en `native/`, compila sin
dependencias y sin un solo aviso, y **reproduce el motor PHP hasta el último
dígito**:

| Qué | Archivo | Estado |
| --- | --- | --- |
| Unidades (mm, cm, m; geometría en cm; m²; tolerancia; escala `1:N`) | `native/src/units.c` | hecho |
| Geometría de trazos (arco por tres puntos, longitud real del arco) | `native/src/geometry.c` | hecho |
| Lector de JSON propio, sin bibliotecas | `native/src/json.c` | hecho |
| Lectura del sobre `normia-plan`, muros y superficie | `native/src/plan.c` | hecho |
| Programa `norma-core --check / --stats` | `native/src/cli.c` | hecho |
| Pruebas del núcleo | `native/tests/test_core.c` | **23/23** |
| Paridad contra PHP | `native/tests/parity.mjs` | **12/12** |

Resultados de la prueba de paridad con un plano de tres muros (uno curvo):

| Cifra | C | PHP |
| --- | --- | --- |
| Longitud total de muros (cm) | 1121.2388980384690 | 1121.2388980384690 |
| Longitud en metros | 11.212388980384690 | 11.212388980384690 |
| Superficie del lienzo (m²) | 89.166200000000003 | 89.166200000000003 |
| Muro curvo (cm) | 471.23889803846896 | 471.23889803846896 |

Lo que este primer paso **no** hace, para no confundir: no hay ventana, ni
lienzo, ni menú. El programa actual es de línea de órdenes. La siguiente etapa
(N1) es la ventana nativa de macOS con su lienzo; ahí empieza el trabajo de los
3–5 meses de § 4.

Consecuencias prácticas de haber empezado por el núcleo:

- El riesgo grande —«las cifras se separan»— ya está cubierto por una prueba que
  falla si un número deja de coincidir.
- La ventana nativa podrá construirse **sobre** ese núcleo sin volver a decidir
  unidades, arcos ni JSON.
- El flujo de verificación compila el C con `-Werror` y corre la paridad en cada
  cambio, así que el núcleo no se degrada en silencio.

## 12. Etapa N1, hecha: la ventana nativa de macOS

`native/macos/` es una aplicación **AppKit** de verdad, compilada con
`clang -fobjc-arc`, que enlaza solo `Cocoa`. No hay WebView, ni HTML, ni
JavaScript, ni Electron, ni PHP.

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Arranque | `main.m` | `--check` comprueba el núcleo sin abrir ventana |
| Ventana y menú | `AppDelegate.m` | Archivo / Editar / Ver / Ayuda en español; `⌘N ⌘O ⌘S ⇧⌘S ⌘Z ⇧⌘Z`; paneles del sistema; aviso al cerrar con cambios; título con «•» y documento editado en el Dock |
| Lienzo | `CanvasView.m` | Core Graphics: hoja A4, rejilla de 20 cm, muros con arcos, equipos; clic selecciona, arrastrar mueve nodos o el trazo, `M` dibuja muros, `Esc` sale, Retroceso borra |

El documento en C (`native/src/document.c`) es lo que la ventana edita y lo que
se guarda: muros por nodos con arcos, equipos, deshacer y rehacer de 64 niveles,
selección por proximidad y el **sobre oficial** de ida y vuelta.

### Pruebas

| Prueba | Qué comprueba | Resultado |
| --- | --- | --- |
| `native/tests/test_core.c` | unidades, arcos, JSON, plano | **23/23** |
| `native/tests/test_document.c` | muros, deshacer, selección, guardar y abrir, unidades | **27/27** |
| `native/tests/test_svg.c` | cifras es-CO y SVG con escala física (etapa N2) | **25/25** |
| `native/tests/parity.mjs` | paridad C contra PHP, dígito a dígito, también en el SVG | **16/16** |
| `native/tests/macos.mjs` | contrato de la ventana: AppKit, sin WebView, menú en español, atajos, sobre oficial, macOS 12, herramientas | **28/28** |
| `native/tests/core.mjs` | compilación estricta y los tres programas de prueba del núcleo | **7/7** |

Y en el flujo de verificación hay un trabajo nuevo en **`macos-15-intel`** que
compila con `-Werror`, arma el `.app`, comprueba el `LSMinimumSystemVersion` con
`PlistBuddy` y **arranca la aplicación con `--check`**.

### Lo que esta etapa no puede prometer

- **La ventana en pantalla**: no se puede probar desde el entorno donde se
  escribió (Linux sin pantalla ni Xcode). Lo que sí está comprobado, en un runner
  de `macos-15-intel`: el `.app` **compila con `clang` y `-Werror`**, su
  `LSMinimumSystemVersion` es **12.0** y la aplicación **arranca con `--check`**.
  El primer uso real con ratón y teclado lo hace una persona.
- **Firma y notarización**: la `.app` sale sin firmar, como el estudio.
- **Paridad visual exacta** con el editor web: colores y grosores son los del
  lienzo nativo, no una copia píxel a píxel.
- **El resto de herramientas**: cotas, pluma de nodos, informes y el auditor en
  pantalla son la etapa N2 y siguientes.

## 13. Etapa N2, hecha: cotas, pluma de nodos, SVG, recientes e impresión

La etapa N2 lleva a la aplicación lo que hacía falta para dibujar de verdad y
para sacar el plano sin el motor PHP:

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Cifras con formato colombiano (`400 cm`, `471,2 cm`, `112.123,9 cm`) | `native/src/format.c` | hecho · **25/25** entre las dos pruebas |
| SVG con escala física: papel en milímetros, `viewBox` en centímetros, rejilla, franja de datos y cotas rotuladas | `native/src/svg.c` | hecho |
| Cota como objeto del documento (`tipo: dimension`) | `native/src/document.c` | hecho |
| `norma-core --svg plano.json` | `native/src/cli.c` | hecho |
| Herramientas del lienzo `V · M · P · A · D` con borrador y previsualización | `native/macos/CanvasView.m` | escrito |
| Exportar SVG con panel del sistema (`⌘E`) | `native/macos/AppDelegate.m` | escrito |
| Abrir reciente (10 archivos, preferencia del sistema, se limpia sola) | `native/macos/AppDelegate.m` | hecho · **42/42** |
| Lienzo abierto: zoom 2 %–4000 % sobre el cursor, desplazamiento con el botón central o derecho y rejilla adaptativa | `native/macos/CanvasView.m` | hecho |
| Imprimir en A4 horizontal y exportar PDF con el fondo en blanco | `native/macos/AppDelegate.m`, `CanvasView.m` | hecho |

Lo que da el SVG del núcleo, medido en el plano de prueba A4 a 1:100:

| Dato | Valor |
| --- | --- |
| Ancho del papel | `190.00mm` (el mínimo de 190 mm manda sobre el A4) |
| Alto del papel | `103.40mm` (plano de 79,4 mm + franja de 24 mm) |
| `viewBox` | `0 0 1900 1034`, en centímetros del plano, no en milímetros |
| Escala física | `mm_per_cm = 0,1` |
| Franja | «Escala 1:100 · cm · Normia nativo · esquema de apoyo, no es un plano de obra» |
| Cota de prueba | `<text …>400 cm</text>` |
| Arco | `M 400 0 A 150 150 0 0 1 400 300`, **idéntico al que escribe PHP** |

### Lo que N2 todavía no puede prometer

- **La ventana con las herramientas nuevas no se ha compilado**: en el entorno
  donde se escribe esto no hay AppKit. El contrato se comprueba con
  `native/tests/macos.mjs` (28/28) y la compilación real la hace el trabajo
  `macos-nativo` del flujo.
- **Recientes e impresión** ya están escritos, pero quien los usa con ratón y
  teclado es una persona: aquí solo se comprueba su contrato y que compilen.
- **El paquete se publica como artefacto del flujo**, no como release: así se
  puede bajar el `.app` sin firmar y abrirlo en un Mac con Intel.

## 14. Etapa N3, primera pieza: la rejilla y el aforo en C

El auditor completo (recorridos, hallazgos, rutas) es la etapa N3. Antes hay que
tener lo que todo lo demás usa: **la superficie libre** y **el aforo**, medidos
igual que en la web.

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Rejilla | `native/src/grid.c` | Celdas de 20 cm; los muros se bloquean con medio trazo, la holgura de 4 cm y media celda; los vanos de las puertas abren el paso; el exterior se inunda desde el borde con los vanos cerrados; vías, andenes, cebras, parqueaderos y linderos no cuentan como piso |
| Aforo | `native/src/audit.c` | superficie libre × densidad (0,2 pers./m²), con tope de 10 000; distingue capacidad calculada, aforo declarado, aforo que rige, gente para la salida y **exceso** |
| Programa | `native/src/cli.c` | `norma-core --audit plano.json`, en JSON |
| Salidas | `native/src/audit.c` | Ancho de vano (medida declarada o geometría), ancho útil con el factor de despeje 0,9, ancho que pide el criterio (5 mm por persona), **cola** con flujo de 1,3 pers./s/m y **marcha** con 1 m/s |
| Recorridos | `native/src/travel.c` | Dijkstra de ocho vecinos desde el vano de cada salida: recorrido más largo, punto más lejano, superficie alcanzable y **zonas sin salida** agrupadas por vecindad |
| Hallazgos | `native/src/findings.c` | Salidas, recorrido, zonas sin salida, aforo y ancho, con la gravedad, el título, el detalle, los elementos y el punto del plano |
| Programa | `native/src/cli.c` | `norma-core --audit plano.json` incluye salidas, recorrido y hallazgos |
| Pruebas | `native/tests/test_audit.c` | **34/34** |
| Paridad | `native/tests/parity.mjs` | **32/32** |

El caso de prueba y sus cifras, idénticas en C y en PHP: una habitación de
6 × 4 m con un vano de 80 cm y una vía de 4 m de ancho al sur, con 5 000
personas declaradas.

| Dato | C | PHP |
| --- | --- | --- |
| Superficie libre | 20,4 m² | 20,4 m² |
| Exterior descontado | 63,28 m² | 63,28 m² |
| Celda | 20 cm | 0,2 m |
| Capacidad | 4 personas | 4 personas |
| Declaradas | 5 000 | 5 000 |
| Exceso | 4 996 | 4 996 |
| Gente para la salida | 5 000 | 5 000 |

Dos cosas que se distinguen a propósito, y que el núcleo deja por escrito:

- **Lo calculado no es lo declarado.** Si se declara más gente de la que cabe, el
  exceso se informa y la salida se calcula con la gente declarada: recortarla en
  silencio daría un tiempo optimista.
- **Sin densidad no se inventa capacidad.** Si el criterio se pone en 0, el
  máximo es el tope declarado, no una cifra inventada.

Un fallo real que encontró esta pieza: al inundar el exterior, los vanos tienen
que estar **cerrados**; si se dejan abiertos, el exterior entra por la puerta y
la superficie útil se cuenta dos veces. Se vio comparando celda a celda el mapa
del C con el de PHP (0 diferencias después de la corrección).

### El lienzo abierto (2026-11-04)

El lienzo de la ventana nativa ya no es una hoja fija: **la vista guarda escala y
desplazamiento**, así que se puede acercar (2 % a 4000 %), alejar y moverse como
en un CAD, y dibujar fuera del A4. La hoja sigue dibujada como **referencia de
impresión**, que es lo que se exporta a SVG y a PDF.

- Rueda del ratón o **pellizco** del trackpad: zoom sobre el cursor.
- Trackpad de dos dedos: desplazamiento; **botón central o derecho**: arrastrar el lienzo.
- `⌘0` ajusta la hoja, `⌘1` deja el zoom real (1 cm = 1 punto), `⌘+` y `⌘-` acercan y alejan.
- La rejilla cubre todo el espacio de trabajo y se agranda al alejarse, para no
  dibujar miles de líneas.

### El informe, palabra por palabra

Los ocho hallazgos que ya emite el núcleo —`no_exit`, `too_few_exits`,
`narrow_exit`, `travel_too_long`, `unreachable_area`, `occupancy_over_capacity`,
`occupancy_missing` y `width_short`— salen **con el mismo título, el mismo
detalle, los mismos elementos, el mismo punto del plano y el mismo valor** que en
la edición web. La prueba compara los textos carácter a carácter, no solo la
lista de códigos.

### Lo que N3 todavía no tiene

- **Los demás hallazgos** del auditor web: señalización, extintores, primeros
  auxilios, escenarios, simulacro y rutas dibujadas.
- **Dibujar las rutas** sobre el lienzo nativo.
- **Rutas de evacuación dibujadas** sobre el lienzo nativo.
