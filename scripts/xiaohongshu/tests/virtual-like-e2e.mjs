#!/usr/bin/env node
/**
 * Virtual Like E2E (Xiaohongshu)
 *
 * 目标：
 * 1) 从 Phase2 输出（安全链接）里抽样“评论多”的帖子；
 * 2) 检查评论是否包含指定关键字（默认：链接）；
 * 3) 对命中的评论执行“虚拟点赞”（高亮点赞按钮 + 坐标点击）并截图留证。
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/virtual-like-e2e.mjs --keyword "工作服" --env debug --like-keyword "链接"
 *
 * 可选参数：
 *   --probe <n>           抽样 probe 的帖子数（默认 10）
 *   --select <n>          选择执行点赞的帖子数（默认 2）
 *   --max-scrolls <n>     probe 时评论区滚动轮数（默认 6）
 *   --max-items <n>       每轮最多提取评论条数（默认 60）
 *   --max-like <n>        每个帖子最多点赞条数（默认 1）
 *
 * 说明：
 * - 仅使用 Phase2 的 safeUrl（包含 xsec_token），不会构造 URL 导航
 * - 所有点击/滚动/输入均通过系统级能力（container:operation / keyboard:press / keyboard:type）
 */

import minimist from 'minimist';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { PROFILE } from '../lib/env.mjs';
import { createSessionLock } from '../lib/session-lock.mjs';
import { execute as interact } from '../../../dist/modules/xiaohongshu/app/src/blocks/Phase3InteractBlock.js';

function resolveHomeDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) throw new Error('无法获取用户主目录：HOME/USERPROFILE 未设置');
  return homeDir;
}

function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && String(custom).trim()) return String(custom).trim();
  return path.join(resolveHomeDir(), '.webauto', 'download');
}

async function controllerAction(action, payload, apiUrl) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

