import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveDownloadRoot, resolveKeywordDir, sanitizeForPath } from './downloadPaths.js';

test('sanitizeForPath strips invalid characters', () => {
  assert.equal(sanitizeForPath('a/b:c*?'), 'a_b_c_');
  assert.equal(sanitizeForPath(''), '');
});

test('resolveDownloadRoot prefers custom then homeDir', () => {
  assert.equal(resolveDownloadRoot('D:\\custom', ''), 'D:\\custom');
  assert.equal(resolveDownloadRoot('', 'C:\\home'), path.join('C:\\home', '.webauto', 'download'));
});

test('resolveDownloadRoot falls back to env when custom/homeDir missing', () => {
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  try {
    process.env.HOME = 'C:\\home-env';
    process.env.USERPROFILE = '';
    assert.equal(resolveDownloadRoot('', ''), path.join('C:\\home-env', '.webauto', 'download'));
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
  }
});

test('resolveDownloadRoot falls back when env empty', () => {
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;

  try {
    process.env.HOME = '';
    process.env.USERPROFILE = '';
    const resolved = resolveDownloadRoot('', '');
    assert.ok(resolved.endsWith(path.join('.webauto', 'download')));
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
  }
});

test('resolveKeywordDir sanitizes keyword', () => {
  const dir = resolveKeywordDir({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: 'a/b',
    downloadRoot: 'D:\\root',
  });
  assert.equal(dir, path.join('D:\\root', 'xiaohongshu', 'debug', 'a_b'));
});

test('resolveKeywordDir falls back to unknown keyword', () => {
  const dir = resolveKeywordDir({
    platform: 'xiaohongshu',
    env: 'debug',
    keyword: '',
    downloadRoot: 'D:\\root',
  });
  assert.equal(dir, path.join('D:\\root', 'xiaohongshu', 'debug', 'unknown'));
});
