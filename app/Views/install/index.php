<section class="install-shell" aria-labelledby="install-title">
  <header class="install-head">
    <span class="eyebrow">Instalador local</span>
    <h1 id="install-title">Prepara Normia Planos CAD</h1>
    <p>La instalación crea la base SQLite, tu cuenta administradora y, si lo eliges, un proyecto de demostración. No se incluyen contraseñas ni bases de datos en el ZIP.</p>
  </header>

  <?php if (!empty($errors)): ?>
    <div class="notice notice-error" role="alert">
      <svg class="icon"><use href="#i-alert"></use></svg>
      <div>
        <strong>Revisa lo siguiente</strong>
        <ul class="notice-list">
          <?php foreach ($errors as $error): ?><li><?= e($error) ?></li><?php endforeach; ?>
        </ul>
      </div>
    </div>
  <?php endif; ?>

  <div class="install-grid">
    <section class="install-requirements" aria-labelledby="requirements-title">
      <h2 id="requirements-title">Requisitos del servidor</h2>
      <ul class="requirement-list">
        <?php foreach ($requirements as $requirement): ?>
          <li class="<?= $requirement['ok'] ? 'is-ok' : 'is-fail' ?>">
            <span class="requirement-icon"><svg class="icon"><use href="#i-<?= $requirement['ok'] ? 'check' : 'alert' ?>"></use></svg></span>
            <span class="requirement-copy"><strong><?= e($requirement['label']) ?></strong><small><?= e($requirement['detail']) ?></small></span>
          </li>
        <?php endforeach; ?>
      </ul>
      <p class="help-text">Permisos recomendados: carpetas <code>storage</code>, <code>storage/sessions</code> y <code>config</code> con escritura para el servidor web (755/775). El instalador escribe <code>config/config.php</code> al finalizar.</p>
    </section>

    <section class="install-form" aria-labelledby="account-title">
      <h2 id="account-title">Tu cuenta administradora</h2>
      <?php if (!$ready): ?>
        <div class="notice notice-warning">
          <svg class="icon"><use href="#i-alert"></use></svg>
          <p>Corrige los requisitos pendientes para habilitar la instalación. Puedes recargar esta página tras ajustar permisos.</p>
        </div>
      <?php endif; ?>
      <form method="post" action="<?= e(url('install')) ?>" class="form-stack" autocomplete="on">
        <?= csrf_field() ?>
        <label class="field">
          <span>Nombre y apellido</span>
          <input type="text" name="name" value="<?= e($old['name'] ?? '') ?>" required maxlength="80" autocomplete="name" placeholder="Ana Rodríguez" <?= $ready ? '' : 'disabled' ?>>
        </label>
        <label class="field">
          <span>Correo electrónico</span>
          <input type="email" name="email" value="<?= e($old['email'] ?? '') ?>" required maxlength="160" autocomplete="username" placeholder="ana@empresa.com" <?= $ready ? '' : 'disabled' ?>>
        </label>
        <div class="form-row">
          <label class="field">
            <span>Contraseña</span>
            <input type="password" name="password" required minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres" <?= $ready ? '' : 'disabled' ?>>
          </label>
          <label class="field">
            <span>Confirmar contraseña</span>
            <input type="password" name="password_confirm" required minlength="10" autocomplete="new-password" placeholder="Repite la contraseña" <?= $ready ? '' : 'disabled' ?>>
          </label>
        </div>
        <p class="help-text">Usa al menos 10 caracteres con letras y números. La contraseña se guarda con <code>password_hash</code>; nunca en texto plano.</p>
        <label class="check-row">
          <input type="checkbox" name="demo" value="1" <?= (!empty($old['demo']) || $demoBuild) ? 'checked' : '' ?> <?= $ready ? '' : 'disabled' ?>>
          <span><strong>Cargar proyecto de demostración</strong><small>Dos pisos con mobiliario, señalización y rutas de evacuación de ejemplo.</small></span>
        </label>
        <button class="button button-primary button-block" type="submit" <?= $ready ? '' : 'disabled' ?>>Instalar Normia Planos CAD</button>
      </form>
    </section>
  </div>
</section>
