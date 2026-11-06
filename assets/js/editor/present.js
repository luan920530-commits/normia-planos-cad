/* Modo presentación: pantalla limpia, láser, spotlight, rutas animadas, capas y quiz. */
(function (root) {
  'use strict';

  const q = (selector, context = document) => context.querySelector(selector);
  const qa = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const SPEEDS = { slow: { label: 'Lenta', factor: 1.7 }, normal: { label: 'Normal', factor: 1 }, fast: { label: 'Rápida', factor: 0.55 } };
  const EXIT_TYPES = ['door', 'door_double', 'gate'];
  const TRAIL_MS = 900;
  /** Simulacro: milisegundos de pantalla por segundo simulado, por velocidad. */
  const DRILL_MS_PER_S = { slow: 340, normal: 200, fast: 105 };
  /** Velocidad de referencia si el informe no la trae (criterio del auditor). */
  const DEFAULT_SPEED_MPS = 1;

  class Present {
    constructor(app) {
      this.app = app;
      this.active = false;
      this.root = null;
      this.laser = false;
      this.spotlight = false;
      this.speed = 'normal';
      this.panel = null;
      this.snapshot = null;
      this.quiz = [];
      this.quizIndex = 0;
      this.quizScore = 0;
      this.quizAnswered = false;
      this.dots = [];
      this.timer = null;
      this.animated = 0;
      this.lastPoint = null;
      /* Simulacro de evacuación (NORMIA-006 §32). */
      this.drill = null;
      this.drillRaf = null;
      this.drillFigures = [];
    }

    /* ------------------------------- utilidades ------------------------------- */

    get model() { return this.app.model; }

    floorArea() {
      const design = this.model.design;
      return Math.max(1, (design.canvas.width * design.canvas.height) / 1000000);
    }

    exits() {
      return this.model.design.elements.filter((element) => EXIT_TYPES.includes(element.type) && element.isExit);
    }

    signCount(code) {
      return this.model.design.elements.filter((element) => this.model.signCodeForType(element.type) === code).length;
    }

    routes() {
      return this.model.design.elements.filter((element) => element.type === 'route');
    }

    /* ------------------------------ ciclo de vida ----------------------------- */

    mount() {
      if (this.root) return this.root;
      const node = document.createElement('div');
      node.className = 'present';
      node.hidden = true;
      node.setAttribute('data-present', '');
      node.innerHTML = `
        <div class="present-bar" role="toolbar" aria-label="Modo presentación">
          <div class="present-title">
            <strong>${esc(this.app.floorName || 'Piso')}</strong>
            <small>${esc(this.app.boot?.project?.name || 'Proyecto')} · modo presentación</small>
          </div>
          <div class="present-actions">
            <button type="button" class="present-btn" data-present-laser aria-pressed="false" aria-label="Puntero láser"><span class="present-dot-icon"></span>Láser</button>
            <button type="button" class="present-btn" data-present-spot aria-pressed="false" aria-label="Foco de atención">Spotlight</button>
            <button type="button" class="present-btn" data-present-routes aria-label="Animar rutas de evacuación">Rutas</button>
            <button type="button" class="present-btn" data-present-drill aria-label="Simulacro de evacuación">Simulacro</button>
            <label class="present-speed">Velocidad
              <select data-present-speed aria-label="Velocidad de la animación">
                ${Object.entries(SPEEDS).map(([key, value]) => `<option value="${key}"${key === this.speed ? ' selected' : ''}>${value.label}</option>`).join('')}
              </select>
            </label>
            <button type="button" class="present-btn" data-present-layers aria-label="Capas visibles">Capas</button>
            <button type="button" class="present-btn" data-present-quiz aria-label="Quiz del plano">Quiz</button>
            <button type="button" class="present-btn is-exit" data-present-exit aria-label="Salir del modo presentación">Salir</button>
          </div>
        </div>
        <div class="present-panel" data-present-panel hidden></div>
        <div class="present-spotlight" data-present-spotlight hidden></div>
        <svg class="present-laser" data-present-laser-layer aria-hidden="true"></svg>
        <p class="present-hint" data-present-hint>Toca el plano para señalar. <kbd>L</kbd> láser · <kbd>S</kbd> spotlight · <kbd>Esc</kbd> salir</p>`;
      document.body.appendChild(node);
      this.root = node;

      node.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button || !node.contains(button)) return;
        if (button.dataset.presentExit !== undefined) this.close();
        else if (button.dataset.presentLaser !== undefined) this.toggleLaser();
        else if (button.dataset.presentSpot !== undefined) this.toggleSpotlight();
        else if (button.dataset.presentRoutes !== undefined) this.animateRoutes();
        else if (button.dataset.presentDrill !== undefined) this.showDrill();
        else if (button.dataset.drillPlay !== undefined) this.playDrill();
        else if (button.dataset.drillPause !== undefined) this.pauseDrill();
        else if (button.dataset.drillReset !== undefined) this.resetDrill();
        else if (button.dataset.presentLayers !== undefined) this.showLayers();
        else if (button.dataset.presentQuiz !== undefined) this.showQuiz();
        else if (button.dataset.presentAnswer !== undefined) this.answer(Number(button.dataset.presentAnswer));
        else if (button.dataset.presentNext !== undefined) this.nextQuestion();
        else if (button.dataset.presentPanelClose !== undefined) this.hidePanel();
      });
      node.addEventListener('change', (event) => {
        if (event.target.matches('[data-present-speed]')) {
          this.speed = event.target.value;
          if (this.drill) this.renderDrillClock();
        }
        if (event.target.matches('[data-drill-reaction]')) {
          const value = Math.max(0, Math.min(600, Math.round(Number(event.target.value) || 0)));
          event.target.value = String(value);
          if (this.drill) {
            this.drill.reactionS = value;
            this.buildDrillFigures();
            this.resetDrill();
          }
        }
        if (event.target.matches('[data-layer-toggle]')) {
          const layer = this.model.design.layers.find((item) => item.id === event.target.dataset.layerToggle);
          if (layer) {
            layer.visible = event.target.checked;
            this.app.scheduleRender?.();
          }
        }
      });
      return node;
    }

    open() {
      if (this.active) return;
      this.mount();
      this.snapshot = {
        selection: [...(this.model.selection || [])],
        tool: this.app.tool,
        view: { ...this.app.view },
        layers: this.model.design.layers.map((layer) => ({ id: layer.id, visible: layer.visible })),
      };
      this.active = true;
      this.root.hidden = false;
      document.body.classList.add('is-presenting');
      this.app.closeDrawer?.();
      this.app.presenting = true;
      this.bindPointer();
      this.bindKeys();
      this.updateStates();
      this.hint(true);
      this.enterFullscreen();
      this.root.querySelector('[data-present-exit]')?.focus?.();
    }

    close() {
      if (!this.active) return;
      this.active = false;
      this.app.presenting = false;
      if (this.root) this.root.hidden = true;
      document.body.classList.remove('is-presenting');
      this.unbindPointer();
      this.unbindKeys();
      this.clearLaser();
      this.clearAnimation();
      this.stopDrill();
      if (this.snapshot) {
        this.snapshot.layers.forEach((saved) => {
          const layer = this.model.design.layers.find((item) => item.id === saved.id);
          if (layer) layer.visible = saved.visible;
        });
        this.model.selection = this.snapshot.selection.filter((id) => this.model.elements().some((element) => element.id === id));
        this.app.view = { ...this.snapshot.view };
        this.app.applyTool(this.snapshot.tool || 'select', { silent: true });
        this.app.scheduleRender?.();
      }
      this.exitFullscreen();
      this.snapshot = null;
      this.panel = null;
      this.quiz = [];
    }

    enterFullscreen() {
      const element = document.documentElement;
      if (element?.requestFullscreen && !document.fullscreenElement) {
        element.requestFullscreen().catch(() => { /* el navegador puede negarlo; el modo sigue en pantalla completa visual */ });
      }
    }

    exitFullscreen() {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }

    /* --------------------------------- puntero -------------------------------- */

    bindPointer() {
      if (this.onMove) return;
      this.onMove = (event) => this.track(event);
      document.addEventListener('pointermove', this.onMove, { passive: true });
    }

    unbindPointer() {
      if (!this.onMove) return;
      document.removeEventListener('pointermove', this.onMove);
      this.onMove = null;
      this.lastPoint = null;
    }

    track(event) {
      if (!this.active) return;
      if (this.spotlight) {
        const spot = q('[data-present-spotlight]', this.root);
        if (spot) {
          spot.style.setProperty('--x', `${Math.round(event.clientX)}px`);
          spot.style.setProperty('--y', `${Math.round(event.clientY)}px`);
        }
      }
      if (!this.laser) return;
      const last = this.lastPoint;
      if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 7) return;
      this.lastPoint = { x: event.clientX, y: event.clientY };
      this.paintDot(event.clientX, event.clientY);
    }

    paintDot(x, y) {
      const layer = q('[data-present-laser-layer]', this.root);
      if (!layer) return;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', '7');
      dot.setAttribute('class', 'present-beam');
      layer.appendChild(dot);
      this.dots.push(dot);
      if (this.dots.length > 40) this.dots.shift()?.remove();
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      dot.style.animationDuration = `${reduced ? TRAIL_MS / 2 : TRAIL_MS}ms`;
      window.setTimeout(() => {
        dot.remove();
        this.dots = this.dots.filter((item) => item !== dot);
      }, reduced ? TRAIL_MS / 2 : TRAIL_MS);
    }

    clearLaser() {
      this.dots.forEach((dot) => dot.remove());
      this.dots = [];
      q('[data-present-laser-layer]', this.root)?.replaceChildren();
    }

    toggleLaser() {
      this.laser = !this.laser;
      if (!this.laser) this.clearLaser();
      this.updateStates();
      this.hint(this.laser || this.spotlight);
    }

    toggleSpotlight() {
      this.spotlight = !this.spotlight;
      const spot = q('[data-present-spotlight]', this.root);
      if (spot) {
        spot.hidden = !this.spotlight;
        if (this.spotlight) {
          spot.style.setProperty('--x', '50%');
          spot.style.setProperty('--y', '50%');
        }
      }
      this.updateStates();
      this.hint(this.laser || this.spotlight);
    }

    hint(compact) {
      const hint = q('[data-present-hint]', this.root);
      if (!hint) return;
      hint.hidden = Boolean(compact);
    }

    updateStates() {
      const laser = q('[data-present-laser]', this.root);
      const spot = q('[data-present-spot]', this.root);
      if (laser) laser.setAttribute('aria-pressed', String(this.laser));
      if (spot) spot.setAttribute('aria-pressed', String(this.spotlight));
      laser?.classList.toggle('is-on', this.laser);
      spot?.classList.toggle('is-on', this.spotlight);
    }

    /* ---------------------------------- rutas --------------------------------- */

    animationDuration(element) {
      const points = (element.points || []).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
      let length = 0;
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1];
        const b = points[index];
        length += Math.hypot(b.x - a.x, b.y - a.y);
      }
      if (!length) length = Math.hypot(element.w || 0, element.h || 0) || 120;
      const base = Math.min(9000, Math.max(900, length * 9));
      return Math.round(base * (SPEEDS[this.speed]?.factor || 1));
    }

    animateRoutes() {
      this.clearAnimation();
      const routes = this.routes();
      const svg = this.app.svg;
      const duration = this.speed;
      routes.forEach((route, index) => {
        const path = q(`g[data-id="${route.id}"] polyline`, svg);
        if (!path) return;
        const raw = (path.getAttribute('points') || '').trim().split(/\s+/).map(Number);
        let length = 0;
        for (let cursor = 2; cursor + 1 < raw.length; cursor += 2) {
          length += Math.hypot(raw[cursor] - raw[cursor - 2], raw[cursor + 1] - raw[cursor - 1]);
        }
        if (!length) length = 200;
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;
        path.classList.add('is-tracing');
        path.style.animation = `none`;
        // Fuerza el reinicio de la animación en cada pulsación.
        void path.getBoundingClientRect();
        path.style.animation = `present-trace ${this.animationDuration(route)}ms linear ${index * 220}ms forwards`;
        this.animated += 1;
      });
      const label = q('[data-present-routes]', this.root);
      if (label) {
        label.classList.add('is-on');
        label.textContent = routes.length ? `${routes.length} ruta${routes.length === 1 ? '' : 's'}` : 'Sin rutas';
      }
      return { count: this.animated, speed: duration };
    }

    clearAnimation() {
      qa('polyline.is-tracing', this.app.svg).forEach((path) => {
        path.classList.remove('is-tracing');
        path.style.removeProperty('animation');
        path.style.removeProperty('stroke-dasharray');
        path.style.removeProperty('stroke-dashoffset');
      });
      this.animated = 0;
      const label = q('[data-present-routes]', this.root);
      if (label) label.textContent = 'Rutas';
      label?.classList.remove('is-on');
    }

    /* ------------------------------- simulacro -------------------------------- */
    /*
     * Simulacro de evacuación (NORMIA-006 §32): figuras que salen de cada ruta
     * dibujada, esperan el tiempo de reacción, caminan a la salida y siguen
     * hasta el punto de encuentro. Tiempos del servidor; geometría del plano.
     *
     * Lo que se ve es un objetivo calculado, no un simulacro medido: la nota del
     * panel lo dice con esas palabras.
     */

    /** Reloj corto: «42 s» o «1:07». */
    drillClock(seconds) {
      if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '—';
      const total = Math.max(0, Math.round(Number(seconds)));
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest} s`;
    }

    /** Puntos absolutos del trazo (el modelo los guarda locales a la caja). */
    routePath(route) {
      const local = Array.isArray(route.points) && route.points.length >= 2
        ? route.points
        : [{ x: 0, y: 0 }, { x: route.w || 0, y: route.h || 0 }];
      return local.map((point) => ({ x: (Number(route.x) || 0) + (Number(point.x) || 0), y: (Number(route.y) || 0) + (Number(point.y) || 0) }));
    }

    /** Informe del auditor: se reutiliza el del cajón si ya está, o se pide. */
    async loadDrillReport() {
      if (this.app.audit?.report) return this.app.audit.report;
      const url = this.app.boot?.auditUrl || `api/floors/${this.app.boot?.floorId}/audit`;
      const data = await this.app.store.request(url);
      return data.report || null;
    }

    async showDrill() {
      const reaction = Math.max(0, Math.round(Number(this.model.design.canvas.drill?.reactionS ?? 30)));
      this.stopDrill();
      this.drill = { report: null, reactionS: reaction, t: 0, playing: false, layer: null };
      this.showDrillPanel({ loading: true, report: null, reactionS: reaction, error: '' });
      try {
        const report = await this.loadDrillReport();
        if (!report) throw new Error('El servidor no devolvió el informe del plano.');
        this.drill.report = report;
        this.showDrillPanel({ loading: false, report, reactionS: reaction, error: '' });
        this.buildDrillFigures();
        this.resetDrill();
      } catch (error) {
        this.showDrillPanel({ loading: false, report: null, reactionS: reaction, error: error.message || 'No se pudo cargar el informe.' });
      }
    }

    showDrillPanel({ loading, report, reactionS, error }) {
      const drill = report?.drill || null;
      const rows = (drill?.routes || []).map((route, index) => `
        <li data-drill-row="${esc(route.id)}">
          <strong>${esc(route.label || `Ruta ${index + 1}`)}</strong>
          <span>${this.drillClock(route.arrivalS)}</span>
          <small data-drill-state>esperando</small>
        </li>`).join('');
      const target = drill?.targetS ?? null;
      this.showPanel(`
        <header>
          <h2>Simulacro de evacuación</h2>
          <button type="button" class="present-x" data-present-panel-close aria-label="Cerrar">×</button>
        </header>
        ${loading ? '<p class="present-question">Calculando el tiempo objetivo…</p>' : ''}
        ${error ? `<p class="present-feedback is-bad">${esc(error)}</p>` : ''}
        ${!loading && !error && !drill ? '<p class="present-feedback is-bad">El informe no trae el bloque del simulacro.</p>' : ''}
        ${drill ? `
          <div class="drill-controls">
            <label class="drill-field">Reacción
              <input type="number" min="0" max="600" step="5" value="${Number(reactionS) || 0}" data-drill-reaction aria-label="Tiempo de reacción en segundos">
              <span>s</span>
            </label>
            <div class="drill-buttons">
              <button type="button" class="present-btn is-primary" data-drill-play>Reproducir</button>
              <button type="button" class="present-btn" data-drill-pause>Pausa</button>
              <button type="button" class="present-btn" data-drill-reset>Reiniciar</button>
            </div>
          </div>
          <div class="drill-clock" aria-live="polite">
            <strong data-drill-clock>0 s</strong>
            <span data-drill-target>Objetivo ${this.drillClock(target)}</span>
          </div>
          <ul class="drill-list">${rows || '<li class="drill-empty">El piso no tiene rutas de evacuación dibujadas.</li>'}</ul>
          <p class="present-note">Figuras que recorren el <strong>camino libre</strong> calculado sobre el plano (los muros no se atraviesan y el tramo final rodea la edificación), a la velocidad de referencia (${Number(drill.speedMps || DEFAULT_SPEED_MPS).toLocaleString('es-CO', { maximumFractionDigits: 2 })} m/s) y el tiempo de reacción declarado. ${drill.meeting?.found ? 'El recorrido termina en el punto de encuentro declarado.' : 'Sin punto de encuentro declarado: el recorrido termina en la salida.'} No mide un simulacro real ni cuenta participantes: eso se cronometra en sitio.</p>
        ` : ''}`);
    }

    /**
     * Figuras del simulacro: una o varias por ruta, **sobre el camino** que
     * calculó el servidor (`report.drill.routes[].path`).
     *
     * El camino se traza sobre el espacio libre del plano: los muros no se
     * atraviesan y el tramo de la salida al punto de encuentro rodea la
     * edificación. Aquí no se inventa geometría: se usa la que devolvió el
     * auditor y, si faltara, el trazo de la ruta como respaldo.
     *
     * La cantidad de figuras sale del largo del camino: una por cada 4 m, con un
     * mínimo de una y un máximo de cuatro por ruta, para que se vea el tramo
     * cubierto sin llenar el plano de puntos.
     */
    buildDrillFigures() {
      this.clearDrillLayer();
      const report = this.drill?.report || null;
      const drill = report?.drill || null;
      if (!drill) {
        this.drillFigures = [];
        return;
      }
      const reactionS = Math.max(0, Math.round(Number(this.drill?.reactionS ?? drill.reactionS ?? 30)));
      const speed = Math.max(0.1, Number(drill.speedMps) || DEFAULT_SPEED_MPS);
      const unitsPerSecond = speed * 100; // geometría en centímetros
      const figures = [];
      (drill.routes || []).forEach((route, index) => {
        const element = this.model.design.elements.find((item) => item.id === route.id);
        const path = Array.isArray(route.path) && route.path.length >= 2
          ? route.path.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
          : (element ? this.routePath(element) : []);
        if (path.length < 2) return;
        const lengths = [];
        let totalLen = 0;
        for (let cursor = 1; cursor < path.length; cursor += 1) {
          const length = Math.hypot(path[cursor].x - path[cursor - 1].x, path[cursor].y - path[cursor - 1].y);
          lengths.push(length);
          totalLen += length;
        }
        if (totalLen <= 0) return;
        const meters = totalLen / 100;
        const count = Math.max(1, Math.min(4, Math.round(meters / 4) || 1));
        for (let slot = 0; slot < count; slot += 1) {
          const startFraction = count === 1 ? 0 : slot / count;
          const sub = this.slicePath(path, lengths, totalLen * startFraction);
          if (!sub || sub.points.length < 2) continue;
          figures.push({
            id: `${route.id}#${slot + 1}`,
            routeId: route.id,
            label: route.label || `Ruta ${index + 1}`,
            points: sub.points,
            lengths: sub.lengths,
            totalLen: sub.totalLen,
            unitsPerSecond,
            walkS: sub.totalLen / unitsPerSecond,
            arrivalS: reactionS + sub.totalLen / unitsPerSecond,
            reactionS,
            targetS: route.arrivalS === null || route.arrivalS === undefined ? null : Number(route.arrivalS),
            node: null,
            labelNode: null,
            phase: 'waiting',
          });
        }
      });
      this.drillFigures = figures;
    }

    /** Recorta el camino a partir de una distancia: la figura arranca ahí. */
    slicePath(points, lengths, startDistance) {
      if (startDistance <= 0.01) {
        return { points: points.map((point) => ({ ...point })), lengths: [...lengths], totalLen: lengths.reduce((total, value) => total + value, 0) };
      }
      let remaining = startDistance;
      for (let cursor = 0; cursor < lengths.length; cursor += 1) {
        const length = lengths[cursor];
        if (remaining > length) {
          remaining -= length;
          continue;
        }
        const ratio = length > 0 ? remaining / length : 0;
        const a = points[cursor];
        const b = points[cursor + 1];
        const start = { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
        const tail = [start, ...points.slice(cursor + 1).map((point) => ({ ...point }))];
        const tailLengths = [];
        let total = 0;
        for (let index = 1; index < tail.length; index += 1) {
          const value = Math.hypot(tail[index].x - tail[index - 1].x, tail[index].y - tail[index - 1].y);
          tailLengths.push(value);
          total += value;
        }
        return { points: tail, lengths: tailLengths, totalLen: total };
      }
      return null;
    }

    /** Posición de una figura en el segundo simulado dado, sobre su camino. */
    drillPosition(figure, seconds) {
      const start = figure.points[0];
      if (seconds <= figure.reactionS) return { ...start, phase: 'waiting' };
      const walked = (seconds - figure.reactionS) * figure.unitsPerSecond;
      if (walked >= figure.totalLen - 0.01) {
        const end = figure.points[figure.points.length - 1];
        return { ...end, phase: 'arrived' };
      }
      let remaining = walked;
      for (let cursor = 0; cursor < figure.lengths.length; cursor += 1) {
        const length = figure.lengths[cursor];
        if (remaining <= length || cursor === figure.lengths.length - 1) {
          const ratio = length > 0 ? Math.min(1, remaining / length) : 0;
          const a = figure.points[cursor];
          const b = figure.points[cursor + 1];
          return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, phase: 'walking' };
        }
        remaining -= length;
      }
      const end = figure.points[figure.points.length - 1];
      return { ...end, phase: 'arrived' };
    }

    /**
     * El editor redibuja el SVG y se lleva por delante la capa del simulacro:
     * aquí se vuelve a montar con la posición que tenía. Sin esto las figuras
     * desaparecían al tocar una capa o al mover el plano.
     */
    redrawOverlay() {
      if (!this.drill || !this.drillFigures.length) return;
      this.drill.layer = null;
      this.drillFigures.forEach((figure) => {
        figure.node = null;
        figure.labelNode = null;
      });
      this.paintDrill();
      this.renderDrillClock();
    }

    clearDrillLayer() {
      q('[data-drill-layer]', this.app.svg)?.remove();
      if (this.drill) this.drill.layer = null;
    }

    drillLayer() {
      if (this.drill?.layer?.isConnected) return this.drill.layer;
      const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.setAttribute('data-drill-layer', '');
      layer.setAttribute('class', 'drill-layer');
      layer.setAttribute('pointer-events', 'none');
      this.app.svg.appendChild(layer);
      if (this.drill) this.drill.layer = layer;
      return layer;
    }

    /** Dibuja (o redibuja) las figuras en el lienzo. */
    paintDrill() {
      const layer = this.drillLayer();
      const meeting = this.drillFigures.find((figure) => figure.meeting)?.meeting || null;
      if (meeting && !q('[data-drill-meeting]', layer)) {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        marker.setAttribute('data-drill-meeting', '');
        marker.setAttribute('class', 'drill-meeting');
        marker.setAttribute('cx', String(meeting.x));
        marker.setAttribute('cy', String(meeting.y));
        marker.setAttribute('r', '46');
        layer.appendChild(marker);
      }
      this.drillFigures.forEach((figure, index) => {
        if (!figure.node) {
          const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          group.setAttribute('class', 'drill-figure');
          group.setAttribute('data-drill-figure', figure.id);
          const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          halo.setAttribute('class', 'drill-figure-halo');
          halo.setAttribute('r', '26');
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('class', 'drill-figure-dot');
          dot.setAttribute('r', '15');
          const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          head.setAttribute('class', 'drill-figure-head');
          head.setAttribute('r', '6');
          head.setAttribute('cy', '-4');
          const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          body.setAttribute('class', 'drill-figure-body');
          body.setAttribute('d', 'M-7 9 L-7 2 A7 7 0 0 1 7 2 L7 9');
          group.append(halo, dot, head, body);
          layer.appendChild(group);
          figure.node = group;
        }
        const position = this.drillPosition(figure, this.drill?.t || 0);
        figure.node.setAttribute('transform', `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`);
        figure.node.classList.toggle('is-waiting', position.phase === 'waiting');
        /* Sin punto de encuentro el destino es la salida: también es llegar. */
        figure.node.classList.toggle('is-arrived', position.phase === 'arrived' || position.phase === 'at-exit');
        if (!figure.labelNode && position.phase !== 'waiting') {
          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('class', 'drill-figure-label');
          label.setAttribute('y', '-24');
          label.setAttribute('text-anchor', 'middle');
          label.textContent = String(index + 1);
          figure.node.appendChild(label);
          figure.labelNode = label;
        }
        figure.phase = position.phase;
      });
    }

    renderDrillClock() {
      const clock = q('[data-drill-clock]', this.root);
      if (clock) {
        const t = this.drill?.t || 0;
        const target = Number(this.drill?.report?.drill?.targetS) || 0;
        clock.textContent = target > 0 && t >= target
          ? `${this.drillClock(t)} · completo`
          : this.drillClock(t);
      }
      /* Una fila por ruta: se resume lo que hacen sus figuras. */
      const routes = new Map();
      this.drillFigures.forEach((figure) => {
        const entry = routes.get(figure.routeId) || { total: 0, arrived: 0, walking: 0 };
        entry.total += 1;
        if (figure.phase === 'arrived') entry.arrived += 1;
        else if (figure.phase === 'walking') entry.walking += 1;
        routes.set(figure.routeId, entry);
      });
      routes.forEach((entry, routeId) => {
        const row = q(`[data-drill-row="${routeId}"]`, this.root);
        if (!row) return;
        const state = q('[data-drill-state]', row);
        if (!state) return;
        if (entry.arrived === entry.total) state.textContent = `llegaron ${entry.arrived} de ${entry.total}`;
        else if (entry.walking > 0) state.textContent = `${entry.walking} en camino · ${entry.arrived} de ${entry.total} llegaron`;
        else state.textContent = `esperando la alarma · ${entry.total} ${entry.total === 1 ? 'figura' : 'figuras'}`;
        row.classList.toggle('is-arrived', entry.arrived === entry.total);
      });
    }

    /** Avanza el simulacro hasta el segundo indicado y repinta. */
    stepDrill(seconds) {
      if (!this.drill) return;
      this.drill.t = Math.max(0, Number(seconds) || 0);
      this.paintDrill();
      this.renderDrillClock();
    }

    playDrill() {
      if (!this.drill || this.drill.playing) return;
      const total = Math.max(...this.drillFigures.map((figure) => Number(figure.arrivalS) || 0), 0);
      if (!total) return;
      if ((this.drill.t || 0) >= total) this.resetDrill();
      this.drill.playing = true;
      const msPerSecond = DRILL_MS_PER_S[this.speed] || DRILL_MS_PER_S.normal;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let last = Date.now();
      const tick = () => {
        if (!this.drill || !this.drill.playing) return;
        const now = Date.now();
        const delta = reduced ? msPerSecond / 60 : Math.min(400, now - last);
        last = now;
        const next = (this.drill.t || 0) + delta / msPerSecond;
        this.stepDrill(Math.min(total, next));
        if (next >= total) {
          this.pauseDrill();
          const clock = q('[data-drill-clock]', this.root);
          if (clock) clock.textContent = `${this.drillClock(total)} · completo`;
          return;
        }
        this.drillRaf = window.requestAnimationFrame(tick);
      };
      this.drillRaf = window.requestAnimationFrame ? window.requestAnimationFrame(tick) : window.setTimeout(tick, msPerSecond / 60);
      this.renderDrillClock();
    }

    pauseDrill() {
      if (!this.drill) return;
      this.drill.playing = false;
      if (this.drillRaf && window.cancelAnimationFrame) window.cancelAnimationFrame(this.drillRaf);
      else if (this.drillRaf) window.clearTimeout(this.drillRaf);
      this.drillRaf = null;
    }

    resetDrill() {
      if (!this.drill) return;
      this.pauseDrill();
      this.drill.t = 0;
      this.drillFigures.forEach((figure) => {
        figure.arrived = false;
        figure.phase = 'waiting';
        figure.node?.classList.remove('is-arrived');
        figure.labelNode?.remove?.();
        figure.labelNode = null;
      });
      this.paintDrill();
      this.renderDrillClock();
    }

    stopDrill() {
      this.pauseDrill();
      this.clearDrillLayer();
      this.drillFigures = [];
      this.drill = null;
    }

    /* ---------------------------------- paneles -------------------------------- */

    showPanel(html) {
      const panel = q('[data-present-panel]', this.root);
      if (!panel) return;
      panel.hidden = false;
      panel.innerHTML = html;
      panel.querySelector('button, input')?.focus?.();
    }

    hidePanel() {
      const panel = q('[data-present-panel]', this.root);
      if (panel) panel.hidden = true;
    }

    showLayers() {
      const layers = this.model.design.layers;
      this.showPanel(`
        <header><h2>Capas visibles</h2><button type="button" class="present-x" data-present-panel-close aria-label="Cerrar">×</button></header>
        <ul class="present-layers">
          ${layers.map((layer) => `
            <li>
              <label>
                <input type="checkbox" data-layer-toggle="${esc(layer.id)}"${layer.visible ? ' checked' : ''}>
                <span>${esc(layer.name)}</span>
                <small>${this.countLayer(layer.id)} elementos</small>
              </label>
            </li>`).join('')}
        </ul>
        <p class="present-note">Al salir se restauran las capas del editor. Los cambios de capas no se guardan en el proyecto.</p>`);
      q('[data-present-panel-close]', this.root)?.addEventListener('click', () => this.hidePanel());
    }

    countLayer(id) {
      return this.model.design.elements.filter((element) => element.layer === id).length;
    }

    /* ----------------------------------- quiz --------------------------------- */

    buildQuiz() {
      const questions = [];
      const exits = this.exits().length;
      questions.push({
        text: '¿Cuántas salidas de emergencia tiene este piso?',
        options: this.choices(exits, [0, 1, 2, 3]),
        answer: exits,
        detail: `Hay ${exits} ${exits === 1 ? 'puerta marcada' : 'puertas marcadas'} como salida de emergencia.`,
      });
      const extinguishers = this.signCount('F001');
      questions.push({
        text: '¿Cuántas señales de extintor hay en el plano?',
        options: this.choices(extinguishers, [0, 1, 2, 4]),
        answer: extinguishers,
        detail: extinguishers ? `Se encontraron ${extinguishers} señales F001.` : 'No hay señales F001 en este piso: el pliego lo marca como pendiente.',
      });
      const meeting = this.signCount('E007');
      questions.push({
        text: '¿Hay punto de encuentro de evacuación señalizado?',
        options: ['Sí', 'No'],
        answer: meeting ? 'Sí' : 'No',
        detail: meeting ? 'Hay al menos una señal E007 en el piso.' : 'No hay señal E007. Añádela si el plan de evacuación define un punto de encuentro.',
      });
      const routes = this.routes().length;
      questions.push({
        text: '¿Cuántas rutas de evacuación están trazadas?',
        options: this.choices(routes, [0, 1, 2, 3]),
        answer: routes,
        detail: routes ? `Hay ${routes} rutas de evacuación en el plano.` : 'No hay rutas de evacuación trazadas en este piso.',
      });
      return questions;
    }

    /** Opciones numéricas cercanas a la respuesta, sin duplicados y ordenadas. */
    choices(value, seeds) {
      const values = new Set([value]);
      seeds.forEach((seed) => values.add(Math.max(0, value + seed - 1)));
      let extra = value + 1;
      while (values.size < 3) values.add(extra++);
      return [...values].sort((a, b) => a - b).slice(0, 4).map(String);
    }

    showQuiz() {
      this.quiz = this.buildQuiz();
      this.quizIndex = 0;
      this.quizScore = 0;
      this.quizAnswered = false;
      this.renderQuiz();
    }

    renderQuiz() {
      const question = this.quiz[this.quizIndex];
      if (!question) return;
      const last = this.quizIndex >= this.quiz.length - 1;
      this.showPanel(`
        <header>
          <h2>Quiz del plano <em>${this.quizIndex + 1}/${this.quiz.length}</em></h2>
          <button type="button" class="present-x" data-present-panel-close aria-label="Cerrar">×</button>
        </header>
        <p class="present-question">${esc(question.text)}</p>
        <div class="present-options">
          ${question.options.map((option, index) => `<button type="button" class="present-option" data-present-answer="${index}"${this.quizAnswered ? ' disabled' : ''}>${esc(option)}</button>`).join('')}
        </div>
        <p class="present-feedback" data-present-feedback>${this.quizAnswered ? '' : 'Elige una respuesta.'}</p>
        <footer class="present-quiz-foot">
          <span>Acertadas ${this.quizScore} de ${this.quiz.length}</span>
          ${this.quizAnswered && !last ? '<button type="button" class="present-btn is-primary" data-present-next>Siguiente</button>' : ''}
          ${this.quizAnswered && last ? '<button type="button" class="present-btn is-primary" data-present-quiz>Repetir</button>' : ''}
        </footer>
        <p class="present-note">Preguntas generadas del plano actual: sirven para repasar el plano, no evalúan competencias ni sustituyen la capacitación.</p>`);
      q('[data-present-panel-close]', this.root)?.addEventListener('click', () => this.hidePanel());
      if (this.quizAnswered) this.markAnswer(question);
    }

    markAnswer(question) {
      const chosen = this.lastAnswer;
      qa('[data-present-answer]', this.root).forEach((button, index) => {
        const option = question.options[index];
        button.disabled = true;
        if (option === String(question.answer)) button.classList.add('is-correct');
        else if (index === chosen) button.classList.add('is-wrong');
      });
      const feedback = q('[data-present-feedback]', this.root);
      if (feedback) {
        feedback.className = `present-feedback ${this.lastCorrect ? 'is-ok' : 'is-bad'}`;
        feedback.textContent = `${this.lastCorrect ? 'Correcto.' : `No era esa. La respuesta es «${question.answer}».`} ${question.detail}`;
      }
      const score = q('.present-quiz-foot span', this.root);
      if (score) score.textContent = `Acertadas ${this.quizScore} de ${this.quiz.length}`;
    }

    answer(index) {
      const question = this.quiz[this.quizIndex];
      if (!question || this.quizAnswered) return;
      this.lastAnswer = index;
      this.lastCorrect = question.options[index] === String(question.answer);
      if (this.lastCorrect) this.quizScore += 1;
      this.quizAnswered = true;
      this.renderQuiz();
    }

    nextQuestion() {
      if (this.quizIndex >= this.quiz.length - 1) {
        this.showQuiz();
        return;
      }
      this.quizIndex += 1;
      this.quizAnswered = false;
      this.renderQuiz();
    }

    /* --------------------------------- teclado -------------------------------- */

    bindKeys() {
      if (this.onKey) return;
      this.onKey = (event) => {
        if (!this.active) return;
        const typing = event.target?.closest?.('input, select, textarea');
        if (event.key === 'Escape') {
          if (!q('[data-present-panel]', this.root)?.hidden) this.hidePanel();
          else this.close();
          return;
        }
        if (typing) return;
        if (event.key === 'l' || event.key === 'L') { this.toggleLaser(); event.preventDefault(); }
        if (event.key === 's' || event.key === 'S') { this.toggleSpotlight(); event.preventDefault(); }
        if (event.key === 'r' || event.key === 'R') { this.animateRoutes(); event.preventDefault(); }
      };
      document.addEventListener('keydown', this.onKey);
    }

    unbindKeys() {
      if (!this.onKey) return;
      document.removeEventListener('keydown', this.onKey);
      this.onKey = null;
    }
  }

  root.Normia = root.Normia || {};
  root.Normia.Present = Present;
})(typeof window !== 'undefined' ? window : globalThis);
