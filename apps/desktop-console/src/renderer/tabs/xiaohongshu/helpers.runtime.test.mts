import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  attachTooltip,
  bindInputHistory,
  bindSectionToggle,
  formatBatchKey,
  likeRuleGuide,
  makeCheckbox,
  makeNumberInput,
  makeTextInput,
  parseLikeRulesCsv,
  parseLikeRuleToken,
  readBatchKey,
  readInputHistory,
  readLastConfig,
  sanitizeBatchKey,
  stringifyLikeRule,
  writeBatchKey,
  writeInputHistory,
  writeLastConfig,
} from './helpers.mts';
import { setupDom, type DomHarness } from '../../test-dom.mts';

let dom: DomHarness;

beforeEach(() => {
  dom = setupDom();
});

afterEach(() => {
  dom.cleanup();
});

test('helpers create basic controls', () => {
  const n = makeNumberInput('10', '2');
  const t = makeTextInput('abc', 'kw');
  const c = makeCheckbox(true, 'ck');
  assert.equal(n.type, 'number');
  assert.equal(n.min, '2');
  assert.equal(t.placeholder, 'kw');
  assert.equal(c.checked, true);
});

test('batch key and storage helpers work', () => {
  const formatted = formatBatchKey(new Date('2026-02-18T08:00:00Z'));
  assert.match(formatted, /^batch-\d{8}-\d{4}$/);

  const cleaned = sanitizeBatchKey(' bad<>:"/\\|?*name. ');
  assert.equal(cleaned.includes('<'), false);
  assert.equal(cleaned.endsWith('.'), false);

  writeBatchKey('xhs-batch-1');
  assert.equal(readBatchKey(), 'xhs-batch-1');

  writeInputHistory('kw', ['a', 'b', 'a', '']);
  assert.deepEqual(readInputHistory('kw'), ['a', 'b']);

  writeLastConfig({ keyword: 'deepseek', maxNotes: '100' });
  assert.equal(readLastConfig().keyword, 'deepseek');
});

test('input history binding persists and supports hotkey delete', () => {
  const input = dom.document.createElement('input');
  dom.document.body.appendChild(input);
  const logs: string[] = [];
  const persist = bindInputHistory(input, 'keyword', { appendLog: (line: string) => logs.push(line) });

  input.value = 'first';
  input.dispatchEvent(new dom.window.Event('blur'));
  assert.deepEqual(readInputHistory('keyword'), ['first']);

  input.value = 'second';
  input.dispatchEvent(new dom.window.Event('blur'));
  assert.deepEqual(readInputHistory('keyword'), ['second', 'first']);

  input.value = 'second';
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', ctrlKey: true, shiftKey: true }));
  assert.deepEqual(readInputHistory('keyword'), ['first']);
  assert.ok(logs.some((line) => line.includes('removed key=keyword value=second')));

  input.value = 'first';
  persist();
  assert.equal(readInputHistory('keyword')[0], 'first');
});

test('section toggle and tooltip behavior', async () => {
  const toggle = dom.document.createElement('input');
  toggle.type = 'checkbox';
  const body = dom.document.createElement('div');
  bindSectionToggle(toggle, body);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(body.style.display, 'none');

  toggle.checked = true;
  toggle.dispatchEvent(new dom.window.Event('change'));
  assert.equal(body.style.display, '');

  const anchor = dom.document.createElement('div');
  attachTooltip(anchor, 'tip');
  const tip = anchor.querySelector('div') as HTMLDivElement;
  assert.ok(tip);
  anchor.dispatchEvent(new dom.window.Event('mouseenter'));
  assert.equal(tip.style.opacity, '1');
  anchor.dispatchEvent(new dom.window.Event('mouseleave'));
  assert.equal(tip.style.opacity, '0');
});

test('like rule parse/format helpers cover all modes', () => {
  assert.equal(stringifyLikeRule({ kind: 'contains', a: '真牛逼' }), '真牛逼');
  assert.equal(stringifyLikeRule({ kind: 'and', a: '真', b: '牛' }), '真+牛');
  assert.equal(stringifyLikeRule({ kind: 'include_without', a: '真', b: '差' }), '真-差');

  assert.deepEqual(parseLikeRuleToken('A+B'), { kind: 'and', a: 'A', b: 'B' });
  assert.deepEqual(parseLikeRuleToken('A-B'), { kind: 'include_without', a: 'A', b: 'B' });
  assert.deepEqual(parseLikeRuleToken('A'), { kind: 'contains', a: 'A' });
  assert.equal(parseLikeRuleToken(''), null);

  const parsed = parseLikeRulesCsv('A+B, C-D, E');
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].kind, 'and');
  assert.equal(parsed[1].kind, 'include_without');
  assert.equal(parsed[2].kind, 'contains');

  assert.equal(likeRuleGuide('contains').title.length > 0, true);
  assert.equal(likeRuleGuide('and').example.includes('+'), true);
  assert.equal(likeRuleGuide('include_without').example.includes('-'), true);
});
