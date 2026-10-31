<?php
/**
 * Pantalla de bienvenida mientras carga la aplicación.
 *
 * Es puramente decorativa: no retrasa ni bloquea la carga. El CSS la retira
 * sola a los pocos segundos y `assets/js/splash.js` la quita antes, cuando la
 * página terminó de cargar. Si no hay JavaScript, la animación CSS la deja
 * fuera de la vista y sin capturar clics.
 */
$splashTitle = $splashTitle ?? 'Preparando el espacio de trabajo';
$splashLines = $splashLines ?? ['Cargando el lienzo y la señalización', 'Preparando la biblioteca de equipos', 'Casi listo'];
?>
<div class="app-splash" data-splash role="status" aria-live="polite" aria-label="<?= e($splashTitle) ?>">
  <div class="app-splash-glow" aria-hidden="true"></div>
  <div class="app-splash-grid" aria-hidden="true"></div>
  <div class="app-splash-card">
    <span class="app-splash-emblem">
      <img src="<?= e(asset('img/normia-logo.png')) ?>" alt="" width="128" height="128" decoding="async">
      <span class="app-splash-ring" aria-hidden="true"></span>
    </span>
    <p class="app-splash-word">Normia</p>
    <p class="app-splash-sub">Planos CAD</p>
    <div class="app-splash-track" aria-hidden="true"><span class="app-splash-bar"></span></div>
    <p class="app-splash-status" data-splash-status><?= e($splashLines[0]) ?></p>
    <p class="app-splash-foot">Planos de emergencia esquemáticos · <?= e(NORMA_VERSION) ?></p>
  </div>
</div>
<script src="<?= e(asset('js/splash.js')) ?>" defer></script>
