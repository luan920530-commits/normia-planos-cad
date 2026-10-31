/* Modo presentación: pantalla limpia, láser, spotlight, rutas animadas, capas y quiz. */
(function (root) {
  'use strict';

  const q = (selector, context = document) => context.querySelector(selector);
  const qa = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const SPEEDS = { slow: { label: 'Lenta', factor: 1.7 }, normal: { label: 'Normal', factor: 1 }, fast: { label: 'Rápida', factor: 0.55 } };
  const EXIT_TYPES = ['door', 'door_double', 'gate'];
  const TRAIL_MS = 900;

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
        else if (button.dataset.presentLayers !== undefined) this.showLayers();
        else if (button.dataset.presentQuiz !== undefined) this.showQuiz();
        else if (button.dataset.presentAnswer !== undefined) this.answer(Number(button.dataset.presentAnswer));
        else if (button.dataset.presentNext !== undefined) this.nextQuestion();
        else if (button.dataset.presentPanelClose !== undefined) this.hidePanel();
      });
      node.addEventListener('change', (event) => {
        if (event.target.matches('[data-present-speed]')) this.speed = event.target.value;
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
