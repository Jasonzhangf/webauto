#!/usr/bin/env node
/**
 * 清理过时的 browser sessions
 * 
 * 规则：
 * - 只清理 owner 死亡或不存在 owner 的 session
 * - 保留 owner 存活的 session（即使脚本已挂，但进程仍在）
 */

import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

const BROWSER_SERVICE_URL = process.env.BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';

async function getStatus() {
  const res = await fetch(`${BROWSER_SERVICE_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getStatus' }),
  });
  if (!res.ok) throw new Error('Browser service not available');
  return res.json();
}

async function deleteSession(profileId) {
  const res = await fetch(`${BROWSER_SERVICE_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop', args: { profileId } }),
  });
  if (!res.ok) throw new Error(`Failed to delete session ${profileId}`);
  return res.json();
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');

  console.log('🧹 清理过时 browser sessions');
  if (dryRun) console.log('⚠️  DRY RUN 模式：不会实际删除');

  const status = await getStatus();
  const sessions = status?.body?.sessions || status?.sessions || [];

  if (sessions.length === 0) {
    console.log('✅ 没有 sessions 需要清理');
    return;
  }

  console.log(`\n📋 当前 sessions (${sessions.length}):`);

  let toDelete = [];

  for (const session of sessions) {
    const { profileId, owner_pid } = session;
    const hasOwner = owner_pid && owner_pid > 0;
    const alive = hasOwner ? isProcessAlive(owner_pid) : false;

    console.log(`  - ${profileId}${hasOwner ? ` (owner=${owner_pid})` : ''} ${alive ? '✅ 存活' : '❌ 已死'}`);

    if (!hasOwner || !alive) {
      toDelete.push(profileId);
      if (verbose) {
        console.log(`    → 标记删除：${!hasOwner ? '无 owner' : 'owner 已死亡'}`);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('\n✅ 所有 sessions 都是活跃的，无需清理');
    return;
  }

  console.log(`\n🗑️  将清理 ${toDelete.length} 个过时 sessions:`);
  toDelete.forEach(p => console.log(`  - ${p}`));

  if (dryRun) {
    console.log('\n⚠️  DRY RUN：未执行删除');
    return;
  }

  console.log('\n执行清理...');
  for (const profileId of toDelete) {
    try {
      await deleteSession(profileId);
      console.log(`  ✅ ${profileId} 已删除`);
    } catch (err) {
      console.error(`  ❌ ${profileId} 删除失败: ${err.message}`);
    }
  }

  console.log('\n✅ 清理完成');
}

main().catch(err => {
  console.error('❌ 失败:', err?.message || String(err));
  process.exit(1);
});
