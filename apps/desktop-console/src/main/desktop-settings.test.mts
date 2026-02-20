import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  exportConfigToFile,
  getDefaultConfigExportPath,
  importConfigFromFile,
  loadCrawlConfig,
  readDesktopConsoleSettings,
  resolveDefaultDownloadRoot,
  resolveLegacySettingsPath,
  saveCrawlConfig,
  writeDesktopConsoleSettings,
} from './desktop-settings.mts';

let tempRoot = '';
let appRoot = '';
let repoRoot = '';
let homeRoot = '';
let prevHome = '';
let prevUserProfile = '';

beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-desktop-settings-'));
  appRoot = path.join(tempRoot, 'app');
  repoRoot = path.join(tempRoot, 'repo');
  homeRoot = path.join(tempRoot, 'home');
  await fsp.mkdir(appRoot, { recursive: true });
  await fsp.mkdir(repoRoot, { recursive: true });
  await fsp.mkdir(homeRoot, { recursive: true });

  const defaultsPath = path.join(appRoot, 'default-settings.json');
  await fsp.writeFile(defaultsPath, JSON.stringify({
    unifiedApiUrl: 'http://127.0.0.1:7701',
    camoRuntimeUrl: 'http://127.0.0.1:7704',
    searchGateUrl: 'http://127.0.0.1:7790',
    defaultEnv: 'prod',
    defaultKeyword: 'seed',
    defaultTarget: 20,
    timeouts: { loginTimeoutSec: 900, cmdTimeoutSec: 30 },
    downloadRootPosix: '/tmp/webauto-download',
    downloadRootWindows: 'D:\\webauto',
  }, null, 2), 'utf8');

  prevHome = process.env.HOME || '';
  prevUserProfile = process.env.USERPROFILE || '';
  process.env.HOME = homeRoot;
  process.env.USERPROFILE = homeRoot;
});

afterEach(() => {
  process.env.HOME = prevHome;
  process.env.USERPROFILE = prevUserProfile;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('read/write desktop settings fallback to legacy file when config api missing', async () => {
  const readInput = { appRoot, repoRoot };
  const initial = await readDesktopConsoleSettings(readInput);
  assert.equal(initial.defaultEnv, 'prod');
  assert.equal(initial.defaultKeyword, 'seed');
  assert.equal(initial.defaultTarget, 20);

  const updated = await writeDesktopConsoleSettings(readInput, {
    defaultKeyword: '春晚',
    profileAliases: {
      'xhs-1': '主号',
      '': 'invalid',
    },
    profileColors: {
      'xhs-1': '#112233',
      'xhs-2': 'red',
    } as any,
  });
  assert.equal(updated.defaultKeyword, '春晚');
  assert.equal(updated.profileAliases['xhs-1'], '主号');
  assert.equal(updated.profileAliases[''], undefined);
  assert.equal(updated.profileColors['xhs-1'], '#112233');
  assert.equal(updated.profileColors['xhs-2'], undefined);

  const legacyPath = resolveLegacySettingsPath();
  assert.equal(fs.existsSync(legacyPath), true);
});

test('crawl config persistence and import/export helpers work', async () => {
  const io = { appRoot, repoRoot };
  const crawlConfig = {
    keyword: '工作服',
    target: 100,
    env: 'debug',
    fetchBody: true,
    fetchComments: true,
    maxComments: 0,
    autoLike: true,
    likeKeywords: '购买链接',
    maxLikes: 20,
    headless: false,
    dryRun: false,
    lastProfileId: 'xhs-1',
  };
  await saveCrawlConfig(io, crawlConfig as any);
  const loaded = await loadCrawlConfig(io);
  assert.equal(loaded?.keyword, '工作服');
  assert.equal(loaded?.maxLikes, 20);

  const exportPath = path.join(tempRoot, 'exports', 'crawl.json');
  const exported = await exportConfigToFile(exportPath, crawlConfig as any);
  assert.equal(exported.ok, true);
  assert.equal(fs.existsSync(exportPath), true);

  const imported = await importConfigFromFile(exportPath);
  assert.equal(imported.ok, true);
  assert.equal(imported.config.likeKeywords, '购买链接');

  const bomPath = path.join(tempRoot, 'exports', 'crawl-bom.json');
  await fsp.writeFile(bomPath, `\uFEFF${JSON.stringify(crawlConfig)}`, 'utf8');
  const importedBom = await importConfigFromFile(bomPath);
  assert.equal(importedBom.config.keyword, '工作服');
});

test('default path helpers return deterministic paths', () => {
  const defaultRoot = resolveDefaultDownloadRoot();
  assert.equal(typeof defaultRoot, 'string');
  assert.equal(defaultRoot.length > 0, true);

  const legacyPath = resolveLegacySettingsPath();
  assert.equal(legacyPath.includes('.webauto'), true);
  assert.equal(legacyPath.endsWith('ui-settings.console.json'), true);

  const exportPath = getDefaultConfigExportPath('test');
  assert.equal(exportPath.includes('Downloads'), true);
  assert.equal(exportPath.includes('webauto-test-'), true);
});

test('resolveDefaultDownloadRoot uses D:\\webauto on windows and falls back when D is missing', () => {
  const home = path.join(tempRoot, 'fallback-home');
  const winWithD = resolveDefaultDownloadRoot({
    platform: 'win32',
    windowsDriveDExists: true,
    homeDir: home,
  });
  assert.equal(winWithD, 'D:\\webauto');

  const winWithoutD = resolveDefaultDownloadRoot({
    platform: 'win32',
    windowsDriveDExists: false,
    homeDir: home,
  });
  assert.equal(winWithoutD, path.join(home, '.webauto'));
});
