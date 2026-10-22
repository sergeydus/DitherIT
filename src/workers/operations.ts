import { applyDithering } from '../utils/dithering';
import { validateDimensions } from '../lib/image-import';
import { outputDimensions, ProcessingError, type PrepareRequest, type PrepareReply,
  type RenderRequest, type RenderReply } from '../lib/render-contract';

function surface(width: number, height: number): { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas === 'undefined' || typeof ImageData === 'undefined') throw new ProcessingError('unsupported-browser');
  const canvas = new OffscreenCanvas(width, height);
  if (typeof canvas.transferToImageBitmap !== 'function') {
    canvas.width = 0; canvas.height = 0; throw new ProcessingError('unsupported-browser');
  }
  const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (!context) { canvas.width = 0; canvas.height = 0; throw new ProcessingError('unsupported-browser'); }
  return { canvas, context };
}

export async function prepareBaseline(request: PrepareRequest): Promise<PrepareReply> {
  if (typeof createImageBitmap === 'undefined') throw new ProcessingError('unsupported-browser');
  let decoded: ImageBitmap;
  try { decoded = await createImageBitmap(request.file, { imageOrientation: 'from-image' }); }
  catch { throw new ProcessingError('decode-failed'); }
  let canvas: OffscreenCanvas | undefined;
  try {
    validateDimensions(decoded.width, decoded.height);
    const size = outputDimensions(decoded.width, decoded.height, request.output);
    const target = surface(size.width, size.height);
    canvas = target.canvas;
    target.context.imageSmoothingEnabled = true;
    target.context.imageSmoothingQuality = 'high';
    target.context.drawImage(decoded, 0, 0, size.width, size.height);
    return { kind: 'prepared', preparationId: request.preparationId, sourceId: request.sourceId,
      ...size, sourceWidth: decoded.width, sourceHeight: decoded.height, bitmap: canvas.transferToImageBitmap() };
  } finally { decoded.close(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
}

export function renderBaseline(request: RenderRequest): RenderReply {
  let canvas: OffscreenCanvas | undefined;
  try {
    const target = surface(request.width, request.height);
    canvas = target.canvas;
    if (request.baselineBitmap.width !== request.width || request.baselineBitmap.height !== request.height) throw new ProcessingError('processing-failed');
    target.context.drawImage(request.baselineBitmap, 0, 0);
    const input = target.context.getImageData(0, 0, request.width, request.height);
    const settings = request.settings;
    const output = applyDithering(input, settings.method, settings.bitsPerChannel, { seed: settings.seed, soften: settings.soften });
    target.context.putImageData(new ImageData(output.data, output.width, output.height), 0, 0);
    return { kind: 'complete', jobId: request.jobId, sourceId: request.sourceId, baselineKey: request.baselineKey,
      settingsKey: request.settingsKey, width: output.width, height: output.height,
      pixels: output.data.buffer, resultView: canvas.transferToImageBitmap() };
  } finally { request.baselineBitmap.close(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
}
