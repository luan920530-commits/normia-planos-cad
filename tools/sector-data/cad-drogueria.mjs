/*
 * Familias CAD: estación de servicio (EDS) y droguería.
 *
 * Los dibujos siguen el contrato del catálogo: lienzo 100 × 100, trazo 2,
 * remates redondeados, relleno duotono con currentColor y sin texto ni
 * recursos externos.
 */
import { R, r, C, L, P } from './draw.mjs';

/** tramo discontinuo (zonas, carriles) */
export const DASH = ' stroke-dasharray="3 3" opacity=".6"';
/** detalle atenuado */
export const SOFT = ' opacity=".55"';

export const DROGUERIA = {
drogueria: {
  label: 'Droguería y farmacia',
  short: 'Droguería',
  description: 'Mostradores, estanterías, cadena de frío y áreas de atención '
    + 'de una droguería o farmacia.',
  color: '#0f766e',
  objects: [
    ['cad_drg_counter', 'Mostrador de atención',
      'Mostrador con banda de despacho, caja y separador de clientes.',
      R(12, 40, 62, 22, 4, 0.1) + L(12, 51, 74, 51, SOFT)
      + R(78, 36, 12, 30, 3, 0.07) + P('M12 68h62', DASH)],
    ['cad_drg_shelf', 'Estantería de medicamentos',
      'Estantería de cuatro módulos con entrepaños marcados.',
      R(12, 18, 76, 64, 3, 0.05) + L(31, 18, 31, 82, SOFT) + L(50, 18, 50, 82, SOFT)
      + L(69, 18, 69, 82, SOFT)
      + L(12, 34, 88, 34, SOFT) + L(12, 50, 88, 50, SOFT) + L(12, 66, 88, 66, SOFT)],
    ['cad_drg_display', 'Vitrina de exhibición',
      'Vitrina acristalada con dos niveles de producto.',
      R(14, 24, 72, 52, 4, 0.08) + r(20, 30, 60, 18, 2) + r(20, 54, 60, 16, 2)
      + L(22, 39, 78, 39, SOFT) + L(22, 62, 78, 62, SOFT)],
    ['cad_drg_cold_chain', 'Nevera de cadena de frío',
      'Nevera con termómetro visible y puerta de cristal.',
      R(22, 16, 56, 68, 4, 0.09) + r(30, 24, 40, 30, 2) + L(30, 60, 70, 60, SOFT)
      + C(66, 30, 5) + L(66, 30, 66, 24) + L(66, 30, 70, 33)
      + L(30, 74, 70, 74, SOFT)],
    ['cad_drg_pos', 'Caja registradora',
      'Punto de pago con terminal, lector y cajón de dinero.',
      R(20, 42, 44, 20, 3, 0.1) + R(68, 30, 14, 12, 2, 0.12)
      + L(68, 42, 64, 46) + P('M16 70h60', DASH) + C(30, 34, 4, 0.12)],
    ['cad_drg_waiting', 'Sillas de espera',
      'Banca de tres puestos para la sala de espera.',
      R(14, 38, 72, 12, 3, 0.1) + L(14, 50, 14, 60, SOFT) + L(86, 50, 86, 60, SOFT)
      + L(36, 38, 36, 50, SOFT) + L(58, 38, 58, 50, SOFT) + L(80, 38, 80, 50, SOFT)],
    ['cad_drg_injection', 'Área de inyectología',
      'Camilla de procedimientos con mesa auxiliar y lavamanos.',
      R(16, 30, 34, 60, 6, 0.09) + r(66, 30, 18, 14, 2)
      + C(75, 60, 7) + L(69, 60, 81, 60) + L(75, 54, 75, 66, SOFT)
      + L(50, 44, 60, 44, DASH)],
    ['cad_drg_washbasin', 'Lavamanos',
      'Lavamanos de pared con dispensador de jabón y secador.',
      R(24, 34, 42, 26, 8, 0.09) + C(45, 47, 4)
      + L(70, 30, 70, 44) + L(66, 30, 74, 30) + P('M70 44c0 4 4 6 8 6')
      + L(30, 66, 30, 78) + L(60, 66, 60, 78)],
    ['cad_drg_blue_point', 'Punto azul (posconsumo)',
      'Recipiente de medicamentos vencidos con tapa y rótulo.',
      R(32, 32, 36, 48, 5, 0.1) + L(28, 32, 72, 32) + L(44, 24, 56, 24)
      + L(50, 22, 50, 32) + P('M50 44v20') + P('M42 54l8 10 8-10')],
    ['cad_drg_sharps', 'Guardían de punzocortantes',
      'Contenedor rígido de residuos biosanitarios con tapa de seguridad.',
      R(34, 30, 32, 48, 4, 0.1) + r(42, 22, 16, 8, 2)
      + P('M42 40l16 16M58 40L42 56', SOFT) + L(30, 78, 70, 78)],
    ['cad_drg_consult', 'Consultorio farmacéutico',
      'Escritorio de asesoría con dos sillas y equipo de cómputo.',
      R(16, 36, 40, 18, 3, 0.09) + r(24, 24, 16, 8, 2)
      + C(38, 62, 7) + C(72, 52, 7) + L(30, 66, 30, 74, SOFT) + L(46, 66, 46, 74, SOFT)],
    ['cad_drg_scale', 'Báscula de mostrador',
      'Báscula digital con plataforma y columna de lectura.',
      R(26, 48, 48, 14, 4, 0.1) + R(40, 26, 20, 12, 2)
      + L(50, 38, 50, 48) + C(50, 55, 3, 0.3) + L(30, 62, 30, 70, SOFT) + L(70, 62, 70, 70, SOFT)],
    ['cad_drg_bp_monitor', 'Tensiómetro de pie',
      'Tensiómetro con brazalete y soporte rodante.',
      R(40, 22, 20, 16, 3, 0.1) + L(50, 38, 50, 52) + C(50, 58, 6)
      + P('M60 52c10 6 8 20-4 24') + L(40, 78, 60, 78) + C(50, 44, 3, 0.25)],
    ['cad_drg_archive', 'Archivador de fórmulas',
      'Archivador de dos cuerpos con cajones y rotulación.',
      R(28, 16, 44, 66, 3, 0.08) + L(28, 38, 72, 38, SOFT) + L(28, 60, 72, 60, SOFT)
      + L(40, 28, 60, 28, SOFT) + L(40, 50, 60, 50, SOFT) + L(40, 72, 60, 72, SOFT)],
    ['cad_drg_first_aid', 'Botiquín',
      'Botiquín de primeros auxilios con cruz y asa.',
      R(24, 32, 52, 38, 5, 0.1) + L(44, 24, 56, 24) + L(48, 21, 48, 32)
      + P('M50 44v16M42 52h16', ' stroke-width="3"')],
    ['cad_drg_extinguisher', 'Extintor de la droguería',
      'Extintor multipropósito junto al acceso del personal.',
      R(42, 30, 18, 40, 6, 0.1) + r(46, 22, 10, 8, 2)
      + L(51, 22, 51, 16) + L(51, 16, 62, 16) + L(62, 16, 62, 24)
      + R(36, 70, 30, 6, 2, 0.06)],
    ['cad_drg_perfume', 'Exhibidor de perfumería',
      'Exhibidor de dos caras con probadores y espejo.',
      R(20, 22, 60, 56, 4, 0.07) + L(50, 22, 50, 78)
      + C(32, 36, 5) + C(68, 36, 5) + C(32, 56, 5) + C(68, 56, 5)
      + L(24, 68, 44, 68, SOFT) + L(56, 68, 76, 68, SOFT)],
    ['cad_drg_delivery_cart', 'Carro de medicamentos',
      'Carro de transporte con tres bandejas y ruedas.',
      R(22, 30, 56, 8, 2, 0.1) + R(22, 46, 56, 8, 2, 0.08) + R(22, 62, 56, 8, 2, 0.08)
      + L(26, 30, 26, 78) + L(74, 30, 74, 78)
      + C(32, 80, 3) + C(68, 80, 3)],
    ['cad_drg_packing', 'Zona de empaque',
      'Mesa de empaque con bolsas, etiquetas y lector.',
      R(16, 42, 50, 20, 3, 0.09) + P('M20 42l6-12h20l6 12')
      + C(74, 38, 6) + L(74, 44, 74, 62) + L(66, 70, 82, 70)],
    ['cad_drg_patient_chair', 'Silla de ruedas',
      'Silla de ruedas plegada junto a la zona de atención.',
      C(32, 62, 12) + C(64, 62, 12) + P('M32 50h26q6 0 6 6v10H38')
      + L(58, 40, 58, 50) + L(50, 34, 66, 34) + C(46, 34, 4)],
    ['cad_drg_waste', 'Caneca de residuos comunes',
      'Caneca con tapa de pedal y bolsa visible.',
      R(34, 32, 32, 46, 4, 0.1) + L(30, 32, 70, 32) + L(42, 26, 58, 26)
      + P('M40 44v20M50 44v20M60 44v20', SOFT) + L(66, 78, 74, 84)],
    ['cad_drg_storage', 'Depósito de medicamentos',
      'Depósito con estibas y estantería de cajas.',
      R(12, 20, 76, 60, 3, 0.05) + R(20, 28, 24, 20, 2, 0.09) + R(56, 28, 24, 20, 2, 0.09)
      + R(20, 56, 24, 18, 2, 0.09) + R(56, 56, 24, 18, 2, 0.09)
      + L(32, 28, 32, 48, SOFT) + L(68, 56, 68, 74, SOFT)],
  ],
  },
};
