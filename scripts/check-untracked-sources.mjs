#!/usr/bin/env node
/**
 * 自检：检测未被 git track 的源码文件
 * 用于 task.md C.1 - 强制编译限制
 * 
 * 规则：services/、modules/、libs/、apps/、runtime/、scripts/ 中不允许存在
 * "未被 git track 且未被 ignore" 的源码/配置文件
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SOURCE_DIRS = [
  'services',
  'modules',
  'libs',
  'apps',
  'runtime',
  'scripts'
];

const SOURCE_EXTENSIONS = [
  '.ts', '.mts', '.tsx',
  '.js', '.mjs', '.jsx',
  '.json', '.yaml', '.yml'
];

console.log('=== 检查未被 track 的源码文件 ===\n');

// 1. 获取所有未 track 的文件
let untrackedFiles = [];
try {
  const output = execSync('git ls-files --others --exclude-standard', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();
  
  if (output) {
    untrackedFiles = output.split('\n').filter(Boolean);
  }
} catch (e) {
  console.error('❌ 无法获取 git 状态，请确保在 git 仓库中运行');
  process.exit(1);
}

console.log(`📊 未被 track 的文件总数: ${untrackedFiles.length}\n`);

// 2. 过滤出源码目录中的源码文件
const untrackedSources = untrackedFiles.filter(file => {
  // 检查是否在源码目录中
  const inSourceDir = SOURCE_DIRS.some(dir => file.startsWith(dir + '/'));
  if (!inSourceDir) return false;
  
  // 检查是否为源码文件
  const ext = path.extname(file);
  return SOURCE_EXTENSIONS.includes(ext);
});

if (untrackedSources.length === 0) {
  console.log('✅ 未发现未 track 的源码文件\n');
  process.exit(0);
}

// 3. 按目录分组
const groupedByDir = {};
untrackedSources.forEach(file => {
  const dir = file.split('/')[0];
  if (!groupedByDir[dir]) groupedByDir[dir] = [];
  groupedByDir[dir].push(file);
});

console.log(`❌ 发现 ${untrackedSources.length} 个未 track 的源码文件:\n`);

Object.keys(groupedByDir).sort().forEach(dir => {
  console.log(`📁 ${dir}/ (${groupedByDir[dir].length} 个文件):`);
  groupedByDir[dir].forEach(file => {
    console.log(`   ${file}`);
  });
  console.log();
});

console.error('🚫 检测到未 track 的源码文件，请修复后再提交！\n');
console.error('修复方式（选择一种）：');
console.error('  1. git add <file>     - 将文件加入版本控制');
console.error('  2. git rm <file>      - 删除文件');
console.error('  3. 编辑 .gitignore    - 将文件加入忽略列表（如果是临时文件）\n');

console.error('💡 提示：');
console.error('  - 构建产物应加入 .gitignore');
console.error('  - 临时测试文件应在测试完成后删除');
console.error('  - 新增功能代码必须 git add 后提交\n');

process.exit(1);
