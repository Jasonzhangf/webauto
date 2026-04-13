/**
 * XHS Producer Runner - Always-On 模式：热搜榜扫描 + 帖子入队
 */
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BROWSER_SERVICE_URL = process.env.BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';
const HEALTH_CHECK_URL = BROWSER_SERVICE_URL + '/health';
const SEARCH_GATE_URL = process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790';

// 使用 /command API 调用 browser-service
async function callAPI(action, params = {}) {
  const res = await fetch(`${BROWSER_SERVICE_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args: params }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json();
  if (!body.ok) {
    throw new Error(`${action}: ${body.error || 'unknown error'}`);
  }
  return body;
}

// 导航到 URL
async function gotoUrl({ profileId, url }) {
  return callAPI('goto', { profileId, url });
}

// 执行 JS
async function evaluate({ profileId, script }) {
  const result = await callAPI('evaluate', { profileId, script });
  return result.result;
}

// 健康检查 + 自动恢复
async function healthCheckAndRecover(profileId) {
  try {
    const res = await fetch(HEALTH_CHECK_URL);
    const health = await res.json();
    if (health.ok) return { ok: true };
  } catch {}

  console.log('[producer] health check failed, restarting camo...');
  execSync(`camo start ${profileId} --url https://www.xiaohongshu.com --visible`, { encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
  await sleep(10000);

  try {
    const res2 = await fetch(HEALTH_CHECK_URL);
    const health2 = await res2.json();
    if (health2.ok) return { ok: true, recovered: true };
  } catch {}

  return { ok: false };
}

function loadExistingNoteIds(outputDir) {
  const noteIds = new Set();
  const postsPath = path.join(outputDir, 'posts.jsonl');
  if (fs.existsSync(postsPath)) {
    try {
      const lines = fs.readFileSync(postsPath, 'utf-8').trim().split('\n');
      for (const line of lines) {
        const row = JSON.parse(line);
        if (row.noteId) noteIds.add(row.noteId);
      }
    } catch {}
  }
  return noteIds;
}

/**
 * 从小红书首页提取热搜关键词（已验证有效的方法）
 */
async function fetchHotSearchKeywords({ profileId, maxKeywords = 10 }) {
  console.log('[producer] fetching hot search keywords...');

  // 导航到小红书首页
  await gotoUrl({ profileId, url: 'https://www.xiaohongshu.com' });
  await sleep(3000);

  // 提取热搜关键词 - 使用已验证有效的选择器
  const script = `(() => {
    const hot = document.querySelector('[class*=hot-search], [class*=trending], [class*=hot]');
    if (!hot) return { found: false };
    const items = hot.querySelectorAll('span, a, div, li');
    const keywords = [];
    items.forEach(el => {
      const t = el.textContent?.trim();
      if (t && t.length > 0 && t.length < 30) {
        keywords.push(t);
      }
    });
    return { found: true, keywords: [...new Set(keywords)].slice(0, ${maxKeywords}) };
  })()`;

  const result = await evaluate({ profileId, script });
  console.log('[producer] hot search result:', JSON.stringify(result));

  if (result?.found && Array.isArray(result.keywords)) {
    return result.keywords;
  }

  return [];
}

/**
 * 搜索并提取帖子链接
 */
async function searchAndCollectLinks({ profileId, keyword, maxLinks }) {
  console.log(`[producer] searching for: ${keyword}`);

  const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`;
  await gotoUrl({ profileId, url: searchUrl });
  await sleep(5000);

  const script = `(() => {
    const items = document.querySelectorAll('.note-item a[href*="/explore/"], .search-result-item a[href*="/explore/"], a[href*="/explore/"]');
    const links = [];
    for (const item of items) {
      const href = item.getAttribute('href');
      if (href && !href.includes('source=')) {
        const noteId = href.split('/').pop();
        links.push({ noteId, url: 'https://www.xiaohongshu.com' + href });
      }
    }
    return { links, count: links.length };
  })()`;

  const result = await evaluate({ profileId, script });
  console.log(`[producer] extracted ${result?.count || 0} links`);

  return (result?.links || []).slice(0, maxLinks);
}

/**
 * 将链接写入队列文件
 */
async function enqueueLinks({ links, keyword, env }) {
  const outputDir = path.join(process.env.HOME || '', '.webauto', 'download', 'xiaohongshu', env, keyword);
  fs.mkdirSync(outputDir, { recursive: true });
  const linksPath = path.join(outputDir, 'links.jsonl');

  // Server-side dedup via SearchGate
  const checkResult = await fetch(`${SEARCH_GATE_URL}/detail-links/check-seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ noteIds: links.map(l => l.noteId), key: keyword }),
  }).then(r => r.json()).catch(() => ({ ok: false, results: [] }));

  // Filter out already-seen links
  const unseenLinks = checkResult.ok
    ? links.filter(l => {
        const r = checkResult.results?.find(r => r.noteId === l.noteId);
        return !r?.seen;
      })
    : links; // Fallback to all links if check fails

  const existing = new Set();
  if (fs.existsSync(linksPath)) {
    const lines = fs.readFileSync(linksPath, 'utf-8').trim().split('\n');
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (row.noteId) existing.add(row.noteId);
      } catch {}
    }
  }

  let added = 0;
  for (const link of unseenLinks) {
    if (existing.has(link.noteId)) continue;
    fs.appendFileSync(linksPath, JSON.stringify({ ...link, collectedAt: new Date().toISOString() }) + '\n');
    // Register to server-side seen set
    await fetch(`${SEARCH_GATE_URL}/detail-links/record-seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: link.noteId, source: 'producer', key: keyword }),
    }).catch(() => {});
    
    added++;
  }

  return { added };
}

/**
 * 主入口
 */
export async function runProducerTask(args) {
  const env = String(args.env || 'debug').trim();
  const maxLinksPerScan = Math.max(1, Number(args['max-links-per-scan'] || 20));
  const profileId = String(args.profile || 'xhs-qa-1').trim();
  const scanIntervalMs = 30 * 60_000; // 30 分钟

  console.log(`[producer] profile=${profileId} env=${env}`);
  console.log(`[producer] mode=always-on scan=${scanIntervalMs}ms`);
  console.log(`[producer] hot-search=enabled`);

  let totalScanned = 0;
  let totalAdded = 0;
  let totalKeywords = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  // Wait for browser
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(HEALTH_CHECK_URL);
      const health = await res.json();
      if (health.ok) {
        console.log('[producer] browser ready');
        break;
      }
    } catch {}
    await sleep(2000);
  }

  while (true) {
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      return { ok: true, scanned: totalScanned, added: totalAdded, keywords: totalKeywords };
    }

    try {
      // Step 1: 从热搜榜获取关键词
      const hotKeywords = await fetchHotSearchKeywords({ profileId, maxKeywords: 10 });
      console.log(`[producer] hot keywords: ${JSON.stringify(hotKeywords)}`);
      totalKeywords += hotKeywords.length;

      if (hotKeywords.length === 0) {
        console.log('[producer] no hot keywords found, waiting...');
        await sleep(scanIntervalMs);
        continue;
      }

      // Step 2: 对每个热搜关键词进行搜索采集
      for (const keyword of hotKeywords) {
        const outputDir = path.join(process.env.HOME || '', '.webauto', 'download', 'xiaohongshu', env, keyword);
        const existingNoteIds = loadExistingNoteIds(outputDir);
        console.log(`[producer] keyword="${keyword}" existing: ${existingNoteIds.size}`);

        const newLinks = await searchAndCollectLinks({ profileId, keyword, maxLinks: maxLinksPerScan });
        console.log(`[producer] keyword="${keyword}" found: ${newLinks.length}`);

        const deduped = newLinks.filter(l => !existingNoteIds.has(l.noteId));
        console.log(`[producer] keyword="${keyword}" new: ${deduped.length}`);

        const result = await enqueueLinks({ links: deduped, keyword, env });
        totalAdded += result.added;
        console.log(`[producer] keyword="${keyword}" added: ${result.added}`);
      }

      totalScanned++;
      consecutiveErrors = 0;

      console.log(`[producer] scan complete, waiting ${scanIntervalMs}ms...`);
      await sleep(scanIntervalMs);

    } catch (err) {
      console.error(`[producer] error: ${err.message}`);
      consecutiveErrors++;

      if (consecutiveErrors >= maxConsecutiveErrors) {
        const recover = await healthCheckAndRecover(profileId);
        if (!recover.ok) {
          return { ok: false, reason: 'recovery_failed' };
        }
        consecutiveErrors = 0;
      }

      await sleep(scanIntervalMs);
    }
  }
}

// Main entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      parsed[key] = value;
      if (value !== 'true') i++;
    }
  }
  runProducerTask(parsed)
    .then(r => { console.log('[producer] exit:', r); process.exit(r.ok ? 0 : 1); })
    .catch(e => { console.error('[producer] fatal:', e); process.exit(1); });
}
