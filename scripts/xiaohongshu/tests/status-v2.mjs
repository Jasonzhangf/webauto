#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书状态检查脚本 v2（基于容器驱动）
 * 功能：单命令输出当前会话状态、URL、登录态（基于容器匹配）、Cookie数量
 * 改进：完全基于容器 ID 判定登录状态，不再硬编码 DOM 逻辑
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function httpPost(endpoint, payload) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // 避免 containers:match 等长时间挂起
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function controllerAction(action, payload) {
  return httpPost('/v1/controller/action', { action, payload });
}

async function checkSession() {
  try {
    const result = await controllerAction('session:list', {});
    const sessions = result?.data?.sessions || result?.sessions || [];
    const session = sessions.find(s => s.profileId === PROFILE || s.sessionId === PROFILE);
    return session || null;
  } catch (error) {
    console.log('❌ 会话检查失败:', error.message);
    return null;
  }
}

async function getCurrentUrl() {
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: 'location.href'
    });
    return result?.data?.result || result?.result || '';
  } catch (error) {
    return '';
  }
}

function unwrapData(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if ('snapshot' in payload || 'result' in payload || 'sessions' in payload || 'matched' in payload) {
    return payload;
  }
  if ('data' in payload && payload.data) {
    return unwrapData(payload.data);
  }
  return payload;
}

function findContainer(tree, pattern) {
  if (!tree) return null;
  if (pattern.test(tree.id || tree.defId || '')) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findContainer(child, pattern);
      if (found) return found;
    }
  }
  return null;
}

async function checkLoginStateByContainer() {
  try {
    const url = await getCurrentUrl();
    const result = await controllerAction('containers:match', {
      profile: PROFILE,
      url: url,
      maxDepth: 3,
      maxChildren: 8
    });
    
    const data = unwrapData(result);
    const tree = data?.snapshot?.container_tree || data?.container_tree;
    
    // 检查已登录容器（*.login_anchor）
    const loginAnchor = findContainer(tree, /\.login_anchor$/);
    if (loginAnchor) {
      return {
        status: 'logged_in',
        container: loginAnchor.id || loginAnchor.defId,
        method: 'container_match'
      };
    }
    
    // 检查未登录容器（xiaohongshu_login.login_guard）
    const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
    if (loginGuard) {
      return {
        status: 'not_logged_in',
        container: loginGuard.id || loginGuard.defId,
        method: 'container_match'
      };
    }
    
    // 不确定状态
    return {
      status: 'uncertain',
      container: null,
      method: 'container_match',
      reason: '未匹配到 login_anchor 或 login_guard'
    };
  } catch (error) {
    return {
      status: 'error',
      container: null,
      method: 'container_match',
      error: error.message
    };
  }
}

async function getCookieCount() {
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: 'document.cookie.split(";").filter(c => c.trim()).length'
    });
    return result?.data?.result || result?.result || 0;
  } catch (error) {
    return 0;
  }
}

async function main() {
  console.log('🔍 小红书会话状态检查 v2（容器驱动）\n');

  // 检查会话是否存在
  console.log('1️⃣ 检查会话存在性...');
  const session = await checkSession();
  if (session) {
    console.log(`   ✅ ${PROFILE} 会话存在`);
    console.log(`      - 当前URL: ${session.current_url || session.currentUrl || '未知'}`);
    console.log(`      - 模式: ${session.mode || '未知'}`);
  } else {
    console.log('   ❌ 未找到 xiaohongshu_fresh 会话');
    console.log('   💡 建议: 先运行 node scripts/start-headful.mjs --profile xiaohongshu_fresh --url https://www.xiaohongshu.com');
    return;
  }

  // 获取当前URL
  console.log('\n2️⃣ 获取当前页面URL...');
  const url = await getCurrentUrl();
  if (url) {
    console.log(`   ✅ 当前URL: ${url}`);
    const pageType = url.includes('search_result') ? '搜索页' : 
                    url.includes('explore') ? '详情页' : 
                    url.includes('login') ? '登录页' : 
                    url.includes('profile') ? '个人主页' : 
                    '其他页面';
    console.log(`      - 页面类型: ${pageType}`);
  } else {
    console.log('   ❌ 无法获取当前URL，可能浏览器未响应');
    return;
  }

  // 检查登录状态（基于容器）
  console.log('\n3️⃣ 检查登录状态（基于容器匹配）...');
  const loginState = await checkLoginStateByContainer();
  
  if (loginState.status === 'logged_in') {
    console.log(`   ✅ 已登录`);
    console.log(`      - 匹配容器: ${loginState.container}`);
    console.log(`      - 判定方式: ${loginState.method}`);
  } else if (loginState.status === 'not_logged_in') {
    console.log(`   ❌ 未登录`);
    console.log(`      - 匹配容器: ${loginState.container}`);
    console.log(`      - 判定方式: ${loginState.method}`);
  } else if (loginState.status === 'uncertain') {
    console.log(`   ⚠️  无法判定登录状态`);
    console.log(`      - 原因: ${loginState.reason}`);
  } else {
    console.log(`   ❌ 登录状态检查失败: ${loginState.error}`);
  }

  // 获取Cookie数量
  console.log('\n4️⃣ 检查Cookie数量...');
  const cookieCount = await getCookieCount();
  console.log(`   🍪 Cookie数量: ${cookieCount}`);

  // 总结
  console.log('\n📊 总结:');
  if (session && url) {
    console.log('   ✅ 会话正常运行');
    if (loginState.status === 'logged_in') {
      console.log('   ✅ 已登录（基于容器）');
    } else if (loginState.status === 'not_logged_in') {
      console.log('   ⚠️  未登录，需人工登录');
    } else {
      console.log('   ⚠️  无法判定登录状态');
    }
    console.log(`   🍪 ${cookieCount} 个Cookie可用`);
  } else {
    console.log('   ❌ 会话异常');
  }

  console.log('\n💡 建议:');
  if (loginState.status === 'not_logged_in') {
    console.log('   - 请在浏览器窗口完成登录');
  } else if (loginState.status === 'uncertain') {
    console.log('   - 容器未匹配，可能需要导航到小红书主页');
  }
  if (cookieCount === 0) {
    console.log('   - Cookie数量为0，可能需要手动登录并保存Cookie');
  }
  if (!url.includes('xiaohongshu.com')) {
    console.log('   - 当前不在小红书页面，建议导航到搜索页');
  }
  
  console.log('\n📖 参考文档:');
  console.log('   - container-library/xiaohongshu/README.md#登录锚点约定');
}

main().catch(err => {
  console.error('❌ 脚本执行错误:', err.message);
  process.exit(1);
});
