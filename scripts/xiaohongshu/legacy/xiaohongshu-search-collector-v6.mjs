#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书搜索采集脚本 v6
 * 修复：1. 增强滚动翻页逻辑 2. 优化去重（只处理新节点） 3. 集成评论采集
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const TARGET_COUNT = 50;
const MAX_NO_NEW = 5;
const KEYWORD = 'oppo小平板';

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

function generateSearchUrl(keyword) {
  const encoded = encodeURIComponent(keyword);
  return `https://www.xiaohongshu.com/search_result?keyword=${encoded}&source=unknown`;
}

async function navigate(url) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `window.location.href = "${url}"`
    }
  });
}

// 获取当前页面所有笔记的基本信息（用于索引定位）
async function getSearchResults() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const items = [];
          const els = document.querySelectorAll('.note-item');
          for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const linkEl = el.querySelector('a');
            const href = linkEl ? linkEl.href : '';
            let noteId = '';
            if (href) {
              const match = href.match(/\\/explore\\/([a-f0-9]+)/);
              if (match) noteId = match[1];
            }
            // 使用 textContent 作为指纹辅助去重
            const title = el.textContent.substring(0, 50).trim();
            items.push({
              index: i,
              noteId: noteId,
              title: title
            });
          }
          return items;
        })()`
    }
  });
  return result.data?.result || [];
}

async function clickNoteImage(index) {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const els = document.querySelectorAll('.note-item');
          const target = els[${index}];
          if (!target) return { clicked: false };
          const img = target.querySelector('img');
          if (!img) return { clicked: false };
          img.click();
          return { clicked: true };
        })()`
    }
  });
  return result.data?.result;
}

async function getCurrentUrl() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `location.href`
    }
  });
  return result.data?.result || '';
}

// 采集详情（包含评论）
async function extractNoteDetail() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          let title = '';
          let author = '';
          let content = '';
          
          const titleEl = document.querySelector('[class*="title"]');
          if (titleEl) title = titleEl.textContent.trim();
          
          const authorEl = document.querySelector('[class*="author"]');
          if (authorEl) author = authorEl.textContent.trim();
          
          const contentEl = document.querySelector('[class*="content"]');
          if (contentEl) content = contentEl.textContent.trim();
          
          const imgUrls = [];
          const imgs = document.querySelectorAll('img');
          for (let i = 0; i < imgs.length; i++) {
            const src = imgs[i].src;
            if (src && !src.startsWith('data:')) {
              imgUrls.push(src);
            }
            if (imgUrls.length >= 5) break;
          }

          // 采集评论
          const comments = [];
          const commentEls = document.querySelectorAll('.comment-item');
          for (let i = 0; i < commentEls.length; i++) {
             if (i >= 5) break; // 只取前5条热评
             const el = commentEls[i];
             const text = el.textContent.trim();
             if (text) comments.push(text);
          }
          
          return { title, author, content, images: imgUrls, comments };
        })()`
    }
  });
  return result.data?.result || {};
}

// 增强的滚动逻辑：滚动到底部并等待加载
async function scrollAndLoad() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
          const oldHeight = document.body.scrollHeight;
          window.scrollTo(0, oldHeight);
          return oldHeight;
        })()`
    }
  });
  
  // 等待加载
  await new Promise(r => setTimeout(r, 4000));
  
  // 检查高度变化
  const checkResult = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `document.body.scrollHeight`
    }
  });
  
  const oldH = result.data?.result;
  const newH = checkResult.data?.result;
  
  return newH > oldH; // 返回是否有新内容加载
}

