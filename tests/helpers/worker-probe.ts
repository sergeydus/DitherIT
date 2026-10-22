import type { Page } from '@playwright/test';

export interface WorkerProbe {
  holdRender: boolean; holdExport: boolean; failRender: boolean; failExport: boolean;
  sent: Record<string, number>; exports: { width: number; height: number; pixels: number[] }[];
  held: Record<string, number>;
  urls: string[]; revoked: string[]; release: (kind: 'complete' | 'exported') => void;
}
export type ProbeWindow = Window & { __probe: WorkerProbe };

/** Real workers and real bytes, with controllable delivery to exercise async UI states. */
export async function installWorkerProbe(page: Page) {
  await page.addInitScript(() => {
    const pending: { kind: string; deliver: () => void }[] = [];
    const probe: WorkerProbe = {
      holdRender: false, holdExport: false, failRender: false, failExport: false,
      sent: {}, exports: [], urls: [], revoked: [], held: {},
      release(kind) {
        const replies = pending.filter(reply => reply.kind === kind);
        for (const reply of replies) { pending.splice(pending.indexOf(reply), 1); reply.deliver(); }
      },
    };
    (window as unknown as ProbeWindow).__probe = probe;
    const NativeWorker = Worker;
    class ControlledWorker {
      native: Worker;
      onmessage: Worker['onmessage'] = null;
      onerror: Worker['onerror'] = null;
      onmessageerror: Worker['onmessageerror'] = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        this.native = new NativeWorker(url, options);
        this.native.onmessage = event => {
          const kind = event.data.kind;
          const deliver = () => this.onmessage?.call(this.native, event);
          if ((kind === 'complete' && probe.holdRender) || (kind === 'exported' && probe.holdExport)) {
            pending.push({ kind, deliver }); probe.held[kind] = (probe.held[kind] ?? 0) + 1;
          }
          else deliver();
        };
        this.native.onerror = event => this.onerror?.call(this.native, event);
        this.native.onmessageerror = event => this.onmessageerror?.call(this.native, event);
      }
      postMessage(message: { kind: string; width?: number; height?: number; pixels?: ArrayBuffer }, transfer?: Transferable[]) {
        probe.sent[message.kind] = (probe.sent[message.kind] ?? 0) + 1;
        if (message.kind === 'export') probe.exports.push({ width: message.width!, height: message.height!, pixels: [...new Uint8Array(message.pixels!)] });
        if ((message.kind === 'render' && probe.failRender) || (message.kind === 'export' && probe.failExport)) {
          const code = message.kind === 'render' ? 'processing-failed' : 'export-failed';
          probe.failRender = false; probe.failExport = false;
          queueMicrotask(() => this.onmessage?.call(this.native, { data: { kind: 'failed', code } } as MessageEvent));
        } else this.native.postMessage(message, transfer ?? []);
      }
      terminate() { this.native.terminate(); }
    }
    window.Worker = ControlledWorker as unknown as typeof Worker;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = object => { const url = create(object); if (object instanceof Blob && object.type === 'image/png') probe.urls.push(url); return url; };
    URL.revokeObjectURL = url => { probe.revoked.push(url); revoke(url); };
  });
}
