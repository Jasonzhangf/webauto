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
      const { verifyAnchorByContainerId } = await import('./helpers/containerAnchors.js');
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

  async function scrollPageFallback(direction: 'down' | 'up' = 'down'): Promise<boolean> {
    try {
      const scrollResult = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const beforeScroll = window.scrollY || document.documentElement.scrollTop || 0;
          const scrollAmount = Math.min(window.innerHeight * 0.8, 800);
          const direction = '${direction}';
          const delta = direction === 'up' ? -scrollAmount : scrollAmount;
          window.scrollBy({ top: delta, behavior: 'smooth' });

          return new Promise(resolve => {
            setTimeout(() => {
              const afterScroll = window.scrollY || document.documentElement.scrollTop || 0;
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
        console.warn('[CollectSearchList] Page scroll failed:', result?.reason);
        return false;
      }

      console.log(
        `[CollectSearchList] Page scrolled (${direction}): ${result.beforeScroll} -> ${result.afterScroll} (+${result.scrolled}px)`,
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      return result.scrolled > 0;
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
                var linkEl = card.querySelector('a.cover') || card.querySelector('a[href*="/explore/"]') || card.querySelector('a[href*="/search_result/"]');
                var href = linkEl ? linkEl.getAttribute('href') || '' : '';
                var match = href.match(/\\/(explore|search_result)\\/([^?]+)/);
                var noteId = match ? match[2] : '';
                // 仅采集**完全处于视口内**的卡片，避免点击到离屏或半离屏元素
                var inViewport = rect.top >= 0 && rect.bottom <= viewportHeight;
                return {
                  index: idx,
                  title: titleEl ? titleEl.textContent.trim() : '',
                  detail_url: href,
                  note_id: noteId,
                  hasToken: href.indexOf('xsec_token=') !== -1,
                  rect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  },
                  inViewport: inViewport
                };
              });
            })();
          `
        });

        const extractedItems = batchExtractResult.result || batchExtractResult.data?.result || [];

        if (!Array.isArray(extractedItems)) {
          console.warn('[CollectSearchList] Batch extract returned non-array');
        } else {
          for (const extracted of extractedItems) {
            // 只关心当前视口内的卡片
            if (extracted && extracted.inViewport === false) {
              continue;
            }

            const uniqueKey = extracted.note_id || `idx_${extracted.index}`;
            if (seenContainerIds.has(uniqueKey)) continue;

            seenContainerIds.add(uniqueKey);

            const detailUrl = extracted.detail_url || '';
            const hasToken = /[?&]xsec_token=/.test(detailUrl);
            const safeDetailUrl = hasToken ? detailUrl : undefined;

            // 即使没有 token 也可以收集（后续通过 OpenDetail 点击触发，而不是直接 URL 导航）
            // 只要有 domIndex 和 noteId/title 即可

            // 可视化：高亮当前处理的 item（与 OpenDetailBlock 保持相同选择器）
            try {
              await controllerAction('browser:execute', {
                profile,
                script: `(() => {
                  const cards = document.querySelectorAll('.note-item');
                  const el = cards[${extracted.index}];
                  if (el) {
                    el.style.outline = '2px solid #ff00ff';
                    setTimeout(() => { try { el.style.outline = ''; } catch (_) {} }, 1000);
                  }
                })()`
              });
            } catch {}

            items.push({
              containerId: 'xiaohongshu_search.search_result_item',
              domIndex: extracted.index,
              noteId: extracted.note_id,
              title: extracted.title,
              detailUrl: safeDetailUrl,
              safeDetailUrl,
              hasToken,
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
            const upScrolled = await scrollPageFallback('up');
            if (!upScrolled) {
              console.warn('[CollectSearchList] Upward bounce scroll failed or reached top');
              break;
            }
          }

          // 再向下滚动 4 次（继续加载后续内容）
          for (let i = 0; i < 4; i += 1) {
            const downScrolled = await scrollPageFallback('down');
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
        const scrolled = await scrollPageFallback('down');
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
