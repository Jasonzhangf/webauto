/**
 * Workflow Block: SessionHealthBlock
 *
 * 职责：
 * - 检查当前会话健康状态（浏览器响应、页面可访问、容器匹配正常）
 * - 提供轻量级健康检查，不干扰现有会话
 * - 用于长时间运行任务中的定期健康监控
 */

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
    return data.data || data;
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

  try {
    // 2. 检查容器匹配是否正常（轻量级测试）
    const matchData = await controllerAction('containers:match', {
      profile: sessionId,
      url: currentUrl,
      maxDepth: 1,
      maxChildren: 1
    });
    const tree = matchData?.snapshot?.container_tree || matchData?.container_tree;
    if (tree && tree.id) {
      checks.containersMatchable = true;
    }
  } catch (err) {
    return {
      success: false,
      healthy: false,
      checks,
      currentUrl,
      error: `Containers not matchable: ${err.message}`
    };
  }

  const healthy = checks.browserResponsive && checks.pageAccessible && checks.containersMatchable;

  return {
    success: true,
    healthy,
    checks,
    currentUrl
  };
}
