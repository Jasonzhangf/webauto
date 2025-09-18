/**
 * 专门分析评论区域的实际结构
 * 滚动到评论区进行详细分析
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../cookie-management-system/src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeCommentsArea() {
  console.log('🔍 专门分析评论区域结构...');
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
    
    await page.waitForTimeout(3000);
    
    // 滚动到评论区
    console.log('📜 滚动到评论区...');
    await page.evaluate(() => {
      // 查找评论相关的元素并滚动到视图中
      const commentElements = document.querySelectorAll('div[class*="comment"], div[class*="reply"], [class*="feed"]');
      if (commentElements.length > 0) {
        commentElements[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    
    await page.waitForTimeout(2000);
    
    // 再次滚动以确保评论区加载
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 500);
      });
      await page.waitForTimeout(1000);
    }
    
    // 详细分析评论区域
    const analysis = await page.evaluate(() => {
      const results = {
        // 1. 页面状态
        pageState: {
          scrollHeight: document.body.scrollHeight,
          currentScroll: window.scrollY,
          viewportHeight: window.innerHeight
        },
        
        // 2. 页面底部元素
        bottomElements: [],
        
        // 3. 所有包含数字的元素
        numberedElements: [],
        
        // 4. 可能的评论区元素
        commentCandidates: [],
        
        // 5. 用户内容元素
        userContentElements: [],
        
        // 6. 交互按钮
        interactiveButtons: [],
        
        // 7. 具体的评论结构
        commentStructures: []
      };
      
      // 1. 获取页面底部元素
      const viewportBottom = window.scrollY + window.innerHeight;
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const distanceFromBottom = viewportBottom - rect.bottom;
        
        // 记录底部附近的元素
        if (distanceFromBottom >= 0 && distanceFromBottom <= 200) {
          const text = element.textContent.trim();
          if (text.length > 0 && text.length < 200) {
            results.bottomElements.push({
              tagName: element.tagName,
              className: element.className,
              text: text,
              distanceFromBottom: distanceFromBottom,
              isVisible: element.offsetParent !== null,
              hasNumbers: /\d+/.test(text),
              outerHTML: element.outerHTML.substring(0, 300)
            });
          }
        }
      });
      
      // 2. 查找所有包含数字的元素
      allElements.forEach(element => {
        const text = element.textContent.trim();
        if (text.match(/\d+/) && text.length < 100) {
          results.numberedElements.push({
            tagName: element.tagName,
            className: element.className,
            text: text,
            isVisible: element.offsetParent !== null,
            numbers: text.match(/\d+/g),
            outerHTML: element.outerHTML.substring(0, 300)
          });
        }
      });
      
      // 3. 查找可能的评论区元素
      const commentSelectors = [
        'div[class*="comment"]',
        'div[class*="reply"]',
        'div[class*="feed"]',
        'div[class*="item"]',
        'div[class*="post"]',
        'div[class*="thread"]',
        'section',
        'article',
        'main'
      ];
      
      commentSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            const hasUsers = element.querySelectorAll('[class*="name"], a[href*="/u/"]').length;
            const hasContent = element.querySelectorAll('[class*="content"], [class*="text"], p, span').length;
            
            if (text.length > 20 && (hasUsers > 0 || hasContent > 0)) {
              results.commentCandidates.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text.substring(0, 150),
                hasUsers: hasUsers > 0,
                hasContent: hasContent > 0,
                userCount: hasUsers,
                contentCount: hasContent,
                children: element.children.length,
                outerHTML: element.outerHTML.substring(0, 600)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 4. 查找用户内容元素
      const userContentSelectors = [
        '[class*="name"]',
        'a[href*="/u/"]',
        '[class*="content"]',
        '[class*="text"]',
        '[class*="wbtext"]',
        'p',
        'span'
      ];
      
      userContentSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.length > 3 && text.length < 100) {
              results.userContentElements.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text,
                isVisible: element.offsetParent !== null,
                parentClass: element.parentElement ? element.parentElement.className : 'N/A',
                outerHTML: element.outerHTML.substring(0, 200)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 5. 查找交互按钮
      const buttonSelectors = [
        'button',
        'a[role="button"]',
        '[class*="button"]',
        '[class*="btn"]',
        'span[role="button"]'
      ];
      
      buttonSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent.trim();
            if (text.length > 0 && text.length < 50) {
              results.interactiveButtons.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text,
                isVisible: element.offsetParent !== null,
                hasNumbers: /\d+/.test(text),
                outerHTML: element.outerHTML.substring(0, 300)
              });
            }
          });
        } catch (error) {
          // 忽略错误
        }
      });
      
      // 6. 分析具体的评论结构
      // 查找包含用户和内容的组合结构
      results.commentCandidates.forEach(candidate => {
        if (candidate.hasUsers && candidate.hasContent) {
          // 创建临时DOM来分析结构
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = candidate.outerHTML;
          
          const users = tempDiv.querySelectorAll('[class*="name"], a[href*="/u/"]');
          const contents = tempDiv.querySelectorAll('[class*="content"], [class*="text"], p, span');
          
          // 分析是否包含嵌套结构
          const nestedElements = tempDiv.querySelectorAll('div, section, article');
          const hasNestedStructure = nestedElements.length > 3;
          
          results.commentStructures.push({
            ...candidate,
            userNames: Array.from(users).map(u => u.textContent.trim()),
            contentTexts: Array.from(contents).map(c => c.textContent.trim().substring(0, 50)),
            hasNestedStructure,
            structureDepth: nestedElements.length,
            elementTypes: Array.from(nestedElements).map(e => e.tagName)
          });
        }
      });
      
      return results;
    });
    
    console.log('📊 评论区域分析结果:');
    console.log(`  页面高度: ${analysis.pageState.scrollHeight}`);
    console.log(`  当前滚动: ${analysis.pageState.currentScroll}`);
    console.log(`  视口高度: ${analysis.pageState.viewportHeight}`);
    console.log(`  底部元素: ${analysis.bottomElements.length}`);
    console.log(`  数字元素: ${analysis.numberedElements.length}`);
    console.log(`  评论候选: ${analysis.commentCandidates.length}`);
    console.log(`  用户内容: ${analysis.userContentElements.length}`);
    console.log(`  交互按钮: ${analysis.interactiveButtons.length}`);
    console.log(`  评论结构: ${analysis.commentStructures.length}`);
    
    console.log('\n🔍 底部元素:');
    analysis.bottomElements.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (距离底部: ${item.distanceFromBottom}px)`);
    });
    
    console.log('\n🔢 数字元素:');
    analysis.numberedElements.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (数字: ${item.numbers})`);
    });
    
    console.log('\n🎯 评论候选:');
    analysis.commentCandidates.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}.${item.className} (用户: ${item.userCount}, 内容: ${item.contentCount})`);
    });
    
    console.log('\n👤 用户内容:');
    analysis.userContentElements.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.parentClass})`);
    });
    
    console.log('\n🔘 交互按钮:');
    analysis.interactiveButtons.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.isVisible ? '可见' : '不可见'})`);
    });
    
    console.log('\n🏗️ 评论结构:');
    analysis.commentStructures.slice(0, 3).forEach((item, index) => {
      console.log(`  ${index + 1}. 嵌套结构: ${item.hasNestedStructure} (深度: ${item.structureDepth})`);
      console.log(`     用户: ${item.userNames.slice(0, 3).join(', ')}`);
      console.log(`     类型: ${item.elementTypes.slice(0, 5).join(', ')}`);
    });
    
    // 保存结果
    const savePath = path.join(__dirname, 'test-results/comments-area-analysis.json');
    const saveDir = path.dirname(savePath);
    if (!existsSync(saveDir)) {
      mkdirSync(saveDir, { recursive: true });
    }
    
    writeFileSync(savePath, JSON.stringify({
      analysis,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`\n💾 结果已保存到: ${savePath}`);
    
    return analysis;
    
  } catch (error) {
    console.error('💥 分析失败:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// 运行分析
analyzeCommentsArea().then((result) => {
  console.log('\n✅ 评论区域分析完成!');
  console.log(`📊 关键发现:`);
  console.log(`  评论候选结构: ${result.commentStructures.length}`);
  console.log(`  有嵌套结构的评论: ${result.commentStructures.filter(s => s.hasNestedStructure).length}`);
  console.log(`  底部元素数量: ${result.bottomElements.length}`);
  console.log(`  数字元素数量: ${result.numberedElements.length}`);
  
  const loadMoreElements = result.bottomElements.filter(e => 
    e.text.includes('加载') || e.text.includes('更多') || e.text.includes('展开')
  );
  
  if (loadMoreElements.length > 0) {
    console.log(`🎯 发现可能的加载更多元素: ${loadMoreElements.length}个`);
    loadMoreElements.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}"`);
    });
  } else {
    console.log('⚠️  未发现明显的加载更多元素');
  }
  
  process.exit(0);
}).catch(error => {
  console.error('💥 分析失败:', error);
  process.exit(1);
});