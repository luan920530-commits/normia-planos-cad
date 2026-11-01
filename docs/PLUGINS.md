# Complementos (plugins) de Normia Planos CAD

Un **complemento** es un paquete de datos que añade señales de señalización y/u
objetos de equipamiento CAD a la biblioteca del editor, sin tocar el programa.
Se instala desde la pantalla **Complementos**, se activa o desactiva cuando se
quiera y se puede borrar sin reinstalar nada.

La misma guía está dentro de la aplicación, con los formularios al lado:
`index.php?r=plugins/manual` (menú **Complementos › Cómo crear un complemento**).

> **Decisión de diseño: un complemento no ejecuta código.** No lleva PHP, ni
> JavaScript, ni plantillas, ni consultas. Solo declara señales, equipos,
> familias y dibujos. Por eso se puede instalar sin revisar código: no lo hay.
> Un complemento no puede leer la base de datos, la sesión, la configuración ni
> los planos.

---

## 1. Qué puede y qué no puede llevar

| Sí | No |
| --- | --- |
| Señales nuevas con su pictograma SVG | Código PHP, JS o plantillas |
| Equipos u objetos CAD vistos en planta | Acceso a la base de datos o a los planos |
| Familias propias con su color | Peticiones a internet o a servicios externos |
| Sinónimos para el buscador de la biblioteca | Cambios en el comportamiento del editor |

---

## 2. Dónde vive

- Archivo: `storage/plugins/<id>/plugin.json` dentro de los **datos** de la
  instalación (en el escritorio, la carpeta de datos del usuario; en el APK, los
  datos del teléfono).
- Estado (activo/desactivado): tabla `plugins` de la base SQLite
  (`user_version = 5`).
- Nunca viaja dentro del ZIP de la aplicación: se instala en cada equipo.

---

## 3. Formato del archivo

Se llama `plugin.json`. También se acepta un `.zip` con `plugin.json` en la raíz
y los `.svg` al lado (se citan con `svg_file`). Límite: **4 MB** por archivo y
**400 elementos** (señales + equipos) por complemento.

```json
{
  "api": 1,
  "id": "acme-senalizacion",
  "name": "Señalización ACME",
  "version": "1.0.0",
  "author": "ACME SST",
  "description": "Señales propias del laboratorio.",
  "license": "GPL-3.0",
  "categories": {
    "laboratorio": {
      "label": "Laboratorio y sustancias",
      "short": "Laboratorio",
      "description": "Señales propias de un laboratorio químico.",
      "color": "#7c3aed"
    }
  },
  "signs": [
    {
      "id": "ducha_emergencia",
      "name": "Ducha de emergencia",
      "category": "laboratorio",
      "description": "Ducha para enjuague tras contacto con sustancias.",
      "aliases": ["ducha", "enjuague", "derrame"],
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\">…</svg>"
    }
  ]
}
```

### Campos del manifiesto

| Campo | Obligatorio | Regla |
| --- | --- | --- |
| `api` | sí | `1` es la única versión que entiende esta versión de la app. |
| `id` | sí | 3–32 caracteres: `^[a-z][a-z0-9-]*$`. |
| `name` | sí | Hasta 80 caracteres. |
| `version` | sí | Tipo `1.0.0` (semver simple). |
| `author` | sí | Hasta 80 caracteres. |
| `description` | no | Hasta 600 caracteres. |
| `license` | no | Hasta 80 caracteres. |
| `categories` | no | Familias nuevas; `label`, `short`, `description`, `color` `#rrggbb`. |
| `signs` | uno de los dos | Al menos una señal o un equipo. |
| `cad` | uno de los dos | Ver más abajo. |

Ningún texto puede contener `<` ni `>`: la plataforma los muestra como texto y
no los interpreta como HTML.

### Señales (`signs`)

| Campo | Obligatorio | Regla |
| --- | --- | --- |
| `id` | sí | `^[a-z][a-z0-9_]{1,40}$`, único dentro del complemento. |
| `name` | sí | Hasta 80 caracteres. |
| `category` | sí | Una familia del catálogo o declarada en `categories`. |
| `description` | sí | Hasta 300 caracteres. |
| `aliases` | no | Hasta 12 sinónimos de 40 caracteres. |
| `svg` / `svg_file` | sí | SVG incrustado o nombre del archivo dentro del `.zip`. |

Código interno: `PLG_<COMPLEMENTO>_<SEÑAL>`; tipo en el editor:
`plg_<complemento>_<señal>`. El prefijo es exclusivo: no choca con las 332
señales ISO 7010 ni con las 63 señales propias (`SVC_…`).

### Equipos CAD (`cad`)

| Campo | Obligatorio | Regla |
| --- | --- | --- |
| `id` | sí | `^[a-z0-9][a-z0-9_]{1,32}$`. |
| `name` | sí | Hasta 80 caracteres. |
| `category` | sí | Familia de equipos (se crea si no existe). |
| `description` | sí | Hasta 300 caracteres. |
| `color` | no | `#rrggbb`; por defecto `#334155`. |
| `svg` / `svg_file` | sí | Igual que en las señales. |

