#!/usr/bin/env node
import minimist from 'minimist';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProfileExists,
  ensureProfile,
  listProfilesForPool,
  output,
  resolveNextProfileId,
} from './lib/profilepool.mjs';
import { syncXhsAccountByProfile } from './lib/account-detect.mjs';
import { runCamo } from './lib/camo-cli.mjs';
import { applyCamoEnv } from './lib/camo-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
applyCamoEnv({ env: process.env, repoRoot: ROOT });

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIntWithFallback(value, fallback) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseTimeoutSec(value, fallback = 0) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (['0', 'off', 'none', 'disable', 'disabled'].includes(normalized)) return 0;
  const parsed = Math.floor(Number(normalized));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
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

async function waitForAccountSync(profileId, timeoutSec, intervalSec) {
  const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : Number.POSITIVE_INFINITY;
  const intervalMs = Math.max(1, Math.floor(Number(intervalSec || 2))) * 1000;
  const startedAt = Date.now();
  let attempts = 0;
  let lastProfile = null;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    const synced = await syncXhsAccountByProfile(profileId, { pendingWhileLogin: true }).catch((err) => ({
      profileId,
      valid: false,
      status: 'pending',
      reason: `waiting_login_sync:${err?.message || String(err)}`,
      accountId: null,
      alias: null,
    }));
    lastProfile = synced || null;
    if (String(synced?.accountId || '').trim()) {
      return {
        ok: true,
        profile: synced,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    }
    await sleep(intervalMs);
  }

  return {
    ok: false,
    profile: lastProfile,
    attempts,
    elapsedMs: Date.now() - startedAt,
    reason: 'timeout_wait_login',
  };
}

async function cmdList(prefix, jsonMode) {
  const result = listProfilesForPool(prefix);
  output({ ok: true, keyword: prefix, root: result.root, profiles: result.profiles }, jsonMode);
}

async function cmdAdd(prefix, jsonMode) {
  const namingPrefix = 'profile';
  const profileId = resolveNextProfileId(namingPrefix);
  const created = await ensureProfile(profileId);
  output({ ok: true, keyword: namingPrefix, root: created.root, profileId, profileDir: created.profileDir }, jsonMode);
}

async function cmdLoginProfile(profileId, argv, jsonMode) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('profileId is required');
  assertProfileExists(id);
  const url = String(argv.url || 'https://www.xiaohongshu.com').trim();
  const idleTimeout = String(argv['idle-timeout'] || process.env.WEBAUTO_LOGIN_IDLE_TIMEOUT || 'off').trim() || 'off';
  const timeoutSec = parseTimeoutSec(argv['timeout-sec'], 0);
  const intervalSec = Math.max(1, Math.floor(Number(argv['check-interval-sec'] || 2)));
  const cookieIntervalMs = Math.max(1000, Math.floor(Number(argv['cookie-interval-ms'] || 5000)));
  const waitSync = parseBoolean(argv['wait-sync'], true);

  const pendingProfile = await syncXhsAccountByProfile(id, { pendingWhileLogin: true }).catch((err) => ({
    profileId: id,
    valid: false,
    status: 'pending',
    reason: `waiting_login_sync:${err?.message || String(err)}`,
    accountId: null,
    alias: null,
  }));

  const initRet = runCamo(['init'], { rootDir: ROOT });
  if (!initRet.ok) {
    output({ ok: false, code: initRet.code, step: 'init', stderr: initRet.stderr || initRet.stdout }, jsonMode);
    process.exit(1);
  }
  const resetSession = resetProfileSessionForHeadful(id);
  const startRet = runCamo(['start', id, '--no-headless', '--idle-timeout', idleTimeout], { rootDir: ROOT });
  if (!startRet.ok) {
    output({ ok: false, code: startRet.code, step: 'start', stderr: startRet.stderr || startRet.stdout }, jsonMode);
    process.exit(1);
  }
  const gotoRet = navigateProfileBestEffort(id, url);
  const viewport = await applyLoginViewport(id);
  const cookieAutoRet = runCamo(['cookies', 'auto', 'start', id, '--interval', String(cookieIntervalMs)], {
    rootDir: ROOT,
    timeoutMs: 20000,
  });
  const cookieMonitor = cookieAutoRet.ok
    ? { ok: true, intervalMs: cookieIntervalMs }
    : { ok: false, intervalMs: cookieIntervalMs, error: cookieAutoRet.stderr || cookieAutoRet.stdout || 'cookie auto start failed' };

  if (!waitSync) {
    output({
      ok: true,
      profileId: id,
      started: true,
      url,
      idleTimeout,
      goto: {
        ok: gotoRet.ok,
        code: gotoRet.code,
        stderr: gotoRet.ok ? null : (gotoRet.stderr || gotoRet.stdout || 'goto failed'),
      },
      session: startRet.json || null,
      viewport,
      resetSession,
      pendingProfile,
      cookieMonitor,
      waitSync: null,
    }, jsonMode);
    return;
  }

  const syncResult = await waitForAccountSync(id, timeoutSec, intervalSec);
  output({
    ok: true,
    profileId: id,
    started: true,
    url,
    idleTimeout,
    goto: {
      ok: gotoRet.ok,
      code: gotoRet.code,
      stderr: gotoRet.ok ? null : (gotoRet.stderr || gotoRet.stdout || 'goto failed'),
    },
    session: startRet.json || null,
    viewport,
    resetSession,
    pendingProfile,
    cookieMonitor,
    waitSync: syncResult,
  }, jsonMode);
}

