<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#0f172a">
  <title><?= e($title ?? 'Acceso') ?> · Normia Planos CAD</title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="auth-body">
<?php \App\Core\View::partial('partials/icons'); ?>
<main class="auth-shell">
  <div class="auth-brand">
    <span class="brand-mark"><svg class="icon"><use href="#i-logo"></use></svg></span>
    <div><strong>Normia</strong><span>Planos CAD</span></div>
  </div>
  <?php \App\Core\View::partial('partials/flashes', ['flashes' => $flashes]); ?>
  <?= $content ?>
  <p class="auth-foot">Planos de emergencia, evacuación y distribución de espacios. Representación esquemática; verifica dimensiones y escala en sitio.</p>
</main>
<script src="<?= e(asset('js/ui.js')) ?>" defer></script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
</body>
</html>
