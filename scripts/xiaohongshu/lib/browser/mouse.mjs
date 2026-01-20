/**
 * 系统级鼠标操作
 */

import { PROFILE } from '../env.mjs';
import { browserServiceCommand, controllerAction, delay } from './commands.mjs';

function clampNumber(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * 规范化点击坐标点，避免点击浏览器 UI 顶栏区域。
 */
export function normalizeClickablePoint(point, viewport, { safeTop = 140, safeBottom = 80 } = {}) {
  const width = viewport?.width ?? 1920;
  const height = viewport?.height ?? 1200;

  const x = clampNumber(point?.x ?? 0, 20, width - 20);
  const y = clampNumber(point?.y ?? 0, safeTop, height - safeBottom);
  return { x, y };
}

export async function systemClickAt(coordinates, viewport = null) {
  if (!coordinates) return;
  const pt = viewport ? normalizeClickablePoint(coordinates, viewport) : coordinates;
  await browserServiceCommand('mouse:move', {
    profileId: PROFILE,
    x: Math.round(pt.x),
    y: Math.round(pt.y),
    steps: 3,
  });
  await delay(80 + Math.random() * 120);
  await browserServiceCommand('mouse:click', {
    profileId: PROFILE,
    x: Math.round(pt.x),
    y: Math.round(pt.y),
    button: 'left',
    clickCount: 1,
  });
}

export async function systemMouseWheel(deltaY, coordinates = null) {
  const dy = Number(deltaY) || 0;
  if (!dy) return;

  if (coordinates) {
    try {
      await browserServiceCommand('mouse:move', {
        profileId: PROFILE,
        x: coordinates.x,
        y: coordinates.y,
        steps: 3,
      });
      await delay(80 + Math.random() * 120);
    } catch (err) {
      console.warn('[MouseWheel] mouse:move failed:', err?.message || String(err));
    }
  }

  // 仅使用 browser-service 系统级滚轮，禁止 JS fallback
  await browserServiceCommand('mouse:wheel', { profileId: PROFILE, deltaY: dy });
}
