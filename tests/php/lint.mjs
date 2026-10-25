/* Verificación de sintaxis de todos los archivos PHP con el parser real (PHP 8.1/8.3). */
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { PHP } from '@php-wasm/universal';
import { repoRoot } from './harness.mjs';

const version = process.argv[2] || '8.3';
const php = new PHP(await loadNodeRuntime(version, { emscriptenOptions: { processId: 610 + Number(version.replace('.', '')) } }));
useHostFilesystem(php);
const result = await php.run({
  code: `<?php
$root = ${JSON.stringify(repoRoot)};
$bad = [];
$count = 0;
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
foreach ($it as $file) {
    if ($file->getExtension() !== 'php') continue;
    if (str_contains($file->getPathname(), '/node_modules/')) continue;
    $count++;
    try {
        token_get_all(file_get_contents($file->getPathname()), TOKEN_PARSE);
    } catch (\\ParseError $error) {
        $bad[] = str_replace($root . '/', '', $file->getPathname()) . ':' . $error->getLine() . ' · ' . $error->getMessage();
    }
}
echo 'PHP ' . PHP_VERSION . ' · ' . $count . ' archivos PHP revisados' . PHP_EOL;
echo $bad ? implode(PHP_EOL, $bad) : 'Sin errores de sintaxis';
`,
});
console.log(result.text || result.errors || '');
const failed = /ParseError|error de sintaxis|syntax error/i.test(result.text || '') || String(result.text || '').includes('ParseError');
try { php.exit(0); } catch {}
process.exit(failed ? 1 : 0);
