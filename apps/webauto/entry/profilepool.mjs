#!/usr/bin/env node
import minimist from 'minimist';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ensureProfile,
  listProfilesForPool,
  output,
  resolveNextProfileId,
} from './lib/profilepool.mjs';

function runCamoufox(args) {
  const cliPath = path.resolve(process.cwd(), 'bin', 'camoufox-cli.mjs');
  const ret = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  const stdout = String(ret.stdout || '').trim();
  const stderr = String(ret.stderr || '').trim();
  let parsed = null;
  try { parsed = stdout ? JSON.parse(stdout) : null; } catch {}
  return {
    ok: ret.status === 0,
    code: ret.status,
    stdout,
    stderr,
    json: parsed,
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
  const initRet = runCamoufox(['init']);
  if (!initRet.ok) {
    output({ ok: false, code: initRet.code, step: 'init', stderr: initRet.stderr || initRet.stdout }, jsonMode);
    process.exit(1);
  }
  const startRet = runCamoufox(['start', id, '--url', url]);
  if (!startRet.ok) {
    output({ ok: false, code: startRet.code, step: 'start', stderr: startRet.stderr || startRet.stdout }, jsonMode);
    process.exit(1);
  }
  output({ ok: true, profileId: id, started: true, url, session: startRet.json || null }, jsonMode);
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
  for (const profileId of all) {
    const ret = runCamoufox(['start', profileId, '--url', 'https://www.xiaohongshu.com']);
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
