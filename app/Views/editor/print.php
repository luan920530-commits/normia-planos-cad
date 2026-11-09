<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title><?= e($title) ?></title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('css/print.css')) ?>">
  <style>@page { size: <?= e($paper['css']) ?>; margin: 12mm; }</style>
</head>
<body class="print-body">
<div class="print-toolbar">
  <a class="button button-ghost" href="<?= e($backUrl) ?>"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m15 5-7 7 7 7"/></svg>Volver al editor</a>
  <div class="print-title"><strong><?= e($floor['name']) ?></strong><span><?= e($floor['project_name']) ?> · v<?= e($version) ?></span></div>
  <button class="button button-primary" type="button" data-print-button><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M7 8V3h10v5M7 17H4V9h16v8h-3"/><rect x="7" y="14" width="10" height="7" rx="1"/></svg>Imprimir / Guardar PDF</button>
</div>
<?php
/* Selector de escala y hoja (NORMIA-006 §17). Cambiar cualquiera de los dos no
   toca el documento: solo vuelve a dibujar la exportación. */
$mm = static fn (float $value): string => str_replace('.', ',', number_format($value, 1, ',', '.'));
$format = static fn (float $value): string => str_replace('.', ',', number_format($value, 2, ',', '.'));
?>
<div class="print-options">
  <form class="print-options-form" method="get" action="<?= e(url('')) ?>">
    <input type="hidden" name="r" value="<?= e('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/print') ?>">
    <label>Escala
      <select name="escala" data-print-scale>
        <?php foreach ($scales as $option): ?>
          <option value="<?= e($option) ?>"<?= $option === $scale ? ' selected' : '' ?>><?= e($option) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
    <label>Hoja
      <select name="hoja" data-print-paper>
        <?php foreach ($papers as $key => $option): ?>
          <option value="<?= e($key) ?>"<?= $key === $paperKey ? ' selected' : '' ?>><?= e($option['label']) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
    <button class="button button-ghost" type="submit">Aplicar</button>
    <?php if ($suggested !== null && $suggested !== $scale): ?>
      <a class="button button-ghost" href="<?= e($printUrl . '&escala=' . rawurlencode($suggested) . '&hoja=' . rawurlencode($paperKey)) ?>" data-print-fit>Ajustar a la hoja · <?= e($suggested) ?></a>
    <?php endif; ?>
  </form>
  <p class="print-size<?= $fits ? '' : ' is-warning' ?>" data-print-size>
    Escala <strong><?= e($scale) ?></strong> · <?= e($paper['label']) ?> · el plano mide
    <strong><?= e($mm((float) $sheet['planWidthMm'])) ?> × <?= e($mm((float) $sheet['planHeightMm'])) ?> mm</strong>
    y la hoja completa <?= e($mm((float) $sheet['widthMm'])) ?> × <?= e($mm((float) $sheet['heightMm'])) ?> mm.
    <?php if ($fits): ?>
      Cabe en <?= e($mm($availableWidth)) ?> × <?= e($mm($availableHeight)) ?> mm útiles: imprime sin recortes.
    <?php else: ?>
      <strong>No cabe en la hoja elegida</strong>: se recortaría.
      <?php if ($suggested !== null): ?>Usa «Ajustar a la hoja» (<?= e($suggested) ?>) o una hoja mayor.<?php else: ?>Usa una hoja mayor o una escala menor.<?php endif; ?>
    <?php endif; ?>
  </p>
  <p class="print-size">El archivo ya viene a tamaño real: al imprimir, desactiva «ajustar a la página» para conservar la escala. La barra del pie sirve para comprobarlo con una regla.</p>
</div>
<main class="print-sheet">
  <div class="print-svg"><?= $svg ?></div>
<?php if (!empty($mep['hydraulic']) || !empty($mep['electrical'])): ?>
  <?php
  $formatLength = static fn (float $value): string => number_format($value, 2, ',', '.') . ' m';
  $formatNumber = static fn (float $value, int $decimals = 2): string => number_format($value, $decimals, ',', '.');
  ?>
  <section class="print-mep">
    <h2>Redes e instalaciones del piso</h2>
    <?php if (!empty($mep['hydraulic'])): ?>
    <table class="print-table">
      <caption>Redes de tubería</caption>
      <thead>
        <tr><th scope="col">Red</th><th scope="col">Tramos</th><th scope="col">Longitud</th><th scope="col">Diámetros</th><th scope="col">Materiales</th></tr>
      </thead>
      <tbody>
      <?php foreach ($mep['hydraulic'] as $net): ?>
        <tr>
          <th scope="row"><span class="print-swatch" style="background: <?= e($net['color']) ?>"></span><?= e($net['label']) ?> <small>(<?= e($net['short']) ?>)</small></th>
          <td><?= (int) $net['count'] ?></td>
          <td><?= e($formatLength((float) $net['lengthM'])) ?></td>
          <td><?= e(implode(' · ', array_map(static fn (array $d): string => $d['diameter'] . ' (' . number_format((float) $d['lengthM'], 2, ',', '.') . ' m)', $net['diameters']))) ?></td>
          <td><?= e(implode(', ', $net['materials'])) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
    <?php if (!empty($mep['electrical'])): ?>
    <table class="print-table">
      <caption>Circuitos eléctricos</caption>
      <thead>
        <tr><th scope="col">Circuito</th><th scope="col">Tensión / fases</th><th scope="col">Carga</th><th scope="col">Corriente</th><th scope="col">Breaker</th><th scope="col">Calibre</th><th scope="col">Longitud</th><th scope="col">Caída</th></tr>
      </thead>
      <tbody>
      <?php foreach ($mep['electrical'] as $circuit): ?>
        <tr>
          <th scope="row"><span class="print-swatch" style="background: <?= e($circuit['color']) ?>"></span><?= e($circuit['code']) ?></th>
          <td><?= (int) $circuit['voltage'] ?> V · <?= (int) $circuit['phases'] ?>F</td>
          <td><?= e($formatNumber((float) $circuit['loadVA'], 0)) ?> VA</td>
          <td><?= e($formatNumber((float) $circuit['current'])) ?> A</td>
          <td><?= (int) $circuit['breaker'] ?> A</td>
          <td><?= e((string) $circuit['gauge']) ?> AWG</td>
          <td><?= e($formatLength((float) $circuit['lengthM'])) ?></td>
          <td><?= e($formatNumber((float) $circuit['drop'])) ?> %</td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
    <?php if (!empty($mep['warnings'])): ?>
      <ul class="print-warnings">
        <?php foreach ($mep['warnings'] as $warning): ?>
          <li><?= e($warning) ?></li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
    <p class="print-note">Longitudes, pendientes, breaker, calibre y caída de tensión son <strong>estimaciones de referencia</strong> calculadas con tablas configurables del catálogo local. No reemplazan la memoria de cálculo ni la revisión de un profesional competente.</p>
  </section>
<?php endif; ?>
  <footer class="print-footer">
    <p><strong>Verificación en sitio:</strong> este plano es una representación esquemática. Confirma dimensiones, accesos, rutas, señalización y equipos antes de usarlo. No constituye certificación ni aprobación legal automática.</p>
  </footer>
</main>
<script src="<?= e(asset('js/print.js')) ?>" defer></script>
</body>
</html>
