/**
 * Block: ReplyInteract（开发态：模拟回复）
 *
 * 职责：
 * 1) 在指定评论上点击“回复”
 * 2) 定位回复输入框并输入内容（系统级键盘）
 * 3) 截图留证（包含高亮与 DEV 叠加文案）
 *
 * 约束：
 * - 点击必须走坐标点击（mouse:click），禁止 DOM click
 * - 不提交（不发送真正回复）
 */

import path from 'node:path';

import { controllerAction, delay } from '../utils/controllerAction.js';
import { resolveDownloadRoot, savePngBase64, takeScreenshotBase64 } from './helpers/evidence.js';

export interface ReplyInteractInput {
  sessionId: string;
  noteId: string;
  commentVisibleIndex: number;
  replyText: string;
  dryRun?: boolean;
  unifiedApiUrl?: string;
  env?: string;
  keyword?: string;
  dev?: boolean;
}

export interface ReplyInteractOutput {
  success: boolean;
  noteId: string;
  typed: boolean;
  evidence?: {
    screenshot?: string | null;
  };
  debug?: {
    replyButtonRect?: { x: number; y: number; width: number; height: number };
    replyInputRect?: { x: number; y: number; width: number; height: number };
  };
  error?: string;
}

type ClickTarget = {
  ok: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  clickPoint?: { x: number; y: number };
  reason?: string;
};

async function findReplyButtonTarget(
  sessionId: string,
  apiUrl: string,
  commentVisibleIndex: number,
): Promise<ClickTarget> {
  const res = await controllerAction(
    'browser:execute',
    {
      profile: sessionId,
      script: `(() => {
        const idx = ${JSON.stringify(commentVisibleIndex)};
        const isVisible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
        };
        const items = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
        const root = items[idx];
        if (!root) return { ok: false, reason: 'comment-not-found', total: items.length };

        const textEq = (el, s) => (el && (el.textContent || '').replace(/\\s+/g,' ').trim() === s);
        const candidates = Array.from(root.querySelectorAll('span.count,button,a,span,div'));
        const raw = candidates.find(el => textEq(el, '回复')) || null;
        if (!raw) return { ok: false, reason: 'reply-button-not-found' };

        const target = raw.closest && (raw.closest('button,a,[role=\"button\"]') || raw) || raw;
        const r = target.getBoundingClientRect();
        if (!r || !r.width || !r.height) return { ok: false, reason: 'reply-rect-empty' };

        const x1 = Math.max(0, r.left);
        const y1 = Math.max(0, r.top);
        const x2 = Math.min(window.innerWidth, r.right);
        const y2 = Math.min(window.innerHeight, r.bottom);
        const mx = Math.round((x1 + x2) / 2);
        const my = Math.round((y1 + y2) / 2);
        const pad = 10;
        const points = [
          { x: mx, y: my },
          { x: Math.round(x1 + pad), y: my },
          { x: Math.round(x2 - pad), y: my },
          { x: mx, y: Math.round(y1 + pad) },
          { x: mx, y: Math.round(y2 - pad) },
        ].filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= window.innerWidth && p.y <= window.innerHeight);

        let clickPoint = points[0] || { x: mx, y: my };
        for (const p of points) {
          const hit = document.elementFromPoint(p.x, p.y);
          if (hit && (hit === target || target.contains(hit))) { clickPoint = p; break; }
        }

        return {
          ok: true,
          rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
          clickPoint,
        };
      })()`,
    },
    apiUrl,
  );
  const payload = res?.result || res?.data?.result || res;
  return payload as ClickTarget;
}

