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
import { assertProfileExists } from './lib/profilepool.mjs';
import {
  syncWeiboAccountByProfile,
  syncWeiboAccountsByProfiles,
  syncXhsAccountByProfile,
  syncXhsAccountsByProfiles,
} from './lib/account-detect.mjs';
import { publishBusEvent } from './lib/bus-publish.mjs';
import { runCamo } from './lib/camo-cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const XHS_HOME_URL = 'https://www.xiaohongshu.com';
const WEIBO_HOME_URL = 'https://weibo.com';

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

function normalizeIdleTimeout(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'off';
  const lower = raw.toLowerCase();
  if (['0', 'off', 'none', 'disable', 'disabled'].includes(lower)) return 'off';
  if (/^\\d+(?:\\.\\d+)?$/.test(lower)) return `${lower}m`;
  return raw;
}

function resetProfileSessionForHeadful(profileId) {
  const id = String(profileId || '').trim();
  if (!id) return { attempted: false, ok: false, reason: 'missing_profile_id' };
  const stopRet = runCamo(['stop', id], { rootDir: ROOT, timeoutMs: 20000 });
  return {
    attempted: true,
    ok: stopRet.ok,
    code: stopRet.code,
    stderr: stopRet.stderr || null,
    stdout: stopRet.stdout || null,
  };
}

function navigateProfileBestEffort(profileId, url, timeoutMs = 35000) {
  const id = String(profileId || '').trim();
  const targetUrl = String(url || '').trim();
  if (!id || !targetUrl) {
    return { ok: false, code: null, stderr: 'missing_profile_or_url', stdout: '', json: null };
  }
  return runCamo(['goto', id, targetUrl], { rootDir: ROOT, timeoutMs });
}

function parseIntWithFallback(value, fallback) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveLoginViewport() {
  const width = Math.max(900, parseIntWithFallback(process.env.WEBAUTO_VIEWPORT_WIDTH, 1440));
  const height = Math.max(700, parseIntWithFallback(process.env.WEBAUTO_VIEWPORT_HEIGHT, 1100));
  return { width, height };
}

