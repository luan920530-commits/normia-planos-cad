# NORMIA-006 · Dimensiones simples

Rediseño del sistema de dimensiones de Normia CAD para que un profesional de SST
pueda dibujar, anotar medidas y recibir cálculos sin aprender metrología.

| | |
| --- | --- |
| Misión | 004 — diseño y ajuste funcional, **sin implementación** |
| Rama | `arena/48ee92e3-normia-planos-cad` |
| Base | `bddc2dc` (NORMIA-005 entregado, PR #56 abierto) |
| Reemplaza en parte | [`NORMIA-005-CALIBRACION-DIMENSIONAL.md`](NORMIA-005-CALIBRACION-DIMENSIONAL.md) — §8 de trazabilidad |
| Alcance | **3.A a 3.J** — los nueve apartados, recibidos el 2026-11-02 |
| Estado | **diseño completo**; DEC-1, DEC-2, DEC-5 y DEC-6 implementadas en la 1.19.0 (§26); **aforo calculado y publicado** en la 1.20.0 (§27); **ajuste global por mediana** en la 1.21.0 (§28); **escala física al exportar (DEC-8)** en la 1.22.0 (§29); **recursos de primeros auxilios en el cálculo** en la 1.23.0 (§30); **escenarios de ocupación temporal** en la 1.24.0 (§31) y **simulacro animado** en la 1.25.0 (§32); DEC-7 y DEC-9 a DEC-12 pendientes |

---

## 0. Qué cambia, y qué no llegó

La misión anterior diseñó una **calibración**: un procedimiento con dos clics,
distancia real, margen, instrumento, verificación con una segunda medida y un
estado `obsoleto` cuando cambia la unidad. Era correcto como metrología y era
demasiado para el usuario que la herramienta tiene delante: alguien de SST que
necesita el plano de emergencia el jueves, no un certificado de escala.

Esta misión cambia el eje: **el plano no se calibra, se mide al dibujar**. Cada
medida que la persona escribe manda sobre ese objeto; el sistema hace el resto y
dice de dónde salió cada número. Nada es obligatorio.

| Se elimina | Se conserva | Se añade |
| --- | --- | --- |
| el ritual de calibración (dos puntos, margen, instrumento, nota) | la autoridad única de unidades de la etapa 0 | geometría guardada siempre en centímetros |
| la verificación con medidas adicionales | el golden de regresión numérica | la unidad de trabajo: `mm`, `cm`, `m` para leer y escribir |
| el estado `obsoleto` y la invalidación al cambiar de unidad | la cota, el pie y el informe | una medida declarada por objeto, opcional |
| la ventana nueva de rangos del validador (DEC-B de NORMIA-005) | el formato versionado y el historial | la etiqueta exacta / aproximada / estimada |
| la vista previa con token y caducidad para cambiar de unidad | el control de conflicto por versión | un ajuste global opcional, reversible, sin estado |
| el `grid` y el `fontSize` en decimales (se quedan enteros) | la escala `1:N` como referencia de impresión | el eco de la medida en las dos unidades |

**Nota de alcance.** El mensaje de la misión llegó en dos veces: primero el punto
**3.A (unidades)**, y el 2026-11-02 el resto —**3.B a 3.J**—. §1 a §12 diseñan el
**núcleo** (unidades, medidas y cálculos) y §13 a §25 diseñan los nueve apartados
restantes sobre ese núcleo, sin cambiar ninguna decisión aprobada. El documento
está completo en su alcance; lo que falta es aprobar DEC-7 a DEC-12 y decidir qué
etapa se implementa primero.

---

## 1. Los tres principios, en reglas que se pueden probar

Un principio que no se puede comprobar en una prueba es un deseo. Traducidos:

| Principio | Regla concreta | Cómo se comprueba |
| --- | --- | --- |
| **Sencillez** | Se puede dibujar, anotar y calcular **sin completar ningún campo obligatorio nuevo**. La medida es opcional y aparece donde ya se está trabajando. | Prueba de recorrido completo: crear piso, dibujar, exportar, sin tocar unidades ni medidas |
| **Sencillez** | Ningún diálogo pide instrumentos, márgenes, tolerancias ni verificaciones. En toda la interfaz no aparece la palabra «calibrar». | Búsqueda en vistas y cadenas |
| **Precisión** | Todo cálculo sale de una medida que el usuario reconoce: la geometría o la medida que él escribió. Nunca de un factor oculto. | Cada cifra del informe lleva su fuente al lado |
| **Precisión** | La coherencia es con **lo ingresado**: si escribes 4,20 m, el sistema dice 4,20 m en todas partes. | Prueba de ida y vuelta medida → rótulo → informe |
| **Flexibilidad** | Se puede trabajar sin declarar nada (aproximado) o declarando medidas (exacto), y el resultado dice cuál es cuál. | Un plano sin medidas produce un informe válido, marcado «del dibujo» |
| **Flexibilidad** | Cambiar de unidad **no cambia ninguna medida**. | El mismo plano en `cm` y en `m` da las mismas cifras |

Y una regla transversal, heredada de las misiones anteriores y que sigue en pie:
**nada cambia en silencio**. Lo que se quita es la ceremonia, no el aviso.

---

## 2. Lo que hay hoy, verificado

Cada punto con su archivo y su línea. Esto es lo que el rediseño tiene que
resolver o conservar.

### V-01 · Cambiar la unidad sí altera las dimensiones, y de golpe — **el defecto que la misión señala**

El formulario del lienzo aplica la unidad sin tocar la geometría:

```javascript
// assets/js/editor.js:2184-2191
this.model.setCanvas({ width: …, height: …, grid: …, unit: form.elements.unit.value, … });
```

```javascript
// assets/js/lib/model.js:2039-2053  (setCanvas)
if (patch.unit !== undefined && ['cm','m','mm'].includes(patch.unit)) canvas.unit = patch.unit;
```

Ninguna coordenada se convierte. En el plano de la demo (1 600 × 1 000 `cm`,
160 m²) basta elegir «m» en el desplegable para que el mismo dibujo pase a
medir **1 600 m × 1 000 m = 1 600 000 m²**: cien veces cada lado, **diez mil veces
la superficie**, sin un solo aviso. Es exactamente la «alteración inesperada» del
punto 3.A de la misión, y es el corazón de este documento.

### V-02 · Los campos de geometría hablan en unidades del lienzo y redondean

`assets/js/editor/inspector.js:645-651`: los campos X, Y, Ancho y Alto muestran el valor en
unidades del lienzo, con `Math.round`. Quien mide 4,20 m tiene que escribir
«420» y sabe que está en centímetros por el sufijo del campo. No es un error; es
una traducción mental que se le pide al usuario en cada elemento.

### V-03 · El lienzo y la cuadrícula solo funcionan en `cm`, y el rango está escrito tres veces

```php
// app/Services/DesignValidator.php:281-284
$width  = self::integer($canvas['width']  ?? null, 400, 4000, 'ancho del lienzo');
$height = self::integer($canvas['height'] ?? null, 300, 3000, 'alto del lienzo');
$grid   = self::integer($canvas['grid']   ?? 20,   5,   100, 'cuadrícula');
```

```javascript
// assets/js/lib/model.js:2041-2043
canvas.width  = G.clamp(Math.round(Number(patch.width)),  400, 4000);
canvas.height = G.clamp(Math.round(Number(patch.height)), 300, 3000);
canvas.grid   = G.clamp(Math.round(Number(patch.grid)),   5,   100);
```

```html
<!-- app/Views/editor/index.php:572-576 -->
<input type="number" name="width" min="400" max="4000" …>
<input type="number" name="height" min="300" max="3000" …>
<input type="number" name="grid" min="5" max="100" …>
```

Los tres son correctos en `cm` y no significan nada en otra unidad. Ese es el
motivo de que el cambio de unidad nunca se haya arreglado (NORMIA-005 §8.4).

### V-04 · Ya hay medidas en metros conviviendo con la geometría

`elements[].widthM` (ancho de vía), `section.laneM`, `section.islandM`,
`extMountCm`, `extCapacityLb`: el plano **ya mezcla** campos métricos con la
geometría en unidades del lienzo, y el inspector ya los muestra con su unidad
(`inspector.js:381` el ancho de isla en metros, `:344` el campo con sufijo de unidad). No es una excepción que haya que inventar: es el
patrón que ya existe y que conviene extender.

### V-05 · La cota rotula en unidades del lienzo

`assets/js/lib/renderer.js:1019-1020` (con `G.formatMeasurement`, `geometry.js:528`)
y `SvgExporter.php:265`: el rótulo es la distancia en unidades del lienzo
(«418,6 cm»), no en metros. Con la geometría en `cm` da igual, pero no
se puede leer en metros ni en milímetros sin cambiar la unidad del plano entero.

### V-06 · No existe ninguna medida declarada por objeto

Ni `measuredM` ni equivalente. La única forma de que un cálculo sea exacto es
que el dibujo esté dibujado a escala exacta, y no hay manera de comprobarlo ni de
corregirlo sin borrar y volver a dibujar.

### V-07 · La escala `1:N` sigue siendo una referencia

`canvas.scale` se valida (`DesignValidator.php:293`) y no interviene en ningún
cálculo; la barra de estado lo dice (`editor.js:722`). **Se queda igual**: esta
misión no toca impresión.

### V-08 · Los consumidores leen la unidad del lienzo

`PlanAudit.php:107-109`, `PlanGrid.php:37-53`, `MepCalculator.php:47`,
`ExtinguisherCoverage.php:257-258`, `measure.js:23-24`, `schedule.js:147-195`,
`SvgExporter.php:353`. Todos tendrán que pasar a la regla nueva de §3.

---

## 3. El modelo: dos capas que no se mezclan

La idea que simplifica todo lo demás:

> **La geometría se guarda siempre en centímetros. La unidad del plano es
> únicamente cómo se lee y cómo se escribe.**

Con eso, cambiar de unidad deja de ser una operación sobre el dibujo y pasa a ser
un cambio de etiqueta: no hay nada que reconvertir, nada que pueda salir mal, y
ninguna medida cambia.

### 3.1 Diagrama

```text
                          ┌────────────────────────────────────────┐
                          │ escribe «4,20» y elige «m»             │
                          │ lee «420 cm» · «4,20 m» · «4 200 mm»   │
                          │ la cota dice «4,20 m»                  │
                          └─────────────────┬──────────────────────┘
                                            │ Units::toCm(valor, unidad)  ← ya existe
                                            ▼
      ┌───────────────────────────────────────────────────────────────┐
      │ DOCUMENTO · la geometría vive en CENTÍMETROS                  │
      │                                                               │
      │ canvas    width, height, grid → cm (los límites actuales)     │
      │           unit                → unidad de trabajo (etiqueta)  │
      │ elements  x, y, w, h, points  → cm                            │
      │           measuredM, quality  → medida declarada (opcional)   │
      └──────────────────────────────┬────────────────────────────────┘
                                     │ lectura: valor_cm / 100
                                     │          Units::fromCm(valor, unit)
                                     ▼
      ┌───────────────────────────────────────────────────────────────┐
      │ SALIDA · cifras en metros y en la unidad de trabajo           │
      │ auditor · extintores · redes · cotas · pie · informe          │
      │ cada cifra dice si viene de la medida o del dibujo            │
      └───────────────────────────────────────────────────────────────┘
```

### 3.2 Las tres reglas

1. **Almacenamiento.** Toda coordenada, tamaño y punto se guarda en centímetros.
   Es el mismo rango numérico que hoy, así que el validador, el editor y los
   límites no cambian de valores: solo de significado.
2. **Lectura.** Todo lo que se muestra se convierte con `Units::fromCm(valor,
   canvas.unit)` — o `valor / 100` cuando la salida es en metros. La unidad es un
   formateador, no un factor de escala del dibujo.
3. **Escritura.** Todo lo que el usuario escribe se convierte con
   `Units::toCm(valor, unidad_de_entrada)`. La unidad de entrada puede ser
   distinta de la del plano: escribir 4,20 m en un plano en centímetros son
   420 cm, y el campo lo dice antes de aceptar.

### 3.3 Lo que esto elimina

| Antes (NORMIA-005) | Ahora |
| --- | --- |
| reconversión de 18 campos con su tabla (§8.3) | no hay reconversión: la unidad no toca la geometría |
| invariante del factor y prueba de ida y vuelta | una prueba más simple: mismas cifras con `cm` y con `m` |
| vista previa con token, caducidad y 409/410 (§9) | un cambio de ajuste del lienzo, como el fondo |
| ventana nueva de rangos del validador (DEC-B) | los rangos se quedan como están |
| `grid` y `fontSize` con decimales | siguen siendo enteros en cm |
| estado `obsoleto` de la calibración | no existe: la unidad nunca invalida nada |

Es la mayor parte del coste de NORMIA-005 que desaparece.

### 3.4 Los dos casos que hay que cerrar

**a) Documentos históricos en `mm` o `m`.** Hoy la unidad declarada *es* la
unidad de la geometría. Un plano en `mm` con ancho 4 186 son 4 186 mm = 418,6 cm.
Al abrirlo con la regla nueva hay que convertirlo una vez:

```text
mm → cm : valor / 10        (4 186 mm → 418,6 cm)
m  → cm : valor × 100       (16 m → 1 600 cm)
cm → cm : sin cambio
```

La escala física no cambia: el plano sigue midiendo lo mismo. Se hace al leer, se
avisa en una línea («este plano se dibujó en milímetros; se guardará con la
geometría en centímetros, tus medidas no cambian») y la nota de la versión lo
recoge. No es silencioso y no es destructivo.

Dos casos límite, dichos antes de que aparezcan:

- Sistema en `mm` con dos decimales: al pasar a cm se redondea a 0,1 mm. Es la
  precisión del formato; se documenta y no afecta a ninguna medida de obra.
- Un JSON con `"unit": "m"` y ancho 1 600 (un plano de 1,6 km): en cm serían
  160 000, fuera del máximo de 4 000. Se rechaza con un mensaje que lo explica.
  Ese documento hoy ya es absurdo; lo que cambia es que se dice.

**b) ¿Cuántos documentos así existen?** No lo sé y se puede averiguar antes de
escribir una línea:

```sql
SELECT json_extract(design_json, '$.canvas.unit') AS unidad, COUNT(*) AS pisos
FROM floors GROUP BY unidad;
```

Si sale todo `cm`, el caso (a) se implementa igual —es barato y protege a quien
importe un archivo antiguo— pero deja de ser una migración y pasa a ser una
guarda.

---

## 4. Unidades de medida (punto 3.A de la misión)

### 4.1 Qué puede hacer el usuario

| Acción | Cómo | Resultado |
| --- | --- | --- |
| Trabajar en metros, centímetros o milímetros | selector de **unidad de trabajo** en el panel del lienzo | la cota, el inspector, la barra de estado y el informe se leen en esa unidad |
| Escribir una medida en cualquier unidad | campo con selector propio (`m`/`cm`/`mm`), con la del plano por defecto | se guarda en cm; el campo muestra el eco en las dos |
| Cambiar de unidad | el mismo selector | **las dimensiones no cambian**: solo la forma de leerlas |
| Mezclar | escribir 4,20 m en un plano en centímetros | permitido y explícito |

### 4.2 Conversiones: automáticas y coherentes

