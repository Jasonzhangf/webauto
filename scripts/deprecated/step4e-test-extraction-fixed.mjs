#!/usr/bin/env node
/**
 * Step 4e: 修复后的单个帖子数据提取测试
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

async function testFixedExtraction() {
  console.log('📝 Step 4e: Testing Fixed Post Extraction');
  console.log('==========================================\n');

  try {
    // 1. 测试基本脚本执行
    console.log('1️⃣ Testing basic script execution...');
    const basicResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          sessionId: 'weibo_fresh',
          script: 'document.title'
        }
      })
    });

    const basicResult = await basicResponse.json();
    console.log(`   Title: ${basicResult.data?.result || basicResult.data || 'N/A'}`);

    // 2. 测试查找元素
    console.log('\n2️⃣ Testing element query...');
    const queryResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          sessionId: 'weibo_fresh',
          script: 'document.querySelectorAll("article").length'
        }
      })
    });

    const queryResult = await queryResponse.json();
    console.log(`   Article count: ${queryResult.data?.result || queryResult.data || 'N/A'}`);

    // 3. 测试复杂选择器（微博帖子）
    console.log('\n3️⃣ Testing Weibo post selector...');
    const weiboResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          sessionId: 'weibo_fresh',
          script: 'document.querySelectorAll("[class*=\'Feed\']").length'
        }
      })
    });

    const weiboResult = await weiboResponse.json();
    console.log(`   Feed element count: ${weiboResult.data?.result || weiboResult.data || 'N/A'}`);

    // 4. 提取第一个帖子的数据
    console.log('\n4️⃣ Extracting first post data...');
    const extractScript = `
      (function() {
        const posts = document.querySelectorAll('[class*="Feed_wrap_"], [class*="Feed_body_"]');
        if (posts.length === 0) {
          return { found: false, count: 0 };
        }

        const firstPost = posts[0];
        const data = {};

        // URL
        const link = firstPost.querySelector('a[href*="weibo.com"]');
        if (link) data.url = link.href;

        // 作者
        const authorEl = firstPost.querySelector('a');
        if (authorEl) {
          data.author = authorEl.textContent?.trim();
          data.authorUrl = authorEl.href;
        }

        // 内容
        const contentEl = firstPost.querySelector('[class*="detail"]');
        if (contentEl) {
          data.content = contentEl.textContent?.trim().substring(0, 150);
        }

        // 时间
        const timeEl = firstPost.querySelector('time');
        if (timeEl) {
          data.timestamp = timeEl.textContent?.trim() || timeEl.getAttribute('datetime');
        }

        return { found: true, count: posts.length, data };
      })()
    `;

    const extractResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          sessionId: 'weibo_fresh',
          script: extractScript
        }
      })
    });

    const extractResult = await extractResponse.json();
    const postData = extractResult.data?.result;

    console.log(`   Posts Found: ${postData?.count || 0}`);
    console.log(`   First Post Found: ${postData?.found || false}`);

    if (postData?.found) {
      console.log(`\n📋 Post Details:`);
      console.log(`   URL: ${postData.data?.url || 'N/A'}`);
      console.log(`   Author: ${postData.data?.author || 'N/A'}`);
      console.log(`   Author URL: ${postData.data?.authorUrl || 'N/A'}`);
      console.log(`   Content: ${postData.data?.content || 'N/A'}`);
      console.log(`   Timestamp: ${postData.data?.timestamp || 'N/A'}`);

      // 验证字段
      console.log('\n5️⃣ Validating extracted fields...');
      const requiredFields = ['url', 'author', 'content'];
      const missingFields = requiredFields.filter(field => !postData.data[field]);

      if (missingFields.length > 0) {
        console.log(`   ⚠️  Missing fields: ${missingFields.join(', ')}`);
      } else {
        console.log('   ✅ All required fields extracted successfully!');
      }

      console.log('\n✅ Extraction works correctly!');
      console.log('📋 Ready to proceed with full collection.');
    } else {
      console.log('\n❌ No posts found on page.');
      console.log('   Please ensure:');
      console.log('   - You are logged in to Weibo');
      console.log('   - The page has finished loading');
      console.log('   - The selectors are correct for current Weibo layout');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testFixedExtraction().catch(console.error);
