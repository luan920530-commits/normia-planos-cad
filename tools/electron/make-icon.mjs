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

/**
 * ICO clásico (mapa de bits de 32 bits) con varias medidas.
 *
 * No se usa PNG dentro del ICO: aunque Windows lo admite, el instalador de
 * Inno Setup y algunas herramientas de empaquetado esperan el formato clásico.
 * Cada entrada es una cabecera BITMAPINFOHEADER con la altura duplicada (imagen
 * + máscara) y las filas de abajo hacia arriba.
 */
export function buildIco(sizes, image) {
  const entries = [];
  for (const size of sizes) {
    const pixels = PNG.sync.write(resize(image, size));
    const data = PNG.sync.read(pixels);
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8);
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    header.writeUInt32LE(size * size * 4, 20);
    const rows = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const from = ((size - 1 - y) * size + x) * 4;
        const to = (y * size + x) * 4;
        rows[to] = data.data[from + 2];
        rows[to + 1] = data.data[from + 1];
        rows[to + 2] = data.data[from];
        rows[to + 3] = data.data[from + 3];
      }
    }
    const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
    entries.push({ size, payload: Buffer.concat([header, rows, mask]) });
  }
  const directoryHeader = Buffer.alloc(6);
  directoryHeader.writeUInt16LE(0, 0);
  directoryHeader.writeUInt16LE(1, 2);
  directoryHeader.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach((entry, index) => {
    const base = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(entry.payload.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.payload.length;
  });
  return Buffer.concat([directoryHeader, directory, ...entries.map((entry) => entry.payload)]);
}

/** ICNS con las medidas estándar (PNG incrustado, formato de Apple desde 10.7). */
export function buildIcns(image) {
  const types = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 512],
  ];
  const blocks = types.map(([type, size]) => {
    const payload = PNG.sync.write(resize(image, size));
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(payload.length + 8, 4);
    return Buffer.concat([header, payload]);
  });
  const body = Buffer.concat(blocks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

const directory = path.resolve(target);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'icon.png'), PNG.sync.write(resize(source, 512)));
fs.writeFileSync(path.join(directory, 'icon-256.png'), PNG.sync.write(resize(source, 256)));
fs.writeFileSync(path.join(directory, 'icon.ico'), buildIco([16, 32, 48, 64, 128, 256], source));
fs.writeFileSync(path.join(directory, 'icon.icns'), buildIcns(source));
console.log(`Iconos en ${directory} (png 512, png 256, ico y icns)`);
