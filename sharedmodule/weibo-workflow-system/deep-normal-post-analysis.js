/**
 * 深度分析普通帖子的评论结构
 * URL: https://weibo.com/7002084904/Q4q6rv6rH#comment
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../cookie-management-system/src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deepAnalyzeNormalPost() {
  console.log('🔍 深度分析普通帖子评论结构...');
  console.log('🌐 测试URL: https://weibo.com/7002084904/Q4q6rv6rH#comment');
  
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
    
    // 导航到页面
    await page.goto('https://weibo.com/7002084904/Q4q6rv6rH#comment', { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
    
    await page.waitForTimeout(5000);
    
    // 深度分析页面结构
    const analysis = await page.evaluate(() => {
      const results = {
        // 1. 页面基本信息
        pageInfo: {
          url: window.location.href,
          title: document.title,
          height: document.body.scrollHeight,
          commentsSection: null
        },
        
        // 2. 查找所有可能的评论容器
        commentContainers: [],
        
        // 3. 查找评论项
        commentItems: [],
        
        // 4. 查找嵌套评论结构
        nestedStructures: [],
        
        // 5. 查找加载更多按钮
        loadMoreButtons: [],
        
        // 6. 查找可能的回复模式
        replyPatterns: [],
        
        // 7. 查找展开按钮
        expandButtons: []
      };
      
      // 1. 查找评论区域
      const commentsSection = document.querySelector('div[class*="comment"], div[class*="reply"], section[class*="comment"], [class*="comment-list"]');
      if (commentsSection) {
        results.pageInfo.commentsSection = {
          tagName: commentsSection.tagName,
          className: commentsSection.className,
          id: commentsSection.id,
          children: commentsSection.children.length
        };
      }
      
      // 2. 查找所有评论容器
      const containerSelectors = [
        'div[class*="comment"]',
        'div[class*="reply"]', 
        'div[class*="feed"]',
        'div[class*="item"]',
        'div[class*="post"]',
        'div[class*="thread"]',
        '[class*="comment-list"]',
        '[class*="reply-list"]'
      ];
      
      containerSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.length > 10) {
              results.commentContainers.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text.substring(0, 100),
                children: element.children.length,
                hasUsers: element.querySelectorAll('[class*="name"], a[href*="/u/"]').length > 0,
                hasContent: element.querySelectorAll('[class*="content"], [class*="text"], p').length > 0,
                outerHTML: element.outerHTML.substring(0, 500)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 3. 查找评论项
      const commentItemSelectors = [
        'div[class*="item"]',
        'div[class*="comment-item"]',
        'div[class*="feed-item"]',
        'div[class*="post-item"]',
        'li[class*="comment"]',
        'li[class*="reply"]'
      ];
      
      commentItemSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const userElement = element.querySelector('[class*="name"], a[href*="/u/"]');
            const contentElement = element.querySelector('[class*="content"], [class*="text"], p');
            
            if (userElement && contentElement) {
              results.commentItems.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                username: userElement.textContent.trim(),
                content: contentElement.textContent.trim().substring(0, 100),
                hasNested: element.querySelectorAll('div[class*="reply"], div[class*="sub"], div[class*="child"]').length > 0,
                nestedCount: element.querySelectorAll('div[class*="reply"], div[class*="sub"], div[class*="child"]').length,
                outerHTML: element.outerHTML.substring(0, 800)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 4. 查找嵌套结构
      const nestedSelectors = [
        'div[class*="reply"]',
        'div[class*="sub-comment"]',
        'div[class*="child-comment"]',
        'div[class*="nested"]',
        'ul[class*="reply-list"]',
        'div[class*="comment-thread"]'
      ];
      
      nestedSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.length > 5) {
              results.nestedStructures.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text.substring(0, 100),
                hasUsers: element.querySelectorAll('[class*="name"], a[href*="/u/"]').length > 0,
                hasContent: element.querySelectorAll('[class*="content"], [class*="text"], p').length > 0,
                children: element.children.length,
                outerHTML: element.outerHTML.substring(0, 600)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 5. 查找加载更多按钮
      const loadMoreSelectors = [
        'button[class*="more"]',
        'div[class*="more"]',
        'a[class*="more"]',
        'span[class*="more"]',
        '[class*="load-more"]',
        '[class*="click-load"]',
        '[text*="加载更多"]',
        '[text*="查看更多"]',
        '[text*="展开"]'
      ];
      
      loadMoreSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.includes('加载') || text.includes('更多') || text.includes('展开') || text.includes('查看')) {
              results.loadMoreButtons.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text,
                isVisible: element.offsetParent !== null,
                outerHTML: element.outerHTML.substring(0, 400)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 6. 查找回复模式
      const allElements = document.querySelectorAll('*');
      allElements.forEach(element => {
        const text = element.textContent.trim();
        
        // 查找包含回复相关文本的元素
        if (text.match(/回复|条|共|更多|展开|查看|加载/) && text.length < 100) {
          results.replyPatterns.push({
            tagName: element.tagName,
            className: element.className,
            text: text,
            isVisible: element.offsetParent !== null,
            hasNumbers: /\d+/.test(text),
            outerHTML: element.outerHTML.substring(0, 400)
          });
        }
      });
      
      // 7. 查找展开按钮
      const expandSelectors = [
        'span[class*="expand"]',
        'button[class*="expand"]',
        'a[class*="expand"]',
        '[text*="展开"]',
        '[text*="收起"]'
      ];
      
      expandSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.includes('展开') || text.includes('收起')) {
              results.expandButtons.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text,
                isVisible: element.offsetParent !== null,
                outerHTML: element.outerHTML.substring(0, 300)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      return results;
    });
    
    console.log('📊 深度分析结果:');
    console.log(`  页面高度: ${analysis.pageInfo.height}`);
    console.log(`  评论区域: ${analysis.pageInfo.commentsSection ? '找到' : '未找到'}`);
    console.log(`  评论容器: ${analysis.commentContainers.length}`);
    console.log(`  评论项: ${analysis.commentItems.length}`);
    console.log(`  嵌套结构: ${analysis.nestedStructures.length}`);
    console.log(`  加载更多按钮: ${analysis.loadMoreButtons.length}`);
    console.log(`  回复模式: ${analysis.replyPatterns.length}`);
    console.log(`  展开按钮: ${analysis.expandButtons.length}`);
    
    console.log('\n🔍 前5个评论容器:');
    analysis.commentContainers.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}.${item.className} (用户: ${item.hasUsers}, 内容: ${item.hasContent})`);
    });
    
    console.log('\n📝 前5个评论项:');
    analysis.commentItems.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.username}: ${item.content.substring(0, 50)}... (嵌套: ${item.hasNested}, 数量: ${item.nestedCount})`);
    });
    
    console.log('\n🏗️ 前5个嵌套结构:');
    analysis.nestedStructures.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}.${item.className} (用户: ${item.hasUsers}, 内容: ${item.hasContent})`);
    });
    
    console.log('\n🔄 加载更多按钮:');
    analysis.loadMoreButtons.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.isVisible ? '可见' : '不可见'})`);
    });
    
    console.log('\n📋 回复模式:');
    analysis.replyPatterns.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.isVisible ? '可见' : '不可见'})`);
    });
    
    console.log('\n🔺 展开按钮:');
    analysis.expandButtons.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.isVisible ? '可见' : '不可见'})`);
    });
    
    // 保存详细结果
    const savePath = path.join(__dirname, 'test-results/deep-normal-post-analysis.json');
    const saveDir = path.dirname(savePath);
    if (!existsSync(saveDir)) {
      mkdirSync(saveDir, { recursive: true });
    }
    
    writeFileSync(savePath, JSON.stringify({
      analysis,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`\n💾 详细结果已保存到: ${savePath}`);
    
    return analysis;
    
  } catch (error) {
    console.error('💥 分析失败:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// 运行分析
deepAnalyzeNormalPost().then((result) => {
  console.log('\n✅ 普通帖子深度分析完成!');
  console.log(`📊 发现的潜在问题:`);
  console.log(`  评论项数量: ${result.commentItems.length}`);
  console.log(`  嵌套结构数量: ${result.nestedStructures.length}`);
  console.log(`  加载更多按钮: ${result.loadMoreButtons.length}`);
  console.log(`  展开按钮: ${result.expandButtons.length}`);
  
  if (result.commentItems.length > 0 && result.nestedStructures.length === 0) {
    console.log('⚠️  找到了评论项但未找到嵌套结构，可能需要不同的嵌套选择器');
  }
  
  if (result.loadMoreButtons.length === 0) {
    console.log('⚠️  未找到加载更多按钮，可能需要不同的选择器或滚动后才会出现');
  }
  
  process.exit(0);
}).catch(error => {
  console.error('💥 分析失败:', error);
  process.exit(1);
});