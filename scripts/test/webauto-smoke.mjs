#!/usr/bin/env node
/**
 * WebAuto Smoke Test — 基础功能一键检测
 *
 * Usage:
 *   node scripts/test/webauto-smoke.mjs                     # 全部测试
 *   node scripts/test/webauto-smoke.mjs --block env        # 只测环境
 *   node scripts/test/webauto-smoke.mjs --block camo        # 只测 camo
 *   node scripts/test/webauto-smoke.mjs --block daemon       # 只测 daemon
 *   node scripts/test/webauto-smoke.mjs --block browser      # 只测浏览器交互
 *   node scripts/test/webauto-smoke.mjs --block xhs          # 只测 XHS 业务
 *   node scripts/test/webauto-smoke.mjs --profile xhs-qa-1  # 指定 profile
 *   node scripts/test/webauto-smoke.mjs --json               # JSON 输出
 *
 * 测试 Block 清单:
 *   1. env       - 运行环境（Node.js、端口、路径、模块加载）
 *   2. camo      - Camo 后端服务（健康检查、evaluate、screenshot、click）
 *   3. daemon    - WebAuto daemon（健康检查、状态、jobs）
 *   4. browser   - 浏览器基础交互（DOM查询、selector、viewport）
 *   5. xhs       - XHS 业务（页面检测、selector、like-target、JS policy）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');   // webauto/scripts
const PROJECT_ROOT = path.resolve(__dirname, '../..'); // webauto
const BIN = path.join(PROJECT_ROOT, 'bin', 'webauto.mjs');

// ── CLI args ──
const argv = process.argv.slice(2);
const blockFilter = (argv.find(a => a === '--block') ? argv[argv.indexOf('--block') + 1] : null) || null;
const jsonMode = argv.includes('--json');
const profileArg = (argv.find(a => a === '--profile') ? argv[argv.indexOf('--profile') + 1] : null) || 'xhs-qa-1';

// ── Result collector ──
const results = [];
let passed = 0, failed = 0, skipped = 0;

function report(block, name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  results.push({ block, name, status, detail });
  if (jsonMode) return;
  const marker = ok ? '✅' : '❌';
  console.log(`  ${marker} [${block}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(block, name, reason = '') {
  skipped++;
  results.push({ block, name, status: 'SKIP', detail: reason });
  if (jsonMode) return;
  console.log(`  ⏭️  [${block}] ${name} — ${reason}`);
}

// ── Helpers ──
function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, status: 0, body: '' }), timeoutMs);
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { clearTimeout(timer); resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body }); });
    });
    req.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, status: 0, body: e.message }); });
    req.setTimeout(timeoutMs, () => { clearTimeout(timer); req.destroy(); resolve({ ok: false, status: 0, body: 'timeout' }); });
  });
}

/** Call camo-backend /command endpoint (same as callAPI in browser-service.mjs) */
async function callCamo(action, payload = {}, timeoutMs = 8000) {
  const port = process.env.CAMO_PORT || '7704';
  const url = `http://127.0.0.1:${port}/command`;
  return new Promise((resolve) => {
    const data = JSON.stringify({ action, args: payload });
    const timer = setTimeout(() => resolve({ ok: false, body: 'timeout' }), timeoutMs);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ ok: false, status: res.statusCode, body }); }
      });
    });
    req.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
    req.write(data);
    req.end();
  });
}

function camoDaemonPort() {
  return parseInt(process.env.WEBAUTO_DAEMON_PORT || process.env.CAMO_DAEMON_PORT || '7701', 10);
}

/** Resolve module path relative to PROJECT_ROOT */
function modulePath(rel) {
  return path.resolve(PROJECT_ROOT, rel);
}

