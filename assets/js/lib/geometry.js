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
    return element;
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
