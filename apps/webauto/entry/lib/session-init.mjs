import { runCamo } from './camo-cli.mjs';

const START_WINDOW_MIN_WIDTH = 960;
const START_WINDOW_MIN_HEIGHT = 700;
const START_WINDOW_MAX_RESERVE = 240;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function extractResult(payload) {
  if (payload && typeof payload === 'object') {
    if (Object.prototype.hasOwnProperty.call(payload, 'result')) return payload.result;
    if (Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
  }
  return payload || {};
}

async function callBrowserApi(action, args = {}) {
  const { callAPI } = await import('../../../../modules/camo-runtime/src/utils/browser-service.mjs');
  return callAPI(action, args);
}

async function resolveStartWindow(profileOptions = {}) {
  try {
    const displayPayload = await callBrowserApi('system:display', {});
    return computeStartWindowSize(extractResult(displayPayload), profileOptions);
  } catch {
    return computeStartWindowSize(null, profileOptions);
  }
}

export function computeStartWindowSize(metrics, options = {}) {
  const display = metrics?.metrics || metrics || {};
  const reserveFromEnv = toNumber(process.env.CAMO_WINDOW_VERTICAL_RESERVE, 0);
  const reserve = clamp(
    toNumber(options.reservePx, reserveFromEnv),
    0,
    START_WINDOW_MAX_RESERVE,
  );
  const workWidth = toNumber(display.workWidth, 0);
  const workHeight = toNumber(display.workHeight, 0);
  const width = toNumber(display.width, 0);
  const height = toNumber(display.height, 0);
  const baseW = Math.floor(workWidth > 0 ? workWidth : width);
  const baseH = Math.floor(workHeight > 0 ? workHeight : height);
  if (baseW <= 0 || baseH <= 0) {
    return {
      width: 1920,
      height: 1000,
      reservePx: reserve,
      source: 'fallback',
    };
  }
  return {
    width: Math.max(START_WINDOW_MIN_WIDTH, baseW),
    height: Math.max(START_WINDOW_MIN_HEIGHT, baseH - reserve),
    reservePx: reserve,
    source: workWidth > 0 || workHeight > 0 ? 'workArea' : 'screen',
  };
}

export function computeTargetViewportFromWindowMetrics(measured) {
  const innerWidth = Math.max(320, toNumber(measured?.innerWidth, 0));
  const innerHeight = Math.max(240, toNumber(measured?.innerHeight, 0));
  const outerWidth = Math.max(320, toNumber(measured?.outerWidth, innerWidth));
  const outerHeight = Math.max(240, toNumber(measured?.outerHeight, innerHeight));
  const rawDeltaW = Math.max(0, outerWidth - innerWidth);
  const rawDeltaH = Math.max(0, outerHeight - innerHeight);
  const frameW = rawDeltaW > 400 ? 16 : Math.min(rawDeltaW, 120);
  const frameH = rawDeltaH > 400 ? 88 : Math.min(rawDeltaH, 180);
  return {
    width: Math.max(320, outerWidth - frameW),
    height: Math.max(240, outerHeight - frameH),
    frameW,
    frameH,
  };
}

async function probeWindowMetrics(profileId) {
  const measured = await callBrowserApi('evaluate', {
    profileId,
    script: '({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight })',
  });
  return extractResult(measured);
}

export async function applyNearFullWindow(profileId, options = {}) {
  const id = String(profileId || '').trim();
  if (!id) {
    return { ok: false, error: 'missing_profile_id' };
  }
  try {
    const startWindow = await resolveStartWindow(options);
    await callBrowserApi('window:resize', {
      profileId: id,
      width: startWindow.width,
      height: startWindow.height,
    });

    let targetViewport = {
      width: startWindow.width,
      height: startWindow.height,
      frameW: 0,
      frameH: 0,
    };
    const attempts = Math.max(1, Math.min(4, Math.floor(toNumber(options.attempts, 2))));
    for (let i = 0; i < attempts; i += 1) {
      const measured = await probeWindowMetrics(id).catch(() => ({}));
      targetViewport = computeTargetViewportFromWindowMetrics(measured);
      await callBrowserApi('page:setViewport', {
        profileId: id,
        width: targetViewport.width,
        height: targetViewport.height,
      });
      if (i + 1 < attempts) {
        await sleep(Math.max(80, toNumber(options.settleMs, 180)));
      }
    }
    return {
      ok: true,
      profileId: id,
      startWindow,
      targetViewport,
    };
  } catch (error) {
    return {
      ok: false,
      profileId: id,
      error: error?.message || String(error),
    };
  }
}

export async function ensureSessionInitialized(profileId, options = {}) {
  const id = String(profileId || '').trim();
  if (!id) {
    return { ok: false, error: 'missing_profile_id' };
  }
  const headless = options.headless === true;
  const url = String(options.url || '').trim();
  const rootDir = String(options.rootDir || process.cwd()).trim();
  const timeoutMs = Math.max(1000, Math.floor(toNumber(options.timeoutMs, 60000)));
  const restartSession = options.restartSession !== false;
  let stopRet = null;
  if (restartSession) {
    stopRet = runCamo(['stop', id], {
      rootDir,
      timeoutMs: Math.max(3000, Math.min(timeoutMs, 15000)),
    });
  }
  const startWindow = headless
    ? {
      width: 1920,
      height: 1000,
      reservePx: 0,
      source: 'headless-default',
    }
    : await resolveStartWindow({ reservePx: options.reservePx });
  const startArgs = [
    'start',
    id,
  ];
  if (headless) {
    startArgs.push('--headless');
  } else {
    startArgs.push(
      '--width',
      String(startWindow.width),
      '--height',
      String(startWindow.height),
    );
  }
  if (url) startArgs.push('--url', url);
  const startRet = runCamo(startArgs, {
    rootDir,
    timeoutMs,
  });
  if (!startRet?.ok) {
    return {
      ok: false,
      profileId: id,
      error: startRet?.stderr || startRet?.stdout || 'camo start failed',
      stop: stopRet,
      start: startRet,
      startWindow,
    };
  }
  let gotoRet = null;
  if (url) {
    gotoRet = runCamo(['goto', id, url], {
      rootDir,
      timeoutMs,
    });
  }
  const windowInit = headless
    ? {
      ok: true,
      profileId: id,
      skipped: true,
      reason: 'headless_mode',
    }
    : await applyNearFullWindow(id, {
      settleMs: options.settleMs,
      attempts: options.attempts,
      reservePx: options.reservePx,
    });
  return {
    ok: true,
    profileId: id,
    headless,
    stop: stopRet,
    startWindow,
    start: startRet,
    goto: gotoRet,
    windowInit,
  };
}
