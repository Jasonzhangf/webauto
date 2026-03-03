export const XHS_NAV_TARGET_KEY = 'webauto.xhs.navTarget.v1';

export function consumeNavTarget(focusTile: (id: string) => void) {
  let target = '';
  try {
    target = String(window.localStorage.getItem(XHS_NAV_TARGET_KEY) || '').trim();
    if (target) window.localStorage.removeItem(XHS_NAV_TARGET_KEY);
  } catch {
    target = '';
  }
  if (target === 'account') {
    focusTile('account');
  }
}

export async function runGuideBrowserCheck(
  api: any,
  guideState: any,
  browserStatus: HTMLSpanElement | HTMLDivElement,
  saveGuideState: (state: any) => void,
) {
  const script = window.api.pathJoin('apps', 'webauto', 'entry', 'xhs-install.mjs');
  const args = [script, '--check-browser-only'];

  browserStatus.textContent = '⏳ 浏览器检查中...';
  browserStatus.style.color = '#f59e0b';

  if (typeof window.api?.cmdRunJson === 'function') {
    const out = await window.api
      .cmdRunJson({ title: 'xhs install check', cwd: '', args, timeoutMs: 120000 })
      .catch(() => ({ ok: false }));
    const merged = String(out?.stdout || out?.stderr || '').replace(/\x1b\[[0-9;]*m/g, '');
    if (out?.ok) {
      guideState.browserReady = true;
      browserStatus.textContent = '✅ 浏览器检查通过';
      browserStatus.style.color = '#22c55e';
      saveGuideState(guideState);
      return { ok: true, detail: merged };
    } else if (/Camoufox 未安装/i.test(merged)) {
      guideState.browserReady = false;
      browserStatus.textContent = '⚠️ 未安装 Camoufox';
      browserStatus.style.color = '#f59e0b';
      if (merged) api?.appendLog?.(`[xhs-guide] install check\n${merged}`);
    } else {
      guideState.browserReady = false;
      browserStatus.textContent = '❌ 浏览器检查失败';
      browserStatus.style.color = '#ef4444';
      if (merged) api?.appendLog?.(`[xhs-guide] install check\n${merged}`);
    }
    saveGuideState(guideState);
    return { ok: false, detail: merged };
  }

  guideState.browserReady = false;
  browserStatus.textContent = '❌ 浏览器检查能力不可用';
  browserStatus.style.color = '#ef4444';
  saveGuideState(guideState);
  return { ok: false, detail: 'cmdRunJson_unavailable' };
}

export async function runGuideBrowserRepair(
  api: any,
  guideState: any,
  browserStatus: HTMLSpanElement | HTMLDivElement,
  saveGuideState: (state: any) => void,
) {
  const script = window.api.pathJoin('apps', 'webauto', 'entry', 'xhs-install.mjs');
  const args = [script, '--auto', '--ensure-backend', '--json'];

  browserStatus.textContent = '⏳ 正在修复浏览器环境...';
  browserStatus.style.color = '#f59e0b';

  if (typeof window.api?.cmdRunJson === 'function') {
    const out = await window.api
      .cmdRunJson({ title: 'xhs install repair', cwd: '', args, timeoutMs: 600000 })
      .catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
    const merged = String(out?.stdout || out?.stderr || out?.error || '').replace(/\x1b\[[0-9;]*m/g, '');
    const message = String(out?.json?.message || '').trim();
    if (out?.ok) {
      guideState.browserReady = true;
      browserStatus.textContent = message ? `✅ ${message}` : '✅ 浏览器修复完成';
      browserStatus.style.color = '#22c55e';
      saveGuideState(guideState);
      return { ok: true, detail: merged };
    }
    guideState.browserReady = false;
    browserStatus.textContent = message ? `❌ ${message}` : '❌ 浏览器修复失败';
    browserStatus.style.color = '#ef4444';
    if (merged) api?.appendLog?.(`[xhs-guide] install repair\n${merged}`);
    saveGuideState(guideState);
    return { ok: false, detail: merged };
  }

  guideState.browserReady = false;
  browserStatus.textContent = '❌ 修复能力不可用';
  browserStatus.style.color = '#ef4444';
  saveGuideState(guideState);
  return { ok: false, detail: 'cmdRunJson_unavailable' };
}
