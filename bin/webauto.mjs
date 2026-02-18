#!/usr/bin/env node
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.webauto', 'cli-state.json');

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { initialized: false, version: null };
  }
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

function isGlobalInstall() {
  // Check if running from global node_modules
  const execPath = process.argv[1] || '';
  const npmPrefix = String(process.env.NPM_CONFIG_PREFIX || '').trim();
  return execPath.includes('node_modules/@web-auto/webauto') || 
         execPath.includes('/opt/homebrew/lib/node_modules') ||
         execPath.includes('/usr/local/lib/node_modules') ||
         (npmPrefix ? execPath.includes(npmPrefix) : false) ||
         !existsSync(path.join(ROOT, '.git'));
}

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function printMainHelp() {
  console.log(`webauto CLI

Usage:
  webauto --help
  webauto account --help
  webauto ui console --help
  webauto xhs --help

Core Commands:
  webauto account <list|sync|add|get|update|delete|login|sync-alias> [options]
  webauto ui console [--build] [--install] [--check]
  webauto ui test <scenario> [options]
  webauto xhs install [--download-browser] [--download-geoip] [--ensure-backend]
  webauto xhs unified [xhs options...]
  webauto xhs status [--run-id <id>] [--json]
  webauto xhs orchestrate [xhs options...]

Build & Release:
  webauto build:dev        # Local link mode
  webauto build:release    # Prepare npm release

Examples (standard):
  webauto account add --platform xiaohongshu --alias 主号
  webauto account list
  webauto account login xhs-0001 --url https://www.xiaohongshu.com
  webauto account sync-alias xhs-0001
  webauto ui console --check
  webauto ui console --build
  webauto ui console --install
  webauto ui test env-check
  webauto ui test account-flow --profile test-001
  webauto ui test config-save --output ./report.json
  webauto ui test crawl-run --keyword "测试" --target 10
  webauto xhs install --ensure-backend
  webauto xhs unified --profile xiaohongshu-batch-1 --keyword "seedance2.0" --max-notes 100 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛逼" --env debug --tab-count 4

Tips:
  - xhs 命令会转发到 apps/webauto/entry/xhs-*.mjs
  - account 命令会转发到 apps/webauto/entry/account.mjs
  - 全量参数请看: webauto xhs --help
`);
}

function printUiConsoleHelp() {
  console.log(`webauto ui console

Usage:
  webauto ui console [--build] [--install] [--check] [--no-daemon]
  webauto ui test <scenario> [options]

Options:
  --check       只检查构建/依赖状态，不启动 UI
  --build       缺少构建产物时自动构建
  --install     缺少依赖时自动安装
  --no-daemon   前台模式运行（不后台守护）

Test Scenarios:
  env-check     环境检查（camo CLI + 服务健康）
  account-flow  账户创建/登录流程测试
  config-save   配置导入/导出测试
  crawl-run     完整爬取流程测试（dry-run 模式）

Test Options:
  --profile <id>   测试用 profile ID
  --keyword <kw>   测试关键词
  --target <n>     目标数量
  --headless       无头模式
  --output <path>  输出 JSON 报告路径

Examples:
  webauto ui console --check
  webauto ui console --build
  webauto ui console --install
  webauto ui test env-check
  webauto ui test account-flow --profile test-001
  webauto ui test config-save --output ./report.json
  webauto ui test crawl-run --keyword "测试" --target 10 --headless
`);
}

