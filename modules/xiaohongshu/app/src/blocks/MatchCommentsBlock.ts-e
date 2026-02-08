/**
 * Block: 评论命中（MatchComments）
 *
 * 职责：
 * - 基于容器提取“视口内评论”
 * - 按可配置规则匹配关键字（任意一个/任意两个/必选过滤/排除词等）
 * - 命中后高亮 + 截图留证（可选）
 *
 * 说明：
 * - 不负责导航（safeUrl 由上层负责）
 * - 不做 DOM click，所有交互均通过 container:operation / 系统能力
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';

import { controllerAction, delay } from '../utils/controllerAction.js';
import { isLegacyKeywordRule, matchCommentText, type CommentKeywordMatchRule } from './helpers/commentMatcher.js';
import { matchCommentTextDsl, type CommentMatchDslRule } from './helpers/commentMatchDsl.js';
import {
  ensureCommentsOpened,
  extractVisibleComments,
  highlightCommentRow,
  isCommentEnd,
  scrollComments,
} from './helpers/xhsComments.js';
import { resolveDownloadRoot, savePngBase64, takeScreenshotBase64 } from './helpers/evidence.js';

export interface MatchCommentsInput {
  sessionId: string;
  /**
   * Rule can be:
   * - legacy keyword rule (any/must/mustNot/should/minAnyMatches...)
   * - DSL rule (require/exclude/prefer with boolean expr)
   */
  rule: CommentKeywordMatchRule | CommentMatchDslRule;
  unifiedApiUrl?: string;
  maxScrolls?: number;
  maxItems?: number;
  maxMatches?: number;
  openComments?: boolean;
  highlightOnFirstMatch?: boolean;
  screenshotOnFirstMatch?: boolean;
  noteId?: string;
  env?: string;
  keyword?: string;
}

export interface MatchCommentsOutput {
  success: boolean;
  rounds: number;
  reachedBottom: boolean;
  matches: Array<{
    index: number; // 视口内 index（随滚动变化；建议上层立刻消费）
    userId: string;
    userName: string;
    content: string;
    timestamp: string;
    matched: {
      hits: string[];
      score: number;
      legacy?: {
        anyHits: string[];
        mustHits: string[];
        shouldHits: string[];
        anyCount: number;
        shouldCount: number;
      };
      dsl?: {
        requireHits: string[];
        preferHits: string[];
      };
    };
  }>;
  evidence?: {
    firstMatchScreenshot?: string | null;
  };
  error?: string;
}

export async function execute(input: MatchCommentsInput): Promise<MatchCommentsOutput> {
  const {
    sessionId,
    rule,
    unifiedApiUrl = 'http://127.0.0.1:7701',
    maxScrolls = 12,
    maxItems = 60,
    maxMatches = 3,
    openComments = true,
    highlightOnFirstMatch = true,
    screenshotOnFirstMatch = true,
    noteId = `unknown-${Date.now()}`,
    env = 'debug',
    keyword = 'unknown',
  } = input;

  const matches: MatchCommentsOutput['matches'] = [];
  const seen = new Set<string>();
  let rounds = 0;
  let reachedBottom = false;
  let firstMatchScreenshot: string | null = null;

  try {
    if (openComments) {
      await ensureCommentsOpened(sessionId, unifiedApiUrl);
    }

    const outDir = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'comment-match', noteId);

    for (let round = 0; round < maxScrolls; round += 1) {
      rounds = round + 1;

      const rows = await extractVisibleComments(sessionId, unifiedApiUrl, maxItems);
      for (let i = 0; i < rows.length; i += 1) {
        if (matches.length >= maxMatches) break;

        const r = rows[i] || {};
        const text = String(r.text || '').trim();
        if (!text) continue;

        const key = `${String(r.user_id || '')}:${text}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const matched = isLegacyKeywordRule(rule)
          ? (() => {
              const m = matchCommentText(text, rule);
              if (!m.ok) return null;
              return {
                ok: true as const,
                hits: Array.from(new Set([...m.anyHits, ...m.mustHits, ...m.shouldHits])),
                score: m.shouldCount * 100 + m.anyCount + m.mustHits.length,
                legacy: {
                  anyHits: m.anyHits,
                  mustHits: m.mustHits,
                  shouldHits: m.shouldHits,
                  anyCount: m.anyCount,
                  shouldCount: m.shouldCount,
                },
              };
            })()
          : (() => {
              const d = matchCommentTextDsl(text, rule as CommentMatchDslRule);
              if (!d.ok) return null;
              return {
                ok: true as const,
                hits: d.hits,
                score: d.score,
                dsl: { requireHits: d.requireHits, preferHits: d.preferHits },
              };
            })();

        if (!matched) continue;

        matches.push({
          index: i,
          userId: String(r.user_id || ''),
          userName: String(r.user_name || ''),
          content: text,
          timestamp: String(r.timestamp || ''),
          matched: {
            hits: matched.hits,
            score: matched.score,
            legacy: Object.prototype.hasOwnProperty.call(matched as any, 'legacy') ? (matched as any).legacy : undefined,
            dsl: Object.prototype.hasOwnProperty.call(matched as any, 'dsl') ? (matched as any).dsl : undefined,
          },
        });

        if (matches.length === 1 && highlightOnFirstMatch) {
          const hl = await highlightCommentRow(sessionId, i, unifiedApiUrl, 'comment-match-first').catch(
            (): null => null,
          );
          await delay(450);
          if (screenshotOnFirstMatch && hl?.inViewport === true && !firstMatchScreenshot) {
            const base64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
            if (base64) {
              await fs.mkdir(outDir, { recursive: true });
              firstMatchScreenshot = await savePngBase64(
                base64,
                path.join(outDir, `match-first-${Date.now()}.png`),
              );
            }
          }
        }
      }

      if (matches.length >= maxMatches) break;

      reachedBottom = await isCommentEnd(sessionId, unifiedApiUrl);
      if (reachedBottom) break;

      await scrollComments(sessionId, unifiedApiUrl, 650).catch((): void => {});
      await delay(900);
    }

    return {
      success: true,
      rounds,
      reachedBottom,
      matches,
      evidence: { firstMatchScreenshot },
    };
  } catch (e: any) {
    return {
      success: false,
      rounds,
      reachedBottom,
      matches,
      evidence: { firstMatchScreenshot },
      error: e?.message || String(e),
    };
  } finally {
    // 尽量不破坏会话，仅清理一次高亮 channel（不强制）
    await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        script: `(() => {
          try { window.__webautoRuntime?.highlight?.clear?.('comment-match-first'); } catch {}
          return true;
        })()`,
      },
      unifiedApiUrl,
    ).catch((): null => null);
  }
}
