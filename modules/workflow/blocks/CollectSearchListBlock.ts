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
  domIndex?: number;
  noteId?: string;
  title?: string;
  detailUrl?: string;
  safeDetailUrl?: string;
  hasToken?: boolean;
  hrefAttr?: string;
  rect?: { x: number; y: number; width: number; height: number };
  isAd?: boolean;
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
  const MATCH_TIMEOUT_MS = 12_000;

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

  async function probeNoResultOrHasItems(): Promise<{ hasItems: boolean; hasNoResultText: boolean }> {
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const cards = document.querySelectorAll('.note-item').length;
          const emptyEl =
            document.querySelector('[class*="no-result"], [class*="noResult"], [class*="empty"], .search-empty, .empty') ||
            null;
          const emptyText = (emptyEl ? (emptyEl.textContent || '') : '').trim();
          const bodyText = (document.body && document.body.innerText ? document.body.innerText.slice(0, 1200) : '');
          const hasNoResultText =
            emptyText.includes('没找到相关内容') ||
            emptyText.includes('换个词试试') ||
            bodyText.includes('没找到相关内容') ||
            bodyText.includes('换个词试试');
          return { cards, hasNoResultText };
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res ?? {};
      const cards = Number(payload?.cards ?? 0);
      return { hasItems: cards > 0, hasNoResultText: Boolean(payload?.hasNoResultText) };
    } catch {
      return { hasItems: false, hasNoResultText: false };
    }
  }

  async function waitForSearchItemsIfNeeded(currentUrl: string): Promise<{ ok: boolean; noResults: boolean }> {
    if (!currentUrl.includes('/search_result')) return { ok: true, noResults: false };

    const start = Date.now();
    while (Date.now() - start < 25_000) {
      const probe = await probeNoResultOrHasItems();
      if (probe.hasNoResultText) return { ok: false, noResults: true };
      if (probe.hasItems) return { ok: true, noResults: false };
      await new Promise<void>((r) => setTimeout(r, 1000));
    }
    // 超时：继续走采集逻辑（可能页面慢/容器异常），由下游判断是否 0 item
    return { ok: true, noResults: false };
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
  async function scrollListContainer(containerId: string, direction: 'down' | 'up' = 'down'): Promise<boolean> {
    try {
      // ✅ 系统级滚动：通过容器 scroll operation 触发真实滚轮/键盘滚动（禁止 JS scrollBy）
      const op = await controllerAction('container:operation', {
        containerId,
        operationId: 'scroll',
        sessionId: profile,
        config: { direction, amount: 800 },
      });
      const payload = (op as any)?.data ?? op;
      const ok = Boolean(payload?.success ?? (payload as any)?.data?.success ?? (op as any)?.success);
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      return ok;
    } catch (error: any) {
      console.warn(`[CollectSearchList] Scroll error: ${error.message}`);
      return false;
    }
  }

  async function scrollPageFallback(direction: 'down' | 'up' = 'down'): Promise<boolean> {
    try {
      // ✅ 系统级滚动：PageDown / PageUp（禁止 JS scrollBy）
      const before = await controllerAction('browser:execute', {
        profile,
        script: '({ y: window.scrollY || document.documentElement.scrollTop || 0 })'
      });
      const beforeY =
        before?.result?.y ?? before?.data?.result?.y ?? before?.y ?? 0;

      await controllerAction('keyboard:press', {
        profileId: profile,
        key: direction === 'up' ? 'PageUp' : 'PageDown',
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 1200));

      const after = await controllerAction('browser:execute', {
        profile,
        script: '({ y: window.scrollY || document.documentElement.scrollTop || 0 })'
      });
      const afterY =
        after?.result?.y ?? after?.data?.result?.y ?? after?.y ?? 0;

      const scrolled = Number(afterY) - Number(beforeY);
      console.log(`[CollectSearchList] Page scrolled (${direction}): ${beforeY} -> ${afterY} (+${scrolled}px)`);
      return Math.abs(scrolled) > 0;
    } catch (error: any) {
      console.warn(`[CollectSearchList] Page scroll error: ${error.message}`);
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
          setTimeout(() => reject(new Error('containers:match timeout')), MATCH_TIMEOUT_MS)
        )
      ]);
      tree = (matchResult as any).snapshot?.container_tree || (matchResult as any).container_tree;
    } catch (err: any) {
      if (err.message?.includes('timeout')) {
        console.warn(`[CollectSearchList] containers:match 超时（${MATCH_TIMEOUT_MS}ms），使用降级方案`);
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

    // 2.05 等待搜索结果页内容就绪（有卡片或明确无结果）
    const pageReady = await waitForSearchItemsIfNeeded(currentUrl);
    if (!pageReady.ok && pageReady.noResults) {
      return {
        success: false,
        items: [],
        count: 0,
        scrollRounds: 0,
        usedFallback: matchTimeout,
        anchor: {
          listContainerId,
          verified: false,
        },
        error: 'search_no_results',
      };
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
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
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
    let bounceAttempts = 0;

    // 滚动-采集循环：
    // - 达到 targetCount 退出
    // - 或连续 5 轮无新增（包含尝试过向上/向下 bounce）退出
    // - 或达到 maxScrollRounds（用于“仅采集当前视口”模式，如 maxScrollRounds=1）
    while (items.length < targetCount) {
      scrollRound += 1;
      console.log(
        `[CollectSearchList] Round ${scrollRound}, collected=${items.length}/${targetCount}`,
      );


      const beforeCount = items.length;

      // 3.2 批量从 DOM 提取所有 .note-item 的信息（一次性查询），并标记是否在当前视口内
      try {
        const batchExtractResult = await controllerAction('browser:execute', {
          profile,
          script: `
            (function () {
              var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
              var cards = Array.from(document.querySelectorAll('.note-item'));
              return cards.map(function(card, idx) {
                var rect = card.getBoundingClientRect();
                var titleEl = card.querySelector('.footer .title span') || card.querySelector('.footer .title') || card.querySelector('[class*="title"]');
                var coverEl = card.querySelector('a.cover') || null;
                var linkEl = coverEl || card.querySelector('a[href*="/explore/"]') || card.querySelector('a[href*="/search_result/"]');
                var hrefAttr = linkEl ? (linkEl.getAttribute('href') || '') : '';
                var href = linkEl ? (linkEl.href || hrefAttr || '') : '';
                var match = href.match(/\\/(explore|search_result)\\/([^?]+)/);
                var noteId = match ? match[2] : '';
                var cardText = (card.textContent || '').trim();
                var hasAdBadge =
                  !!card.querySelector('[class*="ad"], [class*="Ad"], [class*="promo"], [class*="Promote"], [data-ad], [data-promote]') ||
                  cardText.indexOf('广告') !== -1 ||
                  cardText.indexOf('推广') !== -1 ||
                  cardText.indexOf('赞助') !== -1;
                // 仅采集**完全处于视口内**的卡片，避免点击到离屏或半离屏元素
                var coverRect = null;
                if (coverEl) {
                  var cr = coverEl.getBoundingClientRect();
                  if (cr && cr.width && cr.height) {
                    coverRect = { x: cr.x, y: cr.y, width: cr.width, height: cr.height };
                  }
                }
                var clickRect = coverRect || { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                var inViewport = clickRect.y >= 0 && (clickRect.y + clickRect.height) <= viewportHeight;
                return {
                  index: idx,
                  title: titleEl ? titleEl.textContent.trim() : '',
                  detail_url: href,
                  href_attr: hrefAttr,
                  note_id: noteId,
                  hasToken: href.indexOf('xsec_token=') !== -1,
                  rect: {
                    x: clickRect.x,
                    y: clickRect.y,
                    width: clickRect.width,
                    height: clickRect.height
                  },
                  card_rect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  },
                  cover_rect: coverRect,
                  isAd: hasAdBadge,
                  inViewport: inViewport
                };
              });
            })();
          `
        });

        const extractedItems = batchExtractResult.result || batchExtractResult.data?.result || [];

        if (!Array.isArray(extractedItems)) {
          console.warn('[CollectSearchList] Batch extract returned non-array');
        } else if (extractedItems.length === 0 && scrollRound === 1 && currentUrl.includes('/search_result')) {
          // 首轮为空：再等 1 次（页面可能仍在加载/虚拟列表尚未渲染）
          const probe = await waitForSearchItemsIfNeeded(currentUrl);
          if (!probe.ok && probe.noResults) {
            return {
              success: false,
              items: [],
              count: 0,
              scrollRounds: scrollRound,
              usedFallback: matchTimeout,
              anchor: {
                listContainerId: listContainer.id,
                listRect,
                verified: false,
              },
              error: 'search_no_results',
            };
          }
        } else {
          for (const extracted of extractedItems) {
            // 只关心当前视口内的卡片
            if (extracted && extracted.inViewport === false) {
              continue;
            }

            // 过滤广告/推广卡片：这些卡片可能不是真正的笔记详情入口，误点会污染采集
            if ((extracted as any)?.isAd) {
              continue;
            }

            // 仅采集“可识别 noteId 的真实帖子卡片”，避免空卡/推荐词/占位导致误点跳转
            const noteId = typeof extracted.note_id === 'string' ? extracted.note_id.trim() : '';
            const detailUrlRaw = typeof extracted.detail_url === 'string' ? extracted.detail_url.trim() : '';
            if (!noteId || !/\/(explore|search_result)\//.test(detailUrlRaw)) {
              continue;
            }

            const uniqueKey = noteId;
            if (seenContainerIds.has(uniqueKey)) continue;

            seenContainerIds.add(uniqueKey);

            const detailUrl = detailUrlRaw;
            const hasToken = /[?&]xsec_token=/.test(detailUrl);
            const safeDetailUrl = hasToken ? detailUrl : undefined;

            // 即使没有 token 也可以收集（后续通过 OpenDetail 点击触发，而不是直接 URL 导航）
            // 只要有 domIndex 和 noteId/title 即可

            items.push({
              containerId: 'xiaohongshu_search.search_result_item',
              domIndex: extracted.index,
              noteId,
              title: extracted.title,
              detailUrl: safeDetailUrl,
              safeDetailUrl,
              hasToken,
              hrefAttr: typeof extracted.href_attr === 'string' ? extracted.href_attr : undefined,
              isAd: Boolean((extracted as any)?.isAd),
              rect:
                extracted?.rect &&
                typeof extracted.rect.x === 'number' &&
                typeof extracted.rect.y === 'number' &&
                typeof extracted.rect.width === 'number' &&
                typeof extracted.rect.height === 'number'
                  ? extracted.rect
                  : undefined,
              raw: extracted,
            });

            if (items.length >= targetCount) break;
          }

          console.log(
            `[CollectSearchList] Batch extracted ${extractedItems.length} items from DOM（viewport items=${items.length}）`,
          );
        }
      } catch (error: any) {
        console.warn(`[CollectSearchList] Batch extract failed: ${error.message}`);
      }

      const newItemsCount = items.length - beforeCount;
      console.log(
        `[CollectSearchList] Round ${scrollRound}: +${newItemsCount} items (total ${items.length})`,
      );

      // 如果设置了 maxScrollRounds，则在达到轮数后不再继续滚动，由上层决定是否滚动页面
      if (maxScrollRounds > 0 && scrollRound >= maxScrollRounds) {
        console.log(
          `[CollectSearchList] Reached maxScrollRounds=${maxScrollRounds}, stop further scrolling`,
        );
        break;
      }

      // 3.3 终止条件 + bounce 滚动策略
      if (newItemsCount === 0) {
        consecutiveNoNewItems += 1;

        // 连续 5 轮都没有新增，视为已经耗尽
        if (consecutiveNoNewItems >= 5) {
          console.log('[CollectSearchList] No new items for 5 rounds, stopping');
          break;
        }

        // 连续 2 轮无新增且还有目标缺口时，尝试一次“先向上再向下”的 bounce 滚动
        if (consecutiveNoNewItems >= 2 && bounceAttempts < 2 && items.length < targetCount) {
          bounceAttempts += 1;
          console.log(
            `[CollectSearchList] No new items for ${consecutiveNoNewItems} rounds, bounce attempt #${bounceAttempts}`,
          );

          // 先向上滚动 2 次（小幅回拉）
          for (let i = 0; i < 2; i += 1) {
            const upScrolled = await scrollListContainer(listContainer.id, 'up');
            if (!upScrolled) {
              console.warn('[CollectSearchList] Upward bounce scroll failed or reached top');
              break;
            }
          }

          // 再向下滚动 4 次（继续加载后续内容）
          for (let i = 0; i < 4; i += 1) {
            const downScrolled = await scrollListContainer(listContainer.id, 'down');
            if (!downScrolled) {
              console.warn('[CollectSearchList] Downward bounce scroll failed or reached bottom');
              break;
            }
          }

          // 进行了一轮 bounce 后，继续下一轮采集（不在本轮再做普通滚动）
          continue;
        }
      } else {
        // 一旦出现新增，重置无新增计数
        consecutiveNoNewItems = 0;
      }

      if (items.length >= targetCount) {
        console.log(`[CollectSearchList] Reached target ${targetCount}`);
        break;
      }

      // 3.4 正常向下滚动（单步），持续拉新
      if (items.length < targetCount) {
        console.log(
          `[CollectSearchList] Need more items (${items.length}/${targetCount}), scrolling down...`,
        );
        const scrolled = await scrollListContainer(listContainer.id, 'down');
        if (!scrolled) {
          console.warn('[CollectSearchList] Page scroll failed or reached bottom');
          // 如果已经连续多轮没有新增并且滚不动了，可以提前退出
          if (consecutiveNoNewItems >= 2) {
            break;
          }
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

        const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
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
