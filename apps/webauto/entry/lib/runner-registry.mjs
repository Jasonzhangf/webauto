/**
 * Runner Registry Module
 *
 * Dynamic runner loading based on commandType
 * Replaces hardcoded import paths
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBAUTO_ROOT = '/Users/fanzhang/Documents/github/webauto';
const ENTRY_DIR = path.join(WEBAUTO_ROOT, 'apps/webauto/entry');
const HOME = process.env.HOME || '/tmp';
const WEBAUTO_STATE_DIR = path.join(HOME, '.webauto', 'state');
const REGISTRY_CONFIG_PATH = path.join(WEBAUTO_STATE_DIR, 'runner-registry.json');

/**
 * Default runner mappings (can be overridden via config)
 */
const DEFAULT_RUNNER_REGISTRY = Object.freeze({
  xhs: {
    unified: {
      runner: 'xhs-unified-runner.mjs',
      description: 'XHS unified collect + detail runner',
    },
    producer: {
      runner: 'xhs-producer-runner.mjs',
      description: 'XHS always-on producer',
    },
    consumer: {
      runner: 'xhs-consumer-runner.mjs',
      description: 'XHS always-on consumer',
    },
  },
  weibo: {
    unified: {
      runner: 'weibo-unified-runner.mjs',
      description: 'Weibo unified collect + detail runner',
    },
    producer: {
      runner: 'weibo-producer-runner.mjs',
      description: 'Weibo always-on producer',
    },
    consumer: {
      runner: 'weibo-consumer-runner.mjs',
      description: 'Weibo always-on consumer',
    },
    special_follow_monitor: {
      runner: 'weibo-special-follow-monitor-runner.mjs',
      description: 'Weibo special follow monitor',
    },
  },
  1688: {
    search: {
      runner: '1688-search-runner.mjs',
      description: '1688 search runner',
    },
  },
});

/**
 * Load runner registry from config (or use defaults)
 */
export function loadRunnerRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_CONFIG_PATH)) {
      writeRunnerRegistry(DEFAULT_RUNNER_REGISTRY);
      return DEFAULT_RUNNER_REGISTRY;
    }
    const raw = JSON.parse(fs.readFileSync(REGISTRY_CONFIG_PATH, 'utf-8'));
    return normalizeRunnerRegistry(raw);
  } catch {
    return DEFAULT_RUNNER_REGISTRY;
  }
}

/**
 * Write runner registry to config file
 */
export function writeRunnerRegistry(registry) {
  const normalized = normalizeRunnerRegistry(registry);
  fs.mkdirSync(WEBAUTO_STATE_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_CONFIG_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

/**
 * Normalize runner registry
 */
export function normalizeRunnerRegistry(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.freeze({ ...DEFAULT_RUNNER_REGISTRY, ...source });
}

/**
 * Parse commandType into platform and runnerType
 * @param {string} commandType - e.g., 'xhs-producer', 'weibo-consumer'
 */
export function parseCommandType(commandType) {
  const value = String(commandType || '').trim().toLowerCase();
  
  // Handle special cases first
  if (value === 'weibo-special-follow-monitor') {
    return { platform: 'weibo', runnerType: 'special_follow_monitor' };
  }

  // Split on '-' or '_'
  const parts = value.split(/[-_]/);
  const platform = parts[0] || 'xhs';
  const runnerType = parts.slice(1).join('_') || 'unified';

  return { platform, runnerType };
}

/**
 * Get runner path for commandType
 * @param {string} commandType - e.g., 'xhs-producer'
 * @param {Object} registry - Runner registry (optional)
 */
export function getRunnerPath(commandType, registry = null) {
  const reg = registry || loadRunnerRegistry();
  const { platform, runnerType } = parseCommandType(commandType);

  const platformRegistry = reg[platform];
  if (!platformRegistry) {
    // Fallback to xhs unified
    return path.join(ENTRY_DIR, DEFAULT_RUNNER_REGISTRY.xhs.unified.runner);
  }

  const runnerConfig = platformRegistry[runnerType];
  if (!runnerConfig) {
    // Fallback to unified for that platform
    const fallback = platformRegistry.unified;
    if (fallback) {
      return path.join(ENTRY_DIR, fallback.runner);
    }
    return path.join(ENTRY_DIR, DEFAULT_RUNNER_REGISTRY.xhs.unified.runner);
  }

  return path.join(ENTRY_DIR, runnerConfig.runner);
}

/**
 * Dynamically import runner for commandType
 * @param {string} commandType - e.g., 'xhs-producer'
 */
export async function importRunner(commandType) {
  const runnerPath = getRunnerPath(commandType);
  try {
    const runnerModule = await import(`file://${runnerPath}`);
    return {
      ok: true,
      runnerPath,
      runnerModule,
      commandType,
    };
  } catch (err) {
    return {
      ok: false,
      runnerPath,
      error: err.message,
      commandType,
    };
  }
}

/**
 * Get all registered runners for a platform
 */
export function getPlatformRunners(platform, registry = null) {
  const reg = registry || loadRunnerRegistry();
  return reg[platform] || {};
}

/**
 * Add custom runner to registry
 */
export function addRunnerToRegistry(platform, runnerType, runnerFile, description = '') {
  const reg = loadRunnerRegistry();
  const platformRegistry = reg[platform] || {};
  const newRegistry = {
    ...reg,
    [platform]: {
      ...platformRegistry,
      [runnerType]: {
        runner: runnerFile,
        description: description || `Custom ${platform} ${runnerType} runner`,
      },
    },
  };
  return writeRunnerRegistry(newRegistry);
}

/**
 * Remove runner from registry
 */
export function removeRunnerFromRegistry(platform, runnerType) {
  const reg = loadRunnerRegistry();
  const platformRegistry = reg[platform] || {};
  const newPlatformRegistry = { ...platformRegistry };
  delete newPlatformRegistry[runnerType];
  const newRegistry = {
    ...reg,
    [platform]: newPlatformRegistry,
  };
  return writeRunnerRegistry(newRegistry);
}

/**
 * Get registry config path (for debugging)
 */
export function getRegistryConfigPath() {
  return REGISTRY_CONFIG_PATH;
}

/**
 * List all registered runners
 */
export function listAllRunners(registry = null) {
  const reg = registry || loadRunnerRegistry();
  const result = [];
  for (const [platform, platformRegistry] of Object.entries(reg)) {
    for (const [runnerType, runnerConfig] of Object.entries(platformRegistry)) {
      result.push({
        commandType: `${platform}-${runnerType}`,
        platform,
        runnerType,
        runner: runnerConfig.runner,
        description: runnerConfig.description || '',
      });
    }
  }
  return result;
}
