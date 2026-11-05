# Normia nativo · núcleo en C

El comienzo de la aplicación **100 % nativa**, sin Electron y sin navegador por
medio. Este directorio es la etapa **N0**: el motor de cálculo y el lector del
plano, en C11, sin dependencias, compilando en macOS, Linux y Windows.

Están la **N0** (motor y paridad con PHP), la **N1** (documento editable y la
ventana nativa de macOS con su lienzo, sin WebView) y la **N2**: cotas, pluma de
nodos, arcos, exportación SVG desde el núcleo, **recientes**, **impresión** y
**PDF**. De la **N3** ya están la **rejilla de cálculo y aforo**, las **salidas**, los
**recorridos**, los **hallazgos de evacuación**, la **señalización** (con las 395
señales del catálogo local), los **primeros auxilios** y los **extintores** (con las
**acciones cuantificadas**: añadir, reubicar o subir el rótulo, con la ganancia
medida otra vez por el motor), los **escenarios de ocupación temporal** y las
**rutas** (longitud, llegada a la salida y cruces de muro), todos con paridad
contra PHP, y la **herramienta de dibujo de rutas** en el lienzo (`R`).
Lo que todavía no hay: los pictogramas pintados en el lienzo y Windows y Linux (N4). El **simulacro** no entra en
la edición nativa por decisión del autor (DEC-14): se queda en la web. El alcance completo
está en [`docs/APP-NATIVA.md`](../docs/APP-NATIVA.md).

## Por qué se empieza por el núcleo

El motor es lo único que no se puede reescribir «a ojo»: si la versión nativa
calcula distinto, los planos dejan de coincidir con los de la edición web y con
los ya guardados. Por eso el primer paso es tener un núcleo que dé **el mismo
número, hasta el último dígito**, que el motor PHP que ya está en producción. Eso
es lo que comprueba `tests/parity.mjs`.

## Qué hay

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Unidades | `include/normia/units.h`, `src/units.c` | Espejo de `App\Core\Units`: mm, cm y m; geometría siempre en centímetros; superficie en m²; tolerancia de aplanado; escala `1:N` |
| Geometría | `include/normia/geometry.h`, `src/geometry.c` | Espejo de `PathGeometry`: arco por tres puntos, longitud real del arco (`r · barrido`), distancia punto-segmento |
| JSON | `include/normia/json.h`, `src/json.c` | Lector propio: objetos, arreglos, cadenas con escapes y `\u`, números, literales |
| Plano | `include/normia/plan.h`, `src/plan.c` | Sobre `normia-plan` o diseño suelto; elementos, muros, longitud con arcos, superficie |
| Programa | `src/cli.c` | `--check`, `--version`, `--stats plano.json` |
| Escritor de JSON | `include/normia/jsonw.h`, `src/jsonw.c` | Compone el sobre oficial sin bibliotecas |
| Documento | `include/normia/document.h`, `src/document.c` | Muros con nodos y arcos, equipos, deshacer y rehacer, selección por proximidad, guardar y abrir |
| Cifras | `include/normia/format.h`, `src/format.c` | Formato colombiano de medidas: `400 cm`, `471,2 cm`, `112.123,9 cm`, `4.712,4 mm` |
| SVG | `include/normia/svg.h`, `src/svg.c` | Plano en SVG con escala física: papel en milímetros, `viewBox` en centímetros, rejilla, franja de datos y cotas rotuladas |
| Rejilla | `include/normia/grid.h`, `src/grid.c` | Celdas de 20 cm, muros con holgura, vanos de puertas y exterior descontado |
| Aforo y salidas | `include/normia/audit.h`, `src/audit.c` | Superficie libre × densidad, con capacidad, declarado, permitido, usado y exceso; ancho de salida y tiempos de marcha y cola |
| Recorridos | `include/normia/travel.h`, `src/travel.c` | Dijkstra desde cada salida: recorrido más largo, punto más lejano, superficie alcanzable y zonas sin salida |
| Hallazgos | `include/normia/findings.h`, `src/findings.c` | Los ocho hallazgos de evacuación y aforo, con gravedad, detalle, elementos y punto |
| Catálogo de señalización | `include/normia/library.h`, `src/library.c` | Las 395 señales locales (332 ISO 7010 + 63 propias): tipo ↔ código, validación del SVG y `<svg>` anidado para el plano exportado |
| Señalización | `include/normia/signage.h`, `src/signage.c` | Salida sin pictograma, falta de «usted está aquí» y falta de señalización contra incendios |
| Primeros auxilios | `include/normia/firstaid.h`, `src/firstaid.c` | Botiquín, camilla y DEA: recuento y alcance desde el punto más lejano del espacio libre |
| Rutas | `include/normia/routes.h`, `src/routes.c` | Longitud de cada trazo (medida declarada o dibujo), llegada a la salida y cruces de muro fuera de vano |
| Escenarios | `include/normia/scenarios.h`, `src/scenarios.c` | Ocupación temporal: capacidad, ancho exigido y tiempos del evento, sin tocar el aforo del piso |
| Extintores | `include/normia/extinguisher.h`, `src/extinguisher.c` | NTC 2885 + Resolución 2400 y NFPA 10: recorrido por clase y riesgo, área por número de A, zonas descubiertas con su motivo y acciones cuantificadas (añadir, reubicar, subir rótulo) |
| Ventana de macOS | `macos/` | AppKit puro: menú en español, lienzo con Core Graphics, herramientas `V · M · P · A · D · R`, cotas, rutas de evacuación, **lienzo abierto con zoom y desplazamiento**, abrir reciente, imprimir (⌘P), exportar SVG (⌘E) y PDF, abrir y guardar con los paneles del sistema, macOS 12 |

