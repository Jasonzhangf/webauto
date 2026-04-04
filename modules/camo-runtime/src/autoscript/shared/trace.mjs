export function emitOperationProgress(context, payload = {}) {
  const emit = context?.emitProgress;
  if (typeof emit !== 'function') return;
  emit(payload);
}

export function emitActionTrace(context, actionTrace = [], extra = {}) {
  if (!Array.isArray(actionTrace) || actionTrace.length === 0) return;
  for (let i = 0; i < actionTrace.length; i += 1) {
    const row = actionTrace[i];
    if (!row || typeof row !== 'object') continue;
    const kind = String(row.kind || row.action || '').trim().toLowerCase() || 'trace';
    emitOperationProgress(context, {
      kind,
      step: i + 1,
      ...extra,
      ...row,
    });
  }
}

export function buildTraceRecorder() {
  const actionTrace = [];
  const pushTrace = (item) => {
    if (!item || typeof item !== 'object') return;
    actionTrace.push({ ts: new Date().toISOString(), ...item });
  };
  return { actionTrace, pushTrace };
}
