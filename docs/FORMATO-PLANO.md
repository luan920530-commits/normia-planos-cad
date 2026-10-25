# Formato de plano (esquema v2)

Normia Planos CAD guarda cada piso como un documento JSON normalizado. El mismo documento se usa en la base de datos (`floors.design_json` y `floor_versions.design_json`), en la API del editor y en las exportaciones.

## Documento raíz

```json
{
  "format": 2,
  "canvas": {
    "width": 1123,
    "height": 794,
    "grid": 20,
    "unit": "cm",
    "scale": "1:100",
    "background": "#ffffff"
  },
  "layers": [
    { "id": "capa_planta", "name": "Planta", "visible": true, "locked": false },
    { "id": "capa_senalizacion", "name": "Señalización", "visible": true, "locked": false }
  ],
  "elements": [],
  "groups": []
}
```

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `format` | entero | Siempre `2` al guardar. |
| `canvas.width` / `canvas.height` | entero | 400–4000 / 300–3000. |
| `canvas.grid` | entero | 5–100. |
| `canvas.unit` | texto | `cm`, `m` o `mm`. |
| `canvas.scale` | texto | `1:<1–99999>`. Es una referencia declarada. |
| `canvas.background` | color | `#ffffff` o `#f8fafc`. |
| `layers` | arreglo | 1–24 capas; la primera es la capa inicial. |
| `elements` | arreglo | 0–1200 elementos. |
| `groups` | arreglo | 0–80 grupos con 2–80 miembros existentes. |

### Capas

```json
{ "id": "capa_equipos", "name": "Equipos", "visible": true, "locked": false }
```

- `id`: identificador estable, no vacío, sin límite estricto más allá de ser único en el piso.
- `name`: hasta 60 caracteres; se escapa al mostrarse.
- `visible: false` impide seleccionar y editar sus elementos.
- `locked: true` impide mover, borrar o modificar; bloquea también el cambio de capa.
- No se puede eliminar la última capa. Al eliminar una capa, sus elementos pasan a la primera capa restante.

## Elementos

Todos los elementos comparten:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | texto | `^[A-Za-z][A-Za-z0-9_-]{2,63}$`, único en el piso. |
| `type` | texto | Debe existir en el catálogo o ser una forma básica. |
| `layerId` | texto | Debe existir en `layers`. |
| `x`, `y` | número | Esquina superior izquierda de la caja, dentro del lienzo. |
| `w`, `h` | número | ≥ 2; no puede exceder el lienzo desde `x`/`y`. |
| `rotation` | número | 0–359. |
| `color` | color | Uno de los 29 de la paleta (las señales ISO usan el color de su familia). |
| `stroke` | número | 0–40. |
| `opacity` | número | 0.1–1. |
| `label` | texto | Hasta 240 caracteres, máximo 6 líneas, sin `<` ni `>`. |
| `locked` | booleano | Bloquea la edición de ese elemento. |

### Formas básicas

| `type` | Geometría | Campos propios |
| --- | --- | --- |
| `wall` | Trazo | `points` (2–40), `stroke` grueso. |
| `door` | Puerta de un batiente (90 × 90 por defecto) | `flipX` y `flipY` para cambiar el sentido de apertura. |
| `door_double` | Puerta de dos batientes (120 × 60) | `flipX` y `flipY`. |
| `door_garage` | Portón o reja de garaje (160 × 50) | `flipX` y `flipY`. |
| `route` | Ruta de evacuación | `points` (2–40), flechas. Un circuito cerrado repite el primer punto al final. |
| `text` | Texto | `fontSize` 8–160, `label` obligatoria. |
| `dimension` | Medida | `points` exactamente 2; `label` opcional. |
| `line` | Línea | `points` exactamente 2. |
| `rect` | Rectángulo | — |
| `ellipse` | Elipse | — |
| `pipe` | Tubería hidrosanitaria, de gas o de incendio | `network`, `diameter`, `material`, `slope` (0–15 %), `pressure` (0–5000 kPa) y `points` (2–40). |
| `conduit` | Tubería eléctrica de un circuito | `circuit` (1–12 caracteres `A-Z 0-9 . -`), `voltage`, `gauge`, `phases` (1 o 3) y `points` (2–40). |

Los tipos con trazo guardan `points` **en coordenadas locales** a la caja (`0..w`, `0..h`). Mover o escalar la caja transforma el trazo de forma proporcional.

### Señales y equipos

- Señales ISO 7010: `iso_<código en minúsculas>`, por ejemplo `iso_e002` (salida de emergencia) o `iso_f001` (extintor). Se validan contra `resources/iso7010-catalog.json`.
- Señales de orientación y servicios: `sig_<nombre>` → `SVC_<NOMBRE>`, por ejemplo `sig_wc_men` (baño de hombres) o `sig_cafeteria`. Se validan contra `resources/service-signs.json`; son complementarias, no ISO 7010.
- Equipos: clave del catálogo `cad_*`, por ejemplo `cad_desk` o `cad_stairs_straight`. Se validan contra `resources/cad-objects.json`.
- Ambos se dibujan insertando el SVG del catálogo como símbolo saneado, con tamaño cuadrado por defecto (la señal mide 64×64 unidades por defecto).
- Los trazos (`wall`, `route`, `line`, `dimension`) guardan `points` en coordenadas locales. Al editar un vértice el cliente reescribe la caja (`x`, `y`, `w`, `h`) con los límites reales y **disuelve la rotación en los puntos**, de modo que el servidor sigue recibiendo un documento válido sin cambios de esquema.
- El catálogo de equipos tiene 145 objetos en 18 familias (`furniture`, `sanitary`, `kitchen`, `industrial`, `vehicles`, `vertical`, `restaurant`, `warehouse`, `retail`, `hospital`, `textile`, `grill`, `supermarket`, `residential`, `sports`, `outdoor`, `electrico`, `hidraulico`). Algunos objetos traen su propio `color` (por ejemplo el agua de piscinas, `#0891b2`); el resto hereda el color del elemento.
- Los objetos de la familia `electrico` admiten además `circuit` y `load` (VA), y el editor los suma al cálculo del circuito.

