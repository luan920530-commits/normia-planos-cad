# MISIÓN 002 · Cierre técnico de NORMIA-004, etapa 0

Verificación del estado real del trabajo de la etapa 0 antes de fusionar el PR #56,
con las diferencias encontradas, lo que se corrigió en esta misión y las pruebas que
lo demuestran.

| | |
| --- | --- |
| Rama | `arena/48ee92e3-normia-planos-cad` |
| Base | `main` en `aef3b9b` |
| PR | **#56** · «Etapa 0 · autoridad única de unidades y medición de arcos» |
| Versión | 1.18.0 · `user_version = 7` (sin migraciones) |
| Suite completa | `node tests/run-all.mjs` → **24/24 en 127,7 s** |
| Comprobaciones | **1 924** en 24 pasos |
| Alcance respetado | sin calibración, sin cambios de impresión, sin desplegar |

---

## 0. Veredicto

La etapa 0 está **completa en lo que se aprobó** y el PR está listo para revisión.
La corrección de curvas **está implementada y probada**, no congelada: el PR solo
arrastraba una descripción vieja que decía lo contrario.

Lo que la misión encontró y esta entrega corrige:

1. **La descripción del PR contradecía el código.** Decía «defecto conocido, no
   corregido» y «22/22 pasos». El código ya medía el arco desde `d44c6f0`. Corregido.
2. **PHP y JavaScript calculaban `fromMeters` con fórmulas distintas.** Diferencia
   de un *ulp*, pero real: el mismo ancho de vía podía salir distinto en el SVG del
   navegador y en el exportado. Unificado y fijado con igualdad estricta.
3. **El pliego escribía una conversión en línea** (`· unitCm / 100` y un área armada a
   mano). El factor ya venía de `Units`, así que no era una tabla duplicada; se probó
   a unificarla del todo y movía áreas impresas, así que se **deja intacta y
   documentada**.
4. **La documentación afirmaba algo falso sobre planos históricos**: decía que una
   unidad desconocida «se interpreta como cm» al abrir un plano. No es así: el
   validador del documento la rechaza. Corregido el texto, no el comportamiento.
5. **Faltaban pruebas de las tres unidades de punta a punta.** El golden solo cubría
   planos en `cm`. Añadido el mismo plano sintético medido en `mm`, `cm` y `m`.

Nada de esto cambia una cifra del usuario. La demo sigue con **6 405 valores y 4 SVG
idénticos**; el único movimiento numérico del PR es el autorizado: la longitud de
tuberías y circuitos con arcos.

---

## 1. Los siete puntos de la misión

### 1.1 Autoridad de conversión en PHP y JavaScript — **cumple**

| | |
| --- | --- |
| PHP | `app/Core/Units.php` |
| JavaScript | `assets/js/lib/units.js` → `window.Normia.Units` |

Barrido de definiciones del factor fuera de esos dos archivos:

```text
PathGeometry::TOLERANCE_CM   → alias de Units::TOLERANCE_CM
PlanAudit / PlanGrid         → $cmPerUnit y $metersPerUnit = Units::…
geometry.js                  → CURVE_TOLERANCE_CM = Units.TOLERANCE_CM
measure.js / schedule.js     → delegación
```

No queda **ninguna** tabla de factores duplicada. Las **seis** divisiones por 100 que
sobreviven en `app/` fuera de `Units.php` pasan constantes de criterio declaradas en
centímetros a metros (`minExitWidthCm`, `exitSignRadiusCm`, `radiusCm`) o las muestran
así en el informe imprimible; ninguna convierte la unidad del plano. Están
documentadas en [DIMENSIONAL.md](DIMENSIONAL.md) §3.

**Revisado y dejado como estaba, a propósito.** `schedule.js` (el pliego) parecía
tener conversores propios: calculaba el área como `(w · unitCm / 100) · (h · unitCm / 100)`
y los metros por unidad como `unitCm / 100`. Al mirarlo de cerca, **`unitCm` ya venía
de `Units.cmPerUnit()`**: no había tabla duplicada, solo la división por 100 escrita
en línea. Se probó a sustituirla por `Units.metersPerUnit()` y `Units.squareMeters()`
—más limpio de leer— y se midió el efecto:

