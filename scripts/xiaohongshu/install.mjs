#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书 CLI 安装检查脚本
 *
 * 功能：
 * - 检查 Node.js 版本
 * - 检查服务编译产物
 * - 检查依赖文件完整性
 * - 提供修复建议
 *
 * 用法：
 *   node scripts/xiaohongshu/install.mjs
 *   node scripts/xiaohongshu/install.mjs --check
 *   node scripts/xiaohongshu/install.mjs --check --download-browser
 *   ./xhs install
 *   ./xhs check
 */

import { existsSync, readFile } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const rawArgs = process.argv.slice(2);
const isCheckOnly = rawArgs.includes('--check');
const downloadBrowser = rawArgs.includes('--download-browser');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function error(msg) {
  log(`❌ ${msg}`, 'red');
}

function success(msg) {
  log(`✅ ${msg}`, 'green');
}

function warn(msg) {
  log(`⚠️  ${msg}`, 'yellow');
}

function info(msg) {
  log(`ℹ️  ${msg}`, 'blue');
}

// 检查 Node.js 版本
function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  log(`\n${'='.repeat(50)}`);
  log('小红书 CLI 安装检查', 'blue');
  log(`${'='.repeat(50)}\n`);

  info(`Node.js 版本: ${version}`);

  if (major < 22) {
    error(`Node.js 版本过低 (当前: v${major}, 需要: >=22.0.0)`);
    log('\n请升级 Node.js:');
    log('  macOS:   brew install node');
    log('  或访问:  https://nodejs.org/');
    return false;
  }

  success('Node.js 版本检查通过');
  return true;
}

// 检查文件/目录是否存在
function checkPath(path, label, required = true) {
  const fullPath = join(PROJECT_ROOT, path);
  const exists = existsSync(fullPath);

  if (exists) {
    success(`${label}: ${path}`);
    return true;
  } else {
    if (required) {
      error(`${label} 缺失: ${path}`);
    } else {
      warn(`${label} 不存在: ${path} (可选)`);
    }
    return false;
  }
}

// 检查编译产物
function checkBuildArtifacts() {
  log('\n📦 检查编译产物...');

  const required = [
    { path: 'dist/services/unified-api/server.js', label: 'Unified API 服务' },
    { path: 'dist/services/browser-service/index.js', label: 'Browser Service 服务' },
    { path: 'dist/modules/xiaohongshu/app/src/blocks', label: '小红书 App Blocks' },
    { path: 'dist/modules/workflow/blocks', label: 'Workflow Blocks' },
  ];

  const optional = [
    { path: 'dist/sharedmodule', label: '共享模块' },
  ];

  let allRequired = true;

  for (const { path, label } of required) {
    if (!checkPath(path, label, true)) {
      allRequired = false;
    }
  }

  for (const { path, label } of optional) {
    checkPath(path, label, false);
  }

  return allRequired;
}

// 检查脚本文件
function checkScriptFiles() {
  log('\n📜 检查脚本文件...');

  const required = [
    { path: 'scripts/xiaohongshu/phase1-boot.mjs', label: 'Phase 1 启动脚本' },
    { path: 'scripts/xiaohongshu/phase2-collect.mjs', label: 'Phase 2 采集脚本' },
    { path: 'scripts/xiaohongshu/phase4-harvest.mjs', label: 'Phase 4 内容采集脚本' },
    { path: 'scripts/xiaohongshu/phase3-interact.mjs', label: 'Phase 3 点赞脚本' },
    { path: 'scripts/xiaohongshu/collect-content.mjs', label: '搜索采集工作流脚本' },
    { path: 'scripts/xiaohongshu/like-comments.mjs', label: '点赞工作流脚本' },
    { path: 'scripts/xiaohongshu/lib/env.mjs', label: '环境配置模块' },
    { path: 'scripts/xiaohongshu/lib/logger.mjs', label: '日志模块' },
    { path: 'scripts/xiaohongshu/lib/services.mjs', label: '服务管理模块' },
    { path: 'scripts/xiaohongshu/lib/session-lock.mjs', label: '会话锁模块' },
  ];

  let allRequired = true;

  for (const { path, label } of required) {
    if (!checkPath(path, label, true)) {
      allRequired = false;
    }
  }

  return allRequired;
}

