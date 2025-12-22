/**
 * Quick Test Script
 * 快速测试脚本，验证基础功能
 */

import { runBasicTest } from '../examples/basic/test';

console.log('🚀 UI Recognition Service - 快速测试');
console.log('测试基础架构和核心功能...');

runBasicTest()
  .then(() => {
    console.log('\n✅ 快速测试完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  });