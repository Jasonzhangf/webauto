import { callAPI, getDomSnapshotByProfile } from '../../../utils/browser-service.mjs';
import { isJsExecutionEnabled } from '../../../utils/js-policy.mjs';
import { executeTabPoolOperation } from './tab-pool.mjs';
import { executeViewportOperation } from './viewport.mjs';
import {
  asErrorPayload,
  buildSelectorCheck,
  ensureActiveSession,
  extractPageList,
  getCurrentUrl,
  maybeSelector,
  normalizeArray,
} from '../utils.mjs';

const TAB_ACTIONS = new Set([
  'ensure_tab_pool',
  'tab_pool_switch_next',
  'tab_pool_switch_slot',
]);

const VIEWPORT_ACTIONS = new Set([
  'sync_window_viewport',
  'get_current_url',
]);

async function executeExternalOperationIfAny({
  profileId,
  action,
  params,
  operation,
  context,
}) {
  const executor = context?.executeExternalOperation;
  if (typeof executor !== 'function') return null;
  const result = await executor({
    profileId,
    action,
    params,
    operation,
    context,
  });
  if (result === null || result === undefined) return null;
  if (result && typeof result === 'object' && typeof result.ok === 'boolean') {
    return result;
  }
  return asErrorPayload('OPERATION_FAILED', 'external operation executor returned invalid payload', {
    action,
    resultType: typeof result,
  });
}