async function findReplyInputTarget(sessionId: string, apiUrl: string): Promise<ClickTarget> {
  const res = await controllerAction(
    'browser:execute',
    {
      profile: sessionId,
      script: `(() => {
        const isVisible = (el) => {
          if (!el || !el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
        };
        const score = (el) => {
          const ph = (el.getAttribute && (el.getAttribute('placeholder') || el.getAttribute('aria-label') || '')) || '';
          const cls = (el.className || '').toString();
          const hint = (ph + ' ' + cls).replace(/\\s+/g,' ').trim();
          let s = 0;
          if (hint.includes('回复')) s += 4;
          if (hint.includes('评论') || hint.includes('说点什么') || hint.includes('说说')) s += 2;
          if (cls.includes('reply')) s += 3;
          if (cls.includes('comment')) s += 1;
          return s;
        };

        const active = document.activeElement;
        const isInputLike = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT') || (el.isContentEditable === true));
        if (isInputLike(active) && isVisible(active)) {
          const r = active.getBoundingClientRect();
          const mx = Math.round((r.left + r.right) / 2);
          const my = Math.round((r.top + r.bottom) / 2);
          return { ok: true, rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, clickPoint: { x: mx, y: my } };
        }

        const all = Array.from(document.querySelectorAll('textarea, input[type=\"text\"], input:not([type]), [contenteditable=\"true\"], [contenteditable=\"plaintext-only\"]'))
          .filter(isVisible);
        if (!all.length) return { ok: false, reason: 'no-visible-input' };

        const best = all
          .map((el) => ({ el, s: score(el) }))
          .sort((a,b) => b.s - a.s)[0];
        const el = best.el;
        const r = el.getBoundingClientRect();
        const mx = Math.round((r.left + r.right) / 2);
        const my = Math.round((r.top + r.bottom) / 2);
        return { ok: true, rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, clickPoint: { x: mx, y: my } };
      })()`,
    },
    apiUrl,
  );
  const payload = res?.result || res?.data?.result || res;
  return payload as ClickTarget;
}

async function drawOverlay(
  sessionId: string,
  apiUrl: string,
  opts: { id: string; rect?: { x: number; y: number; width: number; height: number }; color: string; label?: string; ttlMs?: number },
) {
  const ttlMs = typeof opts.ttlMs === 'number' ? Math.max(600, Math.min(15000, Math.floor(opts.ttlMs))) : 4000;
  await controllerAction(
    'browser:execute',
    {
      profile: sessionId,
      script: `(() => {
        const id = ${JSON.stringify(opts.id)};
        const rect = ${JSON.stringify(opts.rect || null)};
        const color = ${JSON.stringify(opts.color)};
        const label = ${JSON.stringify(opts.label || '')};
        const ttl = ${JSON.stringify(ttlMs)};

        const ensure = (elId, baseStyle) => {
          let el = document.getElementById(elId);
          if (!el) {
            el = document.createElement('div');
            el.id = elId;
            document.body.appendChild(el);
          }
          Object.assign(el.style, baseStyle);
          return el;
        };

        if (rect) {
          ensure(id, {
            position: 'fixed',
            left: rect.x + 'px',
            top: rect.y + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
            border: '3px solid ' + color,
            boxSizing: 'border-box',
            zIndex: '2147483647',
            pointerEvents: 'none',
          });
        }

        if (label) {
          ensure(id + '-label', {
            position: 'fixed',
            left: '12px',
            top: '12px',
            maxWidth: '70vw',
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: '12px',
            lineHeight: '1.3',
            borderRadius: '8px',
            zIndex: '2147483647',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
          }).textContent = label;
        }

        setTimeout(() => {
          try {
            const a = document.getElementById(id);
            if (a && a.parentElement) a.parentElement.removeChild(a);
            const b = document.getElementById(id + '-label');
            if (b && b.parentElement) b.parentElement.removeChild(b);
          } catch {}
        }, ttl);

        return true;
      })()`,
    },
    apiUrl,
  ).catch((): null => null);
}

async function verifyTyped(sessionId: string, apiUrl: string, expected: string): Promise<boolean> {
  const res = await controllerAction(
    'browser:execute',
    {
      profile: sessionId,
      script: `(() => {
        const exp = ${JSON.stringify(expected)};
        const el = document.activeElement;
        if (!el) return { ok: false, value: '' };
        let v = '';
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) v = el.value || '';
        else if (el instanceof HTMLElement && el.isContentEditable) v = (el.textContent || '');
        v = (v || '').replace(/\\s+/g,' ').trim();
        return { ok: true, value: v, contains: exp ? v.includes(exp) : false };
      })()`,
    },
    apiUrl,
  ).catch((): null => null);

  const payload = (res as any)?.result || (res as any)?.data?.result || res;
  return Boolean(payload?.contains);
}

