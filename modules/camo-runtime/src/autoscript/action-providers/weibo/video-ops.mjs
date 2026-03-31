function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const BROWSER_SERVICE_URL = process.env.CAMO_BROWSER_HTTP_PROTO
  ? `${process.env.CAMO_BROWSER_HTTP_PROTO}://${process.env.CAMO_BROWSER_HTTP_HOST || '127.0.0.1'}:${process.env.CAMO_BROWSER_HTTP_PORT || 7704}`
  : 'http://127.0.0.1:7704';

async function callAPI(action, payload = {}, timeoutMs = 20000) {
  const r = await fetch(`${BROWSER_SERVICE_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args: payload }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return r.json();
}

/**
 * Detect platform from URL.
 */
export function detectPlatform(url) {
  const normalized = String(url || '').trim().toLowerCase();
  if (normalized.includes('xiaohongshu.com') || normalized.includes('xhslink.com') || normalized.includes('xhs.cn')) {
    return { platform: 'xhs', resolvedUrl: url };
  }
  if (normalized.includes('weibo.com') || normalized.includes('weibo.cn') || normalized.includes('t.cn')) {
    return { platform: 'weibo', resolvedUrl: url };
  }
  if (normalized.includes('bilibili.com') || normalized.includes('b23.tv')) {
    return { platform: 'bilibili', resolvedUrl: url };
  }
  return { platform: 'unknown', resolvedUrl: url };
}

/**
 * Extract video from current browser page (no navigation).
 */
async function extractVideoFromCurrentPage(profileId) {
  const script = '(() => { var n = function(v) { return String(v || "").replace(/[ \\t\\n]+/g, " ").trim(); }; var videos = document.querySelectorAll("video"); var srcs = []; for (var i = 0; i < videos.length; i++) { var v = videos[i]; var s = v.src || v.currentSrc || ""; if (s) srcs.push(s); var source = v.querySelector("source"); if (source && source.src) srcs.push(source.src); } var authorEl = document.querySelector("a.name") || document.querySelector("[class*=author]"); var author = authorEl ? n(authorEl.textContent) : ""; var contentEl = document.querySelector("[class*=detail_wbtext]") || document.querySelector("[class*=wbtext]"); var title = contentEl ? n(contentEl.textContent).slice(0, 200) : document.title; return { ok: true, videoUrls: srcs, videoCount: videos.length, author: author, title: title, pageUrl: location.href }; })()';

  const resp = await callAPI('evaluate', { profileId, script }, 15000);

  if (!resp?.ok || !resp.result?.videoUrls?.length) {
    return {
      ok: false,
      error: 'NO_VIDEO_FOUND',
      message: 'No video found on this page',
      pageUrl: resp?.result?.pageUrl || '',
      author: resp?.result?.author || null,
    };
  }

  const bestUrl = resp.result.videoUrls.find(u => u.includes('.mp4')) || resp.result.videoUrls[0];

  return {
    ok: true,
    resolvedUrl: resp.result.pageUrl || '',
    videoUrl: bestUrl,
    videoUrls: resp.result.videoUrls,
    author: resp.result.author || null,
    title: resp.result.title || null,
  };
}

/**
 * Navigate browser to URL (async, non-blocking) and extract video.
 */
async function navigateAndExtractVideo(profileId, url) {
  const gotoResp = await callAPI('goto', { profileId, url }, 20000);
  if (!gotoResp?.ok) {
    return { ok: false, error: 'GOTO_FAILED', stderr: JSON.stringify(gotoResp) };
  }

  await sleep(5000);
  return extractVideoFromCurrentPage(profileId);
}

/**
 * Extract video URL from a Weibo page.
 */
export async function extractWeiboVideoUrl(profileId, url) {
  const result = await navigateAndExtractVideo(profileId, url);
  if (!result.ok) return result;
  result.platform = 'weibo';
  return result;
}

/**
 * Extract video URL from a Xiaohongshu note page.
 */
export async function extractXhsVideoUrl(profileId, url) {
  const result = await navigateAndExtractVideo(profileId, url);
  if (!result.ok) return result;
  result.platform = 'xhs';
  return result;
}

/**
 * Main entry: resolve a URL and extract video.
 * Single navigation for short URLs — browser follows redirects automatically.
 */
export async function extractVideoUrl(profileId, url) {
  const inputUrl = String(url || '').trim();
  if (!inputUrl) {
    return { ok: false, error: 'URL_REQUIRED', message: 'url is required' };
  }

  const detected = detectPlatform(inputUrl);

  if (detected.platform === 'weibo') {
    return extractWeiboVideoUrl(profileId, inputUrl);
  }

  if (detected.platform === 'xhs') {
    return extractXhsVideoUrl(profileId, inputUrl);
  }

  return {
    ok: false,
    error: 'UNSUPPORTED_PLATFORM',
    message: 'Cannot extract video from platform: ' + detected.platform,
    resolvedUrl: inputUrl,
    platform: detected.platform,
  };
}
