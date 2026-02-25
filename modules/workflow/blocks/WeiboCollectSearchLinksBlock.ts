/**
 * Workflow Block: WeiboCollectSearchLinksBlock
 *
 * 阶段职责：
 * 1) 仅从搜索结果页采集帖子链接（不做详情内容提取）
 * 2) 持久化到 phase2-links.jsonl，供后续 WeiboCollectFromLinksBlock 消费
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface WeiboCollectSearchLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
  maxPages?: number;
  serviceUrl?: string;
}

export interface WeiboCollectSearchLinksOutput {
  success: boolean;
  keywordDir: string;
  linksPath: string;
  collectedCount: number;
  pagesVisited: number;
  error?: string;
}

interface CollectedLink {
  statusId: string;
  userId: string;
  safeUrl: string;
  searchUrl: string;
  authorName?: string;
  contentPreview?: string;
  ts: string;
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function sanitizeFilenamePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function extractStatusId(url: string): string {
  const text = String(url || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    const pathname = String(parsed.pathname || '');
    const statusMatch = pathname.match(/\/status\/([^/?#]+)/i);
    if (statusMatch?.[1]) return statusMatch[1];
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return String(parts[parts.length - 1] || '').trim();
    }
  } catch {
    // ignore
  }
  return '';
}

function extractUserId(authorUrl: string, safeUrl: string): string {
  const first = String(authorUrl || '').trim();
  const second = String(safeUrl || '').trim();
  const fromUrl = (raw: string) => {
    try {
      const parsed = new URL(raw);
      const m = String(parsed.pathname || '').match(/\/u\/([0-9]+)/i);
      if (m?.[1]) return m[1];
      const parts = String(parsed.pathname || '').split('/').filter(Boolean);
      if (parts.length > 0 && /^[0-9]+$/.test(parts[0])) return parts[0];
    } catch {
      // ignore
    }
    return '';
  };
  return fromUrl(first) || fromUrl(second) || '';
}

export async function execute(input: WeiboCollectSearchLinksInput): Promise<WeiboCollectSearchLinksOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    targetCount,
    maxPages = 10,
    serviceUrl = 'http://127.0.0.1:7704',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/command`;
  const keywordDir = path.join(resolveDownloadRoot(), 'weibo', env, sanitizeFilenamePart(keyword));
  const linksPath = path.join(keywordDir, 'phase2-links.jsonl');
  const maxTarget = Math.max(1, Number(targetCount || 0) || 1);
  const maxPageCount = Math.max(1, Number(maxPages || 0) || 1);

  async function controllerAction(action: string, args: any = {}): Promise<any> {
    const res = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, args: { profileId: profile, ...args } }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return { raw };
    }
  }

  function unwrapResult(response: any): any {
    if (response && typeof response === 'object') {
      if ('result' in response) return response.result;
      if (response.data && typeof response.data === 'object' && 'result' in response.data) {
        return response.data.result;
      }
      if ('data' in response) return response.data;
    }
    return response;
  }

  async function readSearchRows(): Promise<{ rows: any[]; searchUrl: string }> {
    const script = `
      (() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const abs = (value) => {
          try {
            return new URL(String(value || ''), location.href).toString();
          } catch {
            return '';
          }
        };
        const rows = [];
        const cards = Array.from(document.querySelectorAll('.card-wrap'));
        for (const card of cards) {
          const statusAnchor = card.querySelector('a[href*="/status/"]');
          const safeUrl = abs(statusAnchor?.getAttribute?.('href') || statusAnchor?.href || '');
          if (!safeUrl) continue;
          const authorAnchor =
            card.querySelector('a[href*="/u/"]') ||
            card.querySelector('a[title][href*="weibo.com"]') ||
            card.querySelector('.name a');
          const authorUrl = abs(authorAnchor?.getAttribute?.('href') || authorAnchor?.href || '');
          const authorName = clean(
            authorAnchor?.getAttribute?.('title') ||
            authorAnchor?.textContent ||
            '',
          );
          const contentEl =
            card.querySelector('.txt') ||
            card.querySelector('[node-type="feed_list_content"]') ||
            card.querySelector('.detail_wbtext') ||
            card.querySelector('.wbtext');
          const contentPreview = clean(contentEl?.textContent || '').slice(0, 180);
          rows.push({
            safeUrl,
            authorUrl,
            authorName,
            contentPreview,
          });
        }
        return { rows, searchUrl: String(location.href || '') };
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const value = unwrapResult(res);
    return {
      rows: Array.isArray(value?.rows) ? value.rows : [],
      searchUrl: String(value?.searchUrl || ''),
    };
  }

  async function findNextPageCenter(): Promise<{ ok: boolean; x?: number; y?: number }> {
    const script = `
      (() => {
        const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
          const style = window.getComputedStyle(node);
          if (!style) return false;
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (Number(style.opacity || '1') === 0) return false;
          return true;
        };
        const isDisabled = (node) => {
          const text = clean(node.className || '');
          if (text.includes('disable') || text.includes('disabled')) return true;
          const ariaDisabled = String(node.getAttribute('aria-disabled') || '').toLowerCase();
          return ariaDisabled === 'true';
        };
        const candidates = Array.from(document.querySelectorAll('a, button, span'))
          .filter((node) => /下一页|下页/.test(clean(node.textContent || '')))
          .filter((node) => isVisible(node) && !isDisabled(node));
        const target = candidates[0];
        if (!target) return { ok: false };
        const rect = target.getBoundingClientRect();
        return {
          ok: true,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        };
      })()
    `;
    const res = await controllerAction('evaluate', { script });
    const value = unwrapResult(res);
    return {
      ok: value?.ok === true,
      x: Number(value?.x || 0),
      y: Number(value?.y || 0),
    };
  }

  async function writeLinks(rows: CollectedLink[]): Promise<void> {
    await fs.mkdir(keywordDir, { recursive: true });
    const jsonl = rows.map((row) => JSON.stringify(row)).join('\n');
    await fs.writeFile(linksPath, jsonl ? `${jsonl}\n` : '', 'utf8');
  }

  const dedup = new Map<string, CollectedLink>();
  let pagesVisited = 0;
  let noProgressRounds = 0;

  try {
    for (let page = 0; page < maxPageCount; page += 1) {
      pagesVisited += 1;
      const snapshot = await readSearchRows();
      let added = 0;

      for (const row of snapshot.rows) {
        const safeUrl = String(row?.safeUrl || '').trim();
        if (!safeUrl) continue;
        const statusId = extractStatusId(safeUrl);
        if (!statusId) continue;
        const key = statusId || safeUrl;
        if (dedup.has(key)) continue;
        dedup.set(key, {
          statusId,
          userId: extractUserId(String(row?.authorUrl || ''), safeUrl),
          safeUrl,
          searchUrl: String(snapshot.searchUrl || ''),
          authorName: String(row?.authorName || '').trim() || undefined,
          contentPreview: String(row?.contentPreview || '').trim() || undefined,
          ts: new Date().toISOString(),
        });
        added += 1;
        if (dedup.size >= maxTarget) break;
      }

      if (added === 0) noProgressRounds += 1;
      else noProgressRounds = 0;

      if (dedup.size >= maxTarget) break;
      if (noProgressRounds >= 2) break;

      let clicked = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const next = await findNextPageCenter();
        if (!next.ok || !Number.isFinite(next.x) || !Number.isFinite(next.y)) {
          await controllerAction('mouse:wheel', { deltaX: 0, deltaY: 900 }).catch((): null => null);
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        await controllerAction('mouse:click', {
          x: Math.round(next.x!),
          y: Math.round(next.y!),
          button: 'left',
          clicks: 1,
        });
        clicked = true;
        await new Promise((r) => setTimeout(r, 1500));
        break;
      }

      if (!clicked) break;
    }

    const links = Array.from(dedup.values()).slice(0, maxTarget);
    await writeLinks(links);

    return {
      success: true,
      keywordDir,
      linksPath,
      collectedCount: links.length,
      pagesVisited,
    };
  } catch (error: any) {
    const links = Array.from(dedup.values()).slice(0, maxTarget);
    await writeLinks(links).catch((): null => null);
    return {
      success: false,
      keywordDir,
      linksPath,
      collectedCount: links.length,
      pagesVisited,
      error: `WeiboCollectSearchLinks failed: ${error.message}`,
    };
  }
}
