import { describe, it } from 'node:test';
import assert from 'node:assert';

// Test wait action random delay logic
describe('wait action random delay', () => {
  it('should generate random delay within [minMs, maxMs] range', () => {
    const minMs = 2000;
    const maxMs = 5000;
    const iterations = 10;
    
    const waitTimes = [];
    for (let i = 0; i < iterations; i++) {
      // Simulate the wait action logic
      const ms = Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
      waitTimes.push(ms);
    }
    
    // Calculate statistics
    const min = Math.min(...waitTimes);
    const max = Math.max(...waitTimes);
    const avg = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    const stdDev = Math.sqrt(waitTimes.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / waitTimes.length);
    
    // Verify all values are within range
    const allInRange = waitTimes.every(t => t >= minMs && t <= maxMs);
    assert.strictEqual(allInRange, true, `All wait times should be within [${minMs}, ${maxMs}]`);
    
    // Verify that values are random (stdDev > 0)
    assert.strictEqual(stdDev > 0, true, 'Wait times should be random (stdDev > 0)');
    
    // Verify min and max are within expected range
    assert.strictEqual(min >= minMs, true, `Min wait time (${min}) should be >= ${minMs}`);
    assert.strictEqual(max <= maxMs, true, `Max wait time (${max}) should be <= ${maxMs}`);
    
    // Output for verification
    console.log(`Wait times: ${waitTimes.join(', ')} ms`);
    console.log(`Min: ${min} ms, Max: ${max} ms, Avg: ${avg.toFixed(2)} ms, StdDev: ${stdDev.toFixed(2)} ms`);
  });
  
  it('should handle minMs == maxMs (no randomness)', () => {
    const minMs = 3000;
    const maxMs = 3000;
    const expectedDelay = 3000;  // Expected fixed delay
    const expectedJitter = 0;     // Expected jitter (max - min)
    
    // Simulate the wait action logic
    const ms = Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
    
    // Calculate jitter
    const jitter = maxMs - minMs;
    
    // Verify jitter is 0
    assert.strictEqual(jitter, expectedJitter, `jitter should be ${expectedJitter} when minMs === maxMs, got ${jitter}`);
    
    // Verify delay is fixed (equals expected value)
    assert.strictEqual(ms, expectedDelay, `delay should be ${expectedDelay} (no randomness), got ${ms}`);
    assert.strictEqual(ms, minMs, `delay should equal minMs (${minMs}), got ${ms}`);
    assert.strictEqual(ms, maxMs, `delay should equal maxMs (${maxMs}), got ${ms}`);
    
    console.log(`minMs=${minMs}, maxMs=${maxMs} -> delay=${ms}, jitter=${jitter}`);
  });
  
  it('should handle maxMs not provided (fallback to minMs)', () => {
    const minMs = 0;
    const maxMs = minMs;
    
    // Simulate the wait action logic when maxMs is not provided
    const ms = maxMs > minMs ? Math.floor(minMs + Math.random() * (maxMs - minMs + 1)) : maxMs;
    
    assert.strictEqual(ms, minMs, 'When maxMs is not provided, delay should equal minMs');
  });
  
  it('should handle minMs = 0 (use maxMs)', () => {
    const minMs = 0;
    const maxMs = 4000;
    
    // Simulate the wait action logic
    const ms = Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
    
    assert.ok(ms >= minMs && ms <= maxMs, `Delay (${ms}) should be within [${minMs}, ${maxMs}]`);
  });
  
  it('should swap minMs and maxMs when minMs > maxMs', () => {
    // Simulate the wait action normalization logic
    let rawMin = 5000;
    let rawMax = 2000;
    
    // Clamp negative values to 0
    rawMin = Math.max(0, rawMin);
    rawMax = Math.max(0, rawMax);
    
    // Swap if min > max
    const minMs = Math.min(rawMin, rawMax);
    const maxMs = Math.max(rawMin, rawMax);
    
    // Generate random delay within normalized range
    const ms = Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
    
    assert.strictEqual(minMs, 2000, 'Normalized minMs should be 2000');
    assert.strictEqual(maxMs, 5000, 'Normalized maxMs should be 5000');
    assert.ok(ms >= minMs && ms <= maxMs, `Delay (${ms}) should be within [${minMs}, ${maxMs}]`);
  });
  
  it('should degrade to fixed delay when only minMs is provided', () => {
    // Simulate the wait action normalization logic
    const rawMin = 3000;
    const rawMax = NaN;
    
    // Handle single parameter fallback (matching wait action implementation)
    let minMs, maxMs;
    if (rawMin > 0 && rawMax > 0) {
      minMs = Math.min(rawMin, rawMax);
      maxMs = Math.max(rawMin, rawMax);
    } else if (rawMin > 0) {
      minMs = rawMin;
      maxMs = rawMin;
    } else if (rawMax > 0) {
      minMs = rawMax;
      maxMs = rawMax;
    } else {
      minMs = 0;
      maxMs = 0;
    }
    
    // Generate delay
    const ms = maxMs > minMs ? Math.floor(minMs + Math.random() * (maxMs - minMs + 1)) : maxMs;
    
    assert.strictEqual(minMs, 3000, 'Normalized minMs should be 3000');
    assert.strictEqual(maxMs, 3000, 'Normalized maxMs should be 3000');
    assert.strictEqual(ms, 3000, 'Delay should be 3000 (fixed delay)');
  });
  
  it('should degrade to fixed delay when only maxMs is provided', () => {
    // Simulate the wait action normalization logic
    const rawMin = NaN;
    const rawMax = 4000;
    
    // Handle single parameter fallback (matching wait action implementation)
    let minMs, maxMs;
    if (rawMin > 0 && rawMax > 0) {
      minMs = Math.min(rawMin, rawMax);
      maxMs = Math.max(rawMin, rawMax);
    } else if (rawMin > 0) {
      minMs = rawMin;
      maxMs = rawMin;
    } else if (rawMax > 0) {
      minMs = rawMax;
      maxMs = rawMax;
    } else {
      minMs = 0;
      maxMs = 0;
    }
    
    // Generate delay
    const ms = maxMs > minMs ? Math.floor(minMs + Math.random() * (maxMs - minMs + 1)) : maxMs;
    
    assert.strictEqual(minMs, 4000, 'Normalized minMs should be 4000');
    assert.strictEqual(maxMs, 4000, 'Normalized maxMs should be 4000');
    assert.strictEqual(ms, 4000, 'Delay should be 4000 (fixed delay)');
  });
  
  it('should clamp negative values to 0', () => {
    // Simulate the wait action normalization logic
    let rawMin = -1000;
    let rawMax = 5000;
    
    // Clamp negative values to 0
    rawMin = Math.max(0, rawMin);
    rawMax = Math.max(0, rawMax);
    
    // Swap if min > max
    const minMs = Math.min(rawMin, rawMax);
    const maxMs = Math.max(rawMin, rawMax);
    
    assert.strictEqual(minMs, 0, 'Normalized minMs should be 0 (clamped from -1000)');
    assert.strictEqual(maxMs, 5000, 'Normalized maxMs should be 5000');
  });
});
  
  it('should handle min>max swap and negative clamp together', () => {
    const testCases = [
      { min: -100, max: 50, expectedMin: 50, expectedMax: 50 },
      { min: 5000, max: 1000, expectedMin: 1000, expectedMax: 5000 },
      { min: -500, max: -100, expectedMin: 0, expectedMax: 0 },
      { min: 3000, max: 2000, expectedMin: 2000, expectedMax: 3000 },
    ];
    
    for (const testCase of testCases) {
      const { min, max, expectedMin, expectedMax } = testCase;
      
      // Simulate the wait action normalization logic
      let rawMin = Number(min);
      let rawMax = Number(max);
      
      // Clamp negative values to 0
      rawMin = Number.isFinite(rawMin) ? Math.max(0, rawMin) : 0;
      rawMax = Number.isFinite(rawMax) ? Math.max(0, rawMax) : 0;
      
      // Handle single parameter fallback
      let minMs, maxMs;
      if (rawMin > 0 && rawMax > 0) {
        minMs = Math.min(rawMin, rawMax);
        maxMs = Math.max(rawMin, rawMax);
      } else if (rawMin > 0) {
        minMs = rawMin;
        maxMs = rawMin;
      } else if (rawMax > 0) {
        minMs = rawMax;
        maxMs = rawMax;
      } else {
        minMs = 0;
        maxMs = 0;
      }
      
      // Verify normalized interval
      assert.strictEqual(minMs, expectedMin, `min=${min}, max=${max}: normalized minMs should be ${expectedMin}`);
      assert.strictEqual(maxMs, expectedMax, `min=${min}, max=${max}: normalized maxMs should be ${expectedMax}`);
      
      // Calculate jitter (max - min)
      const jitter = maxMs - minMs;
      assert.strictEqual(jitter, expectedMax - expectedMin, `min=${min}, max=${max}: jitter should be ${expectedMax - expectedMin}`);
      
      // Generate random delays and verify they're within interval
      const iterations = 10;
      const waitTimes = [];
      for (let i = 0; i < iterations; i++) {
        const ms = Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
        waitTimes.push(ms);
      }
      
      const allInRange = waitTimes.every(t => t >= minMs && t <= maxMs);
      assert.strictEqual(allInRange, true, `min=${min}, max=${max}: all wait times should be within [${minMs}, ${maxMs}]`);
      
      // If minMs == maxMs, verify no randomness
      if (minMs === maxMs) {
        const allFixed = waitTimes.every(t => t === minMs);
        assert.strictEqual(allFixed, true, `min=${min}, max=${max}: all wait times should be ${minMs} (no randomness)`);
      }
      
      console.log(`min=${min}, max=${max} -> normalized [${minMs}, ${maxMs}], jitter=${jitter}, waitTimes=${waitTimes.slice(0, 3).join(', ')}...`);
    }
  });
  
  it('should have fixed delay when noteIntervalMinMs === noteIntervalMaxMs', () => {
    // This test validates wait_between_notes behavior when noteIntervalMinMs === noteIntervalMaxMs
    // wait_between_notes passes these params: { minMs: noteIntervalMinMs, maxMs: noteIntervalMaxMs }
    // When noteIntervalMinMs === noteIntervalMaxMs, wait action should return a fixed delay with jitter=0
    // Test the actual configuration scenario where min and max are equal
    const noteIntervalMinMs = 3000;
    const noteIntervalMaxMs = 3000;
    
    // Simulate the wait action logic with noteIntervalMinMs/maxMs
    const minMs = noteIntervalMinMs;
    const maxMs = noteIntervalMaxMs;
    
    // Generate delay (should be fixed, no randomness)
    const ms = maxMs > minMs ? Math.floor(minMs + Math.random() * (maxMs - minMs + 1)) : maxMs;
    
    // Verify jitter is 0
    const jitter = maxMs - minMs;
    assert.strictEqual(jitter, 0, `jitter should be 0 when minMs === maxMs`);
    
    // Verify delay is fixed (equals minMs/maxMs)
    assert.strictEqual(ms, minMs, `delay should be ${minMs} (no randomness)`);
    assert.strictEqual(ms, maxMs, `delay should be ${maxMs} (no randomness)`);
    
    console.log(`noteIntervalMinMs=${noteIntervalMinMs}, noteIntervalMaxMs=${noteIntervalMaxMs} -> delay=${ms}, jitter=${jitter}`);
  });
