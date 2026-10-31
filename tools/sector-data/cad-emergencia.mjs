/*
 * Familias CAD de protección, emergencias, instalaciones, accesibilidad y
 * seguridad perimetral, más una ampliación de la familia de salud.
 *
 * Los dibujos siguen el contrato del catálogo: lienzo 100 × 100, trazo 2,
 * remates redondeados, relleno duotono con currentColor y sin texto ni
 * recursos externos.
 */
import { R, r, C, L, P, E, hatch, zone, person, solid } from './draw.mjs';

/** tramo discontinuo (zonas, recorridos) */
const DASH = ' stroke-dasharray="3 3" opacity=".6"';
/** detalle atenuado */
const SOFT = ' opacity=".55"';

export const EMERGENCIA = {
  fire: {
    label: 'Protección contra incendios',
    short: 'Incendio',
    description: 'Detección, alarma y extinción: central, detectores, pulsadores, '
      + 'sirenas, extintores, motobomba y conexión de bomberos.',
    color: '#b71f2e',
    objects: [
      ['cad_fire_smoke_detector', 'Detector de humo',
        'Detector óptico de techo con cámara y ranuras de entrada de aire.',
        C(50, 42, 24) + C(50, 42, 9, 0.14)
        + L(50, 10, 50, 18, SOFT) + L(84, 42, 76, 42, SOFT) + L(16, 42, 24, 42, SOFT)
        + L(74, 18, 68, 24, SOFT) + L(26, 18, 32, 24, SOFT)
        + R(24, 60, 52, 14, 7, 0.07) + L(32, 74, 32, 82, SOFT) + L(68, 74, 68, 82, SOFT)],
      ['cad_fire_heat_detector', 'Detector de calor',
        'Detector térmico de techo con termistor en zigzag y base de montaje.',
        R(24, 26, 52, 52, 8, 0.07) + C(50, 52, 14)
        + P('M32 52h6l5-11 6 22 5-16 5 9h6')
        + L(50, 26, 50, 18) + L(50, 78, 50, 86, SOFT)],
      ['cad_fire_panel', 'Central de incendio',
        'Gabinete de control con pantalla, teclado y pilotos por zona.',
        R(16, 12, 68, 76, 5, 0.08) + r(24, 20, 52, 24, 2)
        + L(30, 27, 60, 27, SOFT) + L(30, 34, 48, 34, SOFT)
        + C(30, 56, 4, 0.45) + C(44, 56, 4, 0.2) + C(58, 56, 4, null)
        + hatch(26, 66, 54, 66, 3, ' opacity=".45"')
        + r(64, 64, 12, 8, 2) + L(68, 68, 72, 68, SOFT)],
      ['cad_fire_pull_station', 'Pulsador manual de alarma',
        'Estación manual de alarma en pared, con ventana de activación.',
        R(28, 20, 44, 46, 5, 0.12) + C(50, 43, 14)
        + P('M50 33v14l9 6') + L(20, 74, 80, 74, SOFT)
        + L(34, 66, 34, 74, SOFT) + L(66, 66, 66, 74, SOFT)],
      ['cad_fire_siren', 'Sirena con estroboscópica',
        'Sirena de techo con luz intermitente y ondas de aviso.',
        C(44, 46, 18, 0.12) + C(44, 46, 7)
        + P('M66 32a20 20 0 0 1 0 28') + P('M76 24a32 32 0 0 1 0 44')
        + R(18, 68, 52, 12, 5, 0.06) + L(26, 80, 26, 86, SOFT) + L(62, 80, 62, 86, SOFT)],
      ['cad_fire_ext_co2', 'Extintor de CO₂',
        'Extintor de dióxido de carbono con válvula, manómetro y boquilla.',
        R(36, 28, 26, 50, 12, 0.1) + r(42, 16, 14, 10, 3)
        + L(49, 16, 49, 10) + P('M64 36c10 2 10 12 0 14')
        + C(66, 58, 4) + L(32, 78, 68, 78)
        + solid(44, 44, 10, 18, 2, 0.18)],
      ['cad_fire_ext_wheeled', 'Extintor rodante PQS',
        'Extintor rodante de polvo químico seco con ruedas y manguera.',
        C(30, 76, 8) + C(70, 76, 8) + C(30, 76, 2, 0.5) + C(70, 76, 2, 0.5)
        + R(32, 16, 36, 54, 16, 0.1) + r(42, 8, 16, 9, 3)
        + P('M68 30c12 3 12 14 0 17') + L(44, 84, 56, 84)],
      ['cad_fire_pump', 'Motobomba contra incendio',
        'Bomba principal con motor, bancada y bridas de succión e impulsión.',
        R(10, 60, 80, 18, 4, 0.08) + C(32, 48, 13, 0.12)
        + R(54, 34, 30, 24, 4, 0.08) + L(54, 46, 45, 46)
        + L(32, 35, 32, 22) + L(24, 22, 40, 22) + L(84, 46, 92, 46)
        + L(18, 66, 18, 54, SOFT) + L(82, 66, 82, 54, SOFT)],
      ['cad_fire_siamese', 'Siamesa de bomberos',
        'Toma doble para mangueras de bomberos con tapones y cuerpo de conexión.',
        C(32, 38, 13) + C(68, 38, 13) + C(32, 38, 5, 0.2) + C(68, 38, 5, 0.2)
        + R(18, 48, 64, 30, 5, 0.08) + L(24, 60, 76, 60, SOFT)
        + L(18, 70, 82, 70, SOFT) + L(32, 51, 32, 60) + L(68, 51, 68, 60)],
    ],
  },

  emergency: {
    label: 'Atención de emergencias',
    short: 'Emergencias',
    description: 'Desfibrilador, teléfono, lavaojos, ducha, camilla y punto de reunión '
      + 'para primeros auxilios y respuesta inicial.',
    color: '#c2410c',
    objects: [
      ['cad_emg_aed', 'Desfibrilador externo automático (DEA)',
        'Maletín de desfibrilador con pantalla y símbolo de descarga.',
        R(24, 16, 52, 66, 8, 0.1) + r(30, 22, 40, 16, 3)
        + P('M53 46l-7 12h8l-4 12 11-15h-8l4-9')
        + L(34, 74, 66, 74, SOFT) + L(44, 82, 44, 88, SOFT) + L(56, 82, 56, 88, SOFT)],
      ['cad_emg_phone', 'Teléfono de emergencia',
        'Teléfono de pared con auricular, teclado y cordón.',
        R(28, 14, 44, 56, 8, 0.08) + r(34, 20, 32, 12, 4)
        + C(40, 42, 3, 0.3) + C(50, 42, 3, 0.3) + C(60, 42, 3, 0.3)
        + C(40, 52, 3, 0.3) + C(50, 52, 3, 0.3) + C(60, 52, 3, 0.3)
        + C(40, 62, 3, 0.3) + C(50, 62, 3, 0.3) + C(60, 62, 3, 0.3)
        + P('M70 30c12 6 6 20 12 26') + L(20, 78, 20, 88, SOFT)],
      ['cad_emg_eyewash', 'Lavaojos de emergencia',
        'Estación lavaojos de pared con dos boquillas y taza de recogida.',
        L(20, 16, 80, 16) + L(34, 16, 34, 40) + L(66, 16, 66, 40)
        + C(34, 45, 5, 0.2) + C(66, 45, 5, 0.2)
        + P('M31 52c-1 5 2 6 1 9M37 52c1 5-2 6-1 9', SOFT)
        + P('M63 52c-1 5 2 6 1 9M69 52c1 5-2 6-1 9', SOFT)
        + P('M24 66a26 14 0 0 0 52 0Z', ' fill="currentColor" fill-opacity=".08"')
        + L(50, 80, 50, 90, SOFT) + L(38, 90, 62, 90, SOFT)],
      ['cad_emg_shower', 'Ducha de emergencia',
        'Ducha de seguridad con cabezal, válvula de pie y bandeja.',
        P('M30 10v62') + P('M30 10h26') + C(60, 17, 9, 0.12)
        + P('M54 27v6M60 29v8M66 27v6', SOFT)
        + E(44, 74, 22, 8, 0.06) + P('M22 74h44')
        + C(44, 60, 4, 0.35) + L(44, 64, 44, 70, SOFT)
        + P('M30 76a9 9 0 0 0 18 0') + L(18, 88, 52, 88, SOFT)],
      ['cad_emg_stretcher', 'Camilla rígida',
        'Camilla de traslado con barandillas, correas y asas.',
        R(18, 32, 64, 36, 10, 0.07) + solid(26, 32, 48, 7, 3, 0.14)
        + L(30, 50, 70, 50, SOFT) + L(30, 58, 70, 58, SOFT)
        + P('M26 50h18M26 58h18', ' opacity=".5"')
        + C(26, 74, 5) + C(74, 74, 5) + L(26, 68, 26, 69) + L(74, 68, 74, 69)
        + P('M14 44h4a4 4 0 0 1 0 8h-4') + P('M82 40h4a4 4 0 0 1 0 8h-4')],
      ['cad_emg_muster', 'Punto de reunión',
        'Zona de reunión delimitada con mástil, bandera y personas.',
        zone(10, 16, 80, 70, 8) + L(50, 22, 50, 44) + P('M50 22h18l-5 7 5 7H50Z', ' fill="currentColor" fill-opacity=".14"')
        + person(34, 58) + person(64, 62) + L(20, 82, 80, 82, SOFT)],
    ],
  },

  technic: {
    label: 'Instalaciones técnicas',
    short: 'Técnicas',
    description: 'Cuartos de máquinas y equipos de servicio: energía, respaldo, solar, '
      + 'recarga eléctrica, ascensor, residuos, frío, GLP y medidores.',
    color: '#475569',
    objects: [
      ['cad_tec_electrical_room', 'Cuarto eléctrico',
        'Recinto de tableros con puerta de acceso y símbolo de riesgo eléctrico.',
        r(12, 12, 76, 76, 4) + R(22, 22, 20, 40, 3, 0.1)
        + hatch(28, 28, 36, 28, 3, ' opacity=".45"') + P('M30 44l-6 12h7l-3 10 9-13h-7l3-9')
        + r(50, 22, 28, 18, 3) + r(50, 46, 28, 18, 3)
        + L(12, 66, 88, 66, SOFT) + L(64, 78, 76, 88, SOFT) + P('M64 88a12 12 0 0 0 12-10')],
      ['cad_tec_substation', 'Subestación',
        'Transformador de pedestal con aletas de refrigeración y bornes.',
        R(18, 26, 64, 52, 4, 0.08) + hatch(24, 32, 24, 72, 7, ' opacity=".4"')
        + C(52, 18, 5) + C(70, 18, 5) + L(52, 23, 52, 26) + L(70, 23, 70, 26)
        + L(18, 56, 82, 56, SOFT) + L(40, 78, 40, 88, SOFT) + L(60, 78, 60, 88, SOFT)],
      ['cad_tec_ups', 'UPS y banco de baterías',
        'Gabinete de respaldo con módulo de baterías y bornes de salida.',
        R(24, 12, 52, 76, 5, 0.08) + r(30, 18, 40, 18, 3)
        + L(34, 26, 44, 26, SOFT) + L(34, 31, 38, 31, SOFT)
        + R(30, 42, 40, 26, 3, 0.06) + L(30, 55, 70, 55, SOFT)
        + L(38, 48, 38, 52) + L(38, 48, 62, 48) + L(62, 48, 62, 52, SOFT)
        + L(32, 76, 68, 76, SOFT) + L(40, 82, 60, 82, SOFT)],
      ['cad_tec_ats', 'Tablero de transferencia',
        'Tablero con conmutación entre red y planta y dos acometidas.',
        R(16, 22, 68, 56, 4, 0.08) + r(24, 30, 24, 40, 3) + r(52, 30, 24, 40, 3)
        + P('M36 44l12 12') + C(36, 44, 3, 0.3) + C(48, 56, 3, 0.3)
        + L(64, 44, 76, 44) + C(64, 44, 3) + L(16, 66, 16, 78, SOFT) + L(84, 66, 84, 78, SOFT)],
      ['cad_tec_solar', 'Panel solar',
        'Arreglo fotovoltaico de tres por cuatro celdas con estructura.',
        r(10, 24, 80, 52, 3) + hatch(10, 24, 90, 24, 4, ' opacity=".45"')
        + L(10, 41, 90, 41, SOFT) + L(10, 59, 90, 59, SOFT)
        + L(37, 24, 37, 76, SOFT) + L(64, 24, 64, 76, SOFT)
        + L(24, 76, 24, 84, SOFT) + L(76, 76, 76, 84, SOFT)],
      ['cad_tec_inverter', 'Inversor',
        'Inversor con onda de salida, bornes de continua y alterna.',
        R(20, 26, 60, 48, 4, 0.08) + C(32, 40, 3, 0.4) + C(44, 40, 3, 0.4)
        + P('M28 58c6-12 12 12 18 0s12 12 18 0')
        + L(26, 74, 26, 84, SOFT) + L(74, 74, 74, 84, SOFT)],
      ['cad_tec_ev_charger', 'Punto de recarga de vehículo eléctrico',
        'Cargador de pared con cable y plaza de vehículo marcada.',
        R(18, 20, 18, 30, 5, 0.12) + r(23, 25, 8, 8, 2)
        + P('M33 34c14 2 14 10 8 14') + C(57, 50, 4)
        + P('M22 50v8', SOFT)
        + P('M36 74v-8h24l8 8h10a4 4 0 0 1 4 4v6H36Z', ' fill="currentColor" fill-opacity=".08"')
        + C(48, 84, 5) + C(78, 84, 5) + P('M76 62h10M80 58l4 4-4 4', SOFT)
        + L(14, 92, 92, 92, ' opacity=".35"')],
      ['cad_tec_elevator_room', 'Cuarto de máquinas de ascensor',
        'Sala de máquinas con polea de tracción, motor y cables.',
        r(12, 12, 76, 76, 4) + C(38, 44, 17) + C(38, 44, 4, 0.3)
        + L(21, 44, 55, 44, SOFT) + L(38, 27, 38, 61, SOFT)
        + R(58, 30, 20, 24, 3, 0.1) + P('M19 44c0-6 4-10 10-10')
        + L(26, 70, 26, 80, SOFT) + L(50, 70, 50, 80, SOFT)],
      ['cad_tec_waste_room', 'Cuarto de basuras',
        'Recinto de residuos con dos contenedores y punto de lavado.',
        r(12, 12, 76, 76, 4) + R(20, 40, 26, 40, 3, 0.09) + R(52, 40, 26, 40, 3, 0.09)
        + L(20, 40, 46, 40) + L(52, 40, 78, 40)
        + L(27, 34, 39, 34) + L(59, 34, 71, 34)
        + C(32, 26, 5) + L(32, 31, 32, 34, SOFT) + L(68, 26, 68, 34, SOFT)],
      ['cad_tec_cold_room', 'Cuarto frío',
        'Cámara refrigerada con puerta aislada, evaporador y copo de nieve.',
        r(12, 12, 76, 76, 4) + r(20, 20, 60, 60, 3)
        + L(50, 46, 50, 78) + P('M20 66a30 30 0 0 1 30-20')
        + P('M34 30v14M27 37h14M29 32l10 10M39 32 29 42')
        + L(70, 34, 74, 34, SOFT) + L(70, 40, 74, 40, SOFT)],
      ['cad_tec_glp_tank', 'Tanque de GLP',
        'Tanque horizontal de gas licuado con válvula, manómetro y defensa.',
        R(14, 34, 72, 32, 16, 0.09) + L(24, 34, 76, 34, SOFT)
        + L(50, 34, 50, 24) + C(50, 20, 5) + L(44, 18, 56, 18)
        + L(30, 66, 30, 76) + L(70, 66, 70, 76) + L(22, 76, 78, 76)
        + L(38, 42, 62, 42, SOFT) + L(38, 50, 62, 50, SOFT)],
      ['cad_tec_meter_room', 'Cuarto de contadores',
        'Recinto de medidores con seis equipos y acometidas.',
        r(12, 12, 76, 76, 5) + r(20, 20, 26, 22, 2) + r(52, 20, 26, 22, 2)
        + r(20, 46, 26, 22, 2) + r(52, 46, 26, 22, 2)
        + C(28, 28, 4) + C(60, 28, 4) + C(28, 54, 4) + C(60, 54, 4)
        + L(26, 36, 26, 46, SOFT) + L(58, 36, 58, 46, SOFT)
        + L(33, 72, 67, 72, SOFT) + L(33, 80, 67, 80, SOFT)],
    ],
  },

  access: {
    label: 'Accesibilidad y circulación',
    short: 'Accesibilidad',
    description: 'Refugio, franjas podotáctiles, vados, pasamanos, escaleras de evacuación, '
      + 'ascensor accesible y puertas antipánico.',
    color: '#0369a1',
    objects: [
      ['cad_acc_refuge', 'Área de refugio',
        'Zona de espera asistida delimitada, junto a la caja de escalera.',
        zone(10, 14, 80, 72, 8) + C(46, 34, 6)
        + P('M46 40v10M46 50l-8 10M46 50l8 10') + C(62, 58, 9)
        + L(53, 58, 71, 58, SOFT) + L(62, 49, 62, 67, SOFT)
        + L(20, 78, 80, 78, SOFT)],
      ['cad_acc_tactile', 'Banda podotáctil',
        'Franja de guía con relieve de puntos y dirección de recorrido.',
        R(8, 38, 84, 24, 3, 0.05)
        + Array.from({ length: 5 }, (_, row) => Array.from({ length: 9 }, (_, col) => C(15 + col * 9, 44 + row * 6, 1.7, 0.55)).join('')).join('')
        + P('M92 50h-6M88 46l4 4-4 4')],
      ['cad_acc_curb_ramp', 'Vado peatonal',
        'Rebaje de andén con rampa y franja de advertencia.',
        L(8, 78, 92, 78) + P('M8 78V46h20') + P('M28 46h14l34 32')
        + L(28, 46, 28, 78, SOFT)
        + P('M14 62h10M14 70h10', ' opacity=".4"')
        + P('M36 66l12 6', ' opacity=".35"') + P('M44 62l10 5', ' opacity=".35"')
        + solid(60, 74, 22, 4, 1, 0.35)
        + P('M50 16v18') + P('M44 27l6 7 6-7')
        + C(20, 54, 3, 0.3) + C(20, 60, 3, 0.3)
        + P('M56 40h20', SOFT)],
      ['cad_acc_handrail', 'Pasamanos',
        'Baranda continua con anclajes a muro y tubo doble.',
        L(8, 42, 92, 42) + L(8, 54, 92, 54)
        + L(22, 42, 22, 54) + L(50, 42, 50, 54) + L(78, 42, 78, 54)
        + C(22, 48, 3, 0.3) + C(50, 48, 3, 0.3) + C(78, 48, 3, 0.3)
        + L(8, 66, 92, 66, DASH)],
      ['cad_acc_evac_stair', 'Escalera de evacuación',
        'Escalera exterior de evacuación con descanso y sentido de bajada.',
        P('M14 84h22V68h22V52h22V36') + P('M14 92h22V76h22V60h22V44', SOFT)
        + hatch(18, 84, 18, 68, 4, ' opacity=".4"') + hatch(40, 68, 40, 52, 4, ' opacity=".4"')
        + P('M62 36h22v-10', SOFT) + R(12, 84, 26, 8, 3, 0.1)
        + P('M74 22v10') + P('M68 26l6 6 6-6')],
      ['cad_acc_accessible_lift', 'Ascensor accesible',
        'Cabina de ascensor con puertas correderas, botonera y símbolo accesible.',
        R(14, 8, 72, 84, 6, 0.03) + L(14, 40, 14, 92) + L(86, 40, 86, 92)
        + R(22, 14, 24, 62, 3, 0.09) + R(54, 14, 24, 62, 3, 0.09)
        + P('M34 22h8M62 22h8', SOFT)
        + C(50, 50, 4, 0.25)
        + C(44, 74, 9) + C(44, 74, 2, 0.3) + P('M44 65v9h8') + P('M52 74l5 7')
        + P('M50 34v-8M46 30l4-4 4 4', SOFT)],
      ['cad_acc_panic_door', 'Puerta con barra antipánico',
        'Puerta de emergencia con barra de empuje y sentido de apertura.',
        L(8, 78, 40, 78) + L(62, 78, 92, 78) + P('M40 78 40 22', ' stroke-width="3"')
        + P('M40 22a52 52 0 0 1 52 52', DASH)
        + P('M44 34v30', ' stroke-width="3"') + C(44, 40, 3, 0.4)
        + P('M72 56h16') + P('M82 50l6 6-6 6')],
      ['cad_acc_stair_edge', 'Borde de escalera contrastado',
        'Peldaños con franja de contraste en cada nariz y pasamanos.',
        P('M10 86h18V72h18V58h18V44h18V30h10')
        + solid(10, 83, 18, 3, 1, 0.5) + solid(28, 69, 18, 3, 1, 0.5)
        + solid(46, 55, 18, 3, 1, 0.5) + solid(64, 41, 18, 3, 1, 0.5)
        + solid(82, 27, 10, 3, 1, 0.5)
        + L(10, 26, 92, 26, SOFT) + P('M16 26v-8') + P('M86 26v-8')],
    ],
  },

  security: {
    label: 'Seguridad perimetral',
    short: 'Seguridad',
    description: 'Vigilancia y control de acceso: cámaras, sensores, torniquete, arco, '
      + 'cerramientos, drenajes, patio de maniobras y carga de montacargas.',
    color: '#334155',
    objects: [
      ['cad_sec_cctv', 'Cámara de vigilancia (CCTV)',
        'Cámara de techo con soporte y cono de cobertura.',
        R(28, 26, 44, 22, 6, 0.1) + C(50, 37, 7, 0.2) + L(50, 48, 50, 58)
        + L(40, 22, 60, 22) + P('M26 60h48', DASH)
        + P('M26 60 50 58 74 60')],
      ['cad_sec_motion', 'Sensor de movimiento',
        'Sensor de presencia con lente de infrarrojos y campo de detección.',
        R(26, 24, 48, 30, 10, 0.1) + C(50, 39, 10) + C(50, 39, 4, 0.3)
        + L(50, 54, 50, 60) + P('M30 64h40', DASH)
        + P('M30 64l20-2 20 2') + L(36, 72, 64, 72, SOFT)],
      ['cad_sec_turnstile', 'Torniquete de acceso',
        'Torniquete de tres brazos con base y control de paso.',
        C(50, 52, 34, 0.03) + P('M16 52a34 34 0 0 1 68 0', ' stroke-dasharray="4 4" opacity=".5"')
        + C(50, 52, 8, 0.2) + P('M50 44V16', ' stroke-width="3"')
        + P('M57 56 80 74', ' stroke-width="3"') + P('M43 56 20 74', ' stroke-width="3"')
        + C(50, 16, 2.5, 0.5) + C(80, 74, 2.5, 0.5) + C(20, 74, 2.5, 0.5)
        + P('M50 92V82') + P('M45 86l5-5 5 5', SOFT)],
      ['cad_sec_walkthrough', 'Arco detector de metales',
        'Pórtico de detección con dos columnas y paso peatonal.',
        R(22, 12, 18, 76, 5, 0.1) + R(60, 12, 18, 76, 5, 0.1) + R(22, 12, 56, 14, 6, 0.1)
        + C(31, 30, 3.5, 0.4) + C(69, 30, 3.5, 0.4)
        + P('M40 88h20', ' opacity=".45"') + P('M40 80h20', ' opacity=".45"')
        + P('M50 34v30') + C(50, 28, 4, 0.15) + P('M50 64l-7 10M50 64l7 10')
        + P('M24 88h-8M76 88h8', SOFT)],
      ['cad_sec_fence', 'Reja perimetral',
        'Cerramiento de reja con postes y línea de propiedad.',
        L(8, 30, 92, 30) + L(8, 70, 92, 70)
        + Array.from({ length: 9 }, (_, index) => L(12 + index * 9.5, 24, 12 + index * 9.5, 76, ' opacity=".55"')).join('')
        + C(12, 24, 3, 0.2) + C(88, 24, 3, 0.2)
        + P('M8 82h84', ' stroke-dasharray="6 5" opacity=".5"')
        + P('M20 76l4 6M60 76l4 6', ' opacity=".4"')],
      ['cad_sec_hoarding', 'Valla de obra',
        'Panel de cerramiento temporal con pies y franjas de señalización.',
        R(8, 34, 84, 26, 3, 0.08) + hatch(14, 34, 14, 60, 7, ' opacity=".4"')
        + L(8, 46, 92, 46, SOFT) + L(24, 60, 24, 72, SOFT) + L(76, 60, 76, 72, SOFT)
        + L(16, 72, 32, 72, SOFT) + L(68, 72, 84, 72, SOFT)],
      ['cad_sec_drain', 'Cárcamo o sumidero',
        'Rejilla de sumidero con marco y barras de desagüe.',
        R(14, 14, 72, 72, 4, 0.05) + r(22, 22, 56, 56, 2)
        + Array.from({ length: 6 }, (_, index) => L(28 + index * 9, 22, 28 + index * 9, 78, ' opacity=".5"')).join('')
        + Array.from({ length: 6 }, (_, index) => L(22, 28 + index * 9, 78, 28 + index * 9, ' opacity=".5"')).join('')
        + P('M10 10 20 20M90 10 80 20M10 90 20 80M90 90 80 80', ' opacity=".3"')],
      ['cad_sec_yard', 'Patio de maniobras',
        'Zona de giro de vehículos con radio de maniobra y tope.',
        zone(8, 12, 84, 76, 8) + P('M22 74a34 34 0 0 1 34-34', DASH)
        + P('M62 26h16v16') + R(30, 60, 40, 18, 3, 0.09)
        + C(38, 84, 5) + C(62, 84, 5) + L(16, 84, 22, 84, SOFT)],
      ['cad_sec_forklift_charger', 'Estación de carga de montacargas',
        'Punto de recarga con cargador de baterías, cable y zona de espera.',
        R(12, 12, 28, 44, 4, 0.1) + r(18, 18, 16, 10, 2)
        + L(18, 34, 34, 34, SOFT) + L(18, 40, 30, 40, SOFT)
        + P('M40 34c16 1 16 12 6 15') + C(48, 53, 4)
        + R(58, 40, 28, 30, 4, 0.08) + L(58, 52, 86, 52, SOFT) + L(58, 62, 86, 62, SOFT)
        + P('M64 40v-6M70 40v-6', SOFT)
        + zone(10, 74, 78, 16, 5) + P('M18 82h60', ' stroke-dasharray="6 5" opacity=".5"')],
    ],
  },
};

