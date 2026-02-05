#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 环境配置模块
 * 
 * 从 phase1-4-full-collect.mjs 中提取的环境变量解析逻辑
 * 提供统一的配置接口
 */

export const DEFAULT_PROFILE = 'xiaohongshu_fresh';

/**
 * 解析 profile（支持 CLI --profile 与 env WEBAUTO_PROFILE）
 */
export function resolveProfile() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--profile');
  if (idx !== -1 && args[idx + 1]) {
    const p = String(args[idx + 1] || '').trim();
    if (p) return p;
  }
  const envProfile = String(process.env.WEBAUTO_PROFILE || '').trim();
  if (envProfile) return envProfile;
  return DEFAULT_PROFILE;
}

// Back-compat: keep PROFILE export used by existing scripts
export const PROFILE = resolveProfile();
export const UNIFIED_API = 'http://127.0.0.1:7701';
export const BROWSER_SERVICE = process.env.WEBAUTO_BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';
export const BROWSER_WS = process.env.WEBAUTO_BROWSER_WS_URL || 'ws://127.0.0.1:8765';
export const SEARCH_GATE = process.env.WEBAUTO_SEARCH_GATE_URL || 'http://127.0.0.1:7790';
export const HOME_URL = 'https://www.xiaohongshu.com';

// Dev/test keyword pool: when SearchGate denies (dev-only) we can rotate keywords to avoid
// repeated searches triggering soft bans. Real runs should pass explicit --keyword.
export const DEV_KEYWORD_POOL = [
  '手机膜',
  '手机壳',
  '充电宝',
  '数据线',
  '无线耳机',
  '蓝牙音箱',
  '智能手表',
  '平板支架',
  '充电头',
  '车载支架',
];

export function getNextDevKeyword(currentKeyword) {
  const current = String(currentKeyword || '').trim();
  const idx = DEV_KEYWORD_POOL.indexOf(current);
  if (idx === -1) return DEV_KEYWORD_POOL[0] || null;
  return DEV_KEYWORD_POOL[idx + 1] || null;
}

/**
 * 解析命令行参数中的关键字
 */
export function resolveKeyword() {
  const args = process.argv.slice(2);
  const keywordIdx = args.indexOf('--keyword');
  if (keywordIdx !== -1 && args[keywordIdx + 1]) {
    return args[keywordIdx + 1];
  }
  return '手机膜'; // 默认关键字
}

/**
 * 解析目标采集数量
 */
export function resolveTarget() {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    const n = parseInt(args[targetIdx + 1], 10);
    return isNaN(n) ? 100 : n;
  }
  return 100; // 默认目标
}

/**
 * 解析环境类型 (debug/prod)
 */
export function resolveEnv() {
  const args = process.argv.slice(2);
  const envIdx = args.indexOf('--env');
  if (envIdx !== -1 && args[envIdx + 1]) {
    const env = args[envIdx + 1];
    if (env === 'debug' || env === 'prod') {
      return env;
    }
  }
  return 'debug'; // 默认环境
}

/**
 * 解析输出分段
 */
export function resolveOutputSegment() {
  const args = process.argv.slice(2);
  const segIdx = args.indexOf('--output-segment');
  if (segIdx !== -1 && args[segIdx + 1]) {
    const seg = args[segIdx + 1];
    if (seg === 'flat' || seg === 'by-day' || seg === 'by-keyword') {
      return seg;
    }
  }
  return 'by-keyword'; // 默认按关键字分段
}

/**
 * 是否 headless 模式
 */
export function isHeadlessMode() {
  return process.env.WEBAUTO_HEADLESS === '1';
}

/**
 * 是否守护进程模式
 */
export function isDaemonMode() {
  return process.env.WEBAUTO_DAEMON === '1';
}

/**
 * 是否重启会话模式
 */
export function isRestartSessionMode() {
  return process.env.WEBAUTO_RESTART_SESSION === '1';
}

/**
 * 是否 URL-only 模式 (Phase 2 只采集链接)
 */
export function isPhase2UrlOnlyMode() {
  const args = process.argv.slice(2);
  return args.includes('--url-only');
}

/**
 * 解析视口高度
 */
export function resolveViewportHeight() {
  const h = parseInt(process.env.WEBAUTO_VIEWPORT_HEIGHT || '900', 10);
  return isNaN(h) ? 900 : h;
}

/**
 * 解析视口宽度
 */
export function resolveViewportWidth() {
  const w = parseInt(process.env.WEBAUTO_VIEWPORT_WIDTH || '1200', 10);
  return isNaN(w) ? 1200 : w;
}

/**
 * 统一配置导出
 */
export const CONFIG = {
  PROFILE,
  DEFAULT_PROFILE,
  UNIFIED_API,
  BROWSER_SERVICE,
  BROWSER_WS,
  SEARCH_GATE,
  HOME_URL,
  // 运行时配置
  keyword: resolveKeyword(),
  target: resolveTarget(),
  env: resolveEnv(),
  outputSegment: resolveOutputSegment(),
  headless: isHeadlessMode(),
  daemon: isDaemonMode(),
  restartSession: isRestartSessionMode(),
  urlOnly: isPhase2UrlOnlyMode(),
  viewport: {
    width: resolveViewportWidth(),
    height: resolveViewportHeight()
  }
};
