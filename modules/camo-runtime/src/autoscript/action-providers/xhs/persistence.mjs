import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function sanitizeForPath(name, fallback = 'unknown') {
  const text = String(name || '').trim();
  if (!text) return fallback;
  const cleaned = text.replace(/[\\/:"*?<>|]+/g, '_').trim();
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

export function resolveXhsOutputContext({
  params = {},
  state = {},
  noteId = null,
} = {}) {
  const keywordRaw = String(params.keyword || state.keyword || 'unknown').trim();
  const envRaw = String(params.env || state.env || 'debug').trim();
  const resolvedNoteId = String(noteId || params.noteId || state.currentNoteId || 'unknown').trim();
  const root = resolveDownloadRoot(params.outputRoot || params.downloadRoot || params.rootDir);
  const keyword = sanitizeForPath(keywordRaw, 'unknown');
  const env = sanitizeForPath(envRaw, 'debug');
  const note = sanitizeForPath(resolvedNoteId, 'unknown');
  const keywordDir = path.join(root, 'xiaohongshu', env, keyword);
  const noteDir = path.join(keywordDir, note);
  const safeDetailPath = path.join(keywordDir, 'safe-detail-urls.jsonl');
  return {
    root,
    env,
    keyword,
    noteId: note,
    keywordDir,
    noteDir,
    linksPath: safeDetailPath,
    safeDetailPath,
    phase2LinksPath: path.join(keywordDir, 'phase2-links.jsonl'),
    contentPath: path.join(noteDir, 'content.md'),
    commentsPath: path.join(noteDir, 'comments.jsonl'),
    commentsMdPath: path.join(noteDir, 'comments.md'),
    imagesDir: path.join(noteDir, 'images'),
    likeStatePath: path.join(keywordDir, '.like-state.jsonl'),
    likeSummaryPath: path.join(noteDir, 'likes.summary.json'),
    likeEvidenceDir: path.join(keywordDir, 'like-evidence', note),
    virtualLikeEvidenceDir: path.join(keywordDir, 'virtual-like', note),
  };
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function formatUrlForLog(url, maxLen = 180) {
  const s = String(url || '');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

async function downloadImage(url, imagesDir, index) {
  if (!url) return null;
  const MIN_IMAGE_BYTES = 20 * 1024;
  let normalized = String(url).trim();
  if (!normalized) return null;
  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  }
  const skipByUrl =
    /sns-avatar-[^/]+\.xhscdn\.com\/avatar\//i.test(normalized)
    || /picasso-static\.xiaohongshu\.com\/fe-platform\//i.test(normalized)
    || normalized.startsWith('data:')
    || normalized.startsWith('blob:');
  if (skipByUrl) return null;
  if (!/^https?:/i.test(normalized)) {
    return null;
  }
  try {
    const res = await fetch(normalized);
    if (!res.ok) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_IMAGE_BYTES) {
      return null;
    }
    const filename = `${String(index).padStart(2, '0')}.jpg`;
    const filepath = path.join(imagesDir, filename);
    await fs.writeFile(filepath, buf);
    return path.join('images', filename);
  } catch {
    return null;
  }
}

export async function readJsonlRows(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
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

function normalizeCommentRow(noteId, row) {
  return {
    noteId: String(noteId || ''),
    commentId: String(row?.commentId || row?.comment_id || row?.id || '').trim(),
    userName: String(row?.userName || row?.author || row?.user_name || '').trim(),
    userId: String(row?.userId || row?.authorId || row?.user_id || '').trim(),
    userLink: String(row?.authorLink || row?.userLink || '').trim(),
    level: Number(row?.level || row?.depth || row?.layer || 1),
    content: String(row?.content || row?.text || '').replace(/\s+/g, ' ').trim(),
    time: String(row?.time || row?.timestamp || '').trim(),
    likeCount: Number(row?.likeCount || row?.like_count || 0),
    ts: new Date().toISOString(),
  };
}

function commentDedupKey(row) {
  return `${String(row?.userId || '')}:${String(row?.content || '')}`;
}

function readXsecToken(url) {
  const href = String(url || '').trim();
  if (!href) return '';
  try {
    const parsed = new URL(href);
    return String(parsed.searchParams.get('xsec_token') || '').trim();
  } catch {
    return '';
  }
}

function normalizeLinkRow(row) {
  const noteId = String(row?.noteId || '').trim();
  const safeDetailUrl = String(row?.safeDetailUrl || row?.safeUrl || row?.noteUrl || row?.url || '').trim();
  const noteUrl = safeDetailUrl;
  const listUrl = String(row?.listUrl || '').trim();
  const xsecToken = String(row?.xsecToken || readXsecToken(noteUrl)).trim();
  const hasToken = Boolean(xsecToken || (noteUrl && noteUrl.includes('xsec_token=')));
  const nowMs = Date.now();
  const collectedAtMs = Number.isFinite(Number(row?.collectedAtMs)) ? Number(row.collectedAtMs) : nowMs;
  const collectedAtIso = typeof row?.collectedAt === 'string' && row.collectedAt
    ? String(row.collectedAt)
    : new Date(collectedAtMs).toISOString();
  const firstSeenAtMs = Number.isFinite(Number(row?.firstSeenAtMs)) ? Number(row.firstSeenAtMs) : nowMs;
  const lastUpdatedAtMs = Number.isFinite(Number(row?.lastUpdatedAtMs)) ? Number(row.lastUpdatedAtMs) : nowMs;
  return {
    noteId,
    safeDetailUrl: safeDetailUrl || noteUrl,
    noteUrl,
    listUrl,
    xsecToken,
    hasToken,
    title: String(row?.title || '').trim() || null,
    header: row?.header || null,
    author: row?.author || null,
    containerId: row?.containerId || null,
    domIndex: Number.isFinite(Number(row?.domIndex)) ? Number(row.domIndex) : null,
    collectedAtMs,
    collectedAt: collectedAtIso,
    firstSeenAtMs,
    firstSeenAtIso: typeof row?.firstSeenAtIso === 'string' && row.firstSeenAtIso
      ? String(row.firstSeenAtIso)
      : new Date(firstSeenAtMs).toISOString(),
    lastUpdatedAtMs,
    lastUpdatedAtIso: typeof row?.lastUpdatedAtIso === 'string' && row.lastUpdatedAtIso
      ? String(row.lastUpdatedAtIso)
      : new Date(lastUpdatedAtMs).toISOString(),
    ts: new Date().toISOString(),
  };
}

function linkDedupKey(row) {
  const noteId = String(row?.noteId || '').trim();
  if (noteId) return `note:${noteId}`;
  const noteUrl = String(row?.safeDetailUrl || row?.noteUrl || '').trim();
  return noteUrl ? `url:${noteUrl}` : '';
}

export async function appendLikeStateRows({ filePath, rows = [] }) {
  const normalized = Array.isArray(rows)
    ? rows.filter((row) => row && typeof row === 'object')
    : [];
  await appendJsonlRows(filePath, normalized);
  return {
    filePath,
    added: normalized.length,
    rowsAdded: normalized,
  };
}

export async function writeLikeSummary({ filePath, summary = {} }) {
  await writeJson(filePath, summary);
  return { filePath, summary };
}

export async function mergeCommentsJsonl({ filePath, noteId, comments = [] }) {
  const existing = await readJsonlRows(filePath);
  const seen = new Set(
    existing
      .map((row) => commentDedupKey(row))
      .filter((key) => key && !key.endsWith(':')),
  );

  const added = [];
  for (const row of comments) {
    const normalized = normalizeCommentRow(noteId, row);
    if (!normalized.content) continue;
    const key = commentDedupKey(normalized);
    if (!key || key.endsWith(':')) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(normalized);
  }

  await appendJsonlRows(filePath, added);
  return {
    filePath,
    added: added.length,
    existing: existing.length,
    total: existing.length + added.length,
    rowsAdded: added,
  };
}

export async function writeCommentsMd({ filePath, noteId, keyword, detailUrl, comments = [], commentsMeta = {} }) {
  const rows = Array.isArray(comments) ? comments : [];
  const lines = [];
  lines.push(`# 评论（${rows.length}）`);
  lines.push('');
  lines.push(`- Note ID: ${noteId || '未知'}`);
  if (keyword) lines.push(`- 关键词: ${keyword}`);
  if (detailUrl) lines.push(`- 链接: ${detailUrl}`);
  lines.push(`- 采集时间: ${new Date().toISOString()}`);
  if (commentsMeta && typeof commentsMeta === 'object') {
    const headerTotal = Number.isFinite(Number(commentsMeta.expectedCommentsCount))
      ? Number(commentsMeta.expectedCommentsCount)
      : null;
    const reachedEnd = commentsMeta.reachedEnd === true ? '是' : '否';
    lines.push(
      `- 评论统计: 抓取=${rows.length}, header=${headerTotal !== null ? headerTotal : '未知'}（reachedEnd=${reachedEnd}）`,
    );
  }
  lines.push('');

  if (rows.length === 0) {
    lines.push('（无评论）');
  } else {
    for (const c of rows) {
      if (!c) continue;
      const user = String(c.userName || c.author || c.user || '未知用户');
      const uid = String(c.userId || c.authorId || c.user_id || '').trim();
      const ts = String(c.time || c.timestamp || '').trim();
      const text = String(c.content || c.text || '').trim();
      const idPart = uid ? ` (${uid})` : '';
      const tsPart = ts ? ` [${ts}]` : '';
      lines.push(`- **${user}**${idPart}${tsPart}：${text}`);
    }
  }

  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  return { filePath, count: rows.length };
}

export async function writeContentMarkdown({
  filePath,
  imagesDir,
  noteId,
  keyword,
  detailUrl,
  detail = {},
  includeImages = true,
}) {
  const title = String(detail?.title || detail?.header?.title || detail?.note_title || '无标题').trim();
  const authorName = String(detail?.authorName || detail?.author?.name || detail?.header?.author || '').trim();
  const authorId = String(detail?.authorId || detail?.author?.id || '').trim();
  const authorLink = String(detail?.authorLink || detail?.author?.link || '').trim();
  const contentText = String(detail?.contentText || detail?.content || detail?.contentPreview || '').trim();
  const imageUrls = Array.isArray(detail?.imageUrls) ? detail.imageUrls : [];

  let localImages = [];
  if (includeImages && Array.isArray(imageUrls) && imageUrls.length > 0) {
    await ensureDir(imagesDir);
    const MAX_IMAGES_TO_DOWNLOAD = 6;
    let imgIndex = 0;
    for (const url of imageUrls) {
      imgIndex += 1;
      if (imgIndex > MAX_IMAGES_TO_DOWNLOAD) break;
      const rel = await downloadImage(url, imagesDir, imgIndex);
      if (rel) localImages.push(rel.replace(/\\/g, '/'));
    }
  }

  const lines = [];
  lines.push(`# ${title || '无标题'}`);
  lines.push('');
  lines.push(`- Note ID: ${noteId || '未知'}`);
  if (keyword) lines.push(`- 关键词: ${keyword}`);
  if (detailUrl) lines.push(`- 链接: ${detailUrl}`);
  if (authorName) {
    const authorInfo = authorId ? `${authorName} (${authorId})` : authorName;
    lines.push(`- 作者: ${authorInfo}${authorLink ? ` ${authorLink}` : ''}`);
  }
  lines.push(`- 采集时间: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 正文');
  lines.push('');
  lines.push(contentText || '（无正文）');
  lines.push('');

  if (includeImages && localImages.length > 0) {
    lines.push('## 图片');
    lines.push('');
    for (const rel of localImages) {
      lines.push(`![](${rel})`);
    }
    lines.push('');
  }

  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  return { filePath, imageCount: localImages.length };
}

export async function mergeLinksJsonl({ filePath, links = [] }) {
  const existing = await readJsonlRows(filePath);
  const seen = new Set(existing.map((row) => linkDedupKey(row)).filter(Boolean));

  const added = [];
  for (const row of links) {
    const normalized = normalizeLinkRow(row);
    if (!normalized.noteUrl || !normalized.hasToken) continue;
    const key = linkDedupKey(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push(normalized);
  }

  await appendJsonlRows(filePath, added);
  return {
    filePath,
    added: added.length,
    existing: existing.length,
    total: existing.length + added.length,
    rowsAdded: added,
  };
}

export function makeLikeSignature({ noteId, userId = '', userName = '', text = '' }) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return [
    String(noteId || '').trim(),
    String(userId || '').trim(),
    String(userName || '').trim(),
    normalizedText,
  ].join('|');
}

export async function loadLikedSignatures(filePath) {
  const rows = await readJsonlRows(filePath);
  const out = new Set();
  for (const row of rows) {
    const signature = String(row?.signature || '').trim();
    if (signature) out.add(signature);
  }
  return out;
}

export async function appendLikedSignature(filePath, signature, extra = {}) {
  const value = String(signature || '').trim();
  if (!value) return;
  await appendJsonlRows(filePath, [{
    ts: new Date().toISOString(),
    signature: value,
    ...extra,
  }]);
}

export async function savePngBase64(filePath, base64Data) {
  const payload = String(base64Data || '').trim();
  if (!payload) return null;
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, Buffer.from(payload, 'base64'));
  return filePath;
}

export async function writeJsonFile(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}
