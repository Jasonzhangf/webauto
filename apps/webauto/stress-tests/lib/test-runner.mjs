/**
 * Unified stress test runner
 * Provides: metrics collection, timing, error tracking, report generation
 */
export class StressTestRunner {
  constructor(options = {}) {
    this.name = options.name || 'unnamed';
    this.metrics = {
      totalOps: 0,
      successOps: 0,
      failedOps: 0,
      errors: [],
      latencies: [],
      startTime: null,
      endTime: null,
      memorySnapshots: [],
    };
    this.config = {
      maxErrors: options.maxErrors || 10,
      profileId: options.profileId || 'default',
      browserServiceUrl: options.browserServiceUrl || 'http://127.0.0.1:7704',
      ...options,
    };
  }

  recordSuccess(latencyMs) {
    this.metrics.totalOps++;
    this.metrics.successOps++;
    this.metrics.latencies.push(latencyMs);
  }

  recordError(error, latencyMs) {
    this.metrics.totalOps++;
    this.metrics.failedOps++;
    this.metrics.errors.push({
      ts: new Date().toISOString(),
      error: String(error).slice(0, 200),
      latencyMs,
    });
    if (this.metrics.failedOps >= this.config.maxErrors) {
      throw new Error(`Max errors reached (${this.config.maxErrors}): ${error}`);
    }
  }

  snapshotMemory() {
    const mem = process.memoryUsage();
    this.metrics.memorySnapshots.push({
      ts: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    });
    return mem;
  }

  summary() {
    const { totalOps, successOps, failedOps, latencies, memorySnapshots } = this.metrics;
    const successRate = totalOps > 0 ? ((successOps / totalOps) * 100).toFixed(2) : 'N/A';
    const avgLatency = latencies.length > 0
      ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)
      : 'N/A';
    const p50 = this.percentile(latencies, 50);
    const p99 = this.percentile(latencies, 99);
    const maxMem = memorySnapshots.length > 0
      ? Math.max(...memorySnapshots.map(s => s.heapUsed))
      : 0;
    const leakRate = memorySnapshots.length >= 2
      ? (memorySnapshots[memorySnapshots.length - 1].heapUsed - memorySnapshots[0].heapUsed) / 1024 / 1024
      : 0;

    return {
      name: this.name,
      status: failedOps === 0 ? 'PASS' : successRate >= 95 ? 'WARN' : 'FAIL',
      totalOps,
      successOps,
      failedOps,
      successRate: `${successRate}%`,
      avgLatency: `${avgLatency}ms`,
      p50: `${p50}ms`,
      p99: `${p99}ms`,
      maxHeapMB: (maxMem / 1024 / 1024).toFixed(1),
      leakRateMB: leakRate.toFixed(1),
      errorCount: failedOps,
      errors: this.metrics.errors.slice(-5),
      durationMs: this.metrics.endTime && this.metrics.startTime
        ? this.metrics.endTime - this.metrics.startTime
        : null,
    };
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
}

/**
 * Call browser-service API
 */
export async function callBrowserService(action, args, options = {}) {
  const { browserServiceUrl, timeoutMs = 30000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${browserServiceUrl}/api/v1/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args }),
      signal: controller.signal,
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, data: json };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
