import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hardcoded fallback - no config file dependency
const DEFAULT_CORE_DAEMON_URL = 'http://127.0.0.1:7700';
const DEFAULT_UNIFIED_API_URL = 'http://127.0.0.1:7701';
const DEFAULT_BROWSER_SERVICE_URL = 'http://127.0.0.1:7704';
const DEFAULT_SEARCH_GATE_URL = 'http://127.0.0.1:7790';

function toUrl(port, fallback) {
  const n = Number(port);
  if (Number.isInteger(n) && n > 0) return `http://127.0.0.1:${n}`;
  return fallback;
}

function findConfig() {
  // Try multiple possible paths
  const paths = [
    path.join(__dirname, '../../../config/ports.json'),
    path.join(process.cwd(), 'config/ports.json'),
    path.join(process.cwd(), '../config/ports.json'),
    path.join(process.cwd(), '../../config/ports.json'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function getCoreDaemonConfig() {
  const configPath = findConfig();
  if (configPath) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const coreDaemon = config.coreDaemon || {};
      const legacy = config.legacy || {};
      return {
        coreDaemon: {
          port: Number(coreDaemon.port) || 7700,
          url: String(coreDaemon.url || toUrl(coreDaemon.port, DEFAULT_CORE_DAEMON_URL) || DEFAULT_CORE_DAEMON_URL),
        },
        unifiedApi: {
          port: Number(legacy.unifiedApi) || 7701,
          url: toUrl(legacy.unifiedApi, DEFAULT_UNIFIED_API_URL),
        },
        browserService: {
          port: Number(legacy.browserService) || 7704,
          url: toUrl(legacy.browserService, DEFAULT_BROWSER_SERVICE_URL),
        },
        searchGate: {
          port: Number(legacy.searchGate) || 7790,
          url: toUrl(legacy.searchGate, DEFAULT_SEARCH_GATE_URL),
        },
      };
    } catch {}
  }
  return {
    coreDaemon: { port: 7700, url: DEFAULT_CORE_DAEMON_URL },
    unifiedApi: { port: 7701, url: DEFAULT_UNIFIED_API_URL },
    browserService: { port: 7704, url: DEFAULT_BROWSER_SERVICE_URL },
    searchGate: { port: 7790, url: DEFAULT_SEARCH_GATE_URL },
  };
}

export function getCoreDaemonUrl() {
  return getCoreDaemonConfig().coreDaemon.url || DEFAULT_CORE_DAEMON_URL;
}

export function getUnifiedApiUrl() {
  return getCoreDaemonConfig().unifiedApi.url || DEFAULT_UNIFIED_API_URL;
}

export function getBrowserServiceUrl() {
  return getCoreDaemonConfig().browserService.url || DEFAULT_BROWSER_SERVICE_URL;
}

export function getSearchGateUrl() {
  return getCoreDaemonConfig().searchGate.url || DEFAULT_SEARCH_GATE_URL;
}

// Use hardcoded default if config fails
export const CORE_DAEMON_URL = /* @__PURE__ */ getCoreDaemonUrl();
export const UNIFIED_API_URL = /* @__PURE__ */ getUnifiedApiUrl();
export const BROWSER_SERVICE_URL = /* @__PURE__ */ getBrowserServiceUrl();
export const SEARCH_GATE_URL = /* @__PURE__ */ getSearchGateUrl();
