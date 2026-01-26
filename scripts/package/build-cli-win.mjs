#!/usr/bin/env node
/**
 * 小红书 CLI 安装包构建脚本
 *
 * 用法：
 *   node scripts/package/build-cli-win.mjs
 *
 * 产物：
 *   dist/xiaohongshu-collector-win-x64.zip
 *   dist/xiaohongshu-collector-win-x64.zip
 */

import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync, spawn } from 'node:child_process';
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
    'scripts/xiaohongshu/phase1-start.mjs',
    'scripts/xiaohongshu/phase2-collect.mjs',
    'scripts/xiaohongshu/phase3-4-collect.mjs',
    'scripts/xiaohongshu/install.mjs',
    'scripts/xiaohongshu/stop-all.mjs',
    'scripts/core-daemon.mjs',
    'scripts/search-gate-server.mjs',
    'scripts/search-gate-cli.mjs',
    'scripts/run-xiaohongshu-phase1-2-34-v3.mjs',  // v3 统一入口
    'container-library',
    'runtime/browser',
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

function commandExists(cmd) {
  try {
    if (process.platform === 'win32') {
      execSync(`where ${cmd}`, { stdio: 'ignore', shell: true });
    } else {
      execSync(`command -v ${cmd}`, { stdio: 'ignore', shell: true });
    }
    return true;
  } catch {
    return false;
  }
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
    description: '小红书数据采集 CLI 工具',
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
cd "\$PROJECT_ROOT"
export PLAYWRIGHT_BROWSERS_PATH="\$PROJECT_ROOT/.ms-playwright"

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
    LOG_DIR="\${HOME:-\$USERPROFILE}/.webauto/logs"
    mkdir -p "\$LOG_DIR"
    PHASE1_LOG="\$LOG_DIR/xiaohongshu_phase1.log"
    echo "[phase1] starting in background, log: \$PHASE1_LOG"
    nohup node "\$PROJECT_ROOT/scripts/xiaohongshu/phase1-start.mjs" "\${@:2}" > "\$PHASE1_LOG" 2>&1 &
    ;;
  phase2)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/phase2-collect.mjs" "\${@:2}"
    ;;
  phase3)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/phase3-4-collect.mjs" "\${@:2}"
    ;;
  stop)
    node "\$PROJECT_ROOT/scripts/xiaohongshu/stop-all.mjs"
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
  xhs-cli phase1          后台启动并复用浏览器会话
  xhs-cli phase2          搜索并采集链接
  xhs-cli phase3          采集详情和评论
  xhs-cli stop            停止所有服务与后台进程
  xhs-cli install         检查并安装依赖

示例:
  xhs-cli v3 --keyword "手机膜" --count 50 --env prod    # v3 完整运行
  xhs-cli v3 --help                                     # 查看 v3 详细帮助
  xhs-cli phase1                                        # 后台启动浏览器会话（日志: ~/.webauto/logs/xiaohongshu_phase1.log）
  xhs-cli stop                                          # 停止所有服务与后台进程

更多信息请访问: https://github.com/your-repo/webauto
EOF
    ;;
esac
`;

  if (platform() !== 'win32') {
    await writeFile(join(binDir, 'xhs-cli'), unixScript, { mode: 0o755 });
    log('创建: bin/xhs-cli');
  }

  // Windows batch script
  const winScript = `@echo off
chcp 65001 >nul
REM 小红书采集 CLI 入口

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
cd /d "%PROJECT_ROOT%"
set "PLAYWRIGHT_BROWSERS_PATH=%PROJECT_ROOT%\\.ms-playwright"
set "WEBAUTO_DOWNLOAD_ROOT=%PROJECT_ROOT%\\download"
if not exist "%WEBAUTO_DOWNLOAD_ROOT%" mkdir "%WEBAUTO_DOWNLOAD_ROOT%"

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [error] 未检测到 Node.js
  echo 请访问 https://nodejs.org/ 下载安装 Node.js ${CONFIG.nodeVersion} 或更高版本
  exit /b 1
)

