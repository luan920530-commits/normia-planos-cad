# Normia nativa: plan de una aplicación 100 % nativa

**Estado:** en marcha. Hechas la **etapa N0** (núcleo en C con paridad
verificada contra el motor PHP, § 11), la **etapa N1** (documento editable y
ventana nativa de macOS con lienzo propio, sin WebView, § 12), la **N2** (§ 13) y
la **N3** (§ 14). De la **N4** ya están el catálogo completo con el paquete de macOS 12
(§ 15) y la ventana con la maqueta de un CAD y todas las herramientas del editor
web (§ 16); quedan Windows y Linux.

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
| Paridad contra PHP | `native/tests/parity.mjs` | **64/64** |

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
| `native/tests/test_document.c` | muros, deshacer, selección, guardar y abrir, unidades, rutas | **33/33** |
| `native/tests/test_svg.c` | cifras es-CO, SVG con escala física y los objetos insertados: puerta, portón, extintor, botiquín y DEA | **31/31** |
| `native/tests/test_catalog.c` | el catálogo completo: 820 piezas, 41 familias, nombres, colores, pictogramas, colocación y el tipo más largo en el plano | **26/26** |
| `native/tests/parity.mjs` | paridad C contra PHP, dígito a dígito, también en el SVG, el auditor y la revisión | **64/64** |
| `native/tests/macos.mjs` | contrato de la ventana: AppKit, sin WebView, menú en español, atajos, sobre oficial, macOS 12, herramientas, ruta, cajón de revisión, **menú Insertar por familias con el catálogo completo**, buscador, puertas con su arco, equipos con pictograma y el trabajo `dist-nativo.yml` | **80/80** |
| `native/tests/core.mjs` | compilación estricta y los tres programas de prueba del núcleo | **7/7** |

Y en el flujo de verificación hay un trabajo nuevo en **`macos-15-intel`** que
compila con `-Werror`, arma el `.app`, comprueba el `LSMinimumSystemVersion` con
`PlistBuddy` y **arranca la aplicación con `--check`**.

### Lo que esta etapa no puede prometer

- **La ventana en pantalla**: no se puede probar desde el entorno donde se
  escribió (Linux sin pantalla ni Xcode). Lo que sí está comprobado, en un runner
  de `macos-15-intel`: el `.app` **compila con `clang` y `-Werror`**, su
  `LSMinimumSystemVersion` es **12.0**, el **`minos` del Mach-O también es 12.0**
  y la aplicación **arranca con `--check`**. El primer uso real con ratón y
  teclado lo hace una persona.

**El runner es macOS 15; el paquete es de macOS 12.** Son dos cosas distintas y
hay que decirlo porque el binario es el que manda, no el `Info.plist`: si se
compila sin destino, clang toma el macOS del equipo que compila y el resultado
exige Monterey o más, aunque la cabecera prometa 12.0. Por eso
`native/macos/Makefile` compila y enlaza con `-mmacosx-version-min=12.0`
(`DEPLOYMENT ?= 12.0`, también exportado como `MACOSX_DEPLOYMENT_TARGET`), y el
flujo no se cree la promesa: lee el `LC_BUILD_VERSION` con `otool -l` y falla si
`minos` no es **12.0**. Lo mismo con el intérprete de PHP del paquete de
escritorio, que se compila con `MACOSX_DEPLOYMENT_TARGET=12.0` y se verifica
igual.
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
| Cifras con formato colombiano (`400 cm`, `471,2 cm`, `112.123,9 cm`) | `native/src/format.c` | hecho · **31/31** entre las dos pruebas |
| SVG con escala física: papel en milímetros, `viewBox` en centímetros, rejilla, franja de datos y cotas rotuladas | `native/src/svg.c` | hecho |
| Cota como objeto del documento (`tipo: dimension`) | `native/src/document.c` | hecho |
| `norma-core --svg plano.json` | `native/src/cli.c` | hecho |
| Herramientas del lienzo `V · M · P · A · D · R` con borrador y previsualización | `native/macos/CanvasView.m` | hecho |
| Exportar SVG con panel del sistema (`⌘E`) | `native/macos/AppDelegate.m` | escrito |
| Abrir reciente (10 archivos, preferencia del sistema, se limpia sola) | `native/macos/AppDelegate.m` | hecho · **80/80** |
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
  `native/tests/macos.mjs` (80/80) y la compilación real la hace el trabajo
  `macos-nativo` del flujo.
- **Recientes e impresión** ya están escritos, pero quien los usa con ratón y
  teclado es una persona: aquí solo se comprueba su contrato y que compilen.
- **El paquete se publica como artefacto del flujo**, no como release: así se
  puede bajar el `.app` sin firmar y abrirlo en un Mac con Intel.

## 14. Etapa N3, hecha: rejilla, aforo, salidas, recorridos, extintores, rutas y simulacro

La etapa N3 lleva el auditor completo al núcleo en C. Lo primero fue el cimiento
que todo lo demás usa: **la superficie libre** y **el aforo**, medidos igual que
en la web.

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Rejilla | `native/src/grid.c` | Celdas de 20 cm; los muros se bloquean con medio trazo, la holgura de 4 cm y media celda; los vanos de las puertas abren el paso; el exterior se inunda desde el borde con los vanos cerrados; vías, andenes, cebras, parqueaderos y linderos no cuentan como piso |
| Aforo | `native/src/audit.c` | superficie libre × densidad (0,2 pers./m²), con tope de 10 000; distingue capacidad calculada, aforo declarado, aforo que rige, gente para la salida y **exceso** |
| Programa | `native/src/cli.c` | `norma-core --audit plano.json`, en JSON |
| Salidas | `native/src/audit.c` | Ancho de vano (medida declarada o geometría), ancho útil con el factor de despeje 0,9, ancho que pide el criterio (5 mm por persona), **cola** con flujo de 1,3 pers./s/m y **marcha** con 1 m/s |
| Recorridos | `native/src/travel.c` | Dijkstra de ocho vecinos desde el vano de cada salida: recorrido más largo, punto más lejano, superficie alcanzable y **zonas sin salida** agrupadas por vecindad |
| Hallazgos | `native/src/findings.c` | Salidas, recorrido, zonas sin salida, aforo y ancho, con la gravedad, el título, el detalle, los elementos y el punto del plano |
| Catálogo | `native/src/library.c` | Las **395** señalizaciones locales (332 ISO 7010 + 63 propias), el tipo del editor ↔ el código, la validación del SVG y el `<svg>` anidado |
| Señalización | `native/src/signage.c` | Salida sin pictograma cerca, falta de «usted está aquí» y falta de señalización contra incendios |
| Primeros auxilios | `native/src/firstaid.c` | Botiquín, camilla y DEA: recuento y alcance medido sobre la rejilla |
| Extintores | `native/src/extinguisher.c` | Tablas NTC 2885 / NFPA 10 y Resolución 2400: recorrido por clase y riesgo, área por número de A, cobertura por recorrido real y zonas descubiertas con su motivo |
| Camino | `native/src/grid.c` (`norma_grid_path`) | Dijkstra de ocho vecinos sobre la rejilla, sin cortar esquinas, con el exterior permitido o no según el tramo; puntos simplificados por línea de vista y longitud en metros redondeada al centímetro |
| Simulacro | `native/src/drill.c` | Tiempo objetivo por ruta (reacción + camino + tramo al punto de encuentro), objetivo del piso, tiempo medido y su diferencia; tres hallazgos propios |
| Programa | `native/src/cli.c` | `norma-core --audit plano.json` incluye salidas, recorrido, señalización, primeros auxilios, simulacro y hallazgos; `--sign-board hoja.svg` dibuja el catálogo completo |
| Objetos | `native/include/normia/object.h`, `native/src/object.c` | Los once objetos insertables —tres puertas, extintor, botiquín, camilla, DEA, punto de encuentro, E001, E007 y «usted está aquí»— con su tamaño al nacer, si apoyan sobre el muro y si son puertas |
| Puertas y equipos en el SVG | `native/src/svg.c` | `write_door()` dibuja jambas, umbral discontinuo, hoja y arco (y el portón, su panel); `write_box_object()` pone el pictograma del catálogo o, si no lo encuentra, una caja con su rótulo |
| Insertar en la ventana | `native/macos/AppDelegate.m` · `CanvasView.m` | Menú **Insertar** con `⌃`, un clic para colocar, arrastre del objeto entero y `⌘⇧O` para marcar o desmarcar una salida |
| Pruebas | `native/tests/test_audit.c` · `test_signs.c` · `test_extinguishers.c` | **67/67**, **30/30** y **32/32** (documento **33/33**, ventana **80/80**) |
| Paridad | `native/tests/parity.mjs` | **64/64** |

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

