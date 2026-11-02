<?php
/** @var array $project */
/** @var array $floor */
/** @var array $plan */
/** @var list<array<string,mixed>> $versions */
$base = 'projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'];
$candidateIds = [];
foreach ($plan['candidates'] as $candidate) {
    $candidateIds[(int) $candidate['id']] = true;
}
$size = static function (int $bytes): string {
    if ($bytes >= 1048576) {
        return round($bytes / 1048576, 1) . ' MB';
    }
    if ($bytes >= 1024) {
        return round($bytes / 1024) . ' KB';
    }
    return $bytes . ' B';
};
$when = static fn (string $value): string => format_date($value, 'd/m/Y H:i');
?>
<section class="page-head">
  <div>
    <span class="eyebrow"><a href="<?= e(url('projects/' . (int) $project['id'])) ?>"><?= e($project['name']) ?></a> · <?= e($floor['name']) ?></span>
    <h1>Historial y conservación</h1>
    <p class="page-lead">Cada guardado conserva el plano completo. Esta página dice qué se conservaría y qué se podría retirar, sin tocar nada hasta que lo confirmes.</p>
  </div>
  <div class="page-head-actions">
    <a class="button button-ghost" href="<?= e(url($base . '/editor')) ?>"><svg class="icon"><use href="#i-chevron-left"></use></svg>Volver al editor</a>
  </div>
</section>

<section class="stats-grid" aria-label="Historial">
  <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-history"></use></svg></span><div><strong><?= (int) $plan['total'] ?></strong><small>Versiones guardadas</small></div></article>
  <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-lock"></use></svg></span><div><strong><?= (int) $plan['kept'] - count($plan['candidates']) ?></strong><small>Se conservan por regla</small></div></article>
  <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-trash"></use></svg></span><div><strong><?= count($plan['candidates']) ?></strong><small>Se podrían retirar</small></div></article>
  <article class="stat-card stat-card-muted"><span class="stat-icon"><svg class="icon"><use href="#i-save"></use></svg></span><div><strong><?= e($size((int) $plan['freed'])) ?></strong><small>Espacio recuperable</small></div></article>
</section>

<div class="notice notice-info" role="note">
  <svg class="icon"><use href="#i-info"></use></svg>
  <div>
    <strong>Cómo se decide qué se conserva</strong>
    <p>Se guardan todas las versiones de los últimos <?= (int) $keepDays ?> días; de <?= (int) $keepDays ?> a <?= (int) $keepDailyDays ?> días, una por día; y de ahí en adelante, una por mes. Nunca se tocan la versión vigente, la inicial, la última ni las fijadas a mano. Antes de borrar se crea un respaldo automático; si el respaldo falla, no se borra nada.</p>
  </div>
</div>

<section class="section-block" aria-labelledby="versiones">
  <div class="section-head">
    <div>
      <span class="eyebrow">Historial completo</span>
      <h2 id="versiones">Versiones</h2>
      <p>Marca las que quieras retirar. Si una deja de ser candidata mientras tanto, se conserva igual.</p>
    </div>
  </div>

  <?php if (empty($versions)): ?>
    <div class="empty-state"><h3>Sin versiones</h3><p>El historial aparecerá en cuanto guardes el plano desde el editor.</p></div>
  <?php else: ?>
    <form id="podar" method="post" action="<?= e(url($base . '/versiones/podar')) ?>" data-confirm="Se eliminarán las versiones marcadas de «<?= e($floor['name']) ?>». Antes se creará un respaldo. Esta acción no se puede deshacer.">
      <?= csrf_field() ?>
    </form>
    <ul class="version-list">
      <?php foreach ($versions as $version): ?>
        <?php
        $id = (int) $version['id'];
        $candidate = isset($candidateIds[$id]);
        $isCurrent = (int) $version['version'] === (int) $floor['version'];
        ?>
        <li class="version-row<?= $candidate ? ' is-candidate' : '' ?>">
          <label class="version-pick">
            <?php if ($candidate): ?>
              <input type="checkbox" name="versions[]" value="<?= $id ?>" form="podar" checked>
            <?php else: ?>
              <span class="version-keep" aria-hidden="true"><svg class="icon"><use href="#i-lock"></use></svg></span>
            <?php endif; ?>
            <span class="version-text">
              <strong><?= e(version_label((int) $version['version'])) ?><?= $isCurrent ? ' · vigente' : '' ?><?= (int) $version['pinned'] === 1 ? ' · fijada' : '' ?></strong>
              <span class="version-meta"><?= e($when((string) $version['created_at'])) ?> · <?= e((string) ($version['created_by_name'] ?? 'Cuenta eliminada')) ?> · <?= e($size(strlen((string) $version['design_json']))) ?></span>
              <?php if ((string) $version['note'] !== ''): ?><span class="version-note"><?= e((string) $version['note']) ?></span><?php endif; ?>
            </span>
          </label>
          <form method="post" action="<?= e(url($base . '/versiones/' . $id . '/fijar')) ?>" class="inline-form">
            <?= csrf_field() ?>
            <button class="button button-small button-ghost" type="submit"><?= (int) $version['pinned'] === 1 ? 'Liberar' : 'Fijar' ?></button>
          </form>
        </li>
      <?php endforeach; ?>
    </ul>
    <div class="form-actions">
      <button class="button button-danger" type="submit" form="podar" <?= $plan['candidates'] === [] ? 'disabled' : '' ?>>
        <svg class="icon"><use href="#i-trash"></use></svg>
        Retirar las versiones marcadas (<?= count($plan['candidates']) ?>)
      </button>
      <span class="help-text">Se creará un respaldo antes de borrar.</span>
    </div>
  <?php endif; ?>
</section>
