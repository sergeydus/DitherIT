import { describe, expect, it } from 'vitest';
import { inspectImage, MAX_FILE_BYTES, validateDimensions } from './image-import';
import { outputDimensions, settingsKey, DEFAULT_SETTINGS } from './render-contract';

function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(33);
  data.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(data.buffer);
  view.setUint32(8, 13); data.set([73, 72, 68, 82], 12);
  view.setUint32(16, width); view.setUint32(20, height);
  return data;
}

describe('AC-06/07: bounded import preflight', () => {
  it('checks dimensions and bytes before allocating a decoded canvas', async () => {
    await expect(inspectImage(new Blob([png(5000, 4000)]))).rejects.toMatchObject({ code: 'image-too-large' });
    await expect(inspectImage(new Blob([png(8193, 1)]))).rejects.toMatchObject({ code: 'image-too-large' });
    await expect(inspectImage(new Blob([new Uint8Array(MAX_FILE_BYTES + 1)]))).rejects.toMatchObject({ code: 'file-too-large' });
    expect(() => validateDimensions(4000, 4000)).not.toThrow();
    expect(() => validateDimensions(0, 1)).toThrow();
  });
  it('uses content signatures rather than extension/MIME and accepts empty MIME', async () => {
    await expect(inspectImage(new File([png(2, 3)], 'wrong.gif', { type: '' }))).resolves.toBe('png');
    await expect(inspectImage(new File(['<svg/>'], 'wrong.png', { type: 'image/png' }))).rejects.toMatchObject({ code: 'unsupported-type' });
    await expect(inspectImage(new File([png(2, 3)], 'wrong.jpg', { type: 'text/plain' }))).resolves.toBe('png');
  });
  it('rejects malformed headers and zero-size files', async () => {
    await expect(inspectImage(new Blob([]))).rejects.toMatchObject({ code: 'decode-failed' });
    await expect(inspectImage(new Blob([png(1, 1).slice(0, 20)]))).rejects.toMatchObject({ code: 'decode-failed' });
    await expect(inspectImage(new Blob([new Uint8Array([255, 216, 255, 192, 0, 1])]))).rejects.toMatchObject({ code: 'decode-failed' });
  });
  it('retains GIF and BMP (including top-down BMP) without animation rejection', async () => {
    const gif = new Uint8Array(13); gif.set(new TextEncoder().encode('GIF89a'));
    new DataView(gif.buffer).setUint16(6, 3, true); new DataView(gif.buffer).setUint16(8, 4, true);
    await expect(inspectImage(new Blob([gif]))).resolves.toBe('gif');
    const bmp = new Uint8Array(54); bmp.set([66, 77]); const view = new DataView(bmp.buffer);
    view.setUint32(14, 40, true); view.setInt32(18, 3, true); view.setInt32(22, -4, true);
    await expect(inspectImage(new Blob([bmp]))).resolves.toBe('bmp');
    view.setInt32(18, 8193, true);
    await expect(inspectImage(new Blob([bmp]))).rejects.toMatchObject({ code: 'image-too-large' });
  });
  it('preflights JPEG SOF, including segments before SOF', async () => {
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 8, 8, 0, 3, 0, 4, 0]);
    await expect(inspectImage(new Blob([jpeg]))).resolves.toBe('jpeg');
    new DataView(jpeg.buffer).setUint16(15, 9000);
    await expect(inspectImage(new Blob([jpeg]))).rejects.toMatchObject({ code: 'image-too-large' });
  });
  it('recognizes AVIF/AVIS brands but leaves dimensions/animation to the decoder', async () => {
    const data = new Uint8Array(24); const view = new DataView(data.buffer); view.setUint32(0, 24);
    data.set(new TextEncoder().encode('ftypmif1'), 4); data.set(new TextEncoder().encode('avifavis'), 16);
    await expect(inspectImage(new Blob([data]))).resolves.toBe('avif');
    data.set(new TextEncoder().encode('heicheic'), 16);
    await expect(inspectImage(new Blob([data]))).rejects.toMatchObject({ code: 'unsupported-type' });
  });
  it.each(['VP8X', 'VP8L', 'VP8 '])('reads bounded WebP %s dimensions', async kind => {
    const data = new Uint8Array(30); const view = new DataView(data.buffer);
    data.set(new TextEncoder().encode('RIFF'), 0); view.setUint32(4, 22, true);
    data.set(new TextEncoder().encode('WEBP' + kind), 8); view.setUint32(16, 10, true);
    if (kind === 'VP8X') { data[24] = 2; data[27] = 3; }
    if (kind === 'VP8L') { data[20] = 0x2F; view.setUint32(21, 2 + (3 << 14), true); }
    if (kind === 'VP8 ') { data.set([0x9D, 1, 0x2A], 23); view.setUint16(26, 3, true); view.setUint16(28, 4, true); }
    await expect(inspectImage(new Blob([data]))).resolves.toBe('webp');
  });
});

describe('output and effective render identity', () => {
  it('caps both orientations, retains small sources, and derives custom aspect ratio', () => {
    expect(outputDimensions(2400, 1600, { mode: 'standard' })).toEqual({ width: 2048, height: 1365 });
    expect(outputDimensions(1600, 2400, { mode: 'standard' })).toEqual({ width: 1365, height: 2048 });
    expect(outputDimensions(800, 600, { mode: 'standard' })).toEqual({ width: 800, height: 600 });
    expect(outputDimensions(2400, 1600, { mode: 'custom', width: 1200 })).toEqual({ width: 1200, height: 800 });
    expect(() => outputDimensions(2, 2, { mode: 'custom', width: 0 })).toThrow();
  });
  it('ignores retained depth/soften in Original and irrelevant seeds', () => {
    expect(settingsKey({ ...DEFAULT_SETTINGS, method: 'none' })).toBe(settingsKey({ ...DEFAULT_SETTINGS, method: 'none', bitsPerChannel: 1, soften: true }));
    expect(settingsKey(DEFAULT_SETTINGS)).toBe(settingsKey({ ...DEFAULT_SETTINGS, seed: 1 }));
    expect(settingsKey({ ...DEFAULT_SETTINGS, method: 'random' })).not.toBe(settingsKey({ ...DEFAULT_SETTINGS, method: 'random', seed: 1 }));
  });
});
