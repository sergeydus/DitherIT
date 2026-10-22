import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodePng } from '../helpers/decode-png';

const fixture = (name: string) => path.resolve('tests/fixtures/import', name);
const ready = async (page: Page) => expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
type Trace = { sent: Record<string, number>; replies: Record<string, number>; terminated: string[]; pixelOps: number; urls: string[];
  renderWorkers: number; committedSnapshot?: { width: number; height: number; pixels: number[] } };
type TraceWindow = Window & { __trace: Trace; __readPreview: () => number[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const trace: Trace = { sent: {}, replies: {}, terminated: [], pixelOps: 0, urls: [], renderWorkers: 0 };
    const windowWithTrace = window as unknown as TraceWindow;
    windowWithTrace.__trace = trace;
    const NativeWorker = Worker;
    class TracedWorker extends NativeWorker {
      kind = '';
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); trace.urls.push(String(url));
        this.addEventListener('message', event => { const kind = event.data.kind; trace.replies[kind] = (trace.replies[kind] ?? 0) + 1; });
      }
      postMessage(message: { kind: string; width?: number; height?: number; pixels?: ArrayBuffer }, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
        if (!this.kind && message.kind === 'render') trace.renderWorkers++;
        this.kind = message.kind; trace.sent[this.kind] = (trace.sent[this.kind] ?? 0) + 1;
        // The controller sends a copy of its exact committed buffer to the export worker.
        // Capture before transfer, without canvas readback or a production debug API.
        if (message.kind === 'export') trace.committedSnapshot = {
          width: message.width!, height: message.height!, pixels: Array.from(new Uint8Array(message.pixels!)),
        };
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
      terminate() { trace.terminated.push(this.kind); super.terminate(); }
    }
    window.Worker = TracedWorker;
    const prototype = CanvasRenderingContext2D.prototype;
    const read = prototype.getImageData;
    const write = prototype.putImageData;
    prototype.getImageData = function (...args) { trace.pixelOps++; return read.apply(this, args); };
    prototype.putImageData = function (...args: unknown[]) { trace.pixelOps++; Reflect.apply(write, this, args); };
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args) { trace.pixelOps++; return encode.apply(this, args); };
    windowWithTrace.__readPreview = () => {
      const canvas = document.querySelector('canvas')!;
      return Array.from(read.call(canvas.getContext('2d')!, 0, 0, canvas.width, canvas.height).data);
    };
  });
  await page.goto('./'); await expect(page.getByRole('region', { name: 'Image source', exact: true }).getByRole('button', { name: 'Choose image', exact: true })).toBeEnabled();
});

test('production chunks, cached baseline, worker softening and PNG snapshot work at /DitherIT/', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const uploads: string[] = []; page.on('request', request => { if (request.method() !== 'GET') uploads.push(request.url()); });
  await page.getByLabel('Upload Image').setInputFiles(fixture('still.png')); await ready(page);
  expect(await page.evaluate(() => (window as unknown as TraceWindow).__trace.sent.prepare)).toBe(1);
  await page.getByLabel('Dithering Method').selectOption('atkinson'); await ready(page);
  await page.locator('#bit-depth').focus(); await page.locator('#bit-depth').press('Home');
  await page.locator('#bit-depth').press('ArrowRight'); await page.locator('#bit-depth').press('ArrowRight'); await ready(page);
  await page.getByLabel('Soften dither pattern').check(); await ready(page);
  const before = await page.evaluate(() => (window as unknown as TraceWindow).__trace);
  expect(before.sent.prepare).toBe(1); expect(before.sent.render).toBeGreaterThan(2); expect(before.pixelOps).toBe(0);
  expect(before.renderWorkers).toBe(1); expect(before.terminated).not.toContain('render');
  // Turbopack bootstraps worker chunks with same-origin blob URLs.
  expect(before.urls.every(url => url.startsWith('blob:http://127.0.0.1:4173/') || new URL(url).pathname.startsWith('/DitherIT/_next/'))).toBe(true);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('still-atkinson-3bpc-8x6.png');
  const png = await readFile((await download.path())!);
  const decoded = decodePng(png); // Node zlib/CRC validation, never a browser canvas decoder.
  const after = await page.evaluate(() => (window as unknown as TraceWindow).__trace);
  const committed = after.committedSnapshot!;
  expect(decoded.width).toBe(committed.width); expect(decoded.height).toBe(committed.height);
  expect(Array.from(decoded.pixels)).toEqual(committed.pixels);
  expect(committed.pixels.some((value, index) => index % 4 === 3 && value > 0 && value < 255)).toBe(true);
  expect(after.sent.export).toBe(1); expect(after.pixelOps).toBe(0); expect(uploads).toEqual([]); expect(errors).toEqual([]);
  await page.reload(); await expect(page.getByRole('region', { name: 'Image source', exact: true }).getByRole('button', { name: 'Choose image', exact: true })).toBeVisible();
});