REM 命令路由
if "%1"=="v3" (
  node "%PROJECT_ROOT%\\scripts\\run-xiaohongshu-phase1-2-34-v3.mjs" %*
) else if "%1"=="run" (
  node "%PROJECT_ROOT%\\scripts\\run-xiaohongshu-phase1-2-34-v3.mjs" %*
) else if "%1"=="phase1" (
  set "LOG_BASE=%USERPROFILE%"
  if "!LOG_BASE!"=="" set "LOG_BASE=%HOMEDRIVE%%HOMEPATH%"
  if "!LOG_BASE!"=="" set "LOG_BASE=%PROJECT_ROOT%"
  set "LOG_DIR=!LOG_BASE!\\.webauto\\logs"
  if not exist "!LOG_DIR!" mkdir "!LOG_DIR!"
  set "PHASE1_LOG=!LOG_DIR!\\xiaohongshu_phase1.log"
  set "PHASE1_ERR_LOG=!LOG_DIR!\\xiaohongshu_phase1.err.log"
  echo [phase1] starting in background, log: !PHASE1_LOG!
  powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath node -ArgumentList '\"%PROJECT_ROOT%\\scripts\\xiaohongshu\\phase1-start.mjs\" %*' -WorkingDirectory '%PROJECT_ROOT%' -RedirectStandardOutput '!PHASE1_LOG!' -RedirectStandardError '!PHASE1_ERR_LOG!' -WindowStyle Hidden"
  exit /b 0
) else if "%1"=="phase2" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\phase2-collect.mjs" %*
) else if "%1"=="phase3" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\phase3-4-collect.mjs" %*
) else if "%1"=="stop" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\stop-all.mjs"
) else if "%1"=="install" (
  node "%PROJECT_ROOT%\\scripts\\xiaohongshu\\install.mjs"
) else (
  echo 小红书数据采集 CLI 工具 v${CONFIG.version}
  echo.
  echo 用法:
  echo   xhs-cli v3              使用 v3 统一入口（推荐）
  echo   xhs-cli run             同 v3
  echo   xhs-cli phase1          后台启动并复用浏览器会话
  echo   xhs-cli phase2          搜索并采集链接
  echo   xhs-cli phase3          采集详情和评论
  echo   xhs-cli stop            停止所有服务与后台进程
  echo   xhs-cli install         检查并安装依赖
  echo.
  echo 示例:
  echo   xhs-cli v3 --keyword "手机膜" --count 50 --env prod
  echo   xhs-cli v3 --help
  echo   xhs-cli phase1  ^(日志: %USERPROFILE%\\.webauto\\logs\\xiaohongshu_phase1.log^)
  echo   xhs-cli stop
)

endlocal
`;

  await writeFile(join(binDir, 'xhs-cli.bat'), winScript.replace(/\n/g, '\r\n'));
  log('创建: bin/xhs-cli.bat');
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
export PLAYWRIGHT_BROWSERS_PATH="\$PWD/.ms-playwright"
mkdir -p "\$PLAYWRIGHT_BROWSERS_PATH"
echo "📦 浏览器安装目录: \$PLAYWRIGHT_BROWSERS_PATH"
echo ""
echo "📦 正在安装项目依赖..."
npm ci --production

if ! ls "$PLAYWRIGHT_BROWSERS_PATH"/chromium-* >/dev/null 2>&1; then
  echo "📦 未检测到 Chromium，开始下载..."
  npx playwright install chromium
fi

if ! ls "$PLAYWRIGHT_BROWSERS_PATH"/chromium-* >/dev/null 2>&1; then
  echo "❌ Chromium 下载失败"
  exit 1
fi

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

  if (platform() !== 'win32') {
    await writeFile(join(PACKAGE_DIR, 'install.sh'), unixInstall, { mode: 0o755 });
    log('创建: install.sh');
  }

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
set "PLAYWRIGHT_BROWSERS_PATH=%TARGET_DIR%\\.ms-playwright"
if not exist "%PLAYWRIGHT_BROWSERS_PATH%" mkdir "%PLAYWRIGHT_BROWSERS_PATH%"

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [install] Node.js version: %NODE_VERSION%
echo.
echo [install] Browser install path: %PLAYWRIGHT_BROWSERS_PATH%
echo.
echo [install] Installing dependencies (npm ci --production)...
call npm ci --production
if %errorlevel% neq 0 (
  echo [install] npm install failed.
  set "EXIT_CODE=1"
  goto :end
)

set "BROWSER_FOUND="
for /d %%i in ("%PLAYWRIGHT_BROWSERS_PATH%\\chromium-*") do set "BROWSER_FOUND=1"
if not defined BROWSER_FOUND (
  echo [install] Chromium not found. Downloading...
  call npx playwright install chromium
  if %errorlevel% neq 0 (
    echo [install] Playwright download failed.
    set "EXIT_CODE=1"
    goto :end
  )
)

set "BROWSER_FOUND="
for /d %%i in ("%PLAYWRIGHT_BROWSERS_PATH%\\chromium-*") do set "BROWSER_FOUND=1"
if not defined BROWSER_FOUND (
  echo [install] Chromium download missing after install.
  set "EXIT_CODE=1"
  goto :end
)

echo.
echo [install] Done.
echo [install] Next:
echo   "%TARGET_DIR%\\bin\\xhs-cli.bat" phase1
echo   "%TARGET_DIR%\\bin\\xhs-cli.bat" phase2 --keyword "test" --target 50

:end
call :maybe_pause
endlocal & exit /b %EXIT_CODE%

:maybe_pause
echo %cmdcmdline% | findstr /I /C:"/c" >nul
if errorlevel 1 pause
exit /b 0
`;


  await writeFile(join(PACKAGE_DIR, 'install.bat'), winInstall.replace(/\n/g, '\r\n'));
  log('创建: install.bat');
}

