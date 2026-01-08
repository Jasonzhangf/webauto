/**
 * Workflow Block: LoginRecoveryBlock
 *
 * 职责：
 * - 检测当前登录状态
 * - 若未登录，尝试自动恢复（调用 Phase1 登录流程）
 * - 提供明确的失败原因和恢复建议
 * - 用于长时间运行任务中的登录状态保障
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

export interface LoginRecoveryInput {
  sessionId: string;
  serviceUrl?: string;
  maxRetries?: number;
  autoRecover?: boolean;
}

export interface LoginRecoveryOutput {
  success: boolean;
  loggedIn: boolean;
  recovered: boolean;
  error?: string;
  suggestion?: string;
}

export async function execute(input: LoginRecoveryInput): Promise<LoginRecoveryOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701',
    maxRetries = 2,
    autoRecover = true
  } = input;

  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data.data || data;
  }

  type LoginStatus = 'logged_in' | 'not_logged_in' | 'uncertain' | 'error';

  /**
   * 通过容器匹配检测登录状态（login_anchor / login_guard）
   * - logged_in: 命中任意 *.login_anchor
   * - not_logged_in: 命中 xiaohongshu_login.login_guard
   * - uncertain: 未命中上述任何容器
   * - error: containers:match 调用异常
   */
  async function checkLoginByContainer(): Promise<{ status: LoginStatus; detail?: string }> {
    try {
      // 先拿当前 URL，再显式传给 containers:match，避免因为默认 URL（如 about:blank）
      // 找不到 definitions 而直接 400。
      const currentUrl = await getCurrentUrl();

      const matchPayload: any = {
        profile: sessionId,
        maxDepth: 3,
        maxChildren: 8
      };

      if (currentUrl) {
        matchPayload.url = currentUrl;
      }

      const matchResult = await controllerAction('containers:match', matchPayload);

      const snapshot = (matchResult as any)?.snapshot || matchResult;
      const tree = (snapshot as any)?.container_tree;
      if (!tree) {
        return { status: 'uncertain', detail: 'no_container_tree' };
      }

      const findContainer = (node: any, pattern: RegExp): any => {
        if (!node) return null;
        if (pattern.test(node.id || node.defId || '')) return node;
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            const found = findContainer(child, pattern);
            if (found) return found;
          }
        }
        return null;
      };

      const loginAnchor = findContainer(tree, /\.login_anchor$/);
      if (loginAnchor) {
        return {
          status: 'logged_in',
          detail: loginAnchor.id || loginAnchor.defId
        };
      }

      const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
      if (loginGuard) {
        return {
          status: 'not_logged_in',
          detail: loginGuard.id || loginGuard.defId
        };
      }

      return {
        status: 'uncertain',
        detail: 'no_login_anchor_or_guard'
      };
    } catch (err: any) {
      console.warn('[LoginRecovery] 容器检测异常:', err.message);
      return { status: 'error', detail: err.message || 'containers:match error' };
    }
  }

  async function getCurrentUrl(): Promise<string> {
    try {
      const data = await controllerAction('browser:execute', {
        profile: sessionId,
        script: 'location.href'
      });
      const url =
        (data as any)?.result || (data as any)?.data?.result || '';
      console.log('[LoginRecovery] getCurrentUrl:', url || '<empty>');
      return url;
    } catch {
      console.warn('[LoginRecovery] getCurrentUrl failed');
      return '';
    }
  }

  /**
   * 调用 Phase1 登录脚本
   */
  async function runPhase1Login(): Promise<boolean> {
    console.log('[LoginRecovery] 检测到未登录，尝试自动恢复...');
    
    const phase1Script = path.join(repoRoot, 'scripts', 'xiaohongshu', 'tests', 'phase1-session-login-with-gate.mjs');
    
    return new Promise((resolve) => {
      const child = spawn('node', [phase1Script], {
        cwd: repoRoot,
        stdio: 'inherit', // 让用户看到登录过程
        detached: false
      });

      child.on('exit', async (code) => {
        if (code === 0) {
          console.log('[LoginRecovery] Phase1 登录脚本执行完成');
          // 等待几秒让页面稳定
          await new Promise(r => setTimeout(r, 3000));
          
          // 重新验证登录状态
          const loggedIn = await checkLoginByContainer();
          resolve(loggedIn);
        } else {
          console.error('[LoginRecovery] Phase1 登录脚本失败，退出码:', code);
          resolve(false);
        }
      });

      child.on('error', (err) => {
        console.error('[LoginRecovery] 启动 Phase1 脚本失败:', err.message);
        resolve(false);
      });
    });
  }

  // 主流程
  try {
    console.log('[LoginRecovery] 检查登录状态...');
    const state = await checkLoginByContainer();

    if (state.status === 'logged_in') {
      console.log(
        '[LoginRecovery] ✅ 已检测到登录态（login_anchor=',
        state.detail || 'unknown',
        ')'
      );
      return {
        success: true,
        loggedIn: true,
        recovered: false
      };
    }

    if (state.status === 'uncertain') {
      // 状态不确定时不强行自动登录，交给上层脚本决定下一步动作
      console.warn('[LoginRecovery] ⚠️ 登录状态不确定（容器未命中 login_anchor/login_guard）');
      return {
        success: false,
        loggedIn: false,
        recovered: false,
        error: 'login_status_uncertain',
        suggestion:
          '请先运行: node scripts/xiaohongshu/tests/status-v2.mjs 或手动检查浏览器页面上的登录状态'
      };
    }

    if (state.status === 'error') {
      // 容器匹配本身失败时，尝试用 URL 做一次弱判断，避免因为单次超时就阻塞所有后续流程。
      const url = await getCurrentUrl();
      if (url && url.includes('xiaohongshu.com') && !url.includes('/login')) {
        console.warn(
          '[LoginRecovery] ⚠️ 容器检测失败，但当前仍在小红书非登录页，暂按“已登录”处理（弱判断，仅供长任务继续执行）',
        );
        return {
          success: true,
          loggedIn: true,
          recovered: false,
          error: `登录容器检测失败: ${state.detail}`,
          suggestion:
            '建议在前台或通过 scripts/xiaohongshu/tests/status-v2.mjs 再次确认登录锚点是否正常命中'
        };
      }

      return {
        success: false,
        loggedIn: false,
        recovered: false,
        error: `登录容器检测失败: ${state.detail}`,
        suggestion: '请检查 Unified API / Browser Service 状态，或手动运行 Phase1 登录脚本'
      };
    }

    // 走到这里说明明确未登录（命中 login_guard）
    if (!autoRecover) {
      return {
        success: true,
        loggedIn: false,
        recovered: false,
        error: '未检测到登录态',
        suggestion: '请先运行: node scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs'
      };
    }

    // 尝试自动恢复
    for (let i = 0; i < maxRetries; i++) {
      console.log(`[LoginRecovery] 自动恢复尝试 ${i + 1}/${maxRetries}`);
      const recovered = await runPhase1Login();

      if (recovered) {
        console.log('[LoginRecovery] ✅ 登录恢复成功');
        return {
          success: true,
          loggedIn: true,
          recovered: true
        };
      }

      if (i < maxRetries - 1) {
        console.log('[LoginRecovery] 等待5秒后重试...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return {
      success: false,
      loggedIn: false,
      recovered: false,
      error: '自动登录恢复失败',
      suggestion: '请手动运行: node scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs'
    };

  } catch (err: any) {
    return {
      success: false,
      loggedIn: false,
      recovered: false,
      error: `登录检查异常: ${err.message}`,
      suggestion: '请检查会话状态和网络连接'
    };
  }
}
