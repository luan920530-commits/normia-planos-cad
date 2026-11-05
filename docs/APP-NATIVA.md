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
| `native/tests/parity.mjs` | paridad C contra PHP, dígito a dígito | **12/12** |
| `native/tests/macos.mjs` | contrato de la ventana: AppKit, sin WebView, menú en español, atajos, sobre oficial, macOS 12 | **21/21** |

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
