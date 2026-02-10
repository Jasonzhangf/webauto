import { controllerAction, delay } from '../../utils/controllerAction.js';

export type XhsExtractedComment = {
  user_id?: string;
  user_name?: string;
  text?: string;
  timestamp?: string;
  like_status?: string;
};

export async function ensureCommentsOpened(sessionId: string, apiUrl: string): Promise<void> {
  await controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_button',
      operationId: 'highlight',
      sessionId,
      timeoutMs: 15000,
      config: { duration: 1800, channel: 'xhs-comments' },
    },
    apiUrl,
  ).catch((): null => null);

  await controllerAction(
    'container:operation',
    { containerId: 'xiaohongshu_detail.comment_button', operationId: 'click', sessionId, timeoutMs: 15000 },
    apiUrl,
  ).catch(() => {});

  await delay(1200);
}

export async function isCommentEnd(sessionId: string, apiUrl: string): Promise<boolean> {
  const end = await controllerAction(
    'container:operation',
    { containerId: 'xiaohongshu_detail.comment_section.end_marker', operationId: 'extract', sessionId, timeoutMs: 12000 },
    apiUrl,
  ).catch((): null => null);

  if (end && end?.success === true) {
    const extracted = Array.isArray(end?.extracted) ? end.extracted : [];
    if (extracted.length > 0) return true;
  }

  // 空评论标记："这是一片荒地"
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const candidates = [
            'p.no-comments-text',
            '.no-comments-text',
            '[class*="no-comments"]',
            '[class*="no-comment"]',
            '[class*="empty-comment"]',
          ];
          for (const sel of candidates) {
            const el = document.querySelector(sel);
            const t = (el?.textContent || '').replace(/\s+/g, ' ').trim();
            if (t && (t.includes('这是一片荒地') || t.includes('荒地'))) return true;
          }
          return false;
        })()`,
      },
      apiUrl,
    );
    if (res?.result === true) return true;
  } catch {
    // ignore
  }

  return false;
}

async function getVisibleCommentSignature(sessionId: string, apiUrl: string) {
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
          };
          const items = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
          const texts = items
            .map((el) => {
              const t = el.querySelector('.content')?.textContent || el.querySelector('p')?.textContent || '';
              return t.replace(/\s+/g, ' ').trim();
            })
            .filter(Boolean)
            .slice(0, 6);
          return { count: items.length, head: texts.join('|').slice(0, 200) };
        })()`,
      },
      apiUrl,
    );
    return {
      count: Number(res?.result?.count ?? -1),
      head: String(res?.result?.head ?? ''),
    };
  } catch {
    return { count: -1, head: '' };
  }
}

/**
 * 往返滚动检测（风控友好）：
 * - 下滚无变化 -> 上滚一点 -> 再下滚
 * - 往返 maxRounds 次仍无变化：判定到底（或评论区无法继续加载）
 */
export async function checkBottomWithBackAndForth(
  sessionId: string,
  apiUrl: string,
  maxRounds = 3,
): Promise<{ reachedBottom: boolean; reason: string }> {
  let prev = await getVisibleCommentSignature(sessionId, apiUrl);
  for (let i = 0; i < maxRounds; i += 1) {
    await scrollComments(sessionId, apiUrl, 420);
    await delay(800);
    const afterDown = await getVisibleCommentSignature(sessionId, apiUrl);
    if (afterDown.count !== prev.count || afterDown.head !== prev.head) {
      return { reachedBottom: false, reason: 'down_changed' };
    }

    // 往回滚动几次再尝试向下，防止卡住
    await scrollComments(sessionId, apiUrl, -240);
    await delay(500);
    await scrollComments(sessionId, apiUrl, 240);
    await delay(700);

    const afterBounce = await getVisibleCommentSignature(sessionId, apiUrl);
    if (afterBounce.count !== prev.count || afterBounce.head !== prev.head) {
      return { reachedBottom: false, reason: 'bounce_changed' };
    }
    prev = afterBounce;
  }
  return { reachedBottom: true, reason: 'no_change_after_back_and_forth' };
}

export async function extractVisibleComments(sessionId: string, apiUrl: string, maxItems: number): Promise<Array<XhsExtractedComment & { domIndex: number }>> {
  const res = await controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'extract',
      sessionId,
      timeoutMs: 15000,
      config: { max_items: Math.max(1, Math.min(80, Math.floor(maxItems))), visibleOnly: true },
    },
    apiUrl,
  );

  if (!res?.success) return [];
  const extracted = Array.isArray(res?.extracted) ? res.extracted : [];
  // Map extracted items with their DOM index (position in selectorAll result)
  const containerRes = await controllerAction(
    'browser:execute',
    {
      profile: sessionId,
      timeoutMs: 12000,
      script: `(() => {
        const items = Array.from(document.querySelectorAll('.comment-item'));
        return items.map((el, idx) => {
          const rect = el.getBoundingClientRect();
          return {
            domIndex: idx,
            visible: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.height > 0
          };
        }).filter(x => x.visible);
      })()`,
    },
    apiUrl,
  );
  const visibleIndices = (containerRes?.result || []).map((x: any) => x.domIndex);
  return extracted.map((item: any, idx: number) => ({ ...item, domIndex: visibleIndices[idx] ?? idx }));
}

