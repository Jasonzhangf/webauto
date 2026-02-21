import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tabPath = path.join(__dirname, 'setup-wizard.mts');

async function getSrc() {
  return readFile(tabPath, 'utf8');
}

test('setup wizard allows empty alias and still starts login flow', async () => {
  const src = await getSrc();
  assert.match(src, /新账户别名（可选）/);
  assert.match(src, /placeholder="可留空，登录后自动识别"/);
  assert.doesNotMatch(src, /alert\('请输入账户别名'\)/);
  assert.match(src, /if \(alias\) \{/);
  assert.match(src, /'account\.mjs'/);
  assert.match(src, /'add'/);
  assert.match(src, /'--status'/);
  assert.match(src, /'pending'/);
  assert.match(src, /title: `登录 \$\{alias \|\| profileId\}`/);
  assert.match(src, /'login-profile'/);
  assert.match(src, /'--wait-sync'/);
  assert.match(src, /'false'/);
  assert.match(src, /startAutoSyncProfile\(profileId\)/);
});

test('setup wizard keeps startup unblocked by missing account and backfills alias from sync', async () => {
  const src = await getSrc();
  assert.match(src, /const canProceed = envReady;/);
  assert.match(src, /可先进入主界面后登录账号/);
  assert.match(src, /async function syncProfileAccount\(profileId: string\)/);
  assert.match(src, /'account\.mjs'/);
  assert.match(src, /'sync'/);
  assert.match(src, /'--pending-while-login'/);
  assert.match(src, /await upsertAliasFromProfile\(profile\);/);
  assert.match(src, /setupStatusText\.textContent = `账号 \$\{id\} 已识别/);
});

test('setup wizard uses camo runtime naming', async () => {
  const src = await getSrc();
  assert.match(src, /Camo CLI \(@web-auto\/camo\)/);
  assert.match(src, /Camo Runtime Service \(7704，可选\)/);
  assert.match(src, /浏览器内核（Camoufox Firefox）/);
  assert.match(src, /envCheckAll/);
  assert.match(src, /snapshot\?\.missing/);
  assert.match(src, /Boolean\(snapshot\?\.allReady\)/);
  assert.doesNotMatch(src, /browserService/);
});