#### Señalización y primeros auxilios (2026-11-05)

La biblioteca nativa lee los **mismos dos catálogos** que la edición web —332
pictogramas ISO 7010 y 63 señales propias de orientación, servicios, tránsito y
brigada— y los usa para tres cosas: resolver el tipo del editor a su código
(`iso_e002` → `E002`, `sig_aqui` → `SVC_AQUI`), validar el SVG con las mismas
reglas de seguridad y **dibujar el pictograma real** dentro del plano exportado.
No se copió ningún trazo al código: el catálogo se lee del archivo local, así que
una señal nueva entra en las dos ediciones sin recompilar.

`norma-core --sign-board hoja.svg` compone una hoja con **las 395** señalizaciones
dibujadas con el mismo código de inserción que usa la exportación del plano: es la
forma de comprobar de un vistazo que no falta ninguna.

Los hallazgos nuevos, con los umbrales de `resources/audit-criteria.json`:

| Hallazgo | Gravedad | Criterio de la app |
| --- | --- | --- |
| `exit_without_sign` | baja | Ninguna señal E001/E002 a menos de **1,50 m** del centro de la salida marcada |
| `no_you_are_here` | baja | Falta el marcador `SVC_AQUI` (`signs.youAreHereCode`) |
| `no_fire_sign` | informativa | No hay ningún pictograma F001, F002 ni F005 |
| `no_first_aid_kit` | media | El piso no tiene ningún botiquín dibujado |
| `first_aid_kit_far` | media | El punto más lejano del espacio libre queda a más de **30 m** del botiquín más cercano |
| `no_stretcher` | media | No hay camilla y el criterio pide una por piso |
| `no_aed` | media si la afluencia calculada llega a **500** personas, baja si no | No hay DEA dibujado |
| `aed_far` | baja | El punto más lejano queda a más de **100 m** del DEA |

Las distancias se miden **en línea recta** desde el centro de cada celda libre hasta
el centro del recurso, igual que en la edición web: sirven para saber si un recurso
está al alcance, no para simular una carrera. El detalle del hallazgo de primeros
auxilios usa **un decimal** (67,1 m) porque así lo escribe la edición web; el resto
del auditor usa dos.

Lo que el plano **no** puede afirmar, y el texto del hallazgo dice: no comprueba el
contenido del botiquín ni su vigencia, ni la carga del DEA, ni el mantenimiento del
equipo. Los umbrales son criterios configurables de la aplicación, con las normas a
la vista (ISO 7010 y NTC 1461 para el pictograma; Ley 1831 de 2017 y Resolución
3316 de 2019 para el DEA), y no un dictamen de cumplimiento.

#### Extintores (2026-11-05)

El cálculo de extintores entra completo en el núcleo, con las **dos columnas
normativas juntas**: Colombia · **NTC 2885:2009 + Resolución 2400 de 1979** (arts.
220-224) e internacional · **NFPA 10**. Las tablas se leen de
`resources/extinguisher-criteria.json`, igual que en la web, y el perfil y el
riesgo se declaran en el plano.

| Hallazgo | Gravedad | Criterio |
| --- | --- | --- |
| `ext_missing` | informativa | No hay ningún extintor dibujado |
| `ext_ratio_short` | media | La Resolución 2400 (art. 221) pide 1 por cada 200 m² de local o fracción |
| `ext_travel_too_long` | alta si la cobertura baja del 80 %, media si no | Superficie a la que no llega ningún equipo dentro de su distancia máxima |
| `ext_coverage_gap` | alta si la cobertura baja del 80 %, media si no | La superficie que alcanza el recorrido supera la que admite el rótulo |
| `ext_class_gap` | media | El equipo más cercano no declara una clase de fuego aplicable |
| `ext_no_class_a` | media | Ningún equipo con Clase A (`2-A` o superior) en un piso de 20 m² o más |
| `ext_wrong_class` | media | El rótulo declara una clase que el agente no cubre |
| `ext_without_sign` | baja | Ninguna señal F001 a menos de 1,50 m del equipo |
| `ext_height` | baja | La parte superior pasa de 1,53 m (18,14 kg o menos) o de 1,07 m (más pesado) |
| `ext_obsolete_rating` | informativa | Rótulos 4, 6, 8, 12 o 16-B, que la NFPA 10:2007 (4.4) ya no reconoce |

El recorrido **no es una línea recta**: se propaga por la rejilla con ocho vecinos,
igual que la evacuación, y el límite sale de la clase de fuego y del riesgo
(`5-A`/`20-B` no se comportan igual en riesgo leve que en extra). El área se asigna
primero al equipo más cercano que llegue y, si esa área pasa de lo que admite su
número de A, se conservan las celdas más cercanas y el resto queda descubierto: es
lo que haría una revisión con la tabla en la mano.

En la nave de prueba (40 × 30 m, tres equipos distintos) la cobertura es de
**874,6 m² de 1 037,9 m² (84,3 %)** y salen los mismos seis hallazgos que en PHP,
con el mismo texto. En el piso de 20 × 20 m con un solo `1-A`, el límite que se
incumple es el área (**139,4 m²** asignados de 384,3 m²) y el hallazgo lo dice así.

Lo que este cálculo **no** afirma: no comprueba si el extintor existe, está
cargado, vigente, rotulado ni accesible; no mide la altura real en obra ni la
distancia de recorrido con obstáculos que no estén dibujados. Es un apoyo de
diseño, y así se rotula.

#### Acciones cuantificadas de extintores (2026-11-05)

Decir «falta cobertura» no basta: el núcleo devuelve también **qué hacer y cuánta
superficie ganaría**, midiendo la ganancia con el mismo motor, no estimándola.
Publica hasta cuatro acciones en `extinguishers.recommendations`, ordenadas de
mayor a menor ganancia:

| Acción | Qué propone | Cómo se mide la ganancia |
| --- | --- | --- |
| `add` | Instalar otro equipo en el punto más desfavorable de la zona descubierta | Se añade un equipo de referencia del agente que cubra Clase A y se vuelve a medir la cobertura entera |
| `move` | Llevar el equipo más cercano (los dos primeros) a ese punto | Se reubica ese equipo y se vuelve a medir |
| `upgrade` | Subir la clasificación cuando el límite que falla es el área del rótulo | Se cambia el rótulo y la capacidad por el siguiente ejemplo de la tabla y se vuelve a medir |

