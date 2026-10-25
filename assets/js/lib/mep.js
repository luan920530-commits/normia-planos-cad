/* Normia Planos CAD · redes hidrosanitarias, gas, incendio y eléctricas.
 *
 * Módulo de cálculo puro: no toca el DOM. Lo usan el editor, el panel de redes
 * y las pruebas. Los valores de referencia viven en
 * resources/mep-networks.json y son configurables; nunca se presentan como
 * certificación de cumplimiento normativo.
 */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});

  const EMPTY = {
    hydraulic: {},
    diameters: [],
    materials: {},
    slopes: {},
    electrical: {
      voltages: [110, 220],
      gauges: ['14', '12', '10', '8', '6', '4', '2'],
      colors: ['#2563eb'],
      ampacity: {},
      section: {},
      breakers: [15, 20, 30, 40, 50, 60, 70, 100],
      phases: [1, 3],
      defaultPhases: 1,
      resistivity: 0.0217,
      maxDropBranch: 3,
      maxDropTotal: 5,
      reserve: 1.25,
    },
  };

  const catalog = (catalogs) => {
    const mep = catalogs && catalogs.mep ? catalogs.mep : null;
    if (!mep || !mep.hydraulic) return EMPTY;
    return {
      hydraulic: mep.hydraulic || {},
      diameters: Array.isArray(mep.diameters) ? mep.diameters : [],
      materials: mep.materials || {},
      slopes: mep.slopes || {},
      electrical: Object.assign({}, EMPTY.electrical, mep.electrical || {}),
    };
  };

  const networkKeys = (catalogs) => Object.keys(catalog(catalogs).hydraulic);

  const network = (key, catalogs) => catalog(catalogs).hydraulic[key] || null;

  const isNetwork = (key, catalogs) => Boolean(network(key, catalogs));

  const isHydraulicType = (type) => type === 'pipe';
  const isElectricalType = (type) => type === 'conduit';

  /** Tipo de equipo del catálogo que pertenece a la familia eléctrica. */
  const isElectricalDevice = (element, catalogs) => {
    if (!element || !catalogs || !catalogs.cad) return false;
    const cad = catalogs.cad[element.type];
    if (!cad) return false;
    const category = catalogs.cadCategories?.[cad.category];
    return Boolean(category && /el[eé]ctric/i.test(String(category.label || '')));
  };

  /**
   * Factor de unidad del lienzo a metros. Una unidad del lienzo equivale a la
   * unidad declarada (igual que la cota del editor); la escala es una
   * referencia de impresión y no cambia las longitudes del plano.
   */
  const unitsToMeters = (unit) => {
    if (unit === 'm') return 1;
    if (unit === 'mm') return 0.001;
    return 0.01;
  };

  const pathLength = (points) => {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(Number(points[index].x) - Number(points[index - 1].x), Number(points[index].y) - Number(points[index - 1].y));
    }
    return total;
  };

  const elementPoints = (element) => (Array.isArray(element.points) && element.points.length >= 2
    ? element.points
    : [{ x: 0, y: 0 }, { x: Number(element.w) || 0, y: Number(element.h) || 0 }]);

  const elementLength = (element) => pathLength(elementPoints(element));

  const elementLengthMeters = (element, canvas) => elementLength(element) * unitsToMeters(canvas.unit, canvas.scale);

  /** Pendiente media del trazo en porcentaje (positiva = desciende hacia el final). */
  const slopeOf = (element) => {
    const points = elementPoints(element);
    const first = points[0];
    const last = points[points.length - 1];
    const run = Math.abs(Number(last.x) - Number(first.x));
    if (run < 0.5) return null;
    return { percent: ((Number(last.y) - Number(first.y)) / run) * 100, run };
  };

  const formatMeters = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0 m';
    const digits = number >= 100 ? 0 : 1;
    return `${number.toLocaleString('es-CO', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} m`;
  };

  const formatNumber = (value, digits = 1) => Number(value).toLocaleString('es-CO', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

  /** Rótulo corto para un tramo: AF Ø 1/2" · 12,5 m [· i=2 %]. */
  const pipeCaption = (element, catalogs, canvas) => {
    const entry = network(element.network, catalogs);
    if (!entry) return element.label || '';
    const parts = [`${entry.short} Ø ${element.diameter || entry.diameter || '—'}`];
    if (canvas) parts.push(formatMeters(elementLengthMeters(element, canvas)));
    if (entry.gravity && Number.isFinite(Number(element.slope))) parts.push(`i=${formatNumber(element.slope, 1)} %`);
    return parts.join(' · ');
  };

  const conduitCaption = (element) => {
    const circuit = element.circuit || 'C1';
    const gauge = element.gauge ? `${element.gauge} AWG` : 'calibre —';
    const voltage = element.voltage ? `${element.voltage} V` : '— V';
    const phases = Number(element.phases) === 3 ? '3F' : '';
    return [circuit, gauge, [voltage, phases].filter(Boolean).join(' ') + (phases ? '' : '')].filter(Boolean).join(' · ');
  };

  /* ------------------------------ eléctrico ------------------------------ */

  /** Factor √3 solo cuando el circuito es trifásico; 220 V monofásico es 1. */
  const phaseFactor = (phases) => (Number(phases) === 3 ? Math.sqrt(3) : 1);

  const currentFor = (va, voltage, phases = 1) => {
    const v = Number(voltage);
    const power = Number(va);
    if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(power) || power <= 0) return 0;
    return power / (v * phaseFactor(phases));
  };

  const breakerFor = (current, electrical) => {
    const series = Array.isArray(electrical?.breakers) ? electrical.breakers : EMPTY.electrical.breakers;
    const reserve = Number(electrical?.reserve) || 1.25;
    const target = Number(current) * reserve;
    const found = series.find((value) => value >= target);
    return found ?? series[series.length - 1];
  };

  const gaugeFor = (current, electrical) => {
    const gauges = Array.isArray(electrical?.gauges) ? electrical.gauges : EMPTY.electrical.gauges;
    const ampacity = electrical?.ampacity || {};
    return gauges.find((gauge) => Number(ampacity[gauge]) >= Number(current)) || gauges[gauges.length - 1];
  };

  const sectionOf = (gauge, electrical) => Number(electrical?.section?.[gauge]) || 0;

  /** Caída de tensión aproximada en % para un tramo de longitud dada. */
  const voltageDrop = (voltage, current, lengthM, gauge, electrical, phases = 1) => {
    const v = Number(voltage);
    const section = sectionOf(gauge, electrical);
    const rho = Number(electrical?.resistivity) || 0.0217;
    if (!v || !section || !Number.isFinite(Number(current)) || !Number.isFinite(Number(lengthM))) return 0;
    const factor = phaseFactor(phases) === 1 ? 2 : Math.sqrt(3);
    const delta = (factor * rho * Number(lengthM) * Number(current)) / section;
    return (delta / v) * 100;
  };

  /**
   * Resumen por circuito. Une los tramos (conduit) y los equipos eléctricos
   * (objetos CAD de la familia eléctrica) por su código de circuito.
   */
  const circuits = (elements, catalogs, canvas) => {
    const electrical = catalog(catalogs).electrical;
    const palette = Array.isArray(electrical.colors) && electrical.colors.length ? electrical.colors : EMPTY.electrical.colors;
    const map = new Map();
    const ensure = (code, voltage, phases) => {
      const key = String(code || '').trim() || 'Sin circuito';
      if (!map.has(key)) {
        map.set(key, {
          code: key,
          voltage: Number(voltage) || 0,
          phases: Number(phases) === 3 ? 3 : 1,
          conduits: [],
          devices: [],
          lengthM: 0,
          loadVA: 0,
          color: palette[map.size % palette.length],
        });
      }
      const entry = map.get(key);
      if (!entry.voltage && Number(voltage)) entry.voltage = Number(voltage);
      if (Number(phases) === 3) entry.phases = 3;
      return entry;
    };
    for (const element of elements || []) {
      if (element.type === 'conduit') {
        const entry = ensure(element.circuit, element.voltage, element.phases);
        entry.conduits.push(element);
        if (canvas) entry.lengthM += elementLengthMeters(element, canvas);
      } else if (isElectricalDevice(element, catalogs)) {
        const entry = ensure(element.circuit, 0, 1);
        entry.devices.push(element);
        entry.loadVA += Math.max(0, Number(element.load) || 0);
      }
    }
    const list = [];
    for (const entry of map.values()) {
      const voltage = entry.voltage || Number(electrical.voltages?.[0]) || 110;
      const current = currentFor(entry.loadVA, voltage, entry.phases);
      const breaker = entry.loadVA > 0 ? breakerFor(current, electrical) : 0;
      const gauge = entry.loadVA > 0 ? gaugeFor(breaker || current, electrical) : '';
      const drop = entry.loadVA > 0 ? voltageDrop(voltage, current, entry.lengthM, gauge, electrical, entry.phases) : 0;
      const warnings = [];
      if (!entry.devices.length) warnings.push('Sin equipos asignados: no hay carga que calcular.');
      if (entry.devices.length && !entry.loadVA) warnings.push('Los equipos no tienen carga (VA) declarada.');
      if (!entry.conduits.length) warnings.push('Sin tramos de tubería eléctrica dibujados.');
      if (entry.lengthM && drop > Number(electrical.maxDropBranch)) {
        warnings.push(`Caída de tensión estimada ${formatNumber(drop, 1)} % > ${formatNumber(electrical.maxDropBranch, 0)} %; revisa calibre o longitud.`);
      }
      list.push({
        code: entry.code,
        voltage,
        phases: entry.phases,
        color: entry.color,
        conduitCount: entry.conduits.length,
        deviceCount: entry.devices.length,
        lengthM: entry.lengthM,
        loadVA: entry.loadVA,
        current,
        breaker,
        gauge,
        drop,
        warnings,
      });
    }
    return list.sort((a, b) => a.code.localeCompare(b.code, 'es'));
  };

  /* ------------------------------ hidráulico ------------------------------ */

  const networkSummary = (elements, catalogs, canvas) => {
    const data = catalog(catalogs);
    const order = Object.keys(data.hydraulic);
    const map = new Map();
    for (const element of elements || []) {
      if (element.type !== 'pipe') continue;
      const key = element.network && data.hydraulic[element.network] ? element.network : order[0];
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: data.hydraulic[key].label,
          short: data.hydraulic[key].short,
          color: data.hydraulic[key].color,
          gravity: Boolean(data.hydraulic[key].gravity),
          count: 0,
          lengthM: 0,
          diameters: new Map(),
          materials: new Set(),
          minSlope: null,
          maxSlope: null,
          warnings: [],
        });
      }
      const entry = map.get(key);
      entry.count += 1;
      if (canvas) entry.lengthM += elementLengthMeters(element, canvas);
      if (element.diameter) entry.diameters.set(element.diameter, (entry.diameters.get(element.diameter) || 0) + (canvas ? elementLengthMeters(element, canvas) : 1));
      if (element.material) entry.materials.add(element.material);
      const slope = slopeOf(element);
      if (slope && data.hydraulic[key].gravity) {
        entry.minSlope = entry.minSlope === null ? slope.percent : Math.min(entry.minSlope, slope.percent);
        entry.maxSlope = entry.maxSlope === null ? slope.percent : Math.max(entry.maxSlope, slope.percent);
        const diameter = element.diameter || data.hydraulic[key].diameter;
        const minimum = Number(data.slopes?.[diameter]);
        if (Number.isFinite(minimum) && slope.percent + 0.001 < minimum) {
          entry.warnings.push(`Tramo ${element.label || element.id}: pendiente ${formatNumber(slope.percent, 1)} % menor que la referencia de ${formatNumber(minimum, 1)} % para Ø ${diameter}.`);
        }
        if (slope.percent < -0.001) {
          entry.warnings.push(`Tramo ${element.label || element.id}: pendiente negativa (asciende); revisa el sentido del desagüe.`);
        }
      }
    }
    return order.filter((key) => map.has(key)).map((key) => {
      const entry = map.get(key);
      return {
        ...entry,
        diameters: [...entry.diameters.entries()].map(([diameter, length]) => ({ diameter, lengthM: length })).sort((a, b) => Number.parseFloat(a.diameter) - Number.parseFloat(b.diameter)),
        materials: [...entry.materials],
      };
    });
  };

  /** Resumen completo que alimenta el panel de redes y la API. */
  const summary = (design, catalogs) => {
    const elements = design?.elements || [];
    const canvas = design?.canvas || { unit: 'cm', scale: '1:100' };
    const hydraulic = networkSummary(elements, catalogs, canvas);
    const electrical = circuits(elements, catalogs, canvas);
    const warnings = [];
    for (const entry of hydraulic) warnings.push(...entry.warnings);
    for (const entry of electrical) warnings.push(...entry.warnings);
    const pipes = elements.filter((element) => element.type === 'pipe').length;
    const conduits = elements.filter((element) => element.type === 'conduit').length;
    return {
      hydraulic,
      electrical,
      pipes,
      conduits,
      warnings,
      totalPipeLength: hydraulic.reduce((total, entry) => total + entry.lengthM, 0),
      totalConduitLength: electrical.reduce((total, entry) => total + entry.lengthM, 0),
      totalLoadVA: electrical.reduce((total, entry) => total + entry.loadVA, 0),
    };
  };

  root.Mep = {
    catalog,
    networkKeys,
    network,
    isNetwork,
    isHydraulicType,
    isElectricalType,
    isElectricalDevice,
    unitsToMeters,
    pathLength,
    elementLength,
    elementLengthMeters,
    slopeOf,
    formatMeters,
    formatNumber,
    pipeCaption,
    conduitCaption,
    phaseFactor,
    currentFor,
    breakerFor,
    gaugeFor,
    sectionOf,
    voltageDrop,
    circuits,
    networkSummary,
    summary,
    EMPTY,
  };
})();
