# NORMIA-005 · Calibración dimensional

Diseño técnico y funcional de la calibración de dimensiones reales en Normia CAD:
cómo se ancla un plano a una medida física, dónde se guarda ese anclaje, cómo se
valida, qué pasa al cambiar de unidad y qué consumidores tienen que pasar a usarlo.

| | |
| --- | --- |
| Misión | 003 — diseño técnico, **sin implementación** |
| Rama | `arena/48ee92e3-normia-planos-cad` |
| Base | `main` en `df1a70e` (etapa 0 de NORMIA-004 cerrada, PR #56 abierto) |
| Versión | 1.18.0 · `user_version = 7` · formato de plano 2/3/4 |
| Estado | **propuesta revisable**; no se tocó código ni datos |
| Antecedente | [`NORMIA-004-ARQUITECTURA-DIMENSIONAL.md`](NORMIA-004-ARQUITECTURA-DIMENSIONAL.md) §4, DEC-3 y DEC-4 |
| Continúa | [`DIMENSIONAL.md`](DIMENSIONAL.md) · [`MISION-002-CIERRE-ETAPA-0.md`](MISION-002-CIERRE-ETAPA-0.md) |

---

## 0. Cómo leer este documento

Tres capas, y conviene no mezclarlas:

1. **Lo verificado** (§2). Cada afirmación sobre el código lleva archivo y línea.
   Si algo no lo pude comprobar ejecutando, lo digo en §15.
2. **La propuesta** (§3 a §10). Es una arquitectura concreta, con nombres de clase,
   campos y mensajes, para que se pueda aprobar o rechazar sin más preguntas.
3. **Lo que necesita tu decisión** (§13). Siete decisiones, cada una con las
   opciones, el coste y mi recomendación. Nada de esto se implementa hasta que las
   contestes.

Una advertencia que conviene tener desde el principio: **hoy un plano no puede
cambiar de unidad**, y no por descuido, sino porque los rangos del validador lo
hacen imposible para cualquier plano de edificio (§2.2, C-03). Cualquier diseño de calibración
que ignore esa pared se queda a medio camino, así que este documento la trata de
frente.

---

## 1. Veredicto

1. **La calibración es viable sin tocar la geometría.** Es un dato nuevo del
   documento, un factor derivado, y un cambio de consumidor. No reescribe planos
   ni coordenadas.
2. **El sitio natural es el documento** (`canvas.calibration`), porque el factor
   decide todos los números físicos que se derivan de un dibujo y cada versión
   guardada debe poder reproducirlos. Se puede añadir una proyección en base de
   datos después, sin cambiar la fuente de verdad (§6.3).
3. **Requiere una versión de formato nueva** (`format: 5`, sobre `schema_version: 3`)
   porque el validador rechaza claves desconocidas: sin eso, una versión anterior
   abriría el plano con un error confuso. La comprobación es de una línea en
   `DesignValidator.php:275` y otra en `DesignImporter.php:38`.
4. **El cambio de unidad es el problema real**, no la calibración. Los rangos
   numéricos del validador están calibrados a mano para `cm`: el plano de la demo
   (1 600 × 1 000 `cm`) no cabe en `m` (16 < 400) ni en `mm` (16 000 > 4 000). Sin
   una decisión sobre esos rangos, el punto 5 de la misión no se puede cumplir
   (§2.2 C-03, §8.4, DEC-B).
5. **Nada de lo propuesto mueve una cifra de un plano sin calibrar.** El camino
   sin calibración devuelve exactamente los mismos flotantes que hoy, y eso se fija
   con el golden de la etapa 0 (§10.4).

---

## 2. Inspección: qué hay hoy

### 2.1 Piezas que ya existen y sirven

| Pieza | Archivo | Qué aporta a esta misión |
| --- | --- | --- |
| Autoridad de unidades | `app/Core/Units.php` | tabla `CM_PER_UNIT`, `metersPerUnit`, `fromMeters`, `squareMeters`, `tolerance`, `scaleDenominator`. Es el único sitio con el factor nominal. |
| Espejo en el navegador | `assets/js/lib/units.js` | las mismas funciones, con igualdad bit a bit probada contra PHP. |
| Validador del documento | `app/Services/DesignValidator.php` | lista blanca de claves, rangos numéricos y derivación de `format` (`:59`, `:69`, `:91`, `:275`, `:281`). Es la puerta que hay que abrir con cuidado. |
| Documento versionado | `floors.design_json` + `floor_versions` (`resources/schema.sql`) | cada guardado crea una versión inmutable con su nota. `Floor::saveDesign` (`:83`) valida, escribe y registra. |
| Borrador y conflicto de versión | `app/Models/Floor.php` (`:61`, `:83`, `:130`, `:159`) | el editor ya sabe convivir con dos sesiones. La reconversión se apoyará en ese mismo control optimista. |
| Longitud de trazo con arcos | `PathGeometry::length` / `G.pathLength` | mide un muro curvo por su arco. La calibración debe usar **esta** longitud como distancia medida. |
| Editor | `assets/js/lib/model.js`, `renderer.js`, `editor.js` | modelo en memoria, dibujo, barra de estado. |
| Cota | `renderer.js:1011`, `SvgExporter.php:265` | dibuja una línea con dos topes y un rótulo. |
| Auditor | `app/Services/PlanAudit.php:98` | `cmPerUnit`/`metersPerUnit` en `:107-109`; ancho de vano, recorrido, ocupación estimada. |
| Extintores | `app/Services/ExtinguisherCoverage.php:31` | rejilla de cobertura, distancia a la señal. |
| Redes | `app/Services/MepCalculator.php:47` | longitud en metros, caída de tensión. |
| Rejilla de evacuación | `app/Services/PlanGrid.php:31` | celdas de `cellCm` convertidas a unidades con `Units::cmPerUnit` (`:37`). |
| Pie de plano | `app/Services/PlanFooter.php:128` | imprime escala, unidad, versión; hoy no dice si la escala está calibrada. |
| Exportador SVG | `app/Services/SvgExporter.php:16` | `width`/`height` en unidades de usuario, sin mm físicos (`:39`). |
| Cota y rótulos | `SvgExporter.php:265`, `:334` | rótulo de cota en `unidad`, rótulo de red en metros. |
| Medición de rutas | `assets/js/editor/measure.js:23`, `:162` | A* sobre el lienzo, distancias en metros con la unidad declarada. |
| Pliego | `assets/js/editor/schedule.js:147`, `:195` | área del piso y distancias de señalización. |

### 2.2 Hallazgos

Numerados `C-xx` para poder citarlos en la implementación.

#### C-01 · No existe ningún anclaje físico — **el hueco central**

`canvas` admite siete claves (`DesignValidator.php:275`) y ninguna dice cuánto mide
una unidad en el mundo real. La suposición es implícita: *1 unidad = 1 unidad
declarada*, y eso solo es cierto si quien dibujó midió bien. No hay forma de
declarar «esta fachada mide 12,40 m» ni de dejar constancia de quién lo midió.

Consecuencia: todos los metros que produce el sistema (recorrido de evacuación,
ancho de vano, cobertura de extintores, longitud de red, caída de tensión, área del
piso) descansan sobre una suposición no verificada, y el propio pie del plano lo
admite: «verifica dimensiones y escala en sitio» (`PlanFooter.php:151`).

#### C-02 · La escala es decorativa y se presenta como si no lo fuera — **verificado**

- `canvas.scale` se valida con `^1:[1-9][0-9]{0,4}$` (`DesignValidator.php:293`) y no
  interviene en ningún cálculo.
- La interfaz lo rotula dos veces: el campo se llama «Escala de referencia»
  (`app/Views/editor/index.php:579`) y la barra de estado dice `1:100 · referencia`
  (`assets/js/editor.js:722`). Es honesto, pero deja al usuario sin ninguna escala
  que sí signifique algo.
- El SVG exportado no tiene tamaño físico (`width` en unidades de usuario,
  `SvgExporter.php:39`) y el `desc` repite el aviso.

No es un defecto de la etapa 0; es lo que la calibración viene a llenar: un
denominador con sentido, del que después se podrá derivar el tamaño de papel
(etapa 1 de NORMIA-004).

#### C-03 · Los rangos del validador están escritos en `cm` y lo impiden todo — **bloqueante**

`DesignValidator.php:281-284`:

```php
$width  = self::integer($canvas['width']  ?? null, 400, 4000, 'ancho del lienzo');
$height = self::integer($canvas['height'] ?? null, 300, 3000, 'alto del lienzo');
$grid   = self::integer($canvas['grid']   ?? 20,   5,   100, 'cuadrícula');
```

Esos números tienen sentido en `cm` (4 m a 40 m de ancho). En otra unidad no
significan nada. El plano de la demo, `1600 × 1000 cm` = 16 × 10 m:

| Destino | Ancho resultante | Veredicto del validador |
| --- | --- | --- |
| `m` | 16 | ✗ `width` < 400 |
| `mm` | 16 000 | ✗ `width` > 4 000 |

Y aunque el lienzo pasara, quedan cuatro topes más:

| Campo | Hoy | En `m` (demo) | En `mm` (demo) |
| --- | --- | --- | --- |
| `canvas.grid` | int 5…100 | 20 → **0,2** ✗ | 20 → 200 ✗ |
| `fontSize` de cota/texto | 8…160 | 12 → **0,12** ✗ | 12 → 120 ✓ |
| `stroke` | 0…40 | 2 → 0,02 ✓ | 2 → 200 ✗ |
| `x`, `y`, `w`, `h`, puntos | 0…10 000 | ✓ | 16 000 ✗ |

Leído al derecho, y con la aritmética hecha:

- **A `m`**: el lienzo tendría que medir entre 400 y 4 000 **unidades**, es decir
  entre 400 m y 4 km. Ningún piso de un edificio cabe. Imposible.
- **A `mm`**: el lienzo tendría que medir entre 400 y 4 000 mm, es decir entre 0,4 m
  y 4 m. El único tamaño que encaja exactamente es **400 × 300 cm = 4 × 3 m**
  (4 000 × 3 000 mm)… y ahí falla la cuadrícula: 20 cm son 200 mm, fuera del rango
  5…100.

Conclusión: **hoy no hay ninguna unidad de destino válida para un plano de edificio**.
Ese es el motivo real de que el cambio de unidad nunca se haya arreglado (D-02 de
NORMIA-004, P-01 de la MISIÓN 001), y por eso el punto 5 de esta misión termina en
una decisión de producto y no en un algoritmo.

#### C-04 · La cota muestra unidades, no metros, y puede contradecir al dibujo

`renderer.js:1011-1024` dibuja el rótulo con `G.formatMeasurement(measured,
canvas.unit)` → «418,6 cm», y `SvgExporter::measurement` hace lo mismo
(`number_format($distance,1) . ' ' . $unit`). No hay manera de leer una cota en
metros sin hacer la cuenta a mano, y si el usuario escribió el texto (`label`), el
rótulo puede decir «4,20 m» mientras la geometría mide 418,6 cm.

#### C-05 · El validador rechaza claves desconocidas — **importante para compatibilidad**

`DesignValidator.php:275` (lienzo) y `:59` (raíz) usan lista blanca cerrada. Un
plano con `canvas.calibration` abierto por la 1.18.0 falla con «El lienzo contiene
una propiedad no permitida», que no dice nada al usuario. La forma limpia de
fallar es por versión de formato (§10.3).

#### C-06 · Extintores asume `cm` en la distancia a la señal — **defecto verificado**

`ExtinguisherCoverage.php:252-258`:

```php
$d = PlanGrid::distance($report['center'], $sign['center']);
$unitReports[$index]['signDistanceM'] = round($signDistance / 100, 2);
$unitReports[$index]['signCovered'] = $signDistance <= $signRadiusCm;
```

La distancia sale en **unidades del lienzo**, se divide entre 100 y se compara
contra un radio en centímetros. Es correcto en `cm` y está mal en `m` y en `mm`
(100× y 0,01×). Con calibración, además, se queda con el factor nominal.

#### C-07 · La medición de rutas asume `cm` en las holguras — **defecto verificado**

`measure.js:17-18`: `CELL = 10` y `CLEARANCE = { walk: 9, wheelchair: 22 }` son
constantes en unidades crudas, con el comentario «10 cm con el lienzo en cm». El
A* transita con una holgura de 9 unidades: 9 cm en `cm`, 9 m en `m`.

#### C-08 · El pliego calcula área y metros por unidad por su cuenta

`schedule.js:147-148` y `:195` (`unitCm / 100`). El factor sí viene de `Units`, pero la
división está en línea. Ya está documentado en `DIMENSIONAL.md` §3 y **no se
cambia** en la etapa 0; la calibración lo necesita resuelto porque el área pasa a
depender de dos factores.

#### C-09 · No hay procedencia de la dimensión

Ni el plano, ni la versión, ni el informe guardan quién declaró la medida, con qué
instrumento, cuándo ni con qué margen. Un informe de evacuación de hoy no puede
responder «¿de dónde salió este 17,38 m?» más allá de «del dibujo».

#### C-10 · Lo exportado no declara su condición dimensional

El JSON (`ExportController.php:39-62`) y el SVG llevan la unidad y la escala, pero
no si el plano está calibrado. Quien recibe el archivo no puede saber si los metros
del informe son declarados o medidos.

### 2.3 Lo que ya está bien y no hay que tocar

- Una sola tabla de factores por lenguaje (etapa 0) con paridad exacta PHP↔JS.
- La geometría es un documento inmutable por versión, con historial y nota.
- El control de conflicto por `version` y el borrador recuperable.
- El auditor y las redes reciben el diseño ya normalizado y **no** vuelven a
  interpretar la unidad por su cuenta (salvo C-06/C-08).
- La tolerancia de aplanado ya depende de la unidad (`Units::tolerance`).
- El pie de plano ya tiene una línea con escala, unidad y versión.

---

## 3. Las tres escalas, y el vocabulario

Esta misión vive de no confundirlas. La tabla es la misma de NORMIA-004 §4.3, con
la fila que faltaba (la calibración) y las restricciones de esta misión aplicadas.

| Escala | Qué es | Dónde se usa | La calibración la cambia | El zoom la cambia | La impresión la cambia |
| --- | --- | --- | --- | --- | --- |
| **Escala de modelo declarada** | metros por unidad según `canvas.unit` | punto de partida | no | no | no |
| **Escala de modelo calibrada** | metros por unidad **medidos** | todos los cálculos físicos | **sí, es su razón de ser** | no | no |
| **Escala de impresión** `1:N` | cuántos mm de papel por mm reales | SVG, PDF, papel | no la toca; la *deriva* | no | sí |
| **Zoom de pantalla** | píxeles por unidad | solo el lienzo | no | sí | no |

Reglas de esta misión, sin excepciones:

1. **La escala de impresión no entra en ningún cálculo físico.** `1:N` no multiplica
   ni divide longitudes. Sigue sin aplicarse a nada, como hoy
   (`DIMENSIONAL.md` §6).
2. **La calibración no se aplica a la impresión en esta etapa.** Cuando la etapa 1
   la use, será para calcular el tamaño del papel a partir del factor calibrado,
   nunca al revés.
3. **El zoom no entra en ningún cálculo.** Ya es así; se mantiene.

Vocabulario que usará la interfaz, en español y sin ambigüedad:

| Término | Significado | Lo que **no** significa |
| --- | --- | --- |
| **declarada** | el plano dice que cada unidad mide lo que dice su unidad | no afirma que se haya medido |
| **calibrada** | una distancia del dibujo se contrastó con una medida real | no afirma exactitud mejor que la tolerancia declarada |
| **tolerancia** | margen declarado por quien calibra (± %) | no es el error real cometido |
| **verificada** | hay al menos una segunda medida conocida que cuadra dentro de la tolerancia | no es un dictamen ni una certificación |
| **obsoleta** (`stale`) | la calibración se hizo con otra unidad y no se reconvirtió | no se borra: se conserva con su evidencia |

---

## 4. Arquitectura propuesta

### 4.1 Principio

> El plano guarda **evidencia** (qué se midió, cuánto se declaró) y el sistema
> **deriva** el factor en un único punto. Ningún consumidor calcula su propio
> factor, ni lee `canvas.calibration` directamente.

Eso da tres propiedades que hoy no existen:

- **Reproducible**: el factor de una versión se recalcula desde su documento.
- **Auditable**: la evidencia viaja con el plano y con cada versión.
- **Seguro**: un solo lugar donde equivocarse, y una sola prueba que lo cubre.

### 4.2 Diagrama de capas

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ DOCUMENTO (design_json, una versión inmutable por guardado)                  │
│                                                                              │
│  canvas: { width, height, grid, unit, scale, background, occupancy,          │
│            calibration? }                                                    │
│  elements[] …  layers[] …  extinguishers …                                   │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ se lee, nunca se reinterpreta
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ ESCALA EFECTIVA · una sola derivación                                        │
│                                                                              │
│  PHP:  App\Services\PlanScale::of(array $canvas): PlanScale                  │
│  JS:   Normia.Scale.of(design.canvas)                                        │
│                                                                              │
│  metersPerUnit = calibrada && !obsoleta                                      │
│                    ? calibration.metersPerUnit                               │
│                    : Units::metersPerUnit(unit)        ← idéntico a hoy      │
│  cmPerUnit     = metersPerUnit × 100                                         │
│  declarada | calibrada | obsoleta | verificada                               │
└───────────────────────────────┬──────────────────────────────────────────────┘
        ┌───────────────┬───────┴────────┬───────────────┬──────────────┐
        ▼               ▼                ▼               ▼              ▼
   PlanAudit      ExtinguisherCoverage  MepCalculator  PlanGrid     Cotas/SVG/Pie
   PlanFooter     measure.js            schedule.js    inspector.js
        │               │                │               │              │
        ▼               ▼                ▼               ▼              ▼
   recorrido,      cobertura,        longitud,       rejilla,      rótulos en
   vanos,          distancia a       caída de        holguras      m, «±X %»,
   ocupación       la señal          tensión         físicas       escala gráfica
                                                                     (etapa 1)
```

### 4.3 Diagrama de flujo

**A · Calibrar (camino nuevo, no cambia geometría)**

```text
usuario                 editor (JS)                     servidor (PHP)
   │  «Calibrar escala»     │                                │
   ├───────────────────────►│ modo dos puntos                │
   │  clic A, clic B        │                                │
   ├───────────────────────►│ measuredU = G.pathLength(A,B)  │
   │                        │ (arcos incluidos, sin zoom)    │
   │  «4,20 m» + ±2 %       │                                │
   ├───────────────────────►│ 1. calcula factor provisional  │
   │                        │ 2. POST calibración/preview ──►│ valida rangos,
   │                        │                                │ rechaza si el factor
   │                        │◄────────── vista previa ───────┤ se sale de 0,2×…5×
   │  «confirmar»           │ muestra: 1 u = 1,00334 cm,      │
   ├───────────────────────►│ 160 m² → 161,07 m², ±2 %       │
   │                        │ 3. POST …/apply con token ────►│
   │                        │                                │ valida que el documento
   │                        │                                │ no cambió (hash/versión)
   │                        │◄───── 200 + versión nueva ─────┤ Floor::saveDesign,
   │                        │                                │ nota «Calibración»
   ▼                        ▼                                ▼
documento con canvas.calibration; geometría intacta; golden sin calibrar intacto
```

**B · Consumir (camino de lectura, todos los días)**

```text
petición ──► Floor/preview ──► DesignValidator (normaliza)
                                     │
                                     ▼
                              PlanScale::of($design['canvas'])
                                     │
              ┌──────────────────────┼───────────────────────┐
              ▼                      ▼                       ▼
     PlanAudit::analyze    ExtinguisherCoverage      SvgExporter / PlanFooter
     MepCalculator::…      PlanGrid::build           cotas y rótulos
              └──────────────────────┴───────────────────────┘
                                     ▼
                    números físicos + `dimension` en la salida
                    (declarada | calibrada ±X % | obsoleta)
```

**C · Cambiar de unidad (camino nuevo, cambia geometría: §8 y §9)**

```text
usuario elige otra unidad
        │
        ▼
1. ¿el plano tiene elementos?  ── no ──► cambia sin ceremonia, sin diálogo
        │ sí
        ▼
2. servidor: POST unidad/preview  (no escribe nada)
   · comprueba viabilidad física con la ventana de rangos (§8.4)
   · calcula el diff completo y el hash del documento de origen
   · devuelve token con caducidad + tabla original → resultante
        │
        ▼
3. diálogo modal: cifras antes/después, aviso de calibración, opción «guardar
   versión antes»
        │  confirmar
        ▼
4. servidor: POST unidad/apply con token
   · verifica hash del documento (si cambió → 409, se rehace la vista previa)
   · reconvierte, transforma la calibración, valida, guarda versión con nota
        │
        ▼
5. respuesta con lo aplicado y el informe de diferencias (queda en la versión)
```

El paso 2 no existe hoy para nada parecido, y es la pieza que hace imposible una
conversión silenciosa: si no hay vista previa, no hay token; si no hay token, el
servidor rechaza.

### 4.4 Contrato de `PlanScale`

```php
final class PlanScale
{
    public readonly string $unit;               // 'mm'|'cm'|'m'
    public readonly float  $metersPerUnit;      // efectivo
    public readonly float  $nominalMetersPerUnit;
    public readonly bool   $calibrated;
    public readonly bool   $stale;
    public readonly ?float $tolerancePct;
    public readonly ?string $method;
    public readonly ?string $at;
    public readonly ?int   $byUserId;
    public readonly bool   $verified;           // ≥1 comprobación que cuadra

    public static function of(array $canvas): self;
    public function cmPerUnit(): float;         // metersPerUnit × 100
    public function unitsPerMeter(): float;
    public function toMeters(float $value): float;
    public function fromMeters(float $meters): float;
    public function squareMeters(float $areaUnits): float;
    public function tolerance(): float;         // TOLERANCE_CM / cmPerUnit()
    public function deviationPct(): float;      // (efectivo/nominal − 1) × 100
    public function describe(): string;         // «calibrada ±2 %» / «declarada»
}
```

Tres detalles que importan para no mover cifras:

1. **Sin calibración, `metersPerUnit` es exactamente `Units::metersPerUnit($unit)`**,
   mismo orden de operaciones, mismo flotante. No se multiplica por 1,0.
2. **`stale` se deriva, no se guarda.** Se calcula comparando `calibration.unit`
   con `canvas.unit`. Un estado guardado puede desincronizarse del documento; un
   estado derivado, no.
3. **`tolerance()` sigue saliendo de `TOLERANCE_CM`**, pero con el factor efectivo.
   En un plano calibrado al 0,33 % el aplanado cambia una milésima de unidad:
   invisible, y coherente con que la tolerancia es física (0,5 cm).

### 4.5 Frontera con JavaScript

`Normia.Scale.of(canvas)` publica el mismo contrato con los mismos nombres. La
prueba de paridad es la misma que ya existe para `Units`: un fixture compartido
(`tests/fixtures/scale.json`) con casos `{canvas, esperado}` comparado con igualdad
estricta en las dos suites. Sin eso, el SVG del navegador y el del servidor vuelven
a separarse, que es exactamente lo que la etapa 0 vino a cerrar.

---

## 5. Procedimiento de calibración

### 5.1 Los tres métodos

| Método | Qué mide el usuario | Cuándo usarlo | Precisión razonable |
| --- | --- | --- | --- |
| `known-distance` | dos puntos cualesquiera del dibujo y la distancia real entre ellos | caso general | ±1 cm con cinta |
| `element-length` | elige un trazo ya dibujado (muro, fachada, vía) | el muro ya existe y se midió | ±1 cm |
| `canvas-width` | declara el ancho real del edificio | plano importado sin nada que medir | ±5 % (gruesa) |

Los tres acaban en la misma fórmula; cambia solo de dónde sale `measuredU`:

```text
measuredU     = G.pathLength(puntos, curvas)     // arcos incluidos, sin zoom
metersPerUnit = knownM / measuredU
```

`canvas-width` es el método de rescate y debe rotularse como tal: con él la
tolerancia mínima admitida sube a ±3 % y el pie dice «calibración gruesa». Si el
usuario declara ±0,5 % con el ancho del lienzo, se le corrige: no es creíble y
daría una falsa sensación de exactitud.

### 5.2 Flujo de la interfaz

Dentro del editor, sin salir (estética iOS: hoja inferior, no modal de escritorio):

1. **Piso › Calibrar escala** (o el aviso «plano sin calibrar» del panel de lienzo).
2. El lienzo entra en modo dos puntos: cursor de mira, el resto atenuado, `Esc`
   cancela. Se ancla con el mismo *snap* que usan muros y vías.
3. Al segundo clic se abre la hoja con cuatro campos y una cifra:
   - **Distancia en el dibujo**: `418,6 cm` — solo lectura, calculada.
   - **Distancia real**: número + unidad (`m`, `cm`, `mm`).
   - **Margen declarado**: ± % (por defecto 2, mínimo 0,1, máximo 10).
   - **Instrumento / referencia**: lista corta (cinta métrica, distanciómetro,
     plano municipal, medición de proyecto) + nota libre.
   - **Vista previa del efecto**, en una línea: «1 unidad = 1,00334 cm · el lienzo
     pasa de 16,00 × 10,00 m a 16,05 × 10,03 m · ±2 %».
4. **Calibrar** → guarda y ofrece versión con nota automática
   «Calibración ±2 % (cinta métrica)».
5. **Quitar calibración** existe, es explícito, deja el plano como declarado y
   pide confirmación con el mismo patrón de dos fases.

### 5.3 Reglas de la medición

| Regla | Valor | Motivo |
| --- | --- | --- |
| Longitud mínima medida | **1 m real** (100 u en `cm`, 1 000 en `mm`, 1 en `m`) | por debajo, un error de 1 cm mueve el factor más que la tolerancia declarada |
| Se mide con `pathLength`, no con la cuerda | arcos incluidos | si el usuario calibra con un muro curvo, la cuerda mentiría un 57 % |
| El zoom no entra | — | el zoom es de pantalla |
| El `stroke` no entra | — | se mide el eje del trazo, no su grosor |
| Precisión de entrada | 0,1 cm / 0,001 m | lo que da una cinta; más decimales es teatro |
| Factor guardado | 9 decimales | 1 nm por unidad; de sobra y sin ruido |
| Repetir calibración | permitido; cada una es una versión | el histórico conserva la anterior |

### 5.4 Errores de usuario que hay que atrapar con mensaje

| Caso | Mensaje |
| --- | --- |
| Dos clics en el mismo punto | «Los dos puntos están en el mismo sitio: no hay distancia que medir.» |
| Distancia real < 1 m | «Marca al menos 1 m: con menos, un centímetro de error se come el margen.» |
| Real = 0 o negativa | «La distancia real debe ser mayor que cero.» |
| Factor fuera de 0,2×…5× del nominal | «Esa medida no cuadra: 42 m en un tramo de 4,2 m. Revisa la unidad de la distancia real.» |
| Unidad real distinta de la del plano | se convierte y se muestra: «4,20 m = 420 cm» antes de aceptar |
| Método `canvas-width` con margen < 3 % | «Con el ancho del lienzo no se puede afirmar menos de ±3 %.» |
| Calibración que empeora la verificación (§7) | no se bloquea, pero se advierte y se guarda como no verificada |

### 5.5 Catálogo de errores del bloque de calibración

Todos son rechazos de la puerta del documento (`DesignValidator`), con el mismo
formato de error que el resto (`DomainException` → 422 en la API, mensaje en la
hoja del editor). No hay errores silenciosos: o se acepta y se guarda, o se dice
por qué.

| Código | Condición | Mensaje | HTTP |
| --- | --- | --- | --- |
| `CAL-01` | `method` ausente o desconocido | «El método de calibración no es válido.» | 422 |
| `CAL-02` | `unit` fuera de `mm`, `cm`, `m` | «La unidad de la calibración no es válida.» | 422 |
| `CAL-03` | `measuredU` no numérico, ≤ 0 o mayor que la diagonal del lienzo | «La medida en el dibujo no es válida: no cabe en el plano.» | 422 |
| `CAL-04` | `knownM` no numérico o < 1 | «La distancia real debe ser de al menos 1 m.» | 422 |
| `CAL-05` | `tolerancePct` fuera de 0,1…10 | «El margen debe estar entre 0,1 % y 10 %.» | 422 |
| `CAL-06` | `canvas-width` con `tolerancePct` < 3 | «Con el ancho del lienzo no se puede afirmar menos de ±3 %.» | 422 |
| `CAL-07` | factor fuera de 0,2×…5× el nominal de la unidad | «Esa medida no cuadra con la unidad del plano: revisa la distancia real.» | 422 |
| `CAL-08` | `metersPerUnit` no coincide con `knownM / measuredU` (9 decimales) | «La calibración no es coherente con su evidencia.» | 422 |
| `CAL-09` | `instrument` desconocido | «El instrumento declarado no es válido.» | 422 |
| `CAL-10` | `note` > 240 caracteres o con `<`/`>` | «La nota no puede superar 240 caracteres ni contener etiquetas.» | 422 |
| `CAL-11` | más de 5 `checks`, o un `check` sin `measuredU`/`knownM` válidos | «Solo se admiten 5 comprobaciones por plano.» | 422 |
| `CAL-12` | `at` o `by` no coinciden con la sesión que guarda | se **sobrescriben** con el usuario y la hora del servidor | — |
| `CAL-13` | el plano no tiene permiso de escritura | «Tu rol no permite calibrar este plano.» | 403 |

`CAL-08` es la regla que impide que un JSON editado a mano invente una calibración:
el factor tiene que poder recalcularse desde su evidencia. `CAL-12` es la contraria:
la procedencia nunca la pone el cliente.

---

## 6. Persistencia

### 6.1 Forma propuesta

`canvas.calibration`, opcional. Si no está, el plano es **declarado** y nada cambia.

```jsonc
"calibration": {
  "v": 1,                                  // versión del bloque
  "method": "known-distance",              // known-distance | element-length | canvas-width
  "unit": "cm",                            // unidad del plano al calibrar
  "measuredU": 418.6,                      // distancia en el dibujo (unidades)
  "knownM": 4.2,                           // distancia real declarada (metros)
  "knownInput": { "value": 420, "unit": "cm" },  // lo que escribió el usuario, tal cual
  "metersPerUnit": 0.010033445,            // = knownM / measuredU, 9 decimales… ver nota
  "tolerancePct": 2.0,
  "instrument": "cinta",                   // cinta | laser | plano | proyecto | otro
  "reference": "el_4f2a",                  // opcional: id del trazo medido
  "note": "Fachada norte medida en sitio", // ≤ 240 caracteres
  "at": "2026-11-02T15:04:05+00:00",
  "by": 3,                                 // users.id
  "checks": [                              // validación adicional (§7), 0…5
    { "measuredU": 900.0, "knownM": 9.03, "tolerancePct": 2.0, "at": "…", "by": 3 }
  ]
}
```

**Nota sobre los decimales.** El factor se guarda con 9 decimales *redondeados*, no
con todos los dígitos de la división: un JSON con 17 dígitos invita a creer que el
dato es exacto y hace que dos máquinas discrepen en el último bit. Con 9 decimales
el error por redondeo es ≤ 5·10⁻¹⁰ m por unidad, es decir 5·10⁻⁸ m en un plano de
100 m: irrelevante frente a un ±1 % de 10 cm.

### 6.2 Por qué dentro del documento

| Criterio | En el documento | En tabla aparte |
| --- | --- | --- |
| Reproducir un informe de la versión 7 | ✔ el factor viaja con la versión | ✘ hay que cruzar dos historiales |
| Restaurar un respaldo antiguo | ✔ coherente por construcción | ✘ tabla y documento pueden desincronizarse |
| Funcionar sin conexión (APK, Electron) | ✔ todo en el mismo JSON | ✘ segunda fuente que sincronizar |
| Consultar «qué pisos están calibrados» | ✘ hay que leer el JSON de cada piso | ✔ un `WHERE` |
| Migrar o borrar sin tocar planos | ✘ reescribiría versiones | ✔ |

La balanza se inclina por el documento porque la calibración **no es un dato
operativo**: es parte de la interpretación del dibujo. Un informe del 15 de marzo
debe poder decir «calculado con la calibración de la versión 7, ±2 %», y eso solo
se sostiene si el factor está dentro de la versión.

La única pega real es la consulta por piso. Se resuelve cuando haga falta con una
proyección (§6.3), no antes.

### 6.3 Proyección opcional (fase posterior, no ahora)

Si aparece la necesidad de listar o sumar («pisos sin calibrar de la empresa»):

```sql
-- Migración 8, solo si se aprueba
CREATE TABLE floor_calibration (
  floor_id     INTEGER PRIMARY KEY REFERENCES floors(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,          -- versión del diseño de la que sale
  calibrated   INTEGER NOT NULL DEFAULT 0,
  meters_per_unit REAL,
  tolerance_pct   REAL,
  verified     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Es **derivada**: se reescribe al guardar y se puede reconstruir desde
`floors.design_json`. Nunca es la fuente de verdad, y borrarla no pierde nada.

### 6.4 Migración

**Ninguna.** `canvas.calibration` es opcional:

- Planos existentes: no la tienen → declarados → mismo comportamiento, mismas
  cifras, mismo `user_version = 7`.
- No hay cambio de esquema en la etapa A.
- No se reescribe ningún `design_json` histórico.
- La tabla de §6.3, si se aprueba, es una migración 8 y se puede aplicar sola.

---

## 7. Validación con dimensiones adicionales

Una sola medida puede estar mal. La calibración se verifica con otra distancia
conocida, en otro sitio del plano.

### 7.1 Reglas

| Regla | Valor |
| --- | --- |
| Comprobaciones por plano | 0…5 |
| Se guardan en el documento | sí, dentro de `calibration.checks` |
| Cada comprobación | `measuredU`, `knownM`, `tolerancePct`, `at`, `by` |
| Criterio de coincidencia | `abs(measuredU × metersPerUnit − knownM) ≤ tolerancePct% × knownM` |
| Estado | `verified` si **al menos una** comprobación cuadra; `unverified` si hay comprobaciones y ninguna cuadra; `unchecked` si no hay |
| Una comprobación que falla | no invalida la calibración ni la borra: se muestra, se guarda y se avisa |
| Recalibrar | descarta las comprobaciones (eran de otro factor) y lo dice antes |

El margen de la comprobación es **el suyo**, no el de la calibración: se puede
verificar un plano calibrado a ±2 % con una medida de puerta a ±0,5 cm.

### 7.2 Ejemplo numérico

```text
calibración   measuredU 418,6 cm · knownM 4,20 m  →  1 cm = 1,00334 cm  (+0,334 %)
comprobación  measuredU 900,0 cm · knownM 9,03 m
              error = |900 × 0,010033444 − 9,03| = |9,0301 − 9,03| = 0,0001 m
              margen = 2 % × 9,03 = 0,1806 m          →  cuadra, verificado
```

Y el caso que hay que detectar:

```text
comprobación  measuredU 900,0 cm · knownM 9,60 m
              error = |9,0301 − 9,60| = 0,57 m  >  0,192 m   →  no cuadra
              mensaje: «La segunda medida no cuadra: el plano dice 9,03 m y tú
              mediste 9,60 m (6,3 % de diferencia, tolerancia ±2 %). Revisa la
              primera medida o vuelve a calibrar con esta.»
```

### 7.3 Qué NO hace la verificación

- No corrige el factor (nunca dos medidas deciden un factor a espaldas del usuario).
- No promedia calibraciones: promediar dos medidas de sitios distintos esconde el
  error en lugar de mostrarlo.
- No declara conformidad de nada: el texto que acompaña es «medida verificada»,
  jamás «cumple».

---

## 8. Cambio de unidad

### 8.1 Matriz de casos

| Estado del plano | Qué hace el sistema | Diálogo |
| --- | --- | --- |
| Sin elementos | cambia la unidad; la calibración, si existe, se actualiza o se descarta | no |
| Con elementos, **con** reconversión | reconvierte geometría y calibración en una sola operación atómica | sí, obligatorio (§9) |
| Con elementos, **sin** reconversión | **no se ofrece**. Era la vía del cambio silencioso; desaparece | — |
| Calibrado y reconvertido | el factor se transforma con la misma regla que la geometría: la longitud física no cambia | sí, y muestra el factor antes y después |
| Calibrado y la reconversión no es viable | se rechaza con el motivo exacto; el plano queda **obsoleto** si alguien fuerza la unidad por importación | sí |

### 8.2 El invariante

La reconversión no cambia el tamaño físico del plano. Entonces:

```text
L_físico = L_vieja × f_vieja = L_nueva × f_nueva
L_nueva  = L_vieja × k          con  k = nominal_viejo / nominal_nuevo
⇒ f_nueva = f_vieja / k = f_vieja × nominal_nuevo / nominal_viejo
```

Comprobación (`cm → m`, factor calibrado 0,0100334 m/u):

```text
k = 0,01 / 1 = 0,01     →   1 600 u × 0,01 = 16 u        (16 m sigue siendo 16 m)
f = 0,0100334 / 0,01 = 1,00334 m/u                        (16 m medidos, medidos)
16 × 1,00334 = 16,0535 m                                  (igual que antes)
```

Ida y vuelta `cm → m → cm` devuelve el factor original con el error de coma
flotante de dos divisiones (≈1·10⁻¹⁶ relativo), muy por debajo de los 9 decimales
guardados. Se fija con una prueba de ida y vuelta **sobre el documento completo**,
no sobre el factor.

### 8.3 Qué se reconvierte y qué no

La reconversión cambia el **sistema de coordenadas del lienzo**, así que afecta a
todo lo que está expresado en unidades del lienzo. No es lo mismo que «convertir
magnitudes físicas» (`DIMENSIONAL.md` §3): allí se decide qué se mide, aquí se
reescala el dibujo.

| Campo | ¿Se multiplica por `k`? | Por qué |
| --- | --- | --- |
| `canvas.width`, `canvas.height` | **sí** | es el tamaño del lienzo en unidades |
| `canvas.grid` | **sí** | paso de rejilla en unidades del lienzo |
| `element.x`, `y`, `w`, `h` | **sí** | geometría |
| `element.points[].x/y`, `curves[].through.x/y` | **sí** | geometría |
| `element.stroke` | **sí** | grosor dibujado en unidades; sin esto un muro de 2 cm se vuelve de 2 m |
| `element.fontSize` (texto y cota) | **sí** | ídem |
| `element.widthM`, `lanes`, `section`, `junction` | **no** | ya están en metros (anchura de vía, carriles) |
| `element.voltage`, `gauge`, `phases`, `circuit`, `load` | **no** | unidades eléctricas |
| `element.slope`, `pressure`, `diameter`, `material` | **no** | % y kPa, catálogo |
| `element.extMountCm`, `extCapacityLb`, `extRating` | **no** | declarados en cm/lb por el fabricante |
| `elements[].label`, `note` | **no** | texto del usuario. Si rotula una medida escrita a mano, se avisa (§8.5) |
| `canvas.occupancy` | **no** | personas |
| `canvas.scale` | **no** | es una referencia de impresión, no una medida |
| `calibration.metersPerUnit` | **dividido por `k`** | §8.2 |
| `calibration.measuredU`, `checks[].measuredU` | **multiplicado por `k`** | son distancias del dibujo |
| `calibration.unit` | **pasa a la nueva** | queda coherente con el lienzo |
| `calibration.knownM`, `knownInput`, `tolerancePct`, `at`, `by` | **no** | evidencia: no se reescribe |
| `layers`, `groups`, `ids`, `z-order` | **no** | estructura |

### 8.4 La pared: los rangos del validador (§2.2 C-03)

Con los límites de hoy, ninguna unidad de destino es viable para un plano real.
Antes de escribir una línea de reconversión hay que decidir qué pasa con los
rangos. **Tres opciones, no hay cuarta:**

**Opción 1 · Ventana física por unidad (recomendada).** Los límites dejan de ser
números sueltos y pasan a ser una ventana en metros, traducida a cada unidad, con
la regla de **nunca rechazar lo que hoy se acepta**:

```text
mínimo(unidad) = min( límite_actual, metros_a_unidades(1 m) )
máximo(unidad) = max( límite_actual, metros_a_unidades(200 m) )

cm : 100 … 20 000     (antes 400 … 4 000)
m  : 1 … 4 000        (antes 400 … 4 000)
mm : 400 … 200 000    (antes 400 … 4 000)
```

Y los topes de elemento pasan a ser relativos a la caja del lienzo (que ya se
comprueba en `:466`) más un tope absoluto contra valores absurdos, en vez del
10 000 fijo.

**Dos campos más se resisten.** `canvas.grid` se valida con `integer()`
(`:283`), y una cuadrícula de 20 cm en un plano en `m` son 0,2 unidades: no hay
entero posible, así que la ampliación tiene que **aceptar decimales** en la
cuadrícula (ventana física de 1 mm a 1 m). `fontSize` ya acepta decimales
(`:482-484`) pero su rango es 8…160 sin unidad asociada: en `m`, una letra de 14 cm
es 0,14 y no pasa; en `mm`, 140 sí. Los dos necesitan la misma ventana física
(fuente de 2 mm a 40 cm).

Los documentos guardados no cambian: un `20` sigue siendo un `20` y se interpreta
igual, y un `14` también. Es una ampliación de tipo y de rango, no una migración,
pero toca el validador, el editor y las pruebas de los dos, y por eso va en la
etapa C y no en la A.

| Coste | Riesgo |
| --- | --- |
| tocar `DesignValidator` y sus pruebas | aceptar documentos que hoy se rechazarían (dirección segura) y **no** rechazar ninguno que hoy se acepte (verificable con un test de compatibilidad) |
| el JSON de un plano en `mm` crece (más dígitos) | sigue muy por debajo de 2,5 MB |

**Opción 2 · Prohibir el cambio de unidad con elementos.** Sin tocar rangos: si el
plano tiene algo dibujado, la unidad no se cambia; se crea un piso nuevo en la
unidad correcta y se importa. Es barata y honesta, pero deja P-01 sin resolver y
castiga a quien eligió `cm` por error al empezar.

**Opción 3 · Sistema interno normalizado** (guardar siempre en una unidad canónica
y presentar en la declarada). Es la solución de los CAD grandes y la más limpia a
largo plazo… y la más cara: obliga a migrar todos los documentos y a tocar los dos
motores. Fuera de alcance hoy.

Mi recomendación: **Opción 1**, con el test de compatibilidad como puerta, y solo
después de la etapa A (calibración), que no necesita nada de esto.

### 8.5 Avisos obligatorios de la reconversión

1. **Cotas con texto escrito a mano.** Si una cota tiene `label` no vacío, el texto
   no se reescribe (es del usuario) pero puede quedar mintiendo. Se listan y se
   avisa: «2 cotas con texto escrito por ti no se actualizan».
2. **Tolerancia de aplanado.** Cambia con la unidad; el dibujo de los arcos puede
   diferir en milésimas de unidad. No se avisa: es invisible y no mueve medidas.
3. **Calibración obsoleta.** Si alguien cambia la unidad por una vía que no
   reconvierte (importación, edición manual del JSON), `stale` aparece solo y el
   pie lo dice: «calibración no válida: cambió la unidad del plano».
4. **Redondeo a 2 decimales.** El validador redondea coordenadas a 2 decimales
   (`:608`). En `m`, eso es 1 cm de resolución; en `mm`, 0,01 mm. Se documenta
   pero no se cambia: alterar el redondeo movería cifras.

---

## 9. Confirmación previa a la reconversión

### 9.1 Dos fases, con token

```text
POST /projects/{p}/floors/{f}/unidad/preview
  { "unit": "m" }
  → 200 {
      token: "sha256(documento + unit + expiración)",
      expires_at: "…+10 min",
      viable: true,
      cambios: { canvas: {…}, elementos: {reconvertidos: N, sin_cambio: M},
                 cotas_con_texto: 3, calibracion: {…} },
      muestra: [ {id, campo, antes, despues} … ≤12 ],
      resumen_antes: {areaM2, recorridoMaxM, anchoVanoMinM, ocupacionEstimada},
      resumen_despues: {…},
      avisos: [ … ]
    }
  → 422 { viable: false, motivo: "…", elementos_fuera_de_rango: [ids] }

POST /projects/{p}/floors/{f}/unidad/apply
  { "token": "…", "note": "…" }
  → 200 { version: N+1, aplicado: true, diffs: {…} }
  → 409 { motivo: "el plano cambió desde la vista previa" }
  → 410 { motivo: "la vista previa caducó; vuelve a calcularla" }
```

`token = sha256(design_json + unit_destino + expiración + secreto_de_sesión)`. El
servidor **recalcula** la reconversión al aplicar y comprueba que el resultado
coincide con el que describió la vista previa (mismo hash de documento de entrada
y misma operación). Así la promesa y el efecto son el mismo objeto.

### 9.2 Qué muestra el diálogo

Un diálogo, una tabla, cifras reales (no «los valores se ajustarán»):

```text
┌─ Cambiar la unidad del plano: cm → m ────────────────────────────────────┐
│ El dibujo se reescala para que el plano siga midiendo lo mismo.          │
│                                                                          │
│  Antes                           Después                                 │
│  Lienzo      1 600 × 1 000 cm    16 × 10 m                               │
│  Área        160,00 m²           160,00 m²            (no cambia)        │
│  Recorrido   17,38 m             17,38 m              (no cambia)        │
│  Calibración ±2 % · 1 u = 1,00334 cm  →  1 u = 1,00334 m                 │
│  93 elementos reconvertidos · 0 fuera de rango                           │
│  2 cotas con texto escrito por ti no se actualizan                       │
│                                                                          │
│  Se guardará como versión 8 con la nota «Cambio de unidad cm → m».       │
│                                 [ Cancelar ]   [ Cambiar a metros ]      │
└──────────────────────────────────────────────────────────────────────────┘
```

Detalles del diálogo:

- **Nunca** un «¿Seguro?» genérico: siempre tabla de antes/después con las cifras
  que el usuario reconoce de su informe —lienzo, área, recorrido y calibración—.
- El área y el recorrido **deben salir iguales** (dentro de 0,01). Si no salen
  iguales, es un error del sistema y el diálogo lo dice en rojo, no lo esconde.
- Si la reconversión no es viable, el diálogo no aparece: aparece el motivo y qué
  se puede hacer.
- Se ofrece «guardar una versión antes»; por defecto activado si el plano tiene más
  de 50 elementos.
- La nota de la versión la escribe el sistema (incluye unidades), y el usuario
  puede añadir la suya.

### 9.3 Lo que hace imposible la conversión silenciosa

| Mecanismo | Efecto |
| --- | --- |
| No existe endpoint de cambio de unidad sin token | no hay atajo por API |
| `apply` exige token vigente y hash coincidente | no se puede reutilizar una vista previa de otro plano o de otro momento |
| Toda reconversión escribe una versión con nota | queda en el historial y en el informe |
| El pie del plano imprime la unidad y si está calibrado | quien lo lee lo sabe |
| Importar un JSON con otra unidad **no** es un cambio de unidad | se sustituye el diseño entero; el diálogo de importación compara la unidad entrante con la actual y avisa de que las medidas cambiarán, sin reconvertir nada |

---

## 10. Compatibilidad y migración

### 10.1 Regla de oro

> Un plano sin `calibration` se comporta **exactamente** como en la 1.18.0: mismas
> cifras, mismo SVG, mismas pruebas.

### 10.2 Qué pasa con cada documento

| Documento | App nueva | App 1.18.0 |
| --- | --- | --- |
| `format: 2` sin calibración | se abre igual | se abre igual |
| `format: 3` con curvas | se abre igual | se abre igual |
| `format: 4` con sección de vía | se abre igual | se abre igual |
| `format: 5` con `canvas.calibration` | se abre, muestra «calibrada» | **se rechaza**: «La versión del formato del diseño no es compatible.» |
| JSON exportado (sobre `schema_version: 3`) | se importa | se rechaza: «El archivo no corresponde a un plano compatible» |
| JSON exportado (`schema_version: 2`) | se importa | se importa |

### 10.3 La versión de formato, y por qué hace falta

`DesignValidator` deriva `format` de lo que encuentra (`:69`, `:91`) y rechaza
claves desconocidas (`:275`). Sin subir la versión, un plano calibrado abierto por
una build anterior fallaría con «El lienzo contiene una propiedad no permitida»:
un mensaje que no ayuda a nadie y que parece un archivo corrupto.

Propuesta:

```text
format = 5  si hay canvas.calibration   (gana a 4, 3 y 2)
         = 4  si hay section
         = 3  si hay curves
         = 2  en el resto
sobre (JSON exportado): schema_version = 3  si el diseño es calibrado, 2 si no
```

Ganancia: la build anterior falla **por versión**, con un mensaje que se puede
traducir a «este plano se guardó con una versión más nueva de Normia». Hay que
mejorar ese texto en la interfaz (hoy es un error de dominio crudo) — un cambio de
una frase, no de arquitectura.

Coste: dos constantes y un `if`. Riesgo: ninguno sobre documentos existentes.

### 10.4 El golden de la etapa 0

Los 6 405 valores y los 4 hash SVG **no se tocan**. Se añade un bloque nuevo:

```text
synthetic.calibracion = {
  sinCalibracion: { factor, areaM2, recorridoM, anchoVanoM },   // idéntico al actual
  calibrada334:   { factor, areaM2, recorridoM, anchoVanoM },   // factor sintético
  obsoleta:       { factor, … }                                 // vuelve al nominal
}
```

La primera rama demuestra que el camino sin calibración devuelve el mismo flotante.
Sin eso, la etapa A no se puede fusionar.

### 10.5 APK, escritorio y respaldos

- **APK y Electron** llevan el código dentro: actualizar la app actualiza el
  validador. Un plano calibrado leído por un APK viejo se rechaza por versión; el
  mensaje debe decir que hace falta actualizar, no que el archivo esté roto.
- **Respaldo/restauración** (`Backup`): un respaldo hecho con la versión nueva y
  restaurado en la vieja contiene planos calibrados que no se abrirán. Se añade al
  `BUILD.txt` del respaldo la versión de formato máxima encontrada, para que el
  diagnóstico sea inmediato. Es un campo de texto, no un cambio de esquema.
- **Modo brigadista** (página pública): muestra el plano; si está calibrado, el pie
  lo dice igual que en el editor. Sin cambios de esquema.

---

## 11. Consumidores de la dimensión calibrada

Esta es la tabla de trabajo de la implementación: **nadie** debe seguir llamando a
`Units::metersPerUnit($unit)` con la unidad suelta.

| # | Consumidor | Hoy | Qué debe pasar | Qué debe mostrar |
| --- | --- | --- | --- | --- |
| 1 | `PlanAudit::analyze` (`:98`, `:107-109`) | nominal | `PlanScale::of($canvas)`; afecta ancho de vano (`:122`), recorrido (`:294`), distancia a salida (`:310`), área libre y ocupación estimada (`:352-357`) | informes con «calibrada ±2 %» y la fecha de calibración |
| 2 | `PlanGrid::build` (`:31-53`) | nominal | `cellM` y `clearance` con el factor efectivo | la rejilla sigue siendo de 10 cm físicos |
| 3 | `ExtinguisherCoverage::analyze` (`:31`, `:252-258`) | **asume cm** (C-06) | `PlanScale` para `signDistanceM` y para comparar con `signRadiusCm` | distancia a la señal en metros honestos |
| 4 | `MepCalculator::lengthMeters` (`:47`) | nominal | factor efectivo; el rótulo del SVG (`SvgExporter:334`) hereda | longitud de red y caída de tensión |
| 5 | `SvgExporter::render` (`:16`, `:39`) | sin mm físicos | en esta etapa **no cambia el tamaño**; sí el bloque de datos y la escala gráfica cuando llegue la etapa 1 | «escala declarada» o «calibrada ±X %» |
| 6 | `PlanFooter::payload` (`:128-151`) | escala y unidad | añadir una línea de dimensión: `calibrada ±2 % · 02/11/2026` o `declarada` | pie del plano y del informe |
| 7 | Cotas (`renderer.js:1011`, `SvgExporter:265`) | unidades | rótulo en metros cuando el plano está calibrado (`source: auto`), unidades si no | «4,20 m» con la cifra calibrada |
| 8 | `measure.js` (`:23`, `:162`) | nominal + holguras en cm (C-07) | `Normia.Scale`; `CELL`/`CLEARANCE` derivados de cm físicos | distancias y tiempos de recorrido |
| 9 | `schedule.js` (`:147`, `:195`) | nominal + división en línea (C-08) | una sola función de área con el factor efectivo | área del piso y lámina sugerida |
| 10 | Barra de estado del editor (`editor.js:722`) | «1:100 · referencia» | «1:100 · calibrada ±2 %» | estado visible en todo momento |
| 11 | Panel de lienzo (`index.php:579`) | campo «Escala de referencia» | bloque «Dimensión» con estado y botón de calibrar | punto de entrada |
| 12 | Informe de revisión (`audit-report.php`) | sin condición dimensional | cabecera con la condición y la evidencia | trazabilidad |
| 13 | Exportación JSON (`ExportController:39`) | sin condición | `schema_version` 3 y el bloque dentro del diseño | el receptor sabe qué recibió |
| 14 | Modo brigadista (`brigade`) | plano | pie con la condición | quien lo usa en campo |
| 15 | Verificación física (`Check`/`Verification`) | sin distancias | sin cambios en la etapa A; en la etapa 6 medirá anchos reales | — |

Efectos de segundo orden que hay que tener escritos, porque son los que sorprenden:

- La **ocupación estimada** depende del área libre: un factor +0,334 % da +0,67 %
  de superficie y puede subir una persona (`round(160 × 0,2) = 32` →
  `round(161,07 × 0,2) = 32`; con 200 m² sí cambia).
- El **ancho de vano** se compara con `minExitWidthCm`: un vano de 90 cm medido en
  un plano calibrado al 0,33 % se informa como 0,903 m. La comparación con el
  criterio no cambia de veredicto, pero el número del informe sí.
- La **rejilla** tiene 10 cm físicos en los dos casos; lo que cambia es cuántas
  celdas caben, no su tamaño.
- **`dimension.source` no existe todavía.** Hoy una cota solo tiene `label`
  (`DesignValidator.php:477-486`): añadir `auto`/`manual` es otra clave nueva del
  documento, con el mismo trámite de versión de formato que `calibration`. Sin
  ella, la cota calibrada se calcula al vuelo y solo se distingue de un texto
  escrito a mano porque `label` está vacío.

---

## 12. Casos de prueba y criterios de aceptación

### 12.1 Unitarias (PHP y JS, el mismo fixture)

| ID | Caso | Esperado |
| --- | --- | --- |
| P-01 | `PlanScale::of()` sin `calibration` | `metersPerUnit` **bit a bit** igual a `Units::metersPerUnit` |
| P-02 | factor `4,20 / 418,6` | `0.010033445` (9 decimales), desviación `+0,3344 %`, estado `calibrada` |
| P-03 | `cmPerUnit` calibrado | `1.003344482` (= 0,010033445 × 100) |
| P-04 | `squareMeters(1 600 000, cm)` calibrado (lienzo de la demo) | `161.07` (±0,01) frente a `160.00` nominal |
| P-05 | `tolerance()` calibrada | `0.5 / cmPerUnit` ≈ `0.49833` |
| P-06 | `calibration.unit` ≠ `canvas.unit` | `stale = true` y factor **nominal** |
| P-07 | `checks` con error dentro del margen | `verified = true` |
| P-08 | `checks` con error fuera del margen | `verified = false`, pero la calibración sigue vigente |
| P-09 | paridad PHP↔JS del fixture `scale.json` | igualdad estricta en 18 casos |
| P-10 | validación del bloque | rechaza `method` desconocido, `knownM < 1`, `tolerancePct` fuera de 0,1…10, `measuredU` que no llega a 1 cm de medida, factor fuera de 0,2×…5× |
| P-11 | `calibration` con 6 comprobaciones | rechazo: máximo 5 |
| P-12 | `calibration.measuredU` mayor que el lienzo | rechazo: «la medida no cabe en el plano» |

### 12.2 Integración (functional, PHP 8.1 y 8.3)

| ID | Caso | Esperado |
| --- | --- | --- |
| I-01 | calibrar y guardar | 200, versión +1, nota «Calibración», `format: 5` |
| I-02 | calibrar y reabrir | misma evidencia, mismos números |
| I-03 | plano sin calibrar | mismo SVG y mismos 6 405 valores que la 1.18.0 |
| I-04 | calibrar un plano sin permiso de escritura | 403 |
| I-05 | calibrar dos veces | dos versiones; el histórico conserva la primera |
| I-06 | quitar calibración | vuelve al nominal, versión nueva, nota «Calibración retirada» |
| I-07 | vista previa de cambio de unidad | `viable`, token, tabla con área y recorrido iguales |
| I-08 | aplicar sin token | 400 |
| I-09 | aplicar con token de otro plano | 400 |
| I-10 | aplicar con token caducado | 410 |
| I-11 | cambiar el plano entre vista previa y aplicación | 409, y la vista previa deja de valer |
| I-12 | reconversión no viable (demo `1600 × 1000 cm → m`) | 422 con el motivo «el lienzo quedaría en 16 unidades y el mínimo es 400» |
| I-13 | reconversión viable con la ventana física aprobada | área y recorrido idénticos dentro de 0,01; calibración transformada (§8.2) |
| I-14 | importar `schema_version: 3` | se importa con calibración |
| I-15 | importar `format: 5` crudo | rechazo explícito |

### 12.3 Regresión e invariantes

| ID | Caso | Esperado |
| --- | --- | --- |
| R-01 | golden de la etapa 0 | 6 405 valores y 4 hash SVG idénticos |
| R-02 | ida y vuelta `cm → m → cm` (con la ventana aprobada) | documento idéntico salvo `version`; factor igual en 9 decimales |
| R-03 | auditor de un plano calibrado | todas las cifras escaladas por el factor, ninguna otra diferencia |
| R-04 | SVG de un plano calibrado | mismo `viewBox`, mismas coordenadas; solo cambia el texto del pie |
| R-05 | plano `format: 3` sin calibración en la versión nueva | idéntico byte a byte al de la 1.18.0 |
| R-06 | respaldo y restauración con planos calibrados | se abren; el `BUILD.txt` declara la versión de formato máxima |

### 12.4 Criterios de aceptación

Etapa A · calibración (aplicable ya):

- [ ] Un plano sin `calibration` produce **exactamente** los mismos números y el
      mismo SVG que la 1.18.0 (golden intacto).
- [ ] `PlanScale` es el único sitio del código que decide el factor efectivo;
      `grep` no encuentra consumidores llamando a `Units::metersPerUnit($unit)`
      con la unidad suelta.
- [ ] El factor guardado se puede recalcular desde la evidencia
      (`knownM / measuredU`) con 9 decimales de coincidencia.
- [ ] Una calibración cuya unidad no coincide con la del plano se marca obsoleta
      y se calcula con el nominal: nunca se aplica un factor dudoso en silencio.
- [ ] El pie del plano y el informe dicen «calibrada ±X %» o «declarada», nunca
      nada intermedio.
- [ ] `format: 5` y `schema_version: 3` solo aparecen cuando hay calibración.
- [ ] Ningún mensaje del sistema afirma exactitud, cumplimiento ni certificación.
- [ ] PHP y JS dan el mismo factor con igualdad estricta.

Etapa B · verificación con medidas adicionales:

- [ ] Una comprobación dentro del margen marca el plano «verificada».
- [ ] Una comprobación fuera del margen avisa con las dos cifras y el porcentaje,
      y no modifica el factor.
- [ ] Recalibrar descarta las comprobaciones avisando antes.

Etapa C · cambio de unidad:

- [ ] No existe forma de cambiar la unidad de un plano con elementos sin pasar por
      la vista previa y el token.
- [ ] El diálogo muestra, con cifras reales, lienzo, área, recorrido, calibración y
      el recuento de elementos afectados.
- [ ] El área y el recorrido no cambian al reconvertir (tolerancia 0,01).
- [ ] La reconversión imposible se rechaza con el motivo exacto y el elemento o el
      campo que lo impide.
- [ ] Cada reconversión deja versión con nota, y el informe de diferencias queda
      consultable.

---

## 13. Riesgos y decisiones que necesitan tu aprobación

### 13.1 Riesgos técnicos

| ID | Riesgo | Prob. | Impacto | Mitigación |
| --- | --- | --- | --- | --- |
| R-01 | Un plano calibrado con una medida mala produce números «verificados» falsos | media | alto | tolerancia declarada visible, verificación con segunda medida, texto que nunca dice «cumple» |
| R-02 | La reconversión mueve cifras por redondeo a 2 decimales | alta | medio | prueba de ida y vuelta; área y recorrido como invariantes del diálogo |
| R-03 | Ampliar rangos del validador acepta documentos absurdos | media | medio | tope absoluto además de la caja; prueba de compatibilidad: nada que hoy se acepte puede rechazarse |
| R-04 | Dos versiones de la app conviven (APK viejo, escritorio nuevo) | media | alto | fallo por versión de formato, mensaje claro, nota en el respaldo |
| R-05 | El usuario cree que «calibrada» significa «exacta» | alta | alto | vocabulario fijo (§3), tolerancia siempre junto a la palabra |
| R-06 | El aplanado de arcos cambia al calibrar y altera una medida en 1 mm | baja | bajo | tolerancia efectiva, prueba de rango; se documenta como aceptado |
| R-07 | C-06 y C-07 se arreglan a la vez y mueven cifras de planos en `m`/`mm` | baja | medio | arreglarlos **con** la calibración; los planos reales están en `cm`; se anuncia en el changelog |
| R-08 | Alguien edita el JSON a mano y pone un factor absurdo | baja | medio | validación de rango 0,2×…5× en la puerta del documento |

### 13.2 Decisiones que necesito de ti

**DEC-A · ¿La calibración vive en el documento?**
Recomendación: **sí** (`canvas.calibration`), por reproducibilidad y offline (§6.2).
Alternativa: tabla aparte, más fácil de consultar y más frágil.

**DEC-B · ¿Qué hacemos con los rangos del validador?**
Recomendación: **Opción 1 de §8.4** (ventana física por unidad, solo ampliando),
pero **después** de la etapa A. Sin esto, el punto 5 de la misión no se puede
cumplir. Alternativa: Opción 2 (prohibir el cambio de unidad con elementos), más
barata y deja P-01 abierto.

**DEC-C · ¿Subimos el formato a 5 y el sobre a 3?**
Recomendación: **sí**. Es la diferencia entre «este plano es de una versión más
nueva» y «el lienzo contiene una propiedad no permitida».

**DEC-D · ¿La calibración invalida la escala de impresión declarada?**
Recomendación: **no la toca y no la corrige**. La escala `1:N` sigue siendo
referencia; la calibración solo alimenta el tamaño físico en la etapa 1. Si el
usuario calibra, se le muestra la escala natural resultante (`1:44`, por ejemplo)
como sugerencia, nunca se sobrescribe la declarada.

**DEC-E · ¿Las cotas pasan a metros?**
Recomendación: **sí, cuando el plano está calibrado**, y se mantienen en unidades
cuando no. Con `source: auto` se recalculan; con texto escrito por el usuario se
conserva el texto y se avisa de la discrepancia (>2 %).

**DEC-F · ¿Arreglamos C-06 (extintores ÷100) y C-07 (holguras en cm) en la misma
etapa?**
Recomendación: **sí**, porque ambos deben pasar a `PlanScale` de todos modos y
dejarlos con el factor nominal dentro de un código que ya usa el efectivo es peor.
Se anuncian en el changelog: solo afecta a planos declarados en `m` o `mm`, que hoy
dan cifras equivocadas.

**DEC-G · ¿Cuántas comprobaciones y qué margen por defecto?**
Recomendación: hasta **5** comprobaciones, margen por defecto **±2 %**, mínimo
±0,1 % y máximo ±10 %; `canvas-width` no admite menos de ±3 %.

---

## 14. Plan de etapas

| Etapa | Qué | Toca | Riesgo | Esfuerzo |
| --- | --- | --- | --- | --- |
| **A · Calibración** | `PlanScale` en PHP y JS, bloque `canvas.calibration`, validación, formato 5, sobre 3, pie y estado, 15 consumidores migrados, golden nuevo | `Units`, `PlanScale` nuevo, `DesignValidator`, 8 servicios, 5 JS, vistas | bajo | ~1,5 unidades |
| **B · Verificación** | `checks`, estado `verified`, mensajes, descarte al recalibrar | `PlanScale`, editor, informe | bajo | ~0,5 |
| **C · Cambio de unidad** | ventana de rangos (DEC-B), preview/apply con token, diálogo, reconversión atómica, pruebas de ida y vuelta | `DesignValidator`, `Floor`, controlador, editor, pruebas | **alto** | ~2 |

Dependencias: B depende de A; C depende de A y de DEC-B. A no depende de nada y
se puede fusionar sola.

Fuera de alcance de esta misión, aunque la calibración los habilite:

- tamaño físico del SVG, escala gráfica y `print.css` (etapa 1 de NORMIA-004);
- áreas con identidad y aforo (etapas 2 y 3);
- medición real de anchos de vano en sitio (etapa 6).

---

## 15. Lo que no pude verificar

1. **No implementé nada.** Todo lo que dice «debe» es diseño; nada está probado
   ejecutando, salvo los hallazgos de §2, que sí comprobé leyendo el código exacto
   y, en el caso de C-03, calculando los rangos.
2. **No medí el rendimiento** de la reconversión en un plano de 1 200 elementos.
   Es aritmética lineal: estimo milisegundos, no lo afirmo.
3. **No conozco tus planos reales.** La afirmación «ningún plano de edificio puede
   cambiar de unidad» sale de la aritmética de §2.2 C-03: a `m` haría falta un
   lienzo de 400 m a 4 km; a `mm`, uno de 0,4 m a 4 m (solo 400 × 300 cm encaja, y
   la cuadrícula lo tumba). Si tienes un plano que hoy cambia de unidad sin error,
   quiero verlo: cambiaría C-03.
4. **No verifiqué la exactitud normativa** de los umbrales del auditor, los
   extintores ni las redes. La calibración mejora la medición, no la norma.
5. **No evalué accesibilidad** del diálogo ni de la hoja de calibración.
6. **No probé en dispositivos reales** (APK, Electron, iOS). La compatibilidad de
   §10.5 se deduce del código.
7. **El error de mensaje de versión de formato** (`DesignValidator:69`) hoy es un
   `DomainException` crudo; no comprobé cómo lo presenta cada pantalla.
