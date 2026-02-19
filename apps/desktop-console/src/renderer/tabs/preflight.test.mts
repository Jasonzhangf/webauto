import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tabPath = path.join(__dirname, 'preflight.mts');

async function getSrc() {
  return readFile(tabPath, 'utf8');
}

test('preflight includes onboarding and profilepool in same tab', async () => {
  const src = await getSrc();
  assert.match(src, /section\('首次引导（账号视角）'/);
  assert.match(src, /section\('批量账号池（自动序号）'/);
  assert.match(src, /section\('浏览器检查与下载'/);
  assert.match(src, /去小红书首页/);
  assert.match(src, /ctx\.setActiveTab\('xiaohongshu'\)/);
  assert.match(src, /localStorage\.setItem\(XHS_NAV_TARGET_KEY, 'account'\)/);
  assert.match(src, /账号名（alias，用于区分账号，默认登录后获取用户名）/);
  assert.match(src, /runBrowserCheck/);
  assert.match(src, /const args = buildArgs\(\[script, '--check-browser-only'/);
  assert.match(src, /\.\.\.\(download \? \['--download-browser'\] : \[]\)/);
  assert.match(src, /toolbar\.children\[5\]/);
  assert.match(src, /toolbar\.children\[6\]/);
  assert.match(src, /login-profile/);
  assert.match(src, /新增一个并登录/);
  assert.match(src, /const commitAlias = async \(\) =>/);
  assert.match(src, /aliasInput\.onblur = \(\) => void commitAlias\(\);/);
  assert.match(src, /source: 'auto'/);
  assert.doesNotMatch(src, /--browser-service/);
});
