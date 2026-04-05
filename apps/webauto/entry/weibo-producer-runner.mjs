/**
 * Weibo Producer Runner — Always-On 模式的链接采集端
 *
 * 职责：
 * 1. 读取已有输出文件（posts.jsonl）获取已处理 post URL Set
 * 2. 采集微博首页时间线或用户主页帖子
 * 3. 与已处理 Set 去重
 * 4. 新帖子写入队列
 * 5. 低水位检查
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  resolveWeiboOutputContext,
  mergeWeiboPosts,
  readJsonlRows,
  ensureDir,
} from '../../../modules/camo-runtime/src/autoscript/action-providers/weibo/persistence.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 读取已有输出文件中的已处理 URL
 */
function loadExistingUrls(outputDir) {
  const urls = new Set();
  const postsPath = path.join(outputDir, 'posts.jsonl');
  if (fs.existsSync(postsPath)) {
    try {
      const rows = readJsonlRows(postsPath);
      for (const row of rows) {
        const url = String(row.url || '').trim();
        if (url) urls.add(url);
      }
    } catch {
      // ignore read errors
    }
  }
  return urls;
}

/**
 * 主入口
 */
export async function runWeiboProducerTask(args = {}) {
  const profileId = String(args.profile || 'weibo').trim();
  const env = String(args.env || 'prod').trim();
  const taskType = String(args['task-type'] || 'timeline').trim();
  const userIds = String(args['user-ids'] || '').trim().split(',').map(s => s.trim()).filter(Boolean);
  const keyword = String(args.keyword || args.k || '').trim();
  const maxLinksPerScan = Math.max(1, Number(args['max-links-per-scan'] || 50));
  const minQueueDepth = Math.max(0, Number(args['min-queue-depth'] || 10));
  const maxScans = Math.max(1, Number(args['max-scans'] || 1));
  const scanIntervalMs = Math.max(10000, Number(args['scan-interval-ms'] || 30000));
  const scrollDelay = Math.max(500, Number(args['scroll-delay'] || 2500));
  const maxEmptyScrolls = Math.max(1, Number(args['max-empty-scrolls'] || 2));

  console.log(`[weibo-producer] taskType=${taskType} env=${env} profile=${profileId}`);
  console.log(`[weibo-producer] maxLinksPerScan=${maxLinksPerScan} minQueueDepth=${minQueueDepth}`);

  // Use unified runner for actual collection
  const { runWeiboUnified } = await import('./weibo-unified-runner.mjs');

  let totalAdded = 0;
  let totalScanned = 0;
  let totalExisting = 0;

  for (let scan = 1; scan <= maxScans; scan++) {
    console.log(`[weibo-producer] scan ${scan}/${maxScans} starting...`);

    // Step 1: Load existing URLs
    const outputCtx = resolveWeiboOutputContext({ params: { env, taskType, userIds } });
    const existingUrls = loadExistingUrls(outputCtx.collectionDir);
    totalExisting = existingUrls.size;
    console.log(`[weibo-producer] existing URLs: ${existingUrls.size}`);

    // Step 2: Run timeline/user-profile collection
    const collectResult = await runWeiboUnified({
      profile: profileId,
      env,
      'task-type': taskType,
      'user-ids': userIds.join(','),
      keyword,
      target: String(maxLinksPerScan),
      'scroll-delay': String(scrollDelay),
      'max-empty-scrolls': String(maxEmptyScrolls),
    });

    if (collectResult?.ok) {
      const newPosts = (collectResult.posts || []).filter(p => !existingUrls.has(p.url));
      totalAdded += newPosts.length;
      console.log(`[weibo-producer] collected: ${collectResult.posts?.length || 0}, new: ${newPosts.length}`);
    } else {
      console.log(`[weibo-producer] collection failed: ${collectResult?.error || 'unknown'}`);
    }

    totalScanned = scan;

    // Step 3: Check low watermark
    if (scan < maxScans) {
      console.log(`[weibo-producer] waiting ${scanIntervalMs}ms before next scan`);
      await sleep(scanIntervalMs);
    }
  }

  console.log(`[weibo-producer] done. scans=${totalScanned} added=${totalAdded} existing=${totalExisting}`);
  return {
    ok: true,
    scans: totalScanned,
    added: totalAdded,
    existing: totalExisting,
  };
}
