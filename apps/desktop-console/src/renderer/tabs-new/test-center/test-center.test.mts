import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createTestCenterState, setBuckets, selectBucket, setRunning, addLog, addResult, setReport, clearLogs, toggleLogsPaused, setFilterText, getSelectedBucket, findBucketById, filterTestCases } from './state.mts';
import type { TestBucket, TestRunResult } from './types.mts';

describe('TestCenter State', () => {
  test('createTestCenterState initializes with defaults', () => {
    const state = createTestCenterState();
    assert.equal(state.buckets.length, 0);
    assert.equal(state.selectedBucketId, null);
    assert.equal(state.running, false);
    assert.equal(state.logs.length, 0);
    assert.equal(state.logsPaused, false);
    assert.equal(state.report, null);
    assert.equal(state.filterText, '');
  });

  test('setBuckets updates state and selects first bucket', () => {
    const state = createTestCenterState();
    const buckets: TestBucket[] = [
      { id: 'contracts', label: 'Contracts', path: 'tests/e2e-ui/contracts', suites: [] },
      { id: 'controls', label: 'Controls', path: 'tests/e2e-ui/controls', suites: [] },
    ];

    setBuckets(state, buckets);

    assert.equal(state.buckets.length, 2);
    assert.equal(state.selectedBucketId, 'contracts');
  });

  test('selectBucket updates selectedBucketId', () => {
    const state = createTestCenterState();
    setBuckets(state, [
      { id: 'contracts', label: 'Contracts', path: 'tests/e2e-ui/contracts', suites: [] },
      { id: 'controls', label: 'Controls', path: 'tests/e2e-ui/controls', suites: [] },
    ]);

    selectBucket(state, 'controls');

    assert.equal(state.selectedBucketId, 'controls');
  });

  test('setRunning updates running state', () => {
    const state = createTestCenterState();

    setRunning(state, true, 'contracts');
    assert.equal(state.running, true);
    assert.equal(state.currentBucketId, 'contracts');

    setRunning(state, false);
    assert.equal(state.running, false);
    assert.equal(state.currentBucketId, null);
  });

  test('addLog appends log lines', () => {
    const state = createTestCenterState();

    addLog(state, 'line 1');
    addLog(state, 'line 2');

    assert.deepEqual(state.logs, ['line 1', 'line 2']);
  });

  test('addLog respects logsPaused', () => {
    const state = createTestCenterState();
    state.logsPaused = true;

    addLog(state, 'line 1');

    assert.equal(state.logs.length, 0);
  });

  test('addLog limits to 500 lines', () => {
    const state = createTestCenterState();

    for (let i = 0; i < 600; i++) {
      addLog(state, `line ${i}`);
    }

    assert.equal(state.logs.length, 500);
    assert.ok(state.logs[0].includes('line 101'));
  });

  test('addResult stores results', () => {
    const state = createTestCenterState();
    const result: TestRunResult = {
      suite: 'suite1',
      name: 'test1',
      status: 'passed',
      duration: 100,
      logs: [],
    };

    addResult(state, result);

    assert.ok(state.results.has('suite1::test1'));
    assert.equal(state.results.get('suite1::test1')?.status, 'passed');
  });

  test('setReport updates report', () => {
    const state = createTestCenterState();
    const report = {
      summary: { total: 10, passed: 8, failed: 2, skipped: 0, duration: 1000, successRate: '80%' },
      bucket: 'contracts',
      results: [],
      timestamp: new Date().toISOString(),
    };

    setReport(state, report);

    assert.equal(state.report, report);
  });

  test('clearLogs empties logs array', () => {
    const state = createTestCenterState();
    addLog(state, 'line 1');
    addLog(state, 'line 2');

    clearLogs(state);

    assert.equal(state.logs.length, 0);
  });

  test('toggleLogsPaused toggles pause state', () => {
    const state = createTestCenterState();

    toggleLogsPaused(state);
    assert.equal(state.logsPaused, true);

    toggleLogsPaused(state);
    assert.equal(state.logsPaused, false);
  });

  test('setFilterText updates filter', () => {
    const state = createTestCenterState();

    setFilterText(state, 'search term');

    assert.equal(state.filterText, 'search term');
  });

  test('getSelectedBucket returns selected bucket', () => {
    const state = createTestCenterState();
    const buckets: TestBucket[] = [
      { id: 'contracts', label: 'Contracts', path: 'tests/e2e-ui/contracts', suites: [] },
      { id: 'controls', label: 'Controls', path: 'tests/e2e-ui/controls', suites: [] },
    ];
    setBuckets(state, buckets);
    selectBucket(state, 'controls');

    const bucket = getSelectedBucket(state);

    assert.ok(bucket);
    assert.equal(bucket?.id, 'controls');
  });

  test('findBucketById finds bucket in nested structure', () => {
    const buckets: TestBucket[] = [
      {
        id: 'controls',
        label: 'Controls',
        path: 'tests/e2e-ui/controls',
        suites: [],
        subBuckets: [
          { id: 'controls/elements', label: 'Elements', path: 'tests/e2e-ui/controls/elements', suites: [] },
        ],
      },
    ];

    const found = findBucketById(buckets, 'controls/elements');

    assert.ok(found);
    assert.equal(found?.id, 'controls/elements');
  });

  test('filterTestCases filters by name', () => {
    const state = createTestCenterState();
    const buckets: TestBucket[] = [
      {
        id: 'contracts',
        label: 'Contracts',
        path: 'tests/e2e-ui/contracts',
        suites: [
          {
            name: 'API Suite',
            file: 'tests/e2e-ui/contracts/api.test.ts',
            cases: [
              { id: '1', file: 'f', suite: 'API Suite', name: 'health check', status: 'pending', logs: [] },
              { id: '2', file: 'f', suite: 'API Suite', name: 'list tasks', status: 'pending', logs: [] },
            ],
          },
        ],
      },
    ];
    setBuckets(state, buckets);

    setFilterText(state, 'health');
    const items = filterTestCases(state);

    assert.equal(items.length, 1);
    assert.equal(items[0].testCase.name, 'health check');
  });
});
