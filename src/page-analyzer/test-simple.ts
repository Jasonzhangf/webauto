/**
 * 页面分析器简化测试
 * 测试基础功能，不启动浏览器
 */

import { PageTypeIdentifier } from './core/PageTypeIdentifier.js';
import { DOMWalkStrategy } from './strategies/DOMWalkStrategy.js';

async function testBasicFunctionality() {
  console.log('🧪 测试页面分析器基础功能');
  
  try {
    // 测试1: 页面类型识别器初始化
    console.log('\n1️⃣ 测试页面类型识别器...');
    const identifier = new PageTypeIdentifier();
    console.log('✅ PageTypeIdentifier 初始化成功');
    
    // 测试2: DOM遍历策略初始化
    console.log('\n2️⃣ 测试DOM遍历策略...');
    const domStrategy = new DOMWalkStrategy();
    console.log(`✅ DOMWalkStrategy 初始化成功`);
    console.log(`   策略名称: ${domStrategy.name}`);
    console.log(`   优先级: ${domStrategy.getPriority()}`);
    console.log(`   适用性检查: ${domStrategy.isApplicable('https://weibo.com')}`);
    
    console.log('\n✅ 基础功能测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
if (import.meta.url === `file://\${process.argv[1]}`) {
  testBasicFunctionality().catch(console.error);
}
