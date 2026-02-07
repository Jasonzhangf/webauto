/**
 * LocateAndGuardBlock - 全局自我定位与守卫模块
 *
 * 功能：
 * 1. 基于容器匹配分析当前页面状态
 * 2. 检测 hard stops (risk_control/login_guard/offsite)
 * 3. 记录定位证据到 run-events.jsonl
 * 4. 在关键决策点/迷失时调用，避免盲操作
 *
 * 使用场景：
 * - Phase 脚本入口：确保处于预期状态
 * - 关键操作后验证：导航/点击/滚动后确认状态
 * - 迷失恢复：未命中预期容器时重新定位并执行最小恢复
 */

import { controllerAction } from './helpers/searchExecutor.js';
import { emitRunEvent } from '../../../scripts/xiaohongshu/lib/logger.mjs';

export type HardStopState = 'risk_control' | 'login_guard' | 'offsite' | 'none';

export interface LocateAndGuardInput {
  sessionId: string;
  controllerUrl?: string;
  url?: string;
  /** 期望的容器ID列表，用于验证定位 */
  expectedContainers?: string[];
  /** 是否强制刷新缓存 */
  invalidateCache?: boolean;
  maxDepth?: number;
  maxChildren?: number;
  rootSelector?: string;
  /** 是否启用证据记录 */
  evidence?: boolean;
}

export interface LocateAndGuardOutput {
  /** 是否成功定位到期望容器 */
  located: boolean;
  /** 当前页面URL */
  url: string;
  /** 检测到的容器匹配结果 */
  matchedContainers: string[];
  /** hard stop 状态 */
  hardStop: HardStopState;
  /** 是否需要人工干预 */
  needManualIntervention: boolean;
  /** 缓存状态 */
  cache: {
    enabled: boolean;
    hit: boolean;
    ageMs: number | null;
    ttlMs: number;
  };
  /** 定位耗时ms */
  duration: number;
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

function detectHardStop(containerTree: any, url: string): HardStopState {
  const lowerUrl = url.toLowerCase();

  // 风控页面检测
  if (lowerUrl.includes('/website-login/captcha') ||
      lowerUrl.includes('verifyuuid=') ||
      lowerUrl.includes('/website-login/verify') ||
      lowerUrl.includes('/website-login/security')) {
    return 'risk_control';
  }

  // 登录保护检测
  const hasLoginGuard = findContainerNode(containerTree, 'xiaohongshu_login.login_guard');
  if (hasLoginGuard) return 'login_guard';

  // 站外检测
  if (!url.includes('xiaohongshu.com')) return 'offsite';

  return 'none';
}

export async function execute(input: LocateAndGuardInput): Promise<LocateAndGuardOutput> {
  const {
    sessionId,
    controllerUrl = process.env.WEBAUTO_UNIFIED_API_URL || 'http://127.0.0.1:7701',
    url,
    expectedContainers = [],
    invalidateCache = false,
    maxDepth = 3,
    maxChildren = 10,
    rootSelector,
    evidence = true,
  } = input;

  const startTime = Date.now();

  // 记录定位开始
  if (evidence) {
    await emitRunEvent('locate_start', {
      sessionId,
      expectedContainers,
      url,
    });
  }

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
    const currentUrl = snapshot?.url || url || '';
    const cache = matchResult?.cache || matchResult?.data?.cache || { enabled: false, hit: false, ageMs: null, ttlMs: 5000 };

    // 检测 hard stops
    const hardStop = detectHardStop(containerTree, currentUrl);
    const needManualIntervention = hardStop !== 'none';

    // 检测期望容器
    const matchedContainers: string[] = [];
    for (const id of expectedContainers) {
      const node = findContainerNode(containerTree, id);
      if (node) {
        matchedContainers.push(id);
      }
    }

    const located = expectedContainers.length === 0
      ? true  // 无期望容器时，只要有任何容器匹配就算定位成功
      : matchedContainers.length > 0;

    const duration = Date.now() - startTime;

    // 记录定位结果
    if (evidence) {
      await emitRunEvent('locate_result', {
        sessionId,
        url: currentUrl,
        expectedContainers,
        matchedContainers,
        located,
        hardStop,
        needManualIntervention,
        cache,
        duration,
      });
    }

    return {
      located,
      url: currentUrl,
      matchedContainers,
      hardStop,
      needManualIntervention,
      cache,
      duration,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;

    if (evidence) {
      await emitRunEvent('locate_error', {
        sessionId,
        expectedContainers,
        error: err?.message || String(err),
        duration,
      });
    }

    throw err;
  }
}

/**
 * 检查是否处于预期状态，若不是则抛出错误
 */
export function guardOrThrow(
  output: LocateAndGuardOutput,
  context: string
): void {
  if (output.needManualIntervention) {
    throw new Error(`[${context}] Hard stop detected: ${output.hardStop}. URL: ${output.url}. Manual intervention required.`);
  }

  if (!output.located) {
    throw new Error(`[${context}] Locate failed. Expected containers not found. URL: ${output.url}`);
  }
}

/**
 * 检查是否包含指定容器
 */
export function hasContainer(
  output: LocateAndGuardOutput,
  containerId: string
): boolean {
  return output.matchedContainers.includes(containerId);
}

export default {
  execute,
  guardOrThrow,
  hasContainer,
};
