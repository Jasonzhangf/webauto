import path from 'node:path';
import { callAPI } from '../../../utils/browser-service.mjs';
import { extractScreenshotBase64 } from './common.mjs';
import { ensureDir, savePngBase64 } from './persistence.mjs';

export function sanitizeFileComponent(value, fallback = 'unknown') {
  const text = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return text || fallback;
}

export async function captureScreenshotToFile({ profileId, filePath }) {
  if (process.env.CAMO_DIAGNOSTICS_NO_SCREENSHOT === '1') {
    return null;
  }
  const payload = await callAPI('screenshot:capture', { profileId });
  const base64 = extractScreenshotBase64(payload);
  if (!base64) throw new Error('SCREENSHOT_CAPTURE_FAILED');
  await ensureDir(path.dirname(filePath));
  await savePngBase64(base64, filePath);
  return filePath;
}
