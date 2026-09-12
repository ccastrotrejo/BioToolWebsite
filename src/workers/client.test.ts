import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Protein } from '../domain/types';
import { pdbAtom, source } from '../formats/fixtures/structures';
import { parseInWorker } from './client';
import type { ParseRequest } from './protocol';

const protein: Protein = {
  title: 'Worker result', chains: [], residues: [], atoms: [], modelNumber: '1', warnings: [],
};

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  static postError: Error | null = null;
  static onConstruct: (() => void) | null = null;
  readonly url: URL;
  readonly options: WorkerOptions;
  terminate = vi.fn();
  postMessage = vi.fn<(request: ParseRequest) => void>(() => {
    if (FakeWorker.postError) throw FakeWorker.postError;
  });
  override addEventListener = vi.fn((
    type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean,
  ) => super.addEventListener(type, listener, options));
  override removeEventListener = vi.fn((
    type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean,
  ) => super.removeEventListener(type, listener, options));

  constructor(url: URL, options: WorkerOptions) {
    super();
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
    FakeWorker.onConstruct?.();
  }

  get request(): ParseRequest {
    return this.postMessage.mock.calls[0]![0];
  }

  reply(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

function lastWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  if (!worker) throw new Error('No worker was created.');
  return worker;
}

function expectCleaned(worker: FakeWorker) {
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(worker.removeEventListener.mock.calls.map(([type]) => type).sort()).toEqual(['error', 'message', 'messageerror']);
  for (const [type, listener] of worker.addEventListener.mock.calls) {
    expect(worker.removeEventListener).toHaveBeenCalledWith(type, listener);
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.postError = null;
  FakeWorker.onConstruct = null;
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => vi.unstubAllGlobals());

describe('disposable module-worker client', () => {
  it('creates a supported module worker, correlates success and cleans up all listeners', async () => {
    const controller = new AbortController();
    const removeAbort = vi.spyOn(controller.signal, 'removeEventListener');
    const input = source(pdbAtom());
    const result = parseInWorker(input, controller.signal);
    const worker = lastWorker();
    expect(worker.url.pathname).toMatch(/\/analysis\.worker\.ts$/);
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.request).toEqual({ type: 'parse', id: expect.any(String), source: input });
    worker.reply({ type: 'result', id: worker.request.id, protein });
    await expect(result).resolves.toEqual(protein);
    expectCleaned(worker);
    expect(removeAbort).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    worker.reply({ type: 'error', id: worker.request.id, error: { name: 'Error', message: 'late' } });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('clones source bytes through postMessage without a transfer list or detaching the original', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = parseInWorker(source(bytes, 'bcif'), new AbortController().signal);
    const worker = lastWorker();
    expect(worker.postMessage.mock.calls[0]).toHaveLength(1);
    expect(worker.request.source.data).toBe(bytes);
    worker.reply({ type: 'result', id: worker.request.id, protein });
    await result;
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it('correlates simultaneous requests with different IDs and independent workers', async () => {
    const first = parseInWorker(source(pdbAtom()), new AbortController().signal);
    const firstWorker = lastWorker();
    const second = parseInWorker(source(pdbAtom()), new AbortController().signal);
    const secondWorker = lastWorker();
    expect(firstWorker.request.id).not.toBe(secondWorker.request.id);
    secondWorker.reply({ type: 'result', id: secondWorker.request.id, protein: { ...protein, title: 'second' } });
    firstWorker.reply({ type: 'result', id: firstWorker.request.id, protein });
    await expect(first).resolves.toHaveProperty('title', 'Worker result');
    await expect(second).resolves.toHaveProperty('title', 'second');
    expectCleaned(firstWorker);
    expectCleaned(secondWorker);
  });

  it('propagates a serialized parse error explicitly', async () => {
    const promise = parseInWorker(source('bad'), new AbortController().signal);
    const worker = lastWorker();
    worker.reply({ type: 'error', id: worker.request.id, error: { name: 'ParseError', message: 'Unsupported residue' } });
    await expect(promise).rejects.toMatchObject({ name: 'ParseError', message: 'Unsupported residue' });
    expectCleaned(worker);
  });

  it('aborts an active worker and removes signal listeners', async () => {
    const controller = new AbortController();
    const removeAbort = vi.spyOn(controller.signal, 'removeEventListener');
    const promise = parseInWorker(source(pdbAtom()), controller.signal);
    const worker = lastWorker();
    controller.abort('cancelled by user');
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expectCleaned(worker);
    expect(removeAbort).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('does not create a worker for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(parseInWorker(source(pdbAtom()), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('handles an abort racing worker setup without posting work', async () => {
    const controller = new AbortController();
    FakeWorker.onConstruct = () => controller.abort();
    await expect(parseInWorker(source(pdbAtom()), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(lastWorker().postMessage).not.toHaveBeenCalled();
    expectCleaned(lastWorker());
  });

  it('reports unsupported workers rather than silently parsing on the UI thread', async () => {
    vi.stubGlobal('Worker', undefined);
    await expect(parseInWorker(source(pdbAtom()), new AbortController().signal)).rejects.toThrow('does not support Web Workers');
  });

  it('reports constructor errors', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('Worker blocked by browser'); } });
    await expect(parseInWorker(source(pdbAtom()), new AbortController().signal)).rejects.toThrow('blocked by browser');
  });

  it('cleans up after postMessage throws', async () => {
    FakeWorker.postError = new Error('Data could not be cloned');
    await expect(parseInWorker(source(pdbAtom()), new AbortController().signal)).rejects.toThrow('could not be cloned');
    expectCleaned(lastWorker());
  });

  it('propagates worker runtime errors and message-deserialization errors', async () => {
    for (const event of [
      new ErrorEvent('error', { message: 'Worker crashed', cancelable: true }),
      new Event('messageerror'),
    ]) {
      const promise = parseInWorker(source(pdbAtom()), new AbortController().signal);
      const worker = lastWorker();
      worker.dispatchEvent(event);
      await expect(promise).rejects.toThrow(event.type === 'error' ? 'Worker crashed' : 'unreadable message');
      expectCleaned(worker);
    }
  });

  it('rejects mismatched IDs instead of resolving the wrong request', async () => {
    const promise = parseInWorker(source(pdbAtom()), new AbortController().signal);
    const worker = lastWorker();
    worker.reply({ type: 'result', id: 'incorrect', protein });
    await expect(promise).rejects.toThrow('mismatched request ID');
    expectCleaned(worker);
  });

  it.each([null, {}, { type: 'result', id: '1' }, { type: 'result', id: '1', protein: {} }, { type: 'error', id: '1', error: 'bad' }])(
    'rejects malformed worker envelopes %j', async (response) => {
      const promise = parseInWorker(source(pdbAtom()), new AbortController().signal);
      const worker = lastWorker();
      worker.reply(response);
      await expect(promise).rejects.toThrow('invalid response');
      expectCleaned(worker);
    },
  );
});
