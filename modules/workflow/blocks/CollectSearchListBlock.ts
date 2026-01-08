/**
 * Workflow Block: CollectSearchListBlock (v3 with timeout protection)
 *
 * 从搜索结果列表中收集笔记条目（支持滚动加载）
 * 
 * v3 改进（2025-01-07）：
 * - 为 containers:match 添加 5 秒超时保护
 * - 超时或失败时降级到固定容器 ID（基于 URL 判断）
 * - 与 P0 目标一致：降低对 containers:match 的依赖
 */

export interface CollectSearchListInput {
  sessionId: string;
  targetCount?: number;
  maxScrollRounds?: number;
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
  scrollRounds?: number;
  firstItemContainerId?: string;
  anchor?: {
    listContainerId: string;
    listRect?: { x: number; y: number; width: number; height: number };
    firstItemContainerId?: string;
    firstItemRect?: { x: number; y: number; width: number; height: number };
    verified?: boolean;
  };
  usedFallback?: boolean;  // 新增：是否使用了降级方案
  error?: string;
}

export async function execute(input: CollectSearchListInput): Promise<CollectSearchListOutput> {
  const {
    sessionId,
    targetCount = 20,
    maxScrollRounds = 10,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  function deriveNoteIdFromUrl(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      const m = url.match(/\/(explore|search_result)\/([^/?#]+)/);
      return m ? m[2] : undefined;
    } catch {
      return undefined;
    }
  }

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

  /**
   * 滚动列表容器（遵循视口安全原则）
   *
   * 基于列表容器锚点的 selector，在容器内部执行 scrollBy；
   * 单次滚动距离不超过 800px，滚动前后都会做 Rect 与滚动量校验。
   */
  async function scrollListContainer(containerId: string): Promise<boolean> {
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
      const anchor = await verifyAnchorByContainerId(containerId, profile, serviceUrl);

      if (!anchor.found || !anchor.rect) {
        console.warn(`[CollectSearchList] Cannot scroll: container ${containerId} not found`);
        return false;
      }

      const rect = anchor.rect;

      // 视口安全检查：列表容器必须在当前视口内
      const viewportInfo = await controllerAction('browser:execute', {
        profile,
        script: '({ innerHeight: window.innerHeight || 0 })'
      });
      const viewportHeight = viewportInfo.result?.innerHeight
        ?? viewportInfo.data?.result?.innerHeight
        ?? viewportInfo.innerHeight
        ?? 0;

      if (viewportHeight && rect.y > viewportHeight) {
        console.warn(
          `[CollectSearchList] List out of viewport: y=${rect.y}, vh=${viewportHeight}`
        );
        return false;
      }

      if (!anchor.selector) {
        console.warn('[CollectSearchList] No selector on anchor, skip scroll');
        return false;
      }

      // 平滑滚动（单次最大 800px）
      const scrollResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const selector = '${anchor.selector}';
          const el = document.querySelector(selector);
          if (!el) return { ok: false, reason: 'element not found' };

          const beforeScroll = el.scrollTop || 0;
          const scrollAmount = Math.min(window.innerHeight * 0.8, 800);
          el.scrollBy({ top: scrollAmount, behavior: 'smooth' });

          return new Promise(resolve => {
            setTimeout(() => {
              const afterScroll = el.scrollTop || 0;
              resolve({
                ok: true,
                beforeScroll,
                afterScroll,
                scrolled: afterScroll - beforeScroll
              });
            }, 800);
          });
        })()`
      });

      const result = scrollResult.result || scrollResult.data?.result;
      if (!result?.ok) {
        console.warn('[CollectSearchList] Scroll failed:', result?.reason);
        return false;
      }

      console.log(
        `[CollectSearchList] Scrolled: ${result.beforeScroll} -> ${result.afterScroll} (+${result.scrolled}px)`
      );

      // 滚动后等待 DOM 稳定（避免连续滚动）
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return result.scrolled > 0;
    } catch (error: any) {
      console.warn(`[CollectSearchList] Scroll error: ${error.message}`);
      return false;
    }
  }

  try {
    // 1. 匹配搜索根容器（带超时保护）
    const currentUrl = await getCurrentUrl();
    
    let tree: any = null;
    let matchTimeout = false;
    
    try {
      const matchResult = await Promise.race([
        controllerAction('containers:match', {
          profile,
          url: currentUrl,
          maxDepth: 8,
          maxChildren: 20
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('containers:match timeout')), 5000)
        )
      ]);
      tree = (matchResult as any).snapshot?.container_tree || (matchResult as any).container_tree;
    } catch (err: any) {
      if (err.message?.includes('timeout')) {
        console.warn('[CollectSearchList] containers:match 超时（5s），使用降级方案');
      } else {
        console.warn('[CollectSearchList] containers:match 失败:', err.message);
      }
      matchTimeout = true;
    }

    // 2. 确定列表容器 ID
    let listContainerId = 'xiaohongshu_search.search_result_list';
    let listContainer: any = null;
    
    if (matchTimeout || !tree) {
      // 降级方案：根据 URL 使用固定容器 ID
      console.warn('[CollectSearchList] 使用降级方案：直接使用已知容器 ID');
      if (currentUrl.includes('/search_result')) {
        listContainerId = 'xiaohongshu_search.search_result_list';
      } else {
        listContainerId = 'xiaohongshu_home.feed_list';
      }
      listContainer = { id: listContainerId };
    } else {
      // 正常流程：从容器树查找
      listContainer = findContainer(tree, /xiaohongshu_search\.search_result_list$/);
      
      if (!listContainer) {
        const homeFeed = findContainer(tree, /xiaohongshu_home\.feed_list$/);
        if (homeFeed) {
          listContainer = homeFeed;
          listContainerId = homeFeed.id || 'xiaohongshu_home.feed_list';
          console.warn(`[CollectSearchList] 使用 fallback: ${listContainerId}`);
        } else {
          // 最后降级
          console.warn('[CollectSearchList] 容器树中未找到列表容器，使用固定 ID');
          listContainerId = currentUrl.includes('/search_result')
            ? 'xiaohongshu_search.search_result_list'
            : 'xiaohongshu_home.feed_list';
          listContainer = { id: listContainerId };
          matchTimeout = true;
        }
      } else {
        listContainerId = listContainer.id;
      }
    }

    if (!listContainer) {
      throw new Error('未找到搜索结果列表容器');
    }

    // 2.1 高亮列表容器
    try {
      await controllerAction('container:operation', {
        containerId: listContainer.id,
        operationId: 'highlight',
        config: { style: '3px solid #ff4444', duration: 2000 },
        sessionId: profile
      });
      console.log(`[CollectSearchList] Highlighted list: ${listContainer.id}`);
    } catch (error: any) {
      console.warn('[CollectSearchList] Highlight failed:', error.message);
    }

    // 2.2 获取列表 Rect
    let listRect: { x: number; y: number; width: number; height: number } | undefined;
    try {
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
      const anchor = await verifyAnchorByContainerId(listContainerId, profile, serviceUrl);
      if (anchor.found && anchor.rect) {
        listRect = anchor.rect;
        console.log(`[CollectSearchList] List rect: ${JSON.stringify(listRect)}`);
      }
    } catch (error: any) {
      console.warn('[CollectSearchList] Get rect failed:', error.message);
    }

    // 3. 滚动 + 采集循环（基于列表容器锚点，不做页面级滚动）
    const items: SearchItem[] = [];
    const seenContainerIds = new Set<string>();
    let scrollRound = 0;
    let consecutiveNoNewItems = 0;

    while (items.length < targetCount && scrollRound < maxScrollRounds) {
      scrollRound += 1;
      console.log(
        `[CollectSearchList] Round ${scrollRound}/${maxScrollRounds}, collected=${items.length}/${targetCount}`,
      );

      // 3.1 检查当前列表下的 item 容器
      let inspected: any;
      try {
        // 检查列表容器下的子容器结构，这里允许更长的超时时间（10s）
        inspected = await Promise.race([
          controllerAction('containers:inspect-container', {
            profile,
            containerId: listContainer.id,
            maxChildren: 120,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('inspect-container timeout')), 10000),
          ),
        ]);
      } catch (err: any) {
        console.warn(
          `[CollectSearchList] inspect-container timeout or error: ${err.message}`,
        );
        return {
          success: false,
          items: [],
          count: 0,
          scrollRounds: scrollRound - 1,
          usedFallback: matchTimeout,
          anchor: {
            listContainerId: listContainer.id,
            listRect,
          },
          error: 'inspect-container failed',
        };
      }

      const listTree =
        inspected.snapshot?.container_tree || inspected.container_tree || listContainer;
      let itemNodes = collectContainers(listTree, /xiaohongshu_search\.search_result_item$/);

      if (!itemNodes.length && /xiaohongshu_home\.feed_list$/.test(listContainerId)) {
        itemNodes = collectContainers(listTree, /xiaohongshu_home\.feed_item$/);
      }

      const beforeCount = items.length;

      // 3.2 提取新出现的 item（按 containerId 去重）
      for (const node of itemNodes) {
        if (!node.id) continue;
        if (seenContainerIds.has(node.id)) continue;

        seenContainerIds.add(node.id);
        const id = String(node.id);
        const isHomeFeedItem = /xiaohongshu_home\.feed_item$/.test(id);

        try {
          let extracted: any = {};

          if (isHomeFeedItem) {
            // 优先尝试容器提取
            try {
              const extractResult = await controllerAction('container:operation', {
                containerId: id,
                operationId: 'extract',
                config: { fields: ['title', 'link'] },
                sessionId: profile,
              });

              if (extractResult.success) {
                extracted =
                  extractResult.data?.extracted?.[0] || extractResult.extracted?.[0] || {};
              } else {
                throw new Error(extractResult.error || 'extract failed');
              }
            } catch (err: any) {
              // 降级：直接 DOM 提取（仍然只定位当前页面内的 note-item，避免 URL 导航）
              console.warn(
                `[CollectSearchList] container extract failed (${err.message}), using DOM fallback`,
              );

              const domResult = await controllerAction('browser:execute', {
                profile,
                script: `(() => {
                  const cards = document.querySelectorAll('.note-item');
                  if (!cards || cards.length === 0) return {};
                  
                  // 取第一个可见卡片（简化逻辑）
                  const card = cards[0];
                  const titleEl = card.querySelector('[class*="title"], [class*="content"]');
                  const linkEl = card.querySelector('a');
                  
                  return {
                    title: titleEl?.textContent?.trim() || '',
                    link: linkEl?.getAttribute('href') || ''
                  };
                })()`,
              });

              extracted = domResult.result || domResult.data?.result || {};
              console.log(
                `[CollectSearchList] DOM extract result:`,
                JSON.stringify(extracted),
              );
            }
          } else {
            // search_result_item 同样添加兜底
            try {
              const extractResult = await controllerAction('container:operation', {
                containerId: id,
                operationId: 'extract',
                config: { fields: ['title', 'detail_url', 'note_id'] },
                sessionId: profile,
              });

              if (extractResult.success) {
                extracted =
                  extractResult.data?.extracted?.[0] || extractResult.extracted?.[0] || {};
              } else {
                throw new Error(extractResult.error || 'extract failed');
              }
            } catch (err: any) {
              console.warn(
                `[CollectSearchList] container extract failed, using DOM fallback`,
              );

              const domResult = await controllerAction('browser:execute', {
                profile,
                script: `(() => {
                  const cards = document.querySelectorAll('.note-item');
                  if (!cards || cards.length === 0) return {};
                  
                  const card = cards[0];
                  const titleEl = card.querySelector('[class*="title"]');
                  const linkEl = card.querySelector('a[href*="/search_result/"], a[href*="/explore/"]');
                  
                  return {
                    title: titleEl?.textContent?.trim() || '',
                    detail_url: linkEl?.getAttribute('href') || '',
                    note_id: linkEl?.href?.match(/\\/(search_result|explore)\\/([^?]+)/)?.[2] || ''
                  };
                })()`,
              });

              extracted = domResult.result || domResult.data?.result || {};
            }
          }

          const detailUrlRaw = isHomeFeedItem
            ? extracted.link || extracted.href
            : extracted.detail_url || extracted.detailUrl;

          const detailUrl = typeof detailUrlRaw === 'string' ? detailUrlRaw : undefined;
          const hasToken =
            typeof detailUrl === 'string' && /[?&]xsec_token=/.test(detailUrl);
          const safeDetailUrl = hasToken ? detailUrl : undefined;

          let noteId = extracted.note_id || extracted.noteId;
          if (!noteId) {
            noteId = deriveNoteIdFromUrl(safeDetailUrl || detailUrl);
          }

          items.push({
            containerId: id,
            noteId,
            title: extracted.title || extracted.text || '',
            detailUrl,
            safeDetailUrl,
            hasToken,
            raw: extracted,
          });

          if (items.length >= targetCount) break;
        } catch (error: any) {
          console.warn(
            `[CollectSearchList] Extract failed for ${id}: ${error.message}`,
          );
        }
      }

      const newItemsCount = items.length - beforeCount;
      console.log(
        `[CollectSearchList] Round ${scrollRound}: +${newItemsCount} items (total ${items.length})`,
      );

      // 3.3 终止条件判断
      if (newItemsCount === 0) {
        consecutiveNoNewItems += 1;
        if (consecutiveNoNewItems >= 3) {
          console.log('[CollectSearchList] No new items for 3 rounds, stopping');
          break;
        }
      } else {
        consecutiveNoNewItems = 0;
      }

      if (items.length >= targetCount) {
        console.log(`[CollectSearchList] Reached target ${targetCount}`);
        break;
      }

      // 3.4 滚动列表（只在还需要更多 item 时）
      if (scrollRound < maxScrollRounds) {
        const scrolled = await scrollListContainer(listContainerId);
        if (!scrolled) {
          console.warn('[CollectSearchList] Scroll failed or reached bottom');
          break;
        }
      }
    }

    // 4. 高亮第一个 item
    let firstItemRect: { x: number; y: number; width: number; height: number } | undefined;
    let firstItemContainerId: string | undefined;
    if (items.length > 0) {
      firstItemContainerId = items[0].containerId;
      try {
        await controllerAction('container:operation', {
          containerId: firstItemContainerId,
          operationId: 'highlight',
          config: { style: '3px solid #00ff00', duration: 2000 },
          sessionId: profile
        });
        console.log(`[CollectSearchList] Highlighted first item: ${firstItemContainerId}`);

        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.ts');
        const itemAnchor = await verifyAnchorByContainerId(firstItemContainerId, profile, serviceUrl);
        if (itemAnchor.found && itemAnchor.rect) {
          firstItemRect = itemAnchor.rect;
          console.log(`[CollectSearchList] First item rect: ${JSON.stringify(firstItemRect)}`);
        }
      } catch (error: any) {
        console.warn('[CollectSearchList] Highlight/rect first item failed:', error.message);
      }
    }

    const listRectValid = listRect && listRect.y > 100 && listRect.height > 0;
    const firstItemRectValid = firstItemRect && firstItemRect.width > 0 && firstItemRect.height > 0;
    const verified = listRectValid && firstItemRectValid;

    console.log(`[CollectSearchList] Rect validation: list=${listRectValid}, firstItem=${firstItemRectValid}, verified=${verified}`);

    return {
      success: true,
      items,
      count: items.length,
      scrollRounds: scrollRound,
      usedFallback: matchTimeout,
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
      scrollRounds: 0,
      anchor: undefined,
      error: `CollectSearchList failed: ${error.message}`
    };
  }
}
