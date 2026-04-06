/**
 * XHS Producer Runner — Always-On 模式的链接采集端
 *
 * 职责：
 * 1. 读取已有输出文件（posts.jsonl）获取已处理 noteId Set
 * 2. 搜索关键词，提取搜索结果
 * 3. 与已处理 Set 去重
 * 4. 新帖子入队（search-gate 服务端队列）
 * 5. 低水位检查：队列低于阈值时触发补货
 */

import path from 'node:path';
import fs from 'node:fs';
import { resolveXhsOutputContext, readJsonlRows } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs';
import {
  initXhsDetailLinkQueue,
  claimXhsDetailLink,
} from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/search-gate-ops.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 读取已有输出文件中的已处理 noteId
 */
function loadExistingNoteIds(outputDir) {
  const noteIds = new Set();
  const postsPath = path.join(outputDir, 'posts.jsonl');
  if (fs.existsSync(postsPath)) {
    try {
      const rows = readJsonlRows(postsPath);
      for (const row of rows) {
        const noteId = String(row.noteId || row.id || '').trim();
        if (noteId) noteIds.add(noteId);
      }
    } catch {
      // ignore read errors
    }
  }
  return noteIds;
}

/**
 * 搜索并提取帖子链接（通过 camo CLI）
 */
async function searchAndCollectLinks({ profileId, keyword, maxLinks }) {
  const { execSync } = await import('node:child_process');
  const maxPages = Math.max(1, Math.ceil(maxLinks / 20));

  // 使用 camo CLI 执行搜索和采集
  const script = `
    const searchInput = document.querySelector('#search-input, input.search-input');
    if (!searchInput) return { error: 'search_input_not_found' };

    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.value = '${keyword.replace(/'/g, "\\'")}';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
    searchInput.dispatchEvent(enterEvent);
    return { ok: true, keyword: '${keyword.replace(/'/g, "\\'")}' };
  `;

  const cmd = `camo eval --profile ${profileId} --js '${script.replace(/'/g, "'\\''")}'`;
  try {
    execSync(cmd, { timeout: 30000, encoding: 'utf-8' });
  } catch {
    // eval may fail, continue
  }

  // 等待搜索结果加载
  await sleep(5000);

  // 提取搜索结果中的帖子链接
  const extractScript = `
    const items = document.querySelectorAll('.note-item a[href*="/explore/"]');
    const links = [];
    items.forEach(a => {
      const href = a.getAttribute('href') || '';
      const match = href.match(/\\/explore\\/([a-f0-9]+)/i);
      if (match) {
        links.push({
          noteId: match[1],
          noteUrl: 'https://www.xiaohongshu.com/explore/' + match[1],
          xsecToken: a.getAttribute('xsec-token') || '',
          xsecSource: a.getAttribute('xsec-source') || '',
        });
      }
    });
    // dedup by noteId
    const seen = new Set();
    const unique = [];
    for (const l of links) {
      if (!seen.has(l.noteId)) {
        seen.add(l.noteId);
        unique.push(l);
      }
    }
    return JSON.stringify({ links: unique.slice(0, ${maxLinks}), total: unique.length });
  `;

  const extractCmd = `camo eval --profile ${profileId} --js '${extractScript.replace(/'/g, "'\\''")}'`;
  try {
    const result = execSync(extractCmd, { timeout: 30000, encoding: 'utf-8' });
    const parsed = JSON.parse(result);
    return parsed.links || [];
  } catch {
    return [];
  }
}

/**
 * 将新链接入队（search-gate）
 */
async function enqueueLinks({ links, keyword, env, maxLinksPerScan }) {
  const toEnqueue = links.slice(0, maxLinksPerScan);
  if (toEnqueue.length === 0) return { added: 0 };

  try {
    await initXhsDetailLinkQueue({
      keyword,
      env,
      links: toEnqueue.map(l => ({
        noteId: l.noteId,
        noteUrl: l.noteUrl,
        xsecToken: l.xsecToken || '',
        xsecSource: l.xsecSource || '',
      })),
    });
    return { added: toEnqueue.length };
  } catch (err) {
    console.error(`[producer] enqueue failed: ${err.message}`);
    return { added: 0, error: err.message };
  }
}

/**
 * 主入口
 */
export async function runProducerTask(args = {}) {
  const profileId = String(args.profile || 'xhs-qa-1').trim();
  const keyword = String(args.keyword || args.k || '').trim();
  const env = String(args.env || 'debug').trim();
  const maxLinksPerScan = Math.max(1, Number(args['max-links-per-scan'] || 20));
  const minQueueDepth = Math.max(0, Number(args['min-queue-depth'] || 10));
  const maxScans = Math.max(1, Number(args['max-scans'] || 1));
  const scanIntervalMs = Math.max(10000, Number(args['scan-interval-ms'] || 30000));

  if (!keyword) {
    return { ok: false, error: 'keyword is required' };
  }

  const outputCtx = resolveXhsOutputContext({ params: { keyword, env } });
  console.log(`[producer] keyword=${keyword} env=${env} outputDir=${outputCtx.keywordDir}`);
  console.log(`[producer] maxLinksPerScan=${maxLinksPerScan} minQueueDepth=${minQueueDepth} maxScans=${maxScans}`);

  let totalAdded = 0;
  let totalScanned = 0;
  let totalExisting = 0;

  for (let scan = 1; scan <= maxScans; scan++) {
    console.log(`[producer] scan ${scan}/${maxScans} starting...`);

    // Step 1: Load existing noteIds
    const existingNoteIds = loadExistingNoteIds(outputCtx.keywordDir);
    totalExisting = existingNoteIds.size;
    console.log(`[producer] existing noteIds: ${existingNoteIds.size}`);

    // Step 2: Search and collect
    const allLinks = await searchAndCollectLinks({ profileId, keyword, maxLinks: maxLinksPerScan * 2 });
    console.log(`[producer] search results: ${allLinks.length}`);

    // Step 3: Dedup
    const newLinks = allLinks.filter(l => !existingNoteIds.has(l.noteId));
    console.log(`[producer] new links (after dedup): ${newLinks.length}`);

    if (newLinks.length > 0) {
      // Step 4: Enqueue
      const result = await enqueueLinks({ links: newLinks, keyword, env, maxLinksPerScan });
      totalAdded += result.added;
      console.log(`[producer] enqueued: ${result.added} (total: ${totalAdded})`);
    }

    totalScanned = scan;

    // Step 5: Check if we need more scans (low watermark)
    if (scan < maxScans && newLinks.length > 0) {
      const queueDepth = newLinks.length - (newLinks.length > maxLinksPerScan ? maxLinksPerScan : 0);
      if (queueDepth < minQueueDepth) {
        console.log(`[producer] queue depth ${queueDepth} < threshold ${minQueueDepth}, waiting ${scanIntervalMs}ms before next scan`);
        await sleep(scanIntervalMs);
      } else {
        console.log(`[producer] queue depth ${queueDepth} >= threshold ${minQueueDepth}, scan complete`);
        break;
      }
    }
  }

  console.log(`[producer] done. scans=${totalScanned} added=${totalAdded} existing=${totalExisting}`);
  return {
    ok: true,
    scans: totalScanned,
    added: totalAdded,
    existing: totalExisting,
    outputDir: outputCtx.keywordDir,
  };
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
  runProducerTask(parsed).then(result => {
    console.log('[producer] exit:', result);
    process.exit(result.ok ? 0 : 1);
  }).catch(err => {
    console.error('[producer] fatal:', err);
    process.exit(1);
  });
}
