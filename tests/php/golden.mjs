/*
 * Golden de regresión numérica (etapa 0 · paso 2 de NORMIA-004).
 * Uso:
 *   node tests/php/golden.mjs 8.1|8.3            verifica
 *   node tests/php/golden.mjs 8.3 --write        regenera el fixture
 *
 * Fija, sobre los cuatro pisos de la demostración y sobre un plano sintético con
 * tubería curva, todo lo que produce un número en la aplicación: el informe del
 * auditor (con y sin ocupación declarada), la cobertura de extintores, el resumen
 * de redes y el SVG exportado.
 *
 * Sirve para una sola cosa: demostrar que consolidar los conversores de unidad en
 * `App\Core\Units` no mueve ni un dígito. El fixture se capturó con el código
 * anterior a la delegación; cualquier diferencia es un fallo, no una mejora.
 *
 * Los valores se guardan como un mapa de rutas («travel.longestM» → valor) para
 * que un fallo diga exactamente qué cifra se movió, en vez de «el hash cambió».
 * Las cadenas se guardan como longitud + hash: se comprueban los textos sin
 * arrastrar cientos de líneas de mensajes al repositorio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startApp, makeReporter, repoRoot } from './harness.mjs';

const version = process.argv[2] || '8.3';
const write = process.argv.includes('--write');
const report = makeReporter(version);
const goldenPath = path.join(repoRoot, 'tests/fixtures/golden/numeric.json');

const app = await startApp(version);

const php = `
$flatten = static function (array $data): array {
    $flat = [];
    $walk = null;
    $walk = static function ($node, string $path) use (&$walk, &$flat): void {
        if (is_array($node)) {
            if ($node === []) {
                $flat[$path . '.__vacío'] = 0;
                return;
            }
            foreach ($node as $key => $value) {
                $walk($value, $path === '' ? (string) $key : $path . '.' . $key);
            }
            return;
        }
        if (is_bool($node)) {
            $flat[$path] = $node ? 1 : 0;
            return;
        }
        if ($node === null) {
            $flat[$path] = null;
            return;
        }
        if (is_string($node)) {
            // El extintor sugerido lleva un id efímero generado con microtime y
            // random_int: no es comparable entre ejecuciones. Se enmascara solo
            // ese patrón; el resto de cadenas se compara por longitud y hash.
            if (preg_match('/^ext_new_[0-9a-f]{6}$/D', $node) === 1) {
                $flat[$path] = 'id-efímero';
                return;
            }
            $flat[$path] = 's:' . strlen($node) . ':' . substr(sha1($node), 0, 12);
            return;
        }
        $flat[$path] = $node;
    };
    $walk($data, '');
    ksort($flat, SORT_STRING);
    return $flat;
};

$svgHash = static function (array $design, array $meta): array {
    $svg = App\\Services\\SvgExporter::render($design, $meta, true);
    // El pie imprime el año en curso: se enmascara para que el golden no caduque
    // el 1 de enero.
    $svg = str_replace(date('Y'), '{AÑO}', $svg);
    return ['sha256' => hash('sha256', $svg), 'bytes' => strlen($svg)];
};

$meta = static fn (array $floor, int $index): array => [
    'project_name' => 'Golden',
    'floor_name' => 'Piso ' . $index,
    'level' => (string) $index,
    'responsible' => 'Responsable',
    'site' => 'Sede',
    'workplace' => 'Área',
    'exported_by' => 'Prueba',
    'version' => 1,
    'saved_at' => '2026-01-01 00:00:00',
];

$out = ['version' => App\\Core\\Migrations::VERSION, 'floors' => [], 'synthetic' => []];

$floors = App\\Core\\Database::query('SELECT id, name, design_json FROM floors ORDER BY id ASC');
$index = 0;
foreach ($floors as $floor) {
    $index++;
    $design = App\\Services\\DesignValidator::normalizeJson((string) $floor['design_json']);
    $out['floors']['piso' . $index] = [
        'unidad' => (string) $design['canvas']['unit'],
        'escala' => (string) $design['canvas']['scale'],
        'elementos' => count($design['elements']),
        'auditSinOcupacion' => $flatten(App\\Services\\PlanAudit::analyze($design, 0)),
        'auditConOcupacion' => $flatten(App\\Services\\PlanAudit::analyze($design, 25)),
        'extintores' => $flatten(App\\Services\\ExtinguisherCoverage::analyze($design)),
        'redes' => $flatten(App\\Services\\MepCalculator::summary($design)),
        'svg' => $svgHash($design, $meta($floor, $index)),
    ];
}

/* ---------------- plano sintético: longitud de tubería con arco ----------------
 * MepCalculator::length() mide el arco, no la cuerda: delega en
 * PathGeometry::length(), igual que Geometry.pathLength() en el editor. Se
 * fijan los dos caminos por separado (Mep y PathGeometry) para que el golden
 * demuestre que siguen coincidiendo y que la recta no se movió.
 *
 * Antes de esta corrección el servidor sumaba hypot entre vértices e ignoraba
 * los arcos: 4 m cada vez que el editor decía 6,283… m.
 */
