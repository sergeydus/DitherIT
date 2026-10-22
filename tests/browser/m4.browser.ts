import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { decodePng } from '../helpers/decode-png';
import { installWorkerProbe, type ProbeWindow } from '../helpers/worker-probe';

const fixture = (name = 'still.png') => path.resolve('tests/fixtures/import', name);
const ready = (page: Page) => expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
const open = async (page: Page, name = 'still.png') => { await page.getByLabel('Upload Image').setInputFiles(fixture(name)); await ready(page); };
const count = (page: Page) => page.evaluate(() => ({ ...((window as unknown as ProbeWindow).__probe.sent) }));
const commit = async (input: Locator, value: string) => { await input.fill(value); await input.press('Enter'); };
const main = (page: Page) => page.locator('.display-image canvas');
const pixels = async (canvas: Locator) => canvas.evaluate(async element => {
  await new Promise(requestAnimationFrame);
  const c = element as HTMLCanvasElement; return [...c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data];
});
async function expectTabs(page: Page, targets: Locator[]) {
  for (const target of targets) {
    await page.keyboard.press('Tab');
    await expect(target).toBeFocused();
  }
}
const download = async (page: Page) => {
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click();
  const item = await event; return { name: item.suggestedFilename(), decoded: decodePng(await readFile((await item.path())!)) };
};

test.beforeEach(async ({ page }) => { await installWorkerProbe(page); await page.goto('./'); await expect(page.getByRole('region', { name: 'Image source', exact: true }).getByRole('button', { name: 'Choose image', exact: true })).toBeEnabled(); });

test('AC-13: local CC0 sample uses the normal import path; empty actions and fetch recovery', async ({ page }) => {
  await expect(page.locator('.source-name')).toHaveText('No image yet');
  await expect(page.locator('#export-summary')).toHaveText('PNG export available after you choose an image');
  await expect(page.getByLabel('Preset', { exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Preview', exact: true }).getByRole('button', { name: 'Choose image', exact: true })).toBeVisible();
  await page.route('**/samples/ditherit-study.png', route => route.abort());
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('#import-error')).toHaveText('The sample couldn’t be loaded. Try again or choose an image.');
  await expect(page.getByRole('button', { name: 'Try a sample' })).toBeEnabled();
  await page.unroute('**/samples/ditherit-study.png');
  const request = page.waitForRequest('**/DitherIT/samples/ditherit-study.png');
  await page.getByRole('button', { name: 'Try a sample' }).click(); await request; await ready(page);
  await expect(page.locator('.source-name')).toHaveText('ditherit-sample.png');
  await expect(page.locator('#source-dimensions')).toContainText('1200 × 800');
  expect((await count(page)).prepare).toBe(1);
  const result = await download(page); expect(result.name).toBe('ditherit-sample-floyd-steinberg-4bpc-1200x800.png');
  expect([result.decoded.width, result.decoded.height]).toEqual([1200, 800]);
});

test('AC-13: delayed sample cannot replace a subsequently chosen local file', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/samples/ditherit-study.png', async route => {
    started(); await gate;
    await route.fulfill({ path: path.resolve('public/samples/ditherit-study.png'), contentType: 'image/png' });
  });
  await page.getByRole('button', { name: 'Try a sample' }).click(); await pending;
  await open(page); release();
  await expect(page.locator('.source-name')).toHaveText('still.png');
  expect((await count(page)).prepare).toBe(1);
});

test('AC-13: sample fetch can be canceled without importing a late response', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/samples/ditherit-study.png', async route => {
    started(); await gate;
    await route.fulfill({ path: path.resolve('public/samples/ditherit-study.png'), contentType: 'image/png' });
  });
  await page.getByRole('button', { name: 'Try a sample' }).click(); await pending;
  await expect(page.locator('#preview-status')).toHaveText('Opening sample…');
  await page.getByRole('button', { name: 'Cancel preview' }).click(); release();
  await expect(page.locator('#preview-status')).toHaveText('Choose an image to begin.');
  await expect(page.locator('.source-name')).toHaveText('No image yet');
  await expect(page.getByRole('button', { name: 'Try a sample' })).toBeEnabled();
  expect((await count(page)).prepare ?? 0).toBe(0);
});

