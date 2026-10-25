/* Normia Planos CAD · cajón de revisión del plano (auditor de emergencias). */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const SEVERITIES = [
    { key: 'high', label: 'Críticos', icon: 'alert' },
    { key: 'medium', label: 'Importantes', icon: 'alert' },
    { key: 'low', label: 'Menores', icon: 'info' },
    { key: 'info', label: 'Informativos', icon: 'info' },
  ];

  const number = (value, decimals = 1) => (Number.isFinite(Number(value))
    ? Number(value).toLocaleString('es-CO', { maximumFractionDigits: decimals })
    : '—');

  const duration = (seconds) => {
    if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return 'Sin datos';
    const total = Math.max(0, Math.round(Number(seconds)));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
  };

  class Audit {
    constructor(app) {
      this.app = app;
      const doc = app.window?.document || (typeof document === 'undefined' ? null : document);
      this.drawer = doc?.querySelector('[data-drawer="audit"]') || null;
      this.host = this.drawer?.querySelector('[data-audit-content]') || null;
      this.button = this.drawer?.querySelector('[data-audit-run]') || null;
      this.badge = doc?.querySelector('[data-audit-count]') || null;
      this.report = null;
      this.loading = false;
      this.lastRunAt = null;
      this.bind();
    }

    bind() {
      this.button?.addEventListener('click', () => this.run());
      this.host?.addEventListener('click', (event) => {
        const locate = event.target.closest('[data-audit-locate]');
        if (locate) {
          this.app.focusAuditFinding(locate.dataset.auditLocate, locate.dataset.auditElements || '');
          return;
        }
        const filter = event.target.closest('[data-audit-filter]');
        if (filter) {
          this.filter = filter.dataset.auditFilter === this.filter ? 'all' : filter.dataset.auditFilter;
          this.render();
        }
      });
    }

    open() {
      if (!this.report && !this.loading) this.run();
    }

    /**
     * El plano guardado cambió (guardado, restauración o recarga): el informe
     * anterior deja de ser vigente. Si el cajón está abierto se recalcula; si
     * no, se descarta y se avisa en el propio cajón.
     */
    invalidate() {
      this.report = null;
      this.filter = 'all';
      if (this.loading) return;
      if (this.app.activeDrawer === 'audit') {
        this.run();
        return;
      }
      this.updateBadge();
      if (this.host) {
        this.host.innerHTML = '<p class="muted">El plano guardado cambió. Pulsa <strong>Revisar el plano guardado</strong> para actualizar el informe.</p>';
      }
    }

    /** Pide el análisis del plano guardado y lo pinta. */
    async run({ silent = false } = {}) {
      if (!this.host || this.loading) return;
      this.loading = true;
      if (this.button) this.button.disabled = true;
      if (!silent) this.host.innerHTML = '<p class="muted">Analizando el plano guardado…</p>';
      try {
        const data = await this.app.store.request(this.app.boot.auditUrl || `api/floors/${this.app.boot.floorId}/audit`);
        this.report = data.report || null;
        this.lastRunAt = new Date();
        this.render();
        this.updateBadge();
      } catch (error) {
        this.host.innerHTML = `<div class="audit-error"><strong>No se pudo revisar el plano.</strong><p>${esc(error.message)}</p><button class="button button-small button-ghost" type="button" data-audit-run>Reintentar</button></div>`;
        this.host.querySelector('[data-audit-run]')?.addEventListener('click', () => this.run());
      } finally {
        this.loading = false;
        if (this.button) this.button.disabled = false;
      }
    }

    updateBadge() {
      if (!this.badge) return;
      const counts = this.report?.counts || null;
      const total = counts ? counts.high + counts.medium : 0;
      if (!total) {
        this.badge.hidden = true;
        this.badge.textContent = '';
        return;
      }
      this.badge.hidden = false;
      this.badge.textContent = String(total);
      this.badge.classList.toggle('is-high', counts.high > 0);
      this.badge.title = `${counts.high} críticos · ${counts.medium} importantes`;
    }

    render() {
      if (!this.host) return;
      const report = this.report;
      if (!report) {
        this.host.innerHTML = '<p class="muted">Pulsa <strong>Revisar</strong> para analizar el plano guardado.</p>';
        return;
      }
      const counts = report.counts;
      const travel = report.travel;
      const egress = report.egress;
      const occupancy = report.occupancy;
      const filter = this.filter || 'all';
      const findings = (report.findings || [])
        .map((finding, index) => ({ ...finding, index }))
        .filter((finding) => filter === 'all' || finding.severity === filter);

      const chips = SEVERITIES.map((severity) => `
        <button class="audit-chip audit-chip-${severity.key} ${filter === severity.key ? 'is-active' : ''}" type="button" aria-pressed="${filter === severity.key}" data-audit-filter="${severity.key}">
          ${esc(severity.label)} <em>${counts[severity.key] || 0}</em>
        </button>`).join('');

      const rows = findings.map((finding) => {
        const hasTarget = finding.elements.length > 0 || finding.position;
        return `<li class="audit-finding audit-sev-${finding.severity}">
          <header>
            <span class="audit-sev-dot" aria-hidden="true"></span>
            <strong>${esc(finding.title)}</strong>
            ${finding.value !== null && finding.value !== undefined ? `<span class="audit-finding-value">${esc(finding.value)}</span>` : ''}
          </header>
          <p>${esc(finding.detail)}</p>
          <footer>
            <code>${esc(finding.code)}</code>
            ${hasTarget ? `<button class="button button-small button-ghost" type="button" data-audit-locate="${finding.index}" data-audit-elements="${esc((finding.elements || []).join(','))}">
              <svg class="icon"><use href="#i-fit"></use></svg>Ver en el plano
            </button>` : ''}
          </footer>
        </li>`;
      }).join('');

      const clean = (report.findings || []).length === 0;

      this.host.innerHTML = `
        <section class="audit-score-row">
          <article class="audit-stat audit-stat-main ${counts.high ? 'is-high' : counts.medium ? 'is-medium' : 'is-clean'}">
            <span>${clean ? 'Sin hallazgos' : `${counts.high + counts.medium} por revisar`}</span>
            <strong>${clean ? '✓' : counts.high + counts.medium}</strong>
            <small>${counts.high} críticos · ${counts.medium} importantes · ${counts.low} menores</small>
          </article>
          <article class="audit-stat">
            <span>Recorrido máximo</span>
            <strong>${travel.longestM === null ? 'Sin datos' : `${number(travel.longestM)} m`}</strong>
            <small>Límite de referencia ${number(travel.limitM)} m</small>
          </article>
          <article class="audit-stat">
            <span>Salidas</span>
            <strong>${report.exits.count}</strong>
            <small>${number(report.exits.clearWidthM)} m de ancho útil</small>
          </article>
          <article class="audit-stat">
            <span>Tiempo estimado</span>
            <strong>${esc(duration(egress.estimatedTimeS))}</strong>
            <small>${number(occupancy.people, 0)} personas ${occupancy.source === 'declared' ? 'declaradas' : 'estimadas'}</small>
          </article>
        </section>

        <section class="audit-detail">
          <h3>Medición de evacuación</h3>
          <dl class="audit-facts">
            <div><dt>Ocupación</dt><dd>${number(occupancy.people, 0)} pers. <small>${occupancy.source === 'declared' ? 'declarada' : 'estimada por superficie'}</small></dd></div>
            <div><dt>Ancho requerido</dt><dd>${number(egress.requiredWidthM, 2)} m <small>disponible ${number(egress.availableWidthM, 2)} m</small></dd></div>
            <div><dt>Marcha</dt><dd>${esc(duration(egress.walkTimeS))}</dd></div>
            <div><dt>Cola en salidas</dt><dd>${esc(duration(egress.queueTimeS))}</dd></div>
            <div><dt>Superficie libre</dt><dd>${number(travel.freeAreaM2)} m²</dd></div>
            <div><dt>Sin salida alcanzable</dt><dd>${number(travel.unreachableAreaM2)} m²</dd></div>
            <div><dt>Rejilla de cálculo</dt><dd>${number(travel.cellM, 2)} m</dd></div>
            <div><dt>Rutas dibujadas</dt><dd>${(report.routes || []).length}</dd></div>
          </dl>
          ${(report.routes || []).length ? `<ul class="audit-routes">${report.routes.map((route, index) => `
            <li>
              <strong>${esc(route.label || `Ruta ${index + 1}`)}</strong>
              <span>${number(route.lengthM, 1)} m</span>
              <small>${route.endsAtExit ? 'Termina en salida' : `No llega a una salida${route.distanceToExitM !== null ? ` · a ${number(route.distanceToExitM, 1)} m` : ''}`}${route.wallCrossings ? ` · ${route.wallCrossings} cruce${route.wallCrossings === 1 ? '' : 's'} de muro` : ''}</small>
            </li>`).join('')}</ul>` : ''}
        </section>

        <section class="audit-findings">
          <h3>Hallazgos <em>${(report.findings || []).length}</em></h3>
          <div class="audit-chips">
            <button class="audit-chip ${filter === 'all' ? 'is-active' : ''}" type="button" aria-pressed="${filter === 'all'}" data-audit-filter="all">Todos <em>${(report.findings || []).length}</em></button>
            ${chips}
          </div>
          ${findings.length ? `<ul class="audit-finding-list">${rows}</ul>` : '<p class="audit-empty">Sin hallazgos en esta categoría.</p>'}
        </section>

        <p class="audit-note">Análisis sobre el plano guardado (v${number(this.app.boot?.version, 0)}). Los umbrales son referencias configurables: ajústalos a la normativa aplicable y valida el resultado con un profesional competente.</p>`;
    }
  }

  root.Audit = Audit;
})();