Siempre por la autoridad única (`app/Core/Units.php`, `assets/js/lib/units.js`),
que ya tiene las dos direcciones y está probada con igualdad estricta entre PHP y
JavaScript desde la etapa 0. No se escribe ningún factor nuevo.

```text
1 m  = 100 cm = 1 000 mm
1 cm = 10 mm
```

Reglas de presentación:

| Magnitud | Decimales | Ejemplo |
| --- | --- | --- |
| Distancias en metros | 2 | `4,20 m` |
| Distancias en centímetros | 1 | `420,0 cm` |
| Distancias en milímetros | 0 | `4 200 mm` |
| Superficies | 2 | `160,00 m²` |
| Entrada | hasta 3 decimales en m (1 mm), 2 en cm | `4,203 m` |

Nunca se redondea al convertir; se redondea al mostrar (§4 de `DIMENSIONAL.md`).

### 4.3 Qué pasa exactamente al cambiar de unidad

| Aspecto | Antes (hoy) | Ahora |
| --- | --- | --- |
| Coordenadas | no cambian… pero pasan a significar otra cosa | no cambian y significan lo mismo |
| Tamaño físico del plano | ×100 o ÷100 según el destino | idéntico |
| Superficie | ×10 000 o ÷10 000 | idéntica |
| Cota | cambia de sufijo y de cifra | la misma cifra, leída en la unidad nueva |
| Historial | una versión más por un cambio de etiqueta | un cambio de ajuste, como el fondo del lienzo |
| Riesgo de sorpresa | total | ninguno |

La prueba que lo fija, y que hoy falla:

```text
auditoría del mismo plano con canvas.unit = 'cm'  →  recorrido 17,38 m · área 160,00 m²
auditoría del mismo plano con canvas.unit = 'm'   →  recorrido 17,38 m · área 160,00 m²
                                                      (hoy: 1 738 m · 1 600 000 m²)
```

Esa es la aceptación del punto 3.A, en una línea.

### 4.4 Los campos del lienzo también se leen en la unidad de trabajo

El panel del lienzo deja de pedir números en centímetros a secas:

| Campo | Hoy | Ahora |
| --- | --- | --- |
| Ancho | `1600` (cm implícitos) | `16,00 m` si la unidad es `m`; `1 600 cm` si es `cm` |
| Alto | `1000` | `10,00 m` |
| Cuadrícula | `20` | `20 cm` · `2,00 m` · `200 mm` |
| Unidad | `cm` / `m` / `mm` | igual, con la etiqueta «unidad de trabajo» |

Los límites no cambian de número, solo de nombre: 4 m a 40 m de ancho, 3 m a 30 m
de alto, cuadrícula de 5 cm a 1 m. El valor se guarda en centímetros, como todo.

### 4.5 El ajuste que sí puede cambiar el dibujo, y por qué no es lo mismo

Hay una sola operación que reescala la geometría: el **ajuste a las medidas
declaradas** (§5.4). No la provoca la unidad; la provoca una medida que el
usuario escribió y una decisión que él toma, con el antes y el después delante y
con deshacer. Es la diferencia entre «el sistema cambió mis números» y «yo pedí
que el dibujo cuadrara con lo que medí».

---

## 5. Medidas: se escribe lo que se mide, no se calibra

### 5.1 La medida declarada

Un campo opcional por objeto, en metros, que dice **cuánto mide de verdad** esa
pieza del plano:

```jsonc
"measuredM": 4.2,          // largo real del trazo, en metros
"quality": "exacta"        // exacta | aproximada | estimada  (opcional)
```

- **Qué objetos la admiten**: trazos con longitud real (muro, ruta, tubería,
  canalización, línea, vía, andén, lindero, cota) y vanos (puerta simple, doble,
  portón: la medida es el ancho del hueco).
- **Qué aporta**: gobierna el largo de ese objeto en los cálculos y en el
  informe cuando la geometría no coincide. Si coincide, no cambia nada.
- **Qué no hace**: no se aplica a los demás objetos, no genera un factor global y
  no se propaga sola.

### 5.2 Cómo se escribe (sin ceremonia)

Tres formas, todas de un solo gesto, y ninguna obligatoria:

1. **Al terminar de dibujar un trazo**: aparece un campo en línea con el largo
   geométrico ya escrito; si el usuario lo corrige, el trazo se ajusta a esa
   longitud (se estira desde el primer vértice, conservando ángulo y curvas).
2. **En el inspector**, sección Geometría: «Largo real» con selector de unidad y
   eco. La misma casilla que ya existe para X, Y, Ancho y Alto.
3. **En lote** (opcional, útil al digitalizar): seleccionar varios trazos y
   escribir una longitud solo aplica si hay uno; con varios, la acción se
   deshabilita en vez de adivinar.

### 5.3 La etiqueta de confianza

Tres valores, opcionales, sin tolerancias ni instrumentos:

| Etiqueta | Significado | Cómo se imprime |
| --- | --- | --- |
| `exacta` | medida tomada en sitio con cinta o distanciómetro | «medidas tomadas en sitio» |
| `aproximada` | medida de un plano existente o de una referencia | «medidas aproximadas» |
| `estimada` | deducida de otra cosa (una foto, una descripción) | «medidas estimadas» |

Sin etiqueta: el informe dice «medidas del dibujo». La etiqueta **no cambia
ningún cálculo**; cambia lo que se escribe en el pie y en el informe. Es lo que
permite cumplir «flexibilidad» sin inventar precisión.

### 5.4 El ajuste global, opcional y reversible

Cuando hay varias medidas declaradas y el dibujo no coincide con ellas, el panel
del lienzo ofrece una frase y un botón, no un procedimiento:

```text
┌───────────────────────────────────────────────────────────────────┐
│ 3 medidas no coinciden con el dibujo (0,32 % de media).           │
│ Ajustar todo el plano a esas medidas                              │
│   · el plano pasaría a medir 16,05 × 10,03 m                      │
│     (antes 16,00 × 10,00)                                         │
│   · 47 elementos se moverían · se puede deshacer                  │
│           [ Ajustar el dibujo ]   [ Dejar solo las medidas ]      │
└───────────────────────────────────────────────────────────────────┘
```

Reglas:

- Se calcula con la **mediana** de las relaciones `medida / dibujo`, no con la
  media: una medida mal escrita no arrastra a las demás. Se muestra el residuo
  que queda en cada una.
- Es **una acción del historial** (`Ctrl+Z` la revierte), como mover 47
  elementos.
- **No se guarda como estado**: no hay factor, ni `calibration`, ni nada que
  pueda quedar obsoleto. La versión lleva la nota «Ajuste a 3 medidas (×1,0032)»,
  que es toda la trazabilidad que hace falta.
- Si las medidas discrepan entre sí más de un 2 %, la frase cambia: «las medidas
  no coinciden entre sí: revisa si alguna está en otra unidad» y el botón se
  deshabilita. No se ajusta un plano con medidas contradictorias.

Ejemplo con las cifras de arriba: tres trazos dibujados de 418,6 / 897,2 /
1 236,0 cm y medidos 4,20 / 9,00 / 12,40 m dan relaciones 1,003344 / 1,003121 /
1,003236; la mediana es **1,003236**, el área pasa de 160,00 a **161,04 m²** y los
residuos quedan en 0,011 %, 0,012 % y 0,000 %.

### 5.5 Dónde encaja lo que falta de la misión

- **Medidas de área** (superficie de un recinto): mismo patrón — `areaM2`
  declarada por la futura entidad de área, con la misma etiqueta y la misma
  jerarquía de §6. Diseñado en NORMIA-004 §5.2, no se toca aquí.
- **Medidas de ancho de vano**: la puerta ya tiene `w`; la medida declarada del
  vano es el mismo campo `measuredM`, con la etiqueta de que es un ancho.
- **Medidas de altura, espesor o resistencia**: no entran. La altura de montaje
  del extintor ya existe como `extMountCm` y se queda como está.

---

## 6. Cálculos: de dónde sale cada número

### 6.1 Jerarquía de fuentes

Para cualquier magnitud, en este orden y sin excepciones:

```text
1. medida declarada del objeto        →  measuredM
2. geometría en cm ÷ 100              →  la regla general
   (y si el objeto es un trazo, su longitud por el arco, no por la cuerda)
```

No hay tercer nivel. No hay factor de plano. Lo que hay es una etiqueta al lado
de cada cifra que dice cuál de las dos se usó.

### 6.2 Qué cambia en cada consumidor

| Consumidor | Qué calcula | Con la regla nueva |
| --- | --- | --- |
| `PlanAudit` | recorrido, distancia a salida, ancho de vano, área libre, ocupación estimada, tiempos | `valor_cm / 100`; si el objeto tiene `measuredM`, esa manda |
| `PlanGrid` | rejilla de 10 cm y holguras | `cell = 10` cm, sin conversión de unidad; la rejilla es la misma en cualquier unidad |
| `ExtinguisherCoverage` | cobertura y distancia a la señal | distancia en cm ÷ 100 — **arregla de paso el ÷100 fijo** de NORMIA-005 C-06 |
| `MepCalculator` | longitud de red y caída de tensión | idem, con arco (§7 de `DIMENSIONAL.md`) |
| `measure.js` | recorrido con A* | `CELL` y `CLEARANCE` en cm, sin unidad que interpretar — arregla C-07 |
| `schedule.js` | área del piso | cm² × 10⁻⁴, una sola función |
| cotas | rótulo | en la unidad de trabajo, con 2 decimales en metros |
| `PlanFooter` | pie | añade una línea: «medidas tomadas en sitio» / «del dibujo» |
| `SvgExporter` | SVG | sin cambio de tamaño (etapa 1 de NORMIA-004) |

Los consumidores **se simplifican**: dejan de preguntar por la unidad y pasan a
dividir entre 100. La complejidad se va, no se reparte.

### 6.3 Qué ve el usuario en un informe

```text
Recorrido máximo de evacuación     17,38 m   (del dibujo)
Ancho de vano de la salida 1       0,90 m    (medido, exacta)
Distancia a la salida más lejana   23,10 m   (del dibujo)
Superficie libre                   160,00 m² (del dibujo)
Ocupación estimada                 32 personas (estimación por superficie)
```

Una línea de pie, una sola, sin porcentajes ni tolerancias:

> Medidas: 8 tomadas en sitio, 4 aproximadas, 39 del dibujo. Los planos son
> esquemáticos: verifica en sitio antes de usarlos en obra.

---

## 7. Persistencia y compatibilidad

### 7.1 Lo que se añade al documento

```jsonc
"elements": [
  {
    "id": "el_4f2a", "type": "wall", …,
    "measuredM": 4.2,        // opcional, 0,01…5 000, 3 decimales
    "quality": "exacta"      // opcional: exacta | aproximada | estimada
  }
]
```

Y nada más. **No** hay bloque `calibration` en `canvas`: la unidad de trabajo ya
existe (`canvas.unit`, con significado nuevo) y el factor no se guarda.

### 7.2 Versión de formato

Las claves nuevas dentro de un elemento hacen rechazo en cualquier versión
anterior, así que el documento sube a **`format: 5`** cuando aparece alguna, y el
JSON exportado pasa a **`schema_version: 3`**. Es la misma decisión que NORMIA-005
DEC-C y por la misma razón: que una versión vieja falle diciendo «este plano se
guardó con una versión más nueva» en lugar de «propiedad no permitida».

Pero hay un segundo motivo que antes no existía: **`format: 5` significa también
«la geometría está en centímetros»**. Es la marca que permite normalizar los
documentos antiguos sin ambigüedad:

| Documento | Geometría guardada en | Al abrirlo con la versión nueva |
| --- | --- | --- |
| `format: 2`, `3` o `4`, `unit: cm` | cm | se abre igual; conserva su formato hasta que se añada una medida |
| `format: 2`, `3` o `4`, `unit: mm` o `m` | mm o m | se convierte a cm una vez, se avisa, y al guardar pasa a 5 |
| `format: 5` | cm siempre | se abre igual |

La regla que se puede programar: **un plano con `format` menor que 5 solo está en
centímetros si su unidad es `cm`; desde 5, siempre**. Con eso el normalizador sabe
qué hacer sin ambigüedad y sin tocar nada más.

Dos detalles del código actual que esto obliga a tocar, y que conviene saber antes
de estimar:

- **`format` no se declara: se deduce.** `DesignValidator::normalizeArray()`
  (`DesignValidator.php:57-96`) acepta solo 2, 3 y 4 (`:69`) y **devuelve** 2, 3 o
  4 según el contenido (`:91`), no según lo que traiga el JSON. Formato 5 se
  añade a la lista admitida y a la deducción: si algún elemento trae `measuredM`
  o `quality`, es 5.
- **`schema_version` está clavado en 2.** Se escribe en
  `ExportController.php:46` y `DesignImporter.php:38` lo exige con `!== 2`. Pasar
  a 3 exige que el importador acepte **2 y 3**, no que rechace el 2; si no, los
  archivos exportados ayer dejan de entrar.

### 7.3 Migración

- **Base de datos:** ninguna. `user_version` sigue en **7**; no hay tablas nuevas.
- **Documentos:** conversión en lectura, sin reescribir el histórico. Las
  versiones antiguas quedan como están en `floor_versions`; se convierten al
  abrirlas y solo se guardan si el usuario guarda.
- **Respaldo:** compatible; un respaldo nuevo restaurado en una versión vieja
  choca con `format: 5` y se explica por versión.
- **Ajustes de extintores, ocupación, escala:** sin cambios.

### 7.4 El golden y las pruebas que cambian

- Los **6 405 valores** y los **4 hash SVG** de la demo **no se mueven**: la demo
  está en `cm` y en `cm` la conversión es la identidad.
- El bloque `synthetic.unidades` que añadió la etapa 0 cambia de significado: ya
  no es «la misma geometría declarada en tres unidades» sino «la misma geometría
  leída en tres unidades», que es más simple y más fuerte. Se reescribe.
- `docs/DIMENSIONAL.md` §1 y §2 hay que reescribirlos: la regla de oro deja de ser
  «una unidad equivale a la unidad declarada» y pasa a ser «la geometría está en
  centímetros y la unidad es cómo se lee».

---

## 8. Trazabilidad: qué se cae de NORMIA-005 y por qué

| NORMIA-005 | Qué pasa | Motivo |
| --- | --- | --- |
| §4.4 `PlanScale` con factor efectivo | **se cae**; bastan `Units::toCm` y `Units::fromCm` | no hay factor que derivar |
| §5 procedimiento de calibración (3 métodos, 5 pasos, instrumento, margen) | **se cae** | la misión prohíbe el procedimiento técnico |
| §6 `canvas.calibration` con evidencia | **se cae**; lo sustituye `measuredM` por objeto | una medida por objeto es más simple y más útil |
| §7 verificación con medidas adicionales | **se cae** | su función la cumple el residuo del ajuste (§5.4) |
| §8 cambio de unidad (invariante, matriz de 18 campos, rangos) | **se cae** | ya no hay reconversión |
| §9 vista previa con token | **se cae** | ya no hay operación peligrosa que confirmar |
| §10.3 formato 5 y sobre 3 | **se conserva**, con otro motivo (§7.2) | compatibilidad de versiones |
| §10.4 golden intacto | **se conserva** | es la garantía de que nada se mueve |
| §11 consumidores | **se conserva**, con la regla `÷100` | siguen siendo 15 |
| §13.2 DEC-A, DEC-B, DEC-D | **se caen** | no hay bloque que guardar ni rangos que ampliar |
| C-06 y C-07 (extintores ÷100, holguras en cm) | **se arreglan** aquí, §6.2 | quedan al descubierto al simplificar |
| C-03 (rangos en cm) | **deja de ser un problema** | todo se guarda en cm |

