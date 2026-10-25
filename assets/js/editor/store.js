/* Normia Planos CAD · persistencia del editor (versiones, borradores, ajustes). */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});

  class NetworkError extends Error {
    constructor(message, status = 0, data = {}) {
      super(message);
      this.name = 'NetworkError';
      this.status = status;
      this.data = data;
      this.code = data.code || '';
    }
  }

  class Store {
    constructor(boot, model) {
      this.boot = boot;
      this.model = model;
      this.version = Number(boot.version) || 1;
      this.saving = false;
      this.loading = false;
      this.autosaveTimer = null;
      this.autosaveInFlight = false;
      this.autosaveEnabled = true;
      this.lastDraftAt = boot.draftAt || null;
      this.onDraft = null;
    }

    async request(url, options = {}) {
      const config = {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      };
      if (config.method !== 'GET') {
        config.headers['Content-Type'] = 'application/json';
        config.headers['X-CSRF-Token'] = this.boot.csrf;
      }
      if (options.body !== undefined) config.body = JSON.stringify(options.body);
      let response;
      try {
        response = await fetch(url, config);
      } catch (error) {
        throw new NetworkError('No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.', 0, {});
      }
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (error) {
          throw new NetworkError('El servidor devolvió una respuesta inesperada. Recarga la página.', response.status, {});
        }
      }
      if (!response.ok || data.ok === false) {
        const message = data.message || (response.status === 419
          ? 'La sesión o el token de seguridad expiraron. Recarga la página.'
          : 'No se pudo completar la operación.');
        throw new NetworkError(message, response.status, data);
      }
      return data;
    }

    setVersion(version) {
      this.version = Number(version) || this.version;
      this.boot.version = this.version;
    }

    async save(note = 'Guardado manual') {
      if (this.saving) return null;
      this.saving = true;
      try {
        const result = await this.request(this.boot.saveUrl, {
          method: 'POST',
          body: { design: this.model.serialize(), expected_version: this.version, note },
        });
        this.setVersion(result.version);
        this.model.markSaved();
        this.lastDraftAt = null;
        return result;
      } finally {
        this.saving = false;
      }
    }

    async autosave() {
      if (!this.autosaveEnabled || this.autosaveInFlight || this.saving) return null;
      if (!this.model.isDirty()) return null;
      this.autosaveInFlight = true;
      try {
        const result = await this.request(this.boot.autosaveUrl, {
          method: 'POST',
          body: { design: this.model.serialize(), base_version: this.version },
        });
        this.lastDraftAt = new Date().toISOString();
        if (this.onDraft) this.onDraft(this.lastDraftAt);
        return result;
      } finally {
        this.autosaveInFlight = false;
      }
    }

    async loadFloor() {
      this.loading = true;
      try {
        return await this.request(this.boot.floorUrl || this.boot.saveUrl.replace(/\/save$/, ''));
      } finally {
        this.loading = false;
      }
    }

    async versions() {
      return this.request(this.boot.versionsUrl);
    }

    async restore(versionId) {
      const result = await this.request(this.boot.restoreUrlTemplate.replace('__ID__', String(versionId)), { method: 'POST', body: {} });
      this.setVersion(result.version);
      return result;
    }

    async discardDraft() {
      return this.request(this.boot.discardDraftUrl, { method: 'POST', body: {} });
    }

    async updateFloorMeta(name, level) {
      return this.request(this.boot.settingsUrl, { method: 'POST', body: { name, level } });
    }

    startAutosave(intervalSeconds, onError = null) {
      this.stopAutosave();
      const interval = Math.max(10, Number(intervalSeconds) || 30) * 1000;
      this.autosaveTimer = window.setInterval(() => {
        this.autosave().catch((error) => {
          if (typeof onError === 'function') onError(error);
        });
      }, interval);
    }

    stopAutosave() {
      if (this.autosaveTimer) {
        window.clearInterval(this.autosaveTimer);
        this.autosaveTimer = null;
      }
    }
  }

  root.NetworkError = NetworkError;
  root.EditorStore = Store;
})();
