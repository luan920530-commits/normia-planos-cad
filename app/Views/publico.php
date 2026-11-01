<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#0b1220">
  <title><?= e($title ?? 'Planos de emergencia y evacuación') ?> · Normia Planos CAD</title>
  <meta name="description" content="<?= e($description ?? 'Editor de planos de emergencia y evacuación con señalización ISO 7010, rutas medidas, extintores y verificación en campo.') ?>">
  <link rel="icon" href="<?= e(asset('img/favicon-32.png')) ?>" sizes="32x32" type="image/png">
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="apple-touch-icon" href="<?= e(asset('img/apple-touch-icon.png')) ?>">
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('css/presentacion.css')) ?>">
</head>
<body class="presentacion-body">
<?php \App\Core\View::partial('partials/icons'); ?>
<a class="skip-link" href="#contenido">Saltar al contenido</a>
<header class="pres-topbar">
  <a class="pres-brand" href="<?= e(url('inicio')) ?>" aria-label="Normia Planos CAD · inicio">
    <span class="pres-brand-mark"><img src="<?= e(asset('img/normia-emblem.png')) ?>" alt="" width="44" height="44" decoding="async"></span>
    <span class="pres-brand-text"><strong>Normia</strong><span>Planos CAD</span></span>
  </a>
  <nav class="pres-nav" aria-label="Secciones de la presentación">
    <a href="#funciones">Funciones</a>
    <a href="#capturas">Capturas</a>
    <a href="#distribucion">Descargas</a>
  </nav>
  <p class="pres-topbar-actions">
    <?php if (!empty($user)): ?>
      <a class="pres-button pres-button-secondary" href="<?= e(url('')) ?>">Ir al panel</a>
    <?php else: ?>
      <a class="pres-button pres-button-primary" href="#acceso">Entrar</a>
    <?php endif; ?>
  </p>
</header>
<main id="contenido">
  <?= $content ?>
</main>
<footer class="pres-footer">
  <div class="pres-wrap pres-footer-grid">
    <div>
      <p class="pres-footer-brand"><strong>Normia Planos CAD</strong> · versión <?= e(defined('NORMA_VERSION') ? (string) constant('NORMA_VERSION') : '') ?></p>
      <p class="pres-footer-note">Representación esquemática. Verifica medidas, escalas y rutas en el sitio antes de usarlas como referencia de obra. No es un dictamen ni certifica cumplimiento normativo.</p>
      <p class="pres-footer-autor">
        <svg class="icon" aria-hidden="true"><use href="#i-user"></use></svg>
        <span>
          <strong>Luis Antonio Aguilar R</strong><br>
          Profesional en Seguridad y Salud en el Trabajo<br>
          Universidad Autónoma de Nariño
        </span>
      </p>
      <p class="pres-footer-autor pres-footer-autor-ia">
        Hecha con <strong>Arena.ai · Agent Mode</strong>, el asistente de programación en línea que acompañó el diseño y las pruebas de cada entrega.
      </p>
    </div>
    <ul class="pres-footer-links">
      <li><a href="#funciones">Funciones</a></li>
      <li><a href="#capturas">Capturas</a></li>
      <li><a href="#distribucion">Descargas</a></li>
      <li><a href="<?= e(url('login')) ?>">Acceso</a></li>
    </ul>
  </div>
  <p class="pres-footer-legal">Los planos de las capturas pertenecen al proyecto de ejemplo de la aplicación y son ficticios. Las marcas y normas citadas pertenecen a sus titulares.</p>
</footer>
<script src="<?= e(asset('js/presentacion.js')) ?>" defer></script>
</body>
</html>