Cada acción trae `action`, `elementId`, `title`, `detail` en español con la cifra,
`target` (el punto al que iría), `type`, `agent`, `rating`, `capacityLb`, el
`element` completo listo para dibujarlo en el lienzo, `gainAreaM2` y `gainPct`
(qué parte de la zona descubierta se recupera). La simulación se corta con el
mismo presupuesto que la web (celdas × equipos ≤ 900 000) para que un plano
enorme no congele la ventana.

En la nave de prueba la acción es **añadir un `2-A:10-B:C` de 10 lb** (+62,2 m²);
en el piso con los tres equipos apilados en un rincón, **reubicar** el más
cercano gana **153,2 m²** y el segundo **104,7 m²**, más que instalar otro
(+68,5 m²). Esas cifras coinciden al decimal con `ExtinguisherCoverage::analyze()`
en PHP (bloque 4f de `parity.mjs`).

Lo que estas acciones **no** afirman: no dicen qué equipo comprar ni si la placa
real del extintor corresponde al rótulo que se le escribió —el texto de
`upgrade` lo pide confirmar—, no sustituyen la revisión en sitio y no certifican
cumplimiento de la NTC 2885 ni de la NFPA 10.

#### Escenarios de ocupación temporal (2026-11-05)

Un piso tiene un aforo y un ancho de salida; un evento —una capacitación en la
bodega, el montaje de una feria, la hora pico de una cafetería— mete más gente en
el mismo plano y el cálculo del uso habitual deja de servir. El núcleo revisa los
escenarios que el plano declare en `canvas.scenarios` **sin tocar el aforo del
piso**: la ocupación declarada, el aforo permitido y el tiempo habitual siguen
igual, porque son dos preguntas distintas.

| Cifra del escenario | Fórmula |
| --- | --- |
| Capacidad | superficie libre × densidad de referencia del piso |
| Exceso | personas del escenario − capacidad |
| Ancho exigido | personas × milímetros por persona del criterio |
| Tiempo estimado | marcha del piso + cola con el ancho útil disponible |

| Hallazgo | Gravedad | Cuándo |
| --- | --- | --- |
| `scenario_over_capacity` | media | El escenario declara más personas de las que admite la superficie libre |
| `scenario_width_short` | media | El ancho útil de las salidas marcadas no alcanza para esas personas |
| `scenario_more` | informativa | Se revisaron más de cuatro escenarios y alguno se pasa: el informe corto muestra los cuatro más exigentes |

Los hallazgos de escenarios coinciden **palabra por palabra** con
`OccupancyScenarios::analyze()` en dos pisos de prueba (tres y seis escenarios),
incluido el aviso `scenario_more` y el orden de los eventos por número de
personas. Lo que no hace: no aprueba el evento, no verifica el permiso, la
sillería ni las tarimas, ni la ocupación real en la puerta.

#### Rutas de evacuación dibujadas (2026-11-05)

El auditor nativo lee los trazos de la herramienta Ruta y los mide como la web:
**la medida declarada manda; si no hay, el trazo dibujado** (NORMIA-006 §6.1), con
los arcos resueltos, no la cuerda entre extremos. De cada ruta informa la
longitud y su fuente (`measured` o `geometry`), si termina en una salida marcada
(tolerancia de **80 cm**), a cuánto queda del vano más cercano y cuántas veces
cruza un muro fuera de un vano.

| Hallazgo | Gravedad | Cuándo |
| --- | --- | --- |
| `no_route` | media | El plano no tiene ninguna ruta de evacuación dibujada |
| `route_no_exit` | media | El final de la ruta queda lejos de la salida marcada más cercana |
| `route_through_wall` | alta | El trazado cruza un muro fuera de un vano: por ahí no pasa nadie |

En la nave de prueba, la ruta que llega a la salida mide **28,87 m** sin cruces, y
la que se queda corta queda a **4,61 m** del vano y cruza el muro una vez; los dos
hallazgos y el informe de rutas coinciden al decimal con `PlanAudit::analyze()`.

### La herramienta de dibujo de rutas

La ruta también se dibuja en la ventana nativa, con el mismo gesto que la pluma:
tecla **`R`**, un clic por nodo, `Enter` o doble clic cierra el trazo y
`Retroceso` quita el último nodo. Se guarda como elemento de tipo `route` con su
identificador (`ruta_7`) y su grosor, así que el auditor del núcleo la mide igual
que si viniera de la edición web —con sus arcos, no con la cuerda—. En pantalla
va en **verde de evacuación**, con **punta de flecha** en el sentido de salida y
la longitud rotulada junto al extremo, con la misma cifra que dará el informe.

La herramienta se comprueba donde se puede comprobar aquí, sobre el código
fuente (`native/tests/macos.mjs`, **80/80**); dibujarla con el ratón en un Mac es
lo que sigue viendo una persona.

### El cajón de revisión, dentro de la ventana

La ventana ya **muestra** el auditor: **⌘R** (menú Ver › Revisar plano) abre un
cajón a la derecha con la lista de hallazgos —icono por gravedad, título y
detalle—, el resumen del plano (personas, superficie libre, salidas, recorrido más
largo) y un botón **Ver en el plano** que centra y acerca el lienzo en el punto del
hallazgo elegido. Cada hallazgo con punto se dibuja además como un **anillo rojo**
sobre el plano.

El cajón **no calcula**: llama a `norma_inspect_document()`, la misma receta que el
programa expone como `norma-core --inspect plano.json`. Así la lista de la ventana
y la del informe web salen de un solo sitio; el bloque 4i de `parity.mjs` compara
las dos listas completas, campo por campo, contra `PlanAudit::analyze()`.

Dos reglas que se ven en pantalla:

1. **Editar invalida**. Cualquier cambio en el plano deja la revisión vieja: el
   cajón lo dice («El plano cambió») y no muestra cifras que ya no son ciertas.
2. **Lo que falta se dice**. Si el paquete no encuentra el catálogo de
   señalización o las tablas de extintores, el cajón lo escribe y sigue midiendo;
   no inventa códigos ni umbrales.

Los catálogos viajan dentro del `.app` (`Contents/Resources/resources`), así que la
revisión funciona **sin red y sin instalar nada**.

#### El simulacro (2026-11-05)

El informe de la web separa dos tiempos que casi nunca son el mismo: el
**objetivo**, que se calcula con el plano, y el **medido**, que se anota con
cronómetro después del ejercicio. El núcleo nativo hace lo mismo, y por eso el
simulacro no duplica el motor de la web: reutiliza la rejilla y las rutas que ya
existían.

**El camino se camina, no se mide en línea recta.** `norma_grid_path()` busca el
recorrido más corto sobre las mismas celdas de 20 cm del aforo, con los ocho
vecinos de siempre, sin cortar esquinas en diagonal y con los muros descontados.
Los puntos se simplifican por línea de vista (paso de 0,4 celdas) y la longitud se
redondea al centímetro antes de dividir por la velocidad (1 m/s por omisión), que
es exactamente lo que hace `EvacuationDrill` en PHP: **el resultado coincide al
decimal**, no solo en el orden de magnitud.

Para cada ruta del plano:

1. Se toma el **inicio del trazo** dibujado y se busca la **salida marcada más
   cercana a su final**; el recorrido termina en el centro del hueco de esa salida
   (`y + h`), no en el centro de la caja.
2. Se suma el **camino caminable** por dentro del piso. Si no hay camino —el
   inicio está en un cuarto sin vano o fuera del espacio libre—, la ruta no tiene
   simulación y se avisa.
3. Si el plano tiene **punto de encuentro**, se añade el tramo desde la salida
   hasta él, ya por fuera del piso. Manda el objeto `cad_emg_meeting`; si no está,
   vale la señal **E007** del catálogo, resuelta por tipo como cualquier otro
   pictograma.
