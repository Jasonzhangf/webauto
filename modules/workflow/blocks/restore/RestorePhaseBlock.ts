/**
 * RestorePhaseBlock
 *
 * 基于 URL + 容器匹配恢复到指定阶段（Phase 入口锚点），用于 Phase1–4 的“回归锚点”能力。
 *
 * 约定：
 * - phase=1: 期望在 home/login（交给 Phase1 自己处理）
 * - phase=2: 期望在搜索入口阶段（home 或 search_result）
 * - phase=3: 期望在搜索结果阶段（search_result）
 * - phase=4: 期望在详情页阶段（detail）
 *
 * 恢复策略（小红书）：
 * - 当前在 detail：优先使用 ErrorRecoveryBlock(ESC) 关闭模态框，回到 search_result/home
 * - 当前在风控/未知页面：优先点击“发现页” sidebar 容器按钮（home/search.discover_button），回到首页
 * - 当前在 login：交给上层 Phase1 处理，不在此处强行导航
 */

import type { PageStage } from '../DetectPageStateBlock.js';
import { execute as detectPageState } from '../DetectPageStateBlock.js';
import { execute as errorRecovery } from '../ErrorRecoveryBlock.js';

export interface RestorePhaseInput {
  sessionId: string;
  phase: 1 | 2 | 3 | 4;
  serviceUrl?: string;
}

export interface RestorePhaseOutput {
  success: boolean;
  restored: boolean;
  finalPhase: 1 | 2 | 3 | 4;
  finalStage: PageStage;
  url: string;
  method?: string;
  error?: string;
}

function expectedStageForPhase(phase: 1 | 2 | 3 | 4): PageStage[] {
  switch (phase) {
    case 1:
      return ['home', 'login', 'unknown'];
    case 2:
      return ['home', 'search'];
    case 3:
      return ['search'];
    case 4:
      return ['detail'];
    default:
      return ['unknown'];
  }
}

function choosePhaseFromStage(stage: PageStage): 1 | 2 | 3 | 4 {
  if (stage === 'detail') return 4;
  if (stage === 'search') return 3;
  if (stage === 'home') return 2;
  if (stage === 'login') return 1;
  return 1;
}

export async function execute(input: RestorePhaseInput): Promise<RestorePhaseOutput> {
  const { sessionId, phase, serviceUrl = 'http://127.0.0.1:7701' } = input;

  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data.data || data;
  }

  async function clickDiscoverButton(): Promise<{ success: boolean; method?: string }> {
    const candidates = [
      'xiaohongshu_home.discover_button',
      'xiaohongshu_search.discover_button',
    ];

    for (const containerId of candidates) {
      try {
        await controllerAction('container:operation', {
          containerId,
          operationId: 'click',
          config: { useSystemMouse: true },
          sessionId,
        });
        // 给页面一点时间完成导航
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { success: true, method: `discover:${containerId}` };
      } catch {
        // 尝试下一个候选
      }
    }

    return { success: false };
  }

  try {
    // 1) 检测当前阶段（入口锚点）
    const state = await detectPageState({
      sessionId,
      platform: 'xiaohongshu',
      serviceUrl,
    });

    const expectedStages = expectedStageForPhase(phase);

    if (state.success && expectedStages.includes(state.stage)) {
      // 已经在本 Phase 允许的阶段，不做任何操作
      return {
        success: true,
        restored: false,
        finalPhase: phase,
        finalStage: state.stage,
        url: state.url,
        method: 'already-at-expected-stage',
        error: state.error,
      };
    }

    let currentStage: PageStage = state.stage;
    let currentUrl: string = state.url;
    let method: string | undefined;

    // 2) 针对不同阶段执行恢复策略
    if (currentStage === 'detail') {
      // 使用 ErrorRecoveryBlock 的 ESC 模式关闭详情模态框
      const rec = await errorRecovery({
        sessionId,
        fromStage: 'detail',
        targetStage: 'search',
        serviceUrl,
        recoveryMode: 'esc',
        maxRetries: 2,
      });

      if (!rec.success) {
        return {
          success: false,
          restored: false,
          finalPhase: phase,
          finalStage: currentStage,
          url: rec.currentUrl || currentUrl,
          method: rec.method,
          error: rec.error || 'ErrorRecoveryBlock failed',
        };
      }

      method = `errorRecovery:${rec.method || 'esc'}`;
      currentUrl = rec.currentUrl || currentUrl;

      const after = await detectPageState({
        sessionId,
        platform: 'xiaohongshu',
        serviceUrl,
      });
      currentStage = after.stage;
      currentUrl = after.url;
    } else if (currentStage === 'login') {
      // 登录页交给 Phase1 处理，不在此处强行导航
      return {
        success: false,
        restored: false,
        finalPhase: 1,
        finalStage: 'login',
        url: state.url,
        method: 'login-delegate-phase1',
        error: 'Current stage is login, please run Phase1 to complete login',
      };
    } else {
      // 风控/未知/其他页面：尝试点击发现页 sidebar 容器按钮
      const clickRes = await clickDiscoverButton();
      if (!clickRes.success) {
        return {
          success: false,
          restored: false,
          finalPhase: phase,
          finalStage: currentStage,
          url: currentUrl,
          method: 'discover-button-failed',
          error: 'Failed to click discover button to return home',
        };
      }

      method = clickRes.method;
      const after = await detectPageState({
        sessionId,
        platform: 'xiaohongshu',
        serviceUrl,
      });
      currentStage = after.stage;
      currentUrl = after.url;
    }

    const finalPhase = choosePhaseFromStage(currentStage);

    return {
      success: true,
      restored: true,
      finalPhase,
      finalStage: currentStage,
      url: currentUrl,
      method,
      error: state.error,
    };
  } catch (error: any) {
    return {
      success: false,
      restored: false,
      finalPhase: phase,
      finalStage: 'unknown',
      url: '',
      error: error?.message || String(error),
    };
  }
}
