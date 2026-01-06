/**
 * Workflow Block: CloseDetailBlock
 *
 * 关闭详情页（通用策略：history.back / ESC / 点击遮罩）
 */

export interface CloseDetailInput {
  sessionId: string;
  serviceUrl?: string;
}

export interface CloseDetailOutput {
  success: boolean;
  method: 'history_back' | 'esc_key' | 'mask_click' | 'unknown';
  error?: string;
}

/**
 * 关闭详情页
 *
 * @param input - 输入参数
 * @returns Promise<CloseDetailOutput>
 */
export async function execute(input: CloseDetailInput): Promise<CloseDetailOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any = {}) {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data || data;
  }

  try {
    // 方法1: 点击遮罩层
    await controllerAction('browser:execute', {
      profile,
      script: `(() => {
        const mask = document.querySelector('.note-detail-mask');
        if (mask) {
          mask.click();
          return 'mask_click';
        }
        return null;
      })()`
    });
    await new Promise(r => setTimeout(r, 1200));

    return {
      success: true,
      method: 'mask_click'
    };

  } catch (error) {
    // 方法2: history.back
    try {
      await controllerAction('browser:execute', {
        profile,
        script: 'window.history.back()'
      });
      await new Promise(r => setTimeout(r, 1200));
      return {
        success: true,
        method: 'history_back'
      };
    } catch (err) {
      return {
        success: false,
        method: 'unknown',
        error: `CloseDetail failed: ${err.message}`
      };
    }
  }
}
