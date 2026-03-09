import path from 'node:path';
import { getProfileState } from './state.mjs';
import { emitOperationProgress } from './trace.mjs';
import { ensureDir, writeJsonFile, savePngBase64, resolveXhsOutputContext } from './persistence.mjs';
import { sanitizeFileComponent, captureScreenshotToFile } from './diagnostic-utils.mjs';
import { evaluateReadonly } from './dom-ops.mjs';

export function buildTimeoutDomSnapshotScript() {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      } catch { return false; }
      return true;
    };
    const detailSelectors = ['.note-detail-mask', '.note-detail-page', '.note-detail-dialog'];
    const searchSelectors = ['.feeds-page', '.note-item', '.search-result-list'];
    const detailVisible = detailSelectors.some((selector) => isVisible(document.querySelector(selector)));
    const searchVisible = searchSelectors.some((selector) => isVisible(document.querySelector(selector)));
    const html = document.documentElement?.outerHTML || '';
    const active = document.activeElement;
    const closeRect = (function() {
      const btn = document.querySelector('.note-detail-mask .close-btn, .note-detail-page .close-btn, .close-btn');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })();
    return {
      detailVisible, searchVisible,
      href: normalize(location.href || ''),
      title: normalize(document.title || ''),
      activeElement: active ? { id: String(active.id || ''), className: String(active.className || '').slice(0, 180) } : null,
      closeRect: closeRect ? { left: Number(closeRect.left || 0), top: Number(closeRect.top || 0), width: Number(closeRect.width || 0), height: Number(closeRect.height || 0) } : null,
      domLength: html.length,
      domSnippet: html.slice(0, 50000),
      capturedAt: new Date().toISOString(),
    };
  })()`;
}

export function buildNoProgressDomSnapshotScript(listSelector, anchorSelector) {
  const listLiteral = JSON.stringify(String(listSelector || '').trim());
  const anchorLiteral = JSON.stringify(String(anchorSelector || '').trim());
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const listSelector = ${listLiteral};
    const anchorSelector = ${anchorLiteral};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect?.();
      if (!rect || rect.width <= 1 || rect.height <= 1) return false;
      try {
        const style = window.getComputedStyle(node);
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      } catch { return false; }
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (vw && vh) {
        if (rect.bottom <= 0 || rect.right <= 0) return false;
        if (rect.top >= vh || rect.left >= vw) return false;
      }
      return true;
    };
    const listNode = listSelector ? document.querySelector(listSelector) : null;
    const containerVisible = listNode ? isVisible(listNode) : false;
    const anchors = anchorSelector ? Array.from(document.querySelectorAll(anchorSelector)) : [];
    const visibleCount = anchors.filter(isVisible).length;
    const html = document.documentElement?.outerHTML || '';
    return {
      href: normalize(location.href || ''),
      title: normalize(document.title || ''),
      listSelector: listSelector || null,
      anchorSelector: anchorSelector || null,
      listCount: listNode ? 1 : 0,
      anchorCount: anchors.length,
      visibleCount,
      containerVisible,
      domLength: html.length,
      domSnippet: html.slice(0, 50000),
      capturedAt: new Date().toISOString(),
    };
  })()`;
}

export async function captureOperationFailure({ profileId, params = {}, context = {}, stage = '', noteId = '', reason = '', extra = {} }) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({ params, state, noteId: noteId || state.currentNoteId || params.noteId });
  const diagnosticsDir = path.join(output.keywordDir, 'diagnostics', 'failures');
  await ensureDir(diagnosticsDir);
  const runId = String(params.runId || context.runId || '').trim();
  const operationId = String(params.operationId || params.operationAction || stage || 'operation').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `failure-${sanitizeFileComponent(runId, 'run')}-${sanitizeFileComponent(operationId, 'op')}-${stamp}`;
  const jsonPath = path.join(diagnosticsDir, `${baseName}.json`);
  const pngPath = path.join(diagnosticsDir, `${baseName}.png`);
  let domSnapshot = null;
  let domError = null;
  try {
    domSnapshot = await evaluateReadonly(profileId, buildTimeoutDomSnapshotScript());
  } catch (err) {
    domError = String(err?.message || err || 'dom_snapshot_failed');
  }
  const screenshotPath = await captureScreenshotToFile({ profileId, filePath: pngPath });
  const payload = {
    runId: runId || null,
    operationId: params.operationId || null,
    operationAction: params.operationAction || null,
    failureCode: reason || params.failureCode || 'OPERATION_FAILURE',
    failureMessage: params.failureMessage || null,
    subscriptionId: params.subscriptionId || null,
    keyword: params.keyword || output.keyword,
    env: params.env || output.env,
    outputRoot: output.root,
    stage,
    noteId: noteId || state.currentNoteId || null,
    extra,
    capturedAt: new Date().toISOString(),
    screenshotPath,
    domError,
    domSnapshot,
  };
  await writeJsonFile(jsonPath, payload);
  emitOperationProgress(context, { kind: 'failure_snapshot', jsonPath, screenshotPath, reason, stage, noteId });
  return { jsonPath, screenshotPath };
}

