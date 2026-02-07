/**
 * LocateAndGuardBlock - 统一的 DOM 缓存与定位模块
 *
 * 功能：
 * - 调用 containers:match，自动管理 DOM 缓存（cache/invalidateCache）
 * - 检测指定的容器列表是否存在（基于 container_tree）
 * - 记录 locate_result 事件到 run-events.jsonl
 *
 * 使用场景：
 * - 关键决策点定位（导航后、点击后、滚动后）
 * - 迷失时定位（未命中预期容器时重新定位）
 *
 * 缓存策略：
 * - 缓存键：sessionId + url + maxDepth + maxChildren + rootSelector
 * - TTL：5000ms（可通过 WEBAUTO_CONTAINER_SNAPSHOT_CACHE_TTL_MS 配置）
 * - 强制刷新：invalidateCache: true
 */

import { controllerAction } from './helpers/searchExecutor.js';
import { emitRunEvent } from '../../../scripts/xiaohongshu/lib/logger.mjs';

export interface LocateAndGuardInput {
  sessionId: string;
  controllerUrl?: string;
  url?: string;
  containerIds: string[];
  invalidateCache?: boolean;
  maxDepth?: number;
  maxChildren?: number;
  rootSelector?: string;
}

export interface LocateAndGuardOutput {
  located: boolean;
  containers: Map<string, { matched: boolean; rect: any }>;
  cache: {
    enabled: boolean;
    hit: boolean;
    ageMs: number | null;
    ttlMs: number;
  };
}

interface ContainerNode {
  id: string;
  children?: ContainerNode[];
  match?: {
    nodes?: Array<{ rect?: any }>;
  };
}

function findContainerNode(tree: any, targetId: string): ContainerNode | null {
  if (!tree) return null;
  const root = tree.container || tree.containers?.[0];
  if (!root) return null;
  
  function search(node: ContainerNode): ContainerNode | null {
    if (node.id === targetId) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
    }
    return null;
  }
  
  return search(root);
}

function extractContainerRect(node: ContainerNode): any {
  return node.match?.nodes?.[0]?.rect || null;
}

export async function execute(input: LocateAndGuardInput): Promise<LocateAndGuardOutput> {
  const {
    sessionId,
    controllerUrl = process.env.WEBAUTO_UNIFIED_API_URL || 'http://127.0.0.1:7701',
    url,
    containerIds,
    invalidateCache = false,
    maxDepth = 3,
    maxChildren = 10,
    rootSelector,
  } = input;

  const startTime = Date.now();
  
  try {
    const matchResult = await controllerAction(
      controllerUrl,
      'containers:match',
      {
        profile: sessionId,
        url,
        maxDepth,
        maxChildren,
        rootSelector,
        cache: true,
        invalidateCache,
      }
    );

    const snapshot = matchResult?.snapshot || matchResult?.data?.snapshot;
    const containerTree = snapshot?.container_tree;
    const cache = matchResult?.cache || matchResult?.data?.cache || { enabled: false, hit: false, ageMs: null, ttlMs: 5000 };

    const locatedMap = new Map<string, { matched: boolean; rect: any }>();
    let allLocated = true;

    for (const id of containerIds) {
      const node = findContainerNode(containerTree, id);
      const matched = !!node;
      const rect = matched ? extractContainerRect(node) : null;
      locatedMap.set(id, { matched, rect });
      if (!matched) allLocated = false;
    }

    const duration = Date.now() - startTime;

    await emitRunEvent('locate_result', {
      containerIds,
      located: allLocated,
      containers: Object.fromEntries(locatedMap),
      cache,
      duration,
    });

    return {
      located: allLocated,
      containers: locatedMap,
      cache,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    await emitRunEvent('locate_result', {
      containerIds,
      located: false,
      error: err?.message || String(err),
      duration,
    });
    throw err;
  }
}

export function isContainerLocated(
  output: LocateAndGuardOutput,
  containerId: string
): boolean {
  return output.containers.get(containerId)?.matched || false;
}

export function getContainerRect(
  output: LocateAndGuardOutput,
  containerId: string
): any {
  return output.containers.get(containerId)?.rect || null;
}

export default {
  execute,
  isContainerLocated,
  getContainerRect,
};
