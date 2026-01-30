#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Step 6: 完整滚动+提取流程（简单版）
 * 
 * 目标：
 * 1. 滚动加载更多内容
 * 2. 提取帖子数据
 * 3. 去重并收集
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

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

async function collectPosts(targetCount = 50) {
  console.log('🔄 Step 6: Collecting Posts with Scroll');
  console.log('=========================================\n');

  const collectedPosts = new Map();
  let scrollCount = 0;
  const maxScrolls = 20;

  while (collectedPosts.size < targetCount && scrollCount < maxScrolls) {
    console.log(`📊 Progress: ${collectedPosts.size}/${targetCount} posts | Scroll ${scrollCount + 1}/${maxScrolls}`);

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

    // 去重并收集
    if (Array.isArray(posts)) {
      posts.forEach(post => {
        if (post.url && !collectedPosts.has(post.url)) {
          collectedPosts.set(post.url, post);
        }
      });
    }

    console.log(`   ✅ Found ${posts?.length || 0} posts, total unique: ${collectedPosts.size}`);

    // 2. 滚动
    if (collectedPosts.size < targetCount) {
      console.log('   🔄 Scrolling...');
      await executeScript('window.scrollBy(0, 800);');
      await new Promise(r => setTimeout(r, 3000));
      scrollCount++;
    }
  }

  console.log(`\n✅ Collection completed! Total: ${collectedPosts.size} posts`);
  return Array.from(collectedPosts.values());
}

async function main() {
  const posts = await collectPosts(50);
  console.log('\nSample posts:');
  posts.slice(0, 3).forEach((post, index) => {
    console.log(`\n${index + 1}. ${post.author || 'Unknown'}`);
    console.log(`   URL: ${post.url}`);
    console.log(`   Content: ${post.content?.substring(0, 50)}...`);
  });
}

main().catch(console.error);
