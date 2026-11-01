/*
 * Normia Planos CAD · modo brigadista.
 *
 * Página pública de emergencia: atenúa el plano por acción rápida, maneja el
 * zoom, el alto contraste y la copia del plan en el dispositivo. Sin
 * dependencias, sin recursos externos y sin controles que no hagan nada.
 */
(() => {
  'use strict';

  const bootNode = document.getElementById('brigade-boot');
  const root = document.documentElement;
  if (!bootNode) return;
  let boot;
  try {
    boot = JSON.parse(bootNode.textContent || '{}');
  } catch {
    return;
  }
  const token = String(boot.token || '');
  if (!token) return;

  const PREFIX = 'normia.brigade.';
  const metaKey = `${PREFIX}${token}.meta`;
  const contrastKey = `${PREFIX}contrast`;
  const cachePrefix = 'normia-brigade';
  const q = (selector, scope = document) => scope.querySelector(selector);
  const qa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const plan = q('[data-brigade-plan]') || q('.brigade-plan');
  const svg = plan ? q('svg', plan) : null;
  const hint = q('[data-brigade-hint]');
  const offlineBanner = q('[data-brigade-offline]');
  const savedBanner = q('[data-brigade-saved]');
  const updatedLabel = q('[data-brigade-updated]');
  const clearStatus = q('[data-brigade-clear-status]');
  const groups = boot.groups || {};
  let active = '';
  let originalViewBox = svg ? (svg.getAttribute('viewBox') || '') : '';
  let currentViewBox = originalViewBox;

  const say = (message) => {
    if (hint) hint.textContent = message;
  };

  const readMeta = () => {
    try {
      const raw = window.localStorage.getItem(metaKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeMeta = (meta) => {
    try {
      window.localStorage.setItem(metaKey, JSON.stringify(meta));
    } catch {
      /* el dispositivo puede tener el almacenamiento lleno o bloqueado */
    }
  };

  /* ------------------------------- acciones ------------------------------- */

  const groupsOf = (ids) => ids
    .map((id) => q(`g[data-element="${String(id).replace(/"/g, '\\"')}"]`, svg || document))
    .filter(Boolean);

  const viewBoxOf = (nodes) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((node) => {
      if (typeof node.getBBox !== 'function') return;
      const box = node.getBBox();
      if (!Number.isFinite(box.width) || box.width <= 0) return;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    });
    if (!Number.isFinite(minX) || maxX <= minX) return '';
    const padX = Math.max((maxX - minX) * 0.12, 40);
    const padY = Math.max((maxY - minY) * 0.12, 40);
    return [minX - padX, minY - padY, (maxX - minX) + padX * 2, (maxY - minY) + padY * 2]
      .map((value) => Math.round(value * 10) / 10)
      .join(' ');
  };

  const setViewBox = (value) => {
    if (!svg || !value) return;
    svg.setAttribute('viewBox', value);
    currentViewBox = value;
  };

  const clearFilter = () => {
    qa('g[data-element]', svg || document).forEach((node) => {
      node.classList.remove('is-dim');
      node.classList.remove('is-focus');
    });
    qa('[data-brigade-filter]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
    setViewBox(originalViewBox);
    active = '';
    say('');
  };

  const applyFilter = (key) => {
    const ids = Array.isArray(groups[key]) ? groups[key] : [];
    if (!ids.length) {
      say(key === 'ruta'
        ? 'Este plano todavía no tiene ruta de evacuación dibujada.'
        : key === 'reunion'
          ? 'Este plano no tiene puntos de reunión marcados.'
          : 'Este plano no tiene extintores del catálogo.');
      return;
    }
    const focused = groupsOf(ids);
    qa('g[data-element]', svg || document).forEach((node) => {
      const on = focused.includes(node);
      node.classList.toggle('is-dim', !on);
      node.classList.toggle('is-focus', on);
    });
    qa('[data-brigade-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.brigadeFilter === key ? 'true' : 'false');
    });
    const box = viewBoxOf(focused);
    if (box) setViewBox(box);
    active = key;
    const labels = { ruta: 'ruta de evacuación y salidas', reunion: 'puntos de reunión', extintores: 'extintores' };
    say(`Mostrando ${focused.length} ${focused.length === 1 ? 'elemento' : 'elementos'} de ${labels[key]}. Toca otra vez para volver al plano completo.`);
  };

  qa('[data-brigade-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.brigadeFilter;
      if (active === key) {
        clearFilter();
        return;
      }
      applyFilter(key);
    });
  });

  qa('[data-brigade-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!svg) return;
      const action = button.dataset.brigadeZoom;
      if (action === 'reset' || active) {
        clearFilter();
        if (action === 'reset') return;
      }
      const box = (currentViewBox || originalViewBox).split(/\s+/).map(Number);
      if (box.length !== 4 || box.some((value) => !Number.isFinite(value))) return;
      const [x, y, w, h] = box;
      const factor = action === 'in' ? 0.8 : 1.25;
      const nextW = Math.max(40, w * factor);
      const nextH = Math.max(40, h * factor);
      setViewBox([
        x + (w - nextW) / 2,
        y + (h - nextH) / 2,
        nextW,
        nextH,
      ].map((value) => Math.round(value * 10) / 10).join(' '));
    });
  });

  /* --------------------------- alto contraste ---------------------------- */

  const contrastButton = q('[data-brigade-contrast]');
  const applyContrast = (on) => {
    root.classList.toggle('brigade-hc', on);
    contrastButton?.setAttribute('aria-pressed', on ? 'true' : 'false');
    const meta = q('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', on ? '#05070c' : '#0b1220');
  };
  let contrast = false;
  try {
    contrast = window.localStorage.getItem(contrastKey) === '1'
      || (window.localStorage.getItem(contrastKey) === null
        && window.matchMedia
        && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    contrast = false;
  }
  applyContrast(contrast);
  contrastButton?.addEventListener('click', () => {
    contrast = !root.classList.contains('brigade-hc');
    applyContrast(contrast);
    try {
      window.localStorage.setItem(contrastKey, contrast ? '1' : '0');
    } catch {
      /* sin almacenamiento: el estado vale solo para esta visita */
    }
  });

  /* -------------------- copia del plan en el dispositivo -------------------- */

  const showSaved = (meta) => {
    if (!savedBanner) return;
    const when = meta?.savedAt ? new Date(meta.savedAt) : null;
    if (!when) {
      savedBanner.hidden = true;
      return;
    }
    const label = when.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    savedBanner.textContent = `Plan guardado en este dispositivo a las ${label} para consultarlo sin conexión.`;
    savedBanner.hidden = false;
    window.setTimeout(() => { savedBanner.hidden = true; }, 6000);
  };

  const showOffline = (meta) => {
    if (!offlineBanner) return;
    const cached = q('[data-brigade-cached]', offlineBanner);
    if (cached) {
      const when = meta?.savedAt ? new Date(meta.savedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      cached.textContent = when ? ` el ${when}` : '';
    }
    offlineBanner.hidden = false;
  };

  const syncPlan = async () => {
    let meta = readMeta();
    if (navigator.onLine === false) {
      if (meta) {
        showOffline(meta);
        if (updatedLabel && meta.updatedLabel) updatedLabel.textContent = meta.updatedLabel;
      }
      return;
    }
    try {
      const response = await fetch(boot.dataUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('Sin datos');
      const data = await response.json();
      meta = {
        savedAt: new Date().toISOString(),
        updatedAt: data.updated_at || boot.updatedAt,
        updatedLabel: data.updated_label || boot.updatedLabel,
        groups: data.groups || groups,
        counts: {
          ruta: (data.groups?.ruta || []).length,
          reunion: (data.groups?.reunion || []).length,
          extintores: (data.groups?.extintores || []).length,
        },
      };
      writeMeta(meta);
      if (updatedLabel && meta.updatedLabel) updatedLabel.textContent = meta.updatedLabel;
      showSaved(meta);
      await askWorkerToCache();
    } catch {
      if (meta) {
        showOffline(meta);
        if (updatedLabel && meta.updatedLabel) updatedLabel.textContent = meta.updatedLabel;
      }
    }
  };

  /* ------------------------------ service worker ------------------------------ */

  let registration = null;
  const swSupported = 'serviceWorker' in navigator
    && (window.isSecureContext === true || ['localhost', '127.0.0.1'].includes(window.location.hostname));

  const askWorkerToCache = async () => {
    if (!registration) return;
    try {
      const worker = registration.active || registration.waiting || registration.installing;
      if (!worker) return;
      const assets = qa('link[rel="stylesheet"], script[src]').map((node) => node.href || node.src).filter(Boolean);
      worker.postMessage({
        type: 'normia-brigade-cache',
        urls: [window.location.href, boot.dataUrl, ...assets].filter(Boolean),
      });
    } catch {
      /* si el worker no responde, la copia en localStorage sigue vigente */
    }
  };

  if (swSupported) {
    navigator.serviceWorker.register(boot.swUrl, { scope: '/' })
      .then((value) => {
        registration = value;
        return navigator.serviceWorker.ready;
      })
      .then((value) => {
        registration = value;
        return askWorkerToCache();
      })
      .catch(() => {
        /* la página funciona igual; la copia del plan queda en el dispositivo */
      });
  }

  window.addEventListener('offline', () => showOffline(readMeta()));
  window.addEventListener('online', () => {
    if (offlineBanner) offlineBanner.hidden = true;
    syncPlan();
  });

  /* -------------------------- borrar datos locales -------------------------- */

  const clearEverything = async () => {
    let removed = 0;
    try {
      const keys = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(PREFIX)) keys.push(key);
      }
      keys.forEach((key) => {
        window.localStorage.removeItem(key);
        removed += 1;
      });
    } catch {
      /* sin almacenamiento no hay nada que borrar */
    }
    try {
      if (window.caches) {
        const names = await window.caches.keys();
        await Promise.all(names.filter((name) => name.startsWith(cachePrefix)).map((name) => window.caches.delete(name)));
      }
    } catch {
      /* el navegador puede bloquear la API de caché */
    }
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((item) => item.unregister()));
      }
    } catch {
      /* sin service worker registrado no hay nada que desregistrar */
    }
    if (offlineBanner) offlineBanner.hidden = true;
    if (savedBanner) savedBanner.hidden = true;
    clearFilter();
    if (clearStatus) {
      clearStatus.textContent = removed
        ? 'Datos borrados de este dispositivo. Si necesitas el plano otra vez, recarga la página.'
        : 'No había datos guardados en este dispositivo.';
    }
  };

  q('[data-brigade-clear]')?.addEventListener('click', () => { clearEverything(); });

  /* ------------------------------ arranque ------------------------------ */

  if (plan && !originalViewBox && svg) {
    originalViewBox = svg.getAttribute('viewBox') || '';
    currentViewBox = originalViewBox;
  }
  syncPlan();
})();
