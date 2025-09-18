/**
 * 微博评论到底检查 - headless模式带截屏
 */

import { chromium } from 'playwright';
import { WebAutoCookieManagementSystem } from '../cookie-management-system/src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkCommentBottomWithScreenshots() {
  console.log('🔍 检查微博评论到底状态（headless模式）...');
  
  const browser = await chromium.launch({ 
    headless: true, // 使用headless模式
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // 1. 初始化Cookie系统
    console.log('\n🍪 初始化Cookie系统...');
    const cookieSystem = new WebAutoCookieManagementSystem({
      storagePath: path.join(__dirname, 'test-cookies'),
      encryptionEnabled: false,
      autoRefresh: false,
      validationEnabled: true
    });
    
    await cookieSystem.initialize();
    
    // 2. 加载Cookie
    console.log('📖 加载Weibo Cookie...');
    const cookiePath = path.join(__dirname, 'cookies/weibo-cookies-updated.json');
    const fs = await import('fs');
    const cookieData = fs.readFileSync(cookiePath, 'utf8');
    const cookies = JSON.parse(cookieData);
    
    await cookieSystem.manager.storage.storeCookies('weibo.com', cookies);
    await cookieSystem.loadCookies(page, 'weibo.com');
    
    // 3. 验证Cookie健康状态
    console.log('🔍 验证Cookie健康状态...');
    const health = await cookieSystem.validateCookieHealth('weibo.com');
    console.log(`Cookie健康状态: ${health.isValid ? '✅ 健康' : '❌ 不健康'}`);
    
    if (!health.isValid) {
      throw new Error('Cookie验证失败，无法继续测试');
    }
    
    // 4. 导航到测试页面
    const testUrl = 'https://weibo.com/2656274875/Q4qEJBc6z';
    console.log(`\n🌐 导航到测试页面: ${testUrl}`);
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // 5. 智能滚动并截图
    console.log('\n📜 开始智能滚动并截图...');
    
    let scrollCount = 0;
    let lastHeight = 0;
    let commentCount = 0;
    let lastCommentCount = 0;
    let noGrowthCount = 0;
    const maxScrolls = 25;
    const maxNoGrowth = 8;
    
    // 创建截图目录
    const screenshotDir = path.join(__dirname, 'test-results', 'screenshots');
    const fsPromises = await import('fs').then(m => m.promises);
    await fsPromises.mkdir(screenshotDir, { recursive: true });
    
    while (scrollCount < maxScrolls && noGrowthCount < maxNoGrowth) {
      // 检查页面高度
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      console.log(`第 ${scrollCount + 1} 次滚动 - 页面高度: ${currentHeight}px`);
      
      // 截图 - 每次滚动前
      const scrollScreenshot = path.join(screenshotDir, `scroll-${scrollCount + 1}-before.png`);
      await page.screenshot({ 
        path: scrollScreenshot,
        fullPage: false,
        captureBeyondViewport: false
      });
      console.log(`📸 截图保存: ${scrollScreenshot}`);
      
      // 滚动到底部
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await page.waitForTimeout(2000);
      
      // 等待可能的加载
      await page.waitForTimeout(1000);
      
      // 再次截图 - 滚动后
      const afterScrollScreenshot = path.join(screenshotDir, `scroll-${scrollCount + 1}-after.png`);
      await page.screenshot({ 
        path: afterScrollScreenshot,
        fullPage: false,
        captureBeyondViewport: false
      });
      console.log(`📸 截图保存: ${afterScrollScreenshot}`);
      
      // 尝试点击加载更多按钮
      const clicked = await page.evaluate(() => {
        const selectors = [
          'button:has-text("加载更多")',
          'button:has-text("查看更多")',
          'button:has-text("展开")',
          '[class*="loadmore"] button',
          '.Feed_footer button',
          '.comment_footer button'
        ];
        
        for (const selector of selectors) {
          try {
            const buttons = document.querySelectorAll(selector);
            for (const button of buttons) {
              if (button.offsetParent !== null) {
                const text = button.textContent.trim();
                if (text.includes('加载更多') || text.includes('查看更多') || text.includes('展开')) {
                  button.click();
                  return { clicked: true, text, selector };
                }
              }
            }
          } catch (error) {
            // 继续下一个选择器
          }
        }
        return { clicked: false };
      });
      
      if (clicked.clicked) {
        console.log(`🖱️ 点击了按钮: "${clicked.text}" (${clicked.selector})`);
        await page.waitForTimeout(2000);
        
        // 点击后截图
        const clickScreenshot = path.join(screenshotDir, `scroll-${scrollCount + 1}-click.png`);
        await page.screenshot({ 
          path: clickScreenshot,
          fullPage: false,
          captureBeyondViewport: false
        });
        console.log(`📸 截图保存: ${clickScreenshot}`);
      }
      
      // 提取当前评论数量
      const currentComments = await page.evaluate(() => {
        const commentSelectors = [
          '[class*="comment"]',
          '[class*="Comment"]',
          '[class*="reply"]',
          '[class*="Reply"]',
          'div[class*="item"]',
          'div[class*="feed"]'
        ];
        
        let count = 0;
        commentSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = element.textContent || '';
            if (text.length > 10) { // 过滤掉太短的内容
              count++;
            }
          });
        });
        
        return count;
      });
      
      console.log(`📊 当前评论数: ${currentComments}`);
      
      // 检查评论数量是否有增长
      if (currentComments > lastCommentCount) {
        lastCommentCount = currentComments;
        noGrowthCount = 0;
        console.log(`✅ 评论增长到: ${lastCommentCount}`);
      } else {
        noGrowthCount++;
        console.log(`⚠️  评论无增长 (${noGrowthCount}/${maxNoGrowth})`);
      }
      
      // 检查页面高度是否有变化
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === currentHeight) {
        console.log(`📄 页面高度稳定: ${newHeight}px`);
      } else {
        console.log(`📄 页面高度变化: ${currentHeight}px -> ${newHeight}px`);
      }
      
      scrollCount++;
      lastHeight = newHeight;
      
      // 如果连续多次无增长，准备最后的详细分析
      if (noGrowthCount >= maxNoGrowth - 2) {
        console.log('\n🔍 即将停止，进行详细分析...');
        
        // 截取完整的页面底部
        const fullPageScreenshot = path.join(screenshotDir, `final-bottom-fullpage.png`);
        await page.screenshot({ 
          path: fullPageScreenshot,
          fullPage: true
        });
        console.log(`📸 完整页面截图: ${fullPageScreenshot}`);
        
        // 截取视口底部
        const viewportBottomScreenshot = path.join(screenshotDir, `final-viewport-bottom.png`);
        await page.screenshot({ 
          path: viewportBottomScreenshot,
          fullPage: false,
          captureBeyondViewport: false
        });
        console.log(`📸 视口底部截图: ${viewportBottomScreenshot}`);
        
        // 详细分析页面底部状态
        const bottomAnalysis = await page.evaluate(() => {
          const results = {
            scrollInfo: {
              scrollTop: window.scrollY,
              scrollHeight: document.body.scrollHeight,
              clientHeight: window.innerHeight,
              scrollPercentage: (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
            },
            bottomElements: [],
            loadMoreButtons: [],
            endMarkers: [],
            lastComments: []
          };
          
          // 查找页面底部元素
          const allElements = document.querySelectorAll('*');
          for (const element of allElements) {
            const rect = element.getBoundingClientRect();
            const elementTop = rect.top + window.scrollY;
            
            // 如果元素在页面底部200px范围内
            if (elementTop > results.scrollInfo.scrollHeight - 200) {
              if (element.offsetParent !== null) { // 可见
                const text = element.textContent || '';
                results.bottomElements.push({
                  tagName: element.tagName,
                  className: element.className,
                  id: element.id,
                  text: text.trim().substring(0, 100),
                  distanceFromBottom: results.scrollInfo.scrollHeight - elementTop
                });
              }
            }
          }
          
          // 查找加载更多按钮
          const loadMoreSelectors = [
            'button:has-text("加载更多")',
            'button:has-text("查看更多")',
            'button:has-text("展开")',
            '[class*="loadmore"]',
            '[class*="more"]'
          ];
          
          loadMoreSelectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(element => {
                if (element.offsetParent !== null) {
                  results.loadMoreButtons.push({
                    tagName: element.tagName,
                    text: element.textContent.trim(),
                    className: element.className,
                    visible: true
                  });
                }
              });
            } catch (error) {
              // 忽略无效选择器
            }
          });
          
          // 查找到底标记
          const endMarkerTexts = [
            '没有更多', '到底了', '已加载全部', '加载完成',
            '没有更多评论', '已显示全部评论', '评论已加载完毕'
          ];
          
          for (const element of allElements) {
            const text = (element.textContent || '').toLowerCase();
            if (endMarkerTexts.some(marker => text.includes(marker))) {
              results.endMarkers.push({
                tagName: element.tagName,
                text: element.textContent.trim(),
                visible: element.offsetParent !== null
              });
            }
          }
          
          return results;
        });
        
        console.log('\n📋 底部分析结果:');
        console.log(`  滚动百分比: ${bottomAnalysis.scrollInfo.scrollPercentage.toFixed(1)}%`);
        console.log(`  底部元素: ${bottomAnalysis.bottomElements.length} 个`);
        console.log(`  加载按钮: ${bottomAnalysis.loadMoreButtons.length} 个`);
        console.log(`  到底标记: ${bottomAnalysis.endMarkers.length} 个`);
        
        if (bottomAnalysis.endMarkers.length > 0) {
          console.log('\n🎯 找到的到底标记:');
          bottomAnalysis.endMarkers.forEach((marker, index) => {
            console.log(`  ${index + 1}. ${marker.tagName}: "${marker.text}" (${marker.visible ? '可见' : '不可见'})`);
          });
        }
        
        if (bottomAnalysis.loadMoreButtons.length > 0) {
          console.log('\n🔄 找到的加载按钮:');
          bottomAnalysis.loadMoreButtons.forEach((button, index) => {
            console.log(`  ${index + 1}. ${button.tagName}: "${button.text}"`);
          });
        }
        
        // 保存分析结果
        const resultPath = path.join(__dirname, 'test-results', 'comment-bottom-analysis.json');
        await fsPromises.writeFile(resultPath, JSON.stringify({
          bottomAnalysis,
          scrollCount,
          finalCommentCount: lastCommentCount,
          finalPageHeight: lastHeight,
          noGrowthCount,
          timestamp: new Date().toISOString()
        }, null, 2));
        
        console.log(`\n💾 分析结果已保存到: ${resultPath}`);
        break;
      }
    }
    
    console.log(`\n📊 最终统计:`);
    console.log(`  滚动次数: ${scrollCount}`);
    console.log(`  最终评论数: ${lastCommentCount}`);
    console.log(`  最终页面高度: ${lastHeight}px`);
    console.log(`  无增长次数: ${noGrowthCount}`);
    
    return {
      scrollCount,
      finalCommentCount: lastCommentCount,
      finalPageHeight: lastHeight,
      noGrowthCount
    };
    
  } catch (error) {
    console.error('💥 检查失败:', error.message);
    return 0;
  } finally {
    await browser.close();
  }
}

// 运行检查
checkCommentBottomWithScreenshots().then((result) => {
  console.log('\n✅ 微博评论到底检查完成');
  console.log(`📊 结果: ${result.finalCommentCount} 条评论, ${result.scrollCount} 次滚动, 页面高度 ${result.finalPageHeight}px`);
  process.exit(0);
}).catch(error => {
  console.error('💥 检查运行失败:', error);
  process.exit(1);
});