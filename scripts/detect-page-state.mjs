#!/usr/bin/env node
/**
 * 通用页面状态检测脚本
 * 1. URL 先定位（粗判）
 * 2. 容器匹配做第二步（精判）
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

// 平台容器映射（按优先级排序）
const PLATFORM_CONTAINERS = {
  xiaohongshu: [
    { id: 'xiaohongshu_login.login_guard', name: '登录页', urlPattern: /\/login/ },
    { id: 'xiaohongshu_detail.modal_shell', name: '详情页', urlPattern: /\/explore\// },
    { id: 'xiaohongshu_search.search_result_list', name: '搜索结果页', urlPattern: /\/search_result/ },
    { id: 'xiaohongshu_home', name: '主页/推荐流', urlPattern: /\/explore/ },
  ],
  weibo: [
    { id: 'weibo_login.login_guard', name: '登录页', urlPattern: /\/signin/ },
    { id: 'weibo_detail.modal_shell', name: '详情页', urlPattern: /\/\d+\// },
    { id: 'weibo_search.feed_list', name: '搜索结果页', urlPattern: /\/search/ },
    { id: 'weibo_home.feed_list', name: '主页', urlPattern: /^https:\/\/weibo\.com\/?$/ },
  ],
};

async function getCurrentUrl(profile) {
  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: { profile, script: 'window.location.href' }
    })
  });
  const data = await response.json();
  return data.data?.result || data.result;
}

async function matchContainers(profile) {
  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'containers:match',
      payload: { profile }
    })
  });
  const data = await response.json();
  const rootId = data.data?.container?.id || data.container?.id || null;
  const matches = data.data?.snapshot?.matches || data.snapshot?.matches || {};
  const matchIds = Object.entries(matches)
    .filter(([, info]) => (info?.match_count ?? info?.matchCount ?? 0) > 0)
    .map(([id]) => id);
  return { rootId, matchIds };
}

function detectPlatformFromUrl(url) {
  if (url.includes('xiaohongshu.com')) return 'xiaohongshu';
  if (url.includes('weibo.com')) return 'weibo';
  return null;
}

function detectPageByContainer(matchIds, platformContainers, currentUrl) {
  const containerIds = new Set(matchIds);
  for (const def of platformContainers) {
    if (containerIds.has(def.id)) {
      // 对于搜索结果页，额外检查 URL 是否包含 search_result
      if (def.id === 'xiaohongshu_search.search_result_list') {
        if (!currentUrl.includes('search_result')) {
          continue; // 跳过搜索页，让主页匹配
        }
      }
      return def;
    }
  }
  return null;
}

function detectPageByUrl(url, platformContainers) {
  for (const def of platformContainers) {
    if (def.urlPattern && def.urlPattern.test(url)) {
      return def;
    }
  }
  return null;
}

async function main() {
  const profile = process.argv[2] || 'xiaohongshu_fresh';
  
  console.log(`🔍 通用页面状态检测\n`);
  console.log(`📌 Profile: ${profile}\n`);

  try {
    // 1. URL 定位（粗判）
    console.log('1️⃣ URL 定位...');
    const url = await getCurrentUrl(profile);
    console.log(`   URL: ${url}`);
    
    const platform = detectPlatformFromUrl(url);
    if (!platform) {
      console.log(`   ⚠️  无法从URL识别平台`);
      return;
    }
    console.log(`   平台: ${platform}`);
    
    const platformContainers = PLATFORM_CONTAINERS[platform];
    const urlDetection = detectPageByUrl(url, platformContainers);
    if (urlDetection) {
      console.log(`   URL判断: ${urlDetection.name}`);
    } else {
      console.log(`   URL判断: 未知页面`);
    }

    // 2. 容器匹配（精判）
    console.log('\n2️⃣ 容器匹配...');
    const { rootId, matchIds } = await matchContainers(profile);
    const containerDetection = detectPageByContainer([rootId, ...matchIds].filter(Boolean), platformContainers, url);

    if (containerDetection) {
      console.log(`   容器判断: ${containerDetection.name}`);
      console.log(`   命中容器: ${containerDetection.id}`);
      if (rootId) {
        console.log(`   根容器: ${rootId}`);
      }
    } else {
      console.log(`   容器判断: 未匹配到已知页面`);
      if (rootId) {
        console.log(`   根容器: ${rootId}`);
      }
      console.log(`   当前容器列表: ${matchIds.slice(0, 10).join(', ')}`);
    }

    // 3. 综合判断
    console.log('\n3️⃣ 综合判断...');
    if (urlDetection && containerDetection) {
      if (urlDetection.id === containerDetection.id) {
        console.log(`   ✅ 状态一致: ${urlDetection.name}`);
      } else {
        console.log(`   ⚠️  状态不一致:`);
        console.log(`      URL判断: ${urlDetection.name}`);
        console.log(`      容器判断: ${containerDetection.name}`);
      }
    } else if (containerDetection) {
      console.log(`   ✅ 以容器为准: ${containerDetection.name}`);
    } else if (urlDetection) {
      console.log(`   ⚠️  仅URL判断: ${urlDetection.name} (容器未匹配)`);
    } else {
      console.log(`   ❌ 无法判断当前页面状态`);
    }

    // 4. 返回建议
    console.log('\n4️⃣ 返回建议...');
    if (containerDetection?.id === 'xiaohongshu_detail.modal_shell') {
      console.log('   当前在详情页，建议:');
      console.log('   - 按 ESC 或点击遮罩关闭');
      console.log('   - 或使用 history.back()');
    } else if (containerDetection?.id === 'xiaohongshu_search.search_result_list') {
      console.log('   当前在搜索结果页，可以进行:');
      console.log('   - 点击搜索结果进入详情');
      console.log('   - 或返回主页');
    } else if (containerDetection?.id === 'xiaohongshu_home') {
      console.log('   当前在主页，可以进行:');
      console.log('   - 点击搜索框进行搜索');
      console.log('   - 或浏览推荐内容');
    } else if (containerDetection?.id === 'xiaohongshu_login.login_guard') {
      console.log('   当前在登录页，需要登录后继续');
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
