/**
 * Workflow Block: CollectCommentsBlock
 *
 * 聚合 WarmupCommentsBlock + ExpandCommentsBlock：
 * - 先滚动 + 自动展开（warmup）
 * - 再一次性提取所有评论（expand）
 */

export interface CollectCommentsInput {
  sessionId: string;
  serviceUrl?: string;
  maxWarmupRounds?: number;
  allowClickCommentButton?: boolean;
  // 多 tab 渐进式抓评论（防风控）：开满 4 个 tab 后循环，每次每 tab 只新增抓取 N 条
  commentTabMode?: 'single' | 'rotate4';
  commentTabBatch?: number;
  commentTabMaxTabs?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollectCommentsOutput {
  success: boolean;
  comments: Array<Record<string, any>>;
  reachedEnd: boolean;
  emptyState: boolean;
  warmupCount: number;
  totalFromHeader: number | null;
  entryAnchor?: {
    commentSectionContainerId?: string;
    commentSectionRect?: Rect;
    verified?: boolean;
  };
  exitAnchor?: {
    commentSectionContainerId?: string;
    commentSectionRect?: Rect;
    endMarkerContainerId?: string;
    endMarkerRect?: Rect;
    verified?: boolean;
  };
  steps?: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    error?: string;
    anchor?: any;
    meta?: Record<string, any>;
  }>;
  anchor?: {
    commentSectionContainerId?: string;
    commentSectionRect?: Rect;
    sampleCommentContainerId?: string;
    sampleCommentRect?: Rect;
    endMarkerContainerId?: string;
    endMarkerRect?: Rect;
    verified?: boolean;
  };
  error?: string;
}

