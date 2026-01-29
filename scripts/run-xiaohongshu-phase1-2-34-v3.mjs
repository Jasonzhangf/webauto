import { runWorkflowById } from '../dist/modules/workflow/src/runner.js';
import { parseXhsCliArgs, phaseOrder } from '../dist/modules/workflow/blocks/helpers/xhsCliArgs.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureBaseServices } from './xiaohongshu/lib/services.mjs';

// 鐗堟湰绠＄悊
const VERSION = '3.0.0';
const REQUIRED_NODE_VERSION = 22;
// 鐜妫€鏌?
function checkEnvironment() {
  const currentVersion = parseInt(process.version.slice(1));

  if (currentVersion < REQUIRED_NODE_VERSION) {
    console.error(`❌ Node.js 版本过低`);
    console.error(`   当前版本: ${process.version}`);
    console.error(`   需要版本: >=${REQUIRED_NODE_VERSION}.0.0`);
    console.error(`   请访问 https://nodejs.org/ 下载并安装最新版`);
    process.exit(1);
  }

  // 妫€鏌ュ繀瑕佺殑鏋勫缓浜х墿
  const requiredPaths = [
    '../dist/modules/workflow/src/runner.js',
    '../dist/services',
    '../dist/sharedmodule'
  ];

  const missingPaths = [];
  for (const relPath of requiredPaths) {
    const absPath = fileURLToPath(new URL(relPath, import.meta.url));
    if (!existsSync(absPath)) {
      missingPaths.push(relPath);
    }
  }

  if (missingPaths.length > 0) {
    console.error(`鉂?缂哄皯蹇呰鐨勬瀯寤轰骇鐗╋紝璇峰厛杩愯: npm run build:services`);
    console.error(`   缂哄け鏂囦欢: ${missingPaths.join(', ')}`);
    process.exit(1);
  }
}

// 閿欒鎭㈠鏈哄埗
function ensureContainerIndex() {
  const rootIndex = resolve('container-library.index.json');
  if (existsSync(rootIndex)) return;
  const fallbackIndex = resolve('container-library', 'index.json');
  if (!existsSync(fallbackIndex)) return;
  try {
    writeFileSync(rootIndex, readFileSync(fallbackIndex));
    console.log(`[XHS][v3] Created container-library.index.json from container-library/index.json`);
  } catch (err) {
    console.warn(`[XHS][v3] Failed to create container-library.index.json: ${err?.message || err}`);
  }
}

function setupErrorHandlers() {
  process.on('unhandledRejection', (err) => {
    console.error('\n[FATAL] 鏈崟鑾风殑寮傚父:', err?.message || String(err));

    // 淇濆瓨宕╂簝鐘舵€?
    try {
      const crashDir = join(homedir(), '.webauto', 'logs');
      const crashFile = join(crashDir, 'crash-state.json');
      const crashData = {
        time: new Date().toISOString(),
        version: VERSION,
        error: err?.message || String(err),
        stack: err?.stack || 'N/A',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      };

      writeFileSync(crashFile, JSON.stringify(crashData, null, 2));
      console.error(`[FATAL] 宕╂簝淇℃伅宸蹭繚瀛樺埌: ${crashFile}`);
    } catch (saveErr) {
      // 蹇界暐淇濆瓨澶辫触
    }

    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n\n[XHS][v3] 鐢ㄦ埛涓柇锛屾鍦ㄩ€€鍑?..');
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    console.log('\n[XHS][v3] 鏀跺埌缁堟淇″彿锛屾鍦ㄩ€€鍑?..');
    process.exit(143);
  });
}

function isDebugEnabled() {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1' ||
    process.env.WEBAUTO_DEBUG_SCREENSHOT === '1'
  );
}

function normalizeGateBaseUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  // 閬垮厤璇厤锛歐EBAUTO_SEARCH_GATE_URL 鑻ュ寘鍚?/permit锛屼細瀵艰嚧 WaitSearchPermit 鎷煎嚭 /permit/permit
  return u.replace(/\/permit\/?$/, '');
}