```text
(w · k) / 100   ≠   w · (k / 100)     en coma flotante
```

Sobre 2 904 768 pares de dimensiones plausibles, **4 114** daban un área distinta al
redondear a dos decimales y **12** al redondear a entero (la cifra que imprime el
pliego son m² sin decimales, `number(areaM2, 0)`). Son empates exactos, pero el
pliego es un documento que ya se ha impreso y la regla de esta etapa es no mover una
cifra sin necesidad. Se revierte a la fórmula original y queda escrito por qué. La
sustitución tiene sentido en la etapa 2, cuando el área deje de salir del tamaño del
lienzo y se calcule a partir de la geometría de las áreas.

### 1.2 Compatibilidad con planos históricos — **cumple, con un matiz documentado**

Comprobado ejecutando, no leyendo:

| Caso | Resultado |
| --- | --- |
| Plano guardado en `cm` | se abre y se mide igual (golden de la demo) |
| Plano guardado en `mm` o en `m` | se abre; el validador conserva la unidad declarada y el golden fija sus cifras |
| JSON exportado (`format: "normia-plan"`, `schema_version: 2`) con curvas | se importa |
| Diseño antiguo `format: 2` | se importa y se normaliza a la versión actual |
| Exportación `format: 1` (heredada) | se importa por `DesignImporter::fromLegacy()` (cubierto por la suite funcional) |
| JSON editado a mano con `"unit": "M"` | **se rechaza** con error de validación, no se reinterpreta |

Ese último renglón es deliberado y ahora está escrito como es. En
[DIMENSIONAL.md](DIMENSIONAL.md) §5 se explicaba que «una unidad desconocida se
interpreta como `cm`… y hay planos antiguos que dependen de ello». Era inexacto: el
respaldo a `cm` vive en los **conversores** (para llamadas internas con cadenas
arbitrarias), mientras que la **puerta del documento** es estricta. Ningún plano
producido por la aplicación declara una unidad inválida, así que no hay documento
histórico en riesgo. Ahora hay dos asertos que lo fijan: «el plano acepta mm, cm y
m» y «una unidad inválida se rechaza en vez de reinterpretarse».

### 1.3 Conservación de resultados numéricos — **cumple**

`tests/fixtures/golden/numeric.json` fija la salida de los cuatro pisos de la demo:

| Bloque | Valores | Estado |
| --- | --- | --- |
| Auditor sin ocupación declarada | 6 405 en total entre los cuatro bloques | idéntico |
| Auditor con 25 personas | ídem | idéntico |
| Extintores y cobertura | ídem | idéntico |
| Redes MEP | ídem | idéntico |
| SVG exportado (4 planos) | hash SHA-256 | idéntico |

El *diff* del fixture en todo el PR son **20 líneas añadidas**: el bloque
`synthetic.unidades`. No se modificó ningún valor existente.

### 1.4 Corrección de longitud de arcos en redes MEP — **implementada**

| Archivo | Cambio |
| --- | --- |
| `app/Services/MepCalculator.php` | `length()` delega en `PathGeometry::length($points, $curves)`; ya no suma `hypot` entre vértices |
| `app/Services/SvgExporter.php` | el rótulo del tramo usa `MepCalculator::length()`; se retiró su suma propia |

Resultado medido sobre el semicírculo de referencia (cuerda 400 unidades, flecha 200):

| Medición | Antes | Ahora |
| --- | --- | --- |
| Unidades del lienzo | 400 | **628,3185307179587** |
| Metros en `cm` | 4,00 | **6,283185307179586** |
| Rótulo del SVG (`cm`) | 4,0 m | **6,3 m** |
| Rótulo del SVG (`mm`) | 0,4 m | **0,6 m** |

Y la comprobación de que **no arrastra** lo que no debe: auditor, extintores y los
cuatro SVG de la demo quedan idénticos, porque los 8 tramos de tubería de la demo
(4 en la planta baja, 4 en el local comercial) son rectos y no llevan curvas.

