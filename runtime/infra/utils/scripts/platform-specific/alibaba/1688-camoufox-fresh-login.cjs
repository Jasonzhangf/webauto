#!/usr/bin/env node

/*
 * 1688 Camoufox 重新登录脚本
 * - 使用 Camoufox 而不是 Chromium
 * - 不加载任何现有 Cookie，完全重新登录
 * - 保存所有 Cookie 到指定位置
 * - 支持手动验证和自动检测
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return p;
}

async function writeJSON(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
}

async function dismissModals(page) {
  try {
    const selectors = [
      'img._turboCom-dialog-close_sm0it_23',
      'img[src*="O1CN01A6UFsG1PK4AGW30nV"]',
      '.close-btn',
      '[class*="close"]',
      'button[aria-label*="close"]'
    ];
    for (const sel of selectors) {
      const elements = await page.$$(sel);
      for (const el of elements) {
        try {
          if (await el.isVisible()) {
            await el.click({ timeout: 500 }).catch(async () => {
              try { await el.evaluate((node) => node.click()); } catch {}
            });
          }
        } catch {}
      }
    }
  } catch {}
}

async function simpleLoginHeuristic(page) {
  try {
    const info = await page.evaluate(() => {
      function isVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      }
      const avatarWrap = document.querySelector('.userAvatarLogo') || document.querySelector('[class*="userAvatarLogo"]');
      const avatarImg = avatarWrap ? avatarWrap.querySelector('img') : null;
      const mainAvatarVisible = isVisible(avatarWrap) && (!!avatarImg && isVisible(avatarImg));

      const altAvatarImg = document.querySelector('img[src*="alicdn.com/img/ibank/"]');
      const altAvatarVisible = isVisible(altAvatarImg);

      const avatarVisible = mainAvatarVisible || altAvatarVisible;

      const text = document.body?.innerText || '';
      const hasUserText = /我的1688|消息|订单|采购|退出|账号|Settings|Messages|Orders/i.test(text);
      const loginText = /登录|请登录|免费注册|Sign in|Log in/i.test(text);

      return { avatarVisible, hasUserText, loginText };
    });
    return !!info.avatarVisible;
  } catch {
    return false;
  }
}

async function pollForLogin(page, { timeoutMs = 600000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  console.log(`⏳ 开始轮询登录状态，最长等待 ${timeoutMs/1000} 秒...`);

  while (Date.now() < deadline) {
    await dismissModals(page);
    const ok = await simpleLoginHeuristic(page);
    if (ok) {
      console.log('✅ 检测到登录成功！');
      return true;
    }
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    process.stdout.write(`\r⏳ 剩余: ${remaining}s，继续检测...  `);
    await page.waitForTimeout(intervalMs);
  }
  console.log('\n❌ 登录检测超时');
  return false;
}

async function main() {
  const homepage = 'https://www.1688.com/';
  const cookieFile = expandHome('~/.webauto/cookies/1688-domestic.json');

  console.log('🚀 开始 1688 Camoufox 重新登录流程');
  console.log('📝 特点：不加载现有Cookie，完全重新登录');

  // 备份现有Cookie（如果存在）
  if (fs.existsSync(cookieFile)) {
    const backupFile = cookieFile.replace(/\.json$/, `.backup-${Date.now()}.json`);
    fs.copyFileSync(cookieFile, backupFile);
    console.log(`📦 已备份现有Cookie到: ${backupFile}`);
  }

  // 检查Camoufox路径
  const camoufoxPath = process.env.CAMOUFOX_PATH ||
    '/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox';

  if (!fs.existsSync(camoufoxPath)) {
    console.error('❌ 找不到 Camoufox，请确保已安装并设置环境变量');
    console.error('预期路径:', camoufoxPath);
    console.error('或设置环境变量 CAMOUFOX_PATH');
    process.exit(1);
  }

  console.log('🌐 启动 Camoufox 浏览器...');

  // 使用Camoufox启动浏览器
  const { spawn } = require('child_process');
  const browserProcess = spawn(camoufoxPath, [
    '--headless=false',
    '--window-size=1920,1080',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-extensions',
    '--disable-plugins-discovery',
    '--disable-ipc-flooding-protection',
    '--shuffle-messagetypes',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-features=TranslateUI',
    '--disable-features=Translate',
    '--lang=zh-CN',
    '--accept-lang=zh-CN,zh'
  ], {
    stdio: 'inherit'
  });

  // 等待一段时间让Camoufox启动
  console.log('⏳ 等待 Camoufox 启动...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('📍 请在新打开的 Camoufox 窗口中完成 1688 登录');
  console.log('📝 登录步骤：');
  console.log('   1. 访问 https://www.1688.com/');
  console.log('   2. 点击登录按钮');
  console.log('   3. 完成账号密码登录/扫码登录');
  console.log('   4. 完成任何必要的验证（滑块、短信等）');
  console.log('');
  console.log('⚠️ 注意：不要关闭此脚本，它会自动检测登录状态');

  // 使用Playwright连接到已启动的Camoufox
  const { firefox } = require('playwright');
  let browser;
  let context;
  let page;

  try {
    // 尝试连接到Camoufox
    browser = await firefox.connect({
      wsEndpoint: 'ws://localhost:9222'  // 默认调试端口
    });
  } catch (error) {
    console.log('🔄 无法直接连接到Camoufox，尝试独立启动...');
    // 如果连接失败，独立启动firefox（使用camoufox二进制）
    browser = await firefox.launch({
      executablePath: camoufoxPath,
      headless: false,
      args: [
        '--window-size=1920,1080',
        '--disable-web-security',
        '--no-first-run',
        '--lang=zh-CN'
      ]
    });
  }

  try {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    page = await context.newPage();

    // 导航到1688主页
    console.log('🌐 导航到 1688 主页...');
    await page.goto(homepage, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');

    // 关闭可能的模态框
    await dismissModals(page);

    // 开始轮询登录状态
    const loginSuccess = await pollForLogin(page, {
      timeoutMs: 10 * 60 * 1000, // 10分钟
      intervalMs: 2000 // 每2秒检查一次
    });

    if (!loginSuccess) {
      console.log('❌ 登录失败或超时');
      await browser.close();
      process.exit(1);
    }

    console.log('✅ 登录成功！等待30秒确保登录状态稳定...');
    await page.waitForTimeout(30000);

    // 获取所有Cookie
    console.log('🍪 获取所有登录Cookie...');
    const cookies = await context.cookies();

    // 保存Cookie
    await writeJSON(cookieFile, cookies);
    console.log(`✅ 已保存 ${cookies.length} 条Cookie到: ${cookieFile}`);

    // 同时保存原始备份
    const rawBackup = cookieFile.replace(/\.json$/, '.raw.json');
    await writeJSON(rawBackup, cookies);
    console.log(`📦 原始备份保存到: ${rawBackup}`);

    // 验证Cookie
    console.log('🔍 验证保存的Cookie...');
    const testContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    await testContext.addCookies(cookies);
    const testPage = await testContext.newPage();
    await testPage.goto(homepage, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await testPage.waitForTimeout(3000);

    const verificationResult = await simpleLoginHeuristic(testPage);
    await testContext.close();

    if (verificationResult) {
      console.log('✅ Cookie验证成功，登录状态正常');
    } else {
      console.log('⚠️ Cookie验证失败，可能需要重新登录');
    }

    console.log('');
    console.log('🎉 1688 Camoufox 重新登录流程完成！');
    console.log(`📁 Cookie文件: ${cookieFile}`);
    console.log(`📊 Cookie数量: ${cookies.length}`);
    console.log(`✅ 验证结果: ${verificationResult ? '成功' : '失败'}`);

    await browser.close();
    process.exit(verificationResult ? 0 : 1);

  } catch (error) {
    console.error('❌ 登录过程中发生错误:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('💥 脚本运行失败:', error?.message || error);
  process.exit(1);
});