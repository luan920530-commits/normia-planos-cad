/*
 * Comprueba que la aplicación funcione sin conexión: ningún archivo que se
 * sirva al navegador puede pedir recursos ni datos a otros dominios.
 *
 * Se revisan las vistas, los estilos, los scripts y los catálogos. Se permiten
 * los espacios de nombres XML (w3.org) y las atribuciones de licencia, que son
 * texto informativo y nunca se descargan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowed = [
  /^https?:\/\/www\.w3\.org\//,
  /^https?:\/\/www\.gnu\.org\//,
  /^https?:\/\/creativecommons\.org\//,
  /^https?:\/\/commons\.wikimedia\.org\/wiki\/File:/,
  /^https?:\/\/github\.com\/karlnorling\/iso-safety-signs/,
  /^https:\/\/tu-dominio\//,
];

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'coverage', 'paquetes', 'licenses'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(php|js|mjs|css|json|html|txt|htaccess|svg)$/.test(entry.name) || entry.name === '.htaccess') files.push(full);
  }
};
for (const directory of ['app', 'assets', 'resources']) walk(path.join(root, directory));
for (const file of ['bootstrap.php', 'index.php', 'docs/LEEME-PRIMERO.txt']) files.push(path.join(root, file));

// Patrones que sí provocan una petición de red (los demás enlaces son texto).
const requestPatterns = [
  /\bfetch\s*\(\s*['"`]https?:/i,
  /\bnew\s+WebSocket\s*\(/i,
  /\bXMLHttpRequest\b[^\n]*https?:/i,
  /\b(?:src|href)\s*=\s*["']https?:/i,
  /url\(\s*["']?https?:/i,
  /@import\s+(?:url\()?["']?https?:/i,
];
const serverPatterns = [
  /\bcurl_(?:init|exec|multi_exec)\s*\(/i,
  /\bfsockopen\s*\(/i,
  /\bstream_socket_client\s*\(/i,
  /\bget_headers\s*\(/i,
  /\bdns_get_record\s*\(/i,
  /\bfile_get_contents\s*\(\s*['"]https?:/i,
  /\bheader\s*\(\s*['"]Location:\s*https?:/i,
];

let failures = 0;
let checked = 0;
for (const file of files.sort()) {
  const text = fs.readFileSync(file, 'utf8');
  checked += 1;
  const relative = path.relative(root, file);
  for (const pattern of requestPatterns) {
    const match = text.match(pattern);
    if (match) {
      failures += 1;
      console.log(`✗ ${relative} hace una petición externa: ${String(match[0]).slice(0, 80)}`);
    }
  }
  for (const pattern of serverPatterns) {
    const match = text.match(pattern);
    if (match) {
      failures += 1;
      console.log(`✗ ${relative} abre una conexión desde el servidor: ${String(match[0]).slice(0, 80)}`);
    }
  }
  // Los enlaces de documentación o atribución deben apuntar a hosts conocidos.
  for (const match of text.matchAll(/https?:\/\/[^"'\s<>)\\]+/g)) {
    if (!allowed.some((rule) => rule.test(match[0]))) {
      failures += 1;
      console.log(`✗ ${relative} enlaza a un dominio no permitido: ${match[0].slice(0, 90)}`);
    }
  }
}

console.log(`\nSin conexión: ${checked} archivos revisados.`);
console.log(failures === 0 ? 'Ningún recurso ni dato externo.' : `${failures} referencia(s) externas.`);
process.exitCode = failures === 0 ? 0 : 1;
