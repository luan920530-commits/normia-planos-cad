# Muros curvos, vías y andenes

Esta guía describe lo que cambia en la versión **1.11.0**: los trazos pueden
combarse con **arcos de tres puntos** y el plano gana un **entorno
esquemático** (vías vehiculares, andenes, pasos cebra, parqueaderos y límites de
predio). Todo lo que se dibuja aquí sirve para **comunicar** una planta de
emergencia, no para replantear obra.

> **Aviso esquemático.** Las vías, los andenes y los parqueaderos son
> **referencias gráficas**. No son levantamientos topográficos, no cumplen por sí
> solos con los perfiles de la INVÍAS, el POT del municipio ni la normativa de
> accesibilidad, y sus medidas se declaran a mano: verifícalas en sitio antes de
> usarlas en un trámite, en un diseño geométrico o en una licencia. Normia no
> certifica cumplimiento legal de ninguna clase.

---

## 1. Muros curvos: arco de tres puntos

Un muro (`wall`) o cualquier trazo curvo se guarda como una polilínea de
vértices más una lista de **arcos de tres puntos**. Cada arco se define por:

| Punto | Significado |
| --- | --- |
| Inicio | El vértice `i` del trazo. |
| Paso (`through`) | Un punto intermedio por el que debe pasar la curva. Es el que se arrastra con el ratón. |
| Fin | El vértice `i + 1` del trazo. |

De esos tres puntos salen el centro, el radio, el barrido y la flecha. No se usan
curvas Bézier: el arco es una circunferencia real, de modo que el radio y la
flecha que muestra el inspector son medibles y se pueden anotar en obra.

### Cómo se traza

1. Dibuja el muro como siempre (`M`): dos clics o un arrastre.
2. Selecciona el muro. En el centro de cada tramo aparece un **rombo**.
3. Arrastra el rombo hacia el lado al que quieres que el muro se combe. El muro
   se convierte en arco en cuanto el punto de paso deja de ser colineal.
4. Ajusta el resultado en el inspector, sección **Curvas del trazo**:
   - **Radio**: al subirlo el arco se aplana; al bajarlo se cierra.
   - **Flecha**: distancia entre la cuerda y el punto más alto del arco.
   - **Enderezar tramo** / **Enderezar todo el trazo**: vuelve a la polilínea.

El **rombo naranja** indica un tramo que ya está curvado; el **rombo blanco**, un
tramo recto disponible para combarse. Ambos llevan su propia descripción
accesible (`<title>`).

### Edición de vértices

| Acción | Resultado |
| --- | --- |
| Arrastrar un vértice | Mueve solo ese vértice; los tramos vecinos se adaptan. |
| `Alt` + arrastrar un vértice | Mueve el vértice **llevándose el punto de paso** de los dos tramos contiguos: la comba viaja con el vértice en vez de recomponerse contra un punto que se quedó atrás. |
| Doble clic sobre el trazo | Añade un vértice en el punto más cercano del trazo real. Si caes sobre un arco, el arco **se parte en dos** y el vértice nuevo queda sobre la circunferencia. |
| `Alt` + clic en un vértice | Elimina el vértice; los dos tramos que se unen quedan rectos. Un `Alt` que no llega a arrastrar solo borra. |
| Supr | Elimina el elemento seleccionado. |

Cada arrastre completo (soltar el ratón) cuenta como **un solo paso** de
deshacer, también cuando el arrastre comba un muro o mueve un vértice.

### Límites

- **40 vértices** por trazo, en el cliente y en el servidor.
- **Radio mínimo**: la mitad de la cuerda, que equivale a una semicircunferencia.
  Por eso el inspector nunca acepta un radio menor que `cuerda / 2`. Un arco
  mayor que media circunferencia no se puede representar con el flag de SVG.
- **Flecha mínima práctica**: 0,05 unidades. Por debajo el tramo se considera
  recto y la curva se descarta, para que un plano sin curvas se guarde igual que
  en la 1.10.0.
