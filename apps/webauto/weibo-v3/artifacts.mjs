// Weibo business artifact persistence. The JSONL families and directory
// layout are preserved so historical data and downstream readers keep working.

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

function sanitizeForPath(name, fallback = 'unknown') {
  const text = String(name || '').trim();
  if (!text) return fallback;
  const cleaned = text
    .replace(/[\\/:*?"<>|]+/g, '_')
    // A dot run that is not a real name extension (".", "..", "...") is
    // replaced so the segment can never be a dot segment.
    .replace(/\.{2,}/g, '_')
    .replace(/^\.(?![A-Za-z0-9])/, '_')
    .replace(/(?<![A-Za-z0-9])\.$/, '_')
    .trim();
  // The result must never be a dot segment, because "." and ".." resolve to
  // another directory. Non-ASCII names stay intact: keywords such as
  // "人工智能" are real and distinct, and collapsing them into one fallback
  // would merge unrelated collections into a single artifact directory.
  if (!cleaned) return fallback;
  // When a value is not usable as a name, keep it distinct instead of folding
  // every rejected input into one directory: a short digest of the original
  // value is appended so "..", "." and "..." cannot share artifacts.
  if (/^\.+$/.test(cleaned) || cleaned === '_') {
    const digest = createHash('sha256').update(text).digest('hex').slice(0, 8);
    return `${fallback}-${digest}`;
  }
  return cleaned;
}

export function resolveDownloadRoot(customRoot = '') {
  const explicit = String(customRoot || '').trim();
  if (explicit) return path.resolve(explicit);
  const fromEnv = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), '.webauto', 'download');
}

export function resolveKeywordContext({ keyword, env = 'prod', outputRoot = '' } = {}) {
  const root = resolveDownloadRoot(outputRoot);
  const safeKeyword = sanitizeForPath(keyword, 'unknown');
  const safeEnv = sanitizeForPath(env, 'prod');
  const keywordDir = path.join(root, 'weibo', safeEnv, safeKeyword);
  return {
    root,
    env: safeEnv,
    keyword: safeKeyword,
    keywordDir,
    postsPath: path.join(keywordDir, 'posts.jsonl'),
    linksPath: path.join(keywordDir, 'links.jsonl'),
    metaPath: path.join(keywordDir, 'collection-meta.json'),
    logPath: path.join(keywordDir, 'run.log'),
  };
}

export function resolveTimelineContext({ date, env = 'prod', outputRoot = '' } = {}) {
  const root = resolveDownloadRoot(outputRoot);
  const safeDate = sanitizeForPath(date || new Date().toISOString().slice(0, 10), 'unknown');
  const safeEnv = sanitizeForPath(env, 'prod');
  const keywordDir = path.join(root, 'weibo', safeEnv, `timeline:${safeDate}`);
  return {
    root,
    env: safeEnv,
    date: safeDate,
    keyword: `timeline:${safeDate}`,
    keywordDir,
    postsPath: path.join(keywordDir, 'posts.jsonl'),
    linksPath: path.join(keywordDir, 'links.jsonl'),
    metaPath: path.join(keywordDir, 'collection-meta.json'),
    logPath: path.join(keywordDir, 'run.log'),
  };
}

export function resolveDetailContext({
  keyword = 'detail',
  env = 'prod',
  outputRoot = '',
  postId = 'unknown',
} = {}) {
  const keywordCtx = resolveKeywordContext({ keyword, env, outputRoot });
  const safePostId = sanitizeForPath(postId, 'unknown');
  const postDir = path.join(keywordCtx.keywordDir, safePostId);
  return {
    ...keywordCtx,
    postId: safePostId,
    postDir,
    contentPath: path.join(postDir, 'content.md'),
    commentsPath: path.join(postDir, 'comments.jsonl'),
    commentsMdPath: path.join(postDir, 'comments.md'),
    linksPath: path.join(postDir, 'links.json'),
    metaPath: path.join(postDir, 'detail-meta.json'),
    imagesDir: path.join(postDir, 'images'),
    videosDir: path.join(postDir, 'videos'),
    logPath: path.join(keywordCtx.keywordDir, 'detail-run.log'),
  };
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJsonl(filePath, { missingOk = false } = {}) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`invalid JSONL at ${filePath}:${index + 1}: ${error.message}`);
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT' && missingOk) return [];
    throw error;
  }
}