// ═══════════════════════════════════════════════
// Block: env
// ═══════════════════════════════════════════════
async function testEnv() {
  console.log('\n📦 Block: env (运行环境)');
  const nodeVer = process.versions.node;
  report('env', `Node.js ${nodeVer}`, true, nodeVer);
  report('env', 'platform', true, process.platform);
  report('env', 'ARCH', true, process.arch);

  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  report('env', 'HOME dir exists', fs.existsSync(homeDir), homeDir);

  const webautoDir = path.join(homeDir, '.webauto');
  report('env', '~/.webauto exists', fs.existsSync(webautoDir));

  const stateDir = path.join(webautoDir, 'state');
  report('env', '~/.webauto/state exists', fs.existsSync(stateDir));

  report('env', 'bin/webauto.mjs exists', fs.existsSync(BIN), BIN);
  report('env', 'ESM supported', true, 'import.meta.url OK');

  // Module load test
  const modules = [
    ['dom-ops', 'modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs'],
    ['harvest-ops', 'modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs'],
    ['comments-ops', 'modules/camo-runtime/src/autoscript/action-providers/xhs/comments-ops.mjs'],
    ['persistence', 'modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs'],
    ['diagnostic-utils', 'modules/camo-runtime/src/autoscript/action-providers/xhs/diagnostic-utils.mjs'],
    ['xhs-unified-options', 'modules/camo-runtime/src/autoscript/xhs-unified-options.mjs'],
    ['js-policy', 'modules/camo-runtime/src/utils/js-policy.mjs'],
  ];
  for (const [name, rel] of modules) {
    try {
      await import(pathToFileURL(modulePath(rel)));
      report('env', `module load: ${name}`, true);
    } catch (e) {
      report('env', `module load: ${name}`, false, e.message.slice(0, 80));
    }
  }
}

function pathToFileURL(p) {
  return `file://${p}`;
}

// ═══════════════════════════════════════════════
// Block: camo
// ═══════════════════════════════════════════════
async function testCamo() {
  console.log('\n🔧 Block: camo (Camo 后端服务)');

  // Health checks
  const ports = [
    { name: 'camo-runtime', port: 7704 },
    { name: 'unified-api', port: 7701 },
  ];
  for (const { name, port } of ports) {
    const r = await httpGet(`http://127.0.0.1:${port}/health`, 3000);
    if (name === 'unified-api' && !r.ok) {
      skip('camo', `${name} health (:${port})`, 'daemon/unified-api not running (optional in smoke)');
      continue;
    }
    report('camo', `${name} health (:${port})`, r.ok, r.body ? String(r.body).slice(0, 60) : `HTTP ${r.status}`);
  }

  // evaluate API (1+1=2)
  const evalResult = await callCamo('evaluate', { profileId: profileArg, script: '(() => 1 + 1)()' }, 5000);
  const evalData = evalResult?.data?.result;
  report('camo', 'evaluate API (1+1=2)', evalResult.ok && evalData === 2, evalResult.ok ? `result=${evalData}` : String(evalResult.body).slice(0, 60));

  // screenshot API
  const ssResult = await callCamo('screenshot', { profileId: profileArg }, 8000);
  if (ssResult.ok) {
    const base64 = String(ssResult?.data?.data || ssResult?.data?.result?.data || ssResult?.data?.result || '');
    if (base64) {
      const buf = Buffer.from(base64, 'base64');
      report('camo', 'screenshot API (base64 decode)', buf.length > 1000, `${buf.length} bytes`);
    } else {
      report('camo', 'screenshot API (empty)', false, 'no base64 in response');
    }
  } else {
    report('camo', 'screenshot API', false, String(ssResult.body).slice(0, 60));
  }

  // mouse:click API
  const clickResult = await callCamo('mouse:click', { profileId: profileArg, x: 1, y: 1, button: 'left', clicks: 1 }, 5000);
  report('camo', 'mouse:click API', clickResult.ok, clickResult.ok ? 'ok' : String(clickResult.body).slice(0, 60));

  // keyboard:press API
  const pressResult = await callCamo('keyboard:press', { profileId: profileArg, key: 'Escape' }, 5000);
  report('camo', 'keyboard:press API', pressResult.ok, pressResult.ok ? 'ok' : String(pressResult.body).slice(0, 60));
}

// ═══════════════════════════════════════════════
// Block: daemon
// ═══════════════════════════════════════════════
async function testDaemon() {
  console.log('\n🤖 Block: daemon (WebAuto daemon)');

  const port = camoDaemonPort();
  const health = await httpGet(`http://127.0.0.1:${port}/health`, 3000);
  if (!health.ok) {
    skip('daemon', `daemon health (:${port})`, 'daemon not running (optional in smoke)');
    skip('daemon', 'daemon jobs list', 'daemon not healthy');
    return;
  }
  report('daemon', `daemon health (:${port})`, true, health.body?.slice(0, 60) || 'ok');

  const jobsResult = await httpGet(`http://127.0.0.1:${port}/api/v1/jobs`, 3000);
  const jobs = jobsResult.body?.jobs || [];
  report('daemon', `daemon jobs list (${jobs.length} jobs)`, jobsResult.ok);
}

