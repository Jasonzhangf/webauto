/**
 * Workflow Block: ErrorRecoveryBlock
 *
 * 职责：
 * - 提供阶段错误后的恢复策略
 * - 统一恢复到安全起点（搜索页或主页）
 * - 验证恢复是否成功（锚点回环）
 * - 支持多种恢复路径（home/search/detail）
 */

export interface ErrorRecoveryInput {
  sessionId: string;
  fromStage: 'search' | 'detail' | 'home';
  targetStage: 'search' | 'home';
  serviceUrl?: string;
  maxRetries?: number;
}

export interface ErrorRecoveryOutput {
  success: boolean;
  recovered: boolean;
  finalStage: 'search' | 'home' | 'unknown';
  currentUrl?: string;
  error?: string;
}

export async function execute(input: ErrorRecoveryInput): Promise<ErrorRecoveryOutput> {
  const {
    sessionId,
    fromStage,
    targetStage,
    serviceUrl = 'http://127.0.0.1:7701',
    maxRetries = 2
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

  async function getCurrentUrl(): Promise<string> {
    const data = await controllerAction('browser:execute', {
      profile: sessionId,
      script: 'location.href'
    });
    return data?.result || data?.data?.result || '';
  }

  async function verifyStage(stage: 'search' | 'home'): Promise<boolean> {
    const matchResult = await controllerAction('containers:match', {
      profile: sessionId,
      maxDepth: 2,
      maxChildren: 5
    });

    const tree = matchResult?.snapshot?.container_tree || matchResult?.container_tree;
    if (!tree) return false;

    const targetContainerId = stage === 'search' 
      ? 'xiaohongshu_search.search_result_list' 
      : 'xiaohongshu_home';

    const findContainer = (node: any): boolean => {
      if (!node) return false;
      const id = node.id || node.defId || '';
      if (id === targetContainerId) return true;
      if (Array.isArray(node.children)) {
        return node.children.some(findContainer);
      }
      return false;
    };

    return findContainer(tree);
  }

  async function navigateTo(target: 'search' | 'home'): Promise<void> {
    const url = target === 'search' 
      ? 'https://www.xiaohongshu.com/explore' 
      : 'https://www.xiaohongshu.com';

    await controllerAction('browser:execute', {
      profile: sessionId,
      script: `window.location.href = '${url}'`
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log(`[ErrorRecovery] 从 ${fromStage} 恢复到 ${targetStage}...`);

  try {
    // 1. 检查当前状态
    const currentUrl = await getCurrentUrl();
    const currentStage = currentUrl.includes('/explore') ? 'search' : 'home';

    if (currentStage === targetStage) {
      // 验证是否真正到达目标阶段
      const verified = await verifyStage(targetStage);
      if (verified) {
        console.log(`[ErrorRecovery] ✅ 已在目标阶段 ${targetStage}`);
        return {
          success: true,
          recovered: false,
          finalStage: targetStage,
          currentUrl
        };
      }
    }

    // 2. 尝试恢复
    for (let i = 0; i < maxRetries; i++) {
      console.log(`[ErrorRecovery] 恢复尝试 ${i + 1}/${maxRetries}`);

      // 关闭 modal（如果从 detail 阶段恢复）
      if (fromStage === 'detail') {
        try {
          await controllerAction('container:operation', {
            containerId: 'xiaohongshu_detail.modal_shell',
            operationId: 'close',
            sessionId
          });
        } catch (err) {
          console.warn('[ErrorRecovery] 关闭 modal 失败:', err.message);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 导航到目标阶段
      await navigateTo(targetStage);

      // 验证是否到达目标阶段
      const verified = await verifyStage(targetStage);
      if (verified) {
        console.log(`[ErrorRecovery] ✅ 成功恢复到 ${targetStage}`);
        return {
          success: true,
          recovered: true,
          finalStage: targetStage,
          currentUrl: await getCurrentUrl()
        };
      }

      if (i < maxRetries - 1) {
        console.log('[ErrorRecovery] 等待3秒后重试...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    return {
      success: false,
      recovered: false,
      finalStage: 'unknown',
      currentUrl: await getCurrentUrl(),
      error: `无法恢复到 ${targetStage} 阶段`
    };

  } catch (err: any) {
    return {
      success: false,
      recovered: false,
      finalStage: 'unknown',
      error: `恢复异常: ${err.message}`
    };
  }
}
