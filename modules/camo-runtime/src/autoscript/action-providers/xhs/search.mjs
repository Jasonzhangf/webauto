export function buildSubmitSearchScript(params = {}) {
  const keyword = String(params.keyword || '').trim();
  return `(async () => {
    const state = window.__camoXhsState || (window.__camoXhsState = {});
    const metrics = state.metrics && typeof state.metrics === 'object' ? state.metrics : {};
    state.metrics = metrics;
    metrics.searchCount = Number(metrics.searchCount || 0) + 1;
    metrics.lastSearchAt = new Date().toISOString();
    const input = document.querySelector('#search-input, input.search-input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('SEARCH_INPUT_NOT_FOUND');
    }
    const targetKeyword = ${JSON.stringify(keyword)};
    if (targetKeyword && input.value !== targetKeyword) {
      input.focus();
      input.value = targetKeyword;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const enterEvent = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    const beforeUrl = window.location.href;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', enterEvent));
    input.dispatchEvent(new KeyboardEvent('keypress', enterEvent));
    input.dispatchEvent(new KeyboardEvent('keyup', enterEvent));
    const candidates = ['.input-button .search-icon', '.input-button', 'button.min-width-search-icon'];
    let clickedSelector = null;
    for (const selector of candidates) {
      const button = document.querySelector(selector);
      if (!button) continue;
      if (button instanceof HTMLElement) button.scrollIntoView({ behavior: 'auto', block: 'center' });
      await new Promise((resolve) => setTimeout(resolve, 80));
      button.click();
      clickedSelector = selector;
      break;
    }
    const form = input.closest('form');
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 320));
    return {
      submitted: true,
      via: clickedSelector || 'enter_or_form_submit',
      beforeUrl,
      afterUrl: window.location.href,
      searchCount: metrics.searchCount,
    };
  })()`;
}

