/*
 * Convierte un PNG cuadrado en un archivo .ico para los accesos de Windows.
 *
 * El formato permite incrustar el PNG tal cual (Vista y posteriores), así que
 * no hace falta ninguna librería de imágenes: cabecera de 6 bytes, una entrada
 * de directorio de 16 bytes y los datos del PNG.
 */
import fs from 'node:fs';

const [, , source, target] = process.argv;
if (!source || !target) {
  console.error('Uso: node make-ico.mjs <origen.png> <destino.ico>');
  process.exit(1);
}
const png = fs.readFileSync(source);
if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) {
  throw new Error('El archivo de origen no es un PNG válido.');
}
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== height || width < 16 || width > 256) {
  throw new Error('El PNG debe ser cuadrado y medir entre 16 y 256 px.');
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reservado
header.writeUInt16LE(1, 2); // tipo: icono
header.writeUInt16LE(1, 4); // una imagen

const entry = Buffer.alloc(16);
entry.writeUInt8(width >= 256 ? 0 : width, 0);
entry.writeUInt8(height >= 256 ? 0 : height, 1);
entry.writeUInt8(0, 2); // sin paleta
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4); // planos
entry.writeUInt16LE(32, 6); // bits por píxel
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12); // desplazamiento de los datos
fs.writeFileSync(target, Buffer.concat([header, entry, png]));
console.log(`Icono ${width}×${height} → ${target}`);
