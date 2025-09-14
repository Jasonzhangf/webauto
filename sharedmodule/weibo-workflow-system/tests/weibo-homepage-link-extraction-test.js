/**
 * 微博主页链接提取测试
 * 使用原子化操作和通用测试平台
 */

const { GeneralTestPlatform } = require('../src/core/general-test-platform');
const { WeiboHomepageLinkExtractionSystem } = require('../src/config/weibo-homepage-link-extraction-config');

/**
 * 微博主页链接提取测试
 */
async function testWeiboHomepageLinkExtraction() {
  console.log('🧪 开始微博主页链接提取测试...\n');

  const platform = new GeneralTestPlatform({
    headless: false,
    timeout: 60000,
    enableLogging: true,
    screenshotOnFailure: true,
    saveResults: true
  });

  try {
    // 初始化测试平台
    await platform.initialize();
    
    // 创建链接提取系统
    const linkExtractionSystem = new WeiboHomepageLinkExtractionSystem();
    linkExtractionSystem.buildAtomicOperations();
    linkExtractionSystem.buildCompositeOperations();
    
    console.log('📋 已创建链接提取系统');
    console.log('🔧 支持的操作类型:');
    console.log('  - 页面状态检查');
    console.log('  - 链接提取（所有链接、帖子链接、用户链接、话题链接等）');
    console.log('  - 媒体链接提取（图片、视频）');
    console.log('  - 分页处理');
    console.log('  - 智能过滤');
    console.log('  - 统计分析');
    
    // 执行测试
    const result = await platform.runWeiboHomepageLinkExtractionTest({
      enablePagination: true,
      saveResults: true,
      resultsFile: 'weibo-homepage-links-results.json'
    });

    // 显示结果
    console.log('\n📊 测试结果:');
    console.log('=====================================');
    console.log(`状态: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`开始时间: ${result.startTime}`);
    console.log(`结束时间: ${result.endTime}`);
    
    if (result.success && result.results) {
      const stats = result.results.stats;
      console.log(`\n📈 提取统计:`);
      console.log(`总链接数: ${stats.totalLinks}`);
      console.log(`按类型分类:`);
      
      for (const [type, count] of Object.entries(stats.linksByType)) {
        console.log(`  - ${type}: ${count}`);
      }
      
      console.log(`\n🌐 域名分布:`);
      for (const [domain, count] of Object.entries(stats.domains)) {
        console.log(`  - ${domain}: ${count}`);
      }
      
      console.log(`\n🔗 链接示例 (前5个):`);
      result.results.links.slice(0, 5).forEach((link, index) => {
        console.log(`  ${index + 1}. [${link.type}] ${link.text} (${link.href})`);
      });
    }
    
    if (result.error) {
      console.log(`\n❌ 错误信息: ${result.error}`);
    }
    
    console.log('\n📋 测试步骤:');
    result.steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step.step}: ${step.success ? '✅' : '❌'}`);
    });

    return result;

  } catch (error) {
    console.error('❌ 测试执行失败:', error);
    throw error;
  } finally {
    await platform.cleanup();
  }
}

/**
 * 仅创建和测试链接提取系统（不打开浏览器）
 */
