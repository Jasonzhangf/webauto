#!/usr/bin/env node
/**
 * WebAuto 最小基础功能自测（跨平台迁移基线）
 *
 * 用法:
 *   node scripts/test/webauto-smoke.mjs
 *   node scripts/test/webauto-smoke.mjs --profile xhs-qa-1
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BIN = path.join(PROJECT_ROOT, 'bin', 'webauto.mjs');

const argv = process.argv.slice(2);
const profileId = argv.includes('--profile') ? argv[argv.indexOf('--profile') + 1] : 'xhs-qa-1';

let pass = 0;
let fail = 0;
let skip = 0;

function ok(block, name, detail = '') {
  pass += 1;
  console.log(`  ✅ [${block}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(block, name, detail = '') {
  fail += 1;
  console.log(`  ❌ [${block}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function skipIt(block, name, reason = '') {
  skip += 1;
  console.log(`  ⏭️  [${block}] ${name}${reason ? ` — ${reason}` : ''}`);
}

function toFileUrl(p) {
  return `file://${p}`;
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

async function testEnv() {
  console.log('\n📦 Block: env (运行环境)');
  ok('env', 'Node.js', process.versions.node);
  ok('env', 'platform', `${process.platform}/${process.arch}`);

  const home = process.env.HOME || process.env.USERPROFILE || '';
  fs.existsSync(home) ? ok('env', 'HOME exists', home) : bad('env', 'HOME exists', home);
  fs.existsSync(path.join(home, '.webauto')) ? ok('env', '~/.webauto exists') : bad('env', '~/.webauto exists');
  fs.existsSync(BIN) ? ok('env', 'bin/webauto.mjs exists') : bad('env', 'bin/webauto.mjs exists', BIN);

  const modules = [
    'modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs',
    'modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs',
    'modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs',
    'modules/camo-runtime/src/autoscript/action-providers/xhs/diagnostic-utils.mjs',
  ];
  for (const rel of modules) {
    try {
      await import(toFileUrl(path.resolve(PROJECT_ROOT, rel)));
      ok('env', `module load: ${path.basename(rel)}`);
    } catch (e) {
      bad('env', `module load: ${path.basename(rel)}`, String(e?.message || e).slice(0, 80));
    }
  }
}

async function testCamo() {
  console.log('\n🔧 Block: camo (浏览器运行时)');
  const h = await httpGet('http://127.0.0.1:7704/health', 3000);
  h.ok ? ok('camo', 'health :7704') : bad('camo', 'health :7704', h.body);

  const evalRes = await callCamo('evaluate', { profileId, script: '(() => 1 + 1)()' }, 5000);
  evalRes.ok && evalRes.data?.result === 2
    ? ok('camo', 'evaluate (1+1=2)', 'result=2')
    : bad('camo', 'evaluate (1+1=2)', JSON.stringify(evalRes.data).slice(0, 80));

  const ss = await callCamo('screenshot', { profileId }, 8000);
  const base64 = String(ss.data?.data || ss.data?.result?.data || '');
  if (ss.ok && base64.length > 0) {
    const size = Buffer.from(base64, 'base64').length;
    size > 1000 ? ok('camo', 'screenshot', `${size} bytes`) : bad('camo', 'screenshot', 'too small');
  } else {
    bad('camo', 'screenshot', JSON.stringify(ss.data).slice(0, 80));
  }

  const click = await callCamo('mouse:click', { profileId, x: 1, y: 1, button: 'left', clicks: 1 }, 5000);
  click.ok ? ok('camo', 'mouse:click') : bad('camo', 'mouse:click', JSON.stringify(click.data).slice(0, 80));

  const key = await callCamo('keyboard:press', { profileId, key: 'Escape' }, 5000);
  key.ok ? ok('camo', 'keyboard:press') : bad('camo', 'keyboard:press', JSON.stringify(key.data).slice(0, 80));
}

async function testBrowser() {
  console.log('\n🌐 Block: browser (基础交互)');
  const r = await callCamo(
    'evaluate',
    {
      profileId,
      script: '(() => ({ url: location.href, host: location.hostname, title: document.title, body: document.body?.tagName || "", w: window.innerWidth, h: window.innerHeight }))()',
    },
    6000,
  );
  const d = r.data?.result || {};
  r.ok && d.url ? ok('browser', 'location', String(d.url).slice(0, 80)) : bad('browser', 'location', JSON.stringify(r.data));
  d.body === 'BODY' ? ok('browser', 'DOM body=BODY') : bad('browser', 'DOM body=BODY', String(d.body || 'empty'));
  Number(d.w) > 0 && Number(d.h) > 0 ? ok('browser', 'viewport', `${d.w}x${d.h}`) : bad('browser', 'viewport', `${d.w}x${d.h}`);
}

async function testXhs() {
  console.log('\n📱 Block: xhs (最小业务能力)');

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
          rect: rect ? { w: Math.round(rect.width || 0), h: Math.round(rect.height || 0), x: Math.round(rect.x || 0), y: Math.round(rect.y || 0) } : null,
        };
      })()`,
    },
    6000,
  );

  const d = page.data?.result || {};
  if (!d.onXhs) {
    skipIt('xhs', 'on xiaohongshu page', `host=${d.host || 'unknown'}`);
    skipIt('xhs', 'selector checks', 'not on xhs');
    skipIt('xhs', 'like-target detection', 'not on xhs');
    return;
  }

  ok('xhs', 'on xiaohongshu page', d.host);
  d.hasDetail || d.hasFeed
    ? ok('xhs', 'page in feed/detail context', d.hasDetail ? 'detail' : 'feed')
    : skipIt('xhs', 'page in feed/detail context', 'unknown context');

  if (d.commentCount > 0) {
    ok('xhs', '.comment-item', `count=${d.commentCount}`);
    d.likeWrapperCount > 0 ? ok('xhs', '.like-wrapper', `count=${d.likeWrapperCount}`) : bad('xhs', '.like-wrapper', 'count=0');
    d.likeLottieCount > 0 ? ok('xhs', '.like-lottie', `count=${d.likeLottieCount}`) : bad('xhs', '.like-lottie', 'count=0');

    if (d.likeTargetFound) {
      ok('xhs', 'like-target detection', `${d.likeTargetTag}.${String(d.likeTargetClass).slice(0, 30)}`);
      const rw = Number(d.rect?.w || 0);
      const rh = Number(d.rect?.h || 0);
      rw > 0 && rh > 0
        ? ok('xhs', 'like-target rect', `${rw}x${rh} @ (${d.rect?.x},${d.rect?.y})`)
        : bad('xhs', 'like-target rect', JSON.stringify(d.rect));
      ok('xhs', 'like status detect', `liked=${Boolean(d.liked)}`);
    } else {
      bad('xhs', 'like-target detection', 'target not found in first comment');
    }
  } else {
    skipIt('xhs', '.comment-item', 'count=0');
    skipIt('xhs', '.like-wrapper', 'no comment');
    skipIt('xhs', '.like-lottie', 'no comment');
    skipIt('xhs', 'like-target detection', 'no comment');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  WebAuto Smoke Test — 最小基础功能一键检测');
  console.log('═══════════════════════════════════════════════');
  console.log(`  profile: ${profileId}`);
  console.log(`  time:    ${new Date().toISOString()}`);

  await testEnv();
  await testCamo();
  await testBrowser();
  await testXhs();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${pass} passed / ${fail} failed / ${skip} skipped / ${pass + fail + skip} total`);
  console.log('═══════════════════════════════════════════════');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