async function flashOperationViewport(profileId, params = {}) {
  if (!isJsExecutionEnabled()) return;
  if (params.highlight === false) return;
  try {
    await callAPI('evaluate', {
      profileId,
      script: `(() => {
        const root = document.documentElement;
        if (!(root instanceof HTMLElement)) return { ok: false };
        const prevShadow = root.style.boxShadow;
        const prevTransition = root.style.transition;
        root.style.transition = 'box-shadow 80ms ease';
        root.style.boxShadow = 'inset 0 0 0 3px #ff7a00';
        setTimeout(() => {
          root.style.boxShadow = prevShadow;
          root.style.transition = prevTransition;
        }, 260);
        return { ok: true };
      })()`,
    });
  } catch {
    // highlight failure should never block action execution
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isTargetFullyInViewport(target, margin = 6) {
  const rect = target?.rect && typeof target.rect === 'object' ? target.rect : null;
  const viewport = target?.viewport && typeof target.viewport === 'object' ? target.viewport : null;
  if (!rect || !viewport) return true;
  const vw = Number(viewport.width || 0);
  const vh = Number(viewport.height || 0);
  if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0) return true;
  const left = Number(rect.left || 0);
  const top = Number(rect.top || 0);
  const width = Math.max(0, Number(rect.width || 0));
  const height = Math.max(0, Number(rect.height || 0));
  const right = left + width;
  const bottom = top + height;
  const m = Math.max(0, Number(margin) || 0);
  return left >= m && top >= m && right <= (vw - m) && bottom <= (vh - m);
}

function resolveScrollDeltaY(target, margin = 6) {
  const rect = target?.rect && typeof target.rect === 'object' ? target.rect : null;
  const viewport = target?.viewport && typeof target.viewport === 'object' ? target.viewport : null;
  if (!rect || !viewport) return 0;
  const vh = Number(viewport.height || 0);
  if (!Number.isFinite(vh) || vh <= 0) return 0;
  const top = Number(rect.top || 0);
  const height = Math.max(0, Number(rect.height || 0));
  const bottom = top + height;
  const m = Math.max(0, Number(margin) || 0);
  if (top < m) {
    return clamp(Math.round(top - m - 24), -900, -80);
  }
  if (bottom > (vh - m)) {
    return clamp(Math.round(bottom - (vh - m) + 24), 80, 900);
  }
  return 0;
}

async function resolveSelectorTarget(profileId, selector) {
  const selectorLiteral = JSON.stringify(String(selector || '').trim());
  const payload = await callAPI('evaluate', {
    profileId,
    script: `(() => {
      const selector = ${selectorLiteral};
      const nodes = Array.from(document.querySelectorAll(selector));
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        try {
          const style = window.getComputedStyle(node);
          if (!style) return false;
          if (style.display === 'none') return false;
          if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
          const opacity = Number.parseFloat(String(style.opacity || '1'));
          if (Number.isFinite(opacity) && opacity <= 0.01) return false;
        } catch {
          return false;
        }
        return true;
      };
      const hitVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect?.();
        if (!rect) return false;
        const x = Math.max(0, Math.min((window.innerWidth || 1) - 1, rect.left + rect.width / 2));
        const y = Math.max(0, Math.min((window.innerHeight || 1) - 1, rect.top + rect.height / 2));
        const top = document.elementFromPoint(x, y);
        if (!top) return false;
        return top === node || node.contains(top) || top.contains(node);
      };
      const target = nodes.find((item) => isVisible(item) && hitVisible(item))
        || nodes.find((item) => isVisible(item))
        || nodes[0]
        || null;
      if (!target) {
        return { ok: false, error: 'selector_not_found', selector };
      }
      const rect = target.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 };
      const rawCenterX = Number(rect.left) + Math.max(1, Number(rect.width) / 2);
      const rawCenterY = Number(rect.top) + Math.max(1, Number(rect.height) / 2);
      const viewport = {
        width: Number(window.innerWidth || 0),
        height: Number(window.innerHeight || 0),
      };
      const center = {
        x: Math.max(1, Math.min((viewport.width || 1) - 1, Math.round(rawCenterX))),
        y: Math.max(1, Math.min((viewport.height || 1) - 1, Math.round(rawCenterY))),
      };
      return {
        ok: true,
        selector,
        matchedIndex: Math.max(0, nodes.indexOf(target)),
        center,
        rawCenter: {
          x: rawCenterX,
          y: rawCenterY,
        },
        rect: {
          left: Number(rect.left || 0),
          top: Number(rect.top || 0),
          width: Number(rect.width || 0),
          height: Number(rect.height || 0),
        },
        viewport,
      };
    })()`,
  });
  const result = payload?.result || payload?.data?.result || payload?.data || payload || null;
  if (!result || result.ok !== true || !result.center) {
    throw new Error(`Element not found: ${selector}`);
  }
  return result;
}

async function scrollTargetIntoViewport(profileId, selector, initialTarget, params = {}) {
  let target = initialTarget;
  const maxSteps = Math.max(0, Math.min(8, Number(params.maxScrollSteps ?? 3) || 3));
  const settleMs = Math.max(0, Number(params.scrollSettleMs ?? 0) || 0);
  const margin = Math.max(0, Number(params.viewportMargin ?? 6) || 6);
  for (let i = 0; i < maxSteps; i += 1) {
    if (isTargetFullyInViewport(target, margin)) break;
    const deltaY = resolveScrollDeltaY(target, margin);
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 1) break;
    await callAPI('mouse:wheel', { profileId, deltaX: 0, deltaY });
    if (settleMs > 0) await sleep(settleMs);
    target = await resolveSelectorTarget(profileId, selector);
  }
  return target;
}

