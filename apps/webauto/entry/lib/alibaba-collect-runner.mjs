#!/usr/bin/env node
// Alibaba.com 采集 Runner（参考 1688-collect-runner.mjs 结构）

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { gotoSearchResult } from '../../../../modules/camo-runtime/src/autoscript/action-providers/alibaba/search-ops.mjs';
import { scrollCollectCompanyLinks, collectCompanyContact } from '../../../../modules/camo-runtime/src/autoscript/action-providers/alibaba/collect-ops.mjs';
import { checkLoginStatus, waitForManualLogin } from '../../../../modules/camo-runtime/src/autoscript/action-providers/alibaba/login-ops.mjs';
import { sleep } from '../../../../modules/camo-runtime/src/autoscript/action-providers/alibaba/dom-ops.mjs';

function resolveCollectArgs(argv = {}) {
  const profileId = String(argv.profileId || argv.profile || '').trim();
  const keyword = String(argv.keyword || argv.k || '').trim();
  const maxNotes = Number.isFinite(Number(argv['max-notes'] ?? argv.maxNotes ?? argv.target))
    ? Number(argv['max-notes'] ?? argv.maxNotes ?? argv.target)
    : 20;
  const doShopContact = Boolean(argv['do-contact'] ?? argv.doContact ?? argv.doShopContact ?? false);
  const maxScrolls = Number.isFinite(Number(argv['max-scrolls'] ?? argv.maxScrolls))
    ? Number(argv['max-scrolls'] ?? argv.maxScrolls)
    : 5;
  const env = String(argv.env || 'debug').trim() || 'debug';
  const outputRoot = String(argv['output-root'] || '').trim();
  
  return {
    profileId,
    keyword,
    maxNotes,
    doShopContact,
    maxScrolls,
    env,
    outputRoot: outputRoot || path.join(os.homedir(), '.webauto', 'download', 'alibaba', env),
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

export async function runAlibabaCollect(argv = {}) {
  const { profileId, keyword, maxNotes, doShopContact, maxScrolls, env, outputRoot } = resolveCollectArgs(argv);
    
    // Step 1: Check login
  const loginResult = await checkLoginStatus(profileId);
  
  // Collect 阶段不需要登录，可以正常采集公司链接
  // Detail 阶段（采集联系人）需要登录
  if (doShopContact && (!loginResult.ok || !loginResult.isLoggedIn)) {
    console.log(JSON.stringify({
      event: 'alibaba.collect.login_required_for_contacts',
      profileId,
      loginResult,
      message: '采集联系人信息需要登录 Alibaba.com，请在浏览器中完成登录操作',
    }));
    
    // 等待手动登录（最长 60 秒）
    const manualResult = await waitForManualLogin(profileId, 60000);
    if (!manualResult.ok) {
      console.error(JSON.stringify({
        event: 'alibaba.collect.login_failed',
        profileId,
        reason: manualResult.reason,
      }));
      throw new Error('LOGIN_FAILED: 登录超时或失败');
    }
    
    console.log(JSON.stringify({
      event: 'alibaba.collect.manual_login_ok',
      profileId,
    }));
  } else if (!doShopContact && loginResult.isLoggedIn) {
    console.log(JSON.stringify({
      event: 'alibaba.collect.login_ok',
      profileId,
      nickText: loginResult.nickText || '',
    }));
  } else if (!doShopContact && !loginResult.isLoggedIn) {
    console.log(JSON.stringify({
      event: 'alibaba.collect.running_without_login',
      profileId,
      message: '未登录状态下运行，仅采集公司链接（不采集联系人）',
    }));
  }
    
  // 创建输出目录
  const keywordDir = ensureOutputDir(outputRoot, keyword);
  const companyFile = path.join(keywordDir, 'company-links.jsonl');
  const contactFile = path.join(keywordDir, 'company-contacts.jsonl');
    
  // 跳转到搜索结果页
  const searchResult = await gotoSearchResult(profileId, keyword);
  if (!searchResult.ok) {
    console.error(JSON.stringify({
      event: 'alibaba.collect.search_failed',
      keyword,
      reason: searchResult.reason || 'unknown',
    }));
    throw new Error('SEARCH_FAILED: 无法访问搜索结果页');
  }
    
  console.log(JSON.stringify({
    event: 'alibaba.collect.search_ok',
    keyword,
    url: searchResult.url,
  }));
    
  // 等待页面稳定
  await sleep(2000);
  
  // 滚动采集公司链接
  const collectResult = await scrollCollectCompanyLinks(profileId, {
    maxScrolls,
    minResults: maxNotes,
  });
    
  if (!collectResult.ok) {
    console.error(JSON.stringify({
      event: 'alibaba.collect.company_failed',
      keyword,
      reason: collectResult.reason || 'unknown',
    }));
    throw new Error('COLLECT_COMPANY_FAILED: ' + (collectResult.reason || 'unknown'));
  }
    
  console.log(JSON.stringify({
    event: 'alibaba.collect.company_ok',
    keyword,
    totalCollected: collectResult.count,
  }));
    
  // 保存公司链接
  writeJsonl(companyFile, collectResult.results);
  console.log(JSON.stringify({
    event: 'alibaba.collect.saved',
    path: companyFile,
    count: collectResult.count,
  }));
  
  // 采集联系信息（可选）
  if (doShopContact && collectResult.results.length > 0) {
    console.log(JSON.stringify({
      event: 'alibaba.collect.contacts_start',
      targetCount: Math.min(maxNotes, collectResult.results.length),
    }));
    const contactResults = [];
    for (const company of collectResult.results.slice(0, maxNotes)) {
      try {
        const contactResult = await collectCompanyContact(profileId, company.profileUrl);
        if (contactResult.ok) {
          contactResults.push(contactResult);
          console.log(JSON.stringify({
            event: 'alibaba.collect.contact_ok',
            companyCode: contactResult.companyCode,
            email: contactResult.email,
          }));
}
   
      } catch (e) {
        console.log(JSON.stringify({
          event: 'alibaba.collect.contact_failed',
          company: company.companyCode,
          error: e.message || String(e),
        }));
      }
    }
    
    writeJsonl(contactFile, contactResults);
    console.log(JSON.stringify({
      event: 'alibaba.collect.contacts_saved',
      path: contactFile,
      count: contactResults.length,
    }));
  }
  
  console.log(JSON.stringify({
    event: 'alibaba.collect.complete',
    keyword,
    totalCollected: collectResult.count,
    doShopContact,
    timestamp: new Date().toISOString(),
  }));
}
