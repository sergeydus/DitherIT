import { ProcessingError } from './render-contract';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 16_000_000;
export const MAX_SIDE = 8192;
const HEADER_BYTES = 256 * 1024;
export type RasterFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif' | 'bmp';

export function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new ProcessingError('decode-failed');
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) throw new ProcessingError('image-too-large');
}

/** Bounded signature/dimension preflight. Browser decoding is the final validity check.
 * MIME/extension are advisory. AVIF dimensions are checked after decode; no animation parser.
 */
export async function inspectImage(file: Blob): Promise<RasterFormat> {
  if (file.size > MAX_FILE_BYTES) throw new ProcessingError('file-too-large');
  if (file.size === 0) throw new ProcessingError('decode-failed');
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  const invalid = () => { throw new ProcessingError('decode-failed'); };
  if (bytes.length >= 8 && bytes.subarray(0, 8).every((value, i) => value === [137, 80, 78, 71, 13, 10, 26, 10][i])) {
    if (bytes.length < 33 || text(12, 4) !== 'IHDR' || view.getUint32(8) !== 13) invalid();
    validateDimensions(view.getUint32(16), view.getUint32(20));
    return 'png';
  }
  if (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a') {
    if (bytes.length < 13) invalid();
    validateDimensions(view.getUint16(6, true), view.getUint16(8, true));
    return 'gif';
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let position = 2;
    while (position < bytes.length) {
      if (bytes[position++] !== 0xFF) invalid();
      while (bytes[position] === 0xFF) position++;
      const marker = bytes[position++];
      if (marker === 0xDA || marker === 0xD9 || marker === undefined) break;
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      if (position + 2 > bytes.length) break;
      const length = view.getUint16(position);
      if (length < 2) invalid();
      if (position + length > bytes.length) break; // bounded header may end inside a legal segment
      if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) {
        if (length < 8) invalid();
        validateDimensions(view.getUint16(position + 5), view.getUint16(position + 3));
        break;
      }
      position += length;
    }
    return 'jpeg';
  }
  if (text(0, 2) === 'BM') {
    if (bytes.length < 26) invalid();
    const dib = view.getUint32(14, true);
    if (dib === 12) validateDimensions(view.getUint16(18, true), view.getUint16(20, true));
    else if (dib >= 40) validateDimensions(view.getInt32(18, true), Math.abs(view.getInt32(22, true)));
    else invalid();
    return 'bmp';
  }
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const uint24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    for (let position = 12; position + 8 <= bytes.length;) {
      const kind = text(position, 4);
      const size = view.getUint32(position + 4, true);
      const payload = position + 8;
      if (payload + size > bytes.length) break;
      if (kind === 'VP8X') {
        if (size < 10) invalid();
        validateDimensions(uint24(payload + 4) + 1, uint24(payload + 7) + 1);
        break;
      }
      if (kind === 'VP8L') {
        if (size < 5 || bytes[payload] !== 0x2F) invalid();
        const packed = view.getUint32(payload + 1, true);
        validateDimensions((packed & 0x3FFF) + 1, ((packed >>> 14) & 0x3FFF) + 1);
        break;
      }
      if (kind === 'VP8 ') {
        if (size < 10 || text(payload + 3, 3) !== '\x9d\x01\x2a') invalid();
        validateDimensions(view.getUint16(payload + 6, true) & 0x3FFF, view.getUint16(payload + 8, true) & 0x3FFF);
        break;
      }
      position = payload + size + (size & 1);
    }
    return 'webp';
  }
  if (bytes.length >= 16 && text(4, 4) === 'ftyp') {
    const end = Math.min(bytes.length, view.getUint32(0));
    if (end < 16) invalid();
    const brands = [text(8, 4)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(text(i, 4));
    if (brands.includes('avif') || brands.includes('avis')) return 'avif';
  }
  throw new ProcessingError('unsupported-type');
}