function printXhsHelp() {
  console.log(`webauto xhs

Usage:
  webauto xhs install [--download-browser] [--download-geoip] [--ensure-backend]
  webauto xhs unified --profile <id> --keyword <kw> [options...]
  webauto xhs status [--run-id <id>] [--json]
  webauto xhs orchestrate --profile <id> --keyword <kw> [options...]

Subcommands:
  install      运行 xhs-install，检查/安装 camoufox、geoip，按需拉起 backend
  unified      运行统一脚本（搜索 + 打开详情 + 评论抓取 + 点赞）
  status       查询当前任务状态与错误摘要（支持 runId 详情）
  orchestrate  运行编排入口（默认调用 unified 模式）

Unified Required:
  --profile <id>     配置好的 camo profile（示例: xiaohongshu-batch-1）
  --keyword <kw>     搜索关键词

Unified Common Options:
  --max-notes <n>          目标帖子数，默认 30
  --total-notes <n>        多账号总目标数（按账号自动分片）
  --total-target <n>       total-notes 别名
  --parallel               启用多账号并行执行
  --concurrency <n>        并行度（默认=账号数）
  --plan-only              仅生成分片计划，不执行
  --tab-count <n>          轮询 tab 数，默认 4
  --throttle <ms>          操作节流，默认 500
  --note-interval <ms>     帖子间等待，默认 900
  --env <name>             输出环境目录，默认 debug
  --output-root <path>     自定义输出根目录
  --dry-run                干跑（禁用点赞/回复）
  --no-dry-run             强制非干跑

Comment Crawl Options:
  --do-comments <bool>       是否抓评论，默认 true
  --persist-comments <bool>  是否落盘评论，默认 true（dry-run 下默认 false）

Like Options:
  --do-likes <bool>          是否启用点赞，默认 false
  --like-keywords "<k1,k2>"  点赞关键词（命中评论触发）
  --max-likes <n>            每轮最多点赞数，默认 2
  --match-mode any|all       关键词匹配模式，默认 any
  --match-min-hits <n>       最低命中词数，默认 1
  --match-keywords "<...>"   匹配关键词集合（默认回落到 keyword）

Optional Advanced:
  --do-reply <bool>          是否回复（默认 false）
  --reply-text "<text>"      回复文案（默认: 感谢分享，已关注）
  --do-ocr <bool>            是否启用 OCR（默认 false）
  --ocr-command "<cmd>"      OCR 命令路径
  --input-mode protocol|...  输入模式（默认 protocol）

Standard Workflows:
  1) 初始化与后端检查
     webauto xhs install --download-geoip --ensure-backend

  2) 全功能采集（搜索 + 评论 + 点赞）
     webauto xhs unified --profile xiaohongshu-batch-1 --keyword "seedance2.0" --max-notes 100 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛逼" --env debug --tab-count 4

  3) 只做搜索 + 评论抓取（不点赞）
     webauto xhs unified --profile xiaohongshu-batch-1 --keyword "seedance2.0" --max-notes 50 --do-comments true --persist-comments true --do-likes false --env debug

  4) 点赞策略增强（多关键词 + 命中阈值）
     webauto xhs unified --profile xiaohongshu-batch-1 --keyword "deepseek新模型" --max-notes 100 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛逼,真敬业,太强了" --match-mode any --match-min-hits 1 --max-likes 3 --env debug --tab-count 4

  5) 多账号并行分片（总量100，3账号并发）
     webauto xhs unified --profiles xiaohongshu-batch-1,xiaohongshu-batch-2,xiaohongshu-batch-3 --keyword "seedance2.0" --total-notes 100 --parallel --concurrency 3 --do-comments true --persist-comments true --do-likes true --like-keywords "真牛逼" --env debug --tab-count 4

  6) 查看运行状态与错误
     webauto xhs status
     webauto xhs status --run-id <runId> --json

Output:
  默认目录: ~/.webauto/download/xiaohongshu/<env>/<keyword>/
  典型产物:
    - <noteId>/comments.jsonl
    - like-evidence/<noteId>/summary-*.json
    - .like-state.jsonl
`);
}

function printAccountHelp() {
  console.log(`webauto account

Usage:
  webauto account --help
  webauto account list [--json]
  webauto account list --records [--json]
  webauto account add [--platform <name>] [--alias <alias>] [--name <name>] [--username <username>] [--profile <id>] [--fingerprint <id>] [--json]
  webauto account get <id|alias> [--json]
  webauto account update <id|alias> [--alias <alias>|--clear-alias] [--name <name>] [--username <name>] [--profile <id>] [--fingerprint <id>] [--status active|disabled|archived] [--json]
  webauto account delete <id|alias> [--delete-profile] [--delete-fingerprint] [--json]
  webauto account login <id|alias> [--url <url>] [--sync-alias] [--json]
  webauto account sync-alias <id|alias> [--selector <css>] [--alias <value>] [--json]
  webauto account sync <profileId|all> [--json]

Examples:
  webauto account list
  webauto account sync all
  webauto account list --records
  webauto account login xiaohongshu-batch-1 --url https://www.xiaohongshu.com
`);
}