export async function execute(input: CollectCommentsInput): Promise<CollectCommentsOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701',
    maxWarmupRounds,
    allowClickCommentButton,
    commentTabMode = 'single',
    commentTabBatch = 50,
    commentTabMaxTabs = 4,
  } = input;

  try {
    const { execute: warmupComments } = await import('./WarmupCommentsBlock.js');
    const { execute: expandComments } = await import('./ExpandCommentsBlock.js');

    const steps: NonNullable<CollectCommentsOutput['steps']> = [];
    let entryAnchor: CollectCommentsOutput['entryAnchor'];
    let exitAnchor: CollectCommentsOutput['exitAnchor'];

    function pushStep(step: NonNullable<CollectCommentsOutput['steps']>[number]) {
      steps.push(step);
      try {
        console.log(
          '[CollectComments][step]',
          JSON.stringify(
            {
              id: step.id,
              status: step.status,
              error: step.error,
              anchor: step.anchor,
              meta: step.meta,
            },
            null,
            2,
          ),
        );
      } catch {
        console.log('[CollectComments][step]', step.id, step.status);
      }
    }

    // 多 tab 渐进式：按用户要求不做“单 tab 一口气滚到底”的 warmup
    if (commentTabMode === 'rotate4') {
      const controllerUrl = `${serviceUrl}/v1/controller/action`;
      const controllerAction = async (action: string, payload: any = {}): Promise<any> => {
        const res = await fetch(controllerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, payload }),
          signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
        });
        const raw = await res.text();
        let data: any = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { raw };
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);
        return data.data || data;
      };

      const listPagesDetailed = async (): Promise<{
        pages: Array<{ index: number; url: string; active: boolean }>;
        activeIndex: number | null;
      }> => {
        const res = await controllerAction('browser:page:list', { profileId: sessionId }).catch((): any => null);
        const pages = (res as any)?.pages || (res as any)?.data?.pages || [];
        const activeIndexRaw = (res as any)?.activeIndex ?? (res as any)?.data?.activeIndex;
        const activeIndex = Number.isFinite(Number(activeIndexRaw)) ? Number(activeIndexRaw) : null;
        return { pages: Array.isArray(pages) ? pages : [], activeIndex };
      };

      const openPageWithFallback = async (detailUrl: string, reason: string): Promise<number> => {
        const beforeDetail = await listPagesDetailed().catch(() => ({
          pages: [] as Array<{ index: number; url: string; active: boolean }>,
          activeIndex: null,
        }) as { pages: Array<{ index: number; url: string; active: boolean }>; activeIndex: number | null });
        const beforeIndexes = new Set<number>(
          beforeDetail.pages.map((p) => Number(p?.index)).filter((n) => Number.isFinite(n)) as number[],
        );

        // Use system-level shortcut to open new tab in same window (Cmd+T on macOS)
const created = await controllerAction('system:shortcut', { app: 'camoufox', shortcut: 'new-tab' });
        const createdIndex = Number((created as any)?.index ?? (created as any)?.data?.index ?? (created as any)?.body?.index);
        if (Number.isFinite(createdIndex)) return createdIndex;

        await delay(400);
        const afterDetail = await listPagesDetailed().catch(() => ({
          pages: [] as Array<{ index: number; url: string; active: boolean }>,
          activeIndex: null,
        }) as { pages: Array<{ index: number; url: string; active: boolean }>; activeIndex: number | null });
        if (Number.isFinite(afterDetail.activeIndex)) return Number(afterDetail.activeIndex);

        const newPage = afterDetail.pages.find((p) => Number.isFinite(p?.index) && !beforeIndexes.has(Number(p.index)));
        if (newPage && Number.isFinite(newPage.index)) return Number(newPage.index);

        if (afterDetail.pages.length > 0 && Number.isFinite(afterDetail.pages[afterDetail.pages.length - 1]?.index)) {
          return Number(afterDetail.pages[afterDetail.pages.length - 1]?.index);
        }

        throw new Error(`browser:page:new returned invalid index (${reason})`);
      };

      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const profile = sessionId;

      // 当前页（search tab + detail modal）索引
      let list0: any = null;
      try {
        list0 = await controllerAction('browser:page:list', { profileId: profile });
      } catch {
        list0 = null;
      }
      const activeIndex = Number(list0?.activeIndex ?? list0?.data?.activeIndex ?? 0) || 0;

      // 当前 detail URL（必须包含 xsec_token）
      const urlRes = await controllerAction('browser:execute', { profile, script: 'window.location.href' });
      const currentUrl = (urlRes as any)?.result ?? (urlRes as any)?.data?.result ?? urlRes;
      const detailUrl = typeof currentUrl === 'string' ? currentUrl : '';
      if (!detailUrl.includes('/explore/') || !detailUrl.includes('xsec_token=')) {
        throw new Error(`rotate4 requires explore url with xsec_token, got: ${String(detailUrl || '')}`);
      }

      const maxTabs = Math.max(1, Math.min(4, Number(commentTabMaxTabs) || 4));
      const batch = Math.max(1, Math.floor(Number(commentTabBatch) || 50));

      const tabIndices: number[] = [activeIndex];
      const openedTabs: number[] = [];
      const tabSeenKeys = new Map<number, Set<string>>();
      tabSeenKeys.set(activeIndex, new Set<string>());
      const globalSeen = new Set<string>();
      const allComments: Array<Record<string, any>> = [];

      let reachedEnd = false;
      let emptyState = false;

      let cycle = 0;
      while (!reachedEnd) {
        const tabIndex = tabIndices[cycle % tabIndices.length];
        console.log(
          `[CollectComments][rotate4] cycle=${cycle} tabs=${tabIndices.length} switching to tabIndex=${tabIndex}`,
        );
        await controllerAction('browser:page:switch', { profileId: profile, index: tabIndex });
        await delay(900);

        const seenInTab = tabSeenKeys.get(tabIndex) || new Set<string>();
        tabSeenKeys.set(tabIndex, seenInTab);

        const firstTimeInTab = seenInTab.size === 0;
        const out = await expandComments({
          sessionId,
          serviceUrl,
          maxRounds: 240,
          maxNewComments: batch,
          seedSeenKeys: Array.from(seenInTab),
          startFromTop: firstTimeInTab,
          ensureLatestTab: firstTimeInTab,
        } as any);

        // 入口锚点：仅记录一次（来自第一个 tab 的第一次抓取）
        if (!entryAnchor && out.anchor?.commentSectionContainerId) {
          entryAnchor = {
            commentSectionContainerId: out.anchor.commentSectionContainerId,
            commentSectionRect: out.anchor.commentSectionRect,
            verified: Boolean(out.anchor.commentSectionRect && out.anchor.commentSectionRect.height > 0),
          };
          console.log('[CollectComments][entryAnchor]', JSON.stringify(entryAnchor, null, 2));
        }

        if (!out.success) {
          pushStep({
            id: 'expand_comments',
            status: 'failed',
            anchor: out.anchor,
            error: out.error || 'expand failed',
          });
          return {
            success: false,
            comments: [],
            reachedEnd: false,
            emptyState: false,
            warmupCount: 0,
            totalFromHeader: null,
            entryAnchor,
            exitAnchor,
            steps,
            anchor: out.anchor,
            error: out.error || 'expand failed',
          };
        }

        let added = 0;
        for (const c of out.comments || []) {
          const k = typeof (c as any)?._key === 'string' ? String((c as any)._key) : '';
          if (k) seenInTab.add(k);
          if (k && globalSeen.has(k)) continue;
          if (k) globalSeen.add(k);
          allComments.push(c);
          added += 1;
        }

        if (out.reachedEnd || out.emptyState) {
          reachedEnd = true;
          emptyState = Boolean(out.emptyState);
          exitAnchor = {
            commentSectionContainerId: out.anchor?.commentSectionContainerId,
            commentSectionRect: out.anchor?.commentSectionRect,
            endMarkerContainerId: out.anchor?.endMarkerContainerId,
            endMarkerRect: out.anchor?.endMarkerRect,
            verified: Boolean(out.anchor?.verified),
          };
          break;
        }

        // rotate4 约束：每个 tab 必须“本次新增抓满 batch（默认 50）”才能切换到下一个 tab；
        // 否则视为异常（既没到底/空，也没跑满 batch），开发阶段必须停下排查，而不是继续开新 tab 重复抓。
        if (!out.stoppedByMaxNew) {
          throw new Error('rotate4 batch_not_reached_but_not_at_end_marker_or_empty_state');
        }

        // 本轮没有新增，但也没看到 end_marker/empty_state：视为异常，立即停下以便排查（开发阶段不兜底）
        if (added === 0) {
          throw new Error('rotate4 no new comments but not at end_marker/empty_state');
        }

        // 按要求：一个一个开 tab，开满 4 个后循环
        if (tabIndices.length < maxTabs) {
          console.log(`[CollectComments][rotate4] opening new tab for same detail (batch=${batch})`);
          const newIndex = await openPageWithFallback(detailUrl, 'rotate4');
          tabIndices.push(newIndex);
          openedTabs.push(newIndex);
          tabSeenKeys.set(newIndex, new Set<string>());
          await controllerAction('browser:page:switch', { profileId: profile, index: newIndex });
          await delay(1200);
        }

        cycle += 1;
      }

      // 清理：关闭额外打开的 tabs，并回到原 tab（供 CloseDetailBlock 用 ESC 退出）
      for (const idx of [...openedTabs].sort((a, b) => b - a)) {
        try {
          await controllerAction('browser:page:close', { profileId: profile, index: idx });
          await delay(450);
        } catch {
          // ignore
        }
      }
      try {
        await controllerAction('browser:page:switch', { profileId: profile, index: activeIndex });
        await delay(650);
      } catch {
        // ignore
      }

      pushStep({
        id: 'expand_comments',
        status: 'success',
        anchor: exitAnchor,
        meta: {
          commentsCount: allComments.length,
          reachedEnd,
          emptyState,
          mode: 'rotate4',
          tabsUsed: tabIndices.length,
          batch,
        },
      });

      return {
        success: true,
        comments: allComments,
        reachedEnd,
        emptyState,
        warmupCount: 0,
        totalFromHeader: null,
        entryAnchor,
        exitAnchor,
        steps,
        anchor: {
          commentSectionContainerId: exitAnchor?.commentSectionContainerId,
          commentSectionRect: exitAnchor?.commentSectionRect,
          endMarkerContainerId: exitAnchor?.endMarkerContainerId,
          endMarkerRect: exitAnchor?.endMarkerRect,
          verified: Boolean(exitAnchor?.verified),
        },
      };
    }

    const warmup = await warmupComments({
      sessionId,
      serviceUrl,
      ...(allowClickCommentButton === false ? { allowClickCommentButton: false } : {}),
      ...(typeof maxWarmupRounds === 'number' && maxWarmupRounds > 0
        ? { maxRounds: maxWarmupRounds }
        : {})
    } as any);

    // 入口锚点：评论区根容器 + rect
    if (warmup.anchor?.commentSectionContainerId) {
      entryAnchor = {
        commentSectionContainerId: warmup.anchor.commentSectionContainerId,
        commentSectionRect: warmup.anchor.commentSectionRect,
        verified: Boolean(warmup.anchor.commentSectionRect && warmup.anchor.commentSectionRect.height > 0),
      };
      console.log('[CollectComments][entryAnchor]', JSON.stringify(entryAnchor, null, 2));
    }

    if (!warmup.success) {
      pushStep({
        id: 'warmup_comments',
        status: 'failed',
        anchor: warmup.anchor,
        error: warmup.error || 'warmup failed',
        meta: {
          finalCount: warmup.finalCount ?? 0,
          totalFromHeader: warmup.totalFromHeader ?? null,
        },
      });
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: warmup.anchor,
        error: warmup.error || 'warmup failed'
      };
    }

    pushStep({
      id: 'warmup_comments',
      status: 'success',
      anchor: warmup.anchor,
      meta: {
        finalCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        reachedEnd: warmup.reachedEnd ?? false,
      },
    });

    // 开发阶段严格结束规则：Warmup 已判定到达“底部/空态”，且 count=0 => 视为“空评论结束”，跳过 Expand（避免空态下 Expand 卡死/超时）
    if (Boolean(warmup.reachedEnd) && (warmup.finalCount ?? 0) === 0) {
      pushStep({
        id: 'expand_comments',
        status: 'skipped',
        anchor: warmup.anchor,
        meta: { reason: 'empty_comments_from_warmup' },
      });
      return {
        success: true,
        comments: [],
        reachedEnd: true,
        emptyState: true,
        warmupCount: 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        entryAnchor,
        exitAnchor: {
          commentSectionContainerId: warmup.anchor?.commentSectionContainerId,
          commentSectionRect: warmup.anchor?.commentSectionRect,
          verified: Boolean(warmup.anchor?.commentSectionRect && warmup.anchor.commentSectionRect.height > 0),
        },
        steps,
        anchor: warmup.anchor,
      };
    }

    const expanded = await expandComments({
      sessionId,
      serviceUrl,
      expectedTotal: warmup.totalFromHeader ?? null,
    } as any);

    if (!expanded.success) {
      pushStep({
        id: 'expand_comments',
        status: 'failed',
        anchor: expanded.anchor,
        error: expanded.error || 'expand failed',
        meta: {
          commentsCount: Array.isArray(expanded.comments) ? expanded.comments.length : 0,
          reachedEnd: expanded.reachedEnd ?? false,
          emptyState: expanded.emptyState ?? false,
        },
      });
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: warmup.finalCount ?? 0,
        totalFromHeader: warmup.totalFromHeader ?? null,
        entryAnchor,
        exitAnchor: undefined,
        steps,
        anchor: expanded.anchor,
        error: expanded.error || 'expand failed'
      };
    }

    pushStep({
      id: 'expand_comments',
      status: 'success',
      anchor: expanded.anchor,
      meta: {
        commentsCount: Array.isArray(expanded.comments) ? expanded.comments.length : 0,
        reachedEnd: expanded.reachedEnd ?? false,
        emptyState: expanded.emptyState ?? false,
      },
    });

    const comments = Array.isArray(expanded.comments) ? expanded.comments : [];
    const totalFromHeader = warmup.totalFromHeader ?? null;

    // 结尾判定：只认 ExpandCommentsBlock 的锚点信号（end_marker / empty_state），避免 header 总数/滚动推断误判
    const reachedEnd = Boolean(expanded.reachedEnd);
    const emptyState = Boolean(expanded.emptyState);

    if (expanded.anchor) {
      exitAnchor = {
        commentSectionContainerId: expanded.anchor.commentSectionContainerId,
        commentSectionRect: expanded.anchor.commentSectionRect,
        endMarkerContainerId: expanded.anchor.endMarkerContainerId,
        endMarkerRect: expanded.anchor.endMarkerRect,
        verified: expanded.anchor.verified ?? false,
      };
      console.log('[CollectComments][exitAnchor]', JSON.stringify(exitAnchor, null, 2));
    }

    return {
      success: true,
      comments,
      reachedEnd,
      emptyState,
      warmupCount: warmup.finalCount ?? 0,
      totalFromHeader,
      entryAnchor,
      exitAnchor,
      steps,
      anchor: expanded.anchor
    };
  } catch (error: any) {
    return {
      success: false,
      comments: [],
      reachedEnd: false,
      emptyState: false,
      warmupCount: 0,
      totalFromHeader: null,
      anchor: undefined,
      error: `CollectComments failed: ${error.message}`
    };
  }
}
