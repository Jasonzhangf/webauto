/**
 * Platform Configuration Module
 *
 * Config-driven platform defaults (replaces hardcoded values)
 */

import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME || '/tmp';
const WEBAUTO_STATE_DIR = path.join(HOME, '.webauto', 'state');
const PLATFORM_CONFIG_PATH = path.join(WEBAUTO_STATE_DIR, 'platform-config.json');

const DEFAULT_PLATFORM_CONFIG = Object.freeze({
  platformCommandPrefixes: {
    'weibo-special-follow': 'weibo',
    'weibo': 'weibo',
    '1688': '1688',
    'xhs': 'xiaohongshu',
    'xiaohongshu': 'xiaohongshu',
  },
  defaultPlatform: 'xiaohongshu',
  profileSelectionPolicy: 'latest_valid',
  supportedPlatforms: ['xiaohongshu', 'weibo', '1688'],
});

/**
 * Load platform configuration from file (or use defaults)
 */
export function loadPlatformConfig() {
  try {
    if (!fs.existsSync(PLATFORM_CONFIG_PATH)) {
      writePlatformConfig(DEFAULT_PLATFORM_CONFIG);
      return DEFAULT_PLATFORM_CONFIG;
    }
    const raw = JSON.parse(fs.readFileSync(PLATFORM_CONFIG_PATH, 'utf-8'));
    return normalizePlatformConfig(raw);
  } catch {
    return DEFAULT_PLATFORM_CONFIG;
  }
}

/**
 * Write platform configuration to file
 */
export function writePlatformConfig(config) {
  const normalized = normalizePlatformConfig(config);
  fs.mkdirSync(WEBAUTO_STATE_DIR, { recursive: true });
  fs.writeFileSync(PLATFORM_CONFIG_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

/**
 * Normalize platform configuration
 */
export function normalizePlatformConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const prefixes = source.platformCommandPrefixes && typeof source.platformCommandPrefixes === 'object'
    ? source.platformCommandPrefixes
    : DEFAULT_PLATFORM_CONFIG.platformCommandPrefixes;
  const defaultPlatform = String(source.defaultPlatform || DEFAULT_PLATFORM_CONFIG.defaultPlatform).trim();
  const policy = String(source.profileSelectionPolicy || DEFAULT_PLATFORM_CONFIG.profileSelectionPolicy).trim();
  const supported = Array.isArray(source.supportedPlatforms)
    ? source.supportedPlatforms.map(p => String(p).trim())
    : DEFAULT_PLATFORM_CONFIG.supportedPlatforms;

  return Object.freeze({
    platformCommandPrefixes: Object.freeze({ ...prefixes }),
    defaultPlatform,
    profileSelectionPolicy: policy,
    supportedPlatforms: supported,
  });
}

/**
 * Normalize platform by command type (config-driven)
 */
export function normalizePlatformByCommandType(commandType, config = null) {
  const cfg = config || loadPlatformConfig();
  const value = String(commandType || '').trim().toLowerCase();

  // Check each prefix in order (longest first for specificity)
  const prefixes = Object.keys(cfg.platformCommandPrefixes).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) {
      return cfg.platformCommandPrefixes[prefix];
    }
  }
  return cfg.defaultPlatform;
}

/**
 * Pick auto profile based on platform and selection policy
 * @param {string} platform - Platform name
 * @param {Function} listAccountProfiles - Function to list profiles
 * @param {Object} config - Platform config (optional)
 */
export function pickAutoProfile(platform, listAccountProfiles, config = null) {
  const cfg = config || loadPlatformConfig();
  const rows = listAccountProfiles({ platform }).profiles || [];

  const validRows = rows
    .filter((row) => row?.valid === true && String(row?.accountId || '').trim())
    .sort((a, b) => {
      const ta = Date.parse(String(a?.updatedAt || '')) || 0;
      const tb = Date.parse(String(b?.updatedAt || '')) || 0;
      if (tb !== ta) return tb - ta;
      return String(a?.profileId || '').localeCompare(String(b?.profileId || ''));
    });

  return String(validRows[0]?.profileId || '').trim();
}

/**
 * Ensure profile argument is set (config-driven)
 */
export function ensureProfileArgConfigDriven(commandType, commandArgv, listAccountProfiles, config = null) {
  const argv = commandArgv && typeof commandArgv === 'object' ? { ...commandArgv } : {};
  if (String(argv?.profile || '').trim()) return argv;
  if (String(argv?.profiles || '').trim()) return argv;
  if (String(argv?.profilepool || '').trim()) return argv;

  const platform = normalizePlatformByCommandType(commandType, config);
  const profile = pickAutoProfile(platform, listAccountProfiles, config);
  if (!profile) return argv;
  argv.profile = profile;
  return argv;
}

/**
 * Get supported platforms list
 */
export function getSupportedPlatforms(config = null) {
  const cfg = config || loadPlatformConfig();
  return cfg.supportedPlatforms;
}

/**
 * Add new platform to configuration
 */
export function addPlatformConfig(prefix, platform) {
  const cfg = loadPlatformConfig();
  const newPrefixes = { ...cfg.platformCommandPrefixes, [prefix]: platform };
  const newSupported = cfg.supportedPlatforms.includes(platform)
    ? cfg.supportedPlatforms
    : [...cfg.supportedPlatforms, platform];
  return writePlatformConfig({
    ...cfg,
    platformCommandPrefixes: newPrefixes,
    supportedPlatforms: newSupported,
  });
}

/**
 * Get config file path (for debugging)
 */
export function getPlatformConfigPath() {
  return PLATFORM_CONFIG_PATH;
}
