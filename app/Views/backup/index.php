<?php
/** @var list<array<string,mixed>> $backups */
/** @var array{ok:bool,checked_at:string,result:string} $health */
/** @var array|null $last */
/** @var int|null $age */
/** @var int $keep */
/** @var int $maxAge */
/** @var int $schema */
$size = static function (int $bytes): string {
    if ($bytes >= 1048576) {
        return round($bytes / 1048576, 1) . ' MB';
    }
    if ($bytes >= 1024) {
        return round($bytes / 1024) . ' KB';
    }
    return $bytes . ' B';
};
$when = static function (string $iso): string {
    $time = strtotime($iso);
    return $time === false ? $iso : date('d/m/Y H:i', $time);
};
$stale = $age === null || $age > $maxAge;
?>
<section class="page-head">
  <div>
    <span class="eyebrow">Administración de la instalación</span>
    <h1>Datos y respaldo</h1>
    <p class="page-lead">Una copia completa de esta instalación: planos, pisos, versiones, empresas, personas, verificaciones con sus fotografías, complementos y configuración. Solo la cuenta que instaló la aplicación puede descargarla.</p>
  </div>
  <div class="page-head-actions">
    <form method="post" action="<?= e(url('respaldo')) ?>" class="inline-form">
      <?= csrf_field() ?>
      <button class="button button-primary" type="submit"><svg class="icon"><use href="#i-save"></use></svg>Crear respaldo</button>
    </form>
    <a class="button button-ghost" href="<?= e(url('respaldo/base')) ?>"><svg class="icon"><use href="#i-download"></use></svg>Solo la base (.sqlite)</a>
  </div>
</section>

<?php if (!$health['ok']): ?>
  <div class="notice notice-error" role="alert">
    <svg class="icon"><use href="#i-alert"></use></svg>
    <div>
      <strong>La comprobación de la base no salió bien</strong>
      <p>Resultado: <?= e((string) $health['result']) ?>. Crea un respaldo ahora y revisa el archivo antes de seguir trabajando. Si el error se repite, conserva la copia y no borres nada.</p>
    </div>
  </div>
<?php elseif ($stale): ?>
  <div class="notice notice-warning" role="status">
    <svg class="icon"><use href="#i-alert"></use></svg>
    <div>
      <strong><?= $age === null ? 'Todavía no hay ningún respaldo' : 'El último respaldo tiene ' . (int) $age . ' días' ?></strong>
      <p>Una copia guardada fuera del servidor es lo único que protege los planos si falla el disco. Descarga un respaldo y guárdalo en otro equipo.</p>
    </div>
  </div>
<?php endif; ?>

<section class="stats-grid" aria-label="Estado">
  <article class="stat-card">
    <span class="stat-icon"><svg class="icon"><use href="#i-check"></use></svg></span>
    <div><strong><?= e($health['ok'] ? 'Correcta' : 'Revisar') ?></strong><small>Integridad de la base · <?= e($when((string) $health['checked_at'])) ?></small></div>
  </article>
  <article class="stat-card">
    <span class="stat-icon"><svg class="icon"><use href="#i-history"></use></svg></span>
    <div><strong><?= count($backups) ?></strong><small>Respaldos guardados (se conservan <?= (int) $keep ?>)</small></div>
  </article>
  <article class="stat-card">
    <span class="stat-icon"><svg class="icon"><use href="#i-file"></use></svg></span>
    <div><strong><?= $last ? e($size((int) $last['bytes'])) : '—' ?></strong><small>Última copia · <?= $last ? e($when((string) $last['created_at'])) : 'sin copias' ?></small></div>
  </article>
  <article class="stat-card stat-card-muted">
    <span class="stat-icon"><svg class="icon"><use href="#i-layers"></use></svg></span>
    <div><strong><?= (int) $schema ?></strong><small>Versión del esquema</small></div>
  </article>
</section>

