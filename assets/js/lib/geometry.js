/* Normia Planos CAD · geometría compartida del editor (sin dependencias). */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const round = (value, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };
  const normalizeAngle = (degrees) => {
    const normalized = Number(degrees) % 360;
    return round(normalized < 0 ? normalized + 360 : normalized, 2);
  };
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const snapValue = (value, step, enabled = true) => (enabled && step > 0 ? Math.round(value / step) * step : value);
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  /** Distancia de un punto al segmento AB (para editar trazos con doble clic). */
  const distanceToSegment = (point, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    if (!length) return distance(point, a);
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1);
    return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
  };
  const rotatePoint = (point, center, degrees) => {
    const angle = rad(degrees);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  };
  const centerOf = (frame) => ({ x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 });
  const cornersOf = (frame) => {
    const points = [
      { x: frame.x, y: frame.y },
      { x: frame.x + frame.w, y: frame.y },
      { x: frame.x + frame.w, y: frame.y + frame.h },
      { x: frame.x, y: frame.y + frame.h },
    ];
    if (!frame.rotation) return points;
    const center = centerOf(frame);
    return points.map((point) => rotatePoint(point, center, frame.rotation));
  };

  const boundsOfPoints = (points) => {
    if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };

  const boundsOfElement = (element) => boundsOfPoints(cornersOf(element));
  const boundsOfElements = (elements) => {
    const corners = elements.flatMap((element) => cornersOf(element));
    return boundsOfPoints(corners);
  };

  const selectionFrame = (elements) => {
    if (elements.length === 1) {
      const element = elements[0];
      return { x: element.x, y: element.y, w: element.w, h: element.h, rotation: element.rotation || 0 };
    }
    const bounds = boundsOfElements(elements);
    return { x: bounds.x, y: bounds.y, w: Math.max(2, bounds.w), h: Math.max(2, bounds.h), rotation: 0 };
  };

  /** Convierte un punto del mundo al espacio local no rotado de un marco. */
  const toLocal = (point, frame) => {
    const center = centerOf(frame);
    const unrotated = rotatePoint(point, center, -(frame.rotation || 0));
    return { x: unrotated.x - frame.x, y: unrotated.y - frame.y };
  };

  const localToWorld = (local, frame) => {
    const center = centerOf(frame);
    const world = rotatePoint({ x: frame.x + local.x, y: frame.y + local.y }, center, frame.rotation || 0);
    return world;
  };

  const handleAxes = (handle) => ({
    west: handle.includes('w'),
    east: handle.includes('e'),
    north: handle.includes('n'),
    south: handle.includes('s'),
  });

  /**
   * Redimensionado de un marco desde un tirador. Mantiene el anclaje opuesto.
   * Devuelve un marco no rotado en su propio sistema (rotation conservada).
   */
  const resizeFrame = (frame, handle, pointer, options = {}) => {
    const min = options.minSize || 2;
    const keepRatio = Boolean(options.keepRatio);
    const rotation = frame.rotation || 0;
    const center = centerOf(frame);
    const local = rotatePoint(pointer, center, -rotation);
    const rel = { x: local.x - frame.x, y: local.y - frame.y };
    const axes = handleAxes(handle);
    let left = 0;
    let top = 0;
    let right = frame.w;
    let bottom = frame.h;
    if (axes.west) left = Math.min(rel.x, frame.w - min);
    if (axes.east) right = Math.max(rel.x, min);
    if (axes.north) top = Math.min(rel.y, frame.h - min);
    if (axes.south) bottom = Math.max(rel.y, min);
    if (!axes.west && !axes.east) {
      left = 0;
      right = frame.w;
    }
    if (!axes.north && !axes.south) {
      top = 0;
      bottom = frame.h;
    }
    let width = Math.max(min, right - left);
    let height = Math.max(min, bottom - top);
    if (keepRatio && frame.w > 0 && frame.h > 0 && (axes.west || axes.east) && (axes.north || axes.south)) {
      const ratio = frame.w / frame.h;
      if (width / height > ratio) {
        width = height * ratio;
      } else {
        height = width / ratio;
      }
      if (axes.west) left = right - width;
      if (axes.north) top = bottom - height;
    }
    const localCenter = { x: left + width / 2, y: top + height / 2 };
    const offset = rotatePoint(
      { x: localCenter.x - frame.w / 2, y: localCenter.y - frame.h / 2 },
      { x: 0, y: 0 },
      rotation,
    );
    const newCenter = { x: center.x + offset.x, y: center.y + offset.y };
    return {
      x: newCenter.x - width / 2,
      y: newCenter.y - height / 2,
      w: width,
      h: height,
      rotation,
    };
  };

  /** Escala un elemento hacia un nuevo marco dentro de una selección. */
  const scaleElement = (element, oldFrame, newFrame) => {
    if (oldFrame.w <= 0 || oldFrame.h <= 0) return element;
    const sx = newFrame.w / oldFrame.w;
    const sy = newFrame.h / oldFrame.h;
    if (oldFrame.rotation) {
      const newW = Math.max(2, element.w * sx);
      const newH = Math.max(2, element.h * sy);
      const center = { x: element.x + element.w / 2, y: element.y + element.h / 2 };
      const offset = rotatePoint(
        { x: center.x - oldFrame.x - oldFrame.w / 2, y: center.y - oldFrame.y - oldFrame.h / 2 },
        { x: 0, y: 0 },
        newFrame.rotation,
      );
      const newCenter = {
        x: newFrame.x + newFrame.w / 2 + offset.x * sx,
        y: newFrame.y + newFrame.h / 2 + offset.y * sy,
      };
      element.x = newCenter.x - newW / 2;
      element.y = newCenter.y - newH / 2;
      element.w = newW;
      element.h = newH;
    } else {
      element.x = newFrame.x + (element.x - oldFrame.x) * sx;
      element.y = newFrame.y + (element.y - oldFrame.y) * sy;
      element.w = Math.max(2, element.w * sx);
      element.h = Math.max(2, element.h * sy);
    }
    if (Array.isArray(element.points)) {
      element.points = element.points.map((point) => ({
        x: Math.max(0, Math.min(element.w, point.x * sx)),
        y: Math.max(0, Math.min(element.h, point.y * sy)),
      }));
    }
    // Las curvas acompañan al escalado: el punto de paso se mueve con la caja
    // para que el arco no se deforme al redimensionar el trazo.
    if (Array.isArray(element.curves)) {
      element.curves = element.curves.map((curve) => (curve && curve.kind === 'arc' && curve.through
        ? {
          kind: 'arc',
          through: {
            x: Math.max(0, Math.min(element.w, Number(curve.through.x) * sx)),
            y: Math.max(0, Math.min(element.h, Number(curve.through.y) * sy)),
          },
        }
        : null));
    }
    return element;
  };

  /* ------------------------------- arcos ------------------------------- */

  /**
   * Tolerancia del aplanado, en centímetros del plano. Un tramo curvo se
   * sustituye por cuerdas que no se separan de la curva real más que esto:
   * el auditor, la medición y la exportación comparten el mismo valor, así
   * que el muro curvo separa recintos igual en el lienzo y en el servidor.
   */
  const CURVE_TOLERANCE_CM = 0.5;

  const cmPerUnit = (unit) => (unit === 'm' ? 100 : unit === 'mm' ? 0.1 : 1);

  /** Tolerancia en unidades del lienzo para la unidad declarada del plano. */
  const flattenTolerance = (unit) => CURVE_TOLERANCE_CM / cmPerUnit(unit);

  const curveAt = (curves, index) => (
    Array.isArray(curves) && curves[index] && curves[index].kind === 'arc' && curves[index].through
      ? curves[index]
      : null
  );

  const hasCurves = (curves) => Array.isArray(curves) && curves.some((curve) => (
    curve && curve.kind === 'arc' && curve.through
      && Number.isFinite(Number(curve.through.x)) && Number.isFinite(Number(curve.through.y))
  ));

  /** Centro y radio del círculo que pasa por tres puntos (null si son colineales). */
  const circleThrough = (a, through, b) => {
    const ax = Number(a.x); const ay = Number(a.y);
    const tx = Number(through.x); const ty = Number(through.y);
    const bx = Number(b.x); const by = Number(b.y);
    if (![ax, ay, tx, ty, bx, by].every(Number.isFinite)) return null;
    const d = 2 * (ax * (ty - by) + tx * (by - ay) + bx * (ay - ty));
    if (Math.abs(d) < 1e-7) return null;
    const a2 = ax * ax + ay * ay;
    const t2 = tx * tx + ty * ty;
    const b2 = bx * bx + by * by;
    const cx = (a2 * (ty - by) + t2 * (by - ay) + b2 * (ay - ty)) / d;
    const cy = (a2 * (bx - tx) + t2 * (ax - bx) + b2 * (tx - ax)) / d;
    const r = Math.hypot(ax - cx, ay - cy);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r > 5e6) return null;
    return { cx, cy, r };
  };

  /**
   * Arco de circunferencia que va de `a` a `b` pasando por `through`.
   * Devuelve `null` cuando el tramo es recto (puntos casi alineados): así el
   * plano se guarda sin curvas y el SVG sale idéntico al de la versión 2.
   */
  const arcGeometry = (a, through, b) => {
    if (!a || !b || !through) return null;
    const chord = distance(a, b);
    if (!(chord > 1e-6)) return null;
    const circle = circleThrough(a, through, b);
    if (!circle) return null;
    const angleOf = (point) => Math.atan2(Number(point.y) - circle.cy, Number(point.x) - circle.cx);
    const tau = Math.PI * 2;
    const mod = (value) => ((value % tau) + tau) % tau;
    const start = angleOf(a);
    const end = angleOf(b);
    const middle = angleOf(through);
    const forwardSpan = mod(end - start);
    const toMiddle = mod(middle - start);
    if (forwardSpan < 1e-7) return null;
    const forward = toMiddle > 1e-7 && toMiddle < forwardSpan - 1e-7;
    const sweepAngle = forward ? forwardSpan : tau - forwardSpan;
    const sagitta = circle.r * (1 - Math.cos(sweepAngle / 2));
    if (!Number.isFinite(sagitta) || sagitta < 1e-4) return null;
    return {
      a: { x: Number(a.x), y: Number(a.y) },
      b: { x: Number(b.x), y: Number(b.y) },
      through: { x: Number(through.x), y: Number(through.y) },
      cx: circle.cx,
      cy: circle.cy,
      r: circle.r,
      start,
      sweepAngle,
      sagitta,
      chord,
      direction: forward ? 1 : -1,
      large: sweepAngle > Math.PI,
      length: circle.r * sweepAngle,
    };
  };

  /** Punto del arco en la fracción `t` (0 = inicio, 1 = final). */
  const arcPointAt = (arc, t) => {
    const value = clamp(Number(t), 0, 1);
    const angle = arc.start + arc.direction * arc.sweepAngle * value;
    return { x: arc.cx + arc.r * Math.cos(angle), y: arc.cy + arc.r * Math.sin(angle) };
  };

  /** Fracción `t` del arco más cercana a un punto (0 = inicio, 1 = final). */
  const arcProjectT = (arc, point) => {
    const angle = Math.atan2(Number(point.y) - arc.cy, Number(point.x) - arc.cx);
    const tau = Math.PI * 2;
    const mod = (value) => ((value % tau) + tau) % tau;
    const raw = arc.direction > 0 ? mod(angle - arc.start) : mod(arc.start - angle);
    return clamp(raw / arc.sweepAngle, 0, 1);
  };

  /** Tangente unitaria del arco en la fracción `t`. */
  const arcTangentAt = (arc, t) => {
    const value = clamp(Number(t), 0, 1);
    const angle = arc.start + arc.direction * arc.sweepAngle * value;
    const sign = arc.direction;
    const x = -Math.sin(angle) * sign;
    const y = Math.cos(angle) * sign;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  };

  /** Número de cuerdas necesarias para que la flecha de cada una quede bajo la tolerancia. */
  const arcSteps = (arc, tolerance) => {
    const tol = Math.max(1e-4, Number(tolerance) || CURVE_TOLERANCE_CM);
    const r = Math.max(arc.r, 1e-6);
    const maxAngle = 2 * Math.acos(clamp(1 - tol / r, -1, 1));
    const steps = Math.ceil(arc.sweepAngle / Math.max(1e-3, maxAngle));
    return Math.max(1, Math.min(720, steps));
  };

  /** Puntos absolutos del arco, sin repetir el punto de inicio. */
  const arcFlatten = (arc, tolerance) => {
    const steps = arcSteps(arc, tolerance);
    const points = [];
    for (let step = 1; step <= steps; step += 1) points.push(arcPointAt(arc, step / steps));
    return points;
  };

  /**
   * Polilínea equivalente a un trazo con curvas. Es el aplanado único que
   * comparten el lienzo, la medición, el auditor y la exportación.
   */
  const flattenPath = (points, curves, options = {}) => {
    if (!Array.isArray(points) || points.length === 0) return [];
    const tolerance = options.tolerance !== undefined ? Number(options.tolerance) : CURVE_TOLERANCE_CM;
    const result = [{ x: Number(points[0].x) || 0, y: Number(points[0].y) || 0 }];
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const curve = curveAt(curves, index);
      const arc = curve ? arcGeometry(a, curve.through, b) : null;
      if (!arc) {
        result.push({ x: Number(b.x) || 0, y: Number(b.y) || 0 });
        continue;
      }
      result.push(...arcFlatten(arc, tolerance));
    }
    return result;
  };

  /** Longitud exacta del trazo (cuerdas rectas + longitud de arco). */
  const pathLength = (points, curves) => {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const curve = curveAt(curves, index);
      const arc = curve ? arcGeometry(a, curve.through, b) : null;
      total += arc ? arc.length : distance(a, b);
    }
    return total;
  };

  /** Punto del trazo a una distancia dada desde su inicio (puertas por longitud de arco). */
  const pointAtPathLength = (points, curves, meters) => {
    const target = Math.max(0, Number(meters) || 0);
    if (!Array.isArray(points) || points.length < 2) return null;
    let travelled = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const curve = curveAt(curves, index);
      const arc = curve ? arcGeometry(a, curve.through, b) : null;
      const span = arc ? arc.length : distance(a, b);
      if (span <= 0) continue;
      if (travelled + span >= target) {
        const t = clamp((target - travelled) / span, 0, 1);
        if (arc) return { ...arcPointAt(arc, t), segment: index, t };
        return {
          x: Number(a.x) + (Number(b.x) - Number(a.x)) * t,
          y: Number(a.y) + (Number(b.y) - Number(a.y)) * t,
          segment: index,
          t,
        };
      }
      travelled += span;
    }
    const last = points[points.length - 1];
    return { x: Number(last.x), y: Number(last.y), segment: points.length - 2, t: 1 };
  };

  /**
   * Punto del trazo más cercano a `point`, medido sobre la geometría real
   * (no sobre la caja). Devuelve también la distancia recorrida desde el
   * inicio: es lo que permite ubicar puertas y portones por longitud de arco.
   */
  const nearestOnPath = (points, curves, point, options = {}) => {
    if (!Array.isArray(points) || points.length < 2 || !point) return null;
    const tolerance = options.tolerance !== undefined ? Number(options.tolerance) : CURVE_TOLERANCE_CM;
    let best = null;
    let travelled = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const curve = curveAt(curves, index);
      const arc = curve ? arcGeometry(a, curve.through, b) : null;
      const samples = arc ? [arc.a, ...arcFlatten(arc, tolerance), arc.b] : [{ x: Number(a.x), y: Number(a.y) }, { x: Number(b.x), y: Number(b.y) }];
      const span = arc ? arc.length : distance(a, b);
      // La longitud recorrida se acumula con las cuerdas aplanadas (en el arco
      // sumar por índice de muestra se desviaba medio paso).
      let run = 0;
      for (let step = 1; step < samples.length; step += 1) {
        const p = samples[step - 1];
        const q = samples[step];
        const gap = distanceToSegment(point, p, q);
        if (!best || gap < best.distance) {
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const square = dx * dx + dy * dy;
          const t = square > 0 ? clamp(((point.x - p.x) * dx + (point.y - p.y) * dy) / square, 0, 1) : 0;
          const hitX = p.x + dx * t;
          const hitY = p.y + dy * t;
          best = {
            x: hitX,
            y: hitY,
            distance: gap,
            segment: index,
            length: travelled + Math.min(span, run + Math.hypot(hitX - p.x, hitY - p.y)),
          };
        }
        run += Math.hypot(q.x - p.x, q.y - p.y);
      }
      travelled += span;
    }
    return best;
  };

  /** Vector normal a la cuerda AB, unitario. */
  const chordNormal = (a, b) => {
    const chord = distance(a, b);
    if (!(chord > 1e-9)) return { x: 0, y: 1 };
    return { x: -(b.y - a.y) / chord, y: (b.x - a.x) / chord };
  };

  /** Punto de paso de un arco con flecha conocida, del lado indicado (1 o -1). */
  const throughFromSagitta = (a, b, sagitta, side = 1) => {
    const chord = distance(a, b);
    if (!(chord > 1e-9)) return null;
    const normal = chordNormal(a, b);
    const shift = Number(sagitta) || 0;
    return {
      x: (Number(a.x) + Number(b.x)) / 2 + normal.x * shift * side,
      y: (Number(a.y) + Number(b.y)) / 2 + normal.y * shift * side,
    };
  };

  /** Flecha de un arco de radio conocido: R − √(R² − (c/2)²). */
  const sagittaFromRadius = (chord, radius) => {
    const r = Math.max(Number(radius) || 0, Number(chord) / 2);
    return r - Math.sqrt(Math.max(0, r * r - (Number(chord) * Number(chord)) / 4));
  };

  /** Radio de un arco con flecha y cuerda conocidas: (c²/4 + s²) / 2s. */
  const radiusFromSagitta = (chord, sagitta) => {
    const s = Number(sagitta) || 0;
    if (s <= 1e-6) return Infinity;
    return ((Number(chord) * Number(chord)) / 4 + s * s) / (2 * s);
  };

  /** Lado actual de una curva respecto a su cuerda (1 o -1). */
  const curveSide = (a, b, through) => {
    const normal = chordNormal(a, b);
    return (Number(through.x) - (a.x + b.x) / 2) * normal.x + (Number(through.y) - (a.y + b.y) / 2) * normal.y >= 0 ? 1 : -1;
  };

  /** Medidas de un tramo curvo: cuerda, radio, flecha y longitud de arco. */
  const curveMetrics = (a, curve, b) => {
    const arc = curve ? arcGeometry(a, curve.through, b) : null;
    if (!arc) {
      const chord = distance(a, b);
      return { curved: false, chord, radius: Infinity, sagitta: 0, length: chord, through: null, side: 1 };
    }
    return {
      curved: true,
      chord: arc.chord,
      radius: arc.r,
      sagitta: arc.sagitta,
      length: arc.length,
      through: arc.through,
      side: curveSide(a, b, curve.through),
      arc,
    };
  };

  /** Atributo `d` de un trazo con curvas (M · L · A). `null` si no hay curvas. */
  const pathData = (points, curves, options = {}) => {
    if (!Array.isArray(points) || points.length < 2) return null;
    if (!hasCurves(curves)) return null;
    const decimals = options.decimals !== undefined ? options.decimals : 2;
    const n = (value) => String(round(value, decimals));
    let d = `M ${n(points[0].x)} ${n(points[0].y)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const curve = curveAt(curves, index);
      const arc = curve ? arcGeometry(a, curve.through, b) : null;
      if (!arc) {
        d += ` L ${n(b.x)} ${n(b.y)}`;
        continue;
      }
      d += ` A ${n(arc.r)} ${n(arc.r)} 0 ${arc.large ? 1 : 0} ${arc.direction > 0 ? 1 : 0} ${n(b.x)} ${n(b.y)}`;
    }
    return d;
  };

  const formatNumber = (value, decimals = 1) => {
    const rounded = Number(value);
    if (!Number.isFinite(rounded)) return '0';
    return rounded.toLocaleString('es-CO', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
  };

  const formatMeasurement = (value, unit) => `${formatNumber(value, 1)} ${unit || 'cm'}`;

  const intersects = (a, b, padding = 0) => !(a.x + a.w < b.x - padding || b.x + b.w < a.x - padding || a.y + a.h < b.y - padding || b.y + b.h < a.y - padding);

  const frameFromCenter = (center, w, h, rotation = 0) => ({ x: center.x - w / 2, y: center.y - h / 2, w, h, rotation });

  root.Geometry = {
    clamp,
    round,
    normalizeAngle,
    rad,
    snapValue,
    distance,
    distanceToSegment,
    rotatePoint,
    centerOf,
    cornersOf,
    boundsOfPoints,
    boundsOfElement,
    boundsOfElements,
    selectionFrame,
    CURVE_TOLERANCE_CM,
    cmPerUnit,
    flattenTolerance,
    hasCurves,
    curveAt,
    circleThrough,
    arcGeometry,
    arcPointAt,
    arcProjectT,
    arcTangentAt,
    arcFlatten,
    flattenPath,
    pathLength,
    pointAtPathLength,
    nearestOnPath,
    chordNormal,
    throughFromSagitta,
    sagittaFromRadius,
    radiusFromSagitta,
    curveSide,
    curveMetrics,
    pathData,
    toLocal,
    localToWorld,
    resizeFrame,
    scaleElement,
    formatNumber,
    formatMeasurement,
    intersects,
    frameFromCenter,
  };
})();
