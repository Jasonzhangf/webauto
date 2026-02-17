#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { buildXhsUnifiedAutoscript } from '../../../modules/camo-runtime/src/autoscript/xhs-unified-template.mjs';
import { normalizeAutoscript, validateAutoscript } from '../../../modules/camo-runtime/src/autoscript/schema.mjs';
import { AutoscriptRunner } from '../../../modules/camo-runtime/src/autoscript/runtime.mjs';
import { listProfilesForPool } from './lib/profilepool.mjs';

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function parseIntFlag(value, fallback, min = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

function parseProfiles(argv) {
  const profile = String(argv.profile || '').trim();
  const profilesRaw = String(argv.profiles || '').trim();
  const profilePool = String(argv.profilepool || '').trim();

  if (profilesRaw) {
    return Array.from(new Set(profilesRaw.split(',').map((item) => item.trim()).filter(Boolean)));
  }
  if (profilePool) {
    return Array.from(new Set(listProfilesForPool(profilePool).profiles));
  }
  if (profile) return [profile];
  return [];
}

function buildTemplateOptions(argv, profileId, overrides = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim();
  const env = String(argv.env || 'debug').trim() || 'debug';
  const inputMode = String(argv['input-mode'] || 'protocol').trim() || 'protocol';
  const headless = parseBool(argv.headless, false);
  const ocrCommand = String(argv['ocr-command'] || '').trim();
  const maxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const throttle = parseIntFlag(argv.throttle, 500, 100);
  const tabCount = parseIntFlag(argv['tab-count'], 4, 1);
  const noteIntervalMs = parseIntFlag(argv['note-interval'], 900, 200);
  const maxLikesPerRound = parseIntFlag(argv['max-likes'], 2, 1);
  const matchMode = String(argv['match-mode'] || 'any').trim() || 'any';
  const matchMinHits = parseIntFlag(argv['match-min-hits'], 1, 1);
  const matchKeywords = String(argv['match-keywords'] || keyword).trim();
  const likeKeywords = String(argv['like-keywords'] || '').trim();
  const replyText = String(argv['reply-text'] || '感谢分享，已关注').trim() || '感谢分享，已关注';
  const outputRoot = String(argv['output-root'] || '').trim();

  const dryRun = parseBool(argv['dry-run'], false);
  const disableDryRun = parseBool(argv['no-dry-run'], false);
  const effectiveDryRun = disableDryRun ? false : dryRun;

  const base = {
    profileId,
    keyword,
    env,
    inputMode,
    headless,
    ocrCommand,
    outputRoot,
    throttle,
    tabCount,
    noteIntervalMs,
    maxNotes,
    maxLikesPerRound,
    matchMode,
    matchMinHits,
    matchKeywords,
    likeKeywords,
    replyText,
    doHomepage: parseBool(argv['do-homepage'], true),
    doImages: parseBool(argv['do-images'], false),
    doComments: parseBool(argv['do-comments'], true),
    doLikes: parseBool(argv['do-likes'], false) && !effectiveDryRun,
    doReply: parseBool(argv['do-reply'], false) && !effectiveDryRun,
    doOcr: parseBool(argv['do-ocr'], false),
    persistComments: parseBool(argv['persist-comments'], !effectiveDryRun),
  };
  return { ...base, ...overrides };
}

async function runProfile(profileId, argv, overrides = {}) {
  const options = buildTemplateOptions(argv, profileId, overrides);
  const script = buildXhsUnifiedAutoscript(options);
  const normalized = normalizeAutoscript(script, `xhs-unified:${profileId}`);
  const validation = validateAutoscript(normalized);
  if (!validation.ok) throw new Error(`autoscript validation failed for ${profileId}: ${validation.errors.join('; ')}`);

  console.log(JSON.stringify({
    event: 'xhs.unified.start',
    profileId,
    keyword: options.keyword,
    env: options.env,
    maxNotes: options.maxNotes,
    doComments: options.doComments,
    doLikes: options.doLikes,
    doReply: options.doReply,
    doOcr: options.doOcr,
  }));

  const runner = new AutoscriptRunner(normalized, {
    profileId,
    log: (payload) => console.log(JSON.stringify(payload)),
  });

  const running = await runner.start();
  const done = await running.done;

  console.log(JSON.stringify({
    event: 'xhs.unified.stop',
    profileId,
    runId: done?.runId || running.runId,
    reason: done?.reason || null,
    startedAt: done?.startedAt || null,
    stoppedAt: done?.stoppedAt || null,
  }));

  if (done?.reason === 'script_failure') throw new Error(`autoscript failed for ${profileId}`);
}

export async function runUnified(argv, overrides = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim();
  if (!keyword) throw new Error('missing --keyword');
  const profiles = parseProfiles(argv);
  if (profiles.length === 0) throw new Error('missing --profile or --profiles or --profilepool');

  for (const profileId of profiles) {
    console.log(`[unified] running profile=${profileId} keyword=${keyword}`);
    await runProfile(profileId, argv, overrides);
  }
  console.log('[unified] all profiles done');
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    console.log('Usage: node apps/webauto/entry/xhs-unified.mjs --profile <id> --keyword <kw> [--max-notes 50]');
    return;
  }
  await runUnified(argv);
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ xhs-unified failed:', err?.message || String(err));
    process.exit(1);
  });
}
