/**
 * XiaohongshuLoginWorkflow
 *
 * 目标：
 * - 确保指定 profile 的浏览器 Session 存在（或创建）
 * - 基于「登录锚点容器」模型检查登录态（*.login_anchor / xiaohongshu_login.login_guard）
 *
 * 说明：
 * - 这是一个最小登录 Workflow，只负责「起 Session + 判登录」，不做自动登录。
 * - 依赖的 Block：
 *   - EnsureSessionBlock：Browser Service /command 层的会话检查与创建
 *   - EnsureLoginBlock：Unified API controller 层的容器驱动登录检测
 */

import type { EnsureSessionInput, EnsureSessionOutput } from '../blocks/EnsureSession.ts';
import { execute as ensureSessionExecute } from '../blocks/EnsureSession.ts';
import type { EnsureLoginInput, EnsureLoginOutput } from '../blocks/EnsureLoginBlock.ts';
import { execute as ensureLoginExecute } from '../blocks/EnsureLoginBlock.ts';

export interface XiaohongshuLoginWorkflowInput {
  profileId: string;
  /**
   * 推荐使用小红书主页，例如：https://www.xiaohongshu.com
   * 若为空，则维持当前会话 URL，不做额外导航。
   */
  startUrl?: string;
  /**
   * Browser Service 基地址，默认 http://127.0.0.1:7704
   */
  browserServiceUrl?: string;
  /**
   * Unified API 基地址，默认 http://127.0.0.1:7701
   */
  unifiedApiUrl?: string;
}

export interface XiaohongshuLoginWorkflowOutput {
  success: boolean;
  profileId: string;
  session: EnsureSessionOutput;
  login: EnsureLoginOutput;
  error?: string;
}

export async function execute(
  input: XiaohongshuLoginWorkflowInput,
): Promise<XiaohongshuLoginWorkflowOutput> {
  const { profileId, startUrl, browserServiceUrl, unifiedApiUrl } = input;

  if (!profileId) {
    return {
      success: false,
      profileId: '',
      session: {
        sessionId: '',
        status: 'active',
        currentPage: '',
        error: 'Missing profileId',
      },
      login: {
        profileId: '',
        status: 'error',
        error: 'Missing profileId',
      },
      error: 'Missing profileId',
    };
  }

  try {
    // Step 1: 确保 Session 存在（Browser Service 视角）
    const sessionInput: EnsureSessionInput = {
      profileId,
      url: startUrl,
      serviceUrl: browserServiceUrl || 'http://127.0.0.1:7704',
    };

    const sessionResult: EnsureSessionOutput = await ensureSessionExecute(sessionInput);

    if (sessionResult.error) {
      return {
        success: false,
        profileId,
        session: sessionResult,
        login: {
          profileId,
          status: 'error',
          error: 'EnsureSession failed',
        },
        error: sessionResult.error,
      };
    }

    // Step 2: 基于容器的登录检测（Unified API / containers:match）
    const loginInput: EnsureLoginInput = {
      profileId,
      serviceUrl: unifiedApiUrl || 'http://127.0.0.1:7701',
    };

    const loginResult: EnsureLoginOutput = await ensureLoginExecute(loginInput);

    // Workflow 本身不负责自动登录，仅把状态透出给上层
    const success = loginResult.status === 'logged_in';

    return {
      success,
      profileId,
      session: sessionResult,
      login: loginResult,
      error: success ? undefined : loginResult.error || loginResult.reason,
    };
  } catch (error: any) {
    return {
      success: false,
      profileId,
      session: {
        sessionId: '',
        status: 'active',
        currentPage: '',
        error: error.message || String(error),
      },
      login: {
        profileId,
        status: 'error',
        error: error.message || String(error),
      },
      error: error.message || String(error),
    };
  }
}

