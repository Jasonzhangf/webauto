import { test } from 'node:test';
import assert from 'node:assert';
import { parsePlatformDate, getCurrentTimestamp } from './date-utils.js';

// Fixed now for consistent testing: 2026-02-20 22:58:44 +08:00
const testNow = new Date('2026-02-20T14:58:44.494Z'); // UTC

test('parsePlatformDate: 刚刚', () => {
  const result = parsePlatformDate('刚刚', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-02-20');
  assert.equal(result.time, '22:58');
});

test('parsePlatformDate: X分钟前', () => {
  const result = parsePlatformDate('5分钟前', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-02-20');
  assert.equal(result.time, '22:53');
});

test('parsePlatformDate: X小时前', () => {
  const result = parsePlatformDate('2小时前', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-02-20');
  assert.equal(result.time, '20:58');
});

test('parsePlatformDate: 今天 HH:MM', () => {
  const result = parsePlatformDate('今天 08:30', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-02-20');
  assert.equal(result.time, '08:30');
});

test('parsePlatformDate: 昨天 HH:MM', () => {
  const result = parsePlatformDate('昨天 14:20', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-02-19');
  assert.equal(result.time, '14:20');
});

test('parsePlatformDate: 前天 HH:MM', () => {
  const result = parsePlatformDate('前天 10:00', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-02-18');
  assert.equal(result.time, '10:00');
});

test('parsePlatformDate: MM-DD', () => {
  const result = parsePlatformDate('01-15', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-01-15');
});

test('parsePlatformDate: MM-DD HH:MM', () => {
  const result = parsePlatformDate('12-01 15:30', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2025-12-01');
  assert.equal(result.time, '15:30');
});

test('parsePlatformDate: YYYY年MM月DD日', () => {
  const result = parsePlatformDate('2025年12月01日', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2025-12-01');
});

test('parsePlatformDate: YYYY-MM-DD HH:MM', () => {
  const result = parsePlatformDate('2025-12-01 10:30', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2025-12-01');
  assert.equal(result.time, '10:30');
});

test('parsePlatformDate: X天前', () => {
  const result = parsePlatformDate('3天前', { now: testNow });
  assert.ok(result);
  assert.equal(result.date, '2026-02-17');
});

test('parsePlatformDate: null for invalid', () => {
  const result = parsePlatformDate('invalid text', { now: testNow });
  assert.equal(result, null);
});

test('getCurrentTimestamp returns valid format', () => {
  const ts = getCurrentTimestamp();
  assert.ok(ts.collectedAt.endsWith('Z'));
  assert.ok(ts.collectedAtLocal.includes('+08:00') || ts.collectedAtLocal.includes('GMT+8'));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(ts.collectedDate));
  
  console.log('Timestamp example:', ts);
});
