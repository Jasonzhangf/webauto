import { execute as detectPageState } from '../../../../workflow/blocks/DetectPageStateBlock.js';
import { execute as anchorVerify } from '../../../../workflow/blocks/AnchorVerificationBlock.js';
import { execute as errorRecovery } from '../../../../workflow/blocks/ErrorRecoveryBlock.js';

export type XhsCheckpointId =
  | 'home_ready'
  | 'search_ready'
  | 'detail_ready'
  | 'comments_ready'
  | 'login_guard'
  | 'risk_control'
  | 'offsite'
  | 'unknown';

export interface DetectCheckpointInput {
  sessionId: string;
  serviceUrl?: string;
}

export interface DetectCheckpointOutput {
  success: boolean;
  checkpoint: XhsCheckpointId;
  stage: string;
  url: string;
  rootId?: string | null;
  matchIds?: string[];
  signals: string[];
  /** DOM side signals from DetectPageStateBlock (when available) */
  dom?: {
    hasDetailMask?: boolean;
    hasSearchInput?: boolean;
    readyState?: string;
    title?: string;
  };
  error?: string;
}

function hasAny(matchIds: string[] | undefined, ids: string[]) {
  const set = new Set(matchIds || []);
  return ids.some((x) => set.has(x));
}

function hasAll(matchIds: string[] | undefined, ids: string[]) {
  const set = new Set(matchIds || []);
  return ids.every((x) => set.has(x));
}

export async function detectXhsCheckpoint(input: DetectCheckpointInput): Promise<DetectCheckpointOutput> {
  const { sessionId, serviceUrl = 'http://127.0.0.1:7701' } = input;
  const state = await detectPageState({ sessionId, platform: 'xiaohongshu', serviceUrl });
  const url = String(state?.url || '').trim();
  const stage = String(state?.stage || 'unknown');
  const rootId = state?.rootId ?? null;
  const matchIds = Array.isArray(state?.matchIds) ? state.matchIds : [];

  const dom = {
    hasDetailMask: typeof state?.dom?.hasDetailMask === 'boolean' ? state.dom.hasDetailMask : undefined,
    hasSearchInput: typeof state?.dom?.hasSearchInput === 'boolean' ? state.dom.hasSearchInput : undefined,
    readyState: typeof state?.dom?.readyState === 'string' ? state.dom.readyState : undefined,
    title: typeof state?.dom?.title === 'string' ? state.dom.title : undefined,
  };

  const signals: string[] = [];
  const allIds = [String(rootId || ''), ...matchIds].filter(Boolean);

  // Risk-control / captcha URL patterns are hard stops (even if container match fails).
  // We must avoid any automated retries here to reduce further risk-control triggers.
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes('/website-login/captcha') ||
    lowerUrl.includes('verifyuuid=') ||
    lowerUrl.includes('verifytype=') ||
    lowerUrl.includes('verifybiz=') ||
    lowerUrl.includes('/website-login/verify') ||
    lowerUrl.includes('/website-login/security')
  ) {
    return {
      success: true,
      checkpoint: 'risk_control',
      stage,
      url,
      rootId,
      matchIds,
      signals: ['risk_control_url'],
      dom,
      error: state?.error,
    };
  }

  // offsite is a hard stop
  if (!url || !url.includes('xiaohongshu.com')) {
    return { success: false, checkpoint: 'offsite', stage, url, rootId, matchIds, signals: ['offsite'], dom, error: state?.error };
  }

  // login guard
  if (hasAny(allIds, ['xiaohongshu_login.login_guard'])) {
    return { success: true, checkpoint: 'login_guard', stage, url, rootId, matchIds, signals: ['login_guard'], dom };
  }

  // risk control (placeholder ids; extend as container library grows)
  if (hasAny(allIds, ['xiaohongshu_login.qrcode_guard', 'xiaohongshu_login.captcha_guard'])) {
    return { success: true, checkpoint: 'risk_control', stage, url, rootId, matchIds, signals: ['risk_control'], dom };
  }

  // comments_ready
  if (
    hasAny(allIds, [
      'xiaohongshu_detail.comment_section',
      'xiaohongshu_detail.comment_section.comment_item',
      'xiaohongshu_detail.end_marker',
    ])
  ) {
    return { success: true, checkpoint: 'comments_ready', stage, url, rootId, matchIds, signals: ['comments_anchor'], dom };
  }

  // detail_ready
  if (hasAll(allIds, ['xiaohongshu_detail.modal_shell', 'xiaohongshu_detail.content_anchor'])) {
    return { success: true, checkpoint: 'detail_ready', stage, url, rootId, matchIds, signals: ['detail_shell', 'content_anchor'], dom };
  }

  // search_ready
  if (hasAll(allIds, ['xiaohongshu_search.search_bar', 'xiaohongshu_search.search_result_list'])) {
    return { success: true, checkpoint: 'search_ready', stage, url, rootId, matchIds, signals: ['search_bar', 'search_result_list'], dom };
  }

  // home_ready
  if (hasAny(allIds, ['xiaohongshu_home.search_input', 'xiaohongshu_home'])) {
    // IMPORTANT:
    // On XHS, the URL may still contain /explore/<noteId>?xsec_token=... even after the detail modal is closed.
    // We must prefer DOM/container evidence over URL.
    // If detail mask is absent and home/search anchors are present, treat as home_ready.
    return { success: true, checkpoint: 'home_ready', stage, url, rootId, matchIds, signals: ['home'], dom };
  }

  return {
    success: stage !== 'unknown',
    checkpoint: 'unknown',
    stage,
    url,
    rootId,
    matchIds,
    signals,
    dom,
    error: state?.error,
  };
}

