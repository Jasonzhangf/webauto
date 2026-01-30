#!/usr/bin/env node
/**
 * ProfilePool CLI
 *
 * 用法：
 * - 新增一个 profile（按 keyword 递增）：node scripts/profilepool.mjs add "工作服"
 * - 查看/分配分片（默认命令）：node scripts/profilepool.mjs "工作服"
 * - 列表：node scripts/profilepool.mjs list "工作服"
 *
 * 规则：
 * - profileId 命名：<keyword>-<n>（例如 工作服-1, 工作服-2）
 * - pool 来源：扫描 ~/.webauto/profiles 下匹配前缀的目录
 */

import minimist from 'minimist';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { ensureBaseServices } from './xiaohongshu/lib/services.mjs';
import {
  addProfile,
  assignShards,
  ensureProfileDir,
  listProfilesForPool,
  resolveProfilesRoot,
} from './xiaohongshu/lib/profilepool.mjs';

import { execute as ensureServices } from '../dist/modules/xiaohongshu/app/src/blocks/Phase1EnsureServicesBlock.js';
import { execute as startProfile } from '../dist/modules/xiaohongshu/app/src/blocks/Phase1StartProfileBlock.js';
import { execute as monitorCookie } from '../dist/modules/xiaohongshu/app/src/blocks/Phase1MonitorCookieBlock.js';
import { execute as ensureLogin } from '../dist/modules/workflow/blocks/EnsureLoginBlock.js';

// Avoid crashing when piped output is closed early (e.g., `| head`)
process.stdout?.on?.('error', (err) => {
  if (err && err.code === 'EPIPE') process.exit(0);
});
process.stderr?.on?.('error', (err) => {
  if (err && err.code === 'EPIPE') process.exit(0);
});

function printUsage() {
  console.log('ProfilePool CLI');
  console.log('  node scripts/profilepool.mjs add <keyword> [--json]');
  console.log('  node scripts/profilepool.mjs list <keyword> [--json]');
  console.log('  node scripts/profilepool.mjs login <keyword> [--ensure-count N] [--timeout-sec 900] [--keep-session]');
  console.log('  node scripts/profilepool.mjs <keyword> [--json]   # 默认：assign');
}

function resolveHomeDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) throw new Error('无法获取用户主目录：HOME/USERPROFILE 未设置');
  return homeDir;
}

function resolvePoolStatusDir() {
  return path.join(resolveHomeDir(), '.webauto', 'profilepool');
}

async function controllerAction(action, payload, apiUrl) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function findContainer(node, pattern) {
  if (!node) return null;
  const id = node.id || node.defId || '';
  if (pattern.test(id)) return node;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const c of children) {
    const found = findContainer(c, pattern);
    if (found) return found;
  }
  return null;
}

async function checkLoginOnce(profileId, unifiedApiUrl) {
  let currentUrl = '';
  try {
    const urlRes = await controllerAction('browser:execute', { profile: profileId, script: 'location.href' }, unifiedApiUrl);
    currentUrl = urlRes?.result || urlRes?.data?.result || '';
  } catch {
    currentUrl = '';
  }

  const match = await controllerAction(
    'containers:match',
    {
      profile: profileId,
      ...(currentUrl ? { url: currentUrl } : {}),
      maxDepth: 2,
      maxChildren: 5,
    },
    unifiedApiUrl,
  ).catch(() => null);
  const tree = match?.snapshot?.container_tree || match?.container_tree || match?.data?.snapshot?.container_tree || null;

  const loginAnchor = findContainer(tree, /\.login_anchor$/);
  if (loginAnchor) return { isLoggedIn: true, matched: loginAnchor.id || loginAnchor.defId || '' };
  const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
  if (loginGuard) return { isLoggedIn: false, matched: loginGuard.id || loginGuard.defId || '' };
  return { isLoggedIn: false, matched: '' };
}

