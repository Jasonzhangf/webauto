import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

export function resolveHomeDir(): string {
  const fromEnv = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  const home = String(fromEnv || '').trim() || os.homedir();
  if (!home) throw new Error('无法解析用户主目录（HOME/USERPROFILE/os.homedir 为空）');
  return home;
}

export function resolveDownloadRoot(): string {
  const custom = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (custom) return custom;
  if (process.platform === 'win32') {
    try {
      if (existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore
    }
    return path.join(resolveHomeDir(), '.webauto');
  }
  return path.join(resolveHomeDir(), '.webauto', 'download');
}

export function resolvePlatformEnvKeywordDir(input: {
  platform: string;
  env: string;
  keyword: string;
  downloadRoot?: string;
}): string {
  const downloadRoot = String(input.downloadRoot || '').trim() || resolveDownloadRoot();
  const platform = String(input.platform || '').trim();
  const env = String(input.env || '').trim();
  const keyword = String(input.keyword || '').trim();
  if (!platform) throw new Error('platform 不能为空');
  if (!env) throw new Error('env 不能为空');
  if (!keyword) throw new Error('keyword 不能为空');
  return path.join(downloadRoot, platform, env, keyword);
}
