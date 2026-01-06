/**
 * Workflow Block: CollectSearchListBlock
 *
 * 从搜索结果列表中收集笔记条目
 */

export interface CollectSearchListInput {
  sessionId: string;
  targetCount?: number;
  serviceUrl?: string;
}

export interface SearchItem {
  containerId: string;
  noteId?: string;
  title?: string;
  detailUrl?: string;
  raw?: Record<string, any>;
}

export interface CollectSearchListOutput {
  success: boolean;
  items: SearchItem[];
  count: number;
  error?: string;
}

/**
 * 收集搜索结果列表
 *
 * @param input - 输入参数
 * @returns Promise<CollectSearchListOutput>
 */
export async function execute(input: CollectSearchListInput): Promise<CollectSearchListOutput> {
  const {
    sessionId,
    targetCount = 20,
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

  function collectContainers(tree: any, pattern: RegExp, result: any[] = []): any[] {
    if (!tree) return result;
    if (pattern.test(tree.id || tree.defId || '')) {
      result.push(tree);
    }
    if (Array.isArray(tree.children)) {
      for (const child of tree.children) {
        collectContainers(child, pattern, result);
      }
    }
    return result;
  }

  try {
    // 1. 匹配搜索根容器
    const matchResult = await controllerAction('containers:match', {
      profile,
      maxDepth: 4,
      maxChildren: 20
    });

    const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
    if (!tree) {
      throw new Error('未获取到容器树');
    }

    // 2. 查找 search_result_list 容器
    const listContainer = findContainer(tree, /xiaohongshu_search\.search_result_list$/);
    if (!listContainer) {
      throw new Error('未找到 search_result_list 容器');
    }

    // 3. 检查列表下的 item 容器
    const inspected = await controllerAction('containers:inspect-container', {
      profile,
      containerId: listContainer.id,
      maxChildren: 50
    });

    const listTree = inspected.snapshot?.container_tree || inspected.container_tree || listContainer;
    const itemNodes = collectContainers(listTree, /xiaohongshu_search\.search_result_item$/);

    const items: SearchItem[] = [];
    for (const node of itemNodes) {
      if (!node.id) continue;
      
      try {
        // 使用容器 extract 操作提取字段
        const extractResult = await controllerAction('container:operation', {
          containerId: node.id,
          operationId: 'extract',
          config: { fields: ['title', 'detail_url', 'note_id'] },
          sessionId: profile
        });

        const extracted = extractResult.data?.extracted?.[0] || extractResult.extracted?.[0] || {};
        const noteId = extracted.note_id || extracted.noteId;
        const detailUrl = extracted.detail_url || extracted.detailUrl;

        items.push({
          containerId: node.id,
          noteId,
          title: extracted.title,
          detailUrl,
          raw: extracted
        });

        if (items.length >= targetCount) break;
      } catch (error) {
        console.warn(`[CollectSearchList] 提取失败: ${error.message}`);
      }
    }

    return {
      success: true,
      items,
      count: items.length
    };

  } catch (error: any) {
    return {
      success: false,
      items: [],
      count: 0,
      error: `CollectSearchList failed: ${error.message}`
    };
  }
}