Lo que se conserva de NORMIA-005 es su §2: el diagnóstico. Lo que se cae es el
aparato construido encima, y cae porque el modelo nuevo lo hace innecesario.

---

## 9. Pruebas y criterios de aceptación

### 9.1 Unidades (el punto 3.A)

| ID | Caso | Esperado |
| --- | --- | --- |
| U-01 | mismo plano, `unit: cm` y `unit: m` | auditoría idéntica cifra a cifra; solo cambian los rótulos |
| U-02 | cambiar de unidad en el editor | ninguna coordenada cambia; el área y el recorrido no varían |
| U-03 | escribir 4,20 m en un plano en cm | se guarda 420; el campo muestra `4,20 m = 420 cm` |
| U-04 | escribir 4 200 mm en un plano en m | se guarda 420; el campo muestra `4 200 mm = 4,20 m` |
| U-05 | cota de un trazo de 420 cm en plano en `m` | rótulo `4,20 m` |
| U-06 | plano antiguo en `mm` (4 186) al abrirlo | geometría 418,6 cm, medidas idénticas, aviso visible |
| U-07 | plano antiguo en `m` con ancho 1 600 | rechazo con mensaje que explica por qué |
| U-08 | decimales: 4,203 m | se guarda 420,3 cm; se muestra `4,20 m` |

### 9.2 Medidas

| ID | Caso | Esperado |
| --- | --- | --- |
| M-01 | trazo sin `measuredM` | el informe usa la geometría y lo etiqueta «del dibujo» |
| M-02 | trazo con `measuredM` que discrepa | el informe usa la medida y lo etiqueta «medida» |
| M-03 | `measuredM` igual a la geometría | no aparece ninguna discrepancia |
| M-04 | `measuredM` fuera de 0,01…5 000 | rechazo con mensaje |
| M-05 | `quality` desconocida | rechazo |
| M-06 | etiqueta en el pie | «medidas tomadas en sitio» / «del dibujo», nunca las dos |
| M-07 | ajuste global con 3 medidas | factor = mediana; residuos < 0,05 %; deshacer lo revierte |
| M-08 | ajuste global con medidas que discrepan > 2 % | el botón se deshabilita y se explica |
| M-09 | ajuste global no deja rastro de estado | el documento guardado no tiene factor ni bloque nuevo |

### 9.3 Regresión

| ID | Caso | Esperado |
| --- | --- | --- |
| R-01 | golden de la etapa 0 | 6 405 valores y 4 hash SVG idénticos |
| R-02 | demo sin medidas | mismo informe, con la línea «del dibujo» añadida |
| R-03 | SVG de un plano en `cm` | idéntico salvo el texto del pie |
| R-04 | extintores en un plano en `m` (con la geometría normalizada) | cifras correctas, no ÷100 sobre metros |
| R-05 | `format: 2` sin medidas | idéntico byte a byte al de la 1.18.0 |

### 9.4 Criterios de aceptación

- [ ] Se puede crear un piso, dibujar, revisar y exportar **sin escribir ninguna
      medida** ni tocar el selector de unidad.
- [ ] Cambiar de unidad no altera ninguna cifra física: la prueba U-01 lo fija.
- [ ] Ninguna pantalla pide instrumento, margen, tolerancia ni verificación.
- [ ] La palabra «calibrar» no aparece en la interfaz.
- [ ] Cada cifra del informe dice si viene de una medida o del dibujo.
- [ ] Los planos sin medidas dan exactamente los mismos números que la 1.18.0.
- [ ] `user_version` sigue en 7 y ningún documento histórico se reescribe.
- [ ] El pie y el informe no afirman exactitud ni cumplimiento.

---

## 10. Riesgos y decisiones

### 10.1 Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
| --- | --- | --- | --- | --- |
| R-01 | La conversión de documentos antiguos en `mm`/`m` redondea a 0,1 mm | baja | bajo | se avisa al abrir; el histórico no se toca |
| R-02 | Un JSON con `unit: m` y medidas de cm no se puede normalizar | baja | medio | rechazo explicado (U-07) |
| R-03 | Al cambiar `canvas.unit` de significado, algún consumidor olvidado siga multiplicando | media | alto | prueba U-01 recorre todos los informes; búsqueda de `metersPerUnit(` en el código |
| R-04 | El ajuste global aplicado sobre medidas malas descuadra el plano | media | medio | mediana, residuo visible, deshacer, y bloqueo si discrepan > 2 % |
| R-05 | El usuario cree que «medida exacta» certifica el plano | media | alto | la etiqueta describe la medida, no el plano; el pie mantiene el aviso |
| R-06 | Un documento con `format: 5` en una app vieja parece corrupto | media | medio | mensaje por versión (§7.2) |

### 10.2 Decisiones aprobadas

> **Aprobadas el 2026-11-02.** Las seis van como están: no queda ninguna abierta.
> Lo que falta para cerrar la misión no es una decisión, es el resto del alcance
> (puntos 3.B y siguientes), que todavía no llegó.
>
> **Implementadas el 2026-11-02 en la 1.19.0:** DEC-1, DEC-2 y DEC-5 (etapas 1 y 2
> de §11), y DEC-6 como consecuencia de DEC-1. DEC-3 (etapa 3, ajuste global) se
> implementó en la 1.21.0. Lo ejecutado, con sus contratos y sus pruebas, está en
> §26, §27 y §28.

**DEC-1 · Geometría en centímetros y unidad como etiqueta.**
Es el corazón del rediseño y lo que hace que cambiar de unidad no sorprenda.
Recomendación: **sí**. Alternativa: conservar la unidad declarada y convertir al
cambiarla — más barato de escribir, pero solo funciona cuando el lienzo cabe en
la unidad destino, que hoy no ocurre en ningún plano de edificio.

**DEC-2 · La medida vive en el objeto, no en el plano.**
Recomendación: **sí**, con `measuredM` + `quality` por elemento.
Alternativa: un factor global editable a mano. Es más barato de implementar y es
exactamente el número mágico que la misión quiere quitar de la vista del usuario.

**DEC-8 · La escala se elige al exportar y no se guarda.** *(aprobada así en la
1.22.0, §29)* El documento no cambia al imprimir a otra escala; `canvas.scale` es
solo la sugerencia inicial.

**DEC-3 · El ajuste global es una acción, no un estado.**
Recomendación: **sí**: mediana, vista previa, deshacer y nota de versión, sin
guardar factor. Alternativa: guardar el factor aplicado — no aporta nada que la
nota de versión no diga ya.

**DEC-4 · Etiquetas exacta / aproximada / estimada, sin tolerancias.**
Recomendación: **sí**, tres valores y ninguna cifra de error.
Alternativa: pedir un ± % opcional — vuelve a meter metrología donde el usuario
no la tiene.

**DEC-5 · Formato 5 y sobre 3.**
Recomendación: **sí**, con el doble significado de §7.2 (claves nuevas y
geometría en cm).

**DEC-6 · Arreglar de paso C-06 (extintores) y C-07 (holguras de ruta).**
Recomendación: **sí**. Al simplificar quedan a la vista y son dos líneas.

Y una nota sobre el orden, ya aprobada la forma: las tres etapas de §11 son
independientes entre sí en el código, pero **la etapa 1 va primero siempre**. Las
medidas de la etapa 2 se guardan en metros y se comparan contra geometría en
centímetros: si esa geometría todavía puede estar en `mm` o en `m`, la jerarquía
de §6.1 compara peras con manzanas.

---

## 11. Plan por etapas

| Etapa | Qué | Riesgo | Esfuerzo |
| --- | --- | --- | --- |
| **1 · Geometría en centímetros** | normalizador y conversión de legados; consumidores a `÷100`; `format: 5`; pruebas U-01 a U-08 y golden | medio | ~1 unidad |
| **2 · Medidas** | `measuredM` y `quality`; campo en inspector y al dibujar; pie e informe con la fuente; pruebas M-01 a M-06 | bajo | ~1 |
| **3 · Ajuste global** | frase en el panel, mediana, vista previa, deshacer, nota de versión; pruebas M-07 a M-09 | bajo | ~0,5 |

La etapa 1 es la única con riesgo real, porque toca a todos los consumidores. Lo
que la hace manejable: el golden de la etapa 0, que no debe moverse, y una
prueba nueva que compara el mismo plano en `cm` y en `m`.

Las etapas **4 a 10**, que cubren los apartados 3.B a 3.J, están en §23 con sus
dependencias y su orden.

---

## 12. Lo que no pude verificar

1. **No implementé nada**: todo lo que dice «debe» es diseño.
2. **No sé cuántos documentos hay en `mm` o `m`.** La consulta de §3.4 lo
   responde en un segundo; si sale todo `cm`, el riesgo R-01 desaparece.
3. **No medí el coste real de tocar los 15 consumidores.** Estimo ~1 unidad por
   la cantidad de sitios, no por la dificultad de cada uno.
4. **No probé la ergonomía del campo de medida al dibujar** (aparecer sin
   estorbar). Es la pieza con más riesgo de diseño de interacción y habrá que
   verla en pantalla antes de darla por buena.
5. **No comprobé si alguna vista muestra la unidad del lienzo como si fuera una
   escala** más allá de la barra de estado y el panel que ya cito.
El resto del alcance (3.B a 3.J) llegó el 2026-11-02: se diseña en §13 a §25, y
los límites de verificación de esos apartados están en §25, no aquí.

---

## 13. El alcance completo: 3.B a 3.J

El 2026-11-02 llegó el resto de la misión. Los nueve apartados no cambian
ninguna decisión aprobada: la amplían. Esto es lo que añade cada uno y dónde se
diseña.

| Apartado | En una frase | Se diseña en | Efecto sobre lo aprobado |
| --- | --- | --- | --- |
| 3.B | escribir y corregir la medida de cada elemento | §14 | convierte el campo de §5.2 en el patrón único; descubre una ausencia: no hay ventanas |
| 3.C | toda cifra de los módulos sale de una dimensión | §15 | confirma §6 y le pone un contrato con nombre y firma |
| 3.D | ajustar un plano que ya venía dibujado | §16 | es la misma acción de §5.4, con otra puerta de entrada |
| 3.E | el plano exportado conserva su tamaño real | §17 | desarrolla NORMIA-004 DEC-4 |
| 3.F | organizar la instalación en edificios, pisos y áreas | §18 | desarrolla NORMIA-004 DEC-1 y DEC-2 |
| 3.G | tres cifras de ocupación distintas, no una | §19 | cambia el significado de `canvas.occupancy` |
| 3.H | turnos y eventos con su historia | §20 | tablas nuevas; el plano no se toca |
| 3.I | relacionar áreas, ocupación, rutas y recursos | §21 | usa casi todo lo que ya existe |
| 3.J | que nada histórico se rompa | §22 | cierra compatibilidad, respaldo y pruebas |

La misión fija cuatro prohibiciones. Se traducen a reglas que se pueden buscar en
el código, no a intenciones:

| Prohibición | Regla comprobable |
| --- | --- |
| Nada de calibraciones obligatorias | ningún flujo de dibujo, guardado o exportación abre un paso que no se pueda cerrar con «cancelar» y seguir |
| Nada de procedimientos metrológicos | la interfaz no pide instrumento, margen, tolerancia ni verificación |
| Nada de ajustes globales automáticos | el único reescalado es §5.4: lo pide el usuario, se ve antes y después, y se deshace |
| Nada de configuración innecesaria | si un valor puede tener un predeterminado razonable, lo tiene y no se pregunta |

Y una regla de redacción para el resto de este documento: **cada pieza nueva tiene
que poder decirse en una frase con sujeto, verbo y resultado** —«el usuario escribe
el ancho del vano y el plano lo usa en el cálculo de evacuación»—. Lo que no se
pueda decir así, no entra.

---

## 14. 3.B · Ingreso y edición de dimensiones de los elementos

### 14.1 Qué se puede medir hoy, tipo por tipo

Los tipos no son un catálogo abierto: son una lista cerrada del validador
(`DesignValidator.php:29-36`). Esto es todo lo que existe y qué medida tiene
sentido en cada uno:

| Tipo | Medida que tiene sentido | Estado |
| --- | --- | --- |
| `wall` | largo por el arco; el alto del muro no existe como dato | se mide, falta el alto |
| `door`, `door_double`, `door_garage` | ancho del hueco = `w` | se mide |
| `route` | largo del recorrido, por el arco | se mide |
| `line` | largo | se mide |
| `pipe`, `conduit` | largo; el diámetro y la sección salen del catálogo | se mide el largo |
| `road` | ancho de banda (`widthM`) y largo | se mide |
| `sidewalk`, `property` | largo y ancho de banda | se mide |
| `crosswalk`, `parking` | ancho y largo de la franja o de la plaza | se miden como caja |
| `rect`, `ellipse` | ancho y alto; si el usuario lo declara recinto, superficie | base de §18 |
| `dimension` | la cota es la medida, no un objeto medido | rótulo |
| `text` | no se mide | — |

`CURVE_TYPES` (`DesignValidator.php:36`) dice cuáles admiten arco, y por tanto
cuáles se miden por longitud de arco y no por la cuerda.

### 14.2 Las dos ausencias que 3.B deja al descubierto

**a) No existe el tipo «ventana».** El apartado pide dimensiones de «paredes,
puertas, ventanas, pasillos, espacios». Puertas hay tres tipos; ventanas,
ninguno. Dos caminos, y conviene decidirlo antes de escribir código:

| Camino | Qué implica | Coste |
| --- | --- | --- |
| A · sin tipo nuevo | la ventana se dibuja como muro con rótulo; su ancho es el del tramo | cero; no se puede listar ni contar |
| B · tipo `window` | símbolo, biblioteca, validación, `format: 6` y su conversión | medio; toca el validador y el exportador |

Recomendación: **A ahora, B cuando alguien pida el listado de ventanas** (por
ejemplo para un pliego de carpintería). Inventar el tipo antes de saber qué se
hará con él es exactamente la configuración innecesaria que la misión prohíbe.

**b) No existe la entidad «pasillo» ni «espacio».** Hoy un pasillo es el hueco
entre dos muros: no tiene identidad, no se puede nombrar, no se puede medir como
unidad. Eso no lo resuelve 3.B, lo resuelve 3.F (§18). Hasta entonces, de un
pasillo solo se puede medir su largo entre ejes, que es lo que ya se mide.

### 14.3 El campo único

No hay un formulario de medidas distinto para cada tipo. Hay **un** campo, el de
§5.2, con tres formas de llegar a él:

| Dónde | Cómo se ve | Qué escribe |
| --- | --- | --- |
| Inspector, sección Geometría | «Largo real» con selector de unidad y eco | `measuredM` |
| Al terminar un trazo | campo en línea con el largo geométrico ya escrito | `measuredM`, y ajusta el trazo |
| Panel del lienzo | ancho, alto y cuadrícula en la unidad de trabajo | geometría en cm (§4.4) |

Reglas de entrada, las mismas en los tres sitios: hasta 3 decimales en metros,
2 en centímetros, 0 en milímetros (§4.2); se rechaza lo que no se puede
representar con un mensaje que dice por qué; **nunca se redondea al guardar**, se
redondea al mostrar.

