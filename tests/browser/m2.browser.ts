import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodePng } from '../helpers/decode-png';
import { installWorkerProbe, type ProbeWindow } from '../helpers/worker-probe';

const fixture = (name = 'still.png') => path.resolve('tests/fixtures/import', name);
const ready = async (page: Page) => expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
const open = async (page: Page, name = 'still.png') => { await page.getByLabel('Upload Image').setInputFiles(fixture(name)); await ready(page); };
const number = (page: Page) => page.getByLabel('Bits per channel (number)', { exact: true });
const commit = async (input: Locator, value: string) => { await input.fill(value); await input.press('Enter'); };
async function expectTabs(page: Page, targets: Locator[], key = 'Tab') {
  for (const target of targets) {
    await page.keyboard.press(key);
    await expect(target).toBeFocused();
  }
}

test.beforeEach(async ({ page }) => { await installWorkerProbe(page); await page.goto('./'); await expect(page.getByRole('region', { name: 'Image source', exact: true }).getByRole('button', { name: 'Choose image', exact: true })).toBeEnabled(); });

test('AC-10: native depth controls, committed validation, Original retention and reset', async ({ page }) => {
  await expect(page.getByLabel('Dithering Method')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
  await open(page);
  await expect(page.locator('#color-summary')).toHaveText('16 levels/channel · up to 4,096 RGB colors');
  await expect(page.locator('#method-help')).toContainText('Diffuse color rounding errors');
  const slider = page.locator('#bit-depth');
  await slider.focus(); await slider.press('Home'); await ready(page);
  await expect(number(page)).toHaveValue('1'); await expect(slider).toHaveAttribute('aria-valuetext', '1 bits per channel, 2 levels per channel');
  await expect(page.locator('#color-summary')).toHaveText('2 levels/channel · up to 8 RGB colors');
  await commit(number(page), '8'); await ready(page); await expect(slider).toHaveValue('8');
  await expect(page.locator('#color-summary')).toHaveText('256 levels/channel · up to 16,777,216 RGB colors');
  await commit(number(page), '4'); await ready(page);
  for (const invalid of ['', '1.5', '9', '0', '-1']) {
    const sent = await page.evaluate(() => (window as unknown as ProbeWindow).__probe.sent.render);
    await number(page).fill(invalid);
    if (invalid === '') await expect(number(page)).toHaveValue('');
    await expect(slider).toHaveValue('4'); await number(page).press('Enter');
    await expect(number(page)).toHaveValue('4'); await expect(number(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(number(page)).toHaveAttribute('aria-describedby', /bit-depth-number-error/);
    await expect(page.locator('#bit-depth-number-error')).toContainText('whole number from 1 to 8. Restored 4');
    expect(await page.evaluate(() => (window as unknown as ProbeWindow).__probe.sent.render)).toBe(sent);
    await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toHaveCount(0);
  }
  // External slider edits replace the draft permanently, even when returning to its old value.
  await slider.focus(); await slider.press('Home'); await ready(page);
  await slider.press('ArrowRight'); await slider.press('ArrowRight'); await slider.press('ArrowRight'); await ready(page);
  await expect(number(page)).toHaveValue('4'); await expect(number(page)).not.toHaveAttribute('aria-invalid', 'true');
  await number(page).fill('3'); await number(page).press('Tab'); await ready(page);
  await expect(number(page)).not.toHaveAttribute('aria-invalid', 'true'); await expect(slider).toHaveValue('3');
  await page.getByLabel('Soften dither pattern', { exact: true }).check(); await ready(page);
  await expect(page.locator('#depth-help')).toContainText('final image may contain more colors');
  await expect(page.locator('#soften-help')).toContainText('after dithering, at output resolution');
  await page.getByLabel('Dithering Method').selectOption('none'); await ready(page);
  await expect(slider).toBeDisabled(); await expect(number(page)).toBeDisabled();
  await expect(page.getByLabel('Soften dither pattern', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Soften dither pattern', { exact: true })).toBeDisabled();
  await expect(page.locator('#bypass-help')).toContainText('Color reduction and softening are bypassed');
  await expect(page.locator('#export-filename')).toHaveText('Filename: still-none-8x6.png');
  await page.getByLabel('Dithering Method').selectOption('ordered'); await ready(page);
  await expect(number(page)).toHaveValue('3'); await expect(page.getByLabel('Soften dither pattern', { exact: true })).toBeChecked();
  await page.getByLabel('Output size').selectOption('custom');
  await commit(page.getByLabel('Custom width (px)'), '4'); await ready(page);
  await page.getByRole('button', { name: 'Reset settings' }).click(); await ready(page);
  await expect(page.getByLabel('Dithering Method')).toHaveValue('floyd-steinberg');
  await expect(number(page)).toHaveValue('4'); await expect(page.getByLabel('Soften dither pattern', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Output size')).toHaveValue('standard');
  await expect(page.getByRole('status')).toContainText('Settings reset.');
  await expect(page.getByRole('button', { name: 'Reset settings' })).toBeFocused();
});

test('numeric depth applies while focused; invalid drafts and unchanged commits do not render', async ({ page }) => {
  await open(page);
  const renders = () => page.evaluate(() => (window as unknown as ProbeWindow).__probe.sent.render);
  const before = await renders();
  await number(page).fill('5');
  await expect(number(page)).toBeFocused(); await expect(page.locator('#bit-depth')).toHaveValue('5');
  await expect(page.locator('#color-summary')).toHaveText('32 levels/channel · up to 32,768 RGB colors');
  await ready(page); expect(await renders()).toBe(before + 1);
  await number(page).press('Enter'); await number(page).press('Tab');
  expect(await renders()).toBe(before + 1);
  await number(page).focus(); await number(page).press('ArrowUp');
  await expect(number(page)).toBeFocused(); await expect(page.locator('#bit-depth')).toHaveValue('6');
  await ready(page); expect(await renders()).toBe(before + 2);
  await number(page).fill(''); await expect(number(page)).toHaveValue('');
  await expect(page.locator('#bit-depth')).toHaveValue('6');
  for (const invalid of ['9', '1.5', '']) {
    await number(page).fill(invalid); await expect(page.locator('#bit-depth')).toHaveValue('6');
    await expect(page.locator('#preview-status')).toHaveText('Ready');
    await number(page).press('Enter'); await expect(number(page)).toHaveValue('6');
    await expect(number(page)).toHaveAttribute('aria-invalid', 'true');
    expect(await renders()).toBe(before + 2);
  }
});

test('AC-11: exact Standard/Original/Custom PNG dimensions and width recovery', async ({ page }) => {
  await open(page, 'large.png');
  await expect(page.locator('#source-dimensions')).toHaveText('Source dimensions: 2400 × 1600 px');
  await expect(page.locator('#output-dimensions')).toHaveText('PNG 2048 × 1365 px');
  await expect(page.getByText('Resized for faster editing. This is the actual PNG output size.')).toBeVisible();
  for (const [mode, width, height] of [['standard', 2048, 1365], ['original', 2400, 1600], ['custom', 1200, 800]] as const) {
    await page.getByLabel('Output size').selectOption(mode);
    if (mode === 'custom') await commit(page.getByLabel('Custom width (px)'), '1200');
    await ready(page);
    const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click();
    const download = await downloadEvent;
    const decoded = decodePng(await readFile((await download.path())!));
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    expect(download.suggestedFilename()).toBe(`large-floyd-steinberg-4bpc-${width}x${height}.png`);
  }
  for (const invalid of ['', '0', '2401', '12.5']) {
    await commit(page.getByLabel('Custom width (px)'), invalid);
    await expect(page.getByLabel('Custom width (px)')).toHaveValue('1200');
    await expect(page.getByLabel('Custom width (px)')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#custom-width-error')).toContainText('Restored 1,200');
    await expect(page.locator('#output-dimensions')).toContainText('1200 × 800');
  }
  await commit(page.getByLabel('Custom width (px)'), '1'); await ready(page);
  await expect(page.locator('#output-dimensions')).toContainText('1 × 1');
  await commit(page.getByLabel('Custom width (px)'), '2400'); await ready(page);
  await expect(page.locator('#output-dimensions')).toContainText('2400 × 1600');
  await open(page); // retained custom width clamps to new source, with an announcement
  await expect(page.getByLabel('Custom width (px)')).toHaveValue('8');
  await expect(page.getByRole('status')).toContainText('Custom width reduced to 8 px');
  await page.getByLabel('Output size').selectOption('standard'); await ready(page);
  await expect(page.locator('#output-dimensions')).toContainText('8 × 6');
  await expect(page.getByText('Resized for faster editing. This is the actual PNG output size.')).toHaveCount(0);
});

test('AC-11: portrait cap and small inputs use actual output dimensions', async ({ page }) => {
  // Deterministic generated source; only the import fixture is prepared in a browser canvas.
  for (const [width, height, expected] of [[1600, 2400, '1365 × 2048'], [800, 600, '800 × 600']] as const) {
    const png = await page.evaluate(async ({ width, height }) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d')!; context.fillStyle = '#776655'; context.fillRect(0, 0, width, height);
      return [...new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())];
    }, { width, height });
    await page.getByLabel('Upload Image').setInputFiles({ name: 'dimensions.png', mimeType: 'image/png', buffer: Buffer.from(png) }); await ready(page);
    await expect(page.locator('#output-dimensions')).toContainText(expected);
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click();
    const decoded = decodePng(await readFile((await (await downloading).path())!));
    expect(`${decoded.width} × ${decoded.height}`).toBe(expected);
  }
});

test('AC-12: export survives edits/source/cancel, blocks duplicates and preserves bytes/name through URL cleanup', async ({ page }) => {
  await open(page); await page.getByLabel('Soften dither pattern', { exact: true }).check(); await ready(page);
  await page.clock.install();
  await page.evaluate(() => { const probe = (window as unknown as ProbeWindow).__probe; probe.holdExport = true; probe.holdRender = true; });
  await page.getByRole('button', { name: 'Export PNG' }).dblclick();
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
  await expect(page.locator('#export-help')).toContainText('Preparing PNG for still-floyd-steinberg-4bpc-8x6.png');
  await page.getByLabel('Dithering Method').selectOption('atkinson');
  await expect(page.locator('#preview-status')).toContainText('Updating preview…');
  await expect(page.locator('#rendered-summary')).toContainText('Rendered with: still.png · Floyd–Steinberg · 4 bits/channel');
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(page.locator('#preview-status')).toContainText('Preview out of date');
  await expect(page.getByLabel('Dithering Method')).toHaveValue('atkinson');
  await page.getByLabel('Upload Image').setInputFiles(fixture('still.webp'));
  await expect(page.getByText('still.webp', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  // Wait until the real export worker has encoded; held delivery makes the race deterministic.
  await expect.poll(() => page.evaluate(() => (window as unknown as ProbeWindow).__probe.held.exported ?? 0)).toBe(1);
  const downloading = page.waitForEvent('download');
  await page.evaluate(() => (window as unknown as ProbeWindow).__probe.release('exported'));
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('still-floyd-steinberg-4bpc-8x6.png');
  const decoded = decodePng(await readFile((await download.path())!));
  const probe = await page.evaluate(() => (window as unknown as ProbeWindow).__probe);
  expect(probe.sent.export).toBe(1); expect([...decoded.pixels]).toEqual(probe.exports[0].pixels);
  const url = probe.urls.at(-1)!;
  expect(await page.evaluate(async url => (await fetch(url)).ok, url)).toBe(true);
  expect(probe.revoked).not.toContain(url);
  await page.clock.fastForward(60_001);
  expect(await page.evaluate(url => (window as unknown as ProbeWindow).__probe.revoked.includes(url), url)).toBe(true);
  await expect(page.getByRole('status')).toContainText('PNG download started for still-floyd-steinberg-4bpc-8x6.png');
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
});

test('AC-12/20: debounce prevents uncommitted export; render errors stay inline and encoder errors recover', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.holdRender = true; });
  await page.locator('#bit-depth').focus(); await page.locator('#bit-depth').press('Home');
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).__probe.sent.export ?? 0)).toBe(0);
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(page.getByRole('status')).toContainText('Preview out of date');
  await page.evaluate(() => { const p = (window as unknown as ProbeWindow).__probe; p.failRender = true; p.holdRender = false; });
  await page.getByRole('button', { name: 'Render preview' }).click();
  await expect(page.locator('#render-error')).toContainText('couldn’t be rendered');
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Render preview' })).toHaveAttribute('aria-describedby', 'render-error');
  await page.getByRole('button', { name: 'Render preview' }).click(); await ready(page);
  await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.failExport = true; });
  await page.getByRole('button', { name: 'Export PNG' }).click();
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toHaveText('We couldn’t prepare the PNG. Try again or choose a smaller output size.');
  await expect(page.getByRole('button', { name: 'Export PNG' })).toHaveAttribute('aria-describedby', /export-error/);
  await ready(page);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click(); await downloading;
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/PNG download started for/, { exact: false }).filter({ visible: true })).toBeVisible();
});

