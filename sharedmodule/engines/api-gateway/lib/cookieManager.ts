// @ts-nocheck
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export const COOKIES_DIR = join(homedir(), '.webauto', 'cookies');

export function sanitizeHost(host: string) {
  try { return String(host || '').toLowerCase().replace(/[^a-z0-9.\-]/g, '_'); } catch { return 'unknown'; }
}

export function listCookieFilesForUrl(url: string) {
  try {
    const u = new URL(url);
    const host = sanitizeHost(u.hostname || '');
    if (!host) return [];
    const files = [] as string[];
    files.push(join(COOKIES_DIR, `${host}.json`));
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2) {
      const base = parts.slice(-2).join('.');
      if (base !== host) files.push(join(COOKIES_DIR, `${base}.json`));
    }
    if (host.includes('1688.com')) files.push(join(COOKIES_DIR, '1688-domestic.json'));
    return files;
  } catch { return []; }
}

export async function ensureCookiesForUrl(context, url: string) {
  try {
    const files = listCookieFilesForUrl(url);
    let injected = false;
    for (const f of files) {
      try {
        if (!existsSync(f)) continue;
        const raw = JSON.parse(readFileSync(f, 'utf8'));
        const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.cookies) ? raw.cookies : null);
        if (!Array.isArray(arr)) continue;
        const shaped = arr.map(c => {
          const x = { ...c };
          if (!x.path) x.path = '/';
          if (x.expires !== undefined && Number(x.expires) <= 0) delete x.expires; // session cookie
          return x;
        });
        await context.addCookies(shaped);
        injected = true;
      } catch {}
    }
    return injected;
  } catch {
    return false;
  }
}