// 检查容器库
function checkContainerLibrary() {
  log('\n🗂️  检查容器库...');

  const required = [
    { path: 'container-library/xiaohongshu', label: '小红书容器定义' },
  ];

  let allRequired = true;

  for (const { path, label } of required) {
    if (!checkPath(path, label, true)) {
      allRequired = false;
    }
  }

  return allRequired;
}

// 检查依赖
async function checkDependencies() {
  log('\n📋 检查 npm 依赖...');

  try {
    const pkgPath = join(PROJECT_ROOT, 'package.json');
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);

    const requiredDeps = ['minimist', 'ws', 'undici', 'iconv-lite'];
    const deps = pkg.dependencies || {};

    let allInstalled = true;

    for (const dep of requiredDeps) {
      if (deps[dep]) {
        success(`${dep} 已声明`);
      } else {
        error(`${dep} 未声明`);
        allInstalled = false;
      }
    }

    // 检查 node_modules
    const nodeModulesPath = join(PROJECT_ROOT, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
      error('node_modules 目录不存在');
      allInstalled = false;
    } else {
      success('node_modules 目录存在');
    }

    return allInstalled;
  } catch (err) {
    error(`package.json 读取失败: ${err.message}`);
    return false;
  }
}

function resolveBrowserPath() {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom && custom.trim()) return custom;
  return join(PROJECT_ROOT, '.ms-playwright');
}

async function checkBrowser() {
  log('\n🌐 检查浏览器资源...');

  // 检查 Camoufox
  const camoufoxPath = process.env.HOME 
    ? join(process.env.HOME, 'Library', 'Caches', 'camoufox')
    : null;

  if (camoufoxPath && existsSync(join(camoufoxPath, 'Camoufox.app'))) {
    success(`Camoufox 已安装: ${camoufoxPath}`);
    return true;
  }

  warn(`Camoufox 未安装`);
  if (!downloadBrowser) return false;

  try {
    info('尝试下载 Camoufox...');
    execSync('npx camoufox fetch', { stdio: 'inherit' });
  } catch (err) {
    error(`Camoufox 下载失败: ${err.message}`);
    return false;
  }

  // 重新检查
  const ok = camoufoxPath && existsSync(join(camoufoxPath, 'Camoufox.app'));
  if (ok) {
    success(`Camoufox 已安装: ${camoufoxPath}`);
    info('如需授予执行权限: chmod +x ~/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox');
  } else {
    error('Camoufox 下载完成后仍未检测到浏览器');
  }
  return ok;
}


// 提供修复建议
function provideFixSuggestions(missingBuild, missingDeps, missingBrowser) {
  log('\n🔧 修复建议:\n');

  if (missingBuild) {
    log('编译产物缺失，请运行:', 'yellow');
    log('  npm run build:services');
    log('');
  }

  if (missingDeps) {
    log('依赖缺失，请运行:', 'yellow');
    log('  npm install');
    log('');
  }

  if (missingBrowser) {
    log('浏览器缺失，请运行:', 'yellow');
    log('  npx playwright install chromium');
    log('');
  }
}

// 主检查流程
async function main() {
  const nodeOk = checkNodeVersion();
  if (!nodeOk) {
    process.exit(1);
  }

  const buildOk = checkBuildArtifacts();
  const scriptsOk = checkScriptFiles();
  const containersOk = checkContainerLibrary();
  const depsOk = await checkDependencies();
  const browserOk = await checkBrowser();

  log('\n' + '='.repeat(50));
  if (buildOk && scriptsOk && containersOk && depsOk && browserOk) {
    success('所有检查通过！');
    log('\n可以使用以下命令启动:', 'green');
    log('  ./xhs phase1              # 启动浏览器会话');
    log('  ./xhs phase2 --keyword "测试" --target 50');
    log('');
    process.exit(0);
  } else {
    error('检查失败！');
    provideFixSuggestions(!buildOk, !depsOk, !browserOk);
    log('');
    process.exit(isCheckOnly ? 2 : 1);
  }
}

main();
