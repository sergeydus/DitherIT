import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { installWorkerProbe, type ProbeWindow } from '../helpers/worker-probe';

const help = (page: Page, topic: string) => page.getByRole('button', { name: `Help: ${topic}`, exact: true });
const popup = (page: Page) => page.getByRole('dialog');
const ready = (page: Page) => expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
const counts = (page: Page) => page.evaluate(() => ({ ...(window as unknown as ProbeWindow).__probe.sent }));
async function openImage(page: Page) {
  await page.getByLabel('Upload Image').setInputFiles(path.resolve('tests/fixtures/import/still.png'));
  await ready(page);
}
async function insideViewport(page: Page) {
  const bounds = (await popup(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await installWorkerProbe(page); await page.goto('./'); await expect(help(page, 'Color depth')).toBeEnabled();
});

test('help works by keyboard, restores focus and resumes normal Tab order without a trap', async ({ page }) => {
  await openImage(page);
  await help(page, 'Color depth').focus();
  await page.keyboard.press('Space');
  await expect(popup(page)).toHaveAccessibleName('Color depth'); await expect(popup(page)).toBeFocused();
  await expect(help(page, 'Color depth')).toHaveAttribute('aria-expanded', 'true');
  await expect(help(page, 'Color depth')).toHaveAttribute('aria-controls', (await popup(page).getAttribute('id'))!);
  await page.keyboard.press('Escape'); await expect(popup(page)).toHaveCount(0);
  await expect(help(page, 'Color depth')).toBeFocused();
  await expect(help(page, 'Color depth')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close help', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(help(page, 'Color depth')).toBeFocused();
  await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(popup(page)).toHaveCount(0); await expect(page.locator('#bit-depth')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Shift+Tab');
  await expect(popup(page)).toHaveCount(0); await expect(help(page, 'Color depth')).toBeFocused();
});

test('outside click and another help button dismiss without changing controls or starting work', async ({ page }) => {
  await openImage(page);
  await page.getByLabel('Dithering Method').selectOption('random'); await ready(page);
  await page.getByLabel('Output size').selectOption('custom'); await ready(page);
  await page.getByRole('radio', { name: 'Split', exact: true }).check();
  await page.getByRole('checkbox', { name: '1:1 detail', exact: true }).check();
  const before = await counts(page);
  const seed = await page.locator('#random-seed').textContent();
  let fileChoosers = 0, downloads = 0;
  page.on('filechooser', () => fileChoosers++); page.on('download', () => downloads++);
  const topics = await page.locator('.help-trigger:visible').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')!.replace('Help: ', '')));
  expect(topics).toEqual(['Comparing images', 'Preview zoom', 'Detail inspection', 'Presets', 'Dithering styles', 'New grain', 'Color depth', 'Softening', 'Image dimensions']);
  for (const topic of topics) {
    await help(page, topic).click();
    await expect(popup(page)).toHaveCount(1); await expect(popup(page)).toHaveAccessibleName(topic);
  }
  await page.locator('#bit-depth-number').click(); await expect(popup(page)).toHaveCount(0);
  await expect(page.locator('#bit-depth-number')).toBeFocused();
  await help(page, 'Comparing images').click(); await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(popup(page)).toHaveCount(0);
  expect(await counts(page)).toEqual(before); await expect(page.locator('#random-seed')).toHaveText(seed!);
  await expect(page.getByLabel('Soften dither pattern', { exact: true })).not.toBeChecked();
  expect(fileChoosers).toBe(0); expect(downloads).toBe(0);
});

test('help remains available for disabled settings and during processing without activating controls', async ({ page }) => {
  await expect(page.getByLabel('Output size')).toBeDisabled();
  await help(page, 'Image dimensions').click(); await expect(popup(page)).toContainText('2,048');
  await openImage(page);
  await page.getByLabel('Dithering Method').selectOption('none'); await ready(page);
  await expect(page.locator('#bit-depth')).toBeDisabled(); await help(page, 'Color depth').click();
  await expect(popup(page)).toContainText('Original keeps this setting');
  await help(page, 'Softening').click(); await expect(popup(page)).toContainText('Original bypasses');
  await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.holdRender = true; });
  await page.getByLabel('Dithering Method').selectOption('atkinson');
  await expect(page.locator('#preview-status')).toHaveText('Updating preview…');
  const before = await counts(page);
  await help(page, 'Color depth').click(); await expect(page.locator('#preview-status')).toHaveText('Updating preview…');
  await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  await help(page, 'Dithering styles').click(); await expect(popup(page)).toContainText('Selected: Atkinson');
  await expect(page.locator('#preview-status')).toHaveText('Preview out of date'); expect(await counts(page)).toEqual(before);
});

for (const theme of ['light', 'dark']) for (const width of [320, 1440]) test(`help is readable, contained and axe-clean in ${theme} at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.getByLabel('Theme', { exact: true }).selectOption(theme);
  await help(page, 'Color depth').click(); await insideViewport(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await ready(page);
  await help(page, 'Color depth').click(); await insideViewport(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('contextual-help.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 390 });
  await page.addStyleTag({ content: 'html {font-size:200%}' });
  await help(page, 'Image dimensions').click(); await insideViewport(page);
  await expect(page.getByRole('button', { name: 'Close help', exact: true })).toBeInViewport();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('PageDown');
  await expect.poll(() => popup(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape'); await expect(help(page, 'Image dimensions')).toBeFocused();
});

test.describe('touch help', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('tap target opens and closes; outside tap dismisses in forced colors/reduced motion too', async ({ page }) => {
    const bounds = (await help(page, 'Presets').boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
    await help(page, 'Presets').tap(); await expect(popup(page)).toBeVisible();
    await page.getByRole('button', { name: 'Close help', exact: true }).tap(); await expect(popup(page)).toHaveCount(0);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await help(page, 'Softening').tap(); await insideViewport(page);
    const colors = await popup(page).evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
    expect(colors.color).not.toBe(colors.background);
    await page.getByRole('heading', { name: 'Look', exact: true }).tap(); await expect(popup(page)).toHaveCount(0);
  });
});
