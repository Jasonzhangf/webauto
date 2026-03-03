import type { UiCliAction } from './utils.mts';

export function buildSnapshotScript() {
  return `(() => {
    const text = (sel) => {
      const el = document.querySelector(sel);
      return el ? String(el.textContent || '').trim() : '';
    };
    const value = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      if ('value' in el) return String(el.value ?? '');
      return String(el.textContent || '').trim();
    };
    const firstText = (selectors) => {
      for (const sel of selectors) {
        const v = text(sel);
        if (v) return v;
      }
      return '';
    };
    const firstValue = (selectors) => {
      for (const sel of selectors) {
        const v = value(sel);
        if (v) return v;
      }
      return '';
    };
    const activeTab = document.querySelector('.tab.active');
    const errors = Array.from(document.querySelectorAll('#recent-errors-list li'))
      .map((el) => String(el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    return {
      ready: true,
      activeTabId: String(activeTab?.dataset?.tabId || '').trim(),
      activeTabLabel: String(activeTab?.textContent || '').trim(),
      status: text('#status'),
      runId: text('#run-id-text'),
      errorCount: text('#error-count-text'),
      currentPhase: text('#current-phase'),
      currentAction: text('#current-action'),
      progressPercent: text('#progress-percent'),
      keyword: firstValue(['#task-keyword', '#keyword-input', '#task-keyword-input']),
      target: firstValue(['#task-target', '#target-input', '#task-target-input']),
      account: firstValue(['#task-account', '#task-profile', '#account-select']),
      env: firstValue(['#task-env', '#env-select']),
      recentErrors: errors,
      ts: new Date().toISOString(),
    };
  })()`;
}

