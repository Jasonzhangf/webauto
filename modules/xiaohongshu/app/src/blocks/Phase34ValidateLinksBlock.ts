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
import { normalizeShard, shardFilterByNoteIdHash } from './helpers/sharding.js';

export interface ValidateLinksInput {
  keyword: string;
  env?: string;
  linksPath?: string;
  shardIndex?: number;
  shardCount?: number;
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

async function readJsonMaybe(filePath: string): Promise<any | null> {
  const { readFile } = await import('node:fs/promises');
  try {
    const content = await readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
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
    env = 'debug',
    linksPath,
    shardIndex,
    shardCount,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase34ValidateLinks] 开始校验链接...`);

  // Phase34 与浏览器状态脱耦：只依赖 Phase2 的结果文件与持久化 state。
  // 禁止在此阶段触发搜索/导航（风险高、并行时会互相干扰）。
  const statePath = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, '.collect-state.json');
  const state = await readJsonMaybe(statePath);
  if (state) {
    const lastStep = String(state?.resume?.lastStep || '');
    const status = String(state?.status || '');
    const collectedCount = Number(state?.listCollection?.collectedUrls?.length || 0);
    const targetCount = Number(state?.listCollection?.targetCount || 0);
    const phase2Done = lastStep === 'phase2_done' || status === 'completed' || status === 'phase2_completed';
    if (!phase2Done) {
      throw new Error(
        `[Phase34ValidateLinks] Phase2 未完成（state.lastStep=${lastStep} status=${status}），禁止启动 Phase34。state=${statePath}`,
      );
    }
    if (targetCount > 0 && collectedCount < targetCount) {
      throw new Error(
        `[Phase34ValidateLinks] Phase2 未达到目标数量（${collectedCount}/${targetCount}），禁止启动 Phase34。state=${statePath}`,
      );
    }
  }

  const currentUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href',
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  console.log(`[Phase34ValidateLinks] 当前页面: ${currentUrl}`);

  // 2. 读取 phase2-links.jsonl
  const defaultPath = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
  const targetPath = linksPath || defaultPath;

  console.log(`[Phase34ValidateLinks] 读取链接文件: ${targetPath}`);

  const allLinks = await readJsonl(targetPath);

  if (allLinks.length === 0) {
    console.warn(`[Phase34ValidateLinks] 链接文件为空或不存在`);
  }

  console.log(`[Phase34ValidateLinks] 总链接数: ${allLinks.length}`);

  // 3. 过滤有效链接
  // Phase34 只依赖 Phase2 产物：safeUrl 必须包含 xsec_token。
  // 注意：Phase2 在“壳页”场景下 searchUrl 可能是 /explore/<id>（不是 /search_result）。
  // 因此 Phase34 不应再用 searchUrl 做关键字匹配门禁，否则会把有效数据全部过滤掉。
  const validLinks = allLinks.filter((item: any) => {
    const hasToken = typeof item?.safeUrl === 'string' && item.safeUrl.includes('xsec_token');
    return hasToken;
  });

  const shard = normalizeShard({ index: shardIndex, count: shardCount, by: 'noteId-hash' });
  const sharded = shard ? shardFilterByNoteIdHash(validLinks, shard) : validLinks;

  console.log(`[Phase34ValidateLinks] 有效链接数: ${validLinks.length}`);
  if (shard) {
    console.log(`[Phase34ValidateLinks] Shard: ${shard.index}/${shard.count} -> ${sharded.length} 条`);
  }

  return {
    success: true,
    links: sharded,
    totalCount: allLinks.length,
    validCount: sharded.length,
    currentUrl,
  };
}
