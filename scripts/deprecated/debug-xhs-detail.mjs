/**
 * Step 3: 小红书详情页交互脚本（Unattached模式）
 * 功能：测试详情页打开、评论展开
 * 改进：测试完成后恢复到初始状态，不破坏session
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function httpPost(endpoint, payload) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function controllerAction(action, payload) {
  return httpPost('/v1/controller/action', { action, payload });
}

async function getCurrentUrl() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'location.href'
  });
  return result.data?.result || '';
}

async function getFirstNoteItem() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const items = document.querySelectorAll('.note-item');
      if (items.length > 0) {
        const item = items[0];
        const link = item.querySelector('a[href*="/explore/"]');
        return {
          hasItem: true,
          href: link ? link.href : null,
          title: item.textContent.substring(0, 50)
        };
      }
      return { hasItem: false };
    })()`
  });
  return result.data?.result || {};
}

async function highlightFirstItem() {
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const item = document.querySelectorAll('.note-item')[0];
      if (item) {
        item.style.outline = '3px solid #ea4335';
        setTimeout(() => item.style.outline = '', 2000);
      }
    })()`
  });
}

async function openDetailPage(href) {
  console.log(`   🔗 打开详情: ${href}`);
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `window.location.href = '${href}'`
  });
  await new Promise(r => setTimeout(r, 3000));
}

async function checkDetailPage() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const modal = document.querySelector('.note-detail-mask, .note-detail');
      const title = document.querySelector('.note-content .title, .title');
      const commentSection = document.querySelector('.comment-list, [class*="comment"]');
      
      return {
        hasModal: Boolean(modal),
        hasTitle: Boolean(title),
        hasComments: Boolean(commentSection),
        title: title ? title.textContent.substring(0, 50) : ''
      };
    })()`
  });
  return result.data?.result || {};
}

async function expandComments() {
  console.log('   📝 查找并展开评论...');
  let totalExpanded = 0;
  
  for (let i = 0; i < 5; i++) {
    // 滚动到评论区
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `window.scrollBy(0, 600)`
    });
    await new Promise(r => setTimeout(r, 800));
    
    // 查找并点击展开按钮
    const expanded = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `(() => {
        const buttons = Array.from(document.querySelectorAll('.show-more, [class*="show-more"], [class*="expand"]'))
          .filter(btn => btn.textContent.includes('展开') || btn.textContent.includes('回复'));
        
        let clicked = 0;
        buttons.forEach(btn => {
          if (btn.offsetParent !== null) {
            btn.click();
            clicked++;
          }
        });
        
        return clicked;
      })()`
    });
    
    const clickedCount = expanded.data?.result || 0;
    totalExpanded += clickedCount;
    console.log(`   第 ${i + 1} 轮: 展开了 ${clickedCount} 个按钮`);
    
    if (clickedCount === 0) {
      break;
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return totalExpanded;
}

async function countComments() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const comments = document.querySelectorAll('.comment-item, [class*="comment-item"]');
      const endMarker = document.querySelector('.end-container, [class*="end"]');
      const emptyState = document.querySelector('.empty, [class*="empty"]');
      
      return {
        count: comments.length,
        hasEndMarker: Boolean(endMarker),
        isEmpty: Boolean(emptyState)
      };
    })()`
  });
  return result.data?.result || {};
}

async function closeDetailAndReturn(initialUrl) {
  console.log('\n🔙 关闭详情页，恢复到初始状态...');
  
  // 尝试方式1: 点击关闭按钮
  const closedByButton = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const closeBtn = document.querySelector('.note-detail-mask [class*="close"], .note-detail .close');
      if (closeBtn) {
        closeBtn.click();
        return true;
      }
      return false;
    })()`
  });
  
  if (closedByButton.data?.result) {
    console.log('   ✅ 通过关闭按钮返回');
    await new Promise(r => setTimeout(r, 2000));
    return;
  }
  
  // 方式2: 浏览器后退
  console.log('   ⚠️  未找到关闭按钮，使用浏览器后退...');
  await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `window.history.back()`
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // 验证是否回到初始页面
  const currentUrl = await getCurrentUrl();
  if (!currentUrl.includes('/search_result') && initialUrl) {
    console.log(`   ⚠️  未回到搜索页，手动导航到初始URL...`);
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `window.location.href = '${initialUrl}'`
    });
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function main() {
  console.log('📄 小红书详情页交互测试开始（Unattached模式）...\n');

  let initialUrl = '';
  
  try {
    // 0. 记录初始URL
    initialUrl = await getCurrentUrl();
    console.log(`💾 记录初始URL: ${initialUrl}\n`);
    
    // 1. 检查当前页面
    console.log('1️⃣ 检查当前页面...');
    const url = await getCurrentUrl();
    console.log(`   ✅ URL: ${url}`);
    
    if (!url.includes('search_result')) {
      console.log('   ⚠️  不在搜索页，请先运行 debug-xhs-search.mjs');
      console.log('   💡 或手动导航到搜索页: https://www.xiaohongshu.com/search_result');
      process.exit(1);
    }
    console.log('');

    // 2. 获取第一个笔记
    console.log('2️⃣ 获取第一个笔记...');
    const firstItem = await getFirstNoteItem();
    
    if (!firstItem.hasItem || !firstItem.href) {
      console.log('   ❌ 没有找到笔记项');
      process.exit(1);
    }
    
    console.log(`   ✅ 找到笔记: ${firstItem.title}...`);
    console.log(`   🔗 链接: ${firstItem.href}\n`);

    // 3. 高亮并打开
    console.log('3️⃣ 高亮并打开详情页...');
    await highlightFirstItem();
    await new Promise(r => setTimeout(r, 2000));
    await openDetailPage(firstItem.href);
    console.log('');

    // 4. 检查详情页加载
    console.log('4️⃣ 检查详情页...');
    const detailInfo = await checkDetailPage();
    console.log(`   ${detailInfo.hasModal ? '✅' : '❌'} Modal: ${detailInfo.hasModal}`);
    console.log(`   ${detailInfo.hasTitle ? '✅' : '❌'} Title: ${detailInfo.hasTitle}`);
    console.log(`   ${detailInfo.hasComments ? '✅' : '❌'} Comments: ${detailInfo.hasComments}`);
    if (detailInfo.title) {
      console.log(`   📝 标题: ${detailInfo.title}...`);
    }
    console.log('');

    // 5. 展开评论
    console.log('5️⃣ 展开评论...');
    const expandedCount = await expandComments();
    console.log(`   ✅ 总共展开: ${expandedCount} 个按钮\n`);

    // 6. 统计评论
    console.log('6️⃣ 统计评论...');
    const commentStats = await countComments();
    console.log(`   📊 评论数量: ${commentStats.count}`);
    console.log(`   ${commentStats.hasEndMarker ? '✅' : '❌'} 结束标记: ${commentStats.hasEndMarker}`);
    console.log(`   ${commentStats.isEmpty ? '⚠️' : '✅'} 空状态: ${commentStats.isEmpty}`);

    // 7. 关闭详情，恢复状态
    await closeDetailAndReturn(initialUrl);
    
    const finalUrl = await getCurrentUrl();
    console.log(`   ✅ 当前URL: ${finalUrl}`);
    console.log('');

    // 8. 总结
    console.log('📊 详情页测试完成！');
    console.log(`   - 详情页加载：${detailInfo.hasModal && detailInfo.hasTitle ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   - 评论展开：${expandedCount > 0 ? '✅ 成功' : '⚠️  无展开按钮'}`);
    console.log(`   - 评论数量：${commentStats.count}`);
    console.log(`   - 状态恢复：${finalUrl === initialUrl ? '✅ 已恢复' : '⚠️  部分恢复'}`);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    
    // 错误恢复
    if (initialUrl) {
      console.log(`\n🔧 尝试恢复到初始URL: ${initialUrl}`);
      try {
        await controllerAction('browser:execute', {
          profile: PROFILE,
          script: `window.location.href = '${initialUrl}'`
        });
        console.log('   ✅ 已尝试恢复');
      } catch (err) {
        console.log('   ❌ 恢复失败，请手动导航');
      }
    }
    
    process.exit(1);
  }
}

main();
