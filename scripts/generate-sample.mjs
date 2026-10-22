// Original procedural artwork for DitherIT, dedicated to the public domain (CC0-1.0).
// Run from the repository root: node scripts/generate-sample.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const width = 1200, height = 800;
const rows = Buffer.alloc((width * 4 + 1) * height);
const byte = value => Math.max(0, Math.min(255, Math.round(value)));
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const t = y / height;
  let color = [245 - t * 37, 234 - t * 33, 215 - t * 29];
  if (x < 144) { const gray = 255 * y / (height - 1); color = [gray, gray, gray]; }
  const dx = (x - 470) / 236, dy = (y - 300) / 236;
  if (dx * dx + dy * dy < 1) {
    const shade = Math.sqrt(1 - dx * dx - dy * dy);
    color = [145 + 100 * shade - 26 * dy, 70 + 112 * shade + 20 * dx, 125 + 50 * shade - 45 * dx];
  }
  if (x >= 810 && x < 1140 && y >= 90 && y < 660) {
    // Fine deterministic grain over a teal/indigo ramp; no external source material.
    const noise = (((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0) % 31) - 15;
    color = [24 + noise + y / 18, 57 + noise + x / 22, 92 + noise + y / 12];
    if ((x + 2 * y) % 47 === 0) color = [201, 226, 213];
  }
  if (x >= 220 && x < 740 && y >= 610 && y < 720) {
    const line = (x + y) % 10 < 2;
    color = line ? [32, 37, 47] : [238, 212, 161];
  }
  if (y >= 752 && x >= 200 && x < 1140) {
    const palette = [[219, 118, 94], [218, 167, 72], [120, 160, 144], [71, 111, 139], [104, 82, 130], [35, 40, 50]];
    color = palette[Math.min(5, Math.floor((x - 200) * 6 / 940))];
  }
  const offset = y * (width * 4 + 1) + 1 + x * 4;
  rows.set([...color.map(byte), 255], offset);
}
function chunk(name, data) {
  const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(name, 4); data.copy(bytes, 8);
  let crc = 0xffffffff;
  for (const b of bytes.subarray(4, bytes.length - 4)) {
    crc ^= b;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4); return bytes;
}
const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
await mkdir('public/samples', { recursive: true });
await writeFile('public/samples/ditherit-study.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