4. `llegada = reacción + camino / velocidad`. El **objetivo del piso** es la ruta
   más lenta, porque el plan no está bien si hay que esperar a los últimos.

La reacción y el cronómetro se declaran en el documento, dentro de
`canvas.drill`, y solo se guarda lo que no es el valor por omisión:

```json
"canvas": { "drill": { "reactionS": 45, "measuredS": 95 } }
```

`reactionS` vale **30 s** si no se declara. `measuredS` no se calcula nunca: es lo
que se cronometró en el edificio, y sin él no hay comparación. La diferencia se
informa aparte (`differenceS`) y en ningún caso se mezcla con el objetivo.

`norma-core --audit` lo publica en el bloque `drill`:

```json
"drill": {
  "reactionS": 45, "speedMps": 1, "targetS": 77.8, "targetSource": "meeting",
  "measuredS": 95, "differenceS": 17.2,
  "meeting": { "found": true, "source": "object", "position": { "x": 4230, "y": 1530 } },
  "routes": [{ "id": "ruta1", "label": "Ruta norte", "lengthM": 28.87,
               "endsAtExit": true, "exitId": "salida", "pathM": 32.75, "walkS": 32.8,
               "meetingM": 3.81, "transferS": 3.8, "arrivalS": 77.8,
               "targetSource": "meeting", "path": [{ "x": 330, "y": 300 }, "…"] }],
  "notice": "…"
}
```

`targetSource` dice con qué se calculó el objetivo (`exit` o `meeting`), y
`meeting.source` de dónde salió el punto (`object`, `sign` o `none`). El reloj se
escribe como se lee en voz alta —`1 min 18 s`— con `norma_drill_clock()`.

Tres hallazgos nuevos, que `--inspect` y la ventana suman a los demás:

| Hallazgo | Gravedad | Cuándo |
| --- | --- | --- |
| `no_meeting_point` | baja | El piso tiene rutas pero ningún punto de encuentro (ni objeto ni E007): el simulacro termina en la salida y el tramo de reunión no se puede medir |
| `drill_route_blocked` | media | El inicio de una ruta no se puede conectar con su salida sin cruzar un muro; el hallazgo cita la ruta |
| `drill_slower_than_target` | baja | El tiempo medido supera el objetivo en más de **1 s**; el valor del hallazgo es el objetivo en minutos, para poder compararlo |

Lo que el simulacro **no** hace, y conviene decirlo: no mueve figuras —eso es la
animación de la web—, no simula aglomeraciones ni colas en la puerta, no mide un
ejercicio real y no reemplaza el tiempo que se toma en sitio. Da el número que el
plano permite defender, para contrastarlo con el cronómetro.

### El menú Insertar: puertas, equipos y señales en el lienzo (2026-11-06)

Hasta aquí el lienzo nativo sabía dibujar trazos —muro, pluma, arco, cota y
ruta— pero no **colocar** lo que un plano de evacuación necesita: puertas, un
extintor, un botiquín, una camilla, un DEA, el punto de encuentro y las señales.
Los objetos se insertaban solo en la web.

Lo primero fue no copiar la lista en el menú. El catálogo vive en el núcleo
(`native/include/normia/object.h`) y la ventana lo recorre con
`norma_object_at()`: si mañana se añade un objeto al núcleo, aparece en el menú
sin tocar AppKit. Son once, y el orden es el del uso: **puertas** (`door`,
`door_double`, `door_garage`), **equipos** (extintor, botiquín, camilla, DEA,
punto de encuentro) y **señales** (`iso_e001`, `iso_e007`, `sig_aqui`).

Dos decisiones que no son cosméticas:

- **Dónde nace la caja.** Una puerta apoya sobre el muro: su caja nace con la
  línea del muro en el borde inferior (`y + h`), que es el punto por el que se
  sale y desde el que `travel.c` siembra el recorrido. Un equipo o una señal se
  centran en el clic (`x + w/2`, `y + h/2`), que es de donde mide el auditor.
  Colocarlos al revés movía las cifras del recorrido sin que se notara.
- **Atajos con `⌃`.** El lienzo usa letras sueltas (`M · P · A · D · R`) y `⌥`
  produce caracteres muertos en un teclado en español; con `⌃` el menú no pisa
  ninguna herramienta.

En el plano, la puerta ya no es un marcador genérico: se dibuja con **jambas,
umbral discontinuo, hoja y arco de apertura**, con las mismas proporciones que
`SvgExporter::doorMarkup()`, y el portón con su panel y sus barrotes. Un equipo o
una señal lleva su **pictograma** (cruz del botiquín, camilla, rayo del DEA,
flechas del punto de encuentro, extintor) y el color de su familia; los equipos
de una sola caja se rotulan con su ancho y la unidad del plano.

La **exportación a SVG** dibuja lo mismo —`write_door()` y `write_box_object()`—
para que la ventana y el archivo no cuenten cosas distintas. Y una señal que no
esté en el catálogo ahora se dibuja como **caja con su rótulo** en vez de
desaparecer: una prueba que exigía el marcador genérico se reescribió para exigir
justo eso.

Lo que cierra de la etapa anterior: la deuda que N3 dejó abierta era «pintar los
pictogramas del catálogo en el lienzo». Los equipos del menú ya se pintan. Lo que
sigue fuera se dice abajo.

### Lo que N3 todavía no tiene

- **El catálogo entero no está en el menú.** La web ofrece 422 objetos y la
  ventana once; añadir los demás es repetir el patrón, no inventar nada, pero
  hoy no está.
- **Escalar, rotar y renombrar un objeto** desde el lienzo: se coloca, se mueve y
  se marca la salida, y nada más.

El **simulacro** también está: DEC-14 se revisó el mismo 2026-11-05, cuando el
autor pidió llevarlo al núcleo. No hubo que duplicar motor, porque la rejilla ya
sabía buscar el camino: `norma_grid_path()` recorre el espacio libre con los
vecinos de siempre y el simulacro solo suma tramos. Lo que **no** entra en la
ventana es la puesta en escena: las figuras moviéndose en modo presentación
siguen en la web. Ver «El simulacro» más abajo.

## 15. Etapa N4(a), hecha: el catálogo completo y el paquete de macOS 12

La ventana nativa insertaba once objetos escogidos a mano. La web ofrece **820**:
las 395 señales de los dos catálogos y los 422 objetos CAD. Esta etapa cierra esa
diferencia y, de paso, produce el paquete que se puede instalar en un Mac con
Monterey.

### El catálogo completo, en el núcleo

El catálogo **no se copia al código**. `norma_object_catalog_load()` lee en tiempo
de ejecución los mismos tres archivos que usa la edición web
(`cad-objects.json`, `iso7010-catalog.json` y `service-signs.json`) con el lector
de JSON del propio núcleo, y arma una lista de 820 piezas:

| Grupo | Cuántas | De dónde | Nace con |
| --- | --- | --- | --- |
| Puertas | 3 | escritas en C: no son un pictograma, las dibuja `write_door()` | 90 × 90, 120 × 60 y 160 × 50 cm, apoyadas en el muro |
| Objetos CAD | 422 | `resources/cad-objects.json`, con su color y su `<svg>` | 90 × 90 cm |
| Señales | 395 | 332 ISO 7010 + 63 propias, con el color de su familia | 64 × 64 cm |

Cada pieza guarda **tipo, nombre, familia, rótulo de familia, color y el
pictograma tal cual viene del catálogo**. Nada se reescribe: el mismo `<svg>` que
inserta la web es el que se anida en el plano exportado
(`norma_library_nested_svg_text`). Las **41 familias** son las de los catálogos:
puertas, las 31 categorías CAD y las 9 de señalización, con su rótulo en español.

