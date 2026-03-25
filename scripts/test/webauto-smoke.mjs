#!/usr/bin/env node
/**
 * WebAuto XHS 脚本最小自测（单一真源）
 *
 * 说明：
 * - 只保留 XHS 脚本所需能力自测
 * - 移除 XHS 脚本之外的泛化测试
 *
 * 用法：
 *   node scripts/test/webauto-smoke.mjs
 *   node scripts/test/webauto-smoke.mjs --profile xhs-qa-1
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const profileId = argv.includes('--profile') ? argv[argv.indexOf('--profile') + 1] : 'xhs-qa-1';

let pass = 0;
let fail = 0;
let skip = 0;

function ok(name, detail = '') {
  pass += 1;
  console.log(`  ✅ [xhs-script] ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail = '') {
  fail += 1;
  console.log(`  ❌ [xhs-script] ${name}${detail ? ` — ${detail}` : ''}`);
}
function skipIt(name, reason = '') {
  skip += 1;
  console.log(`  ⏭️  [xhs-script] ${name}${reason ? ` — ${reason}` : ''}`);
}

async function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, status: 0, body: 'timeout' }), timeoutMs);
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode || 0, body });
      });
    });
    req.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, status: 0, body: e.message });
    });
    req.setTimeout(timeoutMs, () => {
      clearTimeout(timer);
      req.destroy();
      resolve({ ok: false, status: 0, body: 'timeout' });
    });
  });
}

async function callCamo(action, args = {}, timeoutMs = 8000) {
  const payload = JSON.stringify({ action, args });
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, data: { error: 'timeout' } }), timeoutMs);
    const req = http.request(
      'http://127.0.0.1:7704/command',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          clearTimeout(timer);
          try {
            const data = JSON.parse(body || '{}');
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode || 0, data });
          } catch {
            resolve({ ok: false, status: res.statusCode || 0, data: { error: body } });
          }
        });
      },
    );
    req.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, data: { error: e.message } });
    });
    req.write(payload);
    req.end();
  });
}

async function loadXhsModules() {
  const modules = [
    'modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs',
    'modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs',
    'modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs',
    'modules/camo-runtime/src/autoscript/action-providers/xhs/detail-flow-ops.mjs',
    'modules/camo-runtime/src/autoscript/action-providers/xhs/diagnostic-utils.mjs',
    'modules/camo-runtime/src/autoscript/xhs-unified-options.mjs',
  ];

  for (const rel of modules) {
    try {
      await import(`file://${path.resolve(PROJECT_ROOT, rel)}`);
      ok(`module load: ${path.basename(rel)}`);
    } catch (e) {
      bad(`module load: ${path.basename(rel)}`, String(e?.message || e).slice(0, 80));
    }
  }
}

async function testXhsScript() {
  console.log('\n📱 XHS Script Minimal Self-Test');

  // 1) runtime health (XHS 脚本依赖)
  const health = await httpGet('http://127.0.0.1:7704/health', 3000);
  if (!health.ok) {
    bad('camo runtime health (:7704)', health.body);
    skipIt('后续 XHS 脚本能力', 'runtime unhealthy');
    return;
  }
  ok('camo runtime health (:7704)');

  // 2) XHS modules (XHS 脚本代码依赖)
  await loadXhsModules();

  // 3) command channel + screenshot + input chain (XHS 操作链依赖)
  const evalRes = await callCamo('evaluate', { profileId, script: '(() => 1 + 1)()' }, 5000);
  evalRes.ok && evalRes.data?.result === 2
    ? ok('evaluate command channel', 'result=2')
    : bad('evaluate command channel', JSON.stringify(evalRes.data).slice(0, 80));

  const ss = await callCamo('screenshot', { profileId }, 8000);
  const base64 = String(ss.data?.data || ss.data?.result?.data || '');
  if (ss.ok && base64.length > 0) {
    const size = Buffer.from(base64, 'base64').length;
    size > 1000 ? ok('screenshot command', `${size} bytes`) : bad('screenshot command', 'too small');
  } else {
    bad('screenshot command', JSON.stringify(ss.data).slice(0, 80));
  }

  const click = await callCamo('mouse:click', { profileId, x: 1, y: 1, button: 'left', clicks: 1 }, 5000);
  click.ok ? ok('mouse:click command') : bad('mouse:click command', JSON.stringify(click.data).slice(0, 80));

  const key = await callCamo('keyboard:press', { profileId, key: 'Escape' }, 5000);
  key.ok ? ok('keyboard:press command') : bad('keyboard:press command', JSON.stringify(key.data).slice(0, 80));

  // 4) 当前页面 XHS 上下文与 like-target 选择器链
  const page = await callCamo(
    'evaluate',
    {
      profileId,
      script: `(() => {
        const host = String(location.hostname || '');
        const onXhs = host.includes('xiaohongshu.com');
        const hasDetail = !!document.querySelector('.note-detail-mask, .note-detail-page, .note-detail-dialog');
        const hasFeed = !!document.querySelector('.feeds-page, .note-item');
        const commentCount = document.querySelectorAll('.comment-item').length;
        const likeWrapperCount = document.querySelectorAll('.like-wrapper').length;
        const likeLottieCount = document.querySelectorAll('.like-lottie').length;

        const firstComment = document.querySelector('.comment-item');
        const _lw = firstComment ? firstComment.querySelector('.like-wrapper') : null;
        const target = _lw ? (_lw.querySelector('.like-lottie') || _lw) : null;
        const rect = target?.getBoundingClientRect?.();

        return {
          host, onXhs, hasDetail, hasFeed,
          commentCount, likeWrapperCount, likeLottieCount,
          likeTargetFound: !!target,
          likeTargetTag: target?.tagName || null,
          likeTargetClass: String(target?.className || ''),
          likeWrapperClass: String(_lw?.className || ''),
          liked: /active|liked|selected|is-liked/.test(String(_lw?.className || '')),
          rect: rect ? {
            w: Math.round(rect.width || 0),
            h: Math.round(rect.height || 0),
            x: Math.round(rect.x || 0),
            y: Math.round(rect.y || 0),
          } : null,
        };
      })()`,
    },
    7000,
  );

  const d = page.data?.result || {};
  if (!d.onXhs) {
    skipIt('xhs host check', `host=${d.host || 'unknown'}`);
    skipIt('xhs selector chain', 'not on xhs');
    skipIt('like-target detection', 'not on xhs');
    return;
  }

  ok('xhs host check', d.host);
  d.hasDetail || d.hasFeed
    ? ok('xhs page context', d.hasDetail ? 'detail' : 'feed')
    : skipIt('xhs page context', 'unknown context');

  if (d.commentCount > 0) {
    ok('.comment-item', `count=${d.commentCount}`);
    d.likeWrapperCount > 0 ? ok('.like-wrapper', `count=${d.likeWrapperCount}`) : bad('.like-wrapper', 'count=0');
    d.likeLottieCount > 0 ? ok('.like-lottie', `count=${d.likeLottieCount}`) : bad('.like-lottie', 'count=0');

    if (d.likeTargetFound) {
      ok('like-target detection', `${d.likeTargetTag}.${String(d.likeTargetClass).slice(0, 40)}`);
      const rw = Number(d.rect?.w || 0);
      const rh = Number(d.rect?.h || 0);
      rw > 0 && rh > 0
        ? ok('like-target rect', `${rw}x${rh} @ (${d.rect?.x},${d.rect?.y})`)
        : bad('like-target rect', JSON.stringify(d.rect));
      ok('like status detect', `liked=${Boolean(d.liked)}`);
    } else {
      bad('like-target detection', 'target not found in first comment');
    }
  } else {
    skipIt('.comment-item', 'count=0');
    skipIt('.like-wrapper', 'no comment');
    skipIt('.like-lottie', 'no comment');
    skipIt('like-target detection', 'no comment');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  WebAuto XHS Script Minimal Self-Test');
  console.log('═══════════════════════════════════════════════');
  console.log(`  profile: ${profileId}`);
  console.log(`  time:    ${new Date().toISOString()}`);

  await testXhsScript();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${pass} passed / ${fail} failed / ${skip} skipped / ${pass + fail + skip} total`);
  console.log('═══════════════════════════════════════════════');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