test('AC-20: keyboard-only import, controls, invalid recovery, reset and export preserve focus', async ({ page }) => {
  const help = (topic: string) => page.getByRole('button', { name: `Help: ${topic}`, exact: true });
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to image editor' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('region', { name: 'Image editor' })).toBeFocused();
  await expectTabs(page, [page.getByRole('region', { name: 'Image source', exact: true }).getByRole('button', { name: 'Choose image', exact: true })]);
  const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Enter'); await (await choosing).setFiles(fixture()); await ready(page);
  await expectTabs(page, [
    page.getByRole('region', { name: 'Image viewport', exact: true }),
    help('Comparing images'), page.getByRole('radio', { name: 'Result', exact: true }),
    help('Preview zoom'), page.locator('#zoom-level'), button('Fit'), button('100%'), button('Zoom out'), button('Zoom in'),
    page.getByLabel('1:1 detail', { exact: true }), help('Detail inspection'),
    help('Presets'), page.getByLabel('Preset', { exact: true }), help('Dithering styles'), page.getByLabel('Dithering Method'),
  ]);
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await ready(page);
  await expect(page.getByLabel('Dithering Method')).toHaveValue('atkinson'); await expect(page.getByLabel('Dithering Method')).toBeFocused();
  await expectTabs(page, [help('Color depth'), page.locator('#bit-depth')]); await page.keyboard.press('Home'); await ready(page);
  await page.keyboard.press('Tab'); await expect(number(page)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('9'); await page.keyboard.press('Enter');
  await expect(number(page)).toHaveValue('1'); await expect(number(page)).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('4'); await page.keyboard.press('Tab'); await ready(page);
  await expect(page.getByLabel('Soften dither pattern', { exact: true })).toBeFocused(); await page.keyboard.press('Space'); await ready(page);
  await expectTabs(page, [help('Softening'), button('Reset settings'), help('Image dimensions'), page.getByLabel('Output size')]); await page.keyboard.press('End');
  await expectTabs(page, [page.getByLabel('Custom width (px)')]);
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('4'); await page.keyboard.press('Enter'); await ready(page);
  await expectTabs(page, [page.getByLabel('Output size'), help('Image dimensions'), button('Reset settings')], 'Shift+Tab');
  await page.keyboard.press('Enter'); await ready(page);
  await expectTabs(page, [help('Image dimensions'), page.getByLabel('Output size'), button('Export PNG')]);
  const downloading = page.waitForEvent('download'); await page.keyboard.press('Enter'); await downloading;
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeFocused();
  await expect(page.getByRole('status')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
});

test('AC-20: axe in empty, ready, processing, numeric error and import error states', async ({ page }) => {
  const check = async () => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    await expect(page.getByRole('status')).toHaveCount(1);
  };
  await check(); await open(page); await check();
  await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.holdRender = true; });
  await page.getByLabel('Soften dither pattern', { exact: true }).check();
  await expect(page.locator('#preview-status')).toHaveText('Updating preview…'); await check();
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await commit(number(page), '9'); await check();
  await page.getByLabel('Upload Image').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toContainText('Choose a PNG'); await check();
});

test('AC-20: one polite region debounces rapid completed changes to the settled result', async ({ page }) => {
  await open(page); await expect(page.getByRole('status')).toContainText('Floyd–Steinberg');
  const initial = await page.getByRole('status').textContent();
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  for (const method of ['atkinson', 'ordered', 'threshold']) {
    await page.getByLabel('Dithering Method').selectOption(method); await ready(page);
  }
  await expect(page.getByRole('status')).toHaveText(initial!);
  await page.clock.runFor(249); await expect(page.getByRole('status')).toHaveText(initial!);
  await page.clock.runFor(1); await expect(page.getByRole('status')).toContainText('Threshold');
  await expect(page.getByRole('status')).toHaveCount(1);
});