async function applyLoginViewport(profileId) {
  const id = String(profileId || '').trim();
  if (!id) return { ok: false, error: 'missing_profile_id' };
  const viewport = resolveLoginViewport();
  try {
    const { callAPI } = await import('../../../modules/camo-runtime/src/utils/browser-service.mjs');
    const payload = await callAPI('page:setViewport', {
      profileId: id,
      width: viewport.width,
      height: viewport.height,
    });
    const result = payload?.result || payload?.body || payload || {};
    return {
      ok: true,
      width: Number(result.width) || viewport.width,
      height: Number(result.height) || viewport.height,
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function inferLoginUrl(platform) {
  const value = String(platform || '').trim().toLowerCase();
  if (!value || value === 'xiaohongshu' || value === 'xhs') return XHS_HOME_URL;
  if (value === 'weibo' || value === 'wb') return WEIBO_HOME_URL;
  return 'https://example.com';
}

function normalizeAlias(input) {
  const value = String(input ?? '').trim();
  return value || null;
}

function normalizePlatform(input, fallback = 'xiaohongshu') {
  const raw = String(input || fallback).trim().toLowerCase();
  if (!raw || raw === 'xhs') return 'xiaohongshu';
  if (raw === 'wb') return 'weibo';
  return raw;
}

function isSupportedSyncPlatform(platform) {
  return platform === 'xiaohongshu' || platform === 'weibo';
}

function resolveSyncPlatformByProfile(profileId, fallback = 'xiaohongshu') {
  const id = String(profileId || '').trim();
  if (!id) return normalizePlatform(fallback);
  const candidates = ['xiaohongshu', 'weibo'];
  for (const platform of candidates) {
    const rows = listAccountProfiles({ platform }).profiles || [];
    if (rows.some((row) => String(row?.profileId || '').trim() === id)) return platform;
  }
  return normalizePlatform(fallback);
}

async function syncByProfileAndPlatform(profileId, platform, options = {}) {
  const normalizedPlatform = normalizePlatform(platform || 'xiaohongshu');
  if (normalizedPlatform === 'xiaohongshu') {
    return syncXhsAccountByProfile(profileId, options);
  }
  if (normalizedPlatform === 'weibo') {
    return syncWeiboAccountByProfile(profileId, options);
  }
  throw new Error(`account sync unsupported platform: ${normalizedPlatform}`);
}

async function syncProfilesByPlatform(profileIds, platform, options = {}) {
  const normalizedPlatform = normalizePlatform(platform || 'xiaohongshu');
  if (normalizedPlatform === 'xiaohongshu') {
    return syncXhsAccountsByProfiles(profileIds, options);
  }
  if (normalizedPlatform === 'weibo') {
    return syncWeiboAccountsByProfiles(profileIds, options);
  }
  throw new Error(`account sync unsupported platform: ${normalizedPlatform}`);
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
  const script = `(async () => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const isSelfTabText = (value) => {
      const text = normalize(value);
      return text === '我' || text === '我的' || text === '个人主页' || text === '我的主页';
    };
    const selfTabCandidates = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="link"], [class*="tab"]'))
      .map((node) => ({
        node,
        text: normalize(node.textContent || ''),
        title: normalize(node.getAttribute?.('title') || ''),
        aria: normalize(node.getAttribute?.('aria-label') || ''),
      }))
      .filter((item) => isSelfTabText(item.text) || isSelfTabText(item.title) || isSelfTabText(item.aria));
    const selfTarget = selfTabCandidates.find((item) => isVisible(item.node)) || selfTabCandidates[0] || null;
    if (selfTarget?.node) {
      try {
        selfTarget.node.click();
        await new Promise((resolve) => setTimeout(resolve, 900));
      } catch {
        // ignore self-tab click failure
      }
    }

    const requested = ${JSON.stringify(String(selector || '').trim())};
    const defaultSelectors = [
      '[data-testid*="nickname"]',
      '[class*="profile"] [class*="name"]',
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
        const text = clean(node.textContent || node.getAttribute?.('title') || '');
        if (!text) continue;
        candidates.push({ text, selector: sel });
      }
    }
    const userInfo = document.querySelector('[class*="user"] [class*="nickname"], [class*="profile"] [class*="nickname"]');
    if (userInfo) {
      const text = clean(userInfo.textContent || '');
      if (text) candidates.push({ text, selector: 'profile.nickname' });
    }
    const title = clean(document.title || '');
    if (title) candidates.push({ text: title, selector: 'document.title' });
    const bad = ['小红书', '登录', '注册', '搜索', '我', '消息', '通知'];
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
  webauto account list [--platform <name>] [--json]
  webauto account list --records [--json]
  webauto account add [--platform <name>] [--alias <alias>] [--name <name>] [--username <username>] [--profile <id>] [--fingerprint <id>] [--status pending|active|disabled|archived] [--json]
  webauto account get <id|alias|profileId|accountId> [--platform <name>] [--json]
  webauto account update <id|alias|profileId|accountId> [--alias <alias>|--clear-alias] [--name <name>] [--username <name>] [--profile <id>] [--fingerprint <id>] [--status pending|active|disabled|archived] [--json]
  webauto account delete <id|alias|profileId|accountId> [--delete-profile] [--delete-fingerprint] [--json]
  webauto account login <id|alias|profileId|accountId> [--platform <name>] [--url <url>] [--idle-timeout <duration>] [--sync-alias] [--json]
  webauto account sync-alias <id|alias|profileId|accountId> [--platform <name>] [--selector <css>] [--alias <value>] [--json]
  webauto account sync <profileId|all> [--platform <xiaohongshu|weibo>] [--pending-while-login] [--resolve-alias] [--json]

Notes:
  - 账号数据默认保存到 WEBAUTO 根目录下的 accounts（Windows 优先 D:/webauto，缺失时回落 ~/.webauto，可用 WEBAUTO_HOME 覆盖）
  - list 默认按 profile 展示账号有效态（valid/invalid）
  - add 不会自动创建 profile；必须传入已存在的 --profile
  - login 会通过 @web-auto/camo 拉起浏览器并绑定账号 profile
  - login 默认 idle-timeout=off，避免登录窗口自动关闭
  - 只有识别到账号 id 的 profile 才会进入 valid 状态
  - sync --pending-while-login 会在登录过程中保持待登录状态，避免过早标记失效

Examples:
  webauto account add --platform xiaohongshu --alias 主号
  webauto account list
  webauto account sync all
  webauto account sync all --platform weibo
  webauto account login xhs-0001 --url https://www.xiaohongshu.com --idle-timeout off
  webauto account sync-alias xhs-0001
  webauto account update xhs-0001 --alias 运营1号
  webauto account delete xhs-0001 --delete-profile --delete-fingerprint
`);
}

async function cmdList(jsonMode, platformArg = '') {
  const platform = normalizeAlias(platformArg) ? normalizePlatform(platformArg) : '';
  const result = listAccountProfiles(platform ? { platform } : {});
  output({ ok: true, ...result }, jsonMode);
}

async function cmdListRecords(jsonMode) {
  const result = listAccounts();
  output({ ok: true, ...result }, jsonMode);
}

async function cmdAdd(argv, jsonMode) {
  const profileId = String(argv.profile || argv['profile-id'] || '').trim();
  if (!profileId) {
    throw new Error('missing --profile, automatic profile creation is disabled');
  }
  const result = await addAccount({
    id: argv.id,
    platform: argv.platform,
    alias: argv.alias,
    name: argv.name,
    username: argv.username,
    profileId,
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

async function cmdGet(idOrAlias, argv, jsonMode) {
  const account = getAccount(idOrAlias, { platform: argv.platform });
  output({ ok: true, account }, jsonMode);
}

async function cmdUpdate(idOrAlias, argv, jsonMode) {
  const target = getAccount(idOrAlias);
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
  const account = await updateAccount(target.id, patch);
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
  const target = getAccount(idOrAlias);
  const result = removeAccount(target.id, {
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
  const account = getAccount(idOrAlias, { platform: argv.platform });
  const accountPlatform = normalizePlatform(account.platform || 'xiaohongshu');
  assertProfileExists(account.profileId);
  const url = String(argv.url || inferLoginUrl(accountPlatform)).trim();
  // Default idle timeout: off for login, configurable via env or CLI.
  // Keep validation semantics aligned with camo parseDurationMs.
  const idleTimeout = normalizeIdleTimeout(argv['idle-timeout'] || process.env.WEBAUTO_LOGIN_IDLE_TIMEOUT || 'off');

  const idleTimeoutLower = idleTimeout.toLowerCase();
  const idleTimeoutOk = /^(?:\d+(?:\.\d+)?(?:ms|s|m|h)?|0|off|none|disable|disabled)$/.test(idleTimeoutLower);
  if (!idleTimeoutOk) {
    output({
      ok: false,
      error: 'Invalid idle-timeout format. Use forms like 30m, 1800s, 5000ms, 1h, 0, off.',
    }, jsonMode);
    process.exit(1);
  }

  const pendingProfile = await syncByProfileAndPlatform(account.profileId, accountPlatform, { pendingWhileLogin: true }).catch((error) => ({
    profileId: account.profileId,
    platform: accountPlatform,
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
  const resetSession = resetProfileSessionForHeadful(account.profileId);

  const startResult = runCamo(['start', account.profileId, '--idle-timeout', idleTimeout], { rootDir: ROOT });
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
  const gotoResult = navigateProfileBestEffort(account.profileId, url);
  const viewport = await applyLoginViewport(account.profileId);

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

  const accountSync = await syncByProfileAndPlatform(account.profileId, accountPlatform, { pendingWhileLogin: true }).catch((error) => ({
    profileId: account.profileId,
    platform: accountPlatform,
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
    goto: {
      ok: gotoResult.ok,
      code: gotoResult.code,
      error: gotoResult.ok ? null : (gotoResult.stderr || gotoResult.stdout || 'goto failed'),
    },
    camo: startResult.json || startResult.stdout || null,
    resetSession,
    viewport,
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
  const account = getAccount(idOrAlias, { platform: argv.platform });
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
  const explicitPlatform = normalizeAlias(argv.platform) ? normalizePlatform(argv.platform) : '';
  const value = String(target || '').trim().toLowerCase();
  if (!value || value === 'all') {
    const platform = explicitPlatform || 'xiaohongshu';
    if (!isSupportedSyncPlatform(platform)) {
      throw new Error(`account sync unsupported platform: ${platform}`);
    }
    const rows = listAccountProfiles({ platform }).profiles;
    const profileIds = rows.map((item) => item.profileId);
    const synced = await syncProfilesByPlatform(profileIds, platform, { pendingWhileLogin, resolveAlias });
    output({ ok: true, count: synced.length, profiles: synced }, jsonMode);
    await publishAccountEvent('account:sync', {
      platform,
      count: synced.length,
      profiles: synced,
    });
    return;
  }
  const profileId = String(target || '').trim();
  const platform = explicitPlatform || resolveSyncPlatformByProfile(profileId, 'xiaohongshu');
  if (!isSupportedSyncPlatform(platform)) {
    throw new Error(`account sync unsupported platform: ${platform}`);
  }
  const synced = await syncByProfileAndPlatform(profileId, platform, { pendingWhileLogin, resolveAlias });
  output({ ok: true, profile: synced }, jsonMode);
  await publishAccountEvent('account:sync', {
    platform,
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

  if (cmd === 'list') return argv.records ? cmdListRecords(jsonMode) : cmdList(jsonMode, argv.platform);
  if (cmd === 'add') return cmdAdd(argv, jsonMode);
  if (cmd === 'get') return cmdGet(arg1, argv, jsonMode);
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