test('AC-13: atomic presets retain output, manual changes mark Custom, reset retains source/view', async ({ page }) => {
  await open(page, 'large.png');
  await page.getByLabel('Output size').selectOption('custom'); await commit(page.getByLabel('Custom width (px)'), '600'); await ready(page);
  for (const [preset, method, bits, soften] of [
    ['classic', 'atkinson', 1, false], ['ordered', 'ordered', 2, false], ['grain', 'random', 2, true], ['balanced', 'floyd-steinberg', 4, false],
  ] as const) {
    const before = await count(page);
    await page.getByLabel('Preset', { exact: true }).selectOption(preset); await ready(page);
    const trace = await page.evaluate(() => (window as unknown as ProbeWindow).__probe);
    expect(trace.sent.render - before.render).toBe(1); expect(trace.sent.prepare).toBe(before.prepare);
    expect(trace.renders.at(-1)).toMatchObject({ method, bitsPerChannel: bits, soften });
    await expect(page.getByLabel('Custom width (px)')).toHaveValue('600');
  }
  await commit(page.getByLabel('Bits per channel (number)', { exact: true }), '3'); await ready(page);
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('custom');
  await page.getByRole('radio', { name: 'Split', exact: true }).check();
  await page.getByLabel('Zoom level', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Reset settings' }).click(); await ready(page);
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('balanced');
  await expect(page.getByLabel('Output size')).toHaveValue('standard');
  await expect(page.getByRole('radio', { name: 'Split', exact: true })).toBeChecked();
  await expect(page.getByLabel('Zoom level', { exact: true })).toHaveValue('2');
  await expect(page.locator('.source-name')).toHaveText('large.png');
});

test('AC-05: repeat exports stable, only New variation advances seed, controls/reset preserve it', async ({ page }) => {
  await page.getByRole('button', { name: 'Try a sample' }).click(); await ready(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('grain'); await ready(page);
  const first = await download(page); const second = await download(page);
  expect(Buffer.from(second.decoded.pixels).equals(Buffer.from(first.decoded.pixels))).toBe(true);
  const before = await count(page);
  await page.getByRole('radio', { name: 'Original', exact: true }).check();
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.getByLabel('Zoom level', { exact: true }).selectOption('0.5');
  expect(await count(page)).toEqual(before);
  expect(Buffer.from((await download(page)).decoded.pixels).equals(Buffer.from(first.decoded.pixels))).toBe(true);
  await page.getByRole('button', { name: 'New variation' }).click(); await ready(page);
  await expect(page.locator('#random-seed')).toHaveText('Seed: 1');
  await expect(page.getByRole('status')).toContainText('New variation ready (seed 1).');
  expect(Buffer.from((await download(page)).decoded.pixels).equals(Buffer.from(first.decoded.pixels))).toBe(false);
  await commit(page.getByLabel('Bits per channel (number)', { exact: true }), '3'); await ready(page);
  await page.getByLabel('Soften dither pattern', { exact: true }).uncheck(); await ready(page);
  await page.getByRole('button', { name: 'Reset settings' }).click(); await ready(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('grain'); await ready(page);
  await expect(page.locator('#random-seed')).toHaveText('Seed: 1');
  await open(page); await expect(page.locator('#random-seed')).toHaveText('Seed: 1');
});

test('AC-14: Original/Result/Split are aligned cached views, including endpoints, without rendering', async ({ page }) => {
  await open(page); await page.getByLabel('Dithering Method').selectOption('threshold');
  await commit(page.getByLabel('Bits per channel (number)', { exact: true }), '1'); await ready(page);
  const before = await count(page); const result = await pixels(main(page));
  await page.getByRole('radio', { name: 'Original', exact: true }).check(); const original = await pixels(main(page));
  expect(original).not.toEqual(result);
  await page.getByRole('radio', { name: 'Split', exact: true }).check();
  const expected = [...result];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) expected.splice((y * 8 + x) * 4, 4, ...original.slice((y * 8 + x) * 4, (y * 8 + x + 1) * 4));
  expect(await pixels(main(page))).toEqual(expected);
  await page.getByLabel('Comparison position:', { exact: false }).focus();
  await page.locator('#comparison-position').press('Home'); expect(await pixels(main(page))).toEqual(result);
  await page.locator('#comparison-position').press('End'); expect(await pixels(main(page))).toEqual(original);
  expect(await count(page)).toEqual(before);
});

test('AC-14: zoom/pan stays local, preserves center, Fit recenters; source replacement resets Fit and split', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, 'large.png');
  const before = await count(page);
  const center = () => page.locator('.image-viewport').evaluate(element => {
    const viewport = element as HTMLElement; const image = viewport.querySelector('.display-image') as HTMLElement;
    return { x: (viewport.scrollLeft + viewport.clientWidth / 2 - image.offsetLeft) / image.offsetWidth, y: (viewport.scrollTop + viewport.clientHeight / 2 - image.offsetTop) / image.offsetHeight };
  });
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(main(page)).toHaveCSS('image-rendering', 'pixelated');
  await expect(page.locator('.image-viewport')).toHaveCSS('overscroll-behavior', 'contain');
  await page.getByRole('button', { name: 'Pan right', exact: true }).click(); await page.getByRole('button', { name: 'Pan down', exact: true }).click();
  const old = await center();
  await page.getByLabel('Zoom level', { exact: true }).selectOption('2');
  await expect.poll(async () => Math.abs((await center()).x - old.x)).toBeLessThan(.005);
  expect(Math.abs((await center()).y - old.y)).toBeLessThan(.005);
  for (const value of ['0.25', '0.5', '1', '2', '4']) await page.getByLabel('Zoom level', { exact: true }).selectOption(value);
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await expect(page.getByLabel('Zoom level', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  expect(await page.locator('.image-viewport').evaluate(element => [element.scrollLeft, element.scrollTop])).toEqual([0, 0]);
  await expect(page.locator('.image-viewport')).toHaveCSS('overscroll-behavior', 'auto');
  await page.locator('.image-viewport').hover();
  const pageY = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageY);
  expect(await count(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('radio', { name: 'Split', exact: true }).check(); await page.locator('#comparison-position').press('End');
  await page.getByRole('button', { name: '100%', exact: true }).click(); await open(page);
  await expect(page.getByLabel('Zoom level', { exact: true })).toHaveValue('fit');
  await page.getByRole('radio', { name: 'Split', exact: true }).check(); await expect(page.locator('#comparison-position')).toHaveValue('50');
});

test('AC-14: 1:1 detail centers small images without upscaling and never renders', async ({ page }) => {
  await open(page); const reference = await pixels(main(page)); const before = await count(page);
  await page.getByLabel('1:1 detail', { exact: true }).check();
  const detail = page.locator('.detail-canvas'); await expect(detail).toHaveCSS('width', '160px'); await expect(detail).toHaveCSS('height', '160px');
  const actual = await pixels(detail);
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    const expected = x >= 76 && x < 84 && y >= 77 && y < 83 ? reference.slice(((y - 77) * 8 + x - 76) * 4, ((y - 77) * 8 + x - 76 + 1) * 4) : [0, 0, 0, 0];
    if (actual.slice((y * 160 + x) * 4, (y * 160 + x + 1) * 4).some((byte, i) => byte !== expected[i])) throw new Error(`Detail mismatch at ${x},${y}`);
  }
  await commit(page.getByLabel('Detail horizontal position (px)'), '7'); await commit(page.getByLabel('Detail vertical position (px)'), '5');
  await expect(page.getByTestId('detail-outline')).toBeVisible(); expect(await count(page)).toEqual(before);
  // Half-pixel centering blends alpha even with imageSmoothingEnabled=false.
  const oddPng = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(3, 1);
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]), 3, 1), 0, 0);
    return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())];
  });
  await page.getByLabel('Upload Image').setInputFiles({ name: 'odd.png', mimeType: 'image/png', buffer: Buffer.from(oddPng) }); await ready(page);
  await page.getByLabel('1:1 detail', { exact: true }).check();
  const odd = await pixels(page.locator('.detail-canvas'));
  const colored = [];
  for (let offset = 0; offset < odd.length; offset += 4) if (odd[offset + 3]) colored.push({ x: offset / 4 % 160, y: Math.floor(offset / 4 / 160), rgba: odd.slice(offset, offset + 4) });
  expect(colored).toEqual([
    { x: 78, y: 79, rgba: [255, 0, 0, 255] }, { x: 79, y: 79, rgba: [0, 255, 0, 255] }, { x: 80, y: 79, rgba: [0, 0, 255, 255] },
  ]);
});

