<?php
/** @var array $project */
/** @var array $floor */
/** @var list<array<string,mixed>> $rows */
/** @var array $coverage */
/** @var string $filter */
/** @var array|null $openRound */
/** @var list<array<string,mixed>> $rounds */
$base = 'projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'];
$verifUrl = url($base . '/verifications');
$filters = [
    'todos' => 'Todos',
    'pendientes' => 'Pendientes',
    'novedad' => 'Con novedad',
    'vencidos' => 'Sin verificar hace ' . (int) $coverage['staleDays'] . ' días',
];
$statusClass = static fn (string $status): string => match ($status) {
    'ok' => 'is-ok',
    'issue' => 'is-issue',
    default => 'is-pending',
};
?>
<section class="page-head verif-head">
  <div>
    <span class="eyebrow"><a href="<?= e(url('projects/' . (int) $project['id'])) ?>"><?= e($project['name']) ?></a> · <?= e($floor['name']) ?></span>
    <h1>Verificación física</h1>
    <p class="page-lead">Recorre el piso, marca cada elemento y deja la nota de campo. Cada verificación conserva fecha, responsable y evidencia; el estado vigente es la última.</p>
  </div>
  <div class="verif-head-actions">
    <a class="button button-ghost" href="<?= e(url($base . '/editor')) ?>">Volver al editor</a>
    <button class="button button-soft" type="button" data-verif-round-mode aria-pressed="false">Modo ronda</button>
  </div>
</section>

<section class="verif-board" aria-labelledby="verif-coverage">
  <h2 id="verif-coverage" class="verif-sr">Cobertura de la verificación</h2>
  <div class="verif-metrics">
    <article class="verif-metric">
      <span class="verif-metric-value"><?= (int) $coverage['percent'] ?> %</span>
      <span class="verif-metric-label">Cobertura</span>
      <span class="verif-metric-note"><?= (int) $coverage['verified'] ?> de <?= (int) $coverage['total'] ?> elementos</span>
    </article>
    <article class="verif-metric is-pending">
      <span class="verif-metric-value"><?= (int) $coverage['pending'] ?></span>
      <span class="verif-metric-label">Pendientes</span>
      <span class="verif-metric-note">sin verificación vigente</span>
    </article>
    <article class="verif-metric is-issue">
      <span class="verif-metric-value"><?= (int) $coverage['issues'] ?></span>
      <span class="verif-metric-label">Con novedad</span>
      <span class="verif-metric-note">requieren acción</span>
    </article>
    <article class="verif-metric is-stale">
      <span class="verif-metric-value"><?= (int) $coverage['stale'] ?></span>
      <span class="verif-metric-label">Vencidos</span>
      <span class="verif-metric-note">más de <?= (int) $coverage['staleDays'] ?> días sin revisión</span>
    </article>
  </div>
</section>

<section class="verif-round" aria-labelledby="verif-round-title">
  <h2 id="verif-round-title">Ronda de verificación</h2>
  <?php if ($openRound !== null): ?>
    <p class="verif-round-open">
      <strong>Ronda abierta</strong> · <?= e((string) ($openRound['author'] ?? 'Sin responsable')) ?> ·
      desde <?= e(short_date((string) $openRound['started_at'])) ?>. Cada marca que registres quedará en esta ronda.
    </p>
    <form method="post" action="<?= e(url($base . '/verifications/rounds')) ?>" data-verif-form>
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="close">
      <input type="hidden" name="round_id" value="<?= (int) $openRound['id'] ?>">
      <button class="button button-primary" type="submit">Cerrar ronda</button>
    </form>
  <?php else: ?>
    <p class="verif-round-open">Sin ronda abierta. Al iniciar una, las verificaciones se agrupan para el historial.</p>
    <form method="post" action="<?= e(url($base . '/verifications/rounds')) ?>" class="verif-round-form">
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="start">
      <label class="field field-compact">
        <span>Nota de la ronda (opcional)</span>
        <input type="text" name="note" maxlength="200" placeholder="Ejemplo: ronda mensual de equipos">
      </label>
      <button class="button button-primary" type="submit">Iniciar ronda</button>
    </form>
  <?php endif; ?>