/** Ampliación de la familia de salud con gases y áreas de apoyo. */
export const SALUD = {
  hospital: {
    label: 'Salud y hospital',
    short: 'Salud',
    color: '#334155',
    objects: [],
    extra: [
      ['cad_hosp_oxygen', 'Toma de oxígeno',
        'Salida de pared de oxígeno medicinal con caudalímetro y humificador.',
        R(36, 26, 30, 46, 6, 0.09) + C(51, 40, 6) + C(51, 40, 2, 0.4)
        + r(44, 50, 14, 10, 2) + L(38, 26, 38, 16) + L(38, 16, 46, 16)
        + L(64, 26, 64, 16, SOFT) + P('M44 62c0 5 4 8 7 8s7-3 7-8', SOFT)],
      ['cad_hosp_medical_gas', 'Estación de gases medicinales',
        'Central de cilindros con manifold, regulador y línea de distribución.',
        C(26, 56, 12, 0.1) + C(26, 44, 12, 0.1) + L(26, 32, 26, 26)
        + C(52, 56, 12, 0.1) + C(52, 44, 12, 0.1) + L(52, 32, 52, 26)
        + L(26, 26, 52, 26) + L(39, 26, 39, 20) + L(76, 20, 76, 68)
        + C(76, 74, 5) + L(60, 20, 76, 20) + L(26, 68, 52, 68, SOFT)],
      ['cad_hosp_isolation', 'Área de aislamiento',
        'Habitación con cama, barrera de separación y señal de restricción.',
        r(10, 12, 80, 76, 4) + R(18, 24, 40, 22, 5, 0.09)
        + L(24, 30, 46, 30, SOFT) + P('M48 24 48 46', SOFT)
        + L(64, 20, 64, 80, ' stroke-dasharray="6 4" opacity=".5"')
        + C(74, 36, 6) + L(68, 46, 80, 32) + L(74, 50, 74, 62, SOFT)],
      ['cad_hosp_hydration', 'Estación de hidratación',
        'Dispensador de agua con vasos, bandeja y punto de lavado.',
        R(30, 18, 40, 54, 6, 0.09) + r(36, 24, 28, 14, 3)
        + C(42, 50, 4) + C(50, 56, 4) + C(58, 50, 4)
        + L(30, 72, 70, 72) + L(36, 72, 36, 82, SOFT) + L(64, 72, 64, 82, SOFT)
        + P('M50 38v-8')],
      ['cad_hosp_waiting', 'Sala de espera con sillas',
        'Banca de cuatro puestos con mesa auxiliar y zona de circulación.',
        R(10, 34, 62, 12, 3, 0.1) + L(10, 46, 10, 54, SOFT) + L(72, 46, 72, 54, SOFT)
        + L(25, 34, 25, 46, SOFT) + L(41, 34, 41, 46, SOFT) + L(57, 34, 57, 46, SOFT)
        + R(78, 40, 14, 14, 3, 0.09) + L(78, 60, 92, 60, SOFT)
        + P('M8 70h84', DASH)],
    ],
  },
};
