import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildXhsDetailOperations } from './xhs-autoscript-detail-ops.mjs';
import { computeNoteDelayMs, computeWaitBetweenNotesDelay } from './xhs-autoscript-base.mjs';

// Entry function test: computeWaitBetweenNotesDelay with stub rng
describe('computeWaitBetweenNotesDelay deterministic entry', () => {
  it('should return minMs when rng returns 0', () => {
    const options = { noteIntervalMinMs: 2000, noteIntervalMaxMs: 5000 };
    const delay = computeWaitBetweenNotesDelay(options, () => 0);
    assert.strictEqual(delay, 2000, 'rng=0 should yield delay=2000');
    console.log(`computeWaitBetweenNotesDelay rng=0 -> delay=${delay}`);
  });

  it('should return maxMs when rng returns ~1', () => {
    const options = { noteIntervalMinMs: 2000, noteIntervalMaxMs: 5000 };
    const delay = computeWaitBetweenNotesDelay(options, () => 0.999999);
    assert.strictEqual(delay, 5000, 'rng~1 should yield delay=5000');
    console.log(`computeWaitBetweenNotesDelay rng~1 -> delay=${delay}`);
  });

  it('should propagate debugLabel in log when DEBUG_WAIT_DELAY=true', () => {
    const originalDebug = process.env.DEBUG_WAIT_DELAY;
    const logs = [];
    const originalLog = console.log;
    try {
      process.env.DEBUG_WAIT_DELAY = 'true';
      console.log = (msg) => logs.push(msg);
      const options = { noteIntervalMinMs: 2000, noteIntervalMaxMs: 5000 };
      computeWaitBetweenNotesDelay(options, () => 0.5);
      assert.ok(logs.length > 0, 'should have debug log output');
      assert.ok(logs[0].includes('[computeNoteDelayMs:wait_between_notes]'), 'log should contain debugLabel');
      console.log(`debugLabel propagation verified: ${logs[0]}`);
    } finally {
      process.env.DEBUG_WAIT_DELAY = originalDebug;
      console.log = originalLog;
    }
  });
});

// Deterministic delay generation tests
describe('computeNoteDelayMs deterministic boundaries', () => {
  it('should return minMs when rng returns 0', () => {
    const delay = computeNoteDelayMs(2000, 5000, () => 0);
    assert.strictEqual(delay, 2000, 'rng=0 should yield delay=2000');
    console.log(`deterministic rng=0 -> delay=${delay}`);
  });

  it('should return maxMs when rng returns ~1', () => {
    const delay = computeNoteDelayMs(2000, 5000, () => 0.999999);
    assert.strictEqual(delay, 5000, 'rng~1 should yield delay=5000');
    console.log(`deterministic rng~1 -> delay=${delay}`);
  });

  it('should return fixed delay when minMs == maxMs', () => {
    const delay = computeNoteDelayMs(3000, 3000, () => 0.5);
    assert.strictEqual(delay, 3000, 'min==max should yield fixed delay');
    console.log(`deterministic min==max -> delay=${delay}`);
  });
});

