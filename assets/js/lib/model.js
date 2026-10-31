/* Normia Planos CAD · modelo editable, historial y operaciones CAD. */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;
  const COLORS = ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#ffffff', '#f8fafc', '#2563eb', '#1d4ed8', '#005387', '#0f766e', '#15803d', '#16a34a', '#237f52', '#65a30d', '#b71f2e', '#dc2626', '#991b1b', '#ea580c', '#f97316', '#f59e0b', '#f9a800', '#eab308', '#facc15', '#7c3aed', '#be185d', '#0891b2', '#ca8a04', '#0e7490', '#b45309', '#0369a1', '#c2410c', '#b91c1c'];
  const BASIC = ['wall', 'door', 'door_double', 'door_garage', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse', 'pipe', 'conduit'];
  const DOOR_TYPES = ['door', 'door_double', 'door_garage'];
  /**
   * Las puertas antiguas medían 80 × 16 (solo el hueco del muro) y el símbolo
   * necesita la profundidad de abatimiento. Se conserva la línea del muro
   * (borde inferior) al ampliar el alto.
   */
  const migrateDoor = (element, canvas) => {
    if (element.type !== 'door' || element.h >= element.w * 0.5) return element;
    const edge = element.y + element.h;
    element.h = Math.min(element.w, canvas.height);
    element.y = G.clamp(edge - element.h, 0, canvas.height - element.h);
    return element;
  };
  const PATH_TYPES = ['wall', 'route', 'line', 'dimension', 'pipe', 'conduit'];
  const MEP_TYPES = ['pipe', 'conduit'];
  let idCounter = 0;

  const deep = (value) => JSON.parse(JSON.stringify(value));
  const clone = deep;

  const uid = (prefix) => {
    idCounter += 1;
    return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  };

  const cloneElement = (element) => {
    const copy = deep(element);
    copy.id = uid('el');
    return copy;
  };

  const defaultColor = '#334155';
  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

  class Model {
    constructor(design, catalogs = {}, options = {}) {
      this.catalogs = {
        signs: catalogs.signs || {},
        signCategories: catalogs.signCategories || catalogs.categories || {},
        signColors: catalogs.signColors || {},
        cad: catalogs.cad || catalogs.objects || {},
        cadCategories: catalogs.cadCategories || {},
        aliases: catalogs.aliases || {},
        mep: catalogs.mep && typeof catalogs.mep === 'object' ? catalogs.mep : null,
      };
      this.design = this.normalizeDesign(design);
      this.selection = new Set();
      this.clipboard = [];
      this.history = [];
      this.future = [];
      this.activeLayerId = this.design.layers[0]?.id || 'capa_planta';
      this.historyLimit = options.historyLimit || 80;
      this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
      this.savedSnapshot = this.snapshot();
      this._pendingSnapshot = null;
    }

    /* ----------------------------- catálogos ----------------------------- */
    /**
     * Traduce el tipo del editor al código del catálogo de señalización.
     * ISO 7010 usa `iso_<código>` (iso_e002) y las señales de orientación
     * propias usan `sig_<nombre>` (sig_wc_men → SVC_WC_MEN).
     */
    signCodeForType(type) {
      const raw = String(type || '');
      const iso = /^iso_([efmpw][0-9]{3})$/i.exec(raw);
      if (iso) {
        const code = iso[1].toUpperCase();
        return this.catalogs.signs[code] ? code : null;
      }
      const own = /^sig_([a-z][a-z0-9_]{1,40})$/i.exec(raw);
      if (own) {
        const code = `SVC_${own[1].toUpperCase()}`;
        return this.catalogs.signs[code] ? code : null;
      }
      return null;
    }

    /** Código de catálogo → tipo del editor (lo usan la biblioteca y las pruebas). */
    typeForSignCode(code) {
      return String(code).startsWith('SVC_') ? `sig_${String(code).slice(4).toLowerCase()}` : `iso_${String(code).toLowerCase()}`;
    }

    cadForType(type) {
      return this.catalogs.cad[type] || null;
    }

    isKnownType(type) {
      return BASIC.includes(type) || this.signCodeForType(type) !== null || Boolean(this.cadForType(type));
    }

    signCategoryColor(code) {
      const sign = this.catalogs.signs[code];
      if (!sign) return defaultColor;
      return this.catalogs.signColors[sign.category] || this.catalogs.signCategories[sign.category]?.color || defaultColor;
    }

    /* ------------------------- redes y circuitos ------------------------- */
    mepData() {
      return this.catalogs.mep && typeof this.catalogs.mep === 'object' ? this.catalogs.mep : null;
    }

    hydraulicKeys() {
      const mep = this.mepData();
      return mep && mep.hydraulic && typeof mep.hydraulic === 'object' ? Object.keys(mep.hydraulic) : [];
    }

    networkInfo(key) {
      const mep = this.mepData();
      return mep && mep.hydraulic ? mep.hydraulic[key] || null : null;
    }

    /** Estilo y valores por defecto que impone cada red hidrosanitaria. */
    pipeStyle(key) {
      const info = this.networkInfo(key) || {};
      return {
        color: COLORS.includes(info.color) ? info.color : '#0891b2',
        stroke: G.clamp(Number(info.stroke) || 3.5, 1, 40),
        diameter: typeof info.diameter === 'string' ? info.diameter : '1/2"',
        material: typeof info.material === 'string' ? info.material : 'pvc',
        slope: info.gravity ? 2 : 0,
        pressure: G.clamp(Number(info.pressureKpa) || 0, 0, 5000),
      };
    }

    electricalConfig() {
      const mep = this.mepData();
      const config = mep && mep.electrical && typeof mep.electrical === 'object' ? mep.electrical : {};
      return {
        voltages: Array.isArray(config.voltages) && config.voltages.length ? config.voltages.map(Number) : [110, 220],
        gauges: Array.isArray(config.gauges) && config.gauges.length ? config.gauges.map(String) : ['14', '12', '10'],
        colors: Array.isArray(config.colors) && config.colors.length ? config.colors.filter((color) => COLORS.includes(color)) : ['#2563eb'],
        defaultCircuit: typeof config.defaultCircuit === 'string' ? config.defaultCircuit : 'C1',
        phases: Array.isArray(config.phases) && config.phases.length ? config.phases.map(Number) : [1, 3],
        defaultPhases: Number(config.defaultPhases) === 3 ? 3 : 1,
      };
    }

    /** Los equipos eléctricos del catálogo admiten circuito y carga (VA). */
    isElectricalDeviceType(type) {
      const cad = this.cadForType(type);
      if (!cad) return false;
      const category = this.catalogs.cadCategories[cad.category];
      return Boolean(category && /el[eé]ctric/i.test(String(category.label || '')));
    }

    /** Color estable por código de circuito: mismo circuito, mismo tono. */
    circuitColor(code) {
      const colors = this.electricalConfig().colors;
      const text = String(code || 'C1').trim();
      const numbered = /^C\s*(\d{1,3})$/.exec(text);
      if (numbered && colors.length) {
        return colors[(Number(numbered[1]) - 1) % colors.length] || '#2563eb';
      }
      let hash = 0;
      for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 9973;
      return colors[hash % colors.length] || '#2563eb';
    }

    sanitizeCircuit(value) {
      const clean = String(value ?? '').toUpperCase().replace(/[^A-Z0-9 .-]/g, '').slice(0, 12).trim();
      return clean || this.electricalConfig().defaultCircuit;
    }

    /**
     * Completa y sanea los atributos de red de un elemento. Se ejecuta al
     * crear, cargar y editar para que el diseño guardado siempre tenga red,
     * diámetro, material, circuito, tensión y calibre coherentes.
     */
    normalizeMepAttributes(element) {
      const type = element.type;
      const mep = this.mepData() || {};
      if (type === 'pipe') {
        const keys = this.hydraulicKeys();
        const network = keys.includes(element.network) ? element.network : (keys[0] || 'agua_fria');
        const style = this.pipeStyle(network);
        const diameters = Array.isArray(mep.diameters) ? mep.diameters : [];
        const materials = mep.materials && typeof mep.materials === 'object' ? Object.keys(mep.materials) : [];
        element.network = network;
        element.diameter = diameters.includes(element.diameter) ? element.diameter : style.diameter;
        element.material = materials.includes(element.material) ? element.material : style.material;
        element.slope = G.clamp(Number.isFinite(Number(element.slope)) ? Number(element.slope) : style.slope, 0, 15);
        element.pressure = G.clamp(Number.isFinite(Number(element.pressure)) ? Number(element.pressure) : style.pressure, 0, 5000);
        if (!COLORS.includes(element.color)) element.color = style.color;
        if (!Number(element.stroke)) element.stroke = style.stroke;
      } else if (type === 'conduit') {
        const config = this.electricalConfig();
        const voltage = Number(element.voltage);
        element.circuit = this.sanitizeCircuit(element.circuit);
        element.voltage = config.voltages.includes(voltage) ? voltage : (config.voltages.includes(220) ? 220 : config.voltages[0]);
        element.gauge = config.gauges.includes(String(element.gauge)) ? String(element.gauge) : (config.gauges.includes('12') ? '12' : config.gauges[0]);
        element.phases = config.phases.includes(Number(element.phases)) ? Number(element.phases) : config.defaultPhases;
        if (!COLORS.includes(element.color)) element.color = config.colors[0];
        if (!Number(element.stroke)) element.stroke = 2.5;
      } else if (this.isElectricalDeviceType(type)) {
        element.circuit = this.sanitizeCircuit(element.circuit);
        element.load = G.clamp(Number.isFinite(Number(element.load)) ? Number(element.load) : Number(this.cadForType(type)?.load) || 0, 0, 100000);
      }
      return element;
    }

    defaultFor(type) {
      const base = {
        type, x: 0, y: 0, w: 80, h: 60, rotation: 0, color: defaultColor, stroke: 2,
        opacity: 1, label: '', locked: false, layerId: this.activeLayerId,
      };
      const code = this.signCodeForType(type);
      if (code) {
        return Object.assign(base, { w: 64, h: 64, color: this.signCategoryColor(code), stroke: 0 });
      }
      const cad = this.cadForType(type);
      if (cad) {
        const preset = Object.assign(base, { w: 90, h: 90, color: cad.color || defaultColor, stroke: 1.5 });
        if (this.isElectricalDeviceType(type)) {
          preset.circuit = this.electricalConfig().defaultCircuit;
          preset.load = G.clamp(Number(cad.load) || 0, 0, 100000);
        }
        return preset;
      }
      switch (type) {
        case 'wall':
          return Object.assign(base, { w: 200, h: 16, stroke: 8, color: '#0f172a', points: [{ x: 0, y: 8 }, { x: 200, y: 8 }] });
        case 'door':
          return Object.assign(base, { w: 90, h: 90, color: '#475569', stroke: 2, flipX: false, flipY: false });
        case 'door_double':
          return Object.assign(base, { w: 120, h: 60, color: '#475569', stroke: 2, flipX: false, flipY: false });
        case 'door_garage':
          return Object.assign(base, { w: 160, h: 50, color: '#475569', stroke: 2, flipX: false, flipY: false });
        case 'route':
          return Object.assign(base, { w: 220, h: 80, stroke: 3, color: '#237f52', points: [{ x: 0, y: 72 }, { x: 110, y: 40 }, { x: 218, y: 8 }] });
        case 'text':
          return Object.assign(base, { w: 180, h: 34, color: '#0f172a', stroke: 0, label: 'Texto', fontSize: 18 });
        case 'dimension':
          return Object.assign(base, { w: 200, h: 20, stroke: 1.5, color: '#475569', fontSize: 12, points: [{ x: 0, y: 10 }, { x: 200, y: 10 }] });
        case 'line':
          return Object.assign(base, { w: 160, h: 2, stroke: 3, color: '#334155', points: [{ x: 0, y: 1 }, { x: 160, y: 1 }] });
        case 'rect':
          return Object.assign(base, { w: 160, h: 100, stroke: 2, color: '#334155' });
        case 'ellipse':
          return Object.assign(base, { w: 140, h: 100, stroke: 2, color: '#334155' });
        case 'pipe': {
          const network = this.hydraulicKeys()[0] || 'agua_fria';
          const style = this.pipeStyle(network);
          return Object.assign(base, {
            w: 240, h: 10, stroke: style.stroke, color: style.color,
            network, diameter: style.diameter, material: style.material,
            slope: style.slope, pressure: style.pressure,
            points: [{ x: 0, y: 5 }, { x: 240, y: 5 }],
          });
        }
        case 'conduit': {
          const config = this.electricalConfig();
          return Object.assign(base, {
            w: 240, h: 10, stroke: 2.5, color: config.colors[0] || '#2563eb',
            circuit: config.defaultCircuit || 'C1',
            voltage: config.voltages.includes(220) ? 220 : config.voltages[0],
            gauge: config.gauges.includes('12') ? '12' : config.gauges[0],
            phases: config.defaultPhases,
            points: [{ x: 0, y: 5 }, { x: 240, y: 5 }],
          });
        }
        default:
          return base;
      }
    }

    /* ----------------------------- normalización ----------------------------- */
    normalizeDesign(design) {
      const source = design && typeof design === 'object' ? design : {};
      const canvasSource = source.canvas || {};
      const canvas = {
        width: G.clamp(Number(canvasSource.width) || 1200, 400, 4000),
        height: G.clamp(Number(canvasSource.height) || 800, 300, 3000),
        grid: G.clamp(Number(canvasSource.grid) || 20, 5, 100),
        unit: ['cm', 'm', 'mm'].includes(canvasSource.unit) ? canvasSource.unit : 'cm',
        scale: /^1:[1-9][0-9]{0,4}$/.test(canvasSource.scale || '') ? canvasSource.scale : '1:100',
        background: ['#ffffff', '#f8fafc'].includes(canvasSource.background) ? canvasSource.background : '#ffffff',
        // Ocupación declarada del piso (personas). 0 = sin declarar: el auditor
        // la estima con el área libre y lo advierte en el informe.
        occupancy: G.clamp(Math.round(Number(canvasSource.occupancy) || 0), 0, 10000),
      };
      let layers = Array.isArray(source.layers) && source.layers.length ? source.layers : [{ id: 'capa_planta', name: 'Planta', visible: true, locked: false }];
      layers = layers.slice(0, 24).map((layer, index) => ({
        id: String(layer.id || `capa_${index + 1}`),
        name: String(layer.name || `Capa ${index + 1}`).slice(0, 60),
        visible: layer.visible !== false,
        locked: Boolean(layer.locked),
      }));
      const layerIds = new Set(layers.map((layer) => layer.id));
      const elements = (Array.isArray(source.elements) ? source.elements : []).slice(0, 1200).map((element, index) => {
        const type = this.isKnownType(element.type) ? element.type : 'rect';
        const base = this.defaultFor(type);
        const normalized = {
          id: String(element.id || `el_${index + 1}`),
          type,
          layerId: layerIds.has(element.layerId) ? element.layerId : layers[0].id,
          x: isFiniteNumber(element.x) ? element.x : 0,
          y: isFiniteNumber(element.y) ? element.y : 0,
          w: Math.max(2, isFiniteNumber(element.w) ? element.w : base.w),
          h: Math.max(2, isFiniteNumber(element.h) ? element.h : base.h),
          rotation: G.normalizeAngle(Number(element.rotation) || 0),
          color: COLORS.includes(element.color) ? element.color : base.color,
          stroke: G.clamp(Number(element.stroke), 0, 40) || (Number(element.stroke) === 0 ? 0 : base.stroke),
          opacity: G.clamp(Number(element.opacity) || 1, 0.1, 1),
          label: typeof element.label === 'string' ? element.label.slice(0, 240) : base.label,
          locked: Boolean(element.locked),
        };
        const code = this.signCodeForType(type);
        if (code) normalized.color = this.signCategoryColor(code);
        if (type === 'text' || type === 'dimension') normalized.fontSize = G.clamp(Number(element.fontSize) || base.fontSize || 14, 8, 160);
        if (DOOR_TYPES.includes(type)) {
          normalized.flipX = Boolean(element.flipX);
          normalized.flipY = Boolean(element.flipY);
          normalized.isExit = Boolean(element.isExit);
          migrateDoor(normalized, canvas);
        }
        if (MEP_TYPES.includes(type) || this.isElectricalDeviceType(type)) {
          this.normalizeMepAttributes(normalized);
        }
        if (PATH_TYPES.includes(type)) {
          const points = Array.isArray(element.points) ? element.points : base.points;
          normalized.points = (points || [{ x: 0, y: 0 }, { x: normalized.w, y: normalized.h }]).slice(0, 40).map((point) => ({
            x: G.clamp(Number(point.x) || 0, 0, normalized.w),
            y: G.clamp(Number(point.y) || 0, 0, normalized.h),
          }));
        }
        return this.clampElement(normalized, canvas);
      });
      const ids = new Set(elements.map((element) => element.id));
      const groups = (Array.isArray(source.groups) ? source.groups : []).slice(0, 80).filter((group) => {
        if (!group || !Array.isArray(group.members)) return false;
        const members = group.members.filter((id) => ids.has(id));
        return members.length >= 2;
      }).map((group, index) => ({
        id: String(group.id || `grupo_${index + 1}`),
        name: String(group.name || `Grupo ${index + 1}`).slice(0, 60),
        members: [...new Set(group.members.filter((id) => ids.has(id)))],
      }));
      return { format: 2, canvas, layers, elements, groups };
    }

    clampElement(element, canvas = this.design.canvas) {
      element.w = G.clamp(element.w, 2, canvas.width);
      element.h = G.clamp(element.h, 2, canvas.height);
      element.x = G.clamp(element.x, 0, canvas.width - element.w);
      element.y = G.clamp(element.y, 0, canvas.height - element.h);
      if (Array.isArray(element.points)) {
        element.points = element.points.map((point) => ({
          x: G.clamp(point.x, 0, element.w),
          y: G.clamp(point.y, 0, element.h),
        }));
      }
      return element;
    }

    /* ----------------------------- eventos/historial ----------------------------- */
    subscribe(callback) {
      this.onChange = typeof callback === 'function' ? callback : null;
    }

    notify(reason = 'change') {
      if (this.onChange) this.onChange(reason, this);
    }

    snapshot() {
      return JSON.stringify(this.design);
    }

    serialize() {
      return clone(this.design);
    }

    isDirty() {
      return this.snapshot() !== this.savedSnapshot;
    }

    markSaved() {
      this.savedSnapshot = this.snapshot();
      this.notify('saved');
    }

    replaceDesign(design) {
      this.design = this.normalizeDesign(design);
      this.selection.clear();
      this.history = [];
      this.future = [];
      this._pendingSnapshot = null;
      this.activeLayerId = this.design.layers[0]?.id || 'capa_planta';
      this.savedSnapshot = this.snapshot();
      this.notify('reload');
    }

    markDirty() {
      this.savedSnapshot = '';
      this.notify('dirty');
    }

    setBaseline(design) {
      this.savedSnapshot = JSON.stringify(design);
      this.notify('baseline');
    }

    pushHistory(before) {
      if (before === this.snapshot()) return false;
      this.history.push(before);
      if (this.history.length > this.historyLimit) this.history.shift();
      this.future = [];
      return true;
    }

    begin() {
      if (this._pendingSnapshot === null) this._pendingSnapshot = this.snapshot();
    }

    end(reason = 'change') {
      if (this._pendingSnapshot !== null) {
        const before = this._pendingSnapshot;
        this._pendingSnapshot = null;
        this.pushHistory(before);
        this.notify(reason);
      }
    }

    apply(reason, mutator) {
      const before = this._pendingSnapshot === null ? this.snapshot() : null;
      const result = mutator();
      if (this._pendingSnapshot === null && before !== null) {
        this.pushHistory(before);
        this.notify(reason);
      }
      return result;
    }

    undo() {
      this.end();
      const previous = this.history.pop();
      if (!previous) return false;
      this.future.push(this.snapshot());
      this.design = JSON.parse(previous);
      this.afterHistory();
      return true;
    }

    redo() {
      const next = this.future.pop();
      if (!next) return false;
      this.history.push(this.snapshot());
      this.design = JSON.parse(next);
      this.afterHistory();
      return true;
    }

    afterHistory() {
      const ids = new Set(this.design.elements.map((element) => element.id));
      this.selection = new Set([...this.selection].filter((id) => ids.has(id)));
      if (!this.design.layers.some((layer) => layer.id === this.activeLayerId)) {
        this.activeLayerId = this.design.layers[0]?.id;
      }
      this.notify('history');
    }

    /* ----------------------------- selección ----------------------------- */
    elements() {
      return this.design.elements;
    }

    layers() {
      return this.design.layers;
    }

    canvas() {
      return this.design.canvas;
    }

    layer(id) {
      return this.design.layers.find((layer) => layer.id === id) || null;
    }

    element(id) {
      return this.design.elements.find((element) => element.id === id) || null;
    }

    activeLayer() {
      return this.layer(this.activeLayerId) || this.design.layers[0];
    }

    setActiveLayer(id) {
      if (this.layer(id)) {
        this.activeLayerId = id;
        this.notify('layer');
      }
    }

    groupFor(id) {
      return this.design.groups.find((group) => group.members.includes(id)) || null;
    }

    expandGroups(ids) {
      const result = new Set(ids);
      let changed = true;
      while (changed) {
        changed = false;
        for (const group of this.design.groups) {
          if (group.members.some((member) => result.has(member))) {
            for (const member of group.members) {
              if (!result.has(member)) {
                result.add(member);
                changed = true;
              }
            }
          }
        }
      }
      return [...result];
    }

    select(ids, additive = false) {
      const visibleLayers = new Set(this.design.layers.filter((layer) => layer.visible).map((layer) => layer.id));
      const valid = (Array.isArray(ids) ? ids : [ids]).filter((id) => {
        const element = this.element(id);
        return element && visibleLayers.has(element.layerId);
      });
      const expanded = this.expandGroups(valid);
      if (!additive) this.selection.clear();
      for (const id of expanded) {
        if (additive && this.selection.has(id)) {
          this.selection.delete(id);
          continue;
        }
        const element = this.element(id);
        if (!element || !visibleLayers.has(element.layerId)) continue;
        this.selection.add(id);
      }
      this.notify('selection');
    }

    clearSelection() {
      if (this.selection.size) {
        this.selection.clear();
        this.notify('selection');
      }
    }

    selectAll() {
      this.selection = new Set(this.design.elements.filter((element) => this.layer(element.layerId)?.visible).map((element) => element.id));
      this.notify('selection');
    }

    selectedIds() {
      return [...this.selection];
    }

    selectedElements() {
      return this.design.elements.filter((element) => this.selection.has(element.id));
    }

    selectionFrame() {
      return G.selectionFrame(this.selectedElements());
    }

    canEdit() {
      const elements = this.selectedElements();
      if (!elements.length) return false;
      return elements.every((element) => !element.locked && !this.layer(element.layerId)?.locked);
    }

    canSelect(id) {
      const element = this.element(id);
      return Boolean(element && this.layer(element.layerId)?.visible);
    }

    /* --------------------------- prueba de impacto --------------------------- */

    /** Punto en coordenadas locales del elemento (deshace su rotación). */
    localPoint(element, point) {
      const center = { x: element.x + element.w / 2, y: element.y + element.h / 2 };
      const rotated = G.rotatePoint(point, center, -(element.rotation || 0));
      return { x: rotated.x - element.x, y: rotated.y - element.y };
    }

    /** ¿El punto alcanza el elemento? `tolerance` en unidades del lienzo. */
    hitTest(element, point, tolerance = 6) {
      if (!element) return false;
      const reach = Math.max(1, Number(tolerance) || 0);
      if (PATH_TYPES.includes(element.type)) {
        const points = this.visualPoints(element);
        const stroke = Math.max(1, Number(element.stroke) || 2) / 2;
        for (let index = 0; index < points.length - 1; index += 1) {
          if (G.distanceToSegment(point, points[index], points[index + 1]) <= stroke + reach) return true;
        }
        return false;
      }
      const local = this.localPoint(element, point);
      const w = Math.max(1, Number(element.w) || 1);
      const h = Math.max(1, Number(element.h) || 1);
      if (element.type === 'ellipse') {
        const nx = (local.x - w / 2) / (w / 2 + reach);
        const ny = (local.y - h / 2) / (h / 2 + reach);
        return nx * nx + ny * ny <= 1;
      }
      return local.x >= -reach && local.x <= w + reach && local.y >= -reach && local.y <= h + reach;
    }

    /**
     * Pila de elementos bajo un punto, del más alto al más bajo, con el mismo
     * orden de pintado que el lienzo (capas y luego orden dentro de la capa).
     * Es la base para seleccionar lo que queda debajo de una superposición.
     */
    hitStack(point, options = {}) {
      const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 6;
      const exclude = new Set(options.exclude || []);
      const stack = [];
      const layers = this.design.layers.filter((layer) => layer.visible);
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];
        const elements = this.design.elements.filter((element) => element.layerId === layer.id && !exclude.has(element.id));
        for (let item = elements.length - 1; item >= 0; item -= 1) {
          if (this.hitTest(elements[item], point, tolerance)) stack.push(elements[item]);
        }
      }
      return stack;
    }

    /* ----------------------------- creación ----------------------------- */
    createElement(type, overrides = {}) {
      if (!this.isKnownType(type)) throw new Error('El tipo de elemento no pertenece a las bibliotecas permitidas.');
      const base = this.defaultFor(type);
      const element = Object.assign(base, overrides);
      element.id = uid('el');
      element.type = type;
      element.layerId = element.layerId && this.layer(element.layerId) ? element.layerId : this.activeLayerId;
      element.rotation = G.normalizeAngle(Number(element.rotation) || 0);
      element.color = COLORS.includes(element.color) ? element.color : base.color;
      element.opacity = G.clamp(Number(element.opacity) || 1, 0.1, 1);
      element.stroke = G.clamp(Number(element.stroke), 0, 40);
      element.w = G.clamp(Number(element.w) || base.w, 2, this.design.canvas.width);
      element.h = G.clamp(Number(element.h) || base.h, 2, this.design.canvas.height);
      element.x = Number(element.x) || 0;
      element.y = Number(element.y) || 0;
      if (type === 'text' || type === 'dimension') element.fontSize = G.clamp(Number(element.fontSize) || base.fontSize || 14, 8, 160);
      if (DOOR_TYPES.includes(type)) {
        element.flipX = Boolean(element.flipX);
        element.flipY = Boolean(element.flipY);
        element.isExit = Boolean(element.isExit);
        migrateDoor(element, this.design.canvas);
      }
      if (type === 'pipe') {
        const network = this.networkInfo(element.network) ? element.network : this.hydraulicKeys()[0] || 'agua_fria';
        const style = this.pipeStyle(network);
        const given = (key) => Object.prototype.hasOwnProperty.call(overrides, key);
        element.network = network;
        if (!given('color')) element.color = style.color;
        if (!given('stroke')) element.stroke = style.stroke;
        if (!given('diameter')) element.diameter = style.diameter;
        if (!given('material')) element.material = style.material;
        if (!given('slope')) element.slope = style.slope;
        if (!given('pressure')) element.pressure = style.pressure;
      }
      if (type === 'conduit' && !Object.prototype.hasOwnProperty.call(overrides, 'color')) {
        element.color = this.circuitColor(element.circuit);
      }
      if (MEP_TYPES.includes(type) || this.isElectricalDeviceType(type)) {
        this.normalizeMepAttributes(element);
      }
      if (PATH_TYPES.includes(type)) {
        element.points = (Array.isArray(element.points) ? element.points : base.points).map((point) => ({
          x: G.clamp(Number(point.x), 0, element.w),
          y: G.clamp(Number(point.y), 0, element.h),
        }));
      }
      return this.clampElement(element);
    }

    addElement(type, overrides = {}) {
      const element = this.createElement(type, overrides);
      return this.apply('add', () => {
        this.design.elements.push(element);
        this.selection = new Set([element.id]);
        this.activeLayerId = element.layerId;
      }), element;
    }

    /* --------------------------- edición de trazos --------------------------- */

    /** Puntos absolutos (ya rotados) del trazo tal como se ven en el lienzo. */
    visualPoints(element) {
      if (!PATH_TYPES.includes(element.type)) return [];
      const center = { x: element.x + element.w / 2, y: element.y + element.h / 2 };
      const points = Array.isArray(element.points) && element.points.length >= 2
        ? element.points
        : [{ x: 0, y: 0 }, { x: element.w, y: element.h }];
      return points.map((point) => G.rotatePoint(
        { x: element.x + (Number(point.x) || 0), y: element.y + (Number(point.y) || 0) },
        center,
        element.rotation || 0,
      ));
    }

    /**
     * Reescribe la geometría de un trazo a partir de puntos absolutos. La caja
     * se recalcula con los límites reales y la rotación se disuelve en los
     * puntos para que mover un vértice no desplace el resto del trazo.
     */
    setPathPoints(id, points) {
      const element = this.element(id);
      if (!element || !PATH_TYPES.includes(element.type)) return false;
      if (!Array.isArray(points) || points.length < 2 || points.length > 40) return false;
      if (!this.canEdit()) return false;
      const list = points.map((point) => ({
        x: G.clamp(Number(point.x) || 0, 0, this.design.canvas.width),
        y: G.clamp(Number(point.y) || 0, 0, this.design.canvas.height),
      }));
      return this.apply('points', () => {
        element.rotation = 0;
        const bounds = G.boundsOfPoints(list);
        const w = G.clamp(Math.max(2, bounds.w), 2, this.design.canvas.width);
        const h = G.clamp(Math.max(2, bounds.h), 2, this.design.canvas.height);
        const x = G.clamp(bounds.x, 0, this.design.canvas.width - w);
        const y = G.clamp(bounds.y, 0, this.design.canvas.height - h);
        element.x = x;
        element.y = y;
        element.w = w;
        element.h = h;
        element.points = list.map((point) => ({
          x: G.clamp(point.x - x, 0, w),
          y: G.clamp(point.y - y, 0, h),
        }));
      }), true;
    }

    /** Mueve un vértice concreto conservando el resto del trazo. */
    setPathPoint(id, index, point) {
      const element = this.element(id);
      if (!element) return false;
      const points = this.visualPoints(element);
      if (index < 0 || index >= points.length) return false;
      points[index] = { x: Number(point.x) || 0, y: Number(point.y) || 0 };
      return this.setPathPoints(id, points);
    }

    /** Inserta un vértice; `after` es el índice tras el que se añade. */
    insertPathPoint(id, after, point) {
      const element = this.element(id);
      if (!element) return false;
      const points = this.visualPoints(element);
      if (points.length >= 40) return false;
      const index = G.clamp(Number(after) + 1, 1, points.length);
      points.splice(index, 0, { x: Number(point.x) || 0, y: Number(point.y) || 0 });
      return this.setPathPoints(id, points);
    }

    /** Elimina un vértice manteniendo al menos dos (un trazo visible). */
    removePathPoint(id, index) {
      const element = this.element(id);
      if (!element) return false;
      const points = this.visualPoints(element);
      if (points.length <= 2 || index < 0 || index >= points.length) return false;
      points.splice(index, 1);
      return this.setPathPoints(id, points);
    }

    addPath(type, points, overrides = {}) {
      if (!PATH_TYPES.includes(type)) throw new Error('La herramienta no admite trazos.');
      if (!Array.isArray(points) || points.length < 2) throw new Error('El trazo debe tener al menos dos puntos.');
      const bounds = G.boundsOfPoints(points);
      const width = Math.max(2, bounds.w);
      const height = Math.max(2, bounds.h);
      const x = G.clamp(bounds.x, 0, this.design.canvas.width - width);
      const y = G.clamp(bounds.y, 0, this.design.canvas.height - height);
      const local = points.map((point) => ({
        x: G.clamp(point.x - x, 0, width),
        y: G.clamp(point.y - y, 0, height),
      }));
      return this.addElement(type, Object.assign({}, overrides, { x, y, w: width, h: height, points: local }));
    }

    addBox(type, x, y, w, h, overrides = {}) {
      return this.addElement(type, Object.assign({}, overrides, {
        x: x - w / 2, y: y - h / 2, w, h,
      }));
    }

    placeFromLibrary(kind, key, point) {
      const type = kind === 'sign' ? this.typeForSignCode(key) : key;
      if (!this.isKnownType(type)) throw new Error('El recurso no pertenece al catálogo local.');
      const base = this.defaultFor(type);
      const size = base.w;
      return this.addElement(type, {
        x: G.clamp(point.x - size / 2, 0, this.design.canvas.width - size),
        y: G.clamp(point.y - size / 2, 0, this.design.canvas.height - size),
        w: size,
        h: size,
        label: '',
      });
    }

    /* ----------------------------- transformación ----------------------------- */
    moveSelected(dx, dy) {
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (!elements.length) return false;
      const minX = Math.min(...elements.map((element) => element.x));
      const minY = Math.min(...elements.map((element) => element.y));
      const maxX = Math.max(...elements.map((element) => element.x + element.w));
      const maxY = Math.max(...elements.map((element) => element.y + element.h));
      const safeDx = G.clamp(dx, -minX, this.design.canvas.width - maxX);
      const safeDy = G.clamp(dy, -minY, this.design.canvas.height - maxY);
      if (!safeDx && !safeDy) return false;
      return this.apply('move', () => {
        elements.forEach((element) => {
          element.x += safeDx;
          element.y += safeDy;
        });
      }), true;
    }

    setNudge(dx, dy) {
      return this.moveSelected(dx, dy);
    }

    setSelectionFrame(frame, options = {}) {
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (!elements.length) return false;
      const oldFrame = this.selectionFrame();
      const target = {
        x: Number(frame.x), y: Number(frame.y),
        w: Math.max(2, Number(frame.w)), h: Math.max(2, Number(frame.h)),
        rotation: G.normalizeAngle(Number(frame.rotation ?? oldFrame.rotation) || 0),
      };
      return this.apply(options.reason || 'resize', () => {
        if (elements.length === 1) {
          const element = elements[0];
          element.rotation = target.rotation;
          G.scaleElement(element, { ...oldFrame, rotation: oldFrame.rotation }, target);
          this.clampElement(element);
        } else {
          elements.forEach((element) => {
            const scaled = G.scaleElement(clone(element), oldFrame, target);
            element.x = scaled.x;
            element.y = scaled.y;
            element.w = scaled.w;
            element.h = scaled.h;
            if (scaled.points) element.points = scaled.points;
            this.clampElement(element);
          });
        }
      }), true;
    }

    moveSelectionTo(x, y) {
      if (!this.canEdit()) return false;
      const frame = this.selectionFrame();
      return this.setSelectionFrame({ ...frame, x, y });
    }

    setRotation(degrees) {
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (!elements.length) return false;
      if (elements.length === 1) {
        return this.apply('rotate', () => {
          elements[0].rotation = G.normalizeAngle(degrees);
        }), true;
      }
      const current = this.selectionFrame();
      const diff = G.normalizeAngle(degrees) - (current.rotation || 0);
      return this.rotateBy(diff);
    }

    rotateBy(degrees) {
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (!elements.length) return false;
      const delta = Number(degrees);
      if (!Number.isFinite(delta) || delta === 0) return false;
      return this.apply('rotate', () => {
        if (elements.length === 1) {
          elements[0].rotation = G.normalizeAngle(elements[0].rotation + delta);
        } else {
          const center = G.centerOf(this.selectionFrame());
          elements.forEach((element) => {
            const elementCenter = { x: element.x + element.w / 2, y: element.y + element.h / 2 };
            const rotated = G.rotatePoint(elementCenter, center, delta);
            element.x = rotated.x - element.w / 2;
            element.y = rotated.y - element.h / 2;
            element.rotation = G.normalizeAngle(element.rotation + delta);
            this.clampElement(element);
          });
        }
      }), true;
    }

    setProps(patch) {
      const elements = this.selectedElements();
      if (!elements.length) return false;
      const allowed = [
        'color', 'stroke', 'opacity', 'label', 'fontSize', 'flipX', 'flipY', 'isExit', 'layerId', 'locked',
        'network', 'diameter', 'material', 'slope', 'pressure', 'circuit', 'voltage', 'gauge', 'phases', 'load',
      ];
      const keys = Object.keys(patch);
      if (!keys.every((key) => allowed.includes(key))) return false;
      const editable = this.canEdit();
      if (!editable && !keys.every((key) => key === 'locked' || key === 'layerId')) return false;
      if (Object.prototype.hasOwnProperty.call(patch, 'label')) {
        if (typeof patch.label !== 'string' || patch.label.length > 240 || /[<>]/.test(patch.label)) throw new Error('La etiqueta no admite HTML ni los signos < >.');
        if (patch.label.trim() === '' && elements.some((element) => element.type === 'text')) {
          throw new Error('Un elemento de texto no puede quedar vacío.');
        }
      }
      return this.apply('style', () => {
        elements.forEach((element) => {
          if (patch.color !== undefined && COLORS.includes(patch.color) && !this.signCodeForType(element.type)) element.color = patch.color;
          if (patch.stroke !== undefined) element.stroke = G.clamp(Number(patch.stroke), 0, 40);
          if (patch.opacity !== undefined) element.opacity = G.clamp(Number(patch.opacity), 0.1, 1);
          if (patch.label !== undefined) element.label = String(patch.label).slice(0, 240);
          if (patch.fontSize !== undefined && (element.type === 'text' || element.type === 'dimension')) {
            element.fontSize = G.clamp(Number(patch.fontSize), 8, 160);
          }
          if (patch.flipX !== undefined && DOOR_TYPES.includes(element.type)) element.flipX = Boolean(patch.flipX);
          if (patch.flipY !== undefined && DOOR_TYPES.includes(element.type)) element.flipY = Boolean(patch.flipY);
          // Solo una puerta puede ser salida de emergencia: es el origen que
          // usa el auditor para medir el recorrido de evacuación.
          if (patch.isExit !== undefined) element.isExit = DOOR_TYPES.includes(element.type) ? Boolean(patch.isExit) : false;
          if (patch.layerId !== undefined && this.layer(patch.layerId)) element.layerId = patch.layerId;
          if (patch.locked !== undefined) element.locked = Boolean(patch.locked);
          if (patch.network !== undefined && element.type === 'pipe' && this.networkInfo(patch.network)) {
            const style = this.pipeStyle(patch.network);
            element.network = patch.network;
            element.color = style.color;
            element.stroke = style.stroke;
            element.diameter = style.diameter;
            element.material = style.material;
            element.slope = style.slope;
            element.pressure = style.pressure;
          }
          if (patch.diameter !== undefined && element.type === 'pipe') element.diameter = String(patch.diameter).slice(0, 12);
          if (patch.material !== undefined && element.type === 'pipe') element.material = String(patch.material).slice(0, 16);
          if (patch.slope !== undefined && element.type === 'pipe') element.slope = G.clamp(Number(patch.slope) || 0, 0, 15);
          if (patch.pressure !== undefined && element.type === 'pipe') element.pressure = G.clamp(Number(patch.pressure) || 0, 0, 5000);
          if (patch.circuit !== undefined && (element.type === 'conduit' || this.isElectricalDeviceType(element.type))) {
            element.circuit = this.sanitizeCircuit(patch.circuit);
            // El color sigue al circuito: así se leen agrupados en el plano.
            if (element.type === 'conduit' && patch.color === undefined) {
              element.color = this.circuitColor(element.circuit);
            }
          }
          if (patch.voltage !== undefined && element.type === 'conduit') {
            const value = Number(patch.voltage);
            element.voltage = this.electricalConfig().voltages.includes(value) ? value : element.voltage;
          }
          if (patch.phases !== undefined && element.type === 'conduit') {
            const value = Number(patch.phases);
            element.phases = this.electricalConfig().phases.includes(value) ? value : element.phases;
          }
          if (patch.gauge !== undefined && element.type === 'conduit') {
            const value = String(patch.gauge);
            element.gauge = this.electricalConfig().gauges.includes(value) ? value : element.gauge;
          }
          if (patch.load !== undefined && this.isElectricalDeviceType(element.type)) {
            element.load = G.clamp(Number(patch.load) || 0, 0, 100000);
          }
        });
      }), true;
    }

    setColor(color) {
      return this.setProps({ color });
    }

    changeType(type) {
      if (!this.isKnownType(type)) throw new Error('El tipo no pertenece a las bibliotecas permitidas.');
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (!elements.length) return false;
      return this.apply('type', () => {
        elements.forEach((element) => {
          const defaultElement = this.defaultFor(type);
          const previousType = element.type;
          const previousCircuit = this.isElectricalDeviceType(previousType) ? element.circuit : '';
          const keepLabel = element.label;
          const keepLayer = element.layerId;
          const keepRotation = element.rotation;
          const keepOpacity = element.opacity;
          const keepLocked = element.locked;
          element.type = type;
          element.color = this.signCodeForType(type) ? this.signCategoryColor(this.signCodeForType(type)) : defaultElement.color;
          element.stroke = defaultElement.stroke;
          element.w = Math.max(2, element.w);
          element.h = Math.max(2, element.h);
          element.rotation = keepRotation;
          element.layerId = keepLayer;
          element.opacity = keepOpacity;
          element.locked = keepLocked;
          element.label = type === 'text' && keepLabel.trim() === '' ? 'Texto' : keepLabel;
          if (type === 'text' || type === 'dimension') element.fontSize = defaultElement.fontSize;
          else delete element.fontSize;
          if (DOOR_TYPES.includes(type)) {
            element.flipX = false;
            element.flipY = false;
            element.isExit = false;
          } else {
            delete element.flipX;
            delete element.flipY;
            delete element.isExit;
          }
          if (MEP_TYPES.includes(type)) {
            const preset = this.defaultFor(type);
            if (type === 'pipe') {
              element.network = preset.network;
              element.diameter = preset.diameter;
              element.material = preset.material;
              element.slope = preset.slope;
              element.pressure = preset.pressure;
            } else {
              element.circuit = preset.circuit;
              element.voltage = preset.voltage;
              element.gauge = preset.gauge;
              element.phases = preset.phases;
            }
            element.color = preset.color;
            element.stroke = preset.stroke;
          } else {
            delete element.network;
            delete element.diameter;
            delete element.material;
            delete element.slope;
            delete element.pressure;
            delete element.circuit;
            delete element.voltage;
            delete element.gauge;
            delete element.phases;
            delete element.load;
          }
          if (this.isElectricalDeviceType(type)) {
            // Cambiar un equipo eléctrico por otro no debe moverlo de circuito:
            // solo se usa el circuito por defecto cuando el elemento no lo era.
            element.circuit = this.isElectricalDeviceType(previousType) && previousCircuit
              ? previousCircuit
              : this.electricalConfig().defaultCircuit;
            element.load = G.clamp(Number(this.cadForType(type)?.load) || 0, 0, 100000);
          }
          if (PATH_TYPES.includes(type)) {
            const isDiagonal = type === 'line' || type === 'route' || MEP_TYPES.includes(type);
            element.points = isDiagonal
              ? [{ x: 0, y: element.h }, { x: element.w, y: 0 }]
              : [{ x: 0, y: element.h / 2 }, { x: element.w, y: element.h / 2 }];
          } else {
            delete element.points;
          }
          this.clampElement(element);
        });
      }), true;
    }

    /* ----------------------------- acciones ----------------------------- */
    deleteSelected() {
      if (!this.canEdit()) return false;
      const ids = new Set(this.selection);
      if (!ids.size) return false;
      return this.apply('delete', () => {
        this.design.elements = this.design.elements.filter((element) => !ids.has(element.id));
        this.design.groups = this.design.groups
          .map((group) => ({ ...group, members: group.members.filter((member) => !ids.has(member)) }))
          .filter((group) => group.members.length >= 2);
        this.selection.clear();
      }), true;
    }

    duplicateSelected(offset = 20) {
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (!elements.length) return false;
      const copies = [];
      return this.apply('duplicate', () => {
        elements.forEach((element) => {
          const copy = cloneElement(element);
          copy.x = G.clamp(copy.x + offset, 0, this.design.canvas.width - copy.w);
          copy.y = G.clamp(copy.y + offset, 0, this.design.canvas.height - copy.h);
          copies.push(copy);
          this.design.elements.push(copy);
        });
        this.selection = new Set(copies.map((copy) => copy.id));
      }), true;
    }

    copySelected() {
      this.clipboard = this.selectedElements().map(clone);
      return this.clipboard.length;
    }

    paste(offset = 20) {
      if (!this.clipboard.length) return false;
      if (!this.canEdit() && this.selectedElements().length) return false;
      const copies = [];
      return this.apply('paste', () => {
        this.clipboard.forEach((source) => {
          const copy = cloneElement(source);
          copy.layerId = this.layer(source.layerId) ? source.layerId : this.activeLayerId;
          copy.x = G.clamp(copy.x + offset, 0, this.design.canvas.width - copy.w);
          copy.y = G.clamp(copy.y + offset, 0, this.design.canvas.height - copy.h);
          copies.push(copy);
          this.design.elements.push(copy);
        });
        this.selection = new Set(copies.map((copy) => copy.id));
      }), true;
    }

    lockSelected(locked = true) {
      return this.setProps({ locked });
    }

    /* ----------------------------- grupos ----------------------------- */
    groupSelected() {
      if (!this.canEdit()) return false;
      const ids = this.selectedIds();
      if (ids.length < 2) return false;
      return this.apply('group', () => {
        this.design.groups = this.design.groups.filter((group) => !group.members.some((member) => ids.includes(member)));
        const group = { id: uid('grupo'), name: `Grupo ${this.design.groups.length + 1}`, members: ids };
        this.design.groups.push(group);
      }), true;
    }

    ungroupSelected() {
      const ids = new Set(this.selectedIds());
      const affected = this.design.groups.filter((group) => group.members.some((member) => ids.has(member)));
      if (!affected.length) return false;
      return this.apply('ungroup', () => {
        this.design.groups = this.design.groups.filter((group) => !affected.includes(group));
      }), true;
    }

    isSelectionGrouped() {
      return this.selectedIds().some((id) => this.groupFor(id));
    }

    /* ----------------------------- alineación ----------------------------- */
    align(mode) {
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (elements.length < 2) return false;
      const bounds = G.boundsOfElements(elements);
      return this.apply('align', () => {
        elements.forEach((element) => {
          const elementBounds = G.boundsOfElement(element);
          let dx = 0;
          let dy = 0;
          if (mode === 'left') dx = bounds.x - elementBounds.x;
          if (mode === 'center') dx = bounds.x + bounds.w / 2 - (elementBounds.x + elementBounds.w / 2);
          if (mode === 'right') dx = bounds.x + bounds.w - (elementBounds.x + elementBounds.w);
          if (mode === 'top') dy = bounds.y - elementBounds.y;
          if (mode === 'middle') dy = bounds.y + bounds.h / 2 - (elementBounds.y + elementBounds.h / 2);
          if (mode === 'bottom') dy = bounds.y + bounds.h - (elementBounds.y + elementBounds.h);
          element.x += dx;
          element.y += dy;
          this.clampElement(element);
        });
      }), true;
    }

    distribute(axis) {
      if (!this.canEdit()) return false;
      const elements = this.selectedElements();
      if (elements.length < 3) return false;
      const key = axis === 'y' ? 'y' : 'x';
      const sizeKey = axis === 'y' ? 'h' : 'w';
      const sorted = [...elements].sort((a, b) => (a[key] + a[sizeKey] / 2) - (b[key] + b[sizeKey] / 2));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const start = first[key] + first[sizeKey] / 2;
      const end = last[key] + last[sizeKey] / 2;
      const step = (end - start) / (sorted.length - 1);
      return this.apply('distribute', () => {
        sorted.forEach((element, index) => {
          if (index === 0 || index === sorted.length - 1) return;
          const center = start + step * index;
          element[key] = center - element[sizeKey] / 2;
          this.clampElement(element);
        });
      }), true;
    }

    /* ----------------------------- orden ----------------------------- */
    zOrder(action) {
      if (!this.canEdit()) return false;
      const ids = new Set(this.selection);
      if (!ids.size) return false;
      return this.apply('order', () => {
        const reordered = [];
        for (const layer of this.design.layers) {
          const list = this.design.elements.filter((element) => element.layerId === layer.id);
          if (action === 'front') {
            reordered.push(...list.filter((element) => !ids.has(element.id)), ...list.filter((element) => ids.has(element.id)));
          } else if (action === 'back') {
            reordered.push(...list.filter((element) => ids.has(element.id)), ...list.filter((element) => !ids.has(element.id)));
          } else if (action === 'forward' || action === 'backward') {
            const step = action === 'forward' ? 1 : -1;
            const indexes = list.map((element, index) => (ids.has(element.id) ? index : -1)).filter((index) => index >= 0);
            if (step > 0) indexes.reverse();
            for (const index of indexes) {
              const target = index + step;
              if (target < 0 || target >= list.length || ids.has(list[target].id)) continue;
              [list[index], list[target]] = [list[target], list[index]];
            }
            reordered.push(...list);
          } else {
            reordered.push(...list);
          }
        }
        this.design.elements = reordered;
      }), true;
    }

    /* ----------------------------- capas ----------------------------- */
    addLayer(name = '') {
      if (this.design.layers.length >= 24) return false;
      const cleanName = String(name).trim() || `Capa ${this.design.layers.length + 1}`;
      const layer = { id: uid('capa'), name: cleanName.slice(0, 60), visible: true, locked: false };
      return this.apply('layer-add', () => {
        this.design.layers.push(layer);
        this.activeLayerId = layer.id;
      }), layer;
    }

    updateLayer(id, patch = {}) {
      const layer = this.layer(id);
      if (!layer) return false;
      const next = { ...layer };
      if (patch.name !== undefined) {
        const name = String(patch.name).trim().slice(0, 60);
        if (!name) return false;
        next.name = name;
      }
      if (patch.visible !== undefined) next.visible = Boolean(patch.visible);
      if (patch.locked !== undefined) next.locked = Boolean(patch.locked);
      return this.apply('layer-update', () => {
        const index = this.design.layers.findIndex((item) => item.id === id);
        this.design.layers[index] = next;
        if (!next.visible) {
          this.selection = new Set([...this.selection].filter((selectedId) => this.element(selectedId)?.layerId !== id));
        }
      }), true;
    }

    deleteLayer(id) {
      if (this.design.layers.length <= 1) return false;
      const layer = this.layer(id);
      if (!layer) return false;
      return this.apply('layer-delete', () => {
        const fallback = this.design.layers.find((item) => item.id !== id);
        this.design.elements.forEach((element) => {
          if (element.layerId === id) element.layerId = fallback.id;
        });
        this.design.layers = this.design.layers.filter((item) => item.id !== id);
        if (this.activeLayerId === id) this.activeLayerId = fallback.id;
      }), true;
    }

    reorderLayer(id, direction) {
      const index = this.design.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return false;
      const target = index + (direction === 'down' ? 1 : -1);
      if (target < 0 || target >= this.design.layers.length) return false;
      return this.apply('layer-order', () => {
        const [layer] = this.design.layers.splice(index, 1);
        this.design.layers.splice(target, 0, layer);
      }), true;
    }

    /* ----------------------------- lienzo ----------------------------- */
    setCanvas(patch) {
      const canvas = { ...this.design.canvas };
      if (patch.width !== undefined) canvas.width = G.clamp(Math.round(Number(patch.width)), 400, 4000);
      if (patch.height !== undefined) canvas.height = G.clamp(Math.round(Number(patch.height)), 300, 3000);
      if (patch.grid !== undefined) canvas.grid = G.clamp(Math.round(Number(patch.grid)), 5, 100);
      if (patch.unit !== undefined && ['cm', 'm', 'mm'].includes(patch.unit)) canvas.unit = patch.unit;
      if (patch.scale !== undefined && /^1:[1-9][0-9]{0,4}$/.test(patch.scale)) canvas.scale = patch.scale;
      if (patch.background !== undefined && ['#ffffff', '#f8fafc'].includes(patch.background)) canvas.background = patch.background;
      if (patch.occupancy !== undefined) canvas.occupancy = G.clamp(Math.round(Number(patch.occupancy)) || 0, 0, 10000);
      const overflow = this.design.elements.some((element) => element.x + element.w > canvas.width + 0.5 || element.y + element.h > canvas.height + 0.5);
      if (overflow) throw new Error('No puedes reducir el lienzo: hay elementos fuera de los nuevos límites. Muévelos o amplía el lienzo.');
      return this.apply('canvas', () => {
        this.design.canvas = canvas;
      }), true;
    }

    updateGroupName(id, name) {
      const group = this.design.groups.find((item) => item.id === id);
      const clean = String(name).trim().slice(0, 60);
      if (!group || !clean) return false;
      return this.apply('group-name', () => {
        group.name = clean;
      }), true;
    }

    /* ----------------------------- pruebas/exportación ----------------------------- */
    toJSON() {
      return this.serialize();
    }
  }

  root.Model = Model;
  root.COLORS = COLORS;
  root.BASIC_TYPES = BASIC;
  root.DOOR_TYPES = DOOR_TYPES;
  root.PATH_TYPES = PATH_TYPES;
  root.MEP_TYPES = MEP_TYPES;
  root.createModel = (design, catalogs, options) => new Model(design, catalogs, options);
})();