export async function appendJsonl(filePath, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { added: 0 };
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  return { added: rows.length };
}

export async function mergePosts({ filePath, posts = [] }) {
  const existing = await readJsonl(filePath, { missingOk: true });
  const merged = mergeByUrl(existing, posts);
  const added = merged.slice(existing.length);
  await appendJsonl(filePath, added);
  return { filePath, added: added.length, existing: existing.length, total: merged.length, posts: merged };
}

// posts.jsonl is the collected queue; links.jsonl is the work list the detail
// and consumer edges drain. Both must describe the same set, so the queue
// rewrite is derived from the merged posts rather than the latest batch: a
// rerun that only writes fresh rows would silently drop the pending backlog.
export async function updateQueue({ postsPath, linksPath, posts = [] }) {
  const merged = await mergePosts({ filePath: postsPath, posts });
  const written = await writeLinks({ filePath: linksPath, posts: merged.posts });
  return { ...merged, linksWritten: written.count };
}

function mergeByUrl(existing, posts) {
  const seen = new Set(existing.map((row) => row.url).filter(Boolean));
  const merged = [...existing];
  const added = [];
  for (const post of posts) {
    const url = String(post?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    added.push(post);
  }
  merged.push(...added);
  return merged;
}

export async function writeLinks({ filePath, posts = [] }) {
  const rows = posts
    .filter((post) => post?.url)
    .map((post) => JSON.stringify({
      id: post.id || post.mid || null,
      url: post.url,
      authorId: post.authorId || null,
      authorName: post.authorName || post.author || null,
      publishedDate: post.publishedDate || null,
      content: post.content || null,
      collectedAt: post.collectedAt || null,
    }));
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, rows.length ? `${rows.join('\n')}\n` : '', 'utf8');
  return { filePath, count: rows.length };
}

export async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { filePath, payload };
}

export async function appendLog(filePath, message) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
}

export async function writeComments({ filePath, comments = [] }) {
  await ensureDir(path.dirname(filePath));
  const body = comments.length
    ? `${comments.map((comment) => JSON.stringify(comment)).join('\n')}\n`
    : '';
  await fs.writeFile(filePath, body, 'utf8');
}

export async function writeCommentsMarkdown({ filePath, comments = [] }) {
  const lines = ['# 评论', ''];
  comments.forEach((comment, index) => {
    lines.push(`## ${index + 1}. ${comment.user?.name || '匿名'}`);
    if (comment.timestamp) lines.push(`- 时间: ${comment.timestamp}`);
    if (comment.likes) lines.push(`- 点赞: ${comment.likes}`);
    lines.push('', comment.text || '', '');
    for (const reply of comment.replies || []) {
      lines.push(`  > **${reply.user?.name || '匿名'}**${reply.timestamp ? ` (${reply.timestamp})` : ''}: ${reply.text || ''}`);
    }
    if (comment.replies?.length) lines.push('');
  });
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export async function writeContentMarkdown({ filePath, post = {} }) {
  const lines = [
    '# 微博正文',
    '',
    `- Post ID: ${post.mid || post.id || ''}`,
    `- 作者: ${post.author?.name || ''}`,
    `- 链接: ${post.url || ''}`,
    `- 发布时间: ${post.createdAt || ''}`,
    `- 采集时间: ${new Date().toISOString()}`,
    '',
    '## 正文',
    '',
    post.content || '（无正文）',
  ];
  if (post.repost?.content) {
    lines.push('', '## 转发原文', '', `> 作者: ${post.repost.author?.name || '未知'}`, '', post.repost.content);
  }
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}
