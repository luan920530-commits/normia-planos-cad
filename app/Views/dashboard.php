<section class="dashboard-hero">
  <div>
    <span class="eyebrow">Espacio de trabajo</span>
    <h1>Planos claros, evacuación precisa.</h1>
    <p>Crea proyectos por sede y centro de trabajo, organiza pisos y dibuja planos de emergencia con señalización ISO 7010 y equipamiento CAD.</p>
  </div>
  <a class="button button-primary" href="<?= e(url('projects/new')) ?>">
    <svg class="icon"><use href="#i-plus"></use></svg>
    Nuevo proyecto
  </a>
</section>

<section class="stats-grid" aria-label="Resumen">
  <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-folder"></use></svg></span><div><strong><?= e($stats['projects']) ?></strong><small>Proyectos</small></div></article>
  <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-layers"></use></svg></span><div><strong><?= e($stats['floors']) ?></strong><small>Pisos</small></div></article>
  <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-history"></use></svg></span><div><strong><?= e($stats['versions']) ?></strong><small>Versiones guardadas</small></div></article>
  <article class="stat-card stat-card-muted"><span class="stat-icon"><svg class="icon"><use href="#i-sign"></use></svg></span><div><strong>332</strong><small>Pictogramas ISO 7010</small></div></article>
</section>

<section class="section-block" aria-labelledby="projects-title">
  <div class="section-head">
    <div>
      <span class="eyebrow">Tus proyectos</span>
      <h2 id="projects-title">Biblioteca de planos</h2>
    </div>
    <a class="button button-ghost" href="<?= e(url('projects/new')) ?>"><svg class="icon"><use href="#i-plus"></use></svg>Crear</a>
  </div>

  <?php if (empty($projects)): ?>
    <div class="empty-state">
      <span class="empty-icon"><svg class="icon"><use href="#i-folder"></use></svg></span>
      <h3>Aún no hay planos</h3>
      <p>Crea tu primer proyecto con sede, centro de trabajo y responsable. Podrás añadir varios pisos y exportar SVG, PNG o JSON.</p>
      <a class="button button-primary" href="<?= e(url('projects/new')) ?>">Crear proyecto</a>
    </div>
  <?php else: ?>
    <div class="project-grid">
      <?php foreach ($projects as $project): ?>
        <article class="project-card">
          <a class="project-preview" href="<?= e(url('projects/' . $project['id'])) ?>" aria-label="Abrir <?= e($project['name']) ?>">
            <?php if (!empty($project['first_floor_id'])): ?>
              <img src="<?= e(url('projects/' . $project['id'] . '/floors/' . $project['first_floor_id'] . '/preview.svg') . '&v=' . (int) $project['updated_at']) ?>" alt="Vista previa del plano <?= e($project['name']) ?>" loading="lazy">
            <?php else: ?>
              <span class="preview-placeholder"><svg class="icon"><use href="#i-folder"></use></svg></span>
            <?php endif; ?>
            <span class="project-badge"><?= e($project['floor_count']) ?> <?= (int) $project['floor_count'] === 1 ? 'piso' : 'pisos' ?></span>
          </a>
          <div class="project-body">
            <div class="project-title-row">
              <h3><a href="<?= e(url('projects/' . $project['id'])) ?>"><?= e($project['name']) ?></a></h3>
              <span class="project-menu-hint" data-tooltip="Proyecto">•••</span>
            </div>
            <p class="project-meta"><?= e($project['site'] !== '' ? $project['site'] : 'Sin sede') ?><?= $project['workplace'] !== '' ? ' · ' . e($project['workplace']) : '' ?></p>
            <p class="project-updated">Actualizado <?= e(format_date($project['floor_updated_at'] ?? $project['updated_at'])) ?> · <?= e($project['version_count']) ?> versiones</p>
            <div class="project-actions">
              <a class="button button-small" href="<?= e(url('projects/' . $project['id'])) ?>">Abrir</a>
              <a class="button button-small button-ghost" href="<?= e(url('projects/' . $project['id'] . '/edit')) ?>">Editar</a>
              <div class="menu-wrap">
                <button class="icon-button" type="button" data-menu-toggle aria-label="Más acciones de <?= e($project['name']) ?>" aria-expanded="false"><svg class="icon"><use href="#i-chevron-down"></use></svg></button>
                <div class="menu" hidden>
                  <form method="post" action="<?= e(url('projects/' . $project['id'] . '/duplicate')) ?>">
                    <?= csrf_field() ?>
                    <button class="menu-item" type="submit"><svg class="icon"><use href="#i-duplicate"></use></svg>Duplicar proyecto</button>
                  </form>
                  <form method="post" action="<?= e(url('projects/' . $project['id'] . '/delete')) ?>" data-confirm="Se eliminarán el proyecto, sus pisos y todas sus versiones. Esta acción no se puede deshacer.">
                    <?= csrf_field() ?>
                    <button class="menu-item menu-item-danger" type="submit"><svg class="icon"><use href="#i-trash"></use></svg>Eliminar proyecto</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </article>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</section>

<aside class="notice notice-info dashboard-note">
  <svg class="icon"><use href="#i-info"></use></svg>
  <p><strong>Representación esquemática.</strong> Los planos generados ayudan a comunicar rutas y equipos, pero no certifican el cumplimiento legal. Verifica dimensiones, salidas, rutas y señalización en sitio.</p>
</aside>
