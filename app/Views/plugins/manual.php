<?php
$minimo = <<<'JSON'
{
  "api": 1,
  "id": "mi-complemento",
  "name": "Mi complemento",
  "version": "1.0.0",
  "author": "Tu nombre",
  "description": "Qué añade y para qué sirve.",
  "license": "GPL-3.0",
  "signs": [
    {
      "id": "punto_encuentro",
      "name": "Punto de encuentro",
      "category": "emergency",
      "description": "Sitio de reunión tras la evacuación.",
      "aliases": ["reunion", "evacuacion"],
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect x=\"2\" y=\"2\" width=\"96\" height=\"96\" rx=\"12\" fill=\"#237f52\"/><circle cx=\"50\" cy=\"38\" r=\"12\" fill=\"#fff\"/><path d=\"M50 52v28M34 66h32\" fill=\"none\" stroke=\"#fff\" stroke-width=\"8\" stroke-linecap=\"round\"/></svg>"
    }
  ]
}
JSON;

$conEquipos = <<<'JSON'
{
  "api": 1,
  "id": "mi-catalogo-cad",
  "name": "Equipos de mi empresa",
  "version": "0.1.0",
  "author": "Tu nombre",
  "description": "Objetos esquemáticos vistos en planta.",
  "license": "GPL-3.0",
  "cad": [
    {
      "id": "tanque_agua",
      "name": "Tanque de agua",
      "category": "hidraulico",
      "description": "Tanque elevado de 1000 L, vista en planta.",
      "color": "#005387",
      "svg_file": "tanque.svg"
    }
  ]
}
JSON;

