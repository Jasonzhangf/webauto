#!/usr/bin/env node
/**
 * 分析小红书页面DOM结构
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const TARGET_URL = 'https://www.xiaohongshu.com';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function analyzeDOM() {
  console.log('=== 开始分析小红书页面DOM结构 ===\n');
  
  // 1. 先用container inspect查看容器结构
  console.log('1. 尝试容器匹配...');
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect',
    payload: {
      profile: PROFILE,
      url: TARGET_URL,
      maxDepth: 6,
      maxChildren: 30
    }
  });
  
  if (!inspect.data?.snapshot) {
    console.log('❌ 容器匹配失败，尝试直接分析DOM...\n');
    
    // 2. 直接分析DOM
    const domResult = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (() => {
            // 查找笔记卡片
            const noteCards = Array.from(document.querySelectorAll('.note-item, [class*="note-card"], [class*="feed-card"], article, section'));
            
            // 查找图片
            const images = Array.from(document.querySelectorAll('img[src*="sns"], img[src*="note"], img[alt]'));
            
            // 查找标题
            const titles = Array.from(document.querySelectorAll('[class*="title"], [class*="content"]'));
            
            // 查找作者信息
            const authors = Array.from(document.querySelectorAll('[class*="author"], [class*="user"]'));
            
            return {
              url: location.href,
              noteCards: noteCards.slice(0, 10).map(el => ({
                tagName: el.tagName,
                className: el.className.substring(0, 100),
                id: el.id.substring(0, 50)
              })),
              images: images.slice(0, 5).map(img => ({
                src: img.src.substring(0, 100),
                alt: img.alt,
                className: img.className.substring(0, 100)
              })),
              titles: titles.slice(0, 5).map(el => ({
                text: el.textContent.substring(0, 50),
                className: el.className.substring(0, 100)
              })),
              authors: authors.slice(0, 5).map(el => ({
                text: el.textContent.substring(0, 50),
                className: el.className.substring(0, 100)
              }))
            };
          })()
        `
      }
    });
    
    const dom = domResult.data?.result;
    console.log('DOM分析结果:');
    console.log('URL:', dom.url);
    console.log('\n笔记卡片:', dom.noteCards);
    console.log('\n图片:', dom.images);
    console.log('\n标题:', dom.titles);
    console.log('\n作者:', dom.authors);
    
    // 3. 查找特定的笔记容器类
    const specificClasses = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (() => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const feedRelated = allElements.filter(el => {
              const classes = Array.from(el.classList);
              return classes.some(c => c.includes('feed') || c.includes('waterfall') || c.includes('explore') || c.includes('masonry'));
            });
            
            return feedRelated.slice(0, 10).map(el => ({
              tagName: el.tagName,
              classList: Array.from(el.classList).slice(0, 5),
              childrenCount: el.children.length
            }));
          })()
        `
      }
    });
    
    console.log('\nFeed相关容器:', specificClasses.data?.result);
    
  } else {
    console.log('✅ 容器匹配成功！');
    const snapshot = inspect.data.snapshot;
    const root = snapshot.container_tree || snapshot.root_match?.container;
    
    console.log('根容器:', root.id);
    console.log('子容器数量:', root.children?.length || 0);
    
    if (root.children) {
      root.children.forEach((child, idx) => {
        console.log('\n' + (idx + 1) + '. ' + child.id + ' (' + child.name + ')');
        console.log('   匹配数: ' + (child.match?.match_count || 0));
        if (child.children?.length > 0) {
          console.log('   子容器数: ' + child.children.length);
          child.children.slice(0, 3).forEach((grandChild, gIdx) => {
            console.log('     - ' + grandChild.id);
          });
        }
      });
    }
    
    // 保存完整的snapshot到文件
    const fs = await import('fs/promises');
    const outputPath = '/tmp/xiaohongshu_container_snapshot.json';
    await fs.writeFile(outputPath, JSON.stringify(inspect.data, null, 2));
    console.log('\n✅ 完整容器快照已保存到: ' + outputPath);
  }
}

analyzeDOM().catch(console.error);
