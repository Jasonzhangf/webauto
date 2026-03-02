import { createEl } from '../../ui-components.mts';
import { renderTestCenterLayout, renderSidebar, renderTestList, renderLogs, renderSummary } from './layout.mts';
import { scanTestBuckets, countBucketTests, gatherBucketTestFiles } from './scanner.mts';
import { TestRunner, saveReport } from './runner.mts';
import {
  createTestCenterState,
  setBuckets,
  selectBucket,
  setRunning,
  addLog,
  addResult,
  setReport,
  clearLogs,
  toggleLogsPaused,
  setFilterText,
  getSelectedBucket,
  findBucketById,
} from './state.mts';
import type { TestCenterState, TestBucket, TestReport } from './types.mts';
import { AGGREGATE_BUCKETS } from './types.mts';

export function renderTestCenter(root: HTMLElement, ctx: any) {
  root.textContent = '';

  const state = createTestCenterState();
  let repoRoot = (window as any).api.pathJoin((window as any).api.osHomedir(), 'Documents', 'github', 'webauto');
  const runner = new TestRunner(repoRoot);

  const ui = renderTestCenterLayout(root);

  // Setup callbacks
  runner.setCallbacks(
    (line) => {
      addLog(state, line);
      renderLogs(ui.logPanel, state.logs, state.logsPaused);
    },
    (result) => {
      addResult(state, result);
      // Re-render test list to show updated status
      const bucket = getSelectedBucket(state);
      renderTestList(ui.testList, bucket, state.results, state.filterText, handleRunSingle);
    }
  );

  // Initial scan
  (async () => {
    try {
      const resolved = await (window as any).api.appGetRepoRoot?.();
      if (resolved) repoRoot = resolved;
    } catch {
      // keep fallback
    }
    scanAndRender();
  })();

  // Event handlers
  ui.refreshBtn.onclick = scanAndRender;
  ui.stopBtn.onclick = handleStop;
  ui.exportBtn.onclick = handleExport;
  ui.searchInput.oninput = () => {
    setFilterText(state, ui.searchInput.value);
    const bucket = getSelectedBucket(state);
    renderTestList(ui.testList, bucket, state.results, state.filterText, handleRunSingle);
  };
  ui.pauseLogBtn.onclick = () => {
    toggleLogsPaused(state);
    ui.pauseLogBtn.textContent = state.logsPaused ? '恢复日志' : '暂停日志';
  };
  ui.clearLogBtn.onclick = () => {
    clearLogs(state);
    ui.logPanel.textContent = '';
  };

  async function scanAndRender() {
    try {
      addLog(state, '[test-center] Scanning test buckets...');
      const buckets = await scanTestBuckets(repoRoot);
      setBuckets(state, buckets);
      addLog(state, `[test-center] Found ${buckets.length} buckets`);

      renderSidebar(ui.sidebar, state.buckets, state.selectedBucketId, handleSelectBucket, handleRunBucket, state.running, state.currentBucketId);
      const bucket = getSelectedBucket(state);
      renderTestList(ui.testList, bucket, state.results, state.filterText, handleRunSingle);
      renderSummary(ui.summaryPanel, state.report);
    } catch (err: any) {
      addLog(state, `[test-center] ERROR: ${err?.message || String(err)}`);
    }
  }

  function handleSelectBucket(id: string) {
    selectBucket(state, id);
    renderSidebar(ui.sidebar, state.buckets, state.selectedBucketId, handleSelectBucket, handleRunBucket, state.running, state.currentBucketId);
    const bucket = getSelectedBucket(state);
    renderTestList(ui.testList, bucket, state.results, state.filterText, handleRunSingle);
  }

  async function handleRunBucket(id: string) {
    if (state.running) return;

    // Handle aggregate buckets
    const agg = AGGREGATE_BUCKETS.find(a => a.id === id);
    if (agg) {
      addLog(state, `[test-center] Running aggregate bucket: ${agg.label}`);
      // Run each bucket in sequence
      for (const bucketId of agg.bucketIds) {
        const bucket = findBucketById(state.buckets, bucketId);
        if (bucket) {
          await runSingleBucket(bucket);
        }
      }
      return;
    }

    const bucket = findBucketById(state.buckets, id);
    if (!bucket) return;

    await runSingleBucket(bucket);
  }

  async function runSingleBucket(bucket: TestBucket) {
    setRunning(state, true, bucket.id);
    ui.stopBtn.disabled = false;
    ui.refreshBtn.disabled = true;
    renderSidebar(ui.sidebar, state.buckets, state.selectedBucketId, handleSelectBucket, handleRunBucket, state.running, state.currentBucketId);

    try {
      const report = await runner.runBucket(bucket);
      setReport(state, report);
      renderSummary(ui.summaryPanel, report);
    } catch (err: any) {
      addLog(state, `[test-center] ERROR: ${err?.message || String(err)}`);
    } finally {
      setRunning(state, false);
      ui.stopBtn.disabled = true;
      ui.refreshBtn.disabled = false;
      renderSidebar(ui.sidebar, state.buckets, state.selectedBucketId, handleSelectBucket, handleRunBucket, state.running, state.currentBucketId);
    }
  }

  async function handleRunSingle(file: string, suite: string, name: string) {
    if (state.running) return;

    addLog(state, `[test-center] Running single test: ${suite} - ${name}`);
    // For single tests, run the entire file (vitest doesn't support running individual tests easily)
    // Find the bucket containing this file
    for (const bucket of state.buckets) {
      if (bucket.suites.some(s => s.file === file)) {
        await handleRunBucket(bucket.id);
        return;
      }
      if (bucket.subBuckets) {
        for (const sub of bucket.subBuckets) {
          if (sub.suites.some(s => s.file === file)) {
            await handleRunBucket(sub.id);
            return;
          }
        }
      }
    }
  }

  function handleStop() {
    if (state.running) {
      runner.stop();
      setRunning(state, false);
      ui.stopBtn.disabled = true;
      ui.refreshBtn.disabled = false;
      renderSidebar(ui.sidebar, state.buckets, state.selectedBucketId, handleSelectBucket, handleRunBucket, state.running, state.currentBucketId);
    }
  }

  async function handleExport() {
    if (!state.report) {
      alert('没有可导出的报告');
      return;
    }
    try {
      const filePath = await saveReport(state.report, repoRoot);
      alert(`报告已保存到: ${filePath}`);
    } catch (err: any) {
      alert(`导出失败: ${err?.message || String(err)}`);
    }
  }
}
