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
| `tests/php/units.mjs` | factores, conversiones, superficies, unidad inválida, escala, paridad bit a bit de la ruta `cm` |
| `tests/js/units.mjs` | lo mismo en JavaScript contra la **misma** tabla compartida, más la longitud de arcos (§7) |
| `tests/php/curves.mjs` | medición de trazos curvos: arco frente a cuerda, tres unidades, escala, casos degenerados, redes, caída de tensión y rótulo del SVG |
| `tests/fixtures/units.json` | la tabla de casos que leen las dos suites |
| `tests/php/golden.mjs` | 6 405 valores del auditor, extintores, redes y el SVG de los cuatro pisos de la demo, más el plano sintético con arco: si una cifra se mueve sin querer, falla |
