<?php
/** @var array $floor @var array $meta @var array $design @var array $report @var array $criteria */
$counts = $report['counts'];
$travel = $report['travel'];
$occupancy = $report['occupancy'];
$egress = $report['egress'];
$exits = $report['exits'];
$labels = \App\Services\PlanAudit::SEVERITY_LABELS;
$findings = $report['findings'];
$formatNumber = static fn (float $value, int $decimals = 2): string => number_format($value, $decimals, ',', '.');
$formatTime = static function (?float $seconds): string {
    if ($seconds === null) {
        return 'Sin datos';
    }
    $minutes = (int) floor($seconds / 60);
    $rest = (int) round($seconds - $minutes * 60);
    return $minutes > 0 ? $minutes . ' min ' . $rest . ' s' : $rest . ' s';
};
$severityOrder = ['high', 'medium', 'low', 'info'];
$severityLabels = ['high' => 'Críticos', 'medium' => 'Importantes', 'low' => 'Menores', 'info' => 'Informativos'];
?>
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
  <link rel="stylesheet" href="<?= e(asset('css/audit.css')) ?>">
</head>
<body class="print-body audit-body">
<div class="print-toolbar">
  <a class="button button-ghost" href="<?= e($backUrl) ?>"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m15 5-7 7 7 7"/></svg>Volver al editor</a>
  <div class="print-title"><strong>Revisión del plano</strong><span><?= e($floor['project_name']) ?> · <?= e($floor['name']) ?> · v<?= e((string) $version) ?></span></div>
  <button class="button button-primary" type="button" data-print-button>Imprimir / Guardar PDF</button>
</div>