// ═══════════════════════════════════════════════
// Block: browser
// ═══════════════════════════════════════════════
async function testBrowser() {
  console.log('\n🌐 Block: browser (浏览器基础交互)');

  // location
  const loc = await callCamo('evaluate', { profileId: profileArg, script: '(() => ({ url: location.href, title: document.title, hostname: location.hostname }))()' }, 6000);
  const locData = loc?.data?.result;
  report('browser', 'evaluate: location', loc.ok && !!locData?.url, locData?.url?.slice(0, 80) || 'failed');

  // DOM structure
  const dom = await callCamo('evaluate', { profileId: profileArg, script: '(() => ({ body: document.body ? document.body.tagName : "none", hasHead: !!document.head, childCount: document.body?.children?.length || 0 }))()' }, 6000);
  const domData = dom?.data?.result;
  report('browser', 'DOM structure', dom.ok && domData?.body === 'BODY', `body=${domData?.body} children=${domData?.childCount}`);

  // viewport
  const vp = await callCamo('evaluate', { profileId: profileArg, script: '(() => ({ width: window.innerWidth, height: window.innerHeight }))()' }, 6000);
  const vpData = vp?.data?.result;
  report('browser', 'viewport', vp.ok && (vpData?.width || 0) > 0, `${vpData?.width}x${vpData?.height}`);
}