### 14.4 Editar sin romper el dibujo

- **Mover un vértice no borra la medida.** El objeto queda con medida declarada y
  geometría distinta: se marca con un punto discreto en el inspector, no en el
  lienzo. El plano no se ensucia con avisos.
- **Cambiar la medida de un trazo lo estira**, desde el primer vértice, mirando el
  ángulo y las curvas (§5.2). No se reubica el objeto.
- **Los límites son los del validador**: X e Y de 0 a 10 000 cm, ancho y alto de 2
  a 10 000 cm (`DesignValidator::normalizeElements`). El lienzo va de 400 × 300 a
  4 000 × 3 000 cm. Ninguno de estos números cambia con el rediseño.
- **Una medida no se hereda.** Copiar un elemento copia su medida, porque es parte
  del objeto; duplicar un piso copia las de sus elementos. No hay propagación
  entre objetos parecidos.

### 14.5 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| B-01 | escribir el largo de un muro en el inspector | se guarda en cm; el campo muestra la medida y su eco |
| B-02 | corregir la medida de un trazo dibujado | el trazo se estira y conserva ángulo y curvas |
| B-03 | mover un vértice después de declarar la medida | la medida queda; el inspector marca la discrepancia |
| B-04 | escribir el ancho de una puerta | se guarda como `measuredM` del vano y lo usa el auditor |
| B-05 | escribir 5 decimales en metros | rechazo con mensaje; no se guarda redondeado en silencio |
| B-06 | dibujar y exportar sin escribir ninguna medida | funciona igual que en 1.18.0 |
| B-07 | duplicar un piso | las medidas viajan con los elementos; los identificadores son nuevos |
| B-08 | ventana dibujada como muro con rótulo | no rompe validación, auditor ni exportación |

---

## 15. 3.C · Cálculos automáticos a partir de las dimensiones

### 15.1 Un solo contrato, dos lenguajes

Hoy cada servicio vuelve a decidir qué es una longitud: `PlanAudit` multiplica
por `metersPerUnit`, `MepCalculator` divide por la unidad del lienzo, `measure.js`
trabaja en celdas de 10. La regla de §3 los unifica, y para que la unificación no
se deshaga sola hace falta una función con nombre:

```text
ElementMeasure::lengthCm(elemento, lienzo)  →  [valor_cm, fuente]
                                          fuente ∈ {measured, geometry}
```

- **PHP y JavaScript dicen lo mismo**, como `Units` desde la etapa 0: mismo
  fixture, misma igualdad estricta.
- **No es una autoridad nueva**: por dentro usa `Units::toCm` y
  `PathGeometry::length()` para el arco. No define factores.
- **Devuelve la fuente**, y eso es lo que permite que el informe diga de dónde
  salió cada cifra sin que cada módulo lo invente.

### 15.2 Qué magnitud produce cada módulo

| Módulo | Magnitudes | Con la regla nueva |
| --- | --- | --- |
| `PlanAudit` | recorridos, distancia a salida, ancho de vano, superficie libre, ocupación, tiempos | cm ÷ 100, o `measuredM`; el arco ya está (§6.2) |
| `PlanGrid` | rejilla de 10 cm, holguras de muro | sin unidad que interpretar |
| `ExtinguisherCoverage` | distancia a la señal y al equipo | cm ÷ 100 — arregla C-06 |
| `MepCalculator` | longitud de red, caída de tensión, diámetro | cm ÷ 100, con arco |
| `schedule.js` | superficie del piso, tamaño de señal sugerido | cm² × 10⁻⁴ |
| Cotas | rótulo de la distancia | en la unidad de trabajo, 2 decimales en metros |
| `PlanFooter` | resumen y pie | añade la fuente de las medidas |
| Informe impreso | todas las anteriores | cada cifra con su apellido |

### 15.3 Qué necesita cada módulo para no mentir

Esta tabla es la respuesta a «qué información necesita cada módulo para dar
resultados confiables», que era una de las preguntas de la misión:

| Módulo | Necesita | Si falta |
| --- | --- | --- |
| recorrido de evacuación | al menos una ruta y una salida marcada (`isExit`) | «sin ruta de evacuación» en vez de 0 m |
| ancho de salida | puertas con `isExit` y geometría válida | «sin salidas marcadas» |
| ocupación | área del piso y densidad en criterios, o cifra declarada | «sin dato», rotulado |
| tiempos de evacuación | recorrido, velocidad y flujo de `audit-criteria.json` | no se calcula el tiempo |
| cobertura de extintores | extintores con su ubicación y radios del catálogo | «sin extintores» |
| inventario de señalización | elementos del plano y biblioteca cargada | lista vacía, explicada |
| redes y circuitos | trazos con red asignada | no aparece la red |
| verificación física | rondas de `verification_rounds` y `element_checks` | «sin verificar», no «correcto» |

La cifra hueca es el defecto silencioso más caro de esta lista: un `0 m` de
recorrido se lee como «no hay recorrido», y en realidad significa «no hay ruta
dibujada». El contrato de §15.1 obliga a distinguirlos.

### 15.4 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| C-01 | misma geometría, `unit: cm` y `unit: m` | cifras idénticas en todos los informes |
| C-02 | trazo con `measuredM` en `PlanAudit`, `MepCalculator` y cota | la misma cifra en los tres |
| C-03 | trazo curvo | longitud por el arco en los tres |
| C-04 | plano sin rutas | «sin ruta de evacuación»; nunca 0 m |
| C-05 | plano sin salidas marcadas | «sin salidas marcadas» |
| C-06 | extintores en plano en `m` con geometría normalizada | cifras correctas (arregla C-06) |
| C-07 | `measure.js` en un plano en `m` | mismas holguras en cm (arregla C-07) |

---

## 16. 3.D · Calibración opcional de planos importados

### 16.1 Qué es, dicho sin metrología

Un plano importado llega con una geometría que no se sabe a qué escala está. La
herramienta le pregunta al usuario **una distancia que conoce** —el ancho de una
puerta, el largo de un pasillo, la fachada— y ajusta el dibujo para que esa
distancia sea la que él dice. Nada más. No hay instrumento, ni margen, ni
verificación, ni estado que caduque.

### 16.2 El flujo, en cinco gestos

```text
1. Abrir el plano importado            (no hay un asistente previo)
2. Panel del lienzo › «Ajustar el dibujo»
3. Marcar dos puntos y escribir la distancia real
4. Ver el antes y el después            (16,00 × 10,00 m → 16,42 × 10,26 m)
5. «Ajustar»  ·  queda en el historial  ·  Ctrl+Z lo revierte
```

Nada de esto es obligatorio. Un plano importado se puede guardar, exportar y
auditar sin tocar el botón; las cifras saldrán rotuladas «del dibujo».

### 16.3 Es la misma acción que la de §5.4

Aquí está la simplificación grande de todo el apartado: **la calibración de un
plano importado y el ajuste a las medidas declaradas son la misma operación**. Lo
único que cambia es de dónde sale la referencia:

| Situación | Referencia | Factor |
| --- | --- | --- |
| plano dibujado aquí, con varias medidas | `measuredM` de varios objetos | mediana de las relaciones (§5.4) |
| plano importado, sin medidas | una distancia escrita a mano | esa única relación |

Un solo motor, un solo botón, dos entradas. Y en ambos casos: vista previa,
una acción del historial, nota en la versión y **ningún estado guardado**.

### 16.4 Lo que no se guarda, y por qué

- No hay bloque `calibration` en `canvas`.
- No hay factor, ni `planScale`, ni `obsolete`.
- No hay «calibración vigente» que se pueda quedar vieja cuando cambia la unidad:
  la unidad ya no mueve el dibujo (§4.3).

Lo único que queda es la nota de la versión: «Ajuste a una distancia de 4,20 m
(×1,0263)». Si el usuario quiere volver atrás, deshace o restaura la versión
anterior — el historial ya existe y ya se prueba.

### 16.5 Cuándo se ofrece

- Solo en el panel del lienzo, junto a ancho, alto y cuadrícula. Sin ventana
  modal, sin paso obligatorio, sin globo de bienvenida.
- Con un plano recién importado, el panel muestra una línea discreta: «Si conoces
  una distancia real, puedes ajustar el dibujo».
- Nunca aparece en un plano creado aquí con medidas declaradas: en ese caso la
  sección ya propone el ajuste de §5.4 con sus residuos.

### 16.6 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| D-01 | importar un plano y no tocar nada | se guarda, se exporta y se audita; cifras «del dibujo» |
| D-02 | ajustar con una distancia conocida | la relación aplicada es exactamente medida ÷ dibujo |
| D-03 | deshacer tras ajustar | vuelve la geometría y la cifra anteriores |
| D-04 | guardar tras ajustar | el documento no contiene factor ni bloque nuevo |
| D-05 | ajustar dos veces seguidas | la segunda parte de la primera; no acumula estado oculto |

---

## 17. 3.E · Escala física, representación SVG e impresión

### 17.1 Lo que hay hoy, verificado

- El SVG sale con `width` y `height` **en unidades del lienzo** y el mismo
  `viewBox` (`SvgExporter.php:39-40`). Un plano de 16 m en `cm` genera
  `width="1600"`, que el navegador interpreta como 1600 px: unos 42 cm de ancho.
- La impresión es **A4 horizontal** (`print.css:2`) y recorta el SVG a 170 mm de
  alto (`print.css:46`). El tamaño impreso depende del hueco, no de la escala.
- La escala `1:N` solo aparece como texto en el pie (`PlanFooter.php:71`) y se
  valida sin intervenir en ningún cálculo (`DesignValidator.php:293`).

Conclusión honesta: hoy el plano **se ve** a escala y **se imprime** a la escala
que quepa. Eso no es un error de dibujo, es un error de representación.

### 17.2 Las tres magnitudes que no se pueden mezclar

| Magnitud | Unidad | De qué depende | Quién la decide |
| --- | --- | --- | --- |
| Dimensión real | metros | lo que se midió | el usuario (§5) |
| Tamaño del dibujo | milímetros de papel | dimensión ÷ escala | la escala de impresión |
| Escala de impresión | `1:N` | tamaño de la hoja | el usuario al exportar |

El defecto que 3.E quiere evitar es que cambiar una de las tres mueva las otras
dos. Con el modelo de §3, la primera ya no se toca nunca.

### 17.3 Cómo se representa

- **`viewBox` en centímetros**: `0 0 ancho alto`, con la geometría tal como está
  guardada. Ni una coordenada cambia.
- **`width` y `height` en milímetros**: `cm × 10` para tamaño real 1:1; dividido
  por `N` cuando se elige una escala de impresión. Un muro de 4,20 m mide 42 mm
  en un 1:100 y 84 mm en un 1:50.
- **La geometría no se reescala nunca**: lo que cambia es la caja del SVG. Por
  eso el mismo documento produce 1:50 y 1:200 sin guardar nada distinto.
- **Escala gráfica dentro del plano**: una barra de 5 m con sus divisiones, en el
  pie. Es lo único que sigue siendo cierto si alguien imprime al 97 % o hace una
  fotocopia. Un número «1:100» impreso sin barra no protege de eso.

### 17.4 Impresión

- `@page` admite A4 y A3, horizontal y vertical.
- «Ajustar a la hoja» calcula, para cada escala estándar (1:50, 1:100, 1:200,
  1:500), si cabe, y ofrece la mayor que quepa con margen. No elige sola.
- **Nunca reescala el documento**: si el usuario cierra el diálogo sin elegir,
  todo queda como estaba.

### 17.5 Qué no cambia

`canvas.scale` sigue existiendo, sigue validándose igual y **sigue sin intervenir
en ningún cálculo**. Pasa a ser la escala *sugerida* del plano, que la exportación
propone como valor inicial. Si el usuario imprime a otra, el documento no se
entera. DEC-8.

### 17.6 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| E-01 | exportar a 1:100 un muro de 4,20 m | mide 42 mm en el SVG |
| E-02 | exportar el mismo plano a 1:50 | 84 mm; ni una coordenada cambia |
| E-03 | `viewBox` en cualquier escala | idéntico entre escalas |
| E-04 | cambiar la escala de impresión | el documento guardado no cambia |
| E-05 | barra de escala gráfica | presente en el pie, con 5 m y divisiones |
| E-06 | golden de SVG a 1:100 en `cm` | igual que 1.18.0 salvo `width`/`height` y la barra |

---

## 18. 3.F · Edificios, pisos y áreas

### 18.1 Lo que hay

La jerarquía real es **proyecto → pisos**. `floors` guarda `level` como texto
libre y `sort_order` para ordenar (`schema.sql:52-66`). No hay edificios: un
proyecto con dos torres mete sus pisos en la misma lista, y «Torre A · piso 3» y
«Torre B · piso 3» solo se distinguen por el nombre.

### 18.2 Edificios

Tabla nueva (diseño, no ejecutada):

| Campo | Tipo | Para qué |
| --- | --- | --- |
| `id` | entero | clave |
| `project_id` | entero | a qué proyecto pertenece |
| `name` | texto | «Torre A», «Bloque administrativo» |
| `code` | texto | sigla corta para el pie y los informes |
| `levels` | entero | número de pisos, informativo |
| `notes` | texto | observaciones |
| marcas de tiempo | texto | auditoría mínima |

`floors` gana `building_id` (nulo permitido). **Relleno**: cada proyecto recibe un
edificio «Edificio principal» y todos sus pisos se le asignan. Ningún piso cambia
de nombre ni de orden, y ningún documento se reescribe.

### 18.3 Áreas

Un área es una **región con identidad**: se nombra, se mide, se le pone ocupación
y se relaciona con rutas y equipos. Tabla nueva `spaces`:

| Campo | Tipo | Para qué |
| --- | --- | --- |
| `id` | entero | clave interna |
| `uuid` | texto único | identidad estable dentro del documento |
| `floor_id` | entero | piso al que pertenece |
| `name` | texto | «Aula 3», «Bodega norte» |
| `kind` | texto | oficina, aula, bodega, pasillo, escalera, baño, zona externa |
| `area_m2` | real | superficie calculada del polígono |
| `area_measured_m2` | real nulo | superficie declarada, si el usuario la conoce |
| `quality` | texto nulo | exacta, aproximada, estimada |
| marcas de tiempo | texto | auditoría mínima |

La **geometría vive en el documento** (NORMIA-004 DEC-2): el polígono son puntos
en centímetros, dentro de `design_json`, con su `uuid`. La tabla es el índice que
permite consultar «qué áreas tiene este piso» sin abrir cada documento; se
reconstruye desde el documento y **nunca es la fuente de la verdad**.

### 18.4 Identidad estable

- El `uuid` se genera **una vez** y no se reutiliza jamás.
- Cambiar el nombre, mover el polígono o redibujarlo **no cambia el uuid**.
- Borrar un área deja una lápida con fecha; el histórico de ocupación y
  verificación que la citaba sigue siendo legible.
- Duplicar un piso genera uuids nuevos: dos áreas iguales en plantas distintas son
  dos áreas.

### 18.5 Relaciones geométricas

Se calculan al guardar, no se editan a mano:

| Relación | Cómo se obtiene | Para qué |
| --- | --- | --- |
| elementos dentro del área | punto en polígono | inventario por área |
| rutas que atraviesan el área | intersección de segmentos | recorrido por área |
| puertas en el borde | distancia al contorno menor que el ancho del vano | salidas del área |

