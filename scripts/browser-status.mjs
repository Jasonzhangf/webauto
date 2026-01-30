#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 通用浏览器状态检查脚本（平台无关，支持容器驱动登录探针）
 *
 * 用法：
 *   node scripts/browser-status.mjs <profile> [--site xiaohongshu] [--url URL]
 *
 * 示例：
 *   node scripts/browser-status.mjs xiaohongshu_fresh --site xiaohongshu
 *   node scripts/browser-status.mjs weibo_fresh --url https://weibo.com
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

function parseArgs(argv) {
  const args = [...argv];
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

async function httpPost(endpoint, body) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function controllerAction(action, payload) {
  const data = await httpPost('/v1/controller/action', { action, payload });
  return data.data ?? data;
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
  if (Array.isArray(tree.children)) {
    for (const child of tree.children) {
      const found = findContainer(child, pattern);
      if (found) return found;
    }
  }
  return null;
}

async function checkSession(profile) {
  try {
    const result = await controllerAction('session:list', {});
    const sessions = result.sessions || result.data?.sessions || [];
    const session =
      sessions.find((s) => s.profileId === profile) ||
      sessions.find((s) => s.session_id === profile || s.sessionId === profile);
    return session || null;
  } catch (err) {
    return null;
  }
}

async function getCurrentUrl(profile) {
  try {
    const result = await controllerAction('browser:execute', {
      profile,
      script: 'location.href',
    });
    return result.result || result.data?.result || '';
  } catch {
    return '';
  }
}

async function getCookieCount(profile) {
  try {
    const result = await controllerAction('browser:execute', {
      profile,
      script: 'document.cookie.split(\";\").filter(c => c.trim()).length',
    });
    return result.result ?? result.data?.result ?? 0;
  } catch {
    return 0;
  }
}

async function checkLoginByContainer(profile, site) {
  if (!site || site === 'unknown') {
    return { status: 'unknown', reason: 'site_not_specified' };
  }

  if (site !== 'xiaohongshu') {
    return { status: 'unknown', reason: `login_probe_not_configured_for_${site}` };
  }

  try {
    const match = await controllerAction('containers:match', {
      profile,
      maxDepth: 3,
      maxChildren: 8,
    });
    const data = unwrapData(match);
    const tree = data.snapshot?.container_tree || data.container_tree;
    if (!tree) {
      return { status: 'uncertain', reason: 'no_container_tree' };
    }

    const loginAnchor = findContainer(tree, /\.login_anchor$/);
    if (loginAnchor) {
      return {
        status: 'logged_in',
        container: loginAnchor.id || loginAnchor.defId,
        method: 'container_match',
      };
    }

    const guard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
    if (guard) {
      return {
        status: 'not_logged_in',
        container: guard.id || guard.defId,
        method: 'container_match',
      };
    }

    return {
      status: 'uncertain',
      reason: 'no_login_anchor_or_guard',
      method: 'container_match',
    };
  } catch (err) {
    return {
      status: 'error',
      error: err.message,
    };
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const profile = positional[0] || process.env.WEBAUTO_PROFILE || '';
  const site = flags.site || process.env.WEBAUTO_SITE || 'unknown';

  if (!profile) {
    console.error('用法: node scripts/browser-status.mjs <profile> [--site xiaohongshu|weibo] [--url URL]');
    process.exit(1);
  }

  const overrideUrl = flags.url || process.env.WEBAUTO_URL || '';

  console.log(`🔎 BrowserStatus`);
  console.log(`   profile: ${profile}`);
  if (site && site !== 'unknown') {
    console.log(`   site:    ${site}`);
  }

  // 1. Session 状态
  console.log('\n1️⃣ Session 状态');
  const session = await checkSession(profile);
  if (!session) {
    console.log('   ❌ 未找到该 profile 的会话');
    process.exit(0);
  }
  const currentUrlField = session.current_url || session.currentUrl || '';
  console.log('   ✅ 会话存在');
  console.log(`      - current_url: ${currentUrlField || '未知'}`);
  console.log(`      - mode:        ${session.mode || '未知'}`);

  // 2. 当前 URL
  console.log('\n2️⃣ 当前页面 URL');
  const url = overrideUrl || (await getCurrentUrl(profile));
  if (url) {
    let pageType = '未知';
    if (url.includes('search_result')) pageType = '搜索页';
    else if (url.includes('explore')) pageType = '详情页';
    else if (url.includes('login')) pageType = '登录页';
    else if (url.includes('profile')) pageType = '个人中心';

    console.log(`   ✅ URL: ${url}`);
    console.log(`      - 页面类型: ${pageType}`);
  } else {
    console.log('   ⚠️ 无法获取当前 URL（浏览器可能未响应）');
  }

  // 3. 登录状态（容器驱动，若 site 支持）
  console.log('\n3️⃣ 登录状态（容器探针）');
  const login = await checkLoginByContainer(profile, site);
  if (login.status === 'logged_in') {
    console.log('   ✅ 已登录');
    if (login.container) console.log(`      - 容器: ${login.container}`);
    console.log(`      - 判定方式: ${login.method || 'containers:match'}`);
  } else if (login.status === 'not_logged_in') {
    console.log('   ⚠️ 未登录');
    if (login.container) console.log(`      - 容器: ${login.container}`);
    console.log(`      - 判定方式: ${login.method || 'containers:match'}`);
  } else if (login.status === 'uncertain') {
    console.log('   ⚠️ 无法判定登录状态');
    if (login.reason) console.log(`      - 原因: ${login.reason}`);
  } else if (login.status === 'unknown') {
    console.log('   ℹ️  当前站点未配置登录探针（仅简单输出 session/URL）');
  } else {
    console.log('   ❌ 登录探针执行出错');
    if (login.error) console.log(`      - 错误: ${login.error}`);
  }

  // 4. Cookie 数量
  console.log('\n4️⃣ Cookie 数量（document.cookie 可见部分）');
  const cookieCount = await getCookieCount(profile);
  console.log(`   🍪 count = ${cookieCount}`);

  console.log('\n📖 提示:');
  console.log('   - 如需查看完整容器树: debug-container-tree-full.mjs <profile> [url]');
  console.log('   - 如需检查容器事件链路: test-container-events-direct.mjs <profile> [url]');
}

main().catch((err) => {
  console.error('❌ browser-status 执行失败:', err?.message || err);
  process.exit(1);
});