async function browserServiceCommand(action, args, serviceUrl) {
  const res = await fetch(`${serviceUrl}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false || data?.error) throw new Error(data?.error || 'browser-service error');
  return data;
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const json = args.json === true || args.json === 'true' || args.json === 1 || args.json === '1';

  const [cmdOrKeyword, maybeKeyword] = args._.map((x) => String(x || '').trim()).filter(Boolean);
  if (!cmdOrKeyword) {
    printUsage();
    process.exit(1);
  }

  const root = resolveProfilesRoot();

  if (cmdOrKeyword === 'add') {
    const keyword = String(maybeKeyword || '').trim();
    if (!keyword) {
      printUsage();
      process.exit(1);
    }
    const created = addProfile(keyword);
    const payload = { ok: true, keyword, ...created };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`✅ created: ${created.profileId}`);
      console.log(`   dir: ${created.profileDir}`);
      console.log(`   root: ${root}`);
    }
    return;
  }

  if (cmdOrKeyword === 'list') {
    const keyword = String(maybeKeyword || '').trim();
    if (!keyword) {
      printUsage();
      process.exit(1);
    }
    const profiles = listProfilesForPool(keyword);
    const payload = { ok: true, keyword, profiles, count: profiles.length, root };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`profilesRoot: ${root}`);
      console.log(`keyword: ${keyword}`);
      console.log(`count: ${profiles.length}`);
      profiles.forEach((p) => console.log(`- ${p}`));
    }
    return;
  }

  if (cmdOrKeyword === 'login') {
    const keyword = String(maybeKeyword || '').trim();
    if (!keyword) {
      printUsage();
      process.exit(1);
    }

    const ensureCount = args['ensure-count'] != null ? Math.max(0, Math.floor(Number(args['ensure-count']))) : 0;
    const timeoutSec = args['timeout-sec'] != null ? Math.max(30, Math.floor(Number(args['timeout-sec']))) : 900;
    const checkIntervalSec = args['check-interval-sec'] != null ? Math.max(1, Math.floor(Number(args['check-interval-sec']))) : 3;
    const scanIntervalMs = args['scan-interval-ms'] != null ? Math.max(3000, Math.floor(Number(args['scan-interval-ms']))) : 15000;
    const stableCount = args['stable-count'] != null ? Math.max(1, Math.floor(Number(args['stable-count']))) : 3;
    const keepSession = args['keep-session'] === true || args['keep-session'] === '1' || args['keep-session'] === 1;
    const skipLogged = args['skip-logged'] !== false; // default true

    // Ensure profile dirs exist (to show up in pool), optionally auto-create up to N.
    let profiles = listProfilesForPool(keyword);
    if (ensureCount > 0) {
      while (profiles.length < ensureCount) {
        const created = addProfile(keyword);
        profiles = listProfilesForPool(keyword);
        if (!created?.profileId) break;
      }
    }

    if (profiles.length === 0) {
      console.error('❌ pool 为空，先 add');
      console.error(`   node scripts/profilepool.mjs add "${keyword}"`);
      process.exit(2);
    }

    const unifiedApiUrl = String(args['unified-api'] || 'http://127.0.0.1:7701').trim();
    const browserServiceUrl = String(args['browser-service'] || 'http://127.0.0.1:7704').trim();

    console.log(`🔐 ProfilePool batch login`);
    console.log(`keyword: ${keyword}`);
    console.log(`profilesRoot: ${resolveProfilesRoot()}`);
    console.log(`count: ${profiles.length}`);
    console.log(`timeoutSec: ${timeoutSec}`);
    console.log(`skipLogged: ${skipLogged}`);

    // 1) Ensure services once
    await ensureBaseServices({ repoRoot: process.cwd() });
    await ensureServices();

    const results = [];
    for (const profileId of profiles) {
      ensureProfileDir(profileId);
      console.log(`\n➡️  profile=${profileId}`);

      try {
        await startProfile({ profile: profileId, headless: false, url: 'https://www.xiaohongshu.com' });

        const first = await checkLoginOnce(profileId, unifiedApiUrl).catch(() => ({ isLoggedIn: false, matched: '' }));
        if (first.isLoggedIn && skipLogged) {
          console.log(`   ✅ already logged in (${first.matched || 'login_anchor'})`);
        } else {
          console.log(`   ⏳ waiting manual login...`);
          console.log(`   - 请在打开的浏览器窗口里完成登录（扫码/短信等）`);
          const loginRes = await ensureLogin({
            sessionId: profileId,
            serviceUrl: unifiedApiUrl,
            maxWaitMs: timeoutSec * 1000,
            checkIntervalMs: checkIntervalSec * 1000,
          });
          if (!loginRes?.isLoggedIn) {
            throw new Error(loginRes?.error || 'login timeout');
          }
          console.log(`   ✅ logged in (${loginRes.matchedContainer || 'login_anchor'})`);
        }

        // Cookie stable save + autoCookies start
        const cookieRes = await monitorCookie({
          profile: profileId,
          unifiedApiUrl,
          browserServiceUrl,
          scanIntervalMs,
          stableCount,
        });
        console.log(`   🍪 cookie saved=${cookieRes.saved} path=${cookieRes.cookiePath}`);

        if (!keepSession) {
          await browserServiceCommand('stop', { profileId }, browserServiceUrl).catch(() => null);
        }

        results.push({
          profileId,
          ok: true,
          loggedIn: true,
          cookiePath: cookieRes.cookiePath,
          autoCookiesStarted: cookieRes.autoCookiesStarted,
          scanRounds: cookieRes.scanRounds,
        });
      } catch (e) {
        results.push({ profileId, ok: false, error: e?.message || String(e) });
        console.warn(`   ❌ ${e?.message || String(e)}`);
        if (!keepSession) {
          await browserServiceCommand('stop', { profileId }, browserServiceUrl).catch(() => null);
        }
      }
    }

    const summary = {
      ok: true,
      keyword,
      updatedAt: new Date().toISOString(),
      profiles,
      results,
    };

    // Write status file for "补登录" management
    const statusDir = resolvePoolStatusDir();
    const statusPath = path.join(statusDir, `${keyword}.login-status.json`);
    await fs.mkdir(statusDir, { recursive: true });
    await fs.writeFile(statusPath, JSON.stringify(summary, null, 2), 'utf8');

    if (json) {
      console.log(JSON.stringify({ ...summary, statusPath }, null, 2));
    } else {
      const okCount = results.filter((r) => r.ok).length;
      console.log(`\n✅ done ok=${okCount}/${results.length}`);
      console.log(`status: ${statusPath}`);
    }
    return;
  }

  // default: assign
  const keyword = cmdOrKeyword;
  const assignments = assignShards(keyword);
  const payload = { ok: true, keyword, shardCount: assignments.length, assignments, root };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`profilesRoot: ${root}`);
    console.log(`keyword: ${keyword}`);
    console.log(`shards: ${assignments.length}`);
    assignments.forEach((a) => console.log(`- ${a.profileId} => shard ${a.shardIndex}/${a.shardCount}`));
  }
}

main().catch((err) => {
  console.error('❌ profilepool failed:', err?.message || String(err));
  process.exit(1);
});