Código interno: `cad_<complemento>_<equipo>`. El tamaño se ajusta en el
inspector, así que el dibujo debe ser esquemático y sin cotas.

---

## 4. Reglas del SVG

1. Un único elemento `<svg>` con `viewBox` (cuadrado para señales: `0 0 100 100`).
2. Entre 40 bytes y 400 KB. Es un pictograma, no una foto.
3. Prohibido: `<script>`, `<foreignObject>`, `<style>`, `<image>`, `<iframe>`,
   `<object>`, `<embed>`, `<audio>`, `<video>`, manejadores `on*`, `href`
   externos, `url(http…)`, `data:`, `javascript:`, `<!ENTITY>`, `<!DOCTYPE>` y
   `<?xml-stylesheet?>`.
4. Los colores van en atributos (`fill`, `stroke`). Nada de enlaces externos: la
   aplicación es local y no debe pedir recursos a internet.
5. El borde de la familia lo pinta la plataforma; el dibujo puede usar blanco y
   su propio color.

Se valida con `LibraryRepository::safeSvg()` antes de guardar. Si un solo SVG no
pasa el filtro, **no se instala nada**: nunca queda un complemento a medias.

---

## 5. Instalar, probar y desinstalar

1. Descarga una plantilla desde **Complementos** (señalización o equipos CAD).
2. Cambia `id`, `name`, `author`, los elementos y los dibujos. Guarda el archivo.
3. Súbelo en **Complementos › Instalar**. Si algo no cuadra, la pantalla dice qué
   campo corregir.
4. Abre un plano: las señales están en **Biblioteca visual**, con su familia, su
   color y su buscador (incluidos los sinónimos).
5. Inserta una, guarda y exporta: el dibujo viaja en el plano, en el SVG
   exportado y en el PNG/impresión.
6. Desactiva el complemento: el elemento sigue en el plano guardado, pero deja
   de ofrecerse y se dibuja sin pictograma hasta reactivarlo.
7. Cambia `version` y vuelve a instalarlo: se actualiza conservando el estado.

El estado vive en la base de datos; el manifiesto, en `storage/plugins/<id>/`.
Borrar el complemento no modifica los planos ya guardados.

---

## 6. Límites de seguridad

| Límite | Valor |
| --- | --- |
| Archivo del complemento | 4 MB |
| Elementos por complemento | 400 |
| SVG por elemento | 40 bytes – 400 KB |
| Sinónimos por señal | 12 |
| Versión de API | 1 |

- Instalación atómica: se escribe en `storage/plugins/.instalando-<id>` y solo se
  reemplaza la carpeta definitiva si todo el manifiesto es válido.
- Los identificadores se filtran con expresiones regulares y los textos se
  acotan; nunca se evalúan.
- Los códigos de señal y de equipo llevan prefijo propio, así que no pueden
  suplantar un código ISO, `SVC_` o un objeto del catálogo base.

---

## 7. Cómo encaja en el código

| Archivo | Responsabilidad |
| --- | --- |
| `app/Services/PluginManager.php` | Leer, validar, instalar, activar y borrar. Nada más. |
| `app/Services/LibraryRepository.php` | Funde los complementos activos con los catálogos base (`loadSigns`/`loadCad`). |
| `app/Controllers/PluginController.php` | Pantalla, instalación, descarga de plantillas y manual. |
| `app/Views/plugins/{index,manual}.php` | Interfaz en español. |
| `resources/plugins-ejemplo/*.plugin.json` | Las dos plantillas descargables. |

En el navegador, el mapeo de tipos vive en `assets/js/lib/model.js`
(`signCodeForType`, `typeForSignCode`), `assets/js/lib/renderer.js`
(`signTypeToCode`) y `assets/js/editor/library.js` (`buildItems`).

---

## 8. Publicar y licenciar

- Comparte el `plugin.json` o el `.zip` como prefieras; no hace falta servidor.
- Escribe en `license` la licencia real del paquete.
- Si usas pictogramas de terceros, indica autor y licencia, igual que hace esta
  aplicación con ISO 7010 (MIT de `@iso-safety-signs/core`, © Karl Norling) y con
  las atribuciones de Wikimedia Commons del archivo `NOTICE`.
- No publiques normas completas ni material con derechos: describe el dibujo, no
  copies la norma.
- Si el complemento describe elementos de seguridad, incluye el aviso de que es
  una referencia gráfica y que su ubicación debe verificarse en sitio.

**Aviso.** Esta herramienta no certifica planos ni señalización. Los elementos
que añade un complemento son referencias gráficas: su ubicación, sus medidas y la
norma aplicable se verifican en el sitio con una persona competente.
