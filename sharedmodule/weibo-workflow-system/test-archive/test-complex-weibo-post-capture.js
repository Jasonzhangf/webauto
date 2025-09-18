/**
 * 复杂微博帖子内容捕获测试
 * 使用新创建的微博专项操作子进行完整的内容和评论捕获
 * 测试链接: https://weibo.com/2656274875/Q4qEJBc6z (有两三千评论的热门帖子)
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../../cookie-management-system/src/index.js';
import { AtomicOperationFactory } from '../src/core/complete-atomic-operations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ComplexWeiboPostCaptureTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookieSystem = null;
    this.testUrl = 'https://weibo.com/2656274875/Q4qEJBc6z'; // 测试目标帖子
    this.results = {
      testName: 'complex-weibo-post-capture-test',
      version: '2.0.0',
      targetUrl: this.testUrl,
      executedAt: new Date().toISOString(),
      operations: [],
      summary: {}
    };
  }

  async initialize() {
    console.log('🚀 初始化复杂微博帖子捕获测试...');
    
    // 初始化Cookie管理系统
    this.cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, '../test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await this.cookieSystem.initialize();
    
    // 初始化浏览器
    this.browser = await chromium.launch({ 
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript-harmony-promises'
      ]
    });
    
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      javaScriptEnabled: true
    });
    
    this.page = await context.newPage();
    
    console.log('✅ 复杂微博帖子捕获测试初始化完成');
  }

  // 构建完整的工作流
  buildWorkflow() {
    console.log('🏗️ 构建复杂微博帖子捕获工作流...');
    
    const cookiePath = path.join(__dirname, '../cookies/weibo.com.json');
    const savePath = path.join('./results', `complex-weibo-post-${Date.now()}.json`);
    
    this.operations = [
      // 1. Cookie加载操作
      {
        name: 'Cookie加载',
        operation: AtomicOperationFactory.createOperation('cookie.load', {
          cookieSystem: this.cookieSystem,
          domain: 'weibo.com',
          cookiePath: cookiePath
        })
      },
      
      // 2. 登录状态检查操作
      {
        name: '登录状态检查',
        operation: AtomicOperationFactory.createOperation('login.check', {
          selectors: [
            '.gn_name',
            '.S_txt1', 
            '.username',
            '[data-usercard*="true"]',
            'a[href*="/home"]',
            '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA',
            '[class*="name"]',
            '.Profile_title_3y3yh'
          ]
        })
      },
      
      // 3. Cookie验证操作
      {
        name: 'Cookie验证',
        operation: AtomicOperationFactory.createOperation('cookie.validate', {
          cookieSystem: this.cookieSystem,
          domain: 'weibo.com'
        })
      },
      
      // 4. 微博帖子完整捕获操作
      {
        name: '微博帖子完整捕获',
        operation: AtomicOperationFactory.createOperation('weibo.post.complete', {
          postUrl: this.testUrl,
          maxComments: 150, // 增加评论数量以测试性能
          maxScrolls: 30,   // 增加滚动次数
          scrollDelay: 2500, // 增加延迟确保内容加载
          savePath: savePath,
          contentSelectors: {
            mainContent: '.Feed_body_3R0rO, .Feed_body_2wP8c, .feed_body, [class*="feed_body"], .main_content, [class*="main_content"]',
            authorName: '.Feed_body_3R0rO .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.woo-box-alignCenter.Z_link_isY_0, .author_name, [class*="author"]',
            postTime: '.Feed_body_3R0rO .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA, .woo-box-flex.woo-box-alignCenter.Card_title_3NffA .woo-box-flex.Card_title_3NffA, .post_time, [class*="time"]',
            images: 'img[class*="image"], img[src*="sinaimg"], .Feed_body_3R0rO img, .Feed_body_2wP8c img, .feed_img img, .post_img img',
            videos: 'video, .video-player, [class*="video"], a[href*="video"], a[href*="mp4"], [class*="video"]',
            stats: '.Feed_body_3R0rO .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5, .Feed_body_2wP8c .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5, .woo-box-flex.woo-box-alignCenter.Card_actionBar_3P2T5, [class*="stats"]'
          }
        })
      },
      
      // 5. 结果验证操作
      {
        name: '结果验证',
        operation: AtomicOperationFactory.createOperation('data.validate', {
          data: {}, // 将在上一步填充
          validators: [
            (data) => ({
              valid: !!data && !!data.post,
              error: !data || !data.post ? 'Post data is missing' : null
            }),
            (data) => ({
              valid: !!data && !!data.comments && Array.isArray(data.comments.comments),
              error: !data || !data.comments || !Array.isArray(data.comments.comments) ? 'Comments data is missing or invalid' : null
            }),
            (data) => ({
              valid: data && data.comments && data.comments.totalCount > 0,
              error: !data || !data.comments || data.comments.totalCount === 0 ? 'No comments captured' : null
            })
          ]
        })
      }
    ];
    
    console.log(`📋 工作流构建完成，包含 ${this.operations.length} 个操作`);
    this.results.totalOperations = this.operations.length;
  }

  async executeWorkflow() {
    console.log('🚀 执行复杂微博帖子捕获工作流...');
    console.log('🎯 目标帖子:', this.testUrl);
    console.log('='.repeat(60));
    
    const workflowResults = {};
    let captureResult = null;
    
    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      console.log(`⚡ 执行操作 ${i + 1}/${this.operations.length}: ${op.name}`);
      
      try {
        const startTime = Date.now();
        
        // 为结果验证操作设置数据
        if (op.name === '结果验证' && captureResult) {
          op.operation.data = captureResult;
        }
        
        const result = await op.operation.execute(this.page);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (result.success) {
          this.results.successfulOperations = (this.results.successfulOperations || 0) + 1;
          workflowResults[op.name] = {
            ...result,
            duration: duration,
            timestamp: new Date().toISOString()
          };
          console.log(`✅ ${op.name} 执行成功 (${duration}ms)`);
          
          // 保存捕获结果用于验证
          if (op.name === '微博帖子完整捕获') {
            captureResult = result.result;
            console.log(`📊 捕获结果:`);
            console.log(`   - 评论数: ${result.result.summary.totalComments}`);
            console.log(`   - 图片数: ${result.result.summary.totalImages}`);
            console.log(`   - 视频数: ${result.result.summary.totalVideos}`);
            console.log(`   - 保存路径: ${result.result.post.url}`);
          }
          
        } else {
          this.results.failedOperations = (this.results.failedOperations || 0) + 1;
          workflowResults[op.name] = {
            ...result,
            duration: duration,
            timestamp: new Date().toISOString()
          };
          console.log(`❌ ${op.name} 执行失败 (${duration}ms): ${result.error}`);
        }
        
      } catch (error) {
        this.results.failedOperations = (this.results.failedOperations || 0) + 1;
        workflowResults[op.name] = { 
          success: false, 
          error: error.message,
          timestamp: new Date().toISOString()
        };
        console.log(`❌ ${op.name} 执行异常: ${error.message}`);
      }
      
      // 操作间延迟
      if (i < this.operations.length - 1) {
        await this.page.waitForTimeout(2000);
      }
    }
    
    // 生成总结
    this.results.operations = workflowResults;
    this.results.summary = {
      totalComments: captureResult?.summary?.totalComments || 0,
      totalImages: captureResult?.summary?.totalImages || 0,
      totalVideos: captureResult?.summary?.totalVideos || 0,
      successfulOperations: this.results.successfulOperations || 0,
      failedOperations: this.results.failedOperations || 0,
      totalOperations: this.results.totalOperations,
      successRate: this.results.totalOperations > 0 ? 
        ((this.results.successfulOperations / this.results.totalOperations) * 100).toFixed(2) + '%' : '0%',
      capturedAt: new Date().toISOString()
    };
    
    return workflowResults;
  }

  async saveResults() {
    const outputPath = path.join('./results', `complex-weibo-post-capture-${Date.now()}.json`);
    
    const fs = await import('fs');
    const fsPromises = await import('fs').then(m => m.promises);
    
    try {
      await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    } catch (error) {
      // Directory already exists
    }
    
    await fsPromises.writeFile(outputPath, JSON.stringify(this.results, null, 2));
    
    console.log(`💾 复杂微博帖子捕获测试结果已保存到: ${outputPath}`);
    return outputPath;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
    
    if (this.cookieSystem) {
      await this.cookieSystem.shutdown();
    }
  }

  async run() {
    try {
      await this.initialize();
      
      console.log('🧪 开始复杂微博帖子捕获测试...');
      console.log('='.repeat(60));
      
      // 构建工作流
      this.buildWorkflow();
      
      // 执行工作流
      const workflowResults = await this.executeWorkflow();
      
      // 保存结果
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(60));
      console.log('🎉 复杂微博帖子捕获测试完成！');
      console.log(`📊 测试结果:`);
      console.log(`   - 测试名称: ${this.results.testName}`);
      console.log(`   - 目标URL: ${this.results.targetUrl}`);
      console.log(`   - 总操作数: ${this.results.summary.totalOperations}`);
      console.log(`   - 成功操作: ${this.results.summary.successfulOperations}`);
      console.log(`   - 失败操作: ${this.results.summary.failedOperations}`);
      console.log(`   - 成功率: ${this.results.summary.successRate}`);
      console.log(`   - 捕获评论: ${this.results.summary.totalComments} 条`);
      console.log(`   - 捕获图片: ${this.results.summary.totalImages} 张`);
      console.log(`   - 捕获视频: ${this.results.summary.totalVideos} 个`);
      console.log(`   - 结果文件: ${outputPath}`);
      
      // 显示操作类型统计
      const operationTypes = new Set();
      this.operations.forEach(op => {
        if (op.operation.constructor.name) {
          operationTypes.add(op.operation.constructor.name);
        }
      });
      
      console.log(`🏗️ 架构统计:`);
      console.log(`   - 使用操作子类型: ${operationTypes.size} 种`);
      console.log(`   - Cookie虚拟操作子: ✅ 已集成`);
      console.log(`   - 微博专项操作子: ✅ 已集成`);
      console.log(`   - 数据验证操作: ✅ 已集成`);
      
      // 显示评论示例
      if (this.results.summary.totalComments > 0) {
        const captureData = workflowResults['微博帖子完整捕获']?.result;
        if (captureData && captureData.comments && captureData.comments.comments) {
          console.log(`\n📋 评论示例:`);
          captureData.comments.comments.slice(0, 3).forEach((comment, index) => {
            console.log(`   ${index + 1}. ${comment.userName}: ${comment.content.substring(0, 50)}...`);
          });
        }
      }
      
      return {
        success: this.results.summary.failedOperations === 0,
        results: this.results,
        outputPath: outputPath,
        conclusion: `复杂微博帖子捕获测试${this.results.summary.failedOperations === 0 ? '成功' : '部分失败'}，共捕获${this.results.summary.totalComments}条评论`
      };
      
    } catch (error) {
      console.error('❌ 复杂微博帖子捕获测试失败:', error.message);
      return { success: false, error: error.message };
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
const test = new ComplexWeiboPostCaptureTest();
test.run().then((result) => {
  if (result.success) {
    console.log('✅ 复杂微博帖子捕获测试成功');
    console.log(`🎯 结论: ${result.conclusion}`);
    process.exit(0);
  } else {
    console.log('❌ 复杂微博帖子捕获测试失败');
    process.exit(1);
  }
}).catch((error) => {
  console.error('💥 复杂微博帖子捕获测试异常:', error);
  process.exit(1);
});