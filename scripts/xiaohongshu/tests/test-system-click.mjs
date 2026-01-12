#!/usr/bin/env node
/**
 * 测试 Playwright 鼠标点击功能
 * 流程：容器匹配 -> 获取坐标 -> 计算中心 -> Playwright 鼠标点击
 * 特性：自动检查和启动服务
 */

import { execSync } from 'child_process';

const PROFILE = 'xiaohongshu_fresh';
const UNIFIED_API_URL = 'http://127.0.0.1:7701';
const BROWSER_SERVICE_URL = 'http://127.0.0.1:7704';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP 调用辅助函数
async function httpPost(endpoint, payload) {
  const res = await fetch(`${UNIFIED_API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function controllerAction(action, payload) {
  return httpPost('/v1/controller/action', { action, payload });
}

// 健康检查函数
async function checkHealth(url) {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// 自动启动服务
async function ensureServices() {
  console.log('🔍 检查服务健康度...');
  
  const apiOk = await checkHealth(UNIFIED_API_URL);
  const browserOk = await checkHealth(BROWSER_SERVICE_URL);
  
  if (apiOk && browserOk) {
    console.log('✅ 所有服务已运行');
    return;
  }
  
  console.log('⚠️ 服务未就绪，启动 Phase1...');
  try {
    execSync('node scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('⏳ 等待服务启动...');
    await delay(5000);
    
    const apiOk2 = await checkHealth(UNIFIED_API_URL);
    const browserOk2 = await checkHealth(BROWSER_SERVICE_URL);
    
    if (!apiOk2 || !browserOk2) {
      throw new Error('服务启动失败或未在预期时间内就绪');
    }
    
    console.log('✅ 服务已启动');
  } catch (error) {
    console.error('❌ 启动服务失败:', error.message);
    throw error;
  }
}

async function main() {
  console.log('���️ 测试 Playwright 鼠标点击功能\n');

  try {
    await ensureServices();

    // 0. 确认会话存在（不主动导航，避免触发风控）
    console.log('🔍 检查会话状态...');
    const sessionList = await controllerAction('session:list', {});
    const sessions = sessionList?.data?.sessions || sessionList?.sessions || [];
    const session = sessions.find((item) => item.profileId === PROFILE || item.session_id === PROFILE);
    if (!session) {
      console.log('❌ 未检测到会话，请先运行 Phase1 并确保浏览器已打开');
      console.log('   建议命令: node scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs');
      return;
    }

    const currentUrl = session.current_url || '';
    if (!currentUrl.includes('xiaohongshu.com')) {
      console.log('❌ 当前会话不在小红书页面，请手动打开主页后重试');
      console.log(`   当前 URL: ${currentUrl || 'unknown'}`);
      return;
    }

    // 1. 确认当前页面已打开主页（允许 explore/search_result 重定向）
    console.log('\n1️⃣ 确认当前页面已打开主页或搜索页...');
    if (!currentUrl.includes('/explore') && !currentUrl.includes('/search_result')) {
      console.log('⚠️ 当前不在主页/搜索页，请手动回到主页后再运行');
      console.log(`   当前 URL: ${currentUrl}`);
      return;
    }

    // 2. 匹配搜索框容器
    console.log('\n2️⃣ 匹配搜索框容器...');
    const searchResult = await controllerAction('containers:match', {
      profileId: PROFILE,
      containerId: 'xiaohongshu_home.search_input'
    });

    if (!searchResult.containers || searchResult.containers.length === 0) {
      console.log('❌ 未找到搜索框容器');
      console.log('💡 建议：确保当前页面为小红书首页');
      return;
    }

    const searchContainer = searchResult.containers[0];
    console.log('✅ 找到搜索框容器');
    console.log('  Rect:', searchContainer.rect);

    // 4. 计算中心点
    const rect = searchContainer.rect;
    const centerX = Math.round(rect.x + rect.width / 2);
    const centerY = Math.round(rect.y + rect.height / 2);
    console.log('\n3️⃣ 计算中心点:');
    console.log(`  X: ${centerX}`);
    console.log(`  Y: ${centerY}`);

    // 5. 高亮确认
    console.log('\n4️⃣ 高亮确认位置...');
    await controllerAction('container:operation', {
      profileId: PROFILE,
      containerId: 'xiaohongshu_home.search_input',
      operation: 'highlight'
    });
    await delay(2000);

    // 6. Playwright 鼠标移动
    console.log('\n5️⃣ 使用 Playwright 鼠标移动到中心...');
    await controllerAction('mouse:move', {
      profileId: PROFILE,
      x: centerX,
      y: centerY,
      steps: 3
    });
    await delay(500);
    console.log('✅ 鼠标移动完成');

    // 7. Playwright 鼠标点击
    console.log('\n6️⃣ 使用 Playwright 鼠标点击...');
    await controllerAction('mouse:click', {
      profileId: PROFILE,
      x: centerX,
      y: centerY,
      button: 'left',
      clicks: 1
    });
    await delay(1000);
    console.log('✅ 鼠标点击完成');

    // 8. 验证结果
    console.log('\n7️⃣ 验证点击结果...');
    const focused = await controllerAction('browser:execute', {
      profileId: PROFILE,
      script: `(() => {
        const input = document.querySelector('.search-input input[type="text"]');
        return document.activeElement === input;
      })()`
    });
    console.log('搜索框是否聚焦:', focused.result);

    if (focused.result) {
      console.log('\n✅ Playwright 鼠标点击测试成功！');
    } else {
      console.log('\n⚠️ 点击执行了，但未检测到搜索框聚焦');
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) console.error('堆栈:', error.stack);
    process.exit(1);
  }
}

main();
