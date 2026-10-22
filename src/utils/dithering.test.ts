import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_VERSION, applyDithering, reduceBitDepth,
  type DitheringMethod, type RgbaImage,
} from './dithering';
import gradientGolden from './fixtures/gradient-8x8.v1.json';

const METHODS: DitheringMethod[] = ['none', 'threshold', 'floyd-steinberg', 'atkinson', 'ordered', 'random'];
const DIFFUSION = ['floyd-steinberg', 'atkinson'] as const;

describe('versioned 8x8 RGB gradient goldens (frozen before specialization)', () => {
  for (const method of METHODS) {
    it.each([1, 3] as const)(`${method}: exact RGBA output at %i bits`, bits => {
      const source: RgbaImage = {
        width: gradientGolden.width,
        height: gradientGolden.height,
        data: new Uint8ClampedArray(Buffer.from(gradientGolden.sourceRgbaHex, 'hex')),
      };
      expect(ALGORITHM_VERSION).toBe(gradientGolden.algorithmVersion);
      const output = applyDithering(source, method, bits, {
        seed: gradientGolden.seed, soften: gradientGolden.soften,
      });
      // Fixed bytes, not computed by the reference or an auto-updated snapshot.
      expect(Buffer.from(output.data).toString('hex')).toBe(gradientGolden.expected[method][bits]);
    });
  }
});

function rgba(width: number, height: number, values: number[]): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(values) };
}

function gray(values: number[], width = values.length): RgbaImage {
  return rgba(width, values.length / width, values.flatMap(value => [value, value, value, 255]));
}

function reds(image: RgbaImage): number[] {
  return Array.from(image.data).filter((_, index) => index % 4 === 0);
}

// Independent full-image reference, deliberately different from scanline error buffers.
function referenceDiffusion(image: RgbaImage, bits: number, method: typeof DIFFUSION[number]): RgbaImage {
  const working = Array.from(image.data);
  const result = new Uint8ClampedArray(image.data);
  const step = 255 / (2 ** bits - 1);
  const taps = method === 'floyd-steinberg'
    ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]
    : [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];
  for (let pixel = 0; pixel < image.width * image.height; pixel++) {
    if (image.data[pixel * 4 + 3] === 0) continue;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    for (let channel = 0; channel < 3; channel++) {
      const index = pixel * 4 + channel;
      const old = working[index];
      const byte = Math.round(Math.round(Math.min(255, Math.max(0, old)) / step) * step);
      result[index] = byte;
      for (const [dx, dy, weight] of taps) {
        const nx = x + dx;
        const ny = y + dy;
        const neighbor = (ny * image.width + nx) * 4;
        if (nx >= 0 && nx < image.width && ny < image.height && image.data[neighbor + 3] !== 0) {
          working[neighbor + channel] += (old - byte) * weight;
        }
      }
    }
  }
  return { ...image, data: result };
}

// Direct 7x7 convolution, independent of the production separable row cache.
function referenceGaussian(image: RgbaImage): RgbaImage {
  const weights = Array.from({ length: 7 }, (_, k) => Math.exp(-((k - 3) ** 2) / 2));
  const normalization = weights.reduce((a, b) => a + b, 0) ** 2;
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const sums = [0, 0, 0, 0];
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const sx = Math.min(image.width - 1, Math.max(0, x + dx));
          const sy = Math.min(image.height - 1, Math.max(0, y + dy));
          const index = (sy * image.width + sx) * 4;
          const weight = weights[dy + 3] * weights[dx + 3] / normalization;
          const alpha = image.data[index + 3];
          sums[3] += weight * alpha;
          for (let channel = 0; channel < 3; channel++) {
            sums[channel] += weight * alpha * image.data[index + channel] / 255;
          }
        }
      }
      const index = (y * image.width + x) * 4;
      data[index + 3] = Math.round(sums[3]);
      if (data[index + 3] !== 0) {
        for (let channel = 0; channel < 3; channel++) data[index + channel] = Math.round(sums[channel] * 255 / sums[3]);
      }
    }
  }
  return { ...image, data };
}

describe('AC-01: pure RGBA and true Original', () => {
  it('runs without ImageData or browser globals, with a pinned algorithm version', () => {
    expect(typeof globalThis.ImageData).toBe('undefined');
    expect(ALGORITHM_VERSION).toBe(1);
  });

  it('copies a 3x2 source byte-for-byte, bypassing threshold and soften', () => {
    const source = rgba(3, 2, [
      50, 85, 100, 255, 37, 98, 201, 128, 77, 88, 99, 0,
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 1,
    ]);
    const before = source.data.slice();
    const result = applyDithering(source, 'none', 1, { soften: true });
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.data.buffer).not.toBe(source.data.buffer);
    result.data[0] = 0;
    expect(source.data).toEqual(before);
  });

  it.each(METHODS)('%s never mutates its input, even when softened', method => {
    const source = gray([0, 37, 128, 240], 2);
    const before = source.data.slice();
    const output = applyDithering(source, method, 3, { soften: true, seed: 42 });
    expect(source.data).toEqual(before);
    expect(output.data.buffer).not.toBe(source.data.buffer);
  });
});

