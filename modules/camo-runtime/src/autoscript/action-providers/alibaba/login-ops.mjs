// Alibaba.com 登录操作模块

import { callAPI } from '../../shared/api-client.mjs';
import { sleep } from './dom-ops.mjs';

// 检测是否需要登录
export async function checkLoginRequired(profileId) {
  const result = await callAPI('evaluate', {
    profileId,
    script: `(() => {
      var loginModal = document.querySelector('.tnh-login, [class*="login-modal"]');
      var loginVisible = loginModal && loginModal.style.display !== 'none';
      
      var loginBtn = document.querySelector('.tnh-login');
      var loginBtnVisible = loginBtn && loginBtn.getBoundingClientRect().width > 0;
      
      return {
        requiresLogin: loginVisible || loginBtnVisible,
        loginModalVisible: loginVisible,
        loginBtnVisible: loginBtnVisible
      };
    })()`
  });
  
  return result.result;
}

// 检查登录状态（用于 runner）- 更准确的检测
export async function checkLoginStatus(profileId) {
  // 先导航到首页
  await callAPI('goto', {
    profileId,
    url: 'https://www.alibaba.com/'
  });
  
  await sleep(3000); // 等待页面稳定
  
  const status = await callAPI('evaluate', {
    profileId,
    script: `(() => {
      // 检查多个可能的已登录标识
      var ordersLink = document.querySelector('a[href*="order"], a[href*="orderhistory"]');
      var signOutBtn = document.querySelector('a[href*="signout"], a[href*="logout"], button[class*="signout"]');
      var accountMenu = document.querySelector('.account-menu, .user-menu, [class*="account"]');
      
      // 检查页面内容中的登录标识
      var topRightArea = document.body.innerText;
      var hasOrdersText = topRightArea.indexOf('订单') >= 0 || topRightArea.indexOf('Orders') >= 0;
      var hasSignOutText = topRightArea.indexOf('退出') >= 0 || topRightArea.indexOf('Sign Out') >= 0;
      
      // 检查是否有登录按钮
      var loginBtn = document.querySelector('.tnh-login');
      var loginBtnVisible = loginBtn && loginBtn.getBoundingClientRect().width > 0;
      
      // 所有变量先声明（避免 evaluate 错误）
      var ordersLinkVisible = !!ordersLink;
      var signOutBtnVisible = !!signOutBtn;
      var accountMenuVisible = !!accountMenu;
      
      // 综合判断：如果有订单链接、退出按钮、账户菜单，说明已登录
      var isLoggedIn = ordersLinkVisible || signOutBtnVisible || accountMenuVisible || hasSignOutText;
      
      return {
        isLoggedIn: isLoggedIn,
        loginBtnVisible: loginBtnVisible,
        ordersLinkVisible: ordersLinkVisible,
        signOutBtnVisible: signOutBtnVisible,
        accountMenuVisible: accountMenuVisible,
        hasOrdersText: hasOrdersText,
        hasSignOutText: hasSignOutText
      };
    })()`
  });
  
  return {
    ok: true,
    isLoggedIn: status.result.isLoggedIn,
    requiresLogin: !status.result.isLoggedIn
  };
}

// 手动登录引导 - 打开登录页面并等待用户完成
export async function waitForManualLogin(profileId, timeoutMs = 60000) {
  console.log(JSON.stringify({
    event: 'alibaba.login.manual_start',
    message: '请在浏览器中手动登录，登录完成后脚本将自动继续',
    timeoutMs
  }));
  
  // 导航到首页
  await callAPI('goto', {
    profileId,
    url: 'https://www.alibaba.com/'
  });
  
  await sleep(3000);
  
  // 点击登录按钮（使用系统级鼠标点击）
  const loginBtnInfo = await callAPI('evaluate', {
    profileId,
    script: `(() => {
      var loginBtn = document.querySelector('.tnh-login');
      if (!loginBtn) return null;
      
      var rect = loginBtn.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    })()`
  });
  
  if (loginBtnInfo.result) {
    await callAPI('mouse:click', {
      profileId,
      x: loginBtnInfo.result.x,
      y: loginBtnInfo.result.y
    });
    
    await sleep(3000);
  }
  
  // 等待用户完成登录（轮询检测登录状态，间隔5秒避免风控）
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const status = await callAPI('evaluate', {
      profileId,
      script: `(() => {
        var ordersLink = document.querySelector('a[href*="order"], a[href*="orderhistory"]');
        var signOutBtn = document.querySelector('a[href*="signout"], a[href*="logout"]');
        var ordersLinkVisible = !!ordersLink;
        var signOutBtnVisible = !!signOutBtn;
        
        return {
          isLoggedIn: ordersLinkVisible || signOutBtnVisible
        };
      })()`
    });
    
    if (status.result.isLoggedIn) {
      console.log(JSON.stringify({
        event: 'alibaba.login.manual_success',
        message: '登录成功'
      }));
      return { ok: true, isLoggedIn: true };
    }
    
    await sleep(5000); // 5秒轮询间隔
  }
  
  console.log(JSON.stringify({
    event: 'alibaba.login.manual_timeout',
    message: '登录超时，请重试'
  }));
  
  return { ok: false, reason: 'timeout' };
}

// 验证当前 session 是否已登录
export async function verifyLoginSession(profileId) {
  await callAPI('goto', {
    profileId,
    url: 'https://www.alibaba.com/'
  });
  
  await sleep(3000);
  
  const status = await callAPI('evaluate', {
    profileId,
    script: `(() => {
      var ordersLink = document.querySelector('a[href*="order"], a[href*="orderhistory"]');
      var ordersLinkVisible = !!ordersLink;
      
      return {
        isLoggedIn: ordersLinkVisible
      };
    })()`
  });
  
  return status.result;
}