async function checkHealth(url) {
  try {
    const res = await fetch(url, {
      signal: (AbortSignal).timeout ? (AbortSignal).timeout(2500) : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureSearchGate() {
  // SearchGate 榛樿绔彛 7790
  const gateBase = normalizeGateBaseUrl(process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790');
  if (gateBase && gateBase !== (process.env.WEBAUTO_SEARCH_GATE_URL || '')) {
    process.env.WEBAUTO_SEARCH_GATE_URL = gateBase;
  }

  const healthUrl = `${gateBase.replace(/\/$/, '')}/health`;
  const ok = await checkHealth(healthUrl);
  if (ok) {
    console.log(`[XHS][v3] 鉁?SearchGate healthy: ${healthUrl}`);
    return;
  }

  // 鑷姩鎷夎捣 SearchGate锛堝紑鍙戦樁娈靛繀闇€锛岄伩鍏?Phase2 鍗℃鍦?fetch failed 閲嶈瘯锛?
  console.log(`[XHS][v3] 鈿狅笍 SearchGate not reachable, starting: node scripts/search-gate-server.mjs`);
  const scriptPath = resolve('scripts/search-gate-server.mjs');
  const child = spawn('node', [scriptPath], {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      // 鑻ョ敤鎴烽厤缃簡 WEBAUTO_SEARCH_GATE_PORT锛屽垯灏婇噸
      WEBAUTO_SEARCH_GATE_PORT: process.env.WEBAUTO_SEARCH_GATE_PORT || '7790',
    },
  });

  // 绛夊緟 health锛堟渶澶?15s锛?
  const t0 = Date.now();
  while (Date.now() - t0 < 15_000) {
    // 鑻ュ瓙杩涚▼鎻愬墠閫€鍑猴紝鐩存帴鎶ラ敊
    if (child.exitCode !== null) break;
    if (await checkHealth(healthUrl)) {
      console.log(`[XHS][v3] 鉁?SearchGate started: ${healthUrl}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`SearchGate not available: ${healthUrl}`);
}

async function main() {
  // 璁剧疆閿欒澶勭悊
  setupErrorHandlers();

  // 妫€鏌ョ幆澧?
  checkEnvironment();
  ensureContainerIndex();

  // 寮€鍙戦樁娈甸粯璁ゅ紑鍚粨鏋勫寲 debug 鏃ュ織锛堝啓鍏?~/.webauto/logs/debug.jsonl锛夛紝渚夸簬浜嬪悗鍥炴斁銆?
  if (isDebugEnabled() && !process.env.DEBUG) process.env.DEBUG = '1';

  const parsed = parseXhsCliArgs(process.argv.slice(2));
  const {
    args,
    showHelp,
    showVersion,
    keyword,
    targetCount,
    linksCountArg,
    maxComments,
    env,
    sessionId,
    headless,
    dev,
    startAt,
    stopAfter,
  } = parsed;

  if (dev && process.env.WEBAUTO_DEV !== '1') {
    process.env.WEBAUTO_DEV = '1';
  }

  const printHelp = () => {
    console.log(`小红书采集工具 v${VERSION}

用法:
  xhs -k <keyword> [-n <count>] [-cn <count>] [--headless|--headful]
  xhs <keyword> [-n <count>] [-cn <count>]

参数:
  -k, --keyword       搜索关键词（必填，可用位置参数）
  -n, --count         本次新增采集数量（默认 100，去重后补齐）
  -cn, --commentCount 评论最大数量（不写=全部，写了=上限）
  --headless          无头模式：浏览器不显示（默认）
  --headful           有头模式：浏览器显示（覆盖 headless）
  --dev               开发模式：命中风控/安全点击直接失败（不做恢复）

说明:
  默认生产环境（prod），数据目录: ~/.webauto/download/xiaohongshu/prod/<keyword>/
  同关键词已有记录不会跳过，按 --count 新增并对已有帖子去重

示例:
  xhs -k "外贸"
  xhs "外贸" -n 50
  xhs -k "外贸" -n 50 -cn 200 --headful
`);
  };

  // 鐗堟湰淇℃伅
  if (showVersion) {
    console.log(`灏忕孩涔﹂噰闆嗗伐鍏?v${VERSION}`);
    console.log(`Node.js: ${process.version}`);
    console.log(`骞冲彴: ${process.platform}-${process.arch}`);
    return;
  }

  if (showHelp) {
    printHelp();
    return;
  }
  if (phaseOrder(startAt) > phaseOrder(stopAfter)) {
    console.error(`Invalid phase range: startAt=${startAt} > stopAfter=${stopAfter}`);
    process.exit(1);
  }

  if (!keyword) {
    console.error('Missing keyword. Use -k/--keyword or positional keyword.');
    process.exit(1);
  }
  if (!Number.isFinite(targetCount) || targetCount <= 0) {
    console.error(`Invalid --count/-n: ${String(args.count)}`);
    process.exit(1);
  }
  const targetCountMode = 'incremental';
  const phase2TargetCount =
    Number.isFinite(linksCountArg) && linksCountArg > 0
      ? Math.floor(linksCountArg)
      : Math.floor(targetCount);

  console.log(`[XHS][v3] Phase1 -> Phase2 -> Phase34`);
  console.log(
    `[XHS][v3] keyword="${keyword}" count=${targetCount} env="${env}" sessionId="${sessionId}" headless=${
      headless ? 'true' : 'false'
    } commentMax=${maxComments ?? 'all'} targetMode=${targetCountMode}`,
  );
  console.log(`[XHS][v3] startAt=${startAt} stopAfter=${stopAfter}`);

  await ensureBaseServices({ repoRoot: process.cwd() });

  // Phase1锛氫粎浼氳瘽 + 鐧诲綍锛堣鍙ｅ浐瀹氶珮锛?
  if (phaseOrder(startAt) <= 1 && phaseOrder(stopAfter) >= 1) {
    console.log(`\n[XHS][v3] Phase1 (session+login) ...`);
    const r1 = await runWorkflowById('xiaohongshu-phase1-v3', { sessionId, keyword, env, targetCount, headless });
    if (!r1.success) {
      console.error('[XHS][v3] Phase1 failed:', r1.errors);
      process.exit(1);
    }
    console.log(`[XHS][v3] Phase1 OK`);
  }
  if (stopAfter === 'phase1') {
    console.log(`\n[XHS][v3] Done (stopAfter=phase1)`);
    return;
  }

  // Phase2锛氭悳绱?+ 閾炬帴閲囬泦锛堝啓鐩?phase2-links.jsonl锛?
  if (phaseOrder(startAt) <= 2 && phaseOrder(stopAfter) >= 2) {
    console.log(`\n[XHS][v3] Phase2 (collect links) ...`);
    // Phase2 渚濊禆 SearchGate锛堣妭娴佷笌寮€鍙戦樁娈碘€滅姝㈣繛缁笁娆″悓 keyword鈥濊鍒欙級
    // 杩欓噷鑷姩纭繚 SearchGate 鍦ㄧ嚎锛岄伩鍏嶅嚭鐜?fetch failed 鐨勬棤鎰忎箟閲嶈瘯銆?
    await ensureSearchGate();
    console.log(`[XHS][v3] Phase2 target links=${phase2TargetCount} (final notes target=${targetCount})`);
    const r2 = await runWorkflowById('xiaohongshu-phase2-links-v3', { sessionId, keyword, env, targetCount: phase2TargetCount });
    if (!r2.success) {
      console.error('[XHS][v3] Phase2 failed:', r2.errors);
      process.exit(1);
    }
    const phase2Out = r2.results?.[r2.results.length - 1] || {};
    console.log(
      `[XHS][v3] Phase2 OK links=${phase2Out.finalCount ?? 'N/A'}/${phase2Out.targetCount ?? phase2TargetCount} path=${phase2Out.linksPath ?? 'N/A'}`,
    );
  }
  if (stopAfter === 'phase2') {
    console.log(`\n[XHS][v3] Done (stopAfter=phase2)`);
    return;
  }

  // Phase34锛氫粠 Phase2 links 閲囬泦璇︽儏+璇勮锛堣瘎璁?rotate4 澶?tab锛?
  if (phaseOrder(startAt) <= 34 && phaseOrder(stopAfter) >= 34) {
    console.log(`\n[XHS][v3] Phase34 (detail+comments from links, multi-note tabs) ...`);
    const r34 = await runWorkflowById('xiaohongshu-phase34-from-links-v3', {
      sessionId,
      keyword,
      env,
      targetCount,
      maxComments,
    });
    if (!r34.success) {
      console.error('[XHS][v3] Phase34 failed:', r34.errors);
      process.exit(1);
    }
    const phase34Out = r34.results?.[r34.results.length - 1] || {};
    console.log(
      `[XHS][v3] Phase34 OK notes=${phase34Out.finalPersistedCount ?? 'N/A'}/${phase34Out.targetCount ?? targetCount} dir=${phase34Out.keywordDir ?? 'N/A'}`,
    );
  }

  console.log(`\n[XHS][v3] Done`);
}

main().catch((err) => {
  console.error('[XHS][v3] Unexpected error:', err?.message || String(err));
  process.exit(1);
});


