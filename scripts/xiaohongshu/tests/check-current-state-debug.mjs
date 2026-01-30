#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书当前状态检查 - 带调试版本
 *
 * 增加调试信息输出，详细检查每一步
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function controllerAction(action, payload = {}) {
  try {
    console.log(`[DEBUG] API 调用: ${action}`, JSON.stringify(payload, null, 2));

    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DEBUG] API 错误: HTTP ${response.status}`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`[DEBUG] API 响应: ${action}`, JSON.stringify(data, null, 2));
    return data.data || data;
  } catch (error) {
    console.error(`[DEBUG] 请求异常:`, error.message);
    throw error;
  }
}

async function getCurrentPageInfo() {
  try {
    const script = `(function() {
      try {
        return {
          url: window.location.href,
          title: document.title,
          pathname: window.location.pathname,
          readyState: document.readyState,
          error: null
        };
      } catch (e) {
        return {
          error: e.message
        };
      }
    })();`;

    console.log('[DEBUG] 执行脚本获取页面信息');
    const result = await controllerAction('browser:execute', { profile: PROFILE, script });
    return result;
  } catch (error) {
    console.error('[DEBUG] 获取页面信息失败:', error.message);
    return { error: error.message };
  }
}

async function checkCurrentUrl() {
  try {
    const result = await controllerAction('browser:state', { profile: PROFILE });
    console.log('[DEBUG] 浏览器状态:', result);
    return result;
  } catch (error) {
    console.error('[DEBUG] 获取浏览器状态失败:', error.message);

    // 直接尝试 execute
    try {
      const result = await controllerAction('browser:execute', {
        profile: PROFILE,
        script: 'location.href'
      });
      return result;
    } catch (execError) {
      console.error('[DEBUG] execute 失败:', execError.message);
      return null;
    }
  }
}

async function main() {
  console.log('=== 小红书当前状态检查（调试模式）===\n');

  try {
    // 检查当前 URL
    console.log('📍 检查当前 URL...');
    const urlResult = await checkCurrentUrl();
    console.log('URL 结果:', JSON.stringify(urlResult, null, 2));

    // 获取详细页面信息
    console.log('\n📄 获取页面详细信息...');
    const pageInfo = await getCurrentPageInfo();
    console.log('页面信息:', JSON.stringify(pageInfo, null, 2));

    if (pageInfo.error) {
      console.log('\n⚠️ 页面脚本执行失败，可能原因：');
      console.log('   1. 页面未完全加载');
      console.log('   2. Cookie 丢失导致重定向');
      console.log('   3. 网络连接不稳定');
      return;
    }

    console.log('\n🧭 导航建议：');
    if (pageInfo.url.includes('/explore/') && pageInfo.url.includes('xsec_token')) {
      console.log('   当前在详情页，需要关闭模态框返回列表');
    } else if (pageInfo.url.includes('/search_result')) {
      console.log('   当前在搜索结果页，可直接采集');
    } else if (pageInfo.url === 'https://www.xiaohongshu.com/') {
      console.log('   当前在首页，需要先执行搜索');
    } else {
      console.log(`   当前位置不确定，URL: ${pageInfo.url}`);
    }

  } catch (error) {
    console.error('\n❌ 检查失败:', error.message);
    console.log('\n建议：');
    console.log('   1. 确认浏览器会话是否已启动');
    console.log('   2. 检查 Unified API 是否运行（端口7701）');
    console.log('   3. 使用 phase1 脚本重新初始化会话');
  }
}

main();