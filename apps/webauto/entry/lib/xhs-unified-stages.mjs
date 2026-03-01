const STAGES = new Set(['full', 'links', 'content', 'like', 'reply', 'detail']);

function normalizeStage(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function resolveXhsStage(argv = {}, overrides = {}) {
  const rawStage = overrides?.stage ?? argv?.stage ?? argv?.['xhs-stage'] ?? 'full';
  const stage = normalizeStage(rawStage) || 'full';
  if (!STAGES.has(stage)) {
    throw new Error(`invalid --stage: ${stage}. use full|links|content|like|reply|detail`);
  }
  return stage;
}

export function resolveXhsUnifiedModeOverrides(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!normalized || normalized === 'phase1-phase2-unified' || normalized === 'unified-only') {
    return {};
  }
  if (normalized === 'phase1-phase2') {
    return {
      stage: 'content',
      doComments: false,
      doLikes: false,
      doReply: false,
      doOcr: false,
      persistComments: false,
    };
  }
  if (normalized === 'links-only') {
    return {
      stage: 'links',
      doHomepage: false,
      doImages: false,
      doComments: false,
      doLikes: false,
      doReply: false,
      doOcr: false,
      persistComments: false,
    };
  }
  if (normalized === 'content-only') {
    return {
      stage: 'content',
      doLikes: false,
      doReply: false,
    };
  }
  if (normalized === 'like-only') {
    return {
      stage: 'like',
      doLikes: true,
      doReply: false,
    };
  }
  if (normalized === 'reply-only') {
    return {
      stage: 'reply',
      doLikes: false,
      doReply: true,
    };
  }
  return null;
}

export function resolveXhsUnifiedOrchestratePlan(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'phase1-only') {
    return {
      action: 'skip',
      reason: 'phase1 is merged into runtime bootstrap',
      overrides: {},
    };
  }
  const overrides = resolveXhsUnifiedModeOverrides(normalized);
  if (overrides === null) {
    throw new Error(`invalid mode: ${normalized}`);
  }
  return {
    action: 'run',
    reason: null,
    overrides,
  };
}
