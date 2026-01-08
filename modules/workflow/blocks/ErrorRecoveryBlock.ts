/**
 * Workflow Block: ErrorRecoveryBlock
 *
 * 职责：
 * - 提供阶段错误后的恢复策略
 * - 统一恢复到安全起点（搜索页或主页）
 * - 验证恢复是否成功（锚点回环）
 * - 支持ESC恢复模式（用于Phase3/4详情页恢复）
 * - 支持多种恢复路径（home/search/detail）
 */

export interface ErrorRecoveryInput {
  sessionId: string;
  fromStage: 'search' | 'detail' | 'home';
  targetStage: 'search' | 'home';
  serviceUrl?: string;
  maxRetries?: number;
  recoveryMode?: 'esc' | 'navigate';
}

export interface ErrorRecoveryOutput {
  success: boolean;
  recovered: boolean;
  finalStage: 'search' | 'home' | 'unknown';
  currentUrl?: string;
  error?: string;
  method?: string;
}

export async function execute(input: ErrorRecoveryInput): Promise<ErrorRecoveryOutput> {
  const {
    sessionId,
    fromStage,
    targetStage,
    serviceUrl = 'http://127.0.0.1:7701',
    maxRetries = 2,
    recoveryMode = 'navigate'
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
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');

      const targetContainerId =
        stage === 'search'
          ? 'xiaohongshu_search.search_result_list'
          : 'xiaohongshu_home';

      const anchor = await verifyAnchorByContainerId(
        targetContainerId,
        sessionId,
        serviceUrl,
        '2px solid #4caf50',
        1200
      );

      if (!anchor.found || !anchor.rect) {
        return false;
      }

      return anchor.rect.width > 0 && anchor.rect.height > 0;
    } catch (error: any) {
      console.warn('[ErrorRecovery] verifyStage 锚点验证异常:', error.message);
      return false;
    }
  }

  async function recoverWithEsc(): Promise<{ success: boolean; method: string }> {
    console.log('[ErrorRecovery] 使用ESC模式恢复...');

    // 0. 只有在确认命中详情 modal 锚点的前提下，才允许执行关闭/回退操作，避免在错误页面上盲动。
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
      const detailAnchor = await verifyAnchorByContainerId(
        'xiaohongshu_detail.modal_shell',
        sessionId,
        serviceUrl,
        '2px solid #ff4444',
        1200,
      );

      if (!detailAnchor.found || !detailAnchor.rect) {
        console.warn('[ErrorRecovery] detail modal anchor not found, abort ESC recovery');
        return { success: false, method: 'no-detail-anchor' };
      }
    } catch (e: any) {
      console.warn(
        `[ErrorRecovery] verify detail anchor failed before ESC recovery: ${e.message}`,
      );
      return { success: false, method: 'anchor-verify-error' };
    }

    // 1) 优先通过容器运行时关闭详情 modal
    try {
      await controllerAction('container:operation', {
        containerId: 'xiaohongshu_detail.modal_shell',
        operationId: 'close',
        sessionId,
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 1.1 关闭后直接通过搜索结果列表锚点判断是否已回到安全阶段
      try {
        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
        const anchor = await verifyAnchorByContainerId(
          'xiaohongshu_search.search_result_list',
          sessionId,
          serviceUrl,
          '2px solid #4caf50',
          1000,
        );
        if (anchor.found && anchor.rect && anchor.rect.width > 0 && anchor.rect.height > 0) {
          console.log('[ErrorRecovery] ✅ detail closed via container operation (anchor matched)');
          return { success: true, method: 'container-close' };
        }
      } catch (err: any) {
        console.warn(
          `[ErrorRecovery] verify search_result_list after close failed: ${err?.message || err}`,
        );
      }
    } catch (err) {
      console.warn(
        `[ErrorRecovery] container close failed, fallback to history.back: ${
          (err as any)?.message || String(err)
        }`,
      );
    }

    // 2) 兜底：在已确认处于详情页的前提下，仅执行一次 history.back()，
    // 成功与否完全由“搜索结果列表锚点是否出现”决定，不再依赖 URL 中的 /search_result。
    try {
      await controllerAction('browser:execute', {
        profile: sessionId,
        script: 'window.history.back()',
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
      const anchor = await verifyAnchorByContainerId(
        'xiaohongshu_search.search_result_list',
        sessionId,
        serviceUrl,
        '2px solid #4caf50',
        1000,
      );
      const ok = anchor.found && anchor.rect && anchor.rect.width > 0 && anchor.rect.height > 0;
      return { success: ok, method: 'history-back' };
    } catch (err: any) {
      console.warn(
        `[ErrorRecovery] history.back() fallback failed: ${err?.message || err}`,
      );
      return { success: false, method: 'history-back-error' };
    }
  }

  async function navigateTo(target: 'search' | 'home'): Promise<void> {
    if (target === 'search') {
      await controllerAction('browser:execute', {
        profile: sessionId,
        script: 'history.back()'
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
      return;
    }

    await controllerAction('browser:execute', {
      profile: sessionId,
      script: `(() => {
        if (!location.href.includes('xiaohongshu.com')) {
          window.location.href = 'https://www.xiaohongshu.com';
        }
      })();`
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log(`[ErrorRecovery] 从 ${fromStage} 恢复到 ${targetStage}...`);

  try {
    if (recoveryMode === 'esc' && fromStage === 'detail' && targetStage === 'search') {
      const escResult = await recoverWithEsc();
      
      if (escResult.success) {
        const verified = await verifyStage('search');
        if (verified) {
          return {
            success: true,
            recovered: true,
            finalStage: 'search',
            currentUrl: await getCurrentUrl(),
            method: escResult.method
          };
        }
      }
      
      console.log('[ErrorRecovery] ESC恢复失败，降级到navigate模式...');
    }
    
    const currentUrl = await getCurrentUrl();
    const atSearch = await verifyStage('search');
    const atHome = await verifyStage('home');

    // 仅通过锚点判断当前阶段，不再依赖 URL
    if ((targetStage === 'search' && atSearch) || (targetStage === 'home' && atHome)) {
      console.log(`[ErrorRecovery] ✅ 已在目标阶段 ${targetStage}（anchor verified）`);
      return {
        success: true,
        recovered: false,
        finalStage: targetStage,
        currentUrl,
        method: 'already-at-target'
      };
    }

    for (let i = 0; i < maxRetries; i++) {
      console.log(`[ErrorRecovery] 恢复尝试 ${i + 1}/${maxRetries}`);

      if (fromStage === 'detail') {
        try {
          await controllerAction('container:operation', {
            containerId: 'xiaohongshu_detail.modal_shell',
            operationId: 'close',
            sessionId
          });
        } catch (err) {
          console.warn('[ErrorRecovery] 关闭 modal 失败:', (err as any).message);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await navigateTo(targetStage);

      const verified = await verifyStage(targetStage);
      if (verified) {
        console.log(`[ErrorRecovery] ✅ 成功恢复到 ${targetStage}`);
        return {
          success: true,
          recovered: true,
          finalStage: targetStage,
          currentUrl: await getCurrentUrl(),
          method: 'navigate'
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
