import { sleep, parseDevtoolsJson, devtoolsEval } from './common.mjs';

export async function readDetailState(profileId) {
  const script = `(() => {
    const href = String(location.href || '');
    let postIdFromUrl = null;
    try {
      const parts = href.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && !last.includes('?') || last) postIdFromUrl = last.split('?')[0].split('#')[0];
    } catch {}

    const title = String(document.title || '');
    const isDetailPage = title.includes('微博正文') || /weibo\\.com\\/\\d+\\/[A-Za-z0-9]+/.test(href);

    const contentEl = document.querySelector('[class*="detail_wbtext"]')
      || document.querySelector('.wbpro-feed-content')
      || document.querySelector('[class*="wbtext"]');
    const hasContent = Boolean(contentEl && contentEl.textContent.trim().length > 0);

    const images = document.querySelectorAll('img.photo-list-img');
    const videos = document.querySelectorAll('video');
    const links = contentEl ? contentEl.querySelectorAll('a[href]') : [];

    const commentPanel = document.querySelector('.woo-panel-main.woo-panel-bottom');
    const hasCommentPanel = Boolean(commentPanel);

    return {
      href,
      postIdFromUrl,
      isDetailPage,
      title,
      hasContent,
      imageCount: images.length,
      videoCount: videos.length,
      linkCount: links.length,
      hasCommentPanel,
    };
  })()`;
  return devtoolsEval(profileId, script);
}

export async function readDetailSnapshot(profileId) {
  const script = `(() => {
    const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim();
    const href = String(location.href || '');
    let postIdFromUrl = null;
    try {
      const parts = href.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) postIdFromUrl = last.split('?')[0].split('#')[0];
    } catch {}

    const contentEl = document.querySelector('[class*="detail_wbtext"]')
      || document.querySelector('.wbpro-feed-content')
      || document.querySelector('[class*="wbtext"]');
    const contentText = contentEl ? normalize(contentEl.textContent) : '';

    let images = Array.from(document.querySelectorAll('img.photo-list-img'))
      .map(img => img.src || img.getAttribute('data-src') || '')
      .filter(Boolean);
    if (images.length === 0) {
      images = Array.from(document.querySelectorAll('img.woo-picture-img'))
        .map(img => img.src || img.getAttribute('data-src') || '')
        .filter(src => src && !src.includes('avatar') && !src.includes('icon'));
    }
    const videos = Array.from(document.querySelectorAll('video'))
      .map(v => v.src || v.querySelector('source')?.src || '')
      .filter(Boolean);
    const links = contentEl
      ? Array.from(contentEl.querySelectorAll('a[href]')).map(a => ({
          text: normalize(a.textContent),
          href: a.href,
        })).filter(l => l.href && !l.href.startsWith('javascript:'))
      : [];

    const authorEl = document.querySelector('a.name') || document.querySelector('[class*="author"]');
    const authorName = authorEl ? normalize(authorEl.textContent) : '';

    // P2-1: Extract publish time from detail page
    const publishedDateEl = document.querySelector('[class*="detail_from"]')
      || document.querySelector('[class*="from_"]')
      || document.querySelector('[class*="head_"] [class*="time"]')
      || document.querySelector('[class*="date_"]')
      || document.querySelector('[class*="time_"]');
    const publishedDate = publishedDateEl ? normalize(publishedDateEl.textContent) : '';

    // P2-2: Detect repost/quote content
    const quoteEl = document.querySelector('[class*="quote"]')
      || document.querySelector('[class*="forward"]')
      || document.querySelector('[class*="repost_"]')
      || document.querySelector('[class*="retweet"]');
    let quotedContent = '';
    let quotedAuthor = '';
    if (quoteEl) {
      quotedContent = normalize(quoteEl.textContent);
      const qAuthor = quoteEl.querySelector('a.name') || quoteEl.querySelector('[class*="author"]');
      quotedAuthor = qAuthor ? normalize(qAuthor.textContent) : '';
    }

    return {
      href,
      postIdFromUrl,
      authorName,
      contentText,
      publishedDate,
      quotedContent,
      quotedAuthor,
      images,
      videos,
      links,
      imageCount: images.length,
      videoCount: videos.length,
      linkCount: links.length,
      capturedAt: new Date().toISOString(),
    };
  })()`;
  return devtoolsEval(profileId, script);
}

export async function waitForDetailPage(profileId, timeoutMs = 15000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readDetailState(profileId).catch(() => null);
    if (state?.isDetailPage && state?.hasContent) {
      return { ok: true, elapsed: Date.now() - start, state };
    }
    await sleep(Math.min(intervalMs, timeoutMs - (Date.now() - start)));
  }
  return { ok: false, elapsed: Date.now() - start };
}

export async function downloadImage(url, destDir, index) {
  if (!url) return null;
  let normalized = String(url).trim();
  if (!normalized || normalized.startsWith('data:') || normalized.startsWith('blob:')) return null;
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  if (!/^https?:/i.test(normalized)) return null;

  try {
    const res = await fetch(normalized);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2048) return null;
    const ext = normalized.match(/\.(jpg|jpeg|png|gif|webp|bmp)/i)?.[1] || 'jpg';
    const filename = `${String(index).padStart(2, '0')}.${ext}`;
    const { default: fs } = await import('node:fs/promises');
    const path = await import('node:path');
    const filepath = path.join(destDir, filename);
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(filepath, buf);
    return path.join('images', filename);
  } catch {
    return null;
  }
}

export async function downloadVideo(url, destDir, index) {
  if (!url) return null;
  const normalized = String(url).trim();
  if (!normalized || !/^https?:/i.test(normalized)) return null;

  try {
    const res = await fetch(normalized);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10240) return null;
    const ext = normalized.match(/\.(mp4|webm|mov|avi)/i)?.[1] || 'mp4';
    const filename = `${String(index).padStart(2, '0')}.${ext}`;
    const { default: fs } = await import('node:fs/promises');
    const path = await import('node:path');
    const filepath = path.join(destDir, filename);
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(filepath, buf);
    return path.join('videos', filename);
  } catch {
    return null;
  }
}
