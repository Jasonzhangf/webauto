import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveWebautoRoot } from './path-helpers.mts';

test('resolveWebautoRoot uses windows-friendly placeholder when download root is empty', () => {
  const root = resolveWebautoRoot('', { pathSep: '\\' });
  assert.equal(root, '%USERPROFILE%\\.webauto');
});

test('resolveWebautoRoot keeps unix placeholder when download root is empty', () => {
  const root = resolveWebautoRoot('', { pathSep: '/' });
  assert.equal(root, '~/.webauto');
});
