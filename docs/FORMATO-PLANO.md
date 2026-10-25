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
| `color` | color | Uno de los 28 de la paleta (las señales ISO usan el color de su familia). |
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

Los tipos con trazo guardan `points` **en coordenadas locales** a la caja (`0..w`, `0..h`). Mover o escalar la caja transforma el trazo de forma proporcional.

### Señales y equipos

- Señales: `iso_<código en minúsculas>`, por ejemplo `iso_e002` (salida de emergencia) o `iso_f001` (extintor). Se validan contra `resources/iso7010-catalog.json`.
- Equipos: clave del catálogo `cad_*`, por ejemplo `cad_desk` o `cad_stairs_straight`. Se validan contra `resources/cad-objects.json`.
- Ambos se dibujan insertando el SVG del catálogo como símbolo saneado, con tamaño cuadrado por defecto (la señal mide 64×64 unidades por defecto).
- El catálogo de equipos tiene 90 objetos en 15 familias (`furniture`, `sanitary`, `kitchen`, `industrial`, `vehicles`, `vertical`, `restaurant`, `warehouse`, `retail`, `hospital`, `textile`, `grill`, `supermarket`, `residential`, `sports`). Algunos objetos traen su propio `color` (por ejemplo el agua de piscinas, `#0891b2`); el resto hereda el color del elemento.

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