- La **caja** del elemento se recalcula con los límites reales del aplanado: la
  selección abraza el bombeo del arco y no solo los vértices.

### Aplanado único

El servidor y el navegador comparten la misma tolerancia (`0,5 cm` con el plano en
centímetros, `0,005 m` en metros, `5 mm` en milímetros). El aplanado se aplica
igual en:

- el trazado del lienzo y la exportación SVG (`A` en el `d`);
- la prueba de impacto y la caja de selección;
- la medición de rutas, el pliego y las redes;
- el auditor de recorridos (`PlanAudit`) y la cobertura de extintores
  (`ExtinguisherCoverage`);
- la cuadrícula de evacuación (`PlanGrid`), que decide qué celdas bloquea un muro
  y cuáles son exterior.

La misma rutina vive en `assets/js/lib/geometry.js` (`flattenPath`) y en
`app/Services/PathGeometry.php` (`flatten`). Si cambias una, cambia la otra y
vuelve a correr las dos suites.

### Puertas y portones sobre curvas

Las puertas se ubican por **longitud de arco**: al soltarlas cerca de un muro
curvo, el eje de la puerta se apoya en la circunferencia, no en la cuerda. El
mismo criterio se usa para el recorrido de evacuación: `isExit` sobre un muro
curvo cuenta sobre la geometría aplanada.

---

## 2. Vías, andenes y entorno

Cinco tipos nuevos, todos **esquemáticos**:

| Tipo | Atajo | Cómo se dibuja | Datos propios |
| --- | --- | --- | --- |
| `road` — vía vehicular | `A` | Arrastre de un extremo al otro | `section` (sección tipo: carriles, separador, berma, ciclorruta y andenes), `junction` (glorieta o intersección), `widthM` (0,8–46 m, derivado de la sección), `lanes` (1–6), `label` |
| `sidewalk` — andén | `S` | Arrastre | `widthM` (0,8–30 m, por defecto 2 m), `label` |
| `crosswalk` — paso cebra | `C` | Arrastre (caja) | Color y grosor de las franjas |
| `parking` — parqueadero | `Q` | Arrastre (caja) | Filas de puestos de **2,50 × 5,00 m**; la etiqueta dice cuántos caben |
| `property` — límite de predio | `I` | Arrastre | Línea y punto, con etiqueta «Límite de predio» |

- El ancho de la banda se dibuja con la unidad del plano y la escala declarada
  (6 m en un plano 1:100 son 600 unidades de lienzo). Es una **representación**
  del ancho, no una cota.
- Las vías y los andenes admiten curvas igual que los muros: el rombo del tramo
  funciona sobre ellos.
- `parking` dibuja los puestos a escala 2,50 × 5,00 m y los cuenta en la etiqueta.
  Es una referencia de dimensionamiento habitual, no una norma de parqueaderos.

### Sección tipo: de la banda gris al corredor

Toda vía nueva nace con una sección tipo mínima (2 carriles de 3 m) y se ajusta
desde el inspector, sección **Vía y andén**:

| Medida | Límites | Se dibuja como |
| --- | --- | --- |
| Carriles | 1–6 | Líneas discontinuas entre carriles, a escala de 2,5 m por tramo |
| Ancho de carril | 2,5–4 m | Ancho de cada franja de calzada |
| Separador | 0–4 m | Banda clara con doble línea; en 0 el eje va discontinuo |
| Berma | 0–2 m | Línea interior a cada lado de la calzada |
| Ciclorruta | 0–3 m | Banda verde pegada al bordillo, con línea discontinua |
| Andén | 0–4 m | Banda gris fuera de la calzada, con su borde |

- El **ancho total** no se escribe a mano: es la suma del reparto
  (`lanes·laneM + medianM + 2·shoulderM + 2·bikeM + 2·sidewalkM`) y el inspector
  lo muestra bajo el perfil. El rótulo del plano repite «N carriles · X,X m».
