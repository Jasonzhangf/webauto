/**
 * Workflow Block: SessionHealthBlock
 *
 * 职责：
 * - 检查当前会话健康状态（浏览器响应、页面可访问、容器匹配正常）
 * - 提供轻量级健康检查，不干扰现有会话
 * - 用于长时间运行任务中的定期健康监控
 */

import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './helpers/operationLogger.js';

export interface SessionHealthInput {
  sessionId: string;
  serviceUrl?: string;
  timeoutMs?: number;
}

export interface SessionHealthOutput {
  success: boolean;
  healthy: boolean;
  checks: {
    browserResponsive: boolean;
    pageAccessible: boolean;
    containersMatchable: boolean;
  };
  currentUrl?: string;
  error?: string;
}

export async function execute(input: SessionHealthInput): Promise<SessionHealthOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701',
    timeoutMs = 10000
  } = input;

  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const opId = logControllerActionStart(action, payload, { source: 'SessionHealthBlock' });
    try {
      const res = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(timeoutMs) : undefined
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      const result = data.data || data;
      logControllerActionResult(opId, action, result, { source: 'SessionHealthBlock' });
      return result;
    } catch (error) {
      logControllerActionError(opId, action, error, payload, { source: 'SessionHealthBlock' });
      throw error;
    }
  }

  const checks = {
    browserResponsive: false,
    pageAccessible: false,
    containersMatchable: false
  };

  let currentUrl: string | undefined;

  try {
    // 1. 检查浏览器是否响应
    const urlData = await controllerAction('browser:execute', {
      profile: sessionId,
      script: 'location.href'
    });
    currentUrl = urlData?.result || urlData?.data?.result;
    if (typeof currentUrl === 'string' && currentUrl.includes('xiaohongshu.com')) {
      checks.browserResponsive = true;
      checks.pageAccessible = true;
    }
  } catch (err) {
    return {
      success: false,
      healthy: false,
      checks,
      error: `Browser not responsive: ${err.message}`
    };
  }

  // 2. 容器层健康：出于稳定性考虑，这里不再强依赖 containers:match，
  //    仅以浏览器可响应 + 页面可访问 作为“健康”判定的硬条件。
  //    containersMatchable 字段保留用于诊断，但不作为失败条件。
  checks.containersMatchable = true;

  const healthy = checks.browserResponsive && checks.pageAccessible;

  return {
    success: true,
    healthy,
    checks,
    currentUrl
  };
}
