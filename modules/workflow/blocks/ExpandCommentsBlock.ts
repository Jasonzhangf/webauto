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

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpandCommentsOutput {
  success: boolean;
  comments: Array<Record<string, any>>;
  reachedEnd: boolean;
  emptyState: boolean;
  anchor?: {
    commentSectionContainerId: string;
    commentSectionRect?: Rect;
    sampleCommentContainerId?: string;
    sampleCommentRect?: Rect;
    endMarkerContainerId?: string;
    endMarkerRect?: Rect;
    verified?: boolean;
  };
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
      body: JSON.stringify({ action, payload }),
      // 给容器相关操作加统一超时，避免挂死
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
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
    const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');

    // 1. 基于容器 ID 锚定评论区（不依赖 container_tree 是否挂在 detail 下）
    const commentSection = { id: 'xiaohongshu_detail.comment_section' };

    // 1.1 对评论区根容器做一次高亮 + Rect 回环（优先用容器定义 selector）
    let commentSectionRect: Rect | undefined;
    try {
      const anchor = await verifyAnchorByContainerId(
        commentSection.id,
        profile,
        serviceUrl,
        '2px solid #ffaa00',
        2000,
      );
      if (anchor.found && anchor.rect) {
        commentSectionRect = anchor.rect;
        console.log(`[ExpandComments] comment_section rect: ${JSON.stringify(anchor.rect)}`);
      } else {
        console.warn(
          `[ExpandComments] comment_section anchor verify failed: ${anchor.error || 'not found'}`,
        );
      }
    } catch (e: any) {
      console.warn(`[ExpandComments] comment_section anchor verify error: ${e.message}`);
    }

    // 2. 直接在当前 DOM 状态下提取（不再点击「展开」），滚动由本 Block 自行控制，WarmupCommentsBlock 负责提前展开回复

    // 2.1 重新 inspect 评论区域，供锚点与终止标记使用
    const inspected = await controllerAction('containers:inspect-container', {
      profile,
      containerId: commentSection.id,
      maxChildren: 200
    });

    const effectiveTree = inspected.snapshot?.container_tree || inspected.container_tree || commentSection;

    // 3. 收集评论项（用于锚点校验）
    const commentNodes = collectContainers(effectiveTree, /xiaohongshu_detail\.comment_section\.comment_item$/);
    const comments: Array<Record<string, any>> = [];
    const seenKeys = new Set<string>();

    // 5.1 选一个样本评论做高亮 + Rect 回环
    let sampleCommentRect: Rect | undefined;
    let sampleCommentContainerId: string | undefined;
    if (commentNodes.length > 0) {
      const sample = commentNodes[0];
      if (sample?.id) {
        sampleCommentContainerId = sample.id;
        try {
          const anchor = await verifyAnchorByContainerId(
            sample.id,
            profile,
            serviceUrl,
            '2px solid #00ff00',
            2000,
          );
          if (anchor.found && anchor.rect) {
            sampleCommentRect = anchor.rect;
            console.log(`[ExpandComments] sample comment rect: ${JSON.stringify(anchor.rect)}`);
          } else {
            console.warn(
              `[ExpandComments] sample comment anchor verify failed: ${anchor.error || 'not found'}`,
            );
          }
        } catch (e: any) {
          console.warn(`[ExpandComments] sample comment anchor verify error: ${e.message}`);
        }
      }
    }

    // 3.2 实际评论内容提取：只做一次 DOM 聚合，不做任何 JS 滚动（滚动完全由 WarmupCommentsBlock 负责）
    try {
      const script = `(() => {
        const root = document.querySelector('.comments-el') ||
          document.querySelector('.comment-list') ||
          document.querySelector('.comments-container') ||
          document.querySelector('[class*=\"comment-section\"]');
        if (!root) return { found: false, comments: [] };

        const items = Array.from(root.querySelectorAll('.comment-item'));
        const comments = items.map((el) => {
          const pickText = (selList) => {
            for (const sel of selList) {
              const n = el.querySelector(sel);
              if (n && n.textContent) return n.textContent.trim();
            }
            return '';
          };
          const profileLink = el.querySelector('a[href*=\"/user/profile/\"]');
          const userLink = profileLink ? profileLink.getAttribute('href') || '' : '';
          const userId = profileLink ? profileLink.getAttribute('data-user-id') || '' : '';

          const userName = pickText(['.name', '.username', '.user-name']);
          const text = pickText(['.content', '.comment-content', 'p']);
          const timestamp = pickText(['.date', '.time', '[class*=\"time\"]']);

          const isReply = !!el.closest('.reply-container');

          return {
            user_name: userName,
            user_link: userLink,
            user_id: userId,
            text,
            timestamp,
            is_reply: isReply
          };
        });

        return { found: true, comments };
      })()`;

      const domResult = await controllerAction('browser:execute', {
        profile,
        script
      });

      const payload = domResult.result || domResult.data?.result || domResult;
      if (!payload?.found || !Array.isArray(payload.comments)) {
        console.warn('[ExpandComments] DOM scan returned no comments');
      } else {
        let newCount = 0;
        for (const c of payload.comments) {
          if (!c || Object.keys(c).length === 0) continue;
          const key = `${c.user_id || ''}||${c.user_name || ''}||${c.text || ''}||${c.timestamp || ''}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          comments.push(c);
          newCount++;
        }
        console.log(`[ExpandComments] single scan comments=${comments.length} new=${newCount}`);
      }
    } catch (e: any) {
      console.warn(`[ExpandComments] DOM-based comment aggregation error: ${e.message}`);
    }

    // 4. 检查终止条件
    const endMarker = findContainer(effectiveTree, /xiaohongshu_detail\.comment_section\.end_marker$/);
    const emptyState = findContainer(effectiveTree, /xiaohongshu_detail\.comment_section\.empty_state$/);

    let endMarkerRect: Rect | undefined;
    let endMarkerContainerId: string | undefined;

    if (endMarker?.id) {
      endMarkerContainerId = endMarker.id;
      try {
        const anchor = await verifyAnchorByContainerId(
          endMarker.id,
          profile,
          serviceUrl,
          '2px solid #ff8c00',
          2000,
        );
        if (anchor.found && anchor.rect) {
          endMarkerRect = anchor.rect;
          console.log(`[ExpandComments] end_marker rect: ${JSON.stringify(anchor.rect)}`);
        } else {
          console.warn(
            `[ExpandComments] end_marker anchor verify failed: ${anchor.error || 'not found'}`,
          );
        }
      } catch (e: any) {
        console.warn(`[ExpandComments] end_marker anchor verify error: ${e.message}`);
      }
    } else if (emptyState?.id) {
      // 如果是空状态，也可以把空状态当作终止锚点
      endMarkerContainerId = emptyState.id;
      try {
        const anchor = await verifyAnchorByContainerId(
          emptyState.id,
          profile,
          serviceUrl,
          '2px dashed #888888',
          2000,
        );
        if (anchor.found && anchor.rect) {
          endMarkerRect = anchor.rect;
          console.log(`[ExpandComments] empty_state rect: ${JSON.stringify(anchor.rect)}`);
        } else {
          console.warn(
            `[ExpandComments] empty_state anchor verify failed: ${anchor.error || 'not found'}`,
          );
        }
      } catch (e: any) {
        console.warn(`[ExpandComments] empty_state anchor verify error: ${e.message}`);
      }
    }

    // Rect 规则验证：评论区在中下部，样本评论/终止标记可见
    let verified = false;
    if (commentSectionRect && sampleCommentRect) {
      const sectionOk = commentSectionRect.height > 0;
      const sampleOk = sampleCommentRect.height > 0;
      const endOk = endMarkerRect ? endMarkerRect.height > 0 : true;
      verified = sectionOk && sampleOk && endOk;
      console.log(`[ExpandComments] Rect validation: section=${sectionOk}, sample=${sampleOk}, end=${endOk}`);
    }

    return {
      success: true,
      comments,
      reachedEnd: Boolean(endMarker),
      emptyState: Boolean(emptyState),
      anchor: {
        commentSectionContainerId: commentSection.id,
        commentSectionRect,
        sampleCommentContainerId,
        sampleCommentRect,
        endMarkerContainerId,
        endMarkerRect,
        verified
      }
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