- Las **flechas de sentido** van al 45 % de opacidad, en dos posiciones del
  trazo, y apuntan en sentidos opuestos en cada calzada: los carriles derechos
  en un sentido y los izquierdos en el contrario.
- El **perfil transversal** se dibuja a escala en el inspector (de andén a
  andén) con sus cotas y el aviso de que es esquemático.
- **Siete secciones de obra** en un clic: vía local, avenida, corredor con
  ciclorruta, vía rural, glorieta, intersección en T e intersección en cruz.
- **Insertar corredor de ejemplo** (menú de la baldosa de vías) crea en una sola
  acción de deshacer: avenida con sección, dos andenes, paso cebra, glorieta,
  dos señales y una ruta peatonal, todo seleccionado y ajustado al lienzo.
  El corredor se dimensiona con el alto del papel: en un A4 a 1:100 sale una
  vía de **5,3 m** (dos carriles de 2,65 m) con andenes de 1 m y una glorieta de
  **7,3 m** de diámetro (isla de 1 m). Si el lienzo mide menos de 7 m de alto, el
  corredor se inserta **sin glorieta** y se avisa; no se dibuja un anillo que no
  corresponde con sus medidas. El inspector avisa también cuando la caja de una
  glorieta es menor que su isla más el anillo.

### Glorietas e intersecciones

- `junction.kind = "roundabout"` dibuja un **anillo** con isla al centro, líneas
  de carril en arco y brazos recortados al marco del elemento. `legs` (3–5) fija
  los accesos e `islandM` el radio de la isla.
- `tee` y `cross` dibujan la unión de dos calzadas con líneas de carril y cebras
  en cada brazo.
- La **caja del elemento** manda en el tamaño del cruce (siempre cuadrada y
  ajustada al lienzo); la **sección** manda en el ancho de la calzada.
- El rótulo dice «N accesos · isla X m» o «Intersección en T/cruz · N accesos».
- Un cruce **exige** sección tipo: sin ella el servidor responde `422`.

### Cómo entran en el auditor y la cuadrícula

La regla es una sola: **las vías no bloquean, los muros sí.**

| Elemento | ¿Bloquea el tránsito? | ¿Cuenta como exterior? |
| --- | --- | --- |
| `wall` (recto o curvo) | Sí | Solo si queda fuera del recinto |
| `road`, `sidewalk`, `crosswalk`, `parking`, `property` | **No** | **Sí** |
| `door*`, `route`, `text`, `dimension`, muebles, señales | No | No |

Consecuencias en `PlanGrid` y en el auditor:

- `exteriorAreaM2` suma las celdas marcadas como exterior por vías, andenes,
  cebras, parqueaderos y linderos, siempre que no estén bloqueadas por un muro.
- `freeAreaM2` (área útil) **descuenta** esas celdas: una vía no es área de
  trabajo del piso.
- El descarte de exterior sigue vigente: si las marcas de exterior no llegan al
  20 % del área interior útil, se descartan para no ensuciar el cálculo.
- `unreachableAreaM2` no aumenta por una vía; sí por un muro recto o curvo en el
  mismo sitio. La prueba de regresión del servidor compara ambos casos.

---

## 3. Formato de plano v3 y v4

Con curvas, el documento sube a `format: 3`:

```json
{
  "format": 3,
  "elements": [
    {
      "id": "muro_curvo",
      "type": "wall",
      "layerId": "capa_planta",
      "x": 100, "y": 300, "w": 240, "h": 100,
      "points": [{ "x": 0, "y": 100 }, { "x": 240, "y": 100 }],
      "curves": [{ "kind": "arc", "through": { "x": 120, "y": 0 } }, null]
    }
  ]
}
```

- `curves` está **alineado a `points`**: `curves[i]` describe el tramo entre
  `points[i]` y `points[i + 1]`. El último hueco siempre es `null`.
