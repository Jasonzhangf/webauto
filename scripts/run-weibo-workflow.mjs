#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 标准化微博采集工作流
 *
 * 用法: node scripts/run-weibo-workflow.mjs --count 250 --output weibo_posts_250.md
 */

import { execute as CollectWeiboPosts } from '../modules/workflow/blocks/CollectWeiboPosts.ts';

async function main() {
  const args = process.argv.slice(2);

  // 解析参数
  let count = 250;
  let output = 'output/weibo_posts_250.md';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[i + 1];
      i++;
    }
  }

  console.log('========================================');
  console.log('标准化微博采集 Workflow');
  console.log('========================================');
  console.log(`输入参数:`);
  console.log(`  - 数量: ${count}`);
  console.log(`  - 输出文件: ${output}`);
  console.log('');

  try {
    await CollectWeiboPosts({ count, output });
  } catch (error) {
    console.error('❌ Workflow 执行失败:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
