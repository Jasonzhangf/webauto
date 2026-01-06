const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const TARGET_COUNT = 200;

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

class HumanizedExtractorV5 {
  constructor() {
    this.collectedPosts = [];
    this.processedUrls = new Set();
    this.scrollCount = 0;
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.lastHeightChangeTime = Date.now();
    this.HEIGHT_CHECK_COUNT = 5; // 更快判断是否需要加大滚动策略
    this.HEIGHT_CHECK_DELAY = 2000;
  }

  async scrollByPixels(deltaY) {
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `window.scrollBy(0, ${deltaY});`
      }
    });
  }

  async randomPause(minMs, maxMs) {
    const wait = minMs + Math.floor(Math.random() * (maxMs - minMs));
    log('WAIT', `Waiting ${wait}ms...`);
    await new Promise(r => setTimeout(r, wait));
  }

  async humanizedScrollWithBacktrack() {
    // 1) 小幅向下滚动
    const downStep = 200 + Math.floor(Math.random() * 300); // 200-500
    await this.scrollByPixels(downStep);
    this.scrollCount++;
    log('SCROLL', `Down scroll ${downStep}px (count: ${this.scrollCount})`);
    await this.randomPause(800, 1600);

    // 2) 向上回滚
    const upStep = 100 + Math.floor(Math.random() * 200); // 100-300
    await this.scrollByPixels(-upStep);
    this.scrollCount++;
    log('SCROLL', `Up scroll ${upStep}px (count: ${this.scrollCount})`);
    await this.randomPause(1200, 2000);

    // 3) 向下滚动更长距离
    const longDown = 600 + Math.floor(Math.random() * 700); // 600-1300
    await this.scrollByPixels(longDown);
    this.scrollCount++;
    log('SCROLL', `Long down scroll ${longDown}px (count: ${this.scrollCount})`);
    await this.randomPause(1500, 3000);
  }

  async executeExtraction() {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `(() => {
          const articles = Array.from(document.querySelectorAll('article'));
          const results = [];

          for (const article of articles) {
            const links = Array.from(article.querySelectorAll('a[href]'));
            let postUrl = null;
            let authorUrl = null;
            let author = '';
            let content = '';
            let timestamp = '';

            for (const link of links) {
              const href = link.href || '';
              try {
                const url = new URL(href, window.location.origin);
                if (url.hostname === 'weibo.com' && /^\\/\\d+\\/[A-Za-z0-9]+$/.test(url.pathname)) {
                  postUrl = url.href;
                  break;
                }
              } catch {}
            }

            for (const link of links) {
              const href = link.href || '';
              if (href.includes('/u/')) {
                authorUrl = href;
                author = link.getAttribute('aria-label') || link.textContent.trim();
                break;
              }
            }

            const contentEl = article.querySelector('[class*="detail_wbtext"]');
            const timeEl = article.querySelector('time');

            if (contentEl) content = contentEl.textContent.trim();
            if (timeEl) timestamp = timeEl.textContent.trim();

            if (postUrl && content) {
              results.push({
                author,
                content,
                url: postUrl,
                authorUrl,
                timestamp
              });
            }
          }

          return results;
        })()`
      }
    });

    if (!result.success) {
      log('ERROR', 'Extraction failed: ' + (result.error || 'unknown error'));
      return [];
    }

    return result.data?.result || [];
  }

  async checkScrollHeight() {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: '() => ({ height: document.body.scrollHeight })'
      }
    });

    if (!result.success) {
      log('ERROR', 'Failed to check scroll height');
      return false;
    }

    const newHeight = result.data?.result?.height || 0;

    if (newHeight === this.currentHeight) {
      const now = Date.now();
      if (now - this.lastHeightChangeTime >= this.HEIGHT_CHECK_DELAY) {
        this.heightUnchangedCount++;
        log('SCROLL', `Height unchanged ${this.heightUnchangedCount}/${this.HEIGHT_CHECK_COUNT} (${newHeight}px)`);
        this.lastHeightChangeTime = now;
      }
    } else {
      log('SCROLL', `Height changed: ${this.currentHeight} -> ${newHeight}`);
      this.currentHeight = newHeight;
      this.heightUnchangedCount = 0;
      this.lastHeightChangeTime = Date.now();
    }

    return this.heightUnchangedCount >= this.HEIGHT_CHECK_COUNT;
  }

  async collectLoop() {
    log('INIT', 'Starting humanized extraction with incremental scroll strategy');
    
    await this.randomPause(4000, 8000);

    while (this.collectedPosts.length < TARGET_COUNT) {
      const posts = await this.executeExtraction();
      let newPosts = 0;

      for (const post of posts) {
        if (this.collectedPosts.length >= TARGET_COUNT) break;
        if (!post.url || this.processedUrls.has(post.url)) continue;

        this.processedUrls.add(post.url);
        this.collectedPosts.push(post);
        newPosts++;
      }
      
      if (newPosts > 0) {
        log('COLLECT', `Collected ${newPosts} new posts. Total: ${this.collectedPosts.length}/${TARGET_COUNT}`);
        this.heightUnchangedCount = 0;
      } else {
        log('COLLECT', `No new posts found (total: ${this.collectedPosts.length}/${TARGET_COUNT})`);
      }

      if (this.collectedPosts.length >= TARGET_COUNT) {
        log('DONE', 'Target count reached!');
        break;
      }

      const atBottom = await this.checkScrollHeight();
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page (no height change after multiple attempts)');
        break;
      }

      await this.humanizedScrollWithBacktrack();
      await this.randomPause(2000, 5000);
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果 (拟人化滚动 v5)',
      '',
      `采集时间：${new Date().toLocaleString('zh-CN')}`,
      `帖子数量：${this.collectedPosts.length}`,
      `滚动次数：${this.scrollCount}`,
      '',
      '---',
      ''
    ];

    this.collectedPosts.forEach((post, index) => {
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
    const filename = 'weibo_posts_200_human_v5.md';
    await fs.writeFile(filename, content, 'utf-8');
    log('OUTPUT', `Markdown saved to: ${filename}`);
    
    console.log('\n📋 Collection Summary:');
    console.log(`   ✅ Total posts: ${this.collectedPosts.length}`);
    console.log(`   📁 Output file: ${filename}`);
    console.log(`   📜 Scroll count: ${this.scrollCount}`);
    console.log('\n🎉 Collection completed!');
  }

  async start() {
    try {
      await this.collectLoop();
      await this.generateMarkdown();
    } catch (err) {
      log('ERROR', err.message);
      console.error(err);
      process.exit(1);
    }
  }
}

new HumanizedExtractorV5().start();
