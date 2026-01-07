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

  /**
   * 通过容器匹配检测登录状态
   */
  async function checkLoginByContainer(): Promise<boolean> {
    try {
      const matchResult = await controllerAction('containers:match', {
        profile: sessionId,
        maxDepth: 2,
        maxChildren: 5
      });

      const snapshot = matchResult?.snapshot || matchResult;
      const tree = snapshot?.container_tree;
      if (!tree) return false;

      // 查找登录锚点
      const findLoginAnchor = (node: any): boolean => {
        if (!node) return false;
        const id = node.id || node.defId || '';
        if (/\.login_anchor$/.test(id)) return true;
        if (Array.isArray(node.children)) {
          return node.children.some(findLoginAnchor);
        }
        return false;
      };

      return findLoginAnchor(tree);
    } catch (err) {
      console.warn('[LoginRecovery] 容器检测异常:', err.message);
      return false;
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
    const loggedIn = await checkLoginByContainer();
    
    if (loggedIn) {
      console.log('[LoginRecovery] ✅ 已检测到登录态');
      return {
        success: true,
        loggedIn: true,
        recovered: false
      };
    }

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