Tres consecuencias que importan más de lo que parece:

- **El tipo más largo ya cabe.** `cad_acc_accessible_lift` mide 24 caracteres y el
  elemento guardaba 23: se cortaba en silencio y el objeto no se podía colocar.
  Ahora el documento reserva 48 bytes para el tipo, y hay una prueba que lo fija.
- **Un plano con cualquier objeto se guarda y se vuelve a abrir entero**: la
  prueba de ida y vuelta usa justo ese tipo de 24 caracteres.
- **Sin catálogos al lado no se rompe nada**: quedan las once piezas de respaldo y
  la ventana lo dice en el menú. Sirve para `--check`, para un plano suelto y para
  compilar el núcleo en un equipo sin la carpeta `resources/`.

El programa de línea de órdenes gana `norma-core --objects`, que publica el
catálogo en JSON (familias y piezas): es lo que permite comprobar desde fuera que
el menú, el núcleo y la web cuentan lo mismo.

### En la ventana: 41 submenús y un buscador

Con 820 piezas, una lista plana no se recorre. El menú **Insertar** se arma
recorriendo el catálogo del núcleo: las tres puertas arriba con `⌃U`, `⌃U` y `⌃G`,
y **un submenú por familia** con su rótulo y su cuenta («Respuesta contra
incendios (30)»). Para lo que no se busca en un menú está **Buscar en el
catálogo…** (`⌘⇧I`): una hoja de AppKit —campo de búsqueda, tabla, Insertar y
Cancelar— que filtra las 820 por nombre, familia y tipo **sin tildes ni
mayúsculas** (`botiquin` encuentra «Botiquín»).

El lienzo pinta cada pieza con el color de su familia y su nombre; los equipos de
emergencia conservan su pictograma dibujado a mano con Core Graphics, y el SVG y el
PDF salen con el pictograma real del catálogo.

### El trabajo que arma la app de Monterey

`.github/workflows/dist-nativo.yml` (**App nativa de macOS (Monterey)**) compila la
aplicación **universal** —`make -C native/macos ARCHS="x86_64 arm64"`— y la enlaza
con `-mmacosx-version-min=12.0`. Es un solo paso de clang por fuente, así que las
dos arquitecturas salen del mismo comando; después el trabajo comprueba, con
`lipo -archs` y `otool -l -arch` para cada una, que el Mach-O pide **12.0** y que
el `Info.plist` dice lo mismo. Firma en modo ad-hoc (`codesign --force --deep
--sign -`), arranca el binario con `--check` y `--objects` —las dos órdenes
terminan solas: la segunda cuenta el catálogo que quedó **dentro** del `.app`— y
publica el ZIP con su SHA-256 como artefacto
(`NormiaEstudio-nativo-macos12-universal`, con el `.sha256` al lado); con una
etiqueta `v*`, se adjunta a la release.

Para generarlo a mano: *Actions › App nativa de macOS (Monterey) › Run workflow*
(la versión mínima de macOS se puede escribir en el campo `deployment`; por
omisión `12.0`). Desde la terminal, lo mismo:

```sh
make -C native/macos ARCHS="x86_64 arm64" DEPLOYMENT=12.0
lipo -archs native/macos/build/NormiaEstudio.app/Contents/MacOS/NormiaEstudio
ditto -c -k --sequesterRsrc --keepParent native/macos/build/NormiaEstudio.app \
  NormiaEstudio-nativo-macos12-universal.zip
```

Lo que esto **no** es: no hay certificado de Apple, así que Gatekeeper avisa la
primera vez; no hay notarización; y la prueba en un Mac con Monterey de verdad
sigue pendiente de una persona con el equipo delante.

## 16. Etapa N4(b), hecha: la ventana como un CAD (2026-11-08)

La captura de referencia no pedía «más botones»: pedía la **maqueta** de un CAD y
las herramientas del editor web. Eso es lo que hay ahora en `native/macos/`.

### El reparto de la ventana

```
┌──────────────────────────────────────────────────────────────────────┐
│ NORMIA  [iconos de las doce herramientas]      Buscar  Revisar  SVG  │  tira superior
├────────────┬─────────────────────────────────────┬───────────────────┤
│ CONJUNTOS  │                                     │ CAPAS             │
│   DE       │              lienzo                 │  [capa activa ▾]  │
│ HERRAMIEN- │        (Core Graphics, sin WebView) │  [nueva capa  ＋] │
│   TAS      │                                     │ ELEMENTO          │
│ Dibujo     │                                     │  X · Y            │
│ Modificar  │                                     │  ancho · alto     │
│ Texto      │                                     │  giro · grosor    │
│ Acotación  │                                     │  color · rótulo   │
│ Rutas      │                                     │  capa             │
│ Entorno    │                                     │  Duplicar Borrar  │
│ Biblioteca │                                     │  Salida           │
│  Señales   │                                     │ MAQUETA DE TRAZO  │
│  Equipos   │                                     │  opacidad · quitar │
├────────────┴─────────────────────────────────────┴───────────────────┤
│ Comando: muro · linea · capa <nombre> · zoom <n> · ayuda            │
├──────────────────────────────────────────────────────────────────────┤
│ [Modelo│Hoja A4]  X 420 · Y 297 cm      aviso       1:100 · 100 %   │
└──────────────────────────────────────────────────────────────────────┘
```

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Paleta | `ToolRail.m` | Ocho grupos con rótulo y sus botones; la herramienta armada se queda marcada, venga del botón, del menú, de la tecla o del comando |
| Inspector | `InspectorPanel.m` | Capas y ficha del elemento; cada campo llama al núcleo y, si el núcleo rechaza el valor, el campo vuelve a lo que el documento dice |
| Lienzo | `CanvasView.m` | Selección con tiradores de esquina, mano, figuras, texto, entorno, flechas y `⌘D` |
| Ventana | `AppDelegate.m` | Reparto de paneles, tira de iconos, línea de comando, barra de estado y menú Herramientas |
| Tema | `AppDelegate.m` | Apariencia oscura del sistema (`NSAppearanceNameDarkAqua`), como la captura de AutoCAD, con la hoja A4 en blanco sobre el espacio de trabajo |

### Las herramientas, una por una

Las mismas del editor web (`app/Views/editor/index.php`, `data-tool`):

| Web | Nativa | Cómo |
| --- | --- | --- |
| `select` | Seleccionar | `V`; arrastrar mueve nodo, trazo o caja; las esquinas escalan |
| `hand` | Mano | `H`; arrastra el lienzo |
| `wall` | Muro | `M`; **pincel de nodos**: un clic por vértice, el primer nodo cierra el recinto (N5) |
| `line` | Línea | `L`; dos clics |
| `rect` | Rectángulo | `B`; dos esquinas |
| `ellipse` | Elipse | `O`; dos esquinas |
| `text` | Texto | `T`; un clic y se escribe en el inspector (`⌘L`) |
| `dimension` | Cota | `D`; dos clics, cifra del núcleo |
| `route` | Ruta de evacuación | `R`; un clic por nodo |
| `door` / `door_double` / `door_garage` | Insertar del catálogo | `⌃U`, `⌃⇧U`, `⌃G`, menú Insertar o `⌘⇧I` |
| `road` | Vía | `E`; dos esquinas, zona con eje discontinuo |
| `sidewalk` | Andén | `N`; dos esquinas |
| `crosswalk` | Paso peatonal | `C`; dos esquinas con franjas |
| `parking` | Parqueadero | `K`; dos esquinas y su «P» |
| `property` | Lindero | `J`; tramo discontinuo |
| `pipe` | Tubería | `Q`; tramo azul |
| `conduit` | Canaleta | `W`; tramo naranja |

