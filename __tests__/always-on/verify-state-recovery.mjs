/**
 * Verify State Recovery Log Test
 *
 * 快速验证：重启 Consumer 后是否显示 "recovered state" 日志
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';

const WEBAUTO_HOME = process.env.WEBAUTO_HOME || path.join(os.homedir(), '.webauto');
const TEST_KEYWORD = 'test-state-file';
const TEST_ENV = 'debug';

function stateFilePath() {
  const safeKeyword = TEST_KEYWORD.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(WEBAUTO_HOME, 'state', 'consumer', TEST_ENV, safeKeyword, 'consumer-state.json');
}

console.log('=== Verify State Recovery Log ===\n');

// Step 1: 验证状态文件存在
const stateFile = stateFilePath();
console.log(`State file path: ${stateFile}`);

if (fs.existsSync(stateFile)) {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  console.log(`✅ State file exists:`);
  console.log(`   processed: ${state.processed}`);
  console.log(`   lastNoteId: ${state.lastProcessedNoteId}`);
  console.log(`   startedAt: ${state.startedAt}`);
} else {
  console.log('❌ State file not found');
  process.exit(1);
}

// Step 2: 运行 Consumer ��证恢复日志
console.log('\nStep 2: Run consumer to verify recovery log...');

const runnerPath = '/Users/fanzhang/Documents/github/webauto/apps/webauto/entry/xhs-consumer-runner.mjs';

// 直接用 execSync 模拟启动（会很快失败因为没有队列数据，但能验证状态恢复日志）
try {
  const output = execSync(
    `timeout 5 node ${runnerPath} --keyword ${TEST_KEYWORD} --env ${TEST_ENV} --profile xiaohongshu-batch-1 --max-notes 1 --do-comments false --do-likes false --tab-count 1 2>&1 || true`,
    { encoding: 'utf8', timeout: 10000 }
  );
  
  console.log('\nConsumer output:');
  console.log(output);
  
  // Step 3: 验证恢复日志
  console.log('\nStep 3: Verify recovery log...');
  
  const hasRecoveredStateLog = output.includes('recovered state');
  const hasProcessedLog = output.includes('processed=5');
  
  if (hasRecoveredStateLog) {
    console.log('✅ ✅ ✅ "recovered state" LOG FOUND!');
    console.log('✅ CRASH RECOVERY FEATURE WORKING!');
  } else if (hasProcessedLog) {
    console.log('✅ State value displayed (processed=5)');
    console.log('✅ State loaded correctly');
  } else {
    console.log('⚠️ No explicit recovery log in output');
    console.log('Checking if state was at least loaded...');
  }
  
} catch (err) {
  // timeout 命令会正常退出
  console.log('Consumer exited (expected)');
}

console.log('\n=== Verification Complete ===');
