/*
 * Normia Planos CAD · pantalla de bienvenida.
 *
 * La retira cuando la página terminó de cargar, con un mínimo breve para que
 * la animación no parpadee y un máximo de seguridad para que nunca estorbe.
 * Si el sistema pide menos movimiento, se retira casi de inmediato.
 */
(() => {
  'use strict';
  const MIN_MS = 700;
  const MAX_MS = 3000;
  const start = Date.now();
  let done = false;

  const reduced = () => {
    try {
      return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (error) {
      return false;
    }
  };

  const status = () => document.querySelector('[data-splash-status]');

  const finish = () => {
    if (done) return;
    done = true;
    const splash = document.querySelector('[data-splash]');
    if (!splash) return;
    splash.dataset.state = 'done';
    splash.setAttribute('aria-hidden', 'true');
    // Se quita del documento después de la transición para no dejar una capa
    // invisible sobre la página.
    window.setTimeout(() => splash.remove(), 620);
  };

  const ready = () => {
    const wait = reduced() ? 120 : Math.max(0, MIN_MS - (Date.now() - start));
    window.setTimeout(finish, wait);
  };

  window.setTimeout(finish, MAX_MS);

  if (document.readyState === 'complete') {
    ready();
  } else {
    window.addEventListener('load', ready, { once: true });
  }

  // Cuando el editor arranca, aprovecha el texto del splash para contar qué
  // está preparando, sin alargar la espera.
  const editor = document.querySelector('[data-editor-app]');
  if (editor) {
    const label = status();
    if (label) label.textContent = 'Preparando el editor y el plano';
  }
})();