</section>

<nav class="verif-filters" aria-label="Filtrar elementos">
  <?php foreach ($filters as $key => $label): ?>
    <a class="verif-chip<?= $filter === $key ? ' is-active' : '' ?>" href="<?= e($verifUrl . '&filtro=' . $key) ?>"<?= $filter === $key ? ' aria-current="page"' : '' ?>><?= e($label) ?></a>
  <?php endforeach; ?>
</nav>

<section class="verif-list" aria-label="Elementos del plano">
  <?php if ($rows === []): ?>
    <p class="verif-empty">No hay elementos con este filtro. Cambia el filtro o revisa que el plano tenga equipos y señalización.</p>
  <?php endif; ?>
  <?php foreach ($rows as $row): ?>
    <?php
      $check = $row['check'];
      $status = (string) $row['status'];
      $threshold = url($base . '/verifications/' . (int) ($check['id'] ?? 0) . '/photo');
    ?>
    <article class="verif-card <?= $statusClass($status) ?>" data-verif-card data-element-id="<?= e($row['id']) ?>">
      <header class="verif-card-head">
        <div>
          <h3><?= e($row['name']) ?></h3>
          <p class="verif-card-meta">
            <span class="verif-tag"><?= e(\App\Services\VerificationInventory::family($row['type'])) ?></span>
            <span><?= e($row['sector']) ?></span>
          </p>
        </div>
        <span class="verif-status" data-verif-status><?= e(\App\Models\Check::LABELS[$status] ?? 'Pendiente') ?></span>
      </header>
      <p class="verif-last" data-verif-last>
        <?php if ($check !== null): ?>
          <?= e(short_date((string) $check['checked_at'])) ?> ·
          <?= e((string) ($check['author'] ?? 'Sin responsable')) ?>
          <?php if ((string) $check['note'] !== ''): ?>
            · «<?= e((string) $check['note']) ?>»
          <?php endif; ?>
        <?php else: ?>
          Sin verificación registrada.
        <?php endif; ?>
        <?php if ($row['stale']): ?>
          <span class="verif-stale">· vencido</span>
        <?php endif; ?>
      </p>
      <?php if ($check !== null && (string) ($check['photo_type'] ?? '') !== ''): ?>
        <p class="verif-photo"><a href="<?= e($threshold) ?>" target="_blank" rel="noopener">Ver foto de evidencia</a></p>
      <?php endif; ?>

      <form class="verif-form" method="post" action="<?= e($verifUrl) ?>" enctype="multipart/form-data" data-verif-form>
        <?= csrf_field() ?>
        <input type="hidden" name="element_id" value="<?= e($row['id']) ?>">
        <label class="field field-compact verif-note">
          <span>Nota de campo</span>
          <textarea name="note" rows="2" maxlength="600" placeholder="Qué encontraste y qué hace falta"><?= e((string) ($check['note'] ?? '')) ?></textarea>
        </label>
        <div class="verif-photo-field">
          <label class="field field-compact">
            <span>Foto de evidencia (opcional, hasta 512 KB)</span>
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="environment">
          </label>
        </div>
        <div class="verif-buttons" role="group" aria-label="Estado de <?= e($row['name']) ?>">
          <button class="button verif-btn is-ok" type="submit" name="status" value="ok">Verificado</button>
          <button class="button verif-btn is-issue" type="submit" name="status" value="issue">Con novedad</button>
          <button class="button verif-btn is-pending" type="submit" name="status" value="pending">Pendiente</button>
        </div>
      </form>
    </article>
  <?php endforeach; ?>
</section>