$pipe = static fn (string $id, float $y, float $h, array $points, ?array $curves = null): array => array_filter([
    'id' => $id,
    'type' => 'pipe',
    'layerId' => 'capa_planta',
    'x' => 100.0, 'y' => $y, 'w' => 400.0, 'h' => $h,
    'rotation' => 0, 'color' => '#0891b2', 'stroke' => 3, 'opacity' => 1,
    'label' => '', 'locked' => false, 'network' => 'agua_fria', 'points' => $points,
    'curves' => $curves,
], static fn ($value): bool => $value !== null);

$synthetic = [
    'format' => 3,
    'canvas' => [
        'width' => 1200, 'height' => 800, 'grid' => 20,
        'unit' => 'cm', 'scale' => '1:100', 'background' => '#ffffff', 'occupancy' => 0,
    ],
    'layers' => [['id' => 'capa_planta', 'name' => 'Planta', 'visible' => true, 'locked' => false]],
    'elements' => [
        // Recta de 400 unidades = 4 m.
        $pipe('el_recta', 100.0, 2.0, [['x' => 0.0, 'y' => 0.0], ['x' => 400.0, 'y' => 0.0]]),
        // Semicircunferencia de 400 unidades de cuerda (4 m) y 200 de flecha:
        // el arco mide pi * 200 = 628,3 unidades (6,28 m) y la cuerda 400 (4 m).
        $pipe('el_arco', 100.0, 200.0, [['x' => 0.0, 'y' => 200.0], ['x' => 400.0, 'y' => 200.0]], [
            ['kind' => 'arc', 'through' => ['x' => 200.0, 'y' => 0.0]],
            null,
        ]),
    ],
    'groups' => [],
];
$synthetic = App\\Services\\DesignValidator::normalizeArray($synthetic);

