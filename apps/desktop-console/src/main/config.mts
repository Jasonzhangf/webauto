import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../../../config/ports.json');

let cachedConfig: any = null;

export function loadPortConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    cachedConfig = { coreDaemon: { port: 7700, url: 'http://127.0.0.1:7700' } };
  }
  return cachedConfig;
}

export function getCoreDaemonUrl(): string {
  return loadPortConfig().coreDaemon?.url || 'http://127.0.0.1:7700';
}

export function getCoreDaemonPort(): number {
  return loadPortConfig().coreDaemon?.port || 7700;
}
