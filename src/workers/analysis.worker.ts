import { parseStructure } from '../formats/parse';
import type { ParseRequest, ParseResponse } from './protocol';

// Keep the application on DOM libs instead of colliding with lib.webworker globals.
interface ParseWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<ParseRequest>) => void): void;
  postMessage(response: ParseResponse): void;
}

const scope = globalThis as unknown as ParseWorkerScope;
scope.addEventListener('message', (event) => {
  const request = event.data;
  if (!request || request.type !== 'parse' || typeof request.id !== 'string') return;
  void (async () => {
    try {
      const protein = await parseStructure(request.source);
      scope.postMessage({ type: 'result', id: request.id, protein });
    } catch (error) {
      scope.postMessage({
        type: 'error', id: request.id,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'Error', message: String(error) },
      });
    }
  })();
});
