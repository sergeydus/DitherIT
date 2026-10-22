import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageProcessor } from './image-processor';
import { outputDimensions, ProcessingError, type WorkerKind, type WorkerPort, type WorkerReply,
  type PrepareRequest, type RenderRequest, type ExportRequest } from './render-contract';

function bitmap(width = 2, height = 2): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}
class FakeWorker implements WorkerPort {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  onmessageerror: Worker['onmessageerror'] = null;
  postMessage = vi.fn<(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => void>();
  terminate = vi.fn();
  emit(reply: WorkerReply) { this.onmessage?.call(this as unknown as Worker, { data: reply } as MessageEvent); }
  crash() { this.onerror?.call(this as unknown as Worker, {} as ErrorEvent); }
  request<T>(): T { return this.postMessage.mock.calls.at(-1)![0] as T; }
}

function harness() {
  const all: { kind: WorkerKind; worker: FakeWorker }[] = [];
  const factory = vi.fn((kind: WorkerKind) => { const worker = new FakeWorker(); all.push({ kind, worker }); return worker; });
  const last = (kind: WorkerKind) => all.filter(item => item.kind === kind).at(-1)!.worker;
  const count = (kind: WorkerKind) => all.filter(item => item.kind === kind).length;
  const prepared = (width = 2, height = 2) => {
    const worker = last('baseline'); const request = worker.request<PrepareRequest>();
    const size = outputDimensions(width, height, request.output); const view = bitmap(size.width, size.height);
    worker.emit({ kind: 'prepared', preparationId: request.preparationId, sourceId: request.sourceId,
      sourceWidth: width, sourceHeight: height, ...size, bitmap: view });
    return view;
  };
  const rendered = () => {
    const worker = last('render'); const request = worker.request<RenderRequest>(); const view = bitmap(request.width, request.height);
    worker.emit({ kind: 'complete', jobId: request.jobId, sourceId: request.sourceId, baselineKey: request.baselineKey,
      settingsKey: request.settingsKey, width: request.width, height: request.height,
      pixels: new ArrayBuffer(request.width * request.height * 4), resultView: view });
    return view;
  };
  return { all, factory, last, count, prepared, rendered };
}

describe('AC-08/09/12/17/23: image lifecycle and ownership', () => {
  let h: ReturnType<typeof harness>;
  let processor: ImageProcessor;
  const image = (name = 'source.png') => new File(['image'], name);
  const open = async (name = 'source.png', width = 2, height = 2) => {
    await processor.importFiles([image(name)]); h.prepared(width, height); h.rendered();
  };
  beforeEach(() => { vi.useFakeTimers(); h = harness(); processor = new ImageProcessor(h.factory, async () => 'png'); });
  afterEach(() => { processor.dispose(); vi.useRealTimers(); });

  it('retains the last good image/export after validation or candidate decode failure', async () => {
    await open(); const frame = processor.getSnapshot().frame;
    await processor.importFiles([image(), image()]);
    expect(processor.getSnapshot()).toMatchObject({ canExport: true, frame, error: 'Choose one image at a time.' });
    await processor.importFiles([image('bad.png')]);
    h.last('baseline').emit({ kind: 'failed', code: 'decode-failed' });
    expect(processor.getSnapshot()).toMatchObject({ status: 'ready', canExport: true, frame });
    expect(frame!.baseline.bitmap.close).not.toHaveBeenCalled();
  });

  it('ignores superseded validation and canceled first imports', async () => {
    let resolve!: (format: 'png') => void;
    processor = new ImageProcessor(h.factory, () => new Promise(done => { resolve = done; }));
    const importing = processor.importFiles([image()]); processor.cancel(); resolve('png'); await importing;
    expect(h.all).toHaveLength(0);
    expect(processor.getSnapshot().status).toBe('empty');
  });

  it('immediately terminates obsolete work; debounces latest settings and reuses the baseline without transfer', async () => {
    await open(); const baseline = processor.getSnapshot().frame!.baseline;
    processor.setSettings({ method: 'atkinson' }); const obsolete = h.last('render'); const request = obsolete.request<RenderRequest>();
    processor.setSettings({ bitsPerChannel: 2 }, true);
    expect(obsolete.terminate).toHaveBeenCalled();
    expect(processor.getSnapshot().canExport).toBe(false);
    processor.setSettings({ bitsPerChannel: 3 }, true);
    vi.advanceTimersByTime(99); expect(h.count('render')).toBe(1);
    vi.advanceTimersByTime(1); expect(h.count('render')).toBe(2);
    expect(h.count('baseline')).toBe(1);
    expect(h.last('render').postMessage.mock.calls[0][1]).toBeUndefined();
    expect(h.last('render').request<RenderRequest>()).toMatchObject({ baselineBitmap: baseline.bitmap, settings: { bitsPerChannel: 3 } });
    const late = bitmap(); obsolete.emit({ ...request, kind: 'complete', pixels: new ArrayBuffer(16), resultView: late });
    expect(late.close).toHaveBeenCalledOnce();
    expect(processor.getSnapshot().status).toBe('processing');
    h.rendered(); expect(processor.getSnapshot().canExport).toBe(true);
    processor.setSettings({ method: 'random', seed: 42 }); h.rendered();
    processor.setSettings({ seed: 43 }); h.rendered();
    expect(h.count('baseline')).toBe(1);
    expect(baseline.bitmap.close).not.toHaveBeenCalled();
  });

  it('keeps preparation alive across effect changes and renders only the latest settings', async () => {
    await processor.importFiles([image()]); const preparation = h.last('baseline');
    processor.setSettings({ bitsPerChannel: 2 }, true); processor.setSettings({ soften: true });
    expect(h.count('baseline')).toBe(1); expect(preparation.terminate).not.toHaveBeenCalled();
    h.prepared(); expect(h.last('render').request<RenderRequest>().settings).toMatchObject({ bitsPerChannel: 2, soften: true });
  });

  it('cancel retains selected controls/source/cache and requires explicit Render preview', async () => {
    await open(); const frame = processor.getSnapshot().frame;
    processor.setSettings({ bitsPerChannel: 1 }, true); processor.cancel(); vi.runAllTimers();
    expect(processor.getSnapshot()).toMatchObject({ status: 'outdated', frame, settings: { bitsPerChannel: 1 }, canExport: false });
    expect(h.count('render')).toBe(1);
    processor.retry(); expect(h.count('baseline')).toBe(1); h.rendered();
    expect(processor.getSnapshot()).toMatchObject({ status: 'ready', canExport: true });
  });

  it('retains a validated first source/cache when canceled before its first render commits', async () => {
    await processor.importFiles([image()]); const baseline = h.prepared(); processor.cancel();
    expect(processor.getSnapshot()).toMatchObject({ status: 'outdated', source: { name: 'source.png' }, frame: null });
    processor.retry(); expect(h.count('baseline')).toBe(1); expect(baseline.close).not.toHaveBeenCalled();
    h.rendered(); expect(processor.getSnapshot().canExport).toBe(true);
  });

  it('keeps old Original/Result aligned until a new output-size render commits and closes replaced resources', async () => {
    await open('a.png', 6, 4); const old = processor.getSnapshot().frame!;
    processor.setOutput({ mode: 'custom', width: 3 });
    expect(processor.getSnapshot().frame).toBe(old);
    const nextBaseline = h.prepared(6, 4);
    expect(processor.getSnapshot().frame).toBe(old); expect(old.baseline.bitmap.close).not.toHaveBeenCalled();
    h.rendered(); expect(processor.getSnapshot().frame!.baseline).toMatchObject({ width: 3, height: 2 });
    expect(old.baseline.bitmap.close).toHaveBeenCalledOnce(); expect(old.resultView.close).toHaveBeenCalledOnce();
    processor.setSettings({ method: 'ordered' }); h.rendered();
    expect(h.count('baseline')).toBe(2); expect(nextBaseline.close).not.toHaveBeenCalled();
  });

  it('cancels stale resize preparation when returning to the cached output dimensions', async () => {
    await open('a.png', 6, 4); const old = processor.getSnapshot().frame;
    processor.setOutput({ mode: 'custom', width: 3 }); const preparation = h.last('baseline'); const request = preparation.request<PrepareRequest>();
    processor.setOutput({ mode: 'original' });
    expect(preparation.terminate).toHaveBeenCalled(); expect(processor.getSnapshot()).toMatchObject({ frame: old, canExport: true });
    const late = bitmap(3, 2); preparation.emit({ kind: 'prepared', preparationId: request.preparationId, sourceId: request.sourceId,
      sourceWidth: 6, sourceHeight: 4, width: 3, height: 2, bitmap: late });
    expect(late.close).toHaveBeenCalledOnce(); expect(processor.getSnapshot().frame).toBe(old);
  });

  it('superseded imports close late preparation replies and never replace the newest source', async () => {
    await processor.importFiles([image('a.png')]); const obsolete = h.last('baseline'); const request = obsolete.request<PrepareRequest>();
    await processor.importFiles([image('b.png')]); h.prepared(); h.rendered();
    const late = bitmap(); obsolete.emit({ kind: 'prepared', preparationId: request.preparationId, sourceId: request.sourceId,
      width: 2, height: 2, sourceWidth: 2, sourceHeight: 2, bitmap: late });
    expect(processor.getSnapshot().source!.name).toBe('b.png'); expect(late.close).toHaveBeenCalledOnce();
  });

  it('surfaces worker crashes without restart loops and allows manual retry', async () => {
    await open(); processor.setSettings({ soften: true }); const crashing = h.last('render'); crashing.crash();
    expect(processor.getSnapshot()).toMatchObject({ status: 'error', canExport: false });
    vi.runAllTimers(); expect(h.count('render')).toBe(1);
    processor.retry(); h.rendered(); expect(processor.getSnapshot().canExport).toBe(true);
  });

  it('reports unavailable workers without invoking synchronous pixel processing', async () => {
    processor = new ImageProcessor(() => { throw new Error('worker blocked'); }, async () => 'png');
    await processor.importFiles([image()]);
    expect(processor.getSnapshot().error).toContain('isn’t available');
    expect(processor.getSnapshot().frame).toBeNull();
  });

  it('reuses an idle worker, rejects duplicate/stale replies, and retires it on source replacement', async () => {
    await open(); const worker = h.last('render'); const first = worker.request<RenderRequest>();
    expect(worker.terminate).not.toHaveBeenCalled(); expect(processor.getSnapshot().canExport).toBe(true);
    const duplicate = bitmap(); worker.emit({ ...first, kind: 'complete', pixels: new ArrayBuffer(16), resultView: duplicate });
    expect(duplicate.close).toHaveBeenCalledOnce(); expect(processor.getSnapshot().canExport).toBe(true);
    processor.setSettings({ soften: true });
    expect(h.last('render')).toBe(worker); expect(h.count('render')).toBe(1);
    const stale = bitmap(); worker.emit({ ...first, kind: 'complete', pixels: new ArrayBuffer(16), resultView: stale });
    expect(stale.close).toHaveBeenCalledOnce(); expect(processor.getSnapshot().status).toBe('processing');
    h.rendered(); expect(worker.terminate).not.toHaveBeenCalled();
    await processor.importFiles([image('replacement.png')]); h.prepared();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(h.count('render')).toBe(2);
    h.rendered(); expect(processor.getSnapshot().canExport).toBe(true);
  });

  it('retires an idle worker that crashes without invalidating the committed result', async () => {
    await open(); const worker = h.last('render'); worker.crash();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(processor.getSnapshot().canExport).toBe(true);
    processor.setSettings({ soften: true }); expect(h.count('render')).toBe(2);
    h.rendered(); expect(processor.getSnapshot().canExport).toBe(true);
  });

  it('preserves the scheduled render when an idle worker crashes during debounce', async () => {
    await open(); const worker = h.last('render');
    processor.setSettings({ bitsPerChannel: 2 }, true); worker.crash();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(h.count('render')).toBe(1);
    vi.advanceTimersByTime(100); expect(h.count('render')).toBe(2);
    h.rendered(); expect(processor.getSnapshot()).toMatchObject({ status: 'ready', canExport: true, settings: { bitsPerChannel: 2 } });
  });

  it('finishes an immutable export snapshot across settings/source changes and render cancellation', async () => {
    await open(); const frame = processor.getSnapshot().frame!;
    const exporting = processor.exportPng(); const encoder = h.last('export'); const request = encoder.request<ExportRequest>();
    expect(request.pixels).not.toBe(frame.pixels);
    await expect(processor.exportPng()).rejects.toBeInstanceOf(ProcessingError);
    processor.setSettings({ method: 'random' }); processor.cancel();
    await processor.importFiles([image('new.png')]); h.prepared(); h.rendered();
    expect(encoder.terminate).not.toHaveBeenCalled();
    const blob = new Blob(['png'], { type: 'image/png' }); encoder.emit({ kind: 'exported', exportId: request.exportId, blob });
    await expect(exporting).resolves.toMatchObject({ blob, filename: 'source-floyd-steinberg-4bpc-2x2.png' });
    expect(processor.getSnapshot().source!.name).toBe('new.png'); expect(processor.getSnapshot().exporting).toBe(false);
  });

  it('recovers encoder failures and rejects empty output', async () => {
    await open(); const first = processor.exportPng(); h.last('export').crash(); await expect(first).rejects.toMatchObject({ code: 'export-failed' });
    expect(processor.getSnapshot().canExport).toBe(true);
    const second = processor.exportPng(); const encoder = h.last('export');
    expect(processor.getSnapshot()).toMatchObject({ error: null, errorAction: null });
    encoder.emit({ kind: 'exported', exportId: encoder.request<ExportRequest>().exportId, blob: new Blob([]) });
    await expect(second).rejects.toMatchObject({ code: 'export-failed' }); expect(processor.getSnapshot().exporting).toBe(false);
  });

  it('does not reprocess ignored Original settings, while retaining them', async () => {
    await open(); processor.setSettings({ method: 'none' }); h.rendered(); const count = h.count('render');
    processor.setSettings({ bitsPerChannel: 1, soften: true }, true); vi.runAllTimers();
    expect(h.count('render')).toBe(count); expect(processor.getSnapshot().canExport).toBe(true);
    expect(processor.getSnapshot().settings).toMatchObject({ bitsPerChannel: 1, soften: true });
  });

  it('resets settings/output in one preparation transaction while retaining the source', async () => {
    await open('source.png', 2400, 1600);
    processor.setSettings({ method: 'random', bitsPerChannel: 1, soften: true, seed: 42 }); h.rendered();
    processor.setOutput({ mode: 'custom', width: 1200 }); h.prepared(2400, 1600); h.rendered();
    const source = processor.getSnapshot().source; const renders = h.count('render');
    processor.resetSettings();
    expect(processor.getSnapshot()).toMatchObject({ source, settings: { method: 'floyd-steinberg', bitsPerChannel: 4, soften: false, seed: 42 }, output: { mode: 'standard' }, canExport: false });
    expect(h.count('render')).toBe(renders); expect(h.count('baseline')).toBe(3);
    h.prepared(2400, 1600); h.rendered();
    expect(processor.getSnapshot()).toMatchObject({ source, canExport: true, frame: { baseline: { width: 2048, height: 1365 } } });
  });

  it('classifies import, render and export errors for appropriate announcements', async () => {
    await open(); await processor.importFiles([image(), image()]);
    expect(processor.getSnapshot().errorAction).toBe('import');
    processor.setSettings({ soften: true }); h.last('render').crash();
    expect(processor.getSnapshot().errorAction).toBe('render');
    processor.retry(); h.rendered(); expect(processor.getSnapshot().errorAction).toBeNull();
    const exporting = processor.exportPng(); h.last('export').crash();
    await expect(exporting).rejects.toMatchObject({ code: 'export-failed' });
    expect(processor.getSnapshot()).toMatchObject({ errorAction: 'export', canExport: true });
  });

  it('disposes workers/bitmaps once, cancels export promises, and can reconnect empty for Strict Mode', async () => {
    await open(); const frame = processor.getSnapshot().frame!; const exporting = processor.exportPng();
    processor.dispose(); await expect(exporting).rejects.toMatchObject({ code: 'canceled' });
    expect(frame.baseline.bitmap.close).toHaveBeenCalledOnce(); expect(frame.resultView.close).toHaveBeenCalledOnce();
    for (const { worker } of h.all) expect(worker.terminate).toHaveBeenCalled();
    processor.activate(); await open('fresh.png'); expect(processor.getSnapshot().source!.name).toBe('fresh.png');
  });
});
