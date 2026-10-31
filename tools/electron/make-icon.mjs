/*
 * Genera el icono de la aplicación de escritorio a partir del logo.
 *
 * Electron exige un PNG de 512×512 (y un .ico de 256 para Windows). El logo del
 * proyecto mide 384×384, así que se escala con un filtro bilineal y se guardan
 * las dos medidas. No se descarga nada: solo se usa el PNG del repositorio.
 *
 * Uso: node tools/electron/make-icon.mjs <logo.png> <carpeta-destino>
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [, , source, target] = process.argv;
if (!source || !target) {
  console.error('Uso: node tools/electron/make-icon.mjs <logo.png> <carpeta-destino>');
  process.exit(1);
}

/** Reescala con interpolación bilineal y devuelve un PNG cuadrado. */
export function resize(source, size) {
  const image = PNG.sync.read(fs.readFileSync(source));
  const out = new PNG({ width: size, height: size });
  const scaleX = image.width / size;
  const scaleY = image.height / size;
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(image.width - 1, x0 + 1);
      const fx = sourceX - x0;
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = image.data[(y0 * image.width + x0) * 4 + channel] * (1 - fx) + image.data[(y0 * image.width + x1) * 4 + channel] * fx;
        const bottom = image.data[(y1 * image.width + x0) * 4 + channel] * (1 - fx) + image.data[(y1 * image.width + x1) * 4 + channel] * fx;
        out.data[index + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return out;
}

const directory = path.resolve(target);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'icon.png'), PNG.sync.write(resize(source, 512)));
fs.writeFileSync(path.join(directory, 'icon-256.png'), PNG.sync.write(resize(source, 256)));
console.log(`Iconos en ${directory} (512 y 256 px)`);
