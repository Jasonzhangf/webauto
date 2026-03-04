#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';
import { runUnified } from './lib/xhs-unified-runner.mjs';
import { COLLECT_KEYWORDS, pickRandomKeyword } from './lib/xhs-collect-keywords.mjs';

function printCollectHelp() {
  console.log([
    'Usage: node apps/webauto/entry/xhs-collect.mjs --profile <id> [--keyword <kw>] [options]',
    'Collect Mode (links-only):',
    '  --profile <id>       配置好的 camo profile',
    '  --keyword <kw>       搜索关键词（可选，默认随机热搜）',
    '  --max-notes <n>      目标链接数（默认 21，确保超过一页）',
    '  --env <name>         输出环境目录（默认 debug/prod）',
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
  ].join('\n'));
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    printCollectHelp();
    return;
  }

  const keyword = String(argv.keyword || '').trim() || pickRandomKeyword();
  const maxNotes = Number.isFinite(Number(argv['max-notes'] ?? argv.target))
    ? Number(argv['max-notes'] ?? argv.target)
    : 21;

  const runArgv = {
    ...argv,
    keyword,
    'max-notes': maxNotes,
  };

  await runUnified(runArgv, { stage: 'links' });
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ xhs-collect failed:', err?.message || String(err));
    process.exit(1);
  });
}
