# Unidades y medidas del plano

Cómo se pasa de lo dibujado a lo medido, qué se convierte y qué no, y qué
defectos se conocen. Describe el código desde la **etapa 0 de NORMIA-004**.

---

## 1. La regla de oro

**Una unidad del lienzo equivale a la unidad declarada del plano.** Si el plano
dice `cm`, un muro de 400 unidades mide 400 cm = 4 m. Si dice `m`, esas mismas
400 unidades son 400 m.

Esa unidad se declara por plano en *Ajustes del piso › Lienzo y escala* y viaja
en el documento (`canvas.unit`), no en la configuración de la aplicación.

**La escala (`1:100`) no interviene en ninguna medida.** Es una referencia de
impresión. Sirve para saber a qué tamaño saldría en papel, no para calcular
distancias. Hoy el SVG todavía no la aplica (ver §6).

---

## 2. Una sola autoridad

| Lenguaje | Archivo | Punto de entrada |
| --- | --- | --- |
| PHP | `app/Core/Units.php` | `App\Core\Units` |
| JavaScript | `assets/js/lib/units.js` | `window.Normia.Units` |

Antes de la etapa 0 había **siete** copias del mismo factor repartidas entre PHP y
JavaScript, doce lugares que derivaban «unidades por metro» a mano y dos
constantes de tolerancia. Ahora hay una definición por lenguaje y el resto delega.

La tabla fuente está en **centímetros**:

| Unidad | `cmPerUnit` | `metersPerUnit` | `unitsPerMeter` |
| --- | --- | --- | --- |
| `mm` | 0,1 | 0,001 | 1 000 |
| `cm` | 1 | 0,01 | 100 |
| `m` | 100 | 1 | 1 |

Está en centímetros a propósito: con `cm` como unidad dominante, `cmPerUnit('cm')`
devuelve `1` y `unitsPerMeter('cm')` devuelve `100` sin error de coma flotante,
igual que el cálculo anterior. Así la consolidación no movió ninguna cifra, y hay
un aserto en `tests/php/units.mjs` y `tests/js/units.mjs` que lo exige bit a bit.

### Por qué existen `fromMeters` y `unitsPerMeter` si son lo mismo

Matemáticamente sí; en coma flotante pueden diferir en el último bit:

```text
fromMeters(x)     = (x · 100) / cmPerUnit     ← multiplica primero
unitsPerMeter(u)  =  100 / cmPerUnit          ← es un factor que se multiplica
```

Cada una reproduce el orden de operaciones que ya usaba el código que sustituye.
Conservarlo evita mover cifras publicadas. Para código nuevo da igual cuál se use:
la diferencia está muy por debajo de cualquier precisión que se muestre.

---

## 3. Qué se convierte y qué no

| Se convierte | No se convierte |
| --- | --- |
| coordenadas, anchos y altos (`x`, `y`, `w`, `h`) | `stroke` (grosor de trazo) |
| puntos y vértices de un trazo | `fontSize` (tamaño de texto) |
| longitud de un trazo, con arcos | `canvas.grid` (paso de rejilla en unidades) |
| radios, flechas y secciones de vía | opacidad, colores, capas |
| superficies (`m² = u² × factor²`) | |

El grosor y el tamaño de letra se dibujan en unidades del lienzo: son parte del
dibujo, no una medida física. Un muro de 15 cm de espesor se dibuja con un trazo
de 15 unidades en un plano en `cm` y de 0,15 en un plano en `m`; el trazo no se
reconvierte porque el usuario lo ajusta a ojo.

**Las conversiones fijas de centímetros a metros siguen en su punto de uso.**
Cuando un criterio viene declarado en centímetros (ancho mínimo de vano, radio de
señal) y hay que compararlo con una medida en metros, se divide por 100. Eso no
depende de la unidad del plano y no pasa por `Units`.

---

## 4. Redondeo

No se redondea al convertir. El redondeo es de presentación y ocurre en el
consumidor:

| Consumidor | Redondeo |
| --- | --- |
| Auditor (`PlanAudit`) | 2 decimales en metros y m² |
| Redes (`MepCalculator`) | 0 o 1 decimal al formatear |
| Editor (`G.formatMeasurement`) | 1 decimal |
| Registro de cálculos | sin redondeo |

---

## 5. Unidad desconocida

Una unidad que no sea `mm`, `cm` o `m` —incluidos `null`, cadena vacía y
mayúsculas como `M`— se interpreta como `cm`, sin lanzar excepción. Es lo que
hacían los conversores anteriores y hay planos antiguos y JSON editados a mano
que dependen de ello: romperlos sería un retroceso.

No se normalizan mayúsculas a propósito: `'M'` cae a `cm` igual que antes. Cuando
la interfaz impida escribir valores raros, se podrá endurecer.

---

## 6. La escala de impresión

`Units::scaleDenominator('1:100')` devuelve `100`. Lee el formato y nada más: **no
se aplica a ninguna longitud**.

