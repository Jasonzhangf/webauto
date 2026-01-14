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
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');

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

      const rectOk = anchor.rect.width > 0 && anchor.rect.height > 0;
      if (!rectOk) {
        return false;
      }

      // 额外约束：确认“可见的”详情 overlay 已完全消失，避免在仍有详情 overlay 时误判为 search/home
      try {
        const domState = await controllerAction('browser:execute', {
          profile: sessionId,
          script: `(() => {
            const selectors = [
              '.note-detail-mask',
              '.note-detail-page',
              '.note-detail-dialog',
              '.note-detail',
              '.detail-container',
              '.media-container'
            ];
            const isVisible = (el) => {
              if (!el) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) return false;
              if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
              return true;
            };
            let visibleOverlay = null;
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && isVisible(el)) {
                visibleOverlay = el;
                break;
              }
            }
            return { hasDetailOverlayVisible: !!visibleOverlay };
          })()`,
        });
        const payload = domState.result || domState.data?.result || domState;
        if (payload?.hasDetailOverlayVisible) {
          console.warn('[ErrorRecovery] verifyStage: visible detail overlay still present, stage not stable');
          return false;
        }
      } catch (e: any) {
        console.warn('[ErrorRecovery] verifyStage DOM check error:', e.message);
      }

      return true;
    } catch (error: any) {
      console.warn('[ErrorRecovery] verifyStage 锚点验证异常:', error.message);
      return false;
    }
  }

  async function recoverWithEsc(): Promise<{ success: boolean; method: string }> {
    console.log('[ErrorRecovery] 使用ESC模式恢复...');

    // 0. 入口锚点：先确认当前确实处于“详情态”（存在“可见的” detail overlay），避免在错误页面上盲动。
    let hasDetailOverlay = false;
    try {
      const domState = await controllerAction('browser:execute', {
        profile: sessionId,
        script: `(() => {
          const selectors = [
            '.note-detail-mask',
            '.note-detail-page',
            '.note-detail-dialog',
            '.note-detail',
            '.detail-container',
            '.media-container'
          ];
          const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
            return true;
          };
          let visibleOverlay = null;
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && isVisible(el)) {
              visibleOverlay = el;
              break;
            }
          }
          return { hasDetailOverlayVisible: !!visibleOverlay };
        })()`,
      });
      const payload = domState.result || domState.data?.result || domState;
      hasDetailOverlay = Boolean(payload?.hasDetailOverlayVisible);
    } catch (e: any) {
      console.warn(
        `[ErrorRecovery] detail-overlay DOM probe failed before ESC recovery: ${e.message}`,
      );
    }

    if (!hasDetailOverlay) {
      console.warn(
        '[ErrorRecovery] detail overlay not detected before ESC recovery, continue ESC path based on stage hint',
      );
      // 这里不再直接返回失败：
      // - 来到 ErrorRecoveryBlock 且 fromStage=detail 时，调用方已经认为当前处于详情态
      // - DOM 预探测只是辅助信号，可能因为样式/结构变化导致误判
      // 因此即便未检测到 overlay，也继续尝试容器关闭与 ESC 按键，由后续 verifyStage 严格确认结果
    }

    // 0.1 次级锚点（非强制）：尝试命中详情 modal 容器，用于高亮确认；失败不再视为致命，仅记录日志。
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
      const detailAnchor = await verifyAnchorByContainerId(
        'xiaohongshu_detail.modal_shell',
        sessionId,
        serviceUrl,
        '2px solid #ff4444',
        1200,
      );

      if (!detailAnchor.found || !detailAnchor.rect) {
        console.warn(
          '[ErrorRecovery] detail modal anchor not found, continue ESC recovery based on DOM overlay only',
        );
      }
    } catch (e: any) {
      console.warn(
        `[ErrorRecovery] verify detail anchor failed before ESC recovery: ${e.message}`,
      );
      // 容器锚点只是次级信号，这里不再直接失败，后续依赖 DOM + search_result_list 锚点确认恢复效果
    }

    // 1) 优先通过容器运行时 + 系统点击关闭详情 modal（点击右上角关闭按钮）
    try {
      const clickResult = await controllerAction('container:operation', {
        containerId: 'xiaohongshu_detail.modal_shell',
        operationId: 'click',
        config: {
          selector: '.note-detail-mask .close-box, .note-detail-mask .close-circle',
          useSystemMouse: true,
          retries: 1,
        },
        sessionId
      });
      console.log(
        '[ErrorRecovery] container-close click result:',
        JSON.stringify(clickResult),
      );

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 1.1 关闭后通过搜索结果列表锚点 + DOM overlay 检查判断是否已回到安全阶段
      try {
        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
        const anchor = await verifyAnchorByContainerId(
          'xiaohongshu_search.search_result_list',
          sessionId,
          serviceUrl,
          '2px solid #4caf50',
          1000,
        );
        const anchorOk =
          anchor.found && anchor.rect && anchor.rect.width > 0 && anchor.rect.height > 0;

        let overlayGone = true;
        try {
          const domState = await controllerAction('browser:execute', {
            profile: sessionId,
            script: `(() => {
              const selectors = [
                '.note-detail-mask',
                '.note-detail-page',
                '.note-detail-dialog',
                '.note-detail',
                '.detail-container',
                '.media-container'
              ];
              const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) return false;
                if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
                return true;
              };
              let visibleOverlay = null;
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && isVisible(el)) {
                  visibleOverlay = el;
                  break;
                }
              }
              return { hasDetailOverlayVisible: !!visibleOverlay };
            })()`,
          });
          const payload = domState.result || domState.data?.result || domState;
          overlayGone = !Boolean(payload?.hasDetailOverlayVisible);
        } catch (e: any) {
          console.warn(
            `[ErrorRecovery] overlay DOM check after container-close failed: ${e.message}`,
          );
        }

        if (anchorOk && overlayGone) {
          console.log(
            '[ErrorRecovery] ✅ detail closed via container operation (anchor matched, overlay gone)',
          );
          return { success: true, method: 'container-close' };
        }

        if (anchorOk && !overlayGone) {
          console.warn(
            '[ErrorRecovery] search_result_list visible but detail overlay still present after container-close, will fallback to ESC key',
          );
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

    // 2) 兜底：再次发送 ESC 键关闭详情页
    try {
      await controllerAction('browser:execute', {
        profile: sessionId,
        script:
          'document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true }))',
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
      const anchor = await verifyAnchorByContainerId(
        'xiaohongshu_search.search_result_list',
        sessionId,
        serviceUrl,
        '2px solid #4caf50',
        1000,
      );
      const ok = anchor.found && anchor.rect && anchor.rect.width > 0 && anchor.rect.height > 0;
      return { success: ok, method: 'esc-key-double' };
    } catch (err: any) {
      console.warn(
        `[ErrorRecovery] second ESC fallback failed: ${err?.message || err}`,
      );
      return { success: false, method: 'esc-key-double-error' };
    }
  }

  async function navigateTo(target: 'search' | 'home'): Promise<void> {
    // 禁止使用 history.back() 或 URL 构造进行导航
    // 要求通过容器点击或用户交互完成页面切换
    if (target === 'search') {
      // 尝试通过点击搜索框重新进入搜索状态
      try {
        await controllerAction('browser:execute', {
          profile: sessionId,
          script: `
            const searchBox = document.querySelector('.search-input, input[placeholder*="搜索"]');
            if (searchBox) {
              searchBox.focus();
              searchBox.click();
              'search-box-focused';
            }
            'search-box-not-found';
          `
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.warn('[ErrorRecovery] failed to focus search box:', err);
      }
      return;
    }

    // 禁止脚本直接导航回首页，要求人工确认/操作
    console.warn('[ErrorRecovery] Skip auto navigation to home (manual action required).');
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
