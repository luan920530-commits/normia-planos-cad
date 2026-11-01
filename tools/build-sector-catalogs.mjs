/*
 * Genera y verifica los catálogos sectoriales de Normia Planos CAD.
 *
 * Es un script de mantenimiento: los paquetes ya llevan el resultado en
 * resources/*.json y tools/ no se distribuye. Todo el contenido vive en
 * tools/sector-data/ y este archivo solo lo aplica, así que ejecutarlo dos
 * veces deja los catálogos igual (idempotente).
 *
 *   node tools/build-sector-catalogs.mjs            # escribe los catálogos
 *   node tools/build-sector-catalogs.mjs --dry-run  # solo informa
 *
 * Contrato de los dibujos CAD (igual que el resto del catálogo):
 *  · lienzo 100 × 100, sin texto, sin recursos externos y sin colores fijos:
 *    todo usa currentColor para que el color de la familia lo ponga el editor;
 *  · trazo 2, remates redondeados y relleno duotono al 6–12 %;
 *  · la descripción cierra con el aviso de que es esquemático y se verifica
 *    en sitio.
 *
 * Señales propias (services, location y traffic): marco o forma de la familia
 * con pictograma en blanco, sin texto incrustado salvo la palabra PARE de la
 * señal de detención.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svg, NOTICE } from './sector-data/draw.mjs';
import { EDS } from './sector-data/cad-eds.mjs';
import { DROGUERIA } from './sector-data/cad-drogueria.mjs';
import { COMERCIO } from './sector-data/cad-comercio.mjs';
import { TRAFICO, TRAFFIC_ALIASES } from './sector-data/traffic-signs.mjs';
import { EMERGENCIA, SALUD } from './sector-data/cad-emergencia.mjs';
import { BRIGADA, BRIGADE_ALIASES } from './sector-data/service-signs.mjs';
import { VEHICULOS, VIAS, SENALES_VIALES, BICIS } from './sector-data/cad-vias.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CAD_PATH = path.join(ROOT, 'resources/cad-objects.json');
const SIGN_PATH = path.join(ROOT, 'resources/service-signs.json');

/** Familias completas: definen la familia y su lista de objetos. */
const FAMILIES = { ...EDS, ...DROGUERIA, ...EMERGENCIA, ...VIAS, ...SENALES_VIALES, ...BICIS };
/** Familias ampliadas: la familia ya existe y solo se añaden objetos. */
const EXTENSIONS = { ...COMERCIO, ...SALUD, ...VEHICULOS };

/**
 * Nombres que se repetían entre familias: se desambigua el rótulo sin tocar
 * la clave del objeto, para que la búsqueda no muestre dos tarjetas iguales.
 */
const RENAMES = {
  cad_caf_chair: 'Silla de cafetería',
  cad_chair: 'Silla de oficina',
  cad_drg_counter: 'Mostrador de atención (droguería)',
  cad_ret_counter: 'Mostrador de atención (comercio)',
  cad_drg_display: 'Vitrina de exhibición (droguería)',
  cad_ret_vitrine: 'Vitrina de exhibición (comercio)',
  cad_drg_packing: 'Zona de empaque (droguería)',
  cad_mkt_bagger: 'Zona de empaque (supermercado)',
  cad_drg_patient_chair: 'Silla de ruedas (droguería)',
  cad_hosp_wheelchair: 'Silla de ruedas (hospital)',
  cad_drg_pos: 'Caja registradora (droguería)',
  cad_ret_pos: 'Caja registradora (comercio)',
  cad_drg_washbasin: 'Lavamanos (droguería)',
  cad_washbasin: 'Lavamanos (baño)',
  cad_gym_treadmill: 'Caminadora (gimnasio)',
  cad_sport_treadmill: 'Caminadora (deportes)',
  cad_hyd_tank: 'Tanque de almacenamiento (hidráulico)',
  cad_tank: 'Tanque de almacenamiento (industrial)',
  cad_kitchen_hood: 'Campana extractora (cocina)',
  cad_rest_hood: 'Campana extractora (restaurante)',
  cad_mkt_drinks: 'Nevera de bebidas (supermercado)',
  cad_rest_fridge: 'Nevera de bebidas (restaurante)',
  cad_mkt_loading: 'Muelle de carga (supermercado)',
  cad_wh_dock: 'Muelle de carga (bodega)',
};

const SORT = (entries) => Object.fromEntries(
  Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
);

