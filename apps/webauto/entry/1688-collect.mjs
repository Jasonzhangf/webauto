#!/usr/bin/env node
import minimist from 'minimist';
import { pathToFileURL } from 'node:url';

function printCollectHelp() {
  console.log([
    'Usage: webauto 1688 collect --profile <id> --keyword <kw> [options]',
    '',
    '1688 商品信息采集:',
    '  --profile <id>       配置好的 camo profile（如 1688-test-1）',
    '  --keyword <kw>       搜索关键词（必填）',
    '  --max-notes <n>      目标采集数量（默认 60）',
    '  --do-shop-contact    是否采集店铺联系方式（默认 false）',
    '  --output-root <p>    自定义输出根目录',
    '  --env <name>         输出环境目录（默认 debug）',
    '',
    'Examples:',
    '  webauto 1688 collect --profile 1688-test-1 --keyword "蓝牙耳机"',
    '  webauto 1688 collect --profile 1688-test-1 --keyword "数据线" --max-notes 100 --do-shop-contact',
  ].join('\n'));
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.help || argv.h) {
    printCollectHelp();
    return;
  }

  const profileId = String(argv.profile || '').trim();
  const keyword = String(argv.keyword || argv.k || '').trim();
  
  if (!profileId) {
    console.error('❌ 缺少 --profile 参数');
    printCollectHelp();
    process.exit(1);
  }
  
  if (!keyword) {
    console.error('❌ 缺少 --keyword 参数');
    printCollectHelp();
    process.exit(1);
  }

  // 动态导入 runner
  const { run1688Collect } = await import('./lib/1688-collect-runner.mjs');
  await run1688Collect(argv);
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((err) => {
    console.error('❌ 1688-collect failed:', err?.message || String(err));
    process.exit(1);
  });
}

export { main as run1688CollectCLI };
