<section class="auth-card" aria-labelledby="login-title">
  <div class="auth-card-head">
    <span class="eyebrow">Acceso seguro</span>
    <h1 id="login-title">Inicia sesión</h1>
    <p>Entra para abrir tus proyectos, editar pisos y exportar planos.</p>
  </div>
  <form method="post" action="<?= e(url('login')) ?>" class="form-stack" autocomplete="on">
    <?= csrf_field() ?>
    <label class="field">
      <span>Correo electrónico</span>
      <input type="email" name="email" value="<?= e($old['email'] ?? '') ?>" required autocomplete="username" inputmode="email" placeholder="tu@empresa.com">
    </label>
    <label class="field">
      <span>Contraseña</span>
      <input type="password" name="password" required autocomplete="current-password" minlength="1" placeholder="Tu contraseña">
    </label>
    <button class="button button-primary button-block" type="submit">Entrar</button>
  </form>
  <p class="auth-hint">La cuenta se crea durante la instalación. No hay credenciales predeterminadas en el paquete.</p>
</section>
