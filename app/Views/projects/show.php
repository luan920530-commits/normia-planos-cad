<section class="project-head">
  <div class="project-head-main">
    <a class="back-link" href="<?= e(url('')) ?>"><svg class="icon"><use href="#i-chevron-left"></use></svg>Mis planos</a>
    <span class="eyebrow">Proyecto</span>
    <h1><?= e($project['name']) ?></h1>
    <p class="project-subtitle">
      <span><svg class="icon"><use href="#i-folder"></use></svg><?= e($project['site'] !== '' ? $project['site'] : 'Sede sin definir') ?></span>
      <span><svg class="icon"><use href="#i-grid"></use></svg><?= e($project['workplace'] !== '' ? $project['workplace'] : 'Centro sin definir') ?></span>
      <span><svg class="icon"><use href="#i-user"></use></svg><?= e($project['responsible'] !== '' ? $project['responsible'] : 'Sin responsable') ?></span>
    </p>
    <?php if ($project['notes'] !== ''): ?><p class="project-notes"><?= nl2br(e($project['notes'])) ?></p><?php endif; ?>
  </div>
  <div class="project-head-actions">
    <a class="button button-ghost" href="<?= e(url('projects/' . (int) $project['id'] . '/edit')) ?>"><svg class="icon"><use href="#i-settings"></use></svg>Editar datos</a>
    <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/duplicate')) ?>">
      <?= csrf_field() ?>
      <button class="button button-ghost" type="submit"><svg class="icon"><use href="#i-duplicate"></use></svg>Duplicar</button>
    </form>
  </div>
</section>

<section class="section-block" id="pisos" aria-labelledby="floors-title">
  <div class="section-head">
    <div><span class="eyebrow">Niveles del proyecto</span><h2 id="floors-title">Pisos y planos</h2></div>
    <span class="count-chip"><?= e(count($floors)) ?> de 30</span>
  </div>

  <div class="floor-grid">
    <?php foreach ($floors as $floor): ?>
      <article class="floor-card">
        <a class="floor-preview" href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/editor')) ?>">
          <img src="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/preview.svg') . '&v=' . (int) $floor['version']) ?>" alt="Vista previa del plano <?= e($floor['name']) ?>" loading="lazy">
          <span class="floor-version">v<?= e($floor['version']) ?></span>
        </a>
        <div class="floor-body">
          <h3><a href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/editor')) ?>"><?= e($floor['name']) ?></a></h3>
          <p class="floor-meta">Nivel <?= e($floor['level'] !== '' ? $floor['level'] : '—') ?> · <?= e($floor['version_count']) ?> versiones · <?= e(format_date($floor['updated_at'])) ?></p>
          <div class="floor-actions">
            <a class="button button-small button-primary" href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/editor')) ?>">Abrir editor</a>
            <a class="button button-small button-ghost" href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/export/svg')) ?>">SVG</a>
            <div class="menu-wrap">
              <button class="icon-button" type="button" data-menu-toggle aria-label="Más acciones de <?= e($floor['name']) ?>" aria-expanded="false"><svg class="icon"><use href="#i-chevron-down"></use></svg></button>
              <div class="menu" hidden>
                <a class="menu-item" href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/print')) ?>" target="_blank" rel="noopener"><svg class="icon"><use href="#i-print"></use></svg>Imprimir o PDF</a>
                <a class="menu-item" href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/export/json')) ?>"><svg class="icon"><use href="#i-file"></use></svg>Exportar JSON</a>
                <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/duplicate')) ?>">
                  <?= csrf_field() ?>
                  <button class="menu-item" type="submit"><svg class="icon"><use href="#i-duplicate"></use></svg>Duplicar piso</button>
                </form>
                <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/delete')) ?>" data-confirm="Se eliminará el piso, su diseño actual y todas sus versiones. Esta acción no se puede deshacer.">
                  <?= csrf_field() ?>
                  <button class="menu-item menu-item-danger" type="submit" <?= count($floors) <= 1 ? 'disabled' : '' ?>><svg class="icon"><use href="#i-trash"></use></svg>Eliminar piso</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </article>
    <?php endforeach; ?>
  </div>

  <details class="add-floor-panel" <?= count($floors) >= 30 ? 'hidden' : '' ?>>
    <summary><svg class="icon"><use href="#i-plus"></use></svg>Añadir un piso</summary>
    <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/floors')) ?>" class="form-stack compact-form">
      <?= csrf_field() ?>
      <div class="form-grid">
        <label class="field"><span>Nombre del piso</span><input type="text" name="name" required maxlength="80" placeholder="Piso 2" value="Piso <?= e(count($floors) + 1) ?>"></label>
        <label class="field"><span>Nivel</span><input type="text" name="level" maxlength="40" placeholder="2"></label>
        <label class="field"><span>Lienzo</span><select name="preset"><?php foreach ($presets as $key => $preset): ?><option value="<?= e($key) ?>" <?= $key === 'libre' ? 'selected' : '' ?>><?= e($preset['label']) ?> · <?= e($preset['width']) ?>×<?= e($preset['height']) ?></option><?php endforeach; ?></select></label>
      </div>
      <div class="form-actions"><button class="button button-primary" type="submit">Añadir piso</button></div>
    </form>
  </details>
</section>

<section class="section-block import-block" id="importar" aria-labelledby="import-title">
  <div class="section-head">
    <div><span class="eyebrow">Intercambio de archivos</span><h2 id="import-title">Importar un plano</h2></div>
  </div>
  <div class="panel-card import-card">
    <div>
      <p>Importa un JSON exportado por Normia Planos CAD o un diseño heredado del editor anterior. El formato se valida en el servidor y solo se aceptan herramientas, colores y propiedades conocidos.</p>
      <p class="help-text">El nuevo diseño se añade como un piso de este proyecto. Tamaño máximo: 2,5 MB.</p>
    </div>
    <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/import')) ?>" enctype="multipart/form-data" class="import-form">
      <?= csrf_field() ?>
      <label class="file-field">
        <input type="file" name="design_file" accept="application/json,.json" required>
        <span class="file-button"><svg class="icon"><use href="#i-upload"></use></svg>Seleccionar JSON</span>
        <span class="file-name" data-file-name>Ningún archivo seleccionado</span>
      </label>
      <button class="button button-primary" type="submit">Importar plano</button>
    </form>
  </div>
</section>

<aside class="notice notice-info">
  <svg class="icon"><use href="#i-info"></use></svg>
  <p>Los planos son representaciones esquemáticas. No se declara cumplimiento normativo automático; verifica dimensiones, salidas, rutas y equipos en sitio.</p>
</aside>
