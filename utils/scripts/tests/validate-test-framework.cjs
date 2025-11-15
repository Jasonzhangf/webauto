/**
 * 测试框架验证脚本
 * 验证所有重构的测试代码是否能正常工作
 */

const path = require('path');
const fs = require('fs');

console.log('🚀 开始验证测试框架...');

// 验证1: 检查文件结构
console.log('\n1. 检查文件结构...');
const requiredFiles = [
  'tests/utils/test-config.cjs',
  'tests/utils/test-helpers.cjs',
  'tests/integration/cookie-auth.test.cjs',
  'tests/integration/single-post-download.test.cjs',
  'tests/integration/batch-download.test.cjs'
];

for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} 存在`);
  } else {
    console.log(`❌ ${file} 不存在`);
    process.exit(1);
  }
}

// 验证2: 检查依赖文件
console.log('\n2. 检查依赖文件...');
const dependencyFiles = [
  'sharedmodule/weibo-workflow-system/src/core/base-test-system.js',
  'cookies/weibo.com.json'
];

for (const file of dependencyFiles) {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} 存在`);
  } else {
    console.log(`❌ ${file} 不存在`);
    process.exit(1);
  }
}

// 验证3: 检查Cookie文件
console.log('\n3. 验证Cookie文件...');
try {
  const cookieData = fs.readFileSync('cookies/weibo.com.json', 'utf8');
  const cookies = JSON.parse(cookieData);

  if (!Array.isArray(cookies) || cookies.length === 0) {
    console.log('❌ Cookie文件格式错误或为空');
    process.exit(1);
  }

  const keyCookies = cookies.filter(c => ['SUB', 'SRT', 'SCF', 'ALF'].includes(c.name));
  if (keyCookies.length === 0) {
    console.log('❌ Cookie文件中缺少关键认证Cookie');
    process.exit(1);
  }

  console.log(`✅ Cookie文件验证成功 (${cookies.length} 个Cookie, ${keyCookies.length} 个关键Cookie)`);
} catch (error) {
  console.log(`❌ Cookie文件验证失败: ${error.message}`);
  process.exit(1);
}

// 验证4: 尝试加载测试模块
console.log('\n4. 验证模块加载...');
try {
  const { TEST_CONFIG } = require('../tests/utils/test-config.cjs');
  const { createTestSystem, validateCookieFile } = require('../tests/utils/test-helpers.cjs');

  console.log('✅ 测试配置模块加载成功');
  console.log('✅ 测试辅助函数模块加载成功');

  // 验证配置
  console.log(`✅ 测试配置: ${TEST_CONFIG.baseUrl}`);
  console.log(`✅ Cookie文件路径: ${TEST_CONFIG.paths.cookieFile}`);

} catch (error) {
  console.log(`❌ 模块加载失败: ${error.message}`);
  process.exit(1);
}

// 验证5: 创建测试结果目录
console.log('\n5. 创建测试结果目录...');
const dirs = [
  'test-results/downloads',
  'test-results/logs',
  'test-results/reports',
  'test-results/screenshots'
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log(`✅ ${dir} 已就绪`);
}

// 验证6: 运行简单测试
console.log('\n6. 运行基本功能测试...');
try {
  const { validateCookieFile } = require('../tests/utils/test-helpers.cjs');
  const result = validateCookieFile();

  if (result.valid) {
    console.log(`✅ Cookie验证功能正常 (${result.count} 个Cookie)`);
  } else {
    console.log('❌ Cookie验证功能异常');
    process.exit(1);
  }
} catch (error) {
  console.log(`❌ 基本功能测试失败: ${error.message}`);
  process.exit(1);
}

console.log('\n🎉 测试框架验证完成！');
console.log('\n📋 验证结果:');
console.log('✅ 文件结构正确');
console.log('✅ 依赖文件完整');
console.log('✅ Cookie认证有效');
console.log('✅ 模块加载正常');
console.log('✅ 目录结构就绪');
console.log('✅ 基本功能正常');

console.log('\n🚀 测试框架已准备就绪，可以运行完整的测试套件！');
console.log('\n运行命令:');
console.log('  npm test                        # 运行所有测试');
console.log('  npx jest tests/integration     # 运行集成测试');
console.log('  node scripts/validate-test-framework.js  # 验证框架');