Si el usuario mueve un muro, las relaciones se recalculan solas. Si el polígono
queda degenérico —menos de tres puntos, o área menor de 2 m² como el criterio
`minRoomAreaM2` de `audit-criteria.json`— se avisa y no se indexa.

### 18.6 Lo que no hace

- **No sustituye a los pisos**: un área no contiene elementos por sí misma; los
  contiene el documento.
- **No detecta recintos solo.** «Encontrar áreas a partir de los muros» es
  tentador y es una trampa: un muro mal cerrado inventa un aula que no existe y
  el informe la cuenta. Si algún día se hace, será una propuesta que el usuario
  acepta área por área, nunca un proceso automático.

### 18.7 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| F-01 | proyecto con dos torres | dos edificios, pisos separados |
| F-02 | proyecto existente tras la migración | un edificio «Edificio principal»; pisos intactos |
| F-03 | renombrar un área | el uuid no cambia |
| F-04 | redibujar el polígono | el uuid no cambia; la superficie se recalcula |
| F-05 | borrar un área con historial | lápida; el histórico sigue legible |
| F-06 | área de menos de 2 m² | aviso; no se indexa |
| F-07 | documento antiguo sin áreas | se abre igual; el índice queda vacío |

---

## 19. 3.G · Aforo y ocupación

### 19.1 Las tres cifras, que no son la misma

| Cifra | De dónde sale | Quién la cambia | Cómo se rotula |
| --- | --- | --- | --- |
| **Máximo documentado** | un documento, una licencia, un estudio, una norma aplicable | el usuario, con fuente y fecha | «máximo documentado · fuente» |
| **Ocupación estimada** | geometría × densidad de `audit-criteria.json` | nadie: es un cálculo | «estimación por superficie» |
| **Ocupación real** | lo que ocurrió: un escenario, un turno, un evento | el usuario, al registrar el escenario | «ocupación registrada · fecha» |

La aplicación **nunca calcula el máximo documentado**. Es un dato que viene de
fuera y que se escribe con su fuente; si no hay fuente, no hay máximo documentado,
hay una cifra declarada y así se dice.

### 19.2 Lo que hay hoy

`canvas.occupancy` guarda personas y está en la lista blanca del validador
(`DesignValidator.php:275`). El auditor la usa tal cual y, cuando vale 0, estima
con `densityPersonsPerM2` (0,2 por defecto, `PlanAudit.php:347-360`). El resultado
lleva `occupancySource` = `declared` o `estimated`, pero la interfaz no siempre lo
dice con esas palabras.

El riesgo es de lectura, no de cálculo: una cifra «declarada» sin fuente se
interpreta como «el aforo permitido». El cambio de §19.1 lo evita sin mover
ningún número: **se conserva `canvas.occupancy` como máximo declarado del piso**
—compatibilidad total, ningún documento se toca— y se añade la fuente. DEC-9.

### 19.3 Dónde vive cada cifra

| Ámbito | Máximo documentado | Estimada | Real |
| --- | --- | --- | --- |
| edificio | `occupancy_records` (ámbito `building`) | suma de sus pisos | suma del escenario |
| piso | `canvas.occupancy` + fuente en `occupancy_records` | geometría × densidad | escenario |
| área | `spaces.area_measured_m2` y `occupancy_records` | superficie del área × densidad | escenario |

Una sola tabla nueva, `occupancy_records`, con ámbito, tipo, personas, fuente,
fecha y nota. Tres tipos, los de la tabla de §19.1. Es la pieza que permite decir
«32 personas, estimación por superficie» sin adivinar de dónde salió.

### 19.4 Cómo se muestran

- Ninguna cifra de ocupación aparece sin apellido. Ni en el plano, ni en el
  auditor, ni en el informe.
- En el informe, las tres en columnas separadas; las que no existen, en blanco con
  «sin dato».
- En el plano impreso, solo la estimada y solo si el usuario la pide; el máximo
  documentado es dato de gestión, no de evacuación.

### 19.5 Lo que no se afirma

El aforo no demuestra que una instalación sea segura, y el sistema no lo va a
insinuar. La frase del pie es fija y no se configura:

> La ocupación es un dato de referencia para dimensionar la evacuación. No
> acredita el cumplimiento de ninguna norma ni sustituye la revisión de un
> profesional competente.

### 19.6 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| G-01 | piso sin ocupación declarada | «estimación por superficie», nunca «aforo» |
| G-02 | máximo documentado con fuente | se muestra con su fuente y su fecha |
| G-03 | máximo documentado sin fuente | se llama «cifra declarada», no «máximo» |
| G-04 | informe con las tres cifras | tres columnas rotuladas |
| G-05 | cifra ausente | «sin dato»; nunca 0 |
| G-06 | `canvas.occupancy` de un plano 1.18.0 | se sigue leyendo igual |
| G-07 | plano impreso | sin cifras de ocupación salvo que se pidan |

---

## 20. 3.H · Escenarios de ocupación

### 20.1 Qué es un escenario

Una foto con fecha de cuánta gente hay y dónde: un turno, una jornada especial, un
evento, una reunión, una capacitación, un simulacro. Tiene tipo, vigencia, personas
por área y una nota. No es una propiedad del plano: es un hecho que ocurrió.

### 20.2 Tablas (diseño)

| Tabla | Campos principales | Para qué |
| --- | --- | --- |
| `occupancy_scenarios` | `id`, `floor_id`, `kind`, `name`, `starts_at`, `ends_at`, `status`, `floor_version_id`, `note` | el escenario y el plano con el que se calculó |
| `occupancy_scenario_spaces` | `id`, `scenario_id`, `space_uuid`, `persons` | personas por área |

`floor_version_id` es la pieza que hace honesta la historia: si el plano cambió
después, el escenario sigue diciendo con qué plano se calculó.

### 20.3 Historia que se conserva

- Un escenario **cerrado es inmutable**. Se puede duplicar para repetirlo, no
  editar.
- No se borran: la retención de versiones (`VersionRetention`) no los toca.
- Cambiar de tipo o de fecha exige crear otro. Los datos históricos no se
  reescriben — la misma regla que ya rige para `floor_versions`.

### 20.4 Qué cifra manda en un cálculo

Orden, y siempre rotulado:

```text
1. escenario activo            →  «ocupación del escenario: Simulacro 2026-10»
2. máximo documentado          →  «máximo documentado: 120 personas»
3. estimación por superficie   →  «estimación por superficie»
```

Un escenario no cambia la ocupación del plano: la del momento en que se consulta.

### 20.5 Qué no toca

- **No toca la geometría** ni crea una versión del plano.
- **No cambia `canvas.occupancy`.**
- **No es obligatorio** para auditar: sin escenarios, todo funciona como en §19.

### 20.6 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| H-01 | crear un escenario de turno | personas por área y fecha |
| H-02 | cerrarlo | inmutable; se puede duplicar |
| H-03 | guardar el plano después | el escenario sigue apuntando a la versión con la que se calculó |
| H-04 | auditor con escenario activo | usa sus personas y lo rotula |
| H-05 | auditor sin escenario | máximo documentado o estimación |
| H-06 | borrar un área citada por un escenario | el escenario sigue legible; el área queda en lápida |

---

## 21. 3.I · Integración con evacuación y recursos

### 21.1 Mapa de relaciones

```text
edificio
  └── piso ── documento ── elementos (muros, puertas, rutas, equipos, señales)
        ├── áreas  ── ocupación (máximo, estimada, real)
        │     ├── rutas que la atraviesan
        │     ├── puertas en su borde
        │     └── equipos y señales dentro
        ├── salidas marcadas ── ancho ── personas que pueden pasar
        └── verificación física ── qué está revisado y qué no
```

### 21.2 Lo que ya existe y sirve

| Pieza | Qué aporta | Dónde |
| --- | --- | --- |
| `PlanAudit` | salidas, anchos, recorridos, ancho requerido por persona, flujo, tiempos | `PlanAudit.php` |
| criterios de auditoría | `widthMmPerPerson` 5, flujo 1,3 pers/s/m, velocidad 1 m/s, recorrido máximo 30 m | `resources/audit-criteria.json` |
| `ExtinguisherCoverage` | cobertura y distancia a la señal | `ExtinguisherCoverage.php` |
| inventario de señalización | cuántas señales y de qué tipo | `schedule.js` |
| verificación física | rondas y estado por elemento | `verification_rounds`, `element_checks` |
| modo brigadista | enlace público de solo lectura | `brigade_links` |
| bibliotecas locales | pictogramas y equipos | `assets/`, catálogos |

Esto es lo que hace que 3.I no sea un módulo nuevo sino un **cableado**: los datos
existen, lo que falta es que se hablen.

### 21.3 Verificaciones cruzadas propuestas

Todas son avisos, ninguno bloquea guardar:

| Comprobación | Necesita | Qué dice |
| --- | --- | --- |
| área sin ocupación | `spaces` + `occupancy_records` | «Aula 3 no tiene ocupación registrada» |
| escenario por encima del máximo documentado | escenario + máximo | «el simulacro declara más personas que el máximo documentado» |
| salida sin ruta | puertas `isExit` + rutas | «la salida 2 no tiene ruta que llegue a ella» |
| extintor sin señal | equipos + señales | «extintor sin señal de extintor a menos de X m» |
| área sin salida en su borde | polígono + puertas | «Bodega norte no tiene puertas en su contorno» |
| elemento sin verificar | rondas | «12 señales sin verificación física» |
| ruta más larga que el criterio | recorridos | «recorrido de 34 m; criterio configurado: 30 m» |

### 21.4 El límite, dicho claro

Un aforo correcto y una ruta corta **no demuestran que una instalación sea
segura**. Lo que el sistema puede decir es: «con los datos que hay, estas
relaciones son coherentes o no». Lo que no puede decir, y no va a decir: que el
plan de emergencia esté bien, que la instalación cumpla una norma, que la brigada
esté preparada. Esas tres cosas se prueban en sitio, con personas y con
simulacros, no en un archivo.

Por eso el informe de 3.I no lleva una nota de cumplimiento: lleva una lista de
comprobaciones con su estado y el aviso de siempre.

### 21.5 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| I-01 | área sin ocupación | aparece en las comprobaciones cruzadas |
| I-02 | escenario por encima del máximo | aviso, no bloqueo |
| I-03 | salida sin ruta | aviso con el número de salida |
| I-04 | extintor sin señal | aviso con la distancia real |
| I-05 | informe con todo correcto | dice «coherente», nunca «cumple» |
| I-06 | elemento sin verificación | «sin verificar», nunca «correcto» |
| I-07 | plano sin áreas | las comprobaciones que las necesitan no se ejecutan, y se dice |
| I-08 | auditor de 1.18.0 | mismos números, con los apellidos nuevos |

---

## 22. 3.J · Compatibilidad, datos y pruebas

### 22.1 Documentos históricos

| Regla | Cómo se cumple |
| --- | --- |
| nada se reescribe | `floor_versions` es inmutable; la conversión ocurre al leer (§7.3) |
| el formato dice lo que hay | `format` menor que 5 solo está en cm si su unidad es `cm` (§7.2) |
| el número no se mueve | golden de 6 405 valores y 4 hash SVG como red |
| lo viejo sigue entrando | el importador acepta `schema_version` 2 y 3 |

### 22.2 Datos

Todas las tablas de §18, §19 y §20 son **aditivas**: no renombran ni borran
columnas existentes. `user_version` pasaría de **7 a 8** en una sola migración,
con respaldo previo.

Y una trampa que conviene dejar escrita: `Backup::TABLES`
(`Backup.php:39-50`) es una **lista cerrada**. Una tabla nueva que no se añada ahí
no entra en el respaldo y nadie se entera hasta que hace falta restaurar. Por eso
la etapa correspondiente no está terminada hasta que la tabla nueva esté en esa
lista y una prueba lo compruebe (J-02).

### 22.3 Sin conexión

Todo lo nuevo es local: polígonos en el documento, ocupación y escenarios en
SQLite, escalas en el SVG. Nada depende de red. Las pruebas de «funcionamiento sin
conexión» que ya existen se amplían a las pantallas nuevas.

### 22.4 Pruebas

| Bloque | Qué fija | Dónde |
| --- | --- | --- |
| U-01…U-08 | unidades (§9.1) | `tests/js/units.mjs`, `tests/php/units.mjs` |
| M-01…M-09 | medidas declaradas (§9.2) | nuevo en la etapa 2 |
| B-01…B-08 | ingreso y edición (§14.5) | nuevo |
| C-01…C-07 | cálculos y cifras huecas (§15.4) | nuevo |
| D-01…D-05 | ajuste de importados (§16.6) | nuevo |
| E-01…E-06 | escala física y SVG (§17.6) | nuevo |
| F-01…F-07 | edificios y áreas (§18.7) | nuevo |
| G-01…G-07 | ocupación (§19.6) | nuevo |
| H-01…H-06 | escenarios (§20.6) | nuevo |
| I-01…I-08 | integración (§21.5) | nuevo |
| J-01…J-08 | compatibilidad y datos (§22.6) | nuevo |
| R-01…R-05 | regresión (§9.3) | ya existe |

### 22.5 Aceptación global

- [ ] Un plano de 1.18.0 se abre, se audita y se exporta con las mismas cifras.
- [ ] Ninguna pantalla nueva es obligatoria para dibujar, guardar o exportar.
- [ ] Ninguna cifra sin fuente: medida, del dibujo, estimación, o «sin dato».
- [ ] Ninguna configuración nueva sin un predeterminado razonable.
- [ ] El respaldo incluye todas las tablas nuevas y se prueba.
- [ ] Todo funciona sin conexión.
- [ ] El pie y los informes no afirman cumplimiento ni exactitud.

### 22.6 Aceptación

| ID | Caso | Esperado |
| --- | --- | --- |
| J-01 | documento `format: 2` de 1.18.0 | idéntico byte a byte tras abrir y guardar sin cambios |
| J-02 | respaldo con las tablas nuevas | restaurado completo; ninguna tabla fuera |
| J-03 | migración 7 → 8 con datos | ningún registro perdido; respaldo previo disponible |
| J-04 | migración con la base ya en 8 | no hace nada |
| J-05 | suite completa en PHP 8.1 y 8.3 | verde, sin cambios en el golden |
| J-06 | todas las pantallas nuevas sin conexión | funcionan |
| J-07 | APK y escritorio con las tablas nuevas | arrancan; los datos viejos se leen |
| J-08 | auditor de un plano sin áreas ni ocupación | funciona; dice qué falta |

---

## 23. Etapas 4 a 10

Continúan la tabla de §11. La etapa 1 sigue siendo la primera y la única con
riesgo alto.

| Etapa | Apartado | Qué | Depende de | Riesgo | Esfuerzo |
| --- | --- | --- | --- | --- | --- |
| **1** | 3.A | geometría en centímetros (§11) | — | medio | ~1 |
| **2** | 3.B | medidas declaradas y su campo | 1 | bajo | ~1 |
| **3** | 3.C | ajuste global con mediana | 1, 2 | bajo | ~0,5 |
| **4** | 3.E | escala física, SVG en mm, barra gráfica | 1 | bajo | ~0,5 |
| **5** | 3.D | ajuste de planos importados | 3 | bajo | ~0,5 |
| **6** | 3.F | edificios y áreas | 1 | **alto** | ~2 |
| **7** | 3.G | tres cifras de ocupación | 6 | medio | ~1 |
| **8** | 3.H | escenarios e histórico | 7 | medio | ~1 |
| **9** | 3.I | comprobaciones cruzadas | 2, 6, 7, 8 | medio | ~1 |
| **10** | 3.J | cierre: compatibilidad y pruebas | todas | bajo | ~1 |

