/**
 * 专门分析热门话题页面的嵌套评论结构
 * 深度分析实际嵌套模式
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../cookie-management-system/src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deepNestedAnalysis() {
  console.log('🔍 深度分析热门话题页面嵌套评论结构...');
  
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
    await page.goto('https://weibo.com/hot/weibo/102803', { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
    
    await page.waitForTimeout(2000);
    
    // 充分滚动加载内容
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1500);
    }
    
    // 深度分析页面结构，寻找所有可能的嵌套评论模式
    const analysis = await page.evaluate(() => {
      const results = {
        // 1. 查找所有可能的评论容器
        commentContainers: [],
        
        // 2. 查找包含用户名的元素
        userElements: [],
        
        // 3. 查找包含内容的元素
        contentElements: [],
        
        // 4. 查找可能的嵌套结构
        nestedCandidates: [],
        
        // 5. 查找具体的嵌套评论模式
        nestedComments: [],
        
        // 6. 查找交互元素
        interactionElements: []
      };
      
      // 1. 查找所有可能的评论容器
      const containerSelectors = [
        'div[class*="item"]',
        'div[class*="comment"]', 
        'div[class*="feed"]',
        'div[class*="post"]',
        'div[class*="thread"]',
        'div[class*="conversation"]',
        'div[class*="discussion"]',
        '[class*="scroller"]',
        '[class*="vue-recycle"]',
        'div[class*="wbpro"]',
        'div[class*="woo-box"]'
      ];
      
      containerSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            // 检查是否包含用户名和内容
            const hasUser = element.querySelector('[class*="name"], a[href*="/u/"], [class*="user"], [class*="author"]');
            const hasContent = element.querySelector('[class*="content"], [class*="text"], p, span, [class*="wbtext"]');
            const hasNumbers = element.textContent.match(/\d+/);
            
            if (hasUser || hasContent || hasNumbers) {
              results.commentContainers.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: element.textContent.substring(0, 200),
                hasUser: !!hasUser,
                hasContent: !!hasContent,
                hasNumbers: !!hasNumbers,
                isVisible: element.offsetParent !== null,
                children: element.children.length,
                outerHTML: element.outerHTML.substring(0, 1000)
              });
            }
          });
        } catch (error) {
          console.log(`Error with selector ${selector}:`, error.message);
        }
      });
      
      // 2. 查找用户名元素
      const userSelectors = [
        '[class*="name"]',
        'a[href*="/u/"]',
        '[class*="user"]',
        '[class*="author"]',
        '[class*="nickname"]',
        '[class*="username"]'
      ];
      
      userSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.length > 0 && text.length < 100) {
              results.userElements.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text,
                isVisible: element.offsetParent !== null,
                parentClass: element.parentElement ? element.parentElement.className : 'N/A',
                outerHTML: element.outerHTML.substring(0, 300)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 3. 查找内容元素
      const contentSelectors = [
        '[class*="content"]',
        '[class*="text"]',
        '[class*="wbtext"]',
        'p',
        'span:not([class*="button"]):not([class*="icon"])',
        '[class*="detail"]'
      ];
      
      contentSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.length > 5 && text.length < 500) {
              results.contentElements.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text,
                isVisible: element.offsetParent !== null,
                parentClass: element.parentElement ? element.parentElement.className : 'N/A',
                hasEmojis: text.includes('🥯') || text.includes('😊') || text.includes('👍'),
                hasHashtags: text.includes('#'),
                hasMentions: text.includes('@'),
                outerHTML: element.outerHTML.substring(0, 300)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 4. 查找可能的嵌套结构 - 查找包含多个用户的容器
      results.commentContainers.forEach(container => {
        if (container.hasUser && container.children > 2) {
          // 检查是否包含多个用户元素
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = container.outerHTML;
          const usersInContainer = tempDiv.querySelectorAll('[class*="name"], a[href*="/u/"], [class*="user"]');
          
          if (usersInContainer.length > 1) {
            results.nestedCandidates.push({
              ...container,
              userCount: usersInContainer.length,
              users: Array.from(usersInContainer).map(u => u.textContent.trim())
            });
          }
        }
      });
      
      // 5. 查找具体的嵌套评论模式
      // 查找包含回复相关文本的元素
      const allElements = document.querySelectorAll('*');
      allElements.forEach(element => {
        const text = element.textContent.trim();
        
        // 查找各种可能的嵌套评论指示文本
        const nestedPatterns = [
          /回复/i,
          /条/i,
          /共/i,
          /更多/i,
          /展开/i,
          /查看/i,
          /加载/i,
          /回复\s*\d+/i,
          /\d+\s*条/i,
          /共\s*\d+\s*条/i
        ];
        
        const hasNestedPattern = nestedPatterns.some(pattern => pattern.test(text));
        
        if (hasNestedPattern && text.length < 100) {
          results.interactionElements.push({
            tagName: element.tagName,
            className: element.className,
            text: text,
            isVisible: element.offsetParent !== null,
            patterns: nestedPatterns.filter(p => p.test(text)).map(p => p.toString()),
            parentClass: element.parentElement ? element.parentElement.className : 'N/A',
            outerHTML: element.outerHTML.substring(0, 500)
          });
        }
      });
      
      // 6. 分析可能的嵌套评论结构
      // 查找可能包含嵌套评论的特定结构
      const nestedStructures = document.querySelectorAll('div[class*="reply"], div[class*="sub"], div[class*="child"], div[class*="nested"], div[class*="thread"]');
      nestedStructures.forEach(element => {
        const text = element.textContent.trim();
        if (text.length > 0) {
          results.nestedComments.push({
            tagName: element.tagName,
            className: element.className,
            text: text,
            isVisible: element.offsetParent !== null,
            hasUser: element.querySelector('[class*="name"], a[href*="/u/"], [class*="user"]') !== null,
            hasContent: element.querySelector('[class*="content"], [class*="text"], p, span') !== null,
            children: element.children.length,
            outerHTML: element.outerHTML.substring(0, 800)
          });
        }
      });
      
      return results;
    });
    
    console.log('📊 深度分析结果:');
    console.log(`  评论容器: ${analysis.commentContainers.length}`);
    console.log(`  用户元素: ${analysis.userElements.length}`);
    console.log(`  内容元素: ${analysis.contentElements.length}`);
    console.log(`  嵌套候选: ${analysis.nestedCandidates.length}`);
    console.log(`  嵌套评论: ${analysis.nestedComments.length}`);
    console.log(`  交互元素: ${analysis.interactionElements.length}`);
    
    console.log('\n🔍 前10个用户元素:');
    analysis.userElements.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.text} (${item.className})`);
    });
    
    console.log('\n📋 前10个内容元素:');
    analysis.contentElements.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.text.substring(0, 50)}... (${item.className})`);
    });
    
    console.log('\n🔄 前10个交互元素:');
    analysis.interactionElements.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.text} (${item.patterns.join(', ')})`);
    });
    
    console.log('\n🏗️ 前5个嵌套候选:');
    analysis.nestedCandidates.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. 用户数: ${item.userCount}, 用户: ${item.users.slice(0, 3).join(', ')}`);
    });
    
    console.log('\n💬 嵌套评论结构:');
    analysis.nestedComments.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: ${item.hasUser ? '有用户' : '无用户'}, ${item.hasContent ? '有内容' : '无内容'} (${item.className})`);
    });
    
    // 保存详细结果
    const savePath = path.join(__dirname, 'test-results/deep-nested-analysis.json');
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
deepNestedAnalysis().then((result) => {
  console.log('\n✅ 深度嵌套评论分析完成!');
  console.log(`📊 结果摘要:`);
  console.log(`  评论容器: ${result.commentContainers.length}`);
  console.log(`  用户元素: ${result.userElements.length}`);
  console.log(`  内容元素: ${result.contentElements.length}`);
  console.log(`  嵌套候选: ${result.nestedCandidates.length}`);
  console.log(`  嵌套评论: ${result.nestedComments.length}`);
  console.log(`  交互元素: ${result.interactionElements.length}`);
  process.exit(0);
}).catch(error => {
  console.error('💥 分析失败:', error);
  process.exit(1);
});