#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书状态检查脚本
 * 功能：单命令输出当前会话状态、URL、登录态、Cookie数量
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

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

async function checkLoginState() {
  try {
    const result = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `(() => {
        // 检查是否有登录态标识
        const hasLoginIndicator = document.querySelector('[class*="avatar"]') || 
                                  document.querySelector('[class*="login"]') || 
                                  document.querySelector('[class*="user"]');
        const hasLoginUrl = location.href.includes('/login');
        const hasProfileUrl = location.href.includes('/profile');
        
        return {
          hasIndicator: !!hasLoginIndicator,
          isLoginPage: hasLoginUrl,
          hasProfile: hasProfileUrl,
          url: location.href
        };
      })()`
    });
    return result?.data?.result || result?.result || {};
  } catch (error) {
    return { error: error.message };
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
  console.log('🔍 小红书会话状态检查\n');

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

  // 检查登录状态
  console.log('\n3️⃣ 检查登录状态...');
  const loginState = await checkLoginState();
  if (loginState.error) {
    console.log(`   ❌ 登录状态检查失败: ${loginState.error}`);
  } else {
    console.log(`   - 有登录标识: ${loginState.hasIndicator ? '✅' : '❌'}`);
    console.log(`   - 当前登录页: ${loginState.isLoginPage ? '⚠️' : '✅'}`);
    console.log(`   - 有个人主页: ${loginState.hasProfile ? '✅' : '❌'}`);
  }

  // 获取Cookie数量
  console.log('\n4️⃣ 检查Cookie数量...');
  const cookieCount = await getCookieCount();
  console.log(`   🍪 Cookie数量: ${cookieCount}`);

  // 总结
  console.log('\n📊 总结:');
  if (session && url) {
    console.log('   ✅ 会话正常运行');
    if (loginState.hasIndicator && !loginState.isLoginPage) {
      console.log('   ✅ 已登录');
    } else if (loginState.isLoginPage) {
      console.log('   ⚠️  当前在登录页，需人工登录');
    } else {
      console.log('   ⚠️  未检测到登录标识');
    }
    console.log(`   🍪 ${cookieCount} 个Cookie可用`);
  } else {
    console.log('   ❌ 会话异常');
  }

  console.log('\n💡 建议:');
  if (!loginState.hasIndicator && !loginState.isLoginPage) {
    console.log('   - 如需登录，请导航到个人主页或等待登录锚点出现');
  }
  if (cookieCount === 0) {
    console.log('   - Cookie数量为0，可能需要手动登录并保存Cookie');
  }
  if (!url.includes('xiaohongshu.com')) {
    console.log('   - 当前不在小红书页面，建议导航到搜索页');
  }
}

main().catch(err => {
  console.error('❌ 脚本执行错误:', err.message);
  process.exit(1);
});