Por qué este orden y no otro:

- **3.E antes de 3.F**: las áreas se dibujan sobre el plano y su superficie
  impresa depende de la escala física. Hacerlo al revés obliga a rehacer el
  exportador con áreas dentro.
- **3.D después de 3.C**: es el mismo motor; construirlo dos veces sería el
  defecto que este documento quiere evitar.
- **3.F es la etapa cara**: tablas nuevas, migración, índice materializado y una
  entidad que aparece en la interfaz. Es la única con riesgo alto.
- **3.I al final** porque es cableado: cuando las piezas existen, unirlas es
  barato; antes, es inventar interfaz para datos que no hay.

---

## 24. Decisiones pendientes (DEC-7 a DEC-12) y DEC-14 ya decidida

**DEC-8 quedó aprobada el 2026-11-02** y se implementó en la 1.22.0 (§29). Las
otras cinco (DEC-7, DEC-9, DEC-10, DEC-11 y DEC-12) siguen sin aprobar. Las
anteriores, DEC-1 a DEC-6, sí (§10.2). **DEC-14, sobre el alcance del simulacro en
la edición nativa, quedó decidida el 2026-11-05, revisada el mismo día y cerrada
en este apartado.**

**DEC-7 · No crear el tipo «ventana» todavía.**
Recomendación: **sí**, la ventana se dibuja como muro con rótulo hasta que haya un
uso real (un pliego de ventanas). Alternativa: crear `window` ahora con `format: 6`
— más completo sobre el papel y sin consumidor que lo justifique.

**DEC-8 · La escala de impresión se elige al exportar, no en el documento.**
Recomendación: **sí**: `canvas.scale` queda como sugerencia y la exportación
propone 1:20 a 1:1000. Alternativa: guardar la escala de impresión en el
documento — la vuelve un estado que se queda viejo cada vez que cambia el tamaño
del plano. **Implementada en la 1.22.0; ver §29.**

**DEC-9 · `canvas.occupancy` pasa a ser «máximo declarado del piso», con fuente.**
Recomendación: **sí**, conservando el número y añadiendo la fuente en
`occupancy_records`. Alternativa: dejarlo como está — mantiene la ambigüedad que
3.G quiere quitar.

**DEC-10 · Edificios como tabla nueva, con relleno de un edificio por proyecto.**
Recomendación: **sí**. Alternativa: seguir usando `floors.level` como texto — no
permite agrupar dos torres sin trucos en el nombre.

**DEC-11 · Los escenarios guardan la versión del plano con la que se calcularon.**
Recomendación: **sí** (`floor_version_id`). Alternativa: guardar solo la fecha — la
historia deja de ser verificable si el plano cambia.

**DEC-13 · Los escenarios de ocupación viven en el documento del piso.**
Recomendación: **sí**, mientras no exista la migración de §20: `canvas.scenarios`
con nombre y personas, calculados aparte por el auditor. Alternativa: esperar a la
tabla `occupancy_scenarios` — deja sin cubrir A-04 durante toda la etapa 6, y el
valor del escenario está en el cálculo, no en el registro histórico.
**Implementada en la 1.24.0; ver §31.** Lo que falta de §20 —personas por área,
vigencia, cierre inmutable y `floor_version_id`— sigue siendo diseño para cuando se
apruebe DEC-11 y DEC-12.

**DEC-14 · El simulacro en la edición nativa (2026-11-05; revisada el mismo día).**
Decisión original del autor: el simulacro —tiempo objetivo por ruta, punto de
encuentro y comparación con un tiempo medido— **se quedaba solo en la edición
web**, porque la ventana nativa es una herramienta de dibujo y de cálculo y la
puesta en escena ya existía en la web. La alternativa descartada entonces era
llevarlo al núcleo nativo: «duplica el motor de camino caminable y no cambia
ningún plano».

**Revisada el mismo 2026-11-05**, cuando el autor pidió tenerlo también en la
nativa: el supuesto de la alternativa no se cumplió, porque el camino caminable
**no había que duplicarlo** —la rejilla del aforo ya tenía las celdas, los muros,
los vanos y el exterior—. Se añadió una sola búsqueda de camino
(`norma_grid_path()`, Dijkstra de 8 vecinos) y el simulacro solo suma tramos. Lo
que sigue siendo de la web es la **animación** de las figuras en modo
presentación; el núcleo nativo calcula el objetivo, lo compara con el cronómetro y
publica los tres hallazgos nuevos. **Implementada en la 1.30.0; ver
`docs/APP-NATIVA.md`.**

**DEC-12 · Una sola migración para todas las tablas nuevas (`user_version` 8).**
Recomendación: **sí**, con respaldo previo y prueba de restauración. Alternativa:
una migración por etapa — más granular y multiplica los estados intermedios que
hay que probar.

---

## 25. Lo que no pude verificar

1. **Al escribir el diseño no implementé nada.** Hoy ya existen las etapas 1, 2 y
   el ajuste global (§26–§28); lo que sigue siendo solo diseño es DEC-7 a DEC-12.
   Ni una tabla nueva: `user_version` sigue en 7.
2. **No sé cuántos documentos hay en `mm` o `m`.** La consulta de §3.4 lo responde.
3. **No medí el coste real de tocar los consumidores.** Estimo por número de
   sitios, no por dificultad.
4. **No probé la ergonomía del campo de medida al dibujar.** Es la pieza con más
   riesgo de interacción y necesita verse en pantalla.
5. **No verifiqué la impresión física.** El SVG en milímetros es aritmética
   comprobable; que una impresora concreta respete el tamaño al 100 % depende del
   controlador y no lo he medido con regla en la mano.
6. **No sé si el navegador del usuario respeta `width` en mm** en todos los casos
   (Safari y Chrome lo hacen; no lo probé en dispositivo real).
7. **No comprobé el rendimiento con muchas áreas y escenarios** — por ejemplo
   30 pisos × 12 áreas × 20 escenarios — ni con 1 200 elementos.
8. **No sé qué herramienta usará el usuario para dibujar los polígonos de área**:
   el diseño asume que se reutiliza la de líneas y se cierra el contorno; falta
   confirmarlo con él antes de la etapa 6.
9. **La exactitud normativa del auditor, los extintores y las redes no la he
   auditado**: sigo tratando sus umbrales como referencias configurables, no como
   norma.
10. **No hay iOS instalable** y esta misión no lo cambia.

---

## 26. Implementado en la 1.19.0 (2026-11-02)

Esta sección deja de ser diseño y pasa a describir lo que hay en el repositorio.
Etapas 1 y 2 de §11, con la decisión que las autoriza al lado.

### 26.1 Etapa 1 · geometría en centímetros (DEC-1, DEC-5)

| Pieza | Dónde | Contrato |
| --- | --- | --- |
| Unidad de dibujo | `app/Core/Units.php` · `assets/js/lib/units.js` | `GEOMETRY_UNIT = 'cm'`, en los dos lados. Es la única fuente: `cmPerUnit('cm')` es el literal `1` y `unitsPerMeter('cm')` es `100`, sin error de coma flotante |
| Conversión | `Units::toCm()` / `fromCm()` (PHP y JS) | `canvas.unit` deja de multiplicar. Es la unidad **de trabajo**: cómo se leen y cómo se escriben las cifras |
| Consumidores | `PlanAudit`, `PlanGrid`, `SvgExporter`, `MepCalculator`, `ExtinguisherCoverage` | todos miden con `GEOMETRY_UNIT`; ninguno vuelve a preguntar por `canvas.unit` |
| Formato del documento | `DesignValidator` | acepta `format` 2, 3, 4 y 5; un documento anterior se convierte **una vez** en la puerta de entrada y conserva la etiqueta `unit` |
| Exportación | `ExportController` | `schema_version: 3`; el importador sigue aceptando 2 y 3 |
| Cambio de unidad en pantalla | `assets/js/editor.js`, `app/Views/editor/index.php` | el formulario del lienzo escribe en la unidad de trabajo y enseña los mismos límites en esa unidad; cambiar la unidad reetiqueta las cifras y **no** redimensiona nada |

**Defecto corregido de paso.** `DesignValidator` convertía el documento a
centímetros en memoria y después lo validaba con el `format` original: un plano
heredado en `mm` se normalizaba, pero se rechazaba con «El ancho del lienzo debe
estar entre 400 y 4000». Ahora se relee el formato después de convertir y ese
plano entra.

**DEC-6 cayó por su propio peso.** C-06 (`ExtinguisherCoverage` dividiendo entre
100) ya no es un defecto cuando la geometría está en centímetros: era la unidad la
que estaba mal, no la división. C-07 (`measure.js`) se corrigió en la etapa 0.

### 26.2 Etapa 2 · medida por objeto (DEC-2)

`app/Services/ElementMeasure.php` es la única autoridad para responder «cuánto
mide esto»:

| Método | Devuelve |
| --- | --- |
| `lengthCm(array $element)` | `[float $cm, 'measured' \| 'geometry']` — la medida declarada manda |
| `lengthMeters(array $element)` | la misma cifra en metros |
| `measuredCm(array $element)` | la medida declarada, o `null` |
| `geometryCm(array $element)` | el arco si hay puntos; si no, el ancho del cajón |
| `acceptsMeasure(string $type)` | los 13 tipos que admiten medida (muros, rutas, tuberías…) |
| `sourceLabel(?string $quality)` | «del dibujo», «medida en sitio», «medida aproximada», «medida estimada» |

Reglas de entrada: `measuredM` entre 0,01 y 5 000 m con tres decimales, y
`quality` en {`exacta`, `aproximada`, `estimada`}. Vaciar el campo devuelve el
objeto al dibujo.

En el editor, el inspector de cualquier objeto medible ofrece **Largo real** y
**Calidad de la medida** (`measureBlock()` en `assets/js/editor/inspector.js`). La
cota y el exportador rotulan la medida declarada, no la cuerda dibujada: un muro
de 418,6 cm con `measuredM: 4.2` se lee **420,0 cm** en el plano en centímetros y
**4,20 m** en el plano en metros, sin mover ni un vértice.

### 26.3 Qué cambia en las cifras, y por qué se anuncia

- Los planos guardados en `mm` o `m` se convierten a centímetros **una sola vez**.
  La misma pared sigue midiendo lo mismo; cambia la cifra interna.
- Los informes que dividían entre 100 «porque sí» ahora aciertan en cualquier
  unidad. En el golden se mueven únicamente `synthetic.unidades.{mm,m}`
  (`rectaMetros`, `arcoMetros`) y aparece `routes.N.lengthSource`. El auditor, los
  extintores, las redes y los cuatro SVG salen idénticos.
- `schema_version` pasa de 2 a 3. Un archivo 2 se sigue importando.

### 26.4 Pruebas

`node tests/run-all.mjs` → **24/24** (PHP 8.1 y 8.3). Las cuentas que respaldan
esta sección: funcional **336**, interfaz **394**, unidades PHP **29**, curvas
**17**, golden **8/8** con 6 413 valores y 4 SVG, paquete y demo **39**. Entre
ellas: un documento histórico en `mm` entra y queda en 1 200 cm con etiqueta `mm`;
un documento en formato 5 no se vuelve a convertir; cambiar el lienzo a metros y
volver a centímetros deja el mismo ancho y los mismos objetos; la cota del plano
exportado dice `420,0 cm` en centímetros y `4,20 m` en metros.

### 26.5 Lo que sigue sin hacerse

- **DEC-3 (etapa 3):** el ajuste global por mediana. Se implementó en la 1.21.0
  (§28).
- **DEC-7 a DEC-12:** edificios, áreas, aforo, escenarios, escala física de
  impresión e importados. `user_version` sigue en **7**: la 1.19.0 no crea tablas.
- La ergonomía del campo de medida y la impresión física con regla siguen sin
  verificarse (§25.4 y §25.5): no hay dispositivo real disponible aquí.

---

## 27. Aforo calculado y publicado (1.20.0)

Etapa 3 pedida el 2026-11-02: que el informe **calcule el aforo a partir de las
dimensiones del plano** y que el **pie del plano exportado** lo publique.

### 27.1 Una sola fórmula

`PlanAudit::aforo()` (PHP) es la única autoridad; el informe, el cajón de revisión
y el pie del plano la usan a través de él.

```
aforo máximo = superficie útil libre (m²) × densidad de referencia (pers./m²)
```

La superficie útil libre es la misma rejilla del auditor: área interior
transitable, sin muros ni el terreno de fuera del edificio. Se calcula con
`PlanAudit::freeArea()`, que no necesita recorridos (el pie del plano no va a
buscar el camino más largo hasta cada salida).

| Clave | Qué es | De dónde sale |
| --- | --- | --- |
| `maxPersons` | capacidad del piso | superficie libre × densidad, acotada por `occupancy.maxPersons` |
| `declared` | gente declarada | *Ajustes del piso › Ocupación declarada*; `0` = sin declarar |
| `permitted` | **aforo permitido** | el menor entre `declared` y `maxPersons` |
| `used` | gente con la que se calcula la salida | `declared` si existe; `maxPersons` si no |
| `excess` | gente declarada por encima del máximo | `max(0, declared − maxPersons)` |
| `source` | cómo se obtuvo el aforo | `declared` o `estimated` |

**Por qué `used` es la declarada y no la permitida.** Si el plano declara 30
personas y la capacidad es 23, en el recinto puede haber 30. Calcular la salida
con 23 daría un tiempo optimista justo en el caso peor. Lo que sí se dice, con el
hallazgo `occupancy_over_capacity`, es que el aforo declarado supera el máximo.

### 27.2 Dónde se ve

| Superficie | Qué muestra |
| --- | --- |
| Informe imprimible (`…/audit`) | sección **Aforo del piso**: capacidad y fórmula, aforo permitido, ocupación declarada con su exceso, y las personas del cálculo |
| Cajón **Revisión** del editor | indicador *Aforo permitido* y filas de máximo, permitido y ocupación |
| Pie del plano (SVG, PNG e impresión) | dos líneas: *Aforo máximo N personas · Aforo permitido N personas · Superficie útil libre X m²* y la fuente del dato |
| API (`api/floors/{id}/audit`) | `report.occupancy.{maxPersons,declared,permitted,excess,freeAreaM2,density,cap}` |

En el PNG del editor, si en la sesión se corrió la revisión, el pie usa las cifras
recién calculadas en lugar de las del plano guardado.

### 27.3 Límites, otra vez

- Es una **capacidad calculada**, no un aforo legal. No reemplaza el que fije la
  autoridad competente ni la revisión de la ocupación real.
- La densidad es un criterio configurable (`occupancy.densityPersonsPerM2`), no una
  tabla normativa por uso. Con `density = 0` no se inventa capacidad: manda el
  techo `occupancy.maxPersons`.
- La superficie libre depende de cómo se dibujaron los muros: un recinto sin
  muros se mide como un solo espacio.
