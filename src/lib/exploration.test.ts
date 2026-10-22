import { describe, expect, it } from 'vitest';
import { detailRect, fitScale, nextSeed, nextZoom } from './exploration';

describe('output-pixel inspection geometry', () => {
  it('fits landscape/portrait without upscaling small images', () => {
    expect(fitScale(2400, 1600, 600, 400)).toBe(.25);
    expect(fitScale(1600, 2400, 600, 400)).toBe(1 / 6);
    expect(fitScale(8, 6, 600, 400)).toBe(1);
  });
  it.each([
    [500, 400, 250, 200, { x: 170, y: 120, width: 160, height: 160 }],
    [500, 400, 0, 0, { x: 0, y: 0, width: 160, height: 160 }],
    [500, 400, 499, 399, { x: 340, y: 240, width: 160, height: 160 }],
    [8, 6, 7, 5, { x: 0, y: 0, width: 8, height: 6 }],
    [1, 400, 0, 399, { x: 0, y: 240, width: 1, height: 160 }],
  ] as const)('clamps a crop inside %s × %s focused at (%s, %s)', (w, h, x, y, expected) => {
    expect(detailRect(w, h, x, y)).toEqual(expected);
  });
  it('steps through preset zoom levels including Fit scales outside the numeric range', () => {
    expect(nextZoom(.1, 1)).toBe(.25); expect(nextZoom(.1, -1)).toBe(.25);
    expect(nextZoom(.25, 1)).toBe(.5); expect(nextZoom(.5, 1)).toBe(1);
    expect(nextZoom(1, 1)).toBe(2); expect(nextZoom(2, 1)).toBe(4); expect(nextZoom(4, 1)).toBe(4);
    expect(nextZoom(4, -1)).toBe(2); expect(nextZoom(2, -1)).toBe(1); expect(nextZoom(1, -1)).toBe(.5);
    expect(nextZoom(.5, -1)).toBe(.25); expect(nextZoom(.25, -1)).toBe(.25);
  });
  it('advances the seed explicitly and wraps the uint32 limit', () => {
    expect(nextSeed(0)).toBe(1); expect(nextSeed(0xffffffff)).toBe(0);
  });
});
