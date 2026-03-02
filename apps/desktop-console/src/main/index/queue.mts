export class GroupQueue {
  private running = false;
  private queue: Array<() => Promise<void>> = [];

  enqueue(job: () => Promise<void>) {
    this.queue.push(job);
    void this.pump();
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        await job();
      }
    } finally {
      this.running = false;
    }
  }
}
