import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installWorkerProbe, type ProbeWindow } from '../helpers/worker-probe';

const widths = [320, 390, 768, 1024, 1440];
const themes = ['light', 'dark'] as const;
const fixture = path.resolve('tests/fixtures/import/large.png');
const ready = (page: Page) => expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
const open = async (page: Page) => { await page.getByLabel('Upload Image').setInputFiles(fixture); await ready(page); };
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => { await installWorkerProbe(page); });

for (const theme of themes) for (const width of widths) {
  test(`AC-15/20/22: ${theme}, ${width}px, empty/ready/processing/error screenshots and axe`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('./');
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    const directory = path.join(testInfo.project.outputDir, 'm3-screenshots');
    await mkdir(directory, { recursive: true });
    const capture = async (state: string) => {
      await fits(page); await axe(page); await page.evaluate(() => document.fonts.ready);
      // Axe may move focus/scroll while probing contrast. Capture neutral pointer states;
      // the dedicated keyboard tests verify focus outlines and retention separately.
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: path.join(directory, `${theme}-${width}-${state}.png`), fullPage: true, animations: 'disabled' });
    };
    await capture('empty');
    await expect(page.getByRole('heading', { name: 'Make something out of fewer colors.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose image', exact: true })).toBeVisible();
    await expect(page.locator('#image-upload')).toBeHidden();
    await open(page); await capture('ready');
    await expect(page.locator('#rendered-summary')).toHaveCount(0);
    await expect(page.locator('#preview-status')).toHaveText('Ready');
    await expect(page.getByRole('button', { name: 'Replace image', exact: true })).toBeVisible();
    const preview = await page.locator('.preview-panel').boundingBox();
    const inspector = await page.locator('.inspector').boundingBox();
    if (width >= 1024) {
      expect(inspector!.width).toBe(320); expect(inspector!.x - (preview!.x + preview!.width)).toBe(24);
    } else expect(inspector!.y).toBeGreaterThan(preview!.y + preview!.height);
    const order = await page.locator('.workspace').evaluate(element => [...element.children].map(child => child.className));
    expect(order).toEqual(['source-summary', 'preview-panel panel', 'inspector panel']);
    await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.holdRender = true; });
    await page.getByLabel('Soften dither pattern', { exact: true }).check();
    await expect(page.locator('#preview-status')).toHaveText('Updating preview…');
    await expect(page.locator('#rendered-summary')).toContainText('Rendered with: large.png');
    await capture('processing');
    await page.getByRole('button', { name: 'Cancel preview' }).click();
    await page.getByLabel('Upload Image').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
    await expect(page.locator('#import-error')).toContainText('Choose a PNG');
    await capture('error');
    await expect(page.getByRole('button', { name: 'Replace image' })).toHaveAttribute('aria-describedby', /import-error/);
  });
}

test('AC-15: System follows OS; explicit themes persist, ignore OS changes and leave image bytes unchanged', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('./');
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await open(page);
  const download = async () => {
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG' }).click();
    return readFile((await (await event).path())!);
  };
  const light = await download();
  const count = await page.evaluate(() => (window as unknown as ProbeWindow).__probe.sent.render);
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await download()).toEqual(light);
  expect(await page.evaluate(() => (window as unknown as ProbeWindow).__probe.sent.render)).toBe(count);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['ditherit-theme']);
  await page.reload(); await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Block hydration to prove the saved theme is applied by the head bootstrap itself.
  await page.route('**/_next/**/*.js', route => route.abort()); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 16, 20)');
});

