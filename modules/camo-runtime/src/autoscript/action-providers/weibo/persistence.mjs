import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function sanitizeForPath(name, fallback = 'unknown') {
  const text = String(name || '').trim();
  if (!text) return fallback;
  const cleaned = text.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || fallback;
}

function resolveDownloadRoot(customRoot) {
  const fromParams = String(customRoot || '').trim();
  if (fromParams) return path.resolve(fromParams);
  const fromWebauto = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromWebauto) return path.resolve(fromWebauto);
  const fromCamo = String(process.env.CAMO_DOWNLOAD_ROOT || process.env.CAMO_DOWNLOAD_DIR || '').trim();
  if (fromCamo) return path.resolve(fromCamo);
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

export function resolveWeiboOutputContext({ params = {}, state = {} } = {}) {
  const keywordRaw = String(params.keyword || state.keyword || 'unknown').trim();
  const envRaw = String(params.env || state.env || 'prod').trim();
  const root = resolveDownloadRoot(
    params.outputRoot || params.downloadRoot || params.rootDir
    || state.outputRoot || state.downloadRoot || state.rootDir,
  );
  const keyword = sanitizeForPath(keywordRaw, 'unknown');
  const env = sanitizeForPath(envRaw, 'prod');
  const keywordDir = path.join(root, 'weibo', env, `search:${keyword}`);
  return {
    root,
    env,
    keyword,
    keywordDir,
    postsPath: path.join(keywordDir, 'posts.jsonl'),
    linksPath: path.join(keywordDir, 'links.jsonl'),
    metaPath: path.join(keywordDir, 'collection-meta.json'),
    logPath: path.join(keywordDir, 'run.log'),
  };
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJsonlRows(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function appendJsonlRows(filePath, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  await ensureDir(path.dirname(filePath));
  const payload = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.appendFile(filePath, `${payload}\n`, 'utf8');
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function weiboPostDedupKey(row) {
  const url = String(row?.url || '').trim();
  return url;
}

export async function mergeWeiboPosts({ filePath, posts = [] }) {
  const existing = await readJsonlRows(filePath);
  const seen = new Set(existing.map((row) => weiboPostDedupKey(row)).filter(Boolean));
  const added = [];
  for (const row of posts) {
    const key = weiboPostDedupKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push(row);
  }
  await appendJsonlRows(filePath, added);
  return { filePath, added: added.length, existing: existing.length, total: existing.length + added.length };
}

export async function writeWeiboLinks({ filePath, posts = [] }) {
  if (!Array.isArray(posts) || posts.length === 0) return { filePath, count: 0 };
  const rows = posts
    .filter((p) => p && String(p?.url || '').trim())
    .map((p) => JSON.stringify({
      id: p.id || null,
      url: String(p.url).trim(),
      authorId: p.authorId || null,
      authorName: p.authorName || null,
      publishedDate: p.publishedDate || null,
      content: p.content || null,
      collectedAt: p.collectedAt || null,
    }));
  if (rows.length === 0) return { filePath, count: 0 };
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, rows.join('\n') + '\n', 'utf8');
  return { filePath, count: rows.length };
}

export async function writeCollectionMeta({ filePath, meta = {} }) {
  await writeJson(filePath, meta);
  return { filePath, meta };
}

export async function appendLog({ filePath, message }) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}\n`;
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, line, 'utf8');
}

export function resolveWeiboDetailOutputContext({ params = {}, state = {} } = {}) {
  const keywordRaw = String(params.keyword || state.keyword || 'unknown').trim();
  const envRaw = String(params.env || state.env || 'prod').trim();
  const postIdRaw = String(params.postId || state.currentPostId || 'unknown').trim();
  const root = resolveDownloadRoot(
    params.outputRoot || params.downloadRoot || params.rootDir
    || state.outputRoot || state.downloadRoot || state.rootDir,
  );
  const keyword = sanitizeForPath(keywordRaw, 'unknown');
  const env = sanitizeForPath(envRaw, 'prod');
  const postId = sanitizeForPath(postIdRaw, 'unknown');
  const keywordDir = path.join(root, 'weibo', env, `search:${keyword}`);
  const postDir = path.join(keywordDir, postId);
  return {
    root,
    env,
    keyword,
    postId,
    keywordDir,
    postDir,
    contentPath: path.join(postDir, 'content.md'),
    commentsPath: path.join(postDir, 'comments.jsonl'),
    commentsMdPath: path.join(postDir, 'comments.md'),
    imagesDir: path.join(postDir, 'images'),
    videosDir: path.join(postDir, 'videos'),
    linksPath: path.join(postDir, 'links.json'),
    metaPath: path.join(postDir, 'detail-meta.json'),
    logPath: path.join(keywordDir, 'detail-run.log'),
  };
}

export async function writeDetailContent({ filePath, content }) {
  if (!content) return;
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

export async function writeDetailComments({ filePath, comments }) {
  await ensureDir(path.dirname(filePath));
  if (!Array.isArray(comments) || comments.length === 0) {
    await fs.writeFile(filePath, '', 'utf8');
    return;
  }
  const lines = comments.map((c) => JSON.stringify(c));
  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export async function writeDetailCommentsMd({ filePath, comments }) {
  await ensureDir(path.dirname(filePath));
  if (!Array.isArray(comments) || comments.length === 0) {
    await fs.writeFile(filePath, '# 评论\n\n暂无评论。\n', 'utf8');
    return;
  }
  const lines = ['# 评论', ''];
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    lines.push(`## ${i + 1}. ${c.author || '匿名'}`);
    if (c.timestamp) lines.push(`- 时间: ${c.timestamp}`);
    if (c.likes) lines.push(`- 点赞: ${c.likes}`);
    lines.push('');
    lines.push(c.text || '');
    lines.push('');
    if (Array.isArray(c.replies) && c.replies.length > 0) {
      for (const r of c.replies) {
        lines.push(`  > **${r.author || '匿名'}**${r.timestamp ? ` (${r.timestamp})` : ''}: ${r.text || ''}`);
      }
      lines.push('');
    }
  }
  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

export async function writeDetailLinks({ filePath, links }) {
  await ensureDir(path.dirname(filePath));
  if (!Array.isArray(links) || links.length === 0) {
    await fs.writeFile(filePath, '[]', 'utf8');
    return;
  }
  await fs.writeFile(filePath, `${JSON.stringify(links, null, 2)}\n`, 'utf8');
}

export async function writeDetailMeta({ filePath, meta }) {
  await writeJson(filePath, meta);
}
