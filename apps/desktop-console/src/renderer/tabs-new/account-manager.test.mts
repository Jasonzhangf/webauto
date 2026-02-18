import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tabPath = path.join(__dirname, 'account-manager.mts');

async function getSrc() {
  return readFile(tabPath, 'utf8');
}

test('account manager keeps alias optional and starts profilepool login', async () => {
  const src = await getSrc();
  assert.match(src, /prompt\('请输入新账户别名（可留空，登录后自动识别）:'\)/);
  assert.match(src, /if \(aliasInput === null\) return;/);
  assert.match(src, /const alias = aliasInput\.trim\(\);/);
  assert.match(src, /if \(alias\) \{/);
  assert.match(src, /'account\.mjs'/);
  assert.match(src, /'add'/);
  assert.match(src, /'--status'/);
  assert.match(src, /'pending'/);
  assert.match(src, /title: `登录 \$\{alias \|\| profileId\}`/);
  assert.match(src, /'profilepool\.mjs'/);
  assert.match(src, /'login-profile'/);
  assert.match(src, /'--wait-sync'/);
  assert.match(src, /'false'/);
});

test('account manager writes detected alias after sync and runs auto polling', async () => {
  const src = await getSrc();
  assert.match(src, /const detectedAlias = String\(profile\.alias \|\| ''\)\.trim\(\);/);
  assert.match(src, /if \(detectedAlias\) \{/);
  assert.match(src, /settingsSet\(\{ profileAliases: aliases \}\)/);
  assert.match(src, /function startAutoSyncProfile\(profileId: string\)/);
  assert.match(src, /attempts >= maxAttempts/);
  assert.match(src, /--pending-while-login/);
  assert.match(src, /return Boolean\(account\.valid\);/);
  assert.match(src, /startAutoSyncProfile\(profileId\);/);
});

test('account manager UI labels runtime as camo', async () => {
  const src = await getSrc();
  assert.match(src, />Camo CLI</);
  assert.match(src, />Camo Runtime（可选）</);
  assert.match(src, /services\.camoRuntime/);
  assert.doesNotMatch(src, /browserService/);
});
