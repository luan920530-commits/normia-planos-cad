/*
 * Normia Planos CAD · puente del **modo estudio**.
 *
 * La edición de escritorio «solo editor» no tiene cuentas, ni proyectos, ni base
 * de datos: el plano es un archivo que la persona elige. Este archivo hace de
 * bisagra entre tres piezas que ya existían y no se tocan:
 *
 *   1. el editor (`NormiaEditor`) tal cual, con su guardado, auditor y exportación;
 *   2. el puente de Electron (`window.NormiaEstudio`), que abre y escribe archivos;
 *   3. el servidor local, que solo necesita una copia del plano para el auditor,
 *      el informe, la impresión y el SVG.
 *
 * En un navegador normal —sin puente— el modo estudio sigue funcionando: el
 * plano vive en la sesión y todo lo demás se comporta igual.
 */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});
  const q = (selector, context = document) => context.querySelector(selector);
  const bridge = window.NormiaEstudio || null;

  class StudyMode {
    constructor(app) {
      this.app = app;
      this.bridge = bridge;
      this.filePath = '';
      this.fileName = (app.boot?.project?.name || '').trim();
      this.dirtySinceSave = false;
      this.syncing = false;
      this.patchSave();
      this.patchExport();
      this.bindKeys();
      this.bindMenu();
      this.reportTitle();
      this.notifyState();
    }

    /* ------------------------------ estado ------------------------------ */

    /** Ruta del archivo abierto, para el título de la ventana. */
    setFile(payload = {}) {
      this.filePath = String(payload.path || '');
      const name = String(payload.name || '').trim();
      if (name) this.fileName = name;
      this.reportTitle();
    }

    /** Título de la ventana: «Plano · Normia Estudio» y un punto si hay cambios. */
    reportTitle() {
      const name = this.fileName || 'Plano sin título';
      const dirty = this.app.model?.isDirty?.() || this.dirtySinceSave;
      const suffix = dirty ? ' •' : '';
      document.title = `${name}${suffix} · Normia Estudio`;
      this.bridge?.titulo?.({ name: `${name}${suffix}`, path: this.filePath, dirty: Boolean(dirty) });
    }

    /** Dice al proceso principal si hay cambios sin guardar (para cerrar la ventana). */
    notifyState() {
      this.bridge?.estado?.({ dirty: Boolean(this.app.model?.isDirty?.() || this.dirtySinceSave), path: this.filePath });
    }

    toast(message, tone = 'info', options = {}) {
      this.app.toast(message, tone, options);
    }

    /* -------------------------- espejo en el servidor -------------------------- */

    /**
     * Copia el plano en curso a la sesión del servidor. El auditor, el informe,
     * la impresión y el SVG se calculan del lado de PHP, así que necesitan esta
     * copia: el archivo del equipo sigue siendo la verdad.
     */
    async sync() {
      // Dos sincronizaciones a la vez (abrir un plano y guardar enseguida)
      // comparten la misma petición: el intérprete de PHP atiende una cada vez
      // y dos cuerpos a la vez lo dejarían sin responder.
      if (this.syncing) return this.syncing;
      this.syncing = (async () => {
        try {
          await this.app.store.request(this.app.boot.saveUrl, {
            method: 'POST',
            body: { design: this.app.model.serialize(), name: this.fileName },
          });
          return true;
        } catch (error) {
          this.toast(`No se pudo preparar el plano para el informe: ${error.message}`, 'error');
          return false;
        } finally {
          this.syncing = false;
        }
      })();
      return this.syncing;
    }

    /* ------------------------------- guardar ------------------------------- */

    /** El botón Guardar escribe el archivo; el espejo del servidor va detrás. */
    patchSave() {
      const store = this.app.store;
      const original = store.save.bind(store);
      store.save = async (note) => {
        const ok = await this.guardar();
        if (!ok) return null;
        try {
          await original(note);
        } catch { /* el archivo ya está a salvo: el espejo es solo para los documentos */ }
        return { ok: true };
      };
    }

    async guardar(forceDialog = false) {
      if (!this.bridge?.guardar) {
        // Sin puente (navegador) no hay archivo: se guarda el espejo y se dice.
        await this.sync();
        this.dirtySinceSave = false;
        this.app.model.markSaved();
        this.toast('Plano guardado en esta sesión del navegador.', 'success');
        return true;
      }
      const design = this.app.model.serialize();
      const result = forceDialog || !this.filePath
        ? await this.bridge.guardarComo({ design, name: this.fileName, path: this.filePath })
        : await this.bridge.guardar({ design, name: this.fileName, path: this.filePath });
      if (!result || result.cancelled) return false;
      if (result.ok === false) {
        this.toast(result.message || 'No se pudo guardar el archivo.', 'error');
        return false;
      }
      this.setFile(result);
      this.dirtySinceSave = false;
      this.app.model.markSaved();
      this.app.updateSaveStatus?.();
      this.toast(`Plano guardado · ${result.name || 'archivo'}`, 'success', { duration: 2600 });
      await this.sync();
      return true;
    }

    /* -------------------------------- abrir -------------------------------- */

    async abrir() {
      if (!this.bridge?.abrir) {
        this.toast('Abrir archivos necesita la aplicación de escritorio. En el navegador usa Archivo → Guardar como… y vuelve a cargar el archivo.', 'info', { duration: 5200 });
        return;
      }
      const result = await this.bridge.abrir({ path: this.filePath });
      if (!result || result.cancelled) return;
      if (result.ok === false) {
        this.toast(result.message || 'No se pudo abrir el archivo.', 'error');
        return;
      }
      this.cargar(result);
    }

    /** Carga un plano ya leído por el proceso principal. */
    cargar(result) {
      const design = result.design || result.plano?.design;
      if (!design || typeof design !== 'object') {
        this.toast('El archivo no tiene un plano de Normia.', 'error');
        return;
      }
      try {
        this.app.model.replaceDesign(design);
      } catch (error) {
        this.toast(`El archivo no se pudo leer: ${error.message}`, 'error');
        return;
      }
      this.fileName = String(result.name || design.name || 'Plano').trim();
      this.setFile({ path: result.path, name: this.fileName });
      this.dirtySinceSave = false;
      this.app.store.setVersion(1);
      this.app.conflictVersion = null;
      this.app.removeBanner?.('conflict');
      this.app.floorName = this.fileName;
      const label = q('[data-floor-label]');
      if (label) label.textContent = this.fileName;
      this.app.updateTitle?.();
      this.app.fit();
      this.app.renderNow();
      this.app.updateSaveStatus?.();
      this.toast(`Plano abierto · ${this.fileName}`, 'success', { duration: 2600 });
      this.sync();
      this.reportTitle();
    }

    /** Plano nuevo: lienzo A4 en blanco, sin arrastrar nada del anterior. */
    async nuevo() {
      if ((this.app.model.isDirty() || this.dirtySinceSave) && this.app.confirm) {
        const proceed = await this.app.confirm('Hay cambios sin guardar. Se perderán al empezar un plano nuevo.', {
          title: 'Plano nuevo', confirmLabel: 'Empezar de cero',
        });
        if (!proceed) return;
      }
      this.app.model.replaceDesign({});
      this.filePath = '';
      this.fileName = 'Plano sin título';
      this.dirtySinceSave = false;
      this.app.store.setVersion(1);
      this.app.floorName = this.fileName;
      const label = q('[data-floor-label]');
      if (label) label.textContent = this.fileName;
      this.app.fit();
      this.app.renderNow();
      this.app.updateSaveStatus?.();
      this.app.toast('Plano nuevo. Dibuja el primer muro con M.', 'info', { duration: 2800 });
      this.sync();
      this.reportTitle();
    }

    /* ------------------------ documentos e informes ------------------------ */

    /**
     * El informe, la impresión y el SVG se calculan en el servidor: antes de
     * abrirlos se manda la copia del plano en curso, sin pedir nada al usuario.
     */
    patchExport() {
      const app = this.app;
      const originalExport = app.export.bind(app);
      app.export = async (kind) => {
        await this.sync();
        return originalExport(kind);
      };
      // El enlace «Informe» del cajón de revisión es un ancla real.
      document.addEventListener('click', (event) => {
        const link = event.target.closest?.('[data-audit-report]');
        if (!link) return;
        event.preventDefault();
        this.sync().then(() => window.open(link.getAttribute('href'), '_blank', 'noopener'));
      }, true);
    }

    /* -------------------------------- teclado -------------------------------- */

    bindKeys() {
      window.addEventListener('keydown', (event) => {
        const mod = event.metaKey || event.ctrlKey;
        if (!mod) return;
        const key = event.key.toLowerCase();
        if (key === 'o') {
          event.preventDefault();
          this.abrir();
        } else if (key === 's') {
          // Ctrl/⌘+S la escribe aquí el archivo; el editor no debe intentar
          // guardar dos veces.
          event.preventDefault();
          event.stopPropagation();
          this.guardar(event.shiftKey);
        } else if (key === 'n') {
          event.preventDefault();
          this.nuevo();
        }
      }, true);
    }

    /* ------------------------------ menú nativo ------------------------------ */

    /** El menú de la aplicación manda órdenes por aquí. */
    bindMenu() {
      this.bridge?.alComando?.((command) => {
        if (command === 'abrir') this.abrir();
        else if (command === 'nuevo') this.nuevo();
        else if (command === 'guardar') this.guardar(false);
        else if (command === 'guardar-como') this.guardar(true);
      });
      window.NormiaEstudioUI = {
        abrir: () => this.abrir(),
        nuevo: () => this.nuevo(),
        guardar: () => this.guardar(false),
        guardarComo: () => this.guardar(true),
        sync: () => this.sync(),
        cargar: (payload) => this.cargar(payload),
        estado: () => ({ path: this.filePath, name: this.fileName, dirty: Boolean(this.app.model.isDirty() || this.dirtySinceSave) }),
      };
    }
  }

  /** Arranca el puente cuando el editor ya existe. */
  const start = () => {
    const app = window.NormiaEditor;
    if (!app) return false;
    root.StudyMode = new StudyMode(app);
    window.NormiaStud = root.StudyMode;
    return true;
  };

  if (!start()) {
    // El editor se crea al cargar las bibliotecas: se espera sin bloquear.
    const timer = window.setInterval(() => {
      if (start()) window.clearInterval(timer);
    }, 120);
    window.setTimeout(() => window.clearInterval(timer), 20000);
  }
})();
