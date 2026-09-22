// Video URL resolution. Uses the Camo adapter directly so this command does
// not depend on the old camo-runtime provider.

function detectPlatform(url) {
  let host = '';
  try {
    host = new URL(String(url || '')).hostname;
  } catch {
    host = String(url || '');
  }
  if (/(^|\.)(weibo\.com|weibo\.cn|t\.cn)$/i.test(host)) return 'weibo';
  if (/(^|\.)(xiaohongshu\.com|xhslink\.com|xhs\.cn)$/i.test(host)) return 'xhs';
  return 'unknown';
}

const VIDEO_SCRIPT = `(() => {
  const urls = [];
  for (const video of document.querySelectorAll('video')) {
    const value = video.src || video.currentSrc || '';
    if (value) urls.push(value);
    const source = video.querySelector('source');
    if (source?.src) urls.push(source.src);
  }
  const authorEl = document.querySelector('a.name') || document.querySelector('[class*=author]');
  const contentEl = document.querySelector('[class*=detail_wbtext]') || document.querySelector('[class*=wbtext]');
  return {
    videoUrls: [...new Set(urls)],
    author: authorEl?.textContent?.trim() || null,
    title: contentEl?.textContent?.trim().slice(0, 200) || document.title,
    pageUrl: location.href,
  };
})()`;

export async function resolveVideo({ adapter, profileId, url } = {}) {
  const inputUrl = String(url || '').trim();
  if (!inputUrl) throw new Error('resolveVideo requires url');
  await adapter.start({ profileId, url: inputUrl, headless: false });
  const data = await adapter.evaluate({ profileId, script: VIDEO_SCRIPT });
  const videoUrls = Array.isArray(data?.videoUrls) ? data.videoUrls : [];
  if (videoUrls.length === 0) {
    throw new Error(`no video found at ${data?.pageUrl || inputUrl}`);
  }
  const resolvedUrl = data?.pageUrl || inputUrl;
  const platform = detectPlatform(resolvedUrl);
  if (platform === 'unknown') {
    const error = new Error(`UNSUPPORTED_PLATFORM: ${resolvedUrl}`);
    error.code = 'UNSUPPORTED_PLATFORM';
    throw error;
  }
  return {
    ok: true,
    platform,
    resolvedUrl,
    videoUrl: videoUrls.find((value) => value.includes('.mp4')) || videoUrls[0],
    videoUrls,
    author: data?.author || null,
    title: data?.title || null,
  };
}
