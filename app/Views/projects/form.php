<?php $isEdit = !empty($project); $data = array_merge($project ?? [], $old); ?>
<section class="form-page">
  <header class="form-page-head">
    <a class="back-link" href="<?= e($isEdit ? url('projects/' . (int) $project['id']) : url('')) ?>"><svg class="icon"><use href="#i-chevron-left"></use></svg><?= $isEdit ? 'Volver al proyecto' : 'Volver a mis planos' ?></a>
    <span class="eyebrow"><?= $isEdit ? 'Datos del proyecto' : 'Nuevo proyecto' ?></span>
    <h1><?= $isEdit ? 'Editar proyecto' : 'Diseña tu próximo plano' ?></h1>
    <p>Los metadatos ayudan a identificar la sede, el centro de trabajo y la persona responsable. Puedes añadir varios pisos después de crear el proyecto.</p>
  </header>

  <?php if (!empty($errors)): ?>
    <div class="notice notice-error" role="alert">
      <svg class="icon"><use href="#i-alert"></use></svg>
      <div><strong>Revisa los campos</strong><ul class="notice-list"><?php foreach ($errors as $error): ?><li><?= e($error) ?></li><?php endforeach; ?></ul></div>
    </div>
  <?php endif; ?>

  <form method="post" action="<?= e($isEdit ? url('projects/' . (int) $project['id']) : url('projects')) ?>" class="panel-card form-stack">
    <?= csrf_field() ?>
    <div class="form-grid">
      <label class="field field-wide">
        <span>Nombre del proyecto <em>Obligatorio</em></span>
        <input type="text" name="name" value="<?= e($data['name'] ?? '') ?>" required maxlength="120" placeholder="Planta principal · Edificio Norte">
      </label>
      <label class="field">
        <span>Sede</span>
        <input type="text" name="site" value="<?= e($data['site'] ?? '') ?>" maxlength="120" placeholder="Sede Bogotá">
      </label>
      <label class="field">
        <span>Centro de trabajo</span>
        <input type="text" name="workplace" value="<?= e($data['workplace'] ?? '') ?>" maxlength="120" placeholder="Centro de operaciones">
      </label>
      <label class="field">
        <span>Responsable</span>
        <input type="text" name="responsible" value="<?= e($data['responsible'] ?? '') ?>" maxlength="120" placeholder="Coordinación SST">
      </label>
      <label class="field field-wide">
        <span>Observaciones</span>
        <textarea name="notes" rows="4" maxlength="1000" placeholder="Alcance del levantamiento, accesos, pendientes de verificación..."><?= e($data['notes'] ?? '') ?></textarea>
      </label>
    </div>

    <?php if (!$isEdit): ?>
      <div class="form-section">
        <h2>Primer piso</h2>
        <p class="help-text">El lienzo se puede ajustar después desde la configuración del piso. La escala es una referencia de impresión y no sustituye la verificación en sitio.</p>
        <div class="form-grid">
          <label class="field">
            <span>Nombre del piso</span>
            <input type="text" name="floor_name" value="<?= e($old['floor_name'] ?? 'Piso 1') ?>" maxlength="80">
          </label>
          <label class="field">
            <span>Nivel</span>
            <input type="text" name="floor_level" value="<?= e($old['floor_level'] ?? '1') ?>" maxlength="40" placeholder="1, Sótano, Mezzanine">
          </label>
          <label class="field">
            <span>Tamaño de lienzo</span>
            <select name="preset">
              <?php foreach ($presets as $key => $preset): ?>
                <option value="<?= e($key) ?>" <?= ($old['preset'] ?? 'libre') === $key ? 'selected' : '' ?>><?= e($preset['label']) ?> · <?= e($preset['width']) ?>×<?= e($preset['height']) ?></option>
              <?php endforeach; ?>
            </select>
          </label>
        </div>
      </div>
    <?php endif; ?>

    <div class="form-actions">
      <a class="button button-ghost" href="<?= e($isEdit ? url('projects/' . (int) $project['id']) : url('')) ?>">Cancelar</a>
      <button class="button button-primary" type="submit"><?= $isEdit ? 'Guardar cambios' : 'Crear proyecto' ?></button>
    </div>
  </form>
</section>
