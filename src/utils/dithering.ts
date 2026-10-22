/** First version of the pure RGBA rendering contract; bump when output math changes. */
export const ALGORITHM_VERSION = 1;

export type DitheringMethod = 'none' | 'floyd-steinberg' | 'atkinson' | 'ordered' | 'random' | 'threshold';

/** Row-major, straight (not premultiplied), 8-bit sRGB RGBA. Never mutated. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

export interface DitheringOptions {
  /** Unsigned 32-bit Mulberry32 seed, including zero. Default: 0. */
  seed?: number;
  /** Gaussian soften AFTER dithering. Original always bypasses it. */
  soften?: boolean;
}

const METHODS: readonly string[] = ['none', 'floyd-steinberg', 'atkinson', 'ordered', 'random', 'threshold'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const GAUSSIAN = Array.from({ length: 7 }, (_, i) => Math.exp(-((i - 3) ** 2) / 2));
const gaussianSum = GAUSSIAN.reduce((sum, weight) => sum + weight, 0);
const KERNEL = GAUSSIAN.map(weight => weight / gaussianSum);

function validateBits(bits: number): void {
  if (!Number.isInteger(bits) || bits < 1 || bits > 8) {
    throw new RangeError('Bits per channel must be an integer from 1 to 8.');
  }
}

function validateImage(image: RgbaImage): void {
  const { width, height, data } = image;
  const length = width * height * 4;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 ||
      !Number.isSafeInteger(length) || !(data instanceof Uint8ClampedArray) || data.length !== length) {
    throw new RangeError('Expected positive integer dimensions and a matching RGBA byte array.');
  }
}

function quantizeByte(value: number, step: number): number {
  const level = Math.round(Math.min(255, Math.max(0, value)) / step);
  return Math.round(level * step);
}

/** Quantize to the byte that is actually emitted, not a fractional palette level. */
export function reduceBitDepth(value: number, bits: number): number {
  validateBits(bits);
  if (!Number.isFinite(value)) throw new RangeError('Channel value must be finite.');
  return quantizeByte(value, 255 / (2 ** bits - 1));
}

/** Mulberry32: 32-bit state, add 0x6D2B79F5, integer xor/multiply mixing. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Zero padding represents off-image pixels; load alpha only once per scanline. */
function readAlphaRow(data: Uint8ClampedArray, width: number, y: number, row: Uint8Array): void {
  row.fill(0);
  let source = y * width * 4 + 3;
  if (source >= data.length) return;
  for (let x = 0; x < width; x++, source += 4) row[x + 1] = data[source];
}

// Deliberately specialized hot loops. Float errors/tap order match the v1 reference;
// padded alpha/error rows eliminate edge arithmetic and repeated alpha tests per channel.
function diffuseFloydSteinberg(image: RgbaImage, output: RgbaImage, step: number): void {
  const { width, height, data } = image;
  const target = output.data;
  let current = new Float64Array((width + 2) * 3);
  let next = new Float64Array(current.length);
  let alpha = new Uint8Array(width + 2);
  let nextAlpha = new Uint8Array(alpha.length);
  readAlphaRow(data, width, 0, alpha);
  readAlphaRow(data, width, 1, nextAlpha);
  for (let y = 0; y < height; y++) {
    let index = y * width * 4;
    let position = 3;
    for (let x = 0; x < width; x++, index += 4, position += 3) {
      if (alpha[x + 1] === 0) continue;
      const right = alpha[x + 2];
      const belowLeft = nextAlpha[x];
      const below = nextAlpha[x + 1];
      const belowRight = nextAlpha[x + 2];
      for (let channel = 0; channel < 3; channel++) {
        const slot = position + channel;
        const oldValue = data[index + channel] + current[slot];
        const clamped = oldValue < 0 ? 0 : oldValue > 255 ? 255 : oldValue;
        const level = Math.round(clamped / step);
        const outputByte = Math.round(level * step);
        target[index + channel] = outputByte;
        const error = oldValue - outputByte;
        if (right) current[slot + 3] += error * (7 / 16);
        if (belowLeft) next[slot - 3] += error * (3 / 16);
        if (below) next[slot] += error * (5 / 16);
        if (belowRight) next[slot + 3] += error * (1 / 16);
      }
    }
    const recycled = current;
    current = next;
    next = recycled;
    next.fill(0);
    const recycledAlpha = alpha;
    alpha = nextAlpha;
    nextAlpha = recycledAlpha;
    readAlphaRow(data, width, y + 2, nextAlpha);
  }
}

