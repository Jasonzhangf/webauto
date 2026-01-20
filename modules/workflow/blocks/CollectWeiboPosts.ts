/**
 * 标准化微博采集 Workflow
 *
 * 输入：数量和输出文件
 * 输出：指定数量的微博帖子到MD文件
 */

import fs from 'fs/promises';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function executeScript(script: string) {
  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: {
        sessionId: PROFILE,
        script
      }
    })
  });

  const result = await response.json();
  return result.data?.result ?? result.data;
}

async function mouseWheel(deltaY: number) {
  await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'mouse:wheel',
      payload: {
        profileId: PROFILE,
        deltaX: 0,
        deltaY: Math.max(-800, Math.min(800, Number(deltaY) || 0)),
      },
    }),
  }).then((r) => r.json().catch(() => ({})));
}

async function collectWeiboPosts(targetCount: number) {
  console.log('🔄 Starting Weibo Collection');
  console.log('========================================');
  console.log(`📊 Target: ${targetCount} posts`);
  console.log('');

  const collectedPosts = new Map();
  let scrollCount = 0;
  let lastHeight = 0;
  let noChangeCount = 0;
  const maxNoChangeCount = 3;

  while (collectedPosts.size < targetCount && scrollCount < 120 && noChangeCount < maxNoChangeCount) {
    console.log(`📊 Progress: ${collectedPosts.size}/${targetCount} posts | Scroll: ${scrollCount} | No-change: ${noChangeCount}/${maxNoChangeCount}`);

    // 获取当前页面的帖子
    const extractScript = `
      (function() {
        const posts = document.querySelectorAll('[class*="Feed_wrap_"], [class*="Feed_body_"], article');
        const results = [];

        posts.forEach((post, index) => {
          const data = {};

          // 内容链接 - 优先查找包含status的微博链接
          const statusLink = post.querySelector('a[href*="weibo.com"][href*="/status/"]');
          if (statusLink) {
            data.url = statusLink.href;
          } else {
            // 备选：查找包含Q开头的链接（微博短链接）
            const shortLink = post.querySelector('a[href*="weibo.com/"][href*="Q"]');
            if (shortLink) {
              data.url = shortLink.href;
            }
          }

          // 作者链接 - 查找用户主页链接
          const userLink = post.querySelector('a[href*="weibo.com/u/"]');
          if (userLink) {
            data.authorUrl = userLink.href;
            data.author = userLink.textContent?.trim() || '未知作者';
          } else {
            // 备选：查找其他作者链接
            const authorSelectors = [
              'header a[href*="weibo.com"]',
              'a[href*="weibo.com"][href*="/u/"]',
              'a[href*="weibo.com"]'
            ];
            for (const sel of authorSelectors) {
              const authorEl = post.querySelector(sel);
              if (authorEl && authorEl.textContent && authorEl.textContent.trim()) {
                data.author = authorEl.textContent.trim();
                data.authorUrl = authorEl.href;
                break;
              }
            }
          }

          // 内容 - 尝试多个选择器
          const contentSelectors = [
            '[class*="detail_wbtext"]',
            '[class*="wbtext"]',
            '[class*="content"]',
            '[class*="text"]'
          ];
          for (const sel of contentSelectors) {
            const contentEl = post.querySelector(sel);
            if (contentEl && contentEl.textContent && contentEl.textContent.trim()) {
              data.content = contentEl.textContent.trim().substring(0, 500); // 限制长度
              break;
            }
          }

          // 时间
          const timeEl = post.querySelector('time');
          if (timeEl) {
            data.timestamp = timeEl.textContent?.trim() || timeEl.getAttribute('datetime');
          }

          // 只收集有内容的帖子
          if (data.content) {
            results.push(data);
          }
        });

        return results;
      })()
    `;

    const posts = await executeScript(extractScript);

    // 去重并收集
    if (Array.isArray(posts)) {
      let newPosts = 0;
      posts.forEach((post: any, index: number) => {
        // 使用内容作为唯一标识，避免重复
        const uniqueKey = post.url || (post.content ? post.content.substring(0, 50) : index);
        if (uniqueKey && !collectedPosts.has(uniqueKey)) {
          collectedPosts.set(uniqueKey, post);
          newPosts++;
        }
      });
      console.log(`   ✅ Found ${posts.length} posts on page, added ${newPosts} new, total unique: ${collectedPosts.size}`);
    }

    // 检查页面高度是否变化，判断是否到底部
    const currentHeight = await executeScript('document.documentElement.scrollHeight');
    console.log(`   📏 Page height: ${currentHeight}, last: ${lastHeight}`);

    if (currentHeight === lastHeight) {
      noChangeCount++;
      console.log(`   ⚠️  Height unchanged (${noChangeCount}/${maxNoChangeCount})`);
    } else {
      noChangeCount = 0; // 重置计数
    }

    lastHeight = currentHeight;

    // 如果还需要更多，滚动
    if (collectedPosts.size < targetCount && noChangeCount < maxNoChangeCount) {
      console.log('   🔄 Scrolling down...');
      await mouseWheel(800);
      await mouseWheel(800);
      await new Promise(r => setTimeout(r, 3000)); // 等待加载
      scrollCount++;
    } else {
      if (collectedPosts.size >= targetCount) {
        console.log('   ✅ Target count reached!');
      } else if (noChangeCount >= maxNoChangeCount) {
        console.log('   ✅ Reached bottom of page!');
      }
    }
  }

  console.log(`\n✅ Collection completed! Total: ${collectedPosts.size} posts`);
  return Array.from(collectedPosts.values());
}

async function generateMarkdown(posts: any[], filename: string) {
  const lines = [
    '# 微博采集结果',
    '',
    `采集时间：${new Date().toLocaleString('zh-CN')}`,
    `帖子数量：${posts.length}`,
    '',
    '---',
    ''
  ];

  posts.forEach((post: any, index: number) => {
    lines.push(`## ${index + 1}. ${post.author || '未知作者'}`);
    lines.push('');

    if (post.content) {
      lines.push(`**内容：** ${post.content.substring(0, 500)}${post.content.length > 500 ? '...' : ''}`);
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

async function main(input: { count?: number; output?: string }) {
  const { count = 250, output = 'weibo_posts_250.md' } = input;

  try {
    // 采集帖子
    const posts = await collectWeiboPosts(count);

    if (posts.length === 0) {
      console.log('⚠️  No posts collected.');
      return;
    }

    // 生成 Markdown
    console.log('\n2️⃣ Generating Markdown report...');
    await generateMarkdown(posts, output);

    // 显示结果摘要
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${posts.length}`);
    console.log(`   📁 Output file: ${output}`);
    console.log('\n🎉 Collection completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

export { main as execute };
