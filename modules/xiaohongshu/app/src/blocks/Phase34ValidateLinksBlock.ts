/**
 * Phase 3-4 Block: 链接前置校验
 *
 * 职责：
 * 1. 确认当前在搜索结果页
 * 2. 读取 phase2-links.jsonl
 * 3. 过滤有效链接（safeUrl 含 xsec_token）
 */

import os from 'node:os';
import path from 'node:path';
import {
  normalizeShard,
  shardFilterByIndexMod,
  shardFilterByNoteIdHash,
} from './helpers/sharding.js';

export interface ValidateLinksInput {
  keyword: string;
  env?: string;
  linksPath?: string;
  shardIndex?: number;
  shardCount?: number;
  shardBy?: 'noteId-hash' | 'index-mod';
  maxNotes?: number;
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

async function readJsonl(filePath: string): Promise<any[]> {
  const { readFile } = await import('node:fs/promises');
  try {
    const content = await readFile(filePath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
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

export async function execute(input: ValidateLinksInput): Promise<ValidateLinksOutput> {
  const {
    keyword,
    env = 'debug',
    linksPath,
    shardIndex,
    shardCount,
    shardBy = 'noteId-hash',
    maxNotes,
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log('[Phase34ValidateLinks] 开始校验链接...');

  // Phase34 只依赖 phase2-links.jsonl，不依赖 .collect-state.json
  // .collect-state.json 只是 phase2 内部重入状态管理

  const currentUrl = await controllerAction(
    'browser:execute',
    {
      profile,
      script: 'window.location.href',
    },
    unifiedApiUrl,
  ).then((res) => res?.result || res?.data?.result || '');

  console.log(`[Phase34ValidateLinks] 当前页面: ${currentUrl}`);

  // 读取 phase2-links.jsonl
  const defaultPath = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
  const targetPath = linksPath || defaultPath;

  console.log(`[Phase34ValidateLinks] 读取链接文件: ${targetPath}`);

  const allLinks = await readJsonl(targetPath);

  if (allLinks.length === 0) {
    console.warn('[Phase34ValidateLinks] 链接文件为空或不存在');
  }

  console.log(`[Phase34ValidateLinks] 总链接数: ${allLinks.length}`);

  // 过滤有效链接：safeUrl 必须包含 xsec_token
  const validLinks = allLinks.filter((item: any) => {
    const hasToken = typeof item?.safeUrl === 'string' && item.safeUrl.includes('xsec_token');
    return hasToken;
  });

  const cappedLimit = Number.isFinite(Number(maxNotes)) ? Math.max(1, Math.floor(Number(maxNotes))) : null;
  const cappedLinks = cappedLimit ? validLinks.slice(0, cappedLimit) : validLinks;

  const shard = normalizeShard({ index: shardIndex, count: shardCount, by: shardBy });
  const sharded = shard
    ? shard.by === 'index-mod'
      ? shardFilterByIndexMod(cappedLinks, shard)
      : shardFilterByNoteIdHash(cappedLinks, shard)
    : cappedLinks;

  console.log(`[Phase34ValidateLinks] 有效链接数: ${validLinks.length}`);
  if (cappedLimit) {
    console.log(`[Phase34ValidateLinks] 全局上限: ${cappedLimit} -> ${cappedLinks.length} 条`);
  }
  if (shard) {
    console.log(`[Phase34ValidateLinks] Shard(${shard.by}): ${shard.index}/${shard.count} -> ${sharded.length} 条`);
  }

  return {
    success: true,
    links: sharded,
    totalCount: allLinks.length,
    validCount: sharded.length,
    currentUrl,
  };
}
