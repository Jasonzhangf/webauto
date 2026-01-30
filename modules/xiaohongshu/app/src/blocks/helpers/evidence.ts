import path from 'node:path';
import { promises as fs } from 'node:fs';

import { controllerAction } from '../../utils/controllerAction.js';

export function resolveHomeDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) throw new Error('无法获取用户主目录：HOME/USERPROFILE 未设置');
  return homeDir;
}

export function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && String(custom).trim()) return String(custom).trim();
  return path.join(resolveHomeDir(), '.webauto', 'download');
}

export async function takeScreenshotBase64(profileId: string, unifiedApiUrl: string) {
  const shot = await controllerAction(
    'browser:screenshot',
    { profileId, fullPage: false },
    unifiedApiUrl,
  );
  const base64 = shot?.data || shot?.result || shot?.data?.data;
  return typeof base64 === 'string' && base64 ? base64 : null;
}

export async function savePngBase64(base64: string, filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

