import type { RenderSettings } from './render-contract';

export const PRESETS = {
  balanced: { name: 'Balanced', method: 'floyd-steinberg', bitsPerChannel: 4, soften: false },
  classic: { name: 'Classic texture', method: 'atkinson', bitsPerChannel: 1, soften: false },
  ordered: { name: 'Ordered texture', method: 'ordered', bitsPerChannel: 2, soften: false },
  grain: { name: 'Soft grain', method: 'random', bitsPerChannel: 2, soften: true },
} as const satisfies Record<string, Pick<RenderSettings, 'method' | 'bitsPerChannel' | 'soften'> & { name: string }>;
export type Preset = keyof typeof PRESETS | 'custom';
export type PreviewView = 'original' | 'result' | 'split';
export type Zoom = 'fit' | number;
export const ZOOMS = [.25, .5, 1, 2, 4] as const;
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const nextSeed = (seed: number) => (seed + 1) >>> 0;
export const fitScale = (width: number, height: number, viewportWidth: number, viewportHeight: number) =>
  Math.min(1, Math.max(1, viewportWidth) / width, Math.max(1, viewportHeight) / height);
export function nextZoom(scale: number, direction: -1 | 1): number {
  return direction === 1 ? (ZOOMS.find(value => value > scale + 1e-6) ?? 4) :
    ([...ZOOMS].reverse().find(value => value < scale - 1e-6) ?? .25);
}
export function detailRect(width: number, height: number, x: number, y: number) {
  const w = Math.min(160, width), h = Math.min(160, height);
  return { x: clamp(Math.round(x - w / 2), 0, width - w), y: clamp(Math.round(y - h / 2), 0, height - h), width: w, height: h };
}
