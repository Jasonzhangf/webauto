/**
 * Step 1: 小红书状态诊断脚本
 * 功能：检查当前页面状态、截图、高亮关键元素
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

async function takeScreenshot() {
  const result = await controllerAction('browser:screenshot', {
    profile: PROFILE,
    fullPage: false
  });
  return result.data?.screenshot || '';
}

async function getDOMSummary() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const noteItems = document.querySelectorAll('.note-item');
      const searchInput = document.querySelector('#search-input, input[type="search"]');
      const loginAnchors = document.querySelectorAll('[class*="avatar"], [class*="login"]');
      
      return {
        noteItems: noteItems.length,
        hasSearchInput: Boolean(searchInput),
        loginAnchors: loginAnchors.length,
        bodyClasses: Array.from(document.body.classList),
        title: document.title
      };
    })()`
  });
  return result.data?.result || {};
}

async function highlightElement(selector, color = '#ea4335') {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const el = document.querySelector('${selector}');
      if (el) {
        el.style.outline = '2px solid ${color}';
        setTimeout(() => el.style.outline = '', 2000);
        return true;
      }
      return false;
    })()`
  });
  return result.data?.result || false;
}

async function main() {
  console.log('🔍 小红书状态诊断开始...\n');

  try {
    // 1. 获取当前 URL
    console.log('1️⃣ 获取当前 URL...');
    const url = await getCurrentUrl();
    console.log(`   ✅ URL: ${url}\n`);

    // 2. 截图
    console.log('2️⃣ 截取当前页面...');
    const screenshot = await takeScreenshot();
    console.log(`   ✅ Screenshot: ${screenshot ? screenshot.substring(0, 50) + '...' : '无'}\n`);

    // 3. DOM 摘要
    console.log('3️⃣ 分析 DOM 结构...');
    const summary = await getDOMSummary();
    console.log('   ✅ DOM Summary:');
    console.log(JSON.stringify(summary, null, 2));
    console.log('');

    // 4. 高亮关键元素
    console.log('4️⃣ 高亮关键元素...');
    const noteHighlighted = await highlightElement('.note-item', '#34a853');
    console.log(`   ${noteHighlighted ? '✅' : '❌'} .note-item 高亮: ${noteHighlighted}`);
    
    await new Promise(r => setTimeout(r, 1000));
    
    const searchHighlighted = await highlightElement('#search-input, input[type="search"]', '#4285f4');
    console.log(`   ${searchHighlighted ? '✅' : '❌'} search-input 高亮: ${searchHighlighted}\n`);

    // 5. 总结
    console.log('📊 诊断完成！');
    console.log(`   - 当前页面：${url.includes('search_result') ? '搜索页' : url.includes('explore') ? '详情页' : url.includes('login') ? '登录页' : '其他页面'}`);
    console.log(`   - 笔记项数量：${summary.noteItems}`);
    console.log(`   - 搜索框：${summary.hasSearchInput ? '存在' : '不存在'}`);
    console.log(`   - 登录锚点：${summary.loginAnchors} 个`);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