Pendiente para la etapa 1 del roadmap NORMIA-004: que el SVG exportado lleve
`width` y `height` en milímetros calculados con esa escala, una escala gráfica en
el pie, y que `print.css` deje de estirar el plano al ancho de la hoja. Hoy, un
plano de 12 m a 1:100 se exporta con 1 200 píxeles de ancho (317 mm) en lugar de
120 mm.

---

## 7. Defecto conocido: la longitud de un trazo curvo no coincide entre PHP y JavaScript

**Qué pasa.** Para un tramo con arco, el editor y el servidor miden distinto:

| Dónde | Función | Resultado para un semicírculo de 400 unidades de cuerda |
| --- | --- | --- |
| Editor (JS) | `Mep.elementLengthMeters` → `Geometry.pathLength` | **628,3 unidades = 6,28 m** (cuenta el arco) |
| Redes (PHP) | `MepCalculator::length` | **400 unidades = 4,00 m** (suma `hypot` entre vértices) |

Se ve en el rótulo del tramo en el editor y en la tabla del SVG exportado: la
misma tubería puede aparecer con dos longitudes.

**Por qué se dejó así.** La etapa 0 se comprometió a no mover ni una cifra.
Corregir PHP cambia números de tuberías y circuitos con curvas, y eso exige su
propia aprobación.

**Dónde está fijado.** `tests/fixtures/golden/numeric.json` guarda los dos
valores (`arcoMetrosMep` = 4 y `arcoMetrosConArcos` = 6,283…) y
`tests/js/units.mjs` comprueba que el editor sigue midiendo el arco. Cuando se
apruebe la corrección, los dos asertos cambian a igualdad.

**Propuesta de corrección** (no implementada): ver §8.

---

## 8. Propuesta de corrección de curvas (para aprobación)

### Alcance

| Archivo | Cambio |
| --- | --- |
| `app/Services/MepCalculator.php` | `length()` pasa a usar `PathGeometry::length($points, $curves)`, que aplana arcos con la misma tolerancia de 0,5 cm que el auditor |
| `app/Services/SvgExporter.php` | el rótulo de longitud de un tramo deja de sumar `hypot` propio y usa `MepCalculator::length()` |
| `tests/php/golden.mjs` | el bloque sintético cambia: `arcoMetrosMep` pasa de 4 a 6,283… |
| `tests/js/units.mjs` | el aserto de divergencia pasa a igualdad PHP/JS |
| `docs/DIMENSIONAL.md` | §7 deja de describir un defecto y pasa a describir una regla |

### Impacto numérico

- **Solo afecta a tuberías y circuitos con arcos** (`pipe` y `conduit`): son los
  únicos tipos que pasan por `MepCalculator`. Los muros, rutas y vías curvos no
  se miden ahí. La longitud de un tramo curvo **sube** hasta un 57 % en el caso
  extremo de una semicircunferencia (π/2).
- Ese aumento arrastra, en los informes de redes: longitud total por red, longitud
  por circuito y la **caída de tensión estimada** (`voltageDrop` depende de la
  longitud), que subiría en la misma proporción.
- **No afecta** al auditor de evacuación ni a la cobertura de extintores: ya miden
  con `PathGeometry` o sobre la rejilla, no con `MepCalculator`.
- **No afecta** a planos sin curvas en redes: los cuatro pisos de la demostración
  tienen 13 tuberías y circuitos y **ninguno con arcos** (verificado), así que el
  golden de la demo **no cambiaría**; solo cambia el bloque sintético.
- **No toca la base de datos** ni los documentos guardados: es cálculo, no
  persistencia.

### Pruebas

1. Golden: `arcoMetrosMep` de 4 a 6,283185307179586 (y `rectaMetros` sin cambio).
2. Unidad: `MepCalculator::length` de un trazo con arco == `PathGeometry::length`
   en las tres unidades (`mm`, `cm`, `m`).
3. Paridad: el valor de PHP == el de `Mep.elementLengthMeters` en JS para el mismo
   elemento (el aserto que hoy documenta la divergencia).
4. Regresión: los cuatro pisos de la demo, el auditor, los extintores y el SVG de
   un plano sin tuberías curvas no cambian.
5. Red: una sola tubería curva en un plano con circuito eléctrico demuestra que
   la caída de tensión recalculada es coherente con la longitud nueva.

### Riesgo

Bajo en código, medio en comunicación: hay que decirlo en el changelog, porque
quien tenga guardados informes de redes con tramos curvos verá cifras distintas
(las correctas). No hay datos históricos que reescribir: los informes se calculan
al vuelo.

---

## 9. Pruebas de esta materia

| Suite | Qué fija |
| --- | --- |
| `tests/php/units.mjs` | factores, conversiones, superficies, unidad inválida, escala, paridad bit a bit de la ruta `cm` |
| `tests/js/units.mjs` | lo mismo en JavaScript contra la **misma** tabla compartida, más el defecto conocido de §7 |
| `tests/fixtures/units.json` | la tabla de casos que leen las dos suites |
| `tests/php/golden.mjs` | 6 405 valores del auditor, extintores, redes y el SVG de los cuatro pisos de la demo: si la consolidación de unidades mueve una cifra, falla |