export interface EnsureCheckpointInput {
  sessionId: string;
  target: XhsCheckpointId;
  serviceUrl?: string;
  timeoutMs?: number;
  allowOneLevelUpFallback?: boolean;
  evidence?: { highlightMs?: number };
}

export interface EnsureCheckpointOutput {
  success: boolean;
  from: XhsCheckpointId;
  to: XhsCheckpointId;
  reached: XhsCheckpointId;
  url: string;
  stage: string;
  attempts: Array<{ action: string; ok: boolean; reason?: string }>;
  signals: string[];
  error?: string;
}

async function highlightAnchors(sessionId: string, serviceUrl: string, ids: string[], ms: number) {
  for (const id of ids) {
    try {
      await anchorVerify({ sessionId, containerId: id, operation: 'enter', serviceUrl });
      return;
    } catch {
      // try next
    }
  }
}

function fallbackTarget(target: XhsCheckpointId): XhsCheckpointId | null {
  // one-level-up policy
  if (target === 'search_ready') return 'home_ready';
  if (target === 'comments_ready') return 'detail_ready';
  if (target === 'detail_ready') return 'search_ready';
  return null;
}

export async function ensureXhsCheckpoint(input: EnsureCheckpointInput): Promise<EnsureCheckpointOutput> {
  const {
    sessionId,
    target,
    serviceUrl = 'http://127.0.0.1:7701',
    timeoutMs = 15000,
    allowOneLevelUpFallback = true,
    evidence = { highlightMs: 1200 },
  } = input;

  const start = Date.now();
  const attempts: Array<{ action: string; ok: boolean; reason?: string }> = [];

  const det0 = await detectXhsCheckpoint({ sessionId, serviceUrl });
  const from = det0.checkpoint;
  let last = det0;

  // quick success
  if (from === target) {
    return { success: true, from, to: target, reached: target, url: det0.url, stage: det0.stage, attempts, signals: det0.signals };
  }

  while (Date.now() - start < timeoutMs) {
    last = await detectXhsCheckpoint({ sessionId, serviceUrl });
    if (last.checkpoint === target) {
      return { success: true, from, to: target, reached: target, url: last.url, stage: last.stage, attempts, signals: last.signals };
    }

    // Always highlight best-effort so user sees where we are.
    const hm = Math.max(200, Math.min(2000, Number(evidence.highlightMs || 1200)));
    if (last.checkpoint === 'detail_ready' || last.checkpoint === 'comments_ready') {
      await highlightAnchors(sessionId, serviceUrl, ['xiaohongshu_detail.modal_shell', 'xiaohongshu_detail.content_anchor'], hm);
    } else if (last.checkpoint === 'search_ready') {
      await highlightAnchors(sessionId, serviceUrl, ['xiaohongshu_search.search_bar', 'xiaohongshu_search.search_result_list'], hm);
    } else if (last.checkpoint === 'home_ready') {
      await highlightAnchors(sessionId, serviceUrl, ['xiaohongshu_home.search_input'], hm);
    }

    // Recovery actions: conservative (ESC-based).
    if (
      (target === 'search_ready' || target === 'home_ready') &&
      (last.checkpoint === 'detail_ready' || last.checkpoint === 'comments_ready')
    ) {
      try {
        await errorRecovery({
          sessionId,
          fromStage: 'detail',
          targetStage: target === 'home_ready' ? 'home' : 'search',
          recoveryMode: 'esc',
          serviceUrl,
          maxRetries: 3,
        });
        attempts.push({ action: 'esc', ok: true });
      } catch (e: any) {
        attempts.push({ action: 'esc', ok: false, reason: e?.message || String(e) });
      }
      continue;
    }

    // No safe automated path; break to fallback or fail.
    break;
  }

  // one-level-up fallback
  if (allowOneLevelUpFallback) {
    const up = fallbackTarget(target);
    if (up && up !== target) {
      const res = await ensureXhsCheckpoint({
        sessionId,
        target: up,
        serviceUrl,
        timeoutMs,
        allowOneLevelUpFallback: false,
        evidence,
      });
      if (res.success) {
        return {
          success: false,
          from,
          to: target,
          reached: up,
          url: res.url,
          stage: res.stage,
          attempts: [...attempts, ...res.attempts, { action: 'need_user_action', ok: false, reason: `need to reach ${target}` }],
          signals: res.signals,
          error: `fallback_reached_${up}_need_${target}`,
        };
      }
    }
  }

  return {
    success: false,
    from,
    to: target,
    reached: last.checkpoint,
    url: last.url,
    stage: last.stage,
    attempts,
    signals: last.signals,
    error: `ensure_checkpoint_failed target=${target} reached=${last.checkpoint}`,
  };
}