describe('AC-02: post-dither premultiplied Gaussian soften', () => {
  it('distinguishes post-dither soften from pre-dither blur with a fixed fixture', () => {
    const source = gray([100, 150, 100]);
    const result = applyDithering(source, 'threshold', 1, { soften: true });
    expect(reds(result)).toEqual([62, 102, 62]);
    const beforeDithering = applyDithering(referenceGaussian(source), 'threshold', 1);
    expect(reds(beforeDithering)).toEqual([0, 0, 0]);
    expect(result.data).not.toEqual(beforeDithering.data);
  });

  it('premultiplies alpha so hidden green cannot bleed into visible red', () => {
    const source = rgba(2, 1, [0, 255, 0, 0, 255, 0, 0, 255]);
    expect(Array.from(applyDithering(source, 'threshold', 1, { soften: true }).data))
      .toEqual([255, 0, 0, 77, 255, 0, 0, 178]);
  });

  it('sets hidden RGB to zero when softened alpha rounds to zero', () => {
    const source = rgba(9, 1, Array.from({ length: 9 }, (_, i) => [255, 17, 99, i === 4 ? 1 : 0]).flat());
    expect(applyDithering(source, 'threshold', 8, { soften: true }).data)
      .toEqual(new Uint8ClampedArray(36));
  });

  it('uses clamp-to-edge sampling and preserves a constant partially transparent 1x1 image', () => {
    const source = rgba(1, 1, [93, 177, 201, 128]);
    expect(applyDithering(source, 'threshold', 8, { soften: true })).toEqual(source);
  });

  it.each([[1, 9], [9, 1], [2, 2], [5, 9]])('matches direct 2D convolution at %ix%i including colored alpha edges', (width, height) => {
    const values = Array.from({ length: width * height }, (_, p) => [
      p * 37 % 256, (p * 71 + 31) % 256, (p * 19 + 83) % 256, [0, 1, 128, 255][p % 4],
    ]).flat();
    const source = rgba(width, height, values);
    const dithered = applyDithering(source, 'atkinson', 3);
    expect(applyDithering(source, 'atkinson', 3, { soften: true }))
      .toEqual(referenceGaussian(dithered));
  });
});

describe('AC-03: floating diffusion against emitted bytes', () => {
  it('50 quantizes to 36 at 3 bits; error 14 makes the next 85 emit 109, not 73', () => {
    expect(reduceBitDepth(50, 3)).toBe(36);
    expect(50 - reduceBitDepth(50, 3)).toBe(14);
    expect(reds(applyDithering(gray([50, 85]), 'floyd-steinberg', 3))).toEqual([36, 109]);
  });

  it.each([
    ['floyd-steinberg', [128, 10, 128]],
    ['atkinson', [128, 0, 144]],
  ] as const)('%s keeps negative working error instead of clamping between pixels', (method, values) => {
    expect(reds(applyDithering(gray([...values]), method, 1))).toEqual([255, 0, 0]);
  });

  it.each(DIFFUSION)('%s never emits/diffuses error from a fully transparent pixel', method => {
    const image = rgba(2, 1, [100, 100, 100, 0, 120, 120, 120, 255]);
    expect(Array.from(applyDithering(image, method, 1).data)).toEqual([100, 100, 100, 0, 0, 0, 0, 255]);
  });

  for (const method of DIFFUSION) {
    it(`${method}: matches the reference at all seven reduced depths on mixed-alpha RGB noise`, () => {
      let state = 12345;
      const data = new Uint8ClampedArray(31 * 47 * 4);
      for (let i = 0; i < data.length; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        data[i] = state >>> 24;
      }
      for (let i = 3; i < data.length; i += 28) data[i] = 0;
      const source = { width: 31, height: 47, data };
      for (let bits = 1; bits < 8; bits++) {
        expect(applyDithering(source, method, bits)).toEqual(referenceDiffusion(source, bits, method));
      }
    });

    it.each([[1, 1], [1, 9], [9, 1], [2, 2], [4, 5]])(`${method}: valid neighbors, no row wrapping at %ix%i`, (width, height) => {
      const source = rgba(width, height, Array.from({ length: width * height }, (_, p) => [
        (p * 47 + 50) % 256, (p * 83 + 85) % 256, (p * 13 + 128) % 256, [255, 0, 128, 1, 255][p % 5],
      ]).flat());
      for (const bits of [1, 3, 4, 7]) {
        expect(applyDithering(source, method, bits)).toEqual(referenceDiffusion(source, bits, method));
      }
    });
  }
});

