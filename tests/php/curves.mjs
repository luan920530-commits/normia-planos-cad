/*
 * Longitud de trazos curvos (etapa 0 · corrección de curvas de NORMIA-004).
 * Uso: node tests/php/curves.mjs 8.1|8.3
 *
 * Antes el servidor medía la cuerda y el editor el arco: la misma tubería con
 * curva aparecía como 4,00 m en el informe de redes y 6,28 m en pantalla.
 * Ahora los dos miden el arco. Esta suite fija ese acuerdo y comprueba que la
 * corrección no arrastró nada más:
 *
 *   - la recta sigue midiendo exactamente lo mismo (comparación bit a bit),
 *   - la longitud se convierte bien en mm, cm y m,
 *   - la escala de impresión no toca la longitud,
 *   - un arco degenerado vuelve a medirse como recta,
 *   - el informe de redes suma el arco y la caída de tensión lo acompaña,
 *   - el rótulo del SVG exportado dice la misma cifra que el editor.
 */
import { startApp, makeReporter } from './harness.mjs';

const version = process.argv[2] || '8.3';
const report = makeReporter(version);

const app = await startApp(version);

const php = `
$consulta = \\App\\Services\\DesignValidator::normalizeArray([
    'format' => 3,
    'canvas' => [
        'width' => 1200, 'height' => 800, 'grid' => 20,
        'unit' => 'cm', 'scale' => '1:100', 'background' => '#ffffff', 'occupancy' => 0,
    ],
    'layers' => [['id' => 'capa_planta', 'name' => 'Planta', 'visible' => true, 'locked' => false]],
    'elements' => [],
    'groups' => [],
]);

$elemento = static function (array $extra): array {
    return array_merge([
        'id' => 'el_prueba', 'type' => 'pipe', 'layerId' => 'capa_planta',
        'x' => 100.0, 'y' => 100.0, 'w' => 400.0, 'h' => 200.0,
        'rotation' => 0, 'color' => '#0891b2', 'stroke' => 3, 'opacity' => 1,
        'label' => '', 'locked' => false,
    ], $extra);
};

// Semicircunferencia: cuerda 400, flecha 200 → arco pi * 200 = 628,318…
$recta = $elemento(['id' => 'el_recta', 'network' => 'agua_fria',
    'points' => [['x' => 0.0, 'y' => 0.0], ['x' => 400.0, 'y' => 0.0]]]);
$arco = $elemento(['id' => 'el_arco', 'network' => 'agua_fria',
    'points' => [['x' => 0.0, 'y' => 200.0], ['x' => 400.0, 'y' => 200.0]],
    'curves' => [['kind' => 'arc', 'through' => ['x' => 200.0, 'y' => 0.0]], null]]);

$checks = [];
$add = function (string $label, bool $ok, string $detail = '') use (&$checks): void {
    $checks[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
};
$near = static fn (float $a, float $b, float $t = 1e-9): bool => abs($a - $b) <= $t;
$fmt = static fn (float $v): string => rtrim(rtrim(number_format($v, 9, ',', '.'), '0'), ',');

/* ------------------------ el arco cuenta, la recta no cambia ------------------------ */
$largoRecta = \\App\\Services\\MepCalculator::length($recta);
$largoArco = \\App\\Services\\MepCalculator::length($arco);
$manual = hypot(400.0, 0.0);

$add('La tubería curva se mide por su arco', $near($largoArco, M_PI * 200.0),
    $fmt($largoArco) . ' unidades · cuerda 400');
$add('MepCalculator y PathGeometry miden igual', $largoArco === \\App\\Services\\PathGeometry::length($arco['points'], $arco['curves']),
    'misma función, mismo resultado');
$add('La recta sigue midiendo lo mismo, bit a bit', $largoRecta === $manual,
    $fmt($largoRecta) . ' unidades');

/* -------------------------------- tres unidades -------------------------------- */
$esperado = ['mm' => M_PI * 200.0 / 1000.0, 'cm' => M_PI * 200.0 / 100.0, 'm' => M_PI * 200.0];
$unidadesOk = true;
$detalle = [];
foreach ($esperado as $unit => $metros) {
    $canvas = ['unit' => $unit, 'scale' => '1:100'];
    $medido = \\App\\Services\\MepCalculator::lengthMeters($arco, $canvas);
    $coherente = \\App\\Services\\MepCalculator::lengthMeters($recta, $canvas) === ($manual * \\App\\Core\\Units::metersPerUnit($unit));
    if (!$near($medido, $metros, 1e-9) || !$coherente) {
        $unidadesOk = false;
        $detalle[] = $unit . ': ' . $fmt($medido) . ' (esperado ' . $fmt($metros) . ')';
    }
}
$add('La conversión a metros del arco es correcta en mm, cm y m', $unidadesOk,
    $unidadesOk ? 'mm ' . $fmt($esperado['mm']) . ' · cm ' . $fmt($esperado['cm']) . ' · m ' . $fmt($esperado['m']) : implode(' · ', $detalle));

/* --------------------------- escala e independencia --------------------------- */
$escala = \\App\\Services\\MepCalculator::lengthMeters($arco, ['unit' => 'cm', 'scale' => '1:50']);
$add('La escala de impresión no altera la longitud', $escala === \\App\\Services\\MepCalculator::lengthMeters($arco, ['unit' => 'cm', 'scale' => '1:200']),
    $fmt($escala) . ' m con 1:50 y con 1:200');

/* ------------------------------ casos degenerados ------------------------------ */
$plano = $elemento(['network' => 'agua_fria',
    'points' => [['x' => 0.0, 'y' => 0.0], ['x' => 400.0, 'y' => 0.0]],
    'curves' => [['kind' => 'arc', 'through' => ['x' => 200.0, 'y' => 0.0]], null]]);
$add('Un arco degenerado se mide como recta', \\App\\Services\\MepCalculator::length($plano) === $manual,
    $fmt(\\App\\Services\\MepCalculator::length($plano)) . ' unidades');

$sinPuntos = $elemento(['w' => 300.0, 'h' => 400.0]);
$add('Sin puntos conserva la diagonal del cajón', \\App\\Services\\MepCalculator::length($sinPuntos) === 500.0,
    $fmt(\\App\\Services\\MepCalculator::length($sinPuntos)) . ' unidades');

$sinCurvas = $elemento(['network' => 'agua_fria', 'curves' => null,
    'points' => [['x' => 0.0, 'y' => 0.0], ['x' => 300.0, 'y' => 400.0]]]);
$add('Sin curvas declaradas no se inventa ninguna', \\App\\Services\\MepCalculator::length($sinCurvas) === 500.0,
    $fmt(\\App\\Services\\MepCalculator::length($sinCurvas)) . ' unidades');

/* ------------------------------- informe de redes ------------------------------- */
$conArco = $consulta;
$conArco['elements'] = [$arco];
$conRecta = $consulta;
$conRecta['elements'] = [$recta];
$redArco = \\App\\Services\\MepCalculator::summary($conArco)['hydraulic'][0] ?? [];
$redRecta = \\App\\Services\\MepCalculator::summary($conRecta)['hydraulic'][0] ?? [];
$add('El informe de redes suma el arco', ($redArco['lengthM'] ?? null) === 6.28 && ($redRecta['lengthM'] ?? null) === 4.0,
    'arco ' . ($redArco['lengthM'] ?? 'sin dato') . ' m · recta ' . ($redRecta['lengthM'] ?? 'sin dato') . ' m');

/* ------------------------------ caída de tensión ------------------------------ */
$conduit = static function (array $points, ?array $curves): array {
    return [
        'id' => 'el_c1', 'type' => 'conduit', 'layerId' => 'capa_planta',
        'x' => 100.0, 'y' => 100.0, 'w' => 400.0, 'h' => 200.0,
        'rotation' => 0, 'color' => '#2563eb', 'stroke' => 3, 'opacity' => 1,
        'label' => '', 'locked' => false, 'circuit' => 'C1', 'voltage' => 220,
        'phases' => 1, 'gauge' => '12', 'points' => $points, 'curves' => $curves,
    ];
};
$carga = [
    'id' => 'el_carga', 'type' => 'cad_elec_outlet_220', 'layerId' => 'capa_planta',
    'x' => 120.0, 'y' => 120.0, 'w' => 40.0, 'h' => 40.0, 'rotation' => 0,
    'color' => '#2563eb', 'stroke' => 2, 'opacity' => 1, 'label' => '', 'locked' => false,
    'circuit' => 'C1', 'load' => 2000,
];
$electricoRecto = $consulta;
$electricoRecto['elements'] = [
    $conduit([['x' => 0.0, 'y' => 0.0], ['x' => 400.0, 'y' => 0.0]], null),
    $carga,
];
$electricoCurvo = $consulta;
$electricoCurvo['elements'] = [
    $conduit([['x' => 0.0, 'y' => 200.0], ['x' => 400.0, 'y' => 200.0]],
        [['kind' => 'arc', 'through' => ['x' => 200.0, 'y' => 0.0]], null]),
    $carga,
];
$circRecto = \\App\\Services\\MepCalculator::summary($electricoRecto)['electrical'][0] ?? [];
$circCurvo = \\App\\Services\\MepCalculator::summary($electricoCurvo)['electrical'][0] ?? [];
$largoRecto = (float) ($circRecto['lengthM'] ?? 0);
$largoCurvo = (float) ($circCurvo['lengthM'] ?? 0);
$proporcion = $largoRecto > 0 ? $largoCurvo / $largoRecto : 0.0;
$add('La caída de tensión acompaña al arco, no a la cuerda',
    $proporcion > 1.5 && $proporcion < 1.6
    && (float) ($circCurvo['drop'] ?? 0) > (float) ($circRecto['drop'] ?? 0),
    'longitud x' . $fmt($proporcion) . ' · caída ' . ($circRecto['drop'] ?? 'sin dato') . ' % → ' . ($circCurvo['drop'] ?? 'sin dato') . ' %');

/* ------------------------------- rótulo del SVG ------------------------------- */
$svgArco = \\App\\Services\\SvgExporter::render($conArco, [], false);
$svgRecta = \\App\\Services\\SvgExporter::render($conRecta, [], false);
$add('El rótulo del SVG dice la longitud del arco',
    str_contains($svgArco, '6,3 m') && !str_contains($svgArco, '4,0 m'),
    'arco rotulado 6,3 m');
$add('El rótulo del SVG de una recta no cambia',
    str_contains($svgRecta, '4,0 m'),
    'recta rotulada 4,0 m');

/* ----------------------------- una sola definición ----------------------------- */
$fuente = (string) file_get_contents(BASE_PATH . '/app/Services/MepCalculator.php');
$add('MepCalculator no vuelve a sumar hypot por su cuenta',
    substr_count($fuente, 'hypot(') === 0,
    'delega en PathGeometry');
$svgFuente = (string) file_get_contents(BASE_PATH . '/app/Services/SvgExporter.php');
$add('El rótulo del exportador usa MepCalculator::length',
    str_contains($svgFuente, 'MepCalculator::length($element)'),
    'sin sumas propias en el rótulo de redes');

echo json_encode($checks, JSON_UNESCAPED_UNICODE);
`;

let checks = [];
let result = null;
try {
  result = await app.install({ demo: true }).then(() => app.run(php));
  checks = JSON.parse(result.text || '[]');
} catch (error) {
  console.error('--- salida PHP ---');
  console.error(String(result?.text || '').slice(0, 3000));
  console.error(String(result?.errors || '').slice(0, 2000));
  report.check('La suite de curvas se pudo ejecutar', false, error.message);
}

try {
  await app.close();
} catch { /* la instalación temporal ya se limpió */ }

if (!Array.isArray(checks) || checks.length === 0) {
  report.check('La suite de curvas se ejecutó', false, 'sin salida JSON');
} else {
  for (const item of checks) {
    report.check(item.label, item.ok === true, item.detail || '');
  }
}

process.exit(report.summary() ? 1 : 0);
