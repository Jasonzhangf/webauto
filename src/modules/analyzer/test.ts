/**
 * 页面分析器基础测试
 */

import { chromium } from 'playwright';
import { PageTypeIdentifier, DOMWalkStrategy, quickAnalyze } from './index.js';

async function testPageAnalyzer() {
  console.log('🧪 测试页面分析器基础功能');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 测试1: 页面类型识别
    console.log('\n1️⃣ 测试页面类型识别...');
    const identifier = new PageTypeIdentifier();
    
    const testUrls = [
      'https://weibo.com',
      'https://weibo.com/search?q=test',
      'https://weibo.com/u/123456'
    ];
    
    for (const testUrl of testUrls) {
      try {
        console.log(`   测试: ${testUrl}`);
        await page.goto(testUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        await page.waitForTimeout(1000);
        
        const pageType = await identifier.identifyPageType(testUrl, page);
        console.log(`   结果: ${pageType.name} (${pageType.type})`);
        console.log(`   特征: 滚动=${pageType.characteristics.scrollType}, 登录=${pageType.characteristics.hasLogin}`);
      } catch (error) {
        console.log(`   失败: ${error.message}`);
      }
    }
    
    // 测试2: DOM遍历策略
    console.log('\n2️⃣ 测试DOM遍历策略...');
    await page.goto('https://weibo.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    await page.waitForTimeout(2000);
    
    const domStrategy = new DOMWalkStrategy();
    const containers = await domStrategy.discover(page);
    
    console.log(`✅ DOM遍历完成，发现 ${containers.length} 个容器`);
    
    // 显示前5个容器
    console.log('\n📦 发现的容器 (前5个):');
    for (const container of containers.slice(0, 5)) {
      console.log(`   - ${container.name} (${container.type})`);
      console.log(`     选择器: ${container.selector}`);
      console.log(`     优先级: ${container.priority}`);
      console.log(`     元素数: ${container.elementCount}`);
      console.log(`     能力: ${container.capabilities.map(c => c.name).join(', ')}`);
      console.log('');
    }
    
    // 测试3: 快速分析
    console.log('\n3️⃣ 测试快速分析...');
    const quickResult = await quickAnalyze(page, 'https://weibo.com');
    console.log(`✅ 快速分析完成`);
    console.log(`   页面类型: ${quickResult.pageType.name}`);
    console.log(`   URL: ${quickResult.url}`);
    
    console.log('\n✅ 所有测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testPageAnalyzer().catch(console.error);
}
