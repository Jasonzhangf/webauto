#!/usr/bin/env node
/**
 * 运行所有集成测试
 */

import { execSync } from 'child_process';
import fs from 'fs';

console.log('🧪 WebAuto 集成测试套件');
console.log('='.repeat(60));

const REPORT_FILE = '/tmp/integration-test-report.txt';
fs.writeFileSync(REPORT_FILE, '');

const log = (msg) => {
  console.log(msg);
  fs.appendFileSync(REPORT_FILE, `${msg}\n`);
};

const tests = [
  {
    name: '容器匹配功能',
    script: 'tests/integration/01-test-container-match.mjs',
    required: true
  },
  {
    name: 'DOM 分支拉取功能', 
    script: 'tests/integration/02-test-dom-branch.mjs',
    required: true
  }
];

let passed = 0;
let failed = 0;
const results = [];

for (const test of tests) {
  log(`\n${'='.repeat(60)}`);
  log(`运行: ${test.name}`);
  log(`${'='.repeat(60)}`);
  
  try {
    const output = execSync(`node ${test.script}`, {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 60000
    });
    
    log(`✅ ${test.name} - 通过`);
    results.push({ name: test.name, status: 'PASS' });
    passed++;
    
  } catch (err) {
    log(`❌ ${test.name} - 失败`);
    results.push({ name: test.name, status: 'FAIL', error: err.message });
    failed++;
    
    if (test.required) {
      log(`\n⚠️  必需测试失败，停止后续测试`);
      break;
    }
  }
}

// 生成报告
log(`\n${'='.repeat(60)}`);
log('测试报告');
log(`${'='.repeat(60)}`);

results.forEach(r => {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  log(`${icon} ${r.name}: ${r.status}`);
  if (r.error) {
    log(`   错误: ${r.error}`);
  }
});

log(`\n总计: ${passed} 通过, ${failed} 失败`);

// 输出文件位置
log(`\n${'='.repeat(60)}`);
log('生成的文件:');
log('  - /tmp/test-container-match.log');
log('  - /tmp/container-match-result.json');
log('  - /tmp/test-dom-branch.log');
log('  - /tmp/dom-branch-result.json');
log(`  - ${REPORT_FILE}`);

if (failed > 0) {
  log(`\n💡 检查日志文件以了解失败原因`);
  process.exit(1);
} else {
  log(`\n🎉 所有测试通过！`);
  process.exit(0);
}
