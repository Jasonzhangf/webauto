import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { BrowserContext } from 'playwright';
import { resolveCookiesRoot } from '../storage-paths.js';

export class BrowserSessionCookies {
  private lastCookieSignature: string | null = null;
  private lastCookieSaveTs = 0;

  constructor(
    private context: BrowserContext,
    private profileId: string,
    private getCurrentUrl: () => string | null,
  ) {}

  private sanitizeHost(host?: string | null): string {
    if (!host) return 'default';
    return host.replace(/[^a-z0-9.-]/gi, '_');
  }

  private hashCookies(cookies: any[]): string {
    const normalized = cookies
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
      }))
      .sort((a, b) => {
        if (a.domain === b.domain) {
          if (a.name === b.name) return (a.path || '').localeCompare(b.path || '');
          return a.name.localeCompare(b.name);
        }
        return (a.domain || '').localeCompare(b.domain || '');
      });
    const hash = crypto.createHash('sha1');
    hash.update(JSON.stringify(normalized));
    return hash.digest('hex');
  }

  private resolveCookieTargets(currentUrl?: string | null): string[] {
    const cookieDir = resolveCookiesRoot();
    const targets = new Set<string>([path.join(cookieDir, `${this.profileId}.json`)]);
    if (currentUrl) {
      try {
        const { hostname } = new URL(currentUrl);
        const hostSegment = this.sanitizeHost(hostname);
        if (hostSegment) {
          targets.add(path.join(cookieDir, `${hostSegment}-latest.json`));
        }
        if (hostname && hostname.includes('weibo')) {
          targets.add(path.join(cookieDir, 'weibo.com-latest.json'));
        }
      } catch {
        targets.add(path.join(cookieDir, 'default-latest.json'));
      }
    }
    return Array.from(targets);
  }

  async getCookies(): Promise<any[]> {
    return this.context.cookies();
  }

  async saveCookiesToFile(filePath: string): Promise<{ path: string; count: number }> {
    const cookies = await this.getCookies();
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
    this.lastCookieSignature = this.hashCookies(cookies);
    this.lastCookieSaveTs = Date.now();
    return { path: filePath, count: cookies.length };
  }

  async saveCookiesIfStable(filePath: string, opts?: { minDelayMs?: number }): Promise<{ path: string; count: number } | null> {
    const minDelayMs = opts?.minDelayMs ?? 3000;
    if (Date.now() - this.lastCookieSaveTs < minDelayMs) {
      return null;
    }
    const cookies = await this.getCookies();
    const newSignature = this.hashCookies(cookies);
    if (newSignature === this.lastCookieSignature) {
      return null;
    }
    return this.saveCookiesToFile(filePath);
  }

  async saveCookiesForActivePage(): Promise<{ path: string; count: number }[]> {
    const currentUrl = this.getCurrentUrl();
    const targets = this.resolveCookieTargets(currentUrl);
    const results: { path: string; count: number }[] = [];
    for (const target of targets) {
      try {
        const result = await this.saveCookiesToFile(target);
        results.push(result);
      } catch {
        // Ignore individual save failures
      }
    }
    return results;
  }

  async injectCookiesFromFile(filePath: string): Promise<{ count: number }> {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const cookies = JSON.parse(data);
      if (!Array.isArray(cookies)) return { count: 0 };
      await this.context.addCookies(cookies);
      return { count: cookies.length };
    } catch {
      return { count: 0 };
    }
  }
}
