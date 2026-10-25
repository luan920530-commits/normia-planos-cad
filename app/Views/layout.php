<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#0f172a">
  <title><?= e($title ?? 'Normia Planos CAD') ?> · Normia Planos CAD</title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="<?= e($bodyClass ?? '') ?>">
<?php \App\Core\View::partial('partials/icons'); ?>
<a class="skip-link" href="#contenido">Saltar al contenido</a>
<header class="site-header">
  <a class="brand" href="<?= e(url('')) ?>" aria-label="Normia Planos CAD · inicio">
    <span class="brand-mark"><svg class="icon"><use href="#i-logo"></use></svg></span>
    <span class="brand-text"><strong>Normia</strong><small>Planos CAD</small></span>
  </a>
  <?php if (!empty($user)): ?>
    <nav class="site-nav" aria-label="Navegación principal">
      <a class="nav-link" href="<?= e(url('')) ?>"><svg class="icon"><use href="#i-grid"></use></svg><span>Mis planos</span></a>
      <a class="nav-link" href="<?= e(url('projects/new')) ?>"><svg class="icon"><use href="#i-plus"></use></svg><span>Nuevo</span></a>
    </nav>
    <div class="account-menu">
      <a class="account-chip" href="<?= e(url('account/password')) ?>" data-tooltip="Cuenta y contraseña">
        <span class="avatar" aria-hidden="true"><?= e(strtoupper(substr((string) ($user['name'] ?? 'N'), 0, 1))) ?></span>
        <span class="account-name"><?= e($user['name'] ?? '') ?></span>
      </a>
      <form method="post" action="<?= e(url('logout')) ?>" class="inline-form">
        <?= csrf_field() ?>
        <button class="icon-button" type="submit" data-tooltip="Cerrar sesión" aria-label="Cerrar sesión">
          <svg class="icon"><use href="#i-logout"></use></svg>
        </button>
      </form>
    </div>
  <?php endif; ?>
</header>
<main id="contenido" class="page">
  <?php \App\Core\View::partial('partials/flashes', ['flashes' => $flashes]); ?>
  <?= $content ?>
</main>
<footer class="site-footer">
  <p>Representaciones CAD esquemáticas. Las dimensiones, rutas y la escala deben verificarse en sitio por una persona competente. Esta herramienta no certifica ni aprueba planos automáticamente.</p>
  <p class="footer-meta">Pictogramas ISO 7010 locales · atribuciones incluidas en el README · Normia Planos CAD <?= e(NORMA_VERSION) ?></p>
</footer>
<script src="<?= e(asset('js/ui.js')) ?>" defer></script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
</body>
</html>
