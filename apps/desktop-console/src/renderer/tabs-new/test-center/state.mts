import type { TestBucket, TestRunResult, TestReport, TestCenterState } from './types.mts';

export function createTestCenterState(): TestCenterState {
  return {
    buckets: [],
    selectedBucketId: null,
    running: false,
    currentBucketId: null,
    results: new Map(),
    logs: [],
    logsPaused: false,
    report: null,
    filterText: '',
  };
}

export function setBuckets(state: TestCenterState, buckets: TestBucket[]) {
  state.buckets = buckets;
  if (!state.selectedBucketId && buckets.length > 0) {
    state.selectedBucketId = buckets[0].id;
  }
}

export function selectBucket(state: TestCenterState, bucketId: string) {
  state.selectedBucketId = bucketId;
}

export function setRunning(state: TestCenterState, running: boolean, bucketId?: string) {
  state.running = running;
  if (bucketId) state.currentBucketId = bucketId;
  if (!running) state.currentBucketId = null;
}

export function addLog(state: TestCenterState, line: string) {
  if (!state.logsPaused) {
    state.logs.push(line);
    // Keep last 500 lines
    if (state.logs.length > 500) {
      state.logs = state.logs.slice(-500);
    }
  }
}

export function addResult(state: TestCenterState, result: TestRunResult) {
  state.results.set(`${result.suite}::${result.name}`, result);
}

export function setReport(state: TestCenterState, report: TestReport | null) {
  state.report = report;
}

export function clearLogs(state: TestCenterState) {
  state.logs = [];
}

export function toggleLogsPaused(state: TestCenterState) {
  state.logsPaused = !state.logsPaused;
}

export function setFilterText(state: TestCenterState, text: string) {
  state.filterText = text;
}

export function getSelectedBucket(state: TestCenterState): TestBucket | null {
  if (!state.selectedBucketId) return null;
  return findBucketById(state.buckets, state.selectedBucketId);
}

export function findBucketById(buckets: TestBucket[], id: string): TestBucket | null {
  for (const bucket of buckets) {
    if (bucket.id === id) return bucket;
    if (bucket.subBuckets) {
      const found = findBucketById(bucket.subBuckets, id);
      if (found) return found;
    }
  }
  return null;
}

export function filterTestCases(state: TestCenterState): Array<{ bucket: TestBucket; suite: any; testCase: any }> {
  const items: Array<{ bucket: TestBucket; suite: any; testCase: any }> = [];
  const filter = state.filterText.toLowerCase().trim();

  function addFromBucket(bucket: TestBucket) {
    for (const suite of bucket.suites) {
      for (const tc of suite.cases) {
        if (!filter || tc.name.toLowerCase().includes(filter) || suite.name.toLowerCase().includes(filter)) {
          items.push({ bucket, suite, testCase: tc });
        }
      }
    }
    if (bucket.subBuckets) {
      bucket.subBuckets.forEach(addFromBucket);
    }
  }

  state.buckets.forEach(addFromBucket);
  return items;
}
