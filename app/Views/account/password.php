<section class="form-page narrow-page">
  <header class="form-page-head">
    <a class="back-link" href="<?= e(url('')) ?>"><svg class="icon"><use href="#i-chevron-left"></use></svg>Volver</a>
    <span class="eyebrow">Cuenta</span>
    <h1>Seguridad de la cuenta</h1>
    <p><?= e($user['name']) ?> · <?= e($user['email']) ?></p>
  </header>

  <?php if (!empty($errors)): ?>
    <div class="notice notice-error" role="alert"><svg class="icon"><use href="#i-alert"></use></svg><div><ul class="notice-list"><?php foreach ($errors as $error): ?><li><?= e($error) ?></li><?php endforeach; ?></ul></div></div>
  <?php endif; ?>

  <form method="post" action="<?= e(url('account/password')) ?>" class="panel-card form-stack" autocomplete="off">
    <?= csrf_field() ?>
    <label class="field"><span>Contraseña actual</span><input type="password" name="current_password" required autocomplete="current-password"></label>
    <div class="form-row">
      <label class="field"><span>Nueva contraseña</span><input type="password" name="password" required minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres"><small>Combina letras y números.</small></label>
      <label class="field"><span>Confirmar nueva contraseña</span><input type="password" name="password_confirm" required minlength="10" autocomplete="new-password"></label>
    </div>
    <div class="form-actions"><a class="button button-ghost" href="<?= e(url('')) ?>">Cancelar</a><button class="button button-primary" type="submit">Actualizar contraseña</button></div>
  </form>
</section>
