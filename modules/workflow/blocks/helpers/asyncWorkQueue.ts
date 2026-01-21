export class AsyncWorkQueue {
  private readonly concurrency: number;
  private readonly label: string;
  private running = 0;
  private readonly pending: Array<{
    run: () => Promise<any>;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }> = [];
  private drainResolvers: Array<() => void> = [];

  constructor(opts: { concurrency?: number; label?: string } = {}) {
    this.concurrency = Math.max(1, Math.floor(opts.concurrency ?? 1));
    this.label = opts.label || 'queue';
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  getRunningCount(): number {
    return this.running;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      this.pending.push({ run: fn, resolve, reject });
      this.pump();
    });
  }

  async drain(): Promise<void> {
    if (this.pending.length === 0 && this.running === 0) return;
    await new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve);
      this.pump();
    });
  }

  private pump() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.running += 1;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.running -= 1;
          if (this.pending.length === 0 && this.running === 0) {
            const resolvers = this.drainResolvers.slice();
            this.drainResolvers = [];
            for (const r of resolvers) r();
          } else {
            this.pump();
          }
        });
    }
  }
}

