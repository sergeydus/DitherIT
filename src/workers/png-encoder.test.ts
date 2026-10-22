import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePng } from './png-encoder';
import { decodePng } from '../../tests/helpers/decode-png';

afterEach(() => vi.unstubAllGlobals());

describe('PNG committed-buffer fidelity', () => {
  it('round-trips every alpha byte, including nonzero RGB at alpha 0 and 1, without canvas APIs', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined); vi.stubGlobal('ImageData', undefined);
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let alpha = 0; alpha < 256; alpha++) pixels.set([109, 146, 109, alpha], alpha * 4);
    const before = pixels.slice();
    const reply = await encodePng({ kind: 'export', exportId: 7, width: 16, height: 16, pixels: pixels.buffer });
    expect(reply).toMatchObject({ kind: 'exported', exportId: 7 }); expect(reply.blob.type).toBe('image/png');
    const decoded = decodePng(new Uint8Array(await reply.blob.arrayBuffer()));
    expect(decoded).toMatchObject({ width: 16, height: 16 });
    expect(decoded.pixels).toEqual(before); expect(pixels).toEqual(before);
  });

  it('preserves varied channels and row boundaries', async () => {
    const pixels = Uint8Array.from({ length: 7 * 9 * 4 }, (_, i) => (i * 73 + 19) % 256);
    const reply = await encodePng({ kind: 'export', exportId: 1, width: 7, height: 9, pixels: pixels.buffer });
    expect(decodePng(new Uint8Array(await reply.blob.arrayBuffer())).pixels).toEqual(pixels);
  });

  it.each([[0, 1], [1.5, 1], [8193, 1], [4001, 4000], [2, 2]])('rejects invalid dimensions/buffer lengths (%s × %s)', async (width, height) => {
    await expect(encodePng({ kind: 'export', exportId: 1, width, height, pixels: new ArrayBuffer(4) }))
      .rejects.toMatchObject({ code: 'export-failed' });
  });

  it('reports missing compression support', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    await expect(encodePng({ kind: 'export', exportId: 1, width: 1, height: 1, pixels: new ArrayBuffer(4) }))
      .rejects.toMatchObject({ code: 'unsupported-browser' });
  });
});
