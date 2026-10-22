import { encodePng } from './png-encoder';
import { ProcessingError, type ExportRequest, type WorkerReply } from '../lib/render-contract';
const scope = self as unknown as { onmessage: (event: MessageEvent<ExportRequest>) => void;
  postMessage: (reply: WorkerReply) => void };
scope.onmessage = async ({ data }) => {
  try { scope.postMessage(await encodePng(data)); }
  catch (error) { scope.postMessage({ kind: 'failed', code: error instanceof ProcessingError ? error.code : 'export-failed' }); }
};