function exists(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

async function run(cmd, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

async function runInDir(dir, cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: dir,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

function checkDesktopConsoleDeps() {
  // Check for electron in various locations:
  // 1. Global npm root (when installed globally alongside webauto)
  // 2. Package's own node_modules
  // 3. apps/desktop-console/node_modules (local dev)
  const globalRoot = path.resolve(ROOT, '..', '..');
  return (
    exists(path.join(globalRoot, 'electron')) ||
    exists(path.join(ROOT, 'node_modules', 'electron')) ||
    exists(path.join(ROOT, 'apps', 'desktop-console', 'node_modules', 'electron'))
  );
}

function checkDesktopConsoleBuilt() {
  return exists(path.join(ROOT, 'apps', 'desktop-console', 'dist', 'renderer', 'index.html'));
}

function checkServicesBuilt() {
  return exists(path.join(ROOT, 'dist', 'modules')) && exists(path.join(ROOT, 'dist', 'services'));
}

async function ensureDepsAndBuild() {
  console.log('[webauto] First run from global install, setting up...');
  
  // Check if we have desktop-console source
  const appDir = path.join(ROOT, 'apps', 'desktop-console');
  if (!exists(appDir)) {
    console.error('❌ desktop-console source not found in package');
    process.exit(1);
  }

  // Install deps if needed
  if (!checkDesktopConsoleDeps()) {
    console.log('[webauto] Installing desktop-console dependencies...');
    await runInDir(appDir, npmBin(), ['install']);
  }

  // Build if needed  
  if (!checkDesktopConsoleBuilt()) {
    console.log('[webauto] Building desktop-console...');
    await runInDir(appDir, npmBin(), ['run', 'build']);
  }

  // Mark as initialized
  const pkgJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  saveState({ initialized: true, version: pkgJson.version });
  console.log('[webauto] Setup complete!');
}

async function uiConsole({ build, install, checkOnly }) {
  const okServices = checkServicesBuilt();
  const okDeps = checkDesktopConsoleDeps();
  const okUiBuilt = checkDesktopConsoleBuilt();

  if (checkOnly) {
    console.log(`[check] repoRoot: ${ROOT}`);
    console.log(`[check] dist/services: ${okServices ? 'OK' : 'MISSING'}`);
    console.log(`[check] desktop-console deps: ${okDeps ? 'OK' : 'MISSING'}`);
    console.log(`[check] desktop-console dist: ${okUiBuilt ? 'OK' : 'MISSING'}`);
    console.log(`[check] isGlobalInstall: ${isGlobalInstall()}`);
    return;
  }

  // For global install, auto-setup on first run
  if (isGlobalInstall()) {
    const state = loadState();
    const pkgJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    if (!state.initialized || state.version !== pkgJson.version) {
      await ensureDepsAndBuild();
    }
  } else {
    // Local dev mode - require explicit build
  if (!okServices) {
    if (!build) {
      console.error('❌ missing dist/ (services/modules). Run: npm run build:services');
      process.exit(2);
    }
    await run(npmBin(), ['run', 'build:services']);
  }
  }

  if (!okDeps) {
    // For global install, okDeps is always true since we check global electron
    // For local dev, require explicit --install or --build
    if (!isGlobalInstall() && !install && !build) {
      console.error('❌ missing apps/desktop-console/node_modules. Run: npm --prefix apps/desktop-console install');
      process.exit(2);
    }
    if (!isGlobalInstall()) {
      await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['install']);
    }
  }

  if (!okUiBuilt) {
    if (!build) {
      console.error('❌ missing apps/desktop-console/dist. Run: npm --prefix apps/desktop-console run build');
      process.exit(2);
    }
    await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['run', 'build']);
  }

  await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['start']);
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const args = minimist(process.argv.slice(2), {
    boolean: ['help', 'build', 'install', 'check', 'full', 'link'],
    alias: { h: 'help' },
  });

  const cmd = String(args._[0] || '').trim();
  const sub = String(args._[1] || '').trim();

  if (args.help) {
    if (cmd === 'account') {
      printAccountHelp();
      return;
    }
    if (cmd === 'ui' && sub === 'console') {
      printUiConsoleHelp();
      return;
    }
    if (cmd === 'xhs') {
      printXhsHelp();
      return;
    }
    printMainHelp();
    return;
  }

  if (!cmd) {
    printMainHelp();
    return;
  }

  // build:dev - local development mode
  if (cmd === 'build:dev') {
    console.log('[webauto] Running local dev setup...');
    await run(npmBin(), ['run', 'build:services']);
    await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['install']);
    await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['run', 'build']);
    console.log('[webauto] Dev setup complete');
    return;
  }

  // build:release - prepare for npm publish
  if (cmd === 'build:release') {
    console.log('[webauto] Building release version...');
    await run(npmBin(), ['run', 'build:services']);
    // Clean up state for fresh install
    saveState({ initialized: false, version: null });
    console.log('[webauto] Release build complete');
    console.log('[webauto] Ready to publish');
    return;
  }

  if (cmd === 'ui' && sub === 'console') {
    await uiConsole({
      build: args.build === true,
      install: args.install === true,
      checkOnly: args.check === true,
    });
    return;
  }


  // Delegate to ui-console.mjs for test scenarios
  if (cmd === 'ui' && sub === 'test') {
    const uiConsoleScript = path.join(ROOT, 'apps', 'desktop-console', 'entry', 'ui-console.mjs');
    await run(process.execPath, [uiConsoleScript, ...rawArgv.slice(1)]);
    return;
  }
  if (cmd === 'account') {
    const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'account.mjs');
    await run(process.execPath, [script, ...rawArgv.slice(1)]);
    return;
  }

  if (cmd === 'xhs') {
    if (!sub || sub === 'help') {
      printXhsHelp();
      return;
    }

    if (sub === 'install') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-install.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (sub === 'unified' || sub === 'run') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-unified.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (sub === 'status') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-status.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    if (sub === 'orchestrate') {
      const script = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-orchestrate.mjs');
      await run(process.execPath, [script, ...rawArgv.slice(2)]);
      return;
    }

    console.error(`❌ 未知 xhs 子命令: ${sub}`);
    printXhsHelp();
    process.exit(2);
  }

  if (cmd === 'dev' && sub === 'install-global') {
    console.error('❌ `webauto dev install-global` 已迁移，请使用新的 app 入口与 npm 发布流程。');
    process.exit(2);
  }

  printMainHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
