/*
 * Guía de primeros pasos del editor.
 *
 * No es un carrusel de imágenes: cada paso apunta a una herramienta real, se
 * marca solo cuando el plano lo cumple y el botón del paso lleva al control de
 * verdad (activa la herramienta, abre el cajón o resalta la baldosa del rail).
 * Las señales de «revisión hecha» y «guía vista» se guardan en este navegador;
 * el resto del progreso se deduce del propio plano, así que no hay progreso
 * simulado ni estados que se queden colgados.
 */
(function (root) {
  'use strict';

  const q = (selector, context = document) => context.querySelector(selector);
  const qa = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const KEYS = { auto: 'normia.guia.auto', visto: 'normia.guia.visto', revision: 'normia.guia.revision' };
  const EXITS = ['door', 'door_double', 'door_garage'];
  const OUTDOOR = ['road', 'sidewalk', 'crosswalk', 'parking', 'property'];

  const countOf = (app, types) => app.model.design.elements.filter((element) => types.includes(element.type)).length;
  const plural = (total, one, many) => `${total} ${total === 1 ? one : many}`;

  const STEPS = [
    {
      id: 'muros',
      title: 'Traza el primer muro',
      text: 'Los muros separan los espacios y sostienen el resto del plano. Elige <strong>Muro</strong> y arrastra; con <kbd>Shift</kbd> el trazo queda recto.',
      hint: 'Baldosa del rail · atajo M',
      action: { kind: 'tool', value: 'wall' },
      actionLabel: 'Ir a Muro',
      done: (app) => countOf(app, ['wall']) > 0,
      detail: (app) => plural(countOf(app, ['wall']), 'muro', 'muros'),
    },
    {
      id: 'puertas',
      title: 'Abre un vano con una puerta',
      text: 'Haz clic sobre un muro con la herramienta <strong>Puerta</strong>. En el inspector puedes cambiar el ancho del vano, la bisagra y el lado de apertura.',
      hint: 'Baldosa del rail · atajo U',
      action: { kind: 'tool', value: 'door' },
      actionLabel: 'Ir a Puerta',
      done: (app) => countOf(app, EXITS) > 0,
      detail: (app) => plural(countOf(app, EXITS), 'puerta', 'puertas'),
    },
    {
      id: 'vias',
      title: 'Dibuja la vía, el andén o el parqueadero',
      text: 'Las vías y el entorno están en su propia baldosa del rail (icono de vía, atajo <strong>A</strong>): vía vehicular, andén, paso cebra, parqueadero y lindero. También aparecen en la paleta de herramientas y en su buscador: escribe <em>calle</em>, <em>acera</em> o <em>parqueo</em> y los encuentras.',
      hint: 'Baldosa «Vía vehicular» · atajos A, S, C, Q, I',
      action: { kind: 'tool', value: 'road' },
      actionLabel: 'Ir a vías y andenes',
      done: (app) => countOf(app, OUTDOOR) > 0,
      detail: (app) => plural(countOf(app, OUTDOOR), 'elemento', 'elementos'),
    },
    {
      id: 'senalizacion',
      title: 'Coloca señales y equipos',
      text: 'Las bibliotecas locales traen señalización ISO 7010 y equipamiento CAD. Elige uno y haz clic en el plano; <kbd>Shift</kbd> mantiene la colocación para poner varios seguidos.',
      hint: 'Baldosas de biblioteca del rail',
      action: { kind: 'library', value: 'sign' },
      actionLabel: 'Abrir biblioteca',
      done: (app) => app.model.design.elements.some((element) => app.model.signCodeForType(element.type) || app.model.cadForType(element.type)),
      detail: (app) => plural(app.model.design.elements.filter((element) => app.model.signCodeForType(element.type) || app.model.cadForType(element.type)).length, 'puesto', 'puestos'),
    },
    {
      id: 'ruta',
      title: 'Marca la ruta de evacuación',
      text: 'Con <strong>Ruta de evacuación</strong> haz clic punto a punto; <kbd>Enter</kbd> o doble clic termina y el clic en el primer punto cierra el circuito. Luego puedes arrastrar sus vértices.',
      hint: 'Baldosa del rail · atajo E',
      action: { kind: 'tool', value: 'route' },
      actionLabel: 'Ir a Ruta',
      done: (app) => countOf(app, ['route']) > 0,
      detail: (app) => plural(countOf(app, ['route']), 'ruta', 'rutas'),
    },
    {
      id: 'revision',
      title: 'Lee la revisión del plano',
      text: 'El panel <strong>Revisión</strong> analiza el último plano guardado y lista avisos con su norma de referencia. Es una ayuda esquemática: no acredita cumplimiento legal.',
      hint: 'Menú Análisis · barra de la vista',
      action: { kind: 'drawer', value: 'audit' },
      actionLabel: 'Abrir revisión',
      done: (app, guide) => Boolean(app.audit?.report) || guide.flag('revision') === true,
      detail: (app) => (app.audit?.report ? 'informe a la vista' : 'sin abrir'),
    },
    {
      id: 'guardar',
      title: 'Guarda una versión',
      text: 'Guardar crea una versión nueva del piso y deja el plano en el historial para volver a él. El autoguardado protege el trabajo en curso, pero no sustituye a guardar.',
      hint: 'Botón Guardar · Ctrl + S',
      action: { kind: 'save', value: '' },
      actionLabel: 'Guardar ahora',
      done: (app) => Number(app.store?.version) > 1,
      detail: (app) => `versión v${Number(app.store?.version) || 1}`,
    },
  ];

  class Guide {
    constructor(app) {
      this.app = app;
      this.steps = STEPS;
      this.root = q('[data-drawer="guide"]');
      this.list = q('[data-guide-steps]');
      this.count = q('[data-guide-count]');
      this.fill = q('[data-guide-fill]');
      this.bar = q('[data-guide-bar]');
      this.autoBox = q('[data-guide-auto]');
      this.timer = null;
      this.bind();
    }

    /* ------------------------------- almacenamiento ------------------------------- */

    get(key) {
      try {
        return this.app.window?.localStorage?.getItem(key) ?? null;
      } catch (error) {
        return null;
      }
    }

    set(key, value) {
      try {
        this.app.window?.localStorage?.setItem(key, value);
      } catch (error) {
        /* Sin almacenamiento local la guía se comporta como en una sesión nueva. */
      }
    }

    /** Marca un avance que no se puede deducir del plano (por ejemplo, la revisión). */
    mark(id) {
      if (id === 'revision') this.set(KEYS.revision, '1');
      this.refresh();
    }

    flag(id) {
      return id === 'revision' ? this.get(KEYS.revision) === '1' : false;
    }

    /* --------------------------------- render ---------------------------------- */

    state() {
      return STEPS.map((step) => ({
        id: step.id,
        title: step.title,
        done: Boolean(step.done(this.app, this)),
        detail: step.detail ? step.detail(this.app) : '',
      }));
    }

    completed() {
      return this.state().filter((step) => step.done).length;
    }

    render() {
      if (!this.list) return;
      const states = this.state();
      this.list.innerHTML = STEPS.map((step, index) => {
        const state = states[index];
        return `<li class="guide-step${state.done ? ' is-done' : ''}" data-guide-step="${esc(step.id)}" data-state="${state.done ? 'done' : 'pending'}">
          <span class="guide-step-index" aria-hidden="true">${state.done ? '<svg class="icon"><use href="#i-check"></use></svg>' : index + 1}</span>
          <div class="guide-step-copy">
            <h3>${step.title}</h3>
            <p>${step.text}</p>
            <p class="guide-step-meta"><span class="guide-step-state">${state.done ? 'Hecho' : 'Pendiente'}</span><span aria-hidden="true">·</span><span>${esc(state.detail)}</span><span aria-hidden="true">·</span><span>${esc(step.hint)}</span></p>
          </div>
          <button class="button ${state.done ? 'button-ghost' : 'button-soft'} button-small guide-step-go" type="button" data-guide-go="${esc(step.id)}">${state.done ? 'Ver' : step.actionLabel}</button>
        </li>`;
      }).join('');
      const total = STEPS.length;
      const done = states.filter((state) => state.done).length;
      if (this.count) this.count.textContent = `${done} de ${total} pasos`;
      if (this.fill) this.fill.style.width = `${Math.round((done / total) * 100)}%`;
      if (this.bar) {
        this.bar.setAttribute('aria-valuenow', String(done));
        this.bar.setAttribute('aria-valuemax', String(total));
      }
      const next = q('[data-guide-next]');
      if (next) {
        const pending = states.find((state) => !state.done);
        next.disabled = !pending;
        next.textContent = pending ? 'Ir al paso pendiente' : 'Guía completa';
      }
      if (this.autoBox) this.autoBox.checked = this.get(KEYS.auto) !== '0';
      return done;
    }

    /** Se llama desde el editor cuando cambia el modelo: el progreso es del plano. */
    refresh() {
      if (!this.root || this.root.hidden) return;
      this.render();
    }

    /* --------------------------------- acciones -------------------------------- */

    open() {
      this.render();
    }

    /** Se abre sola la primera vez, salvo que el usuario la haya desactivado. */
    maybeAutoOpen() {
      if (this.get(KEYS.auto) === '0') return false;
      if (this.get(KEYS.visto) === '1') return false;
      if (this.app.present?.active) return false;
      this.set(KEYS.visto, '1');
      this.app.openDrawer('guide');
      return true;
    }

    run(id) {
      const step = STEPS.find((item) => item.id === id);
      if (!step) return false;
      if (step.action.kind === 'tool') {
        this.app.closeDrawer();
        this.app.applyTool(step.action.value);
        this.reveal(step.action.value);
      } else if (step.action.kind === 'drawer') {
        this.app.openDrawer(step.action.value);
      } else if (step.action.kind === 'library') {
        this.app.library.open(step.action.value);
        this.app.openDrawer('library');
      } else if (step.action.kind === 'save') {
        this.app.closeDrawer();
        this.app.saveNow?.('Guardado desde la guía');
      }
      return true;
    }

    nextPending() {
      const pending = this.state().find((step) => !step.done);
      if (!pending) {
        this.app.toast?.('La guía está completa: los siete pasos están hechos.', 'success');
        return null;
      }
      this.run(pending.id);
      return pending.id;
    }

    /**
     * Resalta el control real de una herramienta. Si vive dentro de un menú
     * cerrado, abre el menú para que se vea dónde está: el usuario que no
     * encontraba las vías no necesita otra explicación, necesita ver la baldosa.
     */
    reveal(tool) {
      const nodes = qa(`[data-tool="${tool}"]`).filter((node) => !node.closest('[data-drawer]'));
      const visible = nodes.find((node) => !node.closest('[hidden]'));
      if (visible) {
        this.pulse(visible);
        return visible;
      }
      const inFlyout = nodes.find((node) => node.closest('.rail-flyout'));
      if (!inFlyout) return null;
      const wrap = inFlyout.closest('.rail-flyout-wrap');
      wrap?.querySelector('.rail-caret, [aria-haspopup="menu"]')?.click?.();
      this.pulse(inFlyout);
      return inFlyout;
    }

    pulse(node) {
      if (!node?.classList) return;
      // Primero se apaga el resaltado anterior y después se enciende el nuevo:
      // al revés, `clear()` borraría el que se acaba de marcar.
      this.clear();
      node.classList.add('is-guide-target');
      this.timer = this.app.window?.setTimeout?.(() => node.classList.remove('is-guide-target'), 2600);
    }

    clear() {
      if (this.timer) this.app.window?.clearTimeout?.(this.timer);
      this.timer = null;
      qa('.is-guide-target').forEach((node) => node.classList.remove('is-guide-target'));
    }

    reset() {
      this.set(KEYS.revision, '0');
      this.set(KEYS.visto, '0');
      this.render();
      this.app.toast?.('Progreso de la guía reiniciado. El plano no cambia.', 'info');
    }

    /* --------------------------------- eventos --------------------------------- */

    bind() {
      this.list?.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-guide-go]');
        if (button) this.run(button.dataset.guideGo);
      });
      q('[data-guide-next]')?.addEventListener('click', () => this.nextPending());
      q('[data-guide-reset]')?.addEventListener('click', () => this.reset());
      this.autoBox?.addEventListener('change', () => {
        this.set(KEYS.auto, this.autoBox.checked ? '1' : '0');
        this.app.toast?.(this.autoBox.checked
          ? 'La guía se abrirá sola la próxima vez que entres a un plano.'
          : 'La guía ya no se abrirá sola; puedes abrirla con el botón de la barra superior.', 'info');
      });
      // Al cerrar la guía no queda ningún control resaltado.
      q('[data-drawer="guide"]')?.addEventListener('transitionend', () => this.clear());
    }
  }

  root.Normia = root.Normia || {};
  root.Normia.Guide = Guide;
})(typeof window !== 'undefined' ? window : globalThis);