async function cmdLogin(prefix, argv, jsonMode) {
  const ensureCount = Math.max(0, Number(argv['ensure-count'] || 0) || 0);
  if (ensureCount > 0) {
    throw new Error('ensure-count is disabled; automatic profile creation is forbidden');
  }
  const known = listProfilesForPool(prefix).profiles;
  const created = [];

  const all = [...known];
  if (all.length === 0) {
    throw new Error(`no profiles found for prefix: ${prefix}`);
  }
  const started = [];
  const idleTimeout = String(argv['idle-timeout'] || process.env.WEBAUTO_LOGIN_IDLE_TIMEOUT || 'off').trim() || 'off';
  for (const profileId of all) {
    resetProfileSessionForHeadful(profileId);
    const ret = runCamo(['start', profileId, '--idle-timeout', idleTimeout], { rootDir: ROOT });
    if (ret.ok) {
      started.push(profileId);
      navigateProfileBestEffort(profileId, 'https://www.xiaohongshu.com');
      // Keep login windows readable by default across all platforms.
      // This does not depend on workflow-level EnsureSession.
      await applyLoginViewport(profileId);
    }
  }
  output({ ok: true, keyword: prefix, profiles: all, created, started }, jsonMode);
}

async function cmdMigrateFingerprints(jsonMode) {
  const { profiles } = listProfilesForPool('');
  const created = [];
  for (const profileId of profiles) {
    await ensureProfile(profileId);
    created.push(profileId);
  }
  output({ ok: true, checked: profiles.length, ensured: created.length }, jsonMode);
}

async function cmdGotoProfile(profileId, argv, jsonMode) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('profileId is required');
  const url = String(argv.url || argv._?.[2] || '').trim();
  if (!url) throw new Error('url is required');
  assertProfileExists(id);

  const gotoRet = runCamo(['goto', id, url], { rootDir: ROOT, timeoutMs: 30000 });
  if (gotoRet.ok) {
    const viewport = await applyLoginViewport(id);
    output({
      ok: true,
      profileId: id,
      url,
      mode: 'goto',
      viewport,
      result: gotoRet.json || null,
    }, jsonMode);
    return;
  }

  const idleTimeout = String(argv['idle-timeout'] || process.env.WEBAUTO_LOGIN_IDLE_TIMEOUT || 'off').trim() || 'off';
  const startRet = runCamo(['start', id, '--no-headless', '--idle-timeout', idleTimeout], { rootDir: ROOT });
  if (!startRet.ok) {
    output({
      ok: false,
      profileId: id,
      url,
      mode: 'start',
      error: startRet.stderr || startRet.stdout || gotoRet.stderr || gotoRet.stdout || 'goto/start failed',
    }, jsonMode);
    process.exit(1);
  }
  const startGotoRet = runCamo(['goto', id, url], { rootDir: ROOT, timeoutMs: 30000 });
  if (!startGotoRet.ok) {
    output({
      ok: false,
      profileId: id,
      url,
      mode: 'start',
      step: 'goto',
      error: startGotoRet.stderr || startGotoRet.stdout || 'goto failed after start',
      session: startRet.json || null,
    }, jsonMode);
    process.exit(1);
  }
  const viewport = await applyLoginViewport(id);
  output({
    ok: true,
    profileId: id,
    url,
    mode: 'start',
    viewport,
    session: startRet.json || null,
  }, jsonMode);
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const cmd = String(argv._[0] || '').trim();
  const arg1 = String(argv._[1] || '').trim();
  const jsonMode = argv.json === true;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log('Usage: node apps/webauto/entry/profilepool.mjs <list|add|login|login-profile|goto-profile|migrate-fingerprints> ... [--json]');
    console.log('Default profile prefix: profile (e.g. profile-0, profile-1)');
    return;
  }

  if (cmd === 'list') return cmdList(arg1, jsonMode);
  if (cmd === 'add') return cmdAdd(arg1 || 'profile', jsonMode);
  if (cmd === 'login-profile') return cmdLoginProfile(arg1, argv, jsonMode);
  if (cmd === 'goto-profile') return cmdGotoProfile(arg1, argv, jsonMode);
  if (cmd === 'login') return cmdLogin(arg1 || 'profile', argv, jsonMode);
  if (cmd === 'migrate-fingerprints') return cmdMigrateFingerprints(jsonMode);

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
