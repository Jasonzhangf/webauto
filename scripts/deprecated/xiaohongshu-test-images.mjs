#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书图片提取与下载测试
 * - 先检查登录锚点，如未登录自动跳转登录页等待人工完成
 * - 复用 xiaohongshu_fresh session，避免裸登
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORD = '手机膜';
const SEARCH_URL = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(KEYWORD)}&source=web_search_result_notes&type=51`;
const LOGIN_URL = 'https://www.xiaohongshu.com/login';
const OUTPUT_ROOT = path.join(process.cwd(), 'xiaohongshu_images');

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

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getCurrentUrl() {
  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href` }
  })).data?.result || '';
}

async function navigate(url) {
  await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script: `location.href = '${url}'` }
  });
}

async function hasLoginAnchor() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const state = window.__INITIAL_STATE__?.user?.isLogin;
        if (state) return true;
        const selectors = [
          '.header-avatar img',
          '.creator-avatar img',
          '.user-avatar img',
          '.avatar img',
          '[class*="avatar"] img',
          'img[src*="avatar"]'
        ];
        for (const sel of selectors) {
          const node = document.querySelector(sel);
          if (node && node.clientWidth > 0 && node.clientHeight > 0) return true;
        }
        return false;
      })()`
    }
  });
  return Boolean(result.data?.result);
}

async function ensureLoggedIn() {
  log('LOGIN', '检测登录状态...');
  if (await hasLoginAnchor()) {
    log('LOGIN', '已检测到登录锚点');
    return;
  }

  const returnUrl = await getCurrentUrl();
  log('LOGIN', '未登录，跳转到登录页，请在浏览器中完成登录...');
  const loginUrl = `${LOGIN_URL}?redirectPath=${encodeURIComponent(returnUrl || SEARCH_URL)}`;
  await navigate(loginUrl);
  await delay(3000);

  for (let i = 0; i < 24; i++) {
    if (await hasLoginAnchor()) {
      log('LOGIN', '检测到登录成功，返回任务页面');
      await navigate(returnUrl || SEARCH_URL);
      await delay(4000);
      return;
    }
    await delay(5000);
  }
  throw new Error('登录超时，请完成登录后重试');
}

async function ensureSearchPage() {
  const url = await getCurrentUrl();
  if (!url.startsWith('https://www.xiaohongshu.com/search_result')) {
    log('NAV', `跳转到关键字 ${KEYWORD} 搜索页`);
    await navigate(SEARCH_URL);
    await delay(4000);
  } else {
    log('NAV', '已在搜索页');
  }
}

async function extractNotes(limit = 5) {
  const script = `(() => {
    const items = [];
    const els = document.querySelectorAll('.note-item');
    for (let i = 0; i < Math.min(${limit}, els.length); i++) {
      const el = els[i];
      const hiddenLink = el.querySelector('a[href^="/explore/"]');
      const coverLink = el.querySelector('a.cover');
      const noteId = hiddenLink ? (hiddenLink.href.match(/\\/explore\\/([a-f0-9]+)/)?.[1] || '') : '';
      let detailUrl = '';
      if (coverLink && coverLink.href && noteId) {
        const coverUrl = new URL(coverLink.href, location.origin);
        const token = coverUrl.searchParams.get('xsec_token') || '';
        const source = coverUrl.searchParams.get('xsec_source') || 'pc_search';
        detailUrl = 'https://www.xiaohongshu.com/explore/' + noteId +
          '?xsec_token=' + encodeURIComponent(token) +
          '&xsec_source=' + encodeURIComponent(source) +
          '&source=web_search_result_notes';
      } else if (hiddenLink && hiddenLink.href) {
        detailUrl = new URL(hiddenLink.getAttribute('href'), location.origin).href;
      }
      items.push({
        index: i,
        noteId,
        title: el.textContent.trim().substring(0, 60),
        detailUrl
      });
    }
    return items;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || [];
}

async function extractImages() {
  const script = `(() => {
    const data = [];
    const selectors = [
      'img.note-slider-image',
      '.note-slider-img img',
      '.swiper-slide img',
      '.note-content img',
      'img[src*="sns-img"]'
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(img => {
        if (img.src && !data.includes(img.src)) {
          data.push(img.src);
        }
      });
    });
    const bgNodes = document.querySelectorAll('.note-slider-image, [style*="background-image"]');
    bgNodes.forEach(node => {
      const style = window.getComputedStyle(node);
      const bg = style.backgroundImage;
      if (bg && bg.includes('url')) {
        const match = bg.match(/url\("?(.*?)"?\)/);
        if (match && match[1] && !data.includes(match[1])) {
          data.push(match[1]);
        }
      }
    });
    return data;
  })()`;

  return (await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  })).data?.result || [];
}

async function getBrowserHeaders() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `({ ua: navigator.userAgent, cookie: document.cookie })`
    }
  });
  const data = result.data?.result || {};
  return {
    'User-Agent': data.ua || 'Mozilla/5.0',
    'Cookie': data.cookie || '',
    'Referer': 'https://www.xiaohongshu.com/'
  };
}

async function downloadImages(urls, destDir, headers) {
  await fs.mkdir(destDir, { recursive: true });
  const saved = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = url.includes('.png') ? '.png' : '.jpg';
    const filename = `${String(i + 1).padStart(2, '0')}${ext}`;
    const destPath = path.join(destDir, filename);
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      await fs.writeFile(destPath, Buffer.from(buffer));
      saved.push({ filename, path: destPath });
      log('DOWNLOAD', `成功保存 ${filename}`);
    } catch (err) {
      log('DOWNLOAD', `保存 ${filename} 失败: ${err.message}`);
    }
    await delay(400);
  }
  return saved;
}

async function main() {
  try {
    log('INIT', `=== 图片提取/下载测试 (关键字: ${KEYWORD}) ===`);
    await ensureLoggedIn();
    await ensureSearchPage();
    await delay(2000);

    const notes = await extractNotes();
    const note = notes.find(n => n.detailUrl && n.noteId);
    if (!note) {
      throw new Error('未找到可用帖子，请更换关键字');
    }
    log('TEST', `处理帖子: ${note.title} (${note.noteId})`);

    await navigate(note.detailUrl);
    await delay(4000);

    const images = await extractImages();
    log('IMAGE', `检测到 ${images.length} 张图片`);
    if (images.length === 0) {
      log('IMAGE', '没有检测到图片，可能是视频或懒加载');
      return;
    }

    const headers = await getBrowserHeaders();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const noteDir = path.join(OUTPUT_ROOT, `${note.noteId}_${timestamp}`);
    const saved = await downloadImages(images, noteDir, headers);
    log('RESULT', `成功下载 ${saved.length}/${images.length} 张图片，目录: ${noteDir}`);
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  }
}

main();