La pluma (`P`) y el arco (`A`) del CAD siguen ahí. El catálogo completo sigue en
el menú Insertar y en el buscador.

### Lo que el núcleo aprendió

- `norma_document_set_box`, `set_rotation`, `set_stroke`, `set_colour`,
  `set_label`, `set_layer` y `set_current_layer`: el inspector no escribe el
  modelo a mano. `set_colour` solo acepta `#rrggbb` y el giro se normaliza a
  0–360; las funciones devuelven 1 solo si algo cambió, y el inspector lo dice.
- `norma_document_add_shape` (`line`, `rect`, `ellipse`), `add_text` y
  `duplicate`.
- `norma_document_add_environment` y `norma_environment_is`: los siete oficios del
  entorno, con sus medidas de nacimiento —vía 600 × 300 cm, andén 300 × 120,
  parqueadero 250 × 500— y su SVG propio: trama de la vía, franjas del paso,
  «P» del parqueadero, lindero discontinuo, tubería y canaleta con su color.
- El sobre del plano guarda el `color` del elemento, así que un plano abierto en
  la web y en la ventana nativa conserva lo que la persona eligió.

### La línea de comando

`Comando:` abajo, con Intro. Entiende los verbos de las herramientas, `capa
<nombre>`, `zoom <n>`, `insertar <tipo>`, `duplicar`, `girar`, `borrar`,
`rejilla`, `revisar`, `ajustar`, `exportar`, `guardar`, `deshacer`, `rehacer` y
`ayuda`; sin tildes y en minúsculas. **Intro con la línea vacía repite el último
comando**, como en AutoCAD.

### Lo que se comprueba

`native/tests/macos.mjs` pasa de 80 a **111 comprobaciones** (98 en la N4, 13
más en la N5 — véase el § 17): la paleta con sus
ocho grupos, las 19 herramientas, la tira de iconos, el reparto de paneles, las
pestañas Modelo/Hoja A4 y las coordenadas, los campos del inspector y que cada
uno use su función del núcleo, los verbos de la línea de comando y su repetición,
la mano, las figuras, el texto, los tiradores, las flechas, duplicar/girar y el
entorno. `make -C native test` suma **27 comprobaciones** de entorno y figuras en
`test_document.c` (80 en total tras la N5).

Lo que sigue sin poder probarse desde este entorno: **la ventana en pantalla**. El
`.app` se compila y se arranca con `--check` en el flujo de macOS, pero el
aspecto, el ratón y el teclado los ve una persona en su Mac.

### Lo que queda de la N4

- **Windows (Win32) y Linux (GTK)**: el núcleo en C ya compila en los tres
  sistemas; lo que falta es la ventana.
- **El lienzo dibuja el nombre, no el pictograma** de los 820: el `<svg>` completo
  va al SVG y al PDF, pero un renderizador de SVG en Core Graphics es otra etapa.
- **Selección múltiple**: hoy se edita un elemento a la vez.

## 17. Etapa N5, hecha: las cinco cosas del feedback (2026-11-08)

La ventana estaba bien de diseño, pero le faltaban cosas del editor web. Este es
el repaso de las cinco, con lo que hay que saber para usarlas.

### 1. La señalización, en la paleta

El grupo **BIBLIOTECA** de la izquierda tiene ahora las dos bibliotecas del rail
web (`data-open-library="sign"` y `"cad"`), además del buscador de siempre:

| Botón | Atajo | Qué abre |
| --- | --- | --- |
| Señalización ISO 7010… | `⌃⇧S` | Solo las familias `sign:…`: ISO 7010 y señales de servicio |
| Equipos y mobiliario… | `⌃⇧E` | Solo las familias `cad:…`: equipos, mobiliario, instalaciones |
| Buscar e insertar… | `⌘⇧I` | Las 820 piezas, sin acotar |

Los atajos van con `⌃` a propósito: `⌘⇧S` ya es «Guardar como», `⌘⇧E` exporta el
SVG y `⌘⇧G` es la rejilla, y dos entradas con la misma tecla dejan una muerta.

El acotado no es una lista copiada: `NormiaCatalogPicker` recibe un
`NormiaCatalogScope` y filtra por la familia del catálogo del núcleo
(`strncmp(family, "sign", 4)` y `norma_object_is_door`), así que una señal nueva
del catálogo aparece sola. El buscador dice «12 de 395 señales» y acepta
nombres sin tildes. Lo mismo está en el menú **Insertar**, por si se prefiere el
menú a la paleta.

### 2. El inspector, como el de la web

El panel derecho sigue el orden de `assets/js/editor/inspector.js`, sección por
sección, y cada sección aparece solo cuando tiene sentido:

| Sección | Campos | Núcleo |
| --- | --- | --- |
| Capas | capa activa (desplegable) y crear capa | `set_current_layer` |
| Selección | nombre, tipo, «caja» o «trazo», capa, bloqueado | — |
| Geometría | X · Y · ancho · alto · rotación ±90° · medida declarada | `set_box`, `move_node`, `set_rotation` |
| Apariencia | paleta de 20 colores, opacidad 10–100 %, grosor, rótulo, tamaño de letra | `set_colour`, `set_opacity`, `set_stroke`, `set_label`, `set_font_size` |
| Puerta | cambiar bisagra, abrir al otro lado, salida de emergencia | `set_door_flips`, `set_exit` |
| Vía y entorno | ancho declarado en metros y carriles (1–6) | `set_width_m`, `set_lanes` |
| Red de tubería | red, diámetro, material, pendiente (%) y presión (kPa) | `set_mep` |
| Circuito eléctrico | circuito, tensión, calibre (AWG) y fases | `set_circuit` |
| Extintor | agente, capacidad, clasificación, altura de montaje, riesgo | `set_extinguisher` |
| Organización | capa del elemento y tipo de elemento (muro ↔ línea ↔ ruta ↔ cota; caja ↔ rectángulo ↔ elipse ↔ texto) | `set_layer`, `set_type` |
| Maqueta de trazo | importar, opacidad, visible, bloqueada, quitar | `set_guide*`, `clear_guide` |

Arriba, la cabecera tiene las tres acciones del héroe web: **bloquear**,
**duplicar** y **eliminar**. Un elemento bloqueado no se puede mover, escalar ni
editar: el núcleo devuelve 0 en `editable()` y la ventana lo explica en la barra
de estado en vez de fallar en silencio.

La paleta de colores es la del modelo web (`COLORS` en `assets/js/lib/model.js`),
no una inventada: el plano abierto en la web y en la ventana se ve igual.

### 3. El muro, con el pincel de la web

Antes el muro eran dos clics y una línea. Ahora es el pincel multipunto de
`PEN_TOOLS`: **un clic por vértice**, el tramo sigue al cursor y el trazo
completo se ve mientras se dibuja. Para terminar:

- **clic en el primer nodo** (se marca con un anillo verde cuando ya hay tres)
  → cierra el recinto y lo deja como polígono;
- **doble clic** o **Enter** → cierra el trazo con el último vértice;
- **Esc** → descarta el trazo en curso.

Los vértices se descartan si caen a menos de la tolerancia de pantalla del clic
anterior, para que un temblor de la mano no llene el muro de nodos de un
milímetro.

### 4. La maqueta de trazo (la imagen de fondo)

Instrucciones para quien la use:

1. **Insertar → Maqueta de trazo…** (`⌃⇧G`) o el botón *Importar imagen…* del
   inspector. Se elige el PNG, JPG, TIFF o HEIC de la planta escaneada.
