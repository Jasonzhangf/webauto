/**
 * 系统级键盘操作
 */

import { PROFILE } from '../env.mjs';
import { browserServiceCommand } from './commands.mjs';

export function normalizePlaywrightKey(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  if (k === 'Meta+[') return 'Meta+BracketLeft';
  if (k === 'Meta+]') return 'Meta+BracketRight';
  if (k === 'Ctrl+[') return 'Control+BracketLeft';
  if (k === 'Ctrl+]') return 'Control+BracketRight';
  if (k === 'Esc') return 'Escape';
  return k;
}

export async function systemKeyPress(key) {
  if (!key) return;
  const normalized = normalizePlaywrightKey(key);
  await browserServiceCommand('keyboard:press', { profileId: PROFILE, key: normalized });
}

export async function systemTypeText(text, { delayMs = 20 } = {}) {
  const safeText = String(text ?? '');
  await browserServiceCommand('keyboard:type', {
    profileId: PROFILE,
    text: safeText,
    delay: typeof delayMs === 'number' ? delayMs : undefined,
  });
}

