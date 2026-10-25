<section class="error-page">
  <span class="error-code"><?= e($status ?? 500) ?></span>
  <h1><?= e(($status ?? 500) === 404 ? 'No encontramos esta página' : 'No pudimos completar la acción') ?></h1>
  <p><?= e($message ?? 'Inténtalo de nuevo.') ?></p>
  <div class="error-actions">
    <a class="button button-primary" href="<?= e(url('')) ?>">Ir a mis planos</a>
    <a class="button button-ghost" href="<?= e(url('login')) ?>">Iniciar sesión</a>
  </div>
</section>