async function main() {
  const searchUrl = generateSearchUrl(KEYWORD);
  log('INIT', `Search URL: ${searchUrl}`);

  await navigate(searchUrl);
  await new Promise(r => setTimeout(r, 5000));

  const collected = [];
  const processedKeys = new Set(); // 使用 title+author 作为指纹去重
  const clickedIndices = new Set(); // 记录本次搜索页已点击的索引（防止页面未刷新时重复点）
  
  let noNewCount = 0;

  while (collected.length < TARGET_COUNT && noNewCount < MAX_NO_NEW) {
    const results = await getSearchResults();
    let newFoundInBatch = false;

    // 遍历当前页面的所有笔记
    for (let i = 0; i < results.length; i++) {
      if (collected.length >= TARGET_COUNT) break;

      const item = results[i];
      // 简单指纹：如果能在列表页拿到标题最好，拿不到就用索引辅助
      // 但列表页DOM会变，最靠谱的是先排除已点击的index（假设未发生滚动DOM变化）
      // **重要**：滚动加载后，DOM是追加的，所以旧的index对应的内容不变，新的index在后面
      
      // 如果这个位置已经处理过，跳过
      if (clickedIndices.has(item.index)) continue;
      
      // 如果没有 ID，可能是加载中的占位符，跳过
      if (!item.noteId) continue;

      clickedIndices.add(item.index); // 标记该位置已处理

      log('CLICK', `Processing index ${item.index}: ${item.title.substring(0, 15)}...`);
      await clickNoteImage(item.index);
      await new Promise(r => setTimeout(r, 3000)); // 等待详情页加载

      const detailUrl = await getCurrentUrl();
      const detailData = await extractNoteDetail();

      // 二次去重：基于详情页内容
      const detailKey = detailData.title + '-' + detailData.author;
      if (processedKeys.has(detailKey)) {
        log('SKIP', `Duplicate content: ${detailData.title}`);
        await navigate(searchUrl); // 回退
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      processedKeys.add(detailKey);
      newFoundInBatch = true;

      collected.push({
        noteId: item.noteId,
        detailUrl: detailUrl,
        ...detailData
      });

      log('COLLECT', `Collected ${collected.length}/${TARGET_COUNT} - ${detailData.title.substring(0, 15)}...`);

      // 关键：必须回退到搜索页才能继续点下一个
      // 注意：小红书详情页是全屏覆盖还是跳转？如果是跳转，back() 会回到搜索页
      // 但回到搜索页后，DOM 状态（滚动位置）可能会丢失！
      // 策略：小红书点击图片通常是模态框（URL变了但页面没刷新），或者伪跳转
      // 如果是模态框，点击遮罩或关闭按钮即可。但我们之前发现 URL 变了。
      // 如果 back() 导致页面刷新，滚动位置丢失，那么 index 0 又变成了第一个。
      // **核心修正**：如果 back() 导致刷新，我们需要重新滚动到之前的位置，或者依赖去重逻辑跳过前 N 个。
      // 简单起见，我们使用 navigate(searchUrl) 可能会重置。
      // 更好的方式：使用 window.history.back()
      
      await post('/v1/controller/action', {
        action: 'browser:execute',
        payload: { profile: PROFILE, script: `window.history.back()` }
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!newFoundInBatch) {
      noNewCount++;
      log('SCROLL', `No new items in current view. Scrolling... (${noNewCount}/${MAX_NO_NEW})`);
      
      const loaded = await scrollAndLoad();
      if (loaded) {
        noNewCount = 0; // 重置计数，因为加载了新内容
        log('SCROLL', 'New content loaded.');
      } else {
        log('SCROLL', 'Bottom reached or load failed.');
      }
    } else {
      noNewCount = 0;
      // 即使这一批找到了，也要滚动加载更多，否则永远只有前24个
      // 只有当所有当前可见的都处理完了，才滚动
      // 上面的 for 循环是处理所有可见的。如果中途 break，说明还在处理可见的。
      // 这里简化逻辑：每处理完一批可见的（或者跳过了所有可见的），就滚动
      await scrollAndLoad();
    }
  }

  log('DONE', `Total collected: ${collected.length}`);

  // 生成 Markdown (同前，略微优化格式)
  const lines = [
    '# 小红书搜索结果',
    '',
    `采集时间：${new Date().toLocaleString('zh-CN')}`,
    `搜索关键词：${KEYWORD}`,
    `笔记数量：${collected.length}`,
    '',
    '---',
    ''
  ];

  for (let i = 0; i < collected.length; i++) {
    const note = collected[i];
    lines.push(`## ${i + 1}. ${note.title}`);
    lines.push('');
    lines.push(`**作者：** ${note.author}`);
    lines.push('');
    
    if (note.content) {
      let text = note.content.replace(/\n/g, '  \n'); // Markdown 换行
      if (text.length > 300) text = text.substring(0, 300) + '...';
      lines.push('**内容摘要：**  \n' + text);
      lines.push('');
    }

    if (note.comments && note.comments.length > 0) {
        lines.push('**热评：**');
        note.comments.forEach(c => lines.push(`> ${c}  `));
        lines.push('');
    }
    
    lines.push(`**链接：** [查看详情](${note.detailUrl})`);
    lines.push('');
    
    if (note.images && note.images.length > 0) {
      lines.push('**图片：**');
      for (let j = 0; j < note.images.length; j++) {
        lines.push(`![](${note.images[j]})`);
      }
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }

  const fs = await import('fs/promises');
  await fs.writeFile('xiaohongshu_search_results.md', lines.join('\n'), 'utf-8');
  log('OUTPUT', `Markdown saved to: xiaohongshu_search_results.md`);
}

main().catch(err => {
  log('ERROR', err.message);
  console.error(err);
});
