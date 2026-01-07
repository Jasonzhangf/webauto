#!/usr/bin/env node
/**
 * 调试微博页面的实际选择器
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

async function debugSelectors() {
  console.log('🔍 Debugging Weibo Selectors');
  console.log('==============================\n');

  try {
    // 获取页面的所有类名
    console.log('1️⃣ Getting all class names from page...');
    const classScript = `
      (function() {
        const allElements = document.querySelectorAll('*');
        const classSet = new Set();
        
        allElements.forEach(el => {
          if (el.className) {
            const classes = el.className.split(' ');
            classes.forEach(cls => {
              if (cls && cls.length > 0) {
                classSet.add(cls);
              }
            });
          }
        });
        
        // 过滤出可能的帖子相关类
        const feedClasses = Array.from(classSet).filter(cls => 
          cls.toLowerCase().includes('feed') || 
          cls.toLowerCase().includes('post') ||
          cls.toLowerCase().includes('body') ||
          cls.toLowerCase().includes('wrap') ||
          cls.toLowerCase().includes('article') ||
          cls.toLowerCase().includes('card')
        );
        
        return {
          totalClasses: classSet.size,
          feedRelatedClasses: feedClasses,
          allClasses: Array.from(classSet).slice(0, 100) // 只返回前100个
        };
      })()
    `;

    const classResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          sessionId: 'weibo_fresh',
          script: classScript
        }
      })
    });

    const classResult = await classResponse.json();
    console.log(`   Total classes found: ${classResult.data?.totalClasses || 0}`);
    console.log(`   Feed-related classes: ${classResult.data?.feedRelatedClasses?.length || 0}`);
    console.log(`   First 10 feed-related classes:`, classResult.data?.feedRelatedClasses?.slice(0, 10) || []);

    // 尝试更通用的选择器
    console.log('\n2️⃣ Testing generic selectors...');
    const genericSelectors = [
      'article',
      'div[role="article"]',
      'div[data-testid="post"]',
      'div[class*="item"]',
      'div[class*="card"]',
      'div[class*="post"]',
      'div[class*="feed"]',
      'li[class*="item"]',
      '[data-testid*="tweet"]',
      '[data-testid*="post"]',
      'section',
      'main',
      'article[role="article"]'
    ];

    for (const selector of genericSelectors) {
      const countScript = `
        (function(sel) {
          return document.querySelectorAll(sel).length;
        })('${selector}')
      `;

      try {
        const countResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'browser:execute',
            payload: {
              sessionId: 'weibo_fresh',
              script: countScript
            }
          })
        });

        const countResult = await countResponse.json();
        console.log(`   ${selector}: ${countResult.data || 0} elements`);
        
        if (countResult.data > 0 && countResult.data < 20) { // 如果找到少量元素，尝试获取详细信息
          const detailScript = `
            (function(sel) {
              const elements = document.querySelectorAll(sel);
              if (elements.length === 0) return [];
              
              return Array.from(elements).slice(0, 3).map(el => ({
                tagName: el.tagName,
                className: el.className,
                innerHTML: el.innerHTML.substring(0, 200),
                href: el.querySelector('a')?.href || null
              }));
            })('${selector}')
          `;

          const detailResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'browser:execute',
              payload: {
                sessionId: 'weibo_fresh',
                script: detailScript
              }
            })
          });

          const detailResult = await detailResponse.json();
          console.log(`     Sample elements:`, detailResult.data || []);
        }
      } catch (err) {
        console.log(`   ${selector}: Error - ${err.message}`);
      }
    }

    // 检查页面结构
    console.log('\n3️⃣ Checking page structure...');
    const structureScript = `
      (function() {
        return {
          url: window.location.href,
          title: document.title,
          hasFrame: document.querySelector('[class*="Frame"]') ? true : false,
          hasMain: document.querySelector('main') ? true : false,
          hasVue: typeof window.__vue__ !== 'undefined' || document.querySelector('.vue-app') ? true : false,
          hasLogin: document.querySelector('.LoginCard, [class*="Login"]') ? true : false,
          bodyHTML: document.body.innerHTML.substring(0, 500)
        };
      })()
    `;

    const structureResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          sessionId: 'weibo_fresh',
          script: structureScript
        }
      })
    });

    const structureResult = await structureResponse.json();
    console.log('\n📋 Page Structure:');
    console.log(`   URL: ${structureResult.data?.url || 'N/A'}`);
    console.log(`   Title: ${structureResult.data?.title || 'N/A'}`);
    console.log(`   Has Frame: ${structureResult.data?.hasFrame || false}`);
    console.log(`   Has Main: ${structureResult.data?.hasMain || false}`);
    console.log(`   Has Vue: ${structureResult.data?.hasVue || false}`);
    console.log(`   Has Login: ${structureResult.data?.hasLogin || false}`);
    console.log(`   Body Preview: ${structureResult.data?.bodyHTML || 'N/A'}...`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugSelectors().catch(console.error);
