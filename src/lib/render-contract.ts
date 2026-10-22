import { ALGORITHM_VERSION, type DitheringMethod } from '../utils/dithering';

export type OutputSize = { mode: 'standard' } | { mode: 'original' } | { mode: 'custom'; width: number };
export interface RenderSettings { method: DitheringMethod; bitsPerChannel: number; soften: boolean; seed: number }
export const DEFAULT_SETTINGS: RenderSettings = { method: 'floyd-steinberg', bitsPerChannel: 4, soften: false, seed: 0 };
export const STANDARD_OUTPUT: OutputSize = { mode: 'standard' };

export type FailureCode = 'unsupported-type' | 'too-many-files' | 'file-too-large' | 'image-too-large' |
  'decode-failed' | 'processing-failed' | 'unsupported-browser' | 'export-failed' | 'canceled';
export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  'unsupported-type': 'Choose a PNG, JPEG, WebP, GIF, AVIF, or BMP image supported by your browser.',
  'too-many-files': 'Choose one image at a time.',
  'file-too-large': 'This file is larger than 20 MiB. Choose a smaller file.',
  'image-too-large': 'This image exceeds 16 megapixels or 8,192 px on one side. Resize it and try again.',
  'decode-failed': 'This image couldn’t be opened in this browser. Try a PNG or JPEG version.',
  'processing-failed': 'This preview couldn’t be rendered. Try again or choose a smaller output size.',
  'unsupported-browser': 'Image processing isn’t available in this browser. Try another supported browser.',
  'export-failed': 'We couldn’t prepare the PNG. Try again or choose a smaller output size.',
  canceled: 'Preview canceled.',
};
export class ProcessingError extends Error {
  constructor(public readonly code: FailureCode) { super(FAILURE_MESSAGES[code]); }
}

export function outputDimensions(width: number, height: number, output: OutputSize): { width: number; height: number } {
  if (output.mode === 'original') return { width, height };
  if (output.mode === 'custom') {
    if (!Number.isInteger(output.width) || output.width < 1) throw new RangeError('Output width must be a positive integer.');
    const w = Math.min(width, output.width);
    return { width: w, height: Math.max(1, Math.round(height * w / width)) };
  }
  if (output.mode !== 'standard') throw new RangeError('Unknown output size.');
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export const baselineKey = (sourceId: number, width: number, height: number) => `${sourceId}:${width}x${height}`;
export function settingsKey(settings: RenderSettings): string {
  const { method, bitsPerChannel, soften, seed } = settings;
  if (!['none', 'floyd-steinberg', 'atkinson', 'ordered', 'random', 'threshold'].includes(method) ||
      !Number.isInteger(bitsPerChannel) || bitsPerChannel < 1 || bitsPerChannel > 8 ||
      typeof soften !== 'boolean' || !Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new RangeError('Invalid rendering settings.');
  }
  return JSON.stringify([ALGORITHM_VERSION, method, method === 'none' ? null : bitsPerChannel,
    method !== 'none' && soften, method === 'random' && bitsPerChannel < 8 ? seed : null]);
}

export interface SourceInfo { id: number; name: string; width: number; height: number }
export interface Baseline { key: string; source: SourceInfo; width: number; height: number; bitmap: ImageBitmap }
export interface CommittedRender {
  baseline: Baseline; settings: RenderSettings; settingsKey: string; resultView: ImageBitmap; pixels: ArrayBuffer;
}
export type WorkerKind = 'baseline' | 'render' | 'export';
export type WorkerPort = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'postMessage' | 'terminate'>;
export type WorkerFactory = (kind: WorkerKind) => WorkerPort;
export type PrepareRequest = { kind: 'prepare'; preparationId: number; sourceId: number; file: File; output: OutputSize };
export type RenderRequest = {
  kind: 'render'; jobId: number; sourceId: number; baselineKey: string; settingsKey: string;
  width: number; height: number; baselineBitmap: ImageBitmap; settings: RenderSettings;
};
export type ExportRequest = { kind: 'export'; exportId: number; width: number; height: number; pixels: ArrayBuffer };
export type PrepareReply = { kind: 'prepared'; preparationId: number; sourceId: number; width: number; height: number;
  sourceWidth: number; sourceHeight: number; bitmap: ImageBitmap };
export type RenderReply = { kind: 'complete'; jobId: number; sourceId: number; baselineKey: string; settingsKey: string;
  width: number; height: number; pixels: ArrayBuffer; resultView: ImageBitmap };
export type ExportReply = { kind: 'exported'; exportId: number; blob: Blob };
export type FailureReply = { kind: 'failed'; code: FailureCode };
export type WorkerReply = PrepareReply | RenderReply | ExportReply | FailureReply;

export function renderFilename(frame: CommittedRender): string {
  const stem = frame.baseline.source.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'ditherit';
  const { method, bitsPerChannel } = frame.settings;
  return `${stem}-${method}${method === 'none' ? '' : `-${bitsPerChannel}bpc`}-${frame.baseline.width}x${frame.baseline.height}.png`;
}