async function executeSelectorOperation({ profileId, action, operation, params }) {
  const selector = maybeSelector({
    profileId,
    containerId: params.containerId || operation?.containerId || null,
    selector: params.selector || operation?.selector || null,
  });
  if (!selector) return asErrorPayload('CONTAINER_NOT_FOUND', `${action} requires selector/containerId`);

  let target = await resolveSelectorTarget(profileId, selector);
  target = await scrollTargetIntoViewport(profileId, selector, target, params);

  if (action === 'scroll_into_view') {
    return {
      ok: true,
      code: 'OPERATION_DONE',
      message: 'scroll_into_view done',
      data: { selector, target },
    };
  }

  if (action === 'click') {
    const button = String(params.button || 'left').trim() || 'left';
    const clicks = Math.max(1, Number(params.clicks ?? 1) || 1);
    const delay = Number(params.delay);
    const result = await callAPI('mouse:click', {
      profileId,
      x: target.center.x,
      y: target.center.y,
      button,
      clicks,
      ...(Number.isFinite(delay) && delay >= 0 ? { delay } : {}),
    });
    return { ok: true, code: 'OPERATION_DONE', message: 'click done', data: { selector, target, result } };
  }

  const text = String(params.text ?? params.value ?? '');
  await callAPI('mouse:click', {
    profileId,
    x: target.center.x,
    y: target.center.y,
    button: 'left',
    clicks: 1,
    delay: 30,
  });
  const clearBeforeType = params.clear !== false;
  if (clearBeforeType) {
    await callAPI('keyboard:press', {
      profileId,
      key: process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
    });
    await callAPI('keyboard:press', { profileId, key: 'Backspace' });
  }
  const delay = Number(params.keyDelayMs ?? params.delay);
  await callAPI('keyboard:type', {
    profileId,
    text,
    ...(Number.isFinite(delay) && delay >= 0 ? { delay } : {}),
  });
  if (params.pressEnter === true) {
    await callAPI('keyboard:press', { profileId, key: 'Enter' });
  }
  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'type done',
    data: { selector, target, length: text.length },
  };
}

