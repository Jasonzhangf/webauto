/**
 * Weibo Special Follow Monitor Runner
 * 
 * 微博特别关注新帖监控 runner
 * 
 * 职责：
 * 1. 动态发现特别关注分组链接
 * 2. 提取用户 UID 列表
 * 3. 定时巡检用户主页新帖
 * 4. 持久化用户列表和新帖状态
 * 5. 汇报新帖信息
 * 
 * 风控保护：
 * - 禁止脚本试探寻找元素（使用 camo 手动导航）
 * - 每个用户之间延迟 5 秒
 * - 检测风控并自动暂停
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  extractSpecialFollowLink,
  checkPageState,
  discoverSpecialFollowGroup,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/discover-special-follow.mjs';
import {
  devtoolsEval,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/common.mjs';
import {
  extractCompleteUserList,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/extract-user-list.mjs';
import {
  checkForNewPosts,
  batchCheckForNewPosts,
  checkRiskControl,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/detect-new-posts.mjs';
import {
  SELECTORS_SPECIAL_FOLLOW_DISCOVERY,
} from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/selectors.mjs';
import {
  callAPI,
} from '../../../../modules/camo-runtime/src/autoscript/shared/api-client.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BROWSER_SERVICE_URL = process.env.BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';
const HEALTH_CHECK_INTERVAL_MS = 300_000; // 5 minutes
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * 持久化目录
 */
function resolveMonitorDir(env = 'prod') {
  const baseDir = path.join(process.env.HOME || '/tmp', '.webauto', 'weibo-special-follow');
  return path.join(baseDir, env);
}

/**
 * 用户列表持久化路径
 */
function resolveUserListPath(env = 'prod') {
  return path.join(resolveMonitorDir(env), 'users.json');
}

/**
 * 新帖状态持久化路径（记录每个用户的最新 weiboId）
 */
function resolvePostStatePath(env = 'prod') {
  return path.join(resolveMonitorDir(env), 'post-state.json');
}

/**
 * 新帖历史记录路径
 */
function resolveNewPostsPath(env = 'prod') {
  return path.join(resolveMonitorDir(env), 'new-posts.jsonl');
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 加载用户列表
 */
function loadUserList(env = 'prod') {
  const filePath = resolveUserListPath(env);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.users || [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 保存用户列表
 */
function saveUserList(users, env = 'prod') {
  const filePath = resolveUserListPath(env);
  ensureDir(resolveMonitorDir(env));
  fs.writeFileSync(filePath, JSON.stringify({
    users,
    updatedAt: new Date().toISOString(),
    total: users.length,
  }, null, 2));
}

/**
 * 加载新帖状态（每个用户的最新 weiboId）
 */
function loadPostState(env = 'prod') {
  const filePath = resolvePostStatePath(env);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.states || {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * 保存新帖状态
 */
function savePostState(states, env = 'prod') {
  const filePath = resolvePostStatePath(env);
  ensureDir(resolveMonitorDir(env));
  fs.writeFileSync(filePath, JSON.stringify({
    states,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

/**
 * 记录新帖到历史
 */
function appendNewPost(post, env = 'prod') {
  const filePath = resolveNewPostsPath(env);
  ensureDir(resolveMonitorDir(env));
  const line = JSON.stringify({
    ...post,
    discoveredAt: new Date().toISOString(),
  }) + '\n';
  fs.appendFileSync(filePath, line);
}

/**
 * 更新用户列表（动态发现）
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {boolean} forceUpdate - 是否强制更新（忽略现有列表）
 * @returns {Promise<{success: boolean, users: Array, total: number, error?: string}>}
 */
export async function updateUserList(profileId, forceUpdate = false) {
  const env = 'prod'; // 默认使用 prod 环境
  
  // 1. 检查现有用户列表
  const existingUsers = loadUserList(env);
  
  if (!forceUpdate && existingUsers.length > 0) {
    console.log(`[monitor] 已有用户列表: ${existingUsers.length} 人`);
    return {
      success: true,
      users: existingUsers,
      total: existingUsers.length,
      message: '使用现有用户列表',
    };
  }
  
  // 2. 检查页面状态（需要用户手动导航到特别关注分组页）
  const pageState = await checkPageState(profileId);
  
  if (pageState.isLoginPage) {
    return {
      success: false,
      users: [],
      total: 0,
      error: 'login_page_detected',
      message: '请在浏览器中手动登录并导航到特别关注分组页',
    };
  }
  
  // 3. 提取用户列表（需要用户先手动导航到特别关注分组页）
  const userListResult = await extractCompleteUserList(profileId, { autoScroll: true });
  
  if (!userListResult.success) {
    return {
      success: false,
      users: [],
      total: 0,
      error: userListResult.error,
      message: userListResult.message || '提取用户列表失败',
    };
  }
  
  // 4. 保存用户列表
  const users = userListResult.users.map(u => ({
    uid: u.uid,
    name: u.name,
    lastWeiboId: null, // 初始化为 null
  }));
  
  saveUserList(users, env);
  
  console.log(`[monitor] 更新用户列表: ${users.length} 人`);
  
  return {
    success: true,
    users,
    total: users.length,
    message: `成功更新用户列表`,
  };
}

/**
 * 执行新帖巡检
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {object} options - 巡检选项
 * @param {number} options.delayMs - 每个用户之间的延迟
 * @returns {Promise<{success: boolean, newCount: number, newPosts: Array, error?: string}>}
 */
/**
 * 自动同步用户列表（简化版）
 * 
 * 流程：
 * 1. 用户手动用 camo 导航到特别关注分组页
 * 2. 脚本直接提取当前页面的用户列表
 * 3. 对比差异并更新 users.json
 * 
 * 风控安全：不自动试探导航，只提取数据
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {object} options - 同步选项
 * @returns {Promise<{success: boolean, added: number, removed: number, total: number}>}
 */
export async function autoSyncUserList(profileId, options = {}) {
  const env = 'prod';
  
  console.log('[autoSync] 开始同步用户列表...');
  
  // 1. 检查当前页面状态
  const pageState = await checkPageState(profileId);
  
  if (pageState.isLoginPage) {
    return {
      success: false,
      added: 0,
      removed: 0,
      total: 0,
      addedUsers: [],
      removedUsers: [],
      error: 'login_page_detected',
      message: '请先在浏览器中手动登录微博',
    };
  }
  
  // 2. 检查是否在关注列表页
  const isFollowPage = pageState.url.includes('/page/follow') || pageState.url.includes('mygroups');
  const isGroupDetailPage = pageState.url.includes('followGroup?tabid=');
  
  if (!isFollowPage) {
    return {
      success: false,
      added: 0,
      removed: 0,
      total: 0,
      addedUsers: [],
      removedUsers: [],
      error: 'not_on_follow_page',
      message: '请先用 camo 导航到特别关注分组页',
    };
  }
  
  // 3. 根据页面类型使用不同的提取方式
  console.log('[autoSync] 提取特别关注用户...');
  
  let script;
  
  if (isGroupDetailPage) {
    // 分组详情页：从虚拟列表提取
    console.log('[autoSync] 分组详情页，从虚拟列表提取');
    script = "(() => {\n  const result = { users: [], error: null };\n  const items = document.querySelectorAll('.vue-recycle-scroller__item-view');\n  items.forEach(item => {\n    const link = item.querySelector('a[href*=\"/u/\"]');\n    if (link) {\n      const href = link.getAttribute('href') || '';\n      const uidMatch = href.match(/\\/u\\/(\\d+)/);\n      if (uidMatch) {\n        const uid = uidMatch[1];\n        let name = '';\n        const claDiv = item.querySelector('[class*=_cla]');\n        if (claDiv) {\n          const emptySpan = claDiv.querySelector('span:not([class])');\n          if (emptySpan) name = emptySpan.textContent?.trim() || '';\n        }\n        if (!result.users.find(u => u.uid === uid)) {\n          result.users.push({ uid, name });\n        }\n      }\n    }\n  });\n  if (result.users.length === 0) { result.error = 'no_users_found_in_scroller'; }\n  return result;\n})()";
  } else {
    // 关注列表页：从 H3 区域提取
    console.log('[autoSync] 关注列表页，从 H3 区域提取');
    script = "(() => {\n  const result = { users: [], error: null };\n  const h3s = [...document.querySelectorAll('h3')];\n  const specialH3 = h3s.find(h => h.textContent?.includes('特别关注'));\n  if (!specialH3) { result.error = 'no_special_follow_h3_found'; return result; }\n  let container = specialH3;\n  for (let i = 0; i < 5; i++) {\n    container = container.parentElement;\n    if (!container) break;\n    const links = container.querySelectorAll('a[href*=\"/u/\"]');\n    if (links.length >= 1) {\n      links.forEach(link => {\n        const href = link.getAttribute('href') || '';\n        const uidMatch = href.match(/\\/u\\/(\\d+)/);\n        if (uidMatch) {\n          const uid = uidMatch[1];\n          let name = link.textContent?.trim() || '';\n          name = name.split('\\n')[0].slice(0, 50);\n          if (!result.users.find(u => u.uid === uid)) {\n            result.users.push({ uid, name });\n          }\n        }\n      });\n      if (result.users.length > 0) break;\n    }\n  }\n  if (result.users.length === 0) { result.error = 'no_users_found'; }\n  return result;\n})()";
  }  
  // 执行 devtools eval
  const evalResult = await devtoolsEval(profileId, script);

  
  if (evalResult?.error) {
    return {
      success: false,
      added: 0,
      removed: 0,
      total: 0,
      addedUsers: [],
      removedUsers: [],
      error: evalResult.error,
      message: '提取用户失败: ' + evalResult.error,
    };
  }
  
  const newUsers = evalResult.users || [];
  console.log('[autoSync] 提取到 ' + newUsers.length + ' 个用户');
  
  // 4. 对比差异
  const existingUsers = loadUserList(env);
  const existingUids = new Set(existingUsers.map(u => u.uid));
  const newUids = new Set(newUsers.map(u => u.uid));
  
  const addedUsers = newUsers.filter(u => !existingUids.has(u.uid));
  const removedUsers = existingUsers.filter(u => !newUids.has(u.uid));
  
  // 5. 更新列表
  if (addedUsers.length > 0 || removedUsers.length > 0) {
    const updatedUsers = newUsers.map(u => ({
      uid: u.uid,
      name: u.name,
      lastWeiboId: existingUsers.find(e => e.uid === u.uid)?.lastWeiboId || null,
    }));
    
    saveUserList(updatedUsers, env);
    
    console.log('[autoSync] 用户列表已更新: +' + addedUsers.length + ', -' + removedUsers.length + ', 总计 ' + updatedUsers.length + ' 人');
    
    return {
      success: true,
      added: addedUsers.length,
      removed: removedUsers.length,
      total: updatedUsers.length,
      addedUsers,
      removedUsers,
      message: '用户列表已同步',
    };
  }
  
  console.log('[autoSync] 用户列表无变化');
  
  return {
    success: true,
    added: 0,
    removed: 0,
    total: existingUsers.length,
    addedUsers: [],
    removedUsers: [],
    message: '用户列表无变化',
  };
}


export async function runInspection(profileId, options = {}) {
  const env = 'prod';
  const delayMs = options.delayMs || 5000;
  
  // 1. 加载用户列表和新帖状态
  const users = loadUserList(env);
  const postStates = loadPostState(env);
  
  if (users.length === 0) {
    return {
      success: false,
      newCount: 0,
      newPosts: [],
      error: 'no_users',
      message: '用户列表为空，请先执行 update-user-list',
    };
  }
  
  // 2. 构建巡检用户列表（带上 lastWeiboId）
  const inspectionUsers = users.map(u => ({
    uid: u.uid,
    name: u.name,
    lastWeiboId: postStates[u.uid] || null,
  }));
  
  console.log(`[monitor] 开始巡检: ${inspectionUsers.length} 人`);
  
  // 3. 检查风控状态
  const riskCheck = await checkRiskControl(profileId);
  if (riskCheck.isRisk) {
    return {
      success: false,
      newCount: 0,
      newPosts: [],
      error: 'risk_control_detected',
      message: `检测到风控: ${riskCheck.riskType}`,
    };
  }
  
  // 4. 批量检查新帖
  const batchResult = await batchCheckForNewPosts(profileId, inspectionUsers, { delayMs });
  
  // 5. 更新新帖状态并记录历史
  const newStates = {};
  const newPostsHistory = [];
  
  batchResult.results.forEach(result => {
    // 更新状态
    if (result.latestWeiboId) {
      newStates[result.uid] = result.latestWeiboId;
    }
    
    // 记录新帖历史
    if (result.hasNew && result.newPosts.length > 0) {
      result.newPosts.forEach(post => {
        newPostsHistory.push({
          uid: result.uid,
          userName: result.name,
          weiboId: post.weiboId,
          timeISO: post.timeISO,
          contentPreview: post.contentPreview,
          postHref: post.postHref,
        });
        appendNewPost({
          uid: result.uid,
          userName: result.name,
          ...post,
        }, env);
      });
    }
  });
  
  // 6. 合并并保存状态
  const mergedStates = { ...postStates, ...newStates };
  savePostState(mergedStates, env);
  
  console.log(`[monitor] 巡检完成: ${batchResult.total} 人, 新帖 ${batchResult.newCount} 人`);
  
  return {
    success: true,
    newCount: batchResult.newCount,
    newPosts: newPostsHistory,
    total: batchResult.total,
    timestamp: batchResult.timestamp,
    results: batchResult.results,
  };
}

/**
 * 启动持续监控
 * 
 * @param {string} profileId - 浏览器 profile ID
 * @param {object} options - 监控选项
 * @param {number} options.intervalMs - 巡检间隔（毫秒）
 * @param {number} options.maxRounds - 最大巡检轮数
 * @param {number} options.delayMs - 每个用户之间的延迟
 * @returns {Promise<{success: boolean, rounds: number, totalNew: number}>}
 */

/**
 * Health check + auto recovery for monitor daemon
 */
async function monitorHealthCheck(profileId) {
  try {
    const res = await fetch(BROWSER_SERVICE_URL + '/health', { method: 'GET' });
    const health = await res.json();
    if (health.ok) {
      return { ok: true };
    }
  } catch (e) {
    console.error('[monitor] health check failed:', e.message);
  }
  return { ok: false };
}

export async function startContinuousMonitor(profileId, options = {}) {
  const intervalMs = options.intervalMs || 600000; // 默认 10 分钟
  const maxRounds = options.maxRounds || 100;
  const delayMs = options.delayMs || 5000;
  
  console.log(`[monitor] 启动持续监控: interval=${intervalMs}ms, maxRounds=${maxRounds}`);
  
  let rounds = 0;
  let totalNew = 0;
  let consecutiveErrors = 0;
  let lastHealthCheck = Date.now();
  
  for (let round = 1; round <= maxRounds; round++) {
    // Check stop signal (daemon integration)
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      console.log(`[monitor] stop signal received, exiting. rounds=${rounds} totalNew=${totalNew}`);
      break;
    }

    console.log(`[monitor] 第 ${round}/${maxRounds} 轮巡检开始`);
    
    const inspectionResult = await runInspection(profileId, { delayMs });
    
    if (!inspectionResult.success) {
      consecutiveErrors++;
      console.error(`[monitor] ⚠️ 巡检失败 (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${inspectionResult.error}`);
      
      // 如果是风控，暂停监控
      if (inspectionResult.error === 'risk_control_detected') {
        console.log(`[monitor] 检测到风控，暂停监控`);
        break;
      }

      // 如果连续错误过多，触发健康检查
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[monitor] 连续错误达到阈值，执行健康检查...`);
        const health = await monitorHealthCheck(profileId);
        if (health.ok) {
          console.log(`[monitor] 健康检查通过，重置错误计数`);
          consecutiveErrors = 0;
        } else {
          console.error(`[monitor] 健康检查失败，继续等待...`);
        }
      }
      
      // 其他错误，等待后继续
      await sleep(intervalMs);
      rounds++;
      continue;
    }

    // 成功时重置错误计数
    consecutiveErrors = 0;

    // 周期性健康检查
    if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
      await monitorHealthCheck(profileId);
      lastHealthCheck = Date.now();
    }
    
    // 记录新帖数量
    totalNew += inspectionResult.newCount;
    
    if (inspectionResult.newCount > 0) {
      console.log(`[monitor] 发现新帖: ${inspectionResult.newCount} 人`);
      inspectionResult.newPosts.forEach(post => {
        console.log(`  - ${post.userName}: ${post.contentPreview?.slice(0, 50)}...`);
      });
    }
    
    rounds++;
    
    // 等待下一轮
    if (round < maxRounds) {
      console.log(`[monitor] 等待 ${intervalMs}ms 后继续`);
      await sleep(intervalMs);
    }
  }
  
  console.log(`[monitor] 监控结束: rounds=${rounds}, totalNew=${totalNew}`);
  
  return {
    success: true,
    rounds,
    totalNew,
  };
}

/**
 * 单次巡检入口（用于 CLI）
 */
export async function runSingleInspection(profileId) {
  return runInspection(profileId, { delayMs: 5000 });
}

/**
 * 获取当前状态
 */
export async function getMonitorStatus(profileId) {
  const env = 'prod';
  
  const users = loadUserList(env);
  const postStates = loadPostState(env);
  const riskCheck = await checkRiskControl(profileId);
  const pageState = await checkPageState(profileId);
  
  return {
    success: true,
    users: {
      total: users.length,
      list: users.slice(0, 10), // 只显示前 10 个
    },
    postStates: {
      total: Object.keys(postStates).length,
      latest: Object.entries(postStates).slice(0, 5),
    },
    riskControl: riskCheck,
    pageState,
    monitorDir: resolveMonitorDir(env),
  };
}

// 导出
export default {
  updateUserList,
  autoSyncUserList,
  runInspection,
  startContinuousMonitor,
  runSingleInspection,
  getMonitorStatus,
};
