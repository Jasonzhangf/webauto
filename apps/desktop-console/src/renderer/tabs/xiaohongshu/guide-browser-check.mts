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
    return;
  }

  guideState.browserReady = false;
  browserStatus.textContent = '❌ 浏览器检查能力不可用';
  browserStatus.style.color = '#ef4444';
  saveGuideState(guideState);
}