async function executeVerifySubscriptions({ profileId, params }) {
  const defaultVisible = params.visible !== false;
  const defaultMinCount = Math.max(0, Number(params.minCount ?? 1) || 1);
  const selectorItems = normalizeArray(params.subscriptions || params.selectors)
    .map((item, idx) => {
      if (typeof item === 'string') {
        return {
          id: `selector_${idx + 1}`,
          selector: item,
          visible: defaultVisible,
          minCount: defaultMinCount,
        };
      }
      if (!item || typeof item !== 'object') return null;
      const selector = String(item.selector || '').trim();
      if (!selector) return null;
      const visible = item.visible !== undefined
        ? item.visible !== false
        : defaultVisible;
      const minCount = Math.max(0, Number(item.minCount ?? defaultMinCount) || defaultMinCount);
      return {
        id: String(item.id || `selector_${idx + 1}`),
        selector,
        visible,
        minCount,
      };
    })
    .filter(Boolean);
  if (selectorItems.length === 0) {
    return asErrorPayload('OPERATION_FAILED', 'verify_subscriptions requires params.selectors');
  }

  const acrossPages = params.acrossPages === true;
  const settleMs = Math.max(0, Number(params.settleMs ?? 280) || 280);
  const pageUrlIncludes = normalizeArray(params.pageUrlIncludes)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const pageUrlExcludes = normalizeArray(params.pageUrlExcludes)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const pageUrlRegex = String(params.pageUrlRegex || '').trim();
  const pageUrlNotRegex = String(params.pageUrlNotRegex || '').trim();
  const requireMatchedPages = params.requireMatchedPages !== false;

  let includeRegex = null;
  if (pageUrlRegex) {
    try {
      includeRegex = new RegExp(pageUrlRegex);
    } catch {
      return asErrorPayload('OPERATION_FAILED', `invalid pageUrlRegex: ${pageUrlRegex}`);
    }
  }
  let excludeRegex = null;
  if (pageUrlNotRegex) {
    try {
      excludeRegex = new RegExp(pageUrlNotRegex);
    } catch {
      return asErrorPayload('OPERATION_FAILED', `invalid pageUrlNotRegex: ${pageUrlNotRegex}`);
    }
  }

  const hasPageFilter = (
    pageUrlIncludes.length > 0
    || pageUrlExcludes.length > 0
    || Boolean(includeRegex)
    || Boolean(excludeRegex)
  );

  const shouldVerifyPage = (rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (pageUrlIncludes.length > 0 && !pageUrlIncludes.some((part) => url.includes(part))) {
      return false;
    }
    if (pageUrlExcludes.length > 0 && pageUrlExcludes.some((part) => url.includes(part))) {
      return false;
    }
    if (includeRegex && !includeRegex.test(url)) {
      return false;
    }
    if (excludeRegex && excludeRegex.test(url)) {
      return false;
    }
    return true;
  };

  const collectForCurrentPage = async () => {
    const snapshot = await getDomSnapshotByProfile(profileId);
    const url = await getCurrentUrl(profileId);
    const matches = selectorItems.map((item) => ({
      id: item.id,
      selector: item.selector,
      visible: item.visible,
      minCount: item.minCount,
      count: buildSelectorCheck(snapshot, {
        css: item.selector,
        visible: item.visible,
      }).length,
    }));
    return { url, matches };
  };

  let pagesResult = [];
  let overallOk = true;
  let matchedPageCount = 0;
  if (!acrossPages) {
    const current = await collectForCurrentPage();
    overallOk = current.matches.every((item) => item.count >= item.minCount);
    pagesResult = [{ index: null, ...current }];
  } else {
    const listed = await callAPI('page:list', { profileId });
    const { pages, activeIndex } = extractPageList(listed);
    for (const page of pages) {
      const pageIndex = Number(page.index);
      const listedUrl = String(page.url || '');
      if (!shouldVerifyPage(listedUrl)) {
        pagesResult.push({
          index: pageIndex,
          url: listedUrl,
          skipped: true,
          ok: true,
        });
        continue;
      }
      if (Number.isFinite(activeIndex) && activeIndex !== pageIndex) {
        await callAPI('page:switch', { profileId, index: pageIndex });
        if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
      }
      const current = await collectForCurrentPage();
      const pageOk = current.matches.every((item) => item.count >= item.minCount);
      overallOk = overallOk && pageOk;
      pagesResult.push({ index: pageIndex, ...current, ok: pageOk });
      matchedPageCount += 1;
    }
    if (Number.isFinite(activeIndex)) {
      await callAPI('page:switch', { profileId, index: activeIndex });
    }
  }

  if (acrossPages && hasPageFilter && requireMatchedPages && matchedPageCount === 0) {
    return asErrorPayload('SUBSCRIPTION_MISMATCH', 'no page matched verify_subscriptions pageUrl filter', {
      acrossPages,
      pageUrlIncludes,
      pageUrlExcludes,
      pageUrlRegex: pageUrlRegex || null,
      pageUrlNotRegex: pageUrlNotRegex || null,
      pages: pagesResult,
    });
  }

  if (!overallOk) {
    return asErrorPayload('SUBSCRIPTION_MISMATCH', 'subscription selectors missing on one or more pages', {
      acrossPages,
      matchedPageCount,
      pages: pagesResult,
    });
  }

  return {
    ok: true,
    code: 'OPERATION_DONE',
    message: 'verify_subscriptions done',
    data: { acrossPages, matchedPageCount, pages: pagesResult },
  };
}

