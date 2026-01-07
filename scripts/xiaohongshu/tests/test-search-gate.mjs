#!/usr/bin/env node
/**
 * SearchGate 测试脚本
 * 
 * 功能：
 * 1. 验证 SearchGate 健康状态
 * 2. 模拟连续提交多个搜索请求
 * 3. 验证速率限制是否生效（2次/分钟）
 */

const GATE_URL = 'http://127.0.0.1:7790';

async function checkHealth() {
  try {
    const res = await fetch(`${GATE_URL}/health`);
    const data = await res.json();
    console.log('✅ SearchGate 健康检查通过:', data);
    return true;
  } catch (error) {
    console.error('❌ SearchGate 不可达:', error.message);
    console.log('💡 请先运行: node scripts/search-gate-server.mjs');
    return false;
  }
}

async function requestPermit(key, keyword) {
  const res = await fetch(`${GATE_URL}/permit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, keyword })
  });
  return await res.json();
}

async function main() {
  console.log('🔍 测试 SearchGate 速率限制\n');

  if (!await checkHealth()) {
    return;
  }

  const key = 'test_profile';
  const keywords = ['测试1', '测试2', '测试3', '测试4'];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    console.log(`\n[请求 ${i + 1}/${keywords.length}] 关键词: "${keyword}"`);
    
    const result = await requestPermit(key, keyword);
    
    if (result.allowed) {
      console.log(`  ✅ 许可已授予`);
      console.log(`     - 窗口内计数: ${result.countInWindow}/${result.maxCount}`);
    } else {
      console.log(`  ⏳ 被限流，需等待 ${Math.ceil(result.waitMs / 1000)}s`);
      console.log(`     - 窗口内计数: ${result.countInWindow}/${result.maxCount}`);
    }

    // 短暂间隔
    if (i < keywords.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n📊 查看统计信息:');
  const stats = await fetch(`${GATE_URL}/stats`).then(r => r.json());
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n✅ 测试完成');
  console.log('💡 提示: 前2次应该被允许，第3次开始会被限流');
}

main().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
