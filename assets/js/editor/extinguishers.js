/* Normia Planos CAD · cobertura de extintores (cajón y veredicto del inspector). */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const number = (value, decimals = 1) => (Number.isFinite(Number(value))
    ? Number(value).toLocaleString('es-CO', { maximumFractionDigits: decimals })
    : '—');

  const REASON_LABELS = {
    travel: 'Fuera del recorrido',
    area: 'Área insuficiente',
    unreachable: 'Sin paso desde el extintor',
    no_class: 'Sin clasificación aplicable',
  };

  const STATUS_LABELS = {
    ok: ['Cubre', 'ok'],
    area: ['Área al límite', 'warn'],
    no_class: ['Sin clase', 'bad'],
  };

  const HAZARDS = { light: 'Leve', ordinary: 'Ordinario', extra: 'Extra' };

  class Extinguishers {
    constructor(app) {
      this.app = app;
      this.drawer = app.window?.document?.querySelector('[data-drawer="extinguishers"]') || document.querySelector('[data-drawer="extinguishers"]');
      this.host = this.drawer?.querySelector('[data-ext-content]') || null;
      this.report = null;
      this.loading = false;
      this.bind();
    }

    get model() {
      return this.app.model;
    }

    bind() {
      this.host?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ext-action]');
        if (!button || button.disabled) return;
        event.preventDefault();
        const action = button.dataset.extAction;
        if (action === 'run') {
          this.loading ? null : this.run();
          return;
        }
        if (action === 'save') {
          this.saveAndRun();
          return;
        }
        if (action === 'csv') {
          this.downloadCsv();
          return;
        }
        if (action === 'locate') {
          this.locate(button.dataset.extId || '');
          return;
        }
        const recommendation = this.recommendationFor(button.dataset.extRec);
        if (recommendation) this.apply(recommendation);
      });
      this.host?.addEventListener('change', (event) => {
        const field = event.target.closest('[data-ext-setting]');
        if (!field) return;
        const patch = { [field.dataset.extSetting]: field.value };
        if (this.model.setExtinguisherSettings(patch)) {
          this.app.afterEdit();
          this.app.toast('Ajuste del cálculo actualizado. Guarda el plano y vuelve a verificar para recalcular.', 'info', { duration: 4200 });
          this.render();
        }
      });
    }

    open() {
      if (!this.host) return;
      if (!this.report && !this.loading) this.run();
      else this.render();
    }

    /** El plano guardado cambió: el informe anterior deja de ser válido. */
    invalidate() {
      this.report = null;
      if (this.app.activeDrawer === 'extinguishers' && !this.loading) {
        this.run();
      } else if (this.host) {
        this.render();
      }
      this.app.inspector?.render(true);
    }

    async saveAndRun() {
      if (this.loading) return;
      await this.app.saveNow('Cobertura de extintores', { force: true });
      if (!this.app.store?.saving) this.run();
    }

    async run() {
      if (!this.host || this.loading) return;
      this.loading = true;
      this.host.innerHTML = '<p class="muted">Calculando recorridos y áreas sobre el plano guardado…</p>';
      try {
        const data = await this.app.store.request(this.app.boot.auditUrl || `api/floors/${this.app.boot.floorId}/audit`);
        this.report = data.report?.extinguishers || null;
      } catch (error) {
        this.host.innerHTML = `<div class="notice notice-warning compact-notice"><svg class="icon"><use href="#i-alert"></use></svg><p>${esc(error.message || 'No se pudo calcular la cobertura.')}</p></div>`;
        this.loading = false;
        return;
      }
      this.loading = false;
      this.render();
      this.app.inspector?.render(true);
    }

    /** Veredicto del extintor seleccionado, con sus acciones cuantificadas. */
    verdictFor(elementId) {
      const report = this.report;
      if (!report) return null;
      const unit = (report.units || []).find((item) => item.id === elementId) || null;
      if (!unit) return null;
      const recommendations = (report.recommendations || []).filter((rec) => rec.elementId === elementId || rec.action === 'add');
      return {
        unit,
        summary: report.summary,
        recommendations: recommendations.slice(0, 3),
        profileLabel: report.profileLabel || '',
        hazardLabel: report.hazardLabel || '',
        reference: report.reference || '',
      };
    }

    recommendationFor(index) {
      const list = this.report?.recommendations || [];
      const value = Number(index);
      return Number.isInteger(value) && list[value] ? { ...list[value], index: value } : null;
    }

    /* ------------------------------- acciones ------------------------------- */

    apply(recommendation) {
      const model = this.model;
      if (!model.canEdit()) {
        this.app.toast('El plano está bloqueado: desbloquea la capa para cambiar extintores.', 'warning');
        return;
      }
      if (recommendation.action === 'add' && recommendation.element) {
        const element = recommendation.element;
        const created = model.addElement(element.type, {
          x: element.x, y: element.y, w: element.w, h: element.h,
          extAgent: element.extAgent,
          extCapacityLb: element.extCapacityLb,
          extRating: element.extRating,
          extHazard: element.extHazard,
          extMountCm: element.extMountCm,
        });
        this.afterAction(created ? `Extintor añadido en la zona descubierta (${number(recommendation.gainAreaM2)} m² estimados).` : 'No se pudo añadir el extintor.');
        return;
      }
      if (!recommendation.elementId) return;
      model.select([recommendation.elementId]);
      if (recommendation.action === 'move' && recommendation.target) {
        const element = model.element(recommendation.elementId);
        if (!element) return;
        const x = Math.round((Number(recommendation.target.x) - element.w / 2) * 10) / 10;
        const y = Math.round((Number(recommendation.target.y) - element.h / 2) * 10) / 10;
        model.moveSelectionTo(Math.max(0, x), Math.max(0, y));
        this.afterAction(`Extintor reubicado: ${number(recommendation.gainAreaM2)} m² de cobertura estimada.`);
        return;
      }
      if (recommendation.action === 'upgrade') {
        model.setProps({ extRating: recommendation.rating, extCapacityLb: recommendation.capacityLb });
        this.afterAction(`Clasificación actualizada a ${recommendation.rating} (${number(recommendation.capacityLb, 0)} lb): ${number(recommendation.gainAreaM2)} m² estimados.`);
      }
    }

    afterAction(message) {
      this.app.afterEdit('Extintores ajustados');
      this.app.toast(`${message} Guarda el plano y vuelve a verificar para confirmar el cálculo.`, 'success', { duration: 5200 });
      this.render();
    }

    locate(elementId) {
      const element = this.model.element(elementId);
      if (!element) return;
      this.model.select([elementId]);
      this.app.closeDrawer();
      this.app.centerOnElement?.(element);
      this.app.inspector?.render(true);
    }

    /* -------------------------------- pintado -------------------------------- */

    render() {
      if (!this.host) return;
      const settings = this.model.design.extinguishers || { profile: 'colombia', hazard: 'ordinary' };
      const settingsMarkup = `<div class="ext-settings">
        <label class="select-field"><span class="num-label">Perfil normativo</span>
          <select data-ext-setting="profile">
            <option value="colombia" ${settings.profile === 'colombia' ? 'selected' : ''}>Colombia · NTC 2885 + Res. 2400</option>
            <option value="nfpa10" ${settings.profile === 'nfpa10' ? 'selected' : ''}>Internacional · NFPA 10</option>
          </select>
        </label>
        <label class="select-field"><span class="num-label">Riesgo del piso</span>
          <select data-ext-setting="hazard">
            ${Object.entries(HAZARDS).map(([key, label]) => `<option value="${key}" ${settings.hazard === key ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>`;
      if (!this.report) {
        this.host.innerHTML = `${settingsMarkup}
          <div class="notice notice-info compact-notice"><svg class="icon"><use href="#i-info"></use></svg><p>El cálculo mide el recorrido real por la rejilla del plano y el área que admite cada clasificación. Usa el último diseño guardado.</p></div>
          <p class="muted">Pulsa <strong>Verificar el plano guardado</strong> para medir la cobertura de extintores.</p>`;
        return;
      }
      const report = this.report;
      const summary = report.summary || {};
      const units = report.units || [];
      const zones = report.zones || [];
      const recommendations = report.recommendations || [];
      const rows = units.map((unit) => {
        const status = STATUS_LABELS[unit.status] || STATUS_LABELS.ok;
        return `<tr>
          <td><button class="link-button" type="button" data-ext-action="locate" data-ext-id="${esc(unit.id)}">${esc(unit.id)}</button></td>
          <td><span class="ext-agent">${esc(unit.agentLabel)}</span><small>${number(unit.capacityLb, 0)} lb · ${esc(unit.rating)}</small></td>
          <td>${number(unit.travelLimitM)} m</td>
          <td>${unit.areaLimitM2 === null ? '—' : `${number(unit.areaLimitM2)} m²`}</td>
          <td>${number(unit.coverageAreaM2)} m²<small>${number(unit.coveragePct)} %</small></td>
          <td>${unit.signCovered ? 'Sí' : 'No'}</td>
          <td><span class="ext-status is-${status[1]}">${status[0]}</span></td>
        </tr>`;
      }).join('');
      const zoneRows = zones.length
        ? zones.slice(0, 6).map((zone) => `<li>
            <strong>${number(zone.areaM2)} m²</strong>
            <span>${esc(REASON_LABELS[zone.reason] || 'Descubierta')}${zone.worstDistanceM === null ? '' : ` · punto a ${number(zone.worstDistanceM)} m`}</span>
          </li>`).join('')
        : '<li class="ext-empty">El cálculo no encontró superficie descubierta.</li>';
      const recommendationCards = recommendations.length
        ? recommendations.map((rec, index) => `<article class="ext-rec">
            <span class="ext-rec-icon"><svg class="icon"><use href="#i-${rec.action === 'add' ? 'plus' : rec.action === 'move' ? 'move' : 'extinguisher'}"></use></svg></span>
            <div class="ext-rec-copy">
              <strong>${esc(rec.title)}</strong>
              <p>${esc(rec.detail)}</p>
              <small>Ganancia estimada: ${number(rec.gainAreaM2)} m²${rec.gainPct === null ? '' : ` · ${number(rec.gainPct)} % de la zona descubierta`}</small>
            </div>
            <button class="button button-small button-soft" type="button" data-ext-action="apply" data-ext-rec="${index}">
              ${rec.action === 'add' ? 'Instalar aquí' : rec.action === 'move' ? 'Reubicar' : 'Subir capacidad'}
            </button>
          </article>`).join('')
        : '<p class="muted">Sin acciones con ganancia medible: la cobertura ya está completa o el plano no tiene superficie libre suficiente.</p>';
      const classes = (summary.classes || []).map((code) => `<span class="ext-class">${esc(code)}</span>`).join('');
      this.host.innerHTML = `${settingsMarkup}
        <div class="audit-toolbar">
          <button class="button button-primary button-small" type="button" data-ext-action="run"><svg class="icon"><use href="#i-audit"></use></svg>Verificar el plano guardado</button>
          <button class="button button-ghost button-small" type="button" data-ext-action="save"><svg class="icon"><use href="#i-save"></use></svg>Guardar y verificar</button>
          <button class="button button-ghost button-small" type="button" data-ext-action="csv"><svg class="icon"><use href="#i-download"></use></svg>Descargar CSV</button>
        </div>
        <div class="ext-summary">
          <div class="ext-stat"><span>Extintores</span><strong>${summary.count}</strong><small>${esc(report.profileLabel || '')}</small></div>
          <div class="ext-stat"><span>Piso útil</span><strong>${number(summary.floorAreaM2)} m²</strong><small>riesgo ${esc(report.hazardLabel || '')}</small></div>
          <div class="ext-stat"><span>Cobertura</span><strong>${number(summary.coveredPct)} %</strong><small>${number(summary.coveredAreaM2)} m² cubiertos</small></div>
          <div class="ext-stat ${summary.uncoveredAreaM2 > 0.5 ? 'is-warn' : ''}"><span>Descubierto</span><strong>${number(summary.uncoveredAreaM2)} m²</strong><small>${number(summary.requiredByArea)} por área (mín.)</small></div>
        </div>
        <div class="ext-classes"><span>Clases cubiertas</span>${classes || '<em>ninguna</em>'}${(summary.missingClasses || []).length ? `<span class="ext-missing">Falta ${esc(summary.missingClasses.join(', '))}</span>` : ''}</div>
        ${this.map(report)}
        <h3 class="ext-subtitle">Equipos y límites</h3>
        <div class="ext-table-wrap"><table class="ext-table">
          <thead><tr><th>Equipo</th><th>Agente y clasificación</th><th>Recorrido máx.</th><th>Área máx.</th><th>Cubre</th><th>Señal</th><th>Estado</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7">Sin extintores en el plano.</td></tr>'}</tbody>
        </table></div>
        <h3 class="ext-subtitle">Zonas descubiertas</h3>
        <ul class="ext-zones">${zoneRows}</ul>
        <h3 class="ext-subtitle">Cómo cerrar la brecha</h3>
        <div class="ext-recs">${recommendationCards}</div>
        <p class="ext-notice">${esc(report.notice)} Perfil: ${esc(report.reference)}.</p>`;
    }

    map(report) {
      const canvas = this.model.design.canvas;
      const width = Number(canvas.width) || 1200;
      const height = Number(canvas.height) || 800;
      const scale = 240 / Math.max(width, height);
      const zones = (report.zones || []).map((zone) => (zone.runs || []).map((run) => {
        const cell = (report.summary?.cellM || 0.2) * 100;
        return `<rect x="${run[0] * cell * scale}" y="${run[1] * cell * scale}" width="${run[2] * cell * scale}" height="${cell * scale}" />`;
      }).join('')).join('');
      if (!zones) return '';
      const dots = (report.units || []).map((unit) => `<g><circle cx="${(unit.center.x * scale).toFixed(1)}" cy="${(unit.center.y * scale).toFixed(1)}" r="3.4" /><title>${esc(unit.id)} · ${esc(unit.rating)}</title></g>`).join('');
      return `<figure class="ext-map">
        <svg viewBox="0 0 ${(width * scale).toFixed(0)} ${(height * scale).toFixed(0)}" role="img" aria-label="Mapa de zonas sin cobertura de extintores">
          <rect class="ext-map-floor" x="0" y="0" width="${(width * scale).toFixed(0)}" height="${(height * scale).toFixed(0)}" rx="6" />
          <g class="ext-map-gap">${zones}</g>
          <g class="ext-map-units">${dots}</g>
        </svg>
        <figcaption>Mancha roja: superficie sin cobertura. Punto oscuro: extintor.</figcaption>
      </figure>`;
    }

    /* --------------------------------- CSV --------------------------------- */

    downloadCsv() {
      const csv = this.csvContent();
      if (!csv) {
        this.app.toast('Calcula la cobertura antes de descargar el CSV.', 'info');
        return;
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `extintores-${this.app.boot.floorId || 'piso'}-v${this.app.store?.version || 1}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      this.app.toast('CSV de extintores descargado.', 'success');
    }

    /** Contenido del CSV con equipos, zonas descubiertas y resumen. */
    csvContent() {
      const report = this.report;
      if (!report) return '';
      const lines = [['tipo', 'id', 'agente', 'capacidad_lb', 'clasificacion', 'riesgo', 'recorrido_max_m', 'area_max_m2', 'area_cubierta_m2', 'porcentaje', 'senal', 'estado']];
      (report.units || []).forEach((unit) => lines.push([
        'extintor', unit.id, unit.agentLabel, unit.capacityLb, unit.rating, unit.hazardLabel,
        unit.travelLimitM ?? '', unit.areaLimitM2 ?? '', unit.coverageAreaM2, unit.coveragePct,
        unit.signCovered ? 'sí' : 'no', unit.status,
      ]));
      (report.zones || []).forEach((zone, index) => lines.push([
        'zona_descubierta', `Z${index + 1}`, '', '', '', REASON_LABELS[zone.reason] || zone.reason,
        zone.worstDistanceM ?? '', '', zone.areaM2, '', '', '',
      ]));
      lines.push(['resumen', '', '', '', '', report.hazardLabel, '', '', report.summary.coveredAreaM2, report.summary.coveredPct, '', `piso ${report.summary.floorAreaM2} m²`]);
      return `\uFEFF${lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
    }
  }

  root.Extinguishers = Extinguishers;
})();
