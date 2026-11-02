/*
 * Unidades · autoridad única de conversión física (etapa 0 de NORMIA-004).
 * Uso: node tests/php/units.mjs 8.1|8.3
 *
 * Comprueba la clase App\Core\Units contra la tabla compartida
 * tests/fixtures/units.json. La misma tabla la usa tests/js/units.mjs, de modo
 * que PHP y JavaScript no pueden divergir sin que falle una de las dos suites.
 *
 * No necesita instalación ni base de datos: Units no depende de nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { PHP } from '@php-wasm/universal';
import { repoRoot, makeReporter } from './harness.mjs';

const version = process.argv[2] || '8.3';
const report = makeReporter(version);

const fixturePath = path.join(repoRoot, 'tests/fixtures/units.json');
if (!fs.existsSync(fixturePath)) {
  report.check('La tabla compartida de unidades existe', false, fixturePath);
  process.exit(report.summary() ? 1 : 0);
}

const php = new PHP(await loadNodeRuntime(version, {
  emscriptenOptions: { processId: 660 + Number(version.replace('.', '')) },
}));
useHostFilesystem(php);

const result = await php.run({
  code: `<?php
$root = ${JSON.stringify(repoRoot)};
require $root . '/app/Core/Autoloader.php';
\\App\\Core\\Autoloader::register($root . '/app');

$fixture = json_decode((string) file_get_contents($root . '/tests/fixtures/units.json'), true);
$checks = [];
$add = function (string $label, bool $ok, string $detail = '') use (&$checks): void {
    $checks[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
};
$near = static fn (float $a, float $b, float $tolerance = 1e-12): bool => abs($a - $b) <= $tolerance;
$fmt = static fn (float $value): string => rtrim(rtrim(number_format($value, 9, ',', '.'), '0'), ',');

/* ------------------------------ constantes ------------------------------ */
$add('Admite mm, cm y m', \\App\\Core\\Units::SUPPORTED === ['mm', 'cm', 'm'], implode(', ', \\App\\Core\\Units::SUPPORTED));
$add('La unidad por defecto es cm', \\App\\Core\\Units::DEFAULT_UNIT === 'cm', \\App\\Core\\Units::DEFAULT_UNIT);
$add('La tolerancia de aplanado es 0,5 cm', \\App\\Core\\Units::TOLERANCE_CM === 0.5, (string) \\App\\Core\\Units::TOLERANCE_CM);

/* ------------------------------- factores ------------------------------- */
foreach ($fixture['units'] as $case) {
    $unit = $case['unit'];
    $values = [
        'metros por unidad' => [\\App\\Core\\Units::metersPerUnit($unit), (float) $case['metersPerUnit']],
        'centímetros por unidad' => [\\App\\Core\\Units::cmPerUnit($unit), (float) $case['cmPerUnit']],
        'unidades por metro' => [\\App\\Core\\Units::unitsPerMeter($unit), (float) $case['unitsPerMeter']],
        'tolerancia' => [\\App\\Core\\Units::tolerance($unit), (float) $case['tolerance']],
    ];
    $ok = true;
    $detail = [];
    foreach ($values as $name => $pair) {
        if (!$near($pair[0], $pair[1])) {
            $ok = false;
            $detail[] = $name . ': ' . $fmt($pair[0]) . ' (esperado ' . $fmt($pair[1]) . ')';
        }
    }
    $add('Factores de la unidad ' . $unit, $ok, $ok
        ? $fmt((float) $case['metersPerUnit']) . ' m/u · ' . $fmt((float) $case['unitsPerMeter']) . ' u/m'
        : implode(' · ', $detail));
}

/* ----------------------------- longitudes ----------------------------- */
foreach ($fixture['lengths'] as $case) {
    $unit = $case['unit'];
    $meters = \\App\\Core\\Units::toMeters((float) $case['value'], $unit);
    $expected = (float) $case['meters'];
    $back = \\App\\Core\\Units::fromMeters($meters, $unit);
    $ok = $near($meters, $expected) && $near($back, (float) $case['value'], 1e-9);
    $add($case['label'], $ok, $fmt((float) $case['value']) . ' ' . $unit . ' → ' . $fmt($meters) . ' m');
}

/* ------------------------------ superficies ------------------------------ */
foreach ($fixture['areas'] as $case) {
    $area = \\App\\Core\\Units::squareMeters((float) $case['value'], $case['unit']);
    $add($case['label'], $near($area, (float) $case['squareMeters'], 1e-9),
        $fmt((float) $case['value']) . ' u² → ' . $fmt($area) . ' m²');
}

