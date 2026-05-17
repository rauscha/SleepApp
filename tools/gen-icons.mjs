// Generate PWA icon PNGs from the same crescent design as public/icons/icon.svg.
// Pure Node (zlib only) so we don't add a binary image dep just for this.
// Outputs:
//   public/icons/icon-192.png            (any, transparent rounded corners)
//   public/icons/icon-512.png            (any, transparent rounded corners)
//   public/icons/icon-maskable-512.png   (maskable, full-bleed bg, art in inner 60%)
//   public/icons/apple-touch-icon.png    (180×180, no transparency, no rounded corners)

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(ICON_DIR, { recursive: true });

const BG = [0x0B, 0x0D, 0x10];
const FG = [0x7F, 0xA0, 0x98];

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.slice(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // color type: RGBA
  ihdr[10] = 0;    // compression
  ihdr[11] = 0;    // filter
  ihdr[12] = 0;    // interlace
  const rowSize = width * 4;
  const raw = Buffer.alloc(height * (rowSize + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter: none
    rgba.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Sample point at (px, py) in 512-space. Returns [r,g,b,a] 0..255.
function samplePoint(px, py, { maskable, appleTouch }) {
  // Rounded-square clip (transparent outside corners) — disabled for
  // maskable + apple-touch (those want full-bleed background).
  if (!maskable && !appleTouch) {
    const r = 96;
    const dx = Math.min(px, 512 - px);
    const dy = Math.min(py, 512 - py);
    if (dx < r && dy < r) {
      const ddx = r - dx, ddy = r - dy;
      if (ddx * ddx + ddy * ddy > r * r) return [0, 0, 0, 0];
    }
  }
  // Crescent = inside circle A and outside circle B.
  const d1sq = (px - 256) ** 2 + (py - 256) ** 2;
  const d2sq = (px - 304) ** 2 + (py - 232) ** 2;
  const inCrescent = d1sq <= 120 * 120 && d2sq > 120 * 120;
  const c = inCrescent ? FG : BG;
  return [c[0], c[1], c[2], 255];
}

// 4× supersampling for soft edges.
function renderIcon(size, opts = {}) {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) * scale;
          const py = (y + (sy + 0.5) / SS) * scale;
          const [pr, pg, pb, pa] = samplePoint(px, py, opts);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const N = SS * SS;
      const i = (y * size + x) * 4;
      if (a === 0) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
      } else {
        rgba[i]     = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
        rgba[i + 3] = Math.round(a / N);
      }
    }
  }
  return encodePNG(size, size, rgba);
}

const outputs = [
  { file: 'icon-192.png',           size: 192, opts: {} },
  { file: 'icon-512.png',           size: 512, opts: {} },
  { file: 'icon-maskable-512.png',  size: 512, opts: { maskable: true } },
  { file: 'apple-touch-icon.png',   size: 180, opts: { appleTouch: true } },
];

for (const { file, size, opts } of outputs) {
  const buf = renderIcon(size, opts);
  const out = resolve(ICON_DIR, file);
  writeFileSync(out, buf);
  console.log(`${file}  ${size}×${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}