export async function highlightCommentRow(sessionId: string, index: number, apiUrl: string, channel = 'xhs-comment-row') {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'highlight',
      sessionId,
      config: {
        index,
        target: 'self',
        style: '6px solid #ff00ff',
        duration: 8000,
        channel,
        visibleOnly: true,
      },
    },
    apiUrl,
  );
}

export async function scrollComments(sessionId: string, apiUrl: string, distance = 650) {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section',
      operationId: 'scroll',
      sessionId,
      timeoutMs: 15000,
      config: { direction: 'down', distance: Math.max(60, Math.min(800, Math.floor(distance))) },
    },
    apiUrl,
  );
}

export async function expandAllVisibleReplyButtons(
  sessionId: string,
  apiUrl: string,
  options: { maxPasses?: number; maxClicksPerPass?: number } = {},
): Promise<{ clicked: number; passes: number; remaining: number; detected: number }> {
  const maxPasses = Math.max(1, Math.min(12, Number(options.maxPasses || 6)));
  const maxClicksPerPass = Math.max(1, Math.min(30, Number(options.maxClicksPerPass || 12)));

  const probeTargets = async (): Promise<Array<{ x: number; y: number; text?: string }>> => {
    const probe = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const root =
            document.querySelector('.comments-el') ||
            document.querySelector('.comment-list') ||
            document.querySelector('.comments-container') ||
            document.querySelector('[class*="comment-section"]') ||
            document.body;

          const selector = '.show-more, .reply-expand, [class*="show-more"], [class*="expand"]';
          const nodes = Array.from(root.querySelectorAll(selector));
          const viewportH = window.innerHeight || 0;
          const viewportW = window.innerWidth || 0;

          const targets = [];

          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < viewportH && r.right > 0 && r.left < viewportW;
          };

          for (const el of nodes) {
            if (!(el instanceof HTMLElement)) continue;
            if (!isVisible(el)) continue;

            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || !text.includes('展开')) continue;
            if (text.includes('收起') || text.includes('折叠')) continue;
            if (!(text.includes('回复') || text.includes('评论') || text.includes('更多'))) continue;

            const r = el.getBoundingClientRect();
            const points = [
              { x: Math.round(r.left + r.width * 0.72), y: Math.round(r.top + r.height * 0.55) },
              { x: Math.round(r.left + r.width * 0.55), y: Math.round(r.top + r.height * 0.55) },
              { x: Math.round(r.left + r.width * 0.85), y: Math.round(r.top + r.height * 0.5) },
            ];

            let picked = null;
            for (const p of points) {
              if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
              if (p.x < 8 || p.y < 8 || p.x > viewportW - 8 || p.y > viewportH - 8) continue;
              const hit = document.elementFromPoint(p.x, p.y);
              if (!hit || !(hit instanceof Element)) continue;
              if (!(hit === el || el.contains(hit) || hit.contains(el))) continue;
              if (hit.closest && hit.closest('a[href]')) continue;
              picked = p;
              break;
            }

            if (!picked) continue;
            targets.push({ x: picked.x, y: picked.y, text });
          }

          targets.sort((a, b) => (a.y - b.y) || (a.x - b.x));
          return { targets };
        })()`,
      },
      apiUrl,
    ).catch((): null => null);

    const raw = Array.isArray((probe as any)?.result?.targets)
      ? (probe as any).result.targets
      : Array.isArray((probe as any)?.targets)
      ? (probe as any).targets
      : [];

    return raw
      .map((t: any) => ({
        x: Math.round(Number(t?.x)),
        y: Math.round(Number(t?.y)),
        text: String(t?.text || ''),
      }))
      .filter((t: { x: number; y: number; text: string }) => Number.isFinite(t.x) && Number.isFinite(t.y));
  };

  let totalClicked = 0;
  let totalDetected = 0;
  let passes = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const targets = await probeTargets();
    if (!targets.length) break;

    totalDetected += targets.length;
    let clickedThisPass = 0;
    const toClick = targets.slice(0, maxClicksPerPass);

    for (const t of toClick) {
      const clicked = await controllerAction(
        'container:operation',
        {
          containerId: 'xiaohongshu_detail.comment_section.show_more_button',
          operationId: 'click',
          sessionId,
          timeoutMs: 15000,
          config: {
            x: t.x,
            y: t.y,
          },
        },
        apiUrl,
      ).catch((): null => null);

      if ((clicked as any)?.success !== false) clickedThisPass += 1;
      await delay(220);
    }

    passes += 1;
    totalClicked += clickedThisPass;

    // No successful click in this pass means target is currently not actionable.
    if (clickedThisPass <= 0) break;
    await delay(380);
  }

  const remaining = (await probeTargets()).length;
  return { clicked: totalClicked, passes, remaining, detected: totalDetected };
}
