/**
 * wa init - 环境初始化命令
 */
import { header, ok, fail, info, json } from '../lib/output.mjs';
import { checkAll } from '../lib/env-check.mjs';
import { installCamo, installCamoufox, installGeoip } from '../lib/dependency.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';

export async function initCommand(args, opts) {
  const { help } = parseArgs(args);
  if (help) { printHelp(); return; }
  
  header('WebAuto 环境检查');
  
  // Check only mode
  if (opts.check) {
    const results = await checkAll({ profile: opts.profile });
    if (opts.json) { json(results); return; }
    return;
  }
  
  // Run checks and install missing deps
  const results = await checkAll({ profile: opts.profile });
  
  if (!results.camo && (opts.installCamo || !opts.check)) {
    installCamo();
    results.camo = true; // Re-check after install
  }
  
  if (!results.browser && (opts.installBrowser || !opts.check)) {
    installCamoufox();
    results.browser = true;
  }
  
  if (!results.geoip && (opts.installGeoip || !opts.check)) {
    installGeoip();
    results.geoip = true;
  }
  
  // Profile creation
  if (opts.profile) {
    const config = loadConfig();
    if (!config.profiles?.[opts.profile]) {
      info(`创建 profile: ${opts.profile}`);
      const platform = guessPlatform();
      const { setProfile } = await import('../lib/profile.mjs');
      setProfile(config, opts.profile, {
        platform,
        loginUrl: platform === 'xiaohongshu' ? 'https://www.xiaohongshu.com' : '',
        createdAt: new Date().toISOString(),
      });
      ok(`Profile "${opts.profile}" 已创建`);
    }
  }
  
  // Login
  if (opts.login) {
    info('启动登录流程...');
    const { loginCommand } = await import('./login.mjs');
    await loginCommand(args, opts);
  }
  
  // Save init timestamp
  const config = loadConfig();
  config.initAt = new Date().toISOString();
  saveConfig(config);
  
  if (opts.json) { json(results); return; }
  
  // Summary
  header('总结');
  const allOk = Object.values(results).every(v => v === true);
  if (allOk) {
    ok('环境就绪');
    info('运行 wa run -k <关键字> 开始使用');
  } else {
    fail('部分依赖缺失，运行 wa init --install-camo --install-browser 修复');
  }
}

function parseArgs(args) {
  const help = args.includes('--help') || args.includes('-h');
  return { help };
}

function guessPlatform() {
  return 'xiaohongshu';
}

function printHelp() {
  console.log(`
用法: wa init [选项]

选项:
  --check              仅检查，不安装
  --install-camo       安装 camo CLI
  --install-browser    安装 camoufox 浏览器
  --install-geoip      安装 GeoIP 数据库
  --profile <id>       创建/配置账户 profile
  --login              启动登录流程
  --json               JSON 输出
  -h, --help           显示帮助

示例:
  wa init                           # 检查环境
  wa init --install-camo            # 安装 camo
  wa init --profile xhs-qa-1        # 创建账户
  wa init --install-camo --install-browser --install-geoip  # 安装全部
  `);
}
