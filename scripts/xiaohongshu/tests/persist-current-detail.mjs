#!/usr/bin/env node
/**
 * 小红书当前详情页单次持久化脚本
 *
 * 假设：
 *   - Browser Service / Unified API 已启动；
 *   - 指定 sessionId 的浏览器会话当前停留在某条详情页（含图片和评论）；
 *
 * 功能：
 *   - 从当前页面读取 URL 并解析 noteId；
 *   - 调用 ExtractDetailBlock 提取 header/content/gallery（含 DOM 兜底图片）；
 *   - 调用 CollectCommentsBlock 采集评论；
 *   - 调用 PersistXhsNoteBlock 落盘到 ~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/。
 *
 * 仅做 Block 编排，不直接操作 DOM 或做 URL 导航。
 */

import minimist from 'minimist';
import { execute as extractDetail } from '../../../dist/modules/workflow/blocks/ExtractDetailBlock.js';
import { execute as collectComments } from '../../../dist/modules/workflow/blocks/CollectCommentsBlock.js';
import { execute as persistXhsNote } from '../../../dist/modules/workflow/blocks/PersistXhsNoteBlock.js';

const UNIFIED_API = 'http://127.0.0.1:7701';

async function controllerAction(action, payload = {}) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.data || data;
}

async function getCurrentUrl(profile) {
  const result = await controllerAction('browser:execute', {
    profile,
    script: 'location.href',
  });
  return result?.result || result?.data?.result || '';
}

function parseNoteIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const m = url.match(/\/explore\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const sessionId = args.sessionId || 'xiaohongshu_fresh';
  const keyword = args.keyword || 'UT_当前详情';
  const env = args.env || 'debug';

  const url = await getCurrentUrl(sessionId);
  const noteId = parseNoteIdFromUrl(url);

  console.log(`💾 Persist current detail\n  sessionId=${sessionId}\n  env=${env}\n  keyword=${keyword}\n  url=${url}\n  noteId=${noteId || '未知'}`);

  if (!noteId) {
    console.error('❌ 无法从当前 URL 解析 noteId，请确认已经打开具体详情页（/explore/<noteId>...）。');
    process.exit(1);
  }

  console.log('\n1️⃣ 提取详情（ExtractDetailBlock）...');
  const detailRes = await extractDetail({ sessionId, serviceUrl: UNIFIED_API });
  if (!detailRes.success) {
    console.error('❌ ExtractDetailBlock 失败:', detailRes.error || 'unknown');
    process.exit(1);
  }

  const detail = detailRes.detail || {};
  const galleryImages = Array.isArray(detail?.gallery?.images)
    ? detail.gallery.images
    : [];
  console.log(
    `   ✅ 提取成功: header=${detail.header ? 'yes' : 'no'}, content=${detail.content ? 'yes' : 'no'}, gallery.images=${galleryImages.length}`,
  );

  console.log('\n2️⃣ 采集评论（CollectCommentsBlock）...');
  const commentsRes = await collectComments({
    sessionId,
    serviceUrl: UNIFIED_API,
  }).catch((e) => ({
    success: false,
    comments: [],
    reachedEnd: false,
    emptyState: false,
    warmupCount: 0,
    totalFromHeader: null,
    error: e.message || String(e),
  }));

  if (!commentsRes.success) {
    console.warn(
      '   ⚠️ CollectCommentsBlock 失败，将以“仅详情、无评论”模式落盘:',
      commentsRes.error || 'unknown',
    );
  } else {
    const headerTotal =
      typeof commentsRes.totalFromHeader === 'number'
        ? commentsRes.totalFromHeader
        : null;
    const count = Array.isArray(commentsRes.comments)
      ? commentsRes.comments.length
      : 0;
    console.log(
      `   ✅ 评论采集: count=${count}, header=${headerTotal !== null ? headerTotal : '未知'}, reachedEnd=${commentsRes.reachedEnd ? '是' : '否'}`,
    );
  }

  console.log('\n3️⃣ 持久化到 ~/.webauto/download/xiaohongshu/...（PersistXhsNoteBlock）...');
  const persistRes = await persistXhsNote({
    sessionId,
    env,
    platform: 'xiaohongshu',
    keyword,
    noteId,
    detailUrl: url,
    detail,
    commentsResult: commentsRes,
  });

  if (!persistRes.success) {
    console.error('❌ PersistXhsNoteBlock 失败:', persistRes.error || 'unknown');
    process.exit(1);
  }

  console.log(
    `   ✅ 持久化完成:\n      outputDir=${persistRes.outputDir}\n      content=${persistRes.contentPath}\n      imagesDir=${persistRes.imagesDir}`,
  );
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
