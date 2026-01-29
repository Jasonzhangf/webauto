import os from 'node:os';
import path from 'node:path';

export interface DownloadPathInput {
  platform: string;
  env: string;
  keyword: string;
  homeDir?: string;
  downloadRoot?: string;
}

export function sanitizeForPath(name: string): string {
  if (!name) return '';
  return name.replace(/[\\/:"*?<>|]+/g, '_').trim();
}

export function resolveDownloadRoot(custom?: string, homeDir?: string): string {
  if (custom && custom.trim()) return custom;
  if (homeDir && homeDir.trim()) return path.join(homeDir, '.webauto', 'download');
  const envHome = process.env.HOME || process.env.USERPROFILE;
  if (envHome && envHome.trim()) return path.join(envHome, '.webauto', 'download');
  try {
    return path.join(os.homedir(), '.webauto', 'download');
  } catch {
    return path.join(process.cwd(), '.webauto', 'download');
  }
}

export function resolveKeywordDir(input: DownloadPathInput): string {
  const { platform, env, keyword, homeDir, downloadRoot } = input;
  const safeKeyword = sanitizeForPath(keyword) || 'unknown';
  const root = resolveDownloadRoot(downloadRoot, homeDir);
  return path.join(root, platform, env, safeKeyword);
}