### 1.5 Coherencia PHP, JavaScript y SVG — **cumple, con una corrección**

Los tres caminos terminan en el mismo cálculo:

```text
editor            Mep.elementLengthMeters → Geometry.pathLength   → MepCalculator
informe de redes  MepCalculator::length   → PathGeometry::length
rótulo del SVG    SvgExporter::mepCaption → MepCalculator::length
```

Para la misma geometría, PHP y JavaScript devuelven **exactamente** el mismo número
(`6.283185307179586`), y ahora hay dos asertos que lo imponen: uno compara el editor
con la constante, y otro compara el editor con **el golden que escribe PHP**, de modo
que las dos suites no pueden separarse sin que falle una.

**Corregido:** `fromMeters` no era idéntico entre lenguajes.

```text
PHP   (x · 100) / cmPerUnit        ← lo que ya hacía
JS     x / metersPerUnit           ← otra operación, resultado distinto en el último bit
```

En una muestra de 50 000 valores, **15 058** casos diferían para `mm`, 6 755 para `cm`
y 6 808 para `m`. La diferencia es invisible en pantalla (1 *ulp*), pero los dos
motores dibujan el mismo plano y el SVG del navegador debe coincidir con el
exportado. JavaScript pasa a usar la fórmula de PHP, y la tabla compartida
`tests/fixtures/units.json` guarda ahora 18 casos de `fromMeters` que **las dos
suites comparan con igualdad estricta**.

### 1.6 Pruebas golden y de regresión — **cumple y ampliadas**

| Suite | Comprobaciones | Qué fija |
| --- | --- | --- |
| `tests/php/golden.mjs` | **8** ×2 (8.1, 8.3) | 6 405 valores + 4 SVG de la demo; el arco en `mm`/`cm`/`m`; Mep = PathGeometry |
| `tests/php/curves.mjs` | **17** ×2 | arco frente a cuerda, tres unidades, escala, degenerados, redes, caída de tensión, rótulo SVG en `cm` y `mm`, puerta estricta de unidad |
| `tests/php/units.mjs` | **23** ×2 | factores, longitudes, superficies, inválidas, escala, `fromMeters` exacto |
| `tests/js/units.mjs` | **30** | lo mismo en JS + arco + paridad exacta con el golden de PHP |

Añadido en esta misión:

- golden: bloque `synthetic.unidades` (la misma geometría en `mm`, `cm` y `m`);
- golden: aserto «la misma geometría se mide igual en milímetros, centímetros y metros»;
- curves: rótulo del SVG también en milímetros;
- curves: aceptación de `mm`/`cm`/`m` y rechazo de unidades inválidas;
- units (PHP y JS): identidad exacta de `fromMeters` con la tabla compartida;
- units (JS): comparación exacta con el golden que escribe PHP.

### 1.7 Documentación técnica y descripción del PR — **corregidas**

Ver §4 y §5.

---

## 2. Informe de diferencias

| ID | Diferencia encontrada | Gravedad | Estado |
| --- | --- | --- | --- |
| **D-01** | El cuerpo del PR describía el defecto de arcos como «congelado» y las pruebas como «22/22» | alta (induce a rechazar trabajo válido) | **corregida** en el PR |
| **D-02** | `fromMeters` con fórmula distinta en PHP y JS (1 *ulp*, 15 058/50 000 casos en `mm`) | media (coherencia SVG) | **corregida** y fijada con prueba |
| **D-03** | `schedule.js` escribía la división por 100 en línea (el factor sí venía de `Units`) | muy baja | **no se cambia**: sustituirla movía 4 114 áreas de 2,9 M en el segundo decimal; documentado en §1.1 |
| **D-04** | `DIMENSIONAL.md` §5 afirmaba que una unidad desconocida se interpreta como `cm` al abrir un plano | media (documentación falsa) | **corregida** la afirmación; el comportamiento estricto se mantiene y se prueba |
| **D-05** | El golden solo cubría planos en `cm`; `mm` y `m` solo se probaban a nivel de factor | media (planos históricos) | **corregida** con el bloque `synthetic.unidades` |