test('AC-14/20: keyboard-only comparison, split, zoom, pan and exact detail crop; stale labeling', async ({ page }) => {
  const help = (topic: string) => page.getByRole('button', { name: `Help: ${topic}`, exact: true });
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await open(page, 'large.png'); const before = await count(page);
  await expectTabs(page, [page.getByRole('link', { name: 'Skip to image editor' })]);
  await page.keyboard.press('Enter'); await expect(page.getByRole('region', { name: 'Image editor' })).toBeFocused();
  await expectTabs(page, [button('Replace image'), page.getByRole('region', { name: 'Image viewport', exact: true }), help('Comparing images'), page.getByRole('radio', { name: 'Result', exact: true })]);
  await page.keyboard.press('ArrowRight'); await expect(page.getByRole('radio', { name: 'Split', exact: true })).toBeChecked();
  await expectTabs(page, [page.locator('#comparison-position')]); await page.keyboard.press('End');
  await expectTabs(page, [help('Preview zoom'), page.locator('#zoom-level'), button('Fit'), button('100%')]); await page.keyboard.press('Enter');
  await expectTabs(page, [button('Zoom out'), button('Zoom in'), button('Pan left'), button('Pan right')]); await page.keyboard.press('Space');
  await expectTabs(page, [button('Pan up'), button('Pan down'), page.getByLabel('1:1 detail', { exact: true })]); await page.keyboard.press('Space');
  await expectTabs(page, [help('Detail inspection'), page.getByLabel('Detail horizontal position (px)')]); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('0'); await page.keyboard.press('Enter');
  await expectTabs(page, [page.getByLabel('Detail vertical position (px)')]); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('0'); await page.keyboard.press('Enter');
  const reference = await main(page).evaluate(element => [...(element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 160, 160).data]);
  expect(await pixels(page.locator('.detail-canvas'))).toEqual(reference);
  await expectTabs(page, [button('Move detail right')]); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Detail horizontal position (px)')).toHaveValue('16');
  expect(await count(page)).toEqual(before);
  await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.holdRender = true; });
  await page.getByLabel('Soften dither pattern', { exact: true }).check();
  await expect(page.locator('#detail-heading')).toContainText('Preview out of date');
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(page.getByRole('img', { name: /1:1 detail, split view, preview out of date/ })).toBeVisible();
});