// ═══════════════════════════════════════════════
// Block: xhs
// ═══════════════════════════════════════════════
async function testXhs() {
  console.log('\n📱 Block: xhs (XHS 业务逻辑)');

  // Module logic tests (no browser needed)
  // 1. resolveXhsOutputContext
  try {
    const { resolveXhsOutputContext } = await import(pathToFileURL(modulePath('modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs')));
    const ctx = resolveXhsOutputContext({ params: { keyword: 'smoke-test', env: 'debug' }, noteId: 'note-123' });
    report('xhs', 'resolveXhsOutputContext', ctx.keyword === 'smoke-test' && ctx.env === 'debug', `keyword=${ctx.keyword} env=${ctx.env}`);
  } catch (e) {
    report('xhs', 'resolveXhsOutputContext', false, e.message.slice(0, 60));
  }

  // 2. normalizeInlineText
  try {
    const { normalizeInlineText } = await import(pathToFileURL(modulePath('modules/camo-runtime/src/autoscript/action-providers/xhs/utils.mjs')));
    report('xhs', 'normalizeInlineText', normalizeInlineText('  hello   world  ') === 'hello world');
  } catch (e) {
    report('xhs', 'normalizeInlineText', false, e.message.slice(0, 60));
  }

  // 3. JS policy
  try {
    const { detectForbiddenJsAction } = await import(pathToFileURL(modulePath('modules/camo-runtime/src/utils/js-policy.mjs')));
    report('xhs', 'js-policy: .click() blocked', detectForbiddenJsAction('el.click()') === 'dom_click');
    report('xhs', 'js-policy: .dispatchEvent() blocked', detectForbiddenJsAction('el.dispatchEvent(e)') === 'dispatch_event');
    report('xhs', 'js-policy: .scrollIntoView() blocked', detectForbiddenJsAction('el.scrollIntoView()') === 'js_scroll_into_view');
    report('xhs', 'js-policy: safe script passes', detectForbiddenJsAction('document.querySelector("div")') === null);
  } catch (e) {
    report('xhs', 'js-policy', false, e.message.slice(0, 60));
  }

  // 4. Browser-based XHS tests (need XHS page)
  const loc = await callCamo('evaluate', { profileId: profileArg, script: '(() => ({ hostname: String(location.hostname || ""), url: location.href.slice(0, 80) }))()' }, 5000);
  const locData = loc?.data?.result; const hostname = locData?.hostname || ""; const onXHS = hostname.includes('xiaohongshu.com');

  if (!onXHS) {
    skip('xhs', 'XHS page check', `on ${hostname}`);
    skip('xhs', 'XHS selectors', 'not on XHS');
    skip('xhs', 'like-target detection', 'not on XHS');
    return;
  }
  report('xhs', 'on XHS page', true, hostname);

  // XHS selectors（按页面上下文分组，避免误报）
  const selScript = `(() => {
    const isDetail = !!document.querySelector('.note-detail-mask, .note-detail-page, .note-detail-dialog');
    const isFeed = !!document.querySelector('.feeds-page, .note-item');
    const checks = [];
    if (isFeed) {
      checks.push({ selector: '.feeds-page', required: true, found: !!document.querySelector('.feeds-page') });
      checks.push({ selector: '.note-item', required: true, found: !!document.querySelector('.note-item') });
    }
    if (isDetail) {
      checks.push({ selector: '.note-detail-mask|.note-detail-page|.note-detail-dialog', required: true, found: true });
      checks.push({ selector: '.comment-item', required: true, found: !!document.querySelector('.comment-item') });
      checks.push({ selector: '.like-wrapper', required: true, found: !!document.querySelector('.like-wrapper') });
      checks.push({ selector: '.like-lottie', required: true, found: !!document.querySelector('.like-lottie') });
    }
    return { isDetail, isFeed, checks };
  })()`;
  const sel = await callCamo('evaluate', { profileId: profileArg, script: selScript }, 6000);
  const selData = sel?.data?.result;
  if (sel.ok && selData && Array.isArray(selData.checks)) {
    const pageCtx = selData.isDetail ? 'detail' : (selData.isFeed ? 'feed' : 'unknown');
    if (pageCtx === 'unknown') {
      skip('xhs', 'page context', 'unknown (selector context not matched, continue with like-target probe)');
    } else {
      report('xhs', 'page context', true, pageCtx);
    }
    for (const item of selData.checks) {
      report('xhs', `selector: ${item.selector}`, item.found, item.found ? 'found' : 'missing in current context');
    }
  } else {
    report('xhs', 'selector check', false, 'evaluate failed');
  }

  // Like-target detection (模拟 readLikeTargetByCommentId 核心逻辑)
  const likeScript = `(() => {
    const node = document.querySelector('.comment-item');
    if (!node) return { found: false, reason: 'no_comment_item' };
    const _lw = node.querySelector('.like-wrapper');
    const likeBtn = _lw ? (_lw.querySelector('.like-lottie') || _lw) : null;
    if (!(likeBtn instanceof Element)) return { found: false, reason: 'no_like_btn', hasWrapper: !!_lw };
    const rect = likeBtn.getBoundingClientRect();
    const className = String(_lw?.className || '');
    const liked = /active|liked|selected|is-liked/.test(className);
    return {
      found: true, liked,
      likeWrapperClass: className.slice(0, 40),
      targetTag: likeBtn.tagName,
      targetCls: String(likeBtn.className || '').slice(0, 40),
      rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
      center: { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) },
    };
  })()`;
  const lt = await callCamo('evaluate', { profileId: profileArg, script: likeScript }, 6000);
  const ltData = lt?.data?.result;
  report('xhs', 'like-target detection', ltData?.found === true, ltData?.reason || `target=${ltData?.targetTag}.${ltData?.targetCls}`);
  if (ltData?.found) {
    report('xhs', 'like-target rect', ltData.rect?.w > 0 && ltData.rect?.h > 0, `${ltData.rect?.w}x${ltData.rect?.h} @ (${ltData.rect?.x || 0},${ltData.rect?.y || 0})`);
    report('xhs', 'like-status detection', typeof ltData.liked === 'boolean', `liked=${ltData.liked}`);
  }
}

// ═══════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  WebAuto Smoke Test — 基础功能一键检测');
  console.log('═══════════════════════════════════════════════');
  console.log(`  profile: ${profileArg}`);
  console.log(`  filter:  ${blockFilter || 'all blocks'}`);
  console.log(`  time:    ${new Date().toISOString()}`);

  if (blockFilter === null || blockFilter === 'env') await testEnv();
  if (blockFilter === null || blockFilter === 'camo') await testCamo();
  if (blockFilter === null || blockFilter === 'daemon') await testDaemon();
  if (blockFilter === null || blockFilter === 'browser') await testBrowser();
  if (blockFilter === null || blockFilter === 'xhs') await testXhs();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${skipped} skipped / ${results.length} total`);
  console.log('═══════════════════════════════════════════════');

  if (jsonMode) {
    console.log(JSON.stringify({ passed, failed, skipped, total: results.length, results }, null, 2));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(2);
});
