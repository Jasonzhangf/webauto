#!/usr/bin/env node
import minimist from 'minimist';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureProfile,
  listProfilesForPool,
  output,
  resolveNextProfileId,
} from './lib/profilepool.mjs';
import { syncXhsAccountByProfile } from './lib/account-detect.mjs';
import { runCamo } from './lib/camo-cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

async function waitForAccountSync(profileId, timeoutSec, intervalSec) {
  const timeoutMs = Math.max(30, Math.floor(Number(timeoutSec || 900))) * 1000;
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
  const profileId = resolveNextProfileId(prefix);
  const created = await ensureProfile(profileId);
  output({ ok: true, keyword: prefix, root: created.root, profileId, profileDir: created.profileDir }, jsonMode);
}

async function cmdLoginProfile(profileId, argv, jsonMode) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('profileId is required');
  await ensureProfile(id);
  const url = String(argv.url || 'https://www.xiaohongshu.com').trim();
  const idleTimeout = String(argv['idle-timeout'] || process.env.WEBAUTO_LOGIN_IDLE_TIMEOUT || '30m').trim() || '30m';
  const timeoutSec = Math.max(30, Math.floor(Number(argv['timeout-sec'] || 900)));
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
  const startRet = runCamo(['start', id, '--url', url, '--idle-timeout', idleTimeout], { rootDir: ROOT });
  if (!startRet.ok) {
    output({ ok: false, code: startRet.code, step: 'start', stderr: startRet.stderr || startRet.stdout }, jsonMode);
    process.exit(1);
  }
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
      session: startRet.json || null,
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
    session: startRet.json || null,
    pendingProfile,
    cookieMonitor,
    waitSync: syncResult,
  }, jsonMode);
}

async function cmdLogin(prefix, argv, jsonMode) {
  const ensureCount = Math.max(0, Number(argv['ensure-count'] || 0) || 0);
  const known = listProfilesForPool(prefix).profiles;
  const created = [];
  while (known.length + created.length < ensureCount) {
    const profileId = resolveNextProfileId(prefix);
    await ensureProfile(profileId);
    created.push(profileId);
    known.push(profileId);
  }

  const all = [...known];
  const started = [];
  const idleTimeout = String(argv['idle-timeout'] || process.env.WEBAUTO_LOGIN_IDLE_TIMEOUT || '30m').trim() || '30m';
  for (const profileId of all) {
    const ret = runCamo(['start', profileId, '--url', 'https://www.xiaohongshu.com', '--idle-timeout', idleTimeout], { rootDir: ROOT });
    if (ret.ok) started.push(profileId);
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

async function main() {
  const argv = minimist(process.argv.slice(2));
  const cmd = String(argv._[0] || '').trim();
  const arg1 = String(argv._[1] || '').trim();
  const jsonMode = argv.json === true;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log('Usage: node apps/webauto/entry/profilepool.mjs <list|add|login|login-profile|migrate-fingerprints> ... [--json]');
    return;
  }

  if (cmd === 'list') return cmdList(arg1, jsonMode);
  if (cmd === 'add') return cmdAdd(arg1 || 'xiaohongshu-batch', jsonMode);
  if (cmd === 'login-profile') return cmdLoginProfile(arg1, argv, jsonMode);
  if (cmd === 'login') return cmdLogin(arg1 || 'xiaohongshu-batch', argv, jsonMode);
  if (cmd === 'migrate-fingerprints') return cmdMigrateFingerprints(jsonMode);

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
