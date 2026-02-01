import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { resolveDownloadRoot, resolveHomeDir, resolvePlatformEnvKeywordDir } from './paths.js';

test('resolveHomeDir prefers platform env var when provided', () => {
  const prevHome = process.env.HOME;
  const prevUser = process.env.USERPROFILE;
  try {
    process.env.HOME = '/tmp/homeA';
    process.env.USERPROFILE = 'C:\\Users\\HomeB';
    const home = resolveHomeDir();
    if (process.platform === 'win32') {
      assert.equal(home, 'C:\\Users\\HomeB');
    } else {
      assert.equal(home, '/tmp/homeA');
    }
  } finally {
    if (prevHome == null) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUser == null) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUser;
  }
});

test('resolveDownloadRoot honors WEBAUTO_DOWNLOAD_ROOT override', () => {
  const prev = process.env.WEBAUTO_DOWNLOAD_ROOT;
  try {
    process.env.WEBAUTO_DOWNLOAD_ROOT = '/tmp/webauto-download';
    assert.equal(resolveDownloadRoot(), '/tmp/webauto-download');
  } finally {
    if (prev == null) delete process.env.WEBAUTO_DOWNLOAD_ROOT;
    else process.env.WEBAUTO_DOWNLOAD_ROOT = prev;
  }
});

test('resolvePlatformEnvKeywordDir joins platform/env/keyword under downloadRoot', () => {
  const p = resolvePlatformEnvKeywordDir({
    downloadRoot: '/tmp/dl',
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: '工作服',
  });
  assert.equal(p, path.join('/tmp/dl', 'xiaohongshu', 'debug', '工作服'));
});

test('resolvePlatformEnvKeywordDir validates required fields', () => {
  assert.throws(() =>
    resolvePlatformEnvKeywordDir({ downloadRoot: '/tmp/dl', platform: '', env: 'debug', keyword: 'k' }),
  );
  assert.throws(() =>
    resolvePlatformEnvKeywordDir({ downloadRoot: '/tmp/dl', platform: 'x', env: '', keyword: 'k' }),
  );
  assert.throws(() =>
    resolvePlatformEnvKeywordDir({ downloadRoot: '/tmp/dl', platform: 'x', env: 'e', keyword: '' }),
  );
});

