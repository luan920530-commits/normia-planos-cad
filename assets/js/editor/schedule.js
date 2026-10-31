/* Normia Planos CAD · pliego de señalización (inventario de compra). */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const number = (value, decimals = 0) => (Number.isFinite(Number(value))
    ? Number(value).toLocaleString('es-CO', { maximumFractionDigits: decimals })
    : '—');

  const money = (value) => (Number.isFinite(Number(value)) && Number(value) > 0
    ? `$ ${Number(value).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
    : '—');

  const PRICE_KEY = 'normia.schedule.prices';

  /** Unidad del lienzo → centímetros. El editor trabaja en cm por defecto. */
  const cmPerUnit = (unit) => ({ m: 100, mm: 0.1, cm: 1 }[unit] ?? 1);

  /** Tamaño de lámina sugerido según el área del piso (referencia de compra). */
  const suggestedSize = (areaM2) => {
    if (areaM2 <= 150) return { mm: 150, label: 'Pequeño · 150 mm' };
    if (areaM2 <= 600) return { mm: 300, label: 'Mediano · 300 mm' };
    return { mm: 450, label: 'Grande · 450 mm' };
  };

  /**
   * Equipos que deben tener su señal cerca. La distancia es una referencia de
   * montaje, no una exigencia normativa: el radio se ajusta por tipo.
   */
  const REQUIRED_SIGNS = [
    { key: 'extintor', test: /extint|extingu/i, code: 'F001', radiusM: 8, label: 'Extintor' },
    { key: 'botiquin', test: /botiqu|first_aid/i, code: 'E003', radiusM: 8, label: 'Botiquín' },
    { key: 'hidrante', test: /hidrante|hydrant/i, code: 'F002', radiusM: 10, label: 'Hidrante' },
    { key: 'alarma', test: /alarma|alarm/i, code: 'F005', radiusM: 10, label: 'Pulsador de alarma' },
  ];

  class Schedule {
    constructor(app) {
      this.app = app;
      const doc = app.window?.document || (typeof document === 'undefined' ? null : document);
      this.drawer = doc?.querySelector('[data-drawer="schedule"]') || null;
      this.host = this.drawer?.querySelector('[data-schedule-content]') || null;
      this.runButton = this.drawer?.querySelector('[data-schedule-run]') || null;
      this.csvButton = this.drawer?.querySelector('[data-schedule-csv]') || null;
      this.copyButton = this.drawer?.querySelector('[data-schedule-copy]') || null;
      this.prices = this.loadPrices();
      this.rows = [];
      this.checks = [];
      this.areaM2 = 0;
      this.size = suggestedSize(0);
      this.computed = false;
      this.bind();
    }

    loadPrices() {
      try {
        const raw = this.app.window?.localStorage?.getItem(PRICE_KEY);
        const value = raw ? JSON.parse(raw) : {};
        return value && typeof value === 'object' ? value : {};
      } catch (error) {
        return {};
      }
    }

    savePrices() {
      try {
        this.app.window?.localStorage?.setItem(PRICE_KEY, JSON.stringify(this.prices));
      } catch (error) {
        /* Sin almacenamiento local los precios duran solo la sesión. */
      }
    }

    bind() {
      this.runButton?.addEventListener('click', () => this.run());
      this.csvButton?.addEventListener('click', () => {
        const csv = this.csv();
        if (!this.rows.length) {
          this.app.toast?.('No hay señales en el plano todavía.', 'info');
          return;
        }
        this.download(csv, 'pliego-senalizacion.csv');
        this.app.toast?.('Pliego descargado en CSV.', 'success', { duration: 2400 });
      });
      this.copyButton?.addEventListener('click', async () => {
        if (!this.rows.length) {
          this.app.toast?.('No hay señales en el plano todavía.', 'info');
          return;
        }
        try {
          await this.app.window?.navigator?.clipboard?.writeText?.(this.tsv());
          this.app.toast?.('Tabla copiada: pégala en Excel.', 'success', { duration: 2400 });
        } catch (error) {
          this.app.toast?.('No se pudo copiar. Descarga el CSV.', 'error');
        }
      });
      this.host?.addEventListener('input', (event) => {
        const field = event.target.closest('[data-schedule-price]');
        if (!field) return;
        const code = field.dataset.schedulePrice;
        const value = Math.max(0, Number(field.value) || 0);
        this.prices[code] = value;
        this.savePrices();
        this.renderTotals();
      });
      this.host?.addEventListener('click', (event) => {
        const locate = event.target.closest('[data-schedule-locate]');
        if (locate) {
          const ids = String(locate.dataset.scheduleLocate || '').split(',').filter(Boolean);
          if (!ids.length) return;
          this.app.model.select(ids);
          this.app.scheduleRender?.();
          this.app.toast?.(`${ids.length} elemento${ids.length === 1 ? '' : 's'} seleccionado${ids.length === 1 ? '' : 's'} en el plano.`, 'info', { duration: 2200 });
        }
      });
    }

    open() {
      this.run({ silent: true });
    }

    /** El plano cambió: el pliego queda marcado como desactualizado. */
    invalidate() {
      if (!this.computed) return;
      const wasStale = this.stale;
      this.stale = true;
      if (this.app.activeDrawer === 'schedule') {
        // Un arrastre dispara muchos cambios: se recalcula una sola vez.
        this.app.window?.clearTimeout?.(this.timer);
        this.timer = this.app.window?.setTimeout?.(() => this.run({ silent: true }), 220);
        return;
      }
      if (!wasStale && this.host) {
        this.host.insertAdjacentHTML('afterbegin', '<p class="schedule-stale">El plano cambió. Pulsa <strong>Recalcular</strong> para actualizar el pliego.</p>');
      }
    }

    /** Recorre el diseño y agrupa señales, equipos y avisos de consistencia. */
    run(options = {}) {
      const model = this.app.model;
      const catalogs = this.app.catalogs || {};
      const canvas = model.design.canvas;
      const unitCm = cmPerUnit(canvas.unit);
      this.areaM2 = (Number(canvas.width) * unitCm / 100) * (Number(canvas.height) * unitCm / 100);
      this.size = suggestedSize(this.areaM2);
      const layers = model.layers ? model.layers() : [];
      const layerName = (id) => layers.find((layer) => layer.id === id)?.name || 'Sin capa';
      const groups = new Map();
      const signs = [];
      const equipment = [];
      const elements = model.elements();

      for (const element of elements) {
        const code = model.signCodeForType(element.type);
        if (code) {
          const sign = catalogs.signs?.[code] || {};
          const category = sign.category || '';
          const family = catalogs.signCategories?.[category]?.short
            || catalogs.signCategories?.[category]?.label
            || 'Señal';
          const key = code;
          const group = groups.get(key) || {
            code,
            name: sign.name || code,
            family,
            color: catalogs.signColors?.[category] || '#334155',
            count: 0,
            layers: new Set(),
            ids: [],
          };
          group.count += 1;
          group.layers.add(layerName(element.layerId));
          group.ids.push(element.id);
          groups.set(key, group);
          signs.push({ element, code });
          continue;
        }
        if (String(element.type).startsWith('cad_')) {
          equipment.push(element);
        }
      }

      const rows = Array.from(groups.values()).map((group) => ({
        ...group,
        layers: Array.from(group.layers).sort(),
        locations: '',
      }));
      rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
      this.rows = rows;

      const metersPerUnit = unitCm / 100;
      const checks = [];
      for (const item of REQUIRED_SIGNS) {
        for (const device of equipment.filter((element) => item.test.test(String(element.type)))) {
          const center = G.centerOf(device);
          const near = signs
            .filter((sign) => sign.code === item.code)
            .map((sign) => ({ sign, distance: G.distance(center, G.centerOf(sign.element)) * metersPerUnit }))
            .filter((entry) => entry.distance <= item.radiusM)
            .sort((a, b) => a.distance - b.distance)[0];
          if (!near) {
            checks.push({
              type: 'missing',
              title: `${item.label} sin su señal ${item.code}`,
              detail: `No hay una señal ${item.code} a menos de ${item.radiusM} m del equipo. Añádela o acércala para que el montaje sea visible desde el puesto de trabajo.`,
              ids: [device.id],
            });
          }
        }
      }
      const routes = elements.filter((element) => element.type === 'route');
      const exitSigns = signs.filter((sign) => sign.code === 'E002');
      for (const route of routes) {
        const points = route.points || [];
        if (points.length < 2 || !exitSigns.length) continue;
        const end = { x: route.x + points[points.length - 1].x, y: route.y + points[points.length - 1].y };
        const nearest = exitSigns
          .map((sign) => G.distance(end, G.centerOf(sign.element)) * metersPerUnit)
          .sort((a, b) => a - b)[0];
        if (nearest !== undefined && nearest > 12) {
          checks.push({
            type: 'route',
            title: 'Ruta sin señal de salida cerca',
            detail: `El final de la ruta queda a ${number(nearest, 1)} m de la señal de salida más cercana. Revisa la señalización del punto de llegada.`,
            ids: [route.id],
          });
        }
      }
      this.checks = checks;
      this.computed = true;
      this.stale = false;
      this.render();
      if (!options.silent) this.app.toast?.('Pliego actualizado.', 'info', { duration: 1800 });
      return this.summary();
    }

    summary() {
      const total = this.rows.reduce((sum, row) => sum + row.count, 0);
      const families = new Set(this.rows.map((row) => row.family));
      const priced = this.rows.every((row) => Number(this.prices[row.code]) > 0);
      const cost = this.rows.reduce((sum, row) => sum + row.count * (Number(this.prices[row.code]) || 0), 0);
      return {
        total,
        families: families.size,
        checks: this.checks.length,
        areaM2: this.areaM2,
        size: this.size,
        priced,
        cost,
      };
    }

    render() {
      if (!this.host) return;
      const summary = this.summary();
      if (!this.rows.length) {
        this.host.innerHTML = '<p class="schedule-empty">El plano no tiene señales todavía. Coloca pictogramas desde la biblioteca y vuelve a calcular el pliego.</p>';
        return;
      }
      const rows = this.rows.map((row) => {
        const price = Number(this.prices[row.code]) || 0;
        const subtotal = price * row.count;
        return `
          <tr>
            <td><span class="schedule-swatch" style="--schedule-color:${esc(row.color)}" aria-hidden="true"></span><code>${esc(row.code)}</code></td>
            <td>${esc(row.name)}<small>${esc(row.family)}</small></td>
            <td class="schedule-num">${number(row.count)}</td>
            <td>${esc(this.size.label)}</td>
            <td>${esc(row.layers.join(' · '))}</td>
            <td><label class="schedule-price"><span class="visually-hidden">Precio unitario de ${esc(row.name)}</span>
              <input type="number" min="0" step="500" inputmode="numeric" value="${price || ''}" placeholder="0" data-schedule-price="${esc(row.code)}"></label></td>
            <td class="schedule-num" data-schedule-subtotal="${esc(row.code)}">${subtotal ? money(subtotal) : '—'}</td>
            <td><button class="schedule-locate" type="button" data-schedule-locate="${esc(row.ids.join(','))}" title="Seleccionar en el plano">Ver</button></td>
          </tr>`;
      }).join('');
      const checks = this.checks.length
        ? `<ul class="schedule-checks">${this.checks.map((check) => `
            <li>
              <svg class="icon"><use href="#i-alert"></use></svg>
              <div><strong>${esc(check.title)}</strong><p>${esc(check.detail)}</p></div>
              <button class="schedule-locate" type="button" data-schedule-locate="${esc(check.ids.join(','))}">Ver</button>
            </li>`).join('')}</ul>`
        : '<p class="schedule-ok">Equipos y salidas con su señal cerca: no hay avisos de consistencia.</p>';
      this.host.innerHTML = `
        <dl class="schedule-stats">
          <div><dt>Señales</dt><dd>${number(summary.total)}</dd></div>
          <div><dt>Códigos</dt><dd>${number(this.rows.length)}</dd></div>
          <div><dt>Familias</dt><dd>${number(summary.families)}</dd></div>
          <div><dt>Área del piso</dt><dd>${number(summary.areaM2, 0)} m²</dd></div>
          <div><dt>Tamaño sugerido</dt><dd>${esc(summary.size.label)}</dd></div>
          <div><dt>Total estimado</dt><dd data-schedule-total>${summary.priced ? money(summary.cost) : 'Sin precios'}</dd></div>
        </dl>
        <div class="schedule-table-wrap">
          <table class="schedule-table">
            <caption class="visually-hidden">Inventario de señales del plano</caption>
            <thead><tr><th scope="col">Código</th><th scope="col">Señal</th><th scope="col" class="schedule-num">Cant.</th><th scope="col">Lámina</th><th scope="col">Ubicación</th><th scope="col">Precio unit.</th><th scope="col" class="schedule-num">Subtotal</th><th scope="col"><span class="visually-hidden">Ver en el plano</span></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <section class="schedule-review">
          <h3>Consistencia <em>${number(this.checks.length)}</em></h3>
          ${checks}
        </section>
        <p class="schedule-note">Tamaño sugerido por área del piso (150 mm hasta 150 m², 300 mm hasta 600 m², 450 mm por encima). Es una guía de compra: la norma aplicable y el sitio mandan.</p>`;
    }

    renderTotals() {
      const summary = this.summary();
      const total = this.host?.querySelector('[data-schedule-total]');
      if (total) total.textContent = summary.priced ? money(summary.cost) : 'Sin precios';
      for (const row of this.rows) {
        const cell = this.host?.querySelector(`[data-schedule-subtotal="${row.code}"]`);
        if (!cell) continue;
        const price = Number(this.prices[row.code]) || 0;
        cell.textContent = price ? money(price * row.count) : '—';
      }
    }

    /** Filas del pliego como datos planos, para CSV y pruebas. */
    table() {
      return this.rows.map((row) => ({
        code: row.code,
        name: row.name,
        family: row.family,
        count: row.count,
        size: `${this.size.mm} mm`,
        layers: row.layers.join(' / '),
        price: Number(this.prices[row.code]) || 0,
        subtotal: (Number(this.prices[row.code]) || 0) * row.count,
      }));
    }

    csv() {
      const head = ['Código', 'Señal', 'Familia', 'Cantidad', 'Tamaño sugerido', 'Ubicación', 'Precio unitario', 'Subtotal'];
      const lines = this.table().map((row) => [
        row.code, row.name, row.family, row.count, row.size, row.layers, row.price || '', row.subtotal || '',
      ]);
      return `\uFEFF${[head, ...lines].map((line) => line.map((cell) => {
        const text = String(cell ?? '');
        return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      }).join(';')).join('\r\n')}\r\n`;
    }

    tsv() {
      const head = ['Código', 'Señal', 'Familia', 'Cantidad', 'Tamaño', 'Ubicación', 'Precio', 'Subtotal'];
      return [head, ...this.table().map((row) => [
        row.code, row.name, row.family, row.count, row.size, row.layers, row.price || '', row.subtotal || '',
      ])].map((line) => line.join('\t')).join('\n');
    }

    download(content, name) {
      const win = this.app.window;
      const doc = win?.document;
      if (!doc || typeof win.URL?.createObjectURL !== 'function') return false;
      const blob = new win.Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = win.URL.createObjectURL(blob);
      const link = doc.createElement('a');
      link.href = url;
      link.download = name;
      link.rel = 'noopener';
      doc.body.appendChild(link);
      link.click();
      link.remove();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
      return true;
    }
  }

  root.Schedule = Schedule;
})();
