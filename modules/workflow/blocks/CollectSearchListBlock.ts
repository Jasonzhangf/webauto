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
   safeDetailUrl?: string;
   hasToken?: boolean;
  raw?: Record<string, any>;
}

export interface CollectSearchListOutput {
  success: boolean;
  items: SearchItem[];
  count: number;
  firstItemContainerId?: string;
  anchor?: {
    listContainerId: string;
    listRect?: { x: number; y: number; width: number; height: number };
    firstItemContainerId?: string;
    firstItemRect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
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

  async function getCurrentUrl(): Promise<string> {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile, script: 'location.href' }
      })
    });
    const data = await response.json();
    return data.data?.result || '';
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
    const currentUrl = await getCurrentUrl();
    const matchResult = await controllerAction('containers:match', {
      profile,
      url: currentUrl,
      maxDepth: 8,
      maxChildren: 20
    });

    const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
    if (!tree) {
      throw new Error('未获取到容器树');
    }

    // 2. 查找 search_result_list 容器
    const listContainer = findContainer(tree, /xiaohongshu_search\.search_result_list$/);
    if (!listContainer) {
      // 调试：打印所有找到的容器 ID
      const allIds = collectContainers(tree, /.*/).map(n => n.id || n.defId);
      console.warn(`[CollectSearchList] 未找到 search_result_list, 当前容器树: ${allIds.join(', ')}`);
      throw new Error('未找到 search_result_list 容器');
    }

    // 2.1 高亮 search_result_list 容器
    try {
      await controllerAction('container:operation', {
        containerId: listContainer.id,
        operationId: 'highlight',
        config: { style: '3px solid #ff4444', duration: 2000 },
        sessionId: profile
      });
      console.log(`[CollectSearchList] Highlighted search_result_list: ${listContainer.id}`);
    } catch (error) {
      console.warn('[CollectSearchList] Highlight failed:', error.message);
    }

    // 2.2 获取 search_result_list 的 Rect
    let listRect: { x: number; y: number; width: number; height: number } | undefined;
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
      const anchor = await verifyAnchorByContainerId('xiaohongshu_search.search_result_list', profile, serviceUrl);
      if (anchor.found && anchor.rect) {
        listRect = anchor.rect;
        console.log(`[CollectSearchList] search_result_list rect: ${JSON.stringify(listRect)}`);
      } else {
        console.warn('[CollectSearchList] verifyAnchor for list failed:', anchor.error || 'unknown error');
      }
    } catch (error: any) {
      console.warn('[CollectSearchList] Get rect failed:', error.message);
    }

    // 3. 检查列表下的 item 容器
    const inspected = await controllerAction('containers:inspect-container', {
      profile,
      containerId: listContainer.id,
      maxChildren: 50
    });

    const listTree = inspected.snapshot?.container_tree || inspected.container_tree || listContainer;
    const itemNodes = collectContainers(listTree, /xiaohongshu_search\.search_result_item$/);

    // 3.1 高亮第一个 search_result_item（如果存在）
    let firstItemRect: { x: number; y: number; width: number; height: number } | undefined;
    let firstItemContainerId: string | undefined;
    if (itemNodes.length > 0) {
      const firstItem = itemNodes[0];
      firstItemContainerId = firstItem.id;
      try {
        await controllerAction('container:operation', {
          containerId: firstItem.id,
          operationId: 'highlight',
          config: { style: '3px solid #00ff00', duration: 2000 },
          sessionId: profile
        });
        console.log(`[CollectSearchList] Highlighted first search_result_item: ${firstItem.id}`);

        // 获取第一个 item 的 Rect（通过 DOM 高亮 + Rect 回环）
        try {
          const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
          const itemAnchor = await verifyAnchorByContainerId(firstItem.id, profile, serviceUrl);
          if (itemAnchor.found && itemAnchor.rect) {
            firstItemRect = itemAnchor.rect;
            console.log(`[CollectSearchList] First item rect: ${JSON.stringify(firstItemRect)}`);
          } else {
            console.warn('[CollectSearchList] verifyAnchor for first item failed:', itemAnchor.error || 'unknown error');
          }
        } catch (e: any) {
          console.warn('[CollectSearchList] Get first item rect failed:', e.message);
        }
      } catch (error: any) {
        console.warn('[CollectSearchList] Highlight first item failed:', error.message);
      }
    }

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
        const hasToken = typeof detailUrl === 'string' && /[?&]xsec_token=/.test(detailUrl);
        const safeDetailUrl = hasToken ? detailUrl : undefined;

        items.push({
          containerId: node.id,
          noteId,
          title: extracted.title,
          detailUrl,
          safeDetailUrl,
          hasToken,
          raw: extracted
        });

        if (items.length >= targetCount) break;
      } catch (error) {
        console.warn(`[CollectSearchList] 提取失败: ${error.message}`);
      }
    }

    // 验证 Rect：列表应该在页面中部（y > 100），item 应该非空
    const listRectValid = listRect && listRect.y > 100 && listRect.height > 0;
    const firstItemRectValid = firstItemRect && firstItemRect.width > 0 && firstItemRect.height > 0;
    const verified = listRectValid && firstItemRectValid;

    console.log(`[CollectSearchList] Rect validation: list=${listRectValid}, firstItem=${firstItemRectValid}, verified=${verified}`);

    return {
      success: true,
      items,
      count: items.length,
      firstItemContainerId: firstItemContainerId || (items[0]?.containerId ?? undefined),
      anchor: {
        listContainerId: listContainer.id,
        listRect,
        firstItemContainerId,
        firstItemRect,
        verified
      }
    };

  } catch (error: any) {
    return {
      success: false,
      items: [],
      count: 0,
      anchor: undefined,
      error: `CollectSearchList failed: ${error.message}`
    };
  }
}
