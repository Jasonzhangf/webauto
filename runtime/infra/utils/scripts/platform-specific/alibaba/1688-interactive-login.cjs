#!/usr/bin/env node

/*
 * 1688 交互式登录助手
 * - 打开 https://www.1688.com/（非无头）
 * - 等待用户手动登录，回车后保存 Cookie
 * - 重新打开上下文加载 Cookie，验证是否已登录（简单启发式）
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { chromium, webkit, firefox } = require('playwright');

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return p;
}

async function readJSON(file) {
  const s = await fsp.readFile(file, 'utf8');
  return JSON.parse(s);
}

async function writeJSON(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
}

async function dismissModals(page) {
  try {
    // 优先：根据提供的关闭按钮选择器与图片 src
    const selectors = [
      'img._turboCom-dialog-close_sm0it_23',
      'img[src*="O1CN01A6UFsG1PK4AGW30nV"]'
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

async function pollForLogin(page, { timeoutMs = 10000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await dismissModals(page);
    const ok = await simpleLoginHeuristic(page);
    if (ok) return true;
    await page.waitForTimeout(intervalMs);
  }
  return false;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { timeoutMs: 60000, minimizeExisting: false, source: 'auto', forceInteractive: false };
  for (const a of args) {
    const m1 = a.match(/^--timeout(?:Ms)?=(\d+)$/);
    const m2 = a.match(/^--timeoutSec=(\d+)$/);
    if (m1) out.timeoutMs = parseInt(m1[1], 10);
    if (m2) out.timeoutMs = parseInt(m2[1], 10) * 1000;
    if (a === '--minimize-existing') out.minimizeExisting = true;
    const m3 = a.match(/^--source=(raw|current)$/);
    if (m3) out.source = m3[1];
    if (a === '--force-interactive') out.forceInteractive = true;
  }
  return out;
}

async function countdown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  process.stdout.write(`\n⏳ 请在 ${totalSec} 秒内完成 1688 登录...\n`);
  return new Promise((resolve) => {
    let left = totalSec;
    const timer = setInterval(() => {
      left -= 1;
      process.stdout.write(`  剩余: ${left}s    \r`);
      if (left <= 0) {
        clearInterval(timer);
        process.stdout.write('\n');
        resolve();
      }
    }, 1000);
  });
}

async function saveCookies(context, cookiePath, keysFile) {
  const cookies = await context.cookies();
  // 先保存原始 Cookie 备份
  const rawPath = cookiePath.replace(/\.json$/, '.raw.json');
  await writeJSON(rawPath, cookies);

  // 若存在固定键集合，则只保存这些 Cookie；否则保存全量
  let toSave = cookies;
  if (keysFile) {
    const fixedKeys = await getFixedKeys(keysFile);
    if (fixedKeys) {
      toSave = filterCookiesByKeys(cookies, fixedKeys);
    }
  }
  await writeJSON(cookiePath, toSave);
  return { saved: toSave.length, original: cookies.length, rawPath };
}

async function loadCookies(context, cookiePath) {
  try {
    const cookies = await readJSON(cookiePath);
    if (Array.isArray(cookies) && cookies.length) {
      await context.addCookies(cookies);
      return cookies.length;
    }
  } catch {}
  return 0;
}

async function simpleLoginHeuristic(page) {
  // 必须检测到 .userAvatarLogo 才判定为已登录
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

      // 备用判定：1688 头像常来自 alicdn ibank
      const altAvatarImg = document.querySelector('img[src*="alicdn.com/img/ibank/"]');
      const altAvatarVisible = isVisible(altAvatarImg);

      const avatarVisible = mainAvatarVisible || altAvatarVisible;

      // 辅助信息（不作为最终判定）
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

function endsWithDomain(domain, allowed) {
  const d = (domain || '').replace(/^\./, '').toLowerCase();
  return allowed.some(ad => d === ad.toLowerCase() || d.endsWith('.' + ad.toLowerCase()));
}

function filterCookies(cookies, filter) {
  if (!filter) return cookies;
  const allowDomains = Array.isArray(filter.allowDomains) ? filter.allowDomains : [];
  const allowNames = Array.isArray(filter.allowNames) ? new Set(filter.allowNames) : null;
  return cookies.filter(c => {
    const domainOk = allowDomains.length ? endsWithDomain(c.domain, allowDomains) : true;
    const nameOk = allowNames ? allowNames.has(c.name) : true;
    return domainOk && nameOk;
  });
}

async function readRuntimeConfig() {
  const cfgPath = path.join(process.cwd(), 'config', '1688-domestic.json');
  let cookieFile = path.join(os.homedir(), '.webauto/cookies/1688-domestic.json');
  let filter = null;
  let cookieLock = false;
  let keysFile = cookieFile.replace(/\.json$/, '.keys.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.cookieFile) cookieFile = expandHome(cfg.cookieFile);
      if (cfg.cookieFilter) filter = cfg.cookieFilter;
      if (typeof cfg.cookieLock === 'boolean') cookieLock = cfg.cookieLock;
      if (cfg.fixedCookieKeysFile) keysFile = expandHome(cfg.fixedCookieKeysFile);
    } catch {}
  }
  return { cookieFile, filter, cookieLock, keysFile };
}

async function loadCookieFile(_, cookieFile, source = 'auto') {
  const rawPath = cookieFile.replace(/\.json$/, '.raw.json');
  let fileToUse = cookieFile;
  if (source === 'raw') fileToUse = rawPath;
  if (source === 'current') fileToUse = cookieFile;
  if (source === 'auto') fileToUse = fs.existsSync(rawPath) ? rawPath : cookieFile;
  try {
    const arr = await readJSON(fileToUse);
    if (Array.isArray(arr)) return { cookies: arr, path: fileToUse };
  } catch {}
  return { cookies: [], path: fileToUse };
}

function diffCookieSets(original, minimized) {
  const key = (c) => `${c.name}||${c.domain}||${c.path || '/'}`;
  const mset = new Set(minimized.map(key));
  const removed = original.filter(c => !mset.has(key(c)));
  const kept = minimized.slice();
  const summarize = (arr) => arr.reduce((acc, c) => {
    const k = `${c.name}@${c.domain}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  return { removed, kept, removedSummary: summarize(removed), keptSummary: summarize(kept) };
}

function cookieKey(c) {
  return `${c.name}||${c.domain}||${c.path || '/'}`;
}

async function getFixedKeys(keysFile) {
  try {
    const data = await readJSON(keysFile);
    if (Array.isArray(data)) return new Set(data);
  } catch {}
  return null;
}

async function setFixedKeys(keysFile, cookies) {
  const keys = Array.from(new Set(cookies.map(cookieKey)));
  await writeJSON(keysFile, keys);
  return keys.length;
}

function filterCookiesByKeys(cookies, keysSet) {
  if (!keysSet) return cookies;
  return cookies.filter(c => keysSet.has(cookieKey(c)));
}

function prioritizeCookies(cookies) {
  // 根据名称/特征打分：token/session/安全相关更高优先级
  const nameScore = (name) => (/cookie2|token|_tb_token_|_m_h5_tk|_m_h5_tk_enc|x5sec|csrf|xsrf|sid|session|JSESSIONID|cna|ali_ab/i.test(name) ? 5 : 1);
  const domainScore = (domain) => (/passport\.|\.1688\.com$|\.alibaba\.com$/i.test(domain) ? 3 : 1);
  return cookies.slice().sort((a, b) => (domainScore(b.domain) + nameScore(b.name)) - (domainScore(a.domain) + nameScore(a.name)));
}

async function testLoginWithCookies(browser, homepage, cookies) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    if (cookies?.length) await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto(homepage, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const ok = await pollForLogin(page, { timeoutMs: 10000, intervalMs: 1000 });
    return ok;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

async function iterativeMinimizeCookies(allCookies) {
  // 从完整 Cookie 开始，仅通过“删除不必要 Cookie”的方式进行最小化
  const homepage = 'https://www.1688.com/';
  const browser = await launchBrowserSafe();
  try {
    const okFull = await testLoginWithCookies(browser, homepage, allCookies);
    if (!okFull) {
      // 全量 Cookie 尚无法保持登录，直接返回原始（可能页面需再次登录）
      return allCookies.slice();
    }
    // 贪心删除：尽量减少数量且保持登录
    const minimized = await greedyReduce(browser, homepage, allCookies.slice());
    return minimized;
  } finally {
    await browser.close();
  }
}

async function launchBrowserSafe(preferHeadful = true) {
  const engines = [
    () => chromium.launch({ headless: !preferHeadful, args: ['--no-sandbox','--disable-gpu','--disable-crash-reporter'] }),
    () => webkit.launch({ headless: !preferHeadful }),
    () => firefox.launch({ headless: !preferHeadful })
  ];
  for (const start of engines) {
    try { return await start(); } catch (_) {}
  }
  // 如果全部 headful 失败，尝试 headless 顺序
  const enginesHeadless = [
    () => chromium.launch({ headless: true, args: ['--no-sandbox','--disable-gpu','--disable-crash-reporter'] }),
    () => webkit.launch({ headless: true }),
    () => firefox.launch({ headless: true })
  ];
  for (const start of enginesHeadless) {
    try { return await start(); } catch (_) {}
  }
  throw new Error('无法启动任何浏览器实例');
}

async function greedyReduce(browser, homepage, cookies) {
  // 逐个尝试移除，如果成功仍保持登录，则永久移除该 cookie
  let current = cookies.slice();
  for (let i = 0; i < current.length; ) {
    const testSet = current.slice(0, i).concat(current.slice(i + 1));
    const ok = await testLoginWithCookies(browser, homepage, testSet);
    if (ok) {
      // 移除该 cookie
      current = testSet;
      // 不自增 i，继续检查当前位置新元素
    } else {
      i += 1;
    }
  }
  return current;
}

async function tryCheckExistingCookies(cookieFile, homepage) {
  if (!fs.existsSync(cookieFile)) return false;
  const browser = await launchBrowserSafe();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const cookies = await readJSON(cookieFile);
      if (Array.isArray(cookies) && cookies.length) await context.addCookies(cookies);
    } catch {}
    const page = await context.newPage();
    await page.goto(homepage, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const ok = await pollForLogin(page, { timeoutMs: 10000, intervalMs: 1000 });
    await context.close();
    return ok;
  } finally {
    await browser.close();
  }
}

async function main() {
  const homepage = 'https://www.1688.com/';
  const { cookieFile, cookieLock, keysFile } = await readRuntimeConfig();
  const opts = parseArgs();

  // 锁定模式：不修改、不最小化、不弹窗，只验证一次
  if (cookieLock) {
    console.log('🔒 Cookie 处于锁定模式（cookieLock: true）。仅验证，不做任何修改。');
    const ok = await tryCheckExistingCookies(cookieFile, homepage);
    console.log(`🔁 验证结果：${ok ? '✅ 已登录' : '❌ 未登录或不确定'}`);
    if (!ok) console.log('ℹ️ 若需刷新 Cookie，请将 config/1688-domestic.json 中的 cookieLock 设为 false。');
    process.exit(ok ? 0 : 1);
  }

  // 仅执行基于现有 Cookie 的最小化
  if (opts.minimizeExisting) {
    const { cookies: baseCookies, path: srcPath } = await loadCookieFile('set', cookieFile, opts.source);
    if (!baseCookies.length) {
      console.log('⚠️ 无可用 Cookie（请先完成一次登录保存）。');
      process.exit(1);
    }
    console.log(`🔧 从 ${srcPath} 读取 ${baseCookies.length} 条 Cookie，开始最小化...`);
    const minimized = await iterativeMinimizeCookies(baseCookies);
    const { removed, kept, removedSummary } = diffCookieSets(baseCookies, minimized);
    await writeJSON(cookieFile, minimized);
    console.log(`✅ 最小化完成：保留 ${kept.length} / 原始 ${baseCookies.length} 条，删除 ${removed.length} 条`);
    const topRemoved = Object.entries(removedSummary).slice(0, 10).map(([k,v]) => `  - ${k} x${v}`).join('\n');
    if (topRemoved) {
      console.log('🗑️ 删除摘要（最多 10 项）：\n' + topRemoved);
    }
    const okAfter = await tryCheckExistingCookies(cookieFile, homepage);
    console.log(`🔁 验证结果：${okAfter ? '✅ 已登录' : '❌ 未登录或不确定'}`);
    process.exit(okAfter ? 0 : 1);
  }

  // 先尝试直接加载本地最小 Cookie 验证登录
  if (!opts.forceInteractive) {
    console.log('🍪 尝试加载已保存的 Cookie 并验证登录...');
    const okByCookies = await tryCheckExistingCookies(cookieFile, homepage);
    if (okByCookies) {
      console.log('✅ 使用已保存 Cookie 验证：已登录');
      process.exit(0);
    }
  } else {
    console.log('🚫 跳过 Cookie 预检，进入交互式登录');
  }

  // 失败则进入交互式登录轮询模式（10s 一次检测）
  console.log('🔐 未登录，进入交互式登录等待模式（每 10s 检测一次头像元素）...');
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox','--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(homepage, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('domcontentloaded');
  await dismissModals(page);
  try { await page.bringToFront?.(); } catch {}
  console.log('📍 已打开 1688 主页，请完成登录。系统将每 10 秒自动检测登录状态...');

  const { timeoutMs } = parseArgs();
  const perCheck = 10000; // 10s
  const maxWait = timeoutMs || 10 * 60 * 1000; // 默认最多等待 10 分钟（如传入 --timeoutSec 则按传入)
  const start = Date.now();
  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > maxWait) {
      console.log('⏰ 超时未检测到已登录头像元素，结束。');
      await browser.close();
      process.exit(1);
    }
    await page.waitForTimeout(perCheck);
    await dismissModals(page);
    const detected = await simpleLoginHeuristic(page);
    console.log(`[${new Date().toLocaleTimeString()}] 检测结果: ${detected ? '✅ 已登录' : '… 未登录'}`);
    if (detected) break;
  }

  // 登录成功，等待 30 秒（允许你解除登录验证）
  console.log('⏳ 等待 30 秒以完成人工验证（如滑块/短信等）...');
  await page.waitForTimeout(30000);
  // 固定当前 Cookie 键集合，并保存
  const currentCookies = await context.cookies();
  const fixedCount = await setFixedKeys(keysFile, currentCookies);
  console.log(`📌 已固定 Cookie 键集合: ${fixedCount} 项 -> ${keysFile}`);
  const { saved, original, rawPath } = await saveCookies(context, cookieFile, keysFile);
  console.log(`✅ Cookie 已保存(固定集合): ${cookieFile} （${saved}/${original} 条）`);
  console.log(`📦 原始 Cookie 备份: ${rawPath}`);
  await browser.close();

  // 再次用保存的最小 Cookie 验证
  const okAfter = await tryCheckExistingCookies(cookieFile, homepage);
  console.log(`🔁 二次验证: ${okAfter ? '✅ 已登录' : '❌ 未登录或不确定'}`);
  process.exit(okAfter ? 0 : 1);
}

main().catch((e) => { console.error('💥 运行失败:', e?.message || e); process.exit(1); });
