import { runUnified } from './xhs-unified-runner.mjs';
import { COLLECT_KEYWORDS, pickRandomKeyword } from './xhs-collect-keywords.mjs';
import { assertCollectedLinksCount } from './xhs-collect-verify.mjs';

function resolveCollectArgs(argv = {}) {
  const keyword = String(argv.keyword || argv.k || '').trim() || pickRandomKeyword();
  const maxNotes = Number.isFinite(Number(argv['max-notes'] ?? argv.target))
    ? Number(argv['max-notes'] ?? argv.target)
    : 21;
  const env = String(argv.env || 'prod').trim() || 'prod';
  const outputRoot = String(argv['output-root'] || '').trim();
  return {
    keyword,
    maxNotes,
    env,
    outputRoot: outputRoot || undefined,
    runArgv: {
      ...argv,
      keyword,
      'max-notes': maxNotes,
      ...(argv['keyword-rotate'] === undefined ? { 'keyword-rotate': false } : {}),
    },
  };
}

export function getCollectHelpLines() {
  return [
    'Usage: node apps/webauto/entry/xhs-collect.mjs --profile <id> [--keyword <kw>] [options]',
    'Collect Mode (links-only):',
    '  --profile <id>       配置好的 camo profile',
    '  --keyword <kw>       搜索关键词（可选，默认随机热搜）',
    '  --max-notes <n>      目标链接数（默认 21，确保超过一页）',
    '  --env <name>         输出环境目录（默认 release/prod）',
    '  --output-root <p>    自定义输出根目录',
    '  --plan-only          仅生成计划不执行',
    '',
    'Hot Keywords (20):',
    `  ${COLLECT_KEYWORDS.join('、')}`,
    '',
    'Examples:',
    '  webauto xhs collect --profile xhs-1',
    '  webauto xhs collect --profile xhs-1 --keyword "元宵节" --max-notes 21',
    '  webauto xhs collect --profile xhs-1 --plan-only',
  ];
}

export async function runXhsCollect(argv = {}) {
  const { keyword, maxNotes, env, outputRoot, runArgv } = resolveCollectArgs(argv);
  const summary = await runUnified(runArgv, { stage: 'links' });
  const runId = summary?.runId || summary?.results?.[0]?.runId || null;
  if (!runId) {
    console.error(JSON.stringify({
      event: 'xhs.collect.runid_missing',
      keyword,
      env,
      maxNotes,
      summaryKeys: summary ? Object.keys(summary) : [],
    }));
    throw new Error('COLLECT_RUNID_MISSING: failed to extract runId from summary');
  }
  console.log(JSON.stringify({
    event: 'xhs.collect.verify_start',
    keyword,
    env,
    maxNotes,
    runId,
  }));
  try {
    const verifyResult = await assertCollectedLinksCount({
      keyword,
      env,
      outputRoot,
      target: maxNotes,
      runId,
    });
    console.log(JSON.stringify({
      event: 'xhs.collect.verify_success',
      keyword,
      env,
      maxNotes,
      runId,
      linksPath: verifyResult?.linksPath || null,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: 'xhs.collect.links_count_mismatch',
      keyword,
      env,
      maxNotes,
      runId,
      message: error?.message || String(error),
      details: error?.details || null,
    }));
    throw error;
  }
}
