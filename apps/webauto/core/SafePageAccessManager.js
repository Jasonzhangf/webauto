export const safeAccessManager = {
  async safePageAccess(page, url, { waitUntil = 'domcontentloaded', timeout = 30000 } = {}) {
    try {
      await page.goto(url, { waitUntil, timeout });
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }
};

export default safeAccessManager;

