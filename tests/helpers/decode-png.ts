import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

/** Independent test decoder for the export contract: PNG RGBA8, filter None, no interlace. */
export function decodePng(input: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const png = Buffer.from(input);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width = 0, height = 0, ended = false;
  const compressed: Buffer[] = [];
  while (offset < png.length) {
    assert.ok(offset + 12 <= png.length);
    const length = png.readUInt32BE(offset);
    assert.ok(offset + length + 12 <= png.length);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    // Bitwise reference CRC, deliberately independent of the encoder's lookup table.
    let crc = 0xffffffff;
    for (const byte of png.subarray(offset + 4, offset + 8 + length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    assert.equal(png.readUInt32BE(offset + 8 + length), (crc ^ 0xffffffff) >>> 0, `${type} CRC`);
    if (type === 'IHDR') {
      assert.equal(offset, 8); assert.equal(length, 13);
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0]);
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') { assert.equal(length, 0); ended = true; }
    else assert.fail(`Unexpected chunk ${type}`);
    offset += length + 12;
    if (ended) break;
  }
  assert.ok(ended && width > 0 && height > 0 && compressed.length > 0);
  assert.equal(offset, png.length);
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height);
  const pixels = new Uint8Array(stride * height);
  for (let row = 0; row < height; row++) {
    assert.equal(raw[row * (stride + 1)], 0, 'None filter');
    pixels.set(raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)), row * stride);
  }
  return { width, height, pixels };
}
