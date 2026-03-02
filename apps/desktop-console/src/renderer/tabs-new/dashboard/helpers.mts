export const normalizeStatus = (value: any) => String(value || '').trim().toLowerCase();

export const isRunningStatus = (value: any) => [
  'running',
  'queued',
  'pending',
  'starting',
].includes(normalizeStatus(value));

export const isTerminalStatus = (value: any) => [
  'completed',
  'done',
  'success',
  'succeeded',
  'failed',
  'error',
  'stopped',
  'canceled',
].includes(normalizeStatus(value));

export const resolveUnifiedPhaseFromOp = (operationId: any, fallback = '运行中') => {
  const op = String(operationId || '').trim();
  if (!op) return fallback;
  if (
    op === 'sync_window_viewport'
    || op === 'goto_home'
    || op === 'fill_keyword'
    || op === 'submit_search'
    || op === 'xhs_assert_logged_in'
    || op === 'abort_on_login_guard'
    || op === 'abort_on_risk_guard'
  ) {
    return '登录校验';
  }
  if (op === 'ensure_tab_pool' || op === 'verify_subscriptions_all_pages') {
    return '采集链接';
  }
  if (
    op === 'open_first_detail'
    || op === 'open_next_detail'
    || op === 'wait_between_notes'
    || op === 'switch_tab_round_robin'
  ) {
    return '打开详情';
  }
  if (
    op === 'detail_harvest'
    || op === 'expand_replies'
    || op === 'comments_harvest'
    || op === 'comment_match_gate'
    || op === 'comment_like'
    || op === 'comment_reply'
    || op === 'close_detail'
  ) {
    return '详情采集点赞';
  }
  return fallback;
};

export const resolveUnifiedActionFromEvent = (eventName: string, payload: any, fallback = '-') => {
  const opId = String(payload?.operationId || '').trim();
  if (opId) {
    if (eventName === 'autoscript:operation_error' || eventName === 'autoscript:operation_recovery_failed') {
      const code = String(payload?.code || '').trim();
      const err = String(payload?.error || payload?.message || '').trim();
      const latencyMs = Math.max(0, Number(payload?.latencyMs || 0) || 0);
      const details: string[] = [];
      if (code) details.push(code);
      if (err) details.push(err);
      if (latencyMs > 0) details.push(`latency=${latencyMs}ms`);
      return details.length > 0 ? `${opId}: ${details.join(' | ')}` : `${opId}: failed`;
    }
    const stage = String(payload?.stage || '').trim();
    return stage ? `${opId}:${stage}` : opId;
  }
  const message = String(payload?.message || payload?.reason || '').trim();
  return message || fallback;
};

export const isXhsCommandTitle = (title: any) => {
  const normalized = String(title || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes('xhs unified') || normalized.startsWith('xhs:') || normalized.startsWith('xhs unified:');
};

export const hasRenderableValue = (value: any) => {
  const text = String(value ?? '').trim();
  return text.length > 0 && text !== '-';
};

export function normalizeDetails(details: any): string | null {
  if (details === undefined || details === null) return null;
  try {
    const text = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;
    return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}\n...` : trimmed;
  } catch {
    return String(details || '').trim() || null;
  }
}

export function normalizeNoteId(value: any): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^[a-zA-Z0-9_-]{6,}$/.test(text)) return text;
  return null;
}

export function normalizeLink(
  urlLike: any,
  noteIdLike: any,
): { url: string; noteId: string | null } | null {
  const rawUrl = String(urlLike || '').trim();
  const noteId = normalizeNoteId(noteIdLike);
  if (rawUrl) {
    if (/^https?:\/\//i.test(rawUrl)) return { url: rawUrl, noteId };
    if (rawUrl.startsWith('/')) return { url: `https://www.xiaohongshu.com${rawUrl}`, noteId };
    if (/^[a-zA-Z0-9_-]{6,}$/.test(rawUrl)) {
      return { url: `https://www.xiaohongshu.com/explore/${rawUrl}`, noteId: noteId || rawUrl };
    }
  }
  if (noteId) {
    return { url: `https://www.xiaohongshu.com/explore/${noteId}`, noteId };
  }
  return null;
}
