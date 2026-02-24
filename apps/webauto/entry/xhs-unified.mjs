#!/usr/bin/env node
import minimist from 'minimist';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncXhsAccountsByProfiles } from './lib/account-detect.mjs';
import {
  cleanupIncompleteProfiles,
  listAccountProfiles,
  listSavedProfiles,
} from './lib/account-store.mjs';
import { listProfilesForPool } from './lib/profilepool.mjs';
import { assertProfilesUsable } from './lib/profile-policy.mjs';
import { publishBusEvent } from './lib/bus-publish.mjs';
import {
  ensureProfileSession,
  resolveXhsStage,
  runProfile,
} from './lib/xhs-unified-profile-blocks.mjs';
import {
  resolveDownloadRoot,
  collectCompletedNoteIds,
} from './lib/xhs-unified-output-blocks.mjs';
import {
  buildEvenShardPlan,
  buildDynamicWavePlan,
  runWithConcurrency,
} from './lib/xhs-unified-plan-blocks.mjs';
import {
  nowIso,
  formatRunLabel,
  parseBool,
  parseIntFlag,
  parseNonNegativeInt,
  sanitizeForPath,
  resetTaskServices,
} from './lib/xhs-unified-blocks.mjs';
import {
  toNumber,
  mergeProfileOutputs,
} from './lib/xhs-unified-runtime-blocks.mjs';

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
  const keyword = String(argv.keyword || argv.k || '').trim();
  if (!keyword) throw new Error('missing --keyword');
  cleanupIncompleteProfiles();

  const stage = resolveXhsStage(argv);
  const env = String(argv.env || 'prod').trim() || 'prod';
  const busEnabled = parseBool(argv['bus-events'], false) || process.env.WEBAUTO_BUS_EVENTS === '1';
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
  profiles = assertProfilesUsable(profiles);
  const planOnly = parseBool(argv['plan-only'], false);
  const headless = parseBool(argv.headless, false);
  const defaultMaxNotes = parseIntFlag(argv['max-notes'] ?? argv.target, 30, 1);
  const totalNotes = parseNonNegativeInt(argv['total-notes'] ?? argv['total-target'], 0);
  const hasTotalTarget = totalNotes > 0;
  let maxWaves = parseIntFlag(argv['max-waves'], 40, 1);
  let parallelRequested = parseBool(argv.parallel, false);
  let configuredConcurrency = parseIntFlag(argv.concurrency, profiles.length || 1, 1);
  const seedCollectCountFlag = parseNonNegativeInt(argv['seed-collect-count'], 0);
  const seedCollectRoundsFlag = parseNonNegativeInt(argv['seed-collect-rounds'], 6);

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
  const sharedHarvestPath = profiles.length > 1
    ? path.join(baseOutputRoot, 'xiaohongshu', sanitizeForPath(env, 'prod'), sanitizeForPath(keyword, 'unknown'), 'merged', `run-${runLabel}`, 'coord', 'harvest-note-claims.json')
    : '';
  const searchSerialKey = `${sanitizeForPath(env, 'prod')}:${sanitizeForPath(keyword, 'unknown')}:${runLabel}`;
  const mergedDir = path.join(
    baseOutputRoot,
    'xiaohongshu',
    sanitizeForPath(env, 'prod'),
    sanitizeForPath(keyword, 'unknown'),
    'merged',
    `run-${runLabel}`,
  );
  if (!planOnly) {
    const serviceReset = await resetTaskServices(argv, {
      rootDir: process.cwd(),
      debugActionLogPath: path.join(mergedDir, 'profiles', 'input-actions.jsonl'),
    });
    console.log(JSON.stringify({
      event: 'xhs.unified.service_reset',
      ok: serviceReset.ok,
      skipped: serviceReset.skipped === true,
      reason: serviceReset.reason || null,
      actionLogPath: serviceReset.actionLogPath || null,
      statusReady: Boolean(serviceReset.status?.json?.ready),
    }));
    await Promise.all(profiles.map((profileId) => ensureProfileSession(profileId, { headless })));
  }
  const planPath = path.join(mergedDir, 'plan.json');
  const completedAtStart = hasTotalTarget
    ? await collectCompletedNoteIds(baseOutputRoot, env, keyword)
    : { count: 0, noteIds: [] };
  let remainingNotes = hasTotalTarget
    ? Math.max(0, totalNotes - completedAtStart.count)
    : defaultMaxNotes;

  const skippedProfileMap = new Map();
  const wavePlans = [];
  const allResults = [];
  let finalAccountStates = [];

  const execute = async (spec) => {
    try {
      return await runProfile(spec, argv, overrides);
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
    if (planOnly) {
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
    const specs = plan.map((item, index) => {
      const shardId = sanitizeForPath(item.profileId, 'profile');
      const shardOutputRoot = useShardRoots
        ? path.join(baseOutputRoot, 'shards', shardId)
        : outputRootArg;
      const defaultSeedCollectCount = Math.max(1, Math.min(
        Number(item.assignedNotes || 1),
        Math.max(1, plan.length * 2),
      ));
      const seedCollectCount = index === 0
        ? (seedCollectCountFlag > 0 ? seedCollectCountFlag : defaultSeedCollectCount)
        : 0;
      return {
        ...item,
        runLabel,
        waveTag,
        outputRoot: shardOutputRoot,
        logPath: path.join(mergedDir, 'profiles', `${waveTag}.${shardId}.events.jsonl`),
        summaryPath: path.join(mergedDir, 'profiles', `${waveTag}.${shardId}.summary.json`),
        sharedHarvestPath,
        searchSerialKey,
        seedCollectCount,
        seedCollectMaxRounds: index === 0 ? seedCollectRoundsFlag : 0,
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

  const failedResults = results.filter((item) => !item.ok);
  if (hasTotalTarget && remainingNotes > 0) {
    throw new Error(`target not reached, remaining=${remainingNotes}, see ${merged.summaryPath}`);
  }
  if (failedResults.length > 0) {
    if (hasTotalTarget && remainingNotes <= 0) {
      console.warn(JSON.stringify({
        event: 'xhs.unified.partial_failures_tolerated',
        summaryPath: merged.summaryPath,
        failedProfiles: failedResults.map((item) => ({
          profileId: item.profileId,
          reason: item.reason || null,
        })),
      }));
    } else {
      throw new Error(`unified finished with failures, see ${merged.summaryPath}`);
    }
  }

  return {
    ok: true,
    summaryPath: merged.summaryPath,
    results,
  };
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    console.log([
      'Usage: node apps/webauto/entry/xhs-unified.mjs --profile <id> --keyword <kw> [options]',
      'Options:',
      '  --profiles <a,b,c>           多账号列表',
      '  --profilepool <prefix>       账号池前缀（自动读取匹配 profile）',
      '  --max-notes <n>              单账号目标（未启用 total-notes 时）',
      '  --total-notes <n>            总目标数（自动分片到账号）',
      '  --total-target <n>           total-notes 别名',
      '  --max-waves <n>              动态分片最大波次（默认40）',
      '  --parallel                   启用并行执行',
      '  --bus-events <bool>          启用 UI 事件总线推送（默认 false）',
      '  --concurrency <n>            并行度（默认=账号数）',
      '  --resume <bool>              断点续传（默认 false）',
      '  --incremental-max <bool>     max-notes 作为增量配额（默认 true）',
      '  --stage <name>               阶段：full|links|content|like|reply（默认 full）',
      '                              links: 搜索+逐条点开采链(xsec_token, 单账号不分片); content: 搜索+采链+内容; like: 搜索+采链+内容+点赞; reply: 搜索+采链+内容+回复',
      '  --plan-only                  只生成分片计划，不执行',
      '  --output-root <path>         输出根目录（并行时自动分 profile shard）',
      '  --seed-collect-count <n>     链接预采样数量（默认=max-notes）',
      '  --seed-collect-rounds <n>    链接预采样滚动轮数（默认=max(6,ceil(max-notes/2)))',
      '  --search-serial-key <key>    搜索阶段串行锁key（默认自动生成）',
      '  --shared-harvest-path <path> 共享harvest去重列表路径（默认自动生成）',
      '  --search-submit-method <m>   搜索提交方式 click|enter|form（默认 flow-gate）',
      '  --tab-open-delay <ms>        新开 tab 间隔（默认 flow-gate 区间随机）',
      '  --operation-min-interval <ms> 基础操作最小间隔（默认 flow-gate）',
      '  --event-cooldown <ms>        基础事件冷却（默认 flow-gate）',
      '  --pacing-jitter <ms>         基础抖动区间（默认 flow-gate）',
      '  --service-reset <bool>       任务前复位并重启 ui cli 服务（默认 true）',
    ].join('\n'));
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
