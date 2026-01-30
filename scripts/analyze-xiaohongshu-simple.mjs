#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('=== 小红书DOM分析 ===\n');
  
  // 1. 查找笔记容器
  const result1 = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `
        (() => {
          const feedContainer = document.querySelector('.feeds-page');
          if (!feedContainer) return { error: 'No feed container found' };
          
          const noteItems = Array.from(feedContainer.querySelectorAll('.note-item'));
          
          return {
            feedContainerClass: feedContainer.className,
            noteItemCount: noteItems.length,
            sampleNotes: noteItems.slice(0, 3).map(el => ({
              tagName: el.tagName,
              className: el.className,
              hasLink: !!el.querySelector('a'),
              linkHref: el.querySelector('a')?.href,
              hasImage: !!el.querySelector('img'),
              imgUrl: el.querySelector('img')?.src?.substring(0, 100)
            }))
          };
        })()
      `
    }
  });
  
  console.log('1. Feed容器分析:');
  console.log(JSON.stringify(result1.data?.result, null, 2));
  console.log();
  
  // 2. 查找图片和封面
  const result2 = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `
        (() => {
          const images = Array.from(document.querySelectorAll('.note-item img'));
          return {
            totalImages: images.length,
            sampleImages: images.slice(0, 3).map(img => ({
              src: img.src?.substring(0, 100),
              alt: img.alt,
              className: img.className
            }))
          };
        })()
      `
    }
  });
  
  console.log('2. 图片分析:');
  console.log(JSON.stringify(result2.data?.result, null, 2));
  console.log();
  
  // 3. 查找标题和描述
  const result3 = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `
        (() => {
          const noteItems = Array.from(document.querySelectorAll('.note-item')).slice(0, 3);
          return noteItems.map(el => {
            const link = el.querySelector('a');
            return {
              link: link?.href,
              allText: el.textContent.substring(0, 100),
              classList: Array.from(el.classList)
            };
          });
        })()
      `
    }
  });
  
  console.log('3. 笔记内容分析:');
  console.log(JSON.stringify(result3.data?.result, null, 2));
}

main().catch(console.error);