- `through` va en **coordenadas locales** a la caja, igual que `points`.
- Solo se admite `kind: "arc"`. Una curva en un tipo que no es de trazo se
  rechaza con `422`.

### Sin curvas, todo igual

Si ningún elemento trae curvas, el documento se guarda con `format: 2` y el SVG
sale **igual** que en la 1.10.0: los trazos siguen siendo `<polyline>`, sin
`<path>` ni atributos nuevos. La suite del navegador compara el marcado de un
muro recto antes y después de combarlo y enderezarlo, y exige que sea idéntico.

### Degradación

- Un plano **v2** (sin curvas) se abre sin cambios en la 1.11.0.
- Un plano **v3** abierto en la **1.10.0** se ve con los tramos **rectos**: esa
  versión ignora la clave `curves` y normaliza a `format: 2`. No se pierde nada
  más, pero las curvas no se recuperan al volver a guardar desde la 1.10.0.
- Con **sección tipo** el documento sube a `format: 4` (ver
  [`docs/FORMATO-PLANO.md`](FORMATO-PLANO.md#sección-tipo-y-cruces-de-la-vía-formato-4)).
- El servidor acepta `format: 2`, `3` y `4`; cualquier otro valor responde
  `422`.

---

## 4. Accesibilidad y rendimiento

- Los tiradores (vértices y rombos) tienen `<title>` descriptivo y se dibujan a
  tamaño constante en píxeles, independiente del zoom.
- Los rombos aparecen solo con la herramienta **Seleccionar** y un trazo
  seleccionado; no tapan el dibujo fuera de contexto.
- El aplanado está limitado a **720 cuerdas** por arco. Un arco de 40 vértices
  muy cerrados no dispara el costo del render ni del auditor.
- Los planes con animaciones respetan `prefers-reduced-motion`.

---

## 5. Verificación

```bash
node tests/php/lint.mjs 8.3        # 64 archivos PHP sin errores
node tests/js/lint.mjs             # 51 archivos JS sin errores
node tests/php/functional.mjs 8.3  # servidor: curvas, vías, auditor, SVG
node tests/js/editor.mjs 8.3       # navegador: rombo, radio, flecha, degradación
node tests/js/pages.mjs 8.3        # páginas y consola del navegador
```

Comprobaciones que cubren esta entrega:

- el muro curvo separa recintos en el auditor y la cobertura (tolerancia de
  aplanado de 2 cm);
- la puerta se apoya en el arco y no en la cuerda;
- deshacer devuelve el muro a recto en **un** paso;
- enderezar deja el marcado idéntico al de antes de combar;
- una vía no deja área inalcanzable y un muro recto en el mismo sitio sí;
- un `curves` desalineado, un `kind` desconocido, curvas en una puerta o un
  `format: 5` responden `422`;
- la sección tipo se guarda en formato 4, deriva el ancho (2 carriles de 3 m,
  separador de 2 m, bermas de 0,5 m, ciclorruta de 1,8 m y andén de 1 m → 14,6 m)
  y la glorieta llega al SVG como anillo con su isla y sus accesos;
- un `laneM` fuera de rango, una clave desconocida en la sección, una glorieta
  sin sección y un `kind` de cruce desconocido responden `422`.

---

## 6. Lo que esta entrega **no** hace

- No calcula radios de giro vehiculares, sobreanchos, peraltes ni capacidad vial.
- No valida accesibilidad (anchos de andén, rampas, franjas de advertencia) ni
  perfiles de INVÍAS, ni la clasificación del suelo del POT.
- No reemplaza un levantamiento topográfico ni un estudio de tránsito.
- No convierte a DWG/DXF ni exporta curvas a otros formatos vectoriales.
- No firma, no certifica y no radica nada ante una autoridad.

Los planos son **esquemáticos**: la escala es declarada, las medidas se
verifican en sitio y la responsabilidad del diseño sigue siendo del profesional
competente.