function diffuseAtkinson(image: RgbaImage, output: RgbaImage, step: number): void {
  const { width, height, data } = image;
  const target = output.data;
  let current = new Float64Array((width + 3) * 3);
  let next = new Float64Array(current.length);
  let nextNext = new Float64Array(current.length);
  let alpha = new Uint8Array(width + 3);
  let nextAlpha = new Uint8Array(alpha.length);
  let nextNextAlpha = new Uint8Array(alpha.length);
  readAlphaRow(data, width, 0, alpha);
  readAlphaRow(data, width, 1, nextAlpha);
  readAlphaRow(data, width, 2, nextNextAlpha);
  for (let y = 0; y < height; y++) {
    let index = y * width * 4;
    let position = 3;
    for (let x = 0; x < width; x++, index += 4, position += 3) {
      if (alpha[x + 1] === 0) continue;
      const right = alpha[x + 2];
      const rightRight = alpha[x + 3];
      const belowLeft = nextAlpha[x];
      const below = nextAlpha[x + 1];
      const belowRight = nextAlpha[x + 2];
      const belowBelow = nextNextAlpha[x + 1];
      for (let channel = 0; channel < 3; channel++) {
        const slot = position + channel;
        const oldValue = data[index + channel] + current[slot];
        const clamped = oldValue < 0 ? 0 : oldValue > 255 ? 255 : oldValue;
        const level = Math.round(clamped / step);
        const outputByte = Math.round(level * step);
        target[index + channel] = outputByte;
        const error = (oldValue - outputByte) * (1 / 8);
        if (right) current[slot + 3] += error;
        if (rightRight) current[slot + 6] += error;
        if (belowLeft) next[slot - 3] += error;
        if (below) next[slot] += error;
        if (belowRight) next[slot + 3] += error;
        if (belowBelow) nextNext[slot] += error;
      }
    }
    const recycled = current;
    current = next;
    next = nextNext;
    nextNext = recycled;
    nextNext.fill(0);
    const recycledAlpha = alpha;
    alpha = nextAlpha;
    nextAlpha = nextNextAlpha;
    nextNextAlpha = recycledAlpha;
    readAlphaRow(data, width, y + 3, nextNextAlpha);
  }
}

/** Sigma 1, radius 3, clamp-to-edge, float premultiplied RGBA; bounded seven-row cache. */
function softenPattern(image: RgbaImage): RgbaImage {
  const { width, height, data } = image;
  const result: RgbaImage = { width, height, data: new Uint8ClampedArray(data.length) };
  const cache = new Map<number, Float64Array>();
  const horizontalRow = (y: number): Float64Array => {
    const cached = cache.get(y);
    if (cached) return cached;
    const row = new Float64Array(width * 4);
    for (let x = 0; x < width; x++) {
      for (let offset = -3; offset <= 3; offset++) {
        const sx = Math.min(width - 1, Math.max(0, x + offset));
        const source = (y * width + sx) * 4;
        const weight = KERNEL[offset + 3];
        const alpha = data[source + 3];
        for (let channel = 0; channel < 3; channel++) {
          row[x * 4 + channel] += data[source + channel] * (alpha / 255) * weight;
        }
        row[x * 4 + 3] += alpha * weight;
      }
    }
    cache.set(y, row);
    return row;
  };
  for (let y = 0; y < height; y++) {
    const rows = KERNEL.map((_, i) => horizontalRow(Math.min(height - 1, Math.max(0, y + i - 3))));
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      let alpha = 0;
      for (let k = 0; k < 7; k++) alpha += rows[k][x * 4 + 3] * KERNEL[k];
      const alphaByte = Math.round(alpha);
      result.data[index + 3] = alphaByte;
      if (alphaByte === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let k = 0; k < 7; k++) value += rows[k][x * 4 + channel] * KERNEL[k];
        result.data[index + channel] = Math.round(value * 255 / alpha);
      }
    }
    for (const rowY of cache.keys()) if (rowY < y - 2) cache.delete(rowY);
  }
  return result;
}

/**
 * Pure synchronous RGBA transform, usable in Node or a worker. Always returns owned bytes.
 * Validate even bypassed settings. Original copies all bytes (including hidden RGB).
 * Other modes leave hidden RGB unchanged unless soften is on. Random consumes one
 * Mulberry32 draw per RGB channel of EVERY pixel, including transparent pixels;
 * alpha consumes no draws. Changing an alpha mask therefore does not shift the noise.
 */
export function applyDithering(
  image: RgbaImage,
  method: DitheringMethod,
  bitDepth: number,
  { seed = 0, soften = false }: DitheringOptions = {},
): RgbaImage {
  validateImage(image);
  validateBits(bitDepth);
  if (!METHODS.includes(method)) throw new RangeError(`Unknown dithering method: ${method}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new RangeError('Seed must be an unsigned 32-bit integer.');
  }
  if (typeof soften !== 'boolean') throw new TypeError('Soften must be a boolean.');
  const output: RgbaImage = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  if (method === 'none') return output;
  const step = 255 / (2 ** bitDepth - 1);
  if (bitDepth < 8) {
    if (method === 'floyd-steinberg') {
      diffuseFloydSteinberg(image, output, step);
    } else if (method === 'atkinson') {
      diffuseAtkinson(image, output, step);
    } else {
      const random = mulberry32(seed);
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const index = (y * image.width + x) * 4;
          const orderedOffset = ((BAYER[(y % 4) * 4 + x % 4] + 0.5) / 16 - 0.5) * step;
          for (let channel = 0; channel < 3; channel++) {
            const noise = method === 'random' ? (random() - 0.5) * step : method === 'ordered' ? orderedOffset : 0;
            if (image.data[index + 3] !== 0) {
              output.data[index + channel] = quantizeByte(image.data[index + channel] + noise, step);
            }
          }
        }
      }
    }
  }
  return soften ? softenPattern(output) : output;
}

// Preserve the named algorithm entry points using the same validated pure pipeline.
export const floydSteinbergDither = (image: RgbaImage, bits: number): RgbaImage => applyDithering(image, 'floyd-steinberg', bits);
export const atkinsonDither = (image: RgbaImage, bits: number): RgbaImage => applyDithering(image, 'atkinson', bits);
export const orderedDither = (image: RgbaImage, bits: number): RgbaImage => applyDithering(image, 'ordered', bits);
export const randomDither = (image: RgbaImage, bits: number, seed = 0): RgbaImage => applyDithering(image, 'random', bits, { seed });
export const thresholdDither = (image: RgbaImage, bits: number): RgbaImage => applyDithering(image, 'threshold', bits);
