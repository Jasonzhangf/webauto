#!/usr/bin/env node
import fsp from 'node:fs/promises';
import path from 'node:path';
import { syncXhsAccountsByProfiles } from './account-detect.mjs';
import {
  cleanupIncompleteProfiles,
  listAccountProfiles,
  listSavedProfiles,
} from './account-store.mjs';
import { listProfilesForPool } from './profilepool.mjs';
import { assertProfilesUsable } from './profile-policy.mjs';
import { publishBusEvent } from './bus-publish.mjs';
import {
  ensureProfileSession,
  runProfile,
} from './xhs-unified-profile-blocks.mjs';
import { resolveXhsStage } from './xhs-unified-stages.mjs';
import {
  resolveDownloadRoot,
  collectCompletedNoteIds,
} from './xhs-unified-output-blocks.mjs';
import {
  buildEvenShardPlan,
  buildDynamicWavePlan,
  runWithConcurrency,
} from './xhs-unified-plan-blocks.mjs';
import {
  nowIso,
  formatRunLabel,
  ensureTaskServices,
  parseBool,
  parseIntFlag,
  parseNonNegativeInt,
  sanitizeForPath,
} from './xhs-unified-blocks.mjs';
import {
  toNumber,
  mergeProfileOutputs,
} from './xhs-unified-runtime-blocks.mjs';
import { resolveRotatedKeyword } from './xhs-keyword-rotation.mjs';

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

