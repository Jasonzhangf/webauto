#!/usr/bin/env node
/**
 * 自检：禁止新增 legacy 引用
 * 用于 task.md A.1 - 增加"禁止新增 legacy 引用"的自检
 */

import { execSync } from 'child_process';
import fs from 'fs';

const LEGACY_PATTERNS = [
  'sharedmodule/operations-framework',
];

console.log('=== 检查 Legacy 引用 ===\n');

let hasLegacyRefs = false;

for (const pattern of LEGACY_PATTERNS) {
  try {
    // 排除文档和 LEGACY.md 本身
    const output = execSync(
      `rg "${pattern}" --type-add 'source:*.{ts,js,mts,mjs,tsx,jsx}' -t source -g '!*.md' -g '!LEGACY.md' -g '!scripts/check-legacy-refs.mjs' --files-with-matches`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    
    if (output) {
      hasLegacyRefs = true;
      const files = output.split('\n').filter(Boolean);
      console.log(`❌ 发现 ${pattern} 的引用 (${files.length} 个文件):`);
      files.forEach(f => console.log(`   ${f}`));
      console.log();
    }
  } catch (e) {
    // rg 没有匹配时会返回非零退出码
  }
}

if (hasLegacyRefs) {
  console.error('🚫 检测到 legacy 引用，请修复后再提交！\n');
  console.error('修复方式：');
  console.error('  1. 将 sharedmodule/operations-framework 替换为 libs/operations-framework');
  console.error('  2. 运行 npm test 验证修改');
  process.exit(1);
} else {
  console.log('✅ 未检测到 legacy 引用\n');
}
