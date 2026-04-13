/**
 * Consumer State Persistence - Unit Test
 *
 * 测试目标：
 * 1. 状态文件创建和读取
 * 2. 进度更新和恢复
 * 3. 错误记录
 * 4. 状态重置
 * 5. 崩溃恢复验证
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert';
import {
  loadConsumerState,
  saveConsumerState,
  updateProcessedCount,
  recordError,
  resetConsumerState,
  cleanupOldStates,
} from '../consumer-state.mjs';

const WEBAUTO_HOME = process.env.WEBAUTO_HOME || path.join(os.homedir(), '.webauto');
const TEST_KEYWORD = 'test-crash-recovery';
const TEST_ENV = 'test';

function testFilePath() {
  const safeKeyword = TEST_KEYWORD.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(WEBAUTO_HOME, 'state', 'consumer', TEST_ENV, safeKeyword, 'consumer-state.json');
}

function cleanup() {
  const file = testFilePath();
  if (fs.existsSync(file)) {
    try { fs.unlinkSync(file); } catch {}
  }
}

console.log('=== Consumer State Persistence Tests ===\n');

// Test 1: 初始状态创建
console.log('Test 1: Initial state creation...');
cleanup();
const state1 = loadConsumerState(TEST_KEYWORD, TEST_ENV);
assert.strictEqual(state1.processed, 0, 'Initial processed should be 0');
assert.strictEqual(state1.lastClaimAt, null, 'Initial lastClaimAt should be null');
assert.strictEqual(state1.consecutiveErrors, 0, 'Initial consecutiveErrors should be 0');
console.log('✅ Test 1 passed: initial state created correctly\n');

// Test 2: 状态保存和读取
console.log('Test 2: Save and load state...');
const savedState = saveConsumerState(TEST_KEYWORD, TEST_ENV, {
  processed: 5,
  lastClaimAt: new Date().toISOString(),
  lastProcessedNoteId: 'note123',
  consecutiveErrors: 0,
});
const loadedState = loadConsumerState(TEST_KEYWORD, TEST_ENV);
assert.strictEqual(loadedState.processed, 5, 'Loaded processed should be 5');
assert.strictEqual(loadedState.lastProcessedNoteId, 'note123', 'Loaded noteId should be note123');
console.log('✅ Test 2 passed: state saved and loaded correctly\n');

// Test 3: 进度更新
console.log('Test 3: Update processed count...');
const updatedState = updateProcessedCount(TEST_KEYWORD, TEST_ENV, 3, 'note456');
assert.strictEqual(updatedState.processed, 8, 'Updated processed should be 8 (5+3)');
assert.strictEqual(updatedState.lastProcessedNoteId, 'note456', 'Updated noteId should be note456');
assert.strictEqual(updatedState.consecutiveErrors, 0, 'Updated consecutiveErrors should be 0');
console.log('✅ Test 3 passed: processed count updated correctly\n');

// Test 4: 错误记录
console.log('Test 4: Record error...');
const errorState = recordError(TEST_KEYWORD, TEST_ENV, 'Session disconnected');
assert.strictEqual(errorState.consecutiveErrors, 1, 'Error consecutiveErrors should be 1');
assert.strictEqual(errorState.lastError, 'Session disconnected', 'Error lastError should match');
const errorState2 = recordError(TEST_KEYWORD, TEST_ENV, 'Browser crashed');
assert.strictEqual(errorState2.consecutiveErrors, 2, 'Error consecutiveErrors should be 2');
console.log('✅ Test 4 passed: error recorded correctly\n');

// Test 5: 状态重置
console.log('Test 5: Reset state...');
const resetState = resetConsumerState(TEST_KEYWORD, TEST_ENV);
assert.strictEqual(resetState.processed, 0, 'Reset processed should be 0');
assert.strictEqual(resetState.lastClaimAt, null, 'Reset lastClaimAt should be null');
assert.strictEqual(resetState.consecutiveErrors, 0, 'Reset consecutiveErrors should be 0');
assert.ok(resetState.sessionId, 'Reset should have sessionId');
console.log('✅ Test 5 passed: state reset correctly\n');

// Test 6: 崩溃恢复验证（模拟）
console.log('Test 6: Crash recovery simulation...');
// 1. 创建初始状态
resetConsumerState(TEST_KEYWORD, TEST_ENV);
// 2. 模拟处理了 10 条
for (let i = 1; i <= 10; i++) {
  updateProcessedCount(TEST_KEYWORD, TEST_ENV, 1, `note${i}`);
}
// 3. 模拟崩溃（进程退出）
// 4. 模拟重启（重新加载状态）
const recoveredState = loadConsumerState(TEST_KEYWORD, TEST_ENV);
assert.strictEqual(recoveredState.processed, 10, 'Recovered processed should be 10');
assert.strictEqual(recoveredState.lastProcessedNoteId, 'note10', 'Recovered lastProcessedNoteId should be note10');
console.log('✅ Test 6 passed: crash recovery verified, processed=10 restored\n');

// Test 7: 文件存在验证
console.log('Test 7: File persistence verification...');
const file = testFilePath();
assert.ok(fs.existsSync(file), 'State file should exist');
const fileContent = JSON.parse(fs.readFileSync(file, 'utf-8'));
assert.strictEqual(fileContent.processed, 10, 'File content processed should be 10');
console.log(`✅ Test 7 passed: file persisted at ${file}\n`);

// Cleanup
cleanup();
console.log('=== All Tests Passed ===\n');
console.log('Summary:');
console.log('- State file creation: ✅');
console.log('- State save/load: ✅');
console.log('- Progress update: ✅');
console.log('- Error recording: ✅');
console.log('- State reset: ✅');
console.log('- Crash recovery: ✅');
console.log('- File persistence: ✅');