export async function executeDebugSnapshotOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({ params, state, noteId: state.currentNoteId || params.noteId });
  const diagnosticsDir = path.join(output.keywordDir, 'diagnostics', 'debug-ops');
  await ensureDir(diagnosticsDir);
  const runId = String(params.runId || context.runId || '').trim();
  const operationId = String(params.operationId || params.operationAction || 'operation').trim();
  const phase = String(params.phase || 'point').trim().toLowerCase() || 'point';
  const attempt = Math.max(1, Number(params.attempt || 1) || 1);
  const snapshotId = String(params.snapshotId || `${runId || 'run'}:${operationId}:${attempt}:${phase}`).trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${sanitizeFileComponent(snapshotId, 'snapshot')}-${stamp}`;
  const jsonPath = path.join(diagnosticsDir, `${baseName}.json`);
  const pngPath = path.join(diagnosticsDir, `${baseName}.png`);
  let domSnapshot = null;
  let domError = null;
  try {
    domSnapshot = await evaluateReadonly(profileId, buildTimeoutDomSnapshotScript());
  } catch (err) {
    domError = String(err?.message || err || 'dom_snapshot_failed');
  }
  const screenshotPath = await captureScreenshotToFile({ profileId, filePath: pngPath });
  const payload = {
    snapshotId,
    runId: runId || null,
    operationId: params.operationId || null,
    operationAction: params.operationAction || null,
    phase,
    attempt,
    trigger: params.trigger || null,
    subscriptionId: params.subscriptionId || null,
    keyword: params.keyword || output.keyword,
    env: params.env || output.env,
    outputRoot: output.root,
    noteId: state.currentNoteId || params.noteId || null,
    failureCode: params.failureCode || null,
    failureMessage: params.failureMessage || null,
    result: params.result && typeof params.result === 'object' ? params.result : null,
    capturedAt: new Date().toISOString(),
    screenshotPath,
    domError,
    domSnapshot,
  };
  await writeJsonFile(jsonPath, payload);
  emitOperationProgress(context, {
    kind: 'debug_snapshot',
    snapshotId,
    phase,
    operationId: params.operationId || null,
    operationAction: params.operationAction || null,
    attempt,
    jsonPath,
    screenshotPath,
    href: domSnapshot?.href || null,
    detailVisible: domSnapshot?.detailVisible === true,
    searchVisible: domSnapshot?.searchVisible === true,
  });
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'xhs_debug_snapshot done',
    data: {
      snapshotId,
      jsonPath,
      screenshotPath,
      domError,
      detailVisible: domSnapshot?.detailVisible === true,
      searchVisible: domSnapshot?.searchVisible === true,
    },
  };
}

export async function executeTimeoutSnapshotOperation({ profileId, params = {}, context = {} }) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({ params, state, noteId: state.currentNoteId || params.noteId });
  const diagnosticsDir = path.join(output.keywordDir, 'diagnostics', 'timeouts');
  await ensureDir(diagnosticsDir);
  const runId = String(params.runId || context.runId || '').trim();
  const operationId = String(params.operationId || params.operationAction || 'operation').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `timeout-${sanitizeFileComponent(runId, 'run')}-${sanitizeFileComponent(operationId, 'operation')}-${stamp}`;
  const jsonPath = path.join(diagnosticsDir, `${baseName}.json`);
  const pngPath = path.join(diagnosticsDir, `${baseName}.png`);
  let domSnapshot = null;
  let domError = null;
  try {
    domSnapshot = await evaluateReadonly(profileId, buildTimeoutDomSnapshotScript());
  } catch (err) {
    domError = String(err?.message || err || 'dom_snapshot_failed');
  }
  const screenshotPath = await captureScreenshotToFile({ profileId, filePath: pngPath });
  const payload = {
    runId: runId || null,
    operationId: params.operationId || null,
    operationAction: params.operationAction || null,
    timeoutMs: Number(params.timeoutMs || 0),
    failureCode: params.failureCode || null,
    failureMessage: params.failureMessage || null,
    subscriptionId: params.subscriptionId || null,
    keyword: params.keyword || output.keyword,
    env: params.env || output.env,
    outputRoot: output.root,
    capturedAt: new Date().toISOString(),
    screenshotPath,
    domError,
    domSnapshot,
  };
  await writeJsonFile(jsonPath, payload);
  emitOperationProgress(context, { kind: 'timeout_snapshot', jsonPath, screenshotPath, href: domSnapshot?.href || null, detailVisible: domSnapshot?.detailVisible === true, searchVisible: domSnapshot?.searchVisible === true });
  return { ok: true, code: 'OPERATION_DONE', message: 'xhs_timeout_snapshot done', data: { jsonPath, screenshotPath, domError, detailVisible: domSnapshot?.detailVisible === true, searchVisible: domSnapshot?.searchVisible === true } };
}

export async function dumpNoProgressDiagnostics({
  profileId,
  params = {},
  context = {},
  stage = 'collect_links',
  expected = 0,
  actual = 0,
  persistPath = '',
  lastAnchor = null,
  lastUrl = null,
  lastClickTarget = null,
  listSelector = '',
  anchorSelector = '',
  anchorCount = null,
  visibleCount = null,
  containerVisible = null,
  selectors = null,
  anchorsSample = null,
} = {}) {
  const state = getProfileState(profileId);
  const output = resolveXhsOutputContext({ params, state, noteId: state.currentNoteId || params.noteId });
  const diagnosticsDir = path.join(output.keywordDir, 'diagnostics', 'no-progress');
  await ensureDir(diagnosticsDir);
  const runId = String(params.runId || context.runId || '').trim();
  const operationId = String(stage || 'collect_links').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `no-progress-${sanitizeFileComponent(runId, 'run')}-${sanitizeFileComponent(operationId, 'stage')}-${stamp}`;
  const jsonPath = path.join(diagnosticsDir, `${baseName}.json`);
  const pngPath = path.join(diagnosticsDir, `${baseName}.png`);
  let domSnapshot = null;
  let domError = null;
  try {
    domSnapshot = await evaluateReadonly(profileId, buildNoProgressDomSnapshotScript(listSelector, anchorSelector));
  } catch (err) {
    domError = String(err?.message || err || 'dom_snapshot_failed');
  }
  const screenshotPath = await captureScreenshotToFile({ profileId, filePath: pngPath });
  const payload = {
    runId: runId || null,
    operationId: params.operationId || null,
    operationAction: params.operationAction || null,
    stage,
    expected: Number(expected) || 0,
    actual: Number(actual) || 0,
    persistPath: persistPath || null,
    lastAnchor: lastAnchor || null,
    lastUrl: lastUrl || null,
    lastClickTarget: lastClickTarget || null,
    listSelector: listSelector || null,
    anchorSelector: anchorSelector || null,
    anchorCount: typeof anchorCount === 'number' ? anchorCount : null,
    visibleCount: typeof visibleCount === 'number' ? visibleCount : null,
    containerVisible: typeof containerVisible === 'boolean' ? containerVisible : null,
    selectors: selectors || null,
    anchorsSample: Array.isArray(anchorsSample) ? anchorsSample : null,
    keyword: params.keyword || output.keyword,
    env: params.env || output.env,
    outputRoot: output.root,
    capturedAt: new Date().toISOString(),
    screenshotPath,
    domError,
    domSnapshot,
  };
  await writeJsonFile(jsonPath, payload);
  emitOperationProgress(context, { kind: 'no_progress_snapshot', jsonPath, screenshotPath, stage, expected, actual, persistPath });
  return { jsonPath, screenshotPath, domSnapshot, domError };
}
