import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findConfig() {
  const paths = [
    path.join(__dirname, '../../../config/ports.json'),
    path.join(process.cwd(), 'config/ports.json'),
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
      return config.coreDaemon || { port: 7700, url: 'http://127.0.0.1:7700' };
    } catch {}
  }
  return { port: 7700, url: 'http://127.0.0.1:7700' };
}

export function getCoreDaemonUrl() {
  return getCoreDaemonConfig().url || 'http://127.0.0.1:7700';
}

export const CORE_DAEMON_URL = getCoreDaemonUrl();
export const UNIFIED_API_URL = CORE_DAEMON_URL;
export const BROWSER_SERVICE_URL = CORE_DAEMON_URL;
export const SEARCH_GATE_URL = CORE_DAEMON_URL;
