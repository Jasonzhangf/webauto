#!/usr/bin/env node
/**
 * Smart Reply E2E (Xiaohongshu) - DEV 模式（不提交）
 *
 * 目标：
 * - 基于 Phase2 safeUrl（含 xsec_token）打开详情；
 * - 从评论中按规则命中关键字；
 * - 生成一条 <=20 字的拟人回复（dev 默认 mock）；
 * - 点击“回复” -> 定位回复框 -> 输入 -> 截图留证（高亮 + overlay）。
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/smart-reply-e2e.mjs --keyword "工作服" --env debug --match "链接" --mode any --max-notes 2 --dev
 *
 * 续传：
 *   node scripts/xiaohongshu/tests/smart-reply-e2e.mjs --keyword "工作服" --env debug --resume true
 */

import minimist from 'minimist';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { PROFILE } from '../lib/env.mjs';
import { createSessionLock } from '../lib/session-lock.mjs';

import { execute as extractDetail } from '../../../dist/modules/xiaohongshu/app/src/blocks/Phase34ExtractDetailBlock.js';
import { execute as matchComments } from '../../../dist/modules/xiaohongshu/app/src/blocks/MatchCommentsBlock.js';
import { execute as generateReply } from '../../../dist/modules/workflow/blocks/GenerateSmartReplyBlock.js';
import { execute as replyInteract } from '../../../dist/modules/xiaohongshu/app/src/blocks/ReplyInteractBlock.js';

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
    signal: AbortSignal.timeout(60000),
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