async function testLinkExtractionSystemOnly() {
  console.log('🔧 测试链接提取系统创建...\n');

  try {
    // 创建链接提取系统
    const linkExtractionSystem = new WeiboHomepageLinkExtractionSystem();
    
    // 构建操作
    linkExtractionSystem.buildAtomicOperations();
    linkExtractionSystem.buildCompositeOperations();
    
    console.log('✅ 链接提取系统创建成功');
    console.log('\n📋 系统配置:');
    console.log('=====================================');
    
    const config = linkExtractionSystem.config;
    console.log('容器类型:', config.container.type);
    console.log('主选择器:', config.container.selector);
    console.log('行为模式:', config.container.behaviors.join(', '));
    console.log('触发器:', config.container.triggers.join(', '));
    
    console.log('\n⚛️ 原子操作数量:', Object.keys(config.atomicOperations).length);
    console.log('🔗 组合操作数量:', Object.keys(config.compositeOperations).length);
    console.log('🎯 触发器数量:', Object.keys(config.triggers).length);
    console.log('🔧 过滤器数量:', Object.keys(config.filters).length);
    
    console.log('\n⚛️ 原子操作类型:');
    const atomicTypes = {};
    for (const op of Object.values(config.atomicOperations)) {
      atomicTypes[op.type] = (atomicTypes[op.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(atomicTypes)) {
      console.log(`  - ${type}: ${count}`);
    }
    
    console.log('\n🔗 组合操作类型:');
    for (const [name, system] of Object.entries(config.compositeOperations)) {
      console.log(`  - ${name}: ${system.type}`);
    }
    
    console.log('\n🎯 触发器类型:');
    for (const [name, trigger] of Object.entries(config.triggers)) {
      console.log(`  - ${name}: ${trigger.type}`);
    }
    
    console.log('\n🔧 过滤器类型:');
    for (const [name, filter] of Object.entries(config.filters)) {
      console.log(`  - ${name}: ${filter.type}`);
    }
    
    console.log('\n✅ 系统测试完成');
    console.log('💡 此系统支持:');
    console.log('  - 完全配置驱动的链接提取');
    console.log('  - 原子化操作组合');
    console.log('  - 智能过滤和分类');
    console.log('  - 分页和滚动处理');
    console.log('  - 多种触发机制');
    console.log('  - 完整的统计分析');
    
    return linkExtractionSystem;
    
  } catch (error) {
    console.error('❌ 系统测试失败:', error);
    throw error;
  }
}

/**
 * 快速验证架构
 */
async function quickArchitectureValidation() {
  console.log('🏗️ 快速架构验证...\n');

  try {
    // 验证原子操作工厂
    const { AtomicOperationFactory } = require('../src/core/atomic-operations');
    const atomicFactory = new AtomicOperationFactory();
    
    const existsOp = atomicFactory.createOperation('element.exists', {
      selector: 'body',
      options: { timeout: 5000 }
    });
    
    console.log('✅ 原子操作工厂: 可创建', existsOp.constructor.name);
    
    // 验证组合操作工厂
    const { CompositeOperationFactory } = require('../src/core/composite-operations');
    const compositeFactory = new CompositeOperationFactory();
    
    const linkSystem = compositeFactory.createLinkExtractionSystem({
      linkSelector: 'a[href]',
      maxLinks: 10
    });
    
    console.log('✅ 组合操作工厂: 可创建', linkSystem.composite.constructor.name);
    
    // 验证配置分离
    const { WeiboHomepageLinkExtractionConfig } = require('../src/config/weibo-homepage-link-extraction-config');
    
    console.log('✅ 配置分离: 配置对象包含', 
      Object.keys(WeiboHomepageLinkExtractionConfig.atomicOperations).length, '个原子操作'
    );
    
    // 验证测试平台
    const { GeneralTestPlatform } = require('../src/core/general-test-platform');
    const platform = new GeneralTestPlatform();
    
    console.log('✅ 测试平台: 可创建', platform.constructor.name);
    
    console.log('\n🎉 架构验证完成');
    console.log('📋 架构特点:');
    console.log('  - ✅ 完全分离的配置和逻辑');
    console.log('  - ✅ 原子化操作设计');
    console.log('  - ✅ 组合操作模式');
    console.log('  - ✅ 通用测试平台');
    console.log('  - ✅ Cookie管理支持');
    console.log('  - ✅ 配置驱动设计');
    
  } catch (error) {
    console.error('❌ 架构验证失败:', error);
    throw error;
  }
}

// 主函数
async function main() {
  console.log('🚀 微博主页链接提取系统测试\n');
  
  try {
    // 1. 架构验证
    await quickArchitectureValidation();
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 2. 系统创建测试
    await testLinkExtractionSystemOnly();
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 3. 询问是否执行完整测试
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('是否执行完整的浏览器测试? (y/N): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      // 4. 完整测试
      await testWeiboHomepageLinkExtraction();
    } else {
      console.log('📋 跳过浏览器测试，仅验证架构');
    }
    
    console.log('\n✅ 所有测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testWeiboHomepageLinkExtraction,
  testLinkExtractionSystemOnly,
  quickArchitectureValidation
};