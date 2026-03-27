#!/usr/bin/env node
/**
 * WebAuto XHS 脚本最小自测（单一真源）
 *
 * 覆盖：
 *   Phase 0 - 环境依赖（node版本、camo版本、关键deps、vendor文件）
 *   Phase 1 - Camo 运行时连通性（health、evaluate/screenshot + anchor click/press）
 *   Phase 1.5 - submit_search 基础链路（可见输入框 -> 输入 -> Enter -> 结果锚点）
 *   Phase 2 - XHS 模块加载
 *   Phase 3 - XHS 页面上下文 & like-target selector 链
 *   Phase 4 - Feed-like 分层 block 配置校验（多关键词截断/每轮点赞数/操作链）
 *
 * 用法：
 *   node scripts/test/webauto-smoke.mjs
 *   node scripts/test/webauto-smoke.mjs --profile xhs-qa-1
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
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
  console.log(`  ✅ [${currentPhase}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail = '') {
  fail += 1;
  console.log(`  ❌ [${currentPhase}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function skipIt(name, reason = '') {
  skip += 1;
  console.log(`  ⏭️  [${currentPhase}] ${name}${reason ? ` — ${reason}` : ''}`);
}

// ══════════════════════════════════════════
// Phase 0: 环境依赖 & 版本
// ══════════════════════════════════════════

let currentPhase = 'env';

function testEnvironment() {
  currentPhase = 'env';
  console.log('\n📦 Environment & Dependencies');

  const req = createRequire(import.meta.url);
  const nodeVer = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split('.')[0], 10);
  nodeMajor >= 20
    ? ok('node version', nodeVer)
    : bad('node version', `${nodeVer} (need >=20)`);

  // @web-auto/camo
  try {
    const camoPkg = req(path.join(PROJECT_ROOT, 'node_modules/@web-auto/camo/package.json'));
    const camoVer = camoPkg.version || 'unknown';
    ok('@web-auto/camo', `v${camoVer}`);

    const minNode = (camoPkg.engines?.node || '').match(/(\d+)/)?.[1];
    if (minNode && nodeMajor < parseInt(minNode, 10)) {
      bad('camo engine check', `node ${nodeVer} < required ${camoPkg.engines.node}`);
    }

    const bins = camoPkg.bin || {};
    for (const [name, binPath] of Object.entries(bins)) {
      const resolved = path.join(PROJECT_ROOT, 'node_modules/@web-auto/camo', binPath);
      fs.existsSync(resolved)
        ? ok(`camo bin/${name}`, binPath)
        : bad(`camo bin/${name}`, `${binPath} missing`);
    }
  } catch (e) {
    bad('@web-auto/camo', `load failed: ${String(e.message || e).slice(0, 80)}`);
  }

  // webauto
  try {
    const webautoPkg = req(path.join(PROJECT_ROOT, 'package.json'));
    ok('webauto', `v${webautoPkg.version || 'unknown'}`);
  } catch (e) {
    bad('webauto', `package.json load failed: ${String(e.message || e).slice(0, 80)}`);
  }

  // key runtime deps
  const criticalDeps = ['ajv', 'iconv-lite', 'minimist'];
  for (const dep of criticalDeps) {
    try {
      const depPkg = req(path.join(PROJECT_ROOT, 'node_modules', dep, 'package.json'));
      ok(`dep ${dep}`, `v${depPkg.version || 'ok'}`);
    } catch {
      bad(`dep ${dep}`, 'not installed');
    }
  }

  // camo-runtime vendor
  const vendorDir = path.join(PROJECT_ROOT, 'modules/camo-runtime/src/autoscript');
  fs.existsSync(vendorDir)
    ? ok('camo-runtime vendor', 'exists')
    : bad('camo-runtime vendor', `${vendorDir} missing`);

  // xhs action provider files
  const xhsDir = path.join(vendorDir, 'action-providers/xhs');
  const requiredFiles = ['dom-ops.mjs', 'comments-ops.mjs', 'harvest-ops.mjs', 'detail-flow-ops.mjs', 'diagnostic-utils.mjs'];
  for (const f of requiredFiles) {
    fs.existsSync(path.join(xhsDir, f))
      ? ok(`xhs ${f}`, 'exists')
      : bad(`xhs ${f}`, 'missing');
  }
}

// ══════════════════════════════════════════
// Phase 1: Camo runtime connectivity
// ══════════════════════════════════════════

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

async function resolveVisibleAnchor(selectors, timeoutMs = 5000) {
  const list = Array.isArray(selectors) ? selectors : [selectors].filter(Boolean);
  if (list.length === 0) return { ok: false, reason: 'no_selectors' };
  const script = `(() => {
    const selectors = ${JSON.stringify(list)};
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx < 0 || cy < 0 || cx > viewport.width || cy > viewport.height) return false;
      return { rect, center: { x: cx, y: cy } };
    };
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const visible = isVisible(el);
      if (visible) {
        return { selector: sel, rect: visible.rect, center: visible.center, viewport };
      }
    }
    return { selector: null, reason: 'no_visible_anchor', viewport };
  })()`;
  const res = await callCamo('evaluate', { profileId, script }, timeoutMs);
  const data = res.data?.result || res.data?.data || res.data || {};
  if (!res.ok || !data?.selector) {
    return { ok: false, reason: data?.reason || 'no_visible_anchor', details: data };
  }
  return { ok: true, anchor: data };
}

async function testCamoRuntime() {
  currentPhase = 'camo';
  console.log('\n🔌 Camo Runtime');

  const health = await httpGet('http://127.0.0.1:7704/health', 3000);
  health.ok ? ok('health (:7704)') : bad('health (:7704)', health.body);

  if (!health.ok) {
    skipIt('evaluate', 'runtime unhealthy');
    skipIt('screenshot', 'runtime unhealthy');
    skipIt('mouse:click', 'runtime unhealthy');
    skipIt('keyboard:press', 'runtime unhealthy');
    return false;
  }

  const evalRes = await callCamo('evaluate', { profileId, script: '(() => 1 + 1)()' }, 5000);
  evalRes.ok && evalRes.data?.result === 2
    ? ok('evaluate', 'result=2')
    : bad('evaluate', JSON.stringify(evalRes.data).slice(0, 80));

  const ss = await callCamo('screenshot', { profileId }, 8000);
  const base64 = String(ss.data?.data || ss.data?.result?.data || '');
  if (ss.ok && base64.length > 0) {
    const size = Buffer.from(base64, 'base64').length;
    size > 1000 ? ok('screenshot', `${size} bytes`) : bad('screenshot', 'too small');
  } else {
    bad('screenshot', JSON.stringify(ss.data).slice(0, 80));
  }

  const anchor = await resolveVisibleAnchor(['#search-input', 'input.search-input', 'input']);
  if (!anchor.ok) {
    skipIt('mouse:click', `no visible anchor (${anchor.reason})`);
    skipIt('keyboard:press', `no visible anchor (${anchor.reason})`);
    return true;
  }

  const click = await callCamo('mouse:click', {
    profileId,
    x: anchor.anchor.center.x,
    y: anchor.anchor.center.y,
    button: 'left',
    clicks: 1,
  }, 5000);
  click.ok
    ? ok('mouse:click', `anchor=${anchor.anchor.selector}`)
    : bad('mouse:click', JSON.stringify(click.data).slice(0, 80));

  if (!click.ok) {
    skipIt('keyboard:press', 'anchor click failed');
    return true;
  }

  const key = await callCamo('keyboard:press', { profileId, key: 'Escape' }, 5000);
  key.ok ? ok('keyboard:press', `anchor=${anchor.anchor.selector}`) : bad('keyboard:press', JSON.stringify(key.data).slice(0, 80));

  return true;
}

async function waitForSearchResult(timeoutMs = 12000) {
  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    const res = await callCamo('evaluate', {
      profileId,
      script: `(() => {
        const href = String(location.href || '');
        const list = document.querySelector('.search-result-list, .feeds-container, .feeds-page');
        const items = document.querySelectorAll('#search-result .note-item:has(a.cover), .search-result-list .note-item:has(a.cover), .feeds-container .note-item:has(a.cover)');
        const itemCount = items.length;
        const ready = itemCount > 0 || !!list;
        return { href, itemCount, hasList: !!list, ready };
      })()`,
    }, 5000);

    const data = res.data?.result || {};
    if (data?.ready) {
      return { ok: true, ...data };
    }

    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, reason: 'timeout' };
}

async function testSubmitSearchBasic() {
  currentPhase = 'submit-search';
  console.log('\n🔎 Submit Search (Basic)');

  const anchor = await resolveVisibleAnchor(['#search-input', 'input.search-input']);
  if (!anchor.ok) {
    skipIt('submit_search', `no visible search input (${anchor.reason})`);
    return;
  }

  const click = await callCamo('mouse:click', {
    profileId,
    x: anchor.anchor.center.x,
    y: anchor.anchor.center.y,
    button: 'left',
    clicks: 1,
  }, 5000);
  if (!click.ok) {
    bad('submit_search focus click', JSON.stringify(click.data).slice(0, 80));
    return;
  }
  ok('submit_search focus click', `anchor=${anchor.anchor.selector}`);

  const selectAllKey = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
  await callCamo('keyboard:press', { profileId, key: selectAllKey }, 3000);
  await callCamo('keyboard:press', { profileId, key: 'Backspace' }, 3000);

  const keyword = 'tuanjian';
  const typeRes = await callCamo('keyboard:type', { profileId, text: keyword }, 8000);
  typeRes.ok ? ok('submit_search type', keyword) : bad('submit_search type', JSON.stringify(typeRes.data).slice(0, 80));

  const enterRes = await callCamo('keyboard:press', { profileId, key: 'Enter' }, 5000);
  enterRes.ok ? ok('submit_search enter', 'sent') : bad('submit_search enter', JSON.stringify(enterRes.data).slice(0, 80));

  const ready = await waitForSearchResult(12000);
  ready.ok
    ? ok('submit_search result', `items=${ready.itemCount}`)
    : bad('submit_search result', ready.reason || 'not_ready');
}

function parsePageListResult(res) {
  const data = res?.data?.result || res?.data?.data || res?.data || {};
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const activeIndex = data.activeIndex ?? pages.find((p) => p?.active)?.index ?? null;
  return { pages, activeIndex };
}

async function testTabOpenCompatibility() {
  currentPhase = 'tab-open';
  console.log('\n[Tab Open] New Tab / New Page Compatibility');

  const baseList = await callCamo('page:list', { profileId }, 8000);
  if (!baseList.ok) {
    bad('page:list (baseline)', JSON.stringify(baseList.data).slice(0, 80));
    return;
  }

  const baseInfo = parsePageListResult(baseList);
  const baseCount = baseInfo.pages.length;

  const tryOpen = async (actionName) => {
    const res = await callCamo(actionName, { profileId, url: 'https://www.xiaohongshu.com/explore' }, 12000);
    if (!res.ok) {
      const err = JSON.stringify(res.data || {}).slice(0, 120);
      if (err.toLowerCase().includes('unknown action')) {
        skipIt(`${actionName} open`, 'unsupported');
        return;
      }
      bad(`${actionName} open`, err);
      return;
    }
    ok(`${actionName} open`, 'ok');

    const afterList = await callCamo('page:list', { profileId }, 8000);
    if (!afterList.ok) {
      bad(`${actionName} page:list`, JSON.stringify(afterList.data).slice(0, 80));
      return;
    }
    const afterInfo = parsePageListResult(afterList);
    afterInfo.pages.length > baseCount
      ? ok(`${actionName} page:list`, `count=${afterInfo.pages.length}`)
      : bad(`${actionName} page:list`, `count=${afterInfo.pages.length} (no increase)`);

    const last = afterInfo.pages[afterInfo.pages.length - 1];
    if (last?.index === undefined || last?.index === null) {
      skipIt(`${actionName} page:switch`, 'no tab index');
      return;
    }

    const sw = await callCamo('page:switch', { profileId, index: last.index }, 10000);
    sw.ok
      ? ok(`${actionName} page:switch`, `index=${last.index}`)
      : bad(`${actionName} page:switch`, JSON.stringify(sw.data).slice(0, 80));

    if (baseInfo.activeIndex !== null && baseInfo.activeIndex !== undefined) {
      await callCamo('page:switch', { profileId, index: baseInfo.activeIndex }, 10000);
    }
  };

  await tryOpen('newTab');
  await tryOpen('newPage');
}

// ══════════════════════════════════════════
// Phase 2: XHS module load
// ══════════════════════════════════════════

async function testModuleLoad() {
  currentPhase = 'module';
  console.log('\n📦 XHS Module Load');

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
      ok(`load ${path.basename(rel)}`);
    } catch (e) {
      bad(`load ${path.basename(rel)}`, String(e?.message || e).slice(0, 80));
    }
  }
}

// ══════════════════════════════════════════
// Phase 4: Feed-like block layering checks
// ══════════════════════════════════════════

async function testFeedLikeLayering() {
  currentPhase = 'feed-like';
  console.log('\n🔁 Feed-like Block Layering');

  try {
    const templateMod = await import(`file://${path.resolve(PROJECT_ROOT, 'modules/camo-runtime/src/autoscript/xhs-feed-like-template.mjs')}`);
    const opsMod = await import(`file://${path.resolve(PROJECT_ROOT, 'modules/camo-runtime/src/autoscript/xhs-autoscript-ops.mjs')}`);
    const actionsMod = await import(`file://${path.resolve(PROJECT_ROOT, 'modules/camo-runtime/src/autoscript/action-providers/xhs/actions.mjs')}`);

    const build = templateMod?.buildXhsFeedLikeAutoscript;
    if (typeof build !== 'function') {
      bad('buildXhsFeedLikeAutoscript', 'missing export');
      return;
    }

    const script = build({
      profileId: 'xhs-qa-1',
      stage: 'feed-like',
      keyword: '团建',
      keywords: ['团建策划', '团队建设', '广东团建', '团建', '超额关键字'],
      maxLikesPerTab: 5,
      likeIntervalMinMs: 1000,
      likeIntervalMaxMs: 3000,
    });

    const ops = Array.isArray(script?.operations) ? script.operations : [];
    const feedLikeRound = ops.find((op) => op?.id === 'feed_like_round');
    const finishOp = ops.find((op) => op?.id === 'finish_after_feed_like');

    feedLikeRound
      ? ok('feed_like_round operation', 'exists')
      : bad('feed_like_round operation', 'missing');

    if (feedLikeRound) {
      const k = feedLikeRound?.params?.keywords;
      const likesPerRound = Number(feedLikeRound?.params?.likesPerRound || 0);

      Array.isArray(k)
        ? ok('feed_like params.keywords type', `array(${k.length})`)
        : bad('feed_like params.keywords type', typeof k);

      if (Array.isArray(k)) {
        k.length === 4
          ? ok('keywords truncation (max=4)', k.join(','))
          : bad('keywords truncation (max=4)', `got ${k.length}`);
        k[0] === '团建策划' && k[3] === '团建'
          ? ok('keywords order keep-first-4')
          : bad('keywords order keep-first-4', JSON.stringify(k));
      }

      likesPerRound === 5
        ? ok('likesPerRound from maxLikesPerTab', '5')
        : bad('likesPerRound from maxLikesPerTab', String(likesPerRound));

      feedLikeRound?.once === true
        ? ok('feed_like_round scheduling mode', 'single op (loop inside)')
        : bad('feed_like_round scheduling mode', `once=${String(feedLikeRound?.once)}`);
    }

    if (finishOp) {
      const deps = Array.isArray(finishOp.dependsOn) ? finishOp.dependsOn : [];
      deps.includes('feed_like_round')
        ? ok('finish op dependency', 'dependsOn feed_like_round')
        : bad('finish op dependency', JSON.stringify(deps));
    } else {
      bad('finish_after_feed_like operation', 'missing');
    }

    const actionMap = actionsMod?.XHS_ACTION_HANDLERS || actionsMod?.xhsActions || {};
    typeof actionMap?.xhs_feed_like === 'function'
      ? ok('action xhs_feed_like', 'registered')
      : bad('action xhs_feed_like', 'missing');
    typeof actionMap?.xhs_feed_like_tab_switch === 'function'
      ? ok('action xhs_feed_like_tab_switch', 'registered')
      : bad('action xhs_feed_like_tab_switch', 'missing');

    const feedOps = opsMod?.buildXhsFeedLikeOperations?.({
      keyword: '团建',
      keywords: ['a', 'b', 'c', 'd'],
      maxLikesPerTab: 5,
    }) || [];
    const direct = feedOps.find((op) => op?.id === 'feed_like_round');
    Number(direct?.params?.likesPerRound || 0) === 5
      ? ok('buildXhsFeedLikeOperations likesPerRound', '5')
      : bad('buildXhsFeedLikeOperations likesPerRound', JSON.stringify(direct?.params || {}));
  } catch (e) {
    bad('feed-like layering check', String(e?.message || e).slice(0, 120));
  }
}

// ══════════════════════════════════════════
// Phase 3: XHS page context & selectors
// ══════════════════════════════════════════

async function testXhsPageContext() {
  currentPhase = 'xhs';
  console.log('\n📱 XHS Page Context & Selectors');

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
    skipIt('xhs page context', 'not on xhs');
    skipIt('xhs selector chain', 'not on xhs');
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

// ══════════════════════════════════════════
// Main
// ══════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  WebAuto XHS Script Minimal Self-Test');
  console.log('═══════════════════════════════════════════════');
  console.log(`  profile: ${profileId}`);
  console.log(`  time:    ${new Date().toISOString()}`);

  // Phase 0: always runs (no camo needed)
  testEnvironment();

  // Phase 1: camo runtime (may skip later phases)
  const camoOk = await testCamoRuntime();

  // Phase 1.5: submit search (base ops)
  if (camoOk) {
    await testSubmitSearchBasic();
    await testTabOpenCompatibility();
  } else {
    currentPhase = 'submit-search';
    skipIt('submit_search', 'camo runtime unavailable');
  }

  // Phase 2: module load (no camo needed)
  await testModuleLoad();

  // Phase 3: page context (needs camo)
  if (camoOk) {
    await testXhsPageContext();
  } else {
    currentPhase = 'xhs';
    skipIt('XHS page context', 'camo runtime unavailable');
  }

  // Phase 4: feed-like block layering (no camo required)
  await testFeedLikeLayering();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${pass} passed / ${fail} failed / ${skip} skipped / ${pass + fail + skip} total`);
  console.log('═══════════════════════════════════════════════');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
