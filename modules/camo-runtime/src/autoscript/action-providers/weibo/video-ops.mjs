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

const WEIBO_HOST_RE = /(^|\.)(weibo\.com|weibo\.cn|t\.cn)$/i;
const XHS_HOST_RE = /(^|\.)(xiaohongshu\.com|xhslink\.com|xhs\.cn)$/i;

/**
 * Detect platform from URL hostname.
 * Returns { platform: 'weibo'|'xhs'|'bilibili'|'unknown', host, fullUrl }
 */
export function detectPlatform(url) {
  const normalized = String(url || '').trim();
  let hostname = '';
  try { hostname = new URL(normalized.startsWith('http') ? normalized : 'https://' + normalized).hostname; } catch { hostname = normalized; }
  if (WEIBO_HOST_RE.test(hostname)) return { platform: 'weibo', host: hostname, fullUrl: normalized };
  if (XHS_HOST_RE.test(hostname)) return { platform: 'xhs', host: hostname, fullUrl: normalized };
  if (/bilibili\.com|b23\.tv/i.test(hostname)) return { platform: 'bilibili', host: hostname, fullUrl: normalized };
  return { platform: 'unknown', host: hostname, fullUrl: normalized };
}

/**
 * Navigate browser to URL, wait for redirects to settle, then read the actual page URL.
 * Returns { ok, finalUrl, platform } where finalUrl is where the browser actually landed.
 */
async function navigateAndDetect(profileId, url) {
  const gotoResp = await callAPI('goto', { profileId, url }, 20000);
  if (!gotoResp?.ok) {
    return { ok: false, error: 'GOTO_FAILED', detail: JSON.stringify(gotoResp) };
  }
  await sleep(5000);

  // Read actual URL from browser
  const urlResp = await callAPI('evaluate', { profileId, script: '(() => location.href)()' }, 5000);
  const finalUrl = urlResp?.result || url;
  const platform = detectPlatform(finalUrl).platform;

  return { ok: true, finalUrl, platform };
}

/**
 * Extract video from current browser page.
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
 * Main entry: navigate → detect platform → extract video.
 * Works with any URL: short links, direct links, unknown links.
 */
export async function extractVideoUrl(profileId, url) {
  const inputUrl = String(url || '').trim();
  if (!inputUrl) {
    return { ok: false, error: 'URL_REQUIRED', message: 'url is required' };
  }

  // Step 1: Navigate browser to URL (handles redirects automatically)
  const nav = await navigateAndDetect(profileId, inputUrl);
  if (!nav.ok) {
    return { ok: false, error: nav.error, message: 'Navigation failed', detail: nav.detail };
  }

  // Step 2: Check actual landing URL platform
  if (nav.platform !== 'weibo' && nav.platform !== 'xhs') {
    return {
      ok: false,
      error: 'UNSUPPORTED_PLATFORM',
      message: `Unsupported platform: ${nav.finalUrl}`,
      resolvedUrl: nav.finalUrl,
      detectedPlatform: nav.platform,
    };
  }

  // Step 3: Extract video from page
  const result = await extractVideoFromCurrentPage(profileId);
  result.platform = nav.platform;
  result.resolvedUrl = nav.finalUrl;
  return result;
}
