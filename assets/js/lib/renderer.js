/* Normia Planos CAD · renderizador SVG del editor. */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;
  const NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const DOOR_TYPES = ['door', 'door_double', 'door_garage'];
  const PATH_TYPES = ['wall', 'route', 'line', 'dimension', 'pipe', 'conduit'];

  const node = (name, attrs = {}, text = null) => {
    const element = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) element.setAttribute(key, String(value));
    }
    if (text !== null) element.textContent = text;
    return element;
  };

  const clean = (value) => String(value ?? '').replace(/[<>]/g, '');

  class Renderer {
    constructor(svg, catalogs = {}) {
      this.svg = svg;
      this.catalogs = catalogs;
      this.assetCache = new Map();
      this.instance = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      this.assetSequence = 0;
      this.view = { zoom: 1, panX: 0, panY: 0 };
      this.design = null;
    }

    setView(view) {
      this.view = { ...this.view, ...view };
    }

    sourceFor(type) {
      if (this.assetCache.has(type)) return this.assetCache.get(type);
      let raw = null;
      const code = this.signTypeToCode(type);
      if (code && this.catalogs.signs?.[code]) raw = this.catalogs.signs[code].svg;
      if (this.catalogs.cad?.[type]) raw = this.catalogs.cad[type].svg;
      if (!raw) {
        this.assetCache.set(type, null);
        return null;
      }
      const parsed = new DOMParser().parseFromString(raw, 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.nodeName.toLowerCase() !== 'svg') {
        this.assetCache.set(type, null);
        return null;
      }
      this.assetCache.set(type, parsed.documentElement);
      return parsed.documentElement;
    }

    signTypeToCode(type) {
      const raw = String(type || '');
      const iso = /^iso_([efmpw][0-9]{3})$/i.exec(raw);
      if (iso) return iso[1].toUpperCase();
      const own = /^sig_([a-z][a-z0-9_]{1,40})$/i.exec(raw);
      return own ? `SVC_${own[1].toUpperCase()}` : null;
    }

    assetNode(type) {
      const source = this.sourceFor(type);
      if (!source) return null;
      const clone = document.importNode(source, true);
      const viewBox = source.getAttribute('viewBox') || `0 0 ${source.getAttribute('width') || 100} ${source.getAttribute('height') || 100}`;
      clone.setAttribute('viewBox', viewBox);
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.removeAttribute('id');
      clone.classList.add('asset-svg');
      this.namespaceIds(clone);
      return clone;
    }

    /**
     * Evita colisiones de ids al incrustar varias copias del mismo pictograma:
     * prefija ids y referencias internas (#id) por instancia.
     *
     * No se usan selectores con `xlink:href`: el espacio de nombres hace que
     * motores reales rechacen "[xlink:href]" como selector inválido. Se recorren
     * los elementos y se leen los atributos de forma tolerante a ambos formatos.
     */
    namespaceIds(clone) {
      this.assetSequence += 1;
      const prefix = `${this.instance}-a${this.assetSequence}-`;
      const renamed = (value) => '#' + prefix + value.slice(1);
      const renameReferences = (element) => {
        const id = element.getAttribute('id');
        if (id && !id.startsWith(this.instance)) element.setAttribute('id', prefix + id);
        const plain = element.getAttribute('href');
        if (plain && plain.startsWith('#') && !plain.startsWith('#' + this.instance)) {
          element.setAttribute('href', renamed(plain));
        }
        // El atributo xlink:href vive en el espacio de nombres XLink: se
        // actualiza con setAttributeNS para no crear un duplicado literal
        // (setAttribute('xlink:href', …) lo ignoraría el motor de render).
        const namespaced = element.getAttributeNS ? element.getAttributeNS(XLINK_NS, 'href') : null;
        if (namespaced && namespaced.startsWith('#') && !namespaced.startsWith('#' + this.instance)) {
          element.setAttributeNS(XLINK_NS, 'xlink:href', renamed(namespaced));
        }
      };
      renameReferences(clone);
      for (const element of Array.from(clone.querySelectorAll('*'))) renameReferences(element);
    }

    /** Miniatura reutilizable para la biblioteca visual. */
    thumbnail(type) {
      const wrapper = node('svg', { viewBox: '0 0 100 100', class: 'library-thumb-svg', 'aria-hidden': 'true' });
      const source = this.assetNode(type);
      if (source) {
        source.setAttribute('x', '4');
        source.setAttribute('y', '4');
        source.setAttribute('width', '92');
        source.setAttribute('height', '92');
        wrapper.appendChild(source);
      } else {
        wrapper.appendChild(node('rect', { x: '20', y: '20', width: '60', height: '60', rx: '8', fill: '#e2e8f0' }));
      }
      return wrapper;
    }

    render(design, ui = {}) {
      this.design = design;
      this.ui = ui;
      this.setView(ui.view || this.view);
      while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
      this.svg.setAttribute('role', 'application');
      this.svg.setAttribute('aria-label', 'Lienzo editable del plano. Usa las herramientas y los atajos de teclado.');
      const canvas = design.canvas;
      const zoom = this.view.zoom || 1;
      const defs = node('defs');
      const grid = canvas.grid;
      const minor = node('pattern', { id: `${this.instance}-minor`, width: grid, height: grid, patternUnits: 'userSpaceOnUse' });
      minor.appendChild(node('path', { d: `M ${grid} 0 L 0 0 0 ${grid}`, fill: 'none', stroke: '#e8edf4', 'stroke-width': 1 / zoom }));
      const major = node('pattern', { id: `${this.instance}-major`, width: grid * 5, height: grid * 5, patternUnits: 'userSpaceOnUse' });
      major.appendChild(node('path', { d: `M ${grid * 5} 0 L 0 0 0 ${grid * 5}`, fill: 'none', stroke: '#d5dde9', 'stroke-width': 1 / zoom }));
      defs.appendChild(minor);
      defs.appendChild(major);
      this.svg.appendChild(defs);

      const viewport = node('g', { class: 'viewport', transform: `translate(${this.view.panX} ${this.view.panY}) scale(${zoom})` });
      this.svg.appendChild(viewport);
      this.viewport = viewport;

      viewport.appendChild(node('rect', { class: 'canvas-paper', x: 0, y: 0, width: canvas.width, height: canvas.height, fill: canvas.background, rx: 2 }));
      if (ui.showGrid !== false) {
        viewport.appendChild(node('rect', { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: `url(#${this.instance}-minor)`, class: 'canvas-grid-minor', opacity: zoom < 0.45 ? 0 : 1 }));
        viewport.appendChild(node('rect', { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: `url(#${this.instance}-major)`, class: 'canvas-grid-major' }));
      }
      viewport.appendChild(node('rect', { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 1 / zoom, class: 'canvas-border' }));

      const visible = new Set(design.layers.filter((layer) => layer.visible).map((layer) => layer.id));
      for (const layer of design.layers) {
        if (!layer.visible) continue;
        const group = node('g', { class: 'layer', 'data-layer': layer.id, 'data-layer-name': layer.name });
        for (const element of design.elements) {
          if (element.layerId !== layer.id) continue;
          group.appendChild(this.elementNode(element, canvas));
        }
        viewport.appendChild(group);
      }

      const overlay = node('g', { class: 'editor-overlay' });
      this.overlay = overlay;
      viewport.appendChild(overlay);

      if (ui.ghost && this.design) overlay.appendChild(this.ghostNode(ui.ghost));
      if (ui.draft) overlay.appendChild(this.draftNode(ui.draft));
      if (Array.isArray(ui.guides)) {
        for (const guide of ui.guides) {
          const attrs = guide.axis === 'x'
            ? { x1: guide.position, y1: 0, x2: guide.position, y2: canvas.height }
            : { x1: 0, y1: guide.position, x2: canvas.width, y2: guide.position };
          overlay.appendChild(node('line', { ...attrs, stroke: '#ec4899', 'stroke-width': 1 / zoom, 'stroke-dasharray': `${5 / zoom} ${4 / zoom}`, class: 'align-guide', 'pointer-events': 'none' }));
        }
      }
      if (ui.selection && ui.selection.size) this.selectionNode(overlay, [...ui.selection], ui);

      this.svg.style.cursor = ui.cursor || 'default';
    }

    /**
     * Puntos absolutos del trazo: el modelo guarda los puntos en coordenadas
     * locales a la caja (0..w, 0..h) y el SVG se dibuja en coordenadas del
     * lienzo, así que hay que sumar x/y. Sin esto el trazo se pintaba en el
     * origen y la caja de selección aparecía lejos de la línea.
     */
    elementPoints(element) {
      let local;
      if (Array.isArray(element.points) && element.points.length >= 2) {
        local = element.points;
      } else if (element.type === 'line' || element.type === 'route') {
        local = [{ x: 0, y: 0 }, { x: element.w, y: element.h }];
      } else {
        local = [{ x: 0, y: (element.h || 0) / 2 }, { x: element.w, y: (element.h || 0) / 2 }];
      }
      return local.map((point) => ({
        x: element.x + (Number(point.x) || 0),
        y: element.y + (Number(point.y) || 0),
      }));
    }

    /**
     * Marco visible de la selección: crece hasta un mínimo en píxeles para que
     * los tiradores no tapen los trazos finos (muros y líneas de 2 unidades).
     * No modifica la geometría guardada.
     */
    displayFrame(frame) {
      const zoom = this.view.zoom || 1;
      const min = 22 / zoom;
      const w = Math.max(frame.w, min);
      const h = Math.max(frame.h, min);
      return {
        x: frame.x - (w - frame.w) / 2,
        y: frame.y - (h - frame.h) / 2,
        w,
        h,
        rotation: frame.rotation || 0,
      };
    }

    /** Posición absoluta (con rotación aplicada) de un tirador o del asa de giro. */
    handlePoint(frame, handle) {
      const left = frame.x;
      const top = frame.y;
      const right = frame.x + frame.w;
      const bottom = frame.y + frame.h;
      const middleX = frame.x + frame.w / 2;
      const middleY = frame.y + frame.h / 2;
      const positions = {
        nw: { x: left, y: top }, n: { x: middleX, y: top }, ne: { x: right, y: top },
        e: { x: right, y: middleY }, se: { x: right, y: bottom }, s: { x: middleX, y: bottom },
        sw: { x: left, y: bottom }, w: { x: left, y: middleY },
      };
      const point = handle === 'rotate' ? { x: middleX, y: top - 26 / (this.view.zoom || 1) } : positions[handle];
      if (!point) return null;
      return frame.rotation ? G.rotatePoint(point, { x: middleX, y: middleY }, frame.rotation) : point;
    }

    /**
     * Símbolo de puerta en vista de planta.
     *
     * La caja del elemento es el área de abatimiento: el vano se dibuja sobre
     * el borde inferior y la hoja gira 90° hacia el interior. `flipX` cambia la
     * bisagra de lado y `flipY` abate hacia el otro lado del muro.
     */
    doorNode(element, options = {}) {
      const zoom = this.view.zoom || 1;
      const color = options.color || element.color || '#475569';
      const stroke = Math.max(1.4, Number(element.stroke) || 2);
      const { x, y, w, h } = element;
      const type = element.type;
      const edge = y + h;
      const flipX = Boolean(element.flipX);
      const flipY = Boolean(element.flipY);
      const group = node('g', { class: `door door-${type.replace('door_', '') || 'single'}` });
      if (flipX || flipY) {
        const px = G.round(x + w / 2, 2);
        const py = G.round(edge, 2);
        group.setAttribute('transform', `translate(${px} ${py}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1}) translate(${-px} ${-py})`);
      }
      const jamb = Math.min(14, Math.max(5, h * 0.16));
      const frameWidth = Math.max(1.8, stroke * 1.15);
      const dash = `${4 / zoom} ${4 / zoom}`;
      const thin = Math.max(1, stroke * 0.65);
      // Jambas: marcan el ancho real del vano.
      group.appendChild(node('line', { x1: x, y1: edge, x2: x, y2: edge - jamb, stroke: color, 'stroke-width': frameWidth, 'stroke-linecap': 'round' }));
      group.appendChild(node('line', { x1: x + w, y1: edge, x2: x + w, y2: edge - jamb, stroke: color, 'stroke-width': frameWidth, 'stroke-linecap': 'round' }));
      // Línea tenue del vano (se borra sobre el muro al exportar a escala).
      group.appendChild(node('line', { x1: x, y1: edge, x2: x + w, y2: edge, stroke: color, 'stroke-width': thin, 'stroke-dasharray': dash, opacity: 0.5 }));
      if (type === 'door_garage') {
        const panelHeight = Math.max(10, Math.min(30, h * 0.55));
        const panelTop = edge - panelHeight;
        group.appendChild(node('rect', {
          x: x + 3, y: panelTop, width: Math.max(6, w - 6), height: panelHeight, rx: Math.min(3, panelHeight / 3),
          fill: color, 'fill-opacity': 0.1, stroke: color, 'stroke-width': Math.max(1.2, stroke * 0.75),
        }));
        const bars = Math.max(3, Math.min(14, Math.round(w / 16)));
        for (let index = 1; index < bars; index += 1) {
          const barX = x + 3 + ((w - 6) * index) / bars;
          group.appendChild(node('line', {
            x1: barX, y1: panelTop + 1.5, x2: barX, y2: edge - 1.5,
            stroke: color, 'stroke-width': Math.max(0.9, stroke * 0.55), opacity: 0.75,
          }));
        }
        const railY = panelTop + panelHeight / 2;
        group.appendChild(node('line', { x1: x + 3, y1: railY, x2: x + w - 3, y2: railY, stroke: color, 'stroke-width': Math.max(0.9, stroke * 0.5), opacity: 0.65 }));
        // Guías laterales del portón.
        group.appendChild(node('line', { x1: x + 3, y1: edge, x2: x + 3, y2: panelTop + panelHeight + 2, stroke: color, 'stroke-width': thin, opacity: 0.75 }));
        group.appendChild(node('line', { x1: x + w - 3, y1: edge, x2: x + w - 3, y2: panelTop + panelHeight + 2, stroke: color, 'stroke-width': thin, opacity: 0.75 }));
        return group;
      }
      const leafLength = Math.max(8, Math.min(type === 'door_double' ? w / 2 : w, h));
      const leafWidth = Math.max(2.2, stroke * 1.2);
      const drawLeaf = (hingeX, reachX) => {
        group.appendChild(node('line', {
          x1: hingeX, y1: edge, x2: hingeX, y2: edge - leafLength,
          stroke: color, 'stroke-width': leafWidth, 'stroke-linecap': 'round',
        }));
        group.appendChild(node('circle', { cx: hingeX, cy: edge, r: Math.max(2, stroke * 1.1), fill: color }));
        // Arco de abatimiento continuo: se lee bien incluso con zoom bajo.
        group.appendChild(node('path', {
          d: `M ${hingeX} ${edge - leafLength} A ${leafLength} ${leafLength} 0 0 ${reachX >= hingeX ? 1 : 0} ${reachX} ${edge}`,
          fill: 'none', stroke: color, 'stroke-width': Math.max(1, stroke * 0.6), opacity: 0.55,
        }));
      };
      if (type === 'door_double') {
        drawLeaf(x, x + leafLength);
        drawLeaf(x + w, x + w - leafLength);
      } else {
        drawLeaf(x, x + leafLength);
      }
      return group;
    }

    elementNode(element, canvas, options = {}) {
      const zoom = this.view.zoom || 1;
      const cx = element.x + element.w / 2;
      const cy = element.y + element.h / 2;
      const transform = `translate(${cx} ${cy}) rotate(${element.rotation || 0}) translate(${-cx} ${-cy})`;
      const group = node('g', {
        class: `plan-element type-${element.type}${element.locked ? ' is-locked' : ''}`,
        'data-id': element.id,
        'data-type': element.type,
        transform,
        opacity: element.opacity < 1 ? element.opacity : 1,
        ...(options.temporary ? { 'pointer-events': 'none', opacity: 0.7 } : {}),
      });
      const type = element.type;
      const color = element.color;
      const stroke = element.stroke;
      if (this.signTypeToCode(type) || this.catalogs.cad?.[type]) {
        const asset = this.assetNode(type);
        if (asset) {
          asset.setAttribute('x', element.x);
          asset.setAttribute('y', element.y);
          asset.setAttribute('width', element.w);
          asset.setAttribute('height', element.h);
          asset.setAttribute('color', color);
          group.appendChild(asset);
        } else {
          group.appendChild(node('rect', { x: element.x, y: element.y, width: element.w, height: element.h, fill: 'none', stroke: '#dc2626', 'stroke-width': 1 / zoom }));
        }
        if (element.label) {
          group.appendChild(node('text', {
            x: element.x + element.w / 2, y: element.y + element.h + 12 / zoom,
            'text-anchor': 'middle', 'font-size': 10 / zoom, fill: '#334155', class: 'element-label',
          }, clean(element.label.split('\n')[0])));
        }
        return group;
      }
      if (type === 'pipe' || type === 'conduit') {
        const Mep = root.Mep;
        const mep = this.catalogs.mep;
        const networkInfo = type === 'pipe' && mep && mep.hydraulic ? mep.hydraulic[element.network] || null : null;
        const points = this.elementPoints(element);
        const pointText = points.map((point) => `${G.round(point.x, 2)} ${G.round(point.y, 2)}`).join(' ');
        const width = Math.max(1.5, Number(stroke) || (type === 'pipe' ? 3.5 : 2.5));
        const dash = type === 'pipe' && Array.isArray(networkInfo?.dash) && networkInfo.dash.length
          ? networkInfo.dash.map((value) => Math.max(1, Number(value) || 1)).join(' ')
          : null;
        group.appendChild(node('polyline', {
          points: pointText,
          fill: 'none',
          stroke: color,
          'stroke-width': width,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: 0.92,
          ...(dash ? { 'stroke-dasharray': dash } : {}),
        }));
        // Nodos del tramo: ayudan a leer acometidas, cambios de diámetro y uniones.
        const joint = Math.max(2, Math.min(5, width * 0.95));
        for (const point of points) {
          group.appendChild(node('circle', {
            cx: point.x, cy: point.y, r: joint,
            fill: '#ffffff', stroke: color, 'stroke-width': Math.max(1, width * 0.45),
          }));
        }
        group.appendChild(node('polyline', {
          points: pointText,
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': Math.max(16 / zoom, width + 12 / zoom),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          class: 'hit-area',
        }));
        const caption = element.label
          ? element.label.split('\n')[0]
          : (Mep && type === 'pipe' ? Mep.pipeCaption(element, this.catalogs, canvas) : (Mep ? Mep.conduitCaption(element) : ''));
        if (caption) {
          const middle = points[Math.floor((points.length - 1) / 2)];
          const next = points[Math.floor((points.length - 1) / 2) + 1] || middle;
          const cx = (middle.x + next.x) / 2;
          const cy = (middle.y + next.y) / 2;
          group.appendChild(node('text', {
            x: cx + 6 / zoom, y: cy - 6 / zoom,
            'font-size': 10 / zoom, fill: color, class: 'element-label mep-label',
            'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif',
            'paint-order': 'stroke', stroke: '#ffffff', 'stroke-width': 3 / zoom, 'stroke-linejoin': 'round',
          }, clean(caption)));
        }
        return group;
      }
      if (type === 'wall' || type === 'route' || type === 'line') {
        const points = this.elementPoints(element);
        const pointText = points.map((point) => `${G.round(point.x, 2)} ${G.round(point.y, 2)}`).join(' ');
        group.appendChild(node('polyline', {
          points: pointText,
          fill: 'none',
          stroke: color,
          'stroke-width': type === 'wall' ? Math.max(1, stroke) : Math.max(1.5, stroke),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          ...(type === 'route' ? { 'stroke-dasharray': `${Math.max(2, stroke * 2)} ${Math.max(1.5, stroke * 1.5)}` } : {}),
        }));
        group.appendChild(node('polyline', {
          points: pointText,
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': Math.max(16 / zoom, (Number(stroke) || 2) + 12 / zoom),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          class: 'hit-area',
        }));
        if (type === 'route' && points.length > 1) {
          const last = points[points.length - 1];
          const prev = points[points.length - 2];
          const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
          const size = Math.max(8, stroke * 3);
          const bx = last.x - Math.cos(angle) * size;
          const by = last.y - Math.sin(angle) * size;
          const leftX = bx + Math.cos(angle + Math.PI / 2) * size * 0.45;
          const leftY = by + Math.sin(angle + Math.PI / 2) * size * 0.45;
          const rightX = bx + Math.cos(angle - Math.PI / 2) * size * 0.45;
          const rightY = by + Math.sin(angle - Math.PI / 2) * size * 0.45;
          group.appendChild(node('polygon', { points: `${last.x},${last.y} ${leftX},${leftY} ${rightX},${rightY}`, fill: color }));
        }
        if (element.label) {
          group.appendChild(node('text', {
            x: points[0].x + 8, y: points[0].y - 8,
            'font-size': 10 / zoom, fill: color, class: 'element-label',
          }, clean(element.label.split('\n')[0])));
        }
        return group;
      }
      if (DOOR_TYPES.includes(type)) {
        group.appendChild(this.doorNode(element));
        if (element.label) {
          group.appendChild(node('text', {
            x: element.x + element.w / 2, y: element.y - 6 / zoom,
            'text-anchor': 'middle', 'font-size': 10 / zoom, fill: '#334155', class: 'element-label',
          }, clean(element.label.split('\n')[0])));
        }
        return group;
      }
      if (type === 'text') {
        const lines = (element.label || 'Texto').split('\n');
        const text = node('text', {
          x: element.x, y: element.y + (element.fontSize || 14),
          fill: color, 'font-size': element.fontSize || 14, 'font-weight': 600,
          class: 'element-text', 'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif',
        });
        lines.forEach((line, index) => {
          text.appendChild(node('tspan', { x: element.x, dy: index === 0 ? 0 : (element.fontSize || 14) * 1.25 }, line));
        });
        group.appendChild(text);
        return group;
      }
      if (type === 'dimension') {
        const points = this.elementPoints(element);
        const a = points[0];
        const b = points[points.length - 1];
        group.appendChild(node('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': Math.max(1, stroke) }));
        group.appendChild(node('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'transparent', 'stroke-width': Math.max(16 / zoom, stroke + 12 / zoom), class: 'hit-area' }));
        group.appendChild(node('line', { x1: a.x, y1: a.y - 6 / zoom, x2: a.x, y2: a.y + 6 / zoom, stroke: color, 'stroke-width': 1 / zoom }));
        group.appendChild(node('line', { x1: b.x, y1: b.y - 6 / zoom, x2: b.x, y2: b.y + 6 / zoom, stroke: color, 'stroke-width': 1 / zoom }));
        const measured = Math.hypot(b.x - a.x, b.y - a.y);
        const caption = element.label || G.formatMeasurement(measured, canvas.unit);
        group.appendChild(node('text', {
          x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 7 / zoom, 'text-anchor': 'middle',
          fill: color, 'font-size': element.fontSize || 12, class: 'element-dimension',
        }, clean(caption)));
        return group;
      }
      if (type === 'rect') {
        group.appendChild(node('rect', { x: element.x, y: element.y, width: element.w, height: element.h, rx: 2, fill: color, 'fill-opacity': 0.08, stroke: color, 'stroke-width': Math.max(1, stroke) }));
        return group;
      }
      if (type === 'ellipse') {
        group.appendChild(node('ellipse', { cx: element.x + element.w / 2, cy: element.y + element.h / 2, rx: element.w / 2, ry: element.h / 2, fill: color, 'fill-opacity': 0.08, stroke: color, 'stroke-width': Math.max(1, stroke) }));
        return group;
      }
      return group;
    }

    selectionNode(overlay, ids, ui) {
      const elements = this.design.elements.filter((element) => ids.includes(element.id));
      if (!elements.length) return;
      const frame = this.displayFrame(G.selectionFrame(elements));
      const zoom = this.view.zoom || 1;
      const cx = frame.x + frame.w / 2;
      const cy = frame.y + frame.h / 2;
      const editable = elements.every((element) => !element.locked && !this.design.layers.find((layer) => layer.id === element.layerId)?.locked);
      const group = node('g', {
        class: 'selection-frame',
        transform: `translate(${cx} ${cy}) rotate(${frame.rotation || 0}) translate(${-cx} ${-cy})`,
        'data-locked': editable ? 'false' : 'true',
      });
      group.appendChild(node('rect', {
        x: frame.x, y: frame.y, width: frame.w, height: frame.h,
        fill: 'none', stroke: editable ? '#2563eb' : '#f59e0b', 'stroke-width': 1.5 / zoom,
        'stroke-dasharray': editable ? 'none' : `${6 / zoom} ${4 / zoom}`, 'pointer-events': 'none',
      }));
      // Vértices editables: arrastrar un punto mueve la esquina y el doble clic
      // sobre un segmento añade uno nuevo.
      const single = elements.length === 1 ? elements[0] : null;
      if (single && PATH_TYPES.includes(single.type) && editable && ui.activeTool === 'select') {
        const points = this.elementPoints(single);
        const dot = 4.5 / zoom;
        for (const [index, point] of points.entries()) {
          const handle = node('circle', {
            cx: point.x, cy: point.y, r: dot,
            fill: '#ffffff', stroke: '#1d4ed8', 'stroke-width': 1.6 / zoom,
            'data-point': String(index), class: 'vertex-handle',
            'pointer-events': 'all',
          });
          handle.appendChild(node('title', {}, index === 0
            ? 'Vértice inicial · arrastra para moverlo · Alt+clic para quitarlo'
            : 'Vértice · arrastra para moverlo · Alt+clic para quitarlo'));
          group.appendChild(handle);
        }
      }
      if (editable && ui.activeTool === 'select') {
        const handleSize = 9 / zoom;
        const handles = [
          ['nw', frame.x, frame.y], ['n', frame.x + frame.w / 2, frame.y], ['ne', frame.x + frame.w, frame.y],
          ['e', frame.x + frame.w, frame.y + frame.h / 2], ['se', frame.x + frame.w, frame.y + frame.h],
          ['s', frame.x + frame.w / 2, frame.y + frame.h], ['sw', frame.x, frame.y + frame.h], ['w', frame.x, frame.y + frame.h / 2],
        ];
        for (const [handle, x, y] of handles) {
          group.appendChild(node('rect', {
            x: x - handleSize / 2, y: y - handleSize / 2, width: handleSize, height: handleSize,
            fill: '#ffffff', stroke: '#2563eb', 'stroke-width': 1.25 / zoom, rx: 1.5 / zoom,
            'data-handle': handle, class: `handle handle-${handle}`,
          }));
        }
        const rotateY = frame.y - 26 / zoom;
        group.appendChild(node('line', { x1: frame.x + frame.w / 2, y1: frame.y, x2: frame.x + frame.w / 2, y2: rotateY, stroke: '#2563eb', 'stroke-width': 1 / zoom, 'pointer-events': 'none' }));
        group.appendChild(node('circle', {
          cx: frame.x + frame.w / 2, cy: rotateY, r: 5 / zoom, fill: '#ffffff', stroke: '#2563eb',
          'stroke-width': 1.25 / zoom, 'data-handle': 'rotate', class: 'handle handle-rotate',
        }));
      }
      overlay.appendChild(group);
    }

    ghostNode(ghost) {
      const frame = { x: ghost.x - ghost.w / 2, y: ghost.y - ghost.h / 2, w: ghost.w, h: ghost.h };
      const group = node('g', { class: 'placement-ghost', 'pointer-events': 'none', opacity: 0.72 });
      group.appendChild(node('rect', { ...frame, fill: 'rgba(37,99,235,.08)', stroke: '#2563eb', 'stroke-width': 1.5 / (this.view.zoom || 1), 'stroke-dasharray': `${5 / (this.view.zoom || 1)} ${4 / (this.view.zoom || 1)}` }));
      if (ghost.type && DOOR_TYPES.includes(ghost.type)) {
        group.appendChild(this.doorNode({ ...ghost, x: frame.x, y: frame.y, color: '#2563eb', stroke: 2 }, { color: '#2563eb' }));
      } else if (ghost.type) {
        const asset = this.assetNode(ghost.type);
        if (asset) {
          asset.setAttribute('x', frame.x);
          asset.setAttribute('y', frame.y);
          asset.setAttribute('width', frame.w);
          asset.setAttribute('height', frame.h);
          group.appendChild(asset);
        }
      }
      return group;
    }

    draftNode(draft) {
      const zoom = this.view.zoom || 1;
      const group = node('g', { class: 'draft-preview', 'pointer-events': 'none' });
      if (!draft.points?.length) return group;
      if (draft.tool === 'rect' || draft.tool === 'ellipse') {
        const bounds = G.boundsOfPoints(draft.points);
        if (draft.tool === 'rect') {
          group.appendChild(node('rect', { x: bounds.x, y: bounds.y, width: Math.max(1, bounds.w), height: Math.max(1, bounds.h), fill: 'rgba(37,99,235,.06)', stroke: '#2563eb', 'stroke-width': 1.5 / zoom, 'stroke-dasharray': `${5 / zoom} ${4 / zoom}` }));
        } else {
          group.appendChild(node('ellipse', { cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2, rx: bounds.w / 2, ry: bounds.h / 2, fill: 'rgba(37,99,235,.06)', stroke: '#2563eb', 'stroke-width': 1.5 / zoom, 'stroke-dasharray': `${5 / zoom} ${4 / zoom}` }));
        }
        return group;
      }
      if (draft.tool === 'route' || draft.tool === 'pipe' || draft.tool === 'conduit') {
        const mep = this.catalogs.mep;
        const color = draft.color || (draft.tool === 'route' ? '#237f52' : draft.tool === 'conduit' ? '#2563eb' : (mep?.hydraulic?.[draft.network]?.color || '#0891b2'));
        const width = draft.tool === 'route' ? 2 / zoom : Math.max(2, (draft.stroke || 3.5)) / zoom;
        group.appendChild(node('polyline', { points: draft.points.map((point) => `${point.x} ${point.y}`).join(' '), fill: 'none', stroke: color, 'stroke-width': width, 'stroke-dasharray': draft.tool === 'route' ? `${5 / zoom} ${4 / zoom}` : `${9 / zoom} ${5 / zoom}` }));
        for (const [index, point] of draft.points.slice(0, -1).entries()) {
          group.appendChild(node('circle', {
            cx: point.x, cy: point.y, r: (index === 0 ? 7 : 3) / zoom,
            fill: index === 0 ? 'rgba(35, 127, 82, .16)' : color,
            stroke: index === 0 ? color : 'none', 'stroke-width': 1.5 / zoom,
          }));
        }
        return group;
      }
      const points = draft.points;
      if (points.length >= 2) {
        group.appendChild(node('line', { x1: points[0].x, y1: points[0].y, x2: points[points.length - 1].x, y2: points[points.length - 1].y, stroke: '#2563eb', 'stroke-width': 1.5 / zoom, 'stroke-dasharray': `${5 / zoom} ${4 / zoom}` }));
      }
      return group;
    }

    /* -------------------------- pie de página del plano -------------------------- */

    /**
     * El pie del plano se dibuja en el navegador sólo para la exportación PNG.
     * El contenido (`payload`) llega del servidor en `boot.footer`, de modo que
     * la franja de orientación, los datos y la nota de la aplicación sean los
     * mismos que en el SVG exportado y en la impresión.
     */
    static footerColumns(width, count) {
      if (count <= 1) return 1;
      if (width >= 1000) return Math.min(5, count);
      return width >= 620 ? Math.min(3, count) : 1;
    }

    static footerRowHeight(width) {
      return Math.round(Math.max(84, Math.min(150, width * 0.082)) * 100) / 100;
    }

    static footerLineStep(size) {
      return Math.round(size * 1.34 * 100) / 100;
    }

    static footerToneSize(tone) {
      return tone === 'strong' ? 10.5 : (tone === 'body' ? 9.2 : 8.4);
    }

    static footerToneFill(tone) {
      return tone === 'strong' ? '#0f172a' : (tone === 'body' ? '#475569' : '#7c8798');
    }

    /** Parte el texto por palabras con un ancho estimado en caracteres. */
    static wrapText(text, maxChars) {
      const limit = Math.max(8, maxChars);
      const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
      const lines = [];
      let current = '';
      for (const word of words) {
        const candidate = current === '' ? word : `${current} ${word}`;
        if (candidate.length <= limit) {
          current = candidate;
          continue;
        }
        if (current !== '') lines.push(current);
        current = word;
        while (current.length > limit) {
          lines.push(current.slice(0, limit));
          current = current.slice(limit);
        }
      }
      if (current !== '') lines.push(current);
      return lines.length ? lines : [''];
    }

    /** Resuelve los marcadores `{clave}` de las líneas con los datos del piso. */
    static footerText(template, fields) {
      return String(template ?? '').replace(/\{([a-z_]+)\}/g, (match, key) => (
        fields[key] === undefined || fields[key] === null ? match : String(fields[key])
      ));
    }

    footerPayload(payload = {}, width) {
      const fields = payload.fields || {};
      const cells = Array.isArray(payload.cells) ? payload.cells : [];
      const templates = Array.isArray(payload.lines) ? payload.lines : [];
      const lines = [];
      for (const template of templates) {
        const tone = template.tone || 'body';
        const size = Renderer.footerToneSize(tone);
        const text = Renderer.footerText(template.text, fields);
        const maxChars = Math.max(24, Math.floor((width - 28) / (size * 0.52)));
        for (const part of Renderer.wrapText(text, maxChars)) lines.push({ text: part, tone, size });
      }
      return { cells, lines };
    }

    static footerBandHeight(width, count) {
      const rows = Math.ceil(Math.max(1, count) / Renderer.footerColumns(width, count));
      return Math.round(rows * Renderer.footerRowHeight(width) * 100) / 100;
    }

    /** Alto reservado para la marca de agua del pie. */
    static get FOOTER_BRAND_HEIGHT() { return 26; }

    /** Altura total que ocupa el pie (franja + bloque de datos + marca). */
    footerHeight(payload, width) {
      const resolved = this.footerPayload(payload, width);
      const data = resolved.lines.reduce((total, line) => total + Renderer.footerLineStep(line.size), 0);
      return Renderer.footerBandHeight(width, resolved.cells.length) + data + 16 + Renderer.FOOTER_BRAND_HEIGHT;
    }

    /** Dibuja la franja y el bloque de datos a partir de `top`. */
    footerBand(payload, options = {}) {
      const width = Number(options.width || 0);
      const top = Number(options.top || 0);
      const { cells, lines } = this.footerPayload(payload, width);
      const columns = Renderer.footerColumns(width, cells.length);
      const rows = Math.ceil(Math.max(1, cells.length) / columns);
      const rowHeight = Renderer.footerRowHeight(width);
      const band = rows * rowHeight;
      const cellWidth = width / columns;
      const group = node('g', { id: 'pie-plano', 'data-plan-footer': 'guia', 'font-family': 'Helvetica, Arial, sans-serif' });
      group.appendChild(node('rect', { x: 0, y: top, width, height: this.footerHeight(payload, width), fill: '#ffffff' }));

      const bandGroup = node('g', { id: 'guia-evacuacion', 'data-footer-band': '1' });
      bandGroup.appendChild(node('rect', { x: 0, y: top, width, height: band, fill: '#f8fafc', stroke: '#e2e8f0', 'stroke-width': 1 }));
      for (let row = 0; row <= rows; row += 1) {
        const y = top + row * rowHeight;
        bandGroup.appendChild(node('line', { x1: 0, y1: y, x2: width, y2: y, stroke: '#e2e8f0', 'stroke-width': 1 }));
      }
      for (let column = 1; column < columns; column += 1) {
        bandGroup.appendChild(node('line', {
          x1: column * cellWidth, y1: top, x2: column * cellWidth, y2: top + band, stroke: '#e2e8f0', 'stroke-width': 1,
        }));
      }
      cells.forEach((cell, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        bandGroup.appendChild(this.footerCell(cell, column * cellWidth, top + row * rowHeight, cellWidth, rowHeight));
      });
      group.appendChild(bandGroup);

      const dataGroup = node('g', { id: 'datos-plano', 'data-plan-data': '1' });
      dataGroup.appendChild(node('line', { x1: 0, y1: top + band, x2: width, y2: top + band, stroke: '#e2e8f0', 'stroke-width': 1 }));
      let cursor = top + band + 6;
      for (const line of lines) {
        const baseline = cursor + line.size * 0.94;
        dataGroup.appendChild(node('text', {
          x: 14,
          y: Math.round(baseline * 100) / 100,
          'font-size': line.size,
          'font-weight': line.tone === 'strong' ? 600 : 400,
          fill: Renderer.footerToneFill(line.tone),
          'data-footer-line': line.tone,
        }, line.text));
        cursor += Renderer.footerLineStep(line.size);
      }
      dataGroup.appendChild(this.footerBrand(payload, width, cursor + 5));
      group.appendChild(dataGroup);
      this.svg.appendChild(group);
      return group;
    }

    /**
     * Marca de agua del pie, a la derecha: el emblema pequeño y el nombre de
     * la aplicación. Es el mismo contenido que dibuja `PlanFooter` en el
     * servidor, así el SVG y el PNG exportados coinciden.
     */
    footerBrand(payload, width, top) {
      const brand = payload.brand && typeof payload.brand === 'object' ? payload.brand : {};
      const image = typeof brand.image === 'string' ? brand.image : '';
      const group = node('g', { id: 'marca-normia', 'data-footer-brand': '1', opacity: '0.82' });
      if (!image) return group;
      const size = 20;
      const pad = 14;
      const version = brand.version ? ` v${brand.version}` : '';
      const label = `Generado con ${brand.name || 'Normia Planos CAD'}${version}`;
      const fontSize = 7.6;
      const textWidth = Math.min(width * 0.62, label.length * fontSize * 0.54);
      const textX = width - pad - textWidth;
      const imageX = textX - size - 6;
      const imageY = top + 1;
      // `href` (SVG 2) basta para navegadores actuales y para el rasterizador
      // del PNG; la copia en XLink duplicaría la imagen incrustada.
      group.appendChild(node('image', {
        x: Math.round(imageX * 100) / 100,
        y: Math.round(imageY * 100) / 100,
        width: size,
        height: size,
        preserveAspectRatio: 'xMidYMid meet',
        href: image,
      }));
      group.appendChild(node('text', {
        x: Math.round(textX * 100) / 100,
        y: Math.round((imageY + size / 2 + fontSize * 0.36) * 100) / 100,
        'font-size': fontSize,
        fill: '#7c8798',
        'letter-spacing': '0.2',
      }, label));
      return group;
    }

    footerCell(cell, x, y, width, height) {
      const group = node('g', { 'data-footer-cell': cell.key || '' });
      const pad = Math.min(14, height * 0.16);
      const icon = Math.round(height * 0.5 * 100) / 100;
      const gap = Math.round(height * 0.08 * 100) / 100;
      const iconX = x + pad;
      const iconY = y + (height - icon) / 2;
      const textX = iconX + icon + gap;
      const textWidth = Math.max(40, x + width - pad - textX);
      const titleSize = Math.round(Math.max(7.5, Math.min(13.5, height * 0.098)) * 100) / 100;
      const bodySize = Math.round(Math.max(6.6, Math.min(11, height * 0.082)) * 100) / 100;
      const titleChars = Math.max(8, Math.floor(textWidth / (titleSize * 0.56)));
      const bodyChars = Math.max(10, Math.floor(textWidth / (bodySize * 0.52)));
      const titleLines = Renderer.wrapText(cell.title || '', titleChars).slice(0, 2);
      const titleStep = titleSize * 1.18;
      const lineStep = Renderer.footerLineStep(bodySize);
      const titleBlock = titleLines.length * titleStep;
      const available = height - pad * 2 - titleBlock - 4;
      const maxBody = Math.max(1, Math.floor(available / lineStep));
      const bodyLines = Renderer.wrapText(cell.text || '', bodyChars).slice(0, maxBody);
      const blockHeight = titleBlock + 4 + bodyLines.length * lineStep;
      let cursor = y + Math.max(pad, (height - blockHeight) / 2);

      group.appendChild(this.footerIcon(String(cell.icon || ''), iconX, iconY, icon, cell.accent || '#1d4ed8'));
      titleLines.forEach((line, index) => {
        group.appendChild(node('text', {
          x: Math.round(textX * 100) / 100,
          y: Math.round((cursor + titleSize * 0.92 + index * titleStep) * 100) / 100,
          'font-size': titleSize,
          'font-weight': 700,
          fill: cell.title_color || '#0f172a',
          'letter-spacing': 0.3,
        }, line));
      });
      cursor += titleBlock + 4;
      bodyLines.forEach((line, index) => {
        group.appendChild(node('text', {
          x: Math.round(textX * 100) / 100,
          y: Math.round((cursor + bodySize * 0.86 + index * lineStep) * 100) / 100,
          'font-size': bodySize,
          fill: '#475569',
        }, line));
      });
      return group;
    }

    footerIcon(icon, x, y, size, accent) {
      const code = /^sign:([A-Za-z][0-9]{3})$/.exec(icon);
      if (code) {
        const type = `iso_${code[1].toLowerCase()}`;
        const asset = this.assetNode(type);
        if (asset) {
          asset.setAttribute('x', x);
          asset.setAttribute('y', y);
          asset.setAttribute('width', size);
          asset.setAttribute('height', size);
          return asset;
        }
      }
      const scale = size / 24;
      const group = node('g', { transform: `translate(${x} ${y}) scale(${scale})`, fill: accent });
      group.appendChild(node('path', {
        d: icon === 'pin'
          ? 'M12 2.2c-4.2 0-7.6 3.4-7.6 7.6 0 5.6 7.6 12 7.6 12s7.6-6.4 7.6-12c0-4.2-3.4-7.6-7.6-7.6z'
          : 'M2.5 9.4h9.9V5.2L21.9 12l-9.5 6.8v-4.2H2.5z',
        fill: accent,
      }));
      if (icon === 'pin') group.appendChild(node('circle', { cx: 12, cy: 9.8, r: 2.9, fill: '#ffffff' }));
      return group;
    }

    renderRulers(top, left, design, view, unit) {
      this.renderRulerAxis(top, 'x', design, view, unit);
      this.renderRulerAxis(left, 'y', design, view, unit);
    }

    renderRulerAxis(container, axis, design, view, unit) {
      if (!container) return;
      const canvas = design.canvas;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 800;
      const zoom = view.zoom || 1;
      const pan = axis === 'x' ? view.panX : view.panY;
      const length = axis === 'x' ? width : height;
      const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
      const step = steps.find((value) => value * zoom >= 62) || 2000;
      let svg = container.querySelector('svg');
      if (!svg) {
        svg = node('svg', { width: '100%', height: '100%', 'aria-hidden': 'true' });
        container.appendChild(svg);
      }
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const start = Math.floor((-pan / zoom) / step) * step;
      const end = (length - pan) / zoom;
      for (let value = start; value <= end; value += step) {
        const position = value * zoom + pan;
        if (position < 0 || position > length) continue;
        const tick = axis === 'x'
          ? { x1: position, y1: 14, x2: position, y2: 22 }
          : { x1: 14, y1: position, x2: 22, y2: position };
        svg.appendChild(node('line', { ...tick, stroke: '#94a3b8', 'stroke-width': 1 }));
        if (axis === 'x') {
          svg.appendChild(node('text', { x: position + 3, y: 11, 'font-size': 9, fill: '#64748b' }, G.formatNumber(value, 0)));
        } else {
          svg.appendChild(node('text', { x: 2, y: position + 3, 'font-size': 9, fill: '#64748b' }, G.formatNumber(value, 0)));
        }
      }
      const label = node('text', { x: axis === 'x' ? width - 26 : 2, y: axis === 'x' ? 11 : height - 6, 'font-size': 9, fill: '#94a3b8' }, unit || 'cm');
      svg.appendChild(label);
    }
  }

  root.Renderer = Renderer;
  root.SVG_NS = NS;
})();
