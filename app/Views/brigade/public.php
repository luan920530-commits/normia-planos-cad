<?php
/** @var array $link */
/** @var string $svg */
/** @var array $boot */
/** @var string $updatedLabel */
$projectName = (string) $link['project_name'];
$site = trim((string) $link['project_site']);
$floorName = (string) $link['floor_name'];
$level = trim((string) $link['floor_level']);
$counts = $boot['counts'] ?? ['ruta' => 0, 'reunion' => 0, 'extintores' => 0];
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#0b1220">
  <title><?= e($projectName) ?> · <?= e($floorName) ?> · Modo brigadista</title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(asset('css/brigade.css')) ?>">
</head>
<body class="brigade">
<a class="brigade-skip" href="#plano">Ir al plano</a>
<header class="brigade-head">
  <div class="brigade-titles">
    <p class="brigade-eyebrow">Modo brigadista</p>
    <h1><?= e($projectName) ?></h1>
    <p class="brigade-floor"><?= e($floorName) ?><?= $level !== '' ? ' · ' . e($level) : '' ?><?= $site !== '' ? ' · ' . e($site) : '' ?></p>
    <p class="brigade-updated">Plano actualizado: <strong data-brigade-updated><?= e($updatedLabel) ?></strong></p>
  </div>
  <button class="brigade-contrast" type="button" data-brigade-contrast aria-pressed="false">
    <span class="brigade-contrast-dot" aria-hidden="true"></span>
    <span>Alto contraste</span>
  </button>
</header>

<main class="brigade-main" id="contenido">
  <p class="brigade-banner" data-brigade-offline hidden>
    Sin conexión: estás viendo la copia guardada en este dispositivo<span data-brigade-cached></span>.
  </p>
  <p class="brigade-banner is-ok" data-brigade-saved hidden>
    Plan guardado en este dispositivo para consultarlo sin conexión.
  </p>

  <nav class="brigade-quick" aria-label="Acciones rápidas">
    <button class="brigade-action" type="button" data-brigade-filter="ruta" aria-pressed="false">
      <svg class="brigade-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h6a3 3 0 0 0 3-3V7a3 3 0 0 1 3-3h4"/><path d="m17 2 3 2-3 2"/></svg>
      <span>Ruta de evacuación</span>
      <em><?= (int) $counts['ruta'] ?> en el plano</em>
    </button>
    <button class="brigade-action" type="button" data-brigade-filter="reunion" aria-pressed="false">
      <svg class="brigade-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M15.5 20c0-2.2 1.6-3.6 3.5-3.6 1.6 0 2.9 1 3 3"/></svg>
      <span>Puntos de reunión</span>
      <em><?= (int) $counts['reunion'] ?> en el plano</em>
    </button>
    <button class="brigade-action" type="button" data-brigade-filter="extintores" aria-pressed="false">
      <svg class="brigade-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="15" rx="2.5"/><path d="M10 6V4h4v2M16 9h3M12 3v1"/><path d="M10.5 11h3"/></svg>
      <span>Extintores</span>
      <em><?= (int) $counts['extintores'] ?> en el plano</em>
    </button>
    <a class="brigade-action is-call" href="tel:123">
      <svg class="brigade-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5 9 3l1.8 4.2-2 1.6a12 12 0 0 0 6.4 6.4l1.6-2L21 15l-.5 2.5A2.5 2.5 0 0 1 18 20 15 15 0 0 1 4 6a2.5 2.5 0 0 1 2.5-2.5Z"/></svg>
      <span>Llamar emergencias</span>
      <em>123 · verifica tu ciudad</em>
    </a>
  </nav>

  <div class="brigade-tools" role="group" aria-label="Zoom del plano">
    <button type="button" data-brigade-zoom="in" aria-label="Acercar">+</button>
    <button type="button" data-brigade-zoom="out" aria-label="Alejar">−</button>
    <button type="button" data-brigade-zoom="reset">Ajustar</button>
  </div>

  <figure class="brigade-plan" id="plano" tabindex="0" aria-label="Plano de <?= e($floorName) ?>">
    <?= $svg ?>
  </figure>

  <p class="brigade-hint" data-brigade-hint role="status" aria-live="polite"></p>

  <footer class="brigade-foot">
    <p class="brigade-note">Plano esquemático de consulta. No sustituye la señalización física, los simulacros ni la verificación en sitio; confirma las medidas en el edificio y sigue las instrucciones de la brigada.</p>
    <div class="brigade-foot-row">
      <button class="brigade-clear" type="button" data-brigade-clear>Salir y borrar datos del dispositivo</button>
      <span class="brigade-clear-status" data-brigade-clear-status role="status" aria-live="polite"></span>
    </div>
    <p class="brigade-credit">Normia Planos CAD <?= e(NORMA_VERSION) ?> · modo brigadista · enlace privado</p>
  </footer>
</main>

<script type="application/json" id="brigade-boot"><?= json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
<script src="<?= e(asset('js/brigade.js')) ?>"></script>
</body>
</html>