## Compilar y probar

```sh
make -C native            # construye native/build/norma-core
make -C native test       # núcleo (23), documento (31), SVG (25), auditor (50), señalización (30) y extintores (32)
node native/tests/core.mjs         # compila en estricto y corre los cuatro (8)
node native/tests/parity.mjs 8.3   # paridad contra el motor PHP (56)
node native/tests/macos.mjs        # contrato de la ventana nativa (46)
```

Y en macOS, con las herramientas de Xcode:

```sh
make -C native/macos       # arma native/macos/build/NormiaEstudio.app
make -C native/macos check # arranca la aplicación sin ventana y comprueba el núcleo
make -C native/macos run   # la abre
```

El programa:

```sh
native/build/norma-core --check
# Normia · núcleo nativo 0.1.0 · ok

native/build/norma-core --svg paquetes/plano.json    # SVG por la salida estándar
native/build/norma-core --audit paquetes/plano.json  # aforo, salidas, recorridos, señalización y hallazgos
native/build/norma-core --sign-board hoja.svg        # hoja con las 395 señalizaciones, en SVG
native/build/norma-core --stats paquetes/plano.json
# {"core":"0.1.0","canvas":{"width":1123,"height":794,"unit":"cm","scale":"1:100"},
#  "elements":4,"walls":3,"curved_walls":1,"wall_length_cm":1121.2388980384690, …}
```

Opciones de compilación: `-std=c11 -O2 -Wall -Wextra -Wpedantic -Wshadow
-Wconversion -Wstrict-prototypes`. En el flujo de verificación se añade
`-Werror`: **no se admite un solo aviso**. Con `CC=clang` compila también con el
compilador de macOS, y con MinGW o MSVC en Windows.

## Resultado de la paridad (1.29.0)

| Cifra | C | PHP |
| --- | --- | --- |
| Longitud total de muros (cm) | 1121.2388980384690 | 1121.2388980384690 |
| Longitud en metros | 11.212388980384690 | 11.212388980384690 |
| Superficie del lienzo (m²) | 89.166200000000003 | 89.166200000000003 |
| Muro curvo (cm) | 471.23889803846896 | 471.23889803846896 |

Y la comprobación de siempre: el mismo dibujo declarado en `mm` mide lo mismo en
centímetros. Cambiar la unidad no altera ninguna dimensión.