// Ensure waitBetweenNotesParams propagate to wait_between_notes operation
describe('waitBetweenNotesParams propagation', () => {
  it('should propagate min/max/debugLabel into wait_between_notes params', () => {
    const options = {
      noteIntervalMinMs: 2000,
      noteIntervalMaxMs: 5000,
      detailLoopEnabled: true,
      detailOpenByLinks: true,
      tabCount: 1,
    };

    options.waitBetweenNotesParams = {
      minMs: options.noteIntervalMinMs,
      maxMs: options.noteIntervalMaxMs,
      debugLabel: 'wait_between_notes',
    };

    const operations = buildXhsDetailOperations(options);
    const waitBetweenNotesOp = operations.find(op => op.id === 'wait_between_notes');

    assert.ok(waitBetweenNotesOp, 'wait_between_notes operation should exist');
    assert.strictEqual(waitBetweenNotesOp.params.minMs, options.waitBetweenNotesParams.minMs);
    assert.strictEqual(waitBetweenNotesOp.params.maxMs, options.waitBetweenNotesParams.maxMs);
    assert.strictEqual(waitBetweenNotesOp.params.debugLabel, options.waitBetweenNotesParams.debugLabel);

    console.log(`waitBetweenNotes params: minMs=${waitBetweenNotesOp.params.minMs}, maxMs=${waitBetweenNotesOp.params.maxMs}, debugLabel="${waitBetweenNotesOp.params.debugLabel}"`);
  });

  it('should fallback to noteIntervalMinMs/noteIntervalMaxMs when waitBetweenNotesParams is not provided', () => {
    const options = {
      noteIntervalMinMs: 2000,
      noteIntervalMaxMs: 5000,
      detailLoopEnabled: true,
      detailOpenByLinks: true,
      tabCount: 1,
    };

    const operations = buildXhsDetailOperations(options);
    const waitBetweenNotesOp = operations.find(op => op.id === 'wait_between_notes');

    assert.ok(waitBetweenNotesOp, 'wait_between_notes operation should exist');
    assert.strictEqual(waitBetweenNotesOp.params.minMs, options.noteIntervalMinMs);
    assert.strictEqual(waitBetweenNotesOp.params.maxMs, options.noteIntervalMaxMs);

    console.log(`fallback params: minMs=${waitBetweenNotesOp.params.minMs}, maxMs=${waitBetweenNotesOp.params.maxMs}`);
  });
});

// Range test: ensure 20 delays are within [2000, 5000]
describe('wait_between_notes delay range check', () => {
  it('should generate 20 delays all within [2000, 5000] range', () => {
    const minMs = 2000;
    const maxMs = 5000;
    const delays = [];

    for (let i = 0; i < 20; i += 1) {
      delays.push(computeNoteDelayMs(minMs, maxMs, Math.random));
    }

    const outOfRange = delays.filter(v => v < 2000 || v > 5000);
    assert.strictEqual(outOfRange.length, 0, `Out-of-range delays: ${outOfRange.join(', ')}`);

    const min = Math.min(...delays);
    const max = Math.max(...delays);
    const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
    const stdDev = Math.sqrt(delays.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / delays.length);

    console.log(`All 20 delays within [2000, 5000] ms:`);
    console.log(delays.join(', '));
    console.log(`Statistics: Min=${min} ms, Max=${max} ms, Avg=${avg.toFixed(2)} ms, StdDev=${stdDev.toFixed(2)} ms`);
  });
});

