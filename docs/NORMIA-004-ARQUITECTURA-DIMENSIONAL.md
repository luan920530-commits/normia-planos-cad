# NORMIA-004 · Arquitectura dimensional CAD y gestión de aforo

**Documento de diagnóstico y propuesta para aprobación.**
Versión analizada: **1.18.0** (`main` = `a221309`, esquema `user_version = 7`).
Fecha: 2026-11-01.
Estado del trabajo: **documento de diagnóstico y propuesta**. Se redactó en solo
lectura, sin tocar código, base de datos ni archivos de producción.

> **Avance (etapa 0).** Aprobadas DEC-1 a DEC-4, la etapa 0 se implementó en tres
> pasos: la autoridad única de unidades con sus pruebas, la delegación de los siete
> conversores con un golden de regresión que demuestra que ninguna cifra se movió y,
> aprobada aparte, la corrección de la longitud de arcos para que el servidor mida
> el arco como el editor. El resultado vivo está en [DIMENSIONAL.md](DIMENSIONAL.md).

---

## 0. Cómo leer este documento

Cada afirmación sobre el código actual lleva su evidencia (`archivo:línea`), y todo
lo que es propuesta aparece marcado como **propuesta**. Al final, la sección
[15](#15-lo-que-no-pude-verificar) separa lo que **no** pude verificar con evidencia.

Tres marcas en todo el texto:

| Marca | Significado |
| --- | --- |
| **EXISTE** | Comprobado en el repositorio; funciona hoy |
| **SE MODIFICA** | Ya existe y habría que cambiarlo |
| **NUEVO** | No existe; se propone |

---

## 1. Resumen ejecutivo

### 1.1 Lo que ya está resuelto (y no hay que rehacer)

Normia **no parte de cero** en lo dimensional:

- **EXISTE** un sistema de unidades declarado por plano: `canvas.unit` con `cm`,
  `m` o `mm` (`assets/js/lib/model.js:428`), y `canvas.scale` con formato `1:100`
  (`model.js:429`).
- **EXISTE** conversión a metros en todos los cálculos: longitud de redes
  (`MepCalculator::unitsToMeters`), área libre y recorridos (`PlanAudit`), cobertura
  de extintores (`ExtinguisherCoverage`), medición de rutas
  (`assets/js/editor/measure.js:161`), y cotas dibujadas
  (`assets/js/lib/renderer.js:1020`).
- **EXISTE** un motor geométrico compartido: `app/Services/PlanGrid.php` convierte el
  lienzo en celdas, bloquea muros y abre vanos; lo usan el auditor de evacuación y
  el cálculo de extintores «para que ambos midan sobre el mismo espacio libre»
  (docblock de `PlanGrid`, línea 8-13).
- **EXISTE** un auditor que ya calcula, en metros: salidas, ancho disponible, ancho
  requerido por persona, tiempo de recorrido y de cola, área libre, área
  inalcanzable y recintos sin salida (`app/Services/PlanAudit.php:344-400`,
  `480-520`).
- **EXISTE** tenencia multiempresa con capacidades `view < write < manage < own`
  (`app/Models/Membership.php:35-40`), que sostiene los permisos del aforo sin
  inventar un sistema nuevo.
- **EXISTE** guardado transaccional con bloqueo optimista (`Floor::saveDesign`,
  `app/Models/Floor.php:83-125`), el lugar correcto para mantener índices derivados.

### 1.2 Lo que falta de verdad

| Necesidad de la misión | Estado | Dónde está el hueco |
| --- | --- | --- |
| Escala física independiente del zoom | **Parcial** | `canvas.scale` es decorativa: no interviene en ningún cálculo (ver D-04) |
| Calibración por distancia conocida | **NUEVO** | No existe; la unidad se declara a mano |
| Dimensiones reales garantizadas | **Parcial** | La unidad es interpretativa y el usuario puede cambiarla sin reconversión (D-02) |
| Superficies y perímetros de áreas | **Parcial** | Solo por rejilla y de forma efímera, sin identificador (D-05) |
| SVG con dimensiones físicas correctas | **No** | El SVG sale en unidades de lienzo, sin `mm` (D-07) |
| Edificación como entidad | **No** | No hay tabla `buildings`; el proyecto hace de contenedor (D-11) |
| Áreas vinculadas a geometría con id | **NUEVO** | No existen |
| Aforo máximo documentado | **No** | Hay un entero suelto por piso, sin fuente ni vigencia (D-06) |
| Aforo estimado por área/turno | **No** | Solo una densidad global de referencia |
| Ocupación real con historial | **No** | No existe ninguna tabla de conteos |
| Escenarios operativos | **NUEVO** | No existen |
| Simulacros medidos | **NUEVO** | No existe |
| Sincronía híbrida futura | **NUEVO** | Todo es local; los ids nuevos deben nacer preparados (D-20) |

### 1.3 Cuatro decisiones que necesito de ti antes de implementar

| # | Decisión | Opción A (recomendada) | Opción B | Coste de equivocarse |
| --- | --- | --- | --- | --- |
| **DEC-1** | ¿Edificación es el proyecto o una entidad nueva? | **Tabla `buildings`** con `floors.building_id` (nullable, rellenada con una edificación por proyecto en la migración) | Proyecto = edificación; no se toca el esquema | Si se elige B y luego un proyecto necesita dos edificios, hay que migrar con datos de aforo ya cargados |
| **DEC-2** | ¿Dónde vive la geometría de un área? | **En el documento** (`design_json`, versionado con el plano); en SQL solo el índice y los atributos de negocio | Todo en SQL | Si va en SQL, cada versión del plano necesita copia de áreas y se rompe la inmutabilidad del historial |
| **DEC-3** | ¿Qué unidad interna? | **La declarada** (`cm`/`m`/`mm`) **más** un factor calibrado; nada se reconvierte al abrir | Migrar todo a centímetros guardados | Migrar a cm reescribe geometría de planos existentes: alto riesgo, poco beneficio |
| **DEC-4** | ¿El SVG impreso lleva escala física real? | **Sí**, con `width`/`height` en `mm` calculados desde la escala, y una banda de escala gráfica | Solo etiqueta «escala 1:100» como hoy | Sin esto, ningún plano impreso sirve para medir; con esto, los planos viejos cambian de tamaño al imprimir |

Mi recomendación es **A, A, A, A**. Si no respondes, implemento con esa base.

### 1.4 Lo que este documento **no** promete

- No promete que un plano pase a ser «plano de obra»: la calibración corrige lo
  declarado, no convierte un levantamiento esquemático en topografía.
- No promete cumplimiento normativo. El aforo máximo es **documentado**, no
  calculado por la aplicación.
- No declara que las rutas o salidas «sirvan» por conocer el aforo: el auditor ya
  lo advierte y aquí se mantiene esa línea.

---

## 2. Diagnóstico del código actual

Todo lo de esta sección está verificado sobre `a221309`. Las consecuencias son
mías; los hechos, del repositorio.

### D-01 · La unidad es un dato del plano, no una propiedad del dibujo — **EXISTE**

`canvas.unit` se declara en *Ajustes del piso › Lienzo y escala*
(`app/Views/editor/index.php:577`) y se guarda en el diseño. Las coordenadas de
cada elemento (`x`, `y`, `w`, `h`, `points`) están en esa unidad: **una unidad del
lienzo equivale a la unidad declarada**. Está escrito en dos sitios con distintas
palabras: `MepCalculator.php:18-19` y `mep.js:63-66`.

Consecuencia buena: el modelo ya es dimensional, no hay que rehacerlo.
Consecuencia mala: nada garantiza que lo dibujado corresponda a la realidad.

### D-02 · Cambiar la unidad no reconvierte la geometría — **SE MODIFICA** (riesgo alto)

```js
// assets/js/lib/model.js:2044
if (patch.unit !== undefined && ['cm','m','mm'].includes(patch.unit)) canvas.unit = patch.unit;
```

No hay factor, no hay advertencia, no hay conversión de elementos. Un plano de
1200 unidades significa 12 m si está en `cm` y 1200 m si alguien cambia el
selector a `m`. El auditor, los extintores y las redes cambian sus resultados en
silencio: **el mismo dibujo pasa de 12 m a 1200 m con dos clics**.

Nada en el servidor lo impide: `DesignValidator::normalizeCanvas`
(`app/Services/DesignValidator.php:270-303`) acepta la unidad nueva sin mirar la
anterior, porque valida el estado final y no la transición.

### D-03 · Seis conversores de unidad duplicados; dos ignoran la escala a propósito

| # | Archivo | Función | ¿Usa `canvas.scale`? |
| --- | --- | --- | --- |
| 1 | `app/Services/PlanAudit.php:778` | `cmPerUnit()` | No |
| 2 | `app/Services/PlanGrid.php:377` | `cmPerUnit()` (pública) | No |
| 3 | `app/Services/MepCalculator.php:20` | `unitsToMeters($unit, $scale)` | **Recibe `$scale` y no lo usa** |
| 4 | `assets/js/lib/geometry.js:209` | `cmPerUnit()` | No |
| 5 | `assets/js/lib/mep.js:68` | `unitsToMeters($unit)` | No |
| 6 | `assets/js/editor/measure.js:22` | `cmPerUnit()` local | No |

Y `renderer.js:565` reusa `G.cmPerUnit`. Seis copias de `{m:100, cm:1, mm:0.1}`
son seis oportunidades de divergir; la #3 incluso declara el parámetro que
después ignora, lo que invita a creer que la escala influye cuando no lo hace.

Además `G.flattenTolerance(unit)` (`geometry.js:212`) ya adapta la tolerancia de
aplanado de arcos a la unidad: la precisión está resuelta donde importa, y eso hay
que conservarlo.

### D-04 · La escala es decorativa — **EXISTE (y hay que arreglarlo)**

`canvas.scale` solo se muestra:

- en la barra de estado: `${design.canvas.scale} · referencia` (`editor.js:723`);
- en el pie del plano: `Escala {scale} · Unidad {unit} …`
  (`app/Services/PlanFooter.php:71`);
- en el `<small>` del formulario: «Referencia de impresión; verifica en sitio»
  (`index.php:579`).

Ningún cálculo la lee. Es honesto (dice «referencia»), pero deja al usuario con un
plano que **no mide lo que dice medir al imprimirse**.

### D-05 · Las áreas existen… pero solo dentro de un cálculo

`PlanAudit` construye un campo de distancias sobre la rejilla y agrupa las celdas
libres inalcanzables en «recintos» con `areaM2`, `cells` y `center`
(`PlanAudit.php:645-692`). Esas áreas:

- **no tienen identificador** (son un índice de un array),
- **no se guardan** en ningún sitio,
- **se recalculan** en cada informe,
- **solo aparecen si no son alcanzables** (las alcanzables no se listan como recintos).

Es decir: hay *medición de áreas*, no *áreas como entidad*. La Fase 2 no puede
reutilizar esto como almacén, pero sí como **sugeridor** de polígonos al dibujar.

### D-06 · El «aforo» de hoy es un entero sin procedencia

```
canvas.occupancy = 0..10000   (model.js:433, DesignValidator:286)
```

- Un solo número **por piso**; no hay áreas, ni turnos, ni vigencia, ni responsable.
- Si es `0`, el auditor **estima**: `personas = área_libre_m² × 0.2` con tope 10 000
  (`PlanAudit.php:349-357`, `resources/audit-criteria.json:20-23`), y lo declara como
  «Ocupación no declarada» (`PlanAudit.php:358-372`).
- Ese cálculo ya viene con la advertencia correcta, pero **se llama ocupación a
  dos cosas distintas** (capacidad declarada y personas estimadas) en el mismo
  campo `occupancy`.

`0.2 personas/m²` son **5 m² por persona**. Es una densidad de referencia, no una
norma: el propio `audit-criteria.json` lo dice en su `notice`.

### D-07 · El SVG exportado no tiene tamaño físico — **SE MODIFICA**

```php
// app/Services/SvgExporter.php:37-38
'width="' . self::n($width) . '" height="' . self::n($totalHeight) . '" viewBox="0 0 …"'
```

`$width` es `canvas.width`: un número **sin unidad** = píxeles CSS a 96 dpi.
Números concretos con el plano por defecto (1200 × 800 en `cm`):

| Magnitud | Valor real | Valor impreso hoy | Debería ser a 1:100 |
| --- | --- | --- | --- |
| Ancho del edificio | 12,00 m | 1200 px = **317,5 mm** | **120,0 mm** |
| Alto | 8,00 m | 800 px = 211,7 mm | 80,0 mm |
| Error de escala | — | **2,65×** más grande | — |

Y 317,5 mm **no cabe** en el área imprimible de A4 horizontal con márgenes de
12 mm (273 × 186 mm, `assets/css/print.css:2`).

### D-08 · La impresión estira el plano a la hoja — **SE MODIFICA**

```css
/* assets/css/print.css:31-32 */
.print-svg { width: 100%; display: block; }
.print-svg svg { width: 100%; height: auto; display: block; }
/* línea 46: */
.print-svg svg { max-height: 170mm; }
```

El SVG se escala al ancho útil del papel, sea cual sea su tamaño intrínseco. Por
eso la escala impresa depende del plano y **nunca** es la declarada. La etiqueta
«Escala 1:100» del pie, hoy, no describe el papel.

### D-09 · Las cotas pueden contradecir al dibujo — **SE MODIFICA**

```js
// assets/js/lib/renderer.js:1019-1020
const measured = Math.hypot(b.x - a.x, b.y - a.y);
const caption = element.label || G.formatMeasurement(measured, canvas.unit);
```

La cota calcula la longitud y la formatea… salvo que el elemento tenga `label`
propio (y `label` por defecto es `''`, pero el usuario puede escribir cualquiera,
hasta 240 caracteres, `DesignValidator`). Una cota que dice «12,50 m» sobre 9,80 m
es un error del usuario que el sistema **no detecta**. Además solo mide la cuerda
entre extremos: **ignora los arcos** que sí cuenta `G.pathLength`.

### D-10 · El lienzo acota el mundo real — **EXISTE (límite a documentar)**

`width` ∈ [400, 4000] y `height` ∈ [300, 3000] (`DesignValidator:281-282`).
Atado a la unidad:

| Unidad | Ancho máximo real | Ancho mínimo real |
| --- | --- | --- |
| `cm` (por defecto) | **40,0 m** | 4,00 m |
| `m` | 4000 m | 400 m |
| `mm` | 4,0 m | 0,40 m |

Con los valores por defecto, una bodega de 60 m de fachada **no cabe**. La salida
de hoy es cambiar la unidad (y ahí aparece D-02). Esto condiciona la calibración:
el factor debe poder bajar la densidad de unidades sin salir del rango.

### D-11 · No hay edificio — **NUEVO**

`projects (name, site, workplace, responsible, notes)` → `floors`.
`resources/schema.sql:37-51`, `52-67`. No existe `buildings` ni nada equivalente;
la palabra «edificio» aparece solo en textos (`PlanFooter.php:40`).

Para aforo por edificio hay que decidir DEC-1. Sin edificio propio, «aforo del
edificio» = suma de los pisos del proyecto, que funciona mientras un proyecto sea
un edificio.

### D-12 · El diseño es un documento inmutable por versión — **EXISTE (es una ventaja)**

`floor_versions.design_json` guarda el plano completo en cada versión
(`schema.sql:69-81`) y `Floor::saveDesign` es un `Database::transaction` con
verificación de versión (`Floor.php:83-125`). Consecuencias para esta misión:

- La geometría de un área **no debe** vivir en una tabla aparte: se desincronizaría
  de cada versión.
- Los atributos que cambian sin redibujar (aforo autorizado, personas previstas,
  conteos) **no deben** vivir en el JSON: se perderían al restaurar una versión y
  no se podrían consultar sin parsear 40 copias del plano.

### D-13 · El seeder entra por la puerta de atrás — **SE MODIFICA**

`DemoSeeder` inserta pisos y versiones con SQL directo
(`app/Services/DemoSeeder.php:48-63`), sin pasar por `Floor::saveDesign`. Cualquier
índice derivado del diseño (áreas, superficies) tiene que construirse aquí también,
o la demo nace sin áreas.

### D-14 · El validador del servidor es estricto y unilateral

`DesignValidator::normalizeArray` rechaza propiedades desconocidas en la raíz
(`:59-64`) y en el lienzo (`:276-280`), y valida el formato contra `[2, 3, 4]`
(`:69`). El cliente JS, en cambio, es tolerante (`normalizeDesign` ignora lo que
no conoce).

Consecuencia de despliegue: **si primero se publica el cliente nuevo, todos los
guardados fallan con 422** hasta que el servidor acepte los campos. El orden
obligatorio es servidor primero, cliente después (y ver §13, etapa 0).

### D-15 · Permisos listos para reutilizar — **EXISTE**

`Membership::CAPABILITIES`: `viewer→view`, `editor→view+write`,
`admin→+manage`, `owner→+own` (`Membership.php:35-40`). `BaseController`
expone `requireCapability($row, $cap, $message)` (`:73-78`). No hace falta un
sistema nuevo para aforo: hace falta **decidir qué capacidad exige qué**.

### D-16 · El auditor ya da la mitad de la Fase 6 — **EXISTE**

Ya devuelve `egress.requiredWidthM`, `availableWidthM`, `walkTimeS`,
`queueTimeS`, `estimatedTimeS` y `findings` con severidad (`PlanAudit.php:500-520`),
y acepta `?occupancy=N` para simular otro aforo (`FloorApiController.php:63-82`).

Eso significa que «¿alcanzan las salidas para N personas?» **ya se puede
responder hoy** con una simulación, sin escribir un motor nuevo. La Fase 6 debe
**enlazar** el escenario con esa simulación, no duplicarla.

### D-17 · La medición de rutas duplica la rejilla — **SE MODIFICA**

`assets/js/editor/measure.js:17-23` define su propia `CELL = 10` unidades y su
propia rejilla, con velocidad 1,2 / 0,8 m/s. El auditor hace lo mismo en PHP con
`PlanGrid` y `travelSpeedMps = 1`. Dos rejillas, dos criterios: los metros del
cajón de medición y los del informe pueden discrepar en el borde de un muro.

### D-18 · No hay histórico de aforo ni de ocupación — **NUEVO**

No existe ninguna tabla de conteos, ni de capacidad, ni de escenarios. Las **11**
tablas actuales son: `users`, `organizations`, `memberships`, `projects`, `floors`,
`floor_versions`, `brigade_links`, `verification_rounds`, `element_checks`,
`plugins` y `schema_migrations`. Verificado por `grep -c "CREATE TABLE"`
en `resources/schema.sql` = 11.

### D-19 · Migraciones ya soportan los pasos que vienen

`Migrations::VERSION = 7`, `steps()` con pasos 2–7, bitácora
`schema_migrations` y `bootstrap()` (`app/Core/Migrations.php:26-150`). Añadir los
pasos 8–11 es mecánico y ya tiene red de seguridad (transacción por paso, log,
`SchemaException`).

### D-20 · Ids actuales: enteros y locales

`AUTOINCREMENT` en todas las tablas; los elementos del plano usan
`el_<base36>_<contador><random>` (`model.js:144-147`) validado por
`^[A-Za-z][A-Za-z0-9_-]{2,47}$` (`DesignValidator:448`).

Para sincronía híbrida futura, un entero local no sirve como identidad global. Los
**ids nuevos** deben nacer como texto global (UUID v4) y las tablas nuevas no deben
depender de `AUTOINCREMENT` como identidad. Las tablas viejas **no** se tocan.

### D-21 · Resumen del inventario

| Componente | Archivo | Papel en esta misión |
| --- | --- | --- |
| Modelo geométrico | `assets/js/lib/model.js` (2077 l.) | **SE MODIFICA**: unidad, calibración, tipos de área |
| Geometría pura | `assets/js/lib/geometry.js` (574 l.) | **SE MODIFICA**: una sola autoridad de conversión; área de polígono |
| Render | `assets/js/lib/renderer.js` (1488 l.) | **SE MODIFICA**: áreas, cotas asociativas, escala |
| Editor/UI | `assets/js/editor.js` (2586 l.) | **SE MODIFICA**: herramienta área, panel de aforo |
| Inspector | `assets/js/editor/inspector.js` (864 l.) | **SE MODIFICA**: ficha del área, botón «Aforo» |
| Medición | `assets/js/editor/measure.js` (515 l.) | **SE MODIFICA**: unidad única |
| Rejilla | `app/Services/PlanGrid.php` (385 l.) | **SE REUTILIZA** (sin cambios) |
| Auditor | `app/Services/PlanAudit.php` (806 l.) | **SE REUTILIZA** + lectura de aforo |
| Extintores | `app/Services/ExtinguisherCoverage.php` (936 l.) | **SE REUTILIZA** (testigo de no-duplicación) |
| Redes | `app/Services/MepCalculator.php` (327 l.) | **SE MODIFICA**: conversión única |
| SVG | `app/Services/SvgExporter.php` (1040 l.) | **SE MODIFICA**: tamaño físico, capa de áreas |
| Pie | `app/Services/PlanFooter.php` (416 l.) | **SE MODIFICA**: escala verificada, aforo del piso |
| Validador | `app/Services/DesignValidator.php` (868 l.) | **SE MODIFICA**: formato 5, `calibration`, `areas` |
| Persistencia | `app/Models/Floor.php` (…) | **SE MODIFICA**: rebuild del índice de áreas |
| Esquema | `resources/schema.sql` + `Migrations` | **SE MODIFICA**: v7 → v11 |

---

## 3. Principios de la arquitectura propuesta

**P1 · Una sola autoridad de unidades.** Nace `PlanUnits` (PHP) y `Units` (JS) con
`metersPerUnit(canvas)`, `cmPerUnit(canvas)`, `toMeters(canvas, u)`,
`fromMeters(canvas, m)`. Los seis conversores actuales pasan a delegar. No se
acepta ninguna división por 100 fuera de ahí.

**P2 · La geometría vive en el documento; el negocio, en las tablas.** El polígono
de un área es parte del plano y se versiona con él. El aforo autorizado, los
estimados, los conteos y los escenarios son datos de gestión: van en SQL y
referencian el área por su id estable. Esto evita duplicar geometría en cada
versión y evita perder el aforo al restaurar.

**P3 · Ids estables y globales.** Áreas y todo lo nuevo usan texto UUID v4. Una
versión restaurada conserva los ids de área, así que el aforo sigue enganchado.

**P4 · No se duplica el motor geométrico.** Áreas, aforo y emergencias usan
`PlanGrid` y `G.pathLength`. La rejilla de `measure.js` se sustituye por la misma
autoridad.

**P5 · «Sin dato» es un estado de primera clase.** El sistema nunca rellena un
aforo máximo con una estimación. Un total con áreas desconocidas se muestra como
**«≥ N · M áreas sin dato»**, no como un número limpio.

**P6 · El sistema no dictamina.** No declara suficiencia de rutas ni cumplimiento.
Compara contra criterios configurables, cita la fuente y pide revisión humana.

**P7 · Compatibilidad hacia atrás.** Los formatos 2, 3 y 4 se siguen abriendo y
guardando igual. Un plano sin calibrar se comporta **exactamente** como hoy.

**P8 · Offline primero.** Todo el aforo funciona sin red y sin servicios externos;
la sincronía es una capacidad futura, no una dependencia.

---

## 4. Fase 1 · Modelo dimensional

### 4.1 Unidades y factor

**Propuesta.** El plano gana un bloque opcional `canvas.calibration`; el resto
sigue igual. El factor de conversión se deriva de datos verificables:

```
metersPerUnit(canvas) =
    if calibration.valid:
        calibration.metersPerUnit          // medido y confirmado
    else:
        { m: 1, cm: 0.01, mm: 0.001 }[canvas.unit]
```

`calibration.metersPerUnit` se calcula **una sola vez**, al calibrar, y se guarda
con su evidencia:

```jsonc
"calibration": {
  "method": "known-distance",     // known-distance | wall-length | canvas-width
  "knownM": 4.20,                  // distancia real declarada por el usuario
  "measuredU": 418.6,              // distancia medida sobre el lienzo (unidades)
  "metersPerUnit": 0.010034,       // = knownM / measuredU
  "unit": "cm",                    // unidad vigente al calibrar
  "reference": "eje_1",            // opcional: id del trazo usado
  "tolerancePct": 2.0,             // margen declarado por quien calibra
  "at": "2026-11-01T14:03:00+00:00",
  "by": 3                          // users.id
}
```

Reglas:

1. **No se recalcula sola.** Si `canvas.unit` cambia, la calibración pasa a
   `stale: true` y se muestra «calibración inválida: cambió la unidad». No se
   reescribe en silencio.
2. **Rango admitido**: el factor resultante debe quedar entre `0.2×` y `5×` el
   factor nominal de la unidad. Fuera de eso se rechaza con mensaje explícito
   (suele ser un error de dedo: 42 m en vez de 4,2 m).
3. **Precisión**: `metersPerUnit` se guarda con 9 decimales; las distancias se
   redondean a 1 cm, las superficies a 0,01 m² y los perímetros a 1 cm, en la capa
   de presentación, nunca en el cálculo.
4. **Tolerancia declarada**: la calibración no afirma exactitud mejor que
   `tolerancePct`. El pie del plano imprime «Escala 1:100 · calibrada ±2 %» o
   «Escala 1:100 · declarada, sin calibrar». Nunca las dos cosas igual.

### 4.2 Calibración por distancia conocida (UX)

Flujo propuesto, dentro del editor, sin salir:

1. *Piso › Calibrar escala* → el lienzo entra en modo «dos puntos».
2. El usuario hace clic en dos extremos de una distancia **real conocida** (un
   muro medido con cinta, el ancho de una puerta, la fachada del plano municipal).
3. Se abre una hoja inferior con: distancia medida en pantalla, campo «distancia
   real» + selector de unidad (**m / cm / mm**), margen de tolerancia y nota.
4. Vista previa del efecto: «1 unidad = 1,0034 cm · la fachada de 12,00 m pasa a
   12,04 m · ±2 %».
5. Confirmar → se guarda `calibration`, se marca el plano como calibrado y se
   ofrece **guardar una versión** con nota automática «Calibración».

Alternativa equivalente y más cómoda si el muro ya existe: seleccionar un muro y
usar *Calibrar con este trazo*, que toma `G.pathLength` (arcos incluidos) como
`measuredU`. Es el mismo dato, sin dibujar nada nuevo.

### 4.3 Escala física independiente del zoom

Tres escalas distintas que hoy se confunden en una:

| Escala | Qué es | Dónde se usa | Cambia con el zoom |
| --- | --- | --- | --- |
| **Escala de modelo** | metros por unidad | todos los cálculos | no |
| **Escala de impresión** | `1:N` declarada o derivada | SVG y papel | no |
| **Zoom de pantalla** | píxeles por unidad | solo el lienzo | sí |

**Propuesta.** El zoom nunca entra en un cálculo (hoy ya es así: `renderer` usa
`zoom` solo para grosores de trazo). La escala de impresión se **deriva** y se
puede fijar:

```
mmPapel = mReales × 1000 / N
N = max(1, round(mAnchoReal × 1000 / mmDisponibles))
```

Con 12 m de ancho y 273 mm útiles, la escala natural es 1:44. Si el usuario fija
1:100, el plano ocupa 120 mm y **se imprime centrado, no estirado**: la hoja deja
margen. Si fija una escala que no cabe, se le dice: «a 1:50 este plano necesita
240 mm y solo hay 273: cabe; a 1:25 necesita 480 mm y no cabe».

### 4.4 Distancias, superficies y perímetros

**Distancia** entre dos puntos: `hypot` en unidades × `metersPerUnit`.
**Longitud de un trazo**: `G.pathLength(points, curves)` — ya aplana arcos y es la
misma que usan el auditor y las redes. **Propuesta**: el servidor gana
`PlanUnits::lengthMeters($element, $canvas)` con la misma semántica.

**Perímetro de un área**: suma de lados; si un lado es arco, se aplana con
`G.arcFlatten` (tolerancia ya dependiente de la unidad).

**Superficie** de un polígono con lados rectos y curvos: se aplana y se aplica
Gauss (shoelace):

```
A_unidades² = |Σ (x_i · y_{i+1} − x_{i+1} · y_i)| / 2
A_m²        = A_unidades² × (metersPerUnit)²
```

Con huecos (columnas, ductos), se restan: `A = A_exterior − Σ A_huecos`.
Se redondea a 0,01 m². **Nunca** se redondea antes de sumar el piso.

**Cierre**: un área debe cerrarse con tolerancia `max(2 unidades, 1 % del
perímetro)`. Si no cierra, se guarda como *área abierta* y **no** aporta
superficie al aforo (sí se dibuja). Es preferible un error visible a un número
inventado.

### 4.5 Cotas asociativas

`dimension` gana un campo opcional `source`:

| `source` | Etiqueta | Comportamiento |
| --- | --- | --- |
| `auto` (nuevo por defecto) | calculada del trazo | se recalcula al mover; ignora `label` |
| `manual` | escrita por el usuario | se conserva; si difiere >2 % de la geometría, el auditor añade un aviso `dimension_mismatch` |

Además, cuando el trazo tiene arcos, `source: auto` usa `G.pathLength` (no la
cuerda). Arregla D-09 sin romper planos existentes: los que no traen `source`
siguen mostrando `label` si lo tienen.

### 4.6 SVG con dimensiones físicas

**Propuesta** (DEC-4) en `SvgExporter`:

```
$mPerUnit = PlanUnits::metersPerUnit($canvas);
$mmW = $width  * $mPerUnit * 1000 / $denominador;   // 1200 × 0.01 × 1000 / 100 = 120
$mmH = $height * $mPerUnit * 1000 / $denominador;
$svg .= '<svg … width="' . $mmW . 'mm" height="' . $mmH . 'mm" viewBox="0 0 ' . $width . ' ' . $totalHeight . '">';
```

- `viewBox` **no cambia**: todo el dibujo interno queda idéntico.
- La banda del pie (leyenda, datos, escala gráfica) crece en mm proporcionalmente,
  así que a 1:100 la franja de datos no se come el plano.
- Se añade una **escala gráfica** (barra de 0–1–2–5 m) al pie: sirve aunque el
  papel se fotocopie al 97 %.
- `print.css` deja de estirar (`width:100%` → `max-width:100%`), y la hoja se
  centra.
- Planos **sin** calibración: se emite igual, con la marca «escala declarada». No
  se cambia su tamaño por defecto salvo que DEC-4 diga lo contrario; si se quiere
  conservar el comportamiento actual para los antiguos, se deja el `width` actual
  cuando `calibration` no exista (compatibilidad estricta, P7).

### 4.7 Reglas de cambio de unidad (arreglo de D-02)

| Caso | Regla propuesta |
| --- | --- |
| Plano vacío | Se cambia sin ceremonia |
| Plano con elementos, cambio **con** reconversión | Se multiplican todas las coordenadas, tamaños y puntos por `f = factorViejo / factorNuevo`. `w`, `h`, `x`, `y`, `points`, `stroke` (grosor) y `fontSize`. La geometría física no cambia |
| Plano con elementos, cambio **sin** reconversión | Se exige confirmación explícita que diga, con números, qué pasará («el ancho real pasa de 12,00 m a 1 200 m»), y se ofrece guardar versión antes |
| Plano calibrado | La calibración se invalida (`stale`) y se avisa; hay que recalibrar |

La reconversión es determinista y se prueba con ida y vuelta:
`cm → m → cm` debe devolver el mismo documento (tolerancia 0,01 unidades).

---

## 5. Fase 2 · Edificaciones, pisos y áreas

### 5.1 Jerarquía propuesta

```
organizations
  └── projects                    (contrato, sede, responsable)
        └── buildings   [NUEVO]   (edificación física: nombre, dirección, uso)
              └── floors  [SE MODIFICA: building_id nullable]
                    └── areas/recintos   [NUEVO: dentro de design_json]
```

`floors.building_id` **nullable** con relleno en la migración: una edificación por
proyecto existente, con el nombre del proyecto. Ningún piso queda huérfano y la
UI sigue funcionando si `building_id` es NULL (proyecto = edificación implícita).

Campos de `buildings`: `id TEXT (uuid)`, `project_id`, `name`, `address`, `use_type`
(residencial, comercial, industrial, educativo, salud, mixto), `levels_count`,
`notes`, `created_at`, `updated_at`.

### 5.2 El área como entidad del plano

**Propuesta:** un área es un **elemento del documento**, no de la tabla, con su
propia forma:

```jsonc
// dentro de design.elements, un tipo nuevo 'area'
{
  "id": "area_01HQ8Z…",          // UUID v4, estable entre versiones
  "type": "area",
  "layerId": "capa_areas",
  "name": "Recepción",           // 1..80 caracteres
  "useType": "oficina",          // catálogo cerrado (ver 5.4)
  "kind": "interior",            // interior | exterior | circulacion | servicio
  "points": [{"x":120,"y":140}, …],   // ≥ 3 vértices, sin repetir el primero
  "curves": [null, {…}, …],      // misma mecánica que muros (arcos de 3 puntos)
  "holes": [ {"points":[…]} ],   // columnas, ductos; opcional
  "closed": true,
  "color": "#0ea5e9",
  "label": "Recepción",
  "countable": true              // si suma aforo (pasillos suelen ir en false)
}
```

Por qué así:

- **Se versiona con el plano** (P2): restaurar una versión devuelve las áreas de
  esa versión.
- **Reutiliza la mecánica de arcos** ya probada (`CURVE_TYPES` + `sanitizeCurves`).
- **No toca `elements` en su estructura**: es un tipo más, con `points`; el
  validador ya sabe validar puntos y curvas.
- **`id` es UUID**, así que el aforo enganchado sobrevive a guardados, versiones y
  (futuro) sincronía.

### 5.3 Cómo se crea un área (sin dibujar desde cero)

Tres caminos, todos dentro del editor:

1. **Dibujar** (herramienta nueva): clics sucesivos, cierre con doble clic o
   `Enter`; ajuste a rejilla y a esquinas de muros.
2. **Detectar recinto** (usa `PlanGrid` en el cliente o el servidor): el usuario
   hace clic dentro de un recinto cerrado por muros y el sistema propone el
   polígono de esa componente conexa, **con su superficie ya calculada**. Es el
   uso más importante: convierte el motor que ya existe en un productor de áreas.
3. **Envolver selección**: si hay muros seleccionados que forman un lazo, se
   propone el polígono.

El camino 2 necesita una versión del campo de celdas en JS (hoy la rejilla de
áreas vive solo en PHP y la de `measure.js` es otra). Propuesta: `Assets/js/lib/plan-grid.js`
con el mismo algoritmo (BFS + bloqueo de muros + vanos), y un test que compare
celda a celda contra la implementación PHP con el mismo plano patrón.

### 5.4 Vínculo con la geometría del plano, no solo con la etiqueta

Cada área guarda, opcionalmente, los muros que la delimitan:

```jsonc
"boundary": { "walls": ["el_…", "el_…"], "hash": "3f2c…" }
```

- `walls` se rellena al detectar el recinto.
- `hash` es un SHA-1 corto de las geometrías de esos muros.
- Al abrir el plano, si el `hash` no coincide (alguien movió un muro), el área se
  marca **«geometría cambiada»** y pide **recalcular** (un clic) — nunca se
  actualiza sola, porque un cambio de muro puede partir un área en dos.
- Si el área se dibujó a mano sin muros, `boundary` no existe y no hay nada que
  vigilar.

Esto cumple el requisito de la misión: el área está **vinculada con geometría
identificable**, no con un texto.

### 5.5 Índice materializado `floor_spaces` [NUEVO]

Para consultar aforo sin parsear 40 versiones del plano:

| Columna | Tipo | Nota |
| --- | --- | --- |
| `id` | TEXT PK | UUID v4 del área (mismo que en el JSON) |
| `floor_id` | INTEGER FK | `ON DELETE CASCADE` |
| `organization_id` | INTEGER FK | desnormalizado para permisos y sumas |
| `name` | TEXT | copia para listados |
| `use_type` | TEXT | catálogo |
| `kind` | TEXT | interior/exterior/circulación/servicio |
| `area_m2` | REAL | calculado al indexar |
| `perimeter_m` | REAL | calculado al indexar |
| `countable` | INTEGER | 1 = suma aforo |
| `active` | INTEGER | 0 = ya no está en el plano |
| `geometry_hash` | TEXT | para detectar cambios |
| `synced_version` | INTEGER | versión del plano de la que salió |
| `created_at`, `updated_at` | TEXT | |

Reglas de sincronización:

- Se reconstruye **dentro de la misma transacción** de `Floor::saveDesign`
  (`Floor.php:87`), y también en `DemoSeeder` (D-13).
- Un área que desaparece del plano **no se borra**: `active = 0`. Así su aforo y su
  historial no se pierden, y si vuelve, se reactiva por id.
- Comando de verificación `php`-equivalente (`Backup` ya tiene un patrón):
  comparar `floor_spaces` contra el JSON de la versión vigente y reportar
  desviaciones. Se expone en la pantalla de respaldo como comprobación de
  integridad y en las pruebas.

Por qué materializar y no calcular al vuelo: la agregación de aforo de un edificio
con 8 pisos y 60 áreas no debería abrir 8 JSON de 1 MB.

### 5.6 Reglas geométricas

- **Solape**: se permite (una oficina dentro de una nave), pero al sumar aforo se
  avisa «3 áreas se solapan; el total puede estar duplicado» con la lista. No se
  bloquea: hay casos legítimos.
- **Área mínima**: 0,5 m². Menos que eso es un error de dibujo.
- **Áreas abiertas**: se dibujan con trazo discontinuo, no suman.
- **Fuera del lienzo**: no se permite (mismo límite que los demás elementos).
- **Máximo**: 200 áreas por piso (hoy el tope de elementos es 1200;
  `model.js:443`). Con 200 áreas y 1000 elementos, el JSON sigue por debajo de
  2,5 MB en el caso normal; se medirá antes de cerrar la etapa.

---

## 6. Fase 3 · Aforo: tres indicadores independientes

### 6.1 A · Aforo máximo (capacidad documentada)

**Nunca calculado por la aplicación.** Es un dato con procedencia:

| Campo | Regla |
| --- | --- |
| `persons` | entero 0..100 000 |
| `scope` | `space` (área) o `floor` (piso completo: patios, cubiertas) |
| `source_type` | `licencia` · `norma` · `estudio` · `administrativo` · `aforo_tecnico` |
| `source_ref` | texto libre corto: número de licencia, resolución, informe |
| `criterion` | texto + tipo: `m2_persona` (con `density`), `puestos`, `sillas`, `capacidad_instalada`, `otro` |
| `issued_on` | fecha del documento |
| `valid_from` / `valid_to` | vigencia; `valid_to` NULL = sin caducidad declarada |
| `responsible` | nombre y cargo de quien lo documenta |
| `notes` | observaciones |
| `created_by`, `created_at` | autoría del registro |

Historial: **append-only**. Corregir un aforo no edita la fila: inserta una nueva y
la anterior queda con `superseded_by`. La vigente es la última con
`valid_to IS NULL OR valid_to >= hoy`. Así se puede responder «¿qué aforo tenía la
bodega en marzo?», que es exactamente lo que pide una inspección.

El `criterion: m2_persona` guarda la densidad **usada**, pero el número que manda
es `persons`. La aplicación puede **sugerir** `área_útil × densidad` como ayuda de
captura y mostrar la diferencia; no la impone.

**Si no hay aforo documentado**, el área muestra **«Aforo máximo: sin documentar»**
en gris, y suma a la fila «M áreas sin aforo» del resumen. Nunca un cero, nunca una
estimación disfrazada.

### 6.2 B · Aforo estimado (personas previstas)

Por **escenario** (Fase 4), con desglose por espacio:

```
estimado(escenario, espacio) = persons_previstas
estimado(escenario, piso)    = Σ espacios del piso
estimado(escenario, edificio)= Σ pisos
```

Sin escenario activo, el estimado del piso cae en `canvas.occupancy` (lo que hoy
existe, D-06), para no romper nada: es el «escenario base».

Comparación B vs A por espacio:

| Situación | Estado | Mensaje |
| --- | --- | --- |
| B ≤ 0,9 A | `ok` | — |
| 0,9 A < B ≤ A | `ajustado` | «Al 93 % del aforo documentado» |
| B > A | `excedido` | «14 personas por encima del aforo documentado (120)» |
| A desconocido | `sin_dato` | «No se puede comparar: falta aforo documentado» |

### 6.3 C · Ocupación real

**Registro manual, por ahora.** No se asume ocupación automática sin fuente.

- Un conteo es un hecho con fecha: `persons`, `space_id` (o piso completo),
  `method` (`conteo_visual`, `pases`, `boletas`, `sensor`, `importado`),
  `counted_by`, `counted_at`, `scenario_id` opcional, `notes`.
- **Append-only**: no se edita un conteo; se registra otro. El historial es la
  lista.
- La «ocupación actual» es el **último conteo por espacio dentro de una ventana**
  configurable (por defecto 2 h). Fuera de la ventana, el espacio vuelve a
  «sin dato reciente», no a cero.
- Agregación con la misma regla honesta: si 4 de 10 áreas tienen conteo reciente,
  el piso muestra **«≥ 210 · 6 áreas sin conteo»**.
- Quién: `write` puede registrar; `manage` puede corregir con nota; nadie borra
  (se anula con un conteo en negativo explicado, o con `voided_at` + motivo).

### 6.4 Reglas de agregación (las tres juntas)

```
por área:    A (documentado) · B (previsto en el escenario) · C (último conteo)
por piso:    Σ de las áreas countable + conteos a nivel de piso
por edificio: Σ de los pisos
```

Tres invariantes que se prueban:

1. **Nunca se suma un desconocido como cero.** Cada nivel devuelve
   `{known: N, unknown: M}`, y la UI muestra `≥ N (M sin dato)`.
2. **No se suman recintos que se contienen** (un área dentro de otra) sin avisar;
   el solape se detecta por intersección de polígonos (algoritmo de recorte) y se
   reporta.
3. **Un conteo no se usa dos veces**: ventana de validez explícita.

### 6.5 Ejemplo numérico completo

Piso con 5 áreas, dos calibradas:

| Área | Útil m² | Aforo A | Estimado B | Último conteo C |
| --- | --- | --- | --- | --- |
| Recepción | 24,0 | 12 | 10 | 8 (hace 20 min) |
| Sala de espera | 48,0 | 30 | 34 | 41 (hace 10 min) |
| Oficina 1 | 32,0 | 16 | 14 | — |
| Bodega | 120,0 | sin documentar | 8 | — |
| Pasillo | 18,0 | — (no countable) | — | — |

Salida del piso:

```text
Aforo documentado:  58 (3 áreas con dato · 1 sin aforo)
Estimado:           66  → excedido en 8 respecto a lo documentado
Ocupación reciente: ≥ 49 (2 de 4 áreas con conteo)
Alerta: Sala de espera supera su aforo documentado (41 > 30).
```

Ningún número se inventa: el 58 no incluye la bodega, y se dice.

---

## 7. Fase 4 · Escenarios operativos

### 7.1 Modelo

Un **escenario** describe «quién está y cuándo», sin tocar la geometría.

| Campo | Nota |
| --- | --- |
| `id` | UUID |
| `organization_id`, `project_id`, `building_id` (nullable) | alcance |
| `name` | «Turno noche», «Capacitación 200 personas» |
| `kind` | `base` · `turno` · `evento` · `capacitacion` · `simulacro` · `extraordinaria` · `temporal` |
| `description` | texto |
| `status` | `borrador` · `activo` · `cerrado` · `cancelado` |
| `starts_on` / `ends_on` | fechas de vigencia |
| `time_from` / `time_to` | franja horaria (HH:MM) |
| `weekdays` | máscara «L M X J V S D» |
| `responsible_user_id` / `responsible_name` | responsable |
| `created_by`, `created_at`, `updated_at` | autoría |

Relaciones:

- `scenario_floors` (escenario ↔ pisos incluidos).
- `scenario_spaces` (escenario ↔ área ↔ `estimated_persons`). Es el aforo estimado
  real; `canvas.occupancy` queda como base para el escenario `base`.

### 7.2 Reglas

- **No altera geometría**: cero escrituras en `floors`/`floor_versions`. Se prueba
  comparando el hash del diseño antes y después de crear un escenario.
- **No sobrescribe históricos**: `escenario cerrado` es inmutable; se copia a uno
  nuevo para repetirlo («Duplicar como…»).
- **Independencia**: dos escenarios activos a la vez son válidos (mañana y tarde);
  la UI siempre dice **cuál** se está viendo. Nunca hay «el escenario» implícito.
- **Simulacro** es un `kind`, y además crea un registro en `drills` (Fase 6).
- **Calendario**: una vista semanal muestra qué escenario aplica a cada franja.
  Base gris, turnos azules, eventos ámbar, simulacros rojos.
- **Jornadas especiales**: `kind: extraordinaria` con `starts_on = ends_on` y horario
  ampliado; no requiere cambios de esquema.

### 7.3 Estados y transiciones

```
borrador ──activar──▶ activo ──cerrar──▶ cerrado
   │                     │
   └──cancelar──▶ cancelado ◀──cancelar──┘
```

- Solo `manage` activa/cierra; `own` puede cancelar un escenario ya cerrado (con
  motivo, y queda registrado).
- Un escenario activo con `ends_on` vencido pasa a `cerrado` **automáticamente**
  al abrir el panel (perezoso), no por un cron.

---

## 8. Fase 5 · Integración visual en el CAD

### 8.1 Delimitación y selección

- Capa nueva **«Áreas»** (creada por la migración del plano, no por la del
  esquema): encima de muros, debajo de señalización.
- Relleno al 12 % de opacidad y borde de 1,5 unidades; etiqueta con nombre y
  superficie (`A-101 · 24,0 m²`) en el centroide.
- **Selección**: clic dentro del área (no solo en el borde) cuando la herramienta
  es «Seleccionar» y no hay un elemento encima. El inspector abre la sección
  **Aforo** del área.
- **Modo aforo** (interruptor en la barra): pinta cada área según su estado
  (ok / ajustado / excedido / sin dato) y atenúa el resto del plano.

### 8.2 La información del área sin salir del editor

`GET api/floors/{id}/spaces/{spaceId}` → ficha completa:

```jsonc
{
  "ok": true,
  "space": { "id": "…", "name": "Sala de espera", "areaM2": 48.0, "perimeterM": 28.4,
             "useType": "espera", "boundary": {"status": "ok"} },
  "capacity": { "persons": 30, "sourceType": "licencia", "sourceRef": "LC-2024-118",
                "criterion": "m2_persona", "density": 1.6, "validTo": null,
                "responsible": "…", "documentedAt": "2024-03-02" },
  "estimated": { "persons": 34, "scenarioId": "…", "scenarioName": "Turno tarde" },
  "occupancy": { "persons": 41, "countedAt": "…", "minutesAgo": 10, "method": "conteo_visual" },
  "alerts": [ { "level": "excedido", "message": "…" } ]
}
```

La ficha se muestra en el inspector (sección plegable, coherente con el diseño
actual de secciones) y **no** navega fuera del editor. Los formularios de escritura
son POST con `_token` y `X-CSRF-Token`, como el resto de la API.

### 8.3 Vistas de conjunto

| Vista | Contenido | Dónde |
| --- | --- | --- |
| Ficha de área | A/B/C + alertas | Inspector del editor |
| Resumen del piso | suma por área, anillos de estado | Cajón «Aforo» del editor |
| Resumen del edificio | tabla piso por piso + totales honestos | Ficha del proyecto |
| Resumen de empresa | edificios y alertas activas | Panel de inicio |
| Cambio de escenario | selector con la franja vigente preseleccionada | Barra del editor y cajón |

### 8.4 Alertas

| Código | Nivel | Cuándo |
| --- | --- | --- |
| `af_area_excedida` | crítico | B > A en un área |
| `af_piso_excedido` | crítico | B o C del piso > A del piso |
| `af_sin_aforo` | aviso | área `countable` sin aforo documentado |
| `af_aforo_vencido` | aviso | `valid_to` anterior a hoy |
| `af_sin_conteo` | info | escenario activo sin conteos en la ventana |
| `af_solape` | aviso | áreas que se solapan y ambas cuentan |
| `af_geom_cambiada` | aviso | el área cambió de muros (hash distinto) |

Las alertas son datos calculados, no estados guardados (salvo las que se «firman»
al aprobar un escenario, que se congelan como evidencia).

---

## 9. Fase 6 · Gestión de emergencias

### 9.1 Lo que ya hay y se reutiliza sin tocar

`PlanAudit::analyze($design, $occupancy)` ya responde, ante N personas:

- ancho requerido (`N × widthMmPerPerson / 1000`), ancho disponible, si se
  excede, y con cuánto;
- tiempo de recorrido más largo, de cola en la salida y total;
- salidas insuficientes, recorrido excesivo, rutas que cruzan muros, zonas
  inalcanzables, señalización faltante.

**Propuesta:** el escenario no calcula nada nuevo; **simula** con su aforo B y
guarda el informe como evidencia al aprobarse:

```
aprobacion = { scenario_id, occupancy_used: B, report_hash, findings_criticos, at, by }
```

Así, dentro de un año se puede mostrar **exactamente** qué decía el auditor el día
que se aprobó el evento. Y el informe actual se sigue calculando al vuelo.

### 9.2 Lo que falta para responder «¿alcanza?»

Con honestidad, el sistema **no** puede dictaminar suficiencia. Le faltan:

| Falta | Qué habría que capturar |
| --- | --- |
| Anchos reales de vano | Hoy se derivan del dibujo; no hay campo «ancho medido en sitio» |
| Sentido y estado de puertas | Existe `isExit` y flip; no hay «abre en el sentido de la evacuación» |
| Distancia real de recorrido | Se mide sobre el planos esquemático, no sobre el edificio |
| Norma aplicable | Los umbrales son de referencia (`audit-criteria.json`) y configurables |
| Punto de reunión | No existe como entidad (solo como pictograma) |

**Propuesta (etapa 6, opcional):** añadir `egress_checks` (verificación física del
ancho de cada salida, con foto — reutiliza el patrón de `element_checks`) y
`assembly_points` (punto de reunión con coordenadas). Con eso, el auditor puede
comparar **medido** contra **requerido** en lugar de dibujado contra requerido, y
el mensaje pasa de «podría» a «el ancho medido es 78 cm y el requerido 90 cm».

### 9.3 Simulacros

`drills`: `id`, `scenario_id`, `floor_id`, `started_at`, `ended_at`,
`evacuated_persons`, `target_seconds` (del auditor), `actual_seconds`,
`responsible`, `findings`, `photo` (opcional, mismo patrón que `element_checks`).

Valor inmediato: **comparar promesa y realidad**. «El auditor estimaba 96 s; el
simulacro tardó 184 s.» Esa frase, sola, justifica la fase.

### 9.4 Lo que nunca hará

- No marcará el plano como «evacuación segura».
- No declarará «ruta suficiente» por tener aforo.
- No comparará contra una norma que no esté configurada y citada.

---

## 10. Fase 7 · Datos, migraciones y compatibilidad

### 10.1 Modelo de datos propuesto (DDL de referencia, **no ejecutado**)

```sql
-- 8 · Edificaciones
CREATE TABLE buildings (
    id TEXT PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    use_type TEXT NOT NULL DEFAULT 'mixto',
    levels_count INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_buildings_project ON buildings(project_id);
ALTER TABLE floors ADD COLUMN building_id TEXT NULL REFERENCES buildings(id) ON DELETE SET NULL;

-- 9 · Áreas y aforo máximo
CREATE TABLE floor_spaces (
    id TEXT PRIMARY KEY,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL DEFAULT '',
    use_type TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'interior',
    area_m2 REAL NOT NULL DEFAULT 0,
    perimeter_m REAL NOT NULL DEFAULT 0,
    countable INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    geometry_hash TEXT NOT NULL DEFAULT '',
    synced_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_spaces_floor ON floor_spaces(floor_id, active);

CREATE TABLE space_capacities (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES floor_spaces(id) ON DELETE CASCADE,
    persons INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL DEFAULT '',
    criterion TEXT NOT NULL DEFAULT 'otro',
    density REAL NULL,
    issued_on TEXT NULL,
    valid_from TEXT NULL,
    valid_to TEXT NULL,
    responsible TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_by TEXT NULL REFERENCES space_capacities(id)
);
CREATE INDEX idx_capacity_space ON space_capacities(space_id, valid_to);

CREATE TABLE floor_capacities (            -- aforo documentado del piso completo
    id TEXT PRIMARY KEY,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    persons INTEGER NOT NULL,
    source_type TEXT NOT NULL, source_ref TEXT NOT NULL DEFAULT '',
    criterion TEXT NOT NULL DEFAULT 'otro', issued_on TEXT NULL,
    valid_from TEXT NULL, valid_to TEXT NULL,
    responsible TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_by TEXT NULL REFERENCES floor_capacities(id)
);

-- 10 · Escenarios y ocupación
CREATE TABLE scenarios (
    id TEXT PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    building_id TEXT NULL REFERENCES buildings(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'evento',
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'borrador',
    starts_on TEXT NULL, ends_on TEXT NULL,
    time_from TEXT NULL, time_to TEXT NULL,
    weekdays TEXT NOT NULL DEFAULT '1234567',
    responsible_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    responsible_name TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE scenario_floors (
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    PRIMARY KEY (scenario_id, floor_id)
);
CREATE TABLE scenario_spaces (
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    space_id TEXT NOT NULL REFERENCES floor_spaces(id) ON DELETE CASCADE,
    estimated_persons INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (scenario_id, space_id)
);

CREATE TABLE occupancy_counts (
    id TEXT PRIMARY KEY,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    space_id TEXT NULL REFERENCES floor_spaces(id) ON DELETE SET NULL,
    scenario_id TEXT NULL REFERENCES scenarios(id) ON DELETE SET NULL,
    persons INTEGER NOT NULL,
    method TEXT NOT NULL DEFAULT 'conteo_visual',
    source TEXT NOT NULL DEFAULT 'manual',
    counted_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    counted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NOT NULL DEFAULT '',
    voided_at TEXT NULL,
    void_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_counts_floor ON occupancy_counts(floor_id, counted_at DESC);
CREATE INDEX idx_counts_space ON occupancy_counts(space_id, counted_at DESC);

-- 11 · Simulacros
CREATE TABLE drills (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NULL REFERENCES scenarios(id) ON DELETE SET NULL,
    floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL, ended_at TEXT NULL,
    evacuated_persons INTEGER NOT NULL DEFAULT 0,
    target_seconds INTEGER NULL, actual_seconds INTEGER NULL,
    responsible TEXT NOT NULL DEFAULT '', findings TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 10.2 Por qué texto (UUID) y no enteros

Todas las entidades nuevas usan `TEXT PRIMARY KEY` con UUID v4 generado en PHP.
Razones:

1. **La sincronía híbrida futura** no tiene que remapear ids ni inventar tablas de
   correspondencia: el id nace global.
2. **El área ya vive en el JSON** con un id de texto; si la tabla usara enteros,
   habría que mantener una tabla de equivalencias entre versiones.
3. Las tablas viejas se quedan como están (`AUTOINCREMENT`): no se toca nada que
   funcione.

Coste aceptado: índices algo mayores y joins con texto. Con 60 áreas y 10 000
conteos por instalación, irrelevante.

### 10.3 Migraciones (pasos 8 a 11)

| Paso | Nombre | Contenido | Riesgo |
| --- | --- | --- | --- |
| 8 | Edificaciones | `buildings`; `floors.building_id` nullable; relleno una edificación por proyecto | Bajo: aditivo, sin tocar filas existentes |
| 9 | Áreas y aforo máximo | `floor_spaces`, `space_capacities`, `floor_capacities` | Bajo: tablas vacías |
| 10 | Escenarios y ocupación | `scenarios`, `scenario_floors`, `scenario_spaces`, `occupancy_counts` | Bajo |
| 11 | Simulacros | `drills` | Bajo |

Reglas que se respetan del sistema existente (`Migrations.php`):

- Cada paso en **su propia transacción**; `user_version` sube solo si termina.
- Fila en `schema_migrations` con nombre, checksum, duración y fecha.
- `resources/schema.sql` crea el esquema completo en instalaciones nuevas y
  `Migrations::VERSION` pasa a **11**.
- **El índice `floor_spaces` no se rellena en la migración.** Reindexar 300 planos
  de golpe dentro de un paso es la clase de operación que deja una instalación sin
  arrancar. Se reindexa **perezosamente**: al abrir el plano, al guardarlo, y con
  una acción explícita *«Reindexar áreas»* en el panel de respaldo, que informa del
  avance. Un plano sin indexar simplemente no aparece en los resúmenes de edificio
  hasta que se abre una vez; el editor funciona igual.
- Los pasos 8–11 son **idempotentes** (`IF NOT EXISTS`), como los actuales.

### 10.4 Compatibilidad

| Elemento | Regla |
| --- | --- |
| Formato de documento | Se acepta 2, 3 y 4 (hoy `DesignValidator:69`); se añade **5** cuando hay `calibration`, `areas` o `holes`. Guardar un plano antiguo sin tocarlo produce el mismo formato que hoy |
| Plano sin áreas | Se comporta igual; `floor_spaces` queda vacío |
| `canvas.occupancy` | Se conserva como aforo estimado del escenario base; no se renombra ni se migra |
| Cliente antiguo contra servidor nuevo | Sigue funcionando: el servidor acepta formatos 2–4 y campos ausentes |
| Cliente nuevo contra servidor antiguo | **Falla** (422 por propiedad no permitida). De ahí el orden de despliegue: servidor primero |
| APK/escritorio | Usan la misma base y el mismo `schema.sql`; las migraciones corren al arrancar. No hay ruta alternativa |

### 10.5 Offline y sincronía híbrida futura

- **Offline hoy**: todo es local; el aforo, los escenarios y los conteos funcionan
  sin red porque son SQLite. No se añaden llamadas externas (requisito permanente).
- **Sincronía futura** (no se implementa ahora, pero se deja preparada):
  - ids globales (UUID) ✔;
  - **reloj**: cada fila nueva lleva `updated_at` y las de negocio `created_at`;
    para sincronía real hará falta `rev INTEGER` o `logical_clock`. **Propuesta**:
    añadir `rev INTEGER NOT NULL DEFAULT 1` a las tablas nuevas desde el paso 8,
    incrementado en cada escritura, para no migrar después;
  - **conflictos**: los conteos y las capacidades son *append-only*, así que la
    unión de conjuntos nunca pierde datos; los escenarios sí pueden chocar → gana
    `updated_at` mayor, y el perdedor se conserva como `conflicto` en una tabla de
    cuarentena;
  - **borrado**: nunca físico en entidades de negocio (`active`, `voided_at`,
    `superseded_by`), lo que hace la sincronía trivial de razonar.

### 10.6 Permisos (matriz propuesta)

| Acción | Capacidad |
| --- | --- |
| Ver áreas, aforo, escenarios y conteos | `view` |
| Dibujar o editar áreas (es geometría del plano) | `write` |
| Registrar conteos de ocupación | `write` |
| Crear y editar escenarios en borrador | `write` |
| Activar o cerrar escenarios | `manage` |
| Fijar o corregir aforo máximo documentado | `manage` |
| Anular un conteo (con motivo) | `manage` |
| Eliminar un escenario cerrado | `own` |
| Reindexar áreas de todo un proyecto | `manage` |

Nada nuevo que inventar: se usan las cuatro capacidades existentes
(`Membership.php:35-40`).

### 10.7 Conservación e históricos

- `VersionRetention` (1.18.0) poda **versiones del plano**, no datos de aforo. Un
  área borrada hace dos años debe seguir teniendo su aforo si se podó su versión:
  por eso `floor_spaces.active = 0` en vez de `DELETE`.
- Los conteos y las capacidades no se podan (son pequeños y son evidencia).
- Si algún día se podan, la política debe ser **por antigüedad declarada**, nunca
  automática.

---

## 11. Fase 8 · Riesgos

Probabilidad e impacto en una escala de tres (bajo/medio/alto).

| # | Riesgo | Prob. | Impacto | Mitigación | Detector |
| --- | --- | --- | --- | --- | --- |
| R-01 | Cambio de unidad reinterpreta la geometría (D-02) | Alta | Alto | Reconversión obligatoria o confirmación con cifras; calibración invalidada | Test de ida y vuelta `cm→m→cm` |
| R-02 | Un plano existente se abre con otra escala | Media | Alto | Sin `calibration`, mismo comportamiento exacto; formato 4 intacto | Suite de compatibilidad con demo y 3 planos históricos |
| R-03 | La calibración da falsa confianza | Media | Alto | Se imprime «±X %» y «calibrada/declarada»; el pie nunca dice solo «1:100» | Test de pie con y sin calibración |
| R-04 | Áreas que se solapan duplican aforo | Media | Alto | Detección de solape + aviso + bandera `countable` | Test con dos rectángulos solapados |
| R-05 | Índice `floor_spaces` desviado del JSON | Media | Medio | Rebuild en la misma transacción; comando de verificación; `active` en vez de borrar | Verificación automática en la pantalla de respaldo |
| R-06 | Restaurar una versión vieja deja áreas sin geometría | Media | Medio | El aforo cuelga del id; las áreas ausentes se marcan inactivas, no se borran | Test: restaurar 2 versiones atrás y consultar aforo |
| R-07 | Sumas con datos incompletos tratadas como completas | Alta | Alto | Contrato `{known, unknown}` en todas las respuestas; UI «≥ N · M sin dato» | Test de agregación con 1 área sin aforo |
| R-08 | Se interpreta el aforo como dictamen legal | Media | Alto | `source_type`/`source_ref` obligatorios; aviso fijo; sin «certificado» | Revisión de textos + test de avisos |
| R-09 | Rendimiento al indexar planos grandes | Media | Medio | Índice incremental; reindexado perezoso; tope 200 áreas/piso | Medición con 1200 elementos + 200 áreas |
| R-10 | Concurrencia SQLite en conteos | Baja | Bajo | Append-only + escrituras cortas + `busy_timeout` existente | Prueba con dos clientes simultáneos |
| R-11 | Cliente nuevo contra servidor viejo rompe guardados (D-14) | Alta | Alto | Servidor primero; `schema.sql` y validador aceptan formato 5 antes de publicar el cliente | Prueba de orden de despliegue |
| R-12 | Peso del APK y del paquete | Baja | Bajo | Sin dependencias nuevas; todo es PHP/JS propio | `tests/php/package.mjs` |
| R-13 | Divergencia entre rejilla JS y PHP (D-17) | Media | Medio | Una sola implementación de referencia + test cruzado con plano patrón | Test cruzado celda a celda |
| R-14 | Podar versiones elimina la geometría de un área con historial | Baja | Medio | `floor_spaces.active` y aforo independientes de la versión; aviso en la poda | Test: podar y consultar aforo |
| R-15 | Migración 8–11 en instalación grande | Baja | Alto | Solo DDL aditivo; el relleno de `buildings` es un `INSERT … SELECT` acotado; índice fuera de la migración | Prueba de migración desde v7 con 300 pisos simulados |

---

## 12. Fase 9 · Plan de pruebas

Todo en las suites existentes (`tests/php/functional.mjs`, `tests/js/editor.mjs`,
nueva `tests/php/dimensional.mjs`), sin infraestructura nueva.

### 12.1 Unidades y calibración

| # | Caso | Aserción |
| --- | --- | --- |
| U-01 | `metersPerUnit` para `cm`, `m`, `mm` | 0,01 · 1 · 0,001 |
| U-02 | PHP y JS dan el mismo factor | Comparación tabla a tabla |
| U-03 | Calibrar 4,20 m sobre 418,6 u | `metersPerUnit ≈ 0,010034` (±1e-9) |
| U-04 | Factor fuera de 0,2×–5× | Rechazo con mensaje |
| U-05 | Cambiar unidad con reconversión | Distancia física idéntica antes y después |
| U-06 | Ida y vuelta `cm→m→cm` | Documento igual (tolerancia 0,01 u) |
| U-07 | Cambiar unidad de un plano calibrado | `stale = true` y aviso |
| U-08 | Plano sin calibración | Mismos números que la 1.18.0 (regresión) |

### 12.2 Superficies, perímetros y cotas

| # | Caso | Aserción |
| --- | --- | --- |
| S-01 | Rectángulo 400×300 u en cm | 12,00 m² y perímetro 14,00 m |
| S-02 | Polígono en L | Área = suma de rectángulos (±0,01 m²) |
| S-03 | Área con arco | Coincide con integración numérica de referencia (±0,5 %) |
| S-04 | Área con hueco | Resta correctamente |
| S-05 | Área abierta | No suma aforo y se marca |
| S-06 | Cota `auto` con arco | Usa longitud de arco, no la cuerda |
| S-07 | Cota `manual` que miente | Hallazgo `dimension_mismatch` |
| S-08 | Unidad `m` y `mm` | Mismas superficies reales que en `cm` |

### 12.3 SVG y papel

| # | Caso | Aserción |
| --- | --- | --- |
| G-01 | SVG a 1:100, 12 m | `width="120mm"` |
| G-02 | SVG a 1:50 | `240mm` |
| G-03 | `viewBox` intacto | El dibujo interno no cambia de coordenadas |
| G-04 | Escala que no cabe en A4 | Aviso y propuesta de escala natural |
| G-05 | Plano antiguo | Mismo SVG que la 1.18.0 (byte a byte salvo cabecera) |
| G-06 | Banda de datos a 1:100 | Alto proporcional, no se come el plano |
| G-07 | Escala gráfica | Presente y con la longitud correcta en mm |

### 12.4 Áreas y edificaciones

| # | Caso | Aserción |
| --- | --- | --- |
| A-01 | Dibujar área y guardar | Aparece en `floor_spaces` con la superficie |
| A-02 | Detectar recinto | El polígono propuesto encierra la celda clicada |
| A-03 | Mover un muro del borde | `geometry_hash` distinto → «recalcular» |
| A-04 | Borrar área del plano | `active = 0`, aforo intacto |
| A-05 | Restaurar versión anterior | Áreas y aforo coherentes |
| A-06 | Reindexar | Idempotente: dos pasadas dejan lo mismo |
| A-07 | Migración v7 → v11 | Una edificación por proyecto; ningún piso huérfano |
| A-08 | 200 áreas × 1200 elementos | Guardado por debajo de 2,5 MB y < 2 s |

### 12.5 Aforo

| # | Caso | Aserción |
| --- | --- | --- |
| F-01 | Área sin aforo | `known` no la cuenta; `unknown` sí |
| F-02 | B > A | Estado `excedido` y alerta |
| F-03 | A vencido | Alerta `af_aforo_vencido` |
| F-04 | Corrección de aforo | Nueva fila, anterior `superseded_by` |
| F-05 | Consulta histórica | «Aforo en marzo» devuelve el vigente entonces |
| F-06 | Piso = suma de áreas | Coincide con la suma manual |
| F-07 | Edificio = suma de pisos | Idem con 8 pisos |
| F-08 | Dos áreas solapadas | Aviso `af_solape` |
| F-09 | Permisos | `write` registra conteo; `viewer` recibe 422 |

### 12.6 Escenarios y ocupación

| # | Caso | Aserción |
| --- | --- | --- |
| E-01 | Crear escenario | Cero escrituras en `floors`/`floor_versions` (hash igual) |
| E-02 | Dos escenarios activos | Cada consulta dice cuál usa |
| E-03 | Cerrar escenario | Inmutable; duplicar crea uno nuevo |
| E-04 | Turnos | Franja vigente preseleccionada |
| E-05 | Evento con fecha pasada | Se marca `cerrado` perezosamente |
| E-06 | Conteo manual | Aparece en historial, suma a C |
| E-07 | Conteo fuera de ventana | Vuelve a «sin dato», no a cero |
| E-08 | Anular conteo | Requiere motivo; no se borra |
| E-09 | Simulacro | Guarda objetivo del auditor y real |
| E-10 | Offline | Todos los flujos sin red (`tests/js/offline.mjs`) |

---

## 13. Archivos afectados

### 13.1 Nuevos

| Archivo | Contenido |
| --- | --- |
| `app/Core/Units.php` | Autoridad única de unidades y calibración |
| `app/Services/SpaceIndex.php` | Extrae áreas del diseño, calcula superficies, sincroniza `floor_spaces` |
| `app/Services/Capacity.php` | Aforo documentado vigente, agregaciones con `{known, unknown}` |
| `app/Services/Occupancy.php` | Conteos, ventana de validez, agregación |
| `app/Services/Scenarios.php` | Escenarios, estados, simulación de aforo |
| `app/Services/EgressSnapshot.php` | Congela el informe del auditor al aprobar un escenario |
| `app/Controllers/SpaceController.php` | API de áreas y aforo por área |
| `app/Controllers/CapacityController.php` | Aforo máximo (alta, corrección, historial) |
| `app/Controllers/OccupancyController.php` | Conteos |
| `app/Controllers/ScenarioController.php` | Escenarios |
| `app/Controllers/BuildingController.php` | Edificaciones |
| `app/Views/buildings/*.php`, `app/Views/floors/capacity.php`, `app/Views/scenarios/*.php`, `app/Views/spaces/panel.php` | Pantallas |
| `assets/js/lib/units.js` | Espejo de `Units.php` |
| `assets/js/lib/plan-grid.js` | Rejilla compartida en cliente (detectar recinto) |
| `assets/js/lib/areas.js` | Geometría de áreas: cierre, shoelace, solapes |
| `assets/js/editor/areas.js` | Herramienta de área y modo aforo |
| `assets/js/editor/capacity.js` | Panel de aforo del cajón |
| `resources/space-uses.json` | Catálogo de usos y densidades de referencia |
| `tests/php/dimensional.mjs` | Unidades, superficies, SVG físico, migraciones |
| `tests/php/capacity.mjs` | Aforo, escenarios, conteos, permisos |
| `docs/DIMENSIONAL.md`, `docs/AFORO.md` | Manuales de usuario y método |

### 13.2 Modificados

| Archivo | Cambio |
| --- | --- |
| `assets/js/lib/model.js` | `unit` con reconversión, `calibration`, tipo `area`, `holes` |
| `assets/js/lib/geometry.js` | Delegar en `Units`; `polygonArea`, `polygonPerimeter`, `containsPoint` |
| `assets/js/lib/renderer.js` | Pintar áreas, cotas autocalculadas, capa de aforo |
| `assets/js/editor.js` | Herramienta área, modo aforo, selector de escenario |
| `assets/js/editor/inspector.js` | Sección Aforo; superficie y perímetro del área |
| `assets/js/editor/measure.js` | Rejilla y conversión compartidas |
| `assets/js/lib/mep.js` | `unitsToMeters` → `Units` |
| `app/Services/PlanAudit.php` | Conversión única; aceptar aforo de escenario |
| `app/Services/PlanGrid.php` | `cmPerUnit` → `Units::cmPerUnit` (sin cambiar el algoritmo) |
| `app/Services/MepCalculator.php` | Igual |
| `app/Services/SvgExporter.php` | Tamaño físico, capa de áreas, escala gráfica |
| `app/Services/PlanFooter.php` | Escala verificada, aforo del piso |
| `app/Services/DesignValidator.php` | Formato 5, `calibration`, `areas`, `holes` |
| `app/Models/Floor.php` | Sincronía de `floor_spaces` dentro de `saveDesign` |
| `app/Services/DemoSeeder.php` | Indexar áreas de la demo (D-13) |
| `app/Core/Migrations.php` | Pasos 8–11, `VERSION = 11` |
| `resources/schema.sql` | Tablas nuevas y `user_version = 11` |
| `app/Core/Application.php` | Rutas nuevas |
| `assets/css/app.css`, `assets/css/print.css` | Estilos de área, aforo y papel |
| `README.md`, `docs/ARQUITECTURA.md` | Documentar todo lo anterior |

---

## 14. Roadmap por etapas

Orden pensado para que **cada etapa deje la aplicación utilizable y en verde**.

| Etapa | Contenido | Depende de | Complejidad | Prioridad | Entregable |
| --- | --- | --- | --- | --- | --- |
| **0** | `Units.php` / `units.js`, sustituir los 6 conversores, reconversión al cambiar unidad, pruebas de ida y vuelta | — | **M** | **P0** | Sin cambio visible; una sola autoridad y D-02 cerrado |
| **1** | Calibración, cotas asociativas, SVG con tamaño físico, escala gráfica, `print.css` | 0 | **L** | **P0** | Planos que se pueden medir al imprimir |
| **2** | `buildings`, migración 8, tipo `area` en el documento, herramienta y detección de recinto, `floor_spaces` con sincronía | 0 | **XL** | **P0** | Áreas con superficie real y edificio |
| **3** | Aforo A (documentado) + C (conteos) con API, pantallas y permisos; agregaciones `{known, unknown}` | 2 | **L** | **P1** | Capacidad y ocupación por área, piso y edificio |
| **4** | Escenarios B, turnos, calendario, simulación de aforo, aprobación con informe congelado | 3 | **L** | **P1** | Eventos planificados sin tocar geometría |
| **5** | Modo aforo en el CAD, ficha de área en el inspector, resúmenes y alertas | 2, 3 | **M** | **P2** | Todo a la vista dentro del editor |
| **6** | Simulacros, `egress_checks` (ancho medido), puntos de reunión, comparación promesa/realidad | 4 | **M** | **P3** | Emergencias medidas, no supuestas |

Estimación de esfuerzo relativo (no fechas): etapa 0 ≈ 1 unidad; 1 ≈ 2; 2 ≈ 3;
3 ≈ 2; 4 ≈ 2; 5 ≈ 1; 6 ≈ 1,5.

**Por qué este orden:**

- La etapa 0 va primero porque **todo** depende de la conversión: si se construye
  aforo sobre seis conversores, se construye sobre seis verdades.
- La 2 antes que la 3 porque sin áreas identificadas no hay a quién asignar aforo.
- La 4 después de la 3 porque un escenario vacío no dice nada; con capacidad
  documentada ya se puede comparar.
- La 6 al final porque es la que más parámetros externos necesita (anchos medidos,
  norma configurada) y la que más fácil promete de más.

---

## 15. Criterios de aceptación

### Etapa 0 · Unidades

Estado al cerrar la etapa 0 (PR #56). El detalle está en
[MISION-002-CIERRE-ETAPA-0.md](MISION-002-CIERRE-ETAPA-0.md).

- [x] Existe una única función de conversión en PHP y una en JS; `grep` no encuentra
      divisiones por 100 sueltas fuera de ellas. — Las seis divisiones por 100 que quedan en
      `app/` fuera de `Units.php` convierten constantes de criterio declaradas en
      centímetros (radio de señal, ancho mínimo de vano) o, en las vistas, las
      muestran en metros; ninguna convierte la unidad del plano (DIMENSIONAL §3).
- [ ] `cm→m→cm` devuelve el mismo documento (tolerancia 0,01 u) en un plano con
      muros curvos, vías y redes. — **Pendiente por decisión**: la reconversión al
      cambiar de unidad no formaba parte de esta etapa (hallazgo P-01). Lo que sí
      está probado es que un plano guardado en `mm`, `cm` o `m` se abre con su
      unidad intacta y se mide igual.
- [ ] Cambiar de unidad con elementos exige confirmación que muestra las cifras. —
      **Pendiente**, junto con la reconversión.
- [x] Todos los planos de la demo y los históricos dan **los mismos** números de
      auditor, extintores y redes que la 1.18.0. — 6 405 valores y 4 SVG idénticos,
      con una excepción **autorizada y anunciada**: los tramos con arco pasan a
      medirse por la longitud del arco, no por la cuerda.
- [x] Unidad declarada: se conserva sin reinterpretar; una unidad fuera de `mm`,
      `cm` y `m` se rechaza en la puerta del documento en vez de caer a `cm`.
- [x] PHP y JavaScript convierten con la misma fórmula y la misma cifra: 18 casos de
      la tabla compartida comparados con igualdad estricta en las dos suites.
- [x] Golden de regresión capturado **antes** y **después** de consolidar los
      conversores, y regenerable con `node tests/php/golden.mjs 8.3 --write`.

### Etapa 1 · Dimensión real

- [ ] Calibrar con una distancia conocida cambia el resultado del auditor en la
      proporción declarada (test numérico).
- [ ] El SVG exportado a 1:100 de un plano de 12 m mide 120 mm de ancho.
- [ ] El pie distingue «calibrada ±X %» de «declarada, sin calibrar».
- [ ] Una cota `auto` coincide con la longitud real, arcos incluidos.
- [ ] Un plano sin calibrar produce el mismo SVG que antes (regresión).

### Etapa 2 · Edificios y áreas

- [ ] Cada piso pertenece a una edificación; ninguna instalación queda con pisos
      sin edificio tras la migración.
- [ ] Un área tiene superficie y perímetro calculados, no escritos a mano.
- [ ] El área está ligada a su geometría: si cambian los muros, se avisa.
- [ ] Borrar un área del plano no borra su aforo.
- [ ] Reindexar dos veces no cambia nada (idempotencia).

### Etapa 3 · Aforo

- [ ] El aforo máximo exige fuente, criterio, fecha y responsable.
- [ ] Un área sin aforo aparece como «sin documentar», nunca como 0.
- [ ] Las sumas indican cuántas áreas quedaron sin dato.
- [ ] El histórico permite responder «qué aforo había el 15 de marzo».
- [ ] Un lector no puede registrar conteos ni fijar aforo.

### Etapa 4 · Escenarios

- [ ] Crear, activar y cerrar un escenario no modifica ninguna versión del plano
      (hash del diseño idéntico antes y después).
- [ ] Dos escenarios activos conviven y la interfaz indica cuál se consulta.
- [ ] Un escenario cerrado no se puede editar; se duplica.
- [ ] Al aprobar, queda congelado el informe del auditor con el aforo usado.

### Etapa 5 · CAD

- [ ] Al seleccionar un área, el inspector muestra aforo máximo, estimado, real y
      alertas sin salir del editor.
- [ ] El modo aforo colorea las áreas por estado y atenúa el resto.
- [ ] Los resúmenes de piso y edificio cuadran con las sumas por área.

### Etapa 6 · Emergencias

- [ ] Un simulacro compara objetivo del auditor y tiempo real.
- [ ] El sistema **no** emite ningún texto que declare suficiencia de salidas.
- [ ] Con anchos medidos, el auditor compara medido contra requerido y lo dice.

---

## 16. Dependencias

| Dependencia | Estado | Nota |
| --- | --- | --- |
| Motor geométrico (`PlanGrid`) | **Listo** | Se reutiliza sin cambios |
| Longitud de arcos (`G.pathLength`) | **Listo** | Base de perímetros |
| Auditor (`PlanAudit`) | **Listo** | Base de la Fase 6 |
| Capacidades y roles | **Listo** | `Membership` |
| Migraciones con bitácora | **Listo** | Pasos 8–11 |
| Respaldo y verificación | **Listo** | Antes de cada etapa con datos |
| Catálogo de usos y densidades | **Nuevo** | `resources/space-uses.json`, editable |
| Norma aplicable | **Externo** | Debe aportarla el usuario; el sistema solo cita |
| Anchos medidos en sitio | **Futuro (etapa 6)** | Sin esto, la Fase 6 es aproximada y así se dirá |

---

## 17. Lo que no pude verificar

Para que no se lea como certeza:

1. **Exactitud de los cálculos existentes.** El golden de la etapa 0 fija que las
   cifras **no cambien**, no que sean correctas. No verifiqué numéricamente
   `PlanAudit`, `ExtinguisherCoverage` ni `MepCalculator` contra casos de
   referencia; solo leí su lógica. La propuesta **no** depende de que sean exactos,
   pero si tienen errores, el aforo heredará el error de medición de áreas.
2. **Rendimiento real** con 1200 elementos y 200 áreas: no lo medí. La estimación
   de la etapa 2 es una hipótesis que hay que comprobar antes de cerrarla.
3. **Comportamiento del APK y del escritorio** con las tablas nuevas: no ejecuté
   ninguna migración (prohibido por la misión). Se deduce del código, no se probó.
4. **Solape de polígonos**: el algoritmo de recorte está propuesto, no elegido.
   Puede que convenga una comprobación aproximada por rejilla (más barata) en vez
   de un recorte exacto.
5. **Norma aplicable al aforo**: no cito ninguna resolución como criterio. Los
   valores de `audit-criteria.json` son referencias configurables y así deben
   presentarse.
6. **Accesibilidad** de las pantallas nuevas: no evaluada.
7. **Sincronía híbrida**: solo se dejan preparadas las condiciones (ids, `rev`,
   append-only). El protocolo no está diseñado.

---

## 18. Siguiente paso

Necesito de ti:

1. **Las cuatro decisiones** de §1.3 (DEC-1 a DEC-4), o un «adelante con tu
   recomendación».
2. Si la **etapa 0** (unidades, sin cambio visible) se implementa ya, porque es la
   que habilita todo lo demás y no cambia la cara del producto.
3. Confirmación de si el **modo aforo** debe convivir con el cajón *Revisión*
   existente o ser un cajón aparte.

Con eso preparo el issue de la etapa 0 con los criterios de aceptación de §15 y
empiezo por lo que no rompe nada.
