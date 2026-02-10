export function parseFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return defaultValue;
}

export function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildOperationPlan(options) {
  const {
    doHomepage = false,
    doImages = false,
    doComments = true,
    doLikes = false,
    doReply = false,
  } = options || {};

  const plan = [];
  if (doHomepage || doImages) plan.push('detail_harvest');

  // 点赞与评论同屏循环时，避免先 comments_harvest 再 comment_like 的双阶段重复扫描。
  const needsStandaloneCommentsHarvest = doReply || (doComments && !doLikes);
  if (needsStandaloneCommentsHarvest) plan.push('comments_harvest');

  if (doReply) plan.push('comment_match_gate');
  if (doLikes) plan.push('comment_like');
  if (doReply) plan.push('comment_reply');
  plan.push('next_note');
  return plan;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function keywordHitCount(text, keywords) {
  let count = 0;
  const hits = [];
  const n = normalizeText(text);
  for (const kw of keywords) {
    const token = normalizeText(kw);
    if (!token) continue;
    if (n.includes(token)) {
      count += 1;
      hits.push(kw);
    }
  }
  return { count, hits };
}

export function commentMatches(text, keywords, mode = 'any', minHits = 1) {
  const { count, hits } = keywordHitCount(text, keywords);
  if (keywords.length === 0) return { ok: false, hits: [] };

  if (mode === 'all') {
    return { ok: count >= keywords.length, hits };
  }
  if (mode === 'atLeast') {
    const need = Math.max(1, Number(minHits) || 1);
    return { ok: count >= need, hits };
  }
  return { ok: count >= 1, hits };
}

export function matchHarvestedComments(comments, keywords, mode = 'any', minHits = 1) {
  const rows = Array.isArray(comments) ? comments : [];
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const content = String(row.content || row.text || '');
    const m = commentMatches(content, keywords, mode, minHits);
    if (!m.ok) continue;
    out.push({
      index: i,
      userId: String(row.userId || row.user_id || ''),
      userName: String(row.userName || row.user_name || ''),
      content,
      hits: m.hits,
    });
  }
  return out;
}
