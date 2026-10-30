/*
 * Señalización de tránsito y demarcación vial del catálogo propio de Normia.
 *
 * Formas y colores de referencia (reglamentación, prevención e información),
 * dibujadas a mano para este proyecto. No son láminas oficiales ni reproducen
 * manuales de señalización: son pictogramas esquemáticos para el plano.
 */
const ROJO = '#c1121f';
const AMBAR = '#f9a800';
const AZUL = '#005387';
const NEGRO = '#1f2937';
const VERDE = '#237f52';
const BLANCO = '#ffffff';
const FUENTE = 'Helvetica, Arial, sans-serif';

const open = (extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${extra}>`;

/** círculo blanco con aro de color (reglamentación) */
const aro = (color = ROJO, ancho = 9) => `<circle cx="50" cy="50" r="44" fill="${BLANCO}" stroke="${color}" stroke-width="${ancho}"/>`;
/** barra diagonal de prohibición */
const barra = (color = ROJO) => `<path d="M24 76 76 24" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`;
/** triángulo de prevención */
const triangulo = () => `<path d="M50 11 92 85H8Z" fill="${AMBAR}" stroke="${NEGRO}" stroke-width="6" stroke-linejoin="round"/>`;
/** placa rectangular de información */
const placa = (color = AZUL) => `<rect x="6" y="20" width="88" height="60" rx="4" fill="${color}"/>`;
/** texto centrado sobre la placa */
const texto = (t, y, size, color = NEGRO, weight = 700) => `<text x="50" y="${y}" text-anchor="middle" `
  + `font-family="${FUENTE}" font-size="${size}" font-weight="${weight}" fill="${color}">${t}</text>`;
/** octágono del Pare */
const octagono = () => '<path d="M31 6h38l25 25v38L69 94H31L6 69V31Z" fill="' + ROJO
  + `" stroke="${BLANCO}" stroke-width="6" stroke-linejoin="round"/>`;

const svg = (body) => `${open()}${body}</svg>`;

/** pictogramas reutilizables, trazo oscuro sobre placa clara */
const picto = (d, color = NEGRO, w = 7) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" `
  + 'stroke-linecap="round" stroke-linejoin="round"/>';

export const TRAFICO = {
  traffic: {
    label: 'Señalización de tránsito',
    short: 'Tránsito',
    color: '#b45309',
    description: 'Señales viales y demarcación para accesos, parqueaderos, vías internas '
      + 'y puntos críticos del plano. Pictogramas esquemáticos propios: no reproducen '
      + 'manuales oficiales ni certifican cumplimiento normativo.',
    signs: [
      ['SVC_TRF_STOP', 'Pare', 'Octágono rojo de detención obligatoria. Sitúa el control de acceso o la salida a una vía principal.',
        octagono() + texto('PARE', 60, 25, BLANCO)],
      ['SVC_TRF_YIELD', 'Ceda el paso', 'Triángulo invertido de prioridad. Úsalo en incorporaciones y salidas de parqueadero.',
        '<path d="M50 89 92 15H8Z" fill="' + BLANCO + `" stroke="${ROJO}" stroke-width="9" stroke-linejoin="round"/>`],
      ['SVC_TRF_SPEED30', 'Velocidad máxima 30', 'Círculo de reglamentación con la velocidad máxima permitida en la vía interna.',
        aro() + texto('30', 65, 40)],
      ['SVC_TRF_SPEED50', 'Velocidad máxima 50', 'Círculo de reglamentación para vías de circulación rápida del predio.',
        aro() + texto('50', 65, 40)],
      ['SVC_TRF_NO_ENTRY', 'Prohibido el paso', 'Círculo rojo con banda blanca: entrada restringida o sentido contrario.',
        `<circle cx="50" cy="50" r="44" fill="${ROJO}"/>` + `<rect x="24" y="43" width="52" height="14" rx="3" fill="${BLANCO}"/>`],
      ['SVC_TRF_ONE_WAY', 'Sentido único', 'Flecha direccional para vías de un solo sentido.',
        `<rect x="8" y="26" width="84" height="48" rx="6" fill="${AZUL}"/>`
        + picto('M22 50h44M54 38l14 12-14 12', BLANCO, 8)],
      ['SVC_TRF_NO_PARK', 'Prohibido parquear', 'Círculo azul con banda roja: no se permite estacionar en ese tramo.',
        `<circle cx="50" cy="50" r="44" fill="${AZUL}"/>` + barra() + texto('P', 64, 34, BLANCO)],
      ['SVC_TRF_PARKING', 'Parqueadero', 'Placa informativa de zona de estacionamiento.',
        placa() + texto('P', 66, 44, BLANCO)],
      ['SVC_TRF_DISABLED', 'Parqueadero accesible', 'Plaza reservada para vehículos de personas con movilidad reducida.',
        placa() + `<circle cx="42" cy="32" r="5" fill="${BLANCO}"/>`
        + picto('M42 40v14h14M42 54l-4 12M56 54l6 12M36 66h24', BLANCO, 5)],
      ['SVC_TRF_NO_LEFT', 'Prohibido girar a la izquierda', 'Reglamentación de giro: la maniobra a la izquierda no está permitida.',
        aro() + picto('M62 68V44a12 12 0 0 0-12-12H34M40 24l-8 8 8 8', NEGRO, 7) + barra()],
      ['SVC_TRF_NO_RIGHT', 'Prohibido girar a la derecha', 'Reglamentación de giro: la maniobra a la derecha no está permitida.',
        aro() + picto('M38 68V44a12 12 0 0 1 12-12h16M60 24l8 8-8 8', NEGRO, 7) + barra()],
      ['SVC_TRF_NO_UTURN', 'Prohibido devolverse', 'Círculo de reglamentación: no se permite el retorno en U.',
        aro() + picto('M36 74V50a14 14 0 0 1 28 0v24M56 66l8 8 8-8', NEGRO, 7) + barra()],
      ['SVC_TRF_NO_OVERTAKE', 'Prohibido adelantar', 'Reglamentación que impide el sobrepaso entre vehículos.',
        aro() + `<rect x="30" y="42" width="20" height="30" rx="4" fill="${NEGRO}"/>`
        + `<rect x="52" y="30" width="18" height="26" rx="4" fill="${NEGRO}" fill-opacity=".55"/>` + barra()],
      ['SVC_TRF_NO_PEDESTRIAN', 'Prohibido el paso de peatones', 'Círculo de reglamentación: los peatones no deben cruzar por ese punto.',
        aro() + `<circle cx="52" cy="30" r="6" fill="${NEGRO}"/>`
        + picto('M52 38l-6 16 8 8-4 12M46 54l-10 6M54 46l10 6', NEGRO, 6) + barra()],
      ['SVC_TRF_NO_TRUCKS', 'Prohibido el paso de camiones', 'Restricción de circulación para vehículos de carga pesada.',
        aro() + `<rect x="24" y="40" width="30" height="24" rx="3" fill="${NEGRO}"/>`
        + `<path d="M54 48h12l8 8v8H54Z" fill="${NEGRO}" fill-opacity=".6"/>`
        + `<circle cx="34" cy="68" r="4" fill="${NEGRO}"/><circle cx="64" cy="68" r="4" fill="${NEGRO}"/>` + barra()],
      ['SVC_TRF_NO_HORN', 'Prohibido pitar', 'Restricción de ruido: no se permite el uso de la bocina.',
        aro() + picto('M30 44h12l14-10v32L42 56H30ZM64 40a16 16 0 0 1 0 20', NEGRO, 6) + barra()],
      ['SVC_TRF_ROUNDABOUT', 'Glorieta', 'Placa de glorieta: circulación giratoria en la intersección.',
        `<circle cx="50" cy="50" r="44" fill="${AZUL}"/>`
        + `<circle cx="50" cy="50" r="12" fill="${BLANCO}"/>`
        + picto('M50 26a24 24 0 1 1-17 7M41 22h10v10', BLANCO, 7)],
      ['SVC_TRF_MANDATORY_LEFT', 'Giro obligatorio a la izquierda', 'Obligación de girar a la izquierda en el próximo cruce.',
        `<circle cx="50" cy="50" r="44" fill="${AZUL}"/>`
        + picto('M64 74V50a12 12 0 0 0-12-12H36M44 30l-10 8 10 8', BLANCO, 8)],
      ['SVC_TRF_MANDATORY_RIGHT', 'Giro obligatorio a la derecha', 'Obligación de girar a la derecha en el próximo cruce.',
        `<circle cx="50" cy="50" r="44" fill="${AZUL}"/>`
        + picto('M36 74V50a12 12 0 0 1 12-12h16M56 30l10 8-10 8', BLANCO, 8)],
      ['SVC_TRF_STRAIGHT', 'Siga de frente', 'Obligación de continuar en línea recta; no se permite girar.',
        `<circle cx="50" cy="50" r="44" fill="${AZUL}"/>`
        + picto('M50 76V28M36 42l14-14 14 14', BLANCO, 8)],
      ['SVC_TRF_PEDESTRIAN', 'Cruce de peatones', 'Triángulo de prevención: paso de peatones más adelante.',
        triangulo() + `<circle cx="52" cy="42" r="6" fill="${NEGRO}"/>`
        + picto('M52 50l-5 13 7 7-3 9M47 63l-9 5M53 57l9 5', NEGRO, 5)],
      ['SVC_TRF_SCHOOL', 'Zona escolar', 'Prevención de presencia de niños y cruces escolares.',
        triangulo() + `<circle cx="42" cy="46" r="6" fill="${NEGRO}"/>`
        + picto('M42 54l-4 12 5 6-2 7M38 66l-7 4M44 60l8 5', NEGRO, 5)
        + `<circle cx="64" cy="52" r="4.5" fill="${NEGRO}"/>` + picto('M64 58l-2 9 4 4-2 6M62 67l-6 3M66 63l6 4', NEGRO, 4)],
      ['SVC_TRF_CYCLIST', 'Paso de ciclistas', 'Prevención de circulación de bicicletas o ciclorruta cercana.',
        triangulo() + `<circle cx="38" cy="66" r="8" fill="none" stroke="${NEGRO}" stroke-width="4"/>`
        + `<circle cx="64" cy="66" r="8" fill="none" stroke="${NEGRO}" stroke-width="4"/>`
        + picto('M38 66l10-16h12l4 16M46 50h14M56 44l4 6', NEGRO, 4)],
      ['SVC_TRF_HUMP', 'Resalto o reductor', 'Prevención de resalto o banda reductora de velocidad.',
        triangulo() + picto('M22 72q12-18 28-18t28 18', NEGRO, 6)
        + picto('M22 78h56', NEGRO, 4)],
      ['SVC_TRF_SIGNAL', 'Semáforo', 'Prevención de semáforo o control luminoso en la vía.',
        triangulo() + `<rect x="40" y="36" width="20" height="40" rx="6" fill="${NEGRO}"/>`
        + `<circle cx="50" cy="46" r="4" fill="${AMBAR}"/><circle cx="50" cy="56" r="4" fill="${BLANCO}"/>`
        + `<circle cx="50" cy="66" r="4" fill="${BLANCO}"/>`],
      ['SVC_TRF_CONSTRUCTION', 'Obras en la vía', 'Prevención de obras, maquinaria o trabajadores en la calzada.',
        triangulo() + `<circle cx="50" cy="40" r="5" fill="${NEGRO}"/>`
        + picto('M50 46v14M50 50l-10 6M50 50l10 4M50 60l-8 12M50 60l8 12', NEGRO, 4.5)],
      ['SVC_TRF_SLIPPERY', 'Piso resbaloso', 'Prevención de calzada deslizante por agua o aceite.',
        triangulo() + `<rect x="34" y="48" width="28" height="18" rx="4" fill="${NEGRO}"/>`
        + `<circle cx="40" cy="70" r="3.5" fill="${NEGRO}"/><circle cx="58" cy="70" r="3.5" fill="${NEGRO}"/>`
        + picto('M24 76q6-6 12 0M62 76q6-6 12 0', NEGRO, 3.5)],
      ['SVC_TRF_CROSSWALK', 'Cebra peatonal', 'Demarcación de cruce peatonal: franjas sobre la calzada.',
        `<rect x="8" y="24" width="84" height="52" rx="4" fill="${NEGRO}" fill-opacity=".08"/>`
        + [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${14 + i * 13}" y="30" width="8" height="40" rx="2" fill="${NEGRO}"/>`).join('')],
      ['SVC_TRF_LANE_ARROW', 'Flecha de carril', 'Demarcación de sentido de circulación dentro del carril.',
        `<rect x="8" y="24" width="84" height="52" rx="4" fill="${NEGRO}" fill-opacity=".08"/>`
        + `<path d="M50 70V40M38 52l12-14 12 14" fill="none" stroke="${BLANCO}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="M50 70V40M38 52l12-14 12 14" fill="none" stroke="${NEGRO}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`],
      ['SVC_TRF_HUMP_MARK', 'Resalto demarcado', 'Demarcación de resalto con franjas de advertencia.',
        `<rect x="8" y="30" width="84" height="40" rx="4" fill="${NEGRO}" fill-opacity=".08"/>`
        + [0, 1, 2, 3, 4].map((i) => `<path d="M${18 + i * 16} 66 ${26 + i * 16} 34" stroke="${AMBAR}" stroke-width="9" stroke-linecap="round"/>`).join('')],
      ['SVC_TRF_LOADING', 'Zona de carga y descarga', 'Placa de zona reservada para carga y descarga de mercancía.',
        `<rect x="6" y="20" width="88" height="60" rx="4" fill="${AZUL}"/>`
        + `<rect x="18" y="44" width="26" height="20" rx="2" fill="${BLANCO}"/>`
        + picto('M48 54h20M62 46l8 8-8 8', BLANCO, 6)],
      ['SVC_TRF_BUS_STOP', 'Parada de transporte', 'Placa de parada de bus o transporte de personal.',
        `<rect x="6" y="20" width="88" height="60" rx="4" fill="${VERDE}"/>`
        + `<rect x="20" y="34" width="60" height="26" rx="5" fill="${BLANCO}"/>`
        + `<circle cx="32" cy="64" r="4" fill="${BLANCO}"/><circle cx="68" cy="64" r="4" fill="${BLANCO}"/>`
        + `<rect x="26" y="40" width="20" height="10" rx="2" fill="${VERDE}"/><rect x="52" y="40" width="22" height="10" rx="2" fill="${VERDE}"/>`],
      ['SVC_TRF_DEAD_END', 'Vía sin salida', 'Placa informativa de vía sin continuidad.',
        `<rect x="6" y="20" width="88" height="60" rx="4" fill="${AZUL}"/>`
        + picto('M22 50h56M22 36v28M78 36v28', BLANCO, 7)],
      ['SVC_TRF_SIDEWALK', 'Andén o acera', 'Demarcación del andén y la franja de circulación peatonal.',
        `<rect x="6" y="34" width="88" height="32" rx="3" fill="${NEGRO}" fill-opacity=".07"/>`
        + `<path d="M6 34h88M6 66h88" stroke="${NEGRO}" stroke-width="4" stroke-linecap="round"/>`
        + [0, 1, 2, 3, 4].map((i) => `<path d="M${20 + i * 15} 40v20" stroke="${NEGRO}" stroke-width="3" opacity=".45"/>`).join('')],
    ],
  },
};

/**
 * Alias de búsqueda en español para cada señal de tránsito. Se aplican en la
 * ficha de la señal para que se encuentre por su nombre coloquial.
 */
export const TRAFFIC_ALIASES = {
  SVC_TRF_STOP: ['pare', 'stop', 'detencion', 'alto'],
  SVC_TRF_YIELD: ['ceda el paso', 'ceda', 'yield', 'prioridad'],
  SVC_TRF_SPEED30: ['velocidad', 'maxima', 'limite', '30'],
  SVC_TRF_SPEED50: ['velocidad', 'maxima', 'limite', '50'],
  SVC_TRF_NO_ENTRY: ['prohibido el paso', 'no entry', 'entrada restringida', 'prohibido entrar'],
  SVC_TRF_ONE_WAY: ['sentido unico', 'una via', 'one way', 'direccion'],
  SVC_TRF_NO_PARK: ['prohibido parquear', 'no parquear', 'no estacionar', 'prohibido estacionar'],
  SVC_TRF_PARKING: ['parqueadero', 'parqueo', 'estacionamiento', 'parking'],
  SVC_TRF_DISABLED: ['discapacidad', 'pmr', 'minusvalido', 'movilidad reducida'],
  SVC_TRF_NO_LEFT: ['prohibido girar', 'no girar', 'izquierda'],
  SVC_TRF_NO_RIGHT: ['prohibido girar', 'no girar', 'derecha'],
  SVC_TRF_NO_UTURN: ['retorno', 'devolverse', 'u turn', 'prohibido retornar'],
  SVC_TRF_NO_OVERTAKE: ['adelantar', 'sobrepaso', 'rebasar', 'no adelantar'],
  SVC_TRF_NO_PEDESTRIAN: ['peaton', 'peatones', 'prohibido cruzar'],
  SVC_TRF_NO_TRUCKS: ['camion', 'carga pesada', 'vehiculo pesado'],
  SVC_TRF_NO_HORN: ['bocina', 'pitar', 'claxon', 'ruido'],
  SVC_TRF_ROUNDABOUT: ['glorieta', 'rotonda', 'roundabout', 'interseccion'],
  SVC_TRF_MANDATORY_LEFT: ['giro obligatorio', 'izquierda', 'obligacion'],
  SVC_TRF_MANDATORY_RIGHT: ['giro obligatorio', 'derecha', 'obligacion'],
  SVC_TRF_STRAIGHT: ['siga', 'de frente', 'recto', 'obligacion'],
  SVC_TRF_PEDESTRIAN: ['cruce de peatones', 'paso peatonal', 'peaton', 'zebra'],
  SVC_TRF_SCHOOL: ['zona escolar', 'colegio', 'escuela', 'ninos', 'estudiantes'],
  SVC_TRF_CYCLIST: ['bicicleta', 'ciclista', 'ciclorruta', 'bici'],
  SVC_TRF_HUMP: ['resalto', 'reductor', 'policia acostado', 'lomo de toro'],
  SVC_TRF_SIGNAL: ['semaforo', 'senal luminosa', 'trafico'],
  SVC_TRF_CONSTRUCTION: ['obras', 'construccion', 'trabajos en la via'],
  SVC_TRF_SLIPPERY: ['resbaloso', 'derrape', 'piso mojado', 'deslizante'],
  SVC_TRF_CROSSWALK: ['cebra', 'cruce peatonal', 'paso cebra', 'demarcacion'],
  SVC_TRF_LANE_ARROW: ['flecha', 'carril', 'demarcacion', 'sentido'],
  SVC_TRF_HUMP_MARK: ['resalto', 'demarcacion', 'reductor'],
  SVC_TRF_LOADING: ['carga', 'descarga', 'cargue', 'zona de cargue', 'muelle'],
  SVC_TRF_BUS_STOP: ['parada', 'bus', 'transporte', 'paradero', 'colectivo'],
  SVC_TRF_DEAD_END: ['sin salida', 'callejon', 'dead end', 'via cerrada'],
  SVC_TRF_SIDEWALK: ['anden', 'acera', 'peatonal', 'vereda'],
};
