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
        'Caminadora en alzado con banda, pasamanos y consola.',
        E(44, 72, 32, 9, 0.1) + L(22, 72, 30, 82) + L(66, 72, 58, 82)
        + hatch(28, 70, 28, 76, 6, ' opacity=".25"')
        + L(70, 66, 78, 26) + r(70, 18, 18, 9, 2)
        + L(74, 27, 74, 34, ' opacity=".4"') + L(16, 82, 76, 82, ' opacity=".2"')],

      ['cad_gym_elliptical', 'Elíptica',
        'Elíptica en alzado con volante, pedales, brazos móviles y base.',
        E(50, 76, 30, 7, 0.05)
        + C(26, 52, 12) + C(26, 52, 4)
        + L(26, 64, 38, 74) + R(34, 68, 30, 7, 3, 0.16) + R(54, 60, 28, 7, 3, 0.16)
        + L(56, 42, 62, 60) + L(80, 36, 74, 60)
        + L(52, 40, 60, 44) + L(80, 34, 88, 38)
        + L(20, 83, 80, 83, ' opacity=".2"')],

      ['cad_gym_bike', 'Bicicleta estática',
        'Bicicleta fija en alzado con volante, sillín, manillar y base.',
        C(28, 64, 14, 0.07) + C(28, 64, 4, 0.25)
        + L(28, 50, 54, 42) + L(42, 64, 54, 42) + L(28, 64, 42, 64, ' opacity=".45"')
        + solid(50, 34, 18, 7, 3, 0.22) + L(59, 41, 62, 30) + L(57, 26, 70, 26)
        + L(56, 64, 56, 80) + L(44, 80, 68, 80) + C(42, 58, 3, 0.2)
        + L(16, 80, 84, 80, ' opacity=".2"')],

      ['cad_gym_rower', 'Remo ergómetro',
        'Remo en alzado con riel, asiento, volante y manubrio.',
        R(18, 62, 62, 7, 3) + L(22, 69, 22, 80) + L(76, 69, 76, 80)
        + R(34, 50, 14, 12, 3, 0.12)
        + C(22, 46, 9) + C(22, 46, 3) + L(29, 52, 44, 56)
        + L(18, 80, 84, 80, ' opacity=".2"')],

      ['cad_gym_multi', 'Máquina multifunción',
        'Máquina multifunción en alzado con torre, dos poleas, barra y asiento.',
        R(24, 20, 13, 60, 3, 0.1) + C(30, 30, 5, 0.2) + C(30, 48, 5, 0.2)
        + L(30, 30, 66, 30) + L(30, 48, 62, 48) + L(66, 30, 66, 44)
        + L(58, 42, 66, 48) + r(44, 26, 22, 8, 2)
        + R(52, 58, 26, 9, 3, 0.12) + L(56, 67, 56, 78) + L(74, 67, 74, 78)
        + L(20, 80, 84, 80, ' opacity=".2"')],

      ['cad_gym_bench', 'Banco de pesas',
        'Banco plano en alzado con barra, discos y soportes.',
        R(16, 60, 56, 10, 4, 0.1) + L(24, 70, 24, 80) + L(64, 70, 64, 80)
        + L(22, 42, 74, 42) + solid(16, 35, 6, 14, 2, 0.3) + solid(74, 35, 6, 14, 2, 0.3)
        + L(32, 42, 32, 56) + L(64, 42, 64, 56) + L(16, 80, 74, 80, ' opacity=".25"')],

      ['cad_gym_rack', 'Rack de sentadillas',
        'Rack con barras, topes y discos laterales.',
        R(24, 18, 8, 66, 2, 0.1) + R(68, 18, 8, 66, 2, 0.1)
        + L(32, 34, 68, 34) + C(20, 30, 5) + C(80, 30, 5)
        + L(32, 36, 32, 60, ' opacity=".3"') + L(68, 36, 68, 60, ' opacity=".3"')],
      ['cad_gym_dumbbell_rack', 'Rack de mancuernas',
        'Rack de dos niveles con cuatro pares de mancuernas y estructura lateral.',
        R(10, 34, 80, 34, 3, 0.05) + L(10, 51, 90, 51, ' opacity=".45"')
        + L(14, 34, 14, 68) + L(86, 34, 86, 68)
        + [0, 1, 2, 3].map((i) => {
          const x = 22 + i * 16;
          return C(x - 3, 42, 4, 0.22) + C(x + 3, 42, 4, 0.22) + L(x - 3, 42, x + 3, 42)
            + C(x - 3, 60, 4, 0.22) + C(x + 3, 60, 4, 0.22) + L(x - 3, 60, x + 3, 60);
        }).join('')],
      ['cad_gym_weights', 'Zona de peso libre',
        'Plataforma de peso muerto con barras y discos.',
        zone(16, 22, 68, 58, 3) + L(26, 50, 74, 50) + C(22, 50, 7) + C(78, 50, 7)
        + C(50, 72, 6, 0.1) + R(44, 66, 12, 12, 2, 0.08)],
      ['cad_gym_mat', 'Colchoneta',
        'Colchoneta enrollable con marcas de uso.',
        R(20, 34, 60, 32, 4, 0.08) + L(26, 42, 74, 42, ' opacity=".3"')
        + L(26, 58, 74, 58, ' opacity=".3"') + C(20, 50, 6)],
      ['cad_gym_mirror', 'Espejo de sala',
        'Paño de espejo sobre el muro con perfilería y destellos.',
        R(10, 30, 80, 14, 2, 0.1) + r(13, 33, 74, 8, 1)
        + P('M22 40l8-6M32 40l8-6M42 40l8-6', ' opacity=".35"')
        + P('M58 36l6 4', ' opacity=".45"') + L(10, 46, 90, 46, ' opacity=".25"')],
      ['cad_gym_class_room', 'Sala de clases dirigidas',
        'Sala con espejo frontal, tarima de la instructora y seis colchonetas en rejilla.',
        R(12, 14, 76, 72, 4, 0.03) + solid(16, 18, 68, 5, 1, 0.22)
        + R(38, 30, 24, 9, 2, 0.1) + person(50, 35, 3)
        + R(18, 48, 22, 13, 2, 0.08) + R(52, 48, 22, 13, 2, 0.08)
        + R(18, 66, 22, 13, 2, 0.08) + R(52, 66, 22, 13, 2, 0.08)
        + L(20, 76, 38, 76, ' opacity=".35"') + L(54, 76, 72, 76, ' opacity=".35"')],
      ['cad_gym_spinning', 'Salón de spinning',
        'Ocho bicicletas fijas en dos filas frente a la tarima del instructor.',
        solid(16, 16, 68, 5, 1, 0.2) + C(50, 30, 4, 0.15)
        + [0, 1].map((row) => [0, 1, 2, 3].map((col) => {
          const x = 18 + col * 18, y = 44 + row * 22;
          return C(x, y, 6, 0.1) + C(x, y, 2) + L(x, y + 6, x, y + 12)
            + L(x - 4, y + 12, x + 4, y + 12);
        }).join('')).join('')],
      ['cad_gym_box', 'Zona de boxeo',
        'Ring de cuatro postes con tres cuerdas y saco de entrenamiento colgante.',
        R(10, 20, 58, 58, 3, 0.03) + r(16, 26, 46, 46, 2) + r(20, 30, 38, 38, 2)
        + C(10, 20, 3.5, 0.25) + C(68, 20, 3.5, 0.25) + C(10, 78, 3.5, 0.25) + C(68, 78, 3.5, 0.25)
        + C(80, 40, 8, 0.12) + L(80, 48, 80, 58) + C(80, 40, 3)
        + L(72, 26, 72, 34, ' opacity=".4"')],
      ['cad_gym_locker', 'Vestidores con casilleros',
        'Dos filas de casilleros con banco central.',
        R(14, 20, 72, 20, 2, 0.07) + R(14, 60, 72, 20, 2, 0.07)
        + hatch(20, 20, 20, 40, 6, ' opacity=".4"') + hatch(20, 60, 20, 80, 6, ' opacity=".4"')
        + R(24, 44, 52, 12, 3)],
      ['cad_gym_shower', 'Duchas',
        'Batería de tres duchas con separadores, rejillas de desagüe y cortina.',
        R(10, 22, 80, 58, 3, 0.03) + L(10, 34, 90, 34, ' opacity=".35"')
        + [0, 1, 2].map((i) => {
          const x = 24 + i * 26;
          return L(x, 34, x, 80, ' opacity=".22"')
            + C(x + 8, 44, 4) + L(x + 8, 44, x + 8, 36)
            + r(x + 2, 70, 12, 5, 1);
        }).join('')
        + P('M10 62h80', ' stroke-dasharray="3 3" opacity=".3"')],
      ['cad_gym_sauna', 'Sauna',
        'Sauna con bancas escalonadas y estufa.',
        R(18, 22, 64, 56, 4, 0.06) + R(26, 30, 48, 12, 2, 0.08)
        + R(26, 50, 48, 12, 2, 0.08) + C(70, 68, 5) + L(66, 72, 74, 72, ' opacity=".4"')],
      ['cad_gym_reception', 'Recepción del gimnasio',
        'Mostrador de recepción con equipo, dos torniquetes de acceso y planta.',
        R(12, 26, 56, 16, 3, 0.09) + r(18, 20, 14, 6, 2)
        + solid(38, 30, 16, 6, 1, 0.22)
        + C(34, 58, 7) + L(28, 64, 40, 64, ' opacity=".35"')
        + C(74, 52, 5) + L(74, 57, 74, 66) + C(78, 70, 4, 0.15)
        + C(60, 52, 5) + L(60, 57, 60, 66) + C(56, 70, 4, 0.15)
        + C(78, 26, 6, 0.12) + L(78, 32, 78, 40)
        + R(14, 68, 22, 12, 2, 0.05)],
      ['cad_gym_kids', 'Zona infantil',
        'Zona delimitada con colchonetas, cubos de juego y resbaladera.',
        zone(10, 14, 80, 72, 6) + R(18, 22, 26, 18, 5, 0.12) + R(52, 22, 26, 18, 5, 0.08)
        + R(18, 48, 18, 14, 3, 0.1) + R(42, 48, 14, 14, 3, 0.14) + C(72, 54, 8, 0.1)
        + P('M66 30l8 6-8 6', ' opacity=".4"') + C(58, 76, 4, 0.16) + C(70, 76, 4, 0.16)],

      ['cad_gym_physio', 'Zona de fisioterapia',
        'Camilla con almohada, balón de recuperación, taburete y banda elástica.',
        R(12, 34, 42, 20, 6, 0.08) + R(12, 34, 12, 20, 5, 0.16)
        + L(12, 60, 54, 60, ' opacity=".3"') + L(20, 54, 20, 60) + L(46, 54, 46, 60)
        + C(70, 52, 12, 0.1) + P('M60 58q10-8 20 0', ' opacity=".4"')
        + C(30, 74, 6) + L(24, 74, 36, 74)
        + P('M62 78c8-6 14 2 22-4', ' opacity=".45"')],
      ['cad_gym_water', 'Fuente de agua',
        'Bebedero doble con pedestal y desagüe.',
        E(50, 44, 22, 12, 0.08) + L(34, 52, 34, 74, ' opacity=".4"')
        + L(66, 52, 66, 74, ' opacity=".4"') + P('M44 40c0-6 12-6 12 0', ' opacity=".5"')],
      ['cad_gym_trash', 'Caneca del gimnasio',
        'Caneca con tapa y bolsa.',
        R(36, 32, 28, 44, 4, 0.1) + L(32, 32, 68, 32) + L(44, 26, 56, 26)
        + P('M42 44v20M50 44v20M58 44v20', ' opacity=".35"')],
      ['cad_gym_supplement', 'Punto de suplementos',
        'Estantería con botes de suplemento, mostrador de cobro y nevera de bebidas.',
        R(10, 26, 44, 46, 3, 0.05) + L(10, 40, 54, 40, ' opacity=".4"')
        + L(10, 56, 54, 56, ' opacity=".4"')
        + [0, 1, 2].map((i) => [0, 1].map((row) => C(20 + i * 14, 33 + row * 16, 4, 0.16)).join('')).join('')
        + R(60, 34, 30, 16, 3, 0.1) + solid(66, 38, 10, 5, 1, 0.2)
        + R(64, 58, 18, 26, 3, 0.06) + L(64, 66, 82, 66, ' opacity=".4"')
        + C(73, 54, 3, 0.2)],
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
        'Pupitre individual con tablero inclinado, silla y cesta inferior.',
        R(18, 34, 40, 20, 3, 0.1) + L(18, 44, 58, 44, ' opacity=".35"')
        + C(46, 70, 8) + L(38, 64, 34, 68, ' opacity=".4"')
        + R(24, 60, 26, 4, 1, 0.1) + L(22, 54, 22, 60, ' opacity=".4"')
        + L(54, 54, 54, 60, ' opacity=".4"')],
      ['cad_sch_desk_pair', 'Pupitres dobles',
        'Dos pupitres con sillas orientadas al tablero.',
        R(18, 40, 28, 14, 3, 0.09) + R(54, 40, 28, 14, 3, 0.09)
        + C(32, 66, 5) + C(68, 66, 5)],
      ['cad_sch_blackboard', 'Tablero',
        'Tablero de pared con marco, bandeja de tizas y borrador.',
        r(10, 14, 80, 13, 2) + R(13, 17, 74, 7, 1, 0.28)
        + L(10, 31, 90, 31) + solid(26, 34, 12, 2.4, 1, 0.4)
        + solid(44, 34, 7, 2.4, 1, 0.3) + solid(62, 33, 14, 4, 1, 0.18)],
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
        'Línea de servicio al frente y dos mesas corridas con taburetes a los lados.',
        R(12, 14, 76, 14, 3, 0.1) + L(12, 21, 88, 21, ' opacity=".35"')
        + [44, 66].map((y) => R(26, y, 48, 12, 2, 0.08)
          + [0, 1, 2].map((i) => C(34 + i * 16, y - 6, 3, 0.16)).join('')
          + [0, 1, 2].map((i) => C(34 + i * 16, y + 18, 3, 0.16)).join('')).join('')],
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
        'Patio delimitado con arenero, columpio, cancha y zona de sombra.',
        zone(10, 16, 80, 70, 8)
        + E(30, 34, 14, 9, 0.08) + C(30, 34, 3, 0.2)
        + L(62, 22, 62, 46) + L(82, 22, 82, 46) + L(62, 24, 82, 24)
        + r(64, 42, 16, 5, 2) + L(64, 42, 62, 26, ' opacity=".4"')
        + L(80, 42, 82, 26, ' opacity=".4"')
        + R(18, 58, 46, 22, 3, 0.05) + L(18, 69, 64, 69) + C(41, 58, 6)
        + C(76, 66, 7, 0.12) + L(76, 73, 76, 80, ' opacity=".4"')],
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
        'Oficina de orientación con mesa ovalada, dos sillas y estantería.',
        E(46, 46, 22, 13, 0.08) + C(24, 46, 7) + C(68, 46, 7)
        + L(31, 46, 38, 46, ' opacity=".4"') + L(54, 46, 61, 46, ' opacity=".4"')
        + R(14, 66, 60, 10, 2, 0.05) + L(14, 71, 74, 71, ' opacity=".3"')
        + C(82, 72, 6, 0.12) + L(82, 78, 82, 84, ' opacity=".35"')],
      ['cad_sch_admin', 'Administración',
        'Mostrador de atención en L con silla, equipo y archivador.',
        R(12, 34, 54, 16, 3, 0.08) + R(30, 50, 16, 30, 3, 0.08)
        + r(18, 28, 16, 6, 2) + solid(26, 37, 12, 5, 1, 0.2)
        + C(52, 62, 7) + L(46, 68, 58, 68, ' opacity=".4"')
        + R(70, 34, 18, 44, 3, 0.05) + L(70, 44, 88, 44, ' opacity=".4"')
        + L(70, 56, 88, 56, ' opacity=".4"') + L(70, 66, 88, 66, ' opacity=".4"')],
      ['cad_sch_auditorium', 'Auditorio',
        'Escenario al frente y tres filas de butacas con pasillos laterales.',
        R(12, 14, 76, 16, 2, 0.1) + L(12, 30, 88, 30, ' opacity=".4"')
        + C(50, 22, 4, 0.2)
        + [0, 1, 2].map((row) => [0, 1, 2, 3, 4].map((col) => {
          const x = 20 + col * 14, y = 40 + row * 16;
          return R(x, y, 10, 9, 2, 0.14) + L(x, y + 9, x + 10, y + 9, ' opacity=".3"');
        }).join('')).join('')
        + P('M14 36v48M86 36v48', ' opacity=".25"')],
      ['cad_sch_art_room', 'Aula de arte',
        'Mesa de taller, dos caballetes con lienzo, lavadero y taburetes.',
        R(14, 30, 34, 22, 3, 0.08) + L(14, 41, 48, 41, ' opacity=".35"')
        + C(22, 62, 5) + C(34, 62, 5)
        + P('M62 26l22 26M84 26L62 52') + r(68, 34, 10, 8, 1)
        + R(58, 64, 30, 14, 3, 0.06) + C(66, 71, 4) + L(78, 68, 78, 74)
        + P('M76 66l4 4-4 4', ' opacity=".5"')],
      ['cad_sch_music_room', 'Aula de música',
        'Aula con piano de pared, teclado, taburete y atriles.',
        R(12, 24, 44, 20, 3, 0.1) + solid(16, 30, 36, 7, 1, 0.22)
        + L(14, 44, 54, 44, ' opacity=".3"')
        + C(34, 58, 7) + L(34, 65, 34, 70, ' opacity=".35"')
        + [0, 1, 2].map((i) => P(`M${22 + i * 20} 78l6-12M${28 + i * 20} 78l-6-12`,
          ' opacity=".35"')).join('')
        + C(72, 60, 6) + C(84, 70, 5)],
      ['cad_sch_workshop', 'Taller',
        'Banco de trabajo con sierra circular, panel de herramientas y banco lateral.',
        R(12, 26, 72, 16, 2, 0.08) + C(34, 34, 6) + L(34, 28, 34, 40)
        + L(26, 34, 42, 34) + r(56, 28, 18, 12, 2)
        + L(14, 46, 82, 46, ' opacity=".35"')
        + R(16, 56, 60, 9, 2, 0.06) + L(24, 65, 24, 76, ' opacity=".4"')
        + L(68, 65, 68, 76, ' opacity=".4"')
        + R(66, 20, 20, 16, 2, 0.04) + P('M70 24h12M70 30h12', ' opacity=".3"')],
      ['cad_sch_bus_stop', 'Paradero escolar',
        'Refugio con cubierta y banco, bus escolar y franja de ascenso.',
        R(10, 16, 78, 10, 3, 0.1) + R(16, 30, 40, 9, 2, 0.06)
        + L(14, 26, 14, 68) + L(84, 26, 84, 68)
        + R(20, 44, 44, 26, 4, 0.08) + L(20, 56, 64, 56, ' opacity=".35"')
        + C(26, 72, 4) + C(58, 72, 4) + L(64, 50, 72, 50)
        + zone(16, 78, 68, 12, 2) + P('M26 84h30M50 80l6 4-6 4', ' opacity=".55"')],
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
        'Máquina de hielo con tolva, depósito de cubos y rejilla frontal.',
        R(14, 22, 40, 60, 4, 0.07) + r(20, 28, 28, 16, 2)
        + [0, 1, 2].map((row) => [0, 1, 2].map((col) => solid(22 + col * 9, 50 + row * 9, 6, 6, 1, 0.22)).join('')).join('')
        + solid(20, 76, 28, 4, 1, 0.18)
        + R(60, 40, 22, 22, 3, 0.08) + L(60, 51, 82, 51, ' opacity=".4"')],
      ['cad_caf_coffee_station', 'Estación de insumos',
        'Mueble con dispensador de vasos, azucarero, servilletero y bandeja de goteo.',
        R(12, 30, 76, 32, 3, 0.06) + L(12, 46, 88, 46, ' opacity=".35"')
        + r(18, 22, 14, 8, 2) + C(25, 39, 4) + C(50, 39, 4, 0.16)
        + r(60, 35, 10, 8, 1) + L(68, 35, 74, 31)
        + R(16, 52, 20, 7, 2, 0.12) + solid(44, 54, 18, 3, 1, 0.25)
        + C(76, 55, 4, 0.18) + L(26, 62, 74, 62, ' opacity=".25"')],
      ['cad_caf_trash', 'Estación de residuos',
        'Tres canecas con tapa para separación en la fuente.',
        R(18, 34, 18, 34, 3, 0.08) + R(41, 34, 18, 34, 3, 0.08) + R(64, 34, 18, 34, 3, 0.08)
        + L(14, 34, 86, 34, ' opacity=".35"')],
      ['cad_caf_waiting', 'Zona de espera',
        'Dos sillones y mesa auxiliar junto al acceso.',
        R(20, 40, 22, 20, 6, 0.08) + R(58, 40, 22, 20, 6, 0.08)
        + C(50, 68, 6) + C(50, 24, 3, 0.2)],
      ['cad_caf_wifi', 'Punto de trabajo',
        'Mesa alta con dos taburetes, tomacorriente y señal de wifi.',
        E(34, 52, 16, 11, 0.08) + C(34, 70, 6) + C(58, 70, 6)
        + L(34, 63, 34, 68, ' opacity=".35"') + L(58, 63, 58, 68, ' opacity=".35"')
        + R(74, 40, 10, 12, 2, 0.1) + C(79, 46, 2)
        + P('M68 26a12 12 0 0 1 12 12M68 32a6 6 0 0 1 6 6', ' opacity=".55"')
        + C(68, 40, 2, 0.5)],
      ['cad_caf_bathroom', 'Baño de cafetería',
        'Cubículo con inodoro, lavamanos y puerta de acceso.',
        R(16, 14, 68, 72, 4, 0.04) + R(16, 54, 68, 4, 1, 0.12)
        + E(34, 32, 12, 9, 0.1) + r(24, 18, 20, 7, 2) + C(34, 32, 4)
        + E(64, 66, 14, 10, 0.08) + C(64, 66, 4) + L(64, 56, 64, 50)
        + P('M52 56v6M50 58h4', ' opacity=".45"')
        + L(16, 74, 84, 74, ' opacity=".25"')],
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
