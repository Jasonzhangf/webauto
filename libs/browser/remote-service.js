import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

async function loadService() {
  const distEntry = path.join(projectRoot, 'dist/services/browser-service/index.js');
  if (!fs.existsSync(distEntry)) {
    console.log('[browser-service] 构建缺失，自动执行 npm run build:services');
    execSync('npm run build:services', { stdio: 'inherit', cwd: projectRoot });
  }
  return import(pathToFileURL(distEntry).href);
}

export async function startBrowserService(options = {}) {
  const mod = await loadService();
  return mod.startBrowserService(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hostIndex = process.argv.indexOf('--host');
  const portIndex = process.argv.indexOf('--port');
  const wsPortIndex = process.argv.indexOf('--ws-port');
  const wsHostIndex = process.argv.indexOf('--ws-host');
  const disableWs = process.argv.includes('--no-ws');
  const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : '127.0.0.1';
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 7704;
  const wsPort = wsPortIndex >= 0 ? Number(process.argv[wsPortIndex + 1]) : 8765;
  const wsHost = wsHostIndex >= 0 ? process.argv[wsHostIndex + 1] : '127.0.0.1';

  startBrowserService({ host, port, wsPort, wsHost, enableWs: !disableWs }).catch((err) => {
    console.error('Failed to start browser service:', err);
    process.exit(1);
  });
}
