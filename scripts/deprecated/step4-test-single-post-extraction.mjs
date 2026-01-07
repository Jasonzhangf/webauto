#!/usr/bin/env node
/**
 * Step 4: 测试单个帖子的数据提取
 * 
 * 目标：
 * 1. 验证能够访问微博主页
 * 2. 提取单个帖子的数据
 * 3. 验证提取的字段完整性
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

async function testSinglePostExtraction() {
  console.log('📝 Step 4: Testing Single Post Extraction');
  console.log('==========================================\n');

  try {
    // 1. 导航到微博主页
    console.log('1️⃣ Navigating to Weibo homepage...');
    const navResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:navigate',
        payload: {
          sessionId: 'weibo_fresh',
          url: 'https://weibo.com',
          waitUntil: 'domcontentloaded',
          timeoutMs: 30000
        }
      })
    });

    if (!navResponse.ok) {
      throw new Error(`Navigation failed: ${navResponse.statusText}`);
    }

    const navResult = await navResponse.json();
    console.log(`✅ Navigated to: ${navResult.data?.url || 'unknown'}\n`);

    // 等待页面加载
    console.log('⏳ Waiting for page to load...');
    await new Promise(r => setTimeout(r, 5000));

    // 2. 查找第一个帖子容器
    console.log('\n2️⃣ Finding first post container...');
    const findPostScript = `
      (function() {
        const selectors = [
          'article[class*="Feed_wrap_"]',
          'div[class*="Feed_body_"]',
          '.Feed_body_3R0rO'
        ];
        
        for (const selector of selectors) {
          const posts = document.querySelectorAll(selector);
          if (posts.length > 0) {
            return {
              found: true,
              count: posts.length,
              selector: selector
            };
          }
        }
        
        return { found: false, count: 0 };
      })()
    `;

    const evalResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:evaluate',
        payload: {
          sessionId: 'weibo_fresh',
          script: findPostScript
        }
      })
    });

    const evalResult = await evalResponse.json();
    console.log(`✅ Found ${evalResult.data?.count || 0} posts using selector: ${evalResult.data?.selector || 'N/A'}\n`);

    if (!evalResult.data?.found) {
      console.log('❌ No posts found. Please ensure:');
      console.log('   - You are logged in to Weibo');
      console.log('   - The page has finished loading');
      console.log('   - The selectors are correct for current Weibo layout');
      return;
    }

    // 3. 提取第一个帖子的数据
    console.log('3️⃣ Extracting first post data...');
    const extractScript = `
      (function() {
        const selectors = [
          'article[class*="Feed_wrap_"]',
          'div[class*="Feed_body_"]',
          '.Feed_body_3R0rO'
        ];
        
        let firstPost = null;
        for (const selector of selectors) {
          firstPost = document.querySelector(selector);
          if (firstPost) break;
        }
        
        if (!firstPost) return { success: false, error: 'No post found' };
        
        // 提取数据
        const data = {};
        
        // URL
        const link = firstPost.querySelector('a[href*="weibo.com"][href*="status"]');
        if (link) data.url = link.href;
        
        // 作者
        const authorSelectors = ['.head_nick_24eEB', '.woo-box-flex.woo-box-alignCenter a', 'header a'];
        for (const sel of authorSelectors) {
          const author = firstPost.querySelector(sel);
          if (author && author.textContent) {
            data.author = author.textContent.trim();
            data.authorUrl = author.href;
            break;
          }
        }
        
        // 内容
        const contentSelectors = ['.detail_wbtext_4CRf9', 'div[class*="detail_wbtext"]', '.Feed_text'];
        for (const sel of contentSelectors) {
          const content = firstPost.querySelector(sel);
          if (content && content.textContent) {
            data.content = content.textContent.trim().substring(0, 200);
            break;
          }
        }
        
        // 时间
        const timeSelectors = ['.head_info_3WfbI time', 'time', '.Feed_time'];
        for (const sel of timeSelectors) {
          const time = firstPost.querySelector(sel);
          if (time) {
            data.timestamp = time.textContent?.trim() || time.getAttribute('datetime') || '';
            break;
          }
        }
        
        // 统计数据
        const likes = firstPost.querySelector('.toolbar_item_2-iTa[title*="赞"]');
        if (likes) data.likes = likes.textContent?.trim();
        
        const comments = firstPost.querySelector('.toolbar_item_2-iTa[title*="评论"]');
        if (comments) data.comments = comments.textContent?.trim();
        
        const reposts = firstPost.querySelector('.toolbar_item_2-iTa[title*="转发"]');
        if (reposts) data.reposts = reposts.textContent?.trim();
        
        return { success: true, data };
      })()
    `;

    const extractResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:evaluate',
        payload: {
          sessionId: 'weibo_fresh',
          script: extractScript
        }
      })
    });

    const extractResult = await extractResponse.json();
    
    if (!extractResult.data?.success) {
      console.log('❌ Extraction failed:', extractResult.data?.error);
      return;
    }

    const postData = extractResult.data.data;
    console.log('✅ Successfully extracted post data:\n');
    console.log('📋 Post Details:');
    console.log(`   URL: ${postData.url || 'N/A'}`);
    console.log(`   Author: ${postData.author || 'N/A'}`);
    console.log(`   Author URL: ${postData.authorUrl || 'N/A'}`);
    console.log(`   Content: ${postData.content || 'N/A'}`);
    console.log(`   Timestamp: ${postData.timestamp || 'N/A'}`);
    console.log(`   Likes: ${postData.likes || 'N/A'}`);
    console.log(`   Comments: ${postData.comments || 'N/A'}`);
    console.log(`   Reposts: ${postData.reposts || 'N/A'}`);
    
    // 验证字段完整性
    console.log('\n4️⃣ Validating extracted fields...');
    const requiredFields = ['url', 'author', 'content'];
    const missingFields = requiredFields.filter(field => !postData[field]);
    
    if (missingFields.length > 0) {
      console.log(`⚠️  Missing required fields: ${missingFields.join(', ')}`);
      console.log('   Please check selector configuration in container definitions');
    } else {
      console.log('✅ All required fields extracted successfully!');
    }
    
    console.log('\n📋 Next Step: Integrate AutoScrollStrategy to WorkflowExecutor');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testSinglePostExtraction().catch(console.error);
