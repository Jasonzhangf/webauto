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

  async function getCurrentUrl(): Promise<string> {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: 'location.href',
        },
      }),
    });
    const data = await response.json();
    return data.data?.result || data.result || '';
  }

  async function locateRectBySelectors(selectors: string[]): Promise<Rect | null> {
    const filtered = selectors.filter((sel) => typeof sel === 'string' && sel.trim().length > 0);
    if (!filtered.length) return null;
    try {
      const response = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const selectors = ${JSON.stringify(filtered)};
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (!el) continue;
              const rect = el.getBoundingClientRect();
              if (!rect || !rect.width || !rect.height) continue;
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, selector: sel };
            } catch (_) {}
          }
          return null;
        })()`,
      });
      const payload =
        (response as any)?.result || (response as any)?.data?.result || response;
      if (
        payload &&
        ['x', 'y', 'width', 'height'].every(
          (key) => typeof payload[key] === 'number' && Number.isFinite(payload[key]),
        )
      ) {
        return {
          x: Number(payload.x),
          y: Number(payload.y),
          width: Number(payload.width),
          height: Number(payload.height),
        };
      }
    } catch (err: any) {
      console.warn(`[ExpandComments] locateRectBySelectors error: ${err?.message || err}`);
    }
    return null;
  }

  async function locateCommentSectionRectFallback(): Promise<Rect | null> {
    try {
      const response = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const root =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container') ||
            document.querySelector('[class*="comment-section"]');
          if (!root) return null;
          const rect = root.getBoundingClientRect();
          return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        })()`,
      });
      const payload =
        (response as any)?.result || (response as any)?.data?.result || response;
      if (
        payload &&
        ['x', 'y', 'width', 'height'].every(
          (key) => typeof payload[key] === 'number' && Number.isFinite(payload[key]),
        )
      ) {
        return {
          x: Number(payload.x),
          y: Number(payload.y),
          width: Number(payload.width),
          height: Number(payload.height),
        };
      }
    } catch (err: any) {
      console.warn(
        `[ExpandComments] fallback comment_section rect error: ${err?.message || err}`,
      );
    }
    return null;
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
    const { verifyAnchorByContainerId, getPrimarySelectorByContainerId, getContainerExtractorsById } = await import('./helpers/containerAnchors.js');

    const safeGetPrimarySelectorById = async (containerId: string): Promise<string | null> => {
      try {
        return await getPrimarySelectorByContainerId(containerId);
      } catch (err: any) {
        console.warn(
          `[ExpandComments] getPrimarySelectorByContainerId error (${containerId}): ${err?.message || err}`,
        );
        return null;
      }
    };

    // 1. 基于容器 ID 锚定评论区（不依赖 container_tree 是否挂在 detail 下）
    const commentSection = { id: 'xiaohongshu_detail.comment_section' };

    // 1.1 对评论区根容器做一次高亮 + Rect 回环（优先用容器定义 selector）
    let commentSectionRect: Rect | undefined;
    let commentSectionLocated = false;
    let lastAnchorError: string | null = null;
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
        commentSectionLocated = true;
        console.log(`[ExpandComments] comment_section rect: ${JSON.stringify(anchor.rect)}`);
      } else {
        lastAnchorError = anchor.error || 'not found';
      }
    } catch (e: any) {
      lastAnchorError = e.message || String(e);
    }

    if (!commentSectionLocated) {
      if (lastAnchorError) {
        console.warn(
          `[ExpandComments] comment_section anchor verify failed: ${lastAnchorError}`,
        );
      }
      const fallbackRect = await locateCommentSectionRectFallback();
      if (fallbackRect) {
        commentSectionRect = fallbackRect;
        commentSectionLocated = true;
        console.log(
          `[ExpandComments] fallback comment_section rect: ${JSON.stringify(fallbackRect)}`,
        );
      } else {
        return {
          success: false,
          comments: [],
          reachedEnd: false,
          emptyState: false,
          anchor: {
            commentSectionContainerId: commentSection.id,
            commentSectionRect: undefined,
          },
          error:
            lastAnchorError ||
            'comment_section anchor not found',
        };
      }
    }

    // 2. 基于容器 inspect 结果 + comment_item 容器定义提取评论列表
  
    // 2.1 重新 inspect 评论区域，供锚点与终止标记 / 样本评论锚点使用
    // 为避免 Controller 侧再次依赖 session-manager CLI，这里显式传入当前 URL
    const currentUrl = await getCurrentUrl();
    if (!currentUrl || typeof currentUrl !== 'string') {
      throw new Error('无法确定当前页面 URL，ExpandComments 需要在详情页内运行');
    }

    const inspected = await controllerAction('containers:inspect-container', {
      profile,
      containerId: commentSection.id,
      url: currentUrl,
      maxChildren: 200
    });

    const effectiveTree = inspected.snapshot?.container_tree || inspected.container_tree || commentSection;

    // 3. 收集评论项节点 / empty_state 节点（用于锚点兜底与样本评论锚点校验）
    const emptyStateNode = findContainer(
      effectiveTree,
      /xiaohongshu_detail\.comment_section\.empty_state$/,
    );
    const commentNodes = collectContainers(
      effectiveTree,
      /xiaohongshu_detail\.comment_section\.comment_item$/,
    );

    // 3.0 锚点兜底：
    // - 只有 empty_state 且没有 comment_item -> 视为合法“无评论”结果，直接返回，不再做 DOM 扫描；
    // - 既没有 comment_item，也没有 empty_state -> 视为锚点缺失，返回错误，避免在无锚点情况下盲目提取。
    if (commentNodes.length === 0) {
      if (emptyStateNode?.id) {
        let emptyRect: Rect | undefined;
        try {
          const anchor = await verifyAnchorByContainerId(
            emptyStateNode.id,
            profile,
            serviceUrl,
            '2px dashed #888888',
            2000,
          );
          if (anchor.found && anchor.rect) {
            emptyRect = anchor.rect;
            console.log(
              `[ExpandComments] empty_state rect: ${JSON.stringify(anchor.rect)}`,
            );
          } else {
            console.warn(
              `[ExpandComments] empty_state anchor verify failed: ${
                anchor.error || 'not found'
              }`,
            );
          }
        } catch (e: any) {
          console.warn(
            `[ExpandComments] empty_state anchor verify error: ${e.message}`,
          );
        }

        // 只有“空评论锚点”确实存在（拿到 rect）时才判定为空评论；否则继续后续 DOM 提取，避免误判。
        if (emptyRect && emptyRect.height > 0) {
          return {
            success: true,
            comments: [],
            reachedEnd: true,
            emptyState: true,
            anchor: {
              commentSectionContainerId: commentSection.id,
              commentSectionRect,
              sampleCommentContainerId: undefined,
              sampleCommentRect: undefined,
              endMarkerContainerId: emptyStateNode.id,
              endMarkerRect: emptyRect,
              verified: Boolean(commentSectionRect),
            },
          };
        }
      }

      console.warn(
        '[ExpandComments] no comment_item or empty_state anchors found, aborting expand',
      );
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        anchor: {
          commentSectionContainerId: commentSection.id,
          commentSectionRect,
        },
        error: 'comment_item & empty_state anchors not found',
      };
    }

    const comments: Array<Record<string, any>> = [];
    const seenKeys = new Set<string>();

    // 3.1 选一个样本评论做高亮 + Rect 回环
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
            const primarySelector = await safeGetPrimarySelectorById(sample.id);
            const fallbackSelectors = [
              primarySelector || '',
              '.comments-el .comment-item',
              '.comment-list .comment-item',
              '.comments-container .comment-item',
              '.comment-item',
              '.comments-el [class*="comment-item"]',
              '.comment-list [class*="comment-item"]',
              '.comments-container [class*="comment-item"]',
              '[class*="comment-item"]',
            ];
            const fallbackRect = await locateRectBySelectors(fallbackSelectors);
            if (fallbackRect) {
              sampleCommentRect = fallbackRect;
              console.log(
                `[ExpandComments] fallback sample comment rect: ${JSON.stringify(fallbackRect)}`,
              );
            }
          }
        } catch (e: any) {
          console.warn(`[ExpandComments] sample comment anchor verify error: ${e.message}`);
          const primarySelector = await safeGetPrimarySelectorById(sample.id);
          const fallbackSelectors = [
            primarySelector || '',
            '.comments-el .comment-item',
            '.comment-list .comment-item',
            '.comments-container .comment-item',
            '.comment-item',
            '.comments-el [class*="comment-item"]',
            '.comment-list [class*="comment-item"]',
            '.comments-container [class*="comment-item"]',
            '[class*="comment-item"]',
          ];
          const fallbackRect = await locateRectBySelectors(fallbackSelectors);
          if (fallbackRect) {
            sampleCommentRect = fallbackRect;
            console.log(
              `[ExpandComments] fallback sample comment rect after error: ${JSON.stringify(fallbackRect)}`,
            );
          }
        }
      }
    }

    // 3.2 实际评论内容提取：基于 comment_item 容器定义构造 DOM 提取脚本（selectors/attr 均来自容器配置）
    try {
      const itemContainerId = 'xiaohongshu_detail.comment_section.comment_item';
      const itemSelector = await getPrimarySelectorByContainerId(itemContainerId);
      const extractors = await getContainerExtractorsById(itemContainerId);

      if (!itemSelector || !extractors) {
        console.warn('[ExpandComments] missing selector or extractors for comment_item container');
      } else {
        const domConfig: {
          rootSelectors: string[];
          itemSelector: string;
          fields: Record<string, { selectors: string[]; attr?: string }>;
        } = {
          rootSelectors: [
            // 优先使用 comment_section 容器 selector
            (await getPrimarySelectorByContainerId(commentSection.id)) || '',
            '.comments-el',
            '.comment-list',
            '.comments-container',
            '[class*=\"comment-section\"]',
          ].filter((s) => s && typeof s === 'string'),
          itemSelector,
          fields: {},
        };

        for (const [field, def] of Object.entries(extractors)) {
          const selectors = Array.isArray(def?.selectors) ? def.selectors : [];
          if (!selectors.length) continue;
          domConfig.fields[field] = {
            selectors,
            attr: def?.attr,
          };
        }

        const script = `(() => {
          const cfg = ${JSON.stringify(domConfig)};
          const pickRoot = () => {
            const roots = cfg.rootSelectors || [];
            for (const sel of roots) {
              try {
                const el = document.querySelector(sel);
                if (el) return el;
              } catch (_) {}
            }
            return null;
          };

          const root = pickRoot();
          if (!root) {
            return { found: false, comments: [] };
          }

          const items = Array.from(
            root.querySelectorAll(cfg.itemSelector || '.comment-item, [class*="comment-item"]'),
          );
          const comments = items.map((el) => {
            const item = {};
            const fields = cfg.fields || {};

            const getAttrValue = (node, attr) => {
              if (!node) return '';
              if (!attr || attr === 'textContent') {
                return (node.textContent || '').trim();
              }
              if (attr === 'href') {
                return (node.href || node.getAttribute('href') || '').trim();
              }
              const v = node.getAttribute(attr);
              return v ? v.trim() : '';
            };

            for (const fieldName of Object.keys(fields)) {
              const fieldCfg = fields[fieldName] || {};
              const sels = Array.isArray(fieldCfg.selectors) ? fieldCfg.selectors : [];
              let value = '';
              for (const sel of sels) {
                try {
                  const node = el.querySelector(sel);
                  if (!node) continue;
                  value = getAttrValue(node, fieldCfg.attr);
                  if (value) break;
                } catch (_) {}
              }
              item[fieldName] = value;
            }

            // 额外标记是否为回复
            item.is_reply = !!el.closest('.reply-container');
            return item;
          });

          return { found: true, comments };
        })()`;

        const domResult = await controllerAction('browser:execute', {
          profile,
          script,
        });

        const payload = (domResult as any)?.result || (domResult as any)?.data?.result || domResult;
        if (!payload?.found || !Array.isArray(payload.comments)) {
          console.warn('[ExpandComments] DOM-based container extraction returned no comments');
        } else {
          const rawList = payload.comments as Array<Record<string, any>>;
          for (const c of rawList) {
            if (!c || typeof c !== 'object') continue;
            const hasContent =
              Boolean((c as any).text && String((c as any).text).trim()) ||
              Boolean((c as any).user_name && String((c as any).user_name).trim());
            if (!hasContent) continue;
            const key = `${(c as any).user_id || ''}||${(c as any).user_name || ''}||${(c as any).text || ''}||${(c as any).timestamp || ''}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            comments.push(c);
          }
          console.log(`[ExpandComments] container-driven DOM comments=${comments.length}`);
        }
      }
    } catch (e: any) {
      console.warn(`[ExpandComments] DOM-based comment aggregation (via container definitions) error: ${e.message}`);
    }

    // 4. 检查终止条件（含“空评论”场景）
    const endMarker = findContainer(
      effectiveTree,
      /xiaohongshu_detail\.comment_section\.end_marker$/,
    );

    let endMarkerRect: Rect | undefined;
    let endMarkerContainerId: string | undefined;
    let endMarkerHit = false;
    let emptyStateHit = false;

    // 优先：有评论时按 end_marker 判断；无评论时优先按 empty_state / comment_section 判空
    async function resolveEndMarkerRectViaSelectors(
      containerId: string | undefined,
    ): Promise<Rect | null> {
      const selectors: string[] = [];
      if (containerId) {
        const primary = await safeGetPrimarySelectorById(containerId);
        if (primary) selectors.push(primary);
      }
      selectors.push('.comment-end', '.comments-end', '.comment-list .end');
      return locateRectBySelectors(selectors);
    }

    if (endMarker?.id && comments.length > 0) {
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
          endMarkerHit = true;
          console.log(`[ExpandComments] end_marker rect: ${JSON.stringify(anchor.rect)}`);
        } else {
          console.warn(
            `[ExpandComments] end_marker anchor verify failed: ${anchor.error || 'not found'}`,
          );
          const fallbackRect = await resolveEndMarkerRectViaSelectors(endMarker.id);
          if (fallbackRect) {
            endMarkerRect = fallbackRect;
            endMarkerHit = true;
            console.log(
              `[ExpandComments] fallback end_marker rect: ${JSON.stringify(fallbackRect)}`,
            );
          }
        }
      } catch (e: any) {
        console.warn(`[ExpandComments] end_marker anchor verify error: ${e.message}`);
        const fallbackRect = await resolveEndMarkerRectViaSelectors(endMarker.id);
        if (fallbackRect) {
          endMarkerRect = fallbackRect;
          endMarkerHit = true;
          console.log(
            `[ExpandComments] fallback end_marker rect after error: ${JSON.stringify(fallbackRect)}`,
          );
        }
      }
    } else if (emptyStateNode?.id && comments.length === 0) {
      // 空状态：只认 empty_state 锚点（不再退回 comment_section，避免误判）
      endMarkerContainerId = emptyStateNode.id;
      try {
        const anchorTargetId = emptyStateNode.id;
        const anchor = await verifyAnchorByContainerId(
          anchorTargetId,
          profile,
          serviceUrl,
          '2px dashed #888888',
          2000,
        );
        if (anchor.found && anchor.rect) {
          endMarkerRect = anchor.rect;
          emptyStateHit = true;
          console.log(
            `[ExpandComments] empty_state rect: ${JSON.stringify(anchor.rect)}, using=${
              emptyStateNode?.id ? 'empty_state' : 'comment_section'
            }`,
          );
        } else {
          console.warn(
            `[ExpandComments] empty_state anchor verify failed: ${anchor.error || 'not found'}`,
          );
          const fallbackRect = await resolveEndMarkerRectViaSelectors(endMarkerContainerId);
          if (fallbackRect) {
            endMarkerRect = fallbackRect;
            emptyStateHit = true;
            console.log(
              `[ExpandComments] fallback empty_state/end_marker rect: ${JSON.stringify(fallbackRect)}`,
            );
          }
        }
      } catch (e: any) {
        console.warn(`[ExpandComments] empty_state anchor verify error: ${e.message}`);
        const fallbackRect = await resolveEndMarkerRectViaSelectors(endMarkerContainerId);
        if (fallbackRect) {
          endMarkerRect = fallbackRect;
          emptyStateHit = true;
          console.log(
            `[ExpandComments] fallback empty_state/end_marker rect after error: ${JSON.stringify(fallbackRect)}`,
          );
        }
      }
    }

    // Rect 规则验证：评论区在中下部，样本评论/终止标记可见
    let verified = false;
    if (commentSectionRect) {
      const sectionOk = commentSectionRect.height > 0;
      const sampleOk = comments.length > 0 ? !!(sampleCommentRect && sampleCommentRect.height > 0) : true;
      const endOk = endMarkerRect ? endMarkerRect.height > 0 : true;
      verified = sectionOk && sampleOk && endOk;
      console.log(
        `[ExpandComments] Rect validation: section=${sectionOk}, sample=${sampleOk}, end=${endOk}, hasComments=${
          comments.length > 0
        }`,
      );
    }

    // reachedEnd 更严格：
    // - 有评论时：必须命中 end_marker 且能拿到 Rect，才视为滚到底
    // - 无评论时：命中 empty_state（或退回 comment_section）才视为 reachedEnd
    const reachedEnd =
      comments.length === 0
        ? Boolean(emptyStateHit && endMarkerRect)
        : Boolean(endMarkerHit && endMarkerRect);

    return {
      success: true,
      comments,
      reachedEnd,
      // 只有“确实无评论且命中 empty_state”时才视为空评论
      emptyState: comments.length === 0 && Boolean(emptyStateHit && endMarkerRect),
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
