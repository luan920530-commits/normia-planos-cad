/* Normia Planos CAD · modelo editable, historial y operaciones CAD. */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;
  const COLORS = ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#ffffff', '#f8fafc', '#2563eb', '#1d4ed8', '#005387', '#0f766e', '#15803d', '#16a34a', '#237f52', '#65a30d', '#b71f2e', '#dc2626', '#991b1b', '#ea580c', '#f97316', '#f59e0b', '#f9a800', '#eab308', '#facc15', '#7c3aed', '#be185d', '#0891b2', '#ca8a04'];
  const BASIC = ['wall', 'door', 'door_double', 'door_garage', 'route', 'text', 'dimension', 'line', 'rect', 'ellipse'];
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
  const PATH_TYPES = ['wall', 'route', 'line', 'dimension'];
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
    signCodeForType(type) {
      const match = /^iso_([efmpw][0-9]{3})$/i.exec(String(type || ''));
      if (!match) return null;
      const code = match[1].toUpperCase();
      return this.catalogs.signs[code] ? code : null;
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
        return Object.assign(base, { w: 90, h: 90, color: cad.color || defaultColor, stroke: 1.5 });
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
          migrateDoor(normalized, canvas);
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
        migrateDoor(element, this.design.canvas);
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
      const type = kind === 'sign' ? `iso_${String(key).toLowerCase()}` : key;
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
      const allowed = ['color', 'stroke', 'opacity', 'label', 'fontSize', 'flipX', 'flipY', 'layerId', 'locked'];
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
          if (patch.layerId !== undefined && this.layer(patch.layerId)) element.layerId = patch.layerId;
          if (patch.locked !== undefined) element.locked = Boolean(patch.locked);
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
          } else {
            delete element.flipX;
            delete element.flipY;
          }
          if (PATH_TYPES.includes(type)) {
            const isDiagonal = type === 'line' || type === 'route';
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
  root.createModel = (design, catalogs, options) => new Model(design, catalogs, options);
})();
