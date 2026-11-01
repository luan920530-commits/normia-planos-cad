<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#0f172a">
  <title><?= e($title ?? 'Acceso') ?> · Normia Planos CAD</title>
  <meta name="theme-color" content="#0b1220">
  <link rel="icon" href="<?= e(asset('img/favicon-32.png')) ?>" sizes="32x32" type="image/png">
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="apple-touch-icon" href="<?= e(asset('img/apple-touch-icon.png')) ?>">
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="auth-body">
<?php \App\Core\View::partial('partials/icons'); ?>
<?php \App\Core\View::partial('partials/splash', ['splashTitle' => 'Abriendo Normia Planos CAD', 'splashLines' => ['Comprobando la sesión', 'Preparando el acceso']]); ?>
<main class="auth-shell">
  <div class="auth-brand">
    <span class="brand-mark"><img src="<?= e(asset('img/normia-emblem.png')) ?>" alt="" width="48" height="48" decoding="async"></span>
    <div><strong>Normia</strong><span>Planos CAD</span></div>
  </div>
  <?php \App\Core\View::partial('partials/flashes', ['flashes' => $flashes]); ?>
  <?= $content ?>
  <p class="auth-foot">Planos de emergencia, evacuación y distribución de espacios. Representación esquemática; verifica dimensiones y escala en sitio.</p>
  <p class="auth-creditos">
    <strong>Luis Antonio Aguilar R</strong> · profesional en Seguridad y Salud en el Trabajo · Universidad Autónoma de Nariño
  </p>
</main>
<script src="<?= e(asset('js/ui.js')) ?>" defer></script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
</body>
</html>
