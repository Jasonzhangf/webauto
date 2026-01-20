/**
 * 浏览器辅助函数
 */
const BROWSER_SERVICE = 'http://127.0.0.1:7704';
const PROFILE = 'xiaohongshu_fresh';

export async function browserCommand(action, args = {}, timeoutMs = 20000) {
  const url = `${BROWSER_SERVICE}/command`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error || 'Unknown error');
  return data;
}

export async function listPages() {
  const res = await browserCommand('page:list', { profileId: PROFILE });
  return res.pages || [];
}

export async function switchToPage(index) {
  return browserCommand('page:switch', { profileId: PROFILE, index });
}

export async function openNewPage(url) {
  return browserCommand('page:new', { profileId: PROFILE, url });
}

export async function closePage(index) {
  return browserCommand('page:close', { profileId: PROFILE, index });
}

export async function executeScript(script) {
  return browserCommand('evaluate', { profileId: PROFILE, script });
}

export async function scroll(deltaY) {
  return browserCommand('mouse:wheel', { profileId: PROFILE, deltaY });
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