test('supported rasters use stable default/first frames and oriented dimensions', async ({ page }) => {
  await page.getByLabel('Upload Image').setInputFiles(fixture('still.png')); await ready(page);
  await page.getByLabel('Dithering Method').selectOption('none'); await ready(page);
  for (const name of ['still.webp', 'still.bmp', 'oriented.jpg', 'animated.gif', 'animated.webp', 'animated.png', 'animated.avif']) {
    await page.getByLabel('Upload Image').setInputFiles(fixture(name)); await ready(page);
    const canvas = page.getByRole('img');
    await expect(canvas).toHaveAttribute('width', name === 'oriented.jpg' ? '6' : '8');
    await expect(canvas).toHaveAttribute('height', name === 'oriented.jpg' ? '8' : '6');
    if (name.startsWith('animated')) {
      const pixels = await page.evaluate(() => (window as unknown as TraceWindow).__readPreview());
      // Decoder behavior differs for APNG's separate poster/default image. Both the
      // poster and first animation frame satisfy the documented first/default contract.
      const allowed = name === 'animated.png' ? [[0, 128, 0], [255, 0, 0]] : [[255, 0, 0]];
      expect(allowed.some(color => color.every((value, channel) => Math.abs(pixels[channel] - value) <= 5))).toBe(true);
      // Re-selecting the same file must work and must not capture a later animated frame.
      await page.getByLabel('Upload Image').setInputFiles(fixture(name)); await ready(page);
      expect(await page.evaluate(() => (window as unknown as TraceWindow).__readPreview())).toEqual(pixels);
    }
  }
});

test('invalid replacements retain good result; multi-file drops have recovery guidance', async ({ page }) => {
  await page.getByLabel('Upload Image').setInputFiles(fixture('still.png')); await ready(page);
  const preview = await page.evaluate(() => (window as unknown as TraceWindow).__readPreview());
  await page.getByLabel('Upload Image').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toContainText('Choose a PNG'); await ready(page);
  expect(await page.evaluate(() => (window as unknown as TraceWindow).__readPreview())).toEqual(preview);
  const truncated = (await readFile(fixture('still.png'))).subarray(0, 33);
  await page.getByLabel('Upload Image').setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: truncated });
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toContainText('couldn’t be opened'); await ready(page);
  expect(await page.evaluate(() => (window as unknown as TraceWindow).__readPreview())).toEqual(preview);
  const oversized = await readFile(fixture('still.png')); oversized.writeUInt32BE(9000, 16);
  await page.getByLabel('Upload Image').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: oversized });
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toContainText('8,192'); await ready(page);
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['a'], 'a.png')); transfer.items.add(new File(['b'], 'b.png'));
    document.querySelector('[aria-label="Image editor"]')!.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toHaveText('Choose one image at a time.'); await ready(page);
});

test('cancel keeps settings and baseline, retry works, Standard output is disclosed on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Upload Image').setInputFiles(fixture('large.png')); await ready(page);
  await expect(page.locator('#export-summary')).toContainText('PNG 2048 × 1365 px');
  await page.getByLabel('Soften dither pattern').check();
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(page.locator('#preview-status')).toHaveText('Preview out of date');
  await expect(page.getByLabel('Soften dither pattern')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Render preview' }).click(); await ready(page);
  expect(await page.evaluate(() => (window as unknown as TraceWindow).__trace.sent.prepare)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('Output size').selectOption('original'); await ready(page);
  await expect(page.locator('#output-dimensions')).toContainText('2400 × 1600 px');
});

test('a 16 MP source reuses preparation across depth, method and soften changes', async ({ page }) => {
  await page.getByLabel('Upload Image').setInputFiles(fixture('limit-16mp.jpg')); await ready(page);
  await expect(page.locator('#export-summary')).toContainText('PNG 2048 × 2048 px');
  await page.getByLabel('Dithering Method').selectOption('atkinson'); await ready(page);
  await page.locator('#bit-depth').focus(); await page.locator('#bit-depth').press('Home'); await ready(page);
  await page.getByLabel('Soften dither pattern').check(); await ready(page);
  const trace = await page.evaluate(() => (window as unknown as TraceWindow).__trace);
  expect(trace.sent.prepare).toBe(1); expect(trace.replies.prepared).toBe(1);
  expect(trace.sent.render).toBeGreaterThanOrEqual(4); expect(trace.pixelOps).toBe(0);
});

test('worker startup failure is actionable and import remains available', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'Worker', { value: class { constructor() { throw new Error('Worker blocked'); } } }); });
  await page.reload();
  await page.getByLabel('Upload Image').setInputFiles(fixture('still.png'));
  await expect(page.getByRole('region', { name: 'Image editor' }).getByRole('alert')).toContainText('isn’t available');
  await expect(page.getByRole('region', { name: 'Image source', exact: true }).getByRole('button', { name: 'Choose image', exact: true })).toBeEnabled();
});
