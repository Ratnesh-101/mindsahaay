// Generates the PWA icon PNGs into public/icons using only Node built-ins.
// Run: node src/shared/lib/pwa/scripts/generateIcons.mjs
// Motif: a mint crescent on deep moss green (the calming night-mode palette).
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const outDir = path.join(root, "public", "icons");

const BG = [0x19, 0x44, 0x3c];
const FG = [0x74, 0xc6, 0x9d];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Returns [r,g,b,a] (0..1 coverage in a) for a point in unit square coordinates. */
function sample(x, y, maskable) {
  // Rounded-square mask for "any" icons; maskable icons are full bleed.
  if (!maskable) {
    const r = 0.18;
    const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
    if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  }
  // Maskable safe zone is the central 80%, so the motif stays within a radius of 0.4 either way.
  const R = maskable ? 0.24 : 0.28;
  const inA = (x - 0.5) ** 2 + (y - 0.5) ** 2 <= R * R;
  const bx = 0.5 + R * 0.42;
  const by = 0.5 - R * 0.3;
  const inB = (x - bx) ** 2 + (y - by) ** 2 <= (R * 0.82) ** 2;
  return inA && !inB ? [...FG, 1] : [...BG, 1];
}

function render(size, maskable) {
  const ss = 3;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const s = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, maskable);
          r += s[0] * s[3];
          g += s[1] * s[3];
          b += s[2] * s[3];
          a += s[3];
        }
      }
      const o = (py * size + px) * 4;
      const n = ss * ss;
      buf[o] = a ? Math.round(r / a) : 0;
      buf[o + 1] = a ? Math.round(g / a) : 0;
      buf[o + 2] = a ? Math.round(b / a) : 0;
      buf[o + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, buf);
}

mkdirSync(outDir, { recursive: true });
const targets = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(path.join(outDir, name), render(size, maskable));
  console.log("wrote", name);
}
