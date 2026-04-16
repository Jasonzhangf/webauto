// 1688 登录操作模块 - 使用 camo 协议级操作

import { evaluateReadonly, gotoUrl } from './dom-ops.mjs';
import { LOGIN_CHECK_SCRIPT } from './selectors.mjs';

// 检测登录状态 - 先导航到主站再检测
export async function checkLoginStatus(profileId) {
  // 先导航到主站（登录状态显示在这里）
  await gotoUrl(profileId, 'https://www.1688.com', { timeoutMs: 10000 });
  
  // 等待页面加载
  await new Promise(r => setTimeout(r, 2000));
  
  // 检测登录状态
  const result = await evaluateReadonly(profileId, LOGIN_CHECK_SCRIPT);
  if (!result) {
    return { ok: false, reason: 'devtools_eval_failed' };
  }
  
  return {
    ok: true,
    isLoggedIn: result.isLoggedIn === true,
    nickText: result.nickText || null,
    loginBtnVisible: result.loginBtnVisible || false,
    url: result.url || null,
  };
}
