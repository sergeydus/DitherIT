import { renderBaseline } from './operations';
import { ProcessingError, type RenderRequest, type WorkerReply } from '../lib/render-contract';
const scope = self as unknown as { onmessage: (event: MessageEvent<RenderRequest>) => void;
  postMessage: (reply: WorkerReply, transfer?: Transferable[]) => void };
scope.onmessage = ({ data }) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const reply = renderBaseline(data);
    bitmap = reply.resultView;
    scope.postMessage(reply, [reply.pixels, bitmap]);
  } catch (error) {
    bitmap?.close();
    scope.postMessage({ kind: 'failed', code: error instanceof ProcessingError ? error.code : 'processing-failed' });
  }
};
