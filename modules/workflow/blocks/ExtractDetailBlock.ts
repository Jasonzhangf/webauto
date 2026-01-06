/**
 * Workflow Block: ExtractDetailBlock
 *
 * 提取详情页内容（header/content/gallery）
 */

export interface ExtractDetailInput {
  sessionId: string;
  serviceUrl?: string;
}

export interface DetailData {
  header?: Record<string, any>;
  content?: Record<string, any>;
  gallery?: Record<string, any>;
}

export interface ExtractDetailOutput {
  success: boolean;
  detail?: DetailData;
  error?: string;
}

/**
 * 提取详情页内容
 *
 * @param input - 输入参数
 * @returns Promise<ExtractDetailOutput>
 */
export async function execute(input: ExtractDetailInput): Promise<ExtractDetailOutput> {
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

  async function extractContainer(containerId: string) {
    const result = await controllerAction('container:operation', {
      containerId,
      operationId: 'extract',
      config: {},
      sessionId: profile
    });

    return result.data?.extracted?.[0] || result.extracted?.[0] || {};
  }

  try {
    // 1. 匹配详情容器树
    const matchResult = await controllerAction('containers:match', {
      profile,
      maxDepth: 4,
      maxChildren: 20
    });

    const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
    if (!tree) {
      throw new Error('未获取到详情容器树');
    }

    // 2. 查找详情子容器
    const headerNode = findContainer(tree, /xiaohongshu_detail\.header$/);
    const contentNode = findContainer(tree, /xiaohongshu_detail\.content$/);
    const galleryNode = findContainer(tree, /xiaohongshu_detail\.gallery$/);

    // 3. 提取数据
    const detail: DetailData = {};

    if (headerNode?.id) {
      detail.header = await extractContainer(headerNode.id);
    }

    if (contentNode?.id) {
      detail.content = await extractContainer(contentNode.id);
    }

    if (galleryNode?.id) {
      detail.gallery = await extractContainer(galleryNode.id);
    }

    return {
      success: true,
      detail
    };

  } catch (error: any) {
    return {
      success: false,
      error: `ExtractDetail failed: ${error.message}`
    };
  }
}