- Sin verificar: la densidad adecuada para cada uso según la norma aplicable y la
  lectura en sitio; y el comportamiento en papel de las dos líneas nuevas del pie.

### 27.4 Pruebas

Funcional **342** (capacidad sin declarar, declarado desmedido con exceso,
densidad 0 → techo, sección del informe, aforo en el pie del SVG), interfaz
**397** (cajón con aforo permitido, pie del PNG y vista previa del pie), golden
**8/8** con 6 504 valores. El golden cambia donde el plano declaraba más gente de
la que cabe: aparece `occupancy_over_capacity` y los cuatro SVG ganan las dos
líneas del aforo. Las métricas de evacuación no se mueven.

## 28. Ajuste global por mediana (1.21.0 · DEC-3)

Etapa 3, cuarta entrega. Hasta ahora el editor **comparaba** lo declarado con lo
dibujado; ahora puede **hacer que coincidan** sin obligar a nadie a recalibrar ni
a volver a dibujar. Se cierra DEC-3 tal como se aprobó: **una acción del
historial, sin estado nuevo**.

### 28.1 Qué hace, en una frase

Toma todas las medidas declaradas, calcula **la mediana** de `medida / dibujo` y
reescala el plano entero por ese factor. Ni media, ni promedio ponderado: la
mediana aguanta que alguien escriba 40 m donde eran 4,0 m sin arrastrar al resto.

| Clave de `measureFit()` | Qué es |
| --- | --- |
| `count` | objetos con medida declarada y trazo medible |
| `median` | mediana de las relaciones `medida / dibujo` |
| `rows[]` | por objeto: `drawn` (cm), `measuredCm` (cm) y `deviation` respecto a la mediana |
| `worstDeviationPct` | el peor residuo, en %; por encima de **2 %** las medidas se contradicen |
| `averageDeviationPct` | residuo medio, solo para el texto del panel |
| `consistent` | `worstDeviationPct ≤ 2` |
| `inRange` | el lienzo resultante cabe en 400–4 000 × 300–3 000 cm |
| `applicable` | hay medidas, hay algo que corregir y el lienzo cabe |
| `reason` | `sin_medidas` · `inconsistente` · `coincide` · `fuera_de_rango` · `aplicable` |
| `before` / `after` | ancho y alto del lienzo antes y después |
| `moved` | cuántos elementos se moverían |

`applyMeasureFit()` aplica el factor a `canvas`, a `x/y/w/h`, a los `points` y a
los `curves[].through`, redondeando a dos decimales para no acumular ruido. **No**
toca `stroke`, los tamaños de letra, `widthM` ni `section` (son dibujo o metros de
proyecto, no medidas del lienzo) ni las medidas declaradas, que siguen siendo la
verdad de referencia. Si no hay medidas, si discrepan o si el lienzo se sale del
formato, **lanza un error explicado** en lugar de ajustar a medias.

### 28.2 Dónde se ve

| Superficie | Qué muestra |
| --- | --- |
| Cajón **Ajustes** del editor | «N medidas no coinciden con el dibujo (X % de media)», el lienzo antes/después, cuántos elementos se moverían, el residuo de cada medida, y dos botones: **Ajustar el dibujo a esas medidas** y **Dejar solo las medidas** |
| Medidas contradictorias | «Las medidas no coinciden entre sí: revisa si alguna está en otra unidad», con el botón **deshabilitado** |
| Al guardar | la versión queda como **«Ajuste a 3 medidas (×1,0032)»**; es toda la trazabilidad |
| Historial | una sola acción: `Ctrl+Z` devuelve el plano a su tamaño anterior |

El bloque solo aparece cuando hay algo que contar; se puede descartar y no vuelve
a molestar hasta que cambien las medidas o la mediana.

### 28.3 Lo que deliberadamente **no** se guarda

No hay `factor`, ni `calibration`, ni bloque nuevo en el documento: el plano
guardado es el plano ajustado, con sus medidas intactas. Guardar el factor
obligaría a decidir cuándo deja de valer, y ese estado es exactamente lo que
DEC-3 evitó. La nota de la versión nombra el ajuste y el factor, y ahí termina.

### 28.4 Pruebas

Funcional **343** (la nota del ajuste llega a la versión, la medida declarada
sobrevive al guardado y el documento no lleva factor), interfaz **406** (mediana
con residuos de 0,011 / 0,012 / 0,000 %, lienzo 16,00 × 10,00 → 16,05 × 10,03 m,
deshacer completo, medidas contradictorias al 16,9 % sin ajuste, bloque del panel
con sus dos botones, y un plano abierto que conserva sus medidas), golden **8/8**
con 6 504 valores —el ajuste es del editor y no mueve ninguna cifra del
servidor—. Sin verificar: el aspecto del bloque en pantalla real y el ajuste sobre
documentos de obra grandes.

## 29. Escala física al exportar (1.22.0 · DEC-8)

Etapa 4, quinta entrega. Hasta aquí el «1:100» del plano era decorativo: el SVG
salía en unidades del lienzo, el navegador las leía como píxeles y la impresión
recortaba a lo que cupiera. Ahora **el SVG tiene tamaño de papel** y la escala se
elige al exportar.

### 29.1 El modelo, en tres magnitudes que ya no se mezclan

| Magnitud | Unidad | De qué depende |
| --- | --- | --- |
| Dimensión real | metros | lo que se midió (§5) |
| Tamaño del dibujo | milímetros de papel | dimensión ÷ escala |
| Escala de impresión | `1:N` | lo que se elige al exportar |

`viewBox` va en milímetros de papel y el plano se adentra con
`transform="scale(10 / N)"`: un muro de 4,20 m mide **42 mm en 1:100** y **84 mm en
1:50**, sin que cambie **ni una coordenada** del documento. El mismo plano produce
cualquier escala sin guardar nada distinto.

### 29.2 Qué se ve

| Dónde | Qué |
| --- | --- |
| SVG exportado (`…/export/svg`) | `width`/`height` en `mm`, `data-scale="1:N"`, `data-plan-width-mm` y `data-plan-height-mm` |
| `?escala=1:50` en esa ruta | la misma exportación a otra escala; lo que no se entiende vuelve a la del plano |
| Vista de impresión (`…/print`) | selector de **escala** y de **hoja** (A4/A3, horizontal o vertical), el ancho y alto que tendrá el plano en papel, si cabe, y el botón **Ajustar a la hoja** con la escala mayor que entra |
| Pie del plano | la escala **impresa** (no la guardada) y una **barra de escala** con su largo en milímetros, que es lo único que sigue siendo cierto si alguien imprime al 97 % |
| Impresión | `@page` según la hoja elegida y el SVG a tamaño real: el CSS ya no lo estira |

### 29.3 Decisiones que van con esto

- **El pie no se dibuja a la escala del plano.** Si lo hiciera, a 1:500 la letra
  mediría medio milímetro. Se dibuja en un lienzo fijo de 1 200 unidades que se
  mapea al ancho de la hoja, así que su tamaño en milímetros no depende de `N`.
- **Ancho mínimo de hoja de 190 mm.** Si el plano es más estrecho que eso a la
  escala pedida, la hoja se completa con blanco para que el pie siga siendo
  legible. No se agranda el dibujo: eso sería cambiar la escala a escondidas.
- **Nunca se reescala el documento.** Elegir escala u hoja no guarda nada, no
  crea versión y no toca `canvas.scale`. Si se cierra la vista sin imprimir, todo
  está como estaba.
- **No se elige sola.** «Ajustar a la hoja» es un botón; la vista no cambia la
  escala por su cuenta.
- **La impresión del navegador puede estropearlo.** Si el diálogo imprime
  «ajustar a la página», la escala se pierde; la vista lo advierte y la barra del
  pie lo permite comprobar con una regla.

### 29.4 Pruebas

Funcional **353** (tamaño en milímetros, plano a la escala del documento, 1:50
mide el doble con coordenadas idénticas, pie con la escala impresa y su barra,
escala inválida que vuelve a la del plano, el documento no cambia, y la vista de
impresión con escala, hoja, aviso de recorte y «ajustar a la hoja»), interfaz
**406** y **54** de páginas (la cabecera nueva), golden **8/8** con 6 504 valores.
En el golden **solo cambian los cuatro SVG** (+1 KB cada uno: la caja en
milímetros, la transformación y la barra); ninguna cifra del auditor, de la
cobertura ni de las redes se mueve.

Sin verificar: la medida con regla sobre papel real —aquí no hay impresora— y el
diálogo de impresión de cada navegador.

## 30. Recursos de primeros auxilios en el cálculo (1.23.0)

Lo que el auditor miraba era la evacuación y la extinción. Faltaba lo que se usa
**cuando alguien se hace daño**: botiquín, camilla y desfibrilador. Ya están en el
cálculo, con tres cifras y tres hallazgos, y sin pedir nada nuevo al usuario.

### 30.1 Qué se cuenta

| Recurso | Objetos que lo representan | Qué se mide |
| --- | --- | --- |
| Botiquín | `cad_emg_firstaid` (nuevo en el catálogo) | cuántos hay y la distancia en línea recta del punto más lejano del espacio libre al más cercano |
| Camilla | `cad_emg_stretcher`, `cad_hosp_stretcher` | cuántas hay en el piso |
| DEA | `cad_emg_aed` | cuántos hay, su alcance y si la afluencia calculada pasa del umbral |

Los recursos de una capa oculta no cuentan: si no se ve en el plano, no está en el
plano.

### 30.2 Los umbrales, y por qué son «de referencia»

`resources/audit-criteria.json` gana un bloque `firstAid`:

| Clave | Valor por defecto | Qué significa |
| --- | --- | --- |
| `kitTravelM` | 30 | distancia máxima del punto más lejano al botiquín |
| `stretcherPerFloor` | `true` | se espera una camilla por piso |
| `aedMinPersons` | 500 | afluencia a partir de la cual el DEA deja de ser informativo |
| `aedTravelM` | 100 | distancia máxima al DEA |

Los números son **criterios de la aplicación**, no exigencias normativas: la norma
aplicable depende del establecimiento, del riesgo y de la afluencia, y la revisa un
profesional. La referencia que se cita en el informe es el Decreto 1072 de 2015
(atención oportuna de primeros auxilios), la Resolución 0312 de 2019 (recursos para
la respuesta ante emergencias) y, para el DEA, la Ley 1831 de 2017 y la Resolución
3316 de 2019.

### 30.3 Los hallazgos

| Código | Severidad | Cuándo |
| --- | --- | --- |
| `no_first_aid_kit` | importante | no hay ningún botiquín dibujado |
| `first_aid_kit_far` | importante | el punto más lejano queda fuera del alcance de referencia |
| `no_stretcher` | importante | no hay camilla en el piso |
| `no_aed` | menor / **importante** | no hay DEA; sube a importante si la afluencia calculada pasa del umbral |
| `aed_far` | menor | el DEA queda fuera del alcance de referencia |

**El DEA no se declara obligatorio.** Por debajo del umbral el hallazgo es
informativo y dice textualmente que no se exige: lo contrario sería afirmar algo
sobre la norma que el programa no puede saber.

### 30.4 Dónde se ve

| Superficie | Qué muestra |
| --- | --- |
| Informe imprimible (`…/audit`) | sección **Recursos de primeros auxilios**: botiquines, camillas, DEA y personas del cálculo, con el alcance medido |
| Cajón Revisión del editor | filas de botiquines, camillas y DEA dentro de la medición |
| API (`api/floors/{id}/audit`) | `report.firstAid` con `kits`, `stretchers`, `aeds`, `coverage`, `people` y `criteria` |
| Catálogo | el botiquín como objeto propio, familia *Emergencia* |

### 30.5 Lo que no comprueba

Contenido del botiquín, dotación, vencimientos, carga del DEA, parches ni
mantenimiento. El informe lo dice con esas palabras: el plano deja constancia de
**dónde está**, no de **cómo está**. Eso se verifica en sitio y es lo que ya hace la
lista de verificación física del producto.

### 30.6 Pruebas

Funcional **361** (sin recursos aparecen los tres hallazgos; el DEA queda en *menor*
bajo el umbral y pasa a *importante* con 900 personas; botiquín y camilla dibujados
apagan sus hallazgos; el alcance del botiquín se mide —9,52 m en el piso de prueba y
46,17 m cuando se aleja—; la sección del informe y el botiquín del catálogo),
interfaz **406**, páginas **54**, golden **8/8** con **6 974 valores**. El golden
crece porque el informe gana el bloque `firstAid` y porque la demo incorpora los tres
recursos en la planta baja: los otros pisos muestran lo que falta, que es justo lo
que el cálculo tiene que decir.

## 31. Escenarios de ocupación temporal en el cálculo (1.24.0 · A-04)

El auditor sabía cuánta gente cabe **todos los días**. No sabía qué pasa el día que
se monta un evento en la misma bodega. Un aforo de 23 personas no dice nada sobre la
capacitación de brigada con 30 sillas, y el plano que se aprueba un martes se usa el
sábado con otra gente. Ese hueco es el que cierra esta entrega.

### 31.1 Qué se declara

En **Ajustes del piso** → *Escenarios de ocupación temporal*, hasta **8** filas con
dos datos:

| Campo | Límite | Qué es |
| --- | --- | --- |
| Nombre | 1 a 60 caracteres, sin `<` ni `>` | «Capacitación de brigada», «Hora pico de cafetería» |
| Personas | 1 a 10 000 | cuánta gente se espera en ese evento |

Se guardan **con el plano**, en `canvas.scenarios`, y no en una tabla aparte. Viajan
con la versión, el borrador, la exportación JSON y la demo; no hay migración,
`user_version` sigue en **7**, y un plano sin escenarios se guarda exactamente igual
que antes (la clave no existe).

### 31.2 Qué se calcula, y con qué fórmulas

Ninguna fórmula nueva. Las tres cifras del escenario salen de los criterios que ya
usaba el piso:

| Cifra | Fórmula |
| --- | --- |
| capacidad | superficie libre × densidad de referencia (`occupancy.densityPersonsPerM2`) |
| ancho exigido | personas × `egress.widthMmPerPerson` |
| tiempo estimado | marcha del piso (`egress.travelSpeedMps`) + cola `personas ÷ (flujo × ancho útil)` |

Cada escenario se compara con el piso y devuelve `fits` (¿cabe?), `excess`,
`widthOk`, `queueTimeS`, `estimatedTimeS` y `extraTimeS` (lo que suma sobre el uso
habitual).

**El escenario no cambia el aforo del piso.** `occupancy.people`, `permitted`,
`excess` y el tiempo del uso habitual siguen siendo los mismos; el escenario se
informa aparte. Mezclarlos habría cambiado en silencio el resultado de un plano ya
revisado, y son dos preguntas distintas: *¿cuánta gente cabe aquí todos los días?* y
*¿qué pasa el día del evento?*

### 31.3 Los hallazgos

| Código | Severidad | Cuándo |
| --- | --- | --- |
| `scenario_over_capacity` | importante | las personas del escenario superan la capacidad calculada |
| `scenario_width_short` | importante | el ancho exigido por el escenario supera el ancho útil de las salidas |
| `scenario_more` | informativo | más de cuatro escenarios se pasan: arriba van los cuatro más exigentes |

Los hallazgos se emiten de mayor a menor número de personas, hasta cuatro
escenarios; el resto se cuenta en `scenario_more` para no tapar el informe con
repeticiones. Sin escenarios no aparece ninguna sección ni ningún hallazgo.

