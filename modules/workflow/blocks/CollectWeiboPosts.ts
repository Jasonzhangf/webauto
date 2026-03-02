/**
 * 鏍囧噯鍖栧井鍗氶噰闆?Workflow
 *
 * 杈撳叆锛氭暟閲忓拰杈撳嚭鏂囦欢
 * 杈撳嚭锛氭寚瀹氭暟閲忕殑寰崥甯栧瓙鍒癕D鏂囦欢
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
  const normalized = Math.max(-800, Math.min(800, Number(deltaY) || 0));
  const key = normalized >= 0 ? 'PageDown' : 'PageUp';
  const steps = Math.max(1, Math.min(8, Math.round(Math.abs(normalized) / 420) || 1));
  for (let step = 0; step < steps; step += 1) {
    await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'keyboard:press',
        payload: {
          profileId: PROFILE,
          key,
        },
      }),
    }).then((r) => r.json().catch(() => ({})));
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

async function collectWeiboPosts(targetCount: number) {
  console.log('馃攧 Starting Weibo Collection');
  console.log('========================================');
  console.log(`馃搳 Target: ${targetCount} posts`);
  console.log('');

  const collectedPosts = new Map();
  let scrollCount = 0;
  let lastHeight = 0;
  let noChangeCount = 0;
  const maxNoChangeCount = 3;

  while (collectedPosts.size < targetCount && scrollCount < 120 && noChangeCount < maxNoChangeCount) {
    console.log(`馃搳 Progress: ${collectedPosts.size}/${targetCount} posts | Scroll: ${scrollCount} | No-change: ${noChangeCount}/${maxNoChangeCount}`);

    // 鑾峰彇褰撳墠椤甸潰鐨勫笘瀛?
    const extractScript = `
      (function() {
        const posts = document.querySelectorAll('[class*="Feed_wrap_"], [class*="Feed_body_"], article');
        const results = [];

        posts.forEach((post, index) => {
          const data = {};

          // 鍐呭閾炬帴 - 浼樺厛鏌ユ壘鍖呭惈status鐨勫井鍗氶摼鎺?
          const statusLink = post.querySelector('a[href*="weibo.com"][href*="/status/"]');
          if (statusLink) {
            data.url = statusLink.href;
          } else {
            // 澶囬€夛細鏌ユ壘鍖呭惈Q寮€澶寸殑閾炬帴锛堝井鍗氱煭閾炬帴锛?
            const shortLink = post.querySelector('a[href*="weibo.com/"][href*="Q"]');
            if (shortLink) {
              data.url = shortLink.href;
            }
          }

          // 浣滆€呴摼鎺?- 鏌ユ壘鐢ㄦ埛涓婚〉閾炬帴
          const userLink = post.querySelector('a[href*="weibo.com/u/"]');
          if (userLink) {
            data.authorUrl = userLink.href;
            data.author = userLink.textContent?.trim() || '鏈煡浣滆€?;
          } else {
            // 澶囬€夛細鏌ユ壘鍏朵粬浣滆€呴摼鎺?
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

          // 鍐呭 - 灏濊瘯澶氫釜閫夋嫨鍣?
          const contentSelectors = [
            '[class*="detail_wbtext"]',
            '[class*="wbtext"]',
            '[class*="content"]',
            '[class*="text"]'
          ];
          for (const sel of contentSelectors) {
            const contentEl = post.querySelector(sel);
            if (contentEl && contentEl.textContent && contentEl.textContent.trim()) {
              data.content = contentEl.textContent.trim().substring(0, 500); // 闄愬埗闀垮害
              break;
            }
          }

          // 鏃堕棿
          const timeEl = post.querySelector('time');
          if (timeEl) {
            data.timestamp = timeEl.textContent?.trim() || timeEl.getAttribute('datetime');
          }

          // 鍙敹闆嗘湁鍐呭鐨勫笘瀛?
          if (data.content) {
            results.push(data);
          }
        });

        return results;
      })()
    `;

    const posts = await executeScript(extractScript);

    // 鍘婚噸骞舵敹闆?
    if (Array.isArray(posts)) {
      let newPosts = 0;
      posts.forEach((post: any, index: number) => {
        // 浣跨敤鍐呭浣滀负鍞竴鏍囪瘑锛岄伩鍏嶉噸澶?
        const uniqueKey = post.url || (post.content ? post.content.substring(0, 50) : index);
        if (uniqueKey && !collectedPosts.has(uniqueKey)) {
          collectedPosts.set(uniqueKey, post);
          newPosts++;
        }
      });
      console.log(`   鉁?Found ${posts.length} posts on page, added ${newPosts} new, total unique: ${collectedPosts.size}`);
    }

    // 妫€鏌ラ〉闈㈤珮搴︽槸鍚﹀彉鍖栵紝鍒ゆ柇鏄惁鍒板簳閮?
    const currentHeight = await executeScript('document.documentElement.scrollHeight');
    console.log(`   馃搹 Page height: ${currentHeight}, last: ${lastHeight}`);

    if (currentHeight === lastHeight) {
      noChangeCount++;
      console.log(`   鈿狅笍  Height unchanged (${noChangeCount}/${maxNoChangeCount})`);
    } else {
      noChangeCount = 0; // 閲嶇疆璁℃暟
    }

    lastHeight = currentHeight;

    // 濡傛灉杩橀渶瑕佹洿澶氾紝婊氬姩
    if (collectedPosts.size < targetCount && noChangeCount < maxNoChangeCount) {
      console.log('   馃攧 Scrolling down...');
      await mouseWheel(800);
      await mouseWheel(800);
      await new Promise(r => setTimeout(r, 3000)); // 绛夊緟鍔犺浇
      scrollCount++;
    } else {
      if (collectedPosts.size >= targetCount) {
        console.log('   鉁?Target count reached!');
      } else if (noChangeCount >= maxNoChangeCount) {
        console.log('   鉁?Reached bottom of page!');
      }
    }
  }

  console.log(`\n鉁?Collection completed! Total: ${collectedPosts.size} posts`);
  return Array.from(collectedPosts.values());
}

async function generateMarkdown(posts: any[], filename: string) {
  const lines = [
    '# 寰崥閲囬泦缁撴灉',
    '',
    `閲囬泦鏃堕棿锛?{new Date().toLocaleString('zh-CN')}`,
    `甯栧瓙鏁伴噺锛?{posts.length}`,
    '',
    '---',
    ''
  ];

  posts.forEach((post: any, index: number) => {
    lines.push(`## ${index + 1}. ${post.author || 'Unknown Author'}`);
    lines.push('');

    if (post.content) {
      lines.push(`**Content:** ${post.content.substring(0, 500)}${post.content.length > 500 ? '...' : ''}`);
      lines.push('');
    }

    if (post.url) {
      lines.push(`**URL:** ${post.url}`);
      lines.push('');
    }

    if (post.timestamp) {
      lines.push(`**鏃堕棿锛?* ${post.timestamp}`);
      lines.push('');
    }

    if (post.authorUrl) {
      lines.push(`**浣滆€呴摼鎺ワ細** ${post.authorUrl}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  const content = lines.join('\n');
  await fs.writeFile(filename, content, 'utf-8');
  console.log(`鉁?Markdown saved to: ${filename}`);
}

async function main(input: { count?: number; output?: string }) {
  const { count = 250, output = 'weibo_posts_250.md' } = input;

  try {
    // 閲囬泦甯栧瓙
    const posts = await collectWeiboPosts(count);

    if (posts.length === 0) {
      console.log('鈿狅笍  No posts collected.');
      return;
    }

    // 鐢熸垚 Markdown
    console.log('\n2锔忊儯 Generating Markdown report...');
    await generateMarkdown(posts, output);

    // 鏄剧ず缁撴灉鎽樿
    console.log('\n馃搵 Collection Summary:');
    console.log(`   鉁?Total posts: ${posts.length}`);
    console.log(`   馃搧 Output file: ${output}`);
    console.log('\n馃帀 Collection completed!');

  } catch (error) {
    console.error('鉂?Error:', error.message);
    throw error;
  }
}

export { main as execute };
