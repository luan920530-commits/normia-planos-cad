/*
 * Normia Planos CAD · verificación física.
 *
 * Mejora progresiva: sin JavaScript los formularios funcionan igual (envío
 * normal y recarga). Con JavaScript la marca se guarda sin salir de la lista,
 * se actualiza el estado del elemento y se conserva el modo ronda.
 */
(() => {
  'use strict';

  const MODE_KEY = 'normia.verif.round';
  const body = document.body;
  const modeButton = document.querySelector('[data-verif-round-mode]');
  const statusLabels = { ok: 'Verificado', issue: 'Con novedad', pending: 'Pendiente' };

  const applyMode = (on) => {
    body.classList.toggle('verif-round-mode', on);
    modeButton?.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  let mode = false;
  try {
    mode = window.localStorage.getItem(MODE_KEY) === '1';
  } catch {
    mode = false;
  }
  applyMode(mode);

  modeButton?.addEventListener('click', () => {
    mode = !body.classList.contains('verif-round-mode');
    applyMode(mode);
    try {
      window.localStorage.setItem(MODE_KEY, mode ? '1' : '0');
    } catch {
      /* sin almacenamiento el modo dura lo que la visita */
    }
  });

  const cardOf = (node) => node.closest('[data-verif-card]');

  const paint = (card, check) => {
    if (!card) return;
    ['is-ok', 'is-issue', 'is-pending'].forEach((name) => card.classList.remove(name));
    card.classList.add(check.status === 'ok' ? 'is-ok' : check.status === 'issue' ? 'is-issue' : 'is-pending');
    const badge = card.querySelector('[data-verif-status]');
    if (badge) badge.textContent = check.label || statusLabels[check.status] || 'Pendiente';
    const last = card.querySelector('[data-verif-last]');
    if (last) {
      const when = check.checked_at ? check.checked_at.replace(' ', ' · ') : '';
      last.textContent = `${when} · ${check.author || ''}${check.note ? ` · «${check.note}»` : ''}`;
    }
    const stale = card.querySelector('.verif-stale');
    if (stale) stale.remove();
  };

  document.querySelectorAll('form[data-verif-form][enctype]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      const button = event.submitter;
      if (!button || button.name !== 'status') return;
      if (typeof window.fetch !== 'function') return;
      event.preventDefault();
      const card = cardOf(form);
      const data = new FormData(form);
      data.set('status', button.value);
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Guardando…';
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: data,
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'No se pudo guardar la verificación.');
        }
        paint(card, payload.check);
        form.querySelector('textarea[name="note"]')?.blur();
      } catch (error) {
        // Si algo falla se envía el formulario normal para no perder la marca.
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'status';
        hidden.value = button.value;
        form.appendChild(hidden);
        button.disabled = false;
        button.textContent = original;
        HTMLFormElement.prototype.submit.call(form);
        return;
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });
})();