<section class="verif-tables" aria-labelledby="verif-tables-title">
  <h2 id="verif-tables-title">Cobertura por tipo y por sector</h2>
  <div class="verif-tables-grid">
    <table class="verif-table">
      <caption>Por tipo de elemento</caption>
      <thead><tr><th scope="col">Tipo</th><th scope="col">Total</th><th scope="col">Verificados</th><th scope="col">Novedades</th><th scope="col">Cobertura</th></tr></thead>
      <tbody>
      <?php foreach ($coverage['byFamily'] as $row): ?>
        <tr>
          <th scope="row"><?= e($row['name']) ?></th>
          <td><?= (int) $row['total'] ?></td>
          <td><?= (int) $row['verified'] ?></td>
          <td><?= (int) $row['issues'] ?></td>
          <td><span class="verif-bar"><span style="width:<?= (int) $row['percent'] ?>%"></span></span><?= (int) $row['percent'] ?> %</td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <table class="verif-table">
      <caption>Por sector (capas del plano)</caption>
      <thead><tr><th scope="col">Sector</th><th scope="col">Total</th><th scope="col">Verificados</th><th scope="col">Novedades</th><th scope="col">Cobertura</th></tr></thead>
      <tbody>
      <?php foreach ($coverage['bySector'] as $row): ?>
        <tr>
          <th scope="row"><?= e($row['name']) ?></th>
          <td><?= (int) $row['total'] ?></td>
          <td><?= (int) $row['verified'] ?></td>
          <td><?= (int) $row['issues'] ?></td>
          <td><span class="verif-bar"><span style="width:<?= (int) $row['percent'] ?>%"></span></span><?= (int) $row['percent'] ?> %</td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>

<section class="verif-rounds" aria-labelledby="verif-rounds-title">
  <div class="verif-rounds-head">
    <h2 id="verif-rounds-title">Historial de rondas</h2>
    <form method="post" action="<?= e(url($base . '/verifications/settings')) ?>" class="verif-settings">
      <?= csrf_field() ?>
      <label class="field field-inline">
        <span>Avisar a los</span>
        <input type="number" name="check_days" min="1" max="365" value="<?= (int) $coverage['staleDays'] ?>" aria-label="Días para avisar por falta de verificación">
        <span>días</span>
      </label>
      <button class="button button-small button-ghost" type="submit">Guardar</button>
    </form>
  </div>
  <?php if ($rounds === []): ?>
    <p class="verif-empty">Todavía no hay rondas. Al cerrar la primera quedará aquí con su responsable y sus hallazgos.</p>
  <?php else: ?>
    <ol class="verif-round-list">
      <?php foreach ($rounds as $round): ?>
        <li>
          <span class="verif-round-state <?= (string) $round['status'] === 'open' ? 'is-open' : 'is-closed' ?>">
            <?= (string) $round['status'] === 'open' ? 'Abierta' : 'Cerrada' ?>
          </span>
          <span class="verif-round-who"><?= e((string) ($round['started_name'] ?? 'Sin responsable')) ?></span>
          <span class="verif-round-when">
            <?= e(short_date((string) $round['started_at'])) ?>
            <?php if ((string) $round['status'] !== 'open' && $round['closed_at']): ?>
              · cerrada <?= e(short_date((string) $round['closed_at'])) ?>
            <?php endif; ?>
          </span>
          <span class="verif-round-counts"><?= (int) $round['checks'] ?> verificaciones · <?= (int) $round['issues'] ?> novedades</span>
          <?php if (trim((string) $round['note']) !== ''): ?>
            <span class="verif-round-note">«<?= e((string) $round['note']) ?>»</span>
          <?php endif; ?>
        </li>
      <?php endforeach; ?>
    </ol>
  <?php endif; ?>
  <p class="verif-disclaimer">El estado de verificación es un registro de campo del usuario, no una certificación. Confirma la señalización y los equipos con la persona competente y la normativa aplicable.</p>
</section>
