/**
 * Block: SmartReplyBlock
 * 
 * 职责：
 * 1. 根据关键词规则筛选命中评论
 * 2. 使用 iflow -p 生成智能回复
 * 3. 支持 dryRun 模式（全流程但不发送）
 * 4. 生成回复模拟截图（高亮命中评论 + 覆盖层显示回复内容）
 * 5. 支持真实回复发送
 * 6. 评论级别流控（避免触发风控）
 * 7. 评论元素内精确回复（不回复到别的楼）
 */

import path from 'node:path';
import { spawn } from 'child_process';
import { controllerAction, delay } from '../utils/controllerAction.js';
import { resolveDownloadRoot, savePngBase64, takeScreenshotBase64 } from './helpers/evidence.js';
import { matchCommentText, CommentKeywordMatchRule, CommentMatchResult } from './helpers/commentMatcher.js';

export interface SmartReplyComment {
  id: string;
  visibleIndex: number;
  text: string;
  author: string;
  parentId?: string;
}

export interface RateLimitConfig {
  minIntervalMs?: number;
  maxPerSession?: number;
  cooldownMs?: number;
}

export interface SmartReplyInput {
  sessionId: string;
  noteId: string;
  noteContent: string;
  comments: SmartReplyComment[];
  keywordRule: CommentKeywordMatchRule;
  replyIntent: string;
  replyStyle?: string;
  maxLength?: number;
  dryRun?: boolean;
  unifiedApiUrl?: string;
  env?: string;
  keyword?: string;
  rateLimit?: RateLimitConfig;
  sampleMode?: boolean;
  sampleCount?: number;
  requireConfirmation?: boolean;
}

export interface SmartReplyOutput {
  success: boolean;
  matchedCount: number;
  processedCount: number;
  skippedCount: number;
  replies: Array<{
    commentId: string;
    commentText: string;
    author: string;
    matched: boolean;
    matchResult?: CommentMatchResult;
    generatedReply?: string;
    sent: boolean;
    skipped?: boolean;
    skipReason?: string;
    error?: string;
    evidencePath?: string;
    confirmationScreenshot?: string;
    replyTimeMs?: number;
  }>;
  evidencePaths: string[];
  sessionStats: {
    totalReplies: number;
    sessionStartTime: number;
    averageIntervalMs: number;
  };
  error?: string;
}

interface ClickTarget {
  ok: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  clickPoint?: { x: number; y: number };
  commentRect?: { x: number; y: number; width: number; height: number };
  reason?: string;
}

// Session-level rate limiting state
const sessionReplyStats = new Map<string, {
  count: number;
  lastReplyTime: number;
  replyTimes: number[];
}>();

function getSessionStats(sessionId: string) {
  if (!sessionReplyStats.has(sessionId)) {
    sessionReplyStats.set(sessionId, {
      count: 0,
      lastReplyTime: 0,
      replyTimes: [],
    });
  }
  return sessionReplyStats.get(sessionId)!;
}

function checkRateLimit(
  sessionId: string,
  config: RateLimitConfig,
): { allowed: boolean; reason?: string; waitMs?: number } {
  const stats = getSessionStats(sessionId);
  const now = Date.now();
  const { minIntervalMs = 3000, maxPerSession = 20, cooldownMs = 60000 } = config;
  
  if (stats.count >= maxPerSession) {
    const timeSinceLast = now - stats.lastReplyTime;
    if (timeSinceLast < cooldownMs) {
      return {
        allowed: false,
        reason: `session limit reached (${maxPerSession}), cooldown ${Math.ceil((cooldownMs - timeSinceLast) / 1000)}s remaining`,
        waitMs: cooldownMs - timeSinceLast,
      };
    }
    stats.count = 0;
  }
  
  const timeSinceLast = now - stats.lastReplyTime;
  if (stats.lastReplyTime > 0 && timeSinceLast < minIntervalMs) {
    return {
      allowed: false,
      reason: `rate limit: need ${Math.ceil((minIntervalMs - timeSinceLast) / 1000)}s interval`,
      waitMs: minIntervalMs - timeSinceLast,
    };
  }
  
  return { allowed: true };
}

function recordReply(sessionId: string, durationMs: number) {
  const stats = getSessionStats(sessionId);
  stats.count++;
  stats.lastReplyTime = Date.now();
  stats.replyTimes.push(durationMs);
  if (stats.replyTimes.length > 20) {
    stats.replyTimes.shift();
  }
}

