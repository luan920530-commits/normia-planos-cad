# Normia nativo · núcleo en C

El comienzo de la aplicación **100 % nativa**, sin Electron y sin navegador por
medio. Este directorio es la etapa **N0**: el motor de cálculo y el lector del
plano, en C11, sin dependencias, compilando en macOS, Linux y Windows.

Están la **N0** (motor y paridad con PHP), la **N1** (documento editable y la
ventana nativa de macOS con su lienzo, sin WebView) y la **N2** en curso: cotas,
pluma de nodos, arcos y exportación SVG desde el núcleo. Lo que todavía no hay:
recientes e impresión en la ventana, auditor, aforo y rutas en C (N3), y Windows
y Linux (N4). El alcance completo
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
| Ventana de macOS | `macos/` | AppKit puro: menú en español, lienzo con Core Graphics, herramientas `V · M · P · A · D`, cotas, exportar SVG (⌘E), abrir y guardar con los paneles del sistema, macOS 12 |

## Compilar y probar

```sh
make -C native            # construye native/build/norma-core
make -C native test       # núcleo (23), documento (27) y SVG (25)
node native/tests/core.mjs         # compila en estricto y corre los tres (7)
node native/tests/parity.mjs 8.3   # paridad contra el motor PHP (16)
node native/tests/macos.mjs        # contrato de la ventana nativa (28)
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

native/build/norma-core --svg paquetes/plano.json   # SVG por la salida estándar
native/build/norma-core --stats paquetes/plano.json
# {"core":"0.1.0","canvas":{"width":1123,"height":794,"unit":"cm","scale":"1:100"},
#  "elements":4,"walls":3,"curved_walls":1,"wall_length_cm":1121.2388980384690, …}
```

Opciones de compilación: `-std=c11 -O2 -Wall -Wextra -Wpedantic -Wshadow
-Wconversion -Wstrict-prototypes`. En el flujo de verificación se añade
`-Werror`: **no se admite un solo aviso**. Con `CC=clang` compila también con el
compilador de macOS, y con MinGW o MSVC en Windows.

## Resultado de la paridad (1.28.0)

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
| Lienzo | `CanvasView.m` | Dibujo con Core Graphics, rejilla de 20 cm, muros con arcos, equipos; clic selecciona, arrastrar mueve, `M` dibuja muros, `Esc` sale, Retroceso borra |

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
| **N2** | Cotas, pluma de nodos, arcos y exportación SVG desde el núcleo | **en curso** (código escrito); faltan recientes e impresión |
| N3 | Auditor, aforo y rutas en C, con golden propio contra PHP | pendiente |
| N4 | Windows (Win32) y Linux (GTK) | pendiente |

Las reglas no cambian: sin procedimientos metrológicos obligatorios, sin
calibraciones, sin afirmar certificación, y **nunca** un cambio silencioso de
cifras. Si el núcleo nativo no puede igualar un número, se dice antes de
sustituirlo.
