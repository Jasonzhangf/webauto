#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';
import { resolveKeyword, resolveEnv } from './lib/env.mjs';
import { resolveDownloadRoot } from '../../dist/modules/state/src/paths.js';
import { ensureServicesHealthy, restoreBrowserState } from './lib/recovery.mjs';
import minimist from 'minimist';
import path from 'node:path';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

ensureUtf8Console();

const UNIFIED_API = 'http://127.0.0.1:7701';
const SEARCH_GATE = 'http://127.0.0.1:7790';

function runNode(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { stdio: 'inherit', cwd: process.cwd(), env: process.env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}


async function controllerAction(action, payload) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

async function loadLinks(linksPath) {
  const content = await readFile(linksPath, 'utf8');
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function loadHitNotes(rootDir, keyword) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const noteId = entry.name;
    const commentsPath = path.join(rootDir, noteId, 'comments.jsonl');
    try {
      const content = await readFile(commentsPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const hits = lines
        .map((l) => JSON.parse(l))
        .filter((c) => c?.text && String(c.text).includes(keyword));
      if (hits.length > 0) {
        results.push({ noteId, hits });
      }
    } catch {
      // ignore
    }
  }
  return results;
}

async function ensureCommentsOpened(profile) {
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_button',
    operationId: 'click',
    sessionId: profile,
  }).catch(() => {});
}

async function extractVisibleComments(profile, noteId, round) {
  const res = await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section.comment_item',
    operationId: 'extract',
    sessionId: profile,
    config: { max_items: 80, visibleOnly: true },
  });
  const items = Array.isArray(res?.extracted) ? res.extracted : [];
  console.log(`    extract count=${items.length} note=${noteId} round=${round}`);
  return items;
}

async function scrollComments(profile, distance = 650) {
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section',
    operationId: 'scroll',
    sessionId: profile,
    config: { direction: 'down', distance },
  }).catch(() => {});
}

async function highlightRow(profile, index) {
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section.comment_item',
    operationId: 'highlight',
    sessionId: profile,
    config: { index, target: 'self', style: '6px solid #ff00ff', duration: 8000, visibleOnly: true },
  }).catch(() => {});
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_detail.comment_section.comment_item',
    operationId: 'highlight',
    sessionId: profile,
    config: { index, target: '.like-wrapper', style: '12px solid #00e5ff', duration: 8000, visibleOnly: true },
  }).catch(() => {});
}

async function takeScreenshot(profile, outPath) {
  const res = await controllerAction('browser:screenshot', { profile, fullPage: false });
  const shot = res?.screenshot || res?.data?.screenshot;
  if (shot) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await appendFile(outPath, Buffer.from(shot, 'base64'));
    console.log(`    screenshot saved: ${outPath}`);
    return true;
  }
  return false;
}

async function likeGate(profileId) {
  const res = await fetch(`${SEARCH_GATE}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId }),
  });
  return res.json();
}

async function waitForLikePermit(profileId) {
  while (true) {
    const res = await likeGate(profileId);
    const allowed = Boolean(res?.allowed ?? res?.ok ?? true);
    const current = Number(res?.current ?? res?.countInWindow ?? 0);
    const limit = Number(res?.limit ?? res?.maxCount ?? 6);
    if (allowed) return { current, limit };
    await new Promise((r) => setTimeout(r, 10000));
  }
}

async function main() {
  await ensureServicesHealthy();
  await ensureCoreServices();
  const args = minimist(process.argv.slice(2));
  const keyword = resolveKeyword();
  const env = resolveEnv();
  const profile = String(args.profile || '').trim();
  const likeKeyword = String(args['like-keyword'] || '抄底').trim();

  if (!profile) {
    console.error('❌ 必须提供 --profile');
    process.exit(2);
  }

  // ensure profile session is started
  const sessionCheck = await controllerAction('browser:page:list', { profile }).catch(() => null);
  if (!sessionCheck?.success) {
    const phase1Path = path.join(process.cwd(), 'scripts', 'xiaohongshu', 'phase1-boot.mjs');
    await runNode(phase1Path, ['--profile', profile, '--once', '--foreground']);
  }

  const downloadRoot = resolveDownloadRoot();
  const linksPath = path.join(downloadRoot, 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
  const noteRoot = path.join(downloadRoot, 'xiaohongshu', env, keyword);
  const outDir = path.join(downloadRoot, 'xiaohongshu', env, keyword, 'screenshots');
  const summaryPath = path.join(downloadRoot, 'xiaohongshu', env, keyword, 'like-dryrun-summary.jsonl');

  const links = await loadLinks(linksPath);
  const linkMap = new Map(links.map((l) => [l.noteId, l.safeUrl]));

  const hitNotes = await loadHitNotes(noteRoot, likeKeyword);
  const totalExpected = hitNotes.reduce((sum, n) => sum + n.hits.length, 0);

  console.log(`\n✅ 发现包含“${likeKeyword}”的帖子数: ${hitNotes.length}`);
  console.log(`🎯 预期点赞数: ${totalExpected} (目标 78)`);

  let liked = 0;

  for (const { noteId, hits } of hitNotes) {
    const safeUrl = linkMap.get(noteId);
    if (!safeUrl) continue;

    console.log(`\n[DryRun] note ${noteId} hits=${hits.length}`);
    await controllerAction('browser:goto', { profile, url: safeUrl });
    await new Promise((r) => setTimeout(r, 2000));
    await ensureCommentsOpened(profile);
    await new Promise((r) => setTimeout(r, 1000));

    for (let i = 0; i < hits.length; i++) {
      const targetText = String(hits[i]?.text || '').trim();
      if (!targetText) continue;

      const { current, limit } = await waitForLikePermit(profile);
      console.log(`  LikeGate ${current}/${limit}`);

      let found = false;
      for (let round = 0; round < 60; round++) {
        const extracted = await extractVisibleComments(profile, noteId, round);
        console.log(`    extract count=${extracted.length}`);
        const idx = extracted.findIndex((c) => String(c?.text || '').includes(likeKeyword));
        if (idx >= 0) {
          await highlightRow(profile, idx);
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `like_dryrun_${noteId}_${String(i).padStart(3, '0')}_${ts}.png`;
          const outPath = path.join(outDir, filename);
          await takeScreenshot(profile, outPath);
          await appendFile(summaryPath, JSON.stringify({ noteId, text: targetText, screenshot: outPath }) + '\n');
          liked += 1;
          found = true;
          break;
        }
        await scrollComments(profile, 650);
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!found) {
        await appendFile(summaryPath, JSON.stringify({ noteId, text: targetText, screenshot: null, error: 'not_found' }) + '\n');
      }

      await new Promise((r) => setTimeout(r, 10000)); // 6/min
    }
  }

  console.log(`\n✅ Dryrun 完成: ${liked}/${totalExpected}`);
}

main().catch((err) => {
  console.error('❌ like-dryrun 失败:', err?.message || String(err));
  process.exit(1);
});