test('AC-15: blocked storage and invalid saved values fall back harmlessly to System', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { value() { throw new DOMException('Blocked', 'SecurityError'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('./');
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('system');
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await open(page);
  await page.reload(); await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); expect(errors).toEqual([]);
});

test('AC-15/19: invalid preference, metadata, local mark and loaded Geist fonts at the static base path', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ditherit-theme', 'invalid'));
  await page.emulateMedia({ colorScheme: 'light' }); await page.goto('./');
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('system');
  await expect(page).toHaveTitle('DitherIT — Image Dithering Studio');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Explore dithering styles, compare results, and export reduced-color images directly in your browser.');
  const icon = page.locator('link[rel="icon"]'); await expect(icon).toHaveAttribute('href', '/DitherIT/ditherit-mark.svg');
  const response = await page.request.get((await icon.getAttribute('href'))!); expect(response.ok()).toBe(true); expect(await response.text()).toContain('<svg');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Geist');
  expect(await page.locator('.control.numeric').first().evaluate(element => getComputedStyle(element).fontFamily)).toContain('Mono');
  expect(await page.evaluate(() => [...document.fonts].some(font => font.family.includes('Geist') && font.status === 'loaded'))).toBe(true);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('.woff')).every(entry => new URL(entry.name).pathname.startsWith('/DitherIT/_next/')))).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByText('About Dithering', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.locator('#dithering-guide')).toBeInViewport();
  await page.locator('#dithering-guide summary').click(); await expect(page.getByRole('heading', { name: 'Floyd–Steinberg', exact: true })).toBeVisible();
});

for (const theme of themes) test(`AC-22: ${theme} at 320px, 200% text and text-spacing overrides`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto('./');
  await page.getByLabel('Theme', { exact: true }).selectOption(theme);
  const bytes = await readFile(fixture);
  const name = 'a-very-long-source-filename-that-must-remain-accessible-'.repeat(3) + '.png';
  await page.getByLabel('Upload Image').setInputFiles({ name, mimeType: 'image/png', buffer: bytes }); await ready(page);
  await expect(page.locator('.source-name')).toHaveAttribute('title', name);
  await page.addStyleTag({ content: 'html {font-size:200%} * {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p {margin-bottom:2em!important}' });
  await page.locator('#dithering-guide summary').click(); await fits(page);
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).fontSize)).toBe('32px');
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
  await page.getByLabel('Output size').selectOption('custom'); await ready(page);
  const controls = page.locator('button:visible, select:visible, input[type="number"]:visible, input[type="range"]:visible, summary:visible');
  for (const control of await controls.all()) {
    const bounds = (await control.boundingBox())!; expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  await fits(page);
});

test('AC-22: forced colors retain controls/focus and reduced motion removes transitions', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' }); await page.goto('./'); await open(page);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  await page.getByLabel('Dithering Method').focus();
  const appearance = await page.getByLabel('Dithering Method').evaluate(element => {
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle, width: style.outlineWidth, color: style.color, background: style.backgroundColor, transition: style.transitionDuration };
  });
  expect(appearance.outline).toBe('solid'); expect(appearance.width).toBe('2px');
  expect(appearance.color).not.toBe(appearance.background); expect(appearance.transition).toBe('0s');
  await page.getByLabel('Dithering Method').selectOption('atkinson'); await ready(page); await fits(page);
});

test.afterAll(async ({}, testInfo) => {
  const directory = path.join(testInfo.project.outputDir, 'm3-screenshots');
  await mkdir(directory, { recursive: true });
  const images = themes.flatMap(theme => widths.flatMap(width => ['empty', 'ready', 'processing', 'error'].map(state => `${theme}-${width}-${state}.png`)));
  await writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>M3 screenshot review</title><style>body{font:16px system-ui;margin:24px;background:#eee;color:#222}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}img{width:100%;height:360px;object-fit:contain;object-position:top;background:white}a{color:#40208a}</style><h1>M3 screenshot review</h1><p>Both themes · 320, 390, 768, 1024, 1440 px · empty, ready, processing, error. Select a screenshot for its full size.</p><main>${images.map(name => `<figure><a href="${name}"><img src="${name}" alt="${name}">${name}</a></figure>`).join('')}</main></html>`);
});
