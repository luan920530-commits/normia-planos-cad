/* Normia Planos CAD · medición de rutas internas (distancias caminables). */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;
  const NS = 'http://www.w3.org/2000/svg';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const number = (value, decimals = 1) => (Number.isFinite(Number(value))
    ? Number(value).toLocaleString('es-CO', { maximumFractionDigits: decimals })
    : '—');

  const SPEEDS = { walk: 1.2, wheelchair: 0.8 };
  const CELL = 10; // unidades de lienzo por celda (10 cm con el lienzo en cm)
  const CLEARANCE = { walk: 9, wheelchair: 22 };
  const LAYER_NAME = 'Mediciones de ruta';
  const COLOR = '#7c3aed';

  const cmPerUnit = (unit) => ({ m: 100, mm: 0.1, cm: 1 }[unit] ?? 1);
  const metersPerUnit = (unit) => cmPerUnit(unit) / 100;

  /** Cola de prioridad mínima para A* (heap binario). */
  class Heap {
    constructor() {
      this.items = [];
    }

    get size() {
      return this.items.length;
    }

    push(node) {
      const items = this.items;
      items.push(node);
      let index = items.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (items[parent].priority <= items[index].priority) break;
        [items[parent], items[index]] = [items[index], items[parent]];
        index = parent;
      }
    }

    pop() {
      const items = this.items;
      const first = items[0];
      const last = items.pop();
      if (items.length && last) {
        items[0] = last;
        let index = 0;
        for (;;) {
          const left = index * 2 + 1;
          const right = left + 1;
          let smallest = index;
          if (left < items.length && items[left].priority < items[smallest].priority) smallest = left;
          if (right < items.length && items[right].priority < items[smallest].priority) smallest = right;
          if (smallest === index) break;
          [items[smallest], items[index]] = [items[index], items[smallest]];
          index = smallest;
        }
      }
      return first;
    }
  }

  class Measure {
    constructor(app) {
      this.app = app;
      const doc = app.window?.document || (typeof document === 'undefined' ? null : document);
      this.drawer = doc?.querySelector('[data-drawer="measure"]') || null;
      this.host = this.drawer?.querySelector('[data-measure-content]') || null;
      this.traceButton = this.drawer?.querySelector('[data-measure-trace]') || null;
      this.clearButton = this.drawer?.querySelector('[data-measure-clear]') || null;
      this.saveButton = this.drawer?.querySelector('[data-measure-save]') || null;
      this.modes = Array.from(this.drawer?.querySelectorAll('[data-measure-mode]') || []);
      this.mode = 'walk';
      this.tracing = false;
      this.points = [];
      this.path = [];
      this.legs = [];
      this.saved = [];
      this.bind();
    }

    bind() {
      this.traceButton?.addEventListener('click', () => this.start());
      this.clearButton?.addEventListener('click', () => this.clear());
      this.saveButton?.addEventListener('click', () => this.save());
      for (const button of this.modes) {
        button.addEventListener('click', () => this.setMode(button.dataset.measureMode));
      }
    }

    open() {
      this.render();
    }

    setMode(mode) {
      if (!SPEEDS[mode] || mode === this.mode) return;
      this.mode = mode;
      for (const button of this.modes) {
        const active = button.dataset.measureMode === mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      this.clear();
      this.render();
    }

    start() {
      this.tracing = true;
      this.points = [];
      this.path = [];
      this.legs = [];
      this.app.svg?.classList.add('is-measuring');
      this.app.svg?.style.setProperty('cursor', 'crosshair');
      this.render();
      this.app.toast?.('Haz clic en el origen del recorrido.', 'info', { duration: 2600 });
    }

    stop() {
      this.tracing = false;
      this.app.svg?.classList.remove('is-measuring');
      this.app.svg?.style.removeProperty('cursor');
      this.drawOverlay();
    }

    clear() {
      this.points = [];
      this.path = [];
      this.legs = [];
      this.drawOverlay();
      this.render();
    }

    /** Punto de lienzo (ya ajustado por la rejilla) desde el puntero. */
    addPoint(point) {
      const canvas = this.app.model.design.canvas;
      const snapped = this.app.snapPoint ? this.app.snapPoint(point) : point;
      const target = {
        x: G.clamp(snapped.x, 0, canvas.width),
        y: G.clamp(snapped.y, 0, canvas.height),
      };
      const origin = this.points[this.points.length - 1] || null;
      this.points.push(target);
      if (!origin) {
        this.path = [target];
        this.render();
        this.drawOverlay();
        return true;
      }
      const segment = this.route(origin, target);
      if (!segment) {
        this.points.pop();
        this.app.toast?.('No hay un paso caminable entre esos dos puntos. Revisa muros, puertas y equipos.', 'error', { duration: 3600 });
        return false;
      }
      const meters = segment.distance * metersPerUnit(canvas.unit);
      this.legs.push({
        from: origin,
        to: target,
        points: segment.points,
        meters,
        seconds: meters / SPEEDS[this.mode],
      });
      this.path = this.points.length === 1
        ? [target]
        : this.legs.flatMap((leg, index) => (index === 0 ? leg.points : leg.points.slice(1)));
      this.render();
      this.drawOverlay();
      return true;
    }

    /** Total acumulado de la medición en curso. */
    total() {
      const meters = this.legs.reduce((sum, leg) => sum + leg.meters, 0);
      return { meters, seconds: meters / SPEEDS[this.mode], legs: this.legs.length };
    }

    /**
     * Ruta más corta entre dos puntos sobre una retícula que rodea muros y
     * equipos y abre los vanos de las puertas. Devuelve puntos en unidades del
     * lienzo y la distancia en esas mismas unidades.
     */
    route(origin, target) {
      const canvas = this.app.model.design.canvas;
      const width = Number(canvas.width);
      const height = Number(canvas.height);
      const cell = CELL;
      const nx = Math.max(1, Math.ceil(width / cell));
      const ny = Math.max(1, Math.ceil(height / cell));
      const blocked = new Uint8Array(nx * ny);
      const center = (ix, iy) => ({
        x: Math.min(width, (ix + 0.5) * cell),
        y: Math.min(height, (iy + 0.5) * cell),
      });
      const index = (ix, iy) => iy * nx + ix;
      const elements = this.app.model.elements();
      const clearance = CLEARANCE[this.mode] || CLEARANCE.walk;

      const blockBox = (frame, margin = 0, exclude = '') => {
        const x0 = Math.max(0, Math.floor((frame.x - margin) / cell));
        const x1 = Math.min(nx - 1, Math.ceil((frame.x + frame.w + margin) / cell));
        const y0 = Math.max(0, Math.floor((frame.y - margin) / cell));
        const y1 = Math.min(ny - 1, Math.ceil((frame.y + frame.h + margin) / cell));
        for (let iy = y0; iy <= y1; iy += 1) {
          for (let ix = x0; ix <= x1; ix += 1) {
            const point = center(ix, iy);
            if (point.x < frame.x - margin || point.x > frame.x + frame.w + margin) continue;
            if (point.y < frame.y - margin || point.y > frame.y + frame.h + margin) continue;
            blocked[index(ix, iy)] = exclude === 'open' ? 0 : 1;
          }
        }
      };

      const walls = elements.filter((element) => element.type === 'wall');
      for (const wall of walls) {
        const stroke = Math.max(1, Number(wall.stroke) || 2) / 2 + clearance;
        // Mismo aplanado que el auditor: un muro curvo bloquea el arco real,
        // no la cuerda entre sus vértices.
        const points = this.app.model.flatPoints(wall);
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1];
          const b = points[i];
          const margin = stroke + cell;
          const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - margin) / cell));
          const x1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + margin) / cell));
          const y0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - margin) / cell));
          const y1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + margin) / cell));
          for (let iy = y0; iy <= y1; iy += 1) {
            for (let ix = x0; ix <= x1; ix += 1) {
              if (G.distanceToSegment(center(ix, iy), a, b) <= stroke) blocked[index(ix, iy)] = 1;
            }
          }
        }
      }

      // Los vanos de las puertas liberan la franja que ocupan sobre el muro.
      const doors = elements.filter((element) => ['door', 'door_double', 'door_garage'].includes(element.type));
      for (const door of doors) blockBox(door, cell * 0.75, 'open');

      // Equipos grandes: se rodean como obstáculos. En silla de ruedas también
      // se evitan escaleras y equipos medianos.
      for (const element of elements) {
        if (!String(element.type).startsWith('cad_')) continue;
        const area = Number(element.w) * Number(element.h);
        const isStair = /stair|escalera/i.test(element.type);
        const min = this.mode === 'wheelchair' ? 900 : 3200;
        if (area >= min || (isStair && this.mode === 'wheelchair')) blockBox(element, 2);
      }

      const toCell = (point) => ({
        ix: G.clamp(Math.floor(point.x / cell), 0, nx - 1),
        iy: G.clamp(Math.floor(point.y / cell), 0, ny - 1),
      });
      const nearestFree = (cellPoint) => {
        if (!blocked[index(cellPoint.ix, cellPoint.iy)]) return cellPoint;
        for (let radius = 1; radius <= 8; radius += 1) {
          let best = null;
          for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
              const ix = cellPoint.ix + dx;
              const iy = cellPoint.iy + dy;
              if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
              if (blocked[index(ix, iy)]) continue;
              const distance = Math.hypot(dx, dy);
              if (!best || distance < best.distance) best = { ix, iy, distance };
            }
          }
          if (best) return { ix: best.ix, iy: best.iy };
        }
        return null;
      };

      const start = nearestFree(toCell(origin));
      const goal = nearestFree(toCell(target));
      if (!start || !goal) return null;

      const total = nx * ny;
      const dist = new Float64Array(total).fill(Infinity);
      const previous = new Int32Array(total).fill(-1);
      const closed = new Uint8Array(total);
      const queue = new Heap();
      const startIndex = index(start.ix, start.iy);
      const goalIndex = index(goal.ix, goal.iy);
      const heuristic = (ix, iy) => {
        const dx = Math.abs(ix - goal.ix);
        const dy = Math.abs(iy - goal.iy);
        return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
      };
      dist[startIndex] = 0;
      queue.push({ index: startIndex, priority: heuristic(start.ix, start.iy) });
      const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

      while (queue.size) {
        const item = queue.pop();
        if (!item || closed[item.index]) continue;
        if (item.index === goalIndex) break;
        closed[item.index] = 1;
        const ix = item.index % nx;
        const iy = Math.floor(item.index / nx);
        for (const [dx, dy] of steps) {
          const jx = ix + dx;
          const jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const next = index(jx, jy);
          if (blocked[next] || closed[next]) continue;
          // Sin cortar esquinas: el paso diagonal exige los dos ortogonales libres.
          if (dx !== 0 && dy !== 0) {
            if (blocked[index(ix + dx, iy)] || blocked[index(ix, iy + dy)]) continue;
          }
          const candidate = dist[item.index] + Math.hypot(dx, dy) * cell;
          if (candidate + 0.001 >= dist[next]) continue;
          dist[next] = candidate;
          previous[next] = item.index;
          queue.push({ index: next, priority: candidate + heuristic(jx, jy) * cell });
        }
      }

      if (!Number.isFinite(dist[goalIndex])) return null;
      const cells = [];
      let cursor = goalIndex;
      while (cursor !== -1) {
        cells.push(cursor);
        if (cursor === startIndex) break;
        cursor = previous[cursor];
      }
      cells.reverse();
      const points = cells.map((cellIndex) => center(cellIndex % nx, Math.floor(cellIndex / nx)));
      // Tira de la cuerda: se saltan los puntos intermedios cuando hay visión
      // libre entre dos vértices. El trazo guardado queda limpio y sin escalera.
      const freeLine = (a, b) => {
        const length = G.distance(a, b);
        const steps = Math.max(1, Math.ceil(length / (cell / 2)));
        for (let step = 1; step < steps; step += 1) {
          const point = {
            x: a.x + (b.x - a.x) * (step / steps),
            y: a.y + (b.y - a.y) * (step / steps),
          };
          const ix = G.clamp(Math.floor(point.x / cell), 0, nx - 1);
          const iy = G.clamp(Math.floor(point.y / cell), 0, ny - 1);
          if (blocked[index(ix, iy)]) return false;
        }
        return true;
      };
      const simplified = [points[0]];
      let from = 0;
      while (from < points.length - 1) {
        let next = points.length - 1;
        while (next > from + 1 && !freeLine(points[from], points[next])) next -= 1;
        simplified.push(points[next]);
        from = next;
      }
      simplified[0] = { x: origin.x, y: origin.y };
      simplified[simplified.length - 1] = { x: target.x, y: target.y };
      let distance = 0;
      for (let i = 1; i < simplified.length; i += 1) distance += G.distance(simplified[i - 1], simplified[i]);
      return { points: simplified, distance };
    }

    /** Trazo de la medición en curso sobre el lienzo. */
    drawOverlay() {
      const overlay = this.app.renderer?.overlay;
      if (!overlay) return;
      const doc = overlay.ownerDocument;
      overlay.querySelectorAll('.measure-preview').forEach((node) => node.remove());
      if (!this.path || this.path.length < 2) {
        if (this.points.length === 1) {
          const group = doc.createElementNS(NS, 'g');
          group.setAttribute('class', 'measure-preview');
          const dot = doc.createElementNS(NS, 'circle');
          dot.setAttribute('cx', this.points[0].x);
          dot.setAttribute('cy', this.points[0].y);
          dot.setAttribute('r', 5);
          dot.setAttribute('fill', COLOR);
          dot.setAttribute('vector-effect', 'non-scaling-stroke');
          group.appendChild(dot);
          overlay.appendChild(group);
        }
        return;
      }
      const group = doc.createElementNS(NS, 'g');
      group.setAttribute('class', 'measure-preview');
      group.setAttribute('pointer-events', 'none');
      const line = doc.createElementNS(NS, 'polyline');
      line.setAttribute('points', this.path.map((point) => `${point.x},${point.y}`).join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', COLOR);
      line.setAttribute('stroke-width', '2.4');
      line.setAttribute('stroke-dasharray', '7 5');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(line);
      for (const point of this.points) {
        const dot = doc.createElementNS(NS, 'circle');
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
        dot.setAttribute('r', 5);
        dot.setAttribute('fill', '#ffffff');
        dot.setAttribute('stroke', COLOR);
        dot.setAttribute('stroke-width', '2.4');
        dot.setAttribute('vector-effect', 'non-scaling-stroke');
        group.appendChild(dot);
      }
      overlay.appendChild(group);
    }

    render() {
      if (!this.host) return;
      this.saveButton && (this.saveButton.disabled = this.legs.length === 0);
      if (!this.tracing && this.points.length === 0) {
        this.host.innerHTML = `<p class="muted">Pulsa <strong>Trazar ruta</strong> y haz clic en el origen y en el destino. Puedes añadir paradas intermedias antes de guardar.</p>${this.savedMarkup()}`;
        return;
      }
      const total = this.total();
      const metersText = number(total.meters, 2);
      const timeText = this.duration(total.seconds);
      const legs = this.legs.map((leg, index) => `
        <tr>
          <td>${index + 1}</td>
          <td class="measure-num">${number(leg.meters, 2)} m</td>
          <td class="measure-num">${this.duration(leg.seconds)}</td>
        </tr>`).join('');
      this.host.innerHTML = `
        <dl class="measure-stats">
          <div><dt>Distancia</dt><dd data-measure-total>${metersText} m</dd></div>
          <div><dt>Tiempo estimado</dt><dd>${esc(timeText)}</dd></div>
          <div><dt>Paradas</dt><dd>${this.points.length}</dd></div>
          <div><dt>Modo</dt><dd>${this.mode === 'walk' ? 'A pie' : 'Silla de ruedas'}</dd></div>
        </dl>
        ${this.legs.length ? `<table class="measure-table">
          <caption class="visually-hidden">Tramos medidos</caption>
          <thead><tr><th scope="col">Tramo</th><th scope="col">Distancia</th><th scope="col">Tiempo</th></tr></thead>
          <tbody>${legs}</tbody>
        </table>` : ''}
        <p class="measure-hint">${this.tracing
          ? (this.points.length ? 'Haz clic en la siguiente parada o pulsa <strong>Guardar en el plano</strong> para terminar.' : 'Haz clic en el origen del recorrido.')
          : 'Pulsa <strong>Trazar ruta</strong> para empezar otra medición.'}</p>
        <p class="measure-note">Velocidad de referencia en superficie plana: ${SPEEDS[this.mode].toFixed(1).replace('.', ',')} m/s. No incluye rampas, puertas cerradas ni aglomeraciones.</p>
        ${this.savedMarkup()}`;
    }

    /** Comparador sencillo: las mediciones guardadas en esta sesión. */
    savedMarkup() {
      if (!this.saved.length) return '';
      const shortest = Math.min(...this.saved.map((item) => item.meters));
      return `
        <section class="measure-saved">
          <h3>Mediciones guardadas <em>${this.saved.length}</em></h3>
          <ul>
            ${this.saved.map((item, index) => `
              <li${item.meters === shortest ? ' class="is-shortest"' : ''}>
                <span>Ruta ${index + 1} · ${item.mode === 'walk' ? 'a pie' : 'silla de ruedas'}</span>
                <strong>${number(item.meters, 2)} m</strong>
                <small>${this.duration(item.seconds)}${item.meters === shortest ? ' · la más corta' : ''}</small>
              </li>`).join('')}
          </ul>
          <p class="measure-note">Guardadas en la capa «${LAYER_NAME}». La comparación se reinicia al recargar la página.</p>
        </section>`;
    }

    duration(seconds) {
      if (!Number.isFinite(Number(seconds))) return '—';
      const total = Math.max(0, Math.round(Number(seconds)));
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return minutes ? `${minutes} min ${rest} s` : `${rest} s`;
    }

    /** Guarda la medición como una capa aparte con su trazo y su etiqueta. */
    save() {
      if (!this.legs.length) return;
      const model = this.app.model;
      const points = this.path;
      if (points.length < 2) return;
      const total = this.total();
      const label = `Ruta medida · ${number(total.meters, 2)} m · ${this.duration(total.seconds)}`;
      let layer = model.layers().find((item) => item.name === LAYER_NAME);
      model.begin();
      if (!layer) layer = model.addLayer(LAYER_NAME);
      const previous = model.activeLayer();
      if (layer) model.setActiveLayer(layer.id);
      model.addPath('line', points, {
        layerId: layer?.id,
        color: COLOR,
        stroke: 3,
        label,
      });
      const middle = points[Math.floor(points.length / 2)];
      model.addElement('text', {
        layerId: layer?.id,
        x: Math.max(0, middle.x - 70),
        y: Math.max(0, middle.y - 34),
        w: 150,
        h: 22,
        color: COLOR,
        label: `${number(total.meters, 2)} m · ${this.duration(total.seconds)}`,
        fontSize: 13,
      });
      if (previous) model.setActiveLayer(previous);
      model.end('rutas');
      this.saved.push({ meters: total.meters, seconds: total.seconds, mode: this.mode });
      this.app.toast?.(`Medición guardada en la capa «${LAYER_NAME}».`, 'success', { duration: 3200 });
      this.stop();
      this.clear();
      this.app.scheduleRender?.();
    }
  }

  root.Measure = Measure;
})();
