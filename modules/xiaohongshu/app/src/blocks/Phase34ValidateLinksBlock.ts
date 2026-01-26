/**
 * Phase 3-4 Block: 链接前置校验
 *
 * 职责：
 * 1. 确认当前在搜索结果页
 * 2. 读取 phase2-links.jsonl
 * 3. 过滤有效链接（safeUrl 含 xsec_token + searchUrl 含关键字）
 */

import os from 'node:os';
import path from 'node:path';

export interface ValidateLinksInput {
  keyword: string;
  linksPath?: string;
  profile?: string;
  unifiedApiUrl?: string;
}

export interface ValidateLinksOutput {
  success: boolean;
  links: Array<{
    noteId: string;
    safeUrl: string;
    searchUrl: string;
    ts: string;
  }>;
  error?: string;
  totalCount: number;
  validCount: number;
  currentUrl: string;
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function readJsonl(filePath: string): Promise<any[]> {
  const { readFile } = await import('node:fs/promises');
  try {
    const content = await readFile(filePath, 'utf8');
    return content.trim().split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeRepeated(value: string, maxRounds = 3) {
  let current = value;
  for (let i = 0; i < maxRounds; i++) {
    const next = decodeURIComponentSafe(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function matchesKeywordFromSearchUrl(searchUrl: string, keyword: string) {
  try {
    const url = new URL(searchUrl);
    const raw = url.searchParams.get('keyword') || '';
    if (raw) {
      const decoded = decodeRepeated(raw);
      return decoded === keyword || decoded.includes(keyword);
    }
  } catch {
    // ignore
  }
  const enc1 = encodeURIComponent(keyword);
  const enc2 = encodeURIComponent(enc1);
  return searchUrl.includes(keyword) || searchUrl.includes(enc1) || searchUrl.includes(enc2);
}

export async function execute(input: ValidateLinksInput): Promise<ValidateLinksOutput> {
  const {
    keyword,
    linksPath,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase34ValidateLinks] 开始校验链接...`);

  // 1. 确认当前在搜索结果页，如果不在则自动返回
  const currentUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href',
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  console.log(`[Phase34ValidateLinks] 当前页面: ${currentUrl}`);

  // 异常恢复：如果不在搜索结果页，尝试从 links 读取 searchUrl 并返回
  if (!currentUrl.includes('/search_result')) {
    console.warn(`[Phase34ValidateLinks] 当前不在搜索结果页，尝试返回...`);

    const defaultPath = path.join(resolveDownloadRoot(), 'xiaohongshu', 'debug', keyword, 'phase2-links.jsonl');
    const targetPath = linksPath || defaultPath;

    const allLinks = await readJsonl(targetPath);

    if (allLinks.length === 0) {
      throw new Error(`[Phase34ValidateLinks] 当前不在搜索结果页且无法读取链接文件: ${currentUrl}`);
    }

    // 找到第一条有效链接的 searchUrl
    const firstValid = allLinks.find((item: any) => {
      const hasToken = item.safeUrl && item.safeUrl.includes('xsec_token');
      const matchesKeyword = item.searchUrl && matchesKeywordFromSearchUrl(item.searchUrl, keyword);
      return hasToken && matchesKeyword;
    }) as any;

    if (!firstValid || !firstValid.searchUrl) {
      throw new Error(`[Phase34ValidateLinks] 当前不在搜索结果页且无有效搜索URL: ${currentUrl}`);
    }

    console.log(`[Phase34ValidateLinks] 返回搜索结果页: ${firstValid.searchUrl}`);

    await controllerAction('browser:goto', {
      profile,
      url: firstValid.searchUrl,
    }, unifiedApiUrl);

    // 等待页面加载完成
    await delay(3000);

    const afterUrl = await controllerAction('browser:execute', {
      profile,
      script: 'window.location.href',
    }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

    console.log(`[Phase34ValidateLinks] 返回后页面: ${afterUrl}`);

    if (!afterUrl.includes('/search_result')) {
      throw new Error(`[Phase34ValidateLinks] 返回搜索结果页失败: ${afterUrl}`);
    }
  }

  // 2. 读取 phase2-links.jsonl
  const defaultPath = path.join(resolveDownloadRoot(), 'xiaohongshu', 'debug', keyword, 'phase2-links.jsonl');
  const targetPath = linksPath || defaultPath;

  console.log(`[Phase34ValidateLinks] 读取链接文件: ${targetPath}`);

  const allLinks = await readJsonl(targetPath);

  if (allLinks.length === 0) {
    console.warn(`[Phase34ValidateLinks] 链接文件为空或不存在`);
  }

  console.log(`[Phase34ValidateLinks] 总链接数: ${allLinks.length}`);

  // 3. 过滤有效链接
  const validLinks = allLinks.filter((item: any) => {
    const hasToken = item.safeUrl && item.safeUrl.includes('xsec_token');
    const matchesKeyword = item.searchUrl && matchesKeywordFromSearchUrl(item.searchUrl, keyword);
    return hasToken && matchesKeyword;
  });

  console.log(`[Phase34ValidateLinks] 有效链接数: ${validLinks.length}`);

  return {
    success: true,
    links: validLinks,
    totalCount: allLinks.length,
    validCount: validLinks.length,
    currentUrl,
  };
}