async function loadState(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveState(statePath, state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function buildRule({ mode, matchKeyword }) {
  const kws = String(matchKeyword || '').trim() ? [String(matchKeyword).trim()] : [];
  if (mode === 'any2') {
    // any2: 这里为了演示，允许通过 --match 传入用逗号分隔的关键词列表
    const list = String(matchKeyword || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { any: list, minAnyMatches: 2 };
  }
  if (mode === 'all') {
    const list = String(matchKeyword || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { must: list };
  }
  return { any: kws, minAnyMatches: 1 };
}

async function main() {
  const args = minimist(process.argv.slice(2));

  const keyword = String(args.keyword || '').trim();
  if (!keyword) {
    console.error('❌ 必须提供 --keyword，例如：--keyword "工作服"');
    process.exit(1);
  }
  const env = String(args.env || 'debug').trim() || 'debug';
  const unifiedApiUrl = String(args['api-url'] || 'http://127.0.0.1:7701').trim();
  const dev = args.dev !== false; // 默认 dev=true
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true' || args['dry-run'] === 1 || args['dry-run'] === '1';

  const mode = String(args.mode || 'any').trim(); // any | any2 | all
  const matchKeyword = String(args.match || '链接').trim() || '链接';
  const maxNotes = Math.max(1, Math.min(20, Number(args['max-notes'] || 2) || 2));
  const maxScrolls = Math.max(1, Math.min(20, Number(args['max-scrolls'] || 10) || 10));
  const resume = args.resume !== false; // 默认 resume=true
  const onlyNotes = String(args.note || '').trim();

  const linksPath = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
  const statePath = String(args.state || '').trim() || path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'smart-reply-e2e', 'state.json');

  console.log('🧪 Smart Reply E2E (DEV)');
  console.log(`profile: ${PROFILE}`);
  console.log(`keyword: ${keyword}`);
  console.log(`env: ${env}`);
  console.log(`phase2-links: ${linksPath}`);
  console.log(`state: ${statePath}`);
  console.log(`mode: ${mode}`);
  console.log(`match: ${matchKeyword}`);
  console.log(`max-notes: ${maxNotes}`);
  console.log(`max-scrolls: ${maxScrolls}`);
  console.log(`dev: ${dev}`);
  console.log(`dry-run: ${dryRun}`);
  if (onlyNotes) console.log(`note filter: ${onlyNotes}`);

  const lock = createSessionLock({ profileId: PROFILE, lockType: 'smart-reply', force: false });
  let lockHandle = null;
  try {
    lockHandle = lock.acquire();
  } catch (e) {
    console.log('⚠️  会话锁已被其他进程持有，退出');
    console.log(String(e?.message || e));
    process.exit(2);
  }

  try {
    let links = await readJsonl(linksPath);
    if (!links.length) {
      console.error('❌ phase2-links 为空，先运行 Phase2');
      process.exit(3);
    }
    if (onlyNotes) {
      const allow = new Set(
        onlyNotes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      links = links.filter((r) => allow.has(String(r.noteId || '').trim()));
      if (!links.length) {
        console.error('❌ note filter 未命中任何 phase2-links 记录');
        process.exit(4);
      }
    }

    const rule = buildRule({ mode, matchKeyword });
    const prev = resume ? await loadState(statePath) : null;
    const state = prev || {
      version: 1,
      profile: PROFILE,
      env,
      keyword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rule,
      notes: {},
      order: [],
    };

    let processed = 0;
    let done = 0;
    for (const row of links) {
      if (processed >= maxNotes) break;
      const noteId = String(row.noteId || '').trim();
      const safeUrl = String(row.safeUrl || '').trim();
      if (!noteId || !safeUrl) continue;

      const prevNote = state.notes[noteId];
      if (resume && prevNote && prevNote.status === 'done') continue;

      console.log(`\n➡️  note=${noteId}`);
      state.order = Array.from(new Set([...(state.order || []), noteId]));
      state.notes[noteId] = {
        status: 'running',
        safeUrl,
        updatedAt: new Date().toISOString(),
      };
      state.updatedAt = new Date().toISOString();
      await saveState(statePath, state);

      try {
        // 1) 打开详情页（safeUrl 含 xsec_token）
        const nav = await controllerAction('browser:goto', { profile: PROFILE, url: safeUrl }, unifiedApiUrl);
        if (nav?.success === false) throw new Error(nav?.error || 'goto failed');
        await delay(2200);

        // 2) 提取正文（用于 prompt）
        const detailRes = await extractDetail({ noteId, profile: PROFILE, unifiedApiUrl });
        if (!detailRes?.success) throw new Error(detailRes?.error || 'extract detail failed');
        const noteText = String(detailRes?.detail?.content || '').trim() || String(detailRes?.detail?.title || '').trim();

        // 3) 评论命中（可配置规则）
        const matchRes = await matchComments({
          sessionId: PROFILE,
          unifiedApiUrl,
          rule,
          maxScrolls,
          maxItems: 60,
          maxMatches: 3,
          openComments: true,
          highlightOnFirstMatch: true,
          screenshotOnFirstMatch: true,
          noteId,
          env,
          keyword,
        });

        const first = matchRes?.matches?.[0] || null;
        if (!first) {
          state.notes[noteId] = {
            status: 'no_match',
            safeUrl,
            updatedAt: new Date().toISOString(),
            matchEvidence: matchRes?.evidence || {},
          };
          await saveState(statePath, state);
          console.log('   - no match');
          processed += 1;
          continue;
        }

        // 4) 生成拟人回复（dev 默认 mock）
        const replyRes = await generateReply({
          note: noteText,
          comment: first.content,
          dev,
          dryRun,
          maxChars: 20,
        });
        if (!replyRes?.success) throw new Error(replyRes?.error || 'generate reply failed');

        // 5) 点击回复 + 输入 + 截图（DEV）
        const interactRes = await replyInteract({
          sessionId: PROFILE,
          unifiedApiUrl,
          noteId,
          commentVisibleIndex: first.index,
          replyText: replyRes.reply,
          env,
          keyword,
          dev: true,
          dryRun,
        });
        if (!interactRes?.success) throw new Error(interactRes?.error || 'reply interact failed');

        state.notes[noteId] = {
          status: 'done',
          safeUrl,
          updatedAt: new Date().toISOString(),
          match: first,
          matchEvidence: matchRes?.evidence || {},
          reply: { text: replyRes.reply, usedMock: replyRes.usedMock },
          interactEvidence: interactRes?.evidence || {},
        };
        state.updatedAt = new Date().toISOString();
        await saveState(statePath, state);

        done += 1;
        processed += 1;
        console.log(`   ✅ done (typed=${interactRes.typed}) screenshot=${interactRes?.evidence?.screenshot || 'n/a'}`);
      } catch (e) {
        state.notes[noteId] = {
          status: 'error',
          safeUrl,
          updatedAt: new Date().toISOString(),
          error: e?.message || String(e),
        };
        state.updatedAt = new Date().toISOString();
        await saveState(statePath, state);
        console.warn(`   ❌ error: ${e?.message || String(e)}`);
        processed += 1;
      } finally {
        // 尽量回到列表页（避免长时间停在详情页）
        await controllerAction('keyboard:press', { profileId: PROFILE, key: 'Escape' }, unifiedApiUrl).catch(() => {});
        await delay(900);
      }
    }

    console.log('\n✅ Smart Reply E2E finished');
    console.log(`state: ${statePath}`);
  } finally {
    lockHandle?.release?.();
  }
}

main();
