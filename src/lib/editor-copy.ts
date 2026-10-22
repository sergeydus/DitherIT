import type { RenderSettings } from './render-contract';
import type { DitheringMethod } from '../utils/dithering';

export const METHODS: Record<DitheringMethod, { name: string; description: string }> = {
  none: { name: 'Original', description: 'Preserve the image colors without dithering; output sizing still applies.' },
  'floyd-steinberg': { name: 'Floyd–Steinberg', description: 'Diffuse color rounding errors to nearby pixels for smooth, detailed gradients.' },
  atkinson: { name: 'Atkinson', description: 'Diffuse part of each color error to create a lighter, textured result.' },
  ordered: { name: 'Ordered (Bayer)', description: 'Use a repeating Bayer pattern to place color levels in a regular texture.' },
  random: { name: 'Random', description: 'Add repeatable noise before color reduction for a grainy texture.' },
  threshold: { name: 'Threshold', description: 'Round each color channel to its nearest level without adding a dither pattern.' },
};
export function colorSummary(bits: number): string {
  const levels = 2 ** bits;
  return `${levels.toLocaleString('en-US')} levels/channel · up to ${(levels ** 3).toLocaleString('en-US')} RGB colors`;
}
export function settingsSummary(settings: RenderSettings): string {
  if (settings.method === 'none') return 'Original · color reduction and softening bypassed';
  return `${METHODS[settings.method].name} · ${settings.bitsPerChannel} bits/channel · soften ${settings.soften ? 'on' : 'off'}`;
}
