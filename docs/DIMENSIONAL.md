# Unidades y medidas del plano

Cómo se pasa de lo dibujado a lo medido, qué se convierte y qué no, y cómo se
mide un trazo curvo. Describe el código desde la **etapa 0 de NORMIA-004**.

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

PHP y JavaScript usan **la misma fórmula**, `(x · 100) / cmPerUnit`, y no
`x / metersPerUnit`. Antes de la etapa 0 cada lenguaje traía la suya y para `mm`
diferían en el último bit (en una muestra de 50 000 valores, 15 058 casos): el
mismo ancho de vía salía distinto en el SVG del navegador y en el exportado. Ahora
la tabla compartida `tests/fixtures/units.json` guarda 18 casos y **las dos suites
los comparan con igualdad estricta**, no con tolerancia.

Para código nuevo da igual qué función se use: la diferencia entre una y otra está
muy por debajo de cualquier precisión que se muestre.

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
depende de la unidad del plano y no pasa por `Units`. Son seis casos en `app/`,
todos con constantes de criterio o con su presentación en el informe.

**Una excepción deliberada en el pliego.** `assets/js/editor/schedule.js` calcula el
área del piso como `(w · k / 100) · (h · k / 100)`, con `k = Units.cmPerUnit(unit)`.
Podría escribirse `Units.squareMeters(w · h, unit)`, pero en coma flotante
`(w · k) / 100 ≠ w · (k / 100)`: sobre 2,9 millones de pares de dimensiones, 4 114
áreas cambian en el segundo decimal y 12 en el entero que imprime el pliego. El
factor ya es de `Units`; solo se conserva el orden de operaciones para no mover una
cifra ya impresa. Se unificará en la etapa 2, cuando el área salga de la geometría
y no del tamaño del lienzo.

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

## 5. Unidad desconocida: dos puertas distintas

Hay dos comportamientos y conviene no confundirlos:

| Dónde | Qué pasa con `'M'`, `'pulgada'`, `''` o `null` | Por qué |
| --- | --- | --- |
| **Conversores** (`Units::metersPerUnit`, `cmPerUnit`…) | se interpreta como `cm`, sin excepción | protegen a cualquier consumidor que reciba una cadena arbitraria; es lo que hacían los conversores anteriores |
| **Documento** (`DesignValidator::normalizeCanvas`) | se rechaza con un error de validación | un plano no puede declarar una unidad que el formato no contempla: reinterpretarla en silencio cambiaría el significado de todas sus medidas |

La puerta estricta es la del documento, y es la que manda al abrir y al guardar.
Los conversores no endurecen su comportamiento porque hay llamadas internas que
componen una unidad a partir de datos que el usuario no controla.

Consecuencia práctica: un JSON editado a mano con `"unit": "M"` **no se abre**;
la aplicación pide corregirlo. Los planos que salieron de la aplicación siempre
declaran `mm`, `cm` o `m`, así que ningún documento histórico se rompe. Está
fijado en `tests/php/curves.mjs` («el plano acepta mm, cm y m» y «una unidad
inválida se rechaza en vez de reinterpretarse»).

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

## 7. Un trazo curvo se mide por su arco

Un tramo con curva se mide siguiendo el arco, no la cuerda que une sus extremos.
Da igual dónde se mida: el editor, el informe de redes y el rótulo del SVG
exportado dan la misma cifra.

| Dónde | Función | Semicírculo de 400 unidades de cuerda |
| --- | --- | --- |
| Editor (JS) | `Mep.elementLengthMeters` → `Geometry.pathLength` | **628,3 unidades = 6,283 m** |
| Redes (PHP) | `MepCalculator::length` → `PathGeometry::length` | **628,3 unidades = 6,283 m** |
| Rótulo del SVG | `SvgExporter::mepCaption` → `MepCalculator::length` | **6,3 m** |

Los tres caminos terminan en el mismo aplanado: `PathGeometry`, con la tolerancia
de 0,5 cm del plano que también usa el auditor. No hay una segunda fórmula de
longitud para redes.

