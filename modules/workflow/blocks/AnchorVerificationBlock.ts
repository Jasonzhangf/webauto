/**
 * Workflow Block: AnchorVerificationBlock
 *
 * 职责：
 * - 验证指定容器锚点是否在视口内且可见
 * - 提供进入锚点和离开锚点的双重验证
 * - 支持阶段回环验证（进入/离开锚点）
 */

export interface AnchorVerificationInput {
  sessionId: string;
  containerId: string;
  operation: 'enter' | 'exit';
  expectedVisible?: boolean; // enter=true, exit=false
  timeoutMs?: number;
  serviceUrl?: string;
}

export interface AnchorVerificationOutput {
  success: boolean;
  verified: boolean;
  containerFound: boolean;
  visible: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  error?: string;
}

export async function execute(input: AnchorVerificationInput): Promise<AnchorVerificationOutput> {
  const {
    sessionId,
    containerId,
    operation,
    expectedVisible = operation === 'enter',
    timeoutMs = 10000,
    serviceUrl = 'http://127.0.0.1:7701'
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

  try {
    console.log(`[AnchorVerification] ${operation} anchor: ${containerId}`);

    // 1. 容器匹配获取锚点信息
    const matchResult = await controllerAction('containers:match', {
      profile: sessionId,
      maxDepth: 3,
      maxChildren: 10
    });

    const snapshot = matchResult?.snapshot || matchResult;
    const tree = snapshot?.container_tree;
    if (!tree) {
      return {
        success: false,
        verified: false,
        containerFound: false,
        visible: false,
        error: '未获取到容器树'
      };
    }

    // 2. 查找目标容器
    const findContainer = (node: any): any => {
      if (!node) return null;
      const id = node.id || node.defId || '';
      if (id === containerId) return node;
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = findContainer(child);
          if (found) return found;
        }
      }
      return null;
    };

    const targetContainer = findContainer(tree);
    if (!targetContainer) {
      return {
        success: false,
        verified: false,
        containerFound: false,
        visible: false,
        error: `容器未找到: ${containerId}`
      };
    }

    // 3. 验证可见性（Rect 检查）
    const rectScript = `
      (() => {
        const el = document.querySelector('${targetContainer.selector?.replace(/'/g, "\\'") || ''}');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const visible = r.y < window.innerHeight && r.width > 0 && r.height > 0;
        return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, visible };
      })()
    `;

    const rectResult = await controllerAction('browser:execute', {
      profile: sessionId,
      script: rectScript
    });

    const rect = rectResult?.result?.rect;
    const visible = rectResult?.result?.visible || false;

    // 4. 验证结果
    const verified = visible === expectedVisible;

    if (!verified) {
      return {
        success: false,
        verified: false,
        containerFound: true,
        visible,
        rect,
        error: `锚点验证失败: 期望${expectedVisible ? '可见' : '不可见'}, 实际${visible ? '可见' : '不可见'}`
      };
    }

    return {
      success: true,
      verified: true,
      containerFound: true,
      visible,
      rect
    };

  } catch (err: any) {
    return {
      success: false,
      verified: false,
      containerFound: false,
      visible: false,
      error: `锚点验证异常: ${err.message}`
    };
  }
}
