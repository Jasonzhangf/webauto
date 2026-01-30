#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 容器系统诊断工具
 *
 * 用于排查 containers:match 失效的原因
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function controllerAction(action, payload) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await res.json();
  return data.data || data;
}

async function main() {
  console.log('🔍 容器系统诊断工具\n');

  console.log('1️⃣ 当前页面状态');
  const urlResult = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'window.location.href'
  });
  console.log(`   URL: ${urlResult.result}`);

  console.log('\n2️⃣ 容器匹配测试');
  const matchResult = await controllerAction('containers:match', { profile: PROFILE });
  console.log(`   success: ${matchResult.success}`);
  if (!matchResult.success) {
    console.log(`   error: ${matchResult.error}`);
  }
  console.log(`   根容器: ${matchResult.container?.id || 'null'}`);

  console.log('\n3️⃣ DOM 检查');
  const domCheck = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const body = document.body;
      return {
        hasBody: !!body,
        bodyChildren: body ? body.children.length : 0,
        title: document.title,
        readyState: document.readyState
      };
    })()`
  });
  console.log(`   DOM 状态: ${JSON.stringify(domCheck.result)}`);

  console.log('\n4️⃣ 直接元素查找（搜索框）');
  const elementCheck = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: `(() => {
      const searchInputs = document.querySelectorAll('input[type="search"], input[placeholder*="搜索"]');
      return {
        searchInputCount: searchInputs.length,
        firstInputPlaceholder: searchInputs[0]?.placeholder || 'none'
      };
    })()`
  });
  console.log(`   搜索输入框: ${JSON.stringify(elementCheck.result)}`);
}

main().catch(err => {
  console.error('❌ 诊断失败:', err?.message || String(err));
  process.exit(1);
});
