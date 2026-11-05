/*
 * Pruebas del núcleo en C dentro de la suite general.
 *
 * Compila con las advertencias estrictas de siempre y ejecuta los tres
 * binarios de prueba: el núcleo de cálculo, el documento y el SVG. Lo que se
 * comprueba aquí es que los tres corren y que cada uno llega al final de su
 * lista; las cifras exactas las revisa cada programa por dentro.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { makeReporter, repoRoot } from '../../tests/php/harness.mjs';

const report = makeReporter('Núcleo en C');
const dir = path.join(repoRoot, 'native');

const run = (args) => spawnSync('make', args, { cwd: dir, encoding: 'utf8' });

const build = run(['clean']);
report.check('La compilación arranca de cero', build.status === 0, 'make clean');

const compiled = run(['CFLAGS=-std=c11 -O2 -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wstrict-prototypes -Werror']);
report.check('El núcleo compila sin una sola advertencia',
  compiled.status === 0 && !/warning:/.test(`${compiled.stdout}${compiled.stderr}`),
  'CFLAGS estrictos');

const tested = run(['test']);
const salida = `${tested.stdout}${tested.stderr}`;
report.check('Las pruebas del núcleo, del documento y del SVG pasan',
  tested.status === 0, 'make test');

/* Cada programa cierra con «N/M comprobaciones correctas»: se busca el que cae
 * dentro de su propia sección, porque los tres usan la misma frase. */
const seccion = (titulo) => {
  const partes = salida.split(`\n· ${titulo}`);
  if (partes.length < 2) return null;
  const cuerpo = partes[1].split('\n· ')[0];
  const match = cuerpo.match(/(\d+)\/(\d+) comprobaciones correctas/);
  return match ? { hechas: Number(match[1]), total: Number(match[2]) } : null;
};

for (const [titulo, etiqueta] of [['Pruebas del núcleo', 'Núcleo de cálculo'],
  ['Pruebas del documento', 'Documento'], ['Pruebas del SVG', 'SVG con escala física']]) {
  const cifras = seccion(titulo);
  report.check(`${etiqueta}: todas sus comprobaciones correctas`,
    cifras !== null && cifras.hechas === cifras.total && cifras.total > 0,
    cifras ? `${cifras.hechas}/${cifras.total}` : 'sin resumen');
}

report.check('El programa responde a --check sin abrir ventana',
  /norma nativo 0\.1\.0 · ok/.test(salida) || /núcleo nativo 0\.1\.0 · ok/.test(salida), '--check');

process.exit(report.summary());
