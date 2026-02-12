#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书 CLI 安装包构建脚本
 *
 * 用法：
 *   node scripts/package/build-cli-macos.mjs
 *
 * 产物：
 *   dist/xiaohongshu-collector-macos-x64.tar.gz
 *   dist/xiaohongshu-collector-macos-x64.tar.gz
 */

import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { arch, platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const DIST_DIR = join(ROOT, 'dist');
const PACKAGE_DIR = join(DIST_DIR, 'xiaohongshu-collector');

// 配置
const CONFIG = {
  name: 'xiaohongshu-collector',
  version: '1.0.0',
  nodeVersion: '>=22.0.0',
  files: [
    'dist/services',
    // 打包必须包含完整 dist/modules：services/workflow 运行时会依赖 logging/container-matcher 等模块
    'dist/modules',
    'dist/libs',
    'dist/sharedmodule',
    'scripts/xiaohongshu/lib',
    'scripts/lib',
    'scripts/xiaohongshu/phase1-boot.mjs',
    'scripts/xiaohongshu/phase2-collect.mjs',
    'scripts/xiaohongshu/phase3-4-collect.mjs',
    'scripts/xiaohongshu/install.mjs',
    'scripts/xiaohongshu/stop-all.mjs',
    'scripts/xiaohongshu/shared',
    'scripts/core-daemon.mjs',
    'scripts/search-gate-server.mjs',
    'scripts/search-gate-cli.mjs',
    'scripts/run-xiaohongshu-phase1-2-34-v3.mjs',
    'apps/desktop-console/package.json',
    'apps/desktop-console/package-lock.json',
    'apps/desktop-console/scripts',
    'apps/desktop-console/src',
    'apps/desktop-console/README.md',
    'container-library',
    'runtime/browser',
    'runtime/infra/node-cli/package.json'
  ]
};

// 日志工具
function log(msg) {
  console.log(`[build-cli] ${msg}`);
}

function error(msg) {
  console.error(`[build-cli] ERROR: ${msg}`);
}

// 执行命令
function exec(cmd, options = {}) {
  log(`执行: ${cmd}`);
  try {
    return execSync(cmd, {
      stdio: 'inherit',
      cwd: ROOT,
      ...options
    });
  } catch (err) {
    error(`命令失败: ${cmd}`);
    throw err;
  }
}

// 确保目录存在
async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

// 复制文件/目录
async function copyPath(src, dest) {
  const srcPath = join(ROOT, src);
  const destPath = join(PACKAGE_DIR, dest || src);

  if (!existsSync(srcPath)) {
    log(`跳过不存在路径: ${src}`);
    return;
  }

  await mkdir(dirname(destPath), { recursive: true });
  await cp(srcPath, destPath, { recursive: true });
  log(`复制: ${src} -> ${dest || src}`);
}

// 创建 package.json（精简版）
async function createPackageJson() {
  const pkgPath = join(ROOT, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

  const slimPkg = {
    name: CONFIG.name,
    version: CONFIG.version,
    description: 'WebAuto Desktop Console',
    type: 'module',
    engines: {
      node: CONFIG.nodeVersion
    },
    dependencies: {
      minimist: pkg.dependencies.minimist,
      ws: pkg.dependencies.ws,
      undici: pkg.dependencies.undici,
      'iconv-lite': pkg.dependencies['iconv-lite'],
      linkedom: pkg.dependencies.linkedom,
      camoufox: pkg.devDependencies.camoufox,
      // browser-service 运行时依赖 playwright（原仓库为 devDependency，但安装包需要 production 可安装）
      playwright: pkg.devDependencies.playwright
    }
  };

  await writeFile(
    join(PACKAGE_DIR, 'package.json'),
    JSON.stringify(slimPkg, null, 2)
  );
  log('创建: package.json');
}

// 创建 Desktop Console 入口脚本
async function createCliScripts() {
  const scriptDir = PACKAGE_DIR;
  await ensureDir(scriptDir);

  const unixScript = `#!/bin/bash
# WebAuto Desktop Console

set -e

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="\$SCRIPT_DIR"
APP_DIR="\$PROJECT_ROOT/apps/desktop-console"

if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js"
  echo "请访问 https://nodejs.org/ 下载安装 Node.js ${CONFIG.nodeVersion} 或更高版本"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "❌ 未检测到 npm，请重装 Node.js"
  exit 1
fi

if [ ! -x "\$APP_DIR/node_modules/.bin/electron" ]; then
  echo "[desktop-console] installing dependencies..."
  (cd "\$APP_DIR" && npm install)
fi

if [ ! -f "\$APP_DIR/dist/main/index.mjs" ]; then
  echo "[desktop-console] building..."
  (cd "\$APP_DIR" && npm run build)
fi

"\$APP_DIR/node_modules/.bin/electron" "\$APP_DIR"
`;

  await writeFile(join(scriptDir, 'desktop-console'), unixScript, { mode: 0o755 });
  log('创建: desktop-console');

  const winScript = `@echo off
chcp 65001 >nul
REM WebAuto Desktop Console

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%"
set "APP_DIR=%PROJECT_ROOT%\\apps\\desktop-console"

if not exist "%APP_DIR%\\package.json" (
  echo [error] desktop-console files missing: %APP_DIR%
  exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [error] 未检测到 Node.js
  echo 请访问 https://nodejs.org/ 下载安装 Node.js ${CONFIG.nodeVersion} 或更高版本
  exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo [error] npm 未找到，请重装 Node.js
  exit /b 1
)

if not exist "%APP_DIR%\\node_modules\\.bin\\electron.cmd" (
  echo [desktop-console] installing dependencies...
  call npm --prefix "%APP_DIR%" install
  if %errorlevel% neq 0 exit /b 1
)

if not exist "%APP_DIR%\\dist\\main\\index.mjs" (
  echo [desktop-console] building...
  call npm --prefix "%APP_DIR%" run build
  if %errorlevel% neq 0 exit /b 1
)

"%APP_DIR%\\node_modules\\.bin\\electron.cmd" "%APP_DIR%"

endlocal
`;

  await writeFile(
    join(scriptDir, 'desktop-console.bat'),
    `\uFEFF${winScript.replace(/\n/g, '\r\n')}`
  );
  log('创建: desktop-console.bat');
}

// 创建安装脚本
async function createInstallScripts() {
  // Unix install script
  const unixInstall = `#!/bin/bash
# 小红书采集工具安装脚本

set -e

echo "🔍 正在检查 Node.js..."

if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js"
  echo ""
  echo "请手动安装 Node.js:"
  echo "  macOS:   brew install node"
  echo "  或访问:  https://nodejs.org/"
  exit 1
fi

NODE_VERSION=\$(node -v)
echo "✅ Node.js 版本: \$NODE_VERSION"

echo ""
echo "📦 正在安装项目依赖..."
npm install --production

echo "🦊 正在检测 Camoufox..."
CAMOUFOX_PATH="\$(npx camoufox path 2>/dev/null | tail -n 1 || true)"
if [ -z "\$CAMOUFOX_PATH" ] || [ ! -e "\$CAMOUFOX_PATH" ]; then
  echo "🦊 未检测到 Camoufox，开始下载..."
  npx camoufox fetch
  CAMOUFOX_PATH="\$(npx camoufox path 2>/dev/null | tail -n 1 || true)"
fi

if [ -z "\$CAMOUFOX_PATH" ] || [ ! -e "\$CAMOUFOX_PATH" ]; then
  echo "❌ Camoufox 下载失败"
  exit 1
fi
echo "✅ Camoufox 浏览器已就绪: \$CAMOUFOX_PATH"

echo ""
echo "🧭 正在安装 Desktop Console 依赖..."
npm --prefix apps/desktop-console install
echo "🧱 正在构建 Desktop Console..."
npm --prefix apps/desktop-console run build

echo ""
echo "✅ 安装完成！"
echo ""
echo "启动方式:"
echo "  ./desktop-console"
echo ""
`;

  await writeFile(join(PACKAGE_DIR, 'install.sh'), unixInstall, { mode: 0o755 });
  log('创建: install.sh');

  // Windows install script
  const winInstall = `@echo off
setlocal
cd /d "%~dp0"

set "EXIT_CODE=0"
set "DEFAULT_DIR=D:\\webauto"
set "TARGET_DIR="
set "SRC_DIR=%~dp0"
for %%i in ("%SRC_DIR%.") do set "SRC_DIR=%%~fi"

echo [install] Checking Node.js...

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [install] Node.js not found.
  echo [install] Download: https://nodejs.org/ ^(>=22.0.0^)
  set "EXIT_CODE=1"
  goto :end
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo [install] npm not found. Reinstall Node.js.
  set "EXIT_CODE=1"
  goto :end
)

:prompt_dir
echo [install] Default install dir: %DEFAULT_DIR%
set /p TARGET_DIR=Install directory ^(Enter for default^): 
if "%TARGET_DIR%"=="" set "TARGET_DIR=%DEFAULT_DIR%"
for %%i in ("%TARGET_DIR%") do set "TARGET_DIR=%%~fi"

echo [install] Install dir: %TARGET_DIR%
if /I "%TARGET_DIR%"=="%SRC_DIR%" (
  echo [install] Install dir is current directory. Skip copy.
  goto :after_copy
)

if exist "%TARGET_DIR%" if not exist "%TARGET_DIR%\\" (
  echo [install] Target exists and is not a directory.
  goto :prompt_dir
)

if not exist "%TARGET_DIR%\\" (
  mkdir "%TARGET_DIR%"
  if errorlevel 1 (
    echo [install] Failed to create directory: %TARGET_DIR%
    echo [install] Hint: choose another path, enter "." for current dir, or run as Administrator.
    goto :prompt_dir
  )
) else (
  echo [install] Target directory exists.
)

echo [install] Copying files to target...
xcopy "%SRC_DIR%\\*" "%TARGET_DIR%\\" /E /I /Y >nul
if %errorlevel% geq 4 (
  echo [install] Copy failed.
  goto :prompt_dir
)

:after_copy
cd /d "%TARGET_DIR%"
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [install] Node.js version: %NODE_VERSION%
echo.
echo [install] Installing dependencies (npm install --production)...
call npm install --production
if %errorlevel% neq 0 (
  echo [install] npm install failed.
  set "EXIT_CODE=1"
  goto :end
)

set "CAMOUFOX_PATH="
for /f "delims=" %%i in ('npx camoufox path 2^>nul ^| findstr /v /c:"[baseline-browser-mapping]"') do set "CAMOUFOX_PATH=%%i"
if not exist "%CAMOUFOX_PATH%" set "CAMOUFOX_PATH="
if "%CAMOUFOX_PATH%"=="" (
  echo [install] Camoufox not found. Downloading...
  call npx camoufox fetch
  if %errorlevel% neq 0 (
    echo [install] Camoufox download failed.
    set "EXIT_CODE=1"
    goto :end
  )
)

set "CAMOUFOX_PATH="
for /f "delims=" %%i in ('npx camoufox path 2^>nul ^| findstr /v /c:"[baseline-browser-mapping]"') do set "CAMOUFOX_PATH=%%i"
if not exist "%CAMOUFOX_PATH%" set "CAMOUFOX_PATH="

if "%CAMOUFOX_PATH%"=="" (
  echo [install] Camoufox path not found after download.
  set "EXIT_CODE=1"
  goto :end
)

if not exist "%CAMOUFOX_PATH%" (
  echo [install] Camoufox executable missing: %CAMOUFOX_PATH%
  set "EXIT_CODE=1"
  goto :end
)

echo [install] Camoufox browser ready: %CAMOUFOX_PATH%

set "DESKTOP_DIR=%TARGET_DIR%\\apps\\desktop-console"
if not exist "%DESKTOP_DIR%\\package.json" (
  echo [install] Desktop Console files missing: %DESKTOP_DIR%
  set "EXIT_CODE=1"
  goto :end
)

echo [install] Installing Desktop Console dependencies...
call npm --prefix "%DESKTOP_DIR%" install
if %errorlevel% neq 0 (
  echo [install] Desktop Console npm install failed.
  set "EXIT_CODE=1"
  goto :end
)

echo [install] Building Desktop Console...
call npm --prefix "%DESKTOP_DIR%" run build
if %errorlevel% neq 0 (
  echo [install] Desktop Console build failed.
  set "EXIT_CODE=1"
  goto :end
)

echo.
echo [install] Done.
echo [install] Next:
echo   "%TARGET_DIR%\\desktop-console.bat"

:end
call :maybe_pause
endlocal & exit /b %EXIT_CODE%

:maybe_pause
echo %cmdcmdline% | findstr /I /C:"/c" >nul
if errorlevel 1 pause
exit /b 0
`;

  await writeFile(
    join(PACKAGE_DIR, 'install.bat'),
    `\uFEFF${winInstall.replace(/\n/g, '\r\n')}`
  );
  log('创建: install.bat');
}

// 创建 README
async function createReadme() {
  const desktopReadme = `# WebAuto Desktop Console v${CONFIG.version}

## 系统要求

- **Node.js**: ${CONFIG.nodeVersion}
- **操作系统**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)
- **浏览器**: 自动下载 Camoufox

## 安装

### Windows

\`\`\`bash
install.bat
\`\`\`

### macOS/Linux

\`\`\`bash
./install.sh
\`\`\`

## 启动

\`\`\`bash
# macOS/Linux
./desktop-console

# Windows
desktop-console.bat
\`\`\`

## 目录结构

\`\`\`
xiaohongshu-collector/
  desktop-console           # Desktop Console 入口 (macOS/Linux)
  desktop-console.bat       # Desktop Console 入口 (Windows)
  apps/desktop-console/     # Desktop Console 源码与构建产物
  dist/                     # 编译产物（services/modules/sharedmodule）
  scripts/                  # 业务脚本与工作流入口
  container-library/        # 容器定义
  runtime/infra/node-cli/   # 运行配置
\`\`\`

## 说明

- Desktop Console 作为唯一执行入口，内部调用本地 scripts 与服务。
- 搜索前需启动 SearchGate（端口 7790），服务端口为 7701/7704/8765。

## 技术支持

- GitHub: https://github.com/your-repo/webauto
- 文档: https://github.com/your-repo/webauto/docs
`;

  await writeFile(join(PACKAGE_DIR, 'README.md'), desktopReadme);
  log('创建: README.md');
  return;

  const legacyReadme = `# 小红书数据采集 CLI 工具 v${CONFIG.version}

## 系统要求

- **Node.js**: ${CONFIG.nodeVersion}
- **操作系统**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)
- **浏览器**: 自动下载 Camoufox

## 快速开始

### 方式一：一键采集（推荐）

\`\`\`bash
# macOS/Linux
./xhs -k 手机膜 -n 50 --headless

# Windows
xhs.bat -k 手机膜 -n 50 --headless
\`\`\`

查看详细帮助：
\`\`\`bash
./xhs --help
\`\`\`

> Windows 运行请使用 \`xhs.bat\`（PowerShell 可用 \`.\\xhs.bat\`）。

### 方式二：分阶段执行（传统方式）

### 1. 检查环境 / 安装依赖

\`\`\`bash
# macOS/Linux
./xhs install
./xhs check

# Windows
xhs.bat install
xhs.bat check
\`\`\`

### 2. 启动浏览器会话 (Phase 1)

\`\`\`bash
# macOS/Linux
./xhs phase1

# Windows
xhs.bat phase1
\`\`\`

等待浏览器启动并完成登录（手动扫码登录）。Phase1 会在后台运行，日志位于 \`~/.webauto/logs/xiaohongshu_phase1.log\`。

### 2.5 启动 SearchGate（搜索节流服务）

> 搜索前必须先启动 SearchGate，否则 Phase2 会被阻塞。

\`\`\`bash
# macOS/Linux
node scripts/search-gate-server.mjs

# Windows
node scripts\search-gate-server.mjs
\`\`\`

### 3. 采集数据 (Phase 2)

\`\`\`bash
# macOS/Linux
./xhs phase2 --keyword 手机膜 --target 50

# Windows
xhs.bat phase2 --keyword 手机膜 --target 50
\`\`\`

## 目录结构

\`\`\`
xiaohongshu-collector/
  xhs                       # CLI 入口 (macOS/Linux)
  xhs.bat                   # CLI 入口 (Windows)
  dist/                     # 编译产物（services/modules/sharedmodule）
  scripts/                  # 业务脚本与工作流入口
  container-library/        # 容器定义
  runtime/infra/node-cli/   # CLI 运行配置
\`\`\`

## 命令参考

| 命令 | 说明 | 参数 |
|------|------|------|
| \`xhs\` | 一键采集入口 | \`-k/-n/--cn\` \`--headless/--headful\` |
| \`phase1\` | 启动并复用浏览器会话 | \`--headless\` (无头模式) |
| \`phase2\` | 搜索并采集链接 | \`--keyword\` (关键词) \`--target\` (数量) |
| \`phase3\` | 采集详情和评论 | 从 phase2 产物读取 |
| \`stop\` | 停止所有服务与后台进程 | - |
| \`install\` | 检查并安装依赖 | - |
| \`check\` | 仅检查环境与浏览器 | - |

## 数据存储

采集结果保存在:
\`\`\`
~/.webauto/download/xiaohongshu/prod/<keyword>/
\`\`\`

## 故障排除

1. **Node.js 版本过低**: 请升级到 v22 或更高版本
2. **端口占用**: 确保 7701/7704/8765/7790 端口未被占用
3. **浏览器下载失败**: 检查网络连接，Camoufox 会自动下载

## 技术支持

- GitHub: https://github.com/your-repo/webauto
- 文档: https://github.com/your-repo/webauto/docs
`;

  await writeFile(join(PACKAGE_DIR, 'README.md'), legacyReadme);
  log('创建: README.md');
}

// 创建 tar.gz 压缩包（使用系统 tar 命令）
async function createTarGz(outputPath) {
  return new Promise((resolve, reject) => {
    const tarProcess = spawn('tar', [
      '-czf',
      outputPath,
      '-C',
      DIST_DIR,
      'xiaohongshu-collector'
    ]);

    tarProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar 命令退出码: ${code}`));
      }
    });

    tarProcess.on('error', reject);
  });
}

// 主构建流程
async function build() {
  log(`开始构建 ${CONFIG.name} v${CONFIG.version}`);
  log(`平台: ${platform()}, 架构: ${arch()}`);
  if (platform() !== 'darwin') {
    error('This script is macOS-only. Use build-cli-win.mjs on Windows.');
    process.exit(1);
  }

  // 1. 确保服务已编译
  log('检查编译产物...');
  if (!existsSync(join(ROOT, 'dist/services'))) {
    log('编译服务代码...');
    exec('npm run build:services');
  }

  // 2. 清理旧构建
  log('清理旧构建...');
  await ensureDir(DIST_DIR);
  await rm(PACKAGE_DIR, { recursive: true, force: true });

  // 3. 创建打包目录
  log('创建打包目录...');
  await ensureDir(PACKAGE_DIR);

  // 4. 复制文件
  log('复制文件...');
  for (const path of CONFIG.files) {
    await copyPath(path);
  }

  // 5. 创建配置文件
  await createPackageJson();
  await createCliScripts();
  await createInstallScripts();
  await createReadme();

  // 6. 创建压缩包
  log('创建压缩包...');
  const currentArch = arch();
  const macPath = join(DIST_DIR, `xiaohongshu-collector-macos-${currentArch}.tar.gz`);
  await createTarGz(macPath);
  log(`✅ 生成: ${macPath}`);

  log('✅ 构建完成！');
  log(`产物目录: ${DIST_DIR}`);
}

build().catch((err) => {
  error(err.message);
  process.exit(1);
});
