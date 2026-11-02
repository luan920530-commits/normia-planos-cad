/* Normia Planos CAD · unidades y conversiones físicas (sin dependencias). */
(() => {
  'use strict';
  const root = (window.Normia = window.Normia || {});

  const SUPPORTED = ['mm', 'cm', 'm'];
  const DEFAULT_UNIT = 'cm';
  /*
   * Unidad en la que se guarda toda la geometría (NORMIA-006 §3). `canvas.unit`
   * deja de ser un factor y pasa a ser la unidad de trabajo: cómo se leen y
   * cómo se escriben las cifras. Para dibujar y medir, la unidad que importa es
   * esta; la del plano solo se usa para componer texto.
   */
  const GEOMETRY_UNIT = 'cm';
  const TOLERANCE_CM = 0.5;

  /*
   * Centímetros por unidad del lienzo. Es la tabla fuente: metros y «unidades
   * por metro» se derivan de aquí y nunca se escriben otra vez.
   *
   * En centímetros y no en metros a propósito: con `cm` como unidad dominante,
   * `cmPerUnit('cm')` devuelve el literal exacto `1` y `unitsPerMeter('cm')`
   * devuelve `100`, sin error de coma flotante. Es el mismo cálculo que hacía
   * el editor antes de la consolidación, así que ningún número se mueve.
   */
  const CM_PER_UNIT = { mm: 0.1, cm: 1, m: 100 };

  const isSupported = (unit) => typeof unit === 'string'
    && Object.prototype.hasOwnProperty.call(CM_PER_UNIT, unit);
  const normalize = (unit) => (isSupported(unit) ? unit : DEFAULT_UNIT);
  const cmPerUnit = (unit) => CM_PER_UNIT[normalize(unit)];
  const metersPerUnit = (unit) => cmPerUnit(unit) / 100;
  const unitsPerMeter = (unit) => 100 / cmPerUnit(unit);
  const toMeters = (value, unit) => Number(value) * metersPerUnit(unit);
  /*
   * Metros → unidades del lienzo. Multiplica por 100 y divide por los
   * centímetros por unidad, igual que `Units::fromMeters()` en PHP, y no divide
   * por los metros por unidad: las dos formas son iguales en matemáticas pero
   * difieren en el último bit, y el plano se dibuja con las dos. Así PHP y JS
   * devuelven exactamente el mismo número para cualquier entrada.
   */
  const fromMeters = (meters, unit) => Number(meters) * 100 / cmPerUnit(unit);
  const toCm = (value, unit) => Number(value) * cmPerUnit(unit);
  const fromCm = (cm, unit) => Number(cm) / cmPerUnit(unit);

  /** Superficie en unidades del lienzo → metros cuadrados (áreas de la etapa 2). */
  const squareMeters = (areaUnits, unit) => {
    const factor = metersPerUnit(unit);
    return Number(areaUnits) * factor * factor;
  };

  /** Tolerancia de aplanado de arcos, en unidades del lienzo. */
  const tolerance = (unit) => TOLERANCE_CM / cmPerUnit(unit);

  /**
   * Denominador de una escala de impresión `1:N`. `null` si no es válida.
   * No se usa todavía: la etapa 1 lo aplicará al tamaño físico del SVG. No
   * debe usarse para medir longitudes del plano.
   */
  const scaleDenominator = (scale) => {
    const match = /^1:([1-9][0-9]{0,4})$/.exec(String(scale ?? ''));
    return match ? Number(match[1]) : null;
  };

  root.Units = {
    SUPPORTED,
    DEFAULT_UNIT,
    GEOMETRY_UNIT,
    TOLERANCE_CM,
    isSupported,
    normalize,
    cmPerUnit,
    metersPerUnit,
    unitsPerMeter,
    toMeters,
    fromMeters,
    toCm,
    fromCm,
    squareMeters,
    tolerance,
    scaleDenominator,
  };
})();
