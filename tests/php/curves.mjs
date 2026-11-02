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
/*
 * Desde NORMIA-006 §4 la geometría se guarda siempre en centímetros y la
 * unidad del plano es una etiqueta de lectura. Antes esta prueba esperaba que
 * la misma cifra midiera distinto en mm, cm y m; ahora el acuerdo es el
 * contrario y es el que protege al usuario: cambiar de unidad no altera nada.
 */
$esperado = M_PI * 200.0 / 100.0;
$unidadesOk = true;
$detalle = [];
foreach (['mm', 'cm', 'm'] as $unit) {
    $canvas = ['unit' => $unit, 'scale' => '1:100'];
    $medido = \\App\\Services\\MepCalculator::lengthMeters($arco, $canvas);
    $coherente = \\App\\Services\\MepCalculator::lengthMeters($recta, $canvas) === ($manual / 100.0);
    if (!$near($medido, $esperado, 1e-12) || !$coherente) {
        $unidadesOk = false;
        $detalle[] = $unit . ': ' . $fmt($medido) . ' (esperado ' . $fmt($esperado) . ')';
    }
}
$add('La longitud del arco no depende de la unidad declarada del plano', $unidadesOk,
    $unidadesOk ? 'mm, cm y m dan ' . $fmt($esperado) . ' m' : implode(' · ', $detalle));

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

// El mismo dibujo declarado en milímetros: la cifra cambia de unidad, no de
// criterio. Si el exportador midiera la cuerda, aquí diría 0,4 m.
$enMilimetros = $consulta;
$enMilimetros['canvas']['unit'] = 'mm';
$enMilimetros['elements'] = [$arco];
$svgMilimetros = \\App\\Services\\SvgExporter::render($enMilimetros, [], false);
$add('El rótulo del SVG sigue el arco también en milímetros',
    str_contains($svgMilimetros, '0,6 m') && !str_contains($svgMilimetros, '0,4 m'),
    'arco en mm rotulado 0,6 m');

/* --------------------- compatibilidad con planos antiguos ---------------------
 * Un plano anterior al formato 5 declara sus números en la unidad del lienzo.
 * Al entrar se convierten una sola vez a centímetros y la etiqueta se conserva,
 * de modo que un plano de 12 m sigue midiendo 12 m y se sigue leyendo en metros.
 * El validador sigue siendo estricto con lo que no entiende.
 */
$aceptadas = true;
$detalleAceptadas = [];
// Milímetros, centímetros y metros del mismo plano. La cuadrícula se declara
// como entero en su unidad porque el lienzo la exige entera (5–100 cm).
$planos = [
    'mm' => ['factor' => 0.1, 'grid' => 200],
    'cm' => ['factor' => 1.0, 'grid' => 20],
    'm' => ['factor' => 100.0, 'grid' => 0.2],
];
foreach ($planos as $unidadPlano => $plano) {
    $factor = $plano['factor'];
    $variante = $consulta;
    $variante['canvas']['unit'] = $unidadPlano;
    // El mismo plano físico, escrito en la unidad que declara.
    $variante['canvas']['width'] = (int) round(1200 / $factor);
    $variante['canvas']['height'] = (int) round(800 / $factor);
    $variante['canvas']['grid'] = $plano['grid'];
    $variante['elements'] = [$elemento([
        'network' => 'agua_fria',
        'x' => 100 / $factor, 'y' => 100 / $factor, 'w' => 400 / $factor, 'h' => 200 / $factor,
        'points' => [['x' => 0.0, 'y' => 0.0], ['x' => 400 / $factor, 'y' => 0.0]],
    ])];
    try {
        $devuelto = \\App\\Services\\DesignValidator::normalizeArray($variante);
        $ancho = (int) $devuelto['canvas']['width'];
        $largo = \\App\\Services\\MepCalculator::length($devuelto['elements'][0]);
        if ($devuelto['canvas']['unit'] !== $unidadPlano || $ancho !== 1200 || $near($largo, 400.0) === false) {
            $aceptadas = false;
            $detalleAceptadas[] = $unidadPlano . ': ' . $ancho . ' cm · ' . $fmt($largo) . ' cm';
        }
    } catch (\\Throwable $error) {
        $aceptadas = false;
        $detalleAceptadas[] = $unidadPlano . ': ' . $error->getMessage();
    }
}
$add('Un plano en mm o m entra convertido a centímetros y conserva su etiqueta', $aceptadas,
    $aceptadas ? '1 200 cm y 400 cm en las tres unidades' : implode(' · ', $detalleAceptadas));

$rechazadas = 0;
$detalleRechazo = [];
foreach (['M', 'pulgada', ''] as $unidadRara) {
    $variante = $consulta;
    $variante['canvas']['unit'] = $unidadRara;
    try {
        \App\Services\DesignValidator::normalizeArray($variante);
        $detalleRechazo[] = json_encode($unidadRara) . ' se aceptó';
    } catch (\Throwable $error) {
        $rechazadas++;
    }
}
$add('Una unidad inválida se rechaza en vez de reinterpretarse', $rechazadas === 3,
    $rechazadas === 3 ? 'M, pulgada y cadena vacía rechazadas' : implode(' · ', $detalleRechazo));

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
