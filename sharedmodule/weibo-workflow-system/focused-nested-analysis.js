/**
 * 专门分析热门话题页面的嵌套评论结构
 * 排除样式和脚本标签，专注于实际内容
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../cookie-management-system/src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function focusedNestedAnalysis() {
  console.log('🔍 专门分析热门话题页面嵌套评论结构...');
  
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
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1500);
    }
    
    // 专门分析页面内容，排除样式和脚本
    const analysis = await page.evaluate(() => {
      const results = {
        contentElements: [],
        replyPatterns: [],
        nestedStructures: [],
        commentContainers: [],
        actualComments: []
      };
      
      // 1. 只分析内容相关的元素，排除样式和脚本
      const contentSelectors = [
        'div[class*="item"]',
        'div[class*="comment"]', 
        'div[class*="feed"]',
        'div[class*="content"]',
        'div[class*="text"]',
        'article',
        'section',
        'main',
        '[role="main"]'
      ];
      
      // 查找所有内容元素
      contentSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            // 排除样式和脚本标签
            if (element.tagName === 'STYLE' || element.tagName === 'SCRIPT') {
              return;
            }
            
            const text = (element.textContent || '').trim();
            if (text.length > 5) { // 只考虑有实际内容的元素
              results.contentElements.push({
                selector: selector,
                tagName: element.tagName,
                className: element.className,
                text: text.substring(0, 200),
                isVisible: element.offsetParent !== null,
                hasReplyText: text.includes('回复') || text.includes('条') || text.includes('共'),
                hasNumbers: /\d+/.test(text)
              });
            }
          });
        } catch (error) {
          // 忽略无效选择器
        }
      });
      
      // 2. 专门查找包含回复模式的元素
      const allElements = document.querySelectorAll('*');
      allElements.forEach(element => {
        // 排除样式和脚本标签
        if (element.tagName === 'STYLE' || element.tagName === 'SCRIPT') {
          return;
        }
        
        const text = (element.textContent || '').trim();
        
        // 查找回复相关模式
        if (text.includes('回复') || text.includes('条') || text.includes('共')) {
          results.replyPatterns.push({
            text: text,
            tagName: element.tagName,
            className: element.className,
            isVisible: element.offsetParent !== null,
            hasNumbers: /\d+/.test(text),
            outerHTML: element.outerHTML.substring(0, 300)
          });
        }
        
        // 查找"共x条回复"模式
        if (text.match(/共\s*\d+\s*条\s*回复/)) {
          results.nestedStructures.push({
            text: text,
            tagName: element.tagName,
            className: element.className,
            isVisible: element.offsetParent !== null,
            element: element
          });
        }
      });
      
      // 3. 查找可能的评论容器
      const containerSelectors = [
        'div[class*="comment"]',
        'div[class*="reply"]',
        'div[class*="feed"]',
        '[class*="interaction"]',
        '[class*="discussion"]'
      ];
      
      containerSelectors.forEach(selector => {
        try {
          const containers = document.querySelectorAll(selector);
          containers.forEach(container => {
            // 检查这个容器是否包含多个用户元素
            const userElements = container.querySelectorAll('[class*="name"], a[href*="/u/"], [class*="user"]');
            const contentElements = container.querySelectorAll('[class*="content"], [class*="text"], p');
            
            if (userElements.length > 1 && contentElements.length > 0) {
              results.commentContainers.push({
                selector: selector,
                tagName: container.tagName,
                className: container.className,
                userCount: userElements.length,
                contentCount: contentElements.length,
                isVisible: container.offsetParent !== null,
                outerHTML: container.outerHTML.substring(0, 500)
              });
            }
          });
        } catch (error) {
          // 忽略无效选择器
        }
      });
      
      // 4. 提取实际的评论内容
      results.actualComments = [];
      const commentElements = document.querySelectorAll('div[class*="item"], div[class*="comment-item"], div[class*="feed-item"]');
      
      commentElements.forEach((element, index) => {
        try {
          const usernameElement = element.querySelector('[class*="name"], a[href*="/u/"]');
          const contentElement = element.querySelector('[class*="content"], [class*="text"], p');
          const timeElement = element.querySelector('[class*="time"], [class*="date"]');
          
          if (usernameElement && contentElement) {
            const username = usernameElement.textContent.trim();
            const content = contentElement.textContent.trim();
            const time = timeElement ? timeElement.textContent.trim() : '未知时间';
            
            // 检查是否有嵌套评论
            const nestedElements = element.querySelectorAll('div[class*="reply"], div[class*="sub"], div[class*="child"]');
            const replyText = element.textContent.match(/共\s*(\d+)\s*条\s*回复/);
            
            results.actualComments.push({
              id: index,
              username,
              content: content.substring(0, 100),
              time,
              hasNested: nestedElements.length > 0,
              nestedCount: nestedElements.length,
              replyText: replyText ? replyText[0] : null,
              elementClass: element.className
            });
          }
        } catch (error) {
          console.warn(`评论提取错误 (${index}):`, error.message);
        }
      });
      
      return results;
    });
    
    console.log('📊 专项分析结果:');
    console.log(`  内容元素: ${analysis.contentElements.length}`);
    console.log(`  回复模式: ${analysis.replyPatterns.length}`);
    console.log(`  嵌套结构: ${analysis.nestedStructures.length}`);
    console.log(`  评论容器: ${analysis.commentContainers.length}`);
    console.log(`  实际评论: ${analysis.actualComments.length}`);
    
    console.log('\n🔍 发现的回复模式:');
    analysis.replyPatterns.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.isVisible ? '可见' : '不可见'})`);
    });
    
    console.log('\n📋 嵌套结构:');
    analysis.nestedStructures.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.tagName}: "${item.text}" (${item.isVisible ? '可见' : '不可见'})`);
    });
    
    console.log('\n💬 评论统计:');
    const commentsWithNested = analysis.actualComments.filter(c => c.hasNested).length;
    const commentsWithReplyText = analysis.actualComments.filter(c => c.replyText).length;
    console.log(`  有嵌套元素的评论: ${commentsWithNested}`);
    console.log(`  有回复文本的评论: ${commentsWithReplyText}`);
    
    // 显示前5个评论详情
    console.log('\n📝 前5个评论详情:');
    analysis.actualComments.slice(0, 5).forEach((comment, index) => {
      console.log(`  ${index + 1}. ${comment.username}: ${comment.content.substring(0, 50)}...`);
      console.log(`     嵌套: ${comment.hasNested} (${comment.nestedCount}个元素)`);
      console.log(`     回复文本: ${comment.replyText || '无'}`);
    });
    
    // 保存详细结果
    const savePath = path.join(__dirname, 'test-results/focused-nested-analysis.json');
    const saveDir = path.dirname(savePath);
    if (!existsSync(saveDir)) {
      mkdirSync(saveDir, { recursive: true });
    }
    
    writeFileSync(savePath, JSON.stringify({
      analysis,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`\n💾 详细结果已保存到: ${savePath}`);
    
    return {
      totalContentElements: analysis.contentElements.length,
      replyPatterns: analysis.replyPatterns.length,
      nestedStructures: analysis.nestedStructures.length,
      actualComments: analysis.actualComments.length,
      commentsWithNested,
      commentsWithReplyText
    };
    
  } catch (error) {
    console.error('💥 分析失败:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// 运行分析
focusedNestedAnalysis().then((result) => {
  console.log('\n✅ 专项嵌套评论分析完成!');
  console.log(`📊 结果摘要:`);
  console.log(`  内容元素: ${result.totalContentElements}`);
  console.log(`  回复模式: ${result.replyPatterns}`);
  console.log(`  嵌套结构: ${result.nestedStructures}`);
  console.log(`  实际评论: ${result.actualComments}`);
  console.log(`  有嵌套的评论: ${result.commentsWithNested}`);
  console.log(`  有回复文本的评论: ${result.commentsWithReplyText}`);
  process.exit(0);
}).catch(error => {
  console.error('💥 分析失败:', error);
  process.exit(1);
});