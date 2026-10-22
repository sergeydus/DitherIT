import { prepareBaseline } from './operations';
import { ProcessingError, type PrepareRequest, type WorkerReply } from '../lib/render-contract';
const scope = self as unknown as { onmessage: (event: MessageEvent<PrepareRequest>) => void;
  postMessage: (reply: WorkerReply, transfer?: Transferable[]) => void };
scope.onmessage = async ({ data }) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const reply = await prepareBaseline(data);
    bitmap = reply.bitmap;
    scope.postMessage(reply, [bitmap]);
  } catch (error) {
    bitmap?.close();
    scope.postMessage({ kind: 'failed', code: error instanceof ProcessingError ? error.code : 'processing-failed' });
  }
};