export async function execute(input: ReplyInteractInput): Promise<ReplyInteractOutput> {
  const {
    sessionId,
    noteId,
    commentVisibleIndex,
    replyText,
    dryRun = false,
    unifiedApiUrl = 'http://127.0.0.1:7701',
    env = 'debug',
    keyword = 'unknown',
    dev = true,
  } = input;

  let screenshot: string | null = null;
  let replyButtonRect: { x: number; y: number; width: number; height: number } | undefined = undefined;
  let replyInputRect: { x: number; y: number; width: number; height: number } | undefined = undefined;

  try {
    const btn = await findReplyButtonTarget(sessionId, unifiedApiUrl, commentVisibleIndex);
    if (!btn.ok || !btn.clickPoint || !btn.rect) {
      throw new Error(`reply button not found: ${btn.reason || 'unknown'}`);
    }
    replyButtonRect = btn.rect;

    await drawOverlay(sessionId, unifiedApiUrl, {
      id: 'webauto-reply-button-rect',
      rect: btn.rect,
      color: '#00e5ff',
      ttlMs: 6000,
    });
    await delay(350);

    if (!dryRun) {
      // ✅ 坐标点击（系统点击）
      await controllerAction(
        'mouse:click',
        { profileId: sessionId, x: Math.round(btn.clickPoint.x), y: Math.round(btn.clickPoint.y) },
        unifiedApiUrl,
      );
      await delay(700);
    } else {
      await delay(450);
    }

    const inputTarget = await findReplyInputTarget(sessionId, unifiedApiUrl);
    if (inputTarget.ok && inputTarget.clickPoint && inputTarget.rect) {
      replyInputRect = inputTarget.rect;

      await drawOverlay(sessionId, unifiedApiUrl, {
        id: 'webauto-reply-input-rect',
        rect: inputTarget.rect,
        color: '#ff00ff',
        ttlMs: 6000,
      });
      await delay(250);

      if (!dryRun) {
        // ✅ 坐标点击聚焦输入框
        await controllerAction(
          'mouse:click',
          { profileId: sessionId, x: Math.round(inputTarget.clickPoint.x), y: Math.round(inputTarget.clickPoint.y) },
          unifiedApiUrl,
        );
        await delay(220);

        // 清空（可选）：dev 模式仍执行，避免误拼接
        const isMac = process.platform === 'darwin';
        await controllerAction(
          'keyboard:press',
          { profileId: sessionId, key: isMac ? 'Meta+A' : 'Control+A' },
          unifiedApiUrl,
        ).catch(() => {});
        await delay(80);
        await controllerAction('keyboard:press', { profileId: sessionId, key: 'Backspace' }, unifiedApiUrl).catch(() => {});
        await delay(120);

        // ✅ 系统级输入（不提交）
        await controllerAction(
          'keyboard:type',
          { profileId: sessionId, text: String(replyText || ''), delay: 90, submit: false },
          unifiedApiUrl,
        );
        await delay(260);
      } else {
        await delay(180);
      }
    }

    const typed = !dryRun && replyInputRect
      ? await verifyTyped(sessionId, unifiedApiUrl, String(replyText || '').slice(0, 6))
      : false;

    if (dev || dryRun) {
      await drawOverlay(sessionId, unifiedApiUrl, {
        id: 'webauto-dev-reply-label',
        color: '#00ff00',
        label: `[${dryRun ? 'DRYRUN' : 'DEV'}] note=${noteId} commentIdx=${commentVisibleIndex}\nreply: ${String(replyText || '').slice(0, 80)}`,
        ttlMs: 9000,
      });
      await delay(180);
    }

    const base64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
    if (base64) {
      const outDir = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'smart-reply', noteId);
      const name = `reply-dev-${String(commentVisibleIndex).padStart(3, '0')}-${Date.now()}.png`;
      screenshot = await savePngBase64(base64, path.join(outDir, name));
    }

    return {
      success: true,
      noteId,
      typed,
      evidence: { screenshot },
      debug: { replyButtonRect, replyInputRect },
    };
  } catch (e: any) {
    return {
      success: false,
      noteId,
      typed: false,
      evidence: { screenshot },
      debug: { replyButtonRect, replyInputRect },
      error: e?.message || String(e),
    };
  }
}
