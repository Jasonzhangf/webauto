#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书 CLI 安装包构建脚本
 *
 * 用法：
 *   node scripts/package/build-cli.mjs
 *
 * 产物：
 *   dist/xiaohongshu-collector-win-x64.zip
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
    'dist/sharedmodule',
    'scripts/xiaohongshu',
    'scripts/xiaohongshu/lib',
    'apps/desktop-console/package.json',
    'apps/desktop-console/package-lock.json',
    'apps/desktop-console/scripts',
    'apps/desktop-console/src',
    'apps/desktop-console/README.md',
    'scripts/run-xiaohongshu-phase1-2-34-v3.mjs',  // v3 统一入口
    'container-library',
    'scripts/lib',
    'runtime/infra/node-cli/package.json',
    'package.json',
    'package-lock.json'
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

// 创建 CLI 入口脚本
async function createCliScripts() {
  const binDir = join(PACKAGE_DIR, 'bin');
  await ensureDir(binDir);

  // Unix shell script
  const unixScript = `#!/bin/bash
# 小红书采集 CLI 入口

set -e

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="\$SCRIPT_DIR/.."

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js"
  echo "请访问 https://nodejs.org/ 下载安装 Node.js ${CONFIG.nodeVersion} 或更高版本"
  exit 1
fi

NODE_VERSION=\$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "\$NODE_VERSION" -lt 22 ]; then
  echo "❌ Node.js 版本过低 (当前: \$(node -v), 需要: >=22.0.0)"
  exit 1
fi

# 命令路由
case "\$1" in
  v3|run)
    node "\$PROJECT_ROOT/scripts/run-xiaohongshu-phase1-2-34-v3.mjs" "\${@:2}"
    ;;
  phase1)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/phase1-boot.mjs" "\${@:2}"
    ;;
  phase2)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/phase2-collect.mjs" "\${@:2}"
    ;;
  phase3)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/phase3-interact.mjs" "\${@:2}"
    ;;
  collect)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/collect-content.mjs" "\${@:2}"
    ;;
  like)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/like-comments.mjs" "\${@:2}"
    ;;
  install)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/install.mjs"
    ;;
  *)
    cat << EOF
小红书数据采集 CLI 工具 v${CONFIG.version}

用法:
  xhs-cli v3              使用 v3 统一入口（推荐）
  xhs-cli run             同 v3
  xhs-cli phase1          启动并复用浏览器会话
  xhs-cli phase2          搜索并采集链接
  xhs-cli phase3          采集详情和评论
  xhs-cli install         检查并安装依赖

示例:
  xhs-cli v3 --keyword "手机膜" --count 50 --env prod    # v3 完整运行
  xhs-cli v3 --help                                     # 查看 v3 详细帮助
  xhs-cli phase1                                        # 启动浏览器会话

更多信息请访问: https://github.com/your-repo/webauto
EOF
    ;;
esac
`;

  await writeFile(join(binDir, 'xhs-cli'), unixScript, { mode: 0o755 });
  log('创建: bin/xhs-cli');

  // Windows batch script
  const winScript = `@echo off
REM 小红书采集 CLI 入口

setlocal

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ❌ 未检测到 Node.js
  echo 请访问 https://nodejs.org/ 下载安装 Node.js ${CONFIG.nodeVersion} 或更高版本
  exit /b 1
)

REM 命令路由
if "%1"=="v3" (
  node "%PROJECT_ROOT%\\scripts\\run-xiaohongshu-phase1-2-34-v3.mjs" %*
) else if "%1"=="run" (
  node "%PROJECT_ROOT%\\scripts\\run-xiaohongshu-phase1-2-34-v3.mjs" %*
) else if "%1"=="phase1" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\phase1-boot.mjs" %*
) else if "%1"=="phase2" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\phase2-collect.mjs" %*
) else if "%1"=="phase3" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\phase3-interact.mjs" %*
) else if "%1"=="install" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\install.mjs"
) else (
  echo 小红书数据采集 CLI 工具 v${CONFIG.version}
  echo.
  echo 用法:
  echo   xhs-cli v3              使用 v3 统一入口（推荐）
  echo   xhs-cli run             同 v3
  echo   xhs-cli phase1          启动并复用浏览器会话
  echo   xhs-cli phase2          搜索并采集链接
  echo   xhs-cli phase3          采集详情和评论
  echo   xhs-cli install         检查并安装依赖
  echo.
  echo 示例:
  echo   xhs-cli v3 --keyword "手机膜" --count 50 --env prod
  echo   xhs-cli v3 --help
  echo   xhs-cli phase1
)

endlocal
`;

  await writeFile(join(binDir, 'xhs-cli.bat'), winScript);
  log('创建: bin/xhs-cli.bat');
}