$categorias = <<<'JSON'
"categories": {
  "laboratorio": {
    "label": "Laboratorio y sustancias",
    "short": "Laboratorio",
    "description": "Señales propias de un laboratorio químico.",
    "color": "#7c3aed"
  }
}
JSON;
?>
<section class="plugins-page plugins-manual">
  <header class="form-page-head">
    <a class="back-link" href="<?= e(url('plugins')) ?>"><svg class="icon"><use href="#i-chevron-left"></use></svg>Complementos</a>
    <span class="eyebrow">Manual del desarrollador</span>
    <h1>Cómo crear un complemento</h1>
    <p>Esta guía explica <strong>qué</strong> puede llevar un complemento, <strong>dónde</strong> se instala y se guarda,
      <strong>cuándo</strong> conviene hacer uno y <strong>cómo</strong> se escribe, se prueba y se publica. Está pensada
      para alguien que sepa editar un archivo de texto: no hace falta programar.</p>
    <p>La misma guía está en el repositorio, en <code>docs/PLUGINS.md</code>, para quien prefiera
      leerla o compartirla fuera de la aplicación.</p>
    <p class="plugins-links">
      <a class="button button-small button-ghost" href="<?= e(url('plugins/plantilla/senalizacion')) ?>"><svg class="icon"><use href="#i-download"></use></svg>Plantilla de señalización</a>
      <a class="button button-small button-ghost" href="<?= e(url('plugins/plantilla/cad')) ?>"><svg class="icon"><use href="#i-download"></use></svg>Plantilla de equipos CAD</a>
    </p>
  </header>

  <nav class="manual-toc panel-card" aria-label="Contenido del manual">
    <h2>Contenido</h2>
    <ol>
      <li><a href="#que-es">Qué es (y qué no es) un complemento</a></li>
      <li><a href="#cuando">Cuándo conviene crear uno</a></li>
      <li><a href="#donde">Dónde se instala y dónde se guarda</a></li>
      <li><a href="#estructura">Estructura del archivo</a></li>
      <li><a href="#senales">Señales de señalización</a></li>
      <li><a href="#equipos">Equipos CAD</a></li>
      <li><a href="#familias">Familias nuevas</a></li>
      <li><a href="#svg">Cómo debe ser el SVG</a></li>
      <li><a href="#probarlo">Cómo probarlo</a></li>
      <li><a href="#errores">Errores frecuentes</a></li>
      <li><a href="#publicar">Publicar y licenciar</a></li>
      <li><a href="#limites">Límites y seguridad</a></li>
    </ol>
  </nav>

  <section class="panel-card" id="que-es">
    <h2>1 · Qué es (y qué no es) un complemento</h2>
    <p>Un complemento es <strong>un paquete de datos</strong>, igual que un catálogo: un archivo
      <code>plugin.json</code> —solo o dentro de un <code>.zip</code>— que declara señales y/o equipos CAD con sus dibujos.
      La plataforma lo lee, lo valida, lo guarda en tus datos y lo suma a la biblioteca del editor.</p>
    <ul class="plugins-rules">
      <li><strong>Sí:</strong> más señales, más equipos, familias propias, sinónimos de búsqueda, colores, descripciones.</li>
      <li><strong>No:</strong> código PHP o JavaScript, plantillas, accesos a la base de datos, llamadas a internet,
        cambios en el comportamiento del editor. Eso mantiene el complemento seguro y predecible.</li>
    </ul>
  </section>

  <section class="panel-card" id="cuando">
    <h2>2 · Cuándo conviene crear uno</h2>
    <ul class="plugins-rules">
      <li>Tu empresa usa <strong>pictogramas propios</strong> que no están en ISO 7010 ni en las señales de servicios.</li>
      <li>Necesitas <strong>equipos específicos</strong> de tu sector (laboratorio, planta, bodega) que no están en el catálogo CAD.</li>
      <li>Quieres <strong>normalizar un paquete</strong> para varios planos y varios compañeros: se instala una vez y aparece en todos.</li>
      <li>Prefieres <strong>no tocar el programa</strong>: el complemento se activa, se desactiva y se borra sin reinstalar.</li>
    </ul>
    <p>Si solo necesitas mover o combinar elementos que ya existen, no hace falta un complemento.</p>
  </section>

  <section class="panel-card" id="donde">
    <h2>3 · Dónde se instala y dónde se guarda</h2>
    <p>Se instala desde <a href="<?= e(url('plugins')) ?>">Complementos</a>, con cualquier cuenta de la aplicación.
      No hay que copiar archivos a mano ni reiniciar nada.</p>
    <ul class="plugins-rules">
      <li><strong>En la web y en el escritorio:</strong> queda en <code>storage/plugins/&lt;id&gt;/plugin.json</code>, dentro de tus datos.</li>
      <li><strong>En el APK:</strong> viaja con tus datos del teléfono, así que sigue ahí al cerrar la app.</li>
      <li><strong>En los paquetes:</strong> los complementos no van dentro del ZIP de la aplicación; se instalan en cada equipo.</li>
      <li>El estado (activo o desactivado) se guarda en la base de datos, tabla <code>plugins</code>.</li>
    </ul>
  </section>

  <section class="panel-card" id="estructura">
    <h2>4 · Estructura del archivo</h2>
    <p>El archivo debe llamarse <code>plugin.json</code> y estar en la raíz del <code>.zip</code> si usas uno.</p>
    <div class="manual-table-wrap">
      <table class="manual-table">
        <thead><tr><th>Campo</th><th>Obligatorio</th><th>Qué es</th></tr></thead>
        <tbody>
          <tr><td><code>api</code></td><td>Sí</td><td>Versión del formato. Hoy: <strong><?= e((string) $apiVersion) ?></strong>.</td></tr>
          <tr><td><code>id</code></td><td>Sí</td><td>Identificador único del complemento: 3–32 caracteres, minúsculas, números y guiones. Ejemplo: <code>acme-senalizacion</code>.</td></tr>
          <tr><td><code>name</code></td><td>Sí</td><td>Nombre visible, hasta 80 caracteres.</td></tr>
          <tr><td><code>version</code></td><td>Sí</td><td>Versión del complemento, tipo <code>1.0.0</code>.</td></tr>
          <tr><td><code>author</code></td><td>Sí</td><td>Quién lo hizo, hasta 80 caracteres.</td></tr>
          <tr><td><code>description</code></td><td>No</td><td>Qué añade, hasta 600 caracteres.</td></tr>
          <tr><td><code>license</code></td><td>No</td><td>Licencia con la que lo compartes (por ejemplo GPL-3.0, CC BY-SA 4.0, propietaria).</td></tr>
          <tr><td><code>categories</code></td><td>No</td><td>Familias nuevas, si tus señales no encajan en una existente.</td></tr>
          <tr><td><code>signs</code></td><td>Uno de los dos</td><td>Lista de señales de señalización.</td></tr>
          <tr><td><code>cad</code></td><td>Uno de los dos</td><td>Lista de equipos u objetos vistos en planta.</td></tr>
        </tbody>
      </table>
    </div>
    <p>Un complemento mínimo, listo para instalar:</p>
    <pre class="manual-code"><?= e($minimo) ?></pre>
  </section>

  <section class="panel-card" id="senales">
    <h2>5 · Señales de señalización</h2>
    <p>Cada señal de <code>signs</code> lleva:</p>
    <div class="manual-table-wrap">
      <table class="manual-table">
        <thead><tr><th>Campo</th><th>Obligatorio</th><th>Qué es</th></tr></thead>
        <tbody>
          <tr><td><code>id</code></td><td>Sí</td><td>Minúsculas, números y guiones bajos, hasta 40. Debe ser único dentro del complemento.</td></tr>
          <tr><td><code>name</code></td><td>Sí</td><td>Nombre que verá el usuario en la biblioteca.</td></tr>
          <tr><td><code>category</code></td><td>Sí</td><td>Una familia del catálogo o una que declares en <code>categories</code>.</td></tr>
          <tr><td><code>description</code></td><td>Sí</td><td>Para qué sirve y qué verificar en sitio.</td></tr>
          <tr><td><code>aliases</code></td><td>No</td><td>Hasta 12 sinónimos para el buscador («botiquin», «primeros auxilios»…).</td></tr>
          <tr><td><code>svg</code></td><td>Sí</td><td>El dibujo, como texto (ver el punto 8).</td></tr>
        </tbody>
      </table>
    </div>
    <p>Familias disponibles sin declarar nada nuevo:
      <?php foreach ($signCategories as $key => $category): ?>
        <code><?= e((string) $key) ?></code><?= array_key_last($signCategories) === $key ? '.' : ' · ' ?>
      <?php endforeach; ?>
    </p>
    <p>La plataforma genera el código interno de cada señal a partir de tu <code>id</code> de complemento y del
      <code>id</code> de la señal: <code>PLG_MI_COMPLEMENTO_PUNTO_ENCUENTRO</code>. Ese código la distingue de las
      332 señales ISO 7010 y de las <?= e((string) $baseCounts['services']) ?> propias, así que no puede chocar con ellas.</p>
  </section>

  <section class="panel-card" id="equipos">
    <h2>6 · Equipos CAD</h2>
    <p>Cada objeto de <code>cad</code> lleva:</p>
    <div class="manual-table-wrap">
      <table class="manual-table">
        <thead><tr><th>Campo</th><th>Obligatorio</th><th>Qué es</th></tr></thead>
        <tbody>
          <tr><td><code>id</code></td><td>Sí</td><td>Minúsculas, números y guiones bajos, hasta 32.</td></tr>
          <tr><td><code>name</code></td><td>Sí</td><td>Nombre del equipo.</td></tr>
          <tr><td><code>category</code></td><td>Sí</td><td>Familia de equipos; se crea si no existe.</td></tr>
          <tr><td><code>description</code></td><td>Sí</td><td>Qué representa y qué verificar.</td></tr>
          <tr><td><code>color</code></td><td>No</td><td>Color base en <code>#rrggbb</code>. Por defecto <code>#334155</code>.</td></tr>
          <tr><td><code>svg</code> / <code>svg_file</code></td><td>Sí</td><td>El dibujo incrustado o el nombre del SVG dentro del <code>.zip</code>.</td></tr>
        </tbody>
      </table>
    </div>
    <p>El código interno será <code>cad_&lt;complemento&gt;_&lt;equipo&gt;</code>. El tamaño en el plano se ajusta en el
      inspector: el dibujo debe ser esquemático, sin medidas ni textos incrustados.</p>
    <pre class="manual-code"><?= e($conEquipos) ?></pre>
  </section>

  <section class="panel-card" id="familias">
    <h2>7 · Familias nuevas</h2>
    <p>Si tus señales no encajan en las familias existentes, declara una propia con su color. Luego úsala en
      <code>category</code>:</p>
    <pre class="manual-code"><?= e($categorias) ?></pre>
    <p>El color debe ser <code>#rrggbb</code>. La familia aparece como filtro en la biblioteca y tiñe el borde de las
      señales, igual que las demás.</p>
  </section>

  <section class="panel-card" id="svg">
    <h2>8 · Cómo debe ser el SVG</h2>
    <ul class="plugins-rules">
      <li>Un solo elemento <code>&lt;svg&gt;</code> con <code>viewBox</code> cuadrado para señales (por ejemplo
        <code>0 0 100 100</code>) o con la proporción del equipo para objetos CAD.</li>
      <li>Entre 40 bytes y 400 KB por dibujo. Si es más grande, simplifícalo: es un pictograma, no una foto.</li>
      <li><strong>Sin</strong> <code>&lt;script&gt;</code>, <code>&lt;foreignObject&gt;</code>, <code>&lt;style&gt;</code>, manejadores
        <code>onclick</code> ni similares.</li>
      <li><strong>Sin</strong> enlaces externos ni <code>data:</code>: los colores van en atributos
        (<code>fill</code>, <code>stroke</code>). La aplicación es local y no debe pedir nada a internet.</li>
      <li>El color de la familia lo pone la plataforma en el borde; el dibujo puede usar blanco y su propio color.</li>
      <li>Ejemplo mínimo válido: <code>&lt;svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"&gt;…&lt;/svg&gt;</code>.</li>
    </ul>
    <p>Si un SVG no pasa el filtro, la instalación se rechaza completa y se explica el motivo: nunca se guarda medio
      complemento.</p>
  </section>

  <section class="panel-card" id="probarlo">
    <h2>9 · Cómo probarlo</h2>
    <ol class="plugins-steps">
      <li>Descarga una plantilla desde esta pantalla y ábrela con un editor de texto.</li>
      <li>Cambia <code>id</code>, <code>name</code>, <code>author</code> y los elementos. Guarda el archivo con la extensión <code>.json</code>.</li>
      <li>Súbelo en <a href="<?= e(url('plugins')) ?>">Complementos</a>. Si hay un error, la pantalla dirá qué campo corregir.</li>
      <li>Abre un plano: tus señales aparecen en <strong>Biblioteca visual</strong>, con su familia y su buscador.</li>
      <li>Inserta una, guárdala y exporta el SVG: el dibujo viaja en el plano y en el archivo exportado.</li>
      <li>Desactívalo y vuelve a abrir el plano: el elemento sigue en el plano, pero sin dibujo; al reactivarlo vuelve.</li>
      <li>Cuando esté bien, cambia <code>version</code> y vuelve a instalarlo: se actualiza conservando el estado.</li>
    </ol>
  </section>

  <section class="panel-card" id="errores">
    <h2>10 · Errores frecuentes</h2>
    <div class="manual-table-wrap">
      <table class="manual-table">
        <thead><tr><th>Mensaje</th><th>Qué revisar</th></tr></thead>
        <tbody>
          <tr><td>El plugin.json no es un JSON válido</td><td>Comas finales, comillas tipográficas («») en lugar de <code>"</code>, o un salto de línea dentro de una cadena sin escapar.</td></tr>
          <tr><td>El campo "id" debe tener entre 3 y 32…</td><td>Minúsculas, números y guiones; sin tildes ni espacios.</td></tr>
          <tr><td>La familia "x" no existe</td><td>Usa una familia del listado o declárala en <code>categories</code>.</td></tr>
          <tr><td>El SVG del … no es seguro</td><td>Quita <code>&lt;script&gt;</code>, <code>on…=</code>, enlaces externos y <code>data:</code>.</td></tr>
          <tr><td>Falta el archivo … dentro del .zip</td><td>El campo <code>svg_file</code> debe coincidir con el nombre exacto del archivo y estar en el ZIP.</td></tr>
          <tr><td>Este complemento pide la versión de API 2…</td><td>El complemento es para otra versión; revisa el manual de esa versión.</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel-card" id="publicar">
    <h2>11 · Publicar y licenciar</h2>
    <ul class="plugins-rules">
      <li>Comparte el <code>plugin.json</code> o el <code>.zip</code> como prefieras; no hace falta un servidor.</li>
      <li>Escribe en <code>license</code> la licencia real. Si usas pictogramas de terceros, di de quién son y con qué
        licencia, igual que hace esta aplicación con ISO 7010.</li>
      <li>Sube <code>version</code> en cada cambio y anota en <code>description</code> qué cambió.</li>
      <li>Si el complemento describe elementos de seguridad, incluye el aviso de que es una referencia gráfica y que
        debe verificarse en sitio por una persona competente.</li>
      <li>No publiques normas completas ni material con derechos: describe el dibujo, no copies la norma.</li>
    </ul>
  </section>

  <section class="panel-card" id="limites">
    <h2>12 · Límites y seguridad</h2>
    <div class="manual-table-wrap">
      <table class="manual-table">
        <thead><tr><th>Límite</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td>Archivo del complemento</td><td><?= e(number_format($maxBytes / 1_000_000, 1, ',', '.')) ?> MB</td></tr>
          <tr><td>Elementos por complemento (señales + equipos)</td><td><?= e((string) $maxItems) ?></td></tr>
          <tr><td>Tamaño de cada SVG</td><td>40 bytes – 400 KB</td></tr>
          <tr><td>Sinónimos por señal</td><td>12</td></tr>
          <tr><td>Versión de API</td><td><?= e((string) $apiVersion) ?></td></tr>
        </tbody>
      </table>
    </div>
    <p>Los complementos son <strong>declarativos</strong>: la plataforma nunca ejecuta código que venga de ellos.
      Por eso no pueden leer la base de datos, la sesión, la configuración ni los planos, ni pedir nada a internet.
      Esa es la razón de que un complemento se pueda instalar sin revisar su código: no hay código.</p>
    <p class="help-text">Esta herramienta no certifica planes ni señalización. Los elementos que añade un complemento
      son referencias gráficas; su ubicación y su norma deben verificarse en sitio.</p>
  </section>
</section>
