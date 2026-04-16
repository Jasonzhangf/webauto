// 1688 商品信息采集 Runner
// 使用协议级操作，避免风控

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { gotoSearchResult } from '../../../../modules/camo-runtime/src/autoscript/action-providers/1688/search-ops.mjs';
import { scrollCollectOfferInfo } from '../../../../modules/camo-runtime/src/autoscript/action-providers/1688/scroll-ops.mjs';
import { collectShopContact } from '../../../../modules/camo-runtime/src/autoscript/action-providers/1688/shop-ops.mjs';
import { checkLoginStatus } from '../../../../modules/camo-runtime/src/autoscript/action-providers/1688/login-ops.mjs';
import { sleep } from '../../../../modules/camo-runtime/src/autoscript/action-providers/1688/dom-ops.mjs';

function resolveCollectArgs(argv = {}) {
  const profileId = String(argv.profile || '').trim();
  const keyword = String(argv.keyword || argv.k || '').trim();
  const maxNotes = Number.isFinite(Number(argv['max-notes'] ?? argv.maxNotes ?? argv.target))
    ? Number(argv['max-notes'] ?? argv.maxNotes ?? argv.target)
    : 60;
  const doShopContact = Boolean(argv['do-shop-contact'] ?? argv.doShopContact ?? false);
  const maxScrolls = Number.isFinite(Number(argv['max-scrolls'] ?? argv.maxScrolls))
    ? Number(argv['max-scrolls'] ?? argv.maxScrolls)
    : 10;
  const env = String(argv.env || 'debug').trim() || 'debug';
  const outputRoot = String(argv['output-root'] || '').trim();
  
  return {
    profileId,
    keyword,
    maxNotes,
    doShopContact,
    maxScrolls,
    env,
    outputRoot: outputRoot || path.join(os.homedir(), '.webauto', 'download', '1688', env),
  };
}

function ensureOutputDir(outputRoot, keyword) {
  const keywordDir = path.join(outputRoot, keyword);
  if (!fs.existsSync(keywordDir)) {
    fs.mkdirSync(keywordDir, { recursive: true });
  }
  return keywordDir;
}

function writeJsonl(filepath, records) {
  for (const record of records) {
    fs.appendFileSync(filepath, JSON.stringify(record) + '\n', 'utf8');
  }
}

export async function run1688Collect(argv = {}) {
  const { profileId, keyword, maxNotes, doShopContact, maxScrolls, env, outputRoot } = resolveCollectArgs(argv);
  
  console.log(JSON.stringify({
    event: '1688.collect.start',
    profileId,
    keyword,
    maxNotes,
    doShopContact,
    maxScrolls,
    env,
    outputRoot,
    timestamp: new Date().toISOString(),
  }));
  
  // 检查登录状态
  const loginResult = await checkLoginStatus(profileId);
  if (!loginResult.isLoggedIn) {
    console.error(JSON.stringify({
      event: '1688.collect.login_required',
      profileId,
      loginResult,
    }));
    throw new Error('LOGIN_REQUIRED: 请先登录 1688');
  }
  
  console.log(JSON.stringify({
    event: '1688.collect.login_ok',
    profileId,
    nickText: loginResult.nickText,
  }));
  
  // 创建输出目录
  const keywordDir = ensureOutputDir(outputRoot, keyword);
  const offerFile = path.join(keywordDir, 'offer-info.jsonl');
  const shopFile = path.join(keywordDir, 'shop-contact.jsonl');
  
  // 跳转到搜索结果页
  const searchResult = await gotoSearchResult(profileId, keyword);
  if (!searchResult.ok) {
    console.error(JSON.stringify({
      event: '1688.collect.search_failed',
      keyword,
      reason: searchResult.reason,
    }));
    throw new Error('SEARCH_FAILED: ' + searchResult.reason);
  }
  
  console.log(JSON.stringify({
    event: '1688.collect.search_ok',
    keyword,
    url: searchResult.url,
    linkCount: searchResult.linkCount,
  }));
  
  // 等待页面稳定
  await sleep(2000);
  
  // 滚动采集商品信息（支持 maxNotes 和 maxScrolls）
  const offerResult = await scrollCollectOfferInfo(profileId, {
    targetCount: maxNotes,
    maxScrolls,
    scrollAmount: 500,
    waitMs: 2500,
  });
  
  if (!offerResult.ok) {
    console.error(JSON.stringify({
      event: '1688.collect.offer_failed',
      keyword,
      reason: offerResult.reason,
    }));
    throw new Error('COLLECT_OFFER_FAILED: ' + offerResult.reason);
  }
  
  console.log(JSON.stringify({
    event: '1688.collect.offer_ok',
    keyword,
    totalCollected: offerResult.totalCollected,
    scrollCount: offerResult.scrollCount,
    stoppedReason: offerResult.stoppedReason,
    scrollLog: offerResult.scrollLog,
  }));
  
  // 写入商品信息
  const offers = offerResult.allResults || [];
  writeJsonl(offerFile, offers);
  
  // 采集店铺联系方式（可选）
  if (doShopContact && offers.length > 0) {
    const shopUrls = offers
      .filter(o => o.shopUrl)
      .map(o => o.shopUrl);
    
    console.log(JSON.stringify({
      event: '1688.collect.shop_start',
      shopCount: shopUrls.length,
    }));
    
    const shopContacts = [];
    for (const shopUrl of shopUrls) {
      try {
        const shopResult = await collectShopContact(profileId, shopUrl);
        if (shopResult.ok && shopResult.data?.companyName) {
          shopContacts.push(shopResult.data);
          console.log(JSON.stringify({
            event: '1688.collect.shop_ok',
            shopUrl,
            companyName: shopResult.data.companyName,
          }));
        }
        await sleep(2000);
      } catch (err) {
        console.log(JSON.stringify({
          event: '1688.collect.shop_error',
          shopUrl,
          error: err?.message || String(err),
        }));
      }
    }
    
    // 写入店铺联系方式
    if (shopContacts.length > 0) {
      writeJsonl(shopFile, shopContacts);
    }
    
    console.log(JSON.stringify({
      event: '1688.collect.shop_done',
      collected: shopContacts.length,
      total: shopUrls.length,
    }));
  }
  
  // 完成
  const summary = {
    ok: true,
    profileId,
    keyword,
    env,
    offerCount: offers.length,
    shopContactCount: doShopContact ? fs.existsSync(shopFile) ? fs.readFileSync(shopFile, 'utf8').split('\n').filter(l => l.trim()).length : 0 : 0,
    scrollCount: offerResult.scrollCount,
    stoppedReason: offerResult.stoppedReason,
    outputDir: keywordDir,
    offerFile,
    shopFile: doShopContact ? shopFile : null,
    timestamp: new Date().toISOString(),
  };
  
  console.log(JSON.stringify({
    event: '1688.collect.complete',
    summary,
  }));
  
  return summary;
}

export function getCollectHelpLines() {
  return [
    'Usage: webauto 1688 collect --profile <id> --keyword <kw> [options]',
    '',
    '1688 商品信息采集:',
    '  --profile <id>       配置好的 camo profile',
    '  --keyword <kw>       搜索关键词',
    '  --max-notes <n>      目标采集数量（默认 60）',
    '  --max-scrolls <n>    最大滚动次数（默认 10）',
    '  --do-shop-contact    是否采集店铺联系方式',
    '  --output-root <p>    自定义输出根目录',
    '  --env <name>         输出环境目录（默认 debug）',
  ];
}