// 创建安装脚本
async function createDesktopConsoleScripts() {
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

  await rm(join(PACKAGE_DIR, 'bin', 'xhs-cli'), { force: true });
  await rm(join(PACKAGE_DIR, 'bin', 'xhs-cli.bat'), { force: true });
}

async function createInstallScripts() {
  // Unix install script
  const unixInstall = `#!/bin/bash
# WebAuto Desktop Console 安装脚本

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
export CAMOUFOX_DIR="\$PWD/.camoufox"
mkdir -p "\$CAMOUFOX_DIR"
echo "🦊 Camoufox 安装目录: \$CAMOUFOX_DIR"
echo ""
echo "📦 正在安装项目依赖..."
npm ci --production

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
echo "✅ Camoufox 浏览器已就绪: $CAMOUFOX_PATH"

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

  const legacyUnixInstall = `#!/bin/bash
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

if [ "$IN_CHINA" = "1" ]; then
  echo "🌐 使用 npm 镜像..."
  export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
fi

npm ci --production

echo "🦊 正在检测 Camoufox..."

if [ "$IN_CHINA" = "1" ]; then
  echo "🌐 注意：Camoufox 下载可能较慢..."
fi

CAMOUFOX_PATH="$(npx camoufox path 2>/dev/null | tail -n 1 || true)"
if [ -z "$CAMOUFOX_PATH" ] || [ ! -e "$CAMOUFOX_PATH" ]; then
  echo "🦊 未检测到 Camoufox，开始下载..."
  npx camoufox fetch
  CAMOUFOX_PATH="$(npx camoufox path 2>/dev/null | tail -n 1 || true)"
fi

if [ -z "$CAMOUFOX_PATH" ] || [ ! -e "$CAMOUFOX_PATH" ]; then
  echo "❌ Camoufox 下载失败"
  exit 1
fi
echo "✅ Camoufox 浏览器已就绪: $CAMOUFOX_PATH"

echo ""
echo "🔍 正在验证安装..."
./bin/xhs-cli install

echo ""
echo "✅ 安装完成！"
echo ""
echo "使用方法:"
echo "  ./bin/xhs-cli phase1              # 启动浏览器会话"
echo "  ./bin/xhs-cli phase2 --keyword \\"测试\\" --target 50"
echo ""
`;

  await writeFile(join(PACKAGE_DIR, 'install.sh'), unixInstall, { mode: 0o755 });
  log('创建: install.sh');

  // Windows install script
  const winInstall = `@echo off
REM WebAuto Desktop Console 安装脚本

setlocal
cd /d "%~dp0"

echo [install] Checking Node.js...

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [install] Node.js not found.
  echo [install] Download: https://nodejs.org/ (>=22.0.0)
  exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo [install] npm not found. Reinstall Node.js.
  exit /b 1
)

echo [install] Installing dependencies (npm ci --production)...
call npm ci --production
if %errorlevel% neq 0 (
  echo [install] npm install failed.
  exit /b 1
)

set "CAMOUFOX_PATH="
for /f "delims=" %%i in ('npx camoufox path 2^>nul ^| findstr /v /c:"[baseline-browser-mapping]"') do set "CAMOUFOX_PATH=%%i"
if not exist "%CAMOUFOX_PATH%" set "CAMOUFOX_PATH="
if "%CAMOUFOX_PATH%"=="" (
  echo [install] Camoufox not found. Downloading...
  call npx camoufox fetch
  if %errorlevel% neq 0 (
    echo [install] Camoufox download failed.
    exit /b 1
  )
)