2. La ventana la convierte a PNG, la guarda **dentro** del `.norma` en base64 y
   la cuadra en la hoja al **45 %** de opacidad.
3. Se calca encima: el muro, la pluma y el resto de herramientas funcionan
   igual. Con la maqueta seleccionada se arrastra para moverla y se agarra por
   las esquinas para escalarla; su marco punteado dice dónde está.
4. En el inspector se ajusta la **opacidad** (5–100 %), se **oculta** sin
   perderla o se **bloquea** para no moverla sin querer. *Quitar la maqueta* la
   borra del archivo, con confirmación.
5. La maqueta **no se imprime ni sale en el SVG**: es una ayuda de dibujo. Sí
   viaja en el archivo del plano, así que quien lo abra ve la misma guía debajo.

El tope de la imagen es 48 MB en base64 (unos 36 MB de imagen): más que eso es
una maqueta que conviene reducir antes de calcar.

### 5. Lo que aprendió el núcleo

```
norma_document_set_opacity      0,10 – 1,00
norma_document_set_font_size    2 – 400 cm
norma_document_set_door_flips   flipX (bisagra) · flipY (abatimiento)
norma_document_set_locked       y `editable()` devuelve NULL si está bloqueado
norma_document_set_type         muro/línea/ruta/cota y caja/rectángulo/elipse/texto, nunca trazo ↔ caja
norma_document_set_width_m      ancho declarado de vía, andén, paso, parqueadero y lindero
norma_document_set_extinguisher agente · clasificación · riesgo · capacidad · montaje
norma_document_set_mep          red · diámetro · material · pendiente (0–15 %) · presión (0–5000 kPa)
norma_document_set_circuit      circuito · tensión · calibre · fases (1 o 3) · carga
norma_document_set_lanes        carriles de la vía (1–6)
norma_document_set_guide        nombre · base64 · caja (opacidad inicial 45 %)
norma_document_set_guide_opacity  0,05 – 1,00
norma_document_set_guide_box      mover y escalar desde el lienzo o el inspector
norma_document_set_guide_visible  ocultar sin perder
norma_document_set_guide_locked   no moverla al dibujar
norma_document_clear_guide        borrarla del plano
```

En el sobre del plano, la maqueta va en la **raíz**, fuera de `design`:

```json
{"guide": {"name": "planta.png", "opacity": 0.45, "x": 0, "y": 0, "w": 21000, "h": 14850,
           "visible": true, "locked": false, "data": "<base64 del PNG>"},
 "design": { … }}
```

La web ignora las claves que no conoce, así que el mismo archivo abre en las dos
sin cambios. Los campos nuevos del elemento (`flipX`, `flipY`, `opacity`,
`fontSize`, `locked`, `widthM`, `lanes`, `network`, `diameter`, `material`,
`slope`, `pressure`, `circuit`, `voltage`, `gauge`, `phases`, `load`) se escriben
solo cuando valen algo distinto de lo habitual, para no engordar el JSON.

Las redes, diámetros y materiales de la ficha MEP **no están copiados en la
ventana**: `InspectorPanel` lee `resources/mep-networks.json`, el mismo archivo
que usa la web, con `NSJSONSerialization`. Al elegir una red se aplican su
diámetro, su material y su presión de referencia, como en el inspector web.

### Lo que se comprueba

`native/tests/macos.mjs` pasa de 98 a **113 comprobaciones**: las dos
bibliotecas en la paleta y en el menú, el buscador acotado por familia, las
secciones nuevas del inspector y su llamada al núcleo, la ficha de red y de
circuito con sus redes leídas del catálogo, la paleta de colores del modelo web,
el muro de nodo por nodo con cierre por el primer nodo y su trazo elástico, y la
maqueta (menú, panel de archivo, base64, opacidad, dibujo debajo de la hoja,
arrastre y bloqueo).

`make -C native test` suma **23 comprobaciones** nuevas en `test_document.c`
(`test_inspector_web` y `test_guide`): bloqueo, opacidad, tamaño de letra,
bisagra y abatimiento, conversión de tipo, ancho de vía, carriles, red de
tubería, circuito, ficha del extintor y la maqueta con ida y vuelta dentro del
sobre. En total, **83** en ese archivo.

Sigue sin poder verse **la ventana en pantalla** desde aquí: el `.app` se compila
y se arranca con `--check` en el flujo de macOS, pero el ratón, la importación
real de una imagen y el aspecto los ve una persona en su Mac.

Lo único que el inspector todavía no edita son **las curvas del trazo** (radio y
flecha de un tramo curvo) y el **veredicto del extintor**: el núcleo guarda los
arcos y calcula la cobertura en la revisión, pero no expone todavía un campo
para cambiar el radio de un tramo ni una ficha resuelta por extintor.

## 18. Etapa N7, hecha: los diseños se dibujan con su pictograma (1.31.0)

Hasta aquí, un equipo o una señal del catálogo se pintaba en la ventana como una
caja redondeada con su nombre dentro. El nombre estaba bien —son los 820 del
catálogo, no una lista inventada— pero el **diseño no se veía**: en la web cada
pieza es un `<svg>` y aquí no había nada que lo interpretara. Esta etapa trae el
intérprete y lo conecta a la pantalla, al selector y al inspector.

### 1. El intérprete, en el núcleo

`native/src/svgdraw.c` (API en `include/normia/svgdraw.h`) lee el `<svg>` tal
como viene en `resources/cad-objects.json` y `resources/iso7010-catalog.json` y
lo traduce a un **destino de dibujo** abstracto:

```c
typedef struct {
    void *user;
    void (*move_to)(void *user, double x, double y);
    void (*line_to)(void *user, double x, double y);
    void (*curve_to)(void *user, double x1, double y1, double x2, double y2, double x, double y);
    void (*close)(void *user);
    void (*paint)(void *user, const norma_svg_paint *paint); /* relleno, trazo, opacidad, raya */
    void (*push_clip)(void *user);
    void (*pop_clip)(void *user);
} norma_svg_sink;

int norma_svg_draw(const char *svg, double x, double y, double w, double h,
                   const char *colour, const norma_svg_sink *sink);
int norma_svg_drawable(const char *svg);
```

Ese corte es lo que permite dibujar en Core Graphics en la ventana y, en Linux,
**medir** el dibujo con un destino de prueba sin tener pantalla. Las
coordenadas de salida son centímetros del plano: el `viewBox` se escala a la
caja y el `stroke-width` sale ya multiplicado por esa escala.

Lo que se interpreta, que es exactamente lo que traen los catálogos:

| Grupo | Qué se atiende |
| --- | --- |
| Formas | `path` (M L H V C S Q T A Z, absoluto y relativo), `rect`, `circle`, `ellipse`, `line`, `polygon`, `polyline` |
| Estructura | `g`, `svg` anidados, `defs`, `use` con `xlink:href` y `href`, `clipPath` y `clip-path` |
| Transformaciones | `transform` con `matrix`, `translate`, `scale`, `rotate` (en el grupo o en la forma) |
| Presentación | `fill`, `stroke`, `fill-opacity`, `stroke-opacity`, `opacity`, `fill-rule`, `stroke-width`, `stroke-dasharray` y `stroke-dashoffset`, y lo mismo dentro de `style="…"` |
| Rótulo | `text` con su `x`, `y`, `font-size` y `text-anchor`, dibujado por el destino (lo usan 9 piezas: P, E, 30, PARE, SALIDA y 50) |
| Color | `#rgb`, `#rrggbb`, `none`, y `currentColor` (el color del elemento en el plano, que es lo que hace la web) |