describe('AC-04: quantization, Ordered, seeded Random and 8-bit bypass', () => {
  it('has exact threshold fixtures for neutrals, primaries and fractional palette levels', () => {
    expect(reds(applyDithering(gray([0, 18, 19, 50, 85, 127, 128, 237, 255]), 'threshold', 3)))
      .toEqual([0, 0, 36, 36, 73, 109, 146, 255, 255]);
    const primaries = rgba(3, 1, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    expect(applyDithering(primaries, 'threshold', 1)).toEqual(primaries);
    expect(reduceBitDepth(-100, 3)).toBe(0);
    expect(reduceBitDepth(400, 3)).toBe(255);
  });

  it('uses the Bayer pattern anchored at output top-left', () => {
    const source = gray(Array(16).fill(128), 4);
    expect(reds(applyDithering(source, 'ordered', 1))).toEqual([
      0, 255, 0, 255, 255, 0, 255, 0, 0, 255, 0, 255, 255, 0, 255, 0,
    ]);
  });

  it.each(['ordered', 'random'] as const)('%s noise scales to the quantization step at 7 bits', method => {
    const source = gray(Array(64).fill(128), 8);
    const values = reds(applyDithering(source, method, 7, { seed: 7 }));
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(3);
    expect(values.every(value => Math.abs(value - 128) <= 2)).toBe(true);
  });

  it('pins Mulberry32 seed 1, channel traversal, repeatability and seed variation', () => {
    const source = gray([128, 128]);
    const result = applyDithering(source, 'random', 1, { seed: 1 });
    expect(Array.from(result.data)).toEqual([255, 0, 255, 255, 255, 255, 0, 255]);
    expect(applyDithering(source, 'random', 1, { seed: 1 })).toEqual(result);
    expect(applyDithering(source, 'random', 1, { seed: 0 }).data).not.toEqual(result.data);
    expect(applyDithering(source, 'random', 1)).toEqual(applyDithering(source, 'random', 1, { seed: 0 }));
  });

  it('consumes RGB draws at transparent pixels without shifting later noise', () => {
    const source = gray([128, 128]);
    const opaque = applyDithering(source, 'random', 1, { seed: 1 });
    source.data[3] = 0;
    const masked = applyDithering(source, 'random', 1, { seed: 1 });
    expect(Array.from(masked.data.slice(0, 4))).toEqual([128, 128, 128, 0]);
    expect(masked.data.slice(4)).toEqual(opaque.data.slice(4));
  });

  it.each(METHODS)('%s bypasses every quantization/noise path at 8 bits, with optional post-soften', method => {
    const source = rgba(2, 2, [50, 85, 128, 255, 1, 2, 3, 128, 99, 88, 77, 0, 190, 240, 90, 1]);
    expect(applyDithering(source, method, 8, { seed: 0xFFFFFFFF })).toEqual(source);
    expect(applyDithering(source, method, 8, { soften: true }))
      .toEqual(method === 'none' ? source : referenceGaussian(source));
  });

  it.each(METHODS)('%s keeps alpha, valid bytes and palette bounds before soften at every depth', method => {
    const source = rgba(5, 1, [0, 255, 17, 255, 50, 85, 128, 128, 77, 88, 99, 0, 127, 128, 129, 1, 240, 30, 180, 255]);
    for (const bits of [1, 3, 4, 8]) {
      const output = applyDithering(source, method, bits, { seed: 42 });
      const palette = new Set(Array.from({ length: 2 ** bits }, (_, level) => Math.round(level * 255 / (2 ** bits - 1))));
      for (let i = 0; i < source.data.length; i++) {
        if (i % 4 === 3 || method === 'none' || source.data[i - i % 4 + 3] === 0) {
          expect(output.data[i]).toBe(source.data[i]);
        } else {
          expect(palette.has(output.data[i])).toBe(true);
        }
      }
    }
  });
});

describe('processing-boundary validation', () => {
  it.each([0, 9, -1, 1.5, NaN, Infinity])('rejects depth %s even for Original and scalar quantization', bits => {
    expect(() => applyDithering(gray([50]), 'none', bits)).toThrow(RangeError);
    expect(() => reduceBitDepth(50, bits)).toThrow(RangeError);
  });

  it('rejects unknown methods instead of silently choosing threshold', () => {
    expect(() => applyDithering(gray([50]), 'typo' as DitheringMethod, 8)).toThrow('Unknown dithering method');
  });

  it.each([-1, 2 ** 32, 0.5, NaN, Infinity])('rejects invalid seed %s', seed => {
    expect(() => applyDithering(gray([50]), 'random', 4, { seed })).toThrow(RangeError);
  });

  it('rejects invalid dimensions, byte counts, nonfinite channels and nonboolean soften', () => {
    for (const [width, height, values] of [[0, 1, []], [1.5, 1, []], [1, 1, [1]], [1, -1, []]] as const) {
      expect(() => applyDithering(rgba(width, height, [...values]), 'none', 4)).toThrow(RangeError);
    }
    expect(() => reduceBitDepth(NaN, 3)).toThrow(RangeError);
    expect(() => applyDithering(gray([50]), 'none', 4, { soften: 1 as unknown as boolean })).toThrow(TypeError);
  });
});
