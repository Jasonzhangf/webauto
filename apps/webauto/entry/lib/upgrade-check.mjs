/**
 * upgrade-check.mjs
 * 
 * 检查 npm 包是否有新版本，提示用户升级
 */

import { spawn } from 'child_process';
import https from 'https';
import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * 从 package.json 获取当前版本
 * @param {string} [pkgPath] - 自定义 package.json 路径
 * @returns {string|null}
 */
function getLocalVersion(pkgPath) {
  try {
    // 优先使用传入路径
    if (pkgPath && fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || null;
    }
    
    // 尝试从已知位置查找
    const candidates = [
      path.join(REPO_ROOT, 'package.json'),           // 开发模式
      path.join(__dirname, '..', '..', '..', 'package.json'), // 相对位置
      path.join(__dirname, 'package.json'),           // 模块自身
    ];
    
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (pkg.name === '@web-auto/webauto' && pkg.version) {
          return pkg.version;
        }
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * 从 npm registry 获取最新版本
 * @param {string} packageName
 * @returns {Promise<string|null>}
 */
function getLatestVersion(packageName) {
  return new Promise((resolve) => {
    const url = `${NPM_REGISTRY}/${packageName}/latest`;
    
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    }).on('timeout', () => {
      resolve(null);
    });
  });
}

/**
 * 比较版本号
 * @param {string} v1
 * @param {string} v2
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  
  return 0;
}

/**
 * 询问用户是否升级
 * @param {string} current
 * @param {string} latest
 * @returns {Promise<boolean>}
 */
async function askUserConfirmation(current, latest) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(
      `\n📦 发现新版本！\n   当前版本: ${current}\n   最新版本: ${latest}\n\n是否升级？(y/n): `,
      (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes');
      },
    );
  });
}

/**
 * 执行 npm update
 * @param {string} packageName
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function runNpmUpdate(packageName) {
  return new Promise((resolve) => {
    console.log(`\n⏳ 正在更新 ${packageName}...`);
    
    const child = spawn('npm', ['install', '-g', packageName], {
      stdio: 'inherit',
    });
    
    child.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${packageName} 已更新到最新版本`);
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: `npm install exited with code ${code}` });
      }
    });
  });
}

/**
 * 检查并提示升级
 * @param {string} packageName - 包名
 * @param {{autoUpdate?: boolean, silent?: boolean, pkgPath?: string}} options
 * @returns {Promise<{ok: boolean, versionInfo?: any, error?: string, userDeclined?: boolean, updated?: boolean}>}
 */
export async function checkAndPromptUpgrade(packageName, options = {}) {
  const { autoUpdate = false, silent = false, pkgPath } = options;
  
  // 获取当前版本
  const current = getLocalVersion(pkgPath);
  if (!current) {
    return {
      ok: false,
      error: `无法获取 ${packageName} 的当前版本`,
    };
  }
  
  // 获取最新版本
  const latest = await getLatestVersion(packageName);
  if (!latest) {
    return {
      ok: false,
      error: `无法从 npm registry 获取最新版本`,
      versionInfo: { current, latest: current, needsUpdate: false },
    };
  }
  
  const needsUpdate = compareVersions(current, latest) < 0;
  
  const versionInfo = { current, latest, needsUpdate };
  
  // 无需更新
  if (!needsUpdate) {
    if (!silent) {
      console.log(`✓ ${packageName} 已是最新版本 (${current})`);
    }
    return { ok: true, versionInfo };
  }
  
  // 需要更新
  if (!silent) {
    console.log(`\n┌${'─'.repeat(50)}┐`);
    console.log(`│ 📦 ${packageName} 有新版本可用`.padEnd(50) + '│');
    console.log(`│ 当前: ${current}`.padEnd(50) + '│');
    console.log(`│ 最新: ${latest}`.padEnd(50) + '│');
    console.log(`└${'─'.repeat(50)}┘`);
  }
  
  // 自动更新模式
  if (autoUpdate) {
    const result = await runNpmUpdate(packageName);
    return {
      ok: result.ok,
      versionInfo,
      updated: result.ok,
      error: result.error,
    };
  }
  
  // 交互式确认
  if (process.stdin.isTTY) {
    const confirmed = await askUserConfirmation(current, latest);
    
    if (confirmed) {
      const result = await runNpmUpdate(packageName);
      return {
        ok: result.ok,
        versionInfo,
        updated: result.ok,
        error: result.error,
      };
    } else {
      return {
        ok: true,
        versionInfo,
        userDeclined: true,
      };
    }
  }
  
  // 非 TTY 环境，仅提示
  return {
    ok: true,
    versionInfo,
    userDeclined: true,
  };
}

/**
 * CLI 入口
 */
export async function main() {
  const packageName = '@web-auto/webauto';
  const result = await checkAndPromptUpgrade(packageName);
  
  if (result.error) {
    console.error(`❌ 检查更新失败: ${result.error}`);
    process.exit(1);
  }
  
  if (result.userDeclined) {
    console.log('\n💡 稍后可以运行 `npm install -g @web-auto/webauto` 手动更新');
  }
  
  process.exit(0);
}

// 直接运行时执行
if (process.argv[1]?.includes('upgrade-check.mjs')) {
  main().catch(console.error);
}