Sin diferencias en: el código de la corrección de arcos (correcto tal como estaba),
la delegación de los siete conversores, el esquema de base (sigue en 7) y los datos
guardados.

---

## 3. Qué se cambió en esta misión

| Archivo | Cambio | Efecto numérico |
| --- | --- | --- |
| `assets/js/lib/units.js` | `fromMeters` usa `(x · 100) / cmPerUnit` | 1 *ulp* en anchos de vía; invisible en pantalla |
| `tests/fixtures/units.json` | +18 casos de `fromMeters` | ninguno |
| `tests/fixtures/golden/numeric.json` | +20 líneas (`synthetic.unidades`) | ninguno |
| `tests/php/units.mjs` | +1 aserto | — |
| `tests/js/units.mjs` | +3 asertos (fromMeters, golden, recta) | — |
| `tests/php/curves.mjs` | +3 asertos (SVG en mm, unidades válidas, unidades inválidas) | — |
| `tests/php/golden.mjs` | +bloque de tres unidades y +2 asertos | — |
| `docs/DIMENSIONAL.md` | §2 y §5 corregidas; §9 actualizada | — |
| `README.md` | recuentos de las cuatro suites afectadas | — |

Ninguna línea de `app/` se tocó en esta misión: la corrección de arcos ya estaba en
`d44c6f0` y las comprobaciones confirman que es correcta. En `assets/js` el único
cambio de código es la fórmula de `fromMeters`.

---

## 4. Pruebas ejecutadas

Entorno: PHP 8.1 y 8.3 sobre `php-wasm`, Node 22, JSDOM. Comando único:
`node tests/run-all.mjs`.

| Paso | Resultado |
| --- | --- |
| Sintaxis PHP 8.1 / 8.3 | 97 archivos, sin errores |
| Sintaxis JavaScript | 67 archivos, sin errores |
| Complementos (JS) | 20/20 |
| Unidades (JS) | **30/30** |
| Funcionamiento sin conexión | 142 archivos, sin referencias externas |
| Funcional PHP 8.1 / 8.3 | 327/327 ×2 |
| Longitud de curvas PHP 8.1 / 8.3 | **17/17 ×2** |
| Golden numérico PHP 8.1 / 8.3 | **8/8 ×2** |
| Unidades PHP 8.1 / 8.3 | **23/23 ×2** |
| Estabilidad PHP 8.1 / 8.3 | 45/45 ×2 |
| Interfaz (JSDOM) 8.1 / 8.3 | 383/383 ×2 |
| Páginas y menús 8.1 / 8.3 | 50/50 ×2 |
| Escritorio (instaladores) | 37/37 |
| Android (APK) | 52/52 |
| Escritorio (Electron) | 40/40 |
| Paquetes y demo | 39/39 |
| **Total** | **24/24 pasos · 1 924 comprobaciones** |

Comprobaciones que responden directamente a esta misión:

```text
✓ La tubería curva se mide por su arco, como en el editor · arco 6.283185307179586 m · recta 4 m
✓ MepCalculator y PathGeometry dan la misma longitud
✓ La misma geometría se mide igual en mm, cm y m · mm 0.628… · cm 6.283… · m 628.318…
✓ El editor coincide exactamente con el golden de PHP
✓ Metros → unidades coincide bit a bit con la tabla compartida · 18 casos
✓ El rótulo del SVG sigue el arco también en milímetros · 0,6 m
✓ El plano acepta mm, cm y m como unidad declarada
✓ Una unidad inválida se rechaza en vez de reinterpretarse
✓ Ningún valor numérico del auditor se mueve · 6 405 valores idénticos
✓ El SVG exportado de los cuatro pisos es idéntico · hash sha-256 igual
```

---

## 5. Documentación actualizada

