#!/usr/bin/env node
/**
 * Step 6: 采集 150 条微博帖子
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const TARGET_COUNT = 150;
const MAX_SCROLLS = 50;

async function executeScript(script) {
  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: {
        sessionId: 'weibo_fresh',
        script
      }
    })
  });

  const result = await response.json();
  return result.data?.result ?? result.data;
}

async function collectWeiboPosts(targetCount) {
  console.log(`🔄 Starting Weibo Collection`);
  console.log(`========================================`);
  console.log(`📊 Target: ${targetCount} posts`);
  console.log(`📜 Max Scrolls: ${MAX_SCROLLS}`);
  console.log('');

  const collectedPosts = new Map();
  let scrollCount = 0;

  while (collectedPosts.size < targetCount && scrollCount < MAX_SCROLLS) {
    console.log(`📊 Progress: ${collectedPosts.size}/${targetCount} posts | Scroll ${scrollCount + 1}/${MAX_SCROLLS}`);

    // 1. 提取当前页面的帖子
    const extractScript = `
      (function() {
        const posts = document.querySelectorAll('[class*="Feed_wrap_"], [class*="Feed_body_"]');
        const results = [];

        posts.forEach((post, index) => {
          const data = {};

          // URL
          const link = post.querySelector('a[href*="weibo.com"][href*="status"]');
          if (link) data.url = link.href;

          // 作者
          const authorEl = post.querySelector('a[href*="weibo.com/u/"]');
          if (authorEl) {
            data.author = authorEl.textContent?.trim();
            data.authorUrl = authorEl.href;
          }

          // 内容
          const contentEl = post.querySelector('[class*="detail"]');
          if (contentEl) {
            data.content = contentEl.textContent?.trim();
          }

          // 时间
          const timeEl = post.querySelector('time');
          if (timeEl) {
            data.timestamp = timeEl.textContent?.trim() || timeEl.getAttribute('datetime');
          }

          // 只收集有 URL 的帖子
          if (data.url) {
            results.push(data);
          }
        });

        return results;
      })()
    `;

    const posts = await executeScript(extractScript);

    // 2. 去重并收集
    if (Array.isArray(posts)) {
      posts.forEach(post => {
        if (post.url && !collectedPosts.has(post.url)) {
          collectedPosts.set(post.url, post);
        }
      });
    }

    console.log(`   ✅ Found ${posts?.length || 0} posts, total unique: ${collectedPosts.size}`);

    // 3. 如果还需要更多，滚动
    if (collectedPosts.size < targetCount) {
      console.log('   🔄 Scrolling...');
      await executeScript('window.scrollBy(0, 800);');
      await new Promise(r => setTimeout(r, 3000)); // 等待加载
      scrollCount++;
    } else {
      console.log('   ✅ Target count reached!');
    }
  }

  console.log(`\n✅ Collection completed! Total: ${collectedPosts.size} posts`);
  return Array.from(collectedPosts.values());
}

async function generateMarkdown(posts, filename = 'weibo_posts_150.md') {
  const fs = await import('fs/promises');
  const path = await import('path');

  const lines = [
    '# 微博主页采集结果',
    '',
    `采集时间：${new Date().toLocaleString('zh-CN')}`,
    `帖子数量：${posts.length}`,
    '',
    '---',
    ''
  ];

  posts.forEach((post, index) => {
    lines.push(`## ${index + 1}. ${post.author || '未知作者'}`);
    lines.push('');
    
    if (post.content) {
      lines.push(`**内容：** ${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}`);
      lines.push('');
    }
    
    if (post.url) {
      lines.push(`**链接：** ${post.url}`);
      lines.push('');
    }
    
    if (post.timestamp) {
      lines.push(`**时间：** ${post.timestamp}`);
      lines.push('');
    }
    
    if (post.authorUrl) {
      lines.push(`**作者链接：** ${post.authorUrl}`);
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  });

  const content = lines.join('\n');
  await fs.writeFile(filename, content, 'utf-8');
  console.log(`✅ Markdown saved to: ${filename}`);
}

async function main() {
  try {
    // 1. 检查浏览器状态
    console.log('1️⃣ Checking browser status...');
    const statusScript = 'window.location.href';
    const currentUrl = await executeScript(statusScript);
    console.log(`   Current URL: ${currentUrl}`);
    console.log('');

    // 2. 采集帖子
    const posts = await collectWeiboPosts(TARGET_COUNT);

    // 3. 生成 Markdown
    console.log('\n2️⃣ Generating Markdown report...');
    await generateMarkdown(posts, 'weibo_posts_150.md');

    // 4. 显示结果摘要
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${posts.length}`);
    console.log(`   📁 Output file: weibo_posts_150.md`);
    console.log('\n🎉 Collection completed!');

    // 5. 显示前3条帖子预览
    console.log('\n📋 Sample Posts (first 3):');
    posts.slice(0, 3).forEach((post, index) => {
      console.log(`\n${index + 1}. ${post.author || 'Unknown'}`);
      console.log(`   URL: ${post.url}`);
      console.log(`   Content: ${post.content?.substring(0, 50)}...`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
