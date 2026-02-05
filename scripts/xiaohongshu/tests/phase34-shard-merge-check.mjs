#!/usr/bin/env node

/**
 * Phase34 分片/合并/去重 检查（纯离线，不触发浏览器操作）
 *
 * 目标：
 * - 基于 Phase2 输出 phase2-links.jsonl 做 shard 分配
 * - 验证 shards 互斥、并集等于全集、合并后 noteId 去重正确
 * - 落盘 shards.json 作为回归证据
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/phase34-shard-merge-check.mjs --keyword "小米造车" --env debug --profiles xiaohongshu_batch-1,xiaohongshu_batch-2
 */

import minimist from 'minimist';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { assignShards } from '../lib/profilepool.mjs';

function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

async function readJsonl(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function hashShardIndex(noteId, shardCount) {
  // Mirror modules/xiaohongshu/app/src/blocks/helpers/sharding.js (noteId-hash)
  // Simple deterministic hash (FNV-1a like) to stay stable across JS runtimes.
  let h = 2166136261;
  const s = String(noteId || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % shardCount;
  return idx;
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const keyword = String(argv.keyword || '').trim();
  const env = String(argv.env || 'debug').trim();
  const profilesArg = String(argv.profiles || '').trim();
  if (!keyword) {
    console.error('❌ 必须提供 --keyword');
    process.exit(2);
  }
  if (!profilesArg) {
    console.error('❌ 必须提供 --profiles（逗号分隔）');
    process.exit(2);
  }

  const profiles = profilesArg.split(',').map((s) => s.trim()).filter(Boolean);
  if (profiles.length < 2) {
    console.error('❌ profiles 至少需要 2 个');
    process.exit(2);
  }

  const assignments = assignShards(profiles);
  const shardCount = assignments.length;

  const root = resolveDownloadRoot();
  const linksPath = path.join(root, 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
  const outDir = path.join(root, 'xiaohongshu', env, keyword, 'phase34');
  const outPath = path.join(outDir, 'shards.json');
  await fs.mkdir(outDir, { recursive: true });

  const all = await readJsonl(linksPath);
  const noteIds = all.map((r) => r.noteId).filter(Boolean);
  const uniqueAll = new Set(noteIds);

  const shards = assignments.map((a) => ({
    profile: a.profile,
    shardIndex: a.index,
    shardCount: a.count,
    noteIds: [],
  }));

  for (const r of all) {
    const idx = hashShardIndex(r.noteId, shardCount);
    shards[idx].noteIds.push(r.noteId);
  }

  // Validate mutual exclusion + union
  const seen = new Set();
  let dup = 0;
  for (const s of shards) {
    for (const id of s.noteIds) {
      if (seen.has(id)) dup += 1;
      seen.add(id);
    }
  }

  const okUnion = seen.size === uniqueAll.size;
  const okDup = dup === 0;

  const payload = {
    keyword,
    env,
    profiles,
    shardCount,
    total: all.length,
    uniqueTotal: uniqueAll.size,
    mergedUnique: seen.size,
    dup,
    okUnion,
    okDup,
    shards: shards.map((s) => ({
      profile: s.profile,
      shardIndex: s.shardIndex,
      shardCount: s.shardCount,
      count: s.noteIds.length,
      noteIds: s.noteIds,
    })),
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log('[Phase34ShardMergeCheck] OK');
  console.log(`- linksPath: ${linksPath}`);
  console.log(`- out: ${outPath}`);
  console.log(`- total=${payload.total} unique=${payload.uniqueTotal}`);
  console.log(`- mergedUnique=${payload.mergedUnique} dup=${payload.dup}`);
  console.log(`- shard sizes: ${payload.shards.map((s) => s.count).join(' + ')} = ${payload.shards.reduce((n, s) => n + s.count, 0)}`);

  if (!okUnion || !okDup) {
    console.error('❌ shard merge validation failed');
    process.exit(1);
  }
}

await main();

