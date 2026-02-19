import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveConfigPath,
  resolveFingerprintsRoot,
  resolveProfilesRoot,
  resolveWebautoRoot,
} from './path-helpers.mts';

test('resolveWebautoRoot uses windows-friendly placeholder when download root is empty', () => {
  const root = resolveWebautoRoot('', { pathSep: '\\' });
  assert.equal(root, '%USERPROFILE%\\.webauto');
});

test('resolveWebautoRoot keeps unix placeholder when download root is empty', () => {
  const root = resolveWebautoRoot('', { pathSep: '/' });
  assert.equal(root, '~/.webauto');
});

test('path helpers resolve root/config/profiles/fingerprints with normalize and join', () => {
  const api = {
    pathSep: '/',
    pathNormalize: (p: string) => p.replace(/\/+/g, '/'),
    pathJoin: (...parts: string[]) => parts.join('/'),
  };

  const root = resolveWebautoRoot('/tmp//webauto/download', api);
  assert.equal(root, '/tmp/webauto');
  assert.equal(resolveConfigPath('/tmp//webauto/download', api), '/tmp/webauto/config.json');
  assert.equal(resolveProfilesRoot('/tmp//webauto/download', api), '/tmp/webauto/profiles');
  assert.equal(resolveFingerprintsRoot('/tmp//webauto/download', api), '/tmp/webauto/fingerprints');
});
