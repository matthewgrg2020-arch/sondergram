import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function faderIcon(x, y, size) {
  const bg = [10, 10, 11, 255];
  const fg = [212, 208, 200, 255];
  const n = size / 32;
  const inRect = (rx, ry, rw, rh) => x >= rx * n && x < (rx + rw) * n && y >= ry * n && y < (ry + rh) * n;
  if (inRect(8, 12, 2, 14) || inRect(6, 12, 6, 4)) return fg;
  if (inRect(16, 6, 2, 20) || inRect(14, 6, 6, 4)) return fg;
  if (inRect(24, 18, 2, 8) || inRect(22, 18, 6, 4)) return fg;
  return bg;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const size of [180, 192, 512]) {
  const buf = png(size, (x, y, s) => faderIcon(x, y, s));
  writeFileSync(join(root, "public", `icon-${size}.png`), buf);
  if (size === 180) writeFileSync(join(root, "public", "__grok", "icon-180.png"), buf);
}
console.log("icons written");
