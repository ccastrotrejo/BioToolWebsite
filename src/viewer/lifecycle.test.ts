import { describe, expect, it, vi } from 'vitest';
import { LatestTaskQueue } from './lifecycle';

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('latest viewer task queue', () => {
  it('ignores queued obsolete work and reports only current errors', async () => {
    const queue = new LatestTaskQueue();
    const old = vi.fn();
    const error = vi.fn();
    const newest = vi.fn();
    const finished = deferred();
    queue.enqueue(old, error);
    queue.enqueue(async () => { newest(); finished.resolve(); }, error);
    await finished.promise;
    await queue.stop(() => {});
    expect(old).not.toHaveBeenCalled();
    expect(newest).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });

  it('serializes in-flight work, suppresses its stale result, and drains before disposal', async () => {
    const queue = new LatestTaskQueue();
    const waiting = deferred();
    const events: string[] = [];
    const error = vi.fn();
    queue.enqueue(async isCurrent => {
      events.push('old starts');
      await waiting.promise;
      if (isCurrent()) events.push('old publishes');
    }, error);
    await Promise.resolve();
    queue.enqueue(async () => { events.push('new starts'); }, error);
    const stopped = queue.stop(() => { events.push('disposed'); });
    expect(events).toEqual(['old starts']);
    waiting.resolve();
    await stopped;
    expect(events).toEqual(['old starts', 'disposed']);
  });

  it('runs a newer update only after the superseded update settles', async () => {
    const queue = new LatestTaskQueue();
    const waiting = deferred();
    const finished = deferred();
    const events: string[] = [];
    queue.enqueue(async isCurrent => {
      events.push('old starts');
      await waiting.promise;
      if (isCurrent()) events.push('old publishes');
      throw new Error('Obsolete failure');
    }, () => { events.push('old error'); });
    await Promise.resolve();
    queue.enqueue(async () => { events.push('new publishes'); finished.resolve(); }, () => {});
    expect(events).toEqual(['old starts']);
    waiting.resolve();
    await finished.promise;
    await queue.stop(() => {});
    expect(events).toEqual(['old starts', 'new publishes']);
  });

  it('publishes current failures and recovers for a new request', async () => {
    const queue = new LatestTaskQueue();
    const reported = deferred();
    const failure = new Error('Malformed coordinates');
    const error = vi.fn(() => reported.resolve());
    queue.enqueue(async () => { throw failure; }, error);
    await reported.promise;
    expect(error).toHaveBeenCalledWith(failure);
    const finished = deferred();
    queue.enqueue(async () => { finished.resolve(); }, error);
    await finished.promise;
    await queue.stop(() => {});
  });

  it('serializes exports without superseding the pending display', async () => {
    const queue = new LatestTaskQueue();
    const events: string[] = [];
    queue.enqueue(async isCurrent => {
      if (isCurrent()) events.push('display');
    }, () => {});
    await queue.run(async () => { events.push('export'); }, () => {});
    await queue.stop(() => { events.push('dispose'); });
    expect(events).toEqual(['display', 'export', 'dispose']);
  });
});
