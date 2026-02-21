#!/usr/bin/env node
import minimist from 'minimist';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addAccount,
  getAccount,
  listAccountProfiles,
  listAccounts,
  removeAccount,
  updateAccount,
} from './lib/account-store.mjs';
import { ensureProfile } from './lib/profilepool.mjs';
import { syncXhsAccountByProfile, syncXhsAccountsByProfiles } from './lib/account-detect.mjs';
import { publishBusEvent } from './lib/bus-publish.mjs';
import { runCamo } from './lib/camo-cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const XHS_HOME_URL = 'https://www.xiaohongshu.com';

function output(payload, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function inferLoginUrl(platform) {
  const value = String(platform || '').trim().toLowerCase();
  if (!value || value === 'xiaohongshu' || value === 'xhs') return XHS_HOME_URL;
  return 'https://example.com';
}

function normalizeAlias(input) {
  const value = String(input ?? '').trim();
  return value || null;
}

async function publishAccountEvent(type, payload) {
  try {
    await publishBusEvent({
      type,
      payload: payload || null,
      ts: new Date().toISOString(),
    });
  } catch {
    // ignore bus errors
  }
}

async function detectAliasFromActivePage(profileId, selector) {
  const { callAPI } = await import('../../../modules/camo-runtime/src/utils/browser-service.mjs');
  const script = `(() => {
    const requested = ${JSON.stringify(String(selector || '').trim())};
    const defaultSelectors = [
      '[class*="user"] [class*="name"]',
      '[class*="nickname"]',
      '[class*="account"] [class*="name"]',
      'a[href*="/user/profile"] span',
      'header a[href*="/user"] span',
      'nav a[href*="/user"] span'
    ];
    const selectors = requested ? [requested] : defaultSelectors;
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const candidates = [];
    for (const sel of selectors) {
      const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 6);
      for (const node of nodes) {
        const text = clean(node.textContent || '');
        if (!text) continue;
        candidates.push({ text, selector: sel });
      }
    }
    const title = clean(document.title || '');
    if (title) candidates.push({ text: title, selector: 'document.title' });
    const bad = ['小红书', '登录', '注册', '搜索'];
    const picked = candidates.find((item) => {
      if (!item?.text) return false;
      if (item.text.length < 2) return false;
      return bad.every((word) => !item.text.includes(word));
    }) || null;
    return {
      alias: picked?.text || null,
      source: picked?.selector || null,
      candidates
    };
  })()`;

  const result = await callAPI('evaluate', { profileId, script });
  const payload = result?.result || result || {};
  const alias = normalizeAlias(payload.alias);
  if (!alias) {
    throw new Error('unable to detect alias from current page');
  }
  return {
    alias,
    source: String(payload.source || 'page').trim() || 'page',
    candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
  };
}

function printHelp() {
  console.log(`webauto account

Usage:
  webauto account --help
  webauto account list [--json]
  webauto account list --records [--json]
  webauto account add [--platform <name>] [--alias <alias>] [--name <name>] [--username <username>] [--profile <id>] [--fingerprint <id>] [--status pending|active|disabled|archived] [--json]
  webauto account get <id|alias> [--json]
  webauto account update <id|alias> [--alias <alias>|--clear-alias] [--name <name>] [--username <name>] [--profile <id>] [--fingerprint <id>] [--status pending|active|disabled|archived] [--json]
  webauto account delete <id|alias> [--delete-profile] [--delete-fingerprint] [--json]
  webauto account login <id|alias> [--url <url>] [--idle-timeout <duration>] [--sync-alias] [--json]
  webauto account sync-alias <id|alias> [--selector <css>] [--alias <value>] [--json]
  webauto account sync <profileId|all> [--pending-while-login] [--resolve-alias] [--json]

Notes:
  - 账号数据默认保存到 ~/.webauto/accounts（可用 WEBAUTO_PATHS_ACCOUNTS 覆盖）
  - list 默认按 profile 展示账号有效态（valid/invalid）
  - add 会自动创建并关联 profile/fingerprint（未指定时自动编号）
  - login 会通过 @web-auto/camo 拉起浏览器并绑定账号 profile
  - 只有识别到账号 id 的 profile 才会进入 valid 状态
  - sync --pending-while-login 会在登录过程中保持待登录状态，避免过早标记失效

Examples:
  webauto account add --platform xiaohongshu --alias 主号
  webauto account list
  webauto account sync all
  webauto account login xhs-0001 --url https://www.xiaohongshu.com --idle-timeout 30m
  webauto account sync-alias xhs-0001
  webauto account update xhs-0001 --alias 运营1号
  webauto account delete xhs-0001 --delete-profile --delete-fingerprint
`);
}

async function cmdList(jsonMode) {
  const result = listAccountProfiles();
  output({ ok: true, ...result }, jsonMode);
}

async function cmdListRecords(jsonMode) {
  const result = listAccounts();
  output({ ok: true, ...result }, jsonMode);
}

async function cmdAdd(argv, jsonMode) {
  const result = await addAccount({
    id: argv.id,
    platform: argv.platform,
    alias: argv.alias,
    name: argv.name,
    username: argv.username,
    profileId: argv.profile || argv['profile-id'],
    fingerprintId: argv.fingerprint || argv['fingerprint-id'],
    status: argv.status,
  });
  output({ ok: true, ...result }, jsonMode);
  await publishAccountEvent('account:add', {
    profileId: result?.account?.profileId || null,
    accountId: result?.account?.accountId || null,
    alias: result?.account?.alias || null,
    status: result?.account?.status || null,
    valid: result?.account?.valid === true,
  });
}

async function cmdGet(idOrAlias, jsonMode) {
  const account = getAccount(idOrAlias);
  output({ ok: true, account }, jsonMode);
}

async function cmdUpdate(idOrAlias, argv, jsonMode) {
  const patch = {};
  if (argv.platform !== undefined) patch.platform = argv.platform;
  if (argv.name !== undefined) patch.name = argv.name;
  if (argv.username !== undefined) patch.username = argv.username;
  if (argv.status !== undefined) patch.status = argv.status;
  if (argv.profile !== undefined || argv['profile-id'] !== undefined) {
    patch.profileId = argv.profile || argv['profile-id'];
  }
  if (argv.fingerprint !== undefined || argv['fingerprint-id'] !== undefined) {
    patch.fingerprintId = argv.fingerprint || argv['fingerprint-id'];
  }
  if (argv['clear-alias']) {
    patch.alias = null;
    patch.aliasSource = 'manual';
  } else if (argv.alias !== undefined) {
    patch.alias = argv.alias;
    patch.aliasSource = 'manual';
  }
  if (!Object.keys(patch).length) {
    throw new Error('no update fields provided');
  }
  const account = await updateAccount(idOrAlias, patch);
  output({ ok: true, account }, jsonMode);
  await publishAccountEvent('account:update', {
    profileId: account?.profileId || null,
    accountId: account?.accountId || null,
    alias: account?.alias || null,
    status: account?.status || null,
    valid: account?.valid === true,
  });
}

async function cmdDelete(idOrAlias, argv, jsonMode) {
  const result = removeAccount(idOrAlias, {
    deleteProfile: argv['delete-profile'] === true,
    deleteFingerprint: argv['delete-fingerprint'] === true,
  });
  output({ ok: true, ...result }, jsonMode);
  await publishAccountEvent('account:delete', {
    profileId: result?.removed?.profileId || null,
    accountId: result?.removed?.accountId || null,
    alias: result?.removed?.alias || null,
  });
}

async function cmdLogin(idOrAlias, argv, jsonMode) {
  const account = getAccount(idOrAlias);
  await ensureProfile(account.profileId);
  const url = String(argv.url || inferLoginUrl(account.platform)).trim();
  // Default idle timeout: 30 minutes, configurable via env or CLI
  const idleTimeout = String(argv['idle-timeout'] || process.env.WEBAUTO_LOGIN_IDLE_TIMEOUT || '30m').trim() || '30m';
  
  // Validate idle timeout format (e.g., "30m", "1h", "1800s")
  if (!/^\d+[mhs]$/.test(idleTimeout)) {
    output({
      ok: false,
      error: 'Invalid idle-timeout format. Use: 30m, 1h, or 1800s',
    }, jsonMode);
    process.exit(1);
  }

  const pendingProfile = await syncXhsAccountByProfile(account.profileId, { pendingWhileLogin: true }).catch((error) => ({
    profileId: account.profileId,
    valid: false,
    status: 'pending',
    reason: `waiting_login_sync:${error?.message || String(error)}`,
  }));

  const initResult = runCamo(['init'], { rootDir: ROOT });
  if (!initResult.ok) {
    output({
      ok: false,
      step: 'init',
      code: initResult.code,
      error: initResult.stderr || initResult.stdout || 'camo init failed',
    }, jsonMode);
    process.exit(1);
  }

  const startResult = runCamo(['start', account.profileId, '--url', url, '--idle-timeout', idleTimeout], { rootDir: ROOT });
  if (!startResult.ok) {
    output({
      ok: false,
      step: 'start',
      code: startResult.code,
      error: startResult.stderr || startResult.stdout || 'camo start failed',
      account,
    }, jsonMode);
    process.exit(1);
  }

  const cookieAuto = runCamo(['cookies', 'auto', 'start', account.profileId, '--interval', '5000'], {
    rootDir: ROOT,
    timeoutMs: 20000,
  });

  let aliasSync = null;
  if (parseBoolean(argv['sync-alias'], false)) {
    try {
      const detected = await detectAliasFromActivePage(account.profileId, argv.selector);
      const updated = await updateAccount(account.id, {
        alias: detected.alias,
        aliasSource: `auto:${detected.source}`,
      });
      aliasSync = { ok: true, alias: updated.alias, source: detected.source };
    } catch (error) {
      aliasSync = { ok: false, error: error?.message || String(error) };
    }
  }

  const accountSync = await syncXhsAccountByProfile(account.profileId, { pendingWhileLogin: true }).catch((error) => ({
    profileId: account.profileId,
    valid: false,
    status: 'pending',
    reason: `waiting_login_sync:${error?.message || String(error)}`,
  }));

  output({
    ok: true,
    account,
    profileId: account.profileId,
    url,
    idleTimeout,
    camo: startResult.json || startResult.stdout || null,
    pendingProfile,
    cookieAuto: cookieAuto.ok
      ? { ok: true }
      : { ok: false, code: cookieAuto.code, error: cookieAuto.stderr || cookieAuto.stdout || 'cookie auto start failed' },
    aliasSync,
    accountSync,
  }, jsonMode);
  await publishAccountEvent('account:login', {
    profileId: account?.profileId || null,
    accountId: account?.accountId || null,
    alias: account?.alias || null,
    status: accountSync?.status || null,
    valid: accountSync?.valid === true,
  });
}

async function cmdSyncAlias(idOrAlias, argv, jsonMode) {
  const account = getAccount(idOrAlias);
  let alias = normalizeAlias(argv.alias);
  let source = 'manual';
  let candidates = [];
  if (!alias) {
    const detected = await detectAliasFromActivePage(account.profileId, argv.selector);
    alias = detected.alias;
    source = `auto:${detected.source}`;
    candidates = detected.candidates;
  }
  const updated = await updateAccount(account.id, { alias, aliasSource: source });
  output({
    ok: true,
    account: updated,
    alias,
    source,
    candidates,
  }, jsonMode);
  await publishAccountEvent('account:alias', {
    profileId: updated?.profileId || null,
    accountId: updated?.accountId || null,
    alias: updated?.alias || null,
    source,
  });
}

async function cmdSync(target, argv, jsonMode) {
  const pendingWhileLogin = parseBoolean(argv['pending-while-login'], false);
  const resolveAlias = parseBoolean(argv['resolve-alias'], false);
  const value = String(target || '').trim().toLowerCase();
  if (!value || value === 'all') {
    const rows = listAccountProfiles().profiles;
    const profileIds = rows.map((item) => item.profileId);
    const synced = await syncXhsAccountsByProfiles(profileIds, { pendingWhileLogin, resolveAlias });
    output({ ok: true, count: synced.length, profiles: synced }, jsonMode);
    await publishAccountEvent('account:sync', {
      count: synced.length,
      profiles: synced,
    });
    return;
  }
  const synced = await syncXhsAccountByProfile(target, { pendingWhileLogin, resolveAlias });
  output({ ok: true, profile: synced }, jsonMode);
  await publishAccountEvent('account:sync', {
    profile: synced,
  });
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'json', 'clear-alias', 'delete-profile', 'delete-fingerprint', 'sync-alias', 'resolve-alias', 'records'],
    alias: { h: 'help' },
  });
  const cmd = String(argv._[0] || '').trim();
  const arg1 = String(argv._[1] || '').trim();
  const jsonMode = argv.json === true;

  if (!cmd || cmd === 'help' || argv.help) {
    printHelp();
    return;
  }

  if (cmd === 'list') return argv.records ? cmdListRecords(jsonMode) : cmdList(jsonMode);
  if (cmd === 'add') return cmdAdd(argv, jsonMode);
  if (cmd === 'get') return cmdGet(arg1, jsonMode);
  if (cmd === 'update') return cmdUpdate(arg1, argv, jsonMode);
  if (cmd === 'delete' || cmd === 'remove' || cmd === 'rm') return cmdDelete(arg1, argv, jsonMode);
  if (cmd === 'login') return cmdLogin(arg1, argv, jsonMode);
  if (cmd === 'sync-alias') return cmdSyncAlias(arg1, argv, jsonMode);
  if (cmd === 'sync') return cmdSync(arg1, argv, jsonMode);

  throw new Error(`unknown account command: ${cmd}`);
}

main().catch((error) => {
  const message = error?.message || String(error);
  console.error(message);
  process.exit(1);
});