`title`/`desc` se ignoran. De la presentación quedan fuera
`stroke-linejoin`, `stroke-linecap` y `display`, que tampoco cambian el dibujo
aquí: los catálogos no traen ningún `display:none` (solo `inline`) y las uniones
y remates redondeados o en punta de un pictograma de 20 px no se distinguen. Un
SVG enorme se corta por presupuesto (40 000 operaciones y profundidad 12) para
que un archivo mal formado no cuelgue la ventana.

### 2. La ventana

`native/macos/SvgPicture.m` es el puente, y no tiene lógica de dibujo propia:

```objc
void NormiaDrawSvgInContext(CGContextRef context, const char *svg, CGRect box, const char *colour);
NSImage *NormiaThumbnailForType(const char *type, CGFloat size);  /* 2×, caché por tipo@lado */
void NormiaClearThumbnailCache(void);
```

El destino acumula en un `CGMutablePathRef` y pinta con `CGContextAddPath` +
`CGContextFillPath`/`CGContextStrokePath`; `push_clip`/`pop_clip` guardan y
restauran el estado gráfico y `stroke-dasharray` va a `CGContextSetLineDash`.

En `CanvasView.m`, `drawObject:` busca la pieza con `norma_object_find`, y si
tiene `svg` la dibuja con el giro del elemento por la matriz de transformación
(el eje Y del lienzo va al revés que el del SVG, así que el ángulo se aplica
negado), su `opacity` y su color, y le pone el marco azul si está seleccionada.
La caja redondeada queda **solo** como respaldo de las piezas sin SVG, que son
las tres puertas porque su dibujo depende de la bisagra y del abatimiento.
`captionForObject:` deja de escribir el nombre sobre la pieza: el nombre sigue
en el globo al pasar el ratón y en el inspector, como en la web.

### 3. El selector y el inspector

El selector del catálogo (`⌘⇧I`, `⌃⇧S`, `⌃⇧E`) pinta cada fila con un
`NSTableCellView`: miniatura de 20 × 20 y, al lado, el nombre y la familia. Las
filas pasan de 22 a **24 px**. El inspector pone una miniatura de 32 × 32 en la
ficha de la pieza (`heroPreview`, esquinas de 5 px), a la izquierda del nombre,
y la oculta cuando no hay selección. Las miniaturas se rasterizan a 2× en un
`CGBitmapContext` con fondo blanco y se guardan en un diccionario, así que
recorrer la lista de 820 no vuelve a dibujarlas.

### 4. Lo que se comprueba

`native/tests/test_svgdraw.c` es nuevo y trae **29 comprobaciones** con dos
destinos: uno que cuenta operaciones y otro que rasteriza a 64 × 64 con la regla
par-impar para medir **cuánta superficie queda cubierta**. Con la cobertura se
distingue un pictograma bien dibujado de uno vacío o de un cuadrado negro.

| Grupo | Qué fija |
| --- | --- |
| Formas | el relleno es el color del SVG; el `viewBox` desplazado se centra; un círculo son cuatro curvas que llenan su caja |
| Transformaciones | `translate` + `scale` del grupo mueven y encogen; `style` trae relleno, trazo, regla y opacidad; `fill-opacity`; `currentColor`; `#fff` → `#ffffff`; el trazo sin relleno con su grosor escalado y su raya |
| Referencias | `use` con `xlink:href` y con `href`; el comando `A` describe el arco en curvas; la curva suave `T` se apoya en la anterior |
| Robustez | un texto que no es SVG no dibuja nada; un SVG sin formas tampoco; una caja de 0 × 10 se rechaza; un camino enorme se corta por presupuesto |
| Rótulo | el `<text>` llega al destino con su texto, su alineación y su cuerpo de letra ya escalado; sin `text-anchor` va a la izquierda y no pinta formas; dentro de un grupo con `transform` también llega |
| Catálogo | los **820 pictogramas producen tinta**: 817 con SVG y las 3 puertas a mano, **4 794 rellenos**, **26 366 curvas** y **9 rótulos**; la señal de salida llena su caja (cobertura > 0,85) y una de prohibición tiene el aro con hueco (0,15–0,9) |

`native/tests/macos.mjs` pasa de 113 a **121 comprobaciones**, con ocho nuevas:
el intérprete en `SOURCES` y sus formas, la ventana dibujando el pictograma con
giro y opacidad, el nombre solo en las piezas sin SVG, la miniatura en el
selector y en el inspector, las pruebas del intérprete y el rótulo de dentro del
SVG. `make -C native test` pasa a **23 · 83 · 31 · 67 · 30 · 32 · 26 · 29**.

### 5. Dos fallos que solo se ven comparando

Al terminar, cada pictograma se dibujó también en Linux con un destino que
vuelca a un mapa de bits y se comparó, uno a uno, con la referencia del mismo
SVG. De los 754 pictogramas que se pudieron comparar salieron dos fallos del
intérprete que no se veían de otra forma:

1. **La repetición de un comando de `path` perdía si era relativo.** En
   `c 0-58 47-105 105-105 0-58 …` el segundo juego de números se leía como
   absoluto, así que el arco se disparaba fuera de la caja. El caso de la señal
   de prohibición lo dejaba en un cuadrado rojo. Se guarda la letra tal como
   viene, no su mayúscula.
2. **Una figura sin relleno ni trazo se pegaba a la siguiente.** SVG pide que un
   `fill:none` con `stroke:none` no pinte nada, y el intérprete se lo callaba al
   destino; el camino quedaba acumulado y la figura siguiente salía manchada de
   más (era el caso de la señal de salida, con un fondo que no es suyo). Ahora
   `paint` llega siempre y el destino vacía el camino.

Tras las dos correcciones, la comparación bajó de 420 a 151 pictogramas con más
de un 10 % de píxeles distintos, y la diferencia media de un 17,7 % a un 6,6 %.
Lo que queda es antialiasing, grosores de trazo de menos de un píxel y las
uniones redondeadas, que el volcado de prueba aproxima y Core Graphics no.

### 6. Lo que sigue sin poder verse desde aquí

La comparación de arriba se hizo en Linux con dos piezas fuera del repositorio:
un destino que vuelca el dibujo a un PPM y `@resvg/resvg-js` (Rust) como
referencia, instalado aparte y sin entrar en el paquete. No hay `rsvg-convert`
ni `cairosvg` en la imagen, y ImageMagick sin ellos no rasteriza SVG, así que
esa comparación **no está en las pruebas del repositorio**: la que sí queda es
la cobertura del destino de prueba, que no necesita nada instalado.

El aspecto final —que el pictograma no salga girado, que el rótulo quede dentro
del aro, que la miniatura se lea a 20 px— lo mira una persona en su Mac, donde
el flujo compila y arranca el `.app`.

### 7. La entrega

La etiqueta `v1.31.0` (commit `8f4e667`) salió con la release
[v1.31.0](https://github.com/luan920530-commits/normia-planos-cad/releases/tag/v1.31.0)
publicada y con todos sus adjuntos: el `NormiaEstudio-nativo-macos12-universal-1.31.0.zip`
con su `.sha256` y las demás ediciones —macOS (`.dmg`, `.pkg`, `.zip`), Linux,
Windows (`.zip` e instaladores), Android— con sus `SHA256SUMS.txt`. El trabajo
macOS arm64 de «Distribución de escritorio» volvió a caer en el paso `spc craft`
y un reintento lo sacó adelante; el paso ahora reintenta tres veces con espera
creciente (commit `ff6eb1c`) para no volver a dejar la release sin `.pkg` ni
`.exe`. Las notas se guardan en `docs/NOTAS-v1.31.0.md` y se aplican con
`gh release edit`, porque los flujos que traían `body:` se pisaban entre sí.
