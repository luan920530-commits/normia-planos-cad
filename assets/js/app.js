/* Normia Planos CAD · interacciones de páginas fuera del editor. */
(() => {
  'use strict';
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const message = form.getAttribute('data-confirm');
    if (!message) return;
    if (form.dataset.confirmed === '1') {
      delete form.dataset.confirmed;
      return;
    }
    event.preventDefault();
    const go = () => {
      form.dataset.confirmed = '1';
      form.submit();
    };
    if (window.NormiaUI?.confirm) {
      window.NormiaUI.confirm(message).then((confirmed) => {
        if (confirmed) go();
      });
    } else if (window.confirm(message)) {
      go();
    }
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[data-confirm]');
    if (!link) return;
    event.preventDefault();
    const go = () => window.location.assign(link.href);
    if (window.NormiaUI?.confirm) window.NormiaUI.confirm(link.dataset.confirm).then((ok) => { if (ok) go(); });
    else if (window.confirm(link.dataset.confirm)) go();
  });
})();
