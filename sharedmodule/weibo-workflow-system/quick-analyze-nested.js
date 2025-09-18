/**
 * 快速分析热门话题页面的嵌套评论结构
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../cookie-management-system/src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function quickAnalyzeNestedComments() {
  console.log('🔍 快速分析热门话题页面嵌套评论结构...');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // 加载Cookie
    const cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, 'test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await cookieSystem.initialize();
    
    const cookiePath = path.join(__dirname, 'cookies/weibo-cookies-updated.json');
    const cookieData = readFileSync(cookiePath, 'utf8');
    const cookies = JSON.parse(cookieData);
    
    await cookieSystem.manager.storage.storeCookies('weibo.com', cookies);
    await cookieSystem.loadCookies(page, 'weibo.com');
    
    // 导航到页面并快速滚动
    await page.goto('https://weibo.com/hot/weibo/102803', { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
    
    await page.waitForTimeout(2000);
    
    // 快速滚动几次
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1000);
    }
    
    // 分析页面结构
    const analysis = await page.evaluate(() => {
      const results = {
        replyElements: [],
        nestedPatterns: [],
        totalCommentElements: 0
      };
      
      // 查找所有包含"回复"、"条"等关键词的元素
      const allElements = document.querySelectorAll('*');
      
      for (const element of allElements) {
        const text = (element.textContent || '').trim();
        
        // 查找回复相关的文本
        if (text.includes('回复') || text.includes('条') || text.includes('共')) {
          results.replyElements.push({
            text: text,
            tagName: element.tagName,
            className: element.className,
            isVisible: element.offsetParent !== null
          });
        }
        
        // 查找可能的嵌套模式
        if (text.match(/\d+\s*条\s*回复/) || text.match(/共\s*\d+\s*条/)) {
          results.nestedPatterns.push({
            text: text,
            tagName: element.tagName,
            className: element.className,
            isVisible: element.offsetParent !== null
          });
        }
      }
      
      // 统计评论相关元素
      const commentSelectors = [
        'div[class*="comment"]',
        'div[class*="item"]',
        'div[class*="feed"]'
      ];
      
      commentSelectors.forEach(selector => {
        results.totalCommentElements += document.querySelectorAll(selector).length;
      });
      
      return results;
    });
    
    console.log('📊 快速分析结果:');
    console.log(`  评论相关元素总数: ${analysis.totalCommentElements}`);
    console.log(`  回复相关元素: ${analysis.replyElements.length}`);
    console.log(`  嵌套模式元素: ${analysis.nestedPatterns.length}`);
    
    console.log('\n🔍 发现的嵌套模式:');
    analysis.nestedPatterns.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.isVisible ? '可见' : '不可见'})`);
    });
    
    // 尝试查找具体的嵌套评论结构
    const nestedComments = await page.evaluate(() => {
      const comments = [];
      
      // 查找包含数字+回复的元素
      const replyElements = document.querySelectorAll('*');
      
      replyElements.forEach(element => {
        const text = element.textContent || '';
        
        if (text.match(/\d+\s*条\s*回复/)) {
          // 向上查找父级结构
          let parent = element;
          let depth = 0;
          
          while (parent && depth < 8) {
            // 检查是否包含用户信息和内容
            const userElements = parent.querySelectorAll('a[href*="/u/"], [class*="name"], [class*="user"]');
            const contentElements = parent.querySelectorAll('[class*="content"], [class*="text"], p, span');
            
            if (userElements.length > 0 && contentElements.length > 0) {
              // 找到可能的评论结构
              const userNames = Array.from(userElements).map(el => el.textContent.trim()).filter(text => text.length > 0);
              const contents = Array.from(contentElements).map(el => el.textContent.trim()).filter(text => text.length > 10);
              
              if (userNames.length > 0 && contents.length > 0) {
                comments.push({
                  replyInfo: text.trim(),
                  userNames: userNames.slice(0, 3), // 最多取3个用户名
                  contents: contents.slice(0, 3), // 最多取3段内容
                  elementClass: parent.className
                });
                break;
              }
            }
            
            parent = parent.parentElement;
            depth++;
          }
        }
      });
      
      return comments;
    });
    
    console.log(`\n📝 找到 ${nestedComments.length} 个可能的嵌套评论结构:`);
    nestedComments.forEach((comment, index) => {
      console.log(`\n  ${index + 1}. 回复信息: "${comment.replyInfo}"`);
      console.log(`     元素类: ${comment.elementClass}`);
      console.log(`     用户名: ${comment.userNames.join(', ')}`);
      console.log(`     内容片段: ${comment.contents.slice(0, 2).join(' | ')}`);
    });
    
    // 保存结果
    const result = {
      analysis,
      nestedComments,
      timestamp: new Date().toISOString()
    };
    
    const savePath = path.join(__dirname, 'test-results/quick-nested-analysis.json');
    const saveDir = path.dirname(savePath);
    if (!existsSync(saveDir)) {
      mkdirSync(saveDir, { recursive: true });
    }
    
    writeFileSync(savePath, JSON.stringify(result, null, 2));
    console.log(`\n💾 详细结果已保存到: ${savePath}`);
    
    return {
      totalCommentElements: analysis.totalCommentElements,
      replyElements: analysis.replyElements.length,
      nestedPatterns: analysis.nestedPatterns.length,
      nestedCommentsFound: nestedComments.length
    };
    
  } catch (error) {
    console.error('💥 分析失败:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// 运行分析
quickAnalyzeNestedComments().then((result) => {
  console.log('\n✅ 快速嵌套评论分析完成!');
  console.log(`📊 结果摘要:`);
  console.log(`  评论元素总数: ${result.totalCommentElements}`);
  console.log(`  回复相关元素: ${result.replyElements}`);
  console.log(`  嵌套模式: ${result.nestedPatterns}`);
  console.log(`  嵌套评论: ${result.nestedCommentsFound}`);
  process.exit(0);
}).catch(error => {
  console.error('💥 分析失败:', error);
  process.exit(1);
});