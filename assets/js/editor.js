/* Normia Planos CAD · controlador del editor SVG. */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const G = root.Geometry;
  const NS = 'http://www.w3.org/2000/svg';
  const MIN_SIZE = 4;
  const TYPE_HINTS = {
    select: 'Selecciona y arrastra para mover. Shift añade a la selección; Ctrl + clic baja al elemento que queda debajo; arrastra el fondo para seleccionar un área.',
    hand: 'Mano: arrastra para desplazar el lienzo sin tocar los elementos. Rueda para zoom; doble clic o 0 ajusta a pantalla.',
    wall: 'Muro: arrastra para trazar. Mantén Shift para alinear horizontal o vertical. Esc vuelve a seleccionar.',
    door: 'Puerta sencilla: haz clic sobre el muro; la hoja abre hacia arriba. Flip en el inspector para cambiar bisagra o lado.',
    door_double: 'Puerta doble: haz clic sobre el muro. Dos hojas encontradas; ajusta el ancho de la caja para el vano.',
    door_garage: 'Portón o reja de garaje: haz clic sobre el muro y ajusta el ancho de la caja al vano real.',
    route: 'Ruta de evacuación: haz clic para añadir puntos. Enter o doble clic termina; Esc cancela. Al terminar podrás arrastrar sus vértices.',
    text: 'Texto: haz clic para insertar una etiqueta y edítala en el inspector.',
    dimension: 'Medida: arrastra entre dos puntos para acotar la distancia.',
    line: 'Línea: arrastra entre dos puntos.',
    rect: 'Rectángulo: arrastra desde una esquina hasta la opuesta.',
    ellipse: 'Elipse: arrastra para definir ancho y alto.',
    pipe: 'Tubería: arrastra o haz clic para trazar la red. Elige la red (agua, gas, desagües o incendio) en la flecha del botón y ajusta diámetro, material y pendiente en el inspector.',
    conduit: 'Tubería eléctrica: arrastra o haz clic para trazar el circuito. Asigna código, tensión y calibre en el inspector; el panel Redes calcula carga y caída de tensión.',
    place: 'Colocación: haz clic para insertar el recurso elegido. Mantén Shift para insertar varios. Esc cancela.',
  };
  const TYPE_NAMES = {
    wall: 'Muro', door: 'Puerta sencilla', door_double: 'Puerta doble', door_garage: 'Portón de garaje', route: 'Ruta de evacuación', text: 'Texto', dimension: 'Medida',
    line: 'Línea', rect: 'Rectángulo', ellipse: 'Elipse',
    pipe: 'Tubería', conduit: 'Tubería eléctrica',
  };
  /* Icono, etiqueta y atajo de cada herramienta para la paleta y la barra. */
  const TOOL_META = {
    select: { label: 'Seleccionar', icon: 'i-select', key: 'V' },
    hand: { label: 'Mano', icon: 'i-hand', key: 'H' },
    wall: { label: 'Muro', icon: 'i-wall', key: 'M' },
    door: { label: 'Puerta', icon: 'i-door', key: 'U' },
    door_double: { label: 'Puerta doble', icon: 'i-door-double', key: 'Shift+U' },
    door_garage: { label: 'Portón o reja', icon: 'i-door-garage', key: 'R' },
    route: { label: 'Ruta de evacuación', icon: 'i-route', key: 'E' },
    pipe: { label: 'Tubería', icon: 'i-pipe', key: 'P' },
    conduit: { label: 'Tubería eléctrica', icon: 'i-conduit', key: 'Shift+P' },
    text: { label: 'Texto', icon: 'i-text', key: 'T' },
    dimension: { label: 'Medida', icon: 'i-dimension', key: 'D' },
    line: { label: 'Línea', icon: 'i-line', key: 'L' },
    rect: { label: 'Rectángulo', icon: 'i-rect', key: 'B' },
    ellipse: { label: 'Elipse', icon: 'i-ellipse', key: 'O' },
    place: { label: 'Colocando', icon: 'i-sign', key: '' },
  };
  const q = (selector, context = document) => context.querySelector(selector);
  const qa = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const timeLabel = () => new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  class EditorApp {
    constructor(bootData, design, catalogs) {
      this.boot = bootData;
      this.catalogs = catalogs;
      this.svg = q('#plan-canvas');
      this.shell = q('[data-canvas-shell]');
      this.canvasStage = q('.canvas-stage');
      this.model = new root.Model(design, catalogs, { historyLimit: 120 });
      this.store = new root.EditorStore(bootData, this.model);
      this.renderer = new root.Renderer(this.svg, catalogs);
      this.inspector = new root.Inspector(this);
      this.library = new root.Library(this);
      this.tool = 'select';
      this.view = { zoom: 1, panX: 0, panY: 0 };
      this.showGrid = true;
      this.snapEnabled = true;
      this.showRulers = true;
      this.placement = null;
      this.draft = null;
      this.ghost = null;
      this.guides = [];
      this.drag = null;
      this.pan = null;
      this.marquee = null;
      this.spaceDown = false;
      this.statusState = 'saved';
      this.statusText = 'Guardado';
      this.floorName = bootData.floorMeta?.name || 'Piso';
      this.floorLevel = bootData.floorMeta?.level || '';
      this.renderQueued = false;
      this.exportBusy = false;
      this.conflictVersion = null;
      this.activeDrawer = null;
      this.drawerOpener = null;
      this.pipeNetwork = (Object.keys(catalogs.mep?.hydraulic || {})[0]) || 'agua_fria';
      this.networkSummary = null;
      this.networkBusy = false;
      this.store.onDraft = (at) => this.onDraftSaved(at);
      this.model.subscribe((reason) => this.onModelChange(reason));
      this.bind();
      this.applyTool('select', { silent: true });
      this.fit(true);
      this.renderNow();
      this.updateRulers();
      this.updateSaveStatus();
      this.store.startAutosave(bootData.autosaveInterval, (error) => this.onAutosaveError(error));
      this.showBootNotices();
      window.setInterval(() => {
        if (this.statusState === 'saving') return;
        this.updateSaveStatus();
      }, 15000);
      window.addEventListener('beforeunload', (event) => {
        if (this.model.isDirty()) {
          event.preventDefault();
          event.returnValue = '';
        }
      });
    }

    /* ------------------------------ arranque ------------------------------ */
    showBootNotices() {
      if (this.boot.draftAt) {
        this.banner('info', 'Se recuperó un borrador automático sin confirmar. Revísalo y guarda una versión cuando esté listo.', [
          { label: 'Descartar borrador', action: 'discard-draft', variant: 'ghost' },
          { label: 'Guardar versión', action: 'save', variant: 'primary' },
        ], 'draft');
      }
      if (this.boot.demo) {
        this.banner('info', 'Entorno de demostración: puedes editar y probar todo sin riesgo. Los datos viven solo en esta instalación local.', []);
      }
      if (this.boot.version <= 1) {
        this.banner('info', 'Este piso todavía no tiene versiones previas. Guarda para crear la versión 2 del diseño inicial.', []);
      }
    }

    /**
     * Coloca el menú flotante de la barra lateral junto a su botón. El menú
     * usa `position: fixed` para que la barra pueda desplazarse (y hacer
     * scroll) sin recortarlo; aquí se calcula la posición y se mantiene
     * dentro de la ventana.
     */
    placeFlyout(flyout, anchor) {
      if (!flyout || flyout.hidden) return;
      const rect = anchor?.getBoundingClientRect?.() || { left: 0, right: 88, top: 0, bottom: 44 };
      const box = flyout.getBoundingClientRect?.() || { width: 0, height: 0 };
      const width = Math.max(box.width || 0, flyout.offsetWidth || 0, 150);
      const height = Math.max(box.height || 0, flyout.offsetHeight || 0, 60);
      const viewportW = window.innerWidth || 1024;
      const viewportH = window.innerHeight || 768;
      const horizontalRail = viewportW <= 700;
      let left = horizontalRail ? rect.left : rect.right + 10;
      let top = horizontalRail ? rect.top - height - 8 : rect.top;
      left = Math.max(8, Math.min(left, viewportW - width - 8));
      top = Math.max(8, Math.min(top, viewportH - height - 8));
      flyout.style.left = `${Math.round(left)}px`;
      flyout.style.top = `${Math.round(top)}px`;
    }

    closeAllFlyouts() {
      this.closeShapeFlyout();
      this.closeDoorFlyout();
      this.closePipeFlyout?.();
    }

    /* ------------------------------- eventos ------------------------------- */
    bind() {
      qa('[data-tool]').forEach((button) => {
        button.addEventListener('click', () => {
          const tool = button.dataset.tool;
          this.closeShapeFlyout();
          this.applyTool(tool);
          this.closeToolsPalette();
        });
      });
      q('[data-pipe-menu]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        const flyout = q('[data-pipe-flyout]');
        const button = q('[data-pipe-menu]');
        if (!flyout) return;
        const open = flyout.hidden;
        flyout.hidden = !open;
        if (open) this.placeFlyout(flyout, button);
        button?.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      qa('[data-pipe-flyout] [data-network]').forEach((button) => {
        button.addEventListener('click', () => {
          this.pipeNetwork = button.dataset.network;
          this.closePipeFlyout();
          this.applyTool('pipe');
        });
      });
      q('[data-shape-menu]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        const flyout = q('[data-shape-flyout]');
        const button = q('[data-shape-menu]');
        if (!flyout) return;
        const open = flyout.hidden;
        flyout.hidden = !open;
        if (open) this.placeFlyout(flyout, button);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      q('[data-shape-flyout]')?.addEventListener('click', (event) => {
        const tool = event.target.closest('[data-tool]')?.dataset.tool;
        if (tool) this.applyTool(tool);
        this.closeShapeFlyout();
      });
      q('[data-shape-flyout]')?.addEventListener('click', (event) => event.stopPropagation());
      q('[data-door-menu]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        const flyout = q('[data-door-flyout]');
        const button = q('[data-door-menu]');
        if (!flyout) return;
        this.closeShapeFlyout();
        const open = flyout.hidden;
        flyout.hidden = !open;
        if (open) this.placeFlyout(flyout, button);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      q('[data-door-flyout]')?.addEventListener('click', (event) => {
        const tool = event.target.closest('[data-tool]')?.dataset.tool;
        if (tool) this.applyTool(tool);
        this.closeDoorFlyout();
      });
      q('[data-door-flyout]')?.addEventListener('click', (event) => event.stopPropagation());
      document.addEventListener('click', (event) => {
        if (!event.target.closest?.('.rail-flyout-wrap')) {
          this.closeShapeFlyout();
          this.closeDoorFlyout();
        }
      });
      // Con la barra desplazable, el menú fijo dejaría de coincidir con su
      // botón: se cierra al desplazar y al redimensionar.
      q('.rail')?.addEventListener('scroll', () => this.closeAllFlyouts(), { passive: true });
      window.addEventListener('resize', () => this.closeAllFlyouts());

      qa('[data-open-library]').forEach((button) => {
        button.addEventListener('click', () => {
          this.library.open(button.dataset.openLibrary);
          this.openDrawer('library', button);
        });
      });
      qa('[data-open-drawer]').forEach((button) => {
        button.addEventListener('click', () => this.openDrawer(button.dataset.openDrawer, button));
      });
      qa('[data-close-drawer]').forEach((button) => {
        button.addEventListener('click', () => this.closeDrawer());
      });
      q('[data-tools-toggle]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        this.toggleToolsPalette();
      });
      q('[data-tools-popover]')?.addEventListener('click', (event) => {
        if (event.target.closest('[data-tool-choice], [data-open-library]')) this.closeToolsPalette();
      });
      document.addEventListener('pointerdown', (event) => {
        const popover = q('[data-tools-popover]');
        if (!popover || popover.hidden) return;
        if (!event.target.closest?.('.tools-palette')) this.closeToolsPalette();
      });
      q('[data-drawer-backdrop]')?.addEventListener('click', () => this.closeDrawer());
      document.addEventListener('keydown', (event) => this.onKeyDown(event));

      q('[data-save]')?.addEventListener('click', () => this.saveNow());
      q('[data-undo]')?.addEventListener('click', () => this.undo());
      q('[data-redo]')?.addEventListener('click', () => this.redo());

      qa('[data-zoom]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.zoom;
          if (action === 'in') this.zoomBy(1.2);
          else if (action === 'out') this.zoomBy(1 / 1.2);
          else if (action === 'reset') this.setZoom(1);
          else this.fit();
        });
      });
      qa('[data-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
          const key = button.dataset.toggle;
          if (key === 'grid') this.showGrid = !this.showGrid;
          if (key === 'snap') this.snapEnabled = !this.snapEnabled;
          if (key === 'rulers') {
            this.showRulers = !this.showRulers;
            qa('.ruler').forEach((ruler) => { ruler.hidden = !this.showRulers; });
            const use = button.querySelector('use');
            if (use) use.setAttribute('href', this.showRulers ? '#i-ruler' : '#i-ruler-slash');
            button.dataset.tooltip = this.showRulers ? 'Ocultar reglas' : 'Mostrar reglas';
          }
          button.classList.toggle('is-active', key === 'grid' ? this.showGrid : key === 'snap' ? this.snapEnabled : this.showRulers);
          button.setAttribute('aria-pressed', button.classList.contains('is-active') ? 'true' : 'false');
          this.scheduleRender();
          this.updateRulers();
        });
      });
      qa('[data-export]').forEach((button) => {
        button.addEventListener('click', () => this.export(button.dataset.export));
      });
      q('[data-discard-draft]')?.addEventListener('click', () => this.discardDraft());

      q('[data-add-layer-form]')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = event.target.elements.layer_name;
        const name = input.value.trim();
        if (!name) return;
        try {
          const layer = this.model.addLayer(name);
          input.value = '';
          this.toast(`Capa “${layer.name}” añadida.`, 'success');
          this.scheduleRender();
        } catch (error) {
          this.toast(error.message, 'error');
        }
      });
      q('[data-layer-list]')?.addEventListener('click', (event) => this.onLayerClick(event));
      q('[data-layer-list]')?.addEventListener('change', (event) => this.onLayerChange(event));

      q('[data-floor-settings-form]')?.addEventListener('submit', (event) => this.saveFloorMeta(event));
      q('[data-canvas-form]')?.addEventListener('submit', (event) => this.applyCanvasSettings(event));
      q('[data-autosave-toggle]')?.addEventListener('change', (event) => {
        this.store.autosaveEnabled = event.target.checked;
        this.updateSaveStatus();
      });

      q('[data-toggle-properties]')?.addEventListener('click', () => {
        q('[data-properties-panel]')?.classList.toggle('is-open');
      });
      q('[data-close-properties]')?.addEventListener('click', () => {
        q('[data-properties-panel]')?.classList.remove('is-open');
      });

      q('[data-banners]')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-banner-action]');
        if (!button) return;
        const action = button.dataset.bannerAction;
        if (action === 'save') this.saveNow();
        if (action === 'reload') this.reloadFromServer();
        if (action === 'download') this.downloadLocalCopy();
        if (action === 'discard-draft') this.discardDraft();
        if (action === 'dismiss') button.closest('.editor-banner')?.remove();
      });

      const svg = this.svg;
      svg.addEventListener('dragover', (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        svg.closest('.canvas-shell')?.classList.add('is-drop-target');
      });
      svg.addEventListener('dragleave', (event) => {
        if (event.relatedTarget && svg.contains(event.relatedTarget)) return;
        svg.closest('.canvas-shell')?.classList.remove('is-drop-target');
      });
      svg.addEventListener('drop', (event) => {
        svg.closest('.canvas-shell')?.classList.remove('is-drop-target');
        this.onResourceDrop(event);
      });
      svg.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      svg.addEventListener('pointermove', (event) => this.onPointerMove(event));
      svg.addEventListener('pointerup', (event) => this.onPointerUp(event));
      svg.addEventListener('pointercancel', (event) => this.onPointerUp(event, true));
      svg.addEventListener('pointerleave', () => {
        if (!this.drag && !this.pan) this.setGhost(null);
      });
      svg.addEventListener('dblclick', (event) => this.onDoubleClick(event));
      svg.addEventListener('contextmenu', (event) => event.preventDefault());
      svg.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
      window.addEventListener('resize', () => {
        this.updateRulers();
        this.scheduleRender();
      });
      window.addEventListener('keyup', (event) => {
        if (event.code === 'Space' && this.spaceDown) {
          this.spaceDown = false;
          this.svg.style.cursor = this.cursorFor(this.tool);
        }
      });
    }

    onModelChange(reason) {
      if (reason === 'edit' || reason === 'change') this.updateSaveStatus();
      this.scheduleRender();
      if (this.activeDrawer === 'layers') this.renderLayers();
      if (this.activeDrawer === 'networks') this.renderNetworks();
    }

    /* -------------------------------- estado -------------------------------- */
    applyTool(tool, options = {}) {
      const names = root.BASIC_TYPES || [];
      const valid = tool === 'select' || tool === 'hand' || tool === 'place' || names.includes(tool);
      if (!valid) {
        this.toast('Herramienta no disponible.', 'error');
        return;
      }
      if (tool !== 'place') this.placement = null;
      // Una ruta o red a medio trazar no se descarta en silencio: se cierra con
      // los puntos ya confirmados antes de cambiar de herramienta.
      if (this.draft?.tool === 'route' && this.draft.points.length > 2) this.finishRoute();
      if (['pipe', 'conduit'].includes(this.draft?.tool) && this.draft.points.length > 2) this.finishPipe();
      this.tool = tool;
      this.draft = null;
      this.ghost = null;
      this.pending = null;
      this.drag = null;
      qa('[data-tool]').forEach((button) => {
        if (button.classList.contains('rail-library')) return;
        const active = button.dataset.tool === tool;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const hint = q('[data-stage-hint]');
      if (hint) hint.textContent = (tool === 'pipe' && this.pipeNetwork && this.model.networkInfo(this.pipeNetwork))
        ? `Tubería · ${this.model.networkInfo(this.pipeNetwork).label}: arrastra o haz clic para trazar. Enter o doble clic termina; Esc cancela.`
        : TYPE_HINTS[tool] || TYPE_HINTS.select;
      this.closeDoorFlyout();
      this.closePipeFlyout();
      this.closeToolsPalette();
      this.syncToolPalette();
      this.svg.style.cursor = this.cursorFor(tool);
      if (!options.silent) this.scheduleRender();
    }

    startPlacement(kind, key) {
      const type = kind === 'sign' ? this.model.typeForSignCode(key) : key;
      if (!this.model.isKnownType(type)) {
        this.toast('El recurso no pertenece a las bibliotecas locales.', 'error');
        return;
      }
      const base = this.model.defaultFor(type);
      this.placement = { kind, key, type, w: base.w, h: base.h };
      this.applyTool('place');
      this.openDrawer(null);
      const name = kind === 'sign' ? this.catalogs.signs[key]?.name || key : this.catalogs.cad[key]?.name || key;
      this.toast(`Colocando “${name}”. Haz clic en el plano. Esc para cancelar.`, 'info', { duration: 3600 });
      this.svg.focus?.();
    }

    cancelPlacement() {
      this.placement = null;
      this.ghost = null;
      this.applyTool('select');
    }

    cursorFor(tool) {
      if (this.pan) return 'grabbing';
      if (tool === 'hand') return 'grab';
      if (tool === 'select') return this.spaceDown ? 'grab' : 'default';
      if (tool === 'place') return 'copy';
      return 'crosshair';
    }

    /** Mantiene el botón de la paleta con el icono y el nombre de la herramienta activa. */
    syncToolPalette() {
      const meta = TOOL_META[this.tool] || TOOL_META.select;
      const label = q('[data-tools-label]');
      if (label) label.textContent = meta.label;
      const icon = q('[data-tools-icon]');
      if (icon) icon.setAttribute('href', `#${meta.icon}`);
      qa('[data-tool-choice]').forEach((button) => {
        button.classList.toggle('is-current', button.dataset.toolChoice === this.tool);
      });
    }

    toggleToolsPalette(open) {
      const popover = q('[data-tools-popover]');
      const toggle = q('[data-tools-toggle]');
      if (!popover || !toggle) return;
      const next = typeof open === 'boolean' ? open : popover.hidden;
      popover.hidden = !next;
      toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
      if (next) popover.querySelector('.tool-choice')?.focus?.();
    }

    closeToolsPalette(restoreFocus = false) {
      const popover = q('[data-tools-popover]');
      if (!popover || popover.hidden) return;
      this.toggleToolsPalette(false);
      if (restoreFocus) q('[data-tools-toggle]')?.focus?.();
    }

    /**
     * Pasa al siguiente elemento de la pila bajo el puntero. Ctrl/⌘ + clic
     * baja un nivel (lo que está debajo de la superposición) y con Shift sube.
     */
    cycleSelection(stack, direction = 1) {
      if (!stack.length) return false;
      const current = this.model.selection.size === 1 ? [...this.model.selection][0] : null;
      const index = stack.findIndex((element) => element.id === current);
      const nextIndex = index === -1 ? 0 : (index + direction + stack.length) % stack.length;
      const target = stack[nextIndex];
      this.model.select([target.id]);
      return true;
    }

    /* ------------------------------- render ------------------------------- */
    scheduleRender() {
      if (this.renderQueued) return;
      this.renderQueued = true;
      window.requestAnimationFrame(() => {
        this.renderQueued = false;
        this.renderNow();
      });
    }

    renderNow() {
      this.renderer.render(this.model.design, {
        view: this.view,
        showGrid: this.showGrid,
        selection: this.model.selection,
        activeTool: this.tool,
        ghost: this.ghost,
        draft: this.draft,
        guides: this.guides,
        cursor: this.cursorFor(this.tool),
      });
      this.inspector.render();
      this.inspector.refreshThumbnails();
      this.updateHistoryButtons();
      this.updateStatusbar();
      this.updateZoomLabel();
      this.updateEmptyHint();
      this.updateRulers();
    }

    updateHistoryButtons() {
      const undo = q('[data-undo]');
      const redo = q('[data-redo]');
      if (undo) undo.disabled = this.model.history.length === 0;
      if (redo) redo.disabled = this.model.future.length === 0;
    }

    updateZoomLabel() {
      const label = q('[data-zoom-label]');
      if (label) label.textContent = `${Math.round(this.view.zoom * 100)}%`;
    }

    updateStatusbar() {
      const design = this.model.design;
      const size = q('[data-canvas-size]');
      if (size) size.textContent = `${G.formatNumber(design.canvas.width, 0)} × ${G.formatNumber(design.canvas.height, 0)} ${design.canvas.unit}`;
      const scale = q('[data-scale-label]');
      if (scale) scale.textContent = `${design.canvas.scale} · referencia`;
      const selection = this.model.selectedElements();
      const label = q('[data-selection-status]');
      if (label) {
        if (!selection.length) label.textContent = 'Sin selección';
        else if (selection.length === 1) {
          const element = selection[0];
          label.textContent = `${this.typeLabel(element)} · ${G.formatMeasurement(element.w, design.canvas.unit)} × ${G.formatMeasurement(element.h, design.canvas.unit)}`;
        } else label.textContent = `${selection.length} elementos seleccionados`;
      }
      const stack = q('[data-stack-status]');
      if (stack) {
        const count = this.lastHit?.ids?.length || 0;
        stack.hidden = count < 2;
        if (count >= 2) stack.textContent = `${count} superpuestos · Ctrl + clic baja`;
      }
    }

    typeLabel(element) {
      const code = this.model.signCodeForType(element.type);
      if (code) return `Señal ${code}`;
      const cad = this.model.cadForType(element.type);
      if (cad) return cad.name;
      return TYPE_NAMES[element.type] || 'Elemento';
    }

    updateSaveStatus() {
      if (this.conflictVersion) {
        this.setStatus('conflict', 'Conflicto de versión');
        return;
      }
      if (this.store.saving) {
        this.setStatus('saving', 'Guardando…');
        return;
      }
      if (this.store.autosaveInFlight) {
        this.setStatus('draft', 'Guardando borrador…');
        return;
      }
      if (this.model.isDirty()) {
        this.setStatus('dirty', 'Cambios sin guardar');
        return;
      }
      if (this.store.lastDraftAt) {
        this.setStatus('draft', `Borrador guardado ${this.lastDraftLabel()}`);
        return;
      }
      this.setStatus('saved', `Guardado · v${this.store.version}`);
    }

    lastDraftLabel() {
      const at = this.store.lastDraftAt;
      if (!at) return '';
      const date = new Date(at);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }

    setStatus(state, text) {
      this.statusState = state;
      this.statusText = text;
      const holder = q('[data-save-status]');
      const label = q('[data-save-label]');
      if (holder) holder.dataset.state = state;
      if (label) label.textContent = text;
    }

    updateEmptyHint() {
      const hint = q('[data-empty-hint]');
      if (!hint) return;
      hint.hidden = this.model.design.elements.length > 0;
    }

    updateRulers() {
      if (!this.showRulers) return;
      this.renderer.renderRulers(q('[data-ruler-h]'), q('[data-ruler-v]'), this.model.design, this.view, this.model.design.canvas.unit);
    }

    /* ------------------------------- historial ------------------------------- */
    undo() {
      if (this.model.undo()) {
        this.toast('Cambio deshecho.', 'info', { duration: 2200 });
        this.scheduleRender();
      }
    }

    redo() {
      if (this.model.redo()) {
        this.toast('Cambio rehecho.', 'info', { duration: 2200 });
        this.scheduleRender();
      }
    }

    afterEdit() {
      this.scheduleRender();
      this.updateSaveStatus();
    }

    /* ------------------------------ coordenadas ------------------------------ */
    toCanvas(event) {
      const rect = this.svg.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - this.view.panX) / this.view.zoom,
        y: (event.clientY - rect.top - this.view.panY) / this.view.zoom,
      };
    }

    snapPoint(point, event) {
      const grid = this.model.design.canvas.grid;
      if (!this.snapEnabled || event?.altKey) return { x: point.x, y: point.y };
      return { x: G.snapValue(point.x, grid), y: G.snapValue(point.y, grid) };
    }

    clampPoint(point) {
      const canvas = this.model.design.canvas;
      return {
        x: G.clamp(point.x, 0, canvas.width),
        y: G.clamp(point.y, 0, canvas.height),
      };
    }

    /* -------------------------------- puntero -------------------------------- */
    onPointerDown(event) {
      const pointNode = event.target.closest?.('.selection-frame .vertex-handle');
      if (pointNode && this.tool === 'select') {
        const element = this.model.selectedElements()[0];
        if (!element || !this.model.canEdit()) return;
        const index = Number(pointNode.dataset.point);
        if (event.altKey) {
          // Alt+clic quita el vértice sin abrir un arrastre.
          if (this.model.removePathPoint(element.id, index)) {
            this.toast('Vértice eliminado.', 'info', { duration: 1800 });
            this.scheduleRender();
          }
          return;
        }
        this.pending = {
          mode: 'vertex',
          elementId: element.id,
          index,
          start: this.toCanvas(event),
          startClient: { x: event.clientX, y: event.clientY },
          pointerId: event.pointerId,
        };
        this.svg.setPointerCapture?.(event.pointerId);
        return;
      }
      const handleNode = event.target.closest?.('.selection-frame .handle');
      if (handleNode) {
        // No se transforma todavía: un clic simple sobre un tirador no debe
        // mover ni rotar nada. El arrastre empieza al superar el umbral.
        this.pending = {
          mode: 'transform',
          handle: handleNode.dataset.handle,
          start: this.toCanvas(event),
          startClient: { x: event.clientX, y: event.clientY },
          pointerId: event.pointerId,
        };
        this.svg.setPointerCapture?.(event.pointerId);
        return;
      }
      if (event.button === 1 || (event.button === 0 && this.spaceDown)) {
        this.beginPan(event);
        return;
      }
      if (event.button !== 0) return;
      const point = this.clampPoint(this.toCanvas(event));
      if (this.tool === 'hand') {
        this.beginPan(event);
        return;
      }
      const elementNode = event.target.closest?.('.plan-element');
      if (this.tool === 'select') {
        // Pila real bajo el puntero (no solo el nodo superior del SVG): permite
        // llegar a un elemento tapado por otro con Ctrl/⌘ + clic.
        const stack = this.model.hitStack(point, { tolerance: 6 / (this.view.zoom || 1) });
        this.lastHit = { x: point.x, y: point.y, ids: stack.map((element) => element.id) };
        if ((event.ctrlKey || event.metaKey) && stack.length) {
          this.cycleSelection(stack, event.shiftKey ? -1 : 1);
          this.scheduleRender();
          return;
        }
        if (elementNode) {
          const id = elementNode.dataset.id;
          if (event.shiftKey) this.model.select([id], true);
          else if (!this.model.selection.has(id)) this.model.select([id]);
          if (this.model.canEdit() && this.model.selection.size) {
            this.pending = {
              mode: 'move',
              start: point,
              startClient: { x: event.clientX, y: event.clientY },
              pointerId: event.pointerId,
            };
            this.svg.setPointerCapture?.(event.pointerId);
          }
          this.scheduleRender();
        } else {
          if (!event.shiftKey) this.model.clearSelection();
          this.drag = { mode: 'marquee', start: point, current: point };
          this.svg.setPointerCapture?.(event.pointerId);
          this.scheduleRender();
        }
        return;
      }
      if (this.tool === 'place') {
        this.placeAt(point, event.shiftKey);
        return;
      }
      if (this.tool === 'pipe' || this.tool === 'conduit') {
        if (!this.draft) {
          this.draft = { tool: this.tool, points: [point, point] };
        } else {
          this.draft.points.splice(this.draft.points.length - 1, 0, point);
        }
        this.updateRouteHint();
        this.scheduleRender();
        return;
      }
      if (this.tool === 'route') {
        if (!this.draft) {
          this.draft = { tool: 'route', points: [point, point] };
        } else {
          const committed = this.draft.points.slice(0, -1);
          const first = committed[0];
          const closeDistance = 14 / (this.view.zoom || 1);
          if (first && committed.length >= 3 && G.distance(point, first) <= closeDistance) {
            this.finishRoute(true);
            return;
          }
          this.draft.points.splice(this.draft.points.length - 1, 0, point);
        }
        this.updateRouteHint();
        this.scheduleRender();
        return;
      }
      if ((root.DOOR_TYPES || []).includes(this.tool) || this.tool === 'text') {
        this.insertAtPoint(this.tool, point);
        return;
      }
      this.drag = { mode: 'draw', start: point, current: point, pointerId: event.pointerId };
      this.draft = { tool: this.tool, points: [point, point] };
      this.svg.setPointerCapture?.(event.pointerId);
      this.scheduleRender();
    }

    /** Convierte un arrastre pendiente en movimiento real (evita saltos al hacer clic). */
    startMove(pending) {
      this.drag = {
        mode: 'move',
        start: pending.start,
        frame: this.model.selectionFrame(),
        startClient: pending.startClient,
        pointerId: pending.pointerId,
      };
      this.model.begin();
      this.svg.setPointerCapture?.(pending.pointerId);
    }

    /** Convierte un arrastre pendiente en transformación real desde un tirador. */
    startTransform(pending) {
      const frame = this.model.selectionFrame();
      if (!frame) return;
      const display = this.renderer.displayFrame(frame);
      const anchor = this.renderer.handlePoint(frame, pending.handle);
      this.model.begin();
      this.drag = {
        mode: 'transform',
        handle: pending.handle,
        frame,
        start: pending.start,
        startClient: pending.startClient,
        anchor,
        displayAnchor: this.renderer.handlePoint(display, pending.handle),
        pointerId: pending.pointerId,
      };
      this.svg.setPointerCapture?.(pending.pointerId);
    }

    /**
     * Arrastre de un vértice de ruta, muro, línea o medida. La rotación del
     * elemento se disuelve en los puntos al empezar, así que el puntero se
     * aplica directamente sobre las coordenadas del lienzo.
     */
    startVertex(pending) {
      const element = this.model.element(pending.elementId);
      if (!element) return;
      this.model.begin();
      this.drag = {
        mode: 'vertex',
        elementId: element.id,
        index: pending.index,
        startClient: { x: pending.startClient.x, y: pending.startClient.y },
        pointerId: pending.pointerId,
      };
      this.svg.setPointerCapture?.(pending.pointerId);
      this.updateVertex(this.clampPoint(this.toCanvas({ clientX: pending.startClient.x, clientY: pending.startClient.y })));
    }

    /** Aplica el puntero al vértice activo con ajuste opcional a la rejilla. */
    updateVertex(point, event = {}) {
      const drag = this.drag;
      if (!drag || drag.mode !== 'vertex') return;
      let target = this.snapPoint(point, event);
      if (event.shiftKey) {
        const points = this.model.visualPoints(this.model.element(drag.elementId));
        const previous = points[drag.index - 1];
        const next = points[drag.index + 1];
        const anchor = previous || next;
        if (anchor) {
          const dx = Math.abs(target.x - anchor.x);
          const dy = Math.abs(target.y - anchor.y);
          if (dx >= dy) target = { x: target.x, y: anchor.y };
          else target = { x: anchor.x, y: target.y };
        }
      }
      this.model.setPathPoint(drag.elementId, drag.index, target);
      this.scheduleRender();
    }

    onPointerMove(event) {
      const point = this.clampPoint(this.toCanvas(event));
      const cursor = q('[data-cursor-position]');
      if (cursor) cursor.textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)}`;
      if (this.pending) {
        const dx = event.clientX - this.pending.startClient.x;
        const dy = event.clientY - this.pending.startClient.y;
        if (Math.hypot(dx, dy) < 3) return;
        const pending = this.pending;
        this.pending = null;
        if (pending.mode === 'transform') this.startTransform(pending);
        else if (pending.mode === 'vertex') this.startVertex(pending);
        else this.startMove(pending);
      }
      if (this.pan) {
        this.view.panX = this.pan.panX + (event.clientX - this.pan.startX);
        this.view.panY = this.pan.panY + (event.clientY - this.pan.startY);
        this.scheduleRender();
        return;
      }
      if (this.tool === 'place' && this.placement) {
        const snapped = this.snapPoint(point, event);
        this.ghost = {
          x: G.clamp(snapped.x, this.placement.w / 2, this.model.design.canvas.width - this.placement.w / 2),
          y: G.clamp(snapped.y, this.placement.h / 2, this.model.design.canvas.height - this.placement.h / 2),
          w: this.placement.w,
          h: this.placement.h,
          type: this.placement.type,
        };
        this.scheduleRender();
        return;
      }
      if (this.drag?.mode === 'marquee') {
        this.drag.current = point;
        this.drawMarquee();
        return;
      }
      if (this.drag?.mode === 'move') {
        const grid = this.model.design.canvas.grid;
        const dx = point.x - this.drag.start.x;
        const dy = point.y - this.drag.start.y;
        const frame = this.drag.frame;
        let x = frame.x + dx;
        let y = frame.y + dy;
        if (this.snapEnabled && !event.altKey) {
          x = G.snapValue(x, grid);
          y = G.snapValue(y, grid);
        }
        if (event.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) y = frame.y;
          else x = frame.x;
        }
        x = G.clamp(x, 0, this.model.design.canvas.width - frame.w);
        y = G.clamp(y, 0, this.model.design.canvas.height - frame.h);
        this.model.setSelectionFrame({ ...frame, x, y });
        this.scheduleRender();
        return;
      }
      if (this.drag?.mode === 'transform') {
        this.updateTransform(point, event);
        return;
      }
      if (this.drag?.mode === 'vertex') {
        this.updateVertex(point, event);
        return;
      }
      if (this.drag?.mode === 'draw') {
        const snapped = this.snapPoint(point, event);
        let end = snapped;
        if (event.shiftKey) {
          const dx = Math.abs(end.x - this.drag.start.x);
          const dy = Math.abs(end.y - this.drag.start.y);
          if (this.tool === 'rect' || this.tool === 'ellipse') {
            const size = Math.max(dx, dy);
            end = {
              x: this.drag.start.x + Math.sign(end.x - this.drag.start.x || 1) * size,
              y: this.drag.start.y + Math.sign(end.y - this.drag.start.y || 1) * size,
            };
          } else if (dx >= dy) {
            end = { x: end.x, y: this.drag.start.y };
          } else {
            end = { x: this.drag.start.x, y: end.y };
          }
        }
        this.drag.current = end;
        this.draft = { tool: this.tool, points: [this.drag.start, end] };
        this.scheduleRender();
        return;
      }
      if ((this.tool === 'route' || this.tool === 'pipe' || this.tool === 'conduit') && this.draft) {
        const snapped = this.snapPoint(point, event);
        this.draft.points[this.draft.points.length - 1] = snapped;
        this.scheduleRender();
      }
    }

    onPointerUp(event, cancelled = false) {
      if (this.pending) {
        this.pending = null;
        this.scheduleRender();
        return;
      }
      if (this.pan) {
        this.pan = null;
        this.svg.closest('.canvas-shell')?.classList.remove('is-panning');
        this.scheduleRender();
        return;
      }
      if (this.drag?.mode === 'marquee') {
        const drag = this.drag;
        this.drag = null;
        this.hideMarquee();
        if (!cancelled) this.finishMarquee(drag);
        return;
      }
      if (this.drag?.mode === 'move') {
        this.drag = null;
        this.model.end('move');
        this.scheduleRender();
        return;
      }
      if (this.drag?.mode === 'transform') {
        const wasRotate = this.drag.handle === 'rotate';
        this.drag = null;
        this.model.end(wasRotate ? 'rotate' : 'resize');
        this.scheduleRender();
        return;
      }
      if (this.drag?.mode === 'vertex') {
        this.drag = null;
        this.model.end('points');
        this.scheduleRender();
        return;
      }
      if (this.drag?.mode === 'draw') {
        const drag = this.drag;
        this.drag = null;
        this.draft = null;
        if (cancelled) {
          this.scheduleRender();
          return;
        }
        this.commitDraw(drag);
      }
    }

    onDoubleClick(event) {
      if (['pipe', 'conduit'].includes(this.draft?.tool)) {
        event.preventDefault();
        this.finishPipe();
        return;
      }
      if (this.tool === 'route' && this.draft) {
        this.finishRoute();
        return;
      }
      const node = event.target.closest?.('.plan-element');
      if (!node || this.tool !== 'select') return;
      const element = this.model.element(node.dataset.id);
      if (!element) return;
      // Doble clic sobre un muro o una ruta añade un vértice en el segmento
      // más cercano: es la forma de crear esquinas nuevas sin salir del plano.
      if ((element.type === 'wall' || element.type === 'route') && this.model.canEdit()) {
        const point = this.snapPoint(this.clampPoint(this.toCanvas(event)), event);
        const points = this.model.visualPoints(element);
        let target = { index: 0, distance: Infinity };
        for (let index = 0; index < points.length - 1; index += 1) {
          const gap = G.distanceToSegment(point, points[index], points[index + 1]);
          if (gap < target.distance) target = { index, distance: gap };
        }
        if (points.length < 40 && target.distance <= 24 / (this.view.zoom || 1)) {
          this.model.select([element.id]);
          if (this.model.insertPathPoint(element.id, target.index, point)) {
            this.toast('Vértice añadido. Arrástralo para ajustar el trazo.', 'info', { duration: 2400 });
            this.scheduleRender();
            return;
          }
        }
      }
      if (element.type === 'text' || element.type === 'dimension' || element.label) {
        q('[data-properties-panel]')?.classList.add('is-open');
        const field = q('[data-prop="label"]');
        field?.focus();
        field?.select?.();
      }
    }

    onWheel(event) {
      event.preventDefault();
      if (event.shiftKey && !event.ctrlKey) {
        this.view.panY -= event.deltaY;
        this.scheduleRender();
        return;
      }
      const factor = Math.exp(-event.deltaY * 0.0016);
      this.zoomAt(this.view.zoom * factor, event.clientX, event.clientY);
    }

    beginPan(event) {
      this.pan = { startX: event.clientX, startY: event.clientY, panX: this.view.panX, panY: this.view.panY };
      this.pending = null;
      this.drag = null;
      this.svg.style.cursor = 'grabbing';
      this.svg.closest('.canvas-shell')?.classList.add('is-panning');
      this.svg.setPointerCapture?.(event.pointerId);
    }

    updateTransform(point, event) {
      const drag = this.drag;
      if (!drag) return;
      const canvas = this.model.design.canvas;
      if (drag.handle === 'rotate') {
        const center = G.centerOf(drag.frame);
        let angle = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
        if (!event.altKey) angle = Math.round(angle / (event.shiftKey ? 15 : 1)) * (event.shiftKey ? 15 : 1);
        this.model.setRotation(G.normalizeAngle(angle));
        this.scheduleRender();
        return;
      }
      // El tirador puede dibujarse expandido para no tapar trazos finos.
      // Se aplica el desplazamiento del puntero sobre la esquina real del marco,
      // así el primer movimiento no produce saltos.
      const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y };
      const anchor = drag.anchor || point;
      const target = { x: anchor.x + delta.x, y: anchor.y + delta.y };
      const snapped = this.snapPoint(target, event);
      const next = G.resizeFrame(drag.frame, drag.handle, snapped, { keepRatio: event.shiftKey, minSize: MIN_SIZE });
      next.x = G.clamp(next.x, 0, canvas.width - Math.max(MIN_SIZE, next.w));
      next.y = G.clamp(next.y, 0, canvas.height - Math.max(MIN_SIZE, next.h));
      next.w = Math.min(next.w, canvas.width - next.x);
      next.h = Math.min(next.h, canvas.height - next.y);
      this.model.setSelectionFrame(next);
      this.scheduleRender();
    }

    drawMarquee() {
      const marquee = q('[data-marquee]');
      if (!marquee || !this.drag) return;
      const a = this.drag.start;
      const b = this.drag.current;
      const zoom = this.view.zoom;
      const left = Math.min(a.x, b.x) * zoom + this.view.panX;
      const top = Math.min(a.y, b.y) * zoom + this.view.panY;
      const width = Math.abs(b.x - a.x) * zoom;
      const height = Math.abs(b.y - a.y) * zoom;
      marquee.hidden = false;
      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${width}px`;
      marquee.style.height = `${height}px`;
    }

    hideMarquee() {
      const marquee = q('[data-marquee]');
      if (marquee) marquee.hidden = true;
    }

    finishMarquee(drag) {
      const rect = G.boundsOfPoints([drag.start, drag.current]);
      if (rect.w < 3 && rect.h < 3) return;
      const ids = this.model.design.elements
        .filter((element) => this.model.canSelect(element.id))
        .filter((element) => G.intersects(G.boundsOfElement(element), rect))
        .map((element) => element.id);
      this.model.select(ids);
    }

    commitDraw(drag) {
      const start = drag.start;
      const end = drag.current;
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      const tool = this.tool;
      try {
        if (tool === 'wall' || tool === 'line' || tool === 'dimension') {
          const length = Math.hypot(end.x - start.x, end.y - start.y);
          if (length < MIN_SIZE) {
            this.toast('Arrastra para trazar el elemento. Pulsa Esc para volver a seleccionar.', 'info');
            return;
          }
          this.model.addPath(tool, [start, end], {});
        } else if (tool === 'rect' || tool === 'ellipse') {
          if (width < MIN_SIZE || height < MIN_SIZE) {
            this.toast('Arrastra para definir el tamaño de la forma.', 'info');
            return;
          }
          this.model.addBox(tool, (start.x + end.x) / 2, (start.y + end.y) / 2, width, height);
        }
      } catch (error) {
        this.toast(error.message, 'error');
      }
      this.scheduleRender();
    }

    finishRoute(closed = false) {
      if (!this.draft || this.draft.points.length < 2) return;
      // El último punto es el cursor elástico: no forma parte del trazo.
      const committed = this.draft.points.slice(0, -1);
      const points = committed.filter((point, index, list) => index === 0 || G.distance(point, list[index - 1]) > 2);
      this.draft = null;
      if (points.length < 2) {
        this.toast('Una ruta necesita al menos dos puntos. Haz clic para trazar.', 'info');
        this.updateRouteHint();
        this.scheduleRender();
        return;
      }
      if (closed && points.length >= 3) points.push({ x: points[0].x, y: points[0].y });
      try {
        this.model.addPath('route', points, {});
        this.toast(closed ? 'Ruta cerrada en circuito.' : 'Ruta de evacuación creada.', 'success', { duration: 2400 });
        // Se selecciona la ruta recién creada para poder ajustar sus vértices
        // sin tener que cambiar de herramienta a mano.
        const created = this.model.design.elements.at(-1);
        this.applyTool('select');
        if (created) this.model.select([created.id]);
      } catch (error) {
        this.toast(error.message, 'error');
      }
      this.scheduleRender();
    }

    /** Cierra el trazo de tubería o de circuito eléctrico en curso. */
    finishPipe() {
      if (!this.draft || !['pipe', 'conduit'].includes(this.draft.tool)) return;
      const tool = this.draft.tool;
      const committed = this.draft.points.slice(0, -1);
      const points = committed.filter((point, index, list) => index === 0 || G.distance(point, list[index - 1]) > 2);
      this.draft = null;
      if (points.length < 2) {
        this.toast('Una red necesita al menos dos puntos. Haz clic para trazar el tramo.', 'info');
        this.updateRouteHint();
        this.scheduleRender();
        return;
      }
      try {
        const overrides = tool === 'pipe' ? { network: this.pipeNetwork } : {};
        this.model.addPath(tool, points, overrides);
        const created = this.model.design.elements.at(-1);
        this.applyTool('select');
        if (created) this.model.select([created.id]);
        this.toast(tool === 'pipe'
          ? `Tramo de ${this.model.networkInfo(this.pipeNetwork)?.label || 'tubería'} creado. Ajusta diámetro y material en el inspector.`
          : 'Circuito eléctrico creado. Asigna código, tensión y calibre en el inspector.', 'success', { duration: 3200 });
      } catch (error) {
        this.toast(error.message, 'error');
      }
      this.scheduleRender();
    }

    /** Pista contextual de la ruta en curso (puntos, cierre y atajos). */
    updateRouteHint() {
      const hint = q('[data-stage-hint]');
      if (!hint) return;
      if (!this.draft) {
        hint.textContent = TYPE_HINTS[this.tool] || TYPE_HINTS.route;
        return;
      }
      if (this.draft.tool === 'pipe' || this.draft.tool === 'conduit') {
        const count = Math.max(0, this.draft.points.length - 1);
        const label = this.draft.tool === 'pipe' ? (this.model.networkInfo(this.pipeNetwork)?.label || 'Tubería') : 'Circuito eléctrico';
        hint.textContent = `${label} · ${count} punto${count === 1 ? '' : 's'} · Enter o doble clic termina · Retroceso quita el último · Esc cancela`;
        return;
      }
      const count = Math.max(0, this.draft.points.length - 1);
      hint.textContent = `Ruta de evacuación · ${count} punto${count === 1 ? '' : 's'} · clic en el primer punto para cerrar el circuito · Enter o doble clic termina · Retroceso quita el último · Esc cancela`;
    }

    insertAtPoint(tool, point) {
      const base = this.model.defaultFor(tool);
      const isDoor = (root.DOOR_TYPES || []).includes(tool);
      try {
        this.model.addElement(tool, {
          x: point.x - base.w / 2,
          // El clic marca la línea del muro: las puertas abren hacia arriba.
          y: isDoor ? point.y - base.h : point.y - base.h / 2,
          ...(tool === 'text' ? { label: 'Texto', fontSize: 18 } : {}),
        });
        this.applyTool('select');
        if (tool === 'text') {
          q('[data-properties-panel]')?.classList.add('is-open');
          const field = q('[data-prop="label"]');
          field?.focus();
          field?.select?.();
        }
        this.scheduleRender();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    placeAt(point, keepGoing) {
      if (!this.placement) return;
      try {
        this.model.placeFromLibrary(this.placement.kind, this.placement.key, point);
        this.ghost = null;
        if (!keepGoing) {
          this.cancelPlacement();
        } else {
          this.model.clearSelection();
        }
        this.scheduleRender();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    /**
     * El cajón de la biblioteca tiene un fondo que bloquea el lienzo. Mientras
     * se arrastra una tarjeta se oculta ese fondo para poder soltarla en el
     * plano; el panel sigue abierto y se restaura si se cancela el arrastre.
     */
    beginResourceDrag() {
      const backdrop = q('[data-drawer-backdrop]');
      if (backdrop) backdrop.hidden = true;
      document.body.classList.add('is-dragging-resource');
    }

    endResourceDrag() {
      document.body.classList.remove('is-dragging-resource');
      q('[data-canvas-shell]')?.classList.remove('is-drop-target');
      if (!this.activeDrawer) return;
      const backdrop = q('[data-drawer-backdrop]');
      if (backdrop) backdrop.hidden = false;
    }

    /** Coloca un recurso arrastrado desde la biblioteca al lienzo. */
    onResourceDrop(event) {
      const transfer = event.dataTransfer;
      if (!transfer) return;
      const raw = transfer.getData('application/x-normia-resource') || transfer.getData('text/plain') || '';
      if (!raw) return;
      event.preventDefault();
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      const kind = payload.kind === 'cad' ? 'cad' : payload.kind === 'sign' ? 'sign' : null;
      const key = typeof payload.key === 'string' ? payload.key : '';
      if (!kind || !key) return;
      const type = kind === 'sign' ? this.model.typeForSignCode(key) : key;
      if (!this.model.isKnownType(type)) {
        this.toast('El recurso no pertenece a las bibliotecas locales.', 'error');
        return;
      }
      if (!this.model.canEdit()) {
        this.toast('La capa activa está bloqueada. Desbloquéala para colocar recursos.', 'error');
        return;
      }
      const point = this.snapPoint(this.clampPoint(this.toCanvas(event)), event);
      try {
        this.model.placeFromLibrary(kind, key, point);
        this.applyTool('select');
        this.closeDrawer();
        this.scheduleRender();
        this.toast('Recurso colocado en el plano.', 'success', { duration: 2200 });
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    setGhost(ghost) {
      this.ghost = ghost;
      this.scheduleRender();
    }

    closeShapeFlyout() {
      const flyout = q('[data-shape-flyout]');
      const button = q('[data-shape-menu]');
      if (flyout) flyout.hidden = true;
      if (button) button.setAttribute('aria-expanded', 'false');
    }

    closePipeFlyout() {
      const flyout = q('[data-pipe-flyout]');
      const button = q('[data-pipe-menu]');
      if (flyout) flyout.hidden = true;
      if (button) button.setAttribute('aria-expanded', 'false');
    }

    closeDoorFlyout() {
      const flyout = q('[data-door-flyout]');
      const button = q('[data-door-menu]');
      if (flyout) flyout.hidden = true;
      if (button) button.setAttribute('aria-expanded', 'false');
    }

    /* -------------------------------- zoom -------------------------------- */
    setZoom(zoom, clientX, clientY) {
      const rect = this.svg.getBoundingClientRect();
      const anchorX = clientX ?? rect.left + rect.width / 2;
      const anchorY = clientY ?? rect.top + rect.height / 2;
      const localX = anchorX - rect.left;
      const localY = anchorY - rect.top;
      const worldX = (localX - this.view.panX) / this.view.zoom;
      const worldY = (localY - this.view.panY) / this.view.zoom;
      const next = G.clamp(zoom, 0.1, 4);
      this.view.zoom = next;
      this.view.panX = localX - worldX * next;
      this.view.panY = localY - worldY * next;
      this.scheduleRender();
    }

    zoomAt(zoom, clientX, clientY) {
      this.setZoom(zoom, clientX, clientY);
    }

    zoomBy(factor) {
      this.setZoom(this.view.zoom * factor);
    }

    fit(silent = false) {
      const rect = this.svg.getBoundingClientRect();
      const canvas = this.model.design.canvas;
      const availableWidth = Math.max(240, rect.width || this.svg.clientWidth || 800);
      const availableHeight = Math.max(200, rect.height || this.svg.clientHeight || 600);
      const zoom = G.clamp(Math.min(availableWidth / canvas.width, availableHeight / canvas.height) * 0.94, 0.1, 3);
      this.view.zoom = zoom;
      this.view.panX = (availableWidth - canvas.width * zoom) / 2;
      this.view.panY = (availableHeight - canvas.height * zoom) / 2;
      if (!silent) this.scheduleRender();
    }

    /* ------------------------------- teclado ------------------------------- */
    onKeyDown(event) {
      const target = event.target;
      const typing = target instanceof Element && (target.closest('input, textarea, select, [contenteditable="true"]') !== null);
      if (event.key === 'Escape') {
        const palette = q('[data-tools-popover]');
        if (palette && !palette.hidden) {
          this.closeToolsPalette(true);
          return;
        }
        if (this.activeDrawer) {
          this.closeDrawer();
          return;
        }
        if (this.placement) {
          this.cancelPlacement();
          return;
        }
        if (this.draft) {
          this.draft = null;
          this.drag = null;
          this.pending = null;
          this.updateRouteHint();
          this.scheduleRender();
          return;
        }
        if (typing) {
          target.blur();
          return;
        }
        if (this.tool !== 'select') this.applyTool('select');
        else this.model.clearSelection();
        return;
      }
      if (typing) return;
      if (['pipe', 'conduit'].includes(this.draft?.tool) && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        const committed = this.draft.points.length - 1;
        if (committed > 1) this.draft.points.splice(this.draft.points.length - 2, 1);
        this.updateRouteHint();
        this.scheduleRender();
        return;
      }
      if (this.draft?.tool === 'route' && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        const committed = this.draft.points.length - 1;
        if (committed > 1) this.draft.points.splice(this.draft.points.length - 2, 1);
        else this.draft = null;
        this.updateRouteHint();
        this.scheduleRender();
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        this.saveNow();
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.undo();
        return;
      }
      if (mod && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault();
        this.redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        this.model.selectAll();
        return;
      }
      if (mod && event.key.toLowerCase() === 'c') {
        const count = this.model.copySelected();
        if (count) this.toast(`${count} elemento${count === 1 ? '' : 's'} copiado${count === 1 ? '' : 's'}.`, 'info', { duration: 2200 });
        return;
      }
      if (mod && event.key.toLowerCase() === 'v') {
        this.model.paste();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        this.model.duplicateSelected();
        return;
      }
      if (mod && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        if (event.shiftKey) this.model.ungroupSelected();
        else this.model.groupSelected();
        return;
      }
      if (mod && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        const elements = this.model.selectedElements();
        if (elements.length) this.model.lockSelected(!elements.every((element) => element.locked));
        return;
      }
      if (mod) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (this.model.selectedElements().length) {
          event.preventDefault();
          this.model.deleteSelected();
        }
        return;
      }
      if (event.key === 'Enter') {
        if (this.draft?.tool === 'route') {
          event.preventDefault();
          this.finishRoute();
        } else if (['pipe', 'conduit'].includes(this.draft?.tool)) {
          event.preventDefault();
          this.finishPipe();
        }
        return;
      }
      const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (arrow) {
        event.preventDefault();
        const step = (event.shiftKey ? 10 : 1) * (this.snapEnabled ? Math.max(1, Math.round(this.model.design.canvas.grid / 10)) : 1);
        const selection = this.model.selectedElements();
        if (selection.length) {
          this.model.begin();
          this.model.moveSelected(arrow[0] * step, arrow[1] * step);
          this.model.end('nudge');
        }
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.zoomBy(1.2);
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        this.zoomBy(1 / 1.2);
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        this.fit();
        return;
      }
      if (event.code === 'Space') {
        this.spaceDown = true;
        this.svg.style.cursor = 'grab';
        event.preventDefault();
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        this.applyTool('conduit');
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        this.applyTool('door_double');
        return;
      }
      const shortcuts = { v: 'select', h: 'hand', m: 'wall', u: 'door', r: 'door_garage', e: 'route', t: 'text', d: 'dimension', l: 'line', b: 'rect', o: 'ellipse', p: 'pipe' };
      const tool = shortcuts[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        this.applyTool(tool);
      }
    }

    /* ------------------------------- guardado ------------------------------- */
    async saveNow(note = 'Guardado manual', options = {}) {
      if (this.store.saving) return;
      const force = options.force === true;
      const unversioned = this.store.version <= 1;
      if (!this.model.isDirty() && !force && !unversioned) {
        this.toast(`No hay cambios pendientes. Última versión guardada: v${this.store.version}.`, 'info', { duration: 3000 });
        this.updateSaveStatus();
        return;
      }
      this.updateSaveStatus();
      try {
        const result = await this.store.save(note);
        if (!result) return;
        this.conflictVersion = null;
        this.updateVersionLabel();
        this.toast(result.message || `Plano guardado como v${this.store.version}.`, 'success');
        this.removeBannerByAction('reload');
        this.removeBannerByAction('download');
        this.updateSaveStatus();
        if (this.activeDrawer === 'versions') this.loadVersions();
      } catch (error) {
        if (error.status === 409) {
          this.showConflict(error.data?.current_version, error.message);
        } else {
          this.toast(error.message, 'error');
          this.setStatus('error', 'Error al guardar');
        }
      }
    }

    updateVersionLabel() {
      const label = q('[data-version-label]');
      if (label) label.textContent = `v${this.store.version}`;
    }

    showConflict(currentVersion, message) {
      this.conflictVersion = Number(currentVersion) || null;
      this.setStatus('conflict', 'Conflicto de versión');
      this.banner('warning', `${message || 'Otra sesión guardó este plano.'} Tu trabajo sigue en pantalla pero no se guardó. Recarga la versión actual para continuar, o descarga una copia local para no perderlo.`, [
        { label: `Recargar v${currentVersion || '?'}`, action: 'reload', variant: 'primary' },
        { label: 'Descargar copia local', action: 'download', variant: 'ghost' },
      ], 'conflict');
    }

    async reloadFromServer() {
      try {
        const data = await this.store.loadFloor();
        const design = data.design || data.floor?.design;
        if (!design) throw new Error('El servidor no devolvió un diseño válido.');
        this.model.replaceDesign(design);
        this.store.setVersion(data.floor?.version || this.store.version);
        this.store.lastDraftAt = null;
        this.conflictVersion = null;
        this.updateVersionLabel();
        this.removeBannerByAction('reload');
        this.removeBannerByAction('download');
        this.removeBanner('conflict');
        this.fit();
        this.renderNow();
        this.updateSaveStatus();
        this.toast(`Versión v${this.store.version} recargada desde el servidor.`, 'success');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    downloadLocalCopy() {
      const payload = {
        application: 'normia-planos-cad',
        format: 'normia-plan',
        schema_version: 2,
        exported_at: new Date().toISOString(),
        project: this.boot.project || {},
        floor: { name: this.floorName, level: this.floorLevel },
        design: this.model.serialize(),
        attribution: 'Copia local de recuperación. Los planos son esquemáticos: verifica dimensiones y escala en sitio.',
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileBase(this.boot.fileBase)}-copia-local.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    onAutosaveError(error) {
      if (error?.status === 409) {
        this.showConflict(error.data?.current_version, 'El borrador no se guardó porque otra sesión guardó una versión nueva.');
        return;
      }
      this.setStatus('error', 'Borrador no guardado');
    }

    onDraftSaved(at) {
      if (this.conflictVersion) return;
      this.setStatus('draft', `Borrador guardado ${this.lastDraftLabel()}`);
      if (this.activeDrawer === 'versions') this.loadVersions();
    }

    async discardDraft() {
      const ok = await this.confirm('¿Descartar el borrador automático? Se conservará la última versión guardada.', { title: 'Descartar borrador', confirmLabel: 'Descartar' });
      if (!ok) return;
      try {
        await this.store.discardDraft();
        await this.reloadFromServer();
        this.store.lastDraftAt = null;
        this.removeBanner('draft');
        this.updateSaveStatus();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    /* -------------------------------- capas -------------------------------- */
    /* ------------------------------ redes y circuitos ------------------------------ */

    /**
     * Cálculo en vivo con el modelo actual (no con lo guardado), para que el
     * panel acompañe al dibujo. La comparación con el servidor viene aparte.
     */
    computeNetworks() {
      if (!root.Mep) return null;
      return root.Mep.summary(this.model.design, this.catalogs);
    }

    renderNetworks() {
      const host = q('[data-networks-content]');
      if (!host || !root.Mep) return;
      const summary = this.computeNetworks();
      if (!summary) return;
      const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      const meters = (value) => `${root.Mep.formatNumber(value, 1)} m`;
      const hydraulicRows = summary.hydraulic.map((entry) => `
        <article class="network-card">
          <header><span class="network-dot" style="--swatch:${esc(entry.color)}"></span><strong>${esc(entry.label)}</strong><span class="network-tag">${esc(entry.short)}</span></header>
          <p class="network-metrics"><span>${entry.count} tramo${entry.count === 1 ? '' : 's'}</span><span>${meters(entry.lengthM)}</span></p>
          <p class="network-detail">Ø ${entry.diameters.map((item) => `${esc(item.diameter)} (${meters(item.lengthM)})`).join(' · ') || '—'}</p>
          ${entry.warnings.length ? `<ul class="network-warnings">${entry.warnings.slice(0, 3).map((message) => `<li>${esc(message)}</li>`).join('')}</ul>` : '<p class="network-ok">Sin avisos de pendiente.</p>'}
        </article>`).join('');
      const circuitRows = summary.electrical.map((entry) => `
        <article class="network-card">
          <header><span class="network-dot" style="--swatch:${esc(entry.color)}"></span><strong>Circuito ${esc(entry.code)}</strong><span class="network-tag">${entry.voltage} V · ${entry.phases}F</span></header>
          <p class="network-metrics"><span>${entry.deviceCount} equipo${entry.deviceCount === 1 ? '' : 's'}</span><span>${root.Mep.formatNumber(entry.loadVA, 0)} VA</span><span>${root.Mep.formatNumber(entry.current, 1)} A</span></p>
          <p class="network-detail">Breaker ${entry.breaker || '—'} A · Calibre ${esc(entry.gauge || '—')} AWG · ${meters(entry.lengthM)} de tubería</p>
          <p class="network-detail">Fases declaradas: ${entry.phases}F · ${entry.phases === 3 ? 'carga repartida entre fases' : 'fase y neutro'}</p>
          <p class="network-detail">Caída estimada ${root.Mep.formatNumber(entry.drop, 1)} %</p>
          ${entry.warnings.length ? `<ul class="network-warnings">${entry.warnings.slice(0, 3).map((message) => `<li>${esc(message)}</li>`).join('')}</ul>` : '<p class="network-ok">Dentro de los límites de referencia.</p>'}
        </article>`).join('');
      const empty = !summary.hydraulic.length && !summary.electrical.length;
      host.innerHTML = `
        <section class="network-section">
          <h3>Totales del piso</h3>
          <dl class="network-totals">
            <div><dt>Tuberías</dt><dd>${summary.pipes}</dd></div>
            <div><dt>Metros de tubería</dt><dd>${meters(summary.totalPipeLength)}</dd></div>
            <div><dt>Circuitos</dt><dd>${summary.electrical.length}</dd></div>
            <div><dt>Metros eléctricos</dt><dd>${meters(summary.totalConduitLength)}</dd></div>
            <div><dt>Carga instalada</dt><dd>${root.Mep.formatNumber(summary.totalLoadVA, 0)} VA</dd></div>
          </dl>
        </section>
        ${empty ? '<div class="network-empty"><p>Aún no hay redes dibujadas. Usa <strong>P</strong> para tubería o <strong>Shift + P</strong> para tubería eléctrica, y dibuja los tramos sobre el plano.</p></div>' : ''}
        ${summary.hydraulic.length ? `<section class="network-section"><h3>Redes hidrosanitarias y de gas</h3><div class="network-cards">${hydraulicRows}</div></section>` : ''}
        ${summary.electrical.length ? `<section class="network-section"><h3>Circuitos eléctricos</h3><div class="network-cards">${circuitRows}</div></section>` : ''}
        ${summary.warnings.length ? `<section class="network-section"><h3>Avisos (${summary.warnings.length})</h3><ul class="network-warnings wide">${summary.warnings.slice(0, 12).map((message) => `<li>${esc(message)}</li>`).join('')}</ul></section>` : ''}
        <p class="network-footnote">Cálculo estimado con los valores de referencia locales. No sustituye memoria de cálculo ni revisión profesional.</p>`;
    }

    renderLayers() {
      const list = q('[data-layer-list]');
      if (!list) return;
      const design = this.model.design;
      const rows = [];
      design.layers.forEach((layer, index) => {
        const count = design.elements.filter((element) => element.layerId === layer.id).length;
        const active = layer.id === this.model.activeLayerId;
        rows.push(`
          <li class="layer-row ${active ? 'is-active' : ''} ${layer.locked ? 'is-locked' : ''}" data-layer-id="${esc(layer.id)}">
            <button class="layer-pick" type="button" data-layer-action="activate" data-tooltip="Capa activa">
              <span class="layer-swatch" aria-hidden="true"></span>
              <span class="layer-info"><strong>${esc(layer.name)}</strong><small>${count} elemento${count === 1 ? '' : 's'}</small></span>
            </button>
            <div class="layer-tools">
              <button class="icon-button tiny ${layer.visible ? 'is-on' : ''}" type="button" data-layer-action="visible" data-tooltip="${layer.visible ? 'Ocultar capa' : 'Mostrar capa'}" aria-label="${layer.visible ? 'Ocultar' : 'Mostrar'} capa ${esc(layer.name)}" aria-pressed="${layer.visible}">
                <svg class="icon"><use href="#i-${layer.visible ? 'eye' : 'eye-off'}"></use></svg>
              </button>
              <button class="icon-button tiny ${layer.locked ? 'is-on' : ''}" type="button" data-layer-action="lock" data-tooltip="${layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}" aria-label="${layer.locked ? 'Desbloquear' : 'Bloquear'} capa ${esc(layer.name)}" aria-pressed="${layer.locked}">
                <svg class="icon"><use href="#i-${layer.locked ? 'lock' : 'unlock'}"></use></svg>
              </button>
              <button class="icon-button tiny" type="button" data-layer-action="up" ${index === 0 ? 'disabled' : ''} data-tooltip="Subir capa" aria-label="Subir capa ${esc(layer.name)}"><svg class="icon"><use href="#i-chevron-up"></use></svg></button>
              <button class="icon-button tiny" type="button" data-layer-action="down" ${index === design.layers.length - 1 ? 'disabled' : ''} data-tooltip="Bajar capa" aria-label="Bajar capa ${esc(layer.name)}"><svg class="icon"><use href="#i-chevron-down"></use></svg></button>
              <button class="icon-button tiny danger" type="button" data-layer-action="delete" ${design.layers.length < 2 ? 'disabled' : ''} data-tooltip="Eliminar capa" aria-label="Eliminar capa ${esc(layer.name)}"><svg class="icon"><use href="#i-trash"></use></svg></button>
            </div>
            <label class="layer-rename"><input type="text" maxlength="60" value="${esc(layer.name)}" data-layer-action="rename" aria-label="Nombre de la capa ${esc(layer.name)}"></label>
          </li>`);
      });
      list.innerHTML = rows.join('');
    }

    async onLayerClick(event) {
      const control = event.target.closest('[data-layer-action]');
      if (!control) return;
      if (control.tagName === 'INPUT') return;
      const row = control.closest('[data-layer-id]');
      const layerId = row?.dataset.layerId;
      if (!layerId) return;
      const action = control.dataset.layerAction;
      const layer = this.model.layer(layerId);
      if (!layer) return;
      try {
        if (action === 'activate') {
          if (layer.locked) {
            this.toast('La capa está bloqueada. Desbloquea para trabajar en ella.', 'info');
            return;
          }
          this.model.setActiveLayer(layerId);
        }
        if (action === 'visible') this.model.updateLayer(layerId, { visible: !layer.visible });
        if (action === 'lock') this.model.updateLayer(layerId, { locked: !layer.locked });
        if (action === 'up') this.model.reorderLayer(layerId, 'up');
        if (action === 'down') this.model.reorderLayer(layerId, 'down');
        if (action === 'delete') {
          const count = this.model.design.elements.filter((element) => element.layerId === layerId).length;
          if (count > 0) {
            this.toast('Mueve o elimina los elementos de la capa antes de borrarla.', 'error');
            return;
          }
          const confirmed = await this.confirm(`¿Eliminar la capa “${layer.name}”? Esta acción se puede deshacer con Ctrl + Z.`, { title: 'Eliminar capa', confirmLabel: 'Eliminar' });
          if (!confirmed) return;
          this.model.deleteLayer(layerId);
        }
      } catch (error) {
        this.toast(error.message, 'error');
      }
      this.renderLayers();
      this.scheduleRender();
    }

    onLayerChange(event) {
      const input = event.target.closest('[data-layer-action="rename"]');
      if (!input) return;
      const row = input.closest('[data-layer-id]');
      const layerId = row?.dataset.layerId;
      const name = input.value.trim();
      if (!layerId || !name) {
        this.renderLayers();
        return;
      }
      try {
        this.model.updateLayer(layerId, { name });
      } catch (error) {
        this.toast(error.message, 'error');
        this.renderLayers();
      }
      this.scheduleRender();
    }

    /* ------------------------------- ajustes ------------------------------- */
    async saveFloorMeta(event) {
      event.preventDefault();
      const form = event.target;
      const name = form.elements.name.value.trim();
      const level = form.elements.level.value.trim();
      try {
        const result = await this.store.updateFloorMeta(name, level);
        this.floorName = result.name || name;
        this.floorLevel = result.level ?? level;
        const label = q('[data-floor-label]');
        if (label) label.textContent = this.floorName;
        this.updateTitle();
        this.toast('Datos del piso actualizados.', 'success');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    applyCanvasSettings(event) {
      event.preventDefault();
      const form = event.target;
      try {
        this.model.setCanvas({
          width: Number(form.elements.width.value),
          height: Number(form.elements.height.value),
          grid: Number(form.elements.grid.value),
          unit: form.elements.unit.value,
          scale: form.elements.scale.value.trim(),
        });
        this.fit(true);
        this.renderNow();
        this.toast('Lienzo actualizado. Guarda para conservar el cambio.', 'success');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    updateTitle() {
      document.title = `${this.floorName} · Normia Planos CAD`;
    }

    /* ------------------------------ versiones ------------------------------ */
    async loadVersions() {
      const list = q('[data-version-list]');
      if (!list) return;
      list.innerHTML = '<p class="muted">Cargando versiones…</p>';
      try {
        const data = await this.store.versions();
        if (!data.versions?.length) {
          list.innerHTML = '<p class="muted">Todavía no hay versiones guardadas.</p>';
          return;
        }
        list.innerHTML = data.versions.map((version) => `
          <article class="version-row ${version.is_current ? 'is-current' : ''}">
            <div class="version-marker"><span></span></div>
            <div class="version-body">
              <header><strong>v${version.version}</strong>${version.is_current ? '<span class="badge">Actual</span>' : ''}<time>${esc(version.created_at)}</time></header>
              <p>${esc(version.note || 'Sin nota')}</p>
              <small>${esc(version.created_by)} · ${Math.max(1, Math.round(version.size / 1024))} KB</small>
            </div>
            <button class="button button-ghost button-small" type="button" data-restore="${version.id}" data-version="${version.version}" ${version.is_current ? 'disabled' : ''} data-tooltip="${version.is_current ? 'Ya es la versión actual' : 'Restaurar como nueva versión'}">Restaurar</button>
          </article>`).join('');
        list.querySelectorAll('[data-restore]').forEach((button) => {
          button.addEventListener('click', () => this.restoreVersion(Number(button.dataset.restore), Number(button.dataset.version)));
        });
      } catch (error) {
        list.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
      }
    }

    async restoreVersion(versionId, versionNumber) {
      const ok = await this.confirm(`¿Restaurar la versión v${versionNumber}? Se guardará como una versión nueva y el diseño actual quedará en el historial.`, { title: 'Restaurar versión', confirmLabel: 'Restaurar' });
      if (!ok) return;
      if (this.model.isDirty()) {
        const proceed = await this.confirm('Tienes cambios sin guardar. Al restaurar se descartarán. ¿Continuar?', { title: 'Cambios sin guardar', confirmLabel: 'Descartar y restaurar' });
        if (!proceed) return;
      }
      try {
        const result = await this.store.restore(versionId);
        await this.reloadFromServer();
        this.updateVersionLabel();
        this.toast(result.message || 'Versión restaurada.', 'success');
        this.loadVersions();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }

    /* -------------------------------- export -------------------------------- */
    async export(kind) {
      const dirty = this.model.isDirty();
      if (dirty) {
        const proceed = await this.confirm('Las exportaciones usan la última versión guardada, no los cambios sin guardar. ¿Continuar de todos modos?', { title: 'Cambios sin guardar', confirmLabel: 'Exportar la versión guardada' });
        if (!proceed) return;
      }
      const base = fileBase(this.boot.fileBase);
      if (kind === 'svg' || kind === 'json' || kind === 'print') {
        if (kind === 'print') {
          window.open(this.boot.printUrl, '_blank', 'noopener');
          return;
        }
        const link = document.createElement('a');
        link.href = kind === 'svg' ? this.boot.exportSvgUrl : this.boot.exportJsonUrl;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        this.toast(`Descargando ${kind.toUpperCase()} de la versión v${this.store.version}…`, 'info', { duration: 3000 });
        return;
      }
      if (kind === 'png') {
        if (this.exportBusy) return;
        this.exportBusy = true;
        try {
          await this.exportPng(base);
          this.toast('PNG generado a partir del plano actual.', 'success');
        } catch (error) {
          this.toast(`No se pudo generar el PNG: ${error.message}`, 'error');
        } finally {
          this.exportBusy = false;
        }
      }
    }

    /**
     * Datos del pie de página con la escala y la versión actuales. La base
     * llega del servidor (`boot.footer`), así el PNG usa el mismo contenido
     * que el SVG exportado y la impresión.
     */
    footerPayload() {
      const base = this.boot.footer;
      if (!base || !Array.isArray(base.cells) || base.cells.length === 0) return null;
      const canvas = this.model.design.canvas;
      return {
        cells: base.cells,
        lines: Array.isArray(base.lines) ? base.lines : [],
        fields: {
          ...(base.fields || {}),
          scale: canvas.scale,
          unit: canvas.unit,
          version: String(this.store.version),
          count: String(this.model.design.elements.length),
        },
      };
    }

    /** SVG de exportación: plano limpio + pie de página. */
    buildExportSvg() {
      const canvas = this.model.design.canvas;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('xmlns', NS);
      const renderer = new root.Renderer(svg, this.catalogs);
      renderer.render(this.model.design, {
        view: { zoom: 1, panX: 0, panY: 0 },
        showGrid: false,
        selection: null,
        activeTool: 'select',
      });
      const footer = this.footerPayload();
      const extra = footer ? renderer.footerHeight(footer, canvas.width) : 0;
      const height = canvas.height + extra;
      svg.setAttribute('width', String(canvas.width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${canvas.width} ${height}`);
      if (footer) renderer.footerBand(footer, { width: canvas.width, top: canvas.height });
      return { svg, width: canvas.width, height };
    }

    async exportPng(base) {
      const canvas = this.model.design.canvas;
      const { svg, width, height } = this.buildExportSvg();
      const source = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      try {
        const image = await loadImage(url);
        const maxPixels = 24_000_000;
        const scale = Math.max(1, Math.min(2, Math.sqrt(maxPixels / (width * height))));
        const target = document.createElement('canvas');
        target.width = Math.round(width * scale);
        target.height = Math.round(height * scale);
        const context = target.getContext('2d');
        if (!context) throw new Error('El navegador no permite dibujar el lienzo.');
        context.fillStyle = canvas.background;
        context.fillRect(0, 0, target.width, target.height);
        context.drawImage(image, 0, 0, target.width, target.height);
        const pngBlob = await new Promise((resolve, reject) => {
          target.toBlob((result) => (result ? resolve(result) : reject(new Error('No se pudo convertir el lienzo a PNG.'))), 'image/png');
        });
        downloadBlob(pngBlob, `${base}.png`);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    /* ---------------------------- pie de página ---------------------------- */

    /**
     * Vista previa del pie con los datos actuales del editor. Usa el mismo
     * renderizador y la misma carga útil que la exportación PNG, para que lo
     * que se ve aquí sea lo que se descarga.
     */
    renderFooterPreview() {
      const holder = q('[data-footer-preview]');
      if (!holder) return;
      const payload = this.footerPayload();
      if (!payload) {
        holder.innerHTML = '<p class="muted">El servidor no envió los datos del pie de página.</p>';
        return;
      }
      const width = this.model.design.canvas.width;
      const svg = document.createElementNS(NS, 'svg');
      const renderer = new root.Renderer(svg, this.catalogs);
      const height = renderer.footerHeight(payload, width);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Vista previa del pie de plano');
      svg.classList.add('footer-preview-svg');
      renderer.footerBand(payload, { width, top: 0 });
      holder.replaceChildren(svg);

      const list = q('[data-footer-cells]');
      if (list) {
        list.replaceChildren(...payload.cells.map((cell) => {
          const item = document.createElement('div');
          item.className = 'footer-cell-chip';
          item.dataset.footerCell = cell.key;
          const dot = document.createElement('span');
          dot.className = 'footer-cell-dot';
          dot.style.background = cell.accent;
          const label = document.createElement('span');
          label.textContent = cell.title;
          item.append(dot, label);
          return item;
        }));
      }
    }

    /* -------------------------------- cajón -------------------------------- */
    openDrawer(name, opener = null) {
      if (!name) {
        this.closeDrawer();
        return;
      }
      const drawer = q(`[data-drawer="${name}"]`);
      if (!drawer) return;
      this.closeDrawer(true);
      drawer.hidden = false;
      const backdrop = q('[data-drawer-backdrop]');
      if (backdrop) backdrop.hidden = false;
      this.activeDrawer = name;
      this.drawerOpener = opener;
      document.body.classList.add('has-drawer');
      if (name === 'versions') this.loadVersions();
      if (name === 'layers') this.renderLayers();
      if (name === 'networks') this.renderNetworks();
      if (name === 'footer') this.renderFooterPreview();
      const focusable = drawer.querySelector('input, button, select, textarea, a[href]');
      window.setTimeout(() => focusable?.focus(), 40);
    }

    closeDrawer(keepBody = false) {
      qa('[data-drawer]').forEach((drawer) => { drawer.hidden = true; });
      const backdrop = q('[data-drawer-backdrop]');
      if (backdrop) backdrop.hidden = true;
      this.activeDrawer = null;
      if (!keepBody) {
        document.body.classList.remove('has-drawer');
        if (this.drawerOpener) {
          this.drawerOpener.focus?.();
          this.drawerOpener = null;
        }
      }
    }

    /* -------------------------------- avisos -------------------------------- */
    banner(type, message, actions = [], key = '') {
      const holder = q('[data-banners]');
      if (!holder) return;
      if (key) this.removeBanner(key);
      const element = document.createElement('div');
      element.className = `editor-banner banner-${type}`;
      if (key) element.dataset.bannerKey = key;
      const icons = { info: 'info', warning: 'alert', success: 'check' };
      element.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${icons[type] || 'info'}"></use></svg><p>${esc(message)}</p><div class="banner-actions"></div><button class="banner-close" type="button" data-banner-action="dismiss" aria-label="Cerrar aviso"><svg class="icon"><use href="#i-close"></use></svg></button>`;
      const actionsHolder = element.querySelector('.banner-actions');
      for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `button button-small ${action.variant === 'primary' ? 'button-primary' : 'button-ghost'}`;
        button.dataset.bannerAction = action.action;
        button.textContent = action.label;
        actionsHolder.appendChild(button);
      }
      holder.prepend(element);
    }

    removeBanner(key) {
      qa(`[data-banner-key="${key}"]`).forEach((element) => element.remove());
    }

    removeBannerByAction(action) {
      qa('[data-banner-key]').forEach((banner) => {
        if (banner.querySelector(`[data-banner-action="${action}"]`)) banner.remove();
      });
    }

    toast(message, type = 'info', options = {}) {
      if (window.NormiaUI?.toast) return window.NormiaUI.toast(message, type, options);
      return null;
    }

    confirm(message, options = {}) {
      if (window.NormiaUI?.confirm) return window.NormiaUI.confirm(message, options);
      return Promise.resolve(window.confirm(message));
    }
  }

  const fileBase = (value) => String(value || 'normia-plano').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'normia-plano';

  const loadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('el navegador no pudo interpretar el SVG del plano'));
    image.src = url;
  });

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('No se pudieron cargar las bibliotecas locales del editor.');
    return response.json();
  };

  const showLoading = (message) => {
    const stage = q('.canvas-stage');
    if (!stage) return null;
    const overlay = document.createElement('div');
    overlay.className = 'editor-loading';
    overlay.innerHTML = `<div class="loading-card"><span class="spinner" aria-hidden="true"></span><p>${esc(message)}</p></div>`;
    stage.appendChild(overlay);
    return overlay;
  };

  const start = async () => {
    const designField = q('#editor-design');
    const bootField = q('#editor-boot');
    if (!designField || !bootField || !q('#plan-canvas')) return;
    let boot;
    let design;
    try {
      boot = JSON.parse(bootField.value);
      design = JSON.parse(designField.value);
    } catch (error) {
      const failure = showLoading('No se pudo leer el plano. Recarga la página o revisa el archivo guardado.');
      failure?.classList.add('is-error');
      return;
    }
    const overlay = showLoading('Cargando bibliotecas visuales…');
    let catalogs;
    try {
      const [signs, cad, mep] = await Promise.all([
        fetchJson(boot.signsUrl),
        fetchJson(boot.cadUrl),
        boot.mepUrl ? fetchJson(boot.mepUrl).catch(() => null) : Promise.resolve(null),
      ]);
      catalogs = {
        signs: signs.signs || {},
        signCategories: signs.categories || {},
        signColors: signs.colors || {},
        aliases: signs.aliases || {},
        cad: cad.objects || {},
        cadCategories: cad.categories || {},
        mep: mep && mep.ok ? mep : null,
      };
    } catch (error) {
      if (overlay) {
        overlay.innerHTML = `<div class="loading-card is-error"><strong>No se pudieron cargar las bibliotecas</strong><p>${esc(error.message)}</p><button class="button button-primary" type="button" data-retry>Reintentar</button></div>`;
        overlay.querySelector('[data-retry]')?.addEventListener('click', () => window.location.reload());
      }
      return;
    }
    overlay?.remove();
    designField.remove();
    bootField.remove();
    // Contadores de la barra lateral: se leen del catálogo real, así no quedan
    // cifras fijas cuando se amplían las bibliotecas.
    const cadCount = q('[data-cad-count]');
    if (cadCount) cadCount.textContent = String(Object.keys(catalogs.cad || {}).length);
    const signCount = q('[data-sign-count]');
    if (signCount) signCount.textContent = String(Object.keys(catalogs.signs || {}).length);
    try {
      const app = new EditorApp(boot, design, catalogs);
      window.NormiaEditor = app;
    } catch (error) {
      console.error(error);
      showLoading(`El editor no pudo iniciarse: ${error.message}`);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
