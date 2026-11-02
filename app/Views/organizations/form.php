<?php $data = array_merge($organization ?? [], $old); ?>
<section class="form-page">
  <header class="form-page-head">
    <a class="back-link" href="<?= e(url('empresas')) ?>"><svg class="icon"><use href="#i-chevron-left"></use></svg>Volver a empresas</a>
    <span class="eyebrow">Nueva empresa</span>
    <h1>Crea el espacio de una empresa</h1>
    <p>Los planos y las personas se agrupan por empresa. Después podrás invitar a quienes revisan o editan los planos.</p>
  </header>

  <?php if (!empty($errors)): ?>
    <div class="notice notice-error" role="alert">
      <svg class="icon"><use href="#i-alert"></use></svg>
      <div><strong>Revisa los campos</strong><ul class="notice-list"><?php foreach ($errors as $error): ?><li><?= e($error) ?></li><?php endforeach; ?></ul></div>
    </div>
  <?php endif; ?>

  <form method="post" action="<?= e(url('empresas')) ?>" class="panel-card form-stack">
    <?= csrf_field() ?>
    <div class="form-grid">
      <label class="field field-wide">
        <span>Nombre de la empresa <em>Obligatorio</em></span>
        <input type="text" name="name" value="<?= e($data['name'] ?? '') ?>" required maxlength="120" placeholder="Industrias del Norte S.A.S.">
      </label>
      <label class="field">
        <span>Identificador tributario</span>
        <input type="text" name="tax_id" value="<?= e($data['tax_id'] ?? '') ?>" maxlength="40" placeholder="NIT 900.000.000-0">
      </label>
      <label class="field">
        <span>Ciudad</span>
        <input type="text" name="city" value="<?= e($data['city'] ?? '') ?>" maxlength="80" placeholder="Bogotá">
      </label>
    </div>
    <p class="help-text">El identificador tributario y la ciudad son opcionales: sirven para distinguir empresas con nombres parecidos. No se validan contra la DIAN.</p>
    <div class="form-actions">
      <a class="button button-ghost" href="<?= e(url('empresas')) ?>">Cancelar</a>
      <button class="button button-primary" type="submit">Crear empresa</button>
    </div>
  </form>
</section>