### Redes técnicas (`pipe` y `conduit`)

```json
{ "id": "el_agua_1", "type": "pipe", "layerId": "capa_hidraulica", "x": 700, "y": 300, "w": 400, "h": 100, "rotation": 0,
  "color": "#0891b2", "stroke": 3.5, "opacity": 1, "label": "", "locked": false,
  "network": "agua_fria", "diameter": "3/4\"", "material": "pvc", "slope": 0, "pressure": 280,
  "points": [{ "x": 0, "y": 0 }, { "x": 400, "y": 100 }] }
```

- `network` pertenece a `resources/mep-networks.json`: `agua_fria`, `agua_caliente`, `gas`, `aguas_negras`, `aguas_lluvias`, `incendio`.
- `diameter` debe existir en `diameters`; `material`, en `materials`. Si la red es de gravedad (`aguas_negras`, `aguas_lluvias`), `slope` es la pendiente física declarada en % y se compara con `slopes` para avisar.
- `conduit` guarda `circuit`, `voltage` (de `electrical.voltages`), `gauge` (de `electrical.gauges`) y `phases`.
- El servidor **rechaza** redes, diámetros, materiales, tensiones, calibres o fases fuera del catálogo; los elementos que no son de red no pueden traer estos campos.
- La API `GET …/api/floors/{id}/mep` devuelve el resumen calculado (longitudes, cargas, breaker, calibre, caída de tensión) del último diseño guardado.

### Grupos

```json
{ "id": "grupo_puesto", "name": "Puesto de trabajo", "members": ["el_escritorio", "el_silla"] }
```

Los grupos no anidan. Al eliminar miembros, el grupo se disuelve si queda con menos de 2. Al agrupar se expanden los grupos previos para evitar anidamiento.

## Envoltura de exportación

`GET …/export/json` devuelve:

```json
{
  "application": "normia-planos-cad",
  "format": "normia-plan",
  "schema_version": 2,
  "exported_at": "2026-01-01T12:00:00+00:00",
  "project": { "name": "...", "site": "...", "workplace": "...", "responsible": "...", "notes": "..." },
  "floor": { "name": "Planta baja", "level": "Nivel 0" },
  "design": { "format": 2, "canvas": {}, "layers": [], "elements": [], "groups": [] },
  "attribution": "Normia Planos CAD · GPL-3.0 · pictogramas ISO 7010 con licencia MIT (ver NOTICE)"
}
```

La importación desde el editor acepta esta misma envoltura (usa `design`) y también un documento de diseño suelto.

## Importación heredada (formato 1)

La versión de referencia exportaba un JSON plano:

```json
{
  "format": 1,
  "tool": "wall",
  "elements": [
    { "id": "muro_1", "tool": "wall", "x": 10, "y": 20, "w": 200, "h": 10, "points": [{"x":0,"y":5},{"x":200,"y":5}] },
    { "id": "senal_1", "tool": "exit", "x": 300, "y": 200, "w": 64, "h": 64 },
    { "id": "ruta_1", "tool": "route", "x": 100, "y": 100, "w": 400, "h": 300, "points": [{"x":0,"y":0},{"x":400,"y":300}] }
  ]
}
```

Reglas de conversión:

| Heredado | Se convierte en |
| --- | --- |
| `tool: "wall"` | `type: "wall"` con `points` |
| `tool: "door"` | `type: "door"` |
| `tool: "route"` / `"path"` | `type: "route"` |
| `tool: "text"` | `type: "text"` |
| `tool: "measure"` / `"dimension"` | `type: "dimension"` |
| `tool: "line"`, `"rect"`, `"ellipse"` | mismo tipo |
| `exit`, `exit_sign`, `emergency_exit` | `iso_e002` |
| `extinguisher`, `fire_extinguisher` | `iso_f001` |
| `first_aid`, `first_aid_kit` | `iso_e003` |
| `alarm` | `iso_f005` |
| `assembly` | `iso_e007` |

Alias y equivalencias viven en `resources/sign-aliases.json`. Un archivo con cualquier herramienta desconocida, coordenada no finita, color fuera de la paleta, punto fuera de su caja o markup en etiquetas se rechaza **completo**: la importación es atómica.

## Saneado de los SVG de las bibliotecas

Los SVG de señalización y equipamiento se validan al cargar los catálogos. Se rechaza el catálogo si un SVG contiene `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, `<audio>`, `<video>`, `<image>`, `<style>`, atributos `on*`, `href`/`xlink:href` que no empiecen por `#`, `javascript:`/`vbscript:`/`data:`, `url()` remotos, `<!ENTITY`, `<!DOCTYPE` o `xml-stylesheet`.

Al exportar, los símbolos se incrustan con identificadores únicos por plano y sin referencias externas. La aplicación **no importa** SVG suministrados por el usuario: la importación de planos es solo JSON.

## Compatibilidad

- El editor normaliza siempre al cargar (`format: 2`), descarta tipos desconocidos y recorta valores fuera de rango.
- Los documentos guardados con el esquema actual no se modifican al exportar; el JSON es una copia íntegra del diseño normalizado.
- Si en el futuro cambia el esquema, `schema_version` permitirá migraciones explícitas; hoy solo existe la versión 2.
