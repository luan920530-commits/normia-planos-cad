/* Normia Planos CAD · bibliotecas visuales de señalización y equipamiento. */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const PAGE = 48;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = (value) => String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  class Library {
    constructor(app) {
      this.app = app;
      this.drawer = document.querySelector('[data-drawer="library"]');
      this.grid = this.drawer?.querySelector('[data-library-grid]');
      this.search = this.drawer?.querySelector('[data-library-search]');
      this.chips = this.drawer?.querySelector('[data-library-families]');
      this.count = this.drawer?.querySelector('[data-library-count]');
      this.more = this.drawer?.querySelector('[data-library-more]');
      this.detail = this.drawer?.querySelector('[data-library-detail]');
      this.title = this.drawer?.querySelector('[data-library-title]');
      this.eyebrow = this.drawer?.querySelector('[data-library-eyebrow]');
      this.attribution = this.drawer?.querySelector('[data-library-attribution]');
      this.kind = 'sign';
      this.family = 'all';
      this.query = '';
      this.limit = PAGE;
      this.selectedKey = null;
      this.currentKey = null;
      this.mode = 'insert';
      this.items = [];
      if (this.grid) this.bind();
    }

    bind() {
      this.search?.addEventListener('input', () => {
        this.query = this.search.value;
        this.limit = PAGE;
        this.renderGrid();
      });
      this.search?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const first = this.items[0];
          if (first) this.select(first.key);
        }
      });
      this.chips?.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-family]');
        if (!chip) return;
        this.family = chip.dataset.family;
        this.limit = PAGE;
        this.renderChips();
        this.renderGrid();
      });
      this.grid?.addEventListener('click', (event) => {
        const card = event.target.closest('[data-key]');
        if (!card) return;
        this.select(card.dataset.key);
      });
      this.grid?.addEventListener('dblclick', (event) => {
        const card = event.target.closest('[data-key]');
        if (!card) return;
        this.select(card.dataset.key);
        this.useItem(card.dataset.key);
      });
      this.grid?.addEventListener('keydown', (event) => {
        const card = event.target.closest('[data-key]');
        if (!card) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          this.select(card.dataset.key);
          this.useItem(card.dataset.key);
          return;
        }
        if (event.key === ' ') {
          event.preventDefault();
          this.select(card.dataset.key);
        }
      });
      this.grid?.addEventListener('dragstart', (event) => {
        const card = event.target.closest?.('[data-key]');
        if (!card || !event.dataTransfer) return;
        if (this.mode === 'replace') {
          event.preventDefault();
          return;
        }
        this.select(card.dataset.key);
        const payload = JSON.stringify({ kind: this.kind, key: card.dataset.key });
        event.dataTransfer.setData('application/x-normia-resource', payload);
        event.dataTransfer.setData('text/plain', payload);
        event.dataTransfer.effectAllowed = 'copy';
        // Sin esto el fondo modal del cajón tapa el lienzo y no se puede soltar.
        this.app.beginResourceDrag();
      });
      this.grid?.addEventListener('dragend', () => this.app.endResourceDrag());
      this.detail?.addEventListener('click', (event) => {
        if (event.target.closest('[data-insert]')) {
          if (this.selectedKey) this.useItem(this.selectedKey);
        }
      });
      this.more?.addEventListener('click', () => {
        this.limit += PAGE;
        this.renderGrid();
      });
    }

    /**
     * Abre el cajón. Con `mode: 'replace'` no inserta: cambia la señal de los
     * elementos seleccionados, conservando posición, tamaño y rotación.
     */
    open(kind = 'sign', options = {}) {
      this.kind = kind === 'cad' ? 'cad' : 'sign';
      this.mode = options.mode === 'replace' ? 'replace' : 'insert';
      this.currentKey = options.current || null;
      this.family = 'all';
      this.query = '';
      this.limit = PAGE;
      this.selectedKey = this.mode === 'replace' ? this.currentKey : null;
      if (this.search) this.search.value = '';
      this.drawer?.setAttribute('data-library-mode', this.mode);
      if (this.title) {
        this.title.textContent = this.mode === 'replace'
          ? 'Cambiar señal'
          : this.kind === 'sign' ? 'Señalización y orientación' : 'Equipamiento CAD';
      }
      if (this.eyebrow) {
        const total = this.kind === 'sign' ? Object.keys(this.app.catalogs.signs || {}).length : Object.keys(this.app.catalogs.cad || {}).length;
        if (this.kind === 'sign') {
          const service = Object.keys(this.app.catalogs.signs || {}).filter((code) => code.startsWith('SVC_')).length;
          this.eyebrow.textContent = this.mode === 'replace'
            ? `Sustituir la señal · ${total - service} ISO 7010 + ${service} de servicios y orientación`
            : `Biblioteca visual · ${total - service} ISO 7010 + ${service} de servicios y orientación`;
        } else {
          this.eyebrow.textContent = this.mode === 'replace' ? `Sustituir el equipo · ${total} equipos` : `Biblioteca visual · ${total} equipos`;
        }
      }
      if (this.attribution) {
        this.attribution.textContent = this.kind === 'sign'
          ? 'Pictogramas ISO 7010 incluidos localmente (licencia MIT de @iso-safety-signs/core © Karl Norling; atribución de Wikimedia Commons en NOTICE) y señales de orientación propias de Normia (GPL-3.0): baños, vestidores, cafetería y otros servicios. Las señales son referencias gráficas: no sustituyen la señalización física normalizada.'
          : 'Objetos CAD esquemáticos creados para Normia. Las dimensiones son aproximadas; verifica medidas y escala en sitio.';
      }
      this.buildItems();
      if (this.mode === 'replace' && this.currentKey) {
        // La señal actual debe quedar dentro de la página visible para poder
        // resaltarla y centrarla.
        const index = this.items.findIndex((item) => item.key === this.currentKey);
        if (index >= this.limit) this.limit = Math.ceil((index + 1) / PAGE) * PAGE;
      }
      this.renderChips();
      this.renderGrid();
      this.renderDetail(this.mode === 'replace' ? this.items.find((item) => item.key === this.currentKey) || null : null);
      if (this.mode === 'replace') {
        window.setTimeout(() => this.grid?.querySelector('.library-card.is-current')?.scrollIntoView?.({ block: 'nearest' }), 60);
      }
    }

    /** Inserta el recurso o, en modo reemplazo, sustituye la selección. */
    useItem(key) {
      if (this.mode === 'replace') {
        const item = this.items.find((candidate) => candidate.key === key);
        if (item) this.app.replaceSelection(item.type, item.name);
        return;
      }
      this.app.startPlacement(this.kind, key);
    }

    buildItems() {
      const catalogs = this.app.catalogs;
      if (this.kind === 'sign') {
        this.families = catalogs.signCategories || {};
        this.items = Object.entries(catalogs.signs || {}).map(([code, sign]) => ({
          key: code,
          type: code.startsWith('SVC_') ? `sig_${code.slice(4).toLowerCase()}` : `iso_${code.toLowerCase()}`,
          name: sign.name || code,
          code,
          family: sign.category,
          familyName: this.families[sign.category]?.label || this.families[sign.category]?.name || sign.category,
          color: catalogs.signColors?.[sign.category] || '#334155',
          description: sign.description || '',
          search: normalize([code, sign.name, sign.description, sign.category, this.families[sign.category]?.label, ...(catalogs.aliases?.[code] || [])].join(' ')),
        })).sort((a, b) => a.code.localeCompare(b.code));
      } else {
        this.families = catalogs.cadCategories || {};
        this.items = Object.entries(catalogs.cad || {}).map(([key, object]) => ({
          key,
          type: key,
          name: object.name || key,
          code: '',
          family: object.category,
          familyName: this.families[object.category]?.label || this.families[object.category]?.name || object.category,
          color: object.color || '#334155',
          description: object.description || '',
          search: normalize([key, object.name, object.description, object.category, this.families[object.category]?.label].join(' ')),
        })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
      }
    }

    filtered() {
      const family = this.family;
      const query = normalize(this.query);
      return this.items.filter((item) => {
        if (family !== 'all' && item.family !== family) return false;
        if (!query) return true;
        return query.split(' ').every((token) => item.search.includes(token));
      });
    }

    renderChips() {
      if (!this.chips) return;
      const families = this.families || {};
      const total = this.items.length;
      const parts = [`<button class="chip ${this.family === 'all' ? 'is-active' : ''}" type="button" data-family="all">Todas <em>${total}</em></button>`];
      for (const [key, family] of Object.entries(families)) {
        const count = this.items.filter((item) => item.family === key).length;
        if (!count) continue;
        const familyLabel = family.short || family.label || family.name || key;
        parts.push(`<button class="chip ${this.family === key ? 'is-active' : ''}" type="button" data-family="${key}" title="${esc(family.label || familyLabel)}" style="--chip-color:${family.color || '#334155'}"><span class="chip-dot"></span>${esc(familyLabel)} <em>${count}</em></button>`);
      }
      this.chips.innerHTML = parts.join('');
    }

    renderGrid() {
      if (!this.grid) return;
      const items = this.filtered();
      const visible = items.slice(0, this.limit);
      if (this.count) {
        this.count.textContent = items.length
          ? `${items.length} ${items.length === 1 ? 'resultado' : 'resultados'}${this.query ? ` para “${this.query.trim()}”` : ''}`
          : 'Sin resultados. Prueba con otra palabra o cambia de familia.';
      }
      if (!items.length) {
        this.grid.innerHTML = `<p class="library-empty">No encontramos coincidencias. Busca por código (por ejemplo F001), por nombre o por familia.</p>`;
      } else {
        const fragment = document.createDocumentFragment();
        for (const item of visible) {
          const replace = this.mode === 'replace';
          const current = replace && this.currentKey === item.key;
          const card = document.createElement('button');
          card.type = 'button';
          card.className = `library-card${this.selectedKey === item.key ? ' is-selected' : ''}${current ? ' is-current' : ''}`;
          card.dataset.key = item.key;
          card.dataset.type = item.type;
          card.dataset.kind = this.kind;
          card.draggable = !replace;
          card.title = current ? 'Señal actual del elemento'
            : replace ? 'Doble clic para usar esta señal' : 'Arrastra al plano o usa “Insertar en el plano”';
          card.setAttribute('aria-label', `${item.name} · ${item.code || item.key}.${current ? ' Señal actual.' : replace ? ' Pulsa dos veces para usarla.' : ' Arrastra al plano o pulsa Insertar.'}`);
          const thumb = document.createElement('span');
          thumb.className = 'library-thumb';
          thumb.style.setProperty('--thumb-color', item.color);
          card.appendChild(thumb);
          const label = document.createElement('span');
          label.className = 'library-card-name';
          label.textContent = item.name;
          card.appendChild(label);
          const meta = document.createElement('span');
          meta.className = 'library-card-meta';
          meta.textContent = current ? 'Señal actual' : (item.code ? `${item.code} · ${item.familyName}` : item.familyName);
          card.appendChild(meta);
          if (current) {
            const badge = document.createElement('span');
            badge.className = 'library-card-current';
            badge.textContent = 'Actual';
            card.appendChild(badge);
          }
          fragment.appendChild(card);
        }
        this.grid.innerHTML = '';
        this.grid.appendChild(fragment);
        for (const card of this.grid.querySelectorAll('.library-card')) {
          const thumb = card.querySelector('.library-thumb');
          thumb?.appendChild(this.app.renderer.thumbnail(card.dataset.type));
        }
      }
      if (this.more) this.more.hidden = items.length <= this.limit;
    }

    select(key) {
      this.selectedKey = key;
      const item = this.items.find((candidate) => candidate.key === key) || null;
      for (const card of this.grid?.querySelectorAll('.library-card') || []) {
        card.classList.toggle('is-selected', card.dataset.key === key);
      }
      this.renderDetail(item);
    }

    renderDetail(item) {
      if (!this.detail) return;
      if (!item) {
        const emptyHint = this.mode === 'replace'
          ? 'Elige la señal que sustituirá a la actual. Doble clic o <strong>Usar esta señal</strong>; la posición, el tamaño y la rotación se conservan.'
          : 'Elige un pictograma u objeto para ver su vista previa, familia y descripción. Doble clic o <strong>Insertar</strong> para colocarlo en el plano.';
        this.detail.innerHTML = `<div class="library-detail-empty"><span><svg class="icon"><use href="#i-sign"></use></svg></span><p>${emptyHint}</p></div>`;
        return;
      }
      this.detail.innerHTML = `
        <div class="library-detail-preview" style="--detail-color:${esc(item.color)}"></div>
        <h3>${esc(item.name)}</h3>
        <p class="library-detail-code">${item.code ? `${esc(item.code)} · ` : ''}${esc(item.familyName)}</p>
        <div class="library-detail-actions">
          <button class="button button-primary" type="button" data-insert><svg class="icon"><use href="#i-${this.mode === 'replace' ? 'swap' : 'plus'}"></use></svg>${this.mode === 'replace' ? 'Usar esta señal' : 'Insertar en el plano'}</button>
          <span class="library-detail-hint">${this.mode === 'replace'
            ? 'Sustituye la señal del elemento seleccionado sin moverlo. Doble clic o Enter sobre otra tarjeta también la aplica.'
            : 'El cajón se cierra y el recurso sigue al cursor: haz clic en el plano para ubicarlo. También puedes arrastrar la tarjeta hasta el lienzo o pulsar Enter sobre ella.'}</span>
        </div>
        <p class="library-detail-description">${esc(item.description || 'Sin descripción adicional.')}</p>
        <p class="library-detail-note">Representación esquemática. No sustituye la señalización física ni certifica cumplimiento normativo.</p>`;
      const preview = this.detail.querySelector('.library-detail-preview');
      preview?.appendChild(this.app.renderer.thumbnail(item.type));
    }
  }

  root.Library = Library;
})();