// Boundary handling tests for computeNoteDelayMs
describe('computeNoteDelayMs boundary handling', () => {
  it('should handle minMs > maxMs by swapping', () => {
    const delay1 = computeNoteDelayMs(5000, 2000, () => 0);
    const delay2 = computeNoteDelayMs(5000, 2000, () => 0.999999);
    assert.strictEqual(delay1, 2000, 'should treat swapped min/max correctly, rng=0 should yield 2000');
    assert.strictEqual(delay2, 5000, 'should treat swapped min/max correctly, rng~1 should yield 5000');
    console.log(`minMs > maxMs swap test: rng=0 -> ${delay1}, rng~1 -> ${delay2}`);
  });

  it('should handle null/undefined by defaulting to 0', () => {
    const delay1 = computeNoteDelayMs(null, 1000, () => 0);
    const delay2 = computeNoteDelayMs(1000, undefined, () => 0);
    const delay3 = computeNoteDelayMs(null, undefined, () => 0.5);
    assert.ok(delay1 >= 0 && delay1 <= 1000, 'null minMs should default to 0 and generate delay in [0, 1000]');
    assert.strictEqual(delay2, 0, 'undefined maxMs should default to 0');
    assert.strictEqual(delay3, 0, 'both null/undefined should yield 0');
    console.log(`null/undefined handling: ${delay1}, ${delay2}, ${delay3}`);
  });

  it('should clamp negative values to 0', () => {
    const delay1 = computeNoteDelayMs(-1000, 2000, () => 0);
    const delay2 = computeNoteDelayMs(1000, -2000, () => 0.5);
    const delay3 = computeNoteDelayMs(-3000, -1000, () => 0.5);
    assert.strictEqual(delay1, 0, 'negative minMs should clamp to 0');
    assert.ok(delay3 >= 0 && delay3 <= 1000, 'both negative should clamp to 0 range');
    console.log(`negative value clamping: ${delay1}, ${delay2}, ${delay3}`);
  });

  it('should handle non-numeric values by defaulting to 0', () => {
    const delay1 = computeNoteDelayMs('invalid', 1000, () => 0);
    const delay2 = computeNoteDelayMs(1000, 'invalid', () => 0);
    const delay3 = computeNoteDelayMs(NaN, 1000, () => 0);
    const delay4 = computeNoteDelayMs(1000, Infinity, () => 0.5);
    assert.ok(delay1 >= 0 && delay1 <= 1000, 'non-numeric minMs should default to 0 and generate delay in [0, 1000]');
    assert.strictEqual(delay2, 0, 'non-numeric maxMs should default to 0');
    assert.strictEqual(delay3, 0, 'NaN minMs should default to 0');
    assert.ok(delay4 >= 0, 'Infinity maxMs should still produce valid delay');
    console.log(`non-numeric handling: ${delay1}, ${delay2}, ${delay3}, ${delay4}`);
  });
});

// Combination boundary tests for computeNoteDelayMs
describe('computeNoteDelayMs combination boundary', () => {
  it('should handle minMs negative + maxMs non-numeric', () => {
    const delay = computeNoteDelayMs(-1000, 'invalid', () => 0.5);
    assert.strictEqual(delay, 0, 'negative minMs + non-numeric maxMs should yield 0');
    console.log(`minMs negative + maxMs non-numeric: ${delay}`);
  });

  it('should handle minMs non-numeric + maxMs negative', () => {
    const delay = computeNoteDelayMs('invalid', -1000, () => 0.5);
    assert.strictEqual(delay, 0, 'non-numeric minMs + negative maxMs should yield 0');
    console.log(`minMs non-numeric + maxMs negative: ${delay}`);
  });

  it('should handle minMs negative + maxMs valid', () => {
    const delay1 = computeNoteDelayMs(-1000, 1000, () => 0);
    const delay2 = computeNoteDelayMs(-1000, 1000, () => 0.999999);
    assert.strictEqual(delay1, 0, 'rng=0 should yield 0');
    assert.strictEqual(delay2, 1000, 'rng~1 should yield 1000');
    console.log(`minMs negative + maxMs valid: rng=0 -> ${delay1}, rng~1 -> ${delay2}`);
  });

  it('should handle minMs valid + maxMs non-numeric', () => {
    const delay1 = computeNoteDelayMs(1000, 'invalid', () => 0);
    const delay2 = computeNoteDelayMs(1000, 'invalid', () => 0.999999);
    assert.strictEqual(delay1, 0, 'rng=0 should yield 0');
    assert.strictEqual(delay2, 1000, 'rng~1 should yield 1000');
    console.log(`minMs valid + maxMs non-numeric: rng=0 -> ${delay1}, rng~1 -> ${delay2}`);
  });

  it('should handle minMs=1000, maxMs=999 with swap (rng=0.5)', () => {
    // minMs=1000 → valid
    // maxMs=999 → valid
    // normalizedMin=999, normalizedMax=1000 (swapped)
    // delay = Math.floor(999 + 0.5 * (1000 - 999 + 1)) = Math.floor(999 + 1) = 1000
    const delay = computeNoteDelayMs(1000, 999, () => 0.5);
    assert.strictEqual(delay, 1000, 'minMs=1000, maxMs=999 should swap and yield 1000');
    console.log(`minMs=1000, maxMs=999 swap test: ${delay}`);
  });
});
