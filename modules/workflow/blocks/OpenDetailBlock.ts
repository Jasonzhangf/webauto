/**
 * Workflow Block: OpenDetailBlock
 *
 * 打开详情页（通过容器 navigate）
 */

export interface OpenDetailInput {
  sessionId: string;
  containerId: string; // search_result_item 容器 ID
  serviceUrl?: string;
}

export interface OpenDetailOutput {
  success: boolean;
  detailReady: boolean;
  error?: string;
}

/**
 * 打开详情页
 *
 * @param input - 输入参数
 * @returns Promise<OpenDetailOutput>
 */
export async function execute(input: OpenDetailInput): Promise<OpenDetailOutput> {
  const {
    sessionId,
    containerId,
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

  function findContainer(tree: any, pattern: RegExp): any {
    if (!tree) return null;
    if (pattern.test(tree.id || tree.defId || '')) return tree;
    if (Array.isArray(tree.children)) {
      for (const child of tree.children) {
        const found = findContainer(child, pattern);
        if (found) return found;
      }
    }
    return null;
  }

  async function waitForDetail(maxRetries = 5): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      const matchResult = await controllerAction('containers:match', {
        profile,
        maxDepth: 4,
        maxChildren: 20
      });

      const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
      if (!tree) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const modal = findContainer(tree, /xiaohongshu_detail\.modal_shell$/);
      if (modal) {
        return true;
      }

      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  try {
    // 1. 执行 navigate 操作打开详情
    await controllerAction('container:operation', {
      containerId,
      operationId: 'navigate',
      config: { wait_after_ms: 1200 },
      sessionId: profile
    });

    // 2. 等待详情模态出现
    const detailReady = await waitForDetail();

    return {
      success: true,
      detailReady
    };
  } catch (error: any) {
    return {
      success: false,
      detailReady: false,
      error: `OpenDetail failed: ${error.message}`
    };
  }
}
