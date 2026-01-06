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

class HumanizedExtractorV4 {
  constructor() {
    this.collectedPosts = [];
    this.processedUrls = new Set();
    this.scrollCount = 0;
    this.currentHeight = 0;
    this.heightUnchangedCount = 0;
    this.lastHeightChangeTime = Date.now();
    this.HEIGHT_CHECK_COUNT = 20; // 增加检查次数，因为微博有反爬机制
    this.HEIGHT_CHECK_DELAY = 5000; // 增加延迟时间
  }

  /**
   * 更拟人化的滚动策略：
   * 1. 向下滚动一段
   * 2. 等待
   * 3. 向上回滚（模拟用户回看）
   * 4. 再向下滚动到底部
   * 5. 随机化滚动距离和速度
   * 6. 增加等待时间变化
   */
  async humanizedScroll() {
    await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (() => {
            const current = window.scrollY;
            const maxScroll = document.body.scrollHeight - window.innerHeight;
            
            // 随机向下滚动距离 (300-700px) - 减小滚动距离避免触发反爬
            const scrollDown = 300 + Math.floor(Math.random() * 400);
            const targetDown = Math.min(current + scrollDown, maxScroll);
            
            // 第一步：向下滚动
            window.scrollTo({
              top: targetDown,
              behavior: 'auto' // 使用 'auto' 而不是 'smooth'，更像真实用户
            });
            
            // 等待
            const waitTime = 1000 + Math.random() * 2000; // 增加初始等待时间
            
            setTimeout(() => {
              // 第二步：向上滚动 (模拟用户回看)
              const scrollUp = 100 + Math.floor(Math.random() * 300); // 向上滚动较小距离
              const targetUp = Math.max(0, targetDown - scrollUp);
              
              window.scrollTo({
                top: targetUp,
                behavior: 'auto'
              });
              
              // 再等待一段时间后滚到底部
              setTimeout(() => {
                // 随机决定是否滚到底部或只滚动一部分
                if (Math.random() > 0.3) {
                  // 滚动到底部
                  window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'auto'
                  });
                } else {
                  // 只滚动到中间位置
                  const halfScroll = current + Math.floor((maxScroll - current) / 2);
                  window.scrollTo({
                    top: Math.min(halfScroll, maxScroll),
                    behavior: 'auto'
                  });
                }
              }, 1500 + Math.random() * 1000); // 增加等待时间
            }, waitTime);
          })()
        `
      }
    });
    this.scrollCount++;
    log('SCROLL', `Humanized scroll executed (count: ${this.scrollCount})`);
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

            // 查找帖子链接 - 更精确的正则表达式
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

            // 查找作者链接
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
    log('INIT', 'Starting humanized extraction with advanced up-scroll pattern');
    
    // 初始等待，确保页面完全加载
    await new Promise(r => setTimeout(r, 8000));

    while (this.collectedPosts.length < TARGET_COUNT) {
      // 1. 提取数据
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
        this.heightUnchangedCount = 0; // 有新内容时重置计数
      } else {
        log('COLLECT', `No new posts found (total: ${this.collectedPosts.length}/${TARGET_COUNT})`);
      }

      if (this.collectedPosts.length >= TARGET_COUNT) {
        log('DONE', 'Target count reached!');
        break;
      }

      // 2. 检查是否到底
      const atBottom = await this.checkScrollHeight();
      if (atBottom) {
        log('SCROLL', 'Reached bottom of page (no height change after multiple attempts)');
        break;
      }

      // 3. 拟人化滚动
      await this.humanizedScroll();
      
      // 4. 等待内容加载（使用更长的随机时间）
      const loadTime = 6000 + Math.floor(Math.random() * 4000); // 6-10秒
      log('WAIT', `Waiting ${loadTime}ms for content to load...`);
      await new Promise(r => setTimeout(r, loadTime));
    }
  }

  async generateMarkdown() {
    const fs = await import('fs/promises');
    
    const lines = [
      '# 微博主页采集结果 (拟人化滚动 v4)',
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
    const filename = 'weibo_posts_200_human_v4.md';
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

new HumanizedExtractorV4().start();
