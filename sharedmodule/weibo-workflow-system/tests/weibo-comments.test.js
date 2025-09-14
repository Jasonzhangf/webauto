const BaseTestSystem = require('../src/core/base-test-system');

/**
 * 微博评论提取测试 - 基于BaseTestSystem
 * 遵循基础测试系统规则
 */
class WeiboCommentsTest {
  constructor() {
    this.testUrl = 'https://weibo.com/2656274875/Q4qEJBc6z#comment';
    this.configPath = 'src/operations/websites/weibo/post-comments-extraction.json';
    this.testSystem = null;
    this.results = {
      url: this.testUrl,
      comments: [],
      totalExtracted: 0,
      performance: {}
    };
  }

  async initializeTestSystem() {
    this.testSystem = new BaseTestSystem({
      logLevel: 'info',
      cookieFile: './cookies.json',
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      timeout: 60000 // 增加到60秒
    });

    // 监听系统事件
    this.setupEventListeners();

    // 初始化系统
    await this.testSystem.initialize();
  }

  setupEventListeners() {
    this.testSystem.on('initialized', (state) => {
      console.log('✅ 基础测试系统初始化完成');
    });

    this.testSystem.on('operationCompleted', (result) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} 操作 ${result.operationName} ${result.success ? '成功' : '失败'} (${result.executionTime}ms)`);
    });

    this.testSystem.on('log', (logEntry) => {
      // 可以在这里添加自定义日志处理
    });
  }

  async checkLoginRequired() {
    console.log('🔍 检查登录状态...');
    
    try {
      // 检查常见的登录选择器
      const loginSelectors = [
        '.login_btn',
        '.W_login_form', 
        '[node-type="loginForm"]',
        '.gn_login'
      ];

      for (const selector of loginSelectors) {
        const result = await this.testSystem.executeAtomicOperation('elementExists', { selector });
        if (result.exists) {
          console.log('⚠️  检测到登录界面，等待手动登录...');
          
          // 等待用户手动登录
          await this.testSystem.executeAtomicOperation('wait', { 
            selector: 'body', 
            timeout: 30000 
          });
          
          console.log('✅ 登录检查完成');
          return;
        }
      }
      
      console.log('✅ 无需登录');
    } catch (error) {
      console.log('⚠️  登录检查出错:', error.message);
    }
  }

  async loadMoreComments() {
    console.log('📜 加载更多评论...');
    let loadAttempts = 0;
    const maxAttempts = 10;
    
    while (loadAttempts < maxAttempts) {
      try {
        // 查找加载更多按钮
        const moreButtonSelectors = [
          '.WB_comment_more a',
          '.comment_more',
          '.expand_comments',
          '.load_more',
          '[node-type="comment_more"]'
        ];
        
        let buttonFound = false;
        
        for (const selector of moreButtonSelectors) {
          const result = await this.testSystem.executeAtomicOperation('elementExists', { selector });
          if (result.exists) {
            console.log(`🔘 找到加载更多按钮: ${selector}`);
            await this.testSystem.executeAtomicOperation('click', { selector });
            buttonFound = true;
            
            // 等待新评论加载
            await this.testSystem.executeAtomicOperation('wait', { 
              selector: 'body', 
              timeout: 2000 
            });
            break;
          }
        }
        
        if (!buttonFound) {
          console.log('📄 尝试滚动加载...');
          await this.testSystem.executeAtomicOperation('scrollTo', { y: 0, selector: 'html' });
          await this.testSystem.executeAtomicOperation('wait', { 
            selector: 'body', 
            timeout: 2000 
          });
          
          // 检查是否到达底部
          const scrollResult = await this.testSystem.executeAtomicOperation('executeScript', {
            script: () => {
              return {
                scrollY: window.scrollY,
                innerHeight: window.innerHeight,
                scrollHeight: document.body.scrollHeight
              };
            }
          });
          
          if (scrollResult.scrollY + scrollResult.innerHeight >= scrollResult.scrollHeight - 100) {
            console.log('📄 已到达页面底部');
            break;
          }
        }
        
        loadAttempts++;
        console.log(`📜 加载进度: ${loadAttempts}/${maxAttempts}`);
        
      } catch (error) {
        console.log(`⚠️  加载更多评论时出错: ${error.message}`);
        break;
      }
    }
    
    console.log(`📜 评论加载完成，共尝试 ${loadAttempts} 次`);
  }

  async analyzePageStructure() {
    console.log('🔍 分析页面结构...');
    
    try {
      // 获取页面标题
      const title = await this.testSystem.executeAtomicOperation('executeScript', {
        script: () => document.title
      });
      console.log(`📄 页面标题: ${title}`);
      
      // 查找可能的评论区域选择器
      const possibleSelectors = [
        '.comment',
        '.comments',
        '.reply',
        '.feedback',
        '[class*="comment"]',
        '[class*="reply"]',
        '[class*="feedback"]',
        '[id*="comment"]',
        '[id*="reply"]',
        '[id*="feedback"]'
      ];
      
      console.log('🔍 搜索可能的评论区域:');
      for (const selector of possibleSelectors) {
        try {
          const result = await this.testSystem.executeAtomicOperation('elementExists', { selector });
          if (result.exists) {
            console.log(`  ✅ 找到匹配: ${selector}`);
          }
        } catch (error) {
          // 忽略无效选择器
        }
      }
      
      // 获取页面上所有的div和section元素，分析其class
      const pageAnalysis = await this.testSystem.executeAtomicOperation('executeScript', {
        script: () => {
          const elements = document.querySelectorAll('div, section, article, main');
          const analysis = [];
          
          elements.forEach((el, index) => {
            const className = el.className || '';
            const id = el.id || '';
            const textContent = el.textContent?.substring(0, 100) || '';
            
            if (className.includes('comment') || 
                className.includes('reply') || 
                className.includes('feedback') ||
                id.includes('comment') ||
                id.includes('reply') ||
                id.includes('feedback') ||
                textContent.includes('评论') ||
                textContent.includes('回复')) {
              analysis.push({
                tag: el.tagName,
                className,
                id,
                textLength: textContent.length,
                childrenCount: el.children.length
              });
            }
          });
          
          return analysis.slice(0, 20); // 只返回前20个匹配
        }
      });
      
      console.log('📊 页面元素分析结果:');
      pageAnalysis.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.tag} - class: "${item.className}", id: "${item.id}", children: ${item.childrenCount}`);
      });
      
      // 保存页面HTML用于分析
      const pageHtml = await this.testSystem.executeAtomicOperation('executeScript', {
        script: () => document.documentElement.outerHTML
      });
      
      const htmlFile = `page-analysis-${Date.now()}.html`;
      require('fs').writeFileSync(htmlFile, pageHtml);
      console.log(`📄 页面HTML已保存: ${htmlFile}`);
      
    } catch (error) {
      console.error('❌ 页面分析失败:', error.message);
    }
  }

  async extractComments() {
    console.log('🔥 开始提取评论...');
    const startTime = Date.now();
    
    try {
      // 加载更多评论
      await this.loadMoreComments();
      
      // 尝试多种评论选择器 - 针对现代Vue应用
      const commentSelectors = [
        // 传统选择器（可能失效）
        '.WB_comment_wrap',
        '.comment_item',
        '.comment_list_item', 
        '.WB_comment',
        
        // 现代Vue应用选择器
        '[data-node-type*="comment"]',
        '[data-testid*="comment"]',
        '[class*="comment"]',
        '[id*="comment"]',
        
        // 更通用的选择器
        'div[class*="feed"]', // 微博动态区域
        'div[class*="card"]',  // 卡片式布局
        'div[class*="item"]',  // 条目式布局
        'article',           // HTML5 article标签
        'section[class*="comment"]', // 评论区域
      ];
      
      let comments = [];
      
      for (const selector of commentSelectors) {
        try {
          const elementsResult = await this.testSystem.executeAtomicOperation('extractElements', { selector });
          console.log(`🔍 选择器 "${selector}" 找到 ${elementsResult.count} 个元素`);
          
          if (elementsResult.count > 0) {
            comments = await this.extractCommentData(selector);
            if (comments.length > 0) {
              console.log(`✅ 使用选择器 "${selector}" 成功提取 ${comments.length} 条评论`);
              break;
            }
          }
        } catch (error) {
          console.log(`⚠️  选择器 "${selector}" 失败: ${error.message}`);
        }
      }
      
      const extractTime = Date.now() - startTime;
      this.results.performance.extraction = extractTime;
      this.results.comments = comments;
      this.results.totalExtracted = comments.length;
      
      console.log(`✅ 评论提取完成，共提取 ${comments.length} 条评论，耗时: ${extractTime}ms`);
      
      // 显示前几条评论作为示例
      if (comments.length > 0) {
        console.log('\n📋 前3条评论示例:');
        comments.slice(0, 3).forEach((comment, index) => {
          console.log(`${index + 1}. ${comment.username}: ${comment.content}`);
          console.log(`   时间: ${comment.time} | 点赞: ${comment.likes}`);
        });
      }
      
      return comments;
    } catch (error) {
      console.error('❌ 评论提取失败:', error.message);
      throw error;
    }
  }

  async extractCommentData(selector) {
    const comments = [];
    
    try {
      // 获取所有评论元素
      const elementsResult = await this.testSystem.executeAtomicOperation('extractElements', { selector });
      
      // 对每个评论元素提取详细信息
      for (let i = 0; i < Math.min(elementsResult.count, 50); i++) {
        try {
          const commentSelector = `${selector}:nth-child(${i + 1})`;
          
          const comment = await this.extractSingleComment(commentSelector);
          if (comment.username !== '未知用户' && comment.content !== '无内容') {
            comments.push(comment);
          }
          
        } catch (error) {
          console.log(`⚠️  第${i + 1}条评论提取失败: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.error('❌ 评论数据提取失败:', error.message);
    }
    
    return comments;
  }

  async extractSingleComment(commentSelector) {
    // 提取用户名
    const usernameSelectors = [
      `${commentSelector} .W_f14`,
      `${commentSelector} .username`,
      `${commentSelector} .name`,
      `${commentSelector} .WB_text a`,
      `${commentSelector} .comment_user`
    ];
    
    let username = '未知用户';
    for (const selector of usernameSelectors) {
      try {
        const result = await this.testSystem.executeAtomicOperation('extractText', { selector });
        if (result && result.trim()) {
          username = result.trim();
          break;
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }
    
    // 提取内容
    const contentSelectors = [
      `${commentSelector} .WB_text`,
      `${commentSelector} .content`,
      `${commentSelector} .text`,
      `${commentSelector} .comment_text`
    ];
    
    let content = '无内容';
    for (const selector of contentSelectors) {
      try {
        const result = await this.testSystem.executeAtomicOperation('extractText', { selector });
        if (result && result.trim()) {
          content = result.trim();
          break;
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }
    
    // 提取时间
    const timeSelectors = [
      `${commentSelector} .W_textb`,
      `${commentSelector} .time`,
      `${commentSelector} .timestamp`,
      `${commentSelector} .comment_time`
    ];
    
    let time = '未知时间';
    for (const selector of timeSelectors) {
      try {
        const result = await this.testSystem.executeAtomicOperation('extractText', { selector });
        if (result && result.trim()) {
          time = result.trim();
          break;
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }
    
    // 提取点赞数
    const likeSelectors = [
      `${commentSelector} .pos_1`,
      `${commentSelector} .like_count`,
      `${commentSelector} .like_num`,
      `${commentSelector} .comment_likes`
    ];
    
    let likes = '0';
    for (const selector of likeSelectors) {
      try {
        const result = await this.testSystem.executeAtomicOperation('extractText', { selector });
        if (result && result.trim()) {
          likes = result.trim();
          break;
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }
    
    // 获取用户链接
    const linkSelectors = [
      `${commentSelector} .W_f14 a`,
      `${commentSelector} .username a`,
      `${commentSelector} .name a`
    ];
    
    let userLink = '';
    for (const selector of linkSelectors) {
      try {
        const result = await this.testSystem.executeAtomicOperation('extractAttribute', { 
          selector, 
          attribute: 'href' 
        });
        if (result) {
          userLink = result;
          break;
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }
    
    return {
      username,
      content,
      time,
      likes,
      userLink
    };
  }

  async runTest() {
    console.log('🎭 微博评论真实提取测试 - 基于BaseTestSystem');
    console.log('='.repeat(60));
    console.log(`🔗 测试URL: ${this.testUrl}`);
    console.log('');
    
    try {
      // 1. 初始化基础测试系统
      await this.initializeTestSystem();
      
      // 2. 访问页面
      console.log('🌐 访问测试页面...');
      await this.testSystem.executeAtomicOperation('navigate', { 
        url: this.testUrl,
        waitUntil: 'domcontentloaded' // 改用更快的等待条件
      });
      
      // 3. 检查登录
      await this.checkLoginRequired();
      
      // 4. 分析页面结构
      await this.analyzePageStructure();
      
      // 5. 提取评论
      const comments = await this.extractComments();
      
      // 5. 保存截图
      await this.testSystem.executeAtomicOperation('screenshot', { 
        filename: `weibo-comments-${Date.now()}.png`,
        fullPage: true
      });
      
      console.log('\n🎉 测试完成！');
      console.log('='.repeat(60));
      console.log(`📊 最终结果:`);
      console.log(`  总评论数: ${this.results.totalExtracted}`);
      console.log(`  提取耗时: ${this.results.performance.extraction || 0}ms`);
      console.log(`  成功状态: ${comments.length > 0 ? '✅ 成功' : '❌ 失败'}`);
      
      return this.results;
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      throw error;
    } finally {
      // 6. 清理资源
      if (this.testSystem) {
        await this.testSystem.cleanup();
      }
    }
  }
}

// 运行测试
async function runWeiboCommentsTest() {
  const test = new WeiboCommentsTest();
  try {
    const results = await test.runTest();
    return results;
  } catch (error) {
    console.error('测试执行失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runWeiboCommentsTest().catch(console.error);
}

module.exports = { WeiboCommentsTest, runWeiboCommentsTest };