/**
 * Step 3: 创建浏览器启动和容器匹配 Blocks
 */

import fs from 'fs/promises';
import path from 'path';

// ========================================
// Block 4: StartBrowserService
// ========================================

/**
 * 确保浏览器服务可用
 *
 * 输入：
 *   - host: 浏览器服务地址 (默认 127.0.0.1)
 *   - port: 浏览器服务端口 (默认 7704)
 *   - wsPort: WebSocket 端口 (默认 8765)
 *
 * 输出：
 *   - status: 'connected' | 'error'
 *   - version: 服务版本
 *   - wsEndpoint: WebSocket 连接地址
 */
async function executeStartBrowserService(context) {
  const { host = '127.0.0.1', port = 7704, wsPort = 8765 } = context;
  const healthUrl = `http://${host}:${port}/health`;

  try {
    const response = await fetch(healthUrl);
    if (!response.ok) {
      throw new Error(`Browser Service returned ${response.status}`);
    }
    const data = await response.json();

    if (!data.ok) {
      throw new Error('Browser Service health check failed');
    }

    return {
      output: {
        status: 'connected',
        host,
        port,
        wsPort,
        service: 'browser-service',
        timestamp: new Date().toISOString()
      },
      note: 'Browser Service connected successfully'
    };
  } catch (error) {
    // 如果服务未启动，尝试启动它（这里简化为报错提示）
    return {
      error: `Browser Service not available at ${healthUrl}. Please start it using 'node scripts/start-browser-service.mjs'`,
      output: { status: 'error' }
    };
  }
}

// ========================================
// Block 5: EnsureSession
// ========================================

/**
 * 确保浏览器 Session 存在并处于登录状态
 *
 * 输入：
 *   - profileId: 浏览器配置ID
 *   - url: 目标 URL
 *   - serviceUrl: 浏览器服务 URL
 *
 * 输出：
 *   - sessionId: 会话 ID
 *   - status: 'active' | 'created'
 *   - currentPage: 当前页面 URL
 */
async function executeEnsureSession(context) {
  const { profileId, url, serviceUrl = 'http://127.0.0.1:7704' } = context;

  if (!profileId) return { error: 'Missing profileId' };

  try {
    // 1. 检查是否存在活跃 Session
    const statusUrl = `${serviceUrl}/command`;
    const statusRes = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getStatus' })
    });

    const statusData = await statusRes.json();
    const sessions = statusData.data || [];
    const existing = sessions.find(s => s.profileId === profileId);

    if (existing) {
      // Session 已存在，确保 URL 正确
      if (url && existing.url !== url) {
        await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'goto',
            args: { profileId, url }
          })
        });
      }

      return {
        output: {
          sessionId: existing.id || profileId,
          status: 'active',
          currentPage: url || existing.url
        }
      };
    }

    // 2. 创建新 Session
    const startRes = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        args: {
          profileId,
          url,
          headless: false
        }
      })
    });

    const startData = await startRes.json();
    if (!startData.success) {
      throw new Error(startData.error || 'Failed to start session');
    }

    return {
      output: {
        sessionId: profileId,
        status: 'created',
        currentPage: url
      }
    };

  } catch (error) {
    return { error: `Session error: ${error.message}` };
  }
}

// ========================================
// Block 6: MatchContainers
// ========================================

/**
 * 执行容器匹配
 *
 * 输入：
 *   - sessionId: 会话 ID
 *   - rootSelector: 根容器选择器 (可选)
 *   - serviceUrl: 浏览器服务 URL
 *
 * 输出：
 *   - snapshot: 容器快照
 *   - matchCount: 匹配数量
 *   - rootContainerId: 根容器 ID
 */
async function executeMatchContainers(context) {
  const { sessionId, rootSelector, serviceUrl = 'http://127.0.0.1:7704' } = context;

  // 1. 获取 DOM 快照
  const commandUrl = `${serviceUrl}/command`;
  const domRes = await fetch(commandUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'evaluate',
      args: {
        profileId: sessionId,
        script: `
          (() => {
            // 简单的 DOM 序列化用于测试
            const root = document.querySelector('${rootSelector || "body"}');
            if (!root) return { error: 'Root not found' };
            return {
              tag: root.tagName,
              classes: Array.from(root.classList),
              html: root.outerHTML.slice(0, 1000)
            };
          })()
        `
      }
    })
  });

  const domData = await domRes.json();

  if (!domData.success) {
    return { error: `Failed to access DOM: ${domData.error}` };
  }

  // 模拟容器匹配结果（实际应调用 matcher 服务）
  return {
    output: {
      snapshot: {
        root: domData.data,
        timestamp: Date.now()
      },
      matchCount: 1, // 模拟
      rootContainerId: 'mock.container.id'
    }
  };
}

// ========================================
// 主执行函数
// ========================================

export async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'test';

  console.log('🔄 Step 3: Browser & Match Blocks');
  console.log('命令:', command);

  const context = {
    host: '127.0.0.1',
    port: 7704,
    profileId: 'weibo_fresh',
    url: 'https://weibo.com'
  };

  let result;

  switch (command) {
    case 'service':
      result = await executeStartBrowserService(context);
      break;
    case 'session':
      result = await executeEnsureSession(context);
      break;
    case 'match':
      result = await executeMatchContainers(context);
      break;
    default:
      console.log('Testing all blocks sequentially...');

      console.log('\n--- 1. StartBrowserService ---');
      const s1 = await executeStartBrowserService(context);
      console.log(JSON.stringify(s1, null, 2));
      if (s1.error) process.exit(1);

      console.log('\n--- 2. EnsureSession ---');
      const s2 = await executeEnsureSession(context);
      console.log(JSON.stringify(s2, null, 2));
      if (s2.error) process.exit(1);

      console.log('\n--- 3. MatchContainers ---');
      const s3 = await executeMatchContainers({ ...context, sessionId: s2.output.sessionId });
      console.log(JSON.stringify(s3, null, 2));

      result = { success: true };
  }

  if (result?.error) {
    console.error('❌', result.error);
    process.exit(1);
  }
}
