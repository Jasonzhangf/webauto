import type { BrowserContext } from 'playwright';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

export type EngineType = 'camoufox';

export interface EngineLaunchOptions {
  engine: EngineType;
  headless: boolean;
  profileDir: string;
  viewport: { width: number; height: number };
  userAgent?: string;
  locale: string;
  timezoneId: string;
}

function readNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getDisplayMetrics() {

  const envWidth = readNumber(process.env.WEBAUTO_SCREEN_WIDTH);
  const envHeight = readNumber(process.env.WEBAUTO_SCREEN_HEIGHT);
  if (envWidth && envHeight) {
    return { width: envWidth, height: envHeight, source: 'env' };
  }

  if (os.platform() === 'darwin') {
    try {
      const sp = spawnSync('system_profiler', ['SPDisplaysDataType', '-json'], { encoding: 'utf8' });
      const spJson = sp.status === 0 && sp.stdout ? JSON.parse(sp.stdout) : null;
      let width: number | null = null;
      let height: number | null = null;
      const displays = spJson?.SPDisplaysDataType;
      if (Array.isArray(displays) && displays.length > 0) {
        const first = displays[0];
        const gpus = first?._items;
        const maybe = Array.isArray(gpus) && gpus.length > 0 ? gpus[0] : first;
        const resStr = maybe?.spdisplays_ndrvs?.[0]?._spdisplays_resolution || maybe?._spdisplays_resolution;
        if (typeof resStr === 'string') {
          const m = resStr.match(/(\d+)\s*x\s*(\d+)/i);
          if (m) {
            width = readNumber(m[1]);
            height = readNumber(m[2]);
          }
        }
      }
      const osascript = spawnSync(
        'osascript',
        ['-l', 'JavaScript', '-e',
          `ObjC.import('AppKit');
           const s = $.NSScreen.mainScreen;
           const f = s.frame;
           const v = s.visibleFrame;
           JSON.stringify({
             width: Number(f.size.width),
             height: Number(f.size.height),
             workWidth: Number(v.size.width),
             workHeight: Number(v.size.height)
           });`
        ],
        { encoding: 'utf8' },
      );
      const vf = osascript.status === 0 && osascript.stdout ? JSON.parse(osascript.stdout.trim()) : null;
      const finalW = readNumber(vf?.width) || width;
      const finalH = readNumber(vf?.height) || height;
      const workWidth = readNumber(vf?.workWidth);
      const workHeight = readNumber(vf?.workHeight);
      if (!finalW || !finalH) return null;
      return {
        width: finalW,
        height: finalH,
        ...(workWidth ? { workWidth } : {}),
        ...(workHeight ? { workHeight } : {}),
        source: 'darwin',
      };
    } catch {
      return null;
    }
  }

  if (os.platform() !== 'win32') return null;
  try {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$screen=[System.Windows.Forms.Screen]::PrimaryScreen;',
      '$b=$screen.Bounds;',
      '$w=$screen.WorkingArea;',
      '$video=Get-CimInstance Win32_VideoController | Select-Object -First 1;',
      '$nw=$null;$nh=$null;',
      'if ($video) { $nw=$video.CurrentHorizontalResolution; $nh=$video.CurrentVerticalResolution }',
      '$o=[pscustomobject]@{width=$b.Width;height=$b.Height;workWidth=$w.Width;workHeight=$w.Height;nativeWidth=$nw;nativeHeight=$nh};',
      '$o | ConvertTo-Json -Compress',
    ].join(' ');
    const res = spawnSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (res.status !== 0 || !res.stdout) return null;
    const payload = JSON.parse(res.stdout.trim());
    const nativeWidth = readNumber(payload?.nativeWidth);
    const nativeHeight = readNumber(payload?.nativeHeight);
    const width = readNumber(payload?.width) || nativeWidth || null;
    const height = readNumber(payload?.height) || nativeHeight || null;
    const workWidth = readNumber(payload?.workWidth);
    const workHeight = readNumber(payload?.workHeight);
    if (!width || !height) return null;
    return {
      width,
      height,
      ...(workWidth ? { workWidth } : {}),
      ...(workHeight ? { workHeight } : {}),
      ...(nativeWidth ? { nativeWidth } : {}),
      ...(nativeHeight ? { nativeHeight } : {}),
      source: 'win32',
    };
  } catch {
    return null;
  }
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
    // Camoufox/Firefox is sensitive to non-integer window placement/size values.
    // In practice, when the underlying launch path attempts to derive screenY/screenX from floats,
    // Firefox can crash with: "Invalid type for property window.screenY. Expected int, got number".
    // Also, we want the window size to reflect the *real* OS work area so later system clicks
    // have enough usable viewport.
    // Prefer OS work area (real screen resolution) for window size; fall back to viewport.
    const dm = getDisplayMetrics();
    const workW = Number(dm?.workWidth || dm?.width || 0);
    const workH = Number(dm?.workHeight || dm?.height || 0);
    const baseW = workW > 0 ? workW : Number(opts.viewport?.width || 1440);
    const baseH = workH > 0 ? workH : Number(opts.viewport?.height || 900);
    const winW = Math.max(300, Math.floor(baseW));
    const winH = Math.max(300, Math.floor(baseH));

    // Headless camoufox is much more likely to hit window metric issues; prefer headful.
    const headless = false;

    // Firefox/Camoufox requires screenX/screenY to be integers; default to 0 to avoid float errors.
    const screenX = 0;
    const screenY = 0;

    const camoufox = await loadCamoufox();
    const Camoufox = camoufox.Camoufox;
    if (!Camoufox) throw new Error('camoufox_invalid_api');

    const result = await Camoufox({
      headless,
      os: ['windows', 'macos'],
      window: [winW, winH],
      screen: [screenX, screenY],
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

  throw new Error('chromium_removed');
}