export function buildOpenDetailScript(params = {}) {
  const mode = String(params.mode || 'first').trim().toLowerCase();
  const maxNotes = Math.max(1, Number(params.maxNotes ?? params.limit ?? 20) || 20);
  const keyword = String(params.keyword || '').trim();
  const resume = params.resume !== false;
  const incrementalMax = params.incrementalMax !== false;
  const excludeNoteIds = Array.isArray(params.excludeNoteIds)
    ? params.excludeNoteIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const seedCollectCount = Math.max(0, Number(params.seedCollectCount || 0) || 0);
  const seedCollectMaxRounds = Math.max(0, Number(params.seedCollectMaxRounds || 0) || 0);
  const seedCollectStep = Math.max(120, Number(params.seedCollectStep || 360) || 360);
  const seedCollectSettleMs = Math.max(100, Number(params.seedCollectSettleMs || 260) || 260);
  const seedResetToTop = params.seedResetToTop !== false;
  const nextSeekRounds = Math.max(0, Number(params.nextSeekRounds || 8) || 8);
  const nextSeekStep = Math.max(0, Number(params.nextSeekStep || 0) || 0);
  const nextSeekSettleMs = Math.max(120, Number(params.nextSeekSettleMs || 320) || 320);

  return `(async () => {
    const STATE_KEY = '__camoXhsState';
    const normalizeVisited = (value) => {
      if (!Array.isArray(value)) return [];
      return value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    };
    const mergeVisited = (a, b) => Array.from(new Set([
      ...normalizeVisited(a),
      ...normalizeVisited(b),
    ]));
    const loadState = () => {
      const inMemory = window.__camoXhsState && typeof window.__camoXhsState === 'object' ? window.__camoXhsState : {};
      try {
        const stored = localStorage.getItem(STATE_KEY);
        if (!stored) return { ...inMemory };
        const parsed = JSON.parse(stored);
        if (!parsed || typeof parsed !== 'object') return { ...inMemory };
        const merged = { ...inMemory, ...parsed };
        merged.visitedNoteIds = mergeVisited(parsed.visitedNoteIds, inMemory.visitedNoteIds);
        return merged;
      } catch {
        return { ...inMemory };
      }
    };
    const saveState = (nextState) => {
      window.__camoXhsState = nextState;
      try { localStorage.setItem(STATE_KEY, JSON.stringify(nextState)); } catch {}
    };

    const state = loadState();
    if (!Array.isArray(state.visitedNoteIds)) state.visitedNoteIds = [];
    const requestedKeyword = ${JSON.stringify(keyword)};
    const mode = ${JSON.stringify(mode)};
    const previousKeyword = String(state.keyword || '').trim();
    const keywordChanged = Boolean(requestedKeyword && previousKeyword && requestedKeyword !== previousKeyword);
    if (mode === 'first') {
      if (!${resume ? 'true' : 'false'} || keywordChanged) {
        state.visitedNoteIds = [];
      }
    } else if (keywordChanged) {
      state.visitedNoteIds = [];
    }
    const requestedMaxNotes = Number(${maxNotes});
    if (mode === 'first') {
      if (${incrementalMax ? 'true' : 'false'} && ${resume ? 'true' : 'false'} && !keywordChanged) {
        state.maxNotes = Number(state.visitedNoteIds.length || 0) + requestedMaxNotes;
      } else {
        state.maxNotes = requestedMaxNotes;
      }
    } else if (!Number.isFinite(Number(state.maxNotes)) || Number(state.maxNotes) <= 0) {
      state.maxNotes = requestedMaxNotes;
    }
    if (requestedKeyword) state.keyword = requestedKeyword;

    if (mode === 'next' && state.visitedNoteIds.length >= state.maxNotes) {
      throw new Error('AUTOSCRIPT_DONE_MAX_NOTES');
    }

    const excludedNoteIds = new Set(${JSON.stringify(excludeNoteIds)});
    const mapNodes = () => Array.from(document.querySelectorAll('.note-item'))
      .map((item, index) => {
        const cover = item.querySelector('a.cover');
        if (!cover) return null;
        const href = String(cover.getAttribute('href') || '').trim();
        const lastSegment = href.split('/').filter(Boolean).pop() || '';
        const normalized = lastSegment.split('?')[0].split('#')[0];
        const noteId = normalized || ('idx_' + index);
        return { cover, href, noteId };
      })
      .filter(Boolean);
    let nodes = mapNodes();
    const seedCollectedSet = new Set();
    const seedCollectEnabled = mode === 'first'
      && Number(${seedCollectCount}) > 0
      && Number(${seedCollectMaxRounds}) > 0;
    if (seedCollectEnabled) {
      const collectVisible = () => {
        for (const row of mapNodes()) {
          if (!row || !row.noteId) continue;
          seedCollectedSet.add(row.noteId);
        }
      };
      collectVisible();
      const maxRounds = Number(${seedCollectMaxRounds});
      const targetCount = Number(${seedCollectCount});
      for (let round = 0; round < maxRounds && seedCollectedSet.size < targetCount; round += 1) {
        window.scrollBy({ top: Number(${seedCollectStep}), left: 0, behavior: 'auto' });
        await new Promise((resolve) => setTimeout(resolve, Number(${seedCollectSettleMs})));
        collectVisible();
      }
      if (${seedResetToTop ? 'true' : 'false'}) {
        window.scrollTo({ top: 0, behavior: 'auto' });
        await new Promise((resolve) => setTimeout(resolve, Number(${seedCollectSettleMs})));
      }
      nodes = mapNodes();
    }
    if (nodes.length === 0) throw new Error('NO_SEARCH_RESULT_ITEM');

    const isEligible = (row) => (
      row
      && row.noteId
      && !excludedNoteIds.has(row.noteId)
      && !state.visitedNoteIds.includes(row.noteId)
    );
    const resolveSeekStep = () => {
      const configured = Number(${nextSeekStep});
      if (Number.isFinite(configured) && configured > 0) return configured;
      const viewportHeight = Math.max(
        Number(window.innerHeight || 0) || 0,
        Number(document.documentElement?.clientHeight || 0) || 0,
      );
      return Math.max(240, Math.floor(viewportHeight * 0.9));
    };
    const seekStep = resolveSeekStep();

    let next = nodes.find((row) => isEligible(row));
    if (!next) {
      let stagnantRounds = 0;
      for (let round = 0; !next && round < Number(${nextSeekRounds}); round += 1) {
        const beforeTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        window.scrollBy({ top: seekStep, left: 0, behavior: 'auto' });
        await new Promise((resolve) => setTimeout(resolve, Number(${nextSeekSettleMs})));
        nodes = mapNodes();
        next = nodes.find((row) => isEligible(row));
        const afterTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (Math.abs(afterTop - beforeTop) < 2) stagnantRounds += 1;
        else stagnantRounds = 0;
        if (stagnantRounds >= 2) break;
      }
    }
    if (!next) throw new Error('AUTOSCRIPT_DONE_NO_MORE_NOTES');

    const detailSelectors = [
      '.note-detail-mask',
      '.note-detail-page',
      '.note-detail-dialog',
      '.note-detail-mask .detail-container',
      '.note-detail-mask .media-container',
      '.note-detail-mask .note-scroller',
      '.note-detail-mask .note-content',
      '.note-detail-mask .interaction-container',
      '.note-detail-mask .comments-container',
    ];
    const isVisible = (node) => {
      if (!node || !(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    const isDetailReady = () => detailSelectors.some((selector) => isVisible(document.querySelector(selector)));

    next.cover.scrollIntoView({ behavior: 'auto', block: 'center' });
    await new Promise((resolve) => setTimeout(resolve, 140));
    const beforeUrl = window.location.href;
    next.cover.click();

    let detailReady = false;
    for (let i = 0; i < 60; i += 1) {
      if (isDetailReady()) {
        detailReady = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (!detailReady) {
      throw new Error('DETAIL_OPEN_TIMEOUT');
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
    const afterUrl = window.location.href;

    if (!state.visitedNoteIds.includes(next.noteId)) state.visitedNoteIds.push(next.noteId);
    state.currentNoteId = next.noteId;
    state.currentHref = next.href;
    state.lastListUrl = beforeUrl;
    saveState(state);
    return {
      opened: true,
      source: mode === 'next' ? 'open_next_detail' : 'open_first_detail',
      noteId: next.noteId,
      visited: state.visitedNoteIds.length,
      maxNotes: state.maxNotes,
      openByClick: true,
      beforeUrl,
      afterUrl,
      excludedCount: excludedNoteIds.size,
      seedCollectedCount: seedCollectedSet.size,
      seedCollectedNoteIds: Array.from(seedCollectedSet),
    };
  })()`;
}