<main class="print-sheet audit-sheet">
  <header class="audit-head">
    <div>
      <span class="audit-eyebrow">Auditor de planos de emergencia</span>
      <h1><?= e($meta['project_name']) ?> · <?= e($floor['name']) ?></h1>
      <p class="audit-meta">
        <?php if ($floor['level'] !== ''): ?>Nivel <?= e($floor['level']) ?> · <?php endif; ?>
        <?= e(($meta['site'] ?? '') !== '' ? $meta['site'] : 'Sin sitio declarado') ?> · Escala <?= e((string) $design['canvas']['scale']) ?> ·
        Versión v<?= e((string) $version) ?> · Generado el <?= e($generatedAt) ?> UTC
      </p>
    </div>
    <div class="audit-score <?= $counts['high'] > 0 ? 'is-high' : ($counts['medium'] > 0 ? 'is-medium' : 'is-clean') ?>">
      <strong><?= count($findings) ?></strong>
      <span><?= count($findings) === 1 ? 'hallazgo' : 'hallazgos' ?></span>
    </div>
  </header>

  <section class="audit-summary">
    <article><span>Críticos</span><strong><?= (int) $counts['high'] ?></strong></article>
    <article><span>Importantes</span><strong><?= (int) $counts['medium'] ?></strong></article>
    <article><span>Menores</span><strong><?= (int) $counts['low'] ?></strong></article>
    <article><span>Informativos</span><strong><?= (int) $counts['info'] ?></strong></article>
  </section>

  <h2 class="audit-h2">Medición de evacuación</h2>
  <div class="audit-metrics">
    <article>
      <span>Recorrido más largo</span>
      <strong><?= $travel['longestM'] === null ? 'Sin datos' : $formatNumber((float) $travel['longestM']) . ' m' ?></strong>
      <small>Límite de referencia: <?= $formatNumber((float) $travel['limitM']) ?> m</small>
    </article>
    <article>
      <span>Salidas marcadas</span>
      <strong><?= (int) $exits['count'] ?></strong>
      <small>Ancho útil <?= $formatNumber((float) $exits['clearWidthM']) ?> m de <?= $formatNumber((float) $exits['widthM']) ?> m de vano</small>
    </article>
    <article>
      <span>Ocupación</span>
      <strong><?= (int) $occupancy['people'] ?> pers.</strong>
      <small><?= $occupancy['source'] === 'declared' ? 'Declarada en el piso' : 'Estimada con densidad de referencia' ?></small>
    </article>
    <article>
      <span>Ancho requerido</span>
      <strong><?= $formatNumber((float) $egress['requiredWidthM']) ?> m</strong>
      <small>Disponible: <?= $formatNumber((float) $egress['availableWidthM']) ?> m</small>
    </article>
    <article>
      <span>Tiempo estimado de salida</span>
      <strong><?= e($formatTime($egress['estimatedTimeS'])) ?></strong>
      <small>Marcha <?= e($formatTime($egress['walkTimeS'])) ?> + cola en salidas <?= e($formatTime($egress['queueTimeS'])) ?></small>
    </article>
    <article>
      <span>Superficie libre</span>
      <strong><?= $formatNumber((float) $travel['freeAreaM2']) ?> m²</strong>
      <small>Alcanzable <?= $formatNumber((float) $travel['reachableAreaM2']) ?> m² · sin salida <?= $formatNumber((float) $travel['unreachableAreaM2']) ?> m²<?php if (((float) ($travel['exteriorAreaM2'] ?? 0)) > 0): ?> · exterior no computado <?= $formatNumber((float) $travel['exteriorAreaM2']) ?> m²<?php endif; ?></small>
    </article>
  </div>

  <h2 class="audit-h2">Hallazgos</h2>
  <?php if ($findings === []): ?>
    <p class="audit-clean">No se detectaron hallazgos con los criterios de referencia configurados. Aun así, verifica el plano en sitio antes de usarlo.</p>
  <?php else: ?>
    <?php foreach ($severityOrder as $severity): ?>
      <?php $group = array_values(array_filter($findings, static fn (array $finding): bool => $finding['severity'] === $severity)); ?>
      <?php if ($group === []) { continue; } ?>
      <section class="audit-group audit-<?= e($severity) ?>">
        <h3><?= e($severityLabels[$severity]) ?> <em><?= count($group) ?></em></h3>
        <ul class="audit-list">
          <?php foreach ($group as $finding): ?>
            <li>
              <div class="audit-list-head">
                <strong><?= e($finding['title']) ?></strong>
                <?php if ($finding['value'] !== null): ?><span class="audit-value"><?= e((string) $finding['value']) ?></span><?php endif; ?>
              </div>
              <p><?= e($finding['detail']) ?></p>
              <small>
                Código <?= e($finding['code']) ?>
                <?php if ($finding['position'] !== null): ?>
                  · Punto <?= $formatNumber((float) $finding['position']['x'], 0) ?>, <?= $formatNumber((float) $finding['position']['y'], 0) ?> <?= e((string) $design['canvas']['unit']) ?>
                <?php endif; ?>
                <?php if ($finding['elements'] !== []): ?>
                  · <?= count($finding['elements']) ?> elemento<?= count($finding['elements']) === 1 ? '' : 's' ?> del plano
                <?php endif; ?>
              </small>
            </li>
          <?php endforeach; ?>
        </ul>
      </section>
    <?php endforeach; ?>
  <?php endif; ?>

  <?php if ($report['routes'] !== []): ?>
    <h2 class="audit-h2">Rutas de evacuación</h2>
    <table class="print-table audit-table">
      <thead><tr><th scope="col">Ruta</th><th scope="col">Longitud</th><th scope="col">Termina en salida</th><th scope="col">Cruces de muro</th></tr></thead>
      <tbody>
        <?php foreach ($report['routes'] as $index => $route): ?>
          <tr>
            <th scope="row"><?= e($route['label'] !== '' ? $route['label'] : 'Ruta ' . ($index + 1)) ?></th>
            <td><?= $formatNumber((float) $route['lengthM'], 1) ?> m</td>
            <td><?= $route['endsAtExit'] ? 'Sí' : 'No' ?><?= $route['distanceToExitM'] !== null && !$route['endsAtExit'] ? ' · a ' . $formatNumber((float) $route['distanceToExitM'], 1) . ' m' : '' ?></td>
            <td><?= (int) $route['wallCrossings'] ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  <?php endif; ?>

  <h2 class="audit-h2">Criterios aplicados</h2>
  <table class="print-table audit-table audit-criteria">
    <tbody>
      <tr><th scope="row">Recorrido máximo hasta una salida</th><td><?= $formatNumber((float) $criteria['egress']['maxTravelM']) ?> m</td></tr>
      <tr><th scope="row">Mínimo de salidas de emergencia</th><td><?= (int) $criteria['egress']['minExitCount'] ?></td></tr>
      <tr><th scope="row">Ancho mínimo de vano por salida</th><td><?= $formatNumber(((float) $criteria['egress']['minExitWidthCm']) / 100) ?> m</td></tr>
      <tr><th scope="row">Ancho útil por persona</th><td><?= $formatNumber((float) $criteria['egress']['widthMmPerPerson'], 1) ?> mm</td></tr>
      <tr><th scope="row">Densidad de ocupación</th><td><?= $formatNumber((float) $criteria['occupancy']['densityPersonsPerM2'], 2) ?> pers./m²</td></tr>
      <tr><th scope="row">Velocidad de marcha</th><td><?= $formatNumber((float) $criteria['egress']['travelSpeedMps'], 2) ?> m/s</td></tr>
      <tr><th scope="row">Señal de salida junto al vano</th><td>≤ <?= $formatNumber(((float) $criteria['signs']['exitSignRadiusCm']) / 100, 1) ?> m</td></tr>
      <tr><th scope="row">Rejilla de cálculo</th><td><?= (int) $criteria['grid']['cellCm'] ?> cm</td></tr>
    </tbody>
  </table>

  <footer class="print-footer audit-footer">
    <p><strong>Alcance.</strong> Este informe es una <strong>revisión de referencia</strong> calculada sobre el último diseño guardado con umbrales configurables en <code>resources/audit-criteria.json</code>. No es un dictamen técnico, no certifica cumplimiento normativo y no sustituye la verificación en sitio ni la revisión de un profesional competente. Los planos son esquemáticos: confirma dimensiones, rutas, anchos de paso, señalización y equipos antes de usarlos.</p>
    <p class="audit-sign">Normia Planos CAD <?= e(NORMA_VERSION) ?> · GPL-3.0 · Informe generado por <?= e($user['name'] ?? 'la cuenta') ?> el <?= e($generatedAt) ?> UTC</p>
  </footer>
</main>
<script src="<?= e(asset('js/print.js')) ?>" defer></script>
</body>
</html>
