// Alibaba.com 店铺/公司操作模块

import { gotoUrl, evaluateReadonly } from './dom-ops.mjs';
import { buildCompanyProfileUrl, buildContactUrl, EXTRACT_CONTACT_INFO_SCRIPT } from './selectors.mjs';

// 访问公司主页
export async function gotoCompanyProfile(profileId, companyCode) {
  const url = buildCompanyProfileUrl(companyCode);
  await gotoUrl(profileId, url, { timeoutMs: 15000 });
  return { ok: true, url: url, companyCode: companyCode };
}

// 访问公司联系页
export async function gotoCompanyContact(profileId, companyCode) {
  const url = buildContactUrl(companyCode);
  await gotoUrl(profileId, url, { timeoutMs: 15000 });
  return { ok: true, url: url, companyCode: companyCode };
}

// 提取公司联系信息
export async function extractContactInfo(profileId) {
  const result = await evaluateReadonly(profileId, EXTRACT_CONTACT_INFO_SCRIPT);
  return result || { companyName: null, email: null, phone: null };
}
