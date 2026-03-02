import type { TestBucket, TestRunResult, TestReport } from './types.mts';
import { gatherBucketTestFiles } from './scanner.mts';

const UNIFIED_API_URL = 'http://127.0.0.1:7701';
const HEALTH_TIMEOUT_MS = 30000;

export class TestRunner {
  private running = false;
  private logs: string[] = [];
  private results: TestRunResult[] = [];
  private onLog: (line: string) => void = () => {};
  private onResult: (result: TestRunResult) => void = () => {};
  private abortController: AbortController | null = null;

  constructor(private repoRoot: string) {}

  setCallbacks(onLog: (line: string) => void, onResult: (result: TestRunResult) => void) {
    this.onLog = onLog;
    this.onResult = onResult;
  }

  isRunning() {
    return this.running;
  }

  // Auto-spawn daemon if Unified API is not healthy
  async ensureUnifiedApi(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${UNIFIED_API_URL}/health`, { method: 'GET' });
      if (res.ok) {
        this.log('[runner] Unified API is healthy');
        return { ok: true };
      }
    } catch {
      // Not running, try to start
    }

    this.log('[runner] Unified API not available, starting daemon...');
    try {
      // Use UI CLI to start daemon which will bring up Unified API
      const startResult = await (window as any).api.cmdRunJson({
        cmd: 'node',
        args: ['scripts/run.mjs', 'ui', 'cli', 'start', '--build'],
        cwd: this.repoRoot,
        timeout: 60000,
      });

      if (!startResult || !startResult.ok) {
        return { ok: false, error: startResult?.stderr || 'Failed to start daemon via ui cli' };
      }

      // Wait for health with timeout
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${UNIFIED_API_URL}/health`, { method: 'GET' });
          if (res.ok) {
            this.log('[runner] Unified API is now healthy');
            return { ok: true };
          }
        } catch {
          // Continue waiting
        }
        await this.sleep(1000);
      }

      return { ok: false, error: 'Unified API did not become healthy within 30s' };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async runBucket(bucket: TestBucket): Promise<TestReport> {
    if (this.running) {
      throw new Error('Tests already running');
    }

    this.running = true;
    this.logs = [];
    this.results = [];
    this.abortController = new AbortController();

    const testFiles = gatherBucketTestFiles(bucket);
    const startTime = Date.now();

    this.log(`[runner] Starting bucket: ${bucket.label}`);
    this.log(`[runner] Test files: ${testFiles.length}`);

    try {
      // Ensure Unified API is available
      const ensureResult = await this.ensureUnifiedApi();
      if (!ensureResult.ok) {
        this.log(`[runner] ERROR: ${ensureResult.error}`);
        throw new Error(ensureResult.error);
      }

      // Run vitest for each test file
      for (const file of testFiles) {
        if (this.abortController.signal.aborted) {
          this.log('[runner] Aborted by user');
          break;
        }

        await this.runTestFile(file);
      }
    } catch (err: any) {
      this.log(`[runner] ERROR: ${err?.message || String(err)}`);
    } finally {
      this.running = false;
    }

    const duration = Date.now() - startTime;
    const report: TestReport = {
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'passed').length,
        failed: this.results.filter(r => r.status === 'failed').length,
        skipped: this.results.filter(r => r.status === 'skipped').length,
        duration,
        successRate: this.results.length > 0
          ? `${((this.results.filter(r => r.status === 'passed').length / this.results.length) * 100).toFixed(2)}%`
          : '0%',
      },
      bucket: bucket.id,
      results: this.results,
      timestamp: new Date().toISOString(),
    };

    this.log(`[runner] Bucket completed: ${report.summary.passed}/${report.summary.total} passed`);
    return report;
  }

  private async runTestFile(file: string): Promise<void> {
    this.log(`[runner] Running: ${file}`);

    try {
      // Use cmdSpawn to run vitest
      const spec = {
        cmd: 'npx',
        args: ['vitest', 'run', file, '--reporter=json'],
        cwd: this.repoRoot,
        timeout: 120000,
      };

      const result = await (window as any).api.cmdRunJson(spec);

      if (result.ok && result.json) {
        // Parse vitest JSON output
        const vitestOutput = result.json;
        const suites = vitestOutput?.testResults || [];

        for (const suite of suites) {
          const suiteName = suite.name || file;
          const assertions = suite.assertionResults || [];

          for (const assertion of assertions) {
            const testResult: TestRunResult = {
              suite: suiteName,
              name: assertion.title || 'unknown',
              status: assertion.status === 'passed' ? 'passed' :
                      assertion.status === 'skipped' ? 'skipped' : 'failed',
              duration: assertion.duration || 0,
              error: assertion.failureMessages?.join('\n'),
              logs: [],
            };

            this.results.push(testResult);
            this.onResult(testResult);
          }
        }
      } else {
        // Fallback: treat as single failed test
        this.log(`[runner] Failed to parse vitest output for ${file}`);
        const testResult: TestRunResult = {
          suite: file,
          name: 'run',
          status: 'failed',
          duration: 0,
          error: result.stderr || 'Unknown error',
          logs: [result.stdout || '', result.stderr || ''],
        };
        this.results.push(testResult);
        this.onResult(testResult);
      }
    } catch (err: any) {
      this.log(`[runner] ERROR running ${file}: ${err?.message || String(err)}`);
      const testResult: TestRunResult = {
        suite: file,
        name: 'run',
        status: 'failed',
        duration: 0,
        error: err?.message || String(err),
        logs: [],
      };
      this.results.push(testResult);
      this.onResult(testResult);
    }
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.running = false;
    this.log('[runner] Stopped by user');
  }

  getLogs(): string[] {
    return this.logs;
  }

  private log(line: string) {
    this.logs.push(line);
    this.onLog(line);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export async function saveReport(report: TestReport, repoRoot: string): Promise<string> {
  const home = (window as any).api.osHomedir();
  const reportsDir = `${home}/.webauto/test-center/reports`;
  const fileName = `report-${Date.now()}.json`;
  const filePath = (window as any).api.pathJoin(reportsDir, fileName);

  // Ensure directory exists via IPC (simplified: write file directly)
  const content = JSON.stringify(report, null, 2);
  await (window as any).api.invoke('fs:writeFile', { path: filePath, content });

  return filePath;
}
