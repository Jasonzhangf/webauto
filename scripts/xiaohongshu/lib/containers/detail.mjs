/**
 * 详情页容器操作
 */

import { PROFILE } from '../env.mjs';
import { controllerAction, delay } from '../browser/commands.mjs';
import { systemKeyPress } from '../browser/keyboard.mjs';
import { getCurrentUrl, isTokenDetailUrl } from '../browser/page-state.mjs';

const DETAIL_CONTAINER = 'xiaohongshu_detail.note_container';

export async function verifyDetailPageAnchor() {
  try {
    await controllerAction('container:operation', {
      containerId: DETAIL_CONTAINER,
      operationId: 'highlight',
      config: { style: '2px solid #4444ff', duration: 200 },
      sessionId: PROFILE,
    });
    return true;
  } catch {
    return false;
  }
}

export async function extractDetailData() {
  const result = await controllerAction('container:operation', {
    containerId: DETAIL_CONTAINER,
    operationId: 'extract',
    sessionId: PROFILE,
  });
  return result?.data || result;
}

export async function waitForDetailUrlWithToken({ maxWaitMs = 12_000, pollMs = 250 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const url = await getCurrentUrl();
    if (isTokenDetailUrl(url)) return url;
    await delay(pollMs);
  }
  return '';
}

export async function closeDetailPage({ maxTries = 6, waitMs = 800 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    await systemKeyPress('Escape');
    await delay(waitMs);
    const ok = await verifyDetailPageAnchor();
    if (!ok) return true;
  }
  return false;
}
