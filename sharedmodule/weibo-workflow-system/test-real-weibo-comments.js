const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class RealWeiboCommentsTest {
  constructor() {
    this.testUrl = 'https://weibo.com/2656274875/Q4qEJBc6z#comment';
    this.configPath = path.join(__dirname, 'src/operations/websites/weibo/post-comments-extraction.json');
    this.browser = null;
    this.page = null;
    this.results = {
      url: this.testUrl,
      comments: [],
      totalExtracted: 0,
      errors: [],
      performance: {}
    };
  }

  async initBrowser() {
    console.log('🚀 启动浏览器...');
    this.browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // 设置视窗大小
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    
    console.log('✅ 浏览器启动成功');
  }

  async navigateToPage() {
    console.log(`🌐 访问页面: ${this.testUrl}`);
    const startTime = Date.now();
    
    try {
      await this.page.goto(this.testUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      const loadTime = Date.now() - startTime;
      this.results.performance.pageLoad = loadTime;
      console.log(`✅ 页面加载完成，耗时: ${loadTime}ms`);
      
      // 等待页面稳定
      await this.page.waitForTimeout(3000);
      
      // 获取页面标题
      const title = await this.page.title();
      console.log(`📄 页面标题: ${title}`);
      
      return true;
    } catch (error) {
      console.error('❌ 页面访问失败:', error.message);
      this.results.errors.push(`页面访问失败: ${error.message}`);
      return false;
    }
  }

  async checkLoginRequired() {
    console.log('🔍 检查是否需要登录...');
    
    try {
      // 检查登录相关元素
      const loginSelectors = [
        '.login_btn',
        '.W_login_form',
        '[node-type="loginForm"]',
        '.passport_login',
        '.gn_login'
      ];
      
      for (const selector of loginSelectors) {
        const loginElement = await this.page.$(selector);
        if (loginElement) {
          console.log(`⚠️  检测到登录元素: ${selector}`);
          console.log('⏳ 等待30秒手动登录...');
          
          // 等待用户手动登录
          await this.page.waitForTimeout(30000);
          
          // 检查是否登录成功
          const title = await this.page.title();
          if (title.includes('登录') || title.includes('Login')) {
            console.log('❌ 登录失败');
            return false;
          }
          
          console.log('✅ 登录成功');
          return true;
        }
      }
      
      console.log('✅ 无需登录');
      return true;
    } catch (error) {
      console.error('登录检查失败:', error.message);
      return false;
    }
  }

  async extractComments() {
    console.log('🔥 开始提取评论...');
    const startTime = Date.now();
    
    try {
      // 滚动到底部触发更多评论加载
      await this.loadMoreComments();
      
      // 提取评论数据
      const comments = await this.extractCommentData();
      
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
      this.results.errors.push(`评论提取失败: ${error.message}`);
      return [];
    }
  }

  async loadMoreComments() {
    console.log('📜 加载更多评论...');
    let loadAttempts = 0;
    const maxAttempts = 10;
    
    while (loadAttempts < maxAttempts) {
      try {
        // 查找"加载更多"按钮
        const moreButtonSelectors = [
          '.WB_comment_more a',
          '.comment_more',
          '.expand_comments',
          '.load_more',
          '[node-type="comment_more"]',
          '.more_text'
        ];
        
        let buttonFound = false;
        
        for (const selector of moreButtonSelectors) {
          const button = await this.page.$(selector);
          if (button) {
            console.log(`🔘 找到加载更多按钮: ${selector}`);
            await button.click();
            buttonFound = true;
            
            // 等待新评论加载
            await this.page.waitForTimeout(2000);
            break;
          }
        }
        
        if (!buttonFound) {
          console.log('📄 没有找到更多加载按钮，尝试滚动...');
          
          // 滚动到底部
          await this.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          
          await this.page.waitForTimeout(2000);
          
          // 检查是否有新内容加载
          const newHeight = await this.page.evaluate(() => document.body.scrollHeight);
          const currentHeight = await this.page.evaluate(() => window.scrollY + window.innerHeight);
          
          if (currentHeight >= newHeight - 100) {
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

  async extractCommentData() {
    console.log('📊 提取评论数据...');
    
    try {
      // 尝试多种评论选择器
      const commentSelectors = [
        '.WB_comment_wrap',
        '.comment_item', 
        '.comment_list_item',
        '.WB_comment',
        '[node-type="comment_list"] .comment_item'
      ];
      
      let comments = [];
      
      for (const selector of commentSelectors) {
        try {
          const commentElements = await this.page.$$(selector);
          console.log(`🔍 选择器 "${selector}" 找到 ${commentElements.length} 个元素`);
          
          if (commentElements.length > 0) {
            comments = await this.extractFromElements(commentElements);
            if (comments.length > 0) {
              console.log(`✅ 使用选择器 "${selector}" 成功提取 ${comments.length} 条评论`);
              break;
            }
          }
        } catch (error) {
          console.log(`⚠️  选择器 "${selector}" 失败: ${error.message}`);
        }
      }
      
      return comments;
    } catch (error) {
      console.error('❌ 评论数据提取失败:', error.message);
      return [];
    }
  }

  async extractFromElements(commentElements) {
    const comments = [];
    
    for (const element of commentElements) {
      try {
        const comment = await element.evaluate((el) => {
          // 尝试多种用户名选择器
          const usernameSelectors = [
            '.W_f14',
            '.username', 
            '.name',
            '.WB_text a',
            '.comment_user'
          ];
          
          let username = '';
          for (const selector of usernameSelectors) {
            const userElement = el.querySelector(selector);
            if (userElement) {
              username = userElement.textContent?.trim() || '';
              if (username) break;
            }
          }
          
          // 尝试多种内容选择器
          const contentSelectors = [
            '.WB_text',
            '.content',
            '.text',
            '.comment_text'
          ];
          
          let content = '';
          for (const selector of contentSelectors) {
            const contentElement = el.querySelector(selector);
            if (contentElement) {
              content = contentElement.textContent?.trim() || '';
              if (content) break;
            }
          }
          
          // 尝试多种时间选择器
          const timeSelectors = [
            '.W_textb',
            '.time',
            '.timestamp',
            '.comment_time'
          ];
          
          let time = '';
          for (const selector of timeSelectors) {
            const timeElement = el.querySelector(selector);
            if (timeElement) {
              time = timeElement.textContent?.trim() || '';
              if (time) break;
            }
          }
          
          // 尝试多种点赞选择器
          const likeSelectors = [
            '.pos_1',
            '.like_count',
            '.like_num',
            '.comment_likes'
          ];
          
          let likes = '';
          for (const selector of likeSelectors) {
            const likeElement = el.querySelector(selector);
            if (likeElement) {
              likes = likeElement.textContent?.trim() || '';
              if (likes) break;
            }
          }
          
          // 获取用户链接
          const linkSelectors = [
            '.W_f14 a',
            '.username a',
            '.name a'
          ];
          
          let userLink = '';
          for (const selector of linkSelectors) {
            const linkElement = el.querySelector(selector);
            if (linkElement) {
              userLink = linkElement.href || '';
              if (userLink) break;
            }
          }
          
          return {
            username: username || '未知用户',
            content: content || '无内容',
            time: time || '未知时间',
            likes: likes || '0',
            userLink: userLink || ''
          };
        });
        
        // 过滤掉无效评论
        if (comment.username !== '未知用户' && comment.content !== '无内容') {
          comments.push(comment);
        }
        
      } catch (error) {
        console.log('⚠️  单条评论提取失败:', error.message);
      }
    }
    
    return comments;
  }

  async saveResults() {
    console.log('💾 保存结果...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `weibo-comments-real-test-${timestamp}.json`;
    const filepath = path.join(__dirname, filename);
    
    try {
      await fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2), 'utf8');
      console.log(`✅ 结果已保存: ${filepath}`);
      
      // 生成简单报告
      const report = {
        testTime: new Date().toISOString(),
        testUrl: this.testUrl,
        totalComments: this.results.totalExtracted,
        performance: this.results.performance,
        errors: this.results.errors.length,
        success: this.results.errors.length === 0
      };
      
      const reportFile = path.join(__dirname, `weibo-comments-report-${timestamp}.json`);
      await fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
      console.log(`📊 报告已保存: ${reportFile}`);
      
    } catch (error) {
      console.error('❌ 保存结果失败:', error.message);
    }
  }

  async cleanup() {
    console.log('🧹 清理资源...');
    
    if (this.page) {
      await this.page.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    console.log('✅ 清理完成');
  }

  async runTest() {
    console.log('🎭 微博评论真实提取测试');
    console.log('='.repeat(60));
    console.log(`🔗 测试URL: ${this.testUrl}`);
    console.log('');
    
    try {
      // 1. 初始化浏览器
      await this.initBrowser();
      
      // 2. 访问页面
      const navigationSuccess = await this.navigateToPage();
      if (!navigationSuccess) {
        throw new Error('页面访问失败');
      }
      
      // 3. 检查登录
      const loginSuccess = await this.checkLoginRequired();
      if (!loginSuccess) {
        throw new Error('登录失败');
      }
      
      // 4. 提取评论
      const comments = await this.extractComments();
      
      // 5. 保存结果
      await this.saveResults();
      
      // 6. 显示最终结果
      console.log('\n🎉 测试完成！');
      console.log('='.repeat(60));
      console.log(`📊 最终结果:`);
      console.log(`  总评论数: ${this.results.totalExtracted}`);
      console.log(`  页面加载: ${this.results.performance.pageLoad || 0}ms`);
      console.log(`  评论提取: ${this.results.performance.extraction || 0}ms`);
      console.log(`  错误数量: ${this.results.errors.length}`);
      console.log(`  成功状态: ${this.results.errors.length === 0 ? '✅ 成功' : '❌ 失败'}`);
      
      if (this.results.errors.length > 0) {
        console.log('\n❌ 错误详情:');
        this.results.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
        });
      }
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      this.results.errors.push(`测试失败: ${error.message}`);
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
const test = new RealWeiboCommentsTest();
test.runTest().catch(console.error);