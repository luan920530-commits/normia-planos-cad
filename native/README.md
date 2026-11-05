# Normia nativo · núcleo en C

El comienzo de la aplicación **100 % nativa**, sin Electron y sin navegador por
medio. Este directorio es la etapa **N0**: el motor de cálculo y el lector del
plano, en C11, sin dependencias, compilando en macOS, Linux y Windows.

Lo que **todavía no** está aquí: la ventana, el lienzo y las herramientas. Eso es
la etapa N1, y su alcance y su costo están en
[`docs/APP-NATIVA.md`](../docs/APP-NATIVA.md).

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

## Compilar y probar

```sh
make -C native            # construye native/build/norma-core
make -C native test       # pruebas del núcleo (23 comprobaciones)
node native/tests/parity.mjs 8.3   # paridad contra el motor PHP (12 comprobaciones)
```

El programa:

```sh
native/build/norma-core --check
# Normia · núcleo nativo 0.1.0 · ok

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

## Lo que sigue

| Etapa | Qué | Estado |
| --- | --- | --- |
| **N0** | Núcleo en C con paridad verificada | **hecho** |
| N1 | Ventana nativa en macOS (AppKit/CoreGraphics), sin WebView: lienzo, selección, muros, cotas, deshacer | siguiente |
| N2 | Guardar y abrir, menú, recientes, impresión y exportación desde el núcleo | pendiente |
| N3 | Auditor, aforo y rutas en C, con golden propio contra PHP | pendiente |
| N4 | Windows (Win32) y Linux (GTK) | pendiente |

Las reglas no cambian: sin procedimientos metrológicos obligatorios, sin
calibraciones, sin afirmar certificación, y **nunca** un cambio silencioso de
cifras. Si el núcleo nativo no puede igualar un número, se dice antes de
sustituirlo.
