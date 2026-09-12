import type { Protein, SourceFile } from '../domain/types';
import { isParseResponse } from './protocol';
import type { ParseRequest } from './protocol';

let nextRequestId = 0;

function abortError(): DOMException {
  return new DOMException('Structure parsing was aborted.', 'AbortError');
}

/** Runs one parse in a disposable module worker; original buffers are cloned, never transferred. */
export function parseInWorker(source: SourceFile, signal: AbortSignal): Promise<Protein> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    if (typeof Worker === 'undefined') {
      reject(new Error('This browser does not support Web Workers required for structure parsing.'));
      return;
    }
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    const id = String(++nextRequestId);
    let settled = false;
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const finish = (result: Protein | Error, failed: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (failed) reject(result);
      else resolve(result as Protein);
    };
    const onAbort = () => finish(abortError(), true);
    const onError = (event: ErrorEvent) => {
      event.preventDefault();
      finish(new Error(event.message || 'The structure worker failed.'), true);
    };
    const onMessageError = () => finish(new Error('The structure worker returned an unreadable message.'), true);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isParseResponse(event.data)) {
        finish(new Error('The structure worker returned an invalid response.'), true);
        return;
      }
      if (event.data.id !== id) {
        finish(new Error('The structure worker returned a mismatched request ID.'), true);
        return;
      }
      if (event.data.type === 'error') {
        const error = new Error(event.data.error.message);
        error.name = event.data.error.name;
        finish(error, true);
      } else finish(event.data.protein, false);
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onMessageError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    try {
      const request: ParseRequest = { type: 'parse', id, source };
      worker.postMessage(request);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)), true);
    }
  });
}
