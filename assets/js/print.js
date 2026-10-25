(() => {
  'use strict';
  const button = document.querySelector('[data-print-button]');
  if (!button) return;
  button.addEventListener('click', () => window.print());
})();
