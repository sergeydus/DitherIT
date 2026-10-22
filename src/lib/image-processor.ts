import { inspectImage } from './image-import';
import { DEFAULT_SETTINGS, STANDARD_OUTPUT, FAILURE_MESSAGES, ProcessingError, baselineKey, outputDimensions,
  settingsKey, renderFilename, type Baseline, type CommittedRender, type RenderSettings, type OutputSize,
  type SourceInfo, type WorkerFactory, type WorkerPort, type WorkerReply, type PrepareReply, type RenderReply } from './render-contract';

export interface ProcessorState {
  status: 'empty' | 'opening' | 'processing' | 'ready' | 'outdated' | 'error';
  source: SourceInfo | null; settings: RenderSettings; output: OutputSize; frame: CommittedRender | null;
  error: string | null; exporting: boolean; exportFilename: string | null; canExport: boolean;
  errorAction: 'import' | 'render' | 'export' | null;
}
type Candidate = { id: number; file: File; validated: boolean };

/** Owns browser resources and async authority; React only subscribes/presents bitmaps. */
export class ImageProcessor {
  private state: ProcessorState = { status: 'empty', source: null, settings: { ...DEFAULT_SETTINGS },
    output: STANDARD_OUTPUT, frame: null, error: null, errorAction: null, exporting: false, exportFilename: null, canExport: false };
  private listeners = new Set<() => void>();
  private file: File | null = null;
  private baseline: Baseline | null = null;
  private candidate: Candidate | null = null;
  private preparation: WorkerPort | null = null;
  private render: WorkerPort | null = null;
  private renderBusy = false;
  private encoder: WorkerPort | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sourceId = 0;
  private preparationId = 0;
  private jobId = 0;
  private exportId = 0;
  private rejectExport: ((error: Error) => void) | null = null;
  private disposed = false;

  constructor(private readonly workers: WorkerFactory, private readonly inspect = inspectImage) {}
  getSnapshot = (): ProcessorState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  // React Strict Mode may reconnect the same initially empty controller after cleanup.
  activate(): void { this.disposed = false; }

  private expectedBaselineKey(): string | null {
    const source = this.state.source;
    if (!source) return null;
    const size = outputDimensions(source.width, source.height, this.state.output);
    return baselineKey(source.id, size.width, size.height);
  }
  private matchesFrame(): boolean {
    const frame = this.state.frame;
    return !!frame && frame.baseline.key === this.expectedBaselineKey() && frame.settingsKey === settingsKey(this.state.settings);
  }
  private publish(patch: Partial<ProcessorState> = {}): void {
    if (patch.error === null) patch.errorAction = null;
    this.state = { ...this.state, ...patch };
    this.state.canExport = this.state.status === 'ready' && this.matchesFrame() && !this.state.exporting &&
      !this.candidate && !this.preparation && !this.renderBusy && !this.timer;
    for (const listener of this.listeners) listener();
  }
  private stopRender(force = false): void {
    this.jobId++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (force || this.renderBusy) {
      this.render?.terminate();
      this.render = null;
    }
    this.renderBusy = false;
  }
  private stopPreparation(): void {
    this.preparationId++;
    this.preparation?.terminate();
    this.preparation = null;
  }
  private closeUnused(baseline: Baseline | null): void {
    if (baseline && baseline !== this.baseline && baseline !== this.state.frame?.baseline) baseline.bitmap.close();
  }
  private preparationFailed(candidate: Candidate | null, code: keyof typeof FAILURE_MESSAGES): void {
    if (candidate && this.candidate === candidate) this.candidate = null;
    this.stopPreparation();
    this.publish({ error: FAILURE_MESSAGES[code], errorAction: candidate ? 'import' : 'render', status: this.renderBusy || this.timer ? 'processing' : this.matchesFrame() ? 'ready' : this.state.source ? 'outdated' : 'empty' });
  }

  async importFiles(files: readonly File[]): Promise<void> {
    if (this.disposed || files.length === 0) return;
    if (files.length !== 1) { this.publish({ error: FAILURE_MESSAGES['too-many-files'], errorAction: 'import' }); return; }
    this.stopPreparation();
    const candidate: Candidate = { id: ++this.sourceId, file: files[0], validated: false };
    this.candidate = candidate;
    this.publish({ status: 'opening', error: null });
    try {
      await this.inspect(candidate.file);
      if (this.disposed || this.candidate !== candidate) return;
      candidate.validated = true;
      this.prepare(candidate.file, candidate.id, candidate);
    } catch (error) {
      if (!this.disposed && this.candidate === candidate) {
        this.preparationFailed(candidate, error instanceof ProcessingError ? error.code : 'decode-failed');
      }
    }
  }

