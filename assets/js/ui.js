/* Normia Planos CAD · tooltips únicos, toasts, diálogos y menús. */
(() => {
  'use strict';
  if (window.NormiaUI) return;

  let tooltip = null;
  let tooltipTimer = null;
  let tooltipTarget = null;
  let dialog = null;
  let dialogResolve = null;

  const ensureTooltip = () => {
    if (tooltip && document.body.contains(tooltip)) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.id = 'normia-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  };

  const hideTooltip = () => {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    tooltipTarget = null;
    if (tooltip) {
      tooltip.hidden = true;
      tooltip.textContent = '';
      tooltip.removeAttribute('data-visible');
    }
  };

  const positionTooltip = (target) => {
    const element = ensureTooltip();
    const text = target.getAttribute('data-tooltip') || '';
    if (!text) return;
    const rect = target.getBoundingClientRect();
    element.textContent = text;
    element.hidden = false;
    element.dataset.visible = 'true';
    const tip = element.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tip.width / 2;
    let top = rect.top - tip.height - 9;
    if (top < 6) top = rect.bottom + 9;
    left = Math.max(8, Math.min(window.innerWidth - tip.width - 8, left));
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  };

  const scheduleTooltip = (target) => {
    if (!target || !target.getAttribute('data-tooltip')) return;
    if (target === tooltipTarget) return;
    hideTooltip();
    tooltipTarget = target;
    tooltipTimer = window.setTimeout(() => {
      tooltipTimer = null;
      if (tooltipTarget !== target || !document.body.contains(target)) return;
      positionTooltip(target);
    }, 280);
  };

  const closestTooltip = (node) => (node instanceof Element ? node.closest('[data-tooltip]') : null);

  const initTooltips = (root = document) => {
    if (root.__normiaTooltips) return;
    root.__normiaTooltips = true;
    ensureTooltip();
    root.addEventListener('mouseover', (event) => {
      const target = closestTooltip(event.target);
      if (target) scheduleTooltip(target);
    });
    root.addEventListener('mouseout', (event) => {
      const target = closestTooltip(event.target);
      if (!target) return;
      const related = event.relatedTarget instanceof Element ? event.relatedTarget.closest?.('[data-tooltip]') : null;
      if (related !== target) hideTooltip();
    });
    root.addEventListener('focusin', (event) => {
      const target = closestTooltip(event.target);
      if (target) scheduleTooltip(target);
    });
    root.addEventListener('focusout', hideTooltip);
    root.addEventListener('pointerdown', hideTooltip, true);
    root.addEventListener('scroll', hideTooltip, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideTooltip();
    });
    window.addEventListener('blur', hideTooltip);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hideTooltip();
    });
  };

  const toast = (message, type = 'info', options = {}) => {
    let stack = document.querySelector('[data-toast-stack]');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.dataset.toastStack = '';
      document.body.appendChild(stack);
    }
    const element = document.createElement('div');
    element.className = `toast toast-${type}`;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg class="icon"><use href="#i-' + (type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info') + '"></use></svg>';
    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Cerrar mensaje');
    close.innerHTML = '<svg class="icon"><use href="#i-close"></use></svg>';
    close.addEventListener('click', () => element.remove());
    element.append(icon, text, close);
    stack.appendChild(element);
    const delay = options.duration || (type === 'error' ? 7000 : 4600);
    window.setTimeout(() => {
      if (element.isConnected) {
        element.classList.add('is-leaving');
        window.setTimeout(() => element.remove(), 220);
      }
    }, delay);
    return element;
  };

  const ensureDialog = () => {
    if (dialog && document.body.contains(dialog)) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    dialog.innerHTML = '<form method="dialog" class="dialog-card"><span class="dialog-icon"><svg class="icon"><use href="#i-alert"></use></svg></span><h2 class="dialog-title">Confirmar acción</h2><p class="dialog-message"></p><div class="dialog-actions"><button class="button button-ghost" value="cancel" data-dialog-cancel>Cancelar</button><button class="button button-danger" value="confirm" data-dialog-ok>Continuar</button></div></form>';
    document.body.appendChild(dialog);
    return dialog;
  };

  const confirm = (message, options = {}) => {
    if (typeof HTMLDialogElement === 'undefined') {
      return Promise.resolve(window.confirm(message));
    }
    const element = ensureDialog();
    element.querySelector('.dialog-message').textContent = message;
    element.querySelector('.dialog-title').textContent = options.title || 'Confirmar acción';
    element.querySelector('[data-dialog-ok]').textContent = options.confirmLabel || 'Continuar';
    element.showModal();
    return new Promise((resolve) => {
      dialogResolve = resolve;
      const onClose = () => {
        element.removeEventListener('close', onClose);
        const confirmed = element.returnValue === 'confirm';
        if (dialogResolve) {
          const finish = dialogResolve;
          dialogResolve = null;
          finish(confirmed);
        }
      };
      element.addEventListener('close', onClose);
      const ok = element.querySelector('[data-dialog-ok]');
      const cancel = element.querySelector('[data-dialog-cancel]');
      ok.onclick = () => {
        element.returnValue = 'confirm';
      };
      cancel.onclick = () => {
        element.returnValue = 'cancel';
      };
    });
  };

  const initMenus = (root = document) => {
    const closeAll = (except) => {
      root.querySelectorAll('[data-menu-toggle][aria-expanded="true"]').forEach((button) => {
        if (button === except) return;
        button.setAttribute('aria-expanded', 'false');
        const menu = button.parentElement?.querySelector('.menu');
        if (menu) menu.hidden = true;
      });
    };
    root.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-menu-toggle]');
      if (button) {
        event.preventDefault();
        const expanded = button.getAttribute('aria-expanded') === 'true';
        closeAll(button);
        button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        const menu = button.parentElement?.querySelector('.menu');
        if (menu) menu.hidden = expanded;
        return;
      }
      if (!event.target.closest?.('.menu')) closeAll();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAll();
    });
  };

  const initToasts = () => {
    document.addEventListener('click', (event) => {
      const close = event.target.closest?.('[data-toast-close]');
      if (close) close.closest('[data-toast]')?.remove();
    });
    document.querySelectorAll('[data-toast]').forEach((toastElement) => {
      window.setTimeout(() => {
        if (toastElement.isConnected) {
          toastElement.classList.add('is-leaving');
          window.setTimeout(() => toastElement.remove(), 220);
        }
      }, 5600);
    });
  };

  const initFileFields = () => {
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
      const wrap = input.closest('.file-field');
      const label = wrap?.querySelector('[data-file-name]');
      if (label) label.textContent = input.files?.[0]?.name || 'Ningún archivo seleccionado';
    });
  };

  const init = () => {
    initTooltips(document);
    initMenus(document);
    initToasts();
    initFileFields();
  };

  window.NormiaUI = { init, hideTooltip, toast, confirm, initTooltips, closeTooltip: hideTooltip };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
