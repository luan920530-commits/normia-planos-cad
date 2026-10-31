/*
 * Señales propias de emergencia y brigada.
 *
 * Los pictogramas son originales de Normia Planos CAD y se dibujan sobre el
 * mismo lienzo 100 × 100 que el resto del catálogo propio: marco de la familia
 * relleno con currentColor (lo pone el editor) y pictograma en blanco.
 * No reproducen señales oficiales ni certifican cumplimiento normativo.
 *
 * Se revisó el catálogo ISO 7010 antes de dibujarlas: punto de encuentro
 * (E007), DEA (E010), lavaojos (E011), ducha de seguridad (E012), botiquín
 * (E003), «no obstruir» (P023) y teléfono de emergencia (E004) ya existen y
 * no se duplican aquí.
 */
const MARCO = '<rect x="2" y="2" width="96" height="96" rx="12" fill="currentColor"/>';
const BLANCO = '#fff';
const trazo = (d, ancho = 6) => `<path d="${d}" fill="none" stroke="${BLANCO}" stroke-width="${ancho}" `
  + 'stroke-linecap="round" stroke-linejoin="round"/>';
const cuerpo = (d) => `<path d="${d}" fill="${BLANCO}"/>`;

export const BRIGADA = {
  brigade: {
    label: 'Emergencia y brigada',
    short: 'Brigada',
    color: '#b91c1c',
    description: 'Rutas, cortes y puestos de la brigada de emergencia. Pictogramas esquemáticos '
      + 'propios de Normia: no son señales oficiales ni certifican cumplimiento normativo.',
    signs: [
      ['SVC_EVAC_ROUTE', 'Ruta de evacuación',
        'Flecha de recorrido hacia la salida con figura en marcha. Orienta el camino de evacuación dentro del plano.',
        MARCO + cuerpo('M42 20a6 6 0 1 0 0 .1')
        + trazo('M42 30 40 48l-8 20M40 48l12 6 4 16M42 38l14 6', 6)
        + trazo('M58 74h24M74 66l8 8-8 8', 7)],
      ['SVC_EXIT_TEXT', 'Rótulo «SALIDA»',
        'Placa rectangular con la palabra SALIDA y flecha. Complementa el pictograma ISO en puertas y pasillos.',
        MARCO + `<rect x="10" y="30" width="80" height="40" rx="6" fill="none" stroke="${BLANCO}" stroke-width="4"/>`
        + `<text x="50" y="57" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" `
        + `font-size="15" font-weight="700" letter-spacing=".4" fill="${BLANCO}">SALIDA</text>`
        + trazo('M26 78h42M62 70l8 8-8 8', 5)],
      ['SVC_HYDRANT', 'Hidrante',
        'Hidrante contra incendios de dos bocas. Úsalo solo si el hidrante existe y está operativo.',
        MARCO + `<path d="M34 30h32v40a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6Z" fill="none" stroke="${BLANCO}" stroke-width="5"/>`
        + `<path d="M34 44h-8v10h8M66 44h8v10h-8" fill="none" stroke="${BLANCO}" stroke-width="5"/>`
        + trazo('M50 30v-6', 5) + `<path d="M40 24h20l-3-6H43Z" fill="${BLANCO}"/>`
        + trazo('M30 82h40', 5) + trazo('M42 60h16', 4)],
      ['SVC_COMMAND_POST', 'Puesto de mando',
        'Punto de coordinación de la brigada con mesa, radio y bandera.',
        MARCO + trazo('M50 22v34', 5)
        + cuerpo('M50 22h26l-6 8 6 8H50Z')
        + `<rect x="26" y="60" width="48" height="10" rx="3" fill="none" stroke="${BLANCO}" stroke-width="4"/>`
        + trazo('M34 70v10M66 70v10', 4)
        + `<circle cx="74" cy="58" r="4" fill="${BLANCO}"/>`],
      ['SVC_GAS_SHUTOFF', 'Llave de corte de gas',
        'Válvula de corte del suministro de gas. Señala el punto de cierre en una emergencia.',
        MARCO + trazo('M12 62h20M68 62h20', 7)
        + `<path d="M32 50h36v24H32Z" fill="none" stroke="${BLANCO}" stroke-width="5"/>`
        + trazo('M50 50V38', 5)
        + `<circle cx="50" cy="28" r="11" fill="none" stroke="${BLANCO}" stroke-width="5"/>`
        + trazo('M50 17v22M39 28h22', 3.5)],
      ['SVC_POWER_SHUTOFF', 'Corte general de energía',
        'Interruptor general del tablero. Marca dónde se corta la energía del área.',
        MARCO + `<rect x="22" y="20" width="56" height="60" rx="8" fill="none" stroke="${BLANCO}" stroke-width="5"/>`
        + cuerpo('M53 24l-8 11h5l-3 9 10-12h-5l4-8')
        + `<circle cx="50" cy="58" r="13" fill="none" stroke="${BLANCO}" stroke-width="4"/>`
        + trazo('M50 58 58 48', 5) + `<circle cx="50" cy="58" r="2.6" fill="${BLANCO}"/>`
        + trazo('M34 72h10M56 72h10', 4)],
    ],
  },
};

/** Alias de búsqueda de las señales de brigada. */
export const BRIGADE_ALIASES = {
  SVC_EVAC_ROUTE: ['ruta de evacuacion', 'ruta evacuación', 'evacuacion', 'evacuación', 'recorrido de salida', 'flecha evacuacion', 'camino de evacuacion'],
  SVC_EXIT_TEXT: ['salida', 'rotulo salida', 'rótulo salida', 'letrero salida', 'exit', 'salida de emergencia'],
  SVC_HYDRANT: ['hidrante', 'gabinete', 'boca de incendio', 'toma de agua', 'hydrant'],
  SVC_COMMAND_POST: ['puesto de mando', 'comando', 'brigada', 'coordinacion', 'coordinación', 'PMU', 'crisis'],
  SVC_GAS_SHUTOFF: ['corte de gas', 'llave de gas', 'valvula de gas', 'válvula de gas', 'cierre de gas', 'glp'],
  SVC_POWER_SHUTOFF: ['corte de energia', 'corte de energía', 'interruptor general', 'breaker principal', 'tablero general', 'apagado general'],
};
