import { ProcessingError, type ExportRequest, type ExportReply } from '../lib/render-contract';

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function chunk(type: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}

/** PNG RGBA8, filter None, zlib DEFLATE. Never round-trip through premultiplied canvas storage. */
export async function encodePng(request: ExportRequest): Promise<ExportReply> {
  const { width, height } = request;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 8192 || height > 8192 || width * height > 16_000_000 || request.pixels.byteLength !== width * height * 4) {
    throw new ProcessingError('export-failed');
  }
  if (typeof CompressionStream === 'undefined') throw new ProcessingError('unsupported-browser');
  const pixels = new Uint8Array(request.pixels);
  // Pull rows on demand: compression backpressure bounds the uncompressed staging memory.
  let row = 0;
  const rows = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (row === height) { controller.close(); return; }
      const bytes = new Uint8Array(width * 4 + 1); // leading zero is PNG's None filter
      bytes.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), 1);
      row++;
      controller.enqueue(bytes);
    },
  });
  const compressed = await new Response(rows.pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  const header = new Uint8Array(13);
  const dimensions = new DataView(header.buffer);
  dimensions.setUint32(0, width); dimensions.setUint32(4, height);
  header[8] = 8; header[9] = 6; // 8-bit RGBA; compression/filter/interlace methods are zero
  const blob = new Blob([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(compressed)), chunk('IEND', new Uint8Array(0)),
  ], { type: 'image/png' });
  return { kind: 'exported', exportId: request.exportId, blob };
}