set "CAMOUFOX_PATH="
for /f "delims=" %%i in ('npx camoufox path 2^>nul ^| findstr /v /c:"[baseline-browser-mapping]"') do set "CAMOUFOX_PATH=%%i"
if not exist "%CAMOUFOX_PATH%" set "CAMOUFOX_PATH="

if "%CAMOUFOX_PATH%"=="" (
  echo [install] Camoufox path not found after download.
  exit /b 1
)

echo [install] Camoufox browser ready: %CAMOUFOX_PATH%

set "DESKTOP_DIR=%CD%\\apps\\desktop-console"
if not exist "%DESKTOP_DIR%\\package.json" (
  echo [install] Desktop Console files missing: %DESKTOP_DIR%
  exit /b 1
)

echo [install] Installing Desktop Console dependencies...
call npm --prefix "%DESKTOP_DIR%" install
if %errorlevel% neq 0 (
  echo [install] Desktop Console npm install failed.
  exit /b 1
)

echo [install] Building Desktop Console...
call npm --prefix "%DESKTOP_DIR%" run build
if %errorlevel% neq 0 (
  echo [install] Desktop Console build failed.
  exit /b 1
)

echo.
echo [install] Done.
echo [install] Next:
echo   "%CD%\\desktop-console.bat"
`;

  const legacyWinInstall = `@echo off
REM 小红书采集工具安装脚本

echo 🔍 正在检查 Node.js...

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ❌ 未检测到 Node.js
  echo.
  echo 请手动安装 Node.js: https://nodejs.org/
  exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js 版本: %NODE_VERSION%
echo.
echo 📦 正在安装项目依赖...
call npm ci --production

echo 🦊 正在检测 Camoufox...
set "CAMOUFOX_PATH="
for /f "delims=" %%i in ('npx camoufox path 2^>nul ^| findstr /v /c:"[baseline-browser-mapping]"') do set "CAMOUFOX_PATH=%%i"
if not exist "%CAMOUFOX_PATH%" set "CAMOUFOX_PATH="
if "%CAMOUFOX_PATH%"=="" (
  echo 🦊 Camoufox 未找到，开始下载...
  call npx camoufox fetch
)

set "CAMOUFOX_PATH="
for /f "delims=" %%i in ('npx camoufox path 2^>nul ^| findstr /v /c:"[baseline-browser-mapping]"') do set "CAMOUFOX_PATH=%%i"
if not exist "%CAMOUFOX_PATH%" set "CAMOUFOX_PATH="
if "%CAMOUFOX_PATH%"=="" (
  echo ❌ Camoufox 下载失败
  exit /b 1
)
if not exist "%CAMOUFOX_PATH%" (
  echo ❌ Camoufox 可执行文件缺失: %CAMOUFOX_PATH%
  exit /b 1
)
echo ✅ Camoufox 浏览器已就绪

