/*
 * Familia CAD: supermercado (ampliación), droguería, gimnasio, colegio y
 * cafetería. Cada objeto se dibuja en planta salvo los símbolos de pared.
 */
import { R, r, solid, C, L, P, E, hatch, zone, person } from './draw.mjs';

export const COMERCIO = {
  supermarket: {
    label: 'Supermercado',
    short: 'Supermercado',
    color: '#334155',
    extra: [
      ['cad_mkt_aisle', 'Pasillo de góndolas',
        'Par de góndolas enfrentadas con pasillo central de circulación.',
        zone(8, 20, 84, 60, 3) + R(16, 26, 14, 48, 2) + R(70, 26, 14, 48, 2)
        + hatch(20, 30, 20, 70, 4) + hatch(74, 30, 74, 70, 4)
        + P('M48 50h4M42 50h2M56 50h2', ' opacity=".5"')],
      ['cad_mkt_fruit', 'Isla de frutas y verduras',
        'Isla central con cajones inclinados y balanza.',
        E(50, 52, 34, 24, 0.06) + R(26, 34, 20, 14, 2) + R(54, 34, 20, 14, 2)
        + R(26, 56, 20, 14, 2) + R(54, 56, 20, 14, 2) + C(50, 52, 4, 0.2)],
      ['cad_mkt_butcher', 'Cárcel de carnes',
        'Mostrador refrigerado de carnicería con cámara posterior.',
        R(12, 40, 52, 24, 3) + L(12, 52, 64, 52, ' opacity=".4"')
        + R(70, 26, 22, 44, 3, 0.08) + L(70, 40, 92, 40, ' opacity=".5"')
        + C(20, 34, 3, 0.25)],
      ['cad_mkt_bakery', 'Panadería y repostería',
        'Vitrina de panadería con bandejas y horno de apoyo.',
        R(14, 36, 46, 26, 3) + hatch(18, 40, 56, 40, 3)
        + R(66, 30, 24, 30, 3, 0.1) + C(78, 45, 7) + L(70, 64, 86, 64, ' opacity=".5"')],
      ['cad_mkt_deli', 'Delicatessen',
        'Mostrador de fiambres con balanza y rebanadora.',
        R(16, 42, 50, 20, 3) + R(60, 34, 12, 12, 2, 0.12)
        + C(30, 52, 4, 0.2) + L(16, 70, 66, 70, ' stroke-dasharray="3 3" opacity=".5"')],
      ['cad_mkt_fish', 'Pescadería',
        'Isla de pescadería con hielo y desagüe.',
        E(50, 52, 32, 22, 0.06) + R(24, 38, 22, 12, 2) + R(54, 38, 22, 12, 2)
        + R(24, 56, 22, 12, 2) + R(54, 56, 22, 12, 2)
        + P('M46 74l8-8 8 8', ' opacity=".4"')],
      ['cad_mkt_drinks', 'Nevera de bebidas',
        'Mural de neveras con puertas de cristal.',
        R(10, 26, 80, 20, 3, 0.08) + L(30, 26, 30, 46, ' opacity=".5"')
        + L(50, 26, 50, 46, ' opacity=".5"') + L(70, 26, 70, 46, ' opacity=".5"')
        + L(14, 36, 26, 36, ' opacity=".3"') + L(34, 36, 46, 36, ' opacity=".3"')
        + L(54, 36, 66, 36, ' opacity=".3"') + L(74, 36, 86, 36, ' opacity=".3"')
        + R(10, 56, 80, 18, 3, 0.05)],
      ['cad_mkt_scale_platform', 'Báscula de plataforma',
        'Báscula para carros y bultos con indicador en columna.',
        R(24, 44, 52, 30, 4) + L(28, 54, 72, 54, ' opacity=".35"')
        + R(60, 22, 18, 14, 2, 0.12) + L(69, 36, 69, 44)],
      ['cad_mkt_cart_corral', 'Corral de carros',
        'Corral de carritos con separadores y carro dentro.',
        R(14, 30, 72, 46, 4, 0.05) + L(14, 44, 86, 44, ' stroke-dasharray="4 3" opacity=".6"')
        + R(24, 50, 20, 18, 2) + R(56, 50, 20, 18, 2)
        + C(28, 72, 2.5) + C(40, 72, 2.5) + C(60, 72, 2.5) + C(72, 72, 2.5)],
      ['cad_mkt_bagger', 'Zona de empaque',
        'Mesa de empaque junto a las cajas con bolsas y cinta.',
        R(16, 40, 58, 22, 3) + L(16, 51, 74, 51, ' opacity=".35"')
        + P('M78 34l10 8-10 8z', ' opacity=".5"')
        + L(24, 70, 24, 78, ' opacity=".4"') + L(66, 70, 66, 78, ' opacity=".4"')],
      ['cad_mkt_customer_service', 'Servicio al cliente',
        'Mostrador de atención con dos puestos y sillas.',
        R(14, 30, 46, 18, 3) + r(20, 20, 12, 8, 2) + r(38, 20, 12, 8, 2)
        + C(28, 60, 6) + C(52, 60, 6) + L(14, 68, 60, 60, ' stroke-dasharray="3 3" opacity=".4"')],
      ['cad_mkt_pharmacy', 'Farmacia del supermercado',
        'Mostrador de farmacia con estantería posterior.',
        R(12, 44, 46, 20, 3) + L(12, 54, 58, 54, ' opacity=".35"')
        + R(64, 20, 26, 56, 3, 0.07) + hatch(64, 30, 90, 30, 4)
        + P('M77 40v12M71 46h12', ' stroke-width="3"')],
      ['cad_mkt_textile', 'Textil y hogar',
        'Isla de textil con mesas de plegado y percheros.',
        R(14, 24, 30, 26, 2, 0.08) + R(56, 24, 30, 26, 2, 0.08)
        + L(44, 62, 84, 62, ' opacity=".5"') + L(44, 70, 84, 70, ' opacity=".5"')
        + C(50, 66, 2.2, 0.4) + C(58, 66, 2.2, 0.4) + C(66, 66, 2.2, 0.4)],
      ['cad_mkt_security', 'Control de seguridad',
        'Arco detector con torniquete y mesa de monitoreo.',
        L(26, 26, 26, 74) + L(38, 26, 38, 74) + L(26, 26, 38, 26) + L(26, 74, 38, 74)
        + R(56, 34, 30, 16, 3, 0.08) + L(48, 42, 56, 42, ' stroke-dasharray="3 3" opacity=".5"')
        + L(48, 58, 56, 58, ' stroke-dasharray="3 3" opacity=".5"')],
      ['cad_mkt_bathroom_access', 'Baños del supermercado',
        'Acceso a baños con dos cubículos y lavamanos.',
        R(18, 26, 64, 48, 4, 0.05) + L(50, 26, 50, 74) + r(26, 36, 16, 22, 2)
        + r(58, 36, 16, 22, 2) + C(34, 60, 3) + C(66, 60, 3)],
      ['cad_mkt_loading', 'Muelle de carga',
        'Muelle con rampa, tope y zona de maniobra demarcada.',
        R(10, 34, 40, 32, 2, 0.08) + L(50, 34, 50, 66)
        + zone(54, 26, 36, 48, 2) + P('M60 50h20M74 44l8 6-8 6', ' opacity=".6"')],
      ['cad_mkt_waste', 'Compactador de residuos',
        'Compactador con tolva, pistón y boca de carga.',
        R(20, 30, 44, 40, 3, 0.08) + R(64, 38, 18, 24, 2)
        + P('M30 40v20M40 40v20', ' opacity=".4"') + C(73, 50, 4, 0.2)],
      ['cad_mkt_pallet', 'Estiba de mercancía',
        'Estiba con cajas apiladas y flejes.',
        R(24, 30, 52, 44, 2, 0.07) + L(24, 44, 76, 44, ' opacity=".5"')
        + L(24, 58, 76, 58, ' opacity=".5"') + L(40, 30, 40, 74, ' opacity=".3"')
        + L(60, 30, 60, 74, ' opacity=".3"')],
      ['cad_mkt_stairs', 'Escaleras mecánicas',
        'Tramo de escaleras mecánicas con barandas y peine.',
        R(20, 18, 24, 64, 2, 0.06) + R(56, 18, 24, 64, 2, 0.06)
        + hatch(26, 24, 26, 76, 7) + hatch(62, 24, 62, 76, 7)
        + L(44, 18, 56, 18, ' opacity=".3"')],
      ['cad_mkt_elevator', 'Ascensor de carga',
        'Caja de ascensor con puertas y botonera.',
        R(28, 24, 44, 52, 3, 0.07) + L(50, 24, 50, 76)
        + P('M42 50h-8M38 46l-4 4 4 4', ' opacity=".6"')
        + P('M58 50h8M62 46l4 4-4 4', ' opacity=".6"') + C(50, 70, 2, 0.3)],
    ],
  },

  drogueria: {
    label: 'Droguería y farmacia',
    short: 'Droguería',
    color: '#0f766e',
    extra: [
      ['cad_drg_delivery', 'Mostrador de entregas',
        'Mostrador bajo con reja de entrega y fila de espera.',
        R(14, 40, 48, 22, 3) + L(14, 51, 62, 51, ' opacity=".35"')
        + hatch(62, 40, 62, 62, 5) + P('M16 70h46', ' stroke-dasharray="3 3" opacity=".4"')],
      ['cad_drg_shelf_roller', 'Estantería de rodillos',
        'Estantería rodante compacta con cuatro módulos.',
        R(10, 20, 80, 60, 3, 0.05) + hatch(30, 20, 30, 80, 1, ' opacity=".5"')
        + L(50, 20, 50, 80, ' opacity=".5"') + L(70, 20, 70, 80, ' opacity=".5"')
        + C(18, 88, 2.5) + C(50, 88, 2.5) + C(82, 88, 2.5)],
      ['cad_drg_window', 'Ventanilla de despacho',
        'Ventanilla con bandeja y mampara de protección.',
        R(20, 34, 60, 30, 4) + L(20, 49, 80, 49, ' opacity=".35"')
        + solid(26, 40, 18, 6, 1, 0.18) + solid(52, 40, 22, 6, 1, 0.18)
        + P('M50 64v10', ' opacity=".4"')],
      ['cad_drg_counseling', 'Box de asesoría',
        'Box cerrado con sillas, mesa y cortina.',
        R(16, 22, 68, 56, 4, 0.05) + L(16, 34, 84, 34, ' stroke-dasharray="4 3" opacity=".6"')
        + R(28, 44, 22, 12, 2) + C(34, 68, 6) + C(72, 56, 6)],
      ['cad_drg_sample', 'Muestras médicas',
        'Exhibidor de muestras médicas con cajoneras.',
        R(22, 24, 56, 52, 3, 0.06) + hatch(22, 40, 78, 40, 3)
        + C(34, 32, 3, 0.2) + C(50, 32, 3, 0.2) + C(66, 32, 3, 0.2)],
      ['cad_drg_ortho', 'Ortopedia y ayudas técnicas',
        'Zona de ayudas técnicas con bastones y andadera.',
        R(12, 26, 34, 48, 3, 0.05) + L(20, 34, 20, 66, ' opacity=".5"')
        + L(30, 34, 30, 66, ' opacity=".5"') + L(20, 34, 30, 34, ' opacity=".5"')
        + R(56, 36, 30, 28, 3) + C(62, 70, 3) + C(80, 70, 3)],
      ['cad_drg_nursery', 'Lactario y baño familiar',
        'Lactario con cambiador, silla y lavamanos.',
        R(18, 24, 60, 52, 4, 0.05) + r(26, 34, 30, 14, 2)
        + C(72, 44, 6) + P('M30 68h24', ' opacity=".4"') + E(56, 66, 10, 5)],
      ['cad_drg_refill', 'Punto de reenvase',
        'Mesa de reenvase con dispensadores y balanza.',
        R(16, 40, 46, 22, 3) + C(28, 34, 6) + C(46, 34, 6) + L(28, 48, 28, 52)
        + C(70, 46, 8) + C(70, 46, 3, 0.3)],
      ['cad_drg_temperature', 'Registro de temperatura',
        'Panel de monitoreo de frío con sensor y registrador.',
        R(24, 28, 52, 40, 4, 0.06) + P('M34 56l8-12 6 8 6-14 6 18', ' opacity=".7"')
        + C(68, 34, 3.5) + L(68, 34, 68, 44)],
      ['cad_drg_supplies', 'Insumos y dispositivos',
        'Estantería de insumos con cajas y dispositivos médicos.',
        R(12, 22, 76, 56, 3, 0.05) + hatch(12, 40, 88, 40, 3)
        + L(38, 22, 38, 78, ' opacity=".4"') + L(62, 22, 62, 78, ' opacity=".4"')],
      ['cad_drg_emergency_kit', 'Kit de emergencias',
        'Carro de paro con cajones y tablero de medicamentos.',
        R(24, 26, 52, 56, 4, 0.08) + hatch(24, 42, 76, 42, 4)
        + solid(30, 30, 40, 4, 1, 0.18) + C(34, 86, 3) + C(66, 86, 3)],
      ['cad_drg_baby_scale', 'Báscula pediátrica',
        'Báscula con bandeja cóncava y columna de lectura.',
        E(50, 58, 30, 14, 0.07) + R(38, 26, 24, 12, 2) + L(50, 38, 50, 46)
        + P('M30 72h40', ' opacity=".4"')],
      ['cad_drg_nebulizer', 'Nebulizador',
        'Nebulizador con mascarilla y compresor.',
        R(28, 44, 30, 22, 4, 0.08) + C(72, 50, 10)
        + P('M72 40c6 4 6 12 0 16', ' opacity=".5"') + L(58, 55, 64, 55, ' stroke-dasharray="3 2"')],
      ['cad_drg_glucometer', 'Glucómetro',
        'Glucómetro con tira reactiva y linterna.',
        R(30, 32, 22, 44, 4, 0.08) + solid(34, 38, 14, 10, 2, 0.25)
        + L(41, 76, 41, 82, ' opacity=".4"') + L(64, 42, 78, 42)
        + R(78, 36, 10, 12, 2, 0.12)],
      ['cad_drg_pill_counter', 'Contador de pastillas',
        'Contador manual con tolva y bandeja de salida.',
        R(24, 36, 36, 30, 6, 0.08) + P('M24 46l-8 6 8 6', ' opacity=".6"')
        + C(52, 51, 4, 0.2) + L(60, 51, 84, 51) + L(76, 46, 84, 51, ' opacity=".4"')],
      ['cad_drg_packaging_line', 'Línea de empaque',
        'Banda de empaque con estaciones y lector de códigos.',
        R(10, 44, 76, 14, 3) + L(10, 51, 86, 51, ' stroke-dasharray="4 3" opacity=".4"')
        + C(24, 51, 3, 0.25) + C(44, 51, 3, 0.25) + C(64, 51, 3, 0.25)
        + R(70, 26, 16, 12, 2, 0.12) + L(78, 38, 78, 44)],
      ['cad_drg_waiting_bench', 'Banca de espera',
        'Banca corrida de cuatro puestos con apoyabrazos.',
        R(10, 40, 80, 12, 3) + L(10, 52, 10, 62, ' opacity=".5"')
        + L(90, 52, 90, 62, ' opacity=".5"') + hatch(28, 40, 28, 52, 1, ' opacity=".4"')
        + L(48, 40, 48, 52, ' opacity=".4"') + L(68, 40, 68, 52, ' opacity=".4"')],
      ['cad_drg_wheelchair_zone', 'Zona de silla de ruedas',
        'Espacio reservado para silla de ruedas junto a la espera.',
        zone(20, 24, 60, 52, 4) + C(38, 60, 12) + C(70, 60, 12)
        + P('M38 48h24q6 0 6 6v8H44') + L(62, 36, 62, 48)],
      ['cad_drg_hydration', 'Punto de hidratación',
        'Dispensador de agua con vasos y bandeja.',
        R(34, 30, 32, 44, 6, 0.08) + solid(40, 38, 20, 18, 3, 0.16)
        + P('M50 56v8M42 64h16', ' opacity=".4"') + R(38, 76, 24, 6, 2, 0.06)],
      ['cad_drg_information', 'Punto de información',
        'Tótem informativo con pantalla y folletos.',
        R(40, 22, 20, 50, 4, 0.08) + solid(44, 28, 12, 16, 2, 0.2)
        + L(50, 72, 50, 80) + L(36, 82, 64, 82) + R(64, 34, 12, 16, 2, 0.07)],
      ['cad_drg_checkout_self', 'Caja de autoservicio',
        'Caja autoservicio con pantalla, balanza y bolsas.',
        R(20, 30, 30, 44, 3, 0.07) + solid(25, 36, 20, 12, 2, 0.18)
        + solid(25, 54, 20, 10, 2, 0.12) + C(64, 44, 9) + L(64, 44, 74, 36)
        + R(56, 60, 26, 14, 3)],
      ['cad_drg_ambulance_access', 'Acceso de emergencia',
        'Puerta de acceso rápido con zona libre demarcada.',
        zone(16, 20, 68, 60, 3) + R(38, 20, 24, 8, 2, 0.15)
        + P('M50 32v34M40 56l10 10 10-10', ' opacity=".7"') + L(24, 74, 76, 74, ' opacity=".3"')],
    ],
  },

  gimnasio: {
    label: 'Gimnasio y fitness',
    short: 'Gimnasio',
    color: '#7c3aed',
    description: 'Máquinas de fuerza y cardio, salas dirigidas, vestidores y áreas '
      + 'de recuperación de un gimnasio.',
    objects: [
      ['cad_gym_treadmill', 'Caminadora',
        'Caminadora con banda, consola y barandas.',
        R(16, 44, 58, 22, 3) + L(20, 55, 70, 55, ' stroke-dasharray="4 3" opacity=".4"')
        + R(74, 34, 10, 22, 3) + L(30, 76, 30, 84, ' opacity=".4"') + L(64, 76, 64, 84, ' opacity=".4"')],
      ['cad_gym_elliptical', 'Elíptica',
        'Elíptica con pedales, brazos móviles y volante.',
        E(50, 56, 24, 12, 0.07) + C(50, 30, 8) + L(50, 38, 50, 46)
        + L(30, 40, 36, 56) + L(70, 40, 64, 56) + C(50, 74, 4)],
      ['cad_gym_bike', 'Bicicleta estática',
        'Bicicleta estática con sillín, manillar y volante.',
        C(42, 54, 14) + C(42, 54, 4, 0.25) + C(72, 60, 10)
        + L(46, 40, 58, 34) + L(60, 30, 72, 30) + L(30, 66, 22, 76, ' opacity=".5"')],
      ['cad_gym_rower', 'Remo ergómetro',
        'Remo con riel, asiento deslizante y volante.',
        R(12, 48, 50, 8, 3) + R(20, 40, 16, 12, 3, 0.1) + C(76, 52, 12) + L(62, 52, 68, 52)],
      ['cad_gym_multi', 'Máquina multifunción',
        'Estación de poleas con torre, banco y discos.',
        R(18, 20, 16, 64, 3, 0.08) + R(66, 20, 16, 64, 3, 0.08)
        + L(34, 30, 66, 30, ' opacity=".5"') + C(14, 40, 5) + C(86, 40, 5)
        + R(34, 52, 32, 12, 2)],
      ['cad_gym_bench', 'Banco de pesas',
        'Banco plano con soportes y barra.',
        R(30, 40, 40, 20, 6, 0.1) + L(50, 24, 50, 40) + L(30, 24, 70, 24)
        + C(28, 24, 4) + C(72, 24, 4) + L(36, 60, 36, 70, ' opacity=".4"')
        + L(64, 60, 64, 70, ' opacity=".4"')],
      ['cad_gym_rack', 'Rack de sentadillas',
        'Rack con barras, topes y discos laterales.',
        R(24, 18, 8, 66, 2, 0.1) + R(68, 18, 8, 66, 2, 0.1)
        + L(32, 34, 68, 34) + C(20, 30, 5) + C(80, 30, 5)
        + L(32, 36, 32, 60, ' opacity=".3"') + L(68, 36, 68, 60, ' opacity=".3"')],
      ['cad_gym_dumbbell_rack', 'Rack de mancuernas',
        'Rack inclinado con tres niveles de mancuernas.',
        R(14, 30, 72, 44, 3, 0.06) + hatch(14, 44, 86, 44, 3)
        + hatch(20, 34, 20, 70, 6, ' opacity=".35"')],
      ['cad_gym_weights', 'Zona de peso libre',
        'Plataforma de peso muerto con barras y discos.',
        zone(16, 22, 68, 58, 3) + L(26, 50, 74, 50) + C(22, 50, 7) + C(78, 50, 7)
        + C(50, 72, 6, 0.1) + R(44, 66, 12, 12, 2, 0.08)],
      ['cad_gym_mat', 'Colchoneta',
        'Colchoneta enrollable con marcas de uso.',
        R(20, 34, 60, 32, 4, 0.08) + L(26, 42, 74, 42, ' opacity=".3"')
        + L(26, 58, 74, 58, ' opacity=".3"') + C(20, 50, 6)],
      ['cad_gym_mirror', 'Espejo de sala',
        'Muro de espejos con perfilería.',
        R(14, 16, 72, 8, 2, 0.12) + hatch(20, 16, 20, 24, 6, ' opacity=".4"')
        + L(14, 30, 86, 30, ' opacity=".25"')],
      ['cad_gym_class_room', 'Sala de clases dirigidas',
        'Sala con tarima, parlante y colchonetas alineadas.',
        R(14, 20, 72, 60, 4, 0.04) + R(30, 22, 40, 10, 2, 0.12)
        + C(20, 30, 4) + hatch(24, 44, 24, 72, 3) + L(24, 46, 76, 46, ' opacity=".3"')
        + L(24, 58, 76, 58, ' opacity=".3"')],
      ['cad_gym_spinning', 'Salón de spinning',
        'Bicicletas de spinning en dos filas frente a tarima.',
        R(20, 18, 60, 8, 2, 0.12) + hatch(20, 34, 20, 72, 4)
        + hatch(50, 34, 50, 72, 4) + L(80, 34, 80, 72, ' opacity=".4"')],
      ['cad_gym_box', 'Zona de boxeo',
        'Ring con cuerdas y saco de entrenamiento.',
        R(16, 26, 48, 46, 3, 0.05) + L(16, 34, 64, 34, ' opacity=".5"')
        + L(16, 40, 64, 40, ' opacity=".5"') + C(80, 44, 8) + L(80, 52, 80, 76, ' opacity=".4"')],
      ['cad_gym_locker', 'Vestidores con casilleros',
        'Dos filas de casilleros con banco central.',
        R(14, 20, 72, 20, 2, 0.07) + R(14, 60, 72, 20, 2, 0.07)
        + hatch(20, 20, 20, 40, 6, ' opacity=".4"') + hatch(20, 60, 20, 80, 6, ' opacity=".4"')
        + R(24, 44, 52, 12, 3)],
      ['cad_gym_shower', 'Duchas',
        'Batería de duchas con separadores y desagüe.',
        R(12, 24, 76, 52, 3, 0.04) + hatch(24, 24, 24, 76, 3)
        + C(50, 40, 4) + L(50, 40, 50, 30) + C(80, 40, 4) + L(80, 40, 80, 30)
        + L(44, 72, 56, 72, ' opacity=".35"')],
      ['cad_gym_sauna', 'Sauna',
        'Sauna con bancas escalonadas y estufa.',
        R(18, 22, 64, 56, 4, 0.06) + R(26, 30, 48, 12, 2, 0.08)
        + R(26, 50, 48, 12, 2, 0.08) + C(70, 68, 5) + L(66, 72, 74, 72, ' opacity=".4"')],
      ['cad_gym_reception', 'Recepción del gimnasio',
        'Mostrador curvo con torniquetes y báscula corporal.',
        E(44, 44, 26, 14, 0.07) + L(18, 62, 70, 62, ' opacity=".4"')
        + C(80, 40, 6) + C(80, 60, 6) + R(72, 70, 16, 12, 2, 0.08)],
      ['cad_gym_kids', 'Zona infantil',
        'Área de juegos con colchonetas y valla perimetral.',
        zone(14, 22, 72, 58, 6) + C(32, 44, 10) + R(54, 34, 22, 20, 4)
        + C(64, 66, 8) + P('M24 74c4-6 12-6 16 0', ' opacity=".4"')],
      ['cad_gym_physio', 'Zona de fisioterapia',
        'Camilla, pelotas y módulo de recuperación.',
        R(16, 34, 44, 20, 6, 0.09) + C(70, 44, 10) + C(50, 68, 8)
        + L(16, 64, 44, 64, ' opacity=".3"')],
      ['cad_gym_water', 'Fuente de agua',
        'Bebedero doble con pedestal y desagüe.',
        E(50, 44, 22, 12, 0.08) + L(34, 52, 34, 74, ' opacity=".4"')
        + L(66, 52, 66, 74, ' opacity=".4"') + P('M44 40c0-6 12-6 12 0', ' opacity=".5"')],
      ['cad_gym_trash', 'Caneca del gimnasio',
        'Caneca con tapa y bolsa.',
        R(36, 32, 28, 44, 4, 0.1) + L(32, 32, 68, 32) + L(44, 26, 56, 26)
        + P('M42 44v20M50 44v20M58 44v20', ' opacity=".35"')],
      ['cad_gym_supplement', 'Punto de suplementos',
        'Vitrina con productos y caja de cobro.',
        R(18, 30, 40, 40, 3, 0.06) + hatch(18, 44, 58, 44, 3)
        + C(70, 40, 8) + L(70, 48, 70, 60, ' opacity=".4"') + R(62, 62, 18, 10, 2)],
    ],
  },

  colegio: {
    label: 'Colegio y universidad',
    short: 'Colegio',
    color: '#1d4ed8',
    description: 'Aulas, laboratorios, biblioteca, comedor y zonas comunes '
      + 'de un colegio o universidad.',
    objects: [
      ['cad_sch_desk', 'Pupitre',
        'Pupitre individual con silla y tablero.',
        R(24, 40, 36, 16, 3, 0.1) + C(50, 68, 6) + L(38, 60, 44, 62, ' opacity=".5"')
        + L(24, 46, 18, 52, ' opacity=".4"')],
      ['cad_sch_desk_pair', 'Pupitres dobles',
        'Dos pupitres con sillas orientadas al tablero.',
        R(18, 40, 28, 14, 3, 0.09) + R(54, 40, 28, 14, 3, 0.09)
        + C(32, 66, 5) + C(68, 66, 5)],
      ['cad_sch_blackboard', 'Tablero',
        'Tablero de pared con bandeja de tizas.',
        R(12, 16, 76, 10, 2, 0.12) + L(12, 30, 88, 30, ' opacity=".3"')
        + solid(30, 33, 14, 2, 1, 0.35) + solid(52, 33, 10, 2, 1, 0.25)],
      ['cad_sch_digital_board', 'Tablero digital',
        'Pantalla interactiva de pared con módulo de control.',
        R(12, 14, 76, 12, 2, 0.1) + solid(18, 17, 64, 6, 1, 0.2)
        + solid(30, 33, 40, 3, 1, 0.14) + L(50, 28, 50, 33, ' opacity=".3"')],
      ['cad_sch_teacher_desk', 'Escritorio del docente',
        'Escritorio con silla, equipo y taburete auxiliar.',
        R(20, 34, 44, 18, 3, 0.09) + solid(28, 28, 16, 6, 1, 0.2)
        + C(76, 46, 7) + L(20, 60, 64, 60, ' opacity=".3"')
        + C(34, 66, 5, 0.1)],
      ['cad_sch_lab_bench', 'Mesa de laboratorio',
        'Mesa de laboratorio con servicios de agua y gas.',
        R(14, 34, 72, 28, 3) + L(14, 48, 86, 48, ' opacity=".35"')
        + C(28, 28, 4) + C(72, 28, 4) + L(28, 28, 28, 22) + L(72, 28, 72, 22)],
      ['cad_sch_computer', 'Sala de cómputo',
        'Puesto de cómputo con monitor, CPU y silla.',
        R(20, 30, 44, 26, 3, 0.07) + solid(26, 36, 32, 14, 2, 0.16)
        + R(70, 32, 8, 22, 2, 0.1) + C(42, 70, 6) + L(20, 64, 64, 64, ' opacity=".25"')],
      ['cad_sch_library', 'Biblioteca',
        'Estantería doble con pasillo y mesa de lectura.',
        R(12, 22, 30, 56, 2, 0.07) + R(58, 22, 30, 56, 2, 0.07)
        + hatch(12, 36, 42, 36, 3, ' opacity=".4"') + hatch(58, 36, 88, 36, 3, ' opacity=".4"')
        + R(36, 62, 28, 14, 2)],
      ['cad_sch_reading_room', 'Sala de lectura',
        'Cuatro mesas de lectura con sillas enfrentadas.',
        R(24, 30, 24, 16, 2, 0.08) + R(56, 30, 24, 16, 2, 0.08)
        + R(24, 56, 24, 16, 2, 0.08) + R(56, 56, 24, 16, 2, 0.08)
        + C(18, 38, 4) + C(86, 38, 4) + C(18, 64, 4) + C(86, 64, 4)],
      ['cad_sch_cafeteria', 'Comedor escolar',
        'Mesas corridas con bancas y línea de servicio.',
        R(12, 20, 76, 12, 3, 0.1) + R(16, 40, 68, 12, 3, 0.08)
        + R(16, 58, 68, 12, 3, 0.08) + C(30, 74, 4) + C(50, 74, 4) + C(70, 74, 4)],
      ['cad_sch_kitchen', 'Cocina del colegio',
        'Cocina con estufa, campana y mesón de preparación.',
        R(14, 24, 40, 26, 3, 0.08) + C(22, 32, 3) + C(32, 32, 3) + C(42, 32, 3)
        + R(60, 24, 26, 26, 3, 0.06) + R(14, 56, 72, 18, 3, 0.05)],
      ['cad_sch_gym', 'Coliseo o cancha cubierta',
        'Cancha con demarcación, gradas y aros.',
        R(10, 20, 80, 60, 4, 0.04) + L(50, 20, 50, 80, ' stroke-dasharray="5 4" opacity=".5"')
        + C(50, 50, 12) + C(20, 50, 7) + C(80, 50, 7)],
      ['cad_sch_court_outdoor', 'Cancha exterior',
        'Cancha al aire libre con cerramiento perimetral.',
        R(8, 18, 84, 64, 2, 0.03) + L(8, 50, 92, 50, ' opacity=".5"')
        + C(50, 50, 10) + hatch(14, 18, 14, 82, 6, ' opacity=".2"')],
      ['cad_sch_playground', 'Patio de recreo',
        'Patio con juegos infantiles y zona de sombra.',
        zone(12, 22, 76, 58, 8) + C(32, 40, 8) + L(56, 40, 76, 40)
        + P('M56 34l20 12') + C(66, 68, 6) + P('M28 68c4-8 16-8 20 0', ' opacity=".4"')],
      ['cad_sch_locker', 'Casilleros',
        'Batería de casilleros con puertas y banco.',
        R(14, 24, 72, 20, 2, 0.07) + R(14, 60, 72, 20, 2, 0.07)
        + hatch(20, 24, 20, 44, 6, ' opacity=".4"') + hatch(20, 60, 20, 80, 6, ' opacity=".4"')
        + R(26, 46, 48, 10, 3)],
      ['cad_sch_nurse', 'Enfermería',
        'Enfermería con camilla, botiquín y escritorio.',
        R(16, 30, 30, 48, 6, 0.08) + R(56, 26, 26, 20, 3, 0.1)
        + P('M69 32v8M65 36h8', ' stroke-width="2.5"') + C(40, 84, 3) + C(24, 84, 3)],
      ['cad_sch_psych', 'Orientación escolar',
        'Oficina de orientación con dos sillas y mesa.',
        R(24, 40, 40, 16, 3, 0.08) + C(34, 64, 6) + C(60, 62, 6)
        + R(72, 30, 16, 28, 2, 0.06) + L(72, 44, 88, 44, ' opacity=".4"')],
      ['cad_sch_admin', 'Administración',
        'Oficina administrativa con módulos de trabajo.',
        R(14, 30, 26, 40, 3, 0.07) + R(60, 30, 26, 40, 3, 0.07)
        + solid(20, 36, 14, 8, 2, 0.18) + solid(66, 36, 14, 8, 2, 0.18)
        + R(44, 44, 12, 12, 2, 0.06)],
      ['cad_sch_auditorium', 'Auditorio',
        'Auditorio con tarima y filas de butacas.',
        R(14, 18, 72, 14, 2, 0.1) + hatch(16, 40, 16, 76, 4, ' opacity=".4"')
        + hatch(34, 40, 34, 76, 4, ' opacity=".4"') + hatch(52, 40, 52, 76, 4, ' opacity=".4"')
        + hatch(70, 40, 70, 76, 4, ' opacity=".4"')],
      ['cad_sch_art_room', 'Aula de arte',
        'Mesa de trabajo con caballetes y lavadero.',
        R(20, 34, 40, 22, 3, 0.08) + P('M70 30l14 22M84 30L70 52', ' opacity=".7"')
        + C(30, 68, 8) + L(30, 68, 40, 60, ' opacity=".4"')],
      ['cad_sch_music_room', 'Aula de música',
        'Aula con piano, atriles y tarima pequeña.',
        R(12, 30, 34, 18, 3, 0.1) + hatch(16, 34, 44, 34, 5, ' opacity=".5"')
        + C(70, 42, 7) + C(82, 54, 7) + L(58, 66, 86, 44, ' opacity=".3"')],
      ['cad_sch_workshop', 'Taller',
        'Taller con bancos de trabajo y panel de herramientas.',
        R(14, 24, 72, 12, 2, 0.08) + R(20, 46, 26, 16, 2, 0.07)
        + R(54, 46, 26, 16, 2, 0.07) + hatch(20, 46, 20, 62, 4, ' opacity=".3"')],
      ['cad_sch_bus_stop', 'Paradero escolar',
        'Paradero con cubierta, banco y zona de ascenso.',
        R(16, 24, 68, 12, 3, 0.1) + R(16, 44, 68, 10, 3, 0.06)
        + zone(10, 60, 80, 20, 3) + P('M20 70h40M54 66l8 4-8 4', ' opacity=".6"')],
    ],
  },

  cafeteria: {
    label: 'Cafetería y panadería',
    short: 'Cafetería',
    color: '#b45309',
    description: 'Barra de café, vitrinas, mesas y zonas de una cafetería '
      + 'o panadería con consumo en sitio.',
    objects: [
      ['cad_caf_bar', 'Barra de café',
        'Barra con máquina de espresso, molino y caja.',
        R(10, 40, 68, 20, 3, 0.08) + L(10, 50, 78, 50, ' opacity=".3"')
        + R(16, 26, 18, 12, 2, 0.12) + C(74, 30, 6)
        + solid(60, 32, 10, 6, 1, 0.2)],
      ['cad_caf_espresso', 'Máquina de espresso',
        'Máquina de dos grupos con bandeja y vaporizador.',
        R(20, 30, 52, 30, 3, 0.09) + C(34, 45, 6) + C(56, 45, 6)
        + P('M78 36c8 2 8 14 0 16') + R(28, 62, 36, 8, 2, 0.06)],
      ['cad_caf_grinder', 'Molino de café',
        'Molino con tolva, dosificador y base.',
        R(38, 24, 24, 14, 3, 0.1) + R(42, 38, 16, 16, 2, 0.08)
        + C(50, 62, 8) + L(42, 62, 58, 62, ' opacity=".35"')],
      ['cad_caf_pastry', 'Vitrina de repostería',
        'Vitrina refrigerada con tres niveles de producto.',
        R(14, 24, 72, 52, 4, 0.06) + hatch(14, 40, 86, 40, 3)
        + C(32, 32, 4, 0.2) + C(50, 32, 4, 0.2) + C(68, 32, 4, 0.2)],
      ['cad_caf_oven', 'Horno de panadería',
        'Horno con cámara, puerta y extractor.',
        R(20, 26, 60, 38, 3, 0.07) + r(28, 34, 44, 22, 2)
        + C(50, 45, 6, 0.1) + R(24, 68, 52, 8, 2, 0.06)],
      ['cad_caf_kneader', 'Amasadora',
        'Amasadora con cuba, brazo y cabezal.',
        C(40, 50, 18, 0.06) + C(40, 50, 6) + R(58, 34, 18, 22, 3, 0.1)
        + L(30, 68, 50, 68, ' opacity=".4"')],
      ['cad_caf_table2', 'Mesa para dos',
        'Mesa redonda pequeña con dos sillas.',
        C(50, 50, 14, 0.07) + C(24, 50, 6) + C(76, 50, 6)],
      ['cad_caf_table4', 'Mesa para cuatro',
        'Mesa cuadrada con cuatro sillas.',
        R(32, 32, 36, 36, 6, 0.07) + C(50, 20, 6) + C(50, 80, 6)
        + C(20, 50, 6) + C(80, 50, 6)],
      ['cad_caf_bench', 'Banca corrida',
        'Banca de madera con respaldo y mesa baja.',
        R(12, 44, 76, 12, 3) + L(12, 36, 88, 36, ' opacity=".5"')
        + C(20, 64, 4) + C(50, 64, 4) + C(80, 64, 4)],
      ['cad_caf_chair', 'Silla',
        'Silla individual con respaldo curvo.',
        R(38, 30, 24, 22, 6, 0.09) + P('M34 54q16 14 32 0', ' opacity=".5"')],
      ['cad_caf_counter_pickup', 'Barra de recogida',
        'Mostrador de recogida de pedidos con bandeja.',
        R(16, 42, 64, 18, 3, 0.08) + solid(24, 48, 34, 6, 1, 0.18)
        + P('M20 66h56', ' stroke-dasharray="3 3" opacity=".4"')],
      ['cad_caf_display_fridge', 'Nevera exhibidora',
        'Nevera vertical con puerta de cristal y estantes.',
        R(30, 20, 40, 60, 3, 0.07) + r(38, 28, 24, 44, 2)
        + L(38, 42, 62, 42, ' opacity=".4"') + L(38, 56, 62, 56, ' opacity=".4"')],
      ['cad_caf_sink', 'Poceta de barra',
        'Poceta doble con grifería y escurridor.',
        R(22, 34, 30, 32, 6, 0.07) + R(56, 34, 22, 32, 6, 0.07)
        + L(50, 40, 50, 60, ' opacity=".3"') + C(66, 30, 3) + L(66, 30, 66, 38)],
      ['cad_caf_ice', 'Máquina de hielo',
        'Máquina de hielo con tolva y depósito.',
        R(28, 26, 44, 44, 3, 0.08) + hatch(32, 32, 68, 32, 3)
        + solid(36, 56, 28, 8, 2, 0.16)],
      ['cad_caf_coffee_station', 'Estación de insumos',
        'Estación con azucarero, servilletas y dispensador.',
        R(20, 36, 60, 24, 3, 0.07) + C(34, 44, 5) + C(50, 44, 5) + C(66, 44, 5)
        + L(20, 66, 80, 66, ' opacity=".3"')],
      ['cad_caf_trash', 'Estación de residuos',
        'Tres canecas con tapa para separación en la fuente.',
        R(18, 34, 18, 34, 3, 0.08) + R(41, 34, 18, 34, 3, 0.08) + R(64, 34, 18, 34, 3, 0.08)
        + L(14, 34, 86, 34, ' opacity=".35"')],
      ['cad_caf_waiting', 'Zona de espera',
        'Dos sillones y mesa auxiliar junto al acceso.',
        R(20, 40, 22, 20, 6, 0.08) + R(58, 40, 22, 20, 6, 0.08)
        + C(50, 68, 6) + C(50, 24, 3, 0.2)],
      ['cad_caf_wifi', 'Punto de trabajo',
        'Mesa alta con conexiones y banco.',
        R(28, 36, 44, 16, 3, 0.08) + P('M50 62a10 10 0 0 1 10 10M50 62a18 18 0 0 1 18 18', ' opacity=".6"')
        + C(50, 62, 2.5, 0.5)],
      ['cad_caf_bathroom', 'Baño de cafetería',
        'Baño individual accesible con lavamanos.',
        R(24, 24, 52, 52, 4, 0.05) + C(44, 44, 8) + C(60, 62, 5)
        + L(34, 66, 54, 66, ' opacity=".35"')],
      ['cad_caf_delivery', 'Zona de domicilios',
        'Mostrador de despacho con repisas y bolsas.',
        R(14, 38, 46, 20, 3, 0.08) + R(66, 28, 20, 44, 3, 0.06)
        + L(66, 44, 86, 44, ' opacity=".4"') + L(66, 58, 86, 58, ' opacity=".4"')],
      ['cad_caf_terrace', 'Terraza',
        'Terraza con mesas, sombrillas y jardinera.',
        zone(10, 18, 80, 64, 6) + C(32, 40, 12, 0.07) + C(68, 40, 12, 0.07)
        + C(32, 40, 14) + C(68, 40, 14) + R(14, 70, 72, 8, 3, 0.06)],
      ['cad_caf_service_door', 'Puerta de servicio',
        'Puerta de servicio con zona de carga y descarga.',
        zone(14, 20, 30, 60, 3) + R(48, 32, 34, 10, 2, 0.12)
        + P('M52 56h26M72 50l6 6-6 6', ' opacity=".6"')],
    ],
  },
};