  private prepare(file: File, sourceId: number, candidate: Candidate | null): void {
    this.stopPreparation();
    const preparationId = this.preparationId;
    const output = { ...this.state.output };
    let worker: WorkerPort;
    try { worker = this.workers('baseline'); }
    catch { this.preparationFailed(candidate, 'unsupported-browser'); return; }
    this.preparation = worker;
    this.publish({ status: candidate ? 'opening' : 'processing' });
    const current = () => !this.disposed && this.preparation === worker && this.preparationId === preparationId;
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (!current()) { if (data.kind === 'prepared') data.bitmap.close(); return; }
      if (data.kind === 'failed') { this.preparationFailed(candidate, data.code); return; }
      if (data.kind !== 'prepared') return;
      if (data.preparationId !== preparationId || data.sourceId !== sourceId) { data.bitmap.close(); return; }
      this.acceptBaseline(data, file, candidate, output);
    };
    worker.onerror = worker.onmessageerror = () => { if (current()) this.preparationFailed(candidate, 'processing-failed'); };
    try { worker.postMessage({ kind: 'prepare', preparationId, sourceId, file, output }); }
    catch { this.preparationFailed(candidate, 'unsupported-browser'); }
  }

  private acceptBaseline(reply: PrepareReply, file: File, candidate: Candidate | null, output: OutputSize): void {
    const size = outputDimensions(reply.sourceWidth, reply.sourceHeight, output);
    if (reply.width !== size.width || reply.height !== size.height || reply.bitmap.width !== size.width || reply.bitmap.height !== size.height) {
      reply.bitmap.close(); this.preparationFailed(candidate, 'processing-failed'); return;
    }
    this.stopPreparation();
    this.stopRender(this.state.source?.id !== reply.sourceId);
    const source: SourceInfo = { id: reply.sourceId, name: file.name, width: reply.sourceWidth, height: reply.sourceHeight };
    this.file = file;
    this.candidate = null;
    const previous = this.baseline;
    this.baseline = { key: baselineKey(source.id, size.width, size.height), source, ...size, bitmap: reply.bitmap };
    this.publish({ source, output: output.mode === 'custom' && output.width > source.width ? { mode: 'custom', width: source.width } : output });
    this.closeUnused(previous);
    this.scheduleRender(0);
  }

  setSettings(patch: Partial<RenderSettings>, debounce = false): void {
    if (this.disposed) return;
    const settings = { ...this.state.settings, ...patch };
    const previousKey = settingsKey(this.state.settings);
    const key = settingsKey(settings);
    this.state = { ...this.state, settings };
    if (previousKey === key) { this.publish(); return; }
    this.stopRender();
    this.publish({ error: null, status: this.candidate ? 'opening' : this.state.source ? 'processing' : 'empty' });
    this.scheduleRender(debounce ? 100 : 0);
  }
  setOutput(output: OutputSize): void {
    if (this.disposed) return;
    outputDimensions(1, 1, output); // validate even before a source exists
    this.stopPreparation();
    this.state = { ...this.state, output: { ...output } };
    this.stopRender();
    this.publish({ error: null, status: this.candidate ? 'opening' : this.state.source ? 'processing' : 'empty' });
    if (this.candidate) {
      if (this.candidate.validated) this.prepare(this.candidate.file, this.candidate.id, this.candidate);
    } else if (this.baseline?.key === this.expectedBaselineKey()) {
      if (this.matchesFrame()) this.publish({ status: 'ready' });
      else this.scheduleRender(0);
    } else if (this.file && this.state.source) this.prepare(this.file, this.state.source.id, null);
  }

  resetSettings(): void {
    if (this.disposed) return;
    // One render/preparation transaction through the existing output lifecycle.
    this.state = { ...this.state, settings: { ...DEFAULT_SETTINGS } };
    this.setOutput({ ...STANDARD_OUTPUT });
  }

  private scheduleRender(delay: number): void {
    if (this.disposed || this.candidate || !this.state.source) return;
    if (!this.baseline || this.baseline.key !== this.expectedBaselineKey()) {
      if (!this.preparation) this.publish({ status: 'outdated' });
      return;
    }
    this.publish({ status: 'processing' });
    if (delay) {
      this.timer = setTimeout(() => { this.timer = null; this.startRender(); }, delay);
      this.publish();
    } else this.startRender();
  }
  private startRender(): void {
    const baseline = this.baseline;
    if (this.disposed || this.candidate || !baseline || baseline.key !== this.expectedBaselineKey()) return;
    const settings = { ...this.state.settings };
    const key = settingsKey(settings);
    const jobId = ++this.jobId;
    let worker: WorkerPort;
    try { worker = this.render ?? this.workers('render'); }
    catch { this.publish({ status: 'error', error: FAILURE_MESSAGES['unsupported-browser'], errorAction: 'render' }); return; }
    this.render = worker;
    this.renderBusy = true;
    this.publish({ status: 'processing' });
    const current = () => !this.disposed && this.renderBusy && this.render === worker && this.jobId === jobId;
    const failed = (code: keyof typeof FAILURE_MESSAGES) => {
      if (!current()) return;
      this.stopRender(); this.publish({ status: 'error', error: FAILURE_MESSAGES[code], errorAction: 'render' });
    };
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (!current()) { if (data.kind === 'complete') data.resultView.close(); return; }
      if (data.kind === 'failed') { failed(data.code); return; }
      if (data.kind !== 'complete') return;
      if (data.jobId !== jobId || data.sourceId !== baseline.source.id || data.baselineKey !== baseline.key ||
          data.settingsKey !== key || key !== settingsKey(this.state.settings) || baseline.key !== this.expectedBaselineKey()) {
        data.resultView.close(); return;
      }
      this.acceptRender(data, baseline, settings);
    };
    worker.onerror = worker.onmessageerror = () => {
      if (this.disposed || this.render !== worker) return;
      if (this.renderBusy) {
        this.stopRender(true);
        this.publish({ status: 'error', error: FAILURE_MESSAGES['processing-failed'], errorAction: 'render' });
      } else {
        // Retire a broken idle worker without canceling an already scheduled debounce.
        worker.terminate(); this.render = null;
      }
    };
    // Deliberately no transfer list: the cached bitmap stays owned by the controller.
    try { worker.postMessage({ kind: 'render', jobId, sourceId: baseline.source.id, baselineKey: baseline.key,
      settingsKey: key, width: baseline.width, height: baseline.height, baselineBitmap: baseline.bitmap, settings }); }
    catch { failed('unsupported-browser'); }
  }
  private acceptRender(reply: RenderReply, baseline: Baseline, settings: RenderSettings): void {
    if (reply.width !== baseline.width || reply.height !== baseline.height || reply.pixels.byteLength !== baseline.width * baseline.height * 4 ||
        reply.resultView.width !== baseline.width || reply.resultView.height !== baseline.height) {
      reply.resultView.close(); this.stopRender(); this.publish({ status: 'error', error: FAILURE_MESSAGES['processing-failed'], errorAction: 'render' }); return;
    }
    const previous = this.state.frame;
    this.renderBusy = false; // Retain the idle worker; invalidate this completed job's reply authority.
    this.stopRender();
    this.publish({ frame: { baseline, settings, settingsKey: reply.settingsKey, resultView: reply.resultView, pixels: reply.pixels },
      status: this.candidate ? 'opening' : 'ready' });
    previous?.resultView.close();
    this.closeUnused(previous?.baseline ?? null);
  }

  cancel(): void {
    if (this.disposed) return;
    this.candidate = null;
    this.stopPreparation(); this.stopRender(true);
    this.publish({ status: this.state.source ? 'outdated' : 'empty', error: null });
  }
  retry(): void {
    if (this.disposed) return;
    this.publish({ error: null });
    this.stopRender();
    if (this.baseline?.key === this.expectedBaselineKey()) this.scheduleRender(0);
    else if (this.file && this.state.source) this.prepare(this.file, this.state.source.id, null);
  }

  reportFailure(code: keyof typeof FAILURE_MESSAGES): void {
    if (!this.disposed) this.publish({ error: FAILURE_MESSAGES[code], errorAction: 'export' });
  }

  exportPng(): Promise<{ blob: Blob; filename: string }> {
    if (this.disposed || !this.state.canExport || !this.state.frame) return Promise.reject(new ProcessingError('export-failed'));
    const frame = this.state.frame;
    const filename = renderFilename(frame);
    const exportId = ++this.exportId;
    let worker: WorkerPort;
    try { worker = this.workers('export'); }
    catch { this.publish({ error: FAILURE_MESSAGES['unsupported-browser'], errorAction: 'export' }); return Promise.reject(new ProcessingError('unsupported-browser')); }
    this.encoder = worker;
    this.publish({ exporting: true, exportFilename: filename, ...(this.state.errorAction === 'export' ? { error: null } : {}) });
    return new Promise((resolve, reject) => {
      this.rejectExport = reject;
      const current = () => !this.disposed && this.encoder === worker && this.exportId === exportId;
      const finish = () => {
        worker.terminate(); this.encoder = null; this.rejectExport = null;
        this.publish({ exporting: false, exportFilename: null });
      };
      const failed = (code: keyof typeof FAILURE_MESSAGES) => {
        if (!current()) return;
        finish(); this.publish({ error: FAILURE_MESSAGES[code], errorAction: 'export' }); reject(new ProcessingError(code));
      };
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (!current()) return;
        if (data.kind === 'failed') { failed(data.code); return; }
        if (data.kind === 'exported' && data.exportId === exportId) {
          if (!data.blob || data.blob.size === 0) { failed('export-failed'); return; }
          finish(); resolve({ blob: data.blob, filename });
        }
      };
      worker.onerror = worker.onmessageerror = () => failed('export-failed');
      try {
        const pixels = frame.pixels.slice(0);
        worker.postMessage({ kind: 'export', exportId, width: frame.baseline.width, height: frame.baseline.height, pixels }, [pixels]);
      } catch { failed('export-failed'); }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.candidate = null;
    this.stopPreparation(); this.stopRender(true);
    this.encoder?.terminate(); this.encoder = null;
    this.rejectExport?.(new ProcessingError('canceled')); this.rejectExport = null;
    const bitmaps = new Set([this.baseline?.bitmap, this.state.frame?.baseline.bitmap, this.state.frame?.resultView]);
    for (const bitmap of bitmaps) bitmap?.close();
    this.baseline = null; this.file = null;
    this.publish({ status: 'empty', source: null, frame: null, exporting: false, exportFilename: null, error: null });
  }
}
