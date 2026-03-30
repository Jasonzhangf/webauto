import path from 'node:path';
import { callAPI } from '../../../utils/browser-service.mjs';
import { ensureDir } from './persistence.mjs';
import fs from 'node:fs/promises';

export function sanitizeFileComponent(value, fallback = 'unknown') {
  const text = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return text || fallback;
}

export async function captureScreenshotToFile({ profileId, filePath }) {
  if (process.env.CAMO_DIAGNOSTICS_NO_SCREENSHOT === '1') {
    return null;
  }
  try {
    const payload = await callAPI('screenshot', { profileId });
    const base64 = payload?.data || payload?.base64 || payload?.result?.data;
    if (!base64) throw new Error('SCREENSHOT_CAPTURE_FAILED');
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  } catch (err) {
    console.error(`[weibo:diagnostic] screenshot failed: ${err.message}`);
    return null;
  }
}
