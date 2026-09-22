// Pure Weibo payload projection. No browser access, no orchestration.

export function stripHtml(value) {
  const text = String(value || '');
  let out = '';
  let inTag = false;
  for (const char of text) {
    if (char === '<') inTag = true;
    else if (char === '>') inTag = false;
    else if (!inTag) out += char;
  }
  return out.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function postIdFromUrl(url) {
  const text = String(url || '').trim();
  if (!text) return null;
  const mobile = text.match(/m\.weibo\.cn\/detail\/([A-Za-z0-9]+)/);
  if (mobile) return mobile[1];
  const desktop = text.match(/weibo\.com\/(?:\d+|u\/\d+)\/([A-Za-z0-9]+)/);
  if (desktop) return desktop[1];
  const parts = text.split('?')[0].split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

export function normalizePost(raw = {}, { userId = null, collectedAt = new Date().toISOString() } = {}) {
  const url = String(raw.url || '').trim();
  const id = String(raw.id || raw.mid || postIdFromUrl(url) || '').trim() || null;
  if (!id && !url) return null;
  return {
    id,
    mid: id,
    url,
    authorId: raw.authorId || userId || null,
    authorName: raw.authorName || raw.author || null,
    content: raw.content || raw.text || null,
    repostContent: raw.repostContent || null,
    links: Array.isArray(raw.links) ? raw.links : [],
    publishedDate: raw.publishedDate || raw.timeText || null,
    collectedAt,
    userId,
  };
}

export function extractMediaFromStatus(data = {}) {
  const node = data.retweeted_status || data;
  const images = (node.pics || []).map((pic) => ({
    id: pic.pid || null,
    url: pic.large?.url || pic.url || null,
  }));
  const page = node.page_info || {};
  const media = page.media_info || {};
  const hasVideo = page.object_type === 'video' || Boolean(media.stream_url);
  return {
    images,
    video: hasVideo
      ? {
          type: page.object_type || 'video',
          streamUrl: media.stream_url || null,
          streamUrlHd: media.stream_url_hd || null,
          duration: media.duration || null,
          pageUrl: page.page_url || null,
        }
      : null,
  };
}

export function normalizeStatus(data = {}, mid = null) {
  const user = data.user || {};
  const media = extractMediaFromStatus(data);
  return {
    mid: String(data.id || data.mid || mid || ''),
    url: `https://m.weibo.cn/detail/${data.id || mid || ''}`,
    createdAt: data.created_at || null,
    content: stripHtml(data.text || ''),
    source: data.source || null,
    region: data.region_name || null,
    counts: {
      comments: data.comments_count ?? 0,
      reposts: data.reposts_count ?? 0,
      likes: data.attitudes_count ?? 0,
    },
    author: {
      id: user.id || null,
      name: user.screen_name || null,
    },
    images: media.images,
    video: media.video,
    repost: data.retweeted_status
      ? {
          mid: String(data.retweeted_status.id || ''),
          content: stripHtml(data.retweeted_status.text || ''),
          author: {
            id: data.retweeted_status.user?.id || null,
            name: data.retweeted_status.user?.screen_name || null,
          },
        }
      : null,
  };
}

export function normalizeCommentRow(row = {}) {
  const user = row.user || {};
  return {
    id: String(row.id || ''),
    text: stripHtml(row.text || ''),
    timestamp: row.created_at || null,
    likes: row.like_count ?? row.likes ?? 0,
    source: row.source || null,
    floor: row.floor_number ?? row.floor ?? null,
    user: {
      id: user.id ?? row.user_id ?? null,
      name: user.screen_name ?? row.user_name ?? null,
    },
    replyCount: row.total_number ?? row.reply_count ?? 0,
    replies: [],
  };
}

export function normalizeReplyRow(row = {}) {
  const user = row.user || {};
  return {
    id: String(row.id || ''),
    text: stripHtml(row.text || ''),
    timestamp: row.created_at || null,
    likes: row.like_count ?? row.likes ?? 0,
    user: {
      id: user.id ?? row.user_id ?? null,
      name: user.screen_name ?? row.user_name ?? null,
    },
    replyTo: row.reply_original_text || row.reply_to || null,
  };
}

export function dedupeBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
