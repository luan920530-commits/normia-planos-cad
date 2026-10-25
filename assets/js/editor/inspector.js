/* Normia Planos CAD · panel de propiedades de la selección. */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;
  const TYPE_NAMES = {
    wall: 'Muro', door: 'Puerta sencilla', door_double: 'Puerta doble', door_garage: 'Portón de garaje', route: 'Ruta de evacuación', text: 'Texto', dimension: 'Medida',
    line: 'Línea', rect: 'Rectángulo', ellipse: 'Elipse', sign: 'Señal ISO 7010', cad: 'Equipo CAD',
    pipe: 'Tubería', conduit: 'Tubería eléctrica',
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  class Inspector {
    constructor(app) {
      this.app = app;
      this.panel = document.querySelector('[data-properties]');
      this.title = document.querySelector('[data-properties-title]');
      this.panelEl = document.querySelector('[data-properties-panel]');
      this.signature = '';
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
          } else if (prop === 'flipX' || prop === 'flipY' || prop === 'locked') {
            this.model.setProps({ [prop]: field.checked });
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
        if (output) output.textContent = field.value;
      });
      this.panel.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        event.preventDefault();
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
        const label = String(code).startsWith('SVC_') ? 'Señal de servicios' : TYPE_NAMES.sign;
        return `${label} · ${code}`;
      }
      if (element.type === 'pipe') {
        const info = this.model.networkInfo(element.network);
        return info ? `Tubería · ${info.label}` : TYPE_NAMES.pipe;
      }
      if (element.type === 'conduit') return `Circuito ${element.circuit || 'C1'}`;
      if (this.model.cadForType(element.type)) return TYPE_NAMES.cad;
      return TYPE_NAMES[element.type] || 'Elemento';
    }

    render(force = false) {
      if (!this.panel) return;
      const elements = this.model.selectedElements();
      const ids = elements.map((element) => element.id).sort().join(',');
      const types = elements.map((element) => element.type).join(',');
      const signature = `${ids}|${types}`;
      const active = document.activeElement;
      const isTyping = active && this.panel.contains(active);
      if (!force && (signature === this.signature || isTyping)) return;
      this.signature = signature;
      if (!elements.length) {
        this.title.textContent = 'Propiedades';
        this.panel.innerHTML = this.emptyMarkup();
        this.panelEl?.classList.remove('has-selection');
        return;
      }
      this.panelEl?.classList.add('has-selection');
      const frame = this.model.selectionFrame();
      const single = elements.length === 1 ? elements[0] : null;
      this.title.textContent = single ? this.typeName(single) : `${elements.length} elementos`;
      this.panel.innerHTML = this.markup(elements, frame, single);
    }

    emptyMarkup() {
      const design = this.model.design;
      return `
        <div class="inspector-empty">
          <p>Sin selección. Elige un elemento en el lienzo o usa <strong>Ctrl + A</strong> para seleccionar todo.</p>
          <dl class="inspector-facts">
            <div><dt>Elementos</dt><dd>${design.elements.length}</dd></div>
            <div><dt>Capas</dt><dd>${design.layers.length}</dd></div>
            <div><dt>Grupos</dt><dd>${design.groups.length}</dd></div>
            <div><dt>Lienzo</dt><dd>${G.formatNumber(design.canvas.width, 0)} × ${G.formatNumber(design.canvas.height, 0)} ${esc(design.canvas.unit)}</dd></div>
            <div><dt>Escala</dt><dd>${esc(design.canvas.scale)} (referencia)</dd></div>
          </dl>
          <button class="button button-small button-ghost" type="button" data-action="select-all"><svg class="icon"><use href="#i-select"></use></svg>Seleccionar todo</button>
          <p class="inspector-hint">El plano es esquemático: verifica medidas y escala en sitio antes de usarlo como referencia de obra.</p>
        </div>`;
    }

    markup(elements, frame, single) {
      const design = this.model.design;
      const hasPath = elements.some((element) => Array.isArray(element.points));
      const hasText = elements.some((element) => element.type === 'text' || element.type === 'dimension');
      const hasDoor = elements.some((element) => (root.DOOR_TYPES || ['door']).includes(element.type));
      const hasPipe = Boolean(single && single.type === 'pipe');
      const hasConduit = Boolean(single && single.type === 'conduit');
      const hasDevice = Boolean(single && this.model.isElectricalDeviceType(single.type));
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
      const layerOptions = design.layers.map((layer) => `<option value="${esc(layer.id)}" ${elements.every((element) => element.layerId === layer.id) ? 'selected' : ''}>${esc(layer.name)}</option>`).join('');
      const basicTypes = root.BASIC_TYPES || ['wall', 'door', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse'];
      const typeOptions = basicTypes.map((key) => `<option value="${key}" ${single && single.type === key ? 'selected' : ''}>${TYPE_NAMES[key] || key}</option>`).join('');
      const lockedAll = elements.every((element) => element.locked);
      const sign = single ? this.model.signCodeForType(single.type) : null;
      const cad = single ? this.model.cadForType(single.type) : null;
      const mepSection = (hasPipe || hasConduit || hasDevice) && Mep ? `
        <section class="inspector-section">
          <h3>${hasPipe ? 'Red de tubería' : hasConduit ? 'Circuito eléctrico' : 'Conexión eléctrica'}</h3>
          <div class="inspector-mep">
            ${hasPipe ? `
              <label class="field compact"><span>Red</span><select data-prop="network" ${canEdit ? '' : 'disabled'}>${networkOptions}</select><small>Al cambiar de red se aplican color, diámetro y material de referencia.</small></label>
              <div class="inspector-grid two">
                <label class="field compact"><span>Diámetro</span><select data-prop="diameter" ${canEdit ? '' : 'disabled'}>${diameterOptions}</select></label>
                <label class="field compact"><span>Material</span><select data-prop="material" ${canEdit ? '' : 'disabled'}>${materialOptions}</select></label>
              </div>
              <div class="inspector-grid two">
                <label class="field compact"><span>Pendiente (física)</span><input type="number" min="0" max="15" step="0.5" data-prop="slope" value="${Number(single.slope) || 0}" ${canEdit ? '' : 'disabled'}><small>Referencia de diseño; el desagüe real se verifica en obra.</small></label>
                <label class="field compact"><span>Presión (kPa)</span><input type="number" min="0" max="5000" step="5" data-prop="pressure" value="${Number(single.pressure) || 0}" ${canEdit ? '' : 'disabled'}></label>
              </div>
              <p class="help-text">Tramo de ${esc(Mep.formatMeters(Mep.elementLengthMeters(single, design.canvas)))} entre ${Array.isArray(single.points) ? single.points.length : 2} puntos. Arrastra los vértices azules para ajustar el recorrido.</p>` : ''}
            ${hasConduit ? `
              <div class="inspector-grid two">
                <label class="field compact"><span>Circuito</span><input type="text" maxlength="12" data-prop="circuit" value="${esc(single.circuit || 'C1')}" ${canEdit ? '' : 'disabled'}></label>
                <label class="field compact"><span>Tensión</span><select data-prop="voltage" ${canEdit ? '' : 'disabled'}>${voltageOptions}</select></label>
              </div>
              <div class="inspector-grid two">
                <label class="field compact"><span>Calibre</span><select data-prop="gauge" ${canEdit ? '' : 'disabled'}>${gaugeOptions}</select></label>
                <label class="field compact"><span>Fases</span><select data-prop="phases" ${canEdit ? '' : 'disabled'}>${phaseOptions}</select></label>
              </div>
              <p class="help-text">Los tramos con el mismo código forman un circuito. El número de fases se declara aquí, no se deduce de la tensión.</p>
              <p class="help-text">Tramo de ${esc(Mep.formatMeters(Mep.elementLengthMeters(single, design.canvas)))}. El panel <strong>Redes</strong> suma cargas y estima la caída de tensión.</p>` : ''}
            ${hasDevice ? `
              <label class="field compact"><span>Circuito</span><input type="text" maxlength="12" data-prop="circuit" value="${esc(single.circuit || 'C1')}" ${canEdit ? '' : 'disabled'}><small>Agrupa esta carga con su circuito.</small></label>
              <label class="field compact"><span>Carga (VA)</span><input type="number" min="0" max="100000" step="10" data-prop="load" value="${Number(single.load) || 0}" ${canEdit ? '' : 'disabled'}></label>` : ''}
          </div>
        </section>` : '';
      return `
        ${sign ? `<div class="inspector-asset"><span class="inspector-asset-thumb" data-asset-preview="${esc(single.type)}"></span><div><strong>${esc(this.model.catalogs.signs[sign]?.name || sign)}</strong><small>${esc(sign)} · ${esc(this.model.catalogs.signCategories[this.model.catalogs.signs[sign]?.category]?.label || (String(sign).startsWith('SVC_') ? 'Orientación y servicios' : 'ISO 7010'))}</small></div></div>` : ''}
        ${cad ? `<div class="inspector-asset"><span class="inspector-asset-thumb" data-asset-preview="${esc(single.type)}"></span><div><strong>${esc(cad.name)}</strong><small>Equipo CAD esquemático</small></div></div>` : ''}
        ${!canEdit ? '<div class="notice notice-warning compact-notice"><svg class="icon"><use href="#i-lock"></use></svg><p>La selección está bloqueada o pertenece a una capa bloqueada. Desbloquea para editar.</p></div>' : ''}
        <section class="inspector-section">
          <h3>Geometría</h3>
          <div class="inspector-grid two">
            <label class="field compact"><span>X</span><input type="number" step="1" data-prop="x" value="${Math.round(frame.x)}" ${canEdit ? '' : 'disabled'}></label>
            <label class="field compact"><span>Y</span><input type="number" step="1" data-prop="y" value="${Math.round(frame.y)}" ${canEdit ? '' : 'disabled'}></label>
            <label class="field compact"><span>Ancho</span><input type="number" step="1" min="2" data-prop="w" value="${Math.round(frame.w)}" ${canEdit ? '' : 'disabled'}></label>
            <label class="field compact"><span>Alto</span><input type="number" step="1" min="2" data-prop="h" value="${Math.round(frame.h)}" ${canEdit ? '' : 'disabled'}></label>
          </div>
          <label class="field compact"><span>Rotación (°)</span><input type="number" step="1" min="0" max="359" data-prop="rotation" value="${Math.round(frame.rotation || 0)}" ${canEdit ? '' : 'disabled'}></label>
          ${hasPath ? `<p class="help-text">Este elemento tiene un trazo editable: arrastra los <strong>vértices</strong> azules del plano para mover cada punto, haz <strong>doble clic</strong> sobre el trazo para añadir uno y usa <strong>Alt+clic</strong> sobre un vértice para quitarlo. Con Shift el vértice se alinea con el anterior. Ajustar la caja reescala el trazado completo.</p>` : ''}
        </section>
        <section class="inspector-section">
          <h3>Apariencia</h3>
          <div class="swatch-grid" role="group" aria-label="Paleta de colores">
            ${colors.map((color) => `<button class="swatch ${elements.every((element) => element.color === color) ? 'is-selected' : ''}" type="button" data-action="color" data-value="${color}" style="--swatch:${color}" aria-label="Color ${color}" ${canEdit && !sign ? '' : 'disabled'}></button>`).join('')}
          </div>
          <div class="inspector-grid two">
            <label class="field compact"><span>Grosor</span><input type="number" min="0" max="40" step="0.5" data-prop="stroke" value="${single ? single.stroke : elements[0].stroke}" ${canEdit ? '' : 'disabled'}></label>
            <label class="field compact"><span>Opacidad</span><input type="range" min="0.1" max="1" step="0.05" data-prop="opacity" data-live-preview="opacity" value="${single ? single.opacity : elements[0].opacity}" ${canEdit ? '' : 'disabled'}><output data-output="opacity">${Math.round((single ? single.opacity : elements[0].opacity) * 100)}%</output></label>
          </div>
          ${hasText ? `<label class="field compact"><span>Texto</span><textarea data-prop="label" rows="2" maxlength="240" placeholder="Escribe una etiqueta breve">${esc(single ? single.label : '')}</textarea></label>
          <label class="field compact"><span>Tamaño de letra</span><input type="number" min="8" max="160" step="1" data-prop="fontSize" value="${single?.fontSize || 14}"></label>` : ''}
          ${hasDoor ? `<label class="switch-row compact"><span><strong>Cambiar bisagra</strong><small>Voltea la puerta hacia el otro lado del vano.</small></span><input type="checkbox" data-prop="flipX" ${single?.flipX ? 'checked' : ''} ${canEdit ? '' : 'disabled'}></label>
          <label class="switch-row compact"><span><strong>Abrir al otro lado</strong><small>Invierte el sentido de abatimiento respecto al muro.</small></span><input type="checkbox" data-prop="flipY" ${single?.flipY ? 'checked' : ''} ${canEdit ? '' : 'disabled'}></label>` : ''}
        </section>
        ${mepSection}
        <section class="inspector-section">
          <h3>Organización</h3>
          <label class="field compact"><span>Capa</span><select data-prop="layerId">${layerOptions}</select></label>
          <label class="switch-row compact"><span><strong>Bloquear</strong><small>Evita mover o modificar.</small></span><input type="checkbox" data-prop="locked" ${lockedAll ? 'checked' : ''}></label>
          ${single && basicTypes.includes(single.type) ? `<label class="field compact"><span>Tipo de elemento</span><select data-prop="type">${typeOptions}</select><small>Convertir conserva posición, giro y capa. Es útil para corregir trazos.</small></label>` : ''}
        </section>
        <section class="inspector-section">
          <h3>Acciones</h3>
          <div class="inspector-actions">
            <button class="action-button" type="button" data-action="duplicate" data-tooltip="Duplicar · Ctrl+D"><svg class="icon"><use href="#i-copy"></use></svg>Duplicar</button>
            <button class="action-button" type="button" data-action="delete" data-tooltip="Eliminar · Supr"><svg class="icon"><use href="#i-trash"></use></svg>Eliminar</button>
            <button class="action-button" type="button" data-action="lock"><svg class="icon"><use href="#i-lock"></use></svg>${lockedAll ? 'Desbloquear' : 'Bloquear'}</button>
            <button class="action-button" type="button" data-action="group" ${elements.length > 1 ? '' : 'disabled'}><svg class="icon"><use href="#i-group"></use></svg>Agrupar</button>
            <button class="action-button" type="button" data-action="ungroup" ${this.model.isSelectionGrouped() ? '' : 'disabled'}><svg class="icon"><use href="#i-ungroup"></use></svg>Desagrupar</button>
          </div>
          <div class="order-buttons" role="group" aria-label="Orden de dibujo">
            <button class="action-button" type="button" data-action="front" data-tooltip="Traer al frente">Frente</button>
            <button class="action-button" type="button" data-action="forward" data-tooltip="Traer adelante">Adelante</button>
            <button class="action-button" type="button" data-action="backward" data-tooltip="Enviar atrás">Atrás</button>
            <button class="action-button" type="button" data-action="back" data-tooltip="Enviar al fondo">Fondo</button>
          </div>
          ${elements.length > 1 ? `<div class="align-buttons" role="group" aria-label="Alinear">
            <button class="action-button" type="button" data-action="align" data-value="left" data-tooltip="Alinear a la izquierda"><svg class="icon"><use href="#i-align-left"></use></svg></button>
            <button class="action-button" type="button" data-action="align" data-value="center" data-tooltip="Centrar horizontal"><svg class="icon"><use href="#i-align-center"></use></svg></button>
            <button class="action-button" type="button" data-action="align" data-value="right" data-tooltip="Alinear a la derecha"><svg class="icon"><use href="#i-align-right"></use></svg></button>
            <button class="action-button" type="button" data-action="align" data-value="top" data-tooltip="Alinear arriba"><svg class="icon"><use href="#i-align-top"></use></svg></button>
            <button class="action-button" type="button" data-action="align" data-value="middle" data-tooltip="Centrar vertical"><svg class="icon"><use href="#i-align-middle"></use></svg></button>
            <button class="action-button" type="button" data-action="align" data-value="bottom" data-tooltip="Alinear abajo"><svg class="icon"><use href="#i-align-bottom"></use></svg></button>
            <button class="action-button" type="button" data-action="distribute" data-value="x" data-tooltip="Distribuir horizontal" ${elements.length > 2 ? '' : 'disabled'}><svg class="icon"><use href="#i-distribute-h"></use></svg></button>
            <button class="action-button" type="button" data-action="distribute" data-value="y" data-tooltip="Distribuir vertical" ${elements.length > 2 ? '' : 'disabled'}><svg class="icon"><use href="#i-distribute-v"></use></svg></button>
          </div>` : ''}
        </section>`;
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