// 创建 README
async function createReadme() {
  const readme = `# 小红书数据采集 CLI 工具 v${CONFIG.version}

## 系统要求

- **Node.js**: ${CONFIG.nodeVersion}
- **操作系统**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)
- **浏览器**: Playwright 会自动下载 Chromium

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

> Windows 运行请使用 \`bin\\xhs-cli.bat\`（PowerShell 可用 \`.\\bin\\xhs-cli.bat\`），不要直接运行 \`bin\\xhs-cli\`。

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

等待浏览器启动并完成登录（手动扫码登录）。Phase1 会在后台运行，日志位于 \`~/.webauto/logs/xiaohongshu_phase1.log\`。

### 2.5 启动 SearchGate（搜索节流服务）

> 搜索前必须先启动 SearchGate，否则 Phase2 会被阻塞。

\`\`\`bash
# macOS/Linux
node scripts/search-gate-server.mjs

# Windows
node scripts\\search-gate-server.mjs
\`\`\`

### 3. 采集数据 (Phase 2)

\`\`\`bash
# macOS/Linux
./bin/xhs-cli phase2 --keyword "手机膜" --target 50 --env debug

# Windows
bin\\xhs-cli.bat phase2 --keyword "手机膜" --target 50 --env debug
\`\`\`

## 目录结构

\`\`\`
xiaohongshu-collector/
  bin/                      # CLI 入口
  dist/                     # 编译产物（services/modules/sharedmodule）
  scripts/                  # 业务脚本与工作流入口
  container-library/        # 容器定义
  runtime/infra/node-cli/   # CLI 运行配置
\`\`\`

## 命令参考

| 命令 | 说明 | 参数 |
|------|------|------|
| \`v3\` / \`run\` | **v3 统一入口（推荐）** | \`--keyword\` (关键词) \`--count\` (数量) \`--env\` (环境) \`--startAt\` (起始阶段) \`--stopAfter\` (结束阶段) |
| \`phase1\` | 启动并复用浏览器会话 | \`--headless\` (无头模式) |
| \`phase2\` | 搜索并采集链接 | \`--keyword\` (关键词) \`--target\` (数量) \`--env\` (环境) |
| \`phase3\` | 采集详情和评论 | 从 phase2 产物读取 |
| \`stop\` | 停止所有服务与后台进程 | - |

## 数据存储

采集结果保存在:
\`\`\`
~/.webauto/download/xiaohongshu/{env}/{keyword}/
\`\`\`

## 故障排除

1. **Node.js 版本过低**: 请升级到 v22 或更高版本
2. **端口占用**: 确保 7701/7704/8765/7790 端口未被占用
3. **浏览器下载失败**: 检查网络连接，Playwright 会自动下载

## 技术支持

- GitHub: https://github.com/your-repo/webauto
- 文档: https://github.com/your-repo/webauto/docs
`;

  await writeFile(join(PACKAGE_DIR, 'README.md'), readme);
  log('创建: README.md');
}

// 创建 zip 压缩包（使用系统 zip 命令）
async function createZip(outputPath) {
  if (process.platform === 'win32' && !commandExists('zip')) {
    const folder = join(DIST_DIR, 'xiaohongshu-collector');
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path "${folder}" -DestinationPath "${outputPath}" -Force`
      ],
      { stdio: 'inherit' }
    );
    return;
  }

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
  if (platform() !== 'win32') {
    error('This script is Windows-only. Use build-cli-macos.mjs on macOS.');
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
  const winPath = join(DIST_DIR, `xiaohongshu-collector-win-${currentArch}.zip`);
  await createZip(winPath);
  log(`✅ 生成: ${winPath}`);

  log('✅ 构建完成！');
  log(`产物目录: ${DIST_DIR}`);
}

build().catch((err) => {
  error(err.message);
  process.exit(1);
});
