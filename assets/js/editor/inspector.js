/* Normia Planos CAD · panel de propiedades de la selección. */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;
  const TYPE_NAMES = {
    wall: 'Muro', door: 'Puerta sencilla', door_double: 'Puerta doble', door_garage: 'Portón de garaje', route: 'Ruta de evacuación', text: 'Texto', dimension: 'Medida',
    line: 'Línea', rect: 'Rectángulo', ellipse: 'Elipse', sign: 'Señal ISO 7010', cad: 'Equipo CAD', pipe: 'Tubería', conduit: 'Tubería eléctrica',
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const num = (value, decimals = 1) => (Number.isFinite(Number(value))
    ? Number(value).toLocaleString('es-CO', { maximumFractionDigits: decimals })
    : '—');
  const EXT_AGENT_FALLBACK = {
    pqs_abc: 'Polvo químico seco ABC', pqs_bc: 'Polvo químico seco BC', co2: 'Dióxido de carbono (CO₂)',
    water: 'Agua presurizada', foam: 'Espuma (AFFF/FFFP)', wet_k: 'Químico húmedo (Clase K)', d_powder: 'Polvo especial Clase D',
  };
  const EXT_HAZARDS = { light: 'Leve', ordinary: 'Ordinario', extra: 'Extra' };

  class Inspector {
    constructor(app) {
      this.app = app;
      this.panel = document.querySelector('[data-properties]');
      this.title = document.querySelector('[data-properties-title]');
      this.panelEl = document.querySelector('[data-properties-panel]');
      this.count = document.querySelector('[data-selection-count]');
      this.signature = '';
      this.collapsed = new Set();
      this.bound = false;
      if (this.panel) this.bind();
    }

    get model() {
      return this.app.model;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      this.panel.addEventListener('change', (event) => {
        const field = event.target.closest('[data-prop]');
        if (!field) return;
        const prop = field.dataset.prop;
        try {
          if (prop === 'label') {
            this.model.setProps({ label: field.value });
          } else if (prop === 'slope' || prop === 'pressure' || prop === 'load') {
            this.model.setProps({ [prop]: Number(field.value) });
          } else if (prop === 'voltage' || prop === 'phases') {
            this.model.setProps({ [prop]: Number(field.value) });
          } else if (['network', 'diameter', 'material', 'circuit', 'gauge'].includes(prop)) {
            this.model.setProps({ [prop]: field.value });
          } else if (prop === 'fontSize' || prop === 'stroke' || prop === 'opacity') {
            this.model.setProps({ [prop]: Number(field.value) });
          } else if (prop === 'flipX' || prop === 'flipY' || prop === 'isExit' || prop === 'locked') {
            this.model.setProps({ [prop]: field.checked });
          } else if (prop === 'extAgent' || prop === 'extRating' || prop === 'extHazard') {
            this.model.setProps({ [prop]: field.value });
          } else if (prop === 'extCapacityLb' || prop === 'extMountCm') {
            this.model.setProps({ [prop]: Number(field.value) });
          } else if (prop === 'layerId') {
            this.model.setProps({ layerId: field.value });
          } else if (prop === 'rotation') {
            this.model.setRotation(Number(field.value));
          } else if (['x', 'y', 'w', 'h'].includes(prop)) {
            this.applyGeometry(prop, Number(field.value));
          } else if (prop === 'type') {
            this.model.changeType(field.value);
          }
        } catch (error) {
          this.app.toast(error.message || 'El valor no es válido.', 'error');
          this.render(true);
          return;
        }
        this.app.afterEdit('Propiedades actualizadas');
        this.render(true);
      });
      this.panel.addEventListener('input', (event) => {
        const field = event.target.closest('[data-live-preview]');
        if (!field) return;
        const output = this.panel.querySelector(`[data-output="${field.dataset.livePreview}"]`);
        if (output) output.textContent = `${Math.round(Number(field.value) * 100)}%`;
      });
      this.panel.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-section-toggle]');
        if (toggle) {
          event.preventDefault();
          const key = toggle.dataset.sectionToggle;
          if (this.collapsed.has(key)) this.collapsed.delete(key);
          else this.collapsed.add(key);
          this.render(true);
          return;
        }
        const button = event.target.closest('[data-action]');
        if (!button || button.disabled) return;
        event.preventDefault();
        if (button.dataset.action === 'ext-verify') {
          this.app.openDrawer('extinguishers');
          return;
        }
        if (button.dataset.action === 'ext-apply') {
          const recommendation = this.app.extinguishers?.recommendationFor(button.dataset.value);
          if (recommendation) {
            this.app.extinguishers.apply(recommendation);
            this.render(true);
          }
          return;
        }
        if (button.dataset.action === 'swap-sign') {
          this.app.startSignSwap();
          return;
        }
        if (button.dataset.action === 'swap-equipment') {
          this.app.startEquipmentSwap();
          return;
        }
        this.runAction(button.dataset.action, button);
      });
    }

    applyGeometry(prop, value) {
      if (!Number.isFinite(value)) throw new Error('Introduce un número válido.');
      const frame = this.model.selectionFrame();
      if (!frame) return;
      const next = { ...frame };
      if (prop === 'x') next.x = value;
      if (prop === 'y') next.y = value;
      if (prop === 'w') next.w = value;
      if (prop === 'h') next.h = value;
      this.model.setSelectionFrame(next);
    }

    runAction(action, button) {
      const model = this.model;
      let changed = false;
      switch (action) {
        case 'duplicate': changed = model.duplicateSelected(); break;
        case 'delete': changed = model.deleteSelected(); break;
        case 'lock':
          changed = model.lockSelected(!model.selectedElements().every((element) => element.locked));
          break;
        case 'group': changed = model.groupSelected(); break;
        case 'ungroup': changed = model.ungroupSelected(); break;
        case 'flip': changed = model.setProps({ flipX: !model.selectedElements().every((element) => element.flipX) }); break;
        case 'front': case 'back': case 'forward': case 'backward':
          changed = model.zOrder(action); break;
        case 'align': changed = model.align(button.dataset.value); break;
        case 'distribute': changed = model.distribute(button.dataset.value); break;
        case 'select-all': model.selectAll(); break;
        case 'rotate': {
          const frame = model.selectionFrame();
          if (frame) changed = model.setRotation(G.normalizeAngle((Number(frame.rotation) || 0) + Number(button.dataset.value || 0)));
          break;
        }
        case 'select-stack':
          model.select([button.dataset.value]);
          break;
        case 'color':
          changed = model.setColor(button.dataset.value);
          break;
        default: break;
      }
      if (changed) this.app.afterEdit('Cambio aplicado');
      this.render(true);
    }

    typeName(element) {
      const code = this.model.signCodeForType(element.type);
      if (code) {
        // El nombre del catálogo es más útil que el código cuando se cambia la
        // señal desde el inspector; el código sigue visible en la ficha y en la
        // sección Apariencia.
        const name = this.model.catalogs.signs?.[code]?.name;
        if (name) return name;
        const label = String(code).startsWith('SVC_') ? 'Señal de orientación' : TYPE_NAMES.sign;
        return `${label} · ${code}`;
      }
      if (element.type === 'pipe') {
        const info = this.model.networkInfo(element.network);
        return info ? `Tubería · ${info.label}` : TYPE_NAMES.pipe;
      }
      if (element.type === 'conduit') return `Circuito ${element.circuit || 'C1'}`;
      if (this.model.cadForType(element.type)) return this.model.cadForType(element.type).name;
      return TYPE_NAMES[element.type] || 'Elemento';
    }

    /** Etiqueta breve de la familia del elemento para la ficha superior. */
    kindLabel(element) {
      if (!element) return 'Selección múltiple';
      const code = this.model.signCodeForType(element.type);
      if (code) return String(code).startsWith('SVC_') ? 'Señal de servicios' : 'Señal ISO 7010';
      if (element.type === 'pipe') return 'Red de tubería';
      if (element.type === 'conduit') return 'Red eléctrica';
      if (this.model.cadForType(element.type)) return 'Equipo CAD';
      if (this.model.isElectricalDeviceType(element.type)) return 'Equipo eléctrico';
      return 'Elemento del plano';
    }

    heroMeta(element) {
      if (!element) return 'Edición conjunta';
      const unit = this.model.design.canvas.unit;
      if (Array.isArray(element.points)) return `Trazo de ${element.points.length} vértices`;
      if (element.type === 'ellipse') return `Elipse · ${G.formatNumber(element.w, 0)} × ${G.formatNumber(element.h, 0)} ${unit}`;
      return `${G.formatNumber(element.w, 0)} × ${G.formatNumber(element.h, 0)} ${unit}`;
    }

    /* ------------------------------- piezas ------------------------------- */

    section(key, title, icon, body, options = {}) {
      const collapsed = this.collapsed.has(key);
      const badge = options.badge ? `<span class="section-badge">${esc(options.badge)}</span>` : '';
      return `<section class="inspector-section${collapsed ? ' is-collapsed' : ''}" data-section="${key}">
        <button class="section-head" type="button" data-section-toggle="${key}" aria-expanded="${collapsed ? 'false' : 'true'}">
          <svg class="icon section-icon" aria-hidden="true"><use href="#i-${icon}"></use></svg>
          <span class="section-title">${esc(title)}</span>
          ${badge}
          <svg class="icon section-chevron" aria-hidden="true"><use href="#i-chevron-down"></use></svg>
        </button>
        <div class="section-body"${collapsed ? ' hidden' : ''}>${body}</div>
      </section>`;
    }

    numberField(label, prop, value, options = {}) {
      const unit = options.unit ? `<span class="num-unit">${esc(options.unit)}</span>` : '';
      const min = options.min !== undefined ? ` min="${options.min}"` : '';
      const max = options.max !== undefined ? ` max="${options.max}"` : '';
      const step = options.step !== undefined ? options.step : 1;
      const disabled = options.disabled ? ' disabled' : '';
      return `<label class="num-field"><span class="num-label">${esc(label)}</span><span class="num-control"><input type="number" step="${step}" data-prop="${prop}" value="${value}"${min}${max}${disabled}>${unit}</span></label>`;
    }

    colorOf(elements) {
      return elements.length && elements.every((element) => element.color === elements[0].color) ? elements[0].color : '';
    }

    stackMarkup(elements) {
      const stacked = (this.app.lastHit?.ids || []).map((id) => this.model.element(id)).filter(Boolean);
      const selected = new Set(elements.map((element) => element.id));
      // Solo se muestra si la selección actual forma parte de esa pila.
      if (stacked.length < 2 || !stacked.some((element) => selected.has(element.id))) return '';
      const rows = stacked.map((element, index) => `<li>
        <button class="stack-row${selected.has(element.id) ? ' is-current' : ''}" type="button" data-action="select-stack" data-value="${esc(element.id)}">
          <span class="stack-index">${index + 1}</span>
          <span class="stack-name">${esc(this.typeName(element))}</span>
          <span class="stack-kind">${esc(TYPE_NAMES[element.type] || 'Elemento')}</span>
        </button>
      </li>`).join('');
      const body = `<p class="help-text">Hay ${stacked.length} elementos en este punto. <strong>Ctrl + clic</strong> baja uno y <strong>Ctrl + Shift + clic</strong> vuelve a subir.</p>
        <ol class="stack-list">${rows}</ol>`;
      return this.section('stack', 'Elementos superpuestos', 'stack', body, { badge: String(stacked.length) });
    }

    /* ------------------------------- render ------------------------------- */

    render(force = false) {
      if (!this.panel) return;
      const elements = this.model.selectedElements();
      const ids = elements.map((element) => element.id).sort().join(',');
      const types = elements.map((element) => element.type).join(',');
      const signature = `${ids}|${types}`;
      const active = document.activeElement;
      const isTyping = Boolean(active && this.panel.contains(active));
      if (!force && (signature === this.signature || isTyping)) return;
      // Si la selección no cambió, el repintado debe conservar dónde estaba el
      // usuario: sin esto cada retoque devolvía el panel al principio y el
      // desplazamiento parecía bloqueado.
      const sameSelection = signature === this.signature;
      const keepScroll = sameSelection ? this.panel.scrollTop : 0;
      const focusProp = isTyping ? (active.closest('[data-prop]')?.dataset.prop || '') : '';
      this.signature = signature;
      if (this.count) {
        this.count.hidden = elements.length < 2;
        if (elements.length > 1) this.count.textContent = `${elements.length}`;
      }
      if (!elements.length) {
        this.title.textContent = 'Propiedades';
        this.panel.innerHTML = this.emptyMarkup();
        this.panelEl?.classList.remove('has-selection');
        this.panel.scrollTop = 0;
        return;
      }
      this.panelEl?.classList.add('has-selection');
      const frame = this.model.selectionFrame();
      const single = elements.length === 1 ? elements[0] : null;
      this.title.textContent = single ? this.typeName(single) : `${elements.length} elementos`;
      this.panel.innerHTML = this.markup(elements, frame, single);
      if (keepScroll > 0) this.panel.scrollTop = keepScroll;
      if (focusProp) {
        const field = this.panel.querySelector(`[data-prop="${focusProp}"]`);
        field?.focus?.({ preventScroll: true });
      }
    }

    emptyMarkup() {
      const design = this.model.design;
      return `
        <div class="inspector-empty">
          <span class="empty-mark"><svg class="icon"><use href="#i-move"></use></svg></span>
          <h3>Nada seleccionado</h3>
          <p>Elige un elemento del lienzo para ajustar su geometría, su color y sus datos. Con <strong>Ctrl + A</strong> seleccionas todo el piso.</p>
          <dl class="empty-facts">
            <div><dt>Elementos</dt><dd>${design.elements.length}</dd></div>
            <div><dt>Capas</dt><dd>${design.layers.length}</dd></div>
            <div><dt>Grupos</dt><dd>${design.groups.length}</dd></div>
            <div><dt>Lienzo</dt><dd>${G.formatNumber(design.canvas.width, 0)} × ${G.formatNumber(design.canvas.height, 0)} ${esc(design.canvas.unit)}</dd></div>
          </dl>
          <button class="button button-small button-ghost empty-action" type="button" data-action="select-all"><svg class="icon"><use href="#i-select"></use></svg>Seleccionar todo</button>
          <p class="empty-tip"><kbd>Ctrl</kbd> + clic sobre una superposición baja al elemento de abajo.</p>
          <p class="inspector-hint">El plano es esquemático: verifica medidas y escala en sitio antes de usarlo como referencia de obra.</p>
        </div>`;
    }

    markup(elements, frame, single) {
      const design = this.model.design;
      const unit = design.canvas.unit;
      const hasPath = elements.some((element) => Array.isArray(element.points));
      const hasText = elements.some((element) => element.type === 'text' || element.type === 'dimension');
      const hasDoor = elements.some((element) => (root.DOOR_TYPES || ['door']).includes(element.type));
      const hasPipe = Boolean(single && single.type === 'pipe');
      const hasConduit = Boolean(single && single.type === 'conduit');
      const hasDevice = Boolean(single && this.model.isElectricalDeviceType(single.type));
      const hasExtinguisher = Boolean(single && this.model.isExtinguisherType(single.type));
      const Mep = root.Mep;
      const mep = this.model.mepData() || {};
      const networkOptions = hasPipe
        ? Object.entries(mep.hydraulic || {}).map(([key, info]) => `<option value="${esc(key)}" ${single.network === key ? 'selected' : ''}>${esc(info.label)} · ${esc(info.short)}</option>`).join('')
        : '';
      const diameterOptions = hasPipe
        ? (Array.isArray(mep.diameters) ? mep.diameters : []).map((value) => `<option value="${esc(value)}" ${single.diameter === value ? 'selected' : ''}>${esc(value)}</option>`).join('')
        : '';
      const materialOptions = hasPipe
        ? Object.entries(mep.materials || {}).map(([key, label]) => `<option value="${esc(key)}" ${single.material === key ? 'selected' : ''}>${esc(label)}</option>`).join('')
        : '';
      const electrical = this.model.electricalConfig();
      const voltageOptions = hasConduit
        ? electrical.voltages.map((value) => `<option value="${value}" ${Number(single.voltage) === Number(value) ? 'selected' : ''}>${value} V</option>`).join('')
        : '';
      const phaseOptions = hasConduit
        ? electrical.phases.map((value) => `<option value="${value}" ${Number(single.phases) === Number(value) ? 'selected' : ''}>${value === 3 ? 'Trifásico (3F)' : 'Monofásico (1F)'}</option>`).join('')
        : '';
      const gaugeOptions = hasConduit
        ? electrical.gauges.map((value) => `<option value="${esc(value)}" ${String(single.gauge) === String(value) ? 'selected' : ''}>${esc(value)} AWG</option>`).join('')
        : '';
      const colors = root.COLORS || [];
      const canEdit = this.model.canEdit();
      const lockedAll = elements.every((element) => (element.locked || this.model.layer(element.layerId)?.locked));
      const layerOptions = design.layers.map((layer) => `<option value="${esc(layer.id)}" ${elements.every((element) => element.layerId === layer.id) ? 'selected' : ''}>${esc(layer.name)}</option>`).join('');
      const basicTypes = root.BASIC_TYPES || ['wall', 'door', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse'];
      const typeOptions = basicTypes.map((key) => `<option value="${key}" ${single && single.type === key ? 'selected' : ''}>${TYPE_NAMES[key] || key}</option>`).join('');
      const sign = single ? this.model.signCodeForType(single.type) : null;
      const signElements = elements.filter((element) => this.model.signCodeForType(element.type));
      const allSigns = signElements.length === elements.length && signElements.length > 0;
      const swapCode = allSigns ? this.model.signCodeForType(elements[0].type) : null;
      const swapSign = swapCode ? this.model.catalogs.signs[swapCode] : null;
      const swapFamily = swapSign
        ? (this.model.catalogs.signCategories?.[swapSign.category]?.short
          || this.model.catalogs.signCategories?.[swapSign.category]?.label
          || swapSign.category)
        : '';
      const cad = single ? this.model.cadForType(single.type) : null;
      const cadElements = elements.filter((element) => this.model.cadForType(element.type));
      const allCad = cadElements.length === elements.length && cadElements.length > 0;
      const cadCategory = cad
        ? (this.model.catalogs.cadCategories?.[cad.category]?.short
          || this.model.catalogs.cadCategories?.[cad.category]?.label
          || cad.category
          || 'Equipamiento CAD')
        : '';
      const disabled = canEdit ? '' : ' disabled';
      const color = this.colorOf(elements);
      const opacity = single ? single.opacity : elements[0].opacity;
      const stroke = single ? single.stroke : elements[0].stroke;

      /* ------------------------------ ficha ------------------------------ */
      const thumb = single && (sign || cad)
        ? `<span class="hero-thumb" data-asset-preview="${esc(single.type)}"></span>`
        : '';
      const hero = `<header class="inspector-hero${thumb ? ' has-thumb' : ''}">
        ${thumb}
        <div class="hero-copy">
          <p class="hero-kicker">${esc(this.kindLabel(single))}</p>
          <strong class="hero-title">${esc(single ? (sign ? (this.model.catalogs.signs[sign]?.name || sign) : cad ? cad.name : this.typeName(single)) : `${elements.length} elementos`)}</strong>
          <small class="hero-meta">${esc(single ? this.heroMeta(single) : 'Edición conjunta')}</small>
        </div>
        <div class="hero-actions">
          <button class="hero-action" type="button" data-action="lock" data-tooltip="${lockedAll ? 'Desbloquear' : 'Bloquear'} · Ctrl+L" aria-label="${lockedAll ? 'Desbloquear' : 'Bloquear'}"><svg class="icon"><use href="#i-${lockedAll ? 'unlock' : 'lock'}"></use></svg></button>
          <button class="hero-action" type="button" data-action="duplicate" data-tooltip="Duplicar · Ctrl+D" aria-label="Duplicar"><svg class="icon"><use href="#i-duplicate"></use></svg></button>
          <button class="hero-action is-danger" type="button" data-action="delete" data-tooltip="Eliminar · Supr" aria-label="Eliminar"><svg class="icon"><use href="#i-trash"></use></svg></button>
        </div>
      </header>`;

      /* ---------------------------- geometría ---------------------------- */
      const rotation = Math.round(frame.rotation || 0);
      const geometry = `<div class="metric-grid">
          ${this.numberField('X', 'x', Math.round(frame.x), { disabled: !canEdit, unit })}
          ${this.numberField('Y', 'y', Math.round(frame.y), { disabled: !canEdit, unit })}
          ${this.numberField('Ancho', 'w', Math.round(frame.w), { disabled: !canEdit, unit, min: 2 })}
          ${this.numberField('Alto', 'h', Math.round(frame.h), { disabled: !canEdit, unit, min: 2 })}
        </div>
        <div class="rotation-row">
          <button class="step-button" type="button" data-action="rotate" data-value="-90" data-tooltip="Girar −90°" aria-label="Girar menos 90 grados"${disabled}><svg class="icon"><use href="#i-rotate-left"></use></svg></button>
          ${this.numberField('Rotación', 'rotation', rotation, { disabled: !canEdit, unit: '°', min: 0, max: 359 })}
          <button class="step-button" type="button" data-action="rotate" data-value="90" data-tooltip="Girar +90°" aria-label="Girar más 90 grados"${disabled}><svg class="icon"><use href="#i-rotate-right"></use></svg></button>
        </div>
        ${hasPath ? `<p class="help-text">Trazo editable: arrastra los <strong>vértices</strong> del plano, haz <strong>doble clic</strong> sobre el trazo para añadir uno y <strong>Alt + clic</strong> para quitarlo. Ajustar la caja reescala el trazado completo.</p>` : ''}`;

      /* --------------------------- apariencia --------------------------- */
      const swapBlock = allSigns ? `<div class="sign-swap">
          <span class="sign-swap-thumb" data-asset-preview="${esc(elements[0].type)}"></span>
          <span class="sign-swap-copy">
            <strong>${esc(elements.length === 1 ? (swapSign?.name || swapCode) : `${elements.length} señales`)}</strong>
            <small>${esc(elements.length === 1 ? `${swapCode} · ${swapFamily}` : 'Se cambian todas a la vez')}</small>
          </span>
          <button class="button button-small button-soft sign-swap-button" type="button" data-action="swap-sign"${canEdit ? '' : ' disabled'}>
            <svg class="icon"><use href="#i-swap"></use></svg>Cambiar señal
          </button>
        </div>
        <p class="help-text">Elige otro pictograma de la biblioteca: se conservan la posición, el tamaño, la rotación y la capa. <strong>Usted está aquí</strong> está en la familia <em>Ubicación</em>.</p>`
        : allCad ? `<div class="sign-swap equipment-swap">
          <span class="sign-swap-thumb" data-asset-preview="${esc(elements[0].type)}"></span>
          <span class="sign-swap-copy">
            <strong>${esc(elements.length === 1 ? (cad?.name || this.typeName(elements[0])) : `${elements.length} equipos`)}</strong>
            <small>${esc(elements.length === 1 ? `${cadCategory} · Equipo CAD` : 'Se cambian todos a la vez')}</small>
          </span>
          <button class="button button-small button-soft sign-swap-button" type="button" data-action="swap-equipment"${canEdit ? '' : ' disabled'}>
            <svg class="icon"><use href="#i-swap"></use></svg>Cambiar equipo
          </button>
        </div>
        <p class="help-text">Elige otro objeto de la biblioteca: se conservan la posición, el tamaño, la rotación y la capa. El equipo toma el color de su familia.</p>` : '';
      const appearance = `${swapBlock}<div class="color-line">
          <span class="color-chip" style="--swatch:${color || '#cbd5e1'}" aria-hidden="true"></span>
          <span class="color-label">Color</span>
          <code class="color-value">${esc(color || 'varios')}</code>
        </div>
        <div class="swatch-grid" role="group" aria-label="Paleta de colores">
          ${colors.map((swatch) => `<button class="swatch ${color === swatch ? 'is-selected' : ''}" type="button" data-action="color" data-value="${swatch}" style="--swatch:${swatch}" aria-label="Color ${swatch}"${canEdit && !sign ? '' : ' disabled'}></button>`).join('')}
        </div>
        <div class="metric-grid">
          ${this.numberField('Grosor', 'stroke', stroke, { disabled: !canEdit, min: 0, max: 40, step: 0.5 })}
          <label class="slider-field"><span class="num-label">Opacidad</span><input type="range" min="0.1" max="1" step="0.05" data-prop="opacity" data-live-preview="opacity" value="${opacity}"${disabled}><output data-output="opacity">${Math.round(opacity * 100)}%</output></label>
        </div>
        ${hasText ? `<div class="field-stack">
          <label class="field compact"><span>Texto</span><textarea data-prop="label" rows="2" maxlength="240" placeholder="Escribe una etiqueta breve">${esc(single ? single.label : '')}</textarea></label>
          ${this.numberField('Tamaño de letra', 'fontSize', single?.fontSize || 14, { disabled: !canEdit, min: 8, max: 160, unit: 'pt' })}
        </div>` : ''}
        ${hasDoor ? `<div class="switch-stack">
          <label class="switch-row compact"><span><strong>Cambiar bisagra</strong><small>Voltea la puerta hacia el otro lado del vano.</small></span><input type="checkbox" data-prop="flipX" ${single?.flipX ? 'checked' : ''}${disabled}></label>
          <label class="switch-row compact"><span><strong>Abrir al otro lado</strong><small>Invierte el sentido de abatimiento respecto al muro.</small></span><input type="checkbox" data-prop="flipY" ${single?.flipY ? 'checked' : ''}${disabled}></label>
          <label class="switch-row compact"><span><strong>Salida de emergencia</strong><small>El auditor mide el recorrido de evacuación desde esta puerta y la cuenta como salida.</small></span><input type="checkbox" data-prop="isExit" ${single?.isExit ? 'checked' : ''}${disabled}></label>
        </div>` : ''}`;

      /* ------------------------------ MEP ------------------------------ */
      const mepSection = (hasPipe || hasConduit || hasDevice) && Mep ? this.section(
        'mep',
        hasPipe ? 'Red de tubería' : hasConduit ? 'Circuito eléctrico' : 'Conexión eléctrica',
        'network',
        `<div class="inspector-mep">
            ${hasPipe ? `
              <label class="field compact"><span>Red</span><select data-prop="network"${disabled}>${networkOptions}</select><small>Al cambiar de red se aplican color, diámetro y material de referencia.</small></label>
              <div class="metric-grid">
                <label class="select-field"><span class="num-label">Diámetro</span><select data-prop="diameter"${disabled}>${diameterOptions}</select></label>
                <label class="select-field"><span class="num-label">Material</span><select data-prop="material"${disabled}>${materialOptions}</select></label>
              </div>
              <div class="metric-grid">
                ${this.numberField('Pendiente', 'slope', Number(single.slope) || 0, { disabled: !canEdit, min: 0, max: 15, step: 0.5, unit: '%' })}
                ${this.numberField('Presión', 'pressure', Number(single.pressure) || 0, { disabled: !canEdit, min: 0, max: 5000, step: 5, unit: 'kPa' })}
              </div>
              <p class="help-text">Tramo de ${esc(Mep.formatMeters(Mep.elementLengthMeters(single, design.canvas)))} entre ${Array.isArray(single.points) ? single.points.length : 2} puntos. La pendiente es una referencia de diseño: el desagüe real se verifica en obra.</p>` : ''}
            ${hasConduit ? `
              <div class="metric-grid">
                <label class="field compact"><span>Circuito</span><input type="text" maxlength="12" data-prop="circuit" value="${esc(single.circuit || 'C1')}"${disabled}></label>
                <label class="select-field"><span class="num-label">Tensión</span><select data-prop="voltage"${disabled}>${voltageOptions}</select></label>
              </div>
              <div class="metric-grid">
                <label class="select-field"><span class="num-label">Calibre</span><select data-prop="gauge"${disabled}>${gaugeOptions}</select></label>
                <label class="select-field"><span class="num-label">Fases</span><select data-prop="phases"${disabled}>${phaseOptions}</select></label>
              </div>
              <p class="help-text">Los tramos con el mismo código forman un circuito. Tramo de ${esc(Mep.formatMeters(Mep.elementLengthMeters(single, design.canvas)))}; el panel <strong>Redes</strong> suma cargas y estima la caída de tensión.</p>` : ''}
            ${hasDevice ? `
              <div class="metric-grid">
                <label class="field compact"><span>Circuito</span><input type="text" maxlength="12" data-prop="circuit" value="${esc(single.circuit || 'C1')}"${disabled}></label>
                ${this.numberField('Carga', 'load', Number(single.load) || 0, { disabled: !canEdit, min: 0, max: 100000, step: 10, unit: 'VA' })}
              </div>` : ''}
          </div>`,
        { badge: hasPipe ? (this.model.networkInfo(single.network)?.short || '') : hasConduit ? (single.circuit || 'C1') : '' },
      ) : '';

      /* ---------------------------- extintor ---------------------------- */
      const extReport = this.app.extinguishers?.report || null;
      const extVerdict = hasExtinguisher ? this.app.extinguishers?.verdictFor(single.id) : null;
      const agentOptions = Object.entries(extReport?.agents || EXT_AGENT_FALLBACK)
        .map(([key, info]) => `<option value="${esc(key)}" ${single?.extAgent === key ? 'selected' : ''}>${esc(info.label || key)}</option>`)
        .join('');
      const hazardOptions = Object.entries(EXT_HAZARDS)
        .map(([key, label]) => `<option value="${key}" ${single?.extHazard === key ? 'selected' : ''}>${label}</option>`)
        .join('');
      const exampleRatings = extReport?.examples?.[single?.extAgent] || [];
      const ratingList = exampleRatings.length
        ? `<datalist id="ext-ratings">${exampleRatings.map((row) => `<option value="${esc(row.rating)}">${num(row.capacityLb, 0)} lb</option>`).join('')}</datalist>`
        : '';
      let verdictMarkup = `<p class="help-text">Verifica la cobertura para saber si este extintor llega a todo su margen y cuánta superficie admite su clasificación.</p>
        <button class="button button-small button-soft" type="button" data-action="ext-verify"><svg class="icon"><use href="#i-extinguisher"></use></svg>Verificar cobertura</button>`;
      if (extVerdict) {
        const unit = extVerdict.unit;
        const issues = [];
        if (unit.travelAreaM2 > unit.coverageAreaM2 + 0.5) {
          issues.push(`Su recorrido alcanza ${num(unit.travelAreaM2)} m², pero la clasificación solo admite ${num(unit.areaLimitM2)} m².`);
        }
        if (unit.travelLimitM === null) issues.push('No declara una clase de fuego con distancia aplicable.');
        if (!unit.signCovered) issues.push('No tiene una señal F001 a menos de 1,5 m.');
        if (!unit.wheeled && unit.mountCm > unit.mountMaxCm) issues.push(`La parte superior a ${num(unit.mountCm, 0)} cm supera el máximo de ${num(unit.mountMaxCm, 0)} cm.`);
        const ok = issues.length === 0 && unit.coverageAreaM2 > 0;
        verdictMarkup = `<div class="ext-verdict ${ok ? 'is-ok' : 'is-warn'}">
          <p class="ext-verdict-head"><svg class="icon"><use href="#i-${ok ? 'check' : 'alert'}"></use></svg><strong>${ok ? 'Cumple los criterios de referencia' : 'Requiere ajuste'}</strong></p>
          <dl class="ext-verdict-facts">
            <div><dt>Cubre</dt><dd>${num(unit.coverageAreaM2)} m² · ${num(unit.coveragePct)} % del piso</dd></div>
            <div><dt>Recorrido máximo</dt><dd>${unit.travelLimitM === null ? '—' : `${num(unit.travelLimitM)} m`}</dd></div>
            <div><dt>Área máxima</dt><dd>${unit.areaLimitM2 === null ? '—' : `${num(unit.areaLimitM2)} m²`}</dd></div>
            <div><dt>Alcanza hasta</dt><dd>${unit.maxTravelM === null ? '—' : `${num(unit.maxTravelM)} m`} en su zona</dd></div>
          </dl>
          ${issues.length ? `<ul class="ext-verdict-issues">${issues.map((issue) => `<li>${esc(issue)}</li>`).join('')}</ul>` : ''}
          <p class="ext-verdict-source">Calculado sobre el plano guardado · ${esc(extVerdict.profileLabel)} · riesgo ${esc(extVerdict.hazardLabel)}</p>
          ${extVerdict.recommendations.length ? `<div class="ext-verdict-actions">${extVerdict.recommendations.map((rec, index) => `<button class="button button-small button-soft" type="button" data-action="ext-apply" data-value="${extReport.recommendations.indexOf(rec)}">${esc(rec.action === 'add' ? 'Instalar otro' : rec.action === 'move' ? `Reubicar (+${num(rec.gainAreaM2)} m²)` : `Subir a ${esc(rec.rating)} (+${num(rec.gainAreaM2)} m²)`)}</button>`).join('')}</div>` : ''}
        </div>`;
      }
      const extinguisherSection = hasExtinguisher ? this.section('extinguisher', 'Extintor', 'extinguisher',
        `<div class="ext-fields">
          <label class="select-field"><span class="num-label">Agente extintor</span><select data-prop="extAgent"${disabled}>${agentOptions}</select></label>
          <div class="metric-grid">
            ${this.numberField('Capacidad', 'extCapacityLb', Number(single.extCapacityLb) || 0, { disabled: !canEdit, min: 1, max: 400, step: 0.5, unit: 'lb' })}
            <label class="field compact"><span>Clasificación</span><input type="text" data-prop="extRating" list="ext-ratings" maxlength="24" value="${esc(single.extRating || '')}"${disabled}><small>Formato 2-A:10-B:C</small></label>
          </div>
          <div class="metric-grid">
            <label class="select-field"><span class="num-label">Riesgo</span><select data-prop="extHazard"${disabled}>${hazardOptions}</select></label>
            ${this.numberField('Parte superior', 'extMountCm', Number(single.extMountCm) || 0, { disabled: !canEdit, min: 0, max: 300, unit: 'cm' })}
          </div>
          ${ratingList}
          <p class="help-text">Valores de referencia del fabricante: confirma agente, capacidad y clasificación contra la placa del equipo. Con la parte superior a 0 cm se asume un extintor sobre ruedas o apoyado en el piso.</p>
        </div>
        ${verdictMarkup}`,
        { badge: single.extRating ? esc(single.extRating) : '' },
      ) : '';

      /* ------------------------- organización ------------------------- */
      const organization = `<label class="select-field"><span class="num-label">Capa</span><select data-prop="layerId">${layerOptions}</select></label>
        <label class="switch-row compact"><span><strong>Bloquear</strong><small>Evita mover o modificar el elemento.</small></span><input type="checkbox" data-prop="locked" ${lockedAll ? 'checked' : ''}></label>
        ${single && basicTypes.includes(single.type) ? `<label class="select-field"><span class="num-label">Tipo de elemento</span><select data-prop="type">${typeOptions}</select><small class="help-text">Convertir conserva posición, giro y capa; útil para corregir trazos.</small></label>` : ''}`;

      /* ---------------------------- acciones ---------------------------- */
      const actions = `<div class="action-grid">
          <button class="action-button" type="button" data-action="duplicate"><svg class="icon"><use href="#i-duplicate"></use></svg>Duplicar</button>
          <button class="action-button" type="button" data-action="lock"><svg class="icon"><use href="#i-${lockedAll ? 'unlock' : 'lock'}"></use></svg>${lockedAll ? 'Desbloquear' : 'Bloquear'}</button>
          <button class="action-button" type="button" data-action="group"${elements.length > 1 ? '' : ' disabled'}><svg class="icon"><use href="#i-group"></use></svg>Agrupar</button>
          <button class="action-button" type="button" data-action="ungroup"${this.model.isSelectionGrouped() ? '' : ' disabled'}><svg class="icon"><use href="#i-ungroup"></use></svg>Desagrupar</button>
        </div>
        <div class="icon-row" role="group" aria-label="Orden de dibujo">
          <button class="icon-tile" type="button" data-action="front" data-tooltip="Traer al frente" aria-label="Traer al frente"><svg class="icon"><use href="#i-front"></use></svg></button>
          <button class="icon-tile" type="button" data-action="forward" data-tooltip="Traer adelante" aria-label="Traer adelante"><svg class="icon"><use href="#i-forward"></use></svg></button>
          <button class="icon-tile" type="button" data-action="backward" data-tooltip="Enviar atrás" aria-label="Enviar atrás"><svg class="icon"><use href="#i-backward"></use></svg></button>
          <button class="icon-tile" type="button" data-action="back" data-tooltip="Enviar al fondo" aria-label="Enviar al fondo"><svg class="icon"><use href="#i-back"></use></svg></button>
        </div>
        ${elements.length > 1 ? `<div class="icon-row is-dense" role="group" aria-label="Alinear">
          <button class="icon-tile" type="button" data-action="align" data-value="left" data-tooltip="Alinear a la izquierda" aria-label="Alinear a la izquierda"><svg class="icon"><use href="#i-align-left"></use></svg></button>
          <button class="icon-tile" type="button" data-action="align" data-value="center" data-tooltip="Centrar horizontal" aria-label="Centrar horizontal"><svg class="icon"><use href="#i-align-center"></use></svg></button>
          <button class="icon-tile" type="button" data-action="align" data-value="right" data-tooltip="Alinear a la derecha" aria-label="Alinear a la derecha"><svg class="icon"><use href="#i-align-right"></use></svg></button>
          <button class="icon-tile" type="button" data-action="align" data-value="top" data-tooltip="Alinear arriba" aria-label="Alinear arriba"><svg class="icon"><use href="#i-align-top"></use></svg></button>
          <button class="icon-tile" type="button" data-action="align" data-value="middle" data-tooltip="Centrar vertical" aria-label="Centrar vertical"><svg class="icon"><use href="#i-align-middle"></use></svg></button>
          <button class="icon-tile" type="button" data-action="align" data-value="bottom" data-tooltip="Alinear abajo" aria-label="Alinear abajo"><svg class="icon"><use href="#i-align-bottom"></use></svg></button>
          <button class="icon-tile" type="button" data-action="distribute" data-value="x" data-tooltip="Distribuir horizontal" aria-label="Distribuir horizontal"${elements.length > 2 ? '' : ' disabled'}><svg class="icon"><use href="#i-distribute-h"></use></svg></button>
          <button class="icon-tile" type="button" data-action="distribute" data-value="y" data-tooltip="Distribuir vertical" aria-label="Distribuir vertical"${elements.length > 2 ? '' : ' disabled'}><svg class="icon"><use href="#i-distribute-v"></use></svg></button>
        </div>` : ''}`;

      return `
        ${hero}
        ${!canEdit ? '<div class="notice notice-warning compact-notice"><svg class="icon"><use href="#i-lock"></use></svg><p>La selección está bloqueada o pertenece a una capa bloqueada. Desbloquea para editar.</p></div>' : ''}
        ${this.section('geometry', 'Geometría', 'move', geometry)}
        ${this.section('appearance', 'Apariencia', 'palette', appearance)}
        ${mepSection}
        ${extinguisherSection}
        ${this.stackMarkup(elements)}
        ${this.section('organization', 'Organización', 'layers', organization)}
        ${this.section('actions', 'Orden y acciones', 'arrange', actions)}`;
    }

    refreshThumbnails() {
      if (!this.panel) return;
      this.panel.querySelectorAll('[data-asset-preview]').forEach((slot) => {
        if (slot.firstChild) return;
        const type = slot.dataset.assetPreview;
        slot.appendChild(this.app.renderer.thumbnail(type));
      });
    }
  }

  root.Inspector = Inspector;
})();