async function probeOneNote({ sessionId, unifiedApiUrl, noteId, safeUrl, likeKeyword, maxScrolls, maxItems, outDir }) {
  const result = {
    noteId,
    safeUrl,
    extracted: 0,
    uniqueTexts: 0,
    keywordHits: 0,
    sampleMatches: [],
    matchScreenshot: null,
    reachedEndMarker: false,
    error: null,
  };

  const seen = new Set();

  try {
    // 打开详情页（safeUrl 含 xsec_token）
    await controllerAction('browser:goto', { profile: sessionId, url: safeUrl }, unifiedApiUrl);
    await delay(2200);

    // 打开评论区
    await controllerAction(
      'container:operation',
      { containerId: 'xiaohongshu_detail.comment_button', operationId: 'highlight', sessionId, config: { duration: 1800, channel: 'virtual-like-probe' } },
      unifiedApiUrl,
    ).catch(() => null);
    await controllerAction(
      'container:operation',
      { containerId: 'xiaohongshu_detail.comment_button', operationId: 'click', sessionId },
      unifiedApiUrl,
    ).catch(() => {});
    await delay(1400);

    for (let round = 0; round < maxScrolls; round += 1) {
      // 结束标记（容器 extract 有 extracted 数组则视为命中）
      const endRes = await controllerAction(
        'container:operation',
        { containerId: 'xiaohongshu_detail.comment_section.end_marker', operationId: 'extract', sessionId },
        unifiedApiUrl,
      ).catch(() => null);
      const endExtracted = Array.isArray(endRes?.extracted) ? endRes.extracted : [];
      if (endExtracted.length > 0) {
        result.reachedEndMarker = true;
        break;
      }

      // 提取评论（容器驱动，读取字段）
      const extractRes = await controllerAction(
        'container:operation',
        {
          containerId: 'xiaohongshu_detail.comment_section.comment_item',
          operationId: 'extract',
          sessionId,
          config: { max_items: maxItems, visibleOnly: true },
        },
        unifiedApiUrl,
      ).catch(() => null);

      const rows = Array.isArray(extractRes?.extracted) ? extractRes.extracted : [];
      result.extracted += rows.length;

      // 寻找关键字命中，并记录少量样例
      let firstMatchIndex = -1;
      for (let i = 0; i < rows.length; i += 1) {
        const text = String(rows[i]?.text || '').trim();
        if (!text) continue;
        const key = `${String(rows[i]?.user_id || '')}:${text}`;
        if (!seen.has(key)) {
          seen.add(key);
        }
        if (firstMatchIndex === -1 && likeKeyword && text.includes(likeKeyword)) {
          firstMatchIndex = i;
          if (result.sampleMatches.length < 3) {
            result.sampleMatches.push(text.slice(0, 120));
          }
        }
      }
      result.uniqueTexts = seen.size;
      if (firstMatchIndex !== -1) {
        result.keywordHits += 1;
      }

      // 若本轮命中关键字，且尚未留证，则高亮该评论并截图
      if (firstMatchIndex !== -1 && !result.matchScreenshot) {
        await controllerAction(
          'container:operation',
          {
            containerId: 'xiaohongshu_detail.comment_section.comment_item',
            operationId: 'highlight',
            sessionId,
            config: { index: firstMatchIndex, target: 'self', duration: 8000, channel: 'virtual-like-probe-row', style: '6px solid #ff00ff', visibleOnly: true },
          },
          unifiedApiUrl,
        ).catch(() => null);

        const hl = await controllerAction(
          'container:operation',
          {
            containerId: 'xiaohongshu_detail.comment_section.comment_item',
            operationId: 'highlight',
            sessionId,
            config: { index: firstMatchIndex, target: '.like-wrapper', duration: 8000, channel: 'virtual-like-probe-like', style: '12px solid #00e5ff', visibleOnly: true },
          },
          unifiedApiUrl,
        ).catch(() => null);
        await delay(450);

        if (hl?.inViewport !== true) {
          // 不在视口内则不截图，继续滚动寻找更靠前的命中
          continue;
        }

        const shot = await controllerAction('browser:screenshot', { profileId: sessionId, fullPage: false }, unifiedApiUrl)
          .then((r) => r?.data || r?.result || r?.data?.data || null)
          .catch(() => null);
        if (typeof shot === 'string' && shot) {
          await fs.mkdir(outDir, { recursive: true });
          const filePath = path.join(outDir, `probe-match-${Date.now()}.png`);
          await fs.writeFile(filePath, Buffer.from(shot, 'base64'));
          result.matchScreenshot = filePath;
        }
      }

      // 单次滚动 <= 800
      await controllerAction(
        'container:operation',
        {
          containerId: 'xiaohongshu_detail.comment_section',
          operationId: 'scroll',
          sessionId,
          config: { direction: 'down', distance: 650 },
        },
        unifiedApiUrl,
      ).catch(() => {});
      await delay(900);
    }
  } catch (e) {
    result.error = e?.message || String(e);
  }

  // 尽量回到列表页（避免长期停留在详情页）
  await controllerAction('keyboard:press', { profileId: sessionId, key: 'Escape' }, unifiedApiUrl).catch(() => {});
  await delay(900);

  return result;
}