function resolveDefaultXhsProfiles() {
  const savedProfiles = new Set(listSavedProfiles());
  const rows = listAccountProfiles({ platform: 'xiaohongshu' }).profiles || [];
  const valid = rows
    .filter((row) => (
      row?.valid === true
      && String(row?.accountId || '').trim()
      && savedProfiles.has(String(row?.profileId || '').trim())
    ))
    .sort((a, b) => {
      const ta = Date.parse(String(a?.updatedAt || '')) || 0;
      const tb = Date.parse(String(b?.updatedAt || '')) || 0;
      if (tb !== ta) return tb - ta;
      return String(a?.profileId || '').localeCompare(String(b?.profileId || ''));
    });
  return Array.from(new Set(valid.map((row) => String(row.profileId || '').trim()).filter(Boolean)));
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function appendJsonl(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fsp.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

export async function runUnified(argv, overrides = {}) {
  const detailOpenByLinks = parseBool(overrides.detailOpenByLinks ?? argv['detail-open-by-links'], true);
  if (detailOpenByLinks !== true) {
    throw new Error('detailOpenByLinks=false (click mode) is not allowed; URL mode only');
  }
  const sharedHarvestPathArg = String(overrides.sharedHarvestPath ?? argv['shared-harvest-path'] ?? '').trim();
  const rotation = await resolveRotatedKeyword(argv, { recordKey: 'xiaohongshu', requireKeyword: !(detailOpenByLinks && sharedHarvestPathArg) });
  const keyword = String(rotation.keyword || '').trim();
  if (!keyword && !(detailOpenByLinks && sharedHarvestPathArg)) throw new Error('missing --keyword');
  if (rotation?.event?.ok) {
    console.log(JSON.stringify(rotation.event));
    argv.keyword = keyword;
  }
  cleanupIncompleteProfiles({ deleteProfileDirs: false });

  const stage = resolveXhsStage(argv, overrides);
  const env = String(argv.env || 'prod').trim() || 'prod';
  const busEnabled = parseBool(argv['bus-events'], false) || process.env.WEBAUTO_BUS_EVENTS === '1';
  const skipAccountSync = parseBool(overrides.skipAccountSync ?? argv['skip-account-sync'], false);
  let profiles = parseProfiles(argv);
  if (profiles.length === 0) {
    profiles = resolveDefaultXhsProfiles();
    if (profiles.length > 0) {
      console.log(JSON.stringify({
        event: 'xhs.unified.auto_profiles_selected',
        platform: 'xiaohongshu',
        profiles,
      }));
    }
  }
  if (profiles.length === 0) throw new Error('missing --profile/--profiles/--profilepool and no valid xiaohongshu account profile found');
  if (!skipAccountSync) {
    profiles = assertProfilesUsable(profiles);
  }
 const planOnly = parseBool(argv['plan-only'], false);
 const headless = parseBool(argv.headless, false);
  const defaultMaxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const totalNotes = parseNonNegativeInt(argv['total-notes'] ?? argv['total-target'], 0);
  const hasTotalTarget = totalNotes > 0;
  let maxWaves = parseIntFlag(argv['max-waves'], 40, 1);
  let parallelRequested = parseBool(argv.parallel, false);
  let configuredConcurrency = parseIntFlag(argv.concurrency, profiles.length || 1, 1);
  const hasSeedCollectCountFlag = argv['seed-collect-count'] !== undefined && argv['seed-collect-count'] !== null && argv['seed-collect-count'] !== '';
  const hasSeedCollectRoundsFlag = argv['seed-collect-rounds'] !== undefined && argv['seed-collect-rounds'] !== null && argv['seed-collect-rounds'] !== '';
  const seedCollectCountFlag = hasSeedCollectCountFlag ? parseNonNegativeInt(argv['seed-collect-count'], 0) : 0;
  const seedCollectRoundsFlag = hasSeedCollectRoundsFlag ? parseNonNegativeInt(argv['seed-collect-rounds'], 0) : 0;

  if (stage === 'links') {
    if (profiles.length !== 1) {
      throw new Error('stage=links requires exactly one profile (no sharding)');
    }
    if (hasTotalTarget) {
      throw new Error('stage=links does not support --total-notes/--total-target sharding');
    }
    maxWaves = 1;
    parallelRequested = false;
    configuredConcurrency = 1;
  }

  const runLabel = formatRunLabel();
  const baseOutputRoot = resolveDownloadRoot(argv['output-root']);
  const outputRootArg = String(argv['output-root'] || '').trim();
  const useShardRoots = profiles.length > 1;
 const keywordDir = path.join(
   baseOutputRoot,
   'xiaohongshu',
   sanitizeForPath(env, 'prod'),
   sanitizeForPath(keyword, 'unknown'),
 );
  const persistentDownloadRoot = path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.webauto', 'download');
 const searchSerialKey = `${sanitizeForPath(env, 'prod')}:${sanitizeForPath(keyword, 'unknown')}:${runLabel}`;
  const mergedDir = path.join(keywordDir, 'merged', `run-${runLabel}`);
  const collectRunDir = path.join(keywordDir, env === 'debug' ? 'collect' : 'links', `run-${runLabel}`);
  const writeMerged = stage !== 'links';
  const runDir = writeMerged ? mergedDir : collectRunDir;
  const sharedHarvestPath = sharedHarvestPathArg || (profiles.length > 1
    ? path.join(mergedDir, 'coord', 'harvest-note-claims.json')
    : '');
  if (!planOnly) {
    const services = await ensureTaskServices(argv, {
      rootDir: process.cwd(),
      stage,
      debugActionLogPath: path.join(runDir, 'profiles', 'input-actions.jsonl'),
      searchGateTimeoutMs: 60000,
    });
    console.log(JSON.stringify({
      event: 'xhs.unified.service_reset',
      ok: services.serviceReset.ok,
      skipped: services.serviceReset.skipped === true,
      reason: services.serviceReset.reason || null,
      actionLogPath: services.serviceReset.actionLogPath || null,
      statusReady: Boolean(services.serviceReset.status?.json?.ready),
    }));
    console.log(JSON.stringify({
      event: 'xhs.unified.search_gate',
      ok: services.searchGate.ok,
      skipped: services.searchGate.skipped === true,
      reason: services.searchGate.reason || null,
    }));
    // 确保所有 profile 的会话都已启动（headful 模式）
  const sessionResults = await Promise.all(
    profiles.map((profileId) => ensureProfileSession(profileId, { headless }))
  );
  const failedProfiles = profiles.filter((_, i) => !sessionResults[i]);
  if (failedProfiles.length > 0) {
    throw new Error(`Failed to initialize sessions for profiles: ${failedProfiles.join(', ')}`);
  }
  }
  const planPath = writeMerged
    ? path.join(mergedDir, 'plan.json')
    : path.join(collectRunDir, 'plan.json');
  const resumeFlagProvided = argv.resume !== undefined && argv.resume !== null && argv.resume !== '';
  const explicitResume = parseBool(overrides.resume ?? argv.resume, false);
  const completedAtStart = await collectCompletedNoteIds(persistentDownloadRoot, env, keyword);
  const targetLimit = hasTotalTarget ? totalNotes : defaultMaxNotes;
  const autoResumeEligible = stage !== 'links' && targetLimit > 0;
  const autoResume = !resumeFlagProvided
    && autoResumeEligible
    && completedAtStart.count > 0
    && completedAtStart.count < targetLimit;
  const resumeRequested = resumeFlagProvided ? explicitResume : autoResume;
  if (autoResume) {
    console.log(JSON.stringify({
      event: 'xhs.unified.auto_resume',
      keyword,
      env,
      completed: completedAtStart.count,
      target: targetLimit,
    }));
  }
  let remainingNotes = hasTotalTarget
    ? Math.max(0, totalNotes - completedAtStart.count)
    : defaultMaxNotes;
  if (!hasTotalTarget && resumeRequested) {
    remainingNotes = Math.max(0, defaultMaxNotes - completedAtStart.count);
  }

  const skippedProfileMap = new Map();
  const wavePlans = [];
  const allResults = [];
  let finalAccountStates = [];

  const execute = async (spec) => {
    try {
      return await runProfile(spec, argv, { ...overrides, skipAccountSync });
    } catch (error) {
      const failure = {
        ok: false,
        profileId: spec.profileId,
        assignedNotes: spec.assignedNotes,
        outputRoot: spec.outputRoot,
        logPath: spec.logPath,
        reason: 'runner_error',
        error: error?.message || String(error),
        stats: {
          assignedNotes: spec.assignedNotes,
          linksCollected: 0,
          linksPaths: [],
          openedNotes: 0,
          commentsHarvestRuns: 0,
          commentsCollected: 0,
          commentsExpected: 0,
          commentsReachedBottomCount: 0,
          likesHitCount: 0,
          likesNewCount: 0,
          likesSkippedCount: 0,
          likesAlreadyCount: 0,
          likesDedupCount: 0,
          searchCount: 0,
          rollbackCount: 0,
          returnToSearchCount: 0,
          operationErrors: 1,
          recoveryFailed: 0,
          terminalCode: null,
          commentPaths: [],
          likeSummaryPaths: [],
          likeStatePaths: [],
          stopReason: 'runner_error',
        },
      };
      await appendJsonl(spec.logPath, {
        ts: nowIso(),
        profileId: spec.profileId,
        event: 'xhs.unified.runner_error',
        error: failure.error,
      });
      await writeJson(spec.summaryPath, failure);
      console.error(JSON.stringify({
        event: 'xhs.unified.profile_failed',
        profileId: spec.profileId,
        error: failure.error,
      }));
      return failure;
    }
  };

  for (let wave = 1; wave <= maxWaves; wave += 1) {
    if (hasTotalTarget && remainingNotes <= 0) break;
    if (!hasTotalTarget && wave > 1) break;

    let executableProfiles = [];
    if (planOnly || skipAccountSync) {
      executableProfiles = profiles.slice();
      finalAccountStates = executableProfiles.map((profileId) => ({
        profileId,
        status: 'plan_only_unverified',
        reason: 'plan_only_skip_account_sync',
        valid: null,
        accountId: null,
      }));
    } else {
      const accountStates = await syncXhsAccountsByProfiles(profiles);
      finalAccountStates = accountStates;
      executableProfiles = accountStates
        .filter((item) => item?.valid === true && Boolean(String(item?.accountId || '').trim()))
        .map((item) => item.profileId);
      const invalidProfiles = accountStates.filter((item) => !item || item.valid !== true);
      for (const item of invalidProfiles) {
        const profileId = String(item?.profileId || '').trim();
        if (!profileId) continue;
        skippedProfileMap.set(profileId, {
          profileId,
          status: item?.status || 'invalid',
          reason: item?.reason || 'invalid',
          valid: item?.valid === true,
          accountId: item?.accountId || null,
        });
      }

      if (executableProfiles.length === 0) {
        if (wave === 1) {
          throw new Error(`no valid business accounts: ${invalidProfiles.map((item) => `${item.profileId}:${item.reason || 'invalid'}`).join(', ')}`);
        }
        break;
      }
    }

    const plan = hasTotalTarget
      ? buildDynamicWavePlan({ profiles: executableProfiles, remainingNotes })
      : buildEvenShardPlan({ profiles: executableProfiles, totalNotes: 0, defaultMaxNotes });
    if (plan.length === 0) break;

    const parallel = parallelRequested && plan.length > 1;
    const concurrency = parallel
      ? Math.min(plan.length, configuredConcurrency)
      : 1;
    const waveTag = `wave-${String(wave).padStart(3, '0')}`;
    const waveAssignedNotes = plan.reduce((sum, item) => sum + Math.max(0, Number(item?.assignedNotes || 0)), 0);
    const specs = plan.map((item, index) => {
      const shardId = sanitizeForPath(item.profileId, 'profile');
      const shardOutputRoot = useShardRoots
        ? path.join(baseOutputRoot, 'shards', shardId)
        : outputRootArg;
      const defaultSeedCollectCount = Math.max(1, waveAssignedNotes || Number(item.assignedNotes || 1) || 1);
      const seedCollectCount = index === 0
        ? (seedCollectCountFlag > 0 ? seedCollectCountFlag : defaultSeedCollectCount)
        : 0;
      const defaultSeedCollectMaxRounds = Math.max(6, Math.ceil(Math.max(1, seedCollectCount) / 2));
      const seedCollectMaxRounds = index === 0
        ? (seedCollectRoundsFlag > 0 ? seedCollectRoundsFlag : defaultSeedCollectMaxRounds)
        : 0;
      const resumeOverrides = resumeRequested
        ? { resume: true, incrementalMax: true, detailLinksStartup: true }
        : {};
      return {
        ...item,
        runLabel,
        waveTag,
        outputRoot: shardOutputRoot,
        logPath: path.join(runDir, 'profiles', `${waveTag}.${shardId}.events.jsonl`),
        summaryPath: path.join(runDir, 'profiles', `${waveTag}.${shardId}.summary.json`),
        sharedHarvestPath,
        searchSerialKey,
        seedCollectCount,
        seedCollectMaxRounds,
        ...resumeOverrides,
      };
    });

    wavePlans.push({
      wave,
      waveTag,
      remainingBefore: remainingNotes,
      parallel,
      concurrency,
      specs: specs.map((item) => ({
        profileId: item.profileId,
        assignedNotes: item.assignedNotes,
        outputRoot: item.outputRoot,
        logPath: item.logPath,
        sharedHarvestPath: item.sharedHarvestPath || null,
        seedCollectCount: item.seedCollectCount || 0,
        seedCollectMaxRounds: item.seedCollectMaxRounds || 0,
        resume: resumeRequested,
      })),
    });

    if (planOnly) break;

    const waveResults = parallel
      ? await runWithConcurrency(specs, concurrency, execute)
      : await runWithConcurrency(specs, 1, execute);
    allResults.push(...waveResults);

    if (hasTotalTarget) {
      const openedInWave = waveResults.reduce((sum, item) => sum + toNumber(item?.stats?.openedNotes, 0), 0);
      remainingNotes = Math.max(0, remainingNotes - openedInWave);
      const waveRecord = wavePlans[wavePlans.length - 1];
      waveRecord.openedInWave = openedInWave;
      waveRecord.remainingAfter = remainingNotes;
      if (openedInWave <= 0) {
        console.error(JSON.stringify({
          event: 'xhs.unified.wave_stalled',
          wave,
          remainingNotes,
        }));
        break;
      }
    }
  }

  const skippedProfiles = Array.from(skippedProfileMap.values());

  const planPayload = {
    event: 'xhs.unified.plan',
    planPath,
    keyword,
    env,
    totalNotes: totalNotes > 0 ? totalNotes : null,
    defaultMaxNotes,
    maxWaves,
    runLabel,
    hasTotalTarget,
    completedAtStart: completedAtStart.count,
    remainingAtPlan: remainingNotes,
    accountStates: finalAccountStates,
    skippedProfiles,
    waves: wavePlans,
  };
  console.log(JSON.stringify(planPayload));

  await writeJson(planPath, planPayload);

  if (planOnly) {
    return {
      ok: true,
      planOnly: true,
      planPath,
      waves: wavePlans,
    };
  }

  const results = allResults;
  if (results.length === 0) {
    throw new Error(`no executable waves generated, see ${planPath}`);
  }

  if (writeMerged) {
    const merged = await mergeProfileOutputs({
      results,
      mergedDir,
      keyword,
      env,
      totalNotes,
      parallel: parallelRequested,
      concurrency: configuredConcurrency,
      skippedProfiles,
    });

    const mergedSummary = {
      ...merged.mergedSummary,
      progress: {
        completedAtStart: completedAtStart.count,
        completedDuringRun: toNumber(merged.mergedSummary?.totals?.openedNotes, 0),
        targetTotal: hasTotalTarget ? totalNotes : null,
        remainingAfterRun: hasTotalTarget ? Math.max(0, remainingNotes) : null,
        reachedTarget: hasTotalTarget ? remainingNotes <= 0 : null,
      },
      waves: wavePlans,
    };
    await writeJson(merged.summaryPath, mergedSummary);

    const mergedEvent = {
      event: 'xhs.unified.merged',
      summaryPath: merged.summaryPath,
      waves: wavePlans.length,
      profilesTotal: results.length,
      profilesSucceeded: results.filter((item) => item.ok).length,
      profilesFailed: results.filter((item) => !item.ok).length,
      remainingNotes: hasTotalTarget ? remainingNotes : null,
    };
    console.log(JSON.stringify(mergedEvent));
    if (busEnabled) {
      void publishBusEvent(mergedEvent);
    }
  }

  const failedResults = results.filter((item) => !item.ok);
  if (hasTotalTarget && remainingNotes > 0) {
    throw new Error(`target not reached, remaining=${remainingNotes}, see ${merged.summaryPath}`);
  }
  if (failedResults.length > 0) {
    if (hasTotalTarget && remainingNotes <= 0) {
      console.warn(JSON.stringify({
        event: 'xhs.unified.partial_failures_tolerated',
        summaryPath: writeMerged ? path.join(mergedDir, 'summary.json') : planPath,
        failedProfiles: failedResults.map((item) => ({
          profileId: item.profileId,
          reason: item.reason || null,
        })),
      }));
    } else {
      throw new Error(`unified finished with failures, see ${planPath}`);
    }
  }

  return {
    ok: true,
    summaryPath: writeMerged ? path.join(mergedDir, 'summary.json') : planPath,
    results,
  };
}

export function printUnifiedHelp() {
  console.log([
    'Usage: node apps/webauto/entry/xhs-unified.mjs --profile <id> --keyword <kw> [options]',
    'Options:',
    '  --profiles <a,b,c>           Comma-separated profile list',
    '  --profilepool <prefix>       Profile pool prefix',
    '  --max-notes <n>              Max notes per profile (without total-notes)',
    '  --total-notes <n>            Total notes across profiles (sharded)',
    '  --total-target <n>           Alias for total-notes',
    '  --max-waves <n>              Max shard waves (default 40)',
    '  --parallel                   Run profiles in parallel',
    '  --bus-events <bool>          Publish UI bus events',
    '  --concurrency <n>            Parallel concurrency',
    '  --resume <bool>              Resume from checkpoint',
    '  --incremental-max <bool>     Treat max-notes as incremental cap',
    '  --stage <name>               full|links|content|like|reply|detail',
    '  --plan-only                  Plan only, do not execute',
    '  --skip-account-sync         Skip business account sync (debug default)',
    '  --output-root <path>         Output root path',
    '  --seed-collect-count <n>     Seed collect count',
    '  --seed-collect-rounds <n>    Seed collect rounds',
    '  --search-serial-key <key>    Search serial key',
    '  --shared-harvest-path <path> Shared harvest path',
    '  --keywords <a,b,c>           Comma-separated keyword rotation list',
    '  --keyword-rotate <bool>      Enable keyword rotation (default true)',
    '  --keyword-rotate-limit <n>   Max consecutive uses per keyword (default 2)',
    '  --search-submit-method <m>   click|enter|form',
    '  --tab-open-delay <ms>        Delay between opening tabs',
    '  --operation-min-interval <ms> Min operation interval',
    '  --event-cooldown <ms>        Event cooldown',
    '  --pacing-jitter <ms>         Pacing jitter',
    '  --service-reset <bool>       Reset ui cli services before task',
  ].join("\n"));
}
