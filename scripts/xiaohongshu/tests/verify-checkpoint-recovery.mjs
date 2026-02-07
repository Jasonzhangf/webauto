#!/usr/bin/env node

/**
 * verify-checkpoint-recovery.mjs
 *
 * 验证 checkpoint 回归点机制：
 * 1) detectXhsCheckpoint
 * 2) 人为制造“错误状态”（导航到一个带 xsec_token 的详情页）
 * 3) ensureXhsCheckpoint(target=search_ready) 触发回退
 * 4) 重复 N 轮，验证可回归
 *
 * 用法：
 *   node scripts/xiaohongshu/tests/verify-checkpoint-recovery.mjs --profile xiaohongshu_batch-2 --rounds 3
 */

import fs from 'node:fs';
import path from 'node:path';

import { controllerAction } from '../../../dist/modules/xiaohongshu/app/src/utils/controllerAction.js';
import { detectXhsCheckpoint, ensureXhsCheckpoint } from '../../../dist/modules/xiaohongshu/app/src/utils/checkpoints.js';

const UNIFIED_API = 'http://127.0.0.1:7701';

function parseArgs(argv) {
  const args = {
    profile: 'xiaohongshu_batch-2',
    rounds: 3,
    evidenceDir: '/tmp/webauto-checkpoint-evidence',
    keyword: process.env.XHS_PHASE2_KEYWORD || '小米造车'
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile' && argv[i + 1]) args.profile = argv[++i];
    else if (a === '--rounds' && argv[i + 1]) args.rounds = Number(argv[++i]);
    else if (a === '--evidence-dir' && argv[i + 1]) args.evidenceDir = argv[++i];
    else if (a === '--keyword' && argv[i + 1]) args.keyword = argv[++i];
  }
  return args;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function getCurrentUrl(sessionId) {
  try {
    const res = await controllerAction('browser:execute', {
      profile: sessionId,
      script: 'window.location.href'
    }, UNIFIED_API);
    return String(res?.result || '');
  } catch {
    return '';
  }
}

async function saveEvidence(baseDir, label, sessionId) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(baseDir, `${label}_${ts}`);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const shot = await controllerAction('browser:screenshot', {
      profile: sessionId,
      fullPage: false
    }, UNIFIED_API);
    if (shot?.data) {
      fs.writeFileSync(path.join(dir, 'screenshot.png'), Buffer.from(shot.data, 'base64'));
    }
  } catch (e) {
    fs.writeFileSync(path.join(dir, 'screenshot.error.txt'), String(e?.message || e));
  }

  try {
    const dom = await controllerAction('browser:execute', {
      profile: sessionId,
      script: 'document.documentElement.outerHTML'
    }, UNIFIED_API);
    fs.writeFileSync(path.join(dir, 'dom.html'), String(dom?.result || ''));
  } catch (e) {
    fs.writeFileSync(path.join(dir, 'dom.error.txt'), String(e?.message || e));
  }

  return dir;
}

function loadOneSafeUrlFromPhase2(keyword) {
  const linksPath = path.join(
    process.env.HOME || '.',
    `.webauto/download/xiaohongshu/debug/${keyword}/phase2-links.jsonl`
  );
  if (!fs.existsSync(linksPath)) {
    console.log(`⚠️  phase2-links.jsonl not found: ${linksPath}`);
    return null;
  }
  const lines = fs.readFileSync(linksPath, 'utf-8').split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  try {
    const first = JSON.parse(lines[0]);
    return typeof first?.safeUrl === 'string' ? first.safeUrl : null;
  } catch {
    return null;
  }
}

async function simulateDetail(sessionId, keyword) {
  const safeUrl = loadOneSafeUrlFromPhase2(keyword);
  if (!safeUrl) return false;

  await controllerAction('browser:navigate', {
    profile: sessionId,
    url: safeUrl
  }, UNIFIED_API);
  await sleep(3000);

  const url = await getCurrentUrl(sessionId);
  return url.includes('/explore/') && url.includes('xsec_token=');
}

async function main() {
  const { profile, rounds, evidenceDir, keyword } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(evidenceDir, { recursive: true });

  console.log('🔬 verify-checkpoint-recovery');
  console.log(`- profile: ${profile}`);
  console.log(`- rounds: ${rounds}`);
  console.log(`- evidenceDir: ${evidenceDir}`);
  console.log(`- keyword: ${keyword}`);

  // health
  try {
    await fetch(`${UNIFIED_API}/health`);
  } catch {
    console.error('❌ Unified API not healthy');
    process.exit(1);
  }

  const results = [];

  for (let i = 1; i <= rounds; i++) {
    console.log(`\n=== Round ${i}/${rounds} ===`);
    const before = await detectXhsCheckpoint({ sessionId: profile, serviceUrl: UNIFIED_API });
    console.log(`before: checkpoint=${before.checkpoint} stage=${before.stage} url=${before.url}`);

    const entered = await simulateDetail(profile, keyword);
    if (!entered) {
      console.log('⚠️  no safeUrl to simulate detail, skip');
      continue;
    }

    await saveEvidence(evidenceDir, `round${i}_before`, profile);

    const ensured = await ensureXhsCheckpoint({
      sessionId: profile,
      target: 'search_ready',
      serviceUrl: UNIFIED_API,
      timeoutMs: 15000,
      allowOneLevelUpFallback: true,
      evidence: { highlightMs: 1200 }
    });

    console.log(
      `ensure: success=${ensured.success} from=${ensured.from} reached=${ensured.reached} stage=${ensured.stage} url=${ensured.url}`
    );

    await saveEvidence(evidenceDir, `round${i}_after`, profile);

    const ok = ensured.reached === 'search_ready' || ensured.reached === 'home_ready';
    results.push({ round: i, ok, reached: ensured.reached });
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nResult: ${okCount}/${results.length} ok`);
  results.forEach((r) => console.log(`- round ${r.round}: ${r.ok ? 'OK' : 'FAIL'} reached=${r.reached}`));
  process.exit(okCount === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
