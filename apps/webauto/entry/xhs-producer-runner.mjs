/**
 * XHS Producer Runner - Always-On 模式的链接采集端
 */

import path from 'node:path';
import fs from 'node:fs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BROWSER_SERVICE_URL = process.env.BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';

async function callAPI(action, params = {}) {
  const url = `${BROWSER_SERVICE_URL}/${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`[callAPI] parse error for ${action}: ${text.slice(0, 200)}`);
    throw new Error(`JSON parse error: ${e.message}`);
  }
}

const PRODUCER_SCAN_INTERVAL_MS = 30 * 60_000;
const PRODUCER_MIN_QUEUE_DEPTH = 10;
const PRODUCER_MAX_LINKS_PER_SCAN = 20;
const PRODUCER_MAX_CONSECUTIVE_ERRORS = 3;
const HEALTH_CHECK_URL = 'http://127.0.0.1:7704/health';
const HEALTH_CHECK_INTERVAL_MS = 300_000;

async function healthCheckAndRecover(profileId) {
  console.log(`[producer] running health check...`);
  try {
    const res = await fetch(HEALTH_CHECK_URL);
    const health = await res.json();
    if (health.ok) {
      console.log(`[producer] health check passed`);
      return { ok: true };
    }
  } catch (e) {
    console.log(`[producer] health check fetch failed: ${e.message}`);
  }

  console.log(`[producer] health check failed, attempting auto-recovery...`);
  const { execSync } = await import('node:child_process');
  const cmd = `camo start ${profileId} --url https://www.xiaohongshu.com --visible`;
  
  try {
    console.log(`[producer] running: ${cmd}`);
    execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    console.log(`[producer] camo started, waiting 10s...`);
    await sleep(10000);
    const res2 = await fetch(HEALTH_CHECK_URL);
    const health2 = await res2.json();
    if (health2.ok) {
      console.log(`[producer] ✅ auto-recovery successful!`);
      return { ok: true, recovered: true };
    }
  } catch (err) {
    console.error(`[producer] recovery failed: ${err.message}`);
  }

  console.log(`[producer] ❌ auto-recovery failed`);
  return { ok: false, reason: 'health_check_failed' };
}

function isSessionError(errMsg) {
  return ['session', 'profile', 'browser', 'cdp', 'disconnected'].some(k => errMsg.toLowerCase().includes(k));
}

function loadExistingNoteIds(outputDir) {
  const noteIds = new Set();
  const postsPath = path.join(outputDir, 'posts.jsonl');
  if (fs.existsSync(postsPath)) {
    try {
      const content = fs.readFileSync(postsPath, 'utf-8');
      for (const line of content.trim().split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        if (row.noteId) noteIds.add(row.noteId);
      }
    } catch {}
  }
  return noteIds;
}

async function searchAndCollectLinks({ profileId, keyword, maxLinks }) {
  const allLinks = [];
  console.log(`[producer] searching for: ${keyword}`);
  
  // Step 1: 确保浏览器在首页
  console.log(`[producer] navigating to home...`);
  const gotoResult = await callAPI('goto', {
    profileId,
    url: 'https://www.xiaohongshu.com',
  });
  console.log(`[producer] goto result: ${JSON.stringify(gotoResult)}`);
  await sleep(5000);

  // Step 2: 搜索
  const searchScript = `(function(){
    const input = document.querySelector('#search-input, input.search-input');
    if (!input) return {error: 'no search input'};
    input.value = '${keyword.replace(/'/g, "\\'")}';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));
    return {ok: true};
  })()`;

  console.log(`[producer] executing search...`);
  const searchResult = await callAPI('evaluate', { profileId, script: searchScript });
  console.log(`[producer] search result: ${JSON.stringify(searchResult)}`);
  
  if (searchResult?.error) {
    console.error(`[producer] search failed: ${searchResult.error}`);
    return [];
  }

  await sleep(8000);

  // Step 3: 提取链接
  const extractScript = `(function(){
    const items = document.querySelectorAll('.note-item a[href*="/explore/"], .search-result-item a[href*="/explore/"]');
    const links = [];
    for (const item of items) {
      const href = item.getAttribute('href');
      if (href && !href.includes('source=')) {
        links.push({noteId: href.split('/').pop(), url: 'https://www.xiaohongshu.com'+href});
      }
    }
    return {links, count: links.length};
  })()`;

  console.log(`[producer] extracting links...`);
  const extractResult = await callAPI('evaluate', { profileId, script: extractScript });
  console.log(`[producer] extract result: ${JSON.stringify(extractResult)}`);

  if (extractResult?.links && Array.isArray(extractResult.links)) {
    allLinks.push(...extractResult.links.slice(0, maxLinks));
  }

  console.log(`[producer] extracted ${allLinks.length} links`);
  return allLinks;
}

