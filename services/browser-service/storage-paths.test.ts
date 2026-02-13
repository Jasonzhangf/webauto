import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCookiesRoot, resolveLocksRoot, resolveProfilesRoot } from './storage-paths.js';

function normalizePath(value: string) {
  return String(value || '').replace(/\\/g, '/');
}

function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
  const keys = Object.keys(patch);
  const prev = new Map<string, string | undefined>();
  for (const key of keys) prev.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'undefined') delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of keys) {
      const value = prev.get(key);
      if (typeof value === 'undefined') delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('storage paths prefer explicit WEBAUTO_PATHS_* values', () => {
  withEnv(
    {
      WEBAUTO_PATHS_PROFILES: 'D:/tmp/pf',
      WEBAUTO_PATHS_COOKIES: 'D:/tmp/ck',
      WEBAUTO_PATHS_LOCKS: 'D:/tmp/locks',
      WEBAUTO_PORTABLE_ROOT: 'D:/portable-root',
      WEBAUTO_ROOT: undefined,
    },
    () => {
      assert.equal(resolveProfilesRoot(), 'D:/tmp/pf');
      assert.equal(resolveCookiesRoot(), 'D:/tmp/ck');
      assert.equal(resolveLocksRoot(), 'D:/tmp/locks');
    },
  );
});

test('storage paths fall back to portable root when path env missing', () => {
  withEnv(
    {
      WEBAUTO_PATHS_PROFILES: undefined,
      WEBAUTO_PATHS_COOKIES: undefined,
      WEBAUTO_PATHS_LOCKS: undefined,
      WEBAUTO_PORTABLE_ROOT: 'D:/webauto',
      WEBAUTO_ROOT: undefined,
    },
    () => {
      assert.equal(normalizePath(resolveProfilesRoot()), 'D:/webauto/.webauto/profiles');
      assert.equal(normalizePath(resolveCookiesRoot()), 'D:/webauto/.webauto/cookies');
      assert.equal(normalizePath(resolveLocksRoot()), 'D:/webauto/.webauto/locks');
    },
  );
});