export function buildActionScript(action: UiCliAction) {
  const payloadJson = JSON.stringify(action);
  const snapshotScript = buildSnapshotScript();

  return `(() => {
    const payload = ${payloadJson};
    const normalize = (v) => String(v || '').trim();
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const query = (selector) => {
      const s = normalize(selector);
      if (!s) return null;
      return document.querySelector(s);
    };
    const queryAll = (selector) => {
      const s = normalize(selector) || 'body';
      return Array.from(document.querySelectorAll(s));
    };
    const findByText = ({ selector, text, exact, nth }) => {
      const q = normalize(selector) || 'button';
      const target = normalize(text);
      const lower = target.toLowerCase();
      if (!target) return null;
      const nodes = Array.from(document.querySelectorAll(q));
      const matched = nodes.filter((el) => {
        const t = normalize(el.textContent);
        if (!t) return false;
        if (exact === true) return t === target;
        return t.toLowerCase().includes(lower);
      });
      const index = Number.isFinite(Number(nth)) ? Math.max(0, Math.floor(Number(nth))) : 0;
      return matched[index] || null;
    };
    const getElementDetails = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const attrs = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      return {
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        },
        computedStyle: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          position: style.position,
          zIndex: style.zIndex,
        },
        attributes: attrs,
        innerText: el.innerText,
        outerHTML: el.outerHTML?.slice(0, 2000),
        tagName: el.tagName,
        className: el.className,
        id: el.id,
      };
    };
    const focusEl = (el) => {
      if (!el || typeof el.focus !== 'function') return false;
      el.focus();
      return document.activeElement === el;
    };
    const clickEl = (el) => {
      if (!el || typeof el.click !== 'function') return false;
      if (typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
      }
      focusEl(el);
      el.click();
      return true;
    };
    const setInputValue = (el, value) => {
      if (!el) return false;
      const text = String(value ?? '');
      if ('value' in el) {
        el.value = text;
      } else {
        el.textContent = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const pressKey = (el, key) => {
      const k = normalize(key) || 'Enter';
      const target = el || document.activeElement || document.body;
      const code = k === 'Escape' ? 'Escape' : k === 'Enter' ? 'Enter' : k;
      const init = { key: k, code, bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent('keydown', init));
      target.dispatchEvent(new KeyboardEvent('keyup', init));
      return true;
    };
    const findTab = () => {
      const tabId = normalize(payload.tabId || payload.value);
      const tabLabel = normalize(payload.tabLabel || payload.selector);
      const tabs = Array.from(document.querySelectorAll('.tab'));
      if (tabId) {
        const byId = tabs.find((el) => normalize(el?.dataset?.tabId) === tabId);
        if (byId) return byId;
      }
      if (tabLabel) {
        const lower = tabLabel.toLowerCase();
        return tabs.find((el) => normalize(el.textContent).toLowerCase().includes(lower)) || null;
      }
      return null;
    };

    if (payload.action === 'snapshot') {
      return { ok: true, snapshot: ${snapshotScript} };
    }
    if (payload.action === 'dialogs') {
      const mode = normalize(payload.value).toLowerCase();
      const w = window;
      const key = '__webauto_ui_cli_dialogs__';
      if (mode === 'silent') {
        if (!w[key]) {
          w[key] = {
            alert: w.alert,
            confirm: w.confirm,
            prompt: w.prompt,
          };
        }
        w.alert = () => {};
        w.confirm = () => true;
        w.prompt = () => '';
        return { ok: true, mode: 'silent' };
      }
      if (mode === 'restore') {
        if (w[key]) {
          w.alert = w[key].alert;
          w.confirm = w[key].confirm;
          w.prompt = w[key].prompt;
          delete w[key];
        }
        return { ok: true, mode: 'restore' };
      }
      return { ok: false, error: 'unsupported_dialog_mode' };
    }
    if (payload.action === 'tab') {
      const tab = findTab();
      if (!tab) return { ok: false, error: 'tab_not_found' };
      clickEl(tab);
      return { ok: true, tab: normalize(tab.textContent), tabId: normalize(tab?.dataset?.tabId) };
    }
    if (payload.action === 'click') {
      const el = query(payload.selector);
      if (!el) return { ok: false, error: 'selector_not_found', selector: normalize(payload.selector) };
      clickEl(el);
      return { ok: true };
    }
    if (payload.action === 'focus') {
      const el = query(payload.selector);
      if (!el) return { ok: false, error: 'selector_not_found', selector: normalize(payload.selector) };
      const focused = focusEl(el);
      return { ok: focused, focused };
    }
    if (payload.action === 'input') {
      const el = query(payload.selector);
      if (!el) return { ok: false, error: 'selector_not_found', selector: normalize(payload.selector) };
      focusEl(el);
      const written = setInputValue(el, payload.value || '');
      return { ok: written, value: String(payload.value || '') };
    }
    if (payload.action === 'select') {
      const el = query(payload.selector);
      if (!el || el.tagName !== 'SELECT') return { ok: false, error: 'select_not_found', selector: normalize(payload.selector) };
      el.value = String(payload.value || '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: el.value };
    }
    if (payload.action === 'press') {
      const el = query(payload.selector);
      const ok = pressKey(el, payload.key);
      return { ok, key: normalize(payload.key) || 'Enter' };
    }
    if (payload.action === 'click_text') {
      const el = findByText({
        selector: payload.selector,
        text: payload.text || payload.value,
        exact: payload.exact === true,
        nth: payload.nth,
      });
      if (!el) return { ok: false, error: 'text_not_found', text: normalize(payload.text || payload.value), selector: normalize(payload.selector) };
      clickEl(el);
      return { ok: true, text: normalize(el.textContent) };
    }
    if (payload.action === 'probe') {
      const selector = normalize(payload.selector) || 'body';
      const nodes = queryAll(selector);
      const first = nodes[0] || null;
      const firstVisible = isVisible(first);
      const text = normalize(first?.textContent);
      const value = first && 'value' in first ? String(first.value ?? '') : text;
      const checked = Boolean(first && 'checked' in first && first.checked === true);
      const disabled = Boolean(first && 'disabled' in first && first.disabled === true);
      const probeText = normalize(payload.text || payload.value);
      let details = null;
      if (first && payload.detailed === true) {
        details = getElementDetails(first);
      }
      let textMatchedCount = 0;
      if (probeText) {
        const target = payload.exact === true ? probeText : probeText.toLowerCase();
        textMatchedCount = nodes.filter((el) => {
          const current = normalize(el.textContent);
          if (!current) return false;
          if (payload.exact === true) return current === target;
          return current.toLowerCase().includes(target);
        }).length;
      }
      return {
        ok: true,
        selector,
        exists: Boolean(first),
        count: nodes.length,
        visible: firstVisible,
        text,
        value,
        checked,
        disabled,
        tagName: first?.tagName || '',
        className: first?.className || '',
        details,
        textMatchedCount,
      };
    }
    if (payload.action === 'start') {
      return { ok: true, started: true };
    }
    if (payload.action === 'status') {
      return { ok: true, status: true };
    }
    if (payload.action === 'stop') {
      return { ok: true, stopped: true };
    }
    if (payload.action === 'close_window') {
      window.close();
      return { ok: true };
    }
    return { ok: false, error: 'unsupported_action', action: normalize(payload.action) };
  })()`;
}
