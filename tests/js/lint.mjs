/* Comprueba la sintaxis de todos los archivos JavaScript del proyecto. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const targets = [];

const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) targets.push(full);
  }
};

walk(path.join(root, 'assets'));
walk(path.join(root, 'tests'));
walk(path.join(root, 'tools'));

let failures = 0;
for (const file of targets.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.log(`✗ ${path.relative(root, file)}\n${(result.stderr || '').trim()}`);
  }
}

console.log(`\nJavaScript: ${targets.length} archivos revisados.`);
console.log(failures === 0 ? 'Sin errores de sintaxis.' : `${failures} archivo(s) con errores.`);
process.exitCode = failures === 0 ? 0 : 1;