/* --------------------------- unidad inválida --------------------------- */
$invalidOk = true;
$invalidDetail = [];
foreach ($fixture['invalidUnits'] as $value) {
    try {
        $normalized = \\App\\Core\\Units::normalize($value);
        $supported = \\App\\Core\\Units::isSupported($value);
        $factor = \\App\\Core\\Units::metersPerUnit('cm');
        if ($normalized !== 'cm' || $supported !== false || \\App\\Core\\Units::metersPerUnit($normalized) !== $factor) {
            $invalidOk = false;
            $invalidDetail[] = json_encode($value);
        }
    } catch (\\Throwable $error) {
        $invalidOk = false;
        $invalidDetail[] = json_encode($value) . ' → ' . get_class($error);
    }
}
$add('Una unidad desconocida cae a cm sin lanzar', $invalidOk,
    $invalidOk ? count($fixture['invalidUnits']) . ' casos' : implode(', ', $invalidDetail));

/* -------------------------------- escalas -------------------------------- */
$scaleOk = true;
$scaleDetail = [];
foreach ($fixture['scales'] as $case) {
    $denominator = \\App\\Core\\Units::scaleDenominator($case['scale']);
    $expected = $case['denominator'];
    $matches = $expected === null ? $denominator === null : ($denominator !== null && $near($denominator, (float) $expected));
    if (!$matches) {
        $scaleOk = false;
        $scaleDetail[] = json_encode($case['scale']);
    }
}
$add('La escala de impresión se lee y nunca se aplica a longitudes', $scaleOk,
    $scaleOk ? count($fixture['scales']) . ' casos' : implode(', ', $scaleDetail));

/* ------------------- paridad exacta con el cálculo anterior ------------------- */
// Estos cinco asertos son el seguro del paso 2: si la consolidación moviera un
// solo bit en la ruta «cm», el golden de los planos fallaría después.
$legacy = 1.0 / 100;
$exact = \\App\\Core\\Units::metersPerUnit('cm') === $legacy
    && \\App\\Core\\Units::cmPerUnit('cm') === 1.0
    && \\App\\Core\\Units::unitsPerMeter('cm') === 100.0
    && \\App\\Core\\Units::toMeters(1200.0, 'cm') === 1200.0 * $legacy
    && \\App\\Core\\Units::tolerance('cm') === 0.5
    && \\App\\Core\\Units::tolerance('cm') * \\App\\Core\\Units::cmPerUnit('cm') === 0.5;
$add('La ruta «cm» es idéntica bit a bit al cálculo anterior', $exact,
    'metersPerUnit=' . var_export(\\App\\Core\\Units::metersPerUnit('cm'), true)
    . ' · toMeters(1200)=' . var_export(\\App\\Core\\Units::toMeters(1200.0, 'cm'), true));

/* ---------------------------- invariancias ---------------------------- */
$invariant = true;
foreach (\\App\\Core\\Units::SUPPORTED as $unit) {
    $factor = \\App\\Core\\Units::metersPerUnit($unit);
    $invariant = $invariant
        && $near(\\App\\Core\\Units::unitsPerMeter($unit) * $factor, 1.0)
        && $near(\\App\\Core\\Units::cmPerUnit($unit), $factor * 100, 1e-12)
        && \\App\\Core\\Units::tolerance($unit) * \\App\\Core\\Units::cmPerUnit($unit) === \\App\\Core\\Units::TOLERANCE_CM;
}
$add('Los factores guardan sus invariancias en las tres unidades', $invariant);

$squares = true;
foreach (\\App\\Core\\Units::SUPPORTED as $unit) {
    $factor = \\App\\Core\\Units::metersPerUnit($unit);
    $squares = $squares && $near(\\App\\Core\\Units::squareMeters(4.0, $unit), (4.0 * $factor) * $factor, 1e-12);
}
$add('La superficie sale del mismo factor que la longitud', $squares);

/* --------------------------- independencia --------------------------- */
$source = (string) file_get_contents($root . '/app/Core/Units.php');
$add('Units no depende de la base, la configuración ni otros servicios',
    !preg_match('/Database|Config|Paths|Session/', $source) && !str_contains($source, 'new '),
    'archivo sin dependencias');

echo json_encode($checks, JSON_UNESCAPED_UNICODE);
`,
});

let checks = [];
try {
  checks = JSON.parse(result.text || '[]');
} catch {
  checks = [];
}

if (checks.length === 0) {
  console.error(result.text || result.errors || 'Sin salida del intérprete PHP');
  report.check('La batería de unidades se ejecutó', false, 'sin salida JSON');
} else {
  for (const item of checks) {
    report.check(item.label, item.ok === true, item.detail || '');
  }
}

try { php.exit(0); } catch { /* el proceso ya terminó */ }
process.exit(report.summary() ? 1 : 0);
