// @ts-nocheck
export async function detectLoginAnchor(page, { platform } = {}) {
  try {
    // simplistic heuristic; replace with platform-specific logic
    const hasAnchor = await page.evaluate(() => !!document.querySelector('input[type="password"], [data-login], .login'));
    return { ok: !!hasAnchor, selector: hasAnchor ? 'input[type="password"]' : null, platform };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function waitLoginAnchor(page, { platform, timeoutMs = 15000, intervalMs = 500 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await detectLoginAnchor(page, { platform });
    if (r.ok) return r;
    await page.waitForTimeout(intervalMs);
  }
  return { ok: false, selector: null, platform };
}

