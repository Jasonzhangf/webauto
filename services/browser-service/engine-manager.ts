import type { BrowserContext } from 'playwright';
import { chromium } from 'playwright';

export type EngineType = 'chromium' | 'camoufox';

export interface EngineLaunchOptions {
  engine: EngineType;
  headless: boolean;
  profileDir: string;
  viewport: { width: number; height: number };
  userAgent?: string;
  locale: string;
  timezoneId: string;
}

async function loadCamoufox(): Promise<any> {
  // Prefer dynamic import; fall back to require for NodeNext interop edge cases.
  try {
    return await import('camoufox');
  } catch (err) {
    const mod = await import('node:module');
    const require = mod.createRequire(import.meta.url);
    return require('camoufox');
  }
}

export async function launchEngineContext(opts: EngineLaunchOptions): Promise<BrowserContext> {
  if (opts.engine === 'camoufox') {
    const camoufox = await loadCamoufox();
    const Camoufox = camoufox.Camoufox;
    if (!Camoufox) throw new Error('camoufox_invalid_api');

    const result = await Camoufox({
      headless: !!opts.headless,
      os: ['windows', 'macos'],
      window: [opts.viewport.width, opts.viewport.height],
      data_dir: opts.profileDir,
      humanize: true,
      locale: 'zh-CN',
      fonts: [
        'PingFang SC',
        'Hiragino Sans GB',
        'STHeiti',
        'Microsoft YaHei',
        'SimHei',
        'SimSun',
        'Microsoft JhengHei',
        'Noto Sans CJK SC',
        'Source Han Sans SC',
        'Arial Unicode MS',
        'Helvetica',
        'Arial',
        'Sans-Serif',
      ],
      custom_fonts_only: false,
    });

    if (result && typeof result.pages === 'function') {
      // Already a BrowserContext
      return result as BrowserContext;
    }
    if (result && typeof result.newContext === 'function') {
      // Browser -> create a new context
      return (await result.newContext()) as BrowserContext;
    }

    throw new Error('camoufox_invalid_response');
  }

  return chromium.launchPersistentContext(opts.profileDir, {
    headless: !!opts.headless,
    viewport: opts.viewport,
    userAgent: opts.userAgent,
    acceptDownloads: false,
    bypassCSP: false,
    locale: opts.locale,
    timezoneId: opts.timezoneId,
  });
}

