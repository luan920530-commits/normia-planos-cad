/*
 * Ayudas de dibujo para los catálogos sectoriales.
 *
 * Todos los objetos comparten el mismo contrato visual del catálogo CAD:
 * lienzo 100 × 100, trazo 2, remates redondeados, relleno duotono con
 * currentColor y ni una sola referencia externa.
 */

export const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" '
  + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

/** Envuelve un cuerpo en el <svg> del catálogo. */
export const svg = (body) => `${HEAD}${body}</svg>`;

/** rectángulo con relleno duotono (el estándar del catálogo) */
export const R = (x, y, w, h, rad = 2, op = 0.09) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" `
  + `rx="${rad}" fill="currentColor" fill-opacity="${op}"/>`;

/** rectángulo solo con contorno */
export const r = (x, y, w, h, rad = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}"/>`;

/** rectángulo relleno sin contorno, para detalles */
export const solid = (x, y, w, h, rad = 1, op = 0.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" `
  + `rx="${rad}" fill="currentColor" fill-opacity="${op}" stroke="none"/>`;

/** círculo: `op` null = solo contorno */
export const C = (cx, cy, rr, op = null, sw = null) => `<circle cx="${cx}" cy="${cy}" r="${rr}"`
  + `${op === null ? '' : ` fill="currentColor" fill-opacity="${op}"`}`
  + `${sw === null ? '' : ` stroke-width="${sw}"`}/>`;

/** línea recta */
export const L = (x1, y1, x2, y2, extra = '') => `<path d="M${x1} ${y1}L${x2} ${y2}"${extra}/>`;

/** trazo libre */
export const P = (d, extra = '') => `<path d="${d}"${extra}/>`;

/** elipse */
export const E = (cx, cy, rx, ry, op = null) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`
  + `${op === null ? '' : ` fill="currentColor" fill-opacity="${op}"`}/>`;

/** grupo de líneas paralelas (entrepaños, listones, lamas…) */
export const hatch = (x1, y1, x2, y2, count, extra = ' opacity=".5"') => {
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    if (x1 === x2) parts.push(L(x1, y1 + (y2 - y1) * t, x2, y1 + (y2 - y1) * t, extra));
    else parts.push(L(x1 + (x2 - x1) * t, y1, x1 + (x2 - x1) * t, y2, extra));
  }
  return parts.join('');
};

/** contorno discontinuo para zonas (área de espera, carril, recinto) */
export const zone = (x, y, w, h, rad = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" `
  + 'fill="currentColor" fill-opacity=".04" stroke-dasharray="5 4"/>';

/** personal visto en planta (cabeza + hombros) */
export const person = (cx, cy, rr = 5) => C(cx, cy, rr) + P(`M${cx - rr - 5} ${cy + rr + 9}`
  + `a${rr + 5} ${rr + 5} 0 0 1 ${(rr + 5) * 2} 0`, ' opacity=".55"');

/** aviso de alcance que se repite en todas las descripciones */
export const NOTICE = 'Representación CAD esquemática; verifica dimensiones y escala en sitio.';
export const SIGN_NOTICE = 'Señal de orientación propia de Normia: no es una señal oficial ni certifica cumplimiento normativo.';