export async function executeOperation({ profileId, operation, context = {} }) {
  try {
    const session = await ensureActiveSession(profileId);
    const resolvedProfile = session.profileId || profileId;
    const action = String(operation?.action || '').trim();
    const params = operation?.params || operation?.config || {};

    if (!action) {
      return asErrorPayload('OPERATION_FAILED', 'operation.action is required');
    }

    if (action !== 'wait') {
      await flashOperationViewport(resolvedProfile, params);
    }

    if (TAB_ACTIONS.has(action)) {
      return await executeTabPoolOperation({
        profileId: resolvedProfile,
        action,
        params,
        context,
      });
    }

    if (VIEWPORT_ACTIONS.has(action)) {
      return await executeViewportOperation({
        profileId: resolvedProfile,
        action,
        params,
      });
    }

    if (action === 'goto') {
      const url = String(params.url || params.value || '').trim();
      if (!url) return asErrorPayload('OPERATION_FAILED', 'goto requires params.url');
      const result = await callAPI('goto', { profileId: resolvedProfile, url });
      return { ok: true, code: 'OPERATION_DONE', message: 'goto done', data: result };
    }

    if (action === 'back') {
      const result = await callAPI('page:back', { profileId: resolvedProfile });
      return { ok: true, code: 'OPERATION_DONE', message: 'back done', data: result };
    }

    if (action === 'list_pages') {
      const result = await callAPI('page:list', { profileId: resolvedProfile });
      const { pages, activeIndex } = extractPageList(result);
      return { ok: true, code: 'OPERATION_DONE', message: 'list_pages done', data: { pages, activeIndex, raw: result } };
    }

    if (action === 'new_page') {
      const rawUrl = String(params.url || params.value || '').trim();
      const payload = rawUrl ? { profileId: resolvedProfile, url: rawUrl } : { profileId: resolvedProfile };
      const result = await callAPI('newPage', payload);
      return { ok: true, code: 'OPERATION_DONE', message: 'new_page done', data: result };
    }

    if (action === 'switch_page') {
      const index = Number(params.index ?? params.value);
      if (!Number.isFinite(index)) {
        return asErrorPayload('OPERATION_FAILED', 'switch_page requires params.index');
      }
      const result = await callAPI('page:switch', { profileId: resolvedProfile, index });
      return { ok: true, code: 'OPERATION_DONE', message: 'switch_page done', data: result };
    }

    if (action === 'wait') {
      const ms = Math.max(0, Number(params.ms ?? params.value ?? 0));
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { ok: true, code: 'OPERATION_DONE', message: 'wait done', data: { ms } };
    }

    if (action === 'scroll') {
      const amount = Math.max(1, Number(params.amount ?? params.value ?? 300) || 300);
      const direction = String(params.direction || 'down').toLowerCase();
      let deltaX = 0;
      let deltaY = amount;
      if (direction === 'up') deltaY = -amount;
      else if (direction === 'left') {
        deltaX = -amount;
        deltaY = 0;
      } else if (direction === 'right') {
        deltaX = amount;
        deltaY = 0;
      }
      const result = await callAPI('mouse:wheel', { profileId: resolvedProfile, deltaX, deltaY });
      return {
        ok: true,
        code: 'OPERATION_DONE',
        message: 'scroll done',
        data: { direction, amount, deltaX, deltaY, result },
      };
    }

    if (action === 'press_key') {
      const key = String(params.key || params.value || '').trim();
      if (!key) return asErrorPayload('OPERATION_FAILED', 'press_key requires params.key');
      const delay = Number(params.delay);
      const result = await callAPI('keyboard:press', {
        profileId: resolvedProfile,
        key,
        ...(Number.isFinite(delay) && delay >= 0 ? { delay } : {}),
      });
      return { ok: true, code: 'OPERATION_DONE', message: 'press_key done', data: result };
    }

    if (action === 'verify_subscriptions') {
      return executeVerifySubscriptions({ profileId: resolvedProfile, params });
    }

    if (action === 'evaluate') {
      return asErrorPayload('JS_DISABLED', 'evaluate is disabled in webauto runtime');
    }

    if (action === 'click' || action === 'type' || action === 'scroll_into_view') {
      return executeSelectorOperation({
        profileId: resolvedProfile,
        action,
        operation,
        params,
      });
    }

    const externalResult = await executeExternalOperationIfAny({
      profileId: resolvedProfile,
      action,
      params,
      operation,
      context,
    });
    if (externalResult) return externalResult;

    return asErrorPayload('UNSUPPORTED_OPERATION', `Unsupported operation action: ${action}`);
  } catch (err) {
    return asErrorPayload('OPERATION_FAILED', err?.message || String(err), { context });
  }
}