**Qué implica.** La longitud de un tramo curvo es mayor que la distancia entre sus
extremos: en el caso extremo de una semicircunferencia, un 57 % más (π/2). El
informe de redes arrastra ese aumento a la longitud por red, a la longitud por
circuito y a la **caída de tensión estimada**, que depende de la longitud.

**No afecta** al auditor de evacuación ni a la cobertura de extintores: no miden
con `MepCalculator`. **No toca la base de datos**: los informes se calculan al
vuelo, así que no hay nada guardado que reescribir ni datos históricos que
corregir.

---

## 8. La corrección de curvas, y por qué llegó después

Hasta la etapa 0 el servidor medía la **cuerda**: `MepCalculator::length()` sumaba
`hypot` entre vértices e ignoraba los arcos, mientras el editor sí los contaba. La
misma tubería curva aparecía con 4,00 m en el informe y 6,28 m en pantalla.

**Por qué no se corrigió de una vez.** La etapa 0 se comprometió a no mover ni una
cifra: era una entrega de consolidación, no de cambio de comportamiento. Corregir
la medición cambia números, y cambiarlos en silencio dentro de una refactorización
es justo lo que el golden existe para impedir. El defecto se documentó, se congeló
con un aserto por lado y se presentó aparte.

**Qué cambió cuando se aprobó.**

| Archivo | Cambio |
| --- | --- |
| `app/Services/MepCalculator.php` | `length()` delega en `PathGeometry::length($points, $curves)`; ya no suma `hypot` |
| `app/Services/SvgExporter.php` | el rótulo del tramo usa `MepCalculator::length()`; se fue la suma propia |
| `tests/php/golden.mjs` | el bloque sintético registra el arco (6,283…) y comprueba que Mep y PathGeometry coinciden |
| `tests/php/curves.mjs` | suite nueva: 14 comprobaciones en PHP 8.1 y 8.3 |
| `tests/js/units.mjs` | el aserto de divergencia pasa a igualdad con la referencia del servidor |

**Qué no se movió.** El golden de los cuatro pisos de la demo quedó idéntico: los
6 405 valores del auditor, los extintores, las redes y los cuatro SVG. Sus 13
tuberías y circuitos no tienen arcos, así que la corrección no los toca ni un
bit. El diff del fixture son cuatro líneas: los dos valores del plano sintético y
el nombre de sus dos claves de control.

**Cómo se comprueba ahora.** `tests/php/curves.mjs` fija: el arco en las tres
unidades; que la recta sigue midiendo exactamente lo mismo (`===`, bit a bit); que
la escala de impresión no interviene; que un arco degenerado vuelve a medirse como
recta; que un elemento sin puntos conserva la diagonal de su cajón; que el informe
de redes suma 6,28 m donde antes sumaba 4; que la caída de tensión crece en la
misma proporción; y que el rótulo del SVG dice 6,3 m para el arco y 4,0 m para la
recta.

---

## 9. Pruebas de esta materia

| Suite | Qué fija |
| --- | --- |
| `tests/php/units.mjs` | factores, conversiones, superficies, unidad inválida, escala, paridad bit a bit de la ruta `cm` y de `fromMeters` contra la tabla compartida |
| `tests/js/units.mjs` | lo mismo en JavaScript contra la **misma** tabla compartida, la longitud de arcos (§7) y la comparación exacta con el golden que escribe PHP |
| `tests/php/curves.mjs` | medición de trazos curvos: arco frente a cuerda, tres unidades, escala, casos degenerados, redes, caída de tensión, rótulo del SVG en `cm` y en `mm`, y la puerta estricta de unidad del documento |
| `tests/fixtures/units.json` | la tabla de casos que leen las dos suites |
| `tests/php/golden.mjs` | 6 405 valores del auditor, extintores, redes y el SVG de los cuatro pisos de la demo, más el plano sintético con arco medido en `mm`, `cm` y `m`: si una cifra se mueve sin querer, falla |
