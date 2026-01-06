/**
 * Workflow Block: ExpandCommentsBlock
 *
 * 展开评论并提取评论列表
 */

export interface ExpandCommentsInput {
  sessionId: string;
  maxRounds?: number;
  serviceUrl?: string;
}

export interface ExpandCommentsOutput {
  success: boolean;
  comments: Array<Record<string, any>>;
  reachedEnd: boolean;
  emptyState: boolean;
  error?: string;
}

/**
 * 展开评论并提取列表
 *
 * @param input - 输入参数
 * @returns Promise<ExpandCommentsOutput>
 */
export async function execute(input: ExpandCommentsInput): Promise<ExpandCommentsOutput> {
  const {
    sessionId,
    maxRounds = 6,
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

  async function extractComment(nodeId: string) {
    const result = await controllerAction('container:operation', {
      containerId: nodeId,
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
      maxDepth: 5,
      maxChildren: 30
    });

    const tree = matchResult.snapshot?.container_tree || matchResult.container_tree;
    if (!tree) {
      throw new Error('未获取到容器树');
    }

    // 2. 找到评论区域容器
    const commentSection = findContainer(tree, /xiaohongshu_detail\.comment_section$/);
    if (!commentSection?.id) {
      throw new Error('未找到 comment_section 容器');
    }

    // 3. 多轮滚动 + 展开评论
    for (let i = 0; i < maxRounds; i++) {
      // 滚动评论区
      await controllerAction('container:operation', {
        containerId: commentSection.id,
        operationId: 'scroll',
        config: { direction: 'down', distance: 600 },
        sessionId: profile
      });

      await new Promise(r => setTimeout(r, 600));

      // 触发展开按钮（如果存在）
      await controllerAction('container:operation', {
        containerId: commentSection.id,
        operationId: 'find-child',
        config: { container_id: 'xiaohongshu_detail.comment_section.show_more_button' },
        sessionId: profile
      }).catch(() => {});

      await new Promise(r => setTimeout(r, 600));
    }

    // 4. 重新 inspect 评论区域
    const inspected = await controllerAction('containers:inspect-container', {
      profile,
      containerId: commentSection.id,
      maxChildren: 200
    });

    const effectiveTree = inspected.snapshot?.container_tree || inspected.container_tree || commentSection;

    // 5. 收集评论项
    const commentNodes = collectContainers(effectiveTree, /xiaohongshu_detail\.comment_section\.comment_item$/);
    const comments: Array<Record<string, any>> = [];

    for (const node of commentNodes) {
      if (!node.id) continue;
      try {
        const info = await extractComment(node.id);
        if (Object.keys(info).length > 0) {
          comments.push(info);
        }
      } catch (error) {
        console.warn(`[ExpandComments] 评论提取失败: ${error.message}`);
      }
    }

    // 6. 检查终止条件
    const endMarker = findContainer(effectiveTree, /xiaohongshu_detail\.comment_section\.end_marker$/);
    const emptyState = findContainer(effectiveTree, /xiaohongshu_detail\.comment_section\.empty_state$/);

    return {
      success: true,
      comments,
      reachedEnd: Boolean(endMarker),
      emptyState: Boolean(emptyState)
    };

  } catch (error: any) {
    return {
      success: false,
      comments: [],
      reachedEnd: false,
      emptyState: false,
      error: `ExpandComments failed: ${error.message}`
    };
  }
}
