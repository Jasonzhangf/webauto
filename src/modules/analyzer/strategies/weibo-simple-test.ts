import { EventEmitter } from 'events';

// 简化版本的微博链接提取器
class SimpleWeiboLinkExtractor extends EventEmitter {
  private extractedLinks: Set<string> = new Set();

  async extractLinks(page: any) {
    console.log('SimpleWeiboLinkExtractor: Starting extraction...');
    
    // 模拟提取逻辑
    const mockLinks = [
      { id: 'test1', url: 'https://weibo.com/123/status/abc', type: 'post' },
      { id: 'test2', url: 'https://weibo.com/456/status/def', type: 'post' }
    ];
    
    const result = {
      posts: mockLinks,
      users: [],
      hashtags: [],
      other: []
    };
    
    this.emit('linksExtracted', result);
    return result;
  }
}

// 简化版本的防反机器人保护
class SimpleWeiboAntiBotProtection extends EventEmitter {
  async executeDelay(type: string) {
    const delays: Record<string, number> = {
      scroll: 3000,
      click: 2000,
      pageLoad: 5000
    };
    
    const delay = delays[type] || 1000;
    console.log(`SimpleAntiBotProtection: Waiting ${delay}ms for ${type}...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async detectAntiBotSignals(page: any) {
    console.log('SimpleAntiBotProtection: Checking for anti-bot signals...');
    return {
      detected: false,
      signals: [],
      severity: 'low'
    };
  }
}

// 测试函数
async function testSimpleComponents() {
  console.log('=== Simple Weibo Components Test ===');
  
  const mockPage = {
    goto: async () => {},
    url: () => 'https://weibo.com',
    $: async () => null,
    $$: async () => [],
    evaluate: async () => {},
    click: async () => {},
    mouse: { move: async () => {} },
    viewport: () => ({ width: 1920, height: 1080 })
  };
  
  const results = [];
  
  // 测试链接提取器
  try {
    const extractor = new SimpleWeiboLinkExtractor();
    const links = await extractor.extractLinks(mockPage);
    console.log(`SimpleWeiboLinkExtractor: OK - ${links.posts.length} links found`);
    results.push({ name: 'SimpleWeiboLinkExtractor', status: 'OK' });
  } catch (error) {
    console.log(`SimpleWeiboLinkExtractor: FAILED - ${error.message}`);
    results.push({ name: 'SimpleWeiboLinkExtractor', status: 'FAILED', error: error.message });
  }
  
  // 测试防反机器人保护
  try {
    const antiBot = new SimpleWeiboAntiBotProtection();
    await antiBot.executeDelay('scroll');
    const signals = await antiBot.detectAntiBotSignals(mockPage);
    console.log('SimpleWeiboAntiBotProtection: OK');
    results.push({ name: 'SimpleWeiboAntiBotProtection', status: 'OK' });
  } catch (error) {
    console.log(`SimpleWeiboAntiBotProtection: FAILED - ${error.message}`);
    results.push({ name: 'SimpleWeiboAntiBotProtection', status: 'FAILED', error: error.message });
  }
  
  const passed = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  
  console.log(``);
  console.log(`Results: ${passed}/${results.length} components passed`);
  
  if (failed > 0) {
    console.log('');
    console.log('Failed components:');
    results.filter(r => r.status === 'FAILED').forEach(r => {
      console.log(`  ${r.name}: ${r.error}`);
    });
  }
  
  return { total: results.length, passed, failed };
}

// 运行测试
testSimpleComponents().then(result => {
  if (result.failed === 0) {
    console.log('');
    console.log('🎉 All simple components working! Ready for real testing.');
  } else {
    console.log('');
    console.log('❌ Some components failed.');
    process.exit(1);
  }
});