async function getClaimedLinks(keyword, env) {
  const linksPath = path.join(process.env.HOME || '', '.webauto', 'download', 'xiaohongshu', env, keyword, 'links.jsonl');
  const claimed = new Set();
  if (fs.existsSync(linksPath)) {
    try {
      const content = fs.readFileSync(linksPath, 'utf-8');
      for (const line of content.trim().split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        if (row.noteId) claimed.add(row.noteId);
      }
    } catch {}
  }
  return claimed;
}

async function enqueueLinks({ links, keyword, env }) {
  const outputDir = path.join(process.env.HOME || '', '.webauto', 'download', 'xiaohongshu', env, keyword);
  fs.mkdirSync(outputDir, { recursive: true });
  const linksPath = path.join(outputDir, 'links.jsonl');
  const claimed = await getClaimedLinks(keyword, env);
  let added = 0;
  for (const link of links) {
    if (claimed.has(link.noteId)) continue;
    fs.appendFileSync(linksPath, JSON.stringify({...link, collectedAt: new Date().toISOString()}) + '\n');
    added++;
  }
  return { added };
}

export async function runProducerTask(args = {}) {
  const profileId = String(args.profile || 'xhs-qa-1').trim();
  const keyword = String(args.keyword || args.k || '').trim();
  const env = String(args.env || 'debug').trim();
  const maxLinksPerScan = Math.max(1, Number(args['max-links-per-scan'] || PRODUCER_MAX_LINKS_PER_SCAN));
  const minQueueDepth = Number(args['min-queue-depth'] || PRODUCER_MIN_QUEUE_DEPTH);

  if (!keyword) return { ok: false, error: 'keyword required' };

  console.log(`[producer] keyword=${keyword} profile=${profileId} env=${env}`);
  console.log(`[producer] mode=always-on scan=${PRODUCER_SCAN_INTERVAL_MS}ms`);

  let totalScanned = 0, totalAdded = 0, consecutiveErrors = 0, lastHealthCheck = Date.now();

  // Wait for browser
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(HEALTH_CHECK_URL);
      const health = await res.json();
      if (health.ok) { console.log('[producer] browser ready'); break; }
    } catch {}
    await sleep(2000);
  }

  while (true) {
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      return { ok: true, scanned: totalScanned, added: totalAdded };
    }

    if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
      const health = await healthCheckAndRecover(profileId);
      if (!health.ok) {
        consecutiveErrors++;
        if (consecutiveErrors >= PRODUCER_MAX_CONSECUTIVE_ERRORS) return { ok: false, reason: 'health_exhausted' };
      } else {
        if (health.recovered) consecutiveErrors = 0;
      }
      lastHealthCheck = Date.now();
    }

    try {
      const outputDir = path.join(process.env.HOME || '', '.webauto', 'download', 'xiaohongshu', env, keyword);
      const existingNoteIds = loadExistingNoteIds(outputDir);
      console.log(`[producer] existing: ${existingNoteIds.size}`);

      const newLinks = await searchAndCollectLinks({ profileId, keyword, maxLinks: maxLinksPerScan * 2 });
      console.log(`[producer] found: ${newLinks.length}`);

      const deduped = newLinks.filter(l => !existingNoteIds.has(l.noteId));
      console.log(`[producer] new: ${deduped.length}`);

      const result = await enqueueLinks({ links: deduped, keyword, env });
      totalAdded += result.added;
      console.log(`[producer] added: ${result.added} total: ${totalAdded}`);

      totalScanned++;
      consecutiveErrors = 0;

      if (result.added > 0 && result.added < minQueueDepth) {
        console.log('[producer] low water, rescan...');
        await sleep(5000);
        continue;
      }

      console.log(`[producer] waiting ${PRODUCER_SCAN_INTERVAL_MS}ms...`);
      await sleep(PRODUCER_SCAN_INTERVAL_MS);

    } catch (err) {
      console.error(`[producer] error: ${err.message}`);
      consecutiveErrors++;
      if (isSessionError(err.message) && consecutiveErrors >= PRODUCER_MAX_CONSECUTIVE_ERRORS) {
        const recover = await healthCheckAndRecover(profileId);
        if (!recover.ok) return { ok: false, reason: 'recovery_failed' };
        consecutiveErrors = 0;
      }
      await sleep(PRODUCER_SCAN_INTERVAL_MS);
    }
  }
}

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
  runProducerTask(parsed).then(r => { console.log('[producer] exit:', r); process.exit(r.ok ? 0 : 1); })
    .catch(e => { console.error('[producer] fatal:', e); process.exit(1); });
}
