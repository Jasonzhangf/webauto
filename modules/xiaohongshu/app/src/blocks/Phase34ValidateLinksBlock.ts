/**
 * Phase 3-4 Block: 链接前置校验
 *
 * 职责：
 * 1. 确认当前在搜索结果页
 * 2. 读取 phase2-links.jsonl
 * 3. 过滤有效链接（safeUrl 含 xsec_token + searchUrl 含关键字）
 */

export interface ValidateLinksInput {
  keyword: string;
  linksPath?: string;
  profile?: string;
  unifiedApiUrl?: string;
}

export interface ValidateLinksOutput {
  validLinks: Array<{
    noteId: string;
    safeUrl: string;
    searchUrl: string;
    ts: string;
  }>;
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

function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith('~/')) {
    return `${process.env.HOME}/${p.slice(2)}`;
  }
  return p;
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

  // 1. 确认当前在搜索结果页
  const currentUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href',
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  console.log(`[Phase34ValidateLinks] 当前页面: ${currentUrl}`);

  if (!currentUrl.includes('/search_result')) {
    throw new Error(`[Phase34ValidateLinks] 当前不在搜索结果页: ${currentUrl}`);
  }

  // 2. 读取 phase2-links.jsonl
  const defaultPath = expandHome(`~/.webauto/download/xiaohongshu/debug/${keyword}/phase2-links.jsonl`);
  const targetPath = expandHome(linksPath || defaultPath);

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
    validLinks,
    totalCount: allLinks.length,
    validCount: validLinks.length,
    currentUrl,
  };
}