async function generateReplyWithIflow(
  noteContent: string,
  commentText: string,
  replyIntent: string,
  style?: string,
  maxLength?: number,
): Promise<{ ok: boolean; reply?: string; error?: string; durationMs?: number }> {
  const startTime = Date.now();
  const prompt = `你是一个小红书评论回复助手。请根据以下信息生成一条回复。

## 帖子正文
${noteContent}

## 命中的评论
${commentText}

## 回复要求
- 回复的中心意思：${replyIntent}
- 回复风格：${style || '友好、自然、口语化'}
- 字数限制：${maxLength || 100}字以内
- 不要使用表情符号开头
- 不要过于正式，保持自然对话感
- 可以适当使用 1-2 个表情符号

请直接输出回复内容，不要有任何解释或说明。`;

  return new Promise((resolve) => {
    const child = spawn('iflow', ['-p', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timeout = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      resolve({ ok: false, error: 'iflow timeout (30s)', durationMs: Date.now() - startTime });
    }, 30000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: err.message, durationMs: Date.now() - startTime });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;

      if (code !== 0) {
        resolve({ ok: false, error: stderr || `iflow exit code ${code}`, durationMs });
        return;
      }

      const lines = stdout.trim().split('\n');
      let replyText = '';

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.endsWith('}')) {
          try {
            const info = JSON.parse(line);
            if (info.tokenUsage || info['conversation-id']) {
              replyText = lines.slice(0, i).join('\n').trim();
              break;
            }
          } catch {}
        }
      }

      if (!replyText) {
        replyText = stdout.trim();
        const execInfoMatch = replyText.match(/<Execution Info>[\s\S]*$/);
        if (execInfoMatch) {
          replyText = replyText.slice(0, execInfoMatch.index).trim();
        }
      }

      replyText = replyText.replace(/^["']|["']$/g, '').replace(/\n+/g, ' ').trim();

      if (!replyText) {
        resolve({ ok: false, error: 'empty reply from iflow', durationMs });
        return;
      }

      resolve({ ok: true, reply: replyText, durationMs });
    });
  });
}

