/**
 * 页面状态读取
 */

import { PROFILE } from '../env.mjs';
import { controllerAction } from './commands.mjs';

export async function getCurrentUrl() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'location.href',
  }).catch(() => ({}));
  return result?.result || result?.data?.result || '';
}

export async function getWindowScrollY() {
  const result = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'window.scrollY || document.documentElement.scrollTop || 0',
  }).catch(() => ({}));
  const v = result?.result ?? result?.data?.result;
  return Number(v) || 0;
}

export function extractNoteIdFromDetailUrl(url) {
  if (typeof url !== 'string') return '';
  const m = url.match(/\/explore\/([^/?#]+)/);
  return m ? m[1] : '';
}

export function isTokenDetailUrl(url) {
  return typeof url === 'string' && url.includes('/explore/') && /[?&]xsec_token=/.test(url);
}

