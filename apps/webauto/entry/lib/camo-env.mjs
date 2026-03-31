import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function hasDrive(letter) {
  if (process.platform !== 'win32') return false;
  try {
    return fs.existsSync(`${String(letter || '').replace(/[^A-Za-z]/g, '').toUpperCase()}:\\`);
  } catch {
    return false;
  }
}

function normalizePathForPlatform(raw, platform = process.platform) {
  const input = String(raw || '').trim();
  const isWinPath = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(input);
  const pathApi = isWinPath ? path.win32 : path;
  return isWinPath ? pathApi.normalize(input) : path.resolve(input);
}

function normalizeLegacyWebautoRoot(raw, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const resolved = normalizePathForPlatform(raw, platform);
  const base = pathApi.basename(resolved).toLowerCase();
  return (base === '.webauto' || base === 'webauto')
    ? resolved
    : pathApi.join(resolved, '.webauto');
}

export function resolveWebautoDataRoot(options = {}) {
  const env = options.env || process.env;
  const platform = String(options.platform || process.platform);
  const homeDir = String(options.homeDir || (platform === 'win32'
    ? (env.USERPROFILE || os.homedir())
    : (env.HOME || os.homedir())));

  const explicitHome = String(env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return normalizePathForPlatform(explicitHome, platform);

  const legacyRoot = String(env.WEBAUTO_ROOT || env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) return normalizeLegacyWebautoRoot(legacyRoot, platform);

  const pathApi = platform === 'win32' ? path.win32 : path;
  if (platform === 'win32') {
    const dDriveExists = typeof options.hasDDrive === 'boolean' ? options.hasDDrive : hasDrive('D');
    return dDriveExists ? 'D:\\webauto' : pathApi.join(homeDir, '.webauto');
  }
  return pathApi.join(homeDir, '.webauto');
}

export function applyCamoEnv({ env = process.env, repoRoot = process.cwd() } = {}) {
  const dataRoot = resolveWebautoDataRoot({ env });
  const webautoProfilesRoot = String(env.WEBAUTO_PATHS_PROFILES || '').trim();
  const camoProfilesRoot = String(env.CAMO_PROFILE_ROOT || env.CAMO_PATHS_PROFILES || '').trim();
  const defaultProfilesRoot = path.join(dataRoot, 'profiles');
  const unifiedProfilesRoot = webautoProfilesRoot || camoProfilesRoot || defaultProfilesRoot;
  if (!String(env.CAMO_DATA_ROOT || '').trim()) {
    env.CAMO_DATA_ROOT = dataRoot;
  }
  if (!String(env.CAMO_HOME || '').trim()) {
    env.CAMO_HOME = dataRoot;
  }

  if (!webautoProfilesRoot) {
    env.WEBAUTO_PATHS_PROFILES = unifiedProfilesRoot;
  }
  if (!camoProfilesRoot) {
    env.CAMO_PROFILE_ROOT = unifiedProfilesRoot;
  }
  if (!String(env.CAMO_PATHS_PROFILES || '').trim()) {
    env.CAMO_PATHS_PROFILES = unifiedProfilesRoot;
  }
  if (!String(env.CAMO_PATHS_FINGERPRINTS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_PATHS_FINGERPRINTS || '').trim();
    if (fromWebauto) env.CAMO_PATHS_FINGERPRINTS = fromWebauto;
  }
  if (!String(env.CAMO_PATHS_COOKIES || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_PATHS_COOKIES || '').trim();
    if (fromWebauto) env.CAMO_PATHS_COOKIES = fromWebauto;
  }
  if (!String(env.CAMO_PATHS_LOCKS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_PATHS_LOCKS || '').trim();
    if (fromWebauto) env.CAMO_PATHS_LOCKS = fromWebauto;
  }
  if (!String(env.CAMO_PATHS_RECORDS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_PATHS_RECORDS || '').trim();
    if (fromWebauto) env.CAMO_PATHS_RECORDS = fromWebauto;
  }

  if (!String(env.CAMO_CONTAINER_ROOT || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_CONTAINER_ROOT || '').trim();
    if (fromWebauto) env.CAMO_CONTAINER_ROOT = fromWebauto;
  }
  if (!String(env.CAMO_CONTAINER_INDEX || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_CONTAINER_INDEX || '').trim();
    if (fromWebauto) {
      env.CAMO_CONTAINER_INDEX = fromWebauto;
    } else if (repoRoot) {
      const indexFile = ['container-library', 'index', 'json'].join('.');
      env.CAMO_CONTAINER_INDEX = path.join(repoRoot, 'apps', 'webauto', 'resources', indexFile);
    }
  }
  if (!String(env.CAMO_CONTAINER_LIBRARY_ROOT || '').trim() && repoRoot) {
    env.CAMO_CONTAINER_LIBRARY_ROOT = path.join(repoRoot, 'apps', 'webauto', 'resources', 'container-library');
  }

  if (!String(env.CAMO_REPO_ROOT || '').trim() && repoRoot) {
    env.CAMO_REPO_ROOT = repoRoot;
  }

  if (!String(env.CAMO_BROWSER_PROVIDER || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_BROWSER_PROVIDER || '').trim();
    if (fromWebauto) env.CAMO_BROWSER_PROVIDER = fromWebauto;
  }
  if (!String(env.CAMO_API_TIMEOUT_MS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_API_TIMEOUT_MS || '').trim();
    if (fromWebauto) env.CAMO_API_TIMEOUT_MS = fromWebauto;
  }
  if (!String(env.CAMO_API_TIMEOUT_MULTIPLIER || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_TIMEOUT_MULTIPLIER || '').trim();
    if (fromWebauto) env.CAMO_API_TIMEOUT_MULTIPLIER = fromWebauto;
  }
  if (!String(env.CAMO_BROWSER_URL || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_BROWSER_URL || '').trim();
    if (fromWebauto) env.CAMO_BROWSER_URL = fromWebauto;
  }
  if (!String(env.CAMO_BROWSER_HTTP_HOST || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_BROWSER_HTTP_HOST || '').trim();
    if (fromWebauto) env.CAMO_BROWSER_HTTP_HOST = fromWebauto;
  }
  if (!String(env.CAMO_BROWSER_HTTP_PORT || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_BROWSER_HTTP_PORT || '').trim();
    if (fromWebauto) env.CAMO_BROWSER_HTTP_PORT = fromWebauto;
  }
  if (!String(env.CAMO_BROWSER_HTTP_PROTO || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_BROWSER_HTTP_PROTO || '').trim();
    if (fromWebauto) env.CAMO_BROWSER_HTTP_PROTO = fromWebauto;
  }
  if (!String(env.CAMO_WS_URL || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_WS_URL || '').trim();
    if (fromWebauto) env.CAMO_WS_URL = fromWebauto;
  }
  if (!String(env.CAMO_WS_HOST || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_WS_HOST || '').trim();
    if (fromWebauto) env.CAMO_WS_HOST = fromWebauto;
  }
  if (!String(env.CAMO_WS_PORT || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_WS_PORT || '').trim();
    if (fromWebauto) env.CAMO_WS_PORT = fromWebauto;
  }

  if (!String(env.CAMO_SCREEN_WIDTH || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_SCREEN_WIDTH || '').trim();
    if (fromWebauto) env.CAMO_SCREEN_WIDTH = fromWebauto;
  }
  if (!String(env.CAMO_SCREEN_HEIGHT || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_SCREEN_HEIGHT || '').trim();
    if (fromWebauto) env.CAMO_SCREEN_HEIGHT = fromWebauto;
  }
  if (!String(env.CAMO_VIEWPORT_WIDTH || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_VIEWPORT_WIDTH || '').trim();
    if (fromWebauto) env.CAMO_VIEWPORT_WIDTH = fromWebauto;
  }
  if (!String(env.CAMO_VIEWPORT_HEIGHT || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_VIEWPORT_HEIGHT || '').trim();
    if (fromWebauto) env.CAMO_VIEWPORT_HEIGHT = fromWebauto;
  }
  if (!String(env.CAMO_HEADLESS_WIDTH || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_HEADLESS_WIDTH || '').trim();
    if (fromWebauto) env.CAMO_HEADLESS_WIDTH = fromWebauto;
  }
  if (!String(env.CAMO_HEADLESS_HEIGHT || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_HEADLESS_HEIGHT || '').trim();
    if (fromWebauto) env.CAMO_HEADLESS_HEIGHT = fromWebauto;
  }
  if (!String(env.CAMO_WINDOW_VERTICAL_RESERVE || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_WINDOW_VERTICAL_RESERVE || '').trim();
    if (fromWebauto) env.CAMO_WINDOW_VERTICAL_RESERVE = fromWebauto;
  }
  if (!String(env.CAMO_DEVICE_SCALE || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_DEVICE_SCALE || '').trim();
    if (fromWebauto) env.CAMO_DEVICE_SCALE = fromWebauto;
  }
  if (!String(env.CAMO_SCROLL_INPUT_MODE || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_SCROLL_INPUT_MODE || '').trim();
    if (fromWebauto) env.CAMO_SCROLL_INPUT_MODE = fromWebauto;
  }
  if (!String(env.CAMO_INPUT_ACTION_TIMEOUT_MS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_INPUT_ACTION_TIMEOUT_MS || '').trim();
    if (fromWebauto) env.CAMO_INPUT_ACTION_TIMEOUT_MS = fromWebauto;
  }
  if (!String(env.CAMO_INPUT_MODE || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_INPUT_MODE || '').trim();
    if (fromWebauto) env.CAMO_INPUT_MODE = fromWebauto;
  }
  if (!String(env.CAMO_INPUT_ACTION_MAX_ATTEMPTS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_INPUT_ACTION_MAX_ATTEMPTS || '').trim();
    if (fromWebauto) env.CAMO_INPUT_ACTION_MAX_ATTEMPTS = fromWebauto;
  }
  if (!String(env.CAMO_INPUT_RECOVERY_DELAY_MS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_INPUT_RECOVERY_DELAY_MS || '').trim();
    if (fromWebauto) env.CAMO_INPUT_RECOVERY_DELAY_MS = fromWebauto;
  }
  if (!String(env.CAMO_INPUT_RECOVERY_BRING_TO_FRONT_TIMEOUT_MS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_INPUT_RECOVERY_BRING_TO_FRONT_TIMEOUT_MS || '').trim();
    if (fromWebauto) env.CAMO_INPUT_RECOVERY_BRING_TO_FRONT_TIMEOUT_MS = fromWebauto;
  }
  if (!String(env.CAMO_INPUT_READY_SETTLE_MS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_INPUT_READY_SETTLE_MS || '').trim();
    if (fromWebauto) env.CAMO_INPUT_READY_SETTLE_MS = fromWebauto;
  }
  if (!String(env.WEBAUTO_BRING_TO_FRONT_MODE || '').trim()) {
    env.WEBAUTO_BRING_TO_FRONT_MODE = 'never';
  }
  if (!String(env.CAMO_BRING_TO_FRONT_MODE || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_BRING_TO_FRONT_MODE || '').trim();
    env.CAMO_BRING_TO_FRONT_MODE = fromWebauto || 'never';
  }
  if (!String(env.CAMO_NAV_WAIT_UNTIL || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_NAV_WAIT_UNTIL || '').trim();
    if (fromWebauto) env.CAMO_NAV_WAIT_UNTIL = fromWebauto;
  }
  if (!String(env.CAMO_DEBUG || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_DEBUG || '').trim();
    if (fromWebauto) env.CAMO_DEBUG = fromWebauto;
  }

  if (!String(env.CAMO_DOWNLOAD_ROOT || env.CAMO_DOWNLOAD_DIR || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_DOWNLOAD_ROOT || env.WEBAUTO_DOWNLOAD_DIR || '').trim();
    if (fromWebauto) env.CAMO_DOWNLOAD_ROOT = fromWebauto;
  }
  if (!String(env.CAMO_AUTOSCRIPT_TIMEOUT_MULTIPLIER || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_AUTOSCRIPT_TIMEOUT_MULTIPLIER || '').trim();
    if (fromWebauto) env.CAMO_AUTOSCRIPT_TIMEOUT_MULTIPLIER = fromWebauto;
  }
  if (!String(env.CAMO_AUTOSCRIPT_TIMEOUT_RETRIES || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_AUTOSCRIPT_TIMEOUT_RETRIES || '').trim();
    if (fromWebauto) env.CAMO_AUTOSCRIPT_TIMEOUT_RETRIES = fromWebauto;
  }
  if (!String(env.CAMO_AUTOSCRIPT_TIMEOUT_RETRY_BACKOFF_MS || '').trim()) {
    const fromWebauto = String(env.WEBAUTO_AUTOSCRIPT_TIMEOUT_RETRY_BACKOFF_MS || '').trim();
    if (fromWebauto) env.CAMO_AUTOSCRIPT_TIMEOUT_RETRY_BACKOFF_MS = fromWebauto;
  }

  return env;
}