function main() {
  const dry = process.argv.includes('--dry-run');
  const cad = JSON.parse(fs.readFileSync(CAD_PATH, 'utf8'));
  const signs = JSON.parse(fs.readFileSync(SIGN_PATH, 'utf8'));
  let addedObjects = 0;
  let addedFamilies = 0;
  let addedSigns = 0;

  const writeFamily = (key, family, objects) => {
    if (!cad.categories[key] && family.label) {
      cad.categories[key] = {
        label: family.label,
        short: family.short,
        description: family.description,
        ...(family.color ? { color: family.color } : {}),
      };
      addedFamilies += 1;
    }
    for (const [objectKey, name, description, body] of objects) {
      const exists = Boolean(cad.objects[objectKey]);
      cad.objects[objectKey] = {
        category: key,
        name,
        description: `${description} ${NOTICE}`,
        reference: 'CAD',
        color: family.color ?? cad.categories[key]?.color ?? '#334155',
        svg: body.startsWith('<svg') ? body : svg(body),
      };
      if (!exists) addedObjects += 1;
    }
  };

  for (const [key, family] of Object.entries(FAMILIES)) writeFamily(key, family, family.objects);
  for (const [key, family] of Object.entries(EXTENSIONS)) {
    writeFamily(key, family, family.extra ?? family.objects);
  }

  let renamed = 0;
  for (const [objectKey, name] of Object.entries(RENAMES)) {
    if (!cad.objects[objectKey]) throw new Error(`No existe el objeto a renombrar: ${objectKey}`);
    if (cad.objects[objectKey].name !== name) {
      cad.objects[objectKey].name = name;
      renamed += 1;
    }
  }

  cad.objects = SORT(cad.objects);
  cad.categories = SORT(cad.categories);

  for (const [key, family] of Object.entries(TRAFICO)) {
    if (!signs.categories[key]) {
      signs.categories[key] = {
        label: family.label,
        short: family.short,
        description: family.description,
      };
    }
    for (const [code, name, description, body] of family.signs) {
      const exists = Boolean(signs.signs[code]);
      signs.signs[code] = {
        name,
        category: key,
        description: `${description} Pictograma propio de Normia para el plano; no es una señal oficial.`,
        aliases: TRAFFIC_ALIASES[code] ?? [],
        svg: body.startsWith('<svg') ? body : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`,
      };
      if (!exists) addedSigns += 1;
    }
  }
  for (const [key, family] of Object.entries(BRIGADA)) {
    if (!signs.categories[key]) {
      signs.categories[key] = {
        label: family.label,
        short: family.short,
        description: family.description,
      };
    }
    for (const [code, name, description, body] of family.signs) {
      const exists = Boolean(signs.signs[code]);
      signs.signs[code] = {
        name,
        category: key,
        description: `${description} Pictograma propio de Normia para el plano; no es una señal oficial.`,
        aliases: BRIGADE_ALIASES[code] ?? [],
        svg: body.startsWith('<svg') ? body : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`,
      };
      if (!exists) addedSigns += 1;
    }
  }
  // Dos nombres iguales en el mismo catálogo confunden la búsqueda: se avisa.
  const repeated = Object.entries(cad.objects).reduce((map, [key, object]) => {
    map[object.name] = [...(map[object.name] ?? []), key];
    return map;
  }, {});
  const duplicates = Object.entries(repeated).filter(([, keys]) => keys.length > 1);
  if (duplicates.length) {
    throw new Error(`Nombres CAD repetidos: ${duplicates.map(([name, keys]) => `${name} (${keys.join(', ')})`).join(' · ')}`);
  }

  signs.signs = SORT(signs.signs);
  signs.categories = SORT(signs.categories);

  if (!dry) {
    fs.writeFileSync(CAD_PATH, `${JSON.stringify(cad, null, 2)}\n`, 'utf8');
    fs.writeFileSync(SIGN_PATH, `${JSON.stringify(signs, null, 2)}\n`, 'utf8');
  }
  console.log(`${dry ? '[dry-run] ' : ''}CAD: ${Object.keys(cad.objects).length} objetos · `
    + `${Object.keys(cad.categories).length} familias (+${addedObjects} objetos, +${addedFamilies} familias)`);
  console.log(`Señales: ${Object.keys(signs.signs).length} · `
    + `${Object.keys(signs.categories).length} familias (+${addedSigns} señales)`);
  console.log(`Nombres desambiguados: ${renamed}`);
}

main();
