/**
 * Step 2: 小红书搜索验证脚本（Unattached模式）
 * 功能：验证搜索功能，轮换关键字
 * 改进：优先使用刷新而非重新导航，保持session状态
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

const KEYWORDS = ['oppo小平板', '手机膜', '雷军', '小米', '华为', '鸿蒙'];

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

async function ensureSearchPage(keyword) {
  const url = await getCurrentUrl();
  
  if (url.includes('/search_result')) {
    console.log('   ✅ 已在搜索页，使用刷新而非重新导航...');
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `location.reload()`
    });
    await new Promise(r => setTimeout(r, 2000));
  } else if (url.includes('xiaohongshu.com')) {
    console.log('   ⚠️  在小红书其他页面，导航到搜索页...');
    // 在小红书内，直接导航到搜索页
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `window.location.href = 'https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes'`
    });
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log('   ❌ 不在小红书页面，请先手动导航到小红书');
    console.log('   💡 建议: 运行 node scripts/start-headful.mjs --profile xiaohongshu_fresh --url https://www.xiaohongshu.com');
    process.exit(1);
  }
}

async function performSearch(keyword) {
  console.log(`   🔎 搜索关键字: ${keyword}`);
  
  // 尝试使用搜索框
  const searchBoxUsed = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const input = document.querySelector('#search-input, input[type="search"]');
      if (input) {
        input.value = '${keyword.replace(/'/g, "\\'")}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return true;
      }
      return false;
    })()`
  });
  
  if (searchBoxUsed.data?.result) {
    console.log('   ✅ 使用搜索框输入');
  } else {
    console.log('   ⚠️  搜索框未找到，直接 URL 跳转');
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `window.location.href = 'https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes'`
    });
  }
  
  await new Promise(r => setTimeout(r, 3500));
}

async function highlightSearchBox() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const el = document.querySelector('#search-input, input[type="search"]');
      if (el) {
        el.style.outline = '3px solid #4285f4';
        setTimeout(() => el.style.outline = '', 2000);
        return true;
      }
      return false;
    })()`
  });
  return result.data?.result || false;
}

async function waitForResults() {
  console.log('   ⏳ 等待结果加载...');
  let lastCount = 0;
  let stableChecks = 0;
  
  for (let i = 0; i < 10; i++) {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `document.querySelectorAll('.note-item').length`
    });
    
    const currentCount = result.data?.result || 0;
    console.log(`   📊 当前笔记数: ${currentCount}`);
    
    if (currentCount === lastCount && currentCount > 0) {
      stableChecks++;
      if (stableChecks >= 2) {
        console.log('   ✅ 结果稳定');
        return currentCount;
      }
    } else {
      stableChecks = 0;
    }
    
    lastCount = currentCount;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return lastCount;
}

async function main() {
  console.log('🔎 小红书搜索验证开始（Unattached模式）...\n');

  let initialUrl = '';
  
  try {
    // 0. 记录初始URL（用于可选恢复）
    initialUrl = await getCurrentUrl();
    console.log(`💾 记录初始URL: ${initialUrl}\n`);
    
    // 1. 随机选择关键字
    const keyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
    console.log(`1️⃣ 选择关键字: "${keyword}"`);
    
    // 2. 确保在搜索页（优先刷新而非重新导航）
    console.log('\n2️⃣ 确保在搜索页...');
    await ensureSearchPage(keyword);
    const url = await getCurrentUrl();
    console.log(`   ✅ 当前URL: ${url}\n`);

    // 3. 高亮搜索框
    console.log('3️⃣ 高亮搜索框...');
    const highlighted = await highlightSearchBox();
    console.log(`   ${highlighted ? '✅' : '❌'} 搜索框高亮: ${highlighted}\n`);
    await new Promise(r => setTimeout(r, 2000));

    // 4. 执行搜索
    console.log(`4️⃣ 执行搜索 - 关键字: "${keyword}"`);
    await performSearch(keyword);
    console.log('');

    // 5. 等待并检查结果
    console.log('5️⃣ 检查搜索结果...');
    const count = await waitForResults();
    console.log('');

    // 6. 总结
    console.log('📊 搜索验证完成！');
    console.log(`   - 关键字：${keyword}`);
    console.log(`   - 结果数量：${count}`);
    console.log(`   - 状态：${count > 0 ? '✅ 成功' : '❌ 失败'}`);
    console.log(`\n💾 初始URL: ${initialUrl}`);
    console.log('   （如需恢复，请手动导航回去）');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (initialUrl) {
      console.log(`\n💡 提示: 可尝试导航回初始URL: ${initialUrl}`);
    }
    process.exit(1);
  }
}

main();
