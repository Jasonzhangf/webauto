#!/usr/bin/env node
/**
 * 验证 operations-framework 引用：盘点 libs vs sharedmodule
 * 用于 task.md A.1 - Operations Framework 统一真源
 */

import { execSync } from 'child_process';
import fs from 'fs';

console.log('=== Operations Framework 引用盘点 ===\n');

const LIBS_PATH = 'libs/operations-framework';
const SHARED_PATH = 'sharedmodule/operations-framework';

// 1. 检查两个目录是否存在
const libsExists = fs.existsSync(LIBS_PATH);
const sharedExists = fs.existsSync(SHARED_PATH);

console.log(`📁 目录存在性检查：`);
console.log(`   ${LIBS_PATH}: ${libsExists ? '✓' : '✗'}`);
console.log(`   ${SHARED_PATH}: ${sharedExists ? '✓' : '✗'}\n`);

if (!libsExists && !sharedExists) {
  console.error('❌ 两个目录都不存在，无法继续');
  process.exit(1);
}

// 2. 统计引用
function countRefs(pattern) {
  try {
    const output = execSync(
      `rg "${pattern}" -g '*.ts' -g '*.js' -g '*.mts' -g '*.mjs' -g '*.tsx' -g '*.jsx' --no-heading --count`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const lines = output.trim().split('\n').filter(Boolean);
    const files = lines.map(line => {
      const [file, count] = line.split(':');
      return { file, count: parseInt(count) };
    });
    const totalCount = files.reduce((sum, f) => sum + f.count, 0);
    return { files, totalCount };
  } catch (e) {
    return { files: [], totalCount: 0 };
  }
}

const libsRefs = countRefs('libs/operations-framework');
const sharedRefs = countRefs('sharedmodule/operations-framework');

console.log(`📊 引用统计：`);
console.log(`   libs/operations-framework: ${libsRefs.totalCount} 次引用 (${libsRefs.files.length} 个文件)`);
console.log(`   sharedmodule/operations-framework: ${sharedRefs.totalCount} 次引用 (${sharedRefs.files.length} 个文件)\n`);

// 3. 列出主要引用文件
if (libsRefs.files.length > 0) {
  console.log(`📝 libs/operations-framework 主要引用文件（前15个）：`);
  libsRefs.files.slice(0, 15).forEach(({ file, count }) => {
    console.log(`   ${file} (${count}次)`);
  });
  console.log();
}

if (sharedRefs.files.length > 0) {
  console.log(`📝 sharedmodule/operations-framework 主要引用文件（前15个）：`);
  sharedRefs.files.slice(0, 15).forEach(({ file, count }) => {
    console.log(`   ${file} (${count}次)`);
  });
  console.log();
}

// 4. 决策建议
console.log('🎯 决策建议：');
if (libsRefs.totalCount > sharedRefs.totalCount) {
  console.log(`   ✅ libs/operations-framework 被更广泛引用（${libsRefs.totalCount} vs ${sharedRefs.totalCount}）`);
  console.log(`   建议：以 libs/operations-framework 为唯一真源`);
  console.log(`   行动：将 sharedmodule/operations-framework 标记为 legacy 或建立转发兼容层\n`);
} else if (sharedRefs.totalCount > libsRefs.totalCount) {
  console.log(`   ✅ sharedmodule/operations-framework 被更广泛引用（${sharedRefs.totalCount} vs ${libsRefs.totalCount}）`);
  console.log(`   建议：以 sharedmodule/operations-framework 为唯一真源`);
  console.log(`   行动：将 libs/operations-framework 标记为 legacy 或建立转发兼容层\n`);
} else {
  console.log(`   ⚠️  两者引用次数相同（${libsRefs.totalCount}），需要人工决策`);
  console.log(`   建议：检查核心服务（unified-api/browser-service）引用哪个，以此为准\n`);
}

// 5. 检查核心服务引用
console.log('🔍 核心服务引用检查：');
const coreServices = [
  'services/unified-api',
  'services/browser-service',
  'modules/workflow'
];

coreServices.forEach(service => {
  try {
    const libsInCore = execSync(
      `rg "libs/operations-framework" -g '*.ts' -g '*.js' -g '*.mts' ${service} --count`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim().split('\n').length;
    
    const sharedInCore = execSync(
      `rg "sharedmodule/operations-framework" -g '*.ts' -g '*.js' -g '*.mts' ${service} --count`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim().split('\n').length;
    
    console.log(`   ${service}: libs(${libsInCore}) vs shared(${sharedInCore})`);
  } catch (e) {
    console.log(`   ${service}: 无引用`);
  }
});

console.log('\n✅ 盘点完成');
