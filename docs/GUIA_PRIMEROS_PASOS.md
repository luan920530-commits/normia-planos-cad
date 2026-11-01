# Guía de primeros pasos y buscador de herramientas

Dos cambios de la 1.12.0 que responden a la misma pregunta: «¿dónde está esta
herramienta?».

## La guía

`assets/js/editor/guide.js` es un cajón (`[data-drawer="guide"]`) que se abre una
vez por navegador la primera vez que se entra a un piso, salvo que el usuario
desactive la casilla de su pie. También se abre desde:

- el icono de la guía en la barra superior (`data-open-drawer="guide"`);
- la entrada «Guía de primeros pasos» de la paleta de herramientas;
- el enlace del cajón de **Atajos**.

### Los siete pasos

| # | Paso | Herramienta o cajón | Se marca cuando |
| --- | --- | --- | --- |
| 1 | Traza el primer muro | Muro (`M`) | el plano tiene al menos un muro |
| 2 | Abre un vano con una puerta | Puerta (`U`) | hay una puerta, puerta doble o portón |
| 3 | Dibuja la vía, el andén o el parqueadero | Vía vehicular (`A`) | hay vía, andén, paso cebra, parqueadero o lindero |
| 4 | Coloca señales y equipos | Biblioteca | hay una señal ISO 7010 o un equipo CAD |
| 5 | Marca la ruta de evacuación | Ruta (`E`) | hay al menos una ruta |
| 6 | Lee la revisión del plano | Cajón Revisión | el informe se generó de verdad (`Audit.report`) |
| 7 | Guarda una versión | Guardar | el piso tiene más de una versión |

El progreso **se deduce del modelo** (`app.model.design.elements`) y del estado
real de la app; no hay temporizadores ni «pasos completados» de mentira. Las dos
únicas marcas que no salen del plano —guía vista y revisión abierta— se guardan
en `localStorage` con las claves `normia.guia.visto` y `normia.guia.revision`.
«Reiniciar progreso» borra solo esas marcas: el plano no se toca.

### Ir a la herramienta

Cada paso tiene un botón que:

1. cierra la guía,
2. activa la herramienta real (`EditorApp.applyTool`) o abre el cajón,
3. **resalta el control** con la clase `is-guide-target` durante 2,6 s.

Si la herramienta vive dentro de un menú del rail, la guía **abre ese menú**
antes de resaltarla: quien no encontraba las vías ve la baldosa, no otra
explicación. Con `prefers-reduced-motion: reduce` el resaltado no parpadea.

### Accesibilidad

- El cajón hereda el comportamiento del resto: `Esc` cierra, el foco vuelve al
  botón que lo abrió y el fondo queda inerte tras el `backdrop`.
- La barra de progreso es `role="progressbar"` con `aria-valuenow` y
  `aria-valuemax` sincronizados.
- El estado de cada paso se lee en texto (`Hecho` / `Pendiente`), no solo por
  color, y el número del paso se sustituye por el icono de verificación.

## Dónde están las vías

La 1.11.0 introdujo `road`, `sidewalk`, `crosswalk`, `parking` y `property`,
pero quedaron dentro del menú «Línea, formas y entorno» y el buscador comparaba
el texto literal. Desde la 1.12.0:

- **Baldosa propia en el rail**: `[data-tool="road"]` con su chevrón
  (`data-road-menu`) y el menú `data-road-flyout` con las cinco herramientas.
  El menú de formas se queda con línea, rectángulo y elipse.
- **Atajos directos**: `A` vía, `S` andén, `C` paso cebra, `Q` parqueadero,
  `I` lindero.
- **Pista en el lienzo**: las cinco herramientas tienen su propio texto en
  `TYPE_HINTS`; antes mostraban la pista de «Seleccionar».
- **Corredor de ejemplo** (1.13.0): al final del menú de la baldosa de vías hay
  una entrada que inserta avenida con sección tipo, andenes, paso cebra,
  glorieta, dos señales y ruta peatonal en un solo paso. Sirve para ver de
  golpe cómo se relacionan las herramientas de vías y para ajustarlas después
  desde el inspector.

## El buscador

`assets/js/editor/toolsearch.js` expone `Normia.ToolSearch`:

```js
ToolSearch.normalize('Vía vehicular')   // «via vehicular»
ToolSearch.matches(choice, 'calle')     // true para la vía vehicular
```

- **Normalización**: minúsculas, sin tildes (`NFD` + marcas diacríticas) y sin
  signos. `anden` y `andén` son la misma búsqueda.
- **Sinónimos** por herramienta y por acción (`TERMS`): *calle*, *carrera*,
  *carretera*, *avenida*, *acera*, *parqueo*, *estacionamiento*, *cebra*,
  *lindero*, *guía*, *revisión*…
- **Coincidencia por palabras**: cada palabra buscada debe empezar alguna
  palabra del texto, así «via» encuentra «Vía vehicular» y «paso peatonal»
  encuentra el paso cebra, sin que «paso» encuentre cualquier cosa que lo
  contenga.
- **Sin resultados**: el mensaje propone palabras cercanas («vía», «andén»,
  «calle», «parqueo»).

## Pruebas

`tests/js/editor.mjs` cubre la guía y el buscador:

- apertura automática en el primer uso y desactivación recordada;
- siete pasos con estado y progreso derivados del plano;
- el botón de un paso activa la herramienta y resalta la baldosa del rail;
- reinicio de marcas sin tocar el plano, y marca del paso de revisión cuando el
  informe real se genera;
- búsquedas `calle`, `carretera`, `avenida`, `anden`, `andén`, `acera`,
  `parqueo`, `cebra`, `guia`, `revision` y `atajos`.

Las pruebas desactivan la apertura automática en `tests/js/boot.mjs` para que el
resto de la suite no arrastre un cajón abierto, y la activan a propósito en su
propio bloque.