$porId = [];
foreach ($synthetic['elements'] as $element) {
    $porId[(string) $element['id']] = $element;
}
$arco = $porId['el_arco'];
$curvas = is_array($arco['curves'] ?? null) ? $arco['curves'] : null;
$out['synthetic']['tuberia'] = [
    'unidad' => (string) $synthetic['canvas']['unit'],
    'rectaUnidades' => App\\Services\\MepCalculator::length($porId['el_recta']),
    'rectaMetros' => App\\Services\\MepCalculator::lengthMeters($porId['el_recta'], $synthetic['canvas']),
    'arcoUnidadesMep' => App\\Services\\MepCalculator::length($arco),
    'arcoMetrosMep' => App\\Services\\MepCalculator::lengthMeters($arco, $synthetic['canvas']),
    // El mismo trazo medido directamente con PathGeometry, que es lo que usa el
    // editor: debe dar exactamente lo mismo que MepCalculator.
    'arcoUnidadesPath' => App\\Services\\PathGeometry::length($arco['points'], $curvas),
    'arcoMetrosPath' => App\\Core\\Units::toMeters(App\\Services\\PathGeometry::length($arco['points'], $curvas), 'cm'),
];

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
`;

let payload = null;
let result = null;
try {
  result = await app.install({ demo: true }).then(() => app.run(php));
  payload = JSON.parse(result.text || 'null');
} catch (error) {
  payload = null;
  report.check('El golden se pudo calcular', false, error.message);
  console.error('--- salida PHP ---');
  console.error(String(result?.text || '').slice(0, 3000));
  console.error(String(result?.errors || '').slice(0, 2000));
}

try {
  await app.close();
} catch { /* la instalación temporal ya se limpió */ }

if (!payload) {
  if (!report.summary()) process.exit(1);
}

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

if (write) {
  fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
  fs.writeFileSync(goldenPath, serialize(payload), 'utf8');
  const keys = Object.values(payload.floors).reduce((total, floor) => (
    total + Object.keys(floor.auditSinOcupacion).length
    + Object.keys(floor.auditConOcupacion).length
    + Object.keys(floor.extintores).length
    + Object.keys(floor.redes).length
  ), 0);
  console.log(`Golden escrito en ${path.relative(repoRoot, goldenPath)} · ${keys} valores numéricos · ${Object.keys(payload.floors).length} pisos`);
  process.exit(0);
}

if (!fs.existsSync(goldenPath)) {
  report.check('Existe el golden de referencia', false, path.relative(repoRoot, goldenPath));
  process.exit(report.summary() ? 1 : 0);
}

const expected = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

/** Compara dos mapas de valores y devuelve las diferencias como texto. */
function diffMaps(label, before, after) {
  const problems = [];
  const missing = Object.keys(before).filter((key) => !(key in after));
  const added = Object.keys(after).filter((key) => !(key in before));
  for (const key of missing) problems.push(`desapareció ${label}.${key}`);
  for (const key of added) problems.push(`apareció ${label}.${key}`);
  for (const key of Object.keys(before)) {
    if (!(key in after)) continue;
    const a = before[key];
    const b = after[key];
    const same = (a === null || b === null) ? a === b : a === b;
    if (!same) problems.push(`${label}.${key}: ${a} → ${b}`);
  }
  return problems;
}

const problems = [];
for (const [name, floor] of Object.entries(expected.floors)) {
  const current = payload.floors?.[name];
  if (!current) {
    problems.push(`desapareció el piso ${name}`);
    continue;
  }
  for (const field of ['unidad', 'escala', 'elementos']) {
    if (floor[field] !== current[field]) problems.push(`${name}.${field}: ${floor[field]} → ${current[field]}`);
  }
  for (const field of ['auditSinOcupacion', 'auditConOcupacion', 'extintores', 'redes']) {
    problems.push(...diffMaps(`${name}.${field}`, floor[field], current[field]));
  }
  if (floor.svg.sha256 !== current.svg.sha256) {
    problems.push(`El SVG de ${name} cambió (${floor.svg.bytes} → ${current.svg.bytes} bytes)`);
  }
}

const syntheticProblems = diffMaps('synthetic.tuberia', expected.synthetic.tuberia, payload.synthetic.tuberia);
problems.push(...syntheticProblems);

report.check('Los cuatro pisos de la demo están cubiertos',
  Object.keys(expected.floors).length === 4 && Object.keys(payload.floors).length === 4,
  `${Object.keys(payload.floors).length} pisos`);

const totalValues = Object.values(expected.floors).reduce((total, floor) => (
  total + Object.keys(floor.auditSinOcupacion).length
  + Object.keys(floor.auditConOcupacion).length
  + Object.keys(floor.extintores).length
  + Object.keys(floor.redes).length
), 0);

report.check('Ningún valor numérico del auditor se mueve', problems.every((line) => !line.includes('audit')),
  problems.filter((line) => line.includes('audit')).slice(0, 4).join(' · ')
  || `${totalValues} valores idénticos`);
report.check('Ningún valor de extintores ni de redes se mueve',
  problems.every((line) => !line.includes('extintores') && !line.includes('redes')),
  problems.filter((line) => line.includes('extintores') || line.includes('redes')).slice(0, 4).join(' · '));
report.check('El SVG exportado de los cuatro pisos es idéntico',
  problems.every((line) => !line.includes('SVG')),
  problems.filter((line) => line.includes('SVG')).join(' · ') || 'hash sha-256 igual');
const curva = payload?.synthetic?.tuberia ?? {};
report.check('La tubería curva se mide por su arco, como en el editor',
  syntheticProblems.length === 0,
  syntheticProblems.slice(0, 4).join(' · ')
  || `arco ${curva.arcoMetrosMep} m · recta ${curva.rectaMetros} m`);
report.check('MepCalculator y PathGeometry dan la misma longitud',
  curva.arcoUnidadesMep === curva.arcoUnidadesPath && curva.arcoMetrosMep === curva.arcoMetrosPath,
  `Mep ${curva.arcoMetrosMep} m · PathGeometry ${curva.arcoMetrosPath} m`);
report.check('El golden coincide por completo con la referencia', problems.length === 0,
  problems.length === 0 ? `${totalValues} valores · 4 SVG` : problems.slice(0, 5).join(' · '));

process.exit(report.summary() ? 1 : 0);
