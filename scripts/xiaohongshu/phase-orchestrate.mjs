#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listProfilesForPool } from './lib/profilepool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return defaultValue;
}

function stripArgs(argv, keys) {
  const drop = new Set(keys);
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (drop.has(a)) {
      if (i + 1 < argv.length && !String(argv[i + 1] || '').startsWith('--')) i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

function parseProfiles(args) {
  const profile = String(args.profile || '').trim();
  const profilesRaw = String(args.profiles || '').trim();
  const profilePool = String(args.profilepool || '').trim();

  let profiles = [];
  if (profilesRaw) {
    profiles = profilesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (profilePool) {
    profiles = listProfilesForPool(profilePool);
  } else if (profile) {
    profiles = [profile];
  }

  const deduped = Array.from(new Set(profiles));
  if (deduped.length === 0) {
    throw new Error('missing --profile or --profiles or --profilepool');
  }
  return deduped;
}

async function runNode(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(scriptPath)} exit ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function maybeDaemonize(rawArgv) {
  const foreground = rawArgv.includes('--foreground');
  if (foreground || process.env.WEBAUTO_DAEMON === '1') return false;
  const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
  const scriptPath = fileURLToPath(import.meta.url);
  const args = rawArgv.filter((a) => a !== '--foreground');
  await runNode(wrapperPath, [scriptPath, ...args]);
  return true;
}

function buildPhase1Args(profile, headless) {
  return [
    '--profile', profile,
    '--once',
    '--foreground',
    '--owner-pid', String(process.pid),
    ...(headless ? ['--headless'] : []),
  ];
}

async function runPhase1ForProfiles(profiles, headless) {
  for (const profile of profiles) {
    console.log(`[orchestrate] phase1 start profile=${profile}`);
    await runNode(path.join(__dirname, 'phase1-boot.mjs'), buildPhase1Args(profile, headless));
  }
}

function buildUnifiedProfileArgs(profiles) {
  if (profiles.length > 1) {
    return ['--profiles', profiles.join(',')];
  }
  return ['--profile', profiles[0]];
}


function toHeadfulArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const curr = String(args[i] || '');
    if (curr === '--headless') {
      // Skip optional bool value after --headless.
      const next = String(args[i + 1] || '').trim().toLowerCase();
      if (next === 'true' || next === 'false' || next === '1' || next === '0') i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

async function runStepWithHeadlessFallback(stepName, scriptPath, stepArgs, opts) {
  const { headless, recoveryProfiles } = opts;
  try {
    await runNode(scriptPath, stepArgs);
  } catch (err) {
    if (!headless) throw err;

    const msg = err?.message || String(err);
    console.warn(`[orchestrate] ${stepName} headless 失败，自动切到 headful 让用户处理登录/风控后继续: ${msg}`);
    await runPhase1ForProfiles(recoveryProfiles, false);
    console.warn(`[orchestrate] ${stepName} retry in headful mode`);
    await runNode(scriptPath, toHeadfulArgs(stepArgs));
  }
}

async function main() {
  const rawArgv = process.argv.slice(2);
  if (await maybeDaemonize(rawArgv)) {
    console.log('✅ Phase Orchestrate started in daemon mode');
    return;
  }

  const args = minimist(rawArgv);
  const modeRaw = String(args.mode || '').trim();
  const mode = modeRaw || 'phase1-only';
  const validModes = new Set(['phase1-only', 'phase1-phase2', 'phase1-phase2-unified', 'unified-only']);
  if (!validModes.has(mode)) {
    throw new Error(`invalid mode: ${mode}`);
  }

  const profiles = parseProfiles(args);
  const primaryProfile = profiles[0];

  const keyword = String(args.keyword || '').trim();
  const targetRaw = String(args.target || args['max-notes'] || '').trim();
  const env = String(args.env || 'debug').trim() || 'debug';
  const inputMode = String(args['input-mode'] || 'protocol').trim();
  const headless = parseBool(args.headless, true);

  const hasDryRun = rawArgv.includes('--dry-run');
  const hasNoDryRun = rawArgv.includes('--no-dry-run');
  const extraArgs = stripArgs(rawArgv, [
    '--mode',
    '--profile',
    '--profiles',
    '--profilepool',
    '--keyword',
    '--target',
    '--max-notes',
    '--env',
    '--input-mode',
    '--headless',
    '--dry-run',
    '--no-dry-run',
    '--foreground',
    '--daemon',
  ]);

  console.log(`[orchestrate] mode=${mode} profiles=${profiles.join(',')} env=${env}`);

  if (mode !== 'unified-only') {
    const phase1Profiles =
      mode === 'phase1-only' || mode === 'phase1-phase2-unified'
        ? profiles
        : [primaryProfile];
    await runPhase1ForProfiles(phase1Profiles, headless);
  }

  if (mode === 'phase1-only') {
    console.log('[orchestrate] done (phase1-only)');
    return;
  }

  const targetNum = Number(targetRaw);
  if ((mode === 'phase1-phase2' || mode === 'phase1-phase2-unified') && (!keyword || !Number.isFinite(targetNum) || targetNum <= 0)) {
    throw new Error('phase2 requires valid --keyword and --target');
  }

  if (mode === 'phase1-phase2' || mode === 'phase1-phase2-unified') {
    const phase2Args = [
      '--profile', primaryProfile,
      '--keyword', keyword,
      '--target', String(Math.floor(targetNum)),
      '--env', env,
      ...(headless ? ['--headless'] : []),
      ...(hasDryRun ? ['--dry-run'] : []),
      ...extraArgs,
      '--foreground',
    ];
    console.log(`[orchestrate] phase2 start profile=${primaryProfile}`);
    await runStepWithHeadlessFallback(
      'phase2',
      path.join(__dirname, 'phase2-collect.mjs'),
      phase2Args,
      { headless, recoveryProfiles: [primaryProfile] },
    );
  }

  if (mode === 'phase1-phase2') {
    console.log('[orchestrate] done (phase1-phase2)');
    return;
  }

  if (!keyword) {
    throw new Error('unified requires --keyword');
  }

  const maxNotes = Number.isFinite(targetNum) && targetNum > 0 ? Math.floor(targetNum) : 100;
  const unifiedDryRunArgs = hasDryRun ? ['--dry-run'] : hasNoDryRun ? ['--no-dry-run'] : ['--no-dry-run'];
  const unifiedArgs = [
    ...buildUnifiedProfileArgs(profiles),
    '--keyword', keyword,
    '--env', env,
    '--max-notes', String(maxNotes),
    ...(inputMode ? ['--input-mode', inputMode] : []),
    ...(headless ? ['--headless'] : []),
    ...unifiedDryRunArgs,
    ...extraArgs,
    '--foreground',
  ];

  console.log(`[orchestrate] unified start profiles=${profiles.join(',')}`);
  await runStepWithHeadlessFallback(
    'unified',
    path.join(__dirname, 'phase-unified-harvest.mjs'),
    unifiedArgs,
    { headless, recoveryProfiles: profiles },
  );
  console.log(`[orchestrate] done (${mode})`);
}

main().catch((err) => {
  console.error('❌ Phase Orchestrate 失败:', err?.message || String(err));
  process.exit(1);
});
