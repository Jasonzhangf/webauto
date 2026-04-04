/**
 * @module shared/diagnostic-utils
 * Cross-platform diagnostic utilities (screenshot capture).
 * Source: unified from xhs/diagnostic-utils.mjs + weibo/diagnostic-utils.mjs.
 */

import path from 'node:path';
import { callAPI } from './api-client.mjs';
import { extractScreenshotBase64 } from './eval-ops.mjs';
import { ensureDir, savePngBase64 } from './persistence.mjs';

/**
 * Sanitize a string for use as a file component.
 * @param {string} value
 * @param {string} [fallback='unknown']
 * @returns {string}
 */
export function sanitizeFileComponent(value, fallback = 'unknown') {
  const text = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return text || fallback;
}

/**
 * Capture a browser screenshot and save to file.
 * @param {object} params
 * @param {string} params.profileId
 * @param {string} params.filePath - Output file path (should end in .png)
 * @returns {Promise<string|null>} File path on success, null if diagnostics disabled
 */
export async function captureScreenshotToFile({ profileId, filePath }) {
  if (process.env.CAMO_DIAGNOSTICS_NO_SCREENSHOT === '1') {
    return null;
  }
  const payload = await callAPI('screenshot', { profileId });
  const base64 = extractScreenshotBase64(payload);
  if (!base64) throw new Error('SCREENSHOT_CAPTURE_FAILED');
  await ensureDir(path.dirname(filePath));
  await savePngBase64(filePath, base64);
  return filePath;
}