<section class="section-block" aria-labelledby="copias">
  <div class="section-head">
    <div>
      <span class="eyebrow">Copias en este equipo</span>
      <h2 id="copias">Respaldos</h2>
      <p>Cada respaldo se verifica al crearse (integridad, claves foráneas y conteos). La rotación conserva las <?= (int) $keep ?> más recientes y nunca elimina una copia fijada.</p>
    </div>
  </div>

  <?php if (empty($backups)): ?>
    <div class="empty-state">
      <span class="empty-icon"><svg class="icon"><use href="#i-cloud"></use></svg></span>
      <h3>Aún no hay respaldos</h3>
      <p>Crea el primero y guárdalo fuera de este equipo. La copia incluye las fotografías de verificación.</p>
      <form method="post" action="<?= e(url('respaldo')) ?>">
        <?= csrf_field() ?>
        <button class="button button-primary" type="submit">Crear respaldo</button>
      </form>
    </div>
  <?php else: ?>
    <ul class="backup-list">
      <?php foreach ($backups as $backup): ?>
        <?php $name = (string) $backup['name']; ?>
        <li class="backup-row">
          <div class="backup-main">
            <strong><?= e($name) ?></strong>
            <span class="backup-meta">
              <?= e($when((string) $backup['created_at'])) ?> ·
              <?= e($size((int) $backup['bytes'])) ?> ·
              <?= e((string) ($backup['kind'] ?? 'manual')) ?> ·
              esquema <?= (int) ($backup['schema_version'] ?? 0) ?>
              <?php if (!empty($backup['pinned'])): ?><span class="badge">Fijada</span><?php endif; ?>
            </span>
            <?php $report = $backup['report'] ?? []; ?>
            <span class="backup-check">
              <?php if (!empty($report['ok'])): ?>
                <svg class="icon"><use href="#i-check"></use></svg>
                <?= (int) ($report['counts']['projects'] ?? 0) ?> proyectos ·
                <?= (int) ($report['counts']['floors'] ?? 0) ?> pisos ·
                <?= (int) ($report['counts']['floor_versions'] ?? 0) ?> versiones ·
                <?= (int) ($report['counts']['element_checks'] ?? 0) ?> verificaciones
              <?php else: ?>
                <svg class="icon"><use href="#i-alert"></use></svg>Sin informe de verificación
              <?php endif; ?>
            </span>
          </div>
          <div class="backup-actions">
            <a class="button button-soft" href="<?= e(url('respaldo/' . $name)) ?>"><svg class="icon"><use href="#i-download"></use></svg>Descargar</a>
            <a class="button button-ghost" href="<?= e(url('respaldo/' . $name . '/verificar')) ?>"><svg class="icon"><use href="#i-check"></use></svg>Verificar</a>
            <form method="post" action="<?= e(url('respaldo/' . $name . '/fijar')) ?>" class="inline-form">
              <?= csrf_field() ?>
              <button class="button button-ghost" type="submit"><svg class="icon"><use href="#i-lock"></use></svg><?= !empty($backup['pinned']) ? 'Liberar' : 'Fijar' ?></button>
            </form>
          </div>
        </li>
      <?php endforeach; ?>
    </ul>
  <?php endif; ?>
</section>

<section class="section-block" aria-labelledby="restaurar">
  <div class="section-head">
    <div>
      <span class="eyebrow">Cuándo haga falta</span>
      <h2 id="restaurar">Restaurar una copia</h2>
      <p>La restauración se hace con la aplicación detenida y sobre una instalación aparte, nunca en caliente: reemplazar la base con el servidor abierto puede corromperla. El procedimiento completo está en <code>docs/ESTABILIDAD.md</code>.</p>
    </div>
  </div>
  <ol class="restore-steps">
    <li>Comprueba la copia antes de usarla: <code>sqlite3 storage/normia-….sqlite "PRAGMA integrity_check; PRAGMA foreign_key_check;"</code> debe responder <code>ok</code> y no devolver filas.</li>
    <li>Detén el servidor o cierra la aplicación.</li>
    <li>Mueve <code>storage/</code> a <code>storage-anterior-&lt;fecha&gt;</code>; no borres nada.</li>
    <li>Copia del respaldo <code>config/config.php</code>, la base y <code>storage/plugins/</code>.</li>
    <li>Abre la aplicación: la migración pondrá el esquema al día si la copia es anterior.</li>
    <li>Si algo no cuadra, vuelve a poner <code>storage-anterior-&lt;fecha&gt;</code> en su sitio.</li>
  </ol>
</section>