test('AC-14: detail split uses the global divider inside the crop, with exact endpoint pixels', async ({ page }) => {
  await open(page, 'large.png'); await page.getByLabel('Dithering Method').selectOption('threshold');
  await commit(page.getByLabel('Bits per channel (number)', { exact: true }), '1'); await ready(page);
  const before = await count(page);
  const crop = () => main(page).evaluate(async element => {
    await new Promise(requestAnimationFrame);
    return [...(element as HTMLCanvasElement).getContext('2d')!.getImageData(944, 602, 160, 160).data];
  });
  const result = await crop();
  await page.getByRole('radio', { name: 'Original', exact: true }).check(); const original = await crop();
  await page.getByRole('radio', { name: 'Split', exact: true }).check(); await page.getByLabel('1:1 detail', { exact: true }).check();
  const expected = result.map((byte, index) => Math.floor(index / 4) % 160 < 80 ? original[index] : byte);
  expect(await pixels(page.locator('.detail-canvas'))).toEqual(expected);
  await page.locator('#comparison-position').press('Home'); expect(await pixels(page.locator('.detail-canvas'))).toEqual(result);
  await page.locator('#comparison-position').press('End'); expect(await pixels(page.locator('.detail-canvas'))).toEqual(original);
  expect(await count(page)).toEqual(before);
});

