/**
 * wa login - 登录管理
 */
import { header, ok, fail, info, warn } from '../lib/output.mjs';
import { loadConfig, setProfile, configDir } from '../lib/config.mjs';
import { join } from 'path';
import { existsSync } from 'fs';
import { runCmd } from '../lib/cross-platform.mjs';

export async function loginCommand(args, opts) {
  const parsed = parseArgs(args);
  if (parsed.help) { printHelp(); return; }
  
  const profileId = parsed.profile || 'default';
  
  // Check status
  if (parsed.status) {
    const config = loadConfig();
    const profile = config.profiles?.[profileId];
    if (!profile) {
      fail(`Profile "${profileId}" 不存在`);
      return;
    }
    
    header(`登录状态: ${profileId}`);
    
    // Check if services are running
    const apiCheck = runCmd('curl -s http://127.0.0.1:7701/health');
    if (apiCheck.ok && apiCheck.stdout?.includes('"ok":true')) {
      // TODO: Call actual login check API
      const lastCheck = profile.lastLoginCheck || '从未检查';
      info(`上次检查: ${lastCheck}`);
      ok(profile.loginValid !== false ? '登录状态正常' : '登录可能已过期');
    } else {
      warn('服务未运行，无法检查登录状态');
    }
    return;
  }
  
  // Logout
  if (parsed.logout) {
    const config = loadConfig();
    setProfile(config, profileId, { loginValid: false, lastLoginCheck: null });
    ok(`已登出 profile "${profileId}"`);
    return;
  }
  
  // Login flow
  header(`登录: ${profileId}`);
  
  const config = loadConfig();
  const profile = config.profiles?.[profileId];
  const platform = profile?.platform || 'xiaohongshu';
  const loginUrl = profile?.loginUrl || 'https://www.xiaohongshu.com';
  
  info(`平台: ${platform}`);
  info(`登录页: ${loginUrl}`);
  info('请在打开的浏览器中手动完成登录');
  info('登录成功后按 Enter 继续...');
  
  // TODO: Open browser via camo for login
  // For now, just open the URL
  const openCmd = isWindows ? 'start' : (isMac ? 'open' : 'xdg-open');
  runCmd(`${openCmd} "${loginUrl}"`);
  
  // Wait for user to press Enter
  await new Promise(resolve => {
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.once('data', () => {
      resolve();
    });
  });
  
  setProfile(config, profileId, {
    loginValid: true,
    lastLoginCheck: new Date().toISOString(),
  });
  
  ok('登录完成');
}

function isWindows() { return process.platform === 'win32'; }
function isMac() { return process.platform === 'darwin'; }

function parseArgs(args) {
  const result = { help: false, profile: null, status: false, logout: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h': case '--help':
        result.help = true; break;
      case '-p': case '--profile':
        result.profile = args[++i]; break;
      case '--status':
        result.status = true; break;
      case '--logout':
        result.logout = true; break;
    }
  }
  return result;
}

function printHelp() {
  console.log(`
用法: wa login [选项]

选项:
  -p, --profile <id>   指定 profile（默认 default）
  --status            检查登录状态
  --logout            登出
  -h, --help          显示帮助

示例:
  wa login                     # 登录
  wa login --profile xhs-qa-1   # 登录指定账户
  wa login --status              # 检查登录状态
  `);
}
