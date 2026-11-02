# NORMIA-006 · Dimensiones simples

Rediseño del sistema de dimensiones de Normia CAD para que un profesional de SST
pueda dibujar, anotar medidas y recibir cálculos sin aprender metrología.

| | |
| --- | --- |
| Misión | 004 — diseño y ajuste funcional, **sin implementación** |
| Rama | `arena/48ee92e3-normia-planos-cad` |
| Base | `bddc2dc` (NORMIA-005 entregado, PR #56 abierto) |
| Reemplaza en parte | [`NORMIA-005-CALIBRACION-DIMENSIONAL.md`](NORMIA-005-CALIBRACION-DIMENSIONAL.md) — §8 de trazabilidad |
| Estado | **propuesta para aprobar**; no se tocó código ni datos |

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

**Nota de alcance.** El mensaje de la misión llegó con el punto **3.A (unidades)**
completo; los puntos siguientes no llegaron. Este documento diseña el **núcleo**
—unidades, medidas y cálculos— para que lo que falte encaje sin rehacerlo, y
señala en §5.5 y §12 dónde se enchufa cada pieza pendiente. Si el resto pide otra
cosa, se ajusta aquí mismo, no en otro documento.

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

### 10.2 Decisiones para aprobar

**DEC-1 · Geometría en centímetros y unidad como etiqueta.**
Es el corazón del rediseño y lo que hace que cambiar de unidad no sorprenda.
Recomendación: **sí**. Alternativa: conservar la unidad declarada y convertir al
cambiarla — más barato de escribir, pero solo funciona cuando el lienzo cabe en
la unidad destino, que hoy no ocurre en ningún plano de edificio.

**DEC-2 · La medida vive en el objeto, no en el plano.**
Recomendación: **sí**, con `measuredM` + `quality` por elemento.
Alternativa: un factor global editable a mano. Es más barato de implementar y es
exactamente el número mágico que la misión quiere quitar de la vista del usuario.

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
6. **Los puntos 3.B y 3.C de la misión no llegaron**; §5.5 dice dónde encajan las
   piezas de medida que faltan, pero si piden otra cosa, esto se ajusta.
