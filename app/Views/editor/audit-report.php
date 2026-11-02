<?php
/** @var array $floor @var array $meta @var array $design @var array $report @var array $criteria */
$counts = $report['counts'];
$travel = $report['travel'];
$occupancy = $report['occupancy'];
$firstAid = $report['firstAid'] ?? null;
$scenarios = $report['scenarios'] ?? null;
$drill = $report['drill'] ?? null;
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

  <h2 class="audit-h2">Aforo del piso</h2>
  <div class="audit-metrics">
    <article>
      <span>Aforo máximo</span>
      <strong><?= (int) $occupancy['maxPersons'] ?> pers.</strong>
      <small>Superficie útil libre <?= $formatNumber((float) $occupancy['freeAreaM2']) ?> m² × <?= $formatNumber((float) $occupancy['density'], 2) ?> pers./m²</small>
    </article>
    <article>
      <span>Aforo permitido</span>
      <strong><?= (int) $occupancy['permitted'] ?> pers.</strong>
      <small><?= $occupancy['source'] === 'declared'
        ? 'El menor entre la ocupación declarada y el aforo máximo'
        : 'Estimación por superficie libre: no hay ocupación declarada' ?></small>
    </article>
    <article>
      <span>Ocupación declarada</span>
      <strong><?= (int) $occupancy['declared'] > 0 ? (int) $occupancy['declared'] . ' pers.' : 'Sin declarar' ?></strong>
      <small><?= (int) $occupancy['declared'] > 0
        ? ((int) $occupancy['excess'] > 0
          ? 'Supera el aforo máximo en ' . (int) $occupancy['excess'] . ' personas'
          : 'Dentro de la capacidad del piso')
        : 'Se usa el aforo máximo como referencia del cálculo' ?></small>
    </article>
    <article>
      <span>Personas en el cálculo</span>
      <strong><?= (int) $occupancy['people'] ?> pers.</strong>
      <small>Base del ancho requerido y del tiempo de salida</small>
    </article>
  </div>
  <p class="audit-note audit-aforo-note">El aforo máximo es una <strong>capacidad calculada</strong> con la superficie útil libre del plano y la densidad de referencia; no sustituye el aforo que fije la autoridad competente ni la revisión de la ocupación real del recinto. Con la ocupación declarada por encima del máximo, el tiempo de salida se calcula con las personas declaradas para no dar un resultado optimista.</p>

  <?php if (is_array($firstAid)): ?>
  <?php
  $kitMax = $firstAid['coverage']['kitMaxM'] ?? null;
  $aedMax = $firstAid['coverage']['aedMaxM'] ?? null;
  $kitLimit = (float) ($firstAid['criteria']['kitTravelM'] ?? 30);
  $aedLimit = (float) ($firstAid['criteria']['aedTravelM'] ?? 100);
  $formatDistance = static fn ($value): string => $value === null ? 'sin medición' : $formatNumber((float) $value, 1) . ' m';
  ?>
  <h2 class="audit-h2">Recursos de primeros auxilios</h2>
  <div class="audit-metrics">
    <article>
      <span>Botiquines</span>
      <strong><?= (int) $firstAid['kits']['count'] ?></strong>
      <small><?= (int) $firstAid['kits']['count'] === 0
        ? 'Ninguno ubicado en el plano'
        : 'Punto más lejano: ' . $formatDistance($kitMax) . ' · referencia ' . $formatNumber($kitLimit, 1) . ' m' ?></small>
    </article>
    <article>
      <span>Camillas</span>
      <strong><?= (int) $firstAid['stretchers']['count'] ?></strong>
      <small><?= (int) $firstAid['stretchers']['count'] === 0
        ? 'Ninguna ubicada en el piso'
        : 'Ubicadas en el plano · verifica su estado en sitio' ?></small>
    </article>
    <article>
      <span>Desfibrilador (DEA)</span>
      <strong><?= (int) $firstAid['aeds']['count'] ?></strong>
      <small><?php if ((int) $firstAid['aeds']['count'] === 0): ?>
        <?= (int) $firstAid['people'] >= (int) $firstAid['criteria']['aedMinPersons']
          ? 'Afluencia por encima de ' . (int) $firstAid['criteria']['aedMinPersons'] . ' personas: revisa si aplica'
          : 'No exigible por debajo de ' . (int) $firstAid['criteria']['aedMinPersons'] . ' personas' ?>
      <?php else: ?>Punto más lejano: <?= $formatDistance($aedMax) ?> · referencia <?= $formatNumber($aedLimit, 1) ?> m<?php endif; ?></small>
    </article>
    <article>
      <span>Personas en el cálculo</span>
      <strong><?= (int) $firstAid['people'] ?> pers.</strong>
      <small><?= ($firstAid['source'] ?? 'estimated') === 'declared' ? 'Ocupación declarada del piso' : 'Capacidad calculada: no hay ocupación declarada' ?></small>
    </article>
  </div>
  <p class="audit-note audit-firstaid-note">El auditor cuenta los recursos <strong>dibujados en el plano</strong> y mide su alcance en línea recta hasta el punto más lejano del espacio libre. <strong>No comprueba contenido, dotación, vigencia, carga ni mantenimiento</strong>: eso se verifica en sitio. Los umbrales son criterios de referencia de la aplicación, no exigencias normativas<?= ($firstAid['criteria']['reference'] ?? '') !== '' ? '; la norma aplicable (' . e((string) $firstAid['criteria']['reference']) . ') depende del establecimiento y de la afluencia de público' : '' ?>.</p>
  <?php endif; ?>


  <?php if (is_array($scenarios) && (int) ($scenarios['count'] ?? 0) > 0): ?>
  <?php $base = $scenarios['base'] ?? []; $peak = $scenarios['peak'] ?? null; ?>
  <h2 class="audit-h2">Escenarios de ocupación temporal</h2>
  <div class="audit-metrics">
    <article>
      <span>Escenarios declarados</span>
      <strong><?= (int) $scenarios['count'] ?></strong>
      <small>Máximo <?= (int) ($scenarios['criteria']['maxScenarios'] ?? 8) ?> por piso</small>
    </article>
    <article>
      <span>El más exigente</span>
      <strong><?= $peak === null ? 'Sin datos' : (int) $peak['persons'] . ' pers.' ?></strong>
      <small><?= $peak === null ? 'Sin escenarios' : e((string) $peak['name']) ?></small>
    </article>
    <article>
      <span>Uso habitual</span>
      <strong><?= (int) ($base['people'] ?? 0) ?> pers.</strong>
      <small><?= e($formatTime($base['estimatedTimeS'] ?? null)) ?> de salida · <?= ($base['source'] ?? 'estimated') === 'declared' ? 'ocupación declarada' : 'capacidad calculada' ?></small>
    </article>
    <article>
      <span>Capacidad del piso</span>
      <strong><?= (int) ($base['capacity'] ?? 0) ?> pers.</strong>
      <small>La misma superficie libre × densidad del uso habitual</small>
    </article>
  </div>
  <table class="print-table audit-table audit-scenarios">
    <thead>
      <tr>
        <th scope="col">Escenario</th>
        <th scope="col">Personas</th>
        <th scope="col">Capacidad</th>
        <th scope="col">Ancho exigido</th>
        <th scope="col">Tiempo estimado</th>
        <th scope="col">Cabe</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($scenarios['items'] as $scenario): ?>
        <tr>
          <th scope="row"><?= e((string) $scenario['name']) ?></th>
          <td><?= (int) $scenario['persons'] ?></td>
          <td><?= (int) $scenario['capacity'] ?><?php if ((int) $scenario['excess'] > 0): ?> <small>+<?= (int) $scenario['excess'] ?> de más</small><?php endif; ?></td>
          <td><?= $formatNumber((float) $scenario['requiredWidthM']) ?> m<?php if ($scenario['widthOk'] === false): ?> <small>disponible <?= $formatNumber((float) $scenario['availableWidthM']) ?> m</small><?php endif; ?></td>
          <td><?= e($formatTime($scenario['estimatedTimeS'])) ?><?php if ($scenario['extraTimeS'] !== null && (float) $scenario['extraTimeS'] > 0.05): ?> <small>+<?= e($formatTime((float) $scenario['extraTimeS'])) ?></small><?php endif; ?></td>
          <td><?= $scenario['fits'] ? 'Sí' : 'No' ?><?= $scenario['widthOk'] === false ? ' · ancho' : '' ?></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <p class="audit-note audit-scenarios-note"><?= e((string) ($scenarios['notice'] ?? '')) ?></p>
  <?php endif; ?>


  <?php if (is_array($drill) && ($drill['routes'] ?? []) !== []): ?>
  <?php
  $drillTarget = $drill['targetS'] ?? null;
  $drillMeasured = $drill['measuredS'] ?? null;
  $drillDifference = $drill['differenceS'] ?? null;
  ?>
  <h2 class="audit-h2">Simulacro de evacuación</h2>
  <div class="audit-metrics">
    <article>
      <span>Tiempo objetivo</span>
      <strong><?= $drillTarget === null ? 'Sin datos' : e($formatTime((float) $drillTarget)) ?></strong>
      <small>Reacción <?= e($formatTime((float) ($drill['reactionS'] ?? 0))) ?> + caminos hasta el punto de encuentro</small>
    </article>
    <article>
      <span>Punto de encuentro</span>
      <strong><?= ($drill['meeting']['found'] ?? false) ? 'Declarado' : 'Sin declarar' ?></strong>
      <small><?= ($drill['meeting']['source'] ?? 'none') === 'object'
        ? 'Objeto «Punto de encuentro» en el plano'
        : (($drill['meeting']['source'] ?? 'none') === 'sign' ? 'Solo la señal E007: ubica la zona de reunión' : 'El recorrido termina en la salida') ?></small>
    </article>
    <article>
      <span>Tiempo medido</span>
      <strong><?= $drillMeasured === null ? 'Sin registrar' : e($formatTime((float) $drillMeasured)) ?></strong>
      <small><?php if ($drillMeasured === null): ?>Se anota después de cronometrar el simulacro real
      <?php elseif ($drillDifference !== null && (float) $drillDifference > 0): ?>+<?= e($formatTime((float) $drillDifference)) ?> sobre el objetivo
      <?php elseif ($drillDifference !== null): ?><?= e($formatTime(abs((float) $drillDifference))) ?> por debajo del objetivo
      <?php else: ?>Sin objetivo con el que comparar<?php endif; ?></small>
    </article>
    <article>
      <span>Personas del cálculo</span>
      <strong><?= (int) ($drill['people'] ?? 0) ?> pers.</strong>
      <small>Velocidad de referencia <?= $formatNumber((float) ($drill['speedMps'] ?? 1), 1) ?> m/s</small>
    </article>
  </div>
  <table class="print-table audit-table audit-drill">
    <thead>
      <tr>
        <th scope="col">Ruta</th>
        <th scope="col">Longitud</th>
        <th scope="col">Salida</th>
        <th scope="col">Al punto de encuentro</th>
        <th scope="col">Reacción</th>
        <th scope="col">Tiempo objetivo</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($drill['routes'] as $index => $ruta): ?>
        <tr>
          <th scope="row"><?= e(($ruta['label'] ?? '') !== '' ? $ruta['label'] : 'Ruta ' . ($index + 1)) ?></th>
          <td><?= $formatNumber((float) $ruta['lengthM'], 1) ?> m</td>
          <td><?= $ruta['exitId'] === null ? 'Sin salida' : ($ruta['endsAtExit'] ? 'Sí' : 'No termina en ella') ?></td>
          <td><?= $ruta['meetingM'] === null ? '—' : $formatNumber((float) $ruta['meetingM'], 1) . ' m' ?></td>
          <td><?= e($formatTime((float) $ruta['reactionS'])) ?></td>
          <td><?= $ruta['arrivalS'] === null ? '—' : e($formatTime((float) $ruta['arrivalS'])) ?></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <p class="audit-note audit-drill-note"><?= e((string) ($drill['notice'] ?? '')) ?></p>
  <?php endif; ?>

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
      <tr><th scope="row">Techo de aforo del criterio</th><td><?= (int) $occupancy['cap'] ?> personas</td></tr>
      <tr><th scope="row">Velocidad de marcha</th><td><?= $formatNumber((float) $criteria['egress']['travelSpeedMps'], 2) ?> m/s</td></tr>
      <tr><th scope="row">Señal de salida junto al vano</th><td>≤ <?= $formatNumber(((float) $criteria['signs']['exitSignRadiusCm']) / 100, 1) ?> m</td></tr>
      <tr><th scope="row">Rejilla de cálculo</th><td><?= (int) $criteria['grid']['cellCm'] ?> cm</td></tr>
      <?php if (is_array($firstAid)): ?>
      <tr><th scope="row">Alcance del botiquín</th><td>≤ <?= $formatNumber((float) $firstAid['criteria']['kitTravelM'], 1) ?> m</td></tr>
      <tr><th scope="row">Alcance del DEA</th><td>≤ <?= $formatNumber((float) $firstAid['criteria']['aedTravelM'], 1) ?> m</td></tr>
      <tr><th scope="row">Umbral de afluencia para el DEA</th><td><?= (int) $firstAid['criteria']['aedMinPersons'] ?> personas</td></tr>
      <?php endif; ?>
      <?php if (is_array($drill) && ($drill['routes'] ?? []) !== []): ?>
      <tr><th scope="row">Tiempo de reacción del simulacro</th><td><?= e($formatTime((float) ($drill['reactionS'] ?? 0))) ?></td></tr>
      <tr><th scope="row">Velocidad de marcha del simulacro</th><td><?= $formatNumber((float) ($drill['speedMps'] ?? 1), 2) ?> m/s</td></tr>
      <?php endif; ?>
      <?php if (is_array($scenarios) && (int) ($scenarios['count'] ?? 0) > 0): ?>
      <tr><th scope="row">Escenarios de ocupación por piso</th><td>hasta <?= (int) ($scenarios['criteria']['maxScenarios'] ?? 8) ?></td></tr>
      <tr><th scope="row">Ancho exigido por escenario</th><td><?= $formatNumber((float) ($scenarios['criteria']['widthMmPerPerson'] ?? 5), 1) ?> mm por persona</td></tr>
      <?php endif; ?>
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
