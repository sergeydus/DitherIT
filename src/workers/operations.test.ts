import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareBaseline, renderBaseline } from './operations';
import { DEFAULT_SETTINGS, settingsKey, type RenderRequest, type PrepareRequest } from '../lib/render-contract';

const view = (width: number, height: number) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;

describe('worker operation boundaries and cleanup', () => {
  let decoded: ImageBitmap;
  let pixels: Uint8ClampedArray<ArrayBuffer>;
  let canvases: Canvas[];
  let nullContext: boolean;
  class PixelData {
    constructor(public data: Uint8ClampedArray<ArrayBuffer>, public width: number, public height: number) {}
  }
  class Canvas {
    context = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage: vi.fn(),
      getImageData: vi.fn(() => new PixelData(pixels, this.width, this.height)), putImageData: vi.fn() };
    getContext = vi.fn(() => nullContext ? null : this.context);
    transferToImageBitmap = vi.fn(() => view(this.width, this.height));
    constructor(public width: number, public height: number) { canvases.push(this); }
  }
  beforeEach(() => {
    canvases = []; nullContext = false; decoded = view(2400, 1600);
    pixels = new Uint8ClampedArray([100, 100, 100, 255, 150, 150, 150, 255, 100, 100, 100, 255]);
    vi.stubGlobal('OffscreenCanvas', Canvas); vi.stubGlobal('ImageData', PixelData);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => decoded));
  });
  afterEach(() => vi.unstubAllGlobals());
  const prepare = (): PrepareRequest => ({ kind: 'prepare', preparationId: 1, sourceId: 2, file: new File(['png'], 'image.png'), output: { mode: 'standard' } });
  const render = (): RenderRequest => {
    const settings = { ...DEFAULT_SETTINGS, method: 'threshold' as const, bitsPerChannel: 1, soften: true };
    return { kind: 'render', jobId: 1, sourceId: 2, baselineKey: '2:3x1', settingsKey: settingsKey(settings),
      settings, width: 3, height: 1, baselineBitmap: view(3, 1) };
  };

  it('decodes with orientation and resizes in OffscreenCanvas before returning an owned baseline', async () => {
    const request = prepare(); const reply = await prepareBaseline(request);
    expect(createImageBitmap).toHaveBeenCalledWith(request.file, { imageOrientation: 'from-image' });
    expect(reply).toMatchObject({ sourceWidth: 2400, sourceHeight: 1600, width: 2048, height: 1365 });
    expect(canvases[0].context.drawImage).toHaveBeenCalledWith(decoded, 0, 0, 2048, 1365);
    expect(decoded.close).toHaveBeenCalledOnce(); expect(reply.bitmap.close).not.toHaveBeenCalled();
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });
  it('rechecks decoded limits before allocating a canvas and closes rejected bitmaps', async () => {
    decoded = view(8193, 1);
    await expect(prepareBaseline(prepare())).rejects.toMatchObject({ code: 'image-too-large' });
    expect(decoded.close).toHaveBeenCalledOnce(); expect(canvases).toHaveLength(0);
  });
  it('closes decoded resources even if OffscreenCanvas context creation fails', async () => {
    nullContext = true;
    await expect(prepareBaseline(prepare())).rejects.toMatchObject({ code: 'unsupported-browser' });
    expect(decoded.close).toHaveBeenCalledOnce(); expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });
  it('reports decoder failure without retrying or allocating canvases', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('private decoder details'));
    await expect(prepareBaseline(prepare())).rejects.toMatchObject({ code: 'decode-failed' });
    expect(createImageBitmap).toHaveBeenCalledTimes(1); expect(canvases).toHaveLength(0);
  });
  it('does readback/dithering/post-soften/pixel writes in the worker; closes only its baseline copy', () => {
    const request = render(); const reply = renderBaseline(request);
    expect(Array.from(new Uint8ClampedArray(reply.pixels))).toEqual([62, 62, 62, 255, 102, 102, 102, 255, 62, 62, 62, 255]);
    expect(canvases[0].context.getImageData).toHaveBeenCalledOnce(); expect(canvases[0].context.putImageData).toHaveBeenCalledOnce();
    expect(request.baselineBitmap.close).toHaveBeenCalledOnce(); expect(reply.resultView.close).not.toHaveBeenCalled();
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });
  it('closes input bitmaps after render failure too', () => {
    const request = render(); request.baselineBitmap = view(4, 1);
    expect(() => renderBaseline(request)).toThrow(); expect(request.baselineBitmap.close).toHaveBeenCalledOnce();
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  });
});
