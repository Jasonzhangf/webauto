import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXhsCliArgs, phaseOrder } from './xhsCliArgs.js';

test('parseXhsCliArgs shows help on empty args', () => {
  const out = parseXhsCliArgs([]);
  assert.equal(out.showHelp, true);
  assert.equal(out.showVersion, false);
});

test('parseXhsCliArgs parses keyword and defaults', () => {
  const out = parseXhsCliArgs(['-k', 'phone']);
  assert.equal(out.keyword, 'phone');
  assert.equal(out.targetCount, 100);
  assert.equal(out.maxComments, null);
  assert.equal(out.headless, true);
  assert.equal(out.startAt, 'phase1');
  assert.equal(out.stopAfter, 'phase34');
});

test('parseXhsCliArgs accepts positional keyword', () => {
  const out = parseXhsCliArgs(['case']);
  assert.equal(out.keyword, 'case');
});

test('parseXhsCliArgs supports headful', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '-n', '5', '--headful']);
  assert.equal(out.keyword, 'demo');
  assert.equal(out.targetCount, 5);
  assert.equal(out.headless, false);
});

test('parseXhsCliArgs supports dev flag', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '--dev']);
  assert.equal(out.dev, true);
});

test('parseXhsCliArgs normalizes -cn alias', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '-cn', '20']);
  assert.equal(out.maxComments, 20);
});

test('parseXhsCliArgs ignores non-positive comment count', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '--commentCount', '0']);
  assert.equal(out.maxComments, null);
});

test('parseXhsCliArgs parses phase flags', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '--startAt', '2', '--stopAfter', 'phase34']);
  assert.equal(out.startAt, 'phase2');
  assert.equal(out.stopAfter, 'phase34');
  assert.ok(phaseOrder(out.startAt) < phaseOrder(out.stopAfter));
});

test('parseXhsCliArgs falls back on invalid phase', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '--startAt', 'oops']);
  assert.equal(out.startAt, 'phase1');
  assert.equal(phaseOrder(null), 999);
});

test('parseXhsCliArgs keeps NaN for invalid count', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '--count', 'oops']);
  assert.ok(Number.isNaN(out.targetCount));
});

test('parseXhsCliArgs uses defaults for empty env and sessionId', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '--env', '', '--sessionId', '']);
  assert.equal(out.env, 'prod');
  assert.equal(out.sessionId, 'xiaohongshu_fresh');
});

test('parseXhsCliArgs ignores non-numeric comment count', () => {
  const out = parseXhsCliArgs(['-k', 'demo', '--commentCount', 'oops']);
  assert.equal(out.maxComments, null);
});
