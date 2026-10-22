import { ProcessingError, type WorkerFactory } from './render-contract';

// Literal URLs let Next bundle all chunks with the production base path.
export const createBrowserWorker: WorkerFactory = kind => {
  if (typeof Worker === 'undefined') throw new ProcessingError('unsupported-browser');
  if (kind === 'baseline') return new Worker(new URL('../workers/baseline.worker.ts', import.meta.url), { type: 'module' });
  if (kind === 'render') return new Worker(new URL('../workers/processing.worker.ts', import.meta.url), { type: 'module' });
  return new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' });
};
