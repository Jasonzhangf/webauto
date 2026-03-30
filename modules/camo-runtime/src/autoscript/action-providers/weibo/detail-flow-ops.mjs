import { runCamo } from '../../../../../../apps/webauto/entry/lib/camo-cli.mjs';
import { waitForDetailPage } from './detail-ops.mjs';

export async function executeOpenDetailOperation({ profileId, params = {} } = {}) {
  const url = String(params.url || '').trim();
  if (!url) {
    return { ok: false, error: 'WEIBO_DETAIL_OPEN_NO_URL', message: 'url is required' };
  }

  const gotoResult = runCamo(['goto', profileId, url], { timeoutMs: 30000 });
  if (!gotoResult.ok) {
    return { ok: false, error: 'WEIBO_DETAIL_GOTO_FAILED', message: gotoResult.stderr || 'goto failed' };
  }

  const waitResult = await waitForDetailPage(profileId, 25000, 500);
  if (!waitResult.ok) {
    return { ok: false, error: 'WEIBO_DETAIL_WAIT_TIMEOUT', message: `Detail page not ready after ${waitResult.elapsed}ms` };
  }

  return { ok: true, url, elapsed: waitResult.elapsed, state: waitResult.state };
}

export async function executeCloseDetailOperation({ profileId, params = {} } = {}) {
  return { ok: true, action: 'close_detail', note: 'Weibo detail pages do not need explicit close - just navigate away' };
}
