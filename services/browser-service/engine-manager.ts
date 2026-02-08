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



function getDisplayMetricsWithDPR() {
  const dm = getDisplayMetrics();
  const base = dm ? { ...dm } : {};
  const width = Number((base as any).width) || 0;
  const height = Number((base as any).height) || 0;
  const workWidth = Number((base as any).workWidth) || width;
  const workHeight = Number((base as any).workHeight) || height;
  let dpr = 1;
  if (os.platform() === 'darwin') {
    try {
      const sp = spawnSync('system_profiler', ['SPDisplaysDataType', '-json'], { encoding: 'utf8' });
      const spJson = sp.status === 0 && sp.stdout ? JSON.parse(sp.stdout) : null;
      const displays = spJson?.SPDisplaysDataType;
      if (Array.isArray(displays) && displays.length > 0) {
        const first = displays[0];
        const gpus = first?._items;
        const maybe = Array.isArray(gpus) && gpus.length > 0 ? gpus[0] : first;
        const isRetina = maybe?.spdisplays_retina === 'spdisplays_yes' || maybe?.spdisplays_retina === true;
        if (isRetina) dpr = 2;
      }
    } catch {
      if (width >= 2560 && height >= 1440) dpr = 2;
    }
  }
  return { width, height, workWidth, workHeight, source: (base as any).source || 'unknown', dpr };
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
    const dm = getDisplayMetricsWithDPR();
    // Physical display size from OS
    const physicalW = Number(dm?.width || 3840);
    const physicalH = Number(dm?.height || 2160);
    const workW = Number(dm?.workWidth || physicalW || 3840);
    const workH = Number(dm?.workHeight || physicalH || 2046);
    
    // Use provided viewport as MAXIMUM (e.g., from fingerprint or explicit opt), default to full work area
    const maxViewportW = Number(opts.viewport?.width || workW);
    const maxViewportH = Number(opts.viewport?.height || workH);
    
    // Target: fill work area, but don't exceed explicit viewport caps if provided
    const targetW = maxViewportW > 0 ? Math.min(maxViewportW, workW) : workW;
    const targetH = maxViewportH > 0 ? Math.min(maxViewportH, workH) : workH;

    // Use targetW/targetH as viewport (even in headless) to match headful size
    const viewportW = Math.max(1440, Math.floor(Number(targetW) || 3840));
    const viewportH = Math.max(900, Math.floor(Number(targetH) || 2046));

    const envHeadlessW = Number(process.env.WEBAUTO_HEADLESS_WIDTH || 0);
    const envHeadlessH = Number(process.env.WEBAUTO_HEADLESS_HEIGHT || 0);
    const headlessW = envHeadlessW > 0 ? envHeadlessW : viewportW;
    const headlessH = envHeadlessH > 0 ? envHeadlessH : viewportH;
    if (!Number.isFinite(headlessW) || !Number.isFinite(headlessH)) {
      throw new Error('headless viewport invalid');
    }
    
    const headless = Boolean(opts.headless);

    // Final window size: maximize to fill work area (leave small margin for chrome/window decorations)
    const winW = headless ? headlessW : Math.max(1440, Math.floor(workW * 0.95));
    const winH = headless ? headlessH : Math.max(900, Math.floor(workH - 80));
    
    // Ensure integer types for Camoufox
    const screenW = Math.floor(physicalW) | 0;
    const screenH = Math.floor(physicalH) | 0;
    const intWinW = Math.floor(winW) | 0;
    const intWinH = Math.floor(winH) | 0;

    // Firefox/Camoufox requires screenX/screenY to be integers; default to 0 to avoid float errors.

    const camoufox = await loadCamoufox();
    const Camoufox = camoufox.Camoufox;
    if (!Camoufox) throw new Error('camoufox_invalid_api');

    // Build config to force actual display dimensions (without screen constraints to avoid position calc issues)
    const config: Record<string, any> = {
      'screen.width': Math.floor(physicalW),
      'screen.height': Math.floor(physicalH),
      'screen.availWidth': Math.floor(workW),
      'screen.availHeight': Math.floor(workH),
      'window.screenX': 0,
      'window.screenY': 0,
    };
    
    // Force tabs to open in same window (not new windows)
    const firefox_user_prefs = {
      // Force all new windows (including script popups) to open as tabs
      'browser.link.open_newwindow': 3,
      'browser.link.open_newwindow.restriction': 0,
      'browser.link.open_newwindow.override.external': -1,
      // Make sure tab strip is visible and no single-window mode
      'browser.tabs.loadInBackground': false,
      'browser.tabs.loadDivertedInBackground': false,
      'browser.tabs.closeWindowWithLastTab': false,
      'browser.tabs.warnOnClose': false,
      'browser.tabs.tabMinWidth': 50,
    };
    
    const result = await Camoufox({
      headless,
      os: ['windows', 'macos'],
      window: [intWinW, intWinH],
      viewport: [headless ? headlessW : viewportW, headless ? headlessH : viewportH],
      firefox_user_prefs,
      config,
      data_dir: opts.profileDir,
      humanize: true,
      iKnowWhatImDoing: true,
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