echo.
echo ✅ 安装完成！
echo.
echo 使用方法:
echo   bin\\xhs-cli phase1
echo   bin\\xhs-cli phase2 --keyword "测试" --target 50
echo.
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
  log('鍒涘缓: README.md');
  return;

  const readme = `# 小红书数据采集 CLI 工具 v${CONFIG.version}

## 系统要求

- **Node.js**: ${CONFIG.nodeVersion}
- **操作系统**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)
- **浏览器**: 自动下载 Camoufox (Firefox)

## 快速开始

### 方式一：使用 v3 统一入口（推荐）

v3 入口整合了所有阶段，使用更简单：

\`\`\`bash
# macOS/Linux
./bin/xhs-cli v3 --keyword "手机膜" --count 50 --env prod

# Windows
bin\\xhs-cli.bat v3 --keyword "手机膜" --count 50 --env prod
\`\`\`

查看详细帮助：
\`\`\`bash
./bin/xhs-cli v3 --help
\`\`\`

### 方式二：分阶段执行（传统方式）

### 1. 检查环境

\`\`\`bash
# macOS/Linux
./bin/xhs-cli install

# Windows
bin\\xhs-cli.bat install
\`\`\`

### 2. 启动浏览器会话 (Phase 1)

\`\`\`bash
# macOS/Linux
./bin/xhs-cli phase1

# Windows
bin\\xhs-cli.bat phase1
\`\`\`

等待浏览器启动并完成登录（手动扫码登录）。

### 3. 采集数据 (Phase 2)

\`\`\`bash
# macOS/Linux
./bin/xhs-cli phase2 --keyword "手机膜" --target 50 --env debug

# Windows
bin\\xhs-cli.bat phase2 --keyword "手机膜" --target 50 --env debug
\`\`\`

## 命令参考

| 命令 | 说明 | 参数 |
|------|------|------|
| \`v3\` / \`run\` | **v3 统一入口（推荐）** | \`--keyword\` (关键词) \`--count\` (数量) \`--env\` (环境) \`--startAt\` (起始阶段) \`--stopAfter\` (结束阶段) |
| \`phase1\` | 启动并复用浏览器会话 | \`--headless\` (无头模式) |
| \`phase2\` | 搜索并采集链接 | \`--keyword\` (关键词) \`--target\` (数量) \`--env\` (环境) |
| \`phase3\` | 采集详情和评论 | 从 phase2 产物读取 |

## 数据存储

采集结果保存在:
\`\`\`
~/.webauto/download/xiaohongshu/{env}/{keyword}/
\`\`\`

## 故障排除

1. **Node.js 版本过低**: 请升级到 v22 或更高版本
2. **端口占用**: 确保 7701/7704/8765/7790 端口未被占用
3. **浏览器下载失败**: 检查网络连接，程序会自动下载 Camoufox (Firefox)

## 技术支持

- GitHub: https://github.com/your-repo/webauto
- 文档: https://github.com/your-repo/webauto/docs
`;

  await writeFile(join(PACKAGE_DIR, 'README.md'), readme);
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

// 创建 zip 压缩包（使用系统 zip 命令）
async function createZip(outputPath) {
  return new Promise((resolve, reject) => {
    const zipProcess = spawn('zip', [
      '-r',
      outputPath,
      'xiaohongshu-collector'
    ], {
      cwd: DIST_DIR
    });

    zipProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`zip 命令退出码: ${code}`));
      }
    });

    zipProcess.on('error', reject);
  });
}

// 主构建流程
async function build() {
  log(`开始构建 ${CONFIG.name} v${CONFIG.version}`);
  log(`平台: ${platform()}, 架构: ${arch()}`);

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
  await createDesktopConsoleScripts();
  await createInstallScripts();
  await createReadme();

  // 6. 创建压缩包
  log('创建压缩包...');
  const currentPlatform = platform();
  const currentArch = arch();

  if (currentPlatform === 'darwin') {
    const macPath = join(DIST_DIR, `xiaohongshu-collector-macos-${currentArch}.tar.gz`);
    await createTarGz(macPath);
    log(`✅ 生成: ${macPath}`);
  } else if (currentPlatform === 'win32') {
    const winPath = join(DIST_DIR, `xiaohongshu-collector-win-${currentArch}.zip`);
    await createZip(winPath);
    log(`✅ 生成: ${winPath}`);
  } else if (currentPlatform === 'linux') {
    const linuxPath = join(DIST_DIR, `xiaohongshu-collector-linux-${currentArch}.tar.gz`);
    await createTarGz(linuxPath);
    log(`✅ 生成: ${linuxPath}`);
  } else {
    log(`⚠️  未知平台: ${currentPlatform}，跳过压缩包创建`);
  }

  log('✅ 构建完成！');
  log(`产物目录: ${DIST_DIR}`);
}

build().catch((err) => {
  error(err.message);
  process.exit(1);
});