| Documento | Qué cambió |
| --- | --- |
| `docs/DIMENSIONAL.md` §2 | la fórmula de `fromMeters` es la misma en PHP y JS; se explica por qué y se documenta la prueba de identidad |
| `docs/DIMENSIONAL.md` §5 | reescrita como «dos puertas»: conversores tolerantes, documento estricto, con la tabla de qué pasa con `M`, `pulgada`, `''` y `null` |
| `docs/DIMENSIONAL.md` §7 y §8 | describen la corrección como regla vigente y su historia, sin presentarla como pendiente |
| `docs/DIMENSIONAL.md` §9 | tabla de pruebas al día (golden en tres unidades, curves, units) |
| `README.md` | recuentos (17/17, 8/8, 23/23, 30/30) y descripción de lo que fija cada suite |
| Cuerpo del PR #56 | reescrito: título, alcance, corrección autorizada, pruebas y criterios de aceptación |

---

## 6. Criterios de aceptación de la etapa 0

Los de `docs/NORMIA-004-ARQUITECTURA-DIMENSIONAL.md` §15, contestados con evidencia y
sin adornos:

| Criterio | Estado |
| --- | --- |
| Una única función de conversión por lenguaje; sin divisiones por 100 sueltas fuera de ella | **cumple** — las 6 restantes son constantes de criterio en cm, documentadas |
| `cm → m → cm` devuelve el mismo documento con muros curvos, vías y redes | **pendiente** — la reconversión al cambiar de unidad no forma parte de lo aprobado; es el hallazgo P-01 de la MISIÓN 001 y corresponde a la etapa 1 |
| Cambiar de unidad exige confirmación que muestra las cifras | **pendiente**, por lo mismo |
| Demo e históricos dan los mismos números que la 1.18.0 | **cumple**, con la excepción autorizada: tuberías y circuitos con arcos pasan a medirse por su arco |

Las dos filas pendientes no son un olvido: la decisión de esta etapa fue consolidar
la autoridad y corregir los arcos **sin** cambiar el comportamiento del documento.
Quedan escritas para que no se pierdan.

---

## 7. Fuera de alcance, confirmado

- **Calibración dimensional**: no se tocó. `Units::scaleDenominator()` sigue sin
  aplicarse a ninguna longitud y la escala sigue siendo una referencia declarada
  (DIMENSIONAL §6, D-07/D-08 de NORMIA-004).
- **Impresión**: no se tocó `print.css` ni el tamaño físico del SVG.
- **Esquema**: `user_version` sigue en 7; sin migraciones.
- **Datos**: no se reescribió ningún documento guardado ni histórico.
- **Despliegue**: sin release, sin publicación; los ZIP se construyen y verifican solo
  como parte de la suite.

---

## 8. Riesgos residuales

1. **Cambia una cifra visible y es lo correcto.** Quien tenga informes de redes con
   tramos curvos verá longitudes mayores (hasta +57 % en una semicircunferencia) y una
   caída de tensión proporcionalmente mayor. Debe constar en el changelog de la versión
   que recoja la etapa 0. No hay nada que reescribir: los informes se calculan al vuelo.
2. **La exactitud sigue sin contrastar contra norma.** Las pruebas demuestran
   consistencia y conservación, no que los umbrales sean los legales. Es lo que
   corresponde: los criterios son de referencia y así se rotulan.
3. **La escala impresa no es todavía la declarada** (etapa 1). Un plano medido con
   regla sobre papel no coincide con la cota; está documentado en §6 y en el informe
   de la MISIÓN 001.

---

## 9. Para fusionar

1. Revisar el PR #56 con el cuerpo actualizado.
2. `gh pr merge 56 --merge` (o `--squash`, según preferencia). No hay conflictos:
   `mergeable` informa `MERGEABLE` contra `aef3b9b`.
3. Después del merge, `main` queda en 1.18.0 con la etapa 0 cerrada; no requiere
   migración ni paso posterior.

Lo que sigue, cuando se apruebe: **reconversión al cambiar de unidad** (P-01) y
**escala real** (etapa 1), que es lo que convierte «12 m declarados» en «12 m
medidos».
