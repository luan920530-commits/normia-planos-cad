/*
 * Buscador de la paleta de herramientas.
 *
 * El buscador comparaba el texto tal cual aparecía en pantalla: «calle» no
 * encontraba «Vía vehicular», «anden» sin tilde no encontraba «Andén» y
 * «carretera» no encontraba nada. Aquí el texto se normaliza (minúsculas, sin
 * tildes) y cada herramienta aporta sus sinónimos de obra: así quien busca con
 * la palabra de su país llega a la herramienta correcta.
 */
(function (root) {
  'use strict';

  /**
   * Sinónimos por herramienta o acción. Se escriben sin tildes porque el texto
   * se normaliza antes de comparar; el usuario puede buscar con tilde o sin ella.
   */
  const TERMS = {
    select: ['seleccionar', 'seleccion', 'elegir', 'mover', 'escoger'],
    hand: ['mano', 'desplazar', 'panear', 'recorrer', 'navegar', 'mover vista'],
    wall: ['muro', 'pared', 'tabique', 'mamposteria', 'cerramiento', 'division'],
    door: ['puerta', 'vano', 'acceso', 'hoja'],
    door_double: ['puerta doble', 'doble hoja', 'vano doble', 'puertas'],
    door_garage: ['porton', 'reja', 'garaje', 'garage', 'cortina', 'vehicular'],
    route: ['ruta', 'evacuacion', 'salida', 'escape', 'recorrido', 'egreso'],
    pipe: ['tuberia', 'red', 'hidraulica', 'sanitaria', 'agua', 'gas', 'desague', 'incendio'],
    conduit: ['tuberia electrica', 'circuito', 'electrico', 'cable', 'canalizacion', 'energia'],
    text: ['texto', 'rotulo', 'etiqueta', 'leyenda', 'nombre'],
    dimension: ['medida', 'cota', 'acotar', 'dimension', 'metro', 'longitud'],
    line: ['linea', 'trazo', 'recta'],
    rect: ['rectangulo', 'cuadro', 'caja', 'forma'],
    ellipse: ['elipse', 'circulo', 'redondo', 'ovalo'],
    road: ['via', 'calle', 'carrera', 'carretera', 'avenida', 'calzada', 'corredor vial', 'autopista', 'vial', 'transito', 'carros'],
    sidewalk: ['anden', 'acera', 'banqueta', 'peatonal', 'camino', 'vereda'],
    crosswalk: ['paso cebra', 'cebra', 'cruce', 'peatones', 'franjas', 'paso peatonal'],
    parking: ['parqueadero', 'parqueo', 'estacionamiento', 'parqueaderos', 'garaje', 'vehiculos'],
    property: ['limite de predio', 'lindero', 'predio', 'lote', 'terreno', 'propiedad', 'cerco', 'mojon'],
    place: ['colocar', 'insertar', 'poner'],
    audit: ['revision', 'auditoria', 'cumplimiento', 'hallazgos', 'chequeo', 'revisar'],
    schedule: ['pliego', 'inventario', 'cantidades', 'presupuesto', 'lista de senales'],
    measure: ['medir', 'rutas', 'recorridos', 'distancias', 'metraje'],
    networks: ['redes', 'circuitos', 'carga', 'tension', 'hidraulica'],
    layers: ['capas', 'capas del plano', 'mostrar', 'ocultar'],
    versions: ['versiones', 'historial', 'deshacer', 'rehacer', 'guardado'],
    footer: ['pie de plano', 'membrete', 'rotulo del plano', 'cajetin', 'datos del plano'],
    shortcuts: ['atajos', 'ayuda', 'teclado', 'comandos'],
    guide: ['guia', 'tutorial', 'primeros pasos', 'ayuda inicial', 'como empezar', 'aprender'],
    export: ['exportar', 'descargar', 'pdf', 'svg', 'imprimir', 'plano'],
    present: ['presentar', 'presentacion', 'quiz', 'pantalla'],
    settings: ['ajustes', 'configuracion', 'opciones del piso'],
  };

  /** Palabras que se ofrecen cuando la búsqueda no encuentra nada. */
  const SUGGESTIONS = ['vía', 'andén', 'muro', 'puerta', 'ruta', 'señal'];

  /** Minúsculas, sin tildes y sin signos: «Vía vehicular» → «via vehicular». */
  const normalize = (text) => String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  /** Todo el texto contra el que se busca: nombre visible, grupo y sinónimos. */
  function haystack(choice) {
    const tool = choice.dataset?.tool || '';
    const drawer = choice.dataset?.openDrawer || '';
    const library = choice.dataset?.openLibrary || '';
    const group = choice.closest?.('.tool-group')?.querySelector?.('.tool-group-title')?.textContent || '';
    const extra = [tool, drawer, library].flatMap((name) => TERMS[name] || []);
    return normalize([choice.textContent, group, tool, drawer, library, extra.join(' ')].join(' '));
  }

  /**
   * Coincidencia por palabras: cada palabra buscada debe empezar alguna palabra
   * del texto. Así «via» encuentra «Vía vehicular» y «paso cebra» encuentra
   * «Paso cebra», sin que «paso» encuentre cualquier cosa que lo contenga.
   */
  function matches(choice, query) {
    const tokens = normalize(query).split(' ').filter(Boolean);
    if (!tokens.length) return true;
    const words = haystack(choice).split(' ').filter(Boolean);
    return tokens.every((token) => words.some((word) => word.startsWith(token)));
  }

  root.Normia = root.Normia || {};
  root.Normia.ToolSearch = { TERMS, SUGGESTIONS, normalize, haystack, matches };
})(typeof window !== 'undefined' ? window : globalThis);