for (const theme of ['light', 'dark']) test(`AC-20: ${theme} exploration states, detail bounds and axe`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 }); await page.getByLabel('Theme', { exact: true }).selectOption(theme);
  await page.getByRole('button', { name: 'Try a sample' }).click(); await ready(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('grain'); await ready(page);
  await page.getByRole('radio', { name: 'Split', exact: true }).check(); await page.getByLabel('1:1 detail', { exact: true }).check();
  await commit(page.getByLabel('Detail horizontal position (px)'), '1199'); await commit(page.getByLabel('Detail vertical position (px)'), '799');
  const outline = page.getByTestId('detail-outline'); const box = await outline.boundingBox(); const image = await main(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(image!.x - 1); expect(box!.x + box!.width).toBeLessThanOrEqual(image!.x + image!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(image!.y + image!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.image-viewport').focus();
  const axe = async () => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await axe();
  await page.getByLabel('Zoom level', { exact: true }).selectOption('4'); await axe();
  await commit(page.getByLabel('Detail horizontal position (px)'), '1200'); await axe();
  await commit(page.getByLabel('Detail horizontal position (px)'), '1199');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await mkdir(path.join(testInfo.project.outputDir, 'm4-screenshots'), { recursive: true });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); scrollTo(0, 0); });
  await page.screenshot({ path: path.join(testInfo.project.outputDir, 'm4-screenshots', `${theme}-390-split-detail.png`), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 }); await axe();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); scrollTo(0, 0); });
  await page.screenshot({ path: path.join(testInfo.project.outputDir, 'm4-screenshots', `${theme}-1440-split-detail.png`), fullPage: true });
});

test.describe('touch detail placement', () => {
  test.use({ hasTouch: true });
  test('AC-14: tapping the image selects a clamped detail focus pixel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await open(page, 'large.png');
    await page.getByLabel('1:1 detail', { exact: true }).check(); const before = await count(page);
    const box = (await main(page).boundingBox())!;
    await main(page).tap({ position: { x: box.width * .75, y: box.height * .25 } });
    expect(Number(await page.getByLabel('Detail horizontal position (px)').inputValue())).toBeGreaterThan(1400);
    expect(Number(await page.getByLabel('Detail vertical position (px)').inputValue())).toBeLessThan(500);
    expect(await count(page)).toEqual(before);
  });
});

test('initial controls wait for their handlers when application scripts are delayed', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/**/*.js', async route => { await gate; await route.continue(); });
  await page.goto('./', { waitUntil: 'commit' });
  const choose = page.getByRole('region', { name: 'Image source', exact: true }).getByRole('button', { name: 'Choose image', exact: true });
  await expect(choose).toBeDisabled(); await expect(page.getByLabel('Theme', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Upload Image')).toBeDisabled();
  release(); await expect(choose).toBeEnabled();
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await open(page);
});
