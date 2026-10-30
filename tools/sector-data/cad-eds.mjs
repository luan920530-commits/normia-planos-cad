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

export const EDS = {
eds: {
  label: 'Estación de servicio (EDS)',
  short: 'EDS',
  description: 'Surtidores, tanques, islas, servicios y zonas de una estación de servicio. '
    + 'Ubicaciones esquemáticas para el plano de emergencia del establecimiento.',
  color: '#0e7490',
  objects: [
    ['cad_eds_dispenser', 'Surtidor de combustible',
      'Surtidor de dos caras con pantalla, mangueras y boquillas.',
      R(34, 16, 32, 68, 6, 0.1) + r(40, 22, 20, 13, 3) + L(46, 28, 54, 28)
      + P('M34 44c-9 3-9 15 0 18') + P('M66 44c9 3 9 15 0 18')
      + C(30, 41, 3) + C(70, 41, 3)
      + L(38, 76, 62, 76) + L(38, 70, 62, 70)],
    ['cad_eds_dispenser_diesel', 'Surtidor de diésel',
      'Surtidor de diésel con manguera de alto caudal y bandeja de goteo.',
      R(36, 14, 28, 62, 5, 0.1) + r(42, 20, 16, 11, 2)
      + P('M64 40c10 2 10 16 0 18') + C(69, 38, 3)
      + R(30, 76, 40, 10, 3, 0.06) + L(36, 81, 64, 81)],
    ['cad_eds_dispenser_glp', 'Surtidor de GLP',
      'Surtidor de gas licuado con manguera reforzada y válvula de corte.',
      R(38, 30, 24, 46, 10, 0.1) + C(50, 24, 6) + L(50, 30, 50, 38)
      + P('M62 46c9 3 9 15 0 18') + C(66, 44, 3) + r(42, 44, 16, 12, 2)
      + L(38, 76, 62, 76)],
    ['cad_eds_island', 'Isla de surtidores',
      'Isla con dos surtidores y defensas laterales.',
      R(8, 44, 84, 14, 4, 0.1) + R(22, 26, 16, 44, 3, 0.08) + R(62, 26, 16, 44, 3, 0.08)
      + L(8, 51, 22, 51, SOFT) + L(78, 51, 92, 51, SOFT)
      + C(14, 66, 2.4, 0.5) + C(86, 66, 2.4, 0.5)],
    ['cad_eds_tank', 'Tanque enterrado',
      'Tanque de combustible bajo tierra con boca de inspección.',
      `<rect x="16" y="32" width="68" height="36" rx="18" fill="currentColor" `
        + `fill-opacity=".07" stroke-dasharray="4 3"/>` + C(50, 50, 6) + L(44, 50, 56, 50)
      + L(50, 44, 50, 56) + L(22, 72, 22, 80, SOFT) + L(78, 72, 78, 80, SOFT)],
    ['cad_eds_fill_point', 'Boca de llenado',
      'Boca de llenado de tanque con tapa roscada y collarín.',
      C(50, 50, 20, 0.1) + C(50, 50, 12) + C(50, 50, 4, 0.45)
      + P('M50 26v-8M50 82v-8M26 50h-8M82 50h-8')],
    ['cad_eds_vent', 'Venteo de tanques',
      'Tubería de venteo con sombrerete y codos de salida.',
      R(46, 30, 8, 50, 3, 0.08) + R(38, 18, 24, 10, 3) + L(38, 24, 62, 24)
      + P('M46 80h8') + L(30, 23, 38, 23) + L(62, 23, 70, 23)],
    ['cad_eds_air', 'Punto de aire y agua',
      'Poste de servicio con dos tomas, manómetro, carrete de manguera y bandeja de goteo.',
      R(24, 16, 52, 26, 4, 0.1) + r(30, 22, 18, 14, 2) + r(52, 22, 18, 14, 2)
      + C(39, 29, 4) + C(61, 29, 4) + L(39, 36, 39, 44) + L(61, 44, 61, 36)
      + R(30, 48, 40, 28, 4, 0.06) + C(50, 62, 11) + C(50, 62, 4)
      + P('M50 73q10 4 10 12') + L(30, 82, 70, 82, SOFT)
      + L(34, 86, 66, 86, SOFT)],
    ['cad_eds_compressor', 'Compresor',
      'Compresor de aire con volante, motor y tanque pulmón.',
      R(18, 34, 44, 34, 4, 0.09) + C(32, 51, 10) + L(32, 41, 32, 61) + L(22, 51, 42, 51)
      + R(62, 42, 20, 26, 3) + P('M62 55h-0') + L(56, 55, 62, 55) + L(18, 74, 18, 80)
      + L(28, 74, 28, 80) + L(72, 74, 72, 80)],
    ['cad_eds_wash', 'Lavadero de vehículos',
      'Bahía de lavado con ducha, desagüe central y vehículo en posición.',
      `<rect x="10" y="16" width="80" height="68" rx="4" fill="currentColor" `
        + `fill-opacity=".05" stroke-dasharray="4 3"/>`
      + P('M34 26h32q6 0 6 6v14H28V32q0-6 6-6Z', ' fill="none"')
      + C(40, 60, 4) + C(60, 60, 4) + P('M36 54h28q4 0 4 4v6H32v-6q0-4 4-4Z')
      + L(46, 76, 54, 76) + L(50, 72, 50, 80)
      + P('M14 20c4 3 4 7 0 10') + P('M18 20c4 3 4 7 0 10', SOFT)],
    ['cad_eds_vacuum', 'Aspiradora industrial',
      'Aspiradora de pie con depósito cilíndrico, manguera flexible y boquilla de piso.',
      C(38, 50, 17, 0.1) + C(38, 50, 6)
      + P('M46 36v-6h10q3 0 3 3v6') + L(45, 66, 45, 84) + L(31, 66, 31, 84)
      + L(26, 84, 50, 84) + P('M55 60q14 8 10 20') + R(58, 78, 20, 8, 3)],
    ['cad_eds_office', 'Oficina de la estación',
      'Oficina con escritorio, silla, equipo y archivador lateral.',
      R(12, 28, 44, 18, 3, 0.09) + L(12, 46, 56, 46, SOFT)
      + r(18, 22, 16, 6, 2)
      + R(66, 34, 20, 40, 3, 0.07) + L(66, 46, 86, 46, SOFT) + L(66, 60, 86, 60, SOFT)
      + C(34, 62, 8, 0.08) + P('M26 72h16', SOFT)],
    ['cad_eds_store', 'Tienda de conveniencia',
      'Tienda con dos góndolas y nevera mural.',
      R(10, 18, 80, 66, 4, 0.05) + R(20, 28, 12, 44, 2, 0.09) + R(44, 28, 12, 44, 2, 0.09)
      + R(70, 28, 12, 44, 2, 0.09)
      + L(20, 40, 32, 40, SOFT) + L(44, 40, 56, 40, SOFT) + L(70, 40, 82, 40, SOFT)
      + L(20, 58, 32, 58, SOFT) + L(44, 58, 56, 58, SOFT) + L(70, 58, 82, 58, SOFT)],
    ['cad_eds_wc', 'Baños públicos',
      'Dos cubículos con lavamanos común.',
      R(14, 22, 72, 58, 4, 0.05) + L(50, 22, 50, 80)
      + r(24, 34, 14, 20, 2) + r(62, 34, 14, 20, 2)
      + C(31, 44, 4) + C(69, 44, 4)
      + L(28, 66, 40, 66) + L(60, 66, 72, 66)],
    ['cad_eds_pos', 'Caja y punto de pago',
      'Mostrador de caja con terminal, cajón y fila de espera.',
      R(16, 34, 56, 22, 4, 0.1) + L(16, 45, 72, 45, SOFT)
      + r(22, 22, 14, 8, 2) + R(66, 26, 16, 12, 2, 0.12)
      + P('M12 62h64', DASH) + C(30, 68, 3) + C(50, 68, 3)],
    ['cad_eds_car_bay', 'Bahía de servicio liviano',
      'Plaza de servicio para vehículo liviano con isla lateral.',
      `<rect x="18" y="12" width="64" height="76" rx="3" fill="currentColor" `
        + `fill-opacity=".05" stroke-dasharray="4 3"/>`
      + P('M30 26h40q6 0 6 6v10H24V32q0-6 6-6Z')
      + C(36, 56, 5) + C(64, 56, 5) + P('M32 50h36q4 0 4 4v6H28v-6q0-4 4-4Z')
      + L(24, 12, 24, 88, SOFT) + L(76, 12, 76, 88, SOFT)],
    ['cad_eds_moto_bay', 'Plaza de motos',
      'Plazoleta de motos con separadores y moto en planta.',
      `<rect x="16" y="16" width="68" height="68" rx="3" fill="currentColor" `
        + `fill-opacity=".05" stroke-dasharray="4 3"/>`
      + C(34, 62, 8) + C(66, 62, 8) + L(34, 62, 50, 40) + L(50, 40, 66, 62)
      + L(44, 34, 56, 34) + P('M40 30h20')],
    ['cad_eds_truck_lane', 'Carril de camiones',
      'Carril exclusivo para vehículos pesados con carril de salida.',
      R(20, 10, 60, 80, 3, 0.04)
      + r(30, 22, 40, 18, 2) + r(30, 44, 18, 12, 2) + L(48, 50, 70, 50)
      + L(24, 10, 24, 90, DASH) + L(76, 10, 76, 90, DASH)],
    ['cad_eds_spill_kit', 'Kit antiderrames',
      'Estación de contención con kit antiderrames y señalización.',
      R(10, 44, 38, 30, 4, 0.1) + L(10, 56, 48, 56, SOFT)
      + P('M74 26l18 32H56Z') + L(74, 42, 74, 50) + C(74, 54, 1.6, 0.8)
      + R(10, 44, 38, 6, 2)],
    ['cad_eds_extinguisher', 'Extintor ABC',
      'Extintor multipropósito sobre soporte de pared.',
      R(40, 30, 20, 44, 7, 0.1) + r(45, 22, 10, 8, 2)
      + L(50, 22, 50, 16) + L(50, 16, 62, 16) + L(62, 16, 62, 24)
      + R(34, 74, 32, 6, 2, 0.06) + L(44, 40, 56, 40, SOFT)],
    ['cad_eds_separator', 'Separador de grasas',
      'Trampa de grasas con deflectores y registros de inspección.',
      R(14, 34, 72, 32, 4, 0.07) + L(14, 46, 86, 46, SOFT) + L(14, 54, 86, 54, SOFT)
      + L(38, 34, 38, 66) + L(62, 34, 62, 66)
      + C(26, 30, 3) + C(74, 30, 3) + P('M14 72h72', DASH)],
    ['cad_eds_waste', 'Residuos peligrosos',
      'Caneca de residuos peligrosos con rótulo de riesgo.',
      R(34, 30, 32, 50, 4, 0.1) + L(30, 30, 70, 30) + L(44, 24, 56, 24)
      + L(50, 22, 50, 30) + P('M50 42l10 16H40Z') + L(50, 50, 50, 54)],
    ['cad_eds_canopy', 'Cubierta de surtidores',
      'Cubierta (canopy) con columnas y área de surtido bajo techo.',
      `<rect x="8" y="18" width="84" height="58" rx="6" fill="currentColor" `
        + `fill-opacity=".04" stroke-dasharray="5 4"/>`
      + C(24, 46, 4, 0.2) + C(76, 46, 4, 0.2)
      + R(40, 34, 20, 34, 3, 0.1) + L(40, 44, 60, 44, SOFT)],
    ['cad_eds_guard', 'Caseta de vigilancia',
      'Caseta de control con ventanilla y barrera de acceso.',
      R(22, 26, 36, 36, 4, 0.08) + L(22, 40, 58, 40, SOFT) + L(40, 26, 40, 62, SOFT)
      + P('M64 62h24') + P('M64 62l18-10') + C(66, 62, 3) + L(30, 70, 30, 80, SOFT)],
  ],
  },
};