### 31.4 Dónde se ve

| Superficie | Qué muestra |
| --- | --- |
| Ajustes del piso | las filas de escenario, con añadir y quitar |
| Informe imprimible (`…/audit`) | sección **Escenarios de ocupación temporal**: tabla con personas, capacidad, ancho exigido, tiempo estimado y si cabe, más el uso habitual y la capacidad del piso |
| Cajón Revisión | dos filas nuevas: escenarios declarados (con el más exigente) y capacidad del piso, más una nota de alcance |
| API (`api/floors/{id}/audit`) | `report.scenarios` con `count`, `items`, `peak`, `base`, `criteria` y `notice` |

### 31.5 Lo que no hace, y se dice

No aprueba el evento: no verifica el permiso, la silletería, las tarimas, las
estructuras, los extintores adicionales que pida la autoridad ni la ocupación real en
la puerta. El informe lo escribe con esas palabras. Tampoco reemplaza el diseño de
§20 —personas por área, vigencia, cierre inmutable y `floor_version_id`—, que sigue
pendiente de DEC-11 y DEC-12.

### 31.6 Pruebas

Funcional **373** (sin escenarios no hay sección ni clave; dos escenarios se guardan
y solo el que no cabe se marca; el aforo habitual queda intacto; un escenario de 200
personas con una salida de 90 cm produce `scenario_over_capacity` y
`scenario_width_short`; `422` para nueve escenarios, nombre vacío, cero personas y
claves de más; sección y nota en el informe; la demo declara dos escenarios en la
planta baja), interfaz **412** (añadir, guardar, quitar y volver a añadir sin que el
aforo declarado se mueva; el servidor los conserva; el cajón los resume), páginas
**54**, golden **8/8** con **7 256 valores**. El golden crece por el bloque
`scenarios` y por la demo: la planta baja gana un hallazgo importante y la cafetería
otro, que es exactamente lo que un evento con más gente que la capacidad tiene que
decir.

## 32. Simulacro de evacuación con animación (1.25.0 · A-05)

§20 diseñó los escenarios como registros con fecha; lo que faltaba era otra cosa:
**ver la evacuación**. Un plano de emergencia se aprueba mirando líneas, pero se
entiende viendo a la gente salir. Esta entrega añade el tiempo objetivo y una
animación de figuras que recorren las rutas dibujadas hasta el punto de encuentro.

### 32.1 Qué se declara

En **Ajustes del piso** → *Simulacro de evacuación* hay dos números, los dos
opcionales y los dos declarados por el usuario:

| Campo | Rango | Qué es |
| --- | --- | --- |
| Reacción (s) | 0 a 600 · por defecto 30 | tiempo entre la alarma y el primer paso (pre-movimiento) |
| Tiempo medido (s) | 1 a 7200 · opcional | lo que duró el simulacro cronometrado en sitio |

Se guardan en `canvas.drill` (`{reactionS, measuredS?}`) con el plano, igual que
los escenarios: sin migración, `user_version` sigue en **7**.

### 32.2 Qué se calcula

```text
tiempo objetivo = reacción + camino hasta la salida + tramo al punto de encuentro
```

- El **camino** sale de la longitud real del trazo (`ElementMeasure`): si la ruta
  tiene medida declarada, manda esa; si no, la geometría.
- El **tramo** es la distancia en línea recta de la salida al punto de encuentro.
- La **velocidad** es la del criterio (`egress.travelSpeedMps`, 1 m/s), no una
  medición de esta brigada.
- Sin punto de encuentro el objetivo existe igual: es la llegada a la salida, y el
  informe dice cuál de los dos tramos está incluido (`targetSource`).

El punto de encuentro se detecta por el objeto **«Punto de encuentro de
evacuación»** (nuevo en el catálogo, familia Emergencia) o, si no está dibujado,
por la señal **E007**. El objeto manda porque marca la zona de reunión, no solo el
pictograma.

### 32.3 La animación

En **modo presentación** hay un botón **Simulacro** que abre un panel y dibuja una
figura por ruta sobre el lienzo:

1. esperan el tiempo de reacción (pulsando, en naranja);
2. caminan por el trazo a la velocidad de referencia (azul);
3. siguen de la salida al punto de encuentro (el aro discontinuo del plano);
4. se pintan en verde al llegar.

El reloj del panel corre en segundos simulados y termina con «completo» en el
tiempo objetivo; la lista de rutas dice en qué fase va cada figura. La reacción se
puede cambiar ahí mismo y el simulacro se reinicia sin tocar el plano guardado.
Las velocidades de la barra (lenta, normal, rápida) cambian solo el ritmo de la
pantalla, no los tiempos calculados.

La capa de figuras se vuelve a montar en cada redibujado del editor
(`redrawOverlay()`): sin eso desaparecían al mover el plano o tocar una capa.

### 32.4 Los hallazgos

| Código | Severidad | Cuándo |
| --- | --- | --- |
| `no_meeting_point` | menor | hay rutas pero ningún punto de encuentro declarado |
| `drill_slower_than_target` | menor | el tiempo medido supera el objetivo calculado |

### 32.5 Dónde se ve

| Superficie | Qué muestra |
| --- | --- |
| Ajustes del piso | reacción y tiempo medido |
| Modo presentación | panel con reloj, objetivo, lista de rutas y figuras animadas |
| Informe imprimible | sección **Simulacro de evacuación**: objetivo, punto de encuentro, tiempo medido y su diferencia, y tabla por ruta |
| Cajón Revisión | tres filas: objetivo, punto de encuentro y tiempo medido |
| API | `report.drill` con `routes`, `meeting`, `reactionS`, `speedMps`, `targetS`, `measuredS`, `differenceS` |

### 32.6 Lo que no hace, y se dice

No mide un simulacro real, no cuenta participantes, no evalúa la ejecución de la
brigada ni la evacuación de personas con movilidad reducida, y no convierte el
tiempo calculado en una promesa. Lo escrito en el informe, el panel y el cajón es
el mismo texto: *tiempo objetivo calculado; se cronometra en sitio*.

### 32.7 Pruebas

Funcional **384** (sin punto de encuentro el aviso aparece y el tramo no se
inventa; el objetivo suma reacción y camino —30 s + 4 s = 34 s—; el punto
dibujado cierra el recorrido; cambiar la reacción mueve el objetivo en la misma
cantidad; el tiempo medido se compara y avisa; `422` para reacción 601, medido 0 y
claves de más; sección del informe y punto de encuentro en el catálogo), interfaz
**424** (los campos del simulacro se guardan y se limpian; el panel carga el
informe, dibuja una figura por ruta, espera la reacción, camina, llega, reinicia y
se retira al salir), páginas **54**, golden **8/8** con **7 514 valores**. El
golden crece por el bloque `drill` y porque la demo gana dos hallazgos menores: el
simulacro medido en la planta baja y la falta de punto de encuentro en los otros
tres pisos, que es justo lo que el cálculo tiene que decir.

## 33. El simulacro se mueve por el espacio libre (1.26.0)

La primera animación del simulacro caminaba en línea recta sobre el trazo y, en el
tramo final, atravesaba la pared de la edificación. Bonito de mirar y falso: nadie
sale del edificio en línea recta por el muro. Esta entrega corrige la geometría y
deja el movimiento **restringido al espacio libre del plano**.

### 33.1 El camino se calcula, no se dibuja

`PlanGrid::path()` resuelve el recorrido sobre la **misma rejilla del auditor**:

| Pieza | Cómo funciona |
| --- | --- |
| Rejilla | celdas de 20 cm; los muros quedan bloqueados con su holgura y los vanos abiertos |
| Búsqueda | Dijkstra de ocho vecinos sobre celdas libres, con la diagonal sin cortar esquinas |
| Simplificación | línea de vista: se conservan las esquinas y se descartan los escalones de la rejilla |
| Interior | solo celdas del piso (el exterior no vale para el tramo de dentro) |
| Exterior | se permite salir del piso para ir de la salida al punto de encuentro: la gente **rodea** la edificación |

El tramo interior va del inicio del trazo al **centro del vano** de la salida (no al
centro de la caja de la puerta). El tramo exterior va de ese vano al punto de
encuentro. La suma de los dos es `pathM`, y `walkS` es `pathM ÷ velocidad`.

### 33.2 Qué se ve ahora

- **Una o varias figuras por ruta**, repartidas sobre el camino: una por cada 4 m,
  mínimo una y máximo cuatro. Cada figura arranca en un punto distinto del mismo
  camino y llega cuando le toca, de modo que se ve el tramo cubierto y no una fila
  india de puntos en el arranque.
- **Ninguna figura cruza un muro** ni pisa fuera del piso en el tramo interior: si
  el camino no existe, no hay figura.
- **El tramo final rodea la edificación** y termina en el punto de encuentro.
- El panel sigue mostrando reloj, estado por ruta («2 en camino · 1 de 3 llegaron»)
  y la nota de alcance.

### 33.3 Hallazgo nuevo

| Código | Severidad | Cuándo |
| --- | --- | --- |
| `drill_route_blocked` | importante | hay una salida marcada y el inicio del trazo no se puede conectar con ella sin cruzar un muro |

Sin salidas marcadas no aparece: el auditor ya lo dice con `no_exit` y repetirlo por
cada ruta sería ruido.

### 33.4 Un número que cambia, y se anuncia

El tiempo objetivo ya no usa la longitud del trazo: usa el **camino caminable**, que
puede ser más largo cuando hay que rodear un tabique. En la demo, la ruta de la
planta baja pasa de 14,68 m de trazo a **15,56 m de camino** y el objetivo de 47,9 s
a **45,6 s** (el cambio viene también de que el tramo final ahora se mide por fuera,
rodeando la esquina). Es un cambio de cifra **a propósito** y queda dicho aquí y en
el changelog: el número anterior era una línea recta, el nuevo es el recorrido.

### 33.5 Pruebas

Funcional **386** (el camino rodea un muro de 5,5 m y crece de 6,45 m en línea recta
a 8,11 m; una ruta encerrada sin vano se queda sin `pathM`, sin `walkS` y con
`drill_route_blocked`; el objetivo sigue siendo reacción + camino), interfaz **426**
(las figuras arrancan y terminan sobre el camino que devolvió el servidor, esperan la
reacción, caminan, llegan y se reinician), páginas **54**, golden **8/8** con
**7 552 valores**. En el golden solo se añaden las claves nuevas del camino: ningún
recuento de hallazgos se mueve.

## 34. La pluma: nodos de control en los trazos (1.27.0)

Los trazos de un solo eje se dibujaban de dos maneras: **arrastre** para muros,
líneas, cotas, vías, andenes y linderos, y **clic a clic** solo para rutas, tuberías
y circuitos. El arrastre obliga a dibujar el elemento entero en un gesto: no hay
manera de corregir la esquina anterior sin soltar, y en un muro largo el pulso manda
sobre lo que se quiere medir.

Desde la 1.27.0 los seis trazos de arrastre se dibujan **como en una pluma
vectorial**: cada clic deja un nodo, el tramo elástico sigue al cursor y el trazo se
cierra cuando el usuario decide.

### 34.1 Un gesto que se decide al soltar

| Gesto | Resultado |
| --- | --- |
| `pointerdown` + `pointerup` en el mismo sitio | Un nodo fijo |
| `pointerdown` + mover más de 3 px | Tramo de dos puntos de siempre |
| Clic sobre el primer nodo (a ≤ 14 px de pantalla) | Cierra el recinto, con el primer punto repetido al final |
| `Enter` o doble clic | Termina con los nodos ya fijados |
| `Retroceso` / `Supr` | Quita el último nodo; con un solo nodo, descarta el trazo |
| `Esc` | Descarta el trazo a medio dibujar |
| `Shift` | Alinea el nodo nuevo con el anterior, horizontal o vertical |
| `Alt` | Suelta el ajuste a la rejilla para ese nodo |

La decisión se toma **al soltar**, no al pulsar: el gesto anterior sigue valiendo y
nadie tiene que aprender un modo nuevo para dibujar un muro de dos puntos. El
arrastre no crea un nodo aparte; si el trazo ya empezó, cada clic añade un nodo y
el arrastre queda desactivado hasta terminarlo, para que no se mezclen los dos
modos a mitad de un recinto.

La pluma **solo cierra en circuito** los trazos que delimitan algo: muro, vía,
andén y límite de predio. Una línea o una cota abiertas no se cierran solas, y una
cota se termina con el **segundo nodo**, porque una medida es entre dos puntos.

### 34.2 Lo que se ve mientras se dibuja

El borrador (`renderer.draftNode()`) deja de ser una línea entre dos puntos:

- **Nodos de control**: círculos sobre los nodos ya fijados; el primero se marca más
  grande y con el verde de cierre, porque es el destino del clic que cierra.
- **Tramo elástico**: la polilínea sigue al cursor y el último punto no forma parte
  del trazo hasta que se hace clic.
- **Grosor real del muro**: una banda translúcida de 2 m, el mismo ancho con que el
  muro se dibuja en el plano, así que lo que se ve es lo que va a quedar.
- **Cifra del tramo elástico**: la distancia del último nodo al cursor, en la unidad
  del plano, para saber cuánto va a medir antes de fijarlo.
- **Pista de la barra**: nombre del trazo, número de nodos, cómo cerrar y cómo
  terminar; con un solo nodo, «necesita al menos dos nodos».

Los nodos del borrador son **informativos**: se dibujan con `pointer-events: none` y
no se arrastran. Para mover un nodo ya creado se usa el elemento terminado, que ya
tenía sus tiradores de vértice y sus combas.

### 34.3 Qué no cambia

- **El modelo**: `Model.addPath()` ya aceptaba N puntos y sus curvas. Un muro de
  cinco nodos es el mismo elemento de siempre, con el mismo formato de guardado y
  las mismas exportaciones. **No hay migración**: `user_version` sigue en 7 y el
  formato de plano no sube de versión.
- **Las cifras**: el área, el recorrido del auditor, la escala y el golden no se
  mueven. Un muro dibujado con cuatro clics mide exactamente la suma de sus tramos,
  y el nodo cae sobre la rejilla de 20 cm (o donde el usuario quiera con `Alt`).
- **El arrastre**: sigue disponible en los seis trazos y no cambia de resultado.
- **Los demás elementos**: rectángulos, elipses, pasos cebra, parqueaderos, puertas
  y textos conservan su gesto.

### 34.4 Pruebas

Interfaz **442** comprobaciones (16 nuevas): el primer clic abre el muro con su nodo
visible; cada clic añade un nodo y el tramo elástico sigue al cursor; el borrador
muestra nodos, cifra del tramo y banda de grosor; `Retroceso` quita el último nodo;
`Shift` alinea con el nodo anterior; `Enter` cierra con los nodos puestos y la
longitud que suman (500 cm en cuatro nodos); la pluma sigue activa para el muro
siguiente; el clic sobre el primer nodo cierra el recinto; el doble clic termina;
`Esc` no deja elemento; la cota de dos clics se cierra sola; y arrastrar sigue
creando el muro de dos puntos. Funcional **386**, páginas **54** y golden **8/8** con
**7 552 valores** sin cambios.

Los muros de prueba de estas comprobaciones se retiran al final del bloque para que
el resto de la sesión siga con el plano tal como estaba: un muro nuevo en medio del
plano cambiaría los caminos del auditor.