async function findReplyButtonInComment(
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
        
        const commentRect = root.getBoundingClientRect();
        
        const textEq = (el, s) => (el && (el.textContent || '').replace(/\\s+/g,' ').trim() === s);
        const candidates = Array.from(root.querySelectorAll('span, button, a, div'));
        
        let raw = candidates.find(el => textEq(el, '回复')) || null;
        
        if (!raw) {
          const actionArea = root.querySelector('.comment-actions, .actions, [class*="action"]');
          if (actionArea) {
            raw = Array.from(actionArea.querySelectorAll('span, button, a')).find(el => 
              textEq(el, '回复') || el.getAttribute('data-type') === 'reply'
            ) || null;
          }
        }
        
        if (!raw) return { ok: false, reason: 'reply-button-not-found', commentRect: { x: Math.round(commentRect.left), y: Math.round(commentRect.top), width: Math.round(commentRect.width), height: Math.round(commentRect.height) } };

        const target = raw.closest && (raw.closest('button, a, [role="button"]') || raw) || raw;
        const r = target.getBoundingClientRect();
        if (!r || !r.width || !r.height) return { ok: false, reason: 'reply-rect-empty', commentRect: { x: Math.round(commentRect.left), y: Math.round(commentRect.top), width: Math.round(commentRect.width), height: Math.round(commentRect.height) } };

        const mx = Math.round(r.left + r.width / 2);
        const my = Math.round(r.top + r.height / 2);

        return {
          ok: true,
          rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
          clickPoint: { x: mx, y: my },
          commentRect: { x: Math.round(commentRect.left), y: Math.round(commentRect.top), width: Math.round(commentRect.width), height: Math.round(commentRect.height) }
        };
      })()`,
    },
    apiUrl,
  );
  return (res?.result || res?.data?.result || res) as ClickTarget;
}

async function drawReplyOverlay(
  sessionId: string,
  apiUrl: string,
  opts: { 
    id: string; 
    commentRect?: { x: number; y: number; width: number; height: number };
    buttonRect?: { x: number; y: number; width: number; height: number };
    color: string; 
    label?: string; 
    ttlMs?: number;
    dryRun?: boolean;
  },
): Promise<boolean | null> {
  const ttlMs = opts.ttlMs || 8000;
  const result = await controllerAction(
    'browser:execute',
    {
      profile: sessionId,
      script: `(() => {
        const id = ${JSON.stringify(opts.id)};
        const commentRect = ${JSON.stringify(opts.commentRect || null)};
        const buttonRect = ${JSON.stringify(opts.buttonRect || null)};
        const color = ${JSON.stringify(opts.color)};
        const label = ${JSON.stringify(opts.label || '')};
        const ttl = ${JSON.stringify(ttlMs)};
        const dryRun = ${JSON.stringify(opts.dryRun || false)};

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

        if (commentRect) {
          ensure(id + '-comment', {
            position: 'fixed',
            left: commentRect.x + 'px',
            top: commentRect.y + 'px',
            width: commentRect.width + 'px',
            height: commentRect.height + 'px',
            border: '4px solid ' + color,
            boxSizing: 'border-box',
            zIndex: '2147483646',
            pointerEvents: 'none',
            background: color + '10',
            boxShadow: '0 0 20px ' + color + '40',
          });
        }

        if (buttonRect) {
          ensure(id + '-button', {
            position: 'fixed',
            left: buttonRect.x + 'px',
            top: buttonRect.y + 'px',
            width: buttonRect.width + 'px',
            height: buttonRect.height + 'px',
            border: '3px solid #ff0066',
            borderRadius: '4px',
            boxSizing: 'border-box',
            zIndex: '2147483647',
            pointerEvents: 'none',
            background: 'rgba(255, 0, 102, 0.2)',
          });
        }

        if (label) {
          const labelEl = ensure(id + '-label', {
            position: 'fixed',
            left: '12px',
            top: '12px',
            maxWidth: '80vw',
            padding: '12px 16px',
            background: dryRun ? 'rgba(0, 100, 255, 0.95)' : 'rgba(0, 150, 50, 0.95)',
            color: '#fff',
            fontSize: '13px',
            lineHeight: '1.5',
            borderRadius: '8px',
            zIndex: '2147483648',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          });
          labelEl.textContent = label;
        }

        setTimeout(() => {
          try {
            ['-comment', '-button', '-label'].forEach(suffix => {
              const el = document.getElementById(id + suffix);
              if (el && el.parentElement) el.parentElement.removeChild(el);
            });
          } catch {}
        }, ttl);

        return true;
      })()`,
    },
    apiUrl,
  ).catch((): null => null);
  return result?.result || result?.data?.result || result;
}

async function sendReply(
  sessionId: string,
  noteId: string,
  commentVisibleIndex: number,
  replyText: string,
  apiUrl: string,
  isDryRun: boolean,
): Promise<{ ok: boolean; submitted: boolean; error?: string; durationMs: number }> {
  const startTime = Date.now();
  const { execute } = await import('./ReplyInteractBlock.js');
  
  const result = await execute({
    sessionId,
    noteId,
    commentVisibleIndex,
    replyText,
    dryRun: isDryRun,
    unifiedApiUrl: apiUrl,
    dev: false,
  });

  const submitted = isDryRun ? false : result.submitted === true;
  const ok = result.success === true && (isDryRun ? true : submitted);

  return { 
    ok,
    submitted,
    error: result.error,
    durationMs: Date.now() - startTime,
  };
}

async function takeConfirmationScreenshot(
  sessionId: string,
  apiUrl: string,
  outDir: string,
  commentId: string,
  prefix: string,
): Promise<string | undefined> {
  await delay(500);
  const base64 = await takeScreenshotBase64(sessionId, apiUrl);
  if (!base64) return undefined;
  
  const name = `${prefix}-confirm-${commentId}-${Date.now()}.png`;
  return await savePngBase64(base64, path.join(outDir, name));
}

export async function execute(input: SmartReplyInput): Promise<SmartReplyOutput> {
  const {
    sessionId,
    noteId,
    noteContent,
    comments,
    keywordRule,
    replyIntent,
    replyStyle,
    maxLength,
    dryRun = false,
    unifiedApiUrl = 'http://127.0.0.1:7701',
    env = 'debug',
    keyword = 'unknown',
    rateLimit = {},
    sampleMode = false,
    sampleCount = 3,
    requireConfirmation = false,
  } = input;

  const replies: SmartReplyOutput['replies'] = [];
  const evidencePaths: string[] = [];
  const sessionStartTime = Date.now();

  try {
    const matchedComments = comments
      .map((c) => ({ comment: c, match: matchCommentText(c.text, keywordRule) }))
      .filter(({ match }) => match.ok)
      .map(({ comment, match }) => ({ ...comment, matchResult: match }));

    if (matchedComments.length === 0) {
      return {
        success: true,
        matchedCount: 0,
        processedCount: 0,
        skippedCount: 0,
        replies: [],
        evidencePaths: [],
        sessionStats: {
          totalReplies: 0,
          sessionStartTime,
          averageIntervalMs: 0,
        },
      };
    }

    const targetComments = sampleMode 
      ? matchedComments.slice(0, sampleCount)
      : matchedComments;

    let processedCount = 0;
    let skippedCount = 0;

    for (const comment of targetComments) {
      const rateCheck = checkRateLimit(sessionId, rateLimit);
      if (!rateCheck.allowed) {
        replies.push({
          commentId: comment.id,
          commentText: comment.text,
          author: comment.author,
          matched: true,
          matchResult: comment.matchResult,
          sent: false,
          skipped: true,
          skipReason: rateCheck.reason,
        });
        skippedCount++;
        
        if (rateCheck.waitMs && rateCheck.waitMs < 10000) {
          await delay(rateCheck.waitMs);
        }
        continue;
      }

      const buttonTarget = await findReplyButtonInComment(
        sessionId,
        unifiedApiUrl,
        comment.visibleIndex,
      );

      if (!buttonTarget.ok) {
        replies.push({
          commentId: comment.id,
          commentText: comment.text,
          author: comment.author,
          matched: true,
          matchResult: comment.matchResult,
          sent: false,
          error: `reply button not found: ${buttonTarget.reason}`,
        });
        continue;
      }

      const genResult = await generateReplyWithIflow(
        noteContent,
        comment.text,
        replyIntent,
        replyStyle,
        maxLength,
      );

      if (!genResult.ok) {
        replies.push({
          commentId: comment.id,
          commentText: comment.text,
          author: comment.author,
          matched: true,
          matchResult: comment.matchResult,
          sent: false,
          error: genResult.error,
        });
        continue;
      }

      const generatedReply = genResult.reply!;

      const outDir = path.join(
        resolveDownloadRoot(),
        'xiaohongshu',
        env,
        keyword,
        'smart-reply',
        noteId,
      );
      
      await drawReplyOverlay(sessionId, unifiedApiUrl, {
        id: `smart-reply-${comment.id}`,
        commentRect: buttonTarget.commentRect,
        buttonRect: buttonTarget.rect,
        color: '#00e5ff',
        label: dryRun 
          ? `[DRYRUN] 样本验证\n评论: ${comment.text.slice(0, 40)}...\n作者: ${comment.author}\nAI回复: ${generatedReply.slice(0, 50)}...`
          : `[REPLY] 目标确认\n评论: ${comment.text.slice(0, 40)}...\n作者: ${comment.author}\nAI回复: ${generatedReply.slice(0, 50)}...`,
        ttlMs: 10000,
        dryRun,
      });
      await delay(600);

      let confirmationScreenshot: string | undefined;
      if (requireConfirmation || dryRun) {
        confirmationScreenshot = await takeConfirmationScreenshot(
          sessionId,
          unifiedApiUrl,
          outDir,
          comment.id,
          dryRun ? 'dryrun' : 'target',
        );
        if (confirmationScreenshot) {
          evidencePaths.push(confirmationScreenshot);
        }
        
        if (requireConfirmation && !dryRun) {
          await delay(2000);
        }
      }

      let sent = false;
      let sendError: string | undefined;
      let replyDurationMs = 0;

      if (!dryRun) {
        const sendResult = await sendReply(
          sessionId,
          noteId,
          comment.visibleIndex,
          generatedReply,
          unifiedApiUrl,
          false,
        );
        sent = sendResult.submitted;
        sendError = sendResult.error || (sendResult.submitted ? undefined : 'reply not submitted');
        replyDurationMs = sendResult.durationMs;
        
        if (sendResult.submitted) {
          recordReply(sessionId, replyDurationMs);
          processedCount++;
        }
      } else {
        await delay(1000);
        sent = false;
        processedCount++;
      }

      replies.push({
        commentId: comment.id,
        commentText: comment.text,
        author: comment.author,
        matched: true,
        matchResult: comment.matchResult,
        generatedReply,
        sent: dryRun ? false : sent,
        error: sendError,
        confirmationScreenshot,
        replyTimeMs: replyDurationMs,
      });

      if (sent || dryRun) {
        await delay(500);
        const finalBase64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
        if (finalBase64) {
          const name = `reply-${dryRun ? 'dryrun' : 'sent'}-final-${comment.id}-${Date.now()}.png`;
          const finalPath = await savePngBase64(finalBase64, path.join(outDir, name));
          if (finalPath) {
            evidencePaths.push(finalPath);
          }
        }
      }

      const intervalMs = rateLimit.minIntervalMs || 3000;
      await delay(intervalMs);
    }

    const stats = getSessionStats(sessionId);
    const avgInterval = stats.replyTimes.length > 0
      ? stats.replyTimes.reduce((a, b) => a + b, 0) / stats.replyTimes.length
      : 0;

    return {
      success: true,
      matchedCount: matchedComments.length,
      processedCount,
      skippedCount,
      replies,
      evidencePaths,
      sessionStats: {
        totalReplies: stats.count,
        sessionStartTime,
        averageIntervalMs: Math.round(avgInterval),
      },
    };
  } catch (e: any) {
    return {
      success: false,
      matchedCount: replies.filter(r => r.matched).length,
      processedCount: replies.filter(r => !r.skipped).length,
      skippedCount: replies.filter(r => r.skipped).length,
      replies,
      evidencePaths,
      sessionStats: {
        totalReplies: getSessionStats(sessionId).count,
        sessionStartTime,
        averageIntervalMs: 0,
      },
      error: e?.message || String(e),
    };
  }
}
