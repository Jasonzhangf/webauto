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
      severity: 'low' as const
    };
  }
}

// 简化版本的帖子分析器
class SimpleWeiboPostAnalyzer extends EventEmitter {
  async analyzePost(page: any, postUrl: string) {
    console.log(`SimplePostAnalyzer: Analyzing post ${postUrl}...`);
    
    // 模拟分析结果
    const post = {
      id: 'test-post',
      url: postUrl,
      author: {
        id: 'test-author',
        name: 'Test User',
        avatar: '',
        verified: false,
        verificationType: ''
      },
      content: {
        text: 'This is a test post content',
        hashtags: ['test'],
        mentions: [],
        links: []
      },
      media: {
        images: [],
        videos: [],
        articles: []
      },
      engagement: {
        reposts: 0,
        comments: 0,
        likes: 0
      },
      metadata: {
        publishTime: new Date(),
        source: 'web',
        client: 'web',
        isAd: false,
        isSensitive: false
      },
      comments: []
    };
    
    this.emit('analysisComplete', { post });
    return post;
  }
}

// 简化版本的批量分析器
class SimpleWeiboBatchAnalyzer extends EventEmitter {
  private linkExtractor = new SimpleWeiboLinkExtractor();
  private postAnalyzer = new SimpleWeiboPostAnalyzer();
  private antiBot = new SimpleWeiboAntiBotProtection();

  async runBatchAnalysis(page: any) {
    console.log('SimpleBatchAnalyzer: Starting batch analysis...');
    
    try {
      // 1. 提取链接
      await this.antiBot.executeDelay('pageLoad');
      const links = await this.linkExtractor.extractLinks(page);
      
      // 2. 分析帖子
      const posts = [];
      for (const link of links.posts) {
        await this.antiBot.executeDelay('pageLoad');
        const post = await this.postAnalyzer.analyzePost(page, link.url);
        posts.push(post);
      }
      
      const result = {
        summary: {
          totalPosts: links.posts.length,
          analyzedPosts: posts.length,
          successfulPosts: posts.length,
          failedPosts: 0,
          totalComments: 0,
          totalImages: 0,
          totalVideos: 0,
          duration: 5000
        },
        posts,
        errors: [],
        progress: {
          current: posts.length,
          total: links.posts.length,
          percentage: 100
        }
      };
      
      this.emit('batchComplete', result);
      return result;
      
    } catch (error) {
      this.emit('batchError', { error });
      throw error;
    }
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
  
  // 测试帖子分析器
  try {
    const analyzer = new SimpleWeiboPostAnalyzer();
    const post = await analyzer.analyzePost(mockPage, 'https://weibo.com/test');
    console.log('SimpleWeiboPostAnalyzer: OK');
    results.push({ name: 'SimpleWeiboPostAnalyzer', status: 'OK' });
  } catch (error) {
    console.log(`SimpleWeiboPostAnalyzer: FAILED - ${error.message}`);
    results.push({ name: 'SimpleWeiboPostAnalyzer', status: 'FAILED', error: error.message });
  }
  
  // 测试批量分析器
  try {
    const batchAnalyzer = new SimpleWeiboBatchAnalyzer();
    const result = await batchAnalyzer.runBatchAnalysis(mockPage);
    console.log(`SimpleWeiboBatchAnalyzer: OK - ${result.summary.analyzedPosts} posts analyzed`);
    results.push({ name: 'SimpleWeiboBatchAnalyzer', status: 'OK' });
  } catch (error) {
    console.log(`SimpleWeiboBatchAnalyzer: FAILED - ${error.message}`);
    results.push({ name: 'SimpleWeiboBatchAnalyzer', status: 'FAILED', error: error.message });
  }
  
  const passed = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  
  console.log(`\nResults: ${passed}/${results.length} components passed`);
  
  if (failed > 0) {
    console.log('\nFailed components:');
    results.filter(r => r.status === 'FAILED').forEach(r => {
      console.log(`  ${r.name}: ${r.error}`);
    });
  }
  
  return { total: results.length, passed, failed };
}

if (require.main === module) {
  testSimpleComponents().then(result => {
    if (result.failed === 0) {
      console.log('\n🎉 All simple components working! Ready for real testing.');
    } else {
      console.log('\n❌ Some components failed.');
      process.exit(1);
    }
  });
}

export { testSimpleComponents, SimpleWeiboBatchAnalyzer, SimpleWeiboLinkExtractor, SimpleWeiboPostAnalyzer, SimpleWeiboAntiBotProtection };
