/**
 * iflow-reply.mjs
 * 
 * 使用 iflow -p 生成智能回复
 */

import { spawn } from 'child_process';

/**
 * @typedef {Object} SmartReplyOptions
 * @property {string} noteContent - 帖子正文
 * @property {string} commentText - 命中的评论全文
 * @property {string} replyIntent - 回复的中心意思（用户提供）
 * @property {string} [style] - 回复风格
 * @property {number} [maxLength] - 最大字数
 * @property {string} [model] - 指定模型
 */

/**
 * @typedef {Object} SmartReplyResult
 * @property {boolean} ok
 * @property {string} [reply]
 * @property {string} [error]
 * @property {number} [executionTimeMs]
 * @property {{input: number, output: number, total: number}} [tokenUsage]
 */

/**
 * Build prompt for iflow
 * @param {SmartReplyOptions} opts
 * @returns {string}
 */
function buildPrompt(opts) {
  const { noteContent, commentText, replyIntent, style, maxLength } = opts;
  const styleDesc = style || '友好、自然、口语化';
  const maxLen = maxLength || 100;

  return `你是一个小红书评论回复助手。请根据以下信息生成一条回复。

## 帖子正文
${noteContent}

## 命中的评论
${commentText}

## 回复要求
- 回复的中心意思：${replyIntent}
- 回复风格：${styleDesc}
- 字数限制：${maxLen}字以内
- 不要使用表情符号开头
- 不要过于正式，保持自然对话感
- 可以适当使用 1-2 个表情符号

请直接输出回复内容，不要有任何解释或说明。`;
}

/**
 * Generate smart reply using iflow -p
 * @param {SmartReplyOptions} opts
 * @returns {Promise<SmartReplyResult>}
 */
export async function generateSmartReply(opts) {
  const prompt = buildPrompt(opts);
  const startTime = Date.now();

  return new Promise((resolve) => {
    const args = ['-p', prompt];
    if (opts.model) {
      args.unshift('-m', opts.model);
    }

    const child = spawn('iflow', args, {
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
      try {
        child.kill('SIGTERM');
      } catch {}
      resolve({
        ok: false,
        error: 'timeout (30s)',
        executionTimeMs: Date.now() - startTime,
      });
    }, 30000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const executionTimeMs = Date.now() - startTime;

      if (code !== 0) {
        resolve({
          ok: false,
          error: stderr || `exit code ${code}`,
          executionTimeMs,
        });
        return;
      }

      const lines = stdout.trim().split('\n');
      let replyText = '';
      let tokenUsage = { input: 0, output: 0, total: 0 };

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.endsWith('}')) {
          try {
            const info = JSON.parse(line);
            if (info.tokenUsage) {
              tokenUsage = info.tokenUsage;
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

      replyText = replyText
        .replace(/^["']|["']$/g, '')
        .replace(/\n+/g, ' ')
        .trim();

      if (!replyText) {
        resolve({
          ok: false,
          error: 'empty reply from iflow',
          executionTimeMs,
        });
        return;
      }

      resolve({
        ok: true,
        reply: replyText,
        executionTimeMs,
        tokenUsage,
      });
    });
  });
}

/**
 * Batch generate replies
 * @param {Array<{noteContent: string, commentText: string, replyIntent: string}>} items
 * @param {{style?: string, maxLength?: number, model?: string, concurrency?: number}} [opts]
 * @returns {Promise<Array<SmartReplyResult & {index: number}>>}
 */
export async function generateBatchReplies(items, opts = {}) {
  const concurrency = opts.concurrency || 3;
  const results = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((item, batchIndex) =>
        generateSmartReply({ ...item, ...opts }).then((r) => ({
          ...r,
          index: i + batchIndex,
        })),
      ),
    );
    results.push(...batchResults);
  }

  return results;
}
