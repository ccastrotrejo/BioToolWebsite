/** Serialize Mol* mutations; obsolete requests may finish but cannot publish. */
export class LatestTaskQueue {
  private revision = 0;
  private stopped = false;
  private tail: Promise<void> = Promise.resolve();

  get active(): boolean {
    return !this.stopped;
  }

  enqueue(task: (isCurrent: () => boolean) => Promise<void>, onError: (error: unknown) => void): void {
    const revision = ++this.revision;
    const isCurrent = () => !this.stopped && revision === this.revision;
    this.tail = this.tail.then(async () => {
      if (!isCurrent()) return;
      try {
        await task(isCurrent);
      } catch (error) {
        if (isCurrent()) onError(error);
      }
    });
  }

  /** Exports share the mutation queue but must not invalidate a display update. */
  run(task: () => Promise<void>, onError: (error: unknown) => void): Promise<void> {
    this.tail = this.tail.then(async () => {
      if (this.stopped) return;
      try {
        await task();
      } catch (error) {
        if (!this.stopped) onError(error);
      }
    });
    return this.tail;
  }

  /** Dispose after in-flight Mol* state transactions, never during a commit. */
  stop(dispose: () => void): Promise<void> {
    this.stopped = true;
    this.revision++;
    return this.tail.finally(dispose);
  }
}
