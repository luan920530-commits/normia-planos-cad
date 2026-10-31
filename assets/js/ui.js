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
    // La barra lateral usa etiquetas laterales: el texto se lee como una
    // etiqueta pegada a la baldosa, no como un globo encima del icono.
    const side = (target.closest('[data-tooltip-side]') || target).getAttribute('data-tooltip-side');
    const tip = element.getBoundingClientRect();
    let left;
    let top;
    if (side === 'right') {
      left = rect.right + 10;
      top = rect.top + rect.height / 2 - tip.height / 2;
      element.dataset.side = 'right';
    } else {
      left = rect.left + rect.width / 2 - tip.width / 2;
      top = rect.top - tip.height - 9;
      if (top < 6) top = rect.bottom + 9;
      delete element.dataset.side;
    }
    left = Math.max(8, Math.min(window.innerWidth - tip.width - 8, left));
    top = Math.max(6, Math.min(window.innerHeight - tip.height - 6, top));
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

  /* ------------------------------- menús ------------------------------- */
  /*
   * Los menús viven en una capa propia al final del <body> mientras están
   * abiertos. Antes se abrían dentro de la tarjeta con `position: absolute`,
   * pero las tarjetas recortan su contenido (`overflow: hidden`) y el panel
   * quedaba fuera, invisible, bloqueando la zona de los botones. La capa es
   * `position: fixed`, así que ningún contenedor puede recortarlo.
   */
  let openMenuState = null;

  const menuLayer = () => {
    let layer = document.querySelector('[data-menu-layer]');
    if (!layer || !document.body.contains(layer)) {
      layer = document.createElement('div');
      layer.dataset.menuLayer = '';
      document.body.appendChild(layer);
    }
    return layer;
  };

  const menuFor = (button) => {
    // Mientras está abierto el menú vive en la capa, no en su envoltorio.
    if (openMenuState && openMenuState.button === button) return openMenuState.menu;
    const wrap = button.closest('.menu-wrap') || button.parentElement;
    return wrap?.querySelector('.menu') || null;
  };

  const placeMenu = (button, menu) => {
    const margin = 8;
    const gap = 6;
    const anchor = button.getBoundingClientRect();
    menu.style.top = '0px';
    menu.style.left = '0px';
    menu.style.maxHeight = '';
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
    const spaceBelow = viewportHeight - anchor.bottom - gap - margin;
    const spaceAbove = anchor.top - gap - margin;
    const opensBelow = height <= spaceBelow || spaceBelow >= spaceAbove;
    const available = Math.max(140, opensBelow ? spaceBelow : spaceAbove);
    if (height > available) menu.style.maxHeight = `${Math.round(available)}px`;
    const finalHeight = Math.min(height, available);
    let left = anchor.right - width;
    left = Math.max(margin, Math.min(viewportWidth - width - margin, left));
    let top = opensBelow ? anchor.bottom + gap : anchor.top - gap - finalHeight;
    top = Math.max(margin, Math.min(viewportHeight - finalHeight - margin, top));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.dataset.menuPlacement = opensBelow ? 'bottom' : 'top';
  };

  const focusablesIn = (menu) => Array.from(menu.querySelectorAll('a[href], button:not([disabled])'));

  const closeMenu = ({ focus = false, restore = true } = {}) => {
    const state = openMenuState;
    if (!state) return;
    openMenuState = null;
    state.menu.hidden = true;
    state.menu.removeAttribute('style');
    state.menu.removeAttribute('data-menu-placement');
    state.button.setAttribute('aria-expanded', 'false');
    if (restore && state.host?.isConnected) {
      if (state.next?.parentNode === state.host) state.host.insertBefore(state.menu, state.next);
      else state.host.appendChild(state.menu);
    }
    if (focus) state.button.focus();
  };

  const openMenu = (button, menu) => {
    closeMenu();
    const state = {
      button,
      menu,
      host: menu.parentElement,
      next: menu.nextSibling,
    };
    menuLayer().appendChild(menu);
    if (!menu.__normiaMenuKeys) {
      menu.__normiaMenuKeys = true;
      menu.addEventListener('keydown', (event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = focusablesIn(menu);
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement);
        let next = 0;
        if (event.key === 'End') next = items.length - 1;
        else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
        else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
        items[next].focus();
      });
      // Al elegir una opción el menú se cierra; el enlace o el formulario sigue su curso.
      menu.addEventListener('click', (event) => {
        if (event.target.closest?.('a[href], button')) window.setTimeout(() => closeMenu(), 0);
      });
      menu.addEventListener('submit', () => closeMenu({ restore: false }));
    }
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    openMenuState = state;
    placeMenu(button, menu);
  };

  const initMenus = (root = document) => {
    if (root.__normiaMenus) return;
    root.__normiaMenus = true;

    root.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-menu-toggle]');
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        const expanded = button.getAttribute('aria-expanded') === 'true';
        const menu = menuFor(button);
        if (!menu) return;
        if (expanded) {
          closeMenu({ focus: false });
          return;
        }
        openMenu(button, menu);
        // Si se abrió con el teclado, el foco entra en la primera opción.
        if (event.detail === 0) focusablesIn(menu)[0]?.focus();
        return;
      }
      if (!event.target.closest?.('[data-menu-layer]')) closeMenu();
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && openMenuState) {
        event.preventDefault();
        closeMenu({ focus: true });
      }
    });

    const reposition = () => {
      if (openMenuState) placeMenu(openMenuState.button, openMenuState.menu);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    // Si el botón o el menú desaparecen (navegación parcial), se cierra.
    document.addEventListener('focusin', (event) => {
      if (!openMenuState) return;
      const { menu, button } = openMenuState;
      if (event.target === menu || menu.contains(event.target) || event.target === button) return;
      closeMenu();
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