async function main() {
  const args = minimist(process.argv.slice(2));

  const keyword = String(args.keyword || '').trim();
  if (!keyword) {
    console.error('❌ 必须提供 --keyword，例如：--keyword \"工作服\"');
    process.exit(1);
  }
  const env = String(args.env || 'debug').trim() || 'debug';
  const likeKeyword = String(args['like-keyword'] || '链接').trim() || '链接';
  const probeCount = Math.max(1, Math.min(50, Number(args.probe || 10) || 10));
  const selectCount = Math.max(1, Math.min(10, Number(args.select || 2) || 2));
  const maxScrolls = Math.max(1, Math.min(20, Number(args['max-scrolls'] || 6) || 6));
  const maxItems = Math.max(10, Math.min(120, Number(args['max-items'] || 60) || 60));
  const maxLike = Math.max(1, Math.min(3, Number(args['max-like'] || 1) || 1));
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true' || args['dry-run'] === 1 || args['dry-run'] === '1';

  const unifiedApiUrl = 'http://127.0.0.1:7701';
  const linksPath = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
  const outRoot = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'virtual-like-e2e');

  console.log('🧪 Virtual Like E2E');
  console.log(`profile: ${PROFILE}`);
  console.log(`keyword: ${keyword}`);
  console.log(`env: ${env}`);
  console.log(`like-keyword: ${likeKeyword}`);
  console.log(`phase2-links: ${linksPath}`);
  console.log(`out: ${outRoot}`);
  console.log(`dry-run: ${dryRun}`);

  // session lock
  const lock = createSessionLock({ profileId: PROFILE, lockType: 'virtual-like', force: false });
  const acquired = lock.acquire();

  try {
    const links = await readJsonl(linksPath);
    const sample = links.slice(0, probeCount);
    if (sample.length === 0) {
      console.error('❌ phase2-links 为空，先运行 Phase2');
      process.exit(2);
    }

    console.log(`\n1️⃣ Probe comments: ${sample.length} notes ...`);

    const probeResults = [];
    for (const row of sample) {
      const noteId = String(row.noteId || '');
      const safeUrl = String(row.safeUrl || '');
      if (!noteId || !safeUrl) continue;
      const noteOutDir = path.join(outRoot, 'probe', noteId);
      const r = await probeOneNote({
        sessionId: PROFILE,
        unifiedApiUrl,
        noteId,
        safeUrl,
        likeKeyword,
        maxScrolls,
        maxItems,
        outDir: noteOutDir,
      });
      probeResults.push(r);
      console.log(
        `- note=${noteId} unique=${r.uniqueTexts} hits=${r.keywordHits} end=${r.reachedEndMarker} screenshot=${r.matchScreenshot ? 'yes' : 'no'}${r.error ? ` err=${r.error}` : ''}`,
      );
      // probe 节奏，避免过快
      await delay(800);
    }

    await fs.mkdir(outRoot, { recursive: true });
    const probeJsonPath = path.join(outRoot, `probe-${Date.now()}.json`);
    await fs.writeFile(probeJsonPath, JSON.stringify({ keyword, env, likeKeyword, probeCount, maxScrolls, maxItems, results: probeResults }, null, 2), 'utf8');
    console.log(`\n📄 Probe report: ${probeJsonPath}`);

    // pick candidates (必须命中关键字)
    const candidates = probeResults
      .filter((r) => r.keywordHits > 0 && !r.error)
      .sort((a, b) => (b.uniqueTexts || 0) - (a.uniqueTexts || 0))
      .slice(0, selectCount);

    if (candidates.length === 0) {
      console.log(`\n⚠️ Probe 未发现评论包含关键字“${likeKeyword}”的帖子（前 ${probeCount} 条样本）。`);
      console.log('   你可以提高 probe 数量：--probe 30，或换一个 like-keyword。');
      process.exit(2);
    }

    console.log(`\n2️⃣ Run virtual-like on ${candidates.length} notes (maxLikePerNote=${maxLike}) ...`);

    const byId = new Map(links.map((l) => [String(l.noteId), l]));
    const likeResults = [];
    for (const c of candidates) {
      const link = byId.get(String(c.noteId));
      if (!link) continue;
      try {
        const res = await interact({
          sessionId: PROFILE,
          noteId: String(link.noteId),
          safeUrl: String(link.safeUrl),
          likeKeywords: [likeKeyword],
          maxLikesPerRound: maxLike,
          dryRun,
          keyword,
          env,
          unifiedApiUrl,
        });
        likeResults.push(res);
        console.log(`- note=${link.noteId} liked=${res?.likedCount ?? 0} reachedBottom=${res?.reachedBottom ?? false}`);
      } catch (e) {
        likeResults.push({ success: false, noteId: String(link.noteId), error: e?.message || String(e) });
        console.log(`- note=${link.noteId} ❌ error=${e?.message || String(e)}`);
      }
      await delay(1200);
    }

    const likeJsonPath = path.join(outRoot, `like-${Date.now()}.json`);
    await fs.writeFile(likeJsonPath, JSON.stringify({ keyword, env, likeKeyword, maxLike, selected: candidates.map((c) => c.noteId), results: likeResults }, null, 2), 'utf8');
    console.log(`\n📄 Like report: ${likeJsonPath}`);

    console.log('\n✅ Done');
  } finally {
    acquired.release();
  }
}

main().catch((err) => {
  console.error('❌ virtual-like-e2e failed:', err?.message || String(err));
  process.exit(1);
});