## La ventana nativa (etapa N1)

`native/macos/` es una aplicación AppKit de verdad: **sin WebView, sin
JavaScript, sin Electron**. Compila con `clang -fobjc-arc` y enlaza solo `Cocoa`.

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Arranque | `main.m` | `--check` sin ventana; si no, abre la aplicación |
| Ventana y menú | `AppDelegate.m` | Archivo / Editar / Ver / Ayuda en español, `⌘N ⌘O ⌘S ⇧⌘S ⌘Z ⇧⌘Z`, paneles del sistema, aviso al cerrar con cambios |
| Lienzo | `CanvasView.m` | Dibujo con Core Graphics, rejilla de 20 cm, muros con arcos, equipos; clic selecciona, arrastrar mueve, `M` dibuja muros, `P` pluma, `A` arco, `D` cota, `R` ruta de evacuación (verde, con punta de flecha y su longitud rotulada), `Esc` sale, Retroceso borra |

El documento en C es lo que se edita:

| Función | Para qué |
| --- | --- |
| `norma_document_add_wall` | Muro por nodos, con arcos opcionales por tramo |
| `norma_document_add_marker` | Señal o equipo en un punto |
| `norma_document_move_node` | Mover un nodo y recalcular sus arcos |
| `norma_document_hit_test` | Selección por proximidad, con tolerancia |
| `norma_document_undo` / `redo` | Deshacer y rehacer por edición (64 niveles) |
| `norma_document_to_json` / `from_json` | Sobre oficial de ida y vuelta |
| `norma_document_add_dimension` | Cota entre dos puntos, con su cifra y su unidad (N2) |
| `norma_document_add_route` | Ruta de evacuación: trazo de tipo `route` con su id y su grosor (N3) |
| `norma_document_to_svg` | SVG con escala física, rejilla, franja y cotas (N2) |
| `norma_format_measure_cm` | Cifra de una medida en es-CO, con su unidad (N2) |

**Comprobado de verdad, en macOS**: el trabajo **Ventana nativa de macOS** del
flujo de verificación (`macos-15-intel`) compila el `.app` con `clang` y
`-Werror`, lee su `LSMinimumSystemVersion` con `PlistBuddy` —da **12.0**— y
**arranca la aplicación con `--check`**, y que el mismo binario del núcleo
**exporta un SVG con escala física** (`--svg`, comprobado con `grep` sobre el
ancho del papel y la cifra de una cota). Lo que sigue sin poder probarse desde
este entorno (Linux, sin pantalla) es la ventana en sí: el ratón, el teclado y el
dibujo en pantalla los ve una persona en su Mac.

El `.app` se publica como **artefacto del trabajo «Ventana nativa de macOS»**
(`NormiaEstudio-nativo-macos`): así se descarga y se abre en un Mac con Intel sin
firma ni release. Al abrirlo por primera vez, macOS pide permiso en
*Ajustes del Sistema › Privacidad y seguridad* porque llega sin firmar.

## Lo que sigue

| Etapa | Qué | Estado |
| --- | --- | --- |
| **N0** | Núcleo en C con paridad verificada | **hecho** |
| **N1** | Ventana nativa en macOS (AppKit/CoreGraphics), sin WebView: lienzo, selección, muros, deshacer, guardar y abrir | **hecho** en código; compila y arranca en el flujo de macOS |
| **N2** | Cotas, pluma de nodos, arcos, SVG del núcleo, recientes, impresión y PDF | **hecho** en código; compila y exporta en el flujo de macOS |
| N3 | Rejilla y aforo en C, con paridad | **hecho**: rejilla, salidas, recorridos, hallazgos, señalización, primeros auxilios, extintores, escenarios, rutas y su herramienta de dibujo |
| N4 | Windows (Win32) y Linux (GTK) | pendiente |

Las reglas no cambian: sin procedimientos metrológicos obligatorios, sin
calibraciones, sin afirmar certificación, y **nunca** un cambio silencioso de
cifras. Si el núcleo nativo no puede igualar un número, se dice antes de
sustituirlo.